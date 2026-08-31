// Pesos de fallback pra qualquer inimigo cuja def não tenha "flocking"
// definido em data/enemies.js — praticamente o comportamento antigo (só
// persegue), com uma pitada de separação pra não empilhar sprites em cima
// um do outro.
const DEFAULT_WEIGHTS = { seek: 1, cohesion: 0, separation: 0.8, density: 0 };

/**
 * Comportamento de enxame (boids) dos inimigos: cada um combina 4 forças
 * — Perseguição (força principal, sempre em direção ao jogador), Coesão
 * (puxa em direção ao centro do grupo de vizinhos próximos, mantém a
 * sensação de horda), Separação (empurra pra longe de quem está quase
 * colado, evita sobreposição) e Densidade (empurra PRA O LADO — não pra
 * trás — quando a região ao redor está muito cheia, fazendo a horda achar
 * caminhos alternativos em vez de virar uma bola só). Os PESOS de cada
 * força variam por tipo de inimigo (`def.flocking`, ver data/enemies.js);
 * a geometria comum (raios, limiares) vem de data/flockingConfig.js.
 *
 * Não sabe nada de HP, dano, paralisia ou knockback — só devolve uma
 * direção de movimento. Quem decide se essa direção é de fato aplicada
 * (e quando ignorá-la, ex.: paralisado/em knockback) continua sendo
 * Enemy.chase() — ver EnemySpawner.updateAll(), que rebuild() o grid uma
 * vez por frame e chama computeMoveDir() pra cada inimigo antes de
 * chamar chase().
 *
 * Usa um grid espacial reconstruído a cada frame (rebuild) pra achar
 * vizinhos em O(vizinhos) em vez de comparar todo inimigo com todo
 * inimigo (O(n²)) — com até 150 vivos ao mesmo tempo (ver
 * data/spawnCurves.js), essa diferença importa.
 */
export default class SwarmSystem {
  /** @param {Object} config - conteúdo de data/flockingConfig.js */
  constructor(config) {
    this.config = config;
    this.grid = new Map(); // "cellX:cellY" -> Enemy[]
  }

  _cellKey(x, y) {
    return `${Math.floor(x / this.config.cellSize)}:${Math.floor(y / this.config.cellSize)}`;
  }

  /**
   * Reconstrói o grid espacial a partir da lista de inimigos vivos AGORA —
   * chamado uma vez por frame (não por inimigo) pelo EnemySpawner, antes
   * de qualquer computeMoveDir() daquele frame.
   * @param {Enemy[]} enemies - só os ativos (EnemySpawner já filtra)
   */
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

  /**
   * Vizinhos de `enemy` dentro de `radius`, varrendo só as células do
   * grid que podem conter alguém nesse raio (nunca o grid inteiro).
   * @returns {{enemy: Enemy, dx: number, dy: number, distSq: number}[]}
   *   dx/dy já são (vizinho - enemy), prontos pra reaproveitar em coesão/
   *   separação sem recalcular a subtração de novo.
   */
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

  /**
   * Combina as 4 forças pra UM inimigo neste frame, pesadas por
   * `enemy.def.flocking` (ou DEFAULT_WEIGHTS se a def não tiver isso).
   * @param {Enemy} enemy
   * @param {{x: number, y: number}} target - o jogador
   * @returns {{x: number, y: number}} direção normalizada (comprimento 1,
   *   ou {0,0} no caso extremo de estar exatamente em cima do alvo e sem
   *   nenhum vizinho por perto)
   */
  computeMoveDir(enemy, target) {
    const weights = enemy.def.flocking || DEFAULT_WEIGHTS;

    // Força 1 — Perseguição: sempre em linha reta pro jogador, é ela quem
    // dá a direção "de referência" pras outras três (a Densidade usa o
    // seek como eixo pra saber o que é "lateral", ver abaixo).
    const dxSeek = target.x - enemy.x;
    const dySeek = target.y - enemy.y;
    const seekDist = Math.hypot(dxSeek, dySeek);
    const seek = seekDist > 0 ? { x: dxSeek / seekDist, y: dySeek / seekDist } : { x: 0, y: 0 };

    const neighbors = this._neighborsWithin(enemy, this.config.neighborRadius);

    // Força 2 — Coesão: puxa em direção à posição MÉDIA dos vizinhos
    // próximos (não pro vizinho mais próximo) — é isso que dá o efeito de
    // "grupo se movendo junto" em vez de cada um perseguir o outro.
    let cohesion = { x: 0, y: 0 };
    // Força 4 — Densidade: só o componente LATERAL (perpendicular ao
    // seek) do vetor "fugir do centro do grupo" — assim ela faz o
    // inimigo desviar pro lado de um congestionamento sem nunca cancelar
    // o avanço em direção ao jogador (isso é papel da Separação/Coesão).
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
    // menor que neighborRadius) empurram, cada um com peso 1/distância —
    // quem está quase encostado empurra muito mais forte que quem está
    // só um pouco dentro do raio.
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
