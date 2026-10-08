// Pesos de fallback pra qualquer inimigo cuja def não tenha "flocking"
const DEFAULT_WEIGHTS = { seek: 1, cohesion: 0, separation: 0.8, density: 0 };

// Limites de custo: mesmo se 150 inimigos nascerem comprimidos na mesma região,
// cada inimigo só considera um número pequeno de vizinhos por frame.
const MAX_STEERING_NEIGHBORS = 28;
const MAX_OVERLAP_PAIRS_PER_ENEMY = 12;
const MAX_POSITION_CORRECTION = 2.2;

// Comportamento de enxame (boids) dos inimigos.
// O objetivo é manter a sensação de horda SEM deixar os sprites virarem uma pilha
// e sem transformar 150 inimigos em O(n²) quando todos chegam pela mesma direção.
export default class SwarmSystem {
  constructor(config) {
    this.config = config;
    this.grid = new Map(); // "cellX:cellY" -> Enemy[]
    this.activeBuckets = [];
    this.maxWorldRadius = config.separationRadius * 0.5;
  }

  _cellKey(x, y) {
    return `${Math.floor(x / this.config.cellSize)}:${Math.floor(y / this.config.cellSize)}`;
  }

  _worldRadius(entity) {
    if (!entity) return this.config.separationRadius * 0.5;

    if (entity.def) {
      const hitboxScale = entity.def.hitboxScale ?? 0.32;
      const sourceSize = Math.min(entity.width || 0, entity.height || 0);
      const visualScale = Math.max(Math.abs(entity.scaleX || 1), Math.abs(entity.scaleY || 1));
      if (sourceSize > 0) return Math.max(8, sourceSize * hitboxScale * visualScale);
    }

    if (Number.isFinite(entity.body?.radius) && entity.body.radius > 0) return entity.body.radius;
    return Math.max(8, Math.min(entity.displayWidth || 32, entity.displayHeight || 32) * 0.28);
  }

  _pairMinDistance(a, b, spacingScale = 1) {
    // Um pouco acima do antigo 0.82: aquele valor evitava hitbox sobreposta,
    // mas visualmente sprites 64x64 ainda pareciam andar "um dentro do outro".
    const bodySpacing = (this._worldRadius(a) + this._worldRadius(b)) * 0.96;
    return Math.max(this.config.separationRadius * 1.12, bodySpacing) * spacingScale;
  }

  _mass(entity) {
    if (entity?.def?.boss) return 12;
    if (entity?.def?.elite) return 4;
    if (entity?.def?.sealer) return 3;
    return Math.max(1, this._worldRadius(entity) / 20);
  }

  _stablePairNormal(a, b) {
    const ia = a?._swarmGridIndex ?? a?.instanceNumber ?? 1;
    const ib = b?._swarmGridIndex ?? b?.instanceNumber ?? 2;
    const lo = Math.min(ia, ib);
    const hi = Math.max(ia, ib);
    const hash = (((lo + 1) * 73856093) ^ ((hi + 1) * 19349663)) >>> 0;
    const angle = (hash % 6283) / 1000;
    const sign = ia <= ib ? 1 : -1;
    return { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
  }

  // Reconstrói o spatial hash uma vez por frame.
  rebuild(enemies) {
    for (const bucket of this.activeBuckets) bucket.length = 0;
    this.activeBuckets.length = 0;
    this.maxWorldRadius = this.config.separationRadius * 0.5;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      enemy._swarmGridIndex = i;
      this.maxWorldRadius = Math.max(this.maxWorldRadius, this._worldRadius(enemy));
      const key = this._cellKey(enemy.x, enemy.y);
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = [];
        this.grid.set(key, bucket);
      }
      if (bucket.length === 0) this.activeBuckets.push(bucket);
      bucket.push(enemy);
    }
  }

  // Direção de perseguição para UM inimigo.
  // Além da separação normal existe um "lane steering": se outro inimigo está
  // bloqueando exatamente na direção do jogador, os dois escolhem lados opostos
  // e abrem a fila lateralmente. Isso resolve especialmente a horda vindo de cima.
  computeMoveDir(enemy, target) {
    const weights = enemy.def.flocking || DEFAULT_WEIGHTS;

    const dxSeek = target.x - enemy.x;
    const dySeek = target.y - enemy.y;
    const seekDist = Math.hypot(dxSeek, dySeek);
    const seek = seekDist > 0 ? { x: dxSeek / seekDist, y: dySeek / seekDist } : { x: 0, y: 0 };
    const perpX = -seek.y;
    const perpY = seek.x;

    const ownRadius = this._worldRadius(enemy);
    const searchRadius = Math.max(this.config.neighborRadius, (ownRadius + this.maxWorldRadius) * 0.9);
    const cellRadius = Math.ceil(searchRadius / this.config.cellSize);
    const cx = Math.floor(enemy.x / this.config.cellSize);
    const cy = Math.floor(enemy.y / this.config.cellSize);
    const neighborRadiusSq = this.config.neighborRadius * this.config.neighborRadius;

    let sampled = 0;
    let neighborCount = 0;
    let sumDx = 0;
    let sumDy = 0;
    let sepX = 0;
    let sepY = 0;
    let laneX = 0;
    let laneY = 0;

    outer:
    for (let gx = cx - cellRadius; gx <= cx + cellRadius; gx++) {
      for (let gy = cy - cellRadius; gy <= cy + cellRadius; gy++) {
        const bucket = this.grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other === enemy || !other.active || other.untargetable) continue;

          const dx = other.x - enemy.x;
          const dy = other.y - enemy.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > neighborRadiusSq) continue;

          sampled += 1;
          neighborCount += 1;
          sumDx += dx;
          sumDy += dy;

          const minDist = this._pairMinDistance(enemy, other);
          const minDistSq = minDist * minDist;

          if (distSq < minDistSq) {
            if (distSq < 0.0001) {
              const n = this._stablePairNormal(enemy, other);
              sepX -= n.x * 2.4;
              sepY -= n.y * 2.4;
            } else {
              const dist = Math.sqrt(distSq);
              const penetration = Phaser.Math.Clamp(1 - dist / minDist, 0, 1);
              const force = 0.75 + penetration * 2.1;
              sepX -= (dx / dist) * force;
              sepY -= (dy / dist) * force;
            }
          }

          // Se o vizinho está na frente/quase na mesma faixa rumo ao player,
          // sai de lado em vez de simplesmente frear atrás dele.
          if (seekDist > 0 && distSq < (minDist * 1.75) ** 2) {
            const forward = dx * seek.x + dy * seek.y;
            const lateral = dx * perpX + dy * perpY;
            if (forward > -minDist * 0.3 && forward < minDist * 1.55 && Math.abs(lateral) < minDist * 0.95) {
              let side;
              if (Math.abs(lateral) > 1.5) {
                side = lateral > 0 ? -1 : 1; // foge do lado onde o vizinho está
              } else {
                const n = this._stablePairNormal(enemy, other);
                side = n.x * perpX + n.y * perpY >= 0 ? 1 : -1;
              }
              const lateralPressure = Phaser.Math.Clamp(1 - Math.abs(lateral) / (minDist * 0.95), 0, 1);
              const forwardPressure = Phaser.Math.Clamp(1 - Math.max(0, forward) / (minDist * 1.55), 0.2, 1);
              const pressure = lateralPressure * forwardPressure;
              laneX += perpX * side * pressure;
              laneY += perpY * side * pressure;
            }
          }

          if (sampled >= MAX_STEERING_NEIGHBORS) break outer;
        }
      }
    }

    const crowding = neighborCount > 0
      ? Math.min(1, Math.max(0, neighborCount - this.config.densityThreshold) / this.config.densitySaturation)
      : 0;

    let cohesionX = 0;
    let cohesionY = 0;
    let densityX = 0;
    let densityY = 0;
    if (neighborCount > 0) {
      const avgDx = sumDx / neighborCount;
      const avgDy = sumDy / neighborCount;
      const avgDist = Math.hypot(avgDx, avgDy);
      if (avgDist > 0) {
        cohesionX = avgDx / avgDist;
        cohesionY = avgDy / avgDist;
        const awayX = -cohesionX;
        const awayY = -cohesionY;
        const dot = awayX * seek.x + awayY * seek.y;
        const latX = awayX - dot * seek.x;
        const latY = awayY - dot * seek.y;
        const latLen = Math.hypot(latX, latY);
        if (latLen > 0) {
          densityX = (latX / latLen) * crowding;
          densityY = (latY / latLen) * crowding;
        }
      }
    }

    const sepLen = Math.hypot(sepX, sepY);
    const separationX = sepLen > 0 ? sepX / sepLen : 0;
    const separationY = sepLen > 0 ? sepY / sepLen : 0;
    const laneLen = Math.hypot(laneX, laneY);
    const laneStrength = laneLen > 0 ? Math.min(1, laneLen) * (0.55 + crowding * 0.55) : 0;
    const laneNX = laneLen > 0 ? laneX / laneLen : 0;
    const laneNY = laneLen > 0 ? laneY / laneLen : 0;

    const separationWeight = Math.max(weights.separation, 0.88 + crowding * 0.28);
    let fx = seek.x * weights.seek
      + cohesionX * weights.cohesion
      + separationX * separationWeight
      + densityX * weights.density
      + laneNX * laneStrength;
    let fy = seek.y * weights.seek
      + cohesionY * weights.cohesion
      + separationY * separationWeight
      + densityY * weights.density
      + laneNY * laneStrength;

    // Regra anti-engasgo: separação pode mandar pro lado, mas não pode transformar
    // uma horda densa numa parede parada/andando pra trás.
    if (seekDist > 0 && !enemy.fleeing) {
      const forward = fx * seek.x + fy * seek.y;
      if (forward < 0.28) {
        const boost = 0.28 - forward;
        fx += seek.x * boost;
        fy += seek.y * boost;
      }
    }

    const len = Math.hypot(fx, fy);
    return len > 0 ? { x: fx / len, y: fy / len, crowding } : { ...seek, crowding };
  }

  // Resolve somente a penetração visual real. IMPORTANTE: não mexe mais na
  // velocity de cada par. A versão anterior empurrava a velocity TODO frame;
  // com 150 inimigos e IA em stride isso acumulava forças e podia deixar a
  // horda travada/engasgada. Agora acumulamos só uma correção posicional curta.
  resolveOverlaps(enemies) {
    for (const enemy of enemies) {
      enemy._swarmCorrectionX = 0;
      enemy._swarmCorrectionY = 0;
      enemy._swarmOverlapPairs = 0;
    }

    for (const enemy of enemies) {
      if (!enemy.active || !enemy.body || enemy.untargetable) continue;
      const ownIndex = enemy._swarmGridIndex ?? -1;
      const ownRadius = this._worldRadius(enemy);
      const searchRadius = Math.max(this.config.separationRadius * 1.2, (ownRadius + this.maxWorldRadius) * 0.95);
      const cellRadius = Math.ceil(searchRadius / this.config.cellSize);
      const cx = Math.floor(enemy.x / this.config.cellSize);
      const cy = Math.floor(enemy.y / this.config.cellSize);
      let processed = 0;

      outer:
      for (let gx = cx - cellRadius; gx <= cx + cellRadius; gx++) {
        for (let gy = cy - cellRadius; gy <= cy + cellRadius; gy++) {
          const bucket = this.grid.get(`${gx}:${gy}`);
          if (!bucket) continue;

          for (const other of bucket) {
            if (!other.active || !other.body || other.untargetable || other === enemy) continue;
            const otherIndex = other._swarmGridIndex ?? -1;
            if (otherIndex <= ownIndex) continue;

            const dx = other.x - enemy.x;
            const dy = other.y - enemy.y;
            const distSq = dx * dx + dy * dy;
            const minDist = this._pairMinDistance(enemy, other);
            if (distSq >= minDist * minDist) continue;

            let nx;
            let ny;
            let dist;
            if (distSq < 0.0001) {
              const n = this._stablePairNormal(enemy, other);
              nx = n.x;
              ny = n.y;
              dist = 0;
            } else {
              dist = Math.sqrt(distSq);
              nx = dx / dist;
              ny = dy / dist;
            }

            const overlap = minDist - dist;
            const massA = this._mass(enemy);
            const massB = this._mass(other);
            const invA = 1 / massA;
            const invB = 1 / massB;
            const invTotal = invA + invB;
            const shareA = invA / invTotal;
            const shareB = invB / invTotal;
            const correction = Math.min(MAX_POSITION_CORRECTION, 0.28 + overlap * 0.18);

            enemy._swarmCorrectionX -= nx * correction * shareA;
            enemy._swarmCorrectionY -= ny * correction * shareA;
            other._swarmCorrectionX += nx * correction * shareB;
            other._swarmCorrectionY += ny * correction * shareB;
            enemy._swarmOverlapPairs += 1;
            other._swarmOverlapPairs += 1;

            processed += 1;
            if (processed >= MAX_OVERLAP_PAIRS_PER_ENEMY) break outer;
          }
        }
      }
    }

    for (const enemy of enemies) {
      if (!enemy.active || !enemy.body || enemy.untargetable) continue;
      let dx = enemy._swarmCorrectionX || 0;
      let dy = enemy._swarmCorrectionY || 0;
      const len = Math.hypot(dx, dy);
      if (len <= 0) continue;

      // Clamp global por entidade: várias sobreposições nunca viram teleporte.
      const maxMove = MAX_POSITION_CORRECTION * 1.35;
      if (len > maxMove) {
        dx = (dx / len) * maxMove;
        dy = (dy / len) * maxMove;
      }
      enemy.x += dx;
      enemy.y += dy;
      enemy.body.updateFromGameObject?.();
    }
  }

  // Entidades aliadas não vivem no grupo de inimigos. spacingScale permite que
  // o cachorro normal chegue perto o bastante pra dar dano de contato sem ficar
  // com o centro exatamente dentro do inimigo; Cyberus usa separação maior.
  separateExternal(entity, strength = 1, spacingScale = 1) {
    if (!entity?.active || !entity.body) return;
    const ownRadius = this._worldRadius(entity);
    const searchRadius = Math.max(this.config.separationRadius, (ownRadius + this.maxWorldRadius) * 0.9);
    const cellRadius = Math.ceil(searchRadius / this.config.cellSize);
    const cx = Math.floor(entity.x / this.config.cellSize);
    const cy = Math.floor(entity.y / this.config.cellSize);
    let pushX = 0;
    let pushY = 0;
    let deepest = 0;
    let sampled = 0;

    outer:
    for (let gx = cx - cellRadius; gx <= cx + cellRadius; gx++) {
      for (let gy = cy - cellRadius; gy <= cy + cellRadius; gy++) {
        const bucket = this.grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (!other.active || other.untargetable) continue;
          const dx = entity.x - other.x;
          const dy = entity.y - other.y;
          const minDist = this._pairMinDistance(entity, other, spacingScale);
          const distSq = dx * dx + dy * dy;
          if (distSq >= minDist * minDist) continue;

          sampled += 1;
          if (distSq < 0.0001) {
            const n = this._stablePairNormal(entity, other);
            pushX += n.x * minDist;
            pushY += n.y * minDist;
            deepest = Math.max(deepest, minDist);
          } else {
            const dist = Math.sqrt(distSq);
            const penetration = minDist - dist;
            pushX += (dx / dist) * penetration;
            pushY += (dy / dist) * penetration;
            deepest = Math.max(deepest, penetration);
          }
          if (sampled >= 10) break outer;
        }
      }
    }

    const len = Math.hypot(pushX, pushY);
    if (len <= 0) return;
    const nx = pushX / len;
    const ny = pushY / len;

    const correction = Math.min(2.2, deepest * 0.2) * strength;
    entity.x += nx * correction;
    entity.y += ny * correction;
    entity.body.updateFromGameObject?.();

    // Só um toque lateral na velocity; não há mais "canhão" de repulsão.
    // Assim o Dog Purify ainda consegue encostar e atacar, e o Cyberus não senta
    // em cima da horda sem ganhar velocidade absurda.
    const pushSpeed = Math.min(42, 14 + deepest * 1.2) * strength;
    entity.body.velocity.x += nx * pushSpeed;
    entity.body.velocity.y += ny * pushSpeed;
  }
}
