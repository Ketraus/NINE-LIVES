// Pesos de fallback pra qualquer inimigo cuja def não tenha "flocking"
const DEFAULT_WEIGHTS = { seek: 1, cohesion: 0, separation: 0.8, density: 0 };

// Comportamento de enxame (boids) dos inimigos: cada um combina 4 forças
export default class SwarmSystem {
  constructor(config) {
    this.config = config;
    this.grid = new Map(); // "cellX:cellY" -> Enemy[]
    this.activeBuckets = [];
  }

  _cellKey(x, y) {
    return `${Math.floor(x / this.config.cellSize)}:${Math.floor(y / this.config.cellSize)}`;
  }

  // Reconstrói o grid espacial a partir da lista de inimigos vivos AGORA —
  rebuild(enemies) {
    for (const bucket of this.activeBuckets) bucket.length = 0;
    this.activeBuckets.length = 0;
    for (const enemy of enemies) {
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

  // Combina as 4 forças pra UM inimigo neste frame, pesadas por
  computeMoveDir(enemy, target) {
    const weights = enemy.def.flocking || DEFAULT_WEIGHTS;

    // Força 1 — Perseguição: sempre em linha reta pro jogador, é ela quem
    const dxSeek = target.x - enemy.x;
    const dySeek = target.y - enemy.y;
    const seekDist = Math.hypot(dxSeek, dySeek);
    const seek = seekDist > 0 ? { x: dxSeek / seekDist, y: dySeek / seekDist } : { x: 0, y: 0 };

    const cellRadius = Math.ceil(this.config.neighborRadius / this.config.cellSize);
    const cx = Math.floor(enemy.x / this.config.cellSize);
    const cy = Math.floor(enemy.y / this.config.cellSize);
    const neighborRadiusSq = this.config.neighborRadius * this.config.neighborRadius;
    const separationRadiusSq = this.config.separationRadius * this.config.separationRadius;
    let neighborCount = 0;
    let sumDx = 0;
    let sumDy = 0;
    let sepX = 0;
    let sepY = 0;

    for (let gx = cx - cellRadius; gx <= cx + cellRadius; gx++) {
      for (let gy = cy - cellRadius; gy <= cy + cellRadius; gy++) {
        const bucket = this.grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other === enemy) continue;
          const dx = other.x - enemy.x;
          const dy = other.y - enemy.y;
          const distSq = dx * dx + dy * dy;
          if (distSq === 0 || distSq > neighborRadiusSq) continue;

          neighborCount += 1;
          sumDx += dx;
          sumDy += dy;
          if (distSq <= separationRadiusSq) {
            const inverseDist = 1 / Math.sqrt(distSq);
            sepX -= dx * inverseDist * inverseDist;
            sepY -= dy * inverseDist * inverseDist;
          }
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

    const fx = seek.x * weights.seek + cohesionX * weights.cohesion + separationX * weights.separation + densityX * weights.density;
    const fy = seek.y * weights.seek + cohesionY * weights.cohesion + separationY * weights.separation + densityY * weights.density;
    const len = Math.hypot(fx, fy);
    return len > 0 ? { x: fx / len, y: fy / len, crowding } : { ...seek, crowding };
  }
}
