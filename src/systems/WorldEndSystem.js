import EventBus from './EventBus.js';
import WorldEndFx from '../fx/WorldEndFx.js';
import config from '../../data/worldEnd.js';

const BIG = 1e10;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// O campo trabalha com a presença do tile, não com um intervalo de GIDs.
// Em mapas com mais de um tileset, o primeiro tile de um tileset pode ter
// índice local 0; em Phaser, uma célula vazia continua sendo -1.
function hasTile(tile) {
  if (!tile) return false;
  if (Number.isFinite(tile.index)) return tile.index >= 0;
  if (Number.isFinite(tile.gid)) return tile.gid > 0;
  return false;
}

function tileAt(data, x, y) {
  return data?.[y]?.[x] || null;
}

// transformada de distância euclidiana (Felzenszwalb): distância² de cada
// célula até a fonte mais próxima. O(n), roda uma vez no início da run.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -BIG;
  z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

function squaredDistanceTo(isSource, w, h) {
  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = isSource[i] ? 0 : BIG;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  return grid;
}

// Campo de profundidade assinado, em tiles: negativo = ainda na área segura
// (distância até a zona proibida), positivo = dentro do fim do mundo
// (distância até a área jogável). Zero é a barreira.
export class WorldEndField {
  constructor(mapManager) {
    const map = mapManager.map;
    this.tileSize = map.tileWidth;
    this.width = map.width;
    this.height = map.height;
    this.valid = false;

    const playableLayer = mapManager.supportLayers?.[config.playableLayer];
    if (!playableLayer) {
      console.warn(`[WorldEnd] Layer "${config.playableLayer}" não encontrada — fim do mundo desativado.`);
      return;
    }
    const extraPlayable = (config.extraPlayableLayers || [])
      .map((name) => map.getLayer(name)?.data)
      .filter(Boolean);
    const seaLayer = Object.values(mapManager.collisionLayers || {}).find((l) => l?.layer?.name === config.seaLayer);

    const w = this.width;
    const h = this.height;
    const playable = new Uint8Array(w * h);
    const danger = new Uint8Array(w * h);
    let dangerCount = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        playable[i] = hasTile(tileAt(playableLayer.layer.data, x, y)) ||
          extraPlayable.some((data) => hasTile(tileAt(data, x, y))) ? 1 : 0;
        const sea = seaLayer ? hasTile(tileAt(seaLayer.layer.data, x, y)) : false;
        if (!playable[i] && !sea) {
          danger[i] = 1;
          dangerCount++;
        }
      }
    }
    if (!dangerCount) return;

    const toPlayable = squaredDistanceTo(playable, w, h);
    const toDanger = squaredDistanceTo(danger, w, h);
    this.data = new Float32Array(w * h);
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = danger[i] ? Math.sqrt(toPlayable[i]) - 0.5 : -(Math.sqrt(toDanger[i]) - 0.5);
    }
    this.valid = true;
  }

  // profundidade em tiles na posição do mundo (interpolada, contínua)
  sample(x, y) {
    if (!this.valid) return -999;
    const w = this.width;
    const h = this.height;
    const gx = Math.min(w - 1.001, Math.max(0, x / this.tileSize - 0.5));
    const gy = Math.min(h - 1.001, Math.max(0, y / this.tileSize - 0.5));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const i = y0 * w + x0;
    const a = this.data[i] + (this.data[i + 1] - this.data[i]) * fx;
    const b = this.data[i + w] + (this.data[i + w + 1] - this.data[i + w]) * fx;
    return a + (b - a) * fy;
  }
}

// Fim do mundo: névoa, escuridão, oscilação e dano progressivo conforme o
// jogador se afasta da área jogável. Lógica e dano ficam aqui; o visual
// (e o som) fica em fx/WorldEndFx.js.
export default class WorldEndSystem {
  constructor(scene, mapManager, player) {
    this.scene = scene;
    this.player = player;
    this.field = new WorldEndField(mapManager);
    this.enabled = this.field.valid;
    if (!this.enabled) return;

    this.depth = -99; // tiles; > 0 = dentro do fim do mundo
    this.warn = 0; // 0..1, chegando perto da borda
    this.deep = 0; // 0..1, profundidade real (dano usa isso)
    this.level = 0; // 0..1, intensidade visual (suavizada)
    this.vis = 1; // 0..1, visibilidade geral (some na vitória)
    this._tickMs = -config.damage.graceMs;
    this.fx = new WorldEndFx(scene, this, mapManager);

    EventBus.on('player-died', () => this.fx.silence());
  }

  // mode: undefined (normal) | 'freeze' (morte: congela, HUD cuida do resto)
  // | 'fade' (vitória: some devagar)
  update(delta, mode) {
    if (!this.enabled) return;
    const dt = Math.min(delta, 100);

    if (mode === 'freeze') {
      this.fx.silence();
      return;
    }

    const p = this.player;
    const d = this.field.sample(p.x, p.y);
    this.depth = d;
    this.warn = smoothstep(-config.warnTiles, 0, d);
    this.deep = clamp01(d / config.maxDepthTiles);

    let target = 0.12 * this.warn * (d > 0 ? 1 : 0.6) + 0.88 * Math.pow(this.deep, 0.8);
    if (mode === 'fade') target = 0;
    const rate = target > this.level ? 7 : 2.5;
    this.level += (target - this.level) * (1 - Math.exp((-rate * dt) / 1000));
    if (this.level < 0.001 && target === 0) this.level = 0;

    this.vis += ((mode === 'fade' ? 0 : 1) - this.vis) * (1 - Math.exp((-1.6 * dt) / 1000));

    if (mode !== 'fade') this._updateDamage(dt);
    this.fx.update(dt, this._hurtThisFrame);
    this._hurtThisFrame = null;
  }

  isSpawnForbiddenAt(x, y) {
    return this.enabled && this.field.sample(x, y) > 0;
  }

  _updateDamage(dt) {
    const p = this.player;
    const cfg = config.damage;
    const exposed = this.depth > 0 && !p.isDead && !p.godMode;
    if (!exposed) {
      this._tickMs = -cfg.graceMs;
      return;
    }
    this._tickMs += dt;
    if (this._tickMs < cfg.intervalMs) return;
    this._tickMs -= cfg.intervalMs;

    // logo após escolher carta o jogador fica invulnerável por um instante
    if (p._levelUpInvulnerableUntil && this.scene.time.now < p._levelUpInvulnerableUntil) return;

    const hp = p.healthSystem;
    const pct = cfg.minPercentMaxHp + (cfg.maxPercentMaxHp - cfg.minPercentMaxHp) * Math.pow(this.deep, 1.1);
    const damage = Math.max(cfg.minFlat, Math.round(hp.maxHp * pct));
    // direto na vida: o vazio não é um ataque, então escudo e desvio não valem
    p.takeDamage(damage);
    this._hurtThisFrame = damage;
  }
}
