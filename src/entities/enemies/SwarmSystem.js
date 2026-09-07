// Pesos de fallback pra qualquer inimigo cuja def não tenha "flocking"
const DEFAULT_WEIGHTS = { seek: 1, cohesion: 0, separation: 0.8, density: 0 };

// Comportamento de enxame (boids) dos inimigos: cada um combina 4 forças
export default class SwarmSystem {
  constructor(config) {
    this.config = config;
    this.grid = new Map(); // "cellX:cellY" -> Enemy[]
  }

  _cellKey(x, y) {
    return `${Math.floor(x / this.config.cellSize)}:${Math.floor(y / this.config.cellSize)}`;
  }

  // Reconstrói o grid espacial a partir da lista de inimigos vivos AGORA —
  rebuild(enemies) {
    this.grid.clear();
    enemies.forEach((enemy) => {
      const key = this._cellKey(enemy.x, enemy.y);
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = [];
        this.grid.set(key, bucket);
      }
      bucket.push(enemy);
    });
  }

  // Vizinhos de `enemy` dentro de `radius`, varrendo só as células do
  _neighborsWithin(enemy, radius) {
    const result = [];
    const cellRadius = Math.ceil(radius / this.config.cellSize);
    const cx = Math.floor(enemy.x / this.config.cellSize);
    const cy = Math.floor(enemy.y / this.config.cellSize);
    const radiusSq = radius * radius;

    for (let gx = cx - cellRadius; gx <= cx + cellRadius; gx++) {
      for (let gy = cy - cellRadius; gy <= cy + cellRadius; gy++) {
        const bucket = this.grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other === enemy) continue;
          const dx = other.x - enemy.x;
          const dy = other.y - enemy.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 0 && distSq <= radiusSq) result.push({ enemy: other, dx, dy, distSq });
        }
      }
    }
    return result;
  }

  // Combina as 4 forças pra UM inimigo neste frame, pesadas por
  computeMoveDir(enemy, target) {
    const weights = enemy.def.flocking || DEFAULT_WEIGHTS;

    // Força 1 — Perseguição: sempre em linha reta pro jogador, é ela quem
    const dxSeek = target.x - enemy.x;
    const dySeek = target.y - enemy.y;
    const seekDist = Math.hypot(dxSeek, dySeek);
    const seek = seekDist > 0 ? { x: dxSeek / seekDist, y: dySeek / seekDist } : { x: 0, y: 0 };

    const neighbors = this._neighborsWithin(enemy, this.config.neighborRadius);

    // Força 2 — Coesão: puxa em direção à posição MÉDIA dos vizinhos
    let cohesion = { x: 0, y: 0 };
    // Força 4 — Densidade: só o componente LATERAL (perpendicular ao
    let density = { x: 0, y: 0 };

    if (neighbors.length > 0) {
      let sumDx = 0;
      let sumDy = 0;
      neighbors.forEach((n) => {
        sumDx += n.dx;
        sumDy += n.dy;
      });
      const avgDx = sumDx / neighbors.length;
      const avgDy = sumDy / neighbors.length;
      const avgDist = Math.hypot(avgDx, avgDy);

      if (avgDist > 0) {
        cohesion = { x: avgDx / avgDist, y: avgDy / avgDist };

        const awayX = -cohesion.x;
        const awayY = -cohesion.y;
        const dot = awayX * seek.x + awayY * seek.y;
        const latX = awayX - dot * seek.x;
        const latY = awayY - dot * seek.y;
        const latLen = Math.hypot(latX, latY);
        if (latLen > 0) {
          const crowding = Math.max(0, neighbors.length - this.config.densityThreshold);
          const strength = Math.min(1, crowding / this.config.densitySaturation);
          density = { x: (latX / latLen) * strength, y: (latY / latLen) * strength };
        }
      }
    }

    // Força 3 — Separação: só vizinhos bem colados (separationRadius, bem
    let sepX = 0;
    let sepY = 0;
    neighbors.forEach((n) => {
      if (n.distSq > this.config.separationRadius * this.config.separationRadius) return;
      const dist = Math.sqrt(n.distSq);
      sepX -= (n.dx / dist) / dist;
      sepY -= (n.dy / dist) / dist;
    });
    const sepLen = Math.hypot(sepX, sepY);
    const separation = sepLen > 0 ? { x: sepX / sepLen, y: sepY / sepLen } : { x: 0, y: 0 };

    const fx = seek.x * weights.seek + cohesion.x * weights.cohesion + separation.x * weights.separation + density.x * weights.density;
    const fy = seek.y * weights.seek + cohesion.y * weights.cohesion + separation.y * weights.separation + density.y * weights.density;
    const len = Math.hypot(fx, fy);
    return len > 0 ? { x: fx / len, y: fy / len } : seek;
  }
}
