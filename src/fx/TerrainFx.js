import SettingsManager from '../systems/SettingsManager.js';
import { reserveFx } from './FxBudget.js';

const KEY = 'terrain_grass_details_v1';
const CELL = 96;
const DEPTH = 0.2; // Above ground, below coast, props, pickups and attack warnings.
const PROFILES = {
  low: { tufts: 32, marks: 8, actors: 6, interval: 120 },
  full: { tufts: 80, marks: 24, actors: 12, interval: 80 }
};
function hash(x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

// Ruído de valor suave (determinístico) para agrupar a grama em manchas irregulares.
function smooth(t) { return t * t * (3 - 2 * t); }
function noise(x, y, scale, salt) {
  const gx = Math.floor(x / scale), gy = Math.floor(y / scale);
  const fx = smooth(x / scale - gx), fy = smooth(y / scale - gy);
  const a = hash(gx + salt, gy) / 4294967295, b = hash(gx + 1 + salt, gy) / 4294967295;
  const c = hash(gx + salt, gy + 1) / 4294967295, d = hash(gx + 1 + salt, gy + 1) / 4294967295;
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const PIVOT = 0.75; // base do tufo: balança ancorado perto do chão, não pelo centro.
const PIVOT_OFFSET = Math.round((PIVOT - 0.5) * 64);

// Small shared atlas derived from the existing grass pixels, once per game.
// Six tonal bands, three sparse grass tiles per band. Remove only the flat
// background; retain original pixel colors/geometry, without filtering.
function ensureDetails(scene) {
  if (scene.textures.exists(KEY)) return true;
  if (!scene.textures.exists('Tilesetgrass')) return false;
  let texture;
  try {
    const source = scene.textures.get('Tilesetgrass').getSourceImage();
    texture = scene.textures.createCanvas(KEY, 192, 384);
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    for (let band = 0; band < 6; band++) {
      [9, 10, 17].forEach((index, variant) => {
        const dx = variant * 64, dy = band * 64;
        ctx.drawImage(source, (index % 8) * 64, band * 512 + Math.floor(index / 8) * 64, 64, 64, dx, dy, 64, 64);
        const pixels = ctx.getImageData(dx, dy, 64, 64);
        const colors = new Map();
        const data = pixels.data;
        let background = 0, largest = 0;
        for (let i = 0; i < data.length; i += 4) {
          const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          const count = (colors.get(color) || 0) + 1;
          colors.set(color, count);
          if (count > largest) { largest = count; background = color; }
        }
        for (let i = 0; i < data.length; i += 4) {
          if (((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) === background) data[i + 3] = 0;
        }
        ctx.putImageData(pixels, dx, dy);
        texture.add(`${band}-${variant}`, 0, dx, dy, 64, 64);
      });
    }
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return true;
  } catch (error) {
    if (texture) scene.textures.remove(KEY);
    console.warn('[TerrainFx] Detalhes de grama indisponíveis:', error);
    return false;
  }
}

export default class TerrainFx {
  constructor(scene, manager) {
    this.scene = scene;
    this.manager = manager;
    this.tufts = [];
    this.marks = [];
    this.positions = new WeakMap();
    this.grassCache = new Map();
    this.cursor = 0;
    this.elapsed = 0;
    this.age = 0;
    this.cellKey = '';
    this.ready = null;
    scene.events.once('shutdown', () => this.destroy());
  }

  _grass(x, y) {
    const map = this.manager.map;
    const tx = Math.floor(x / map.tileWidth), ty = Math.floor(y / map.tileHeight);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return -1;
    const id = ty * map.width + tx;
    const cached = this.grassCache.get(id);
    if (cached !== undefined) return cached;
    if (this.grassCache.size > 6000) this.grassCache.clear();
    const band = this._grassTile(map, tx, ty);
    this.grassCache.set(id, band);
    return band;
  }

  _grassTile(map, tx, ty) {
    for (const name of ['Mar', 'Costa', 'FimDoMapa', 'Decoracao', 'ColisaoJogador', 'LimiteAbsoluto']) {
      if ((map.getLayer(name)?.data[ty]?.[tx]?.index ?? -1) >= 0) return -1;
    }
    const gid = this.manager.groundLayer.layer.data[ty]?.[tx]?.index;
    if (!Number.isInteger(gid) || gid < 1 || gid > 384) return -1;
    const local = (gid - 1) % 64;
    return local < 32 ? Math.floor((gid - 1) / 64) : -1;
  }

  _image() {
    const image = this.scene.add.image(0, 0, KEY, '0-0').setDepth(DEPTH).setVisible(false);
    for (const camera of this.scene.cameras.cameras) {
      if (camera !== this.scene.cameras.main) camera.ignore(image);
    }
    return image;
  }

  _populate(view) {
    const x0 = Math.floor((view.x - 64) / CELL), y0 = Math.floor((view.y - 64) / CELL);
    const x1 = Math.ceil((view.x + view.width + 64) / CELL), y1 = Math.ceil((view.y + view.height + 64) / CELL);
    const key = `${x0}:${y0}:${x1}:${y1}`;
    if (key === this.cellKey) return;
    this.cellKey = key;
    const candidates = [];
    // Hard cap protects against debug zooms or abnormal viewport dimensions.
    let checked = 0;
    for (let cy = y0; cy <= y1 && checked < 1024; cy++) for (let cx = x0; cx <= x1 && checked < 1024; cx++) {
      checked++;
      const seed = hash(cx, cy);
      const wx = cx * CELL + CELL / 2, wy = cy * CELL + CELL / 2;
      // Campo de densidade: manchas grandes + variação fina => clareiras, tufos soltos e touceiras.
      const density = noise(wx, wy, 300, 0) * 0.65 + noise(wx, wy, 120, 977) * 0.35;
      const count = density < 0.4 ? 0 : density < 0.64 ? 1 : density < 0.8 ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const s2 = i === 0 ? seed : hash(seed + i * 7919, cx - cy);
        const x = cx * CELL + 24 + (i === 0 ? seed % 48 : (hash(cx, cy) >>> 3) % 48 + ((s2 % 33) - 16));
        const y = cy * CELL + 24 + (i === 0 ? (seed >>> 8) % 48 : (hash(cy, cx) >>> 3) % 48 + (((s2 >>> 8) % 25) - 12));
        const band = this._grass(x, y);
        if (band < 0 || [[-32, -32], [32, -32], [-32, 32], [32, 32]].some(([dx, dy]) => this._grass(x + dx, y + dy) !== band)) continue;
        // Variação tonal sutil: tom vizinho da mesma paleta (mais claro nas touceiras densas).
        const pick = (s2 >>> 16) % 10;
        let tone = band;
        if (pick < (density > 0.6 ? 3 : 1)) tone = Math.max(0, band - 1);
        else if (pick >= (density > 0.6 ? 9 : 6)) tone = Math.min(5, band + 1);
        candidates.push({ key: `${cx}:${cy}:${i}`, x, y, seed: s2, band, tone,
          alpha: Math.min(0.8, 0.44 + density * 0.34 + ((s2 >>> 20) % 13) / 100),
          phase: (s2 % 628) / 100,
          distance: (x - view.centerX) ** 2 + (y - view.centerY) ** 2 });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const selected = candidates.slice(0, this.profile.tufts);
    const wanted = new Set(selected.map(c => c.key));
    for (const slot of this.tufts) if (!wanted.has(slot.key)) { slot.key = null; slot.image.setVisible(false); }
    for (const c of selected) {
      if (this.tufts.some(slot => slot.key === c.key)) continue;
      let slot = this.tufts.find(slot => slot.key === null);
      if (!slot) { slot = { image: this._image() }; this.tufts.push(slot); }
      Object.assign(slot, c, { bend: 0, direction: 1, grow: 0, push: 0, pdx: 0, pdy: 0 });
      slot.image.setTexture(KEY, `${c.tone}-${c.seed % 3}`).setOrigin(0.5, PIVOT).setPosition(c.x, c.y + PIVOT_OFFSET)
        .setFlipX((c.seed & 1) === 1).setScale(1).setRotation(0).setAlpha(0).setVisible(true);
    }
  }

  // Public, visual-only terrain interaction. No physics, damage or network writes.
  // kind may be 'step' or 'impact'; future effects can use this same entry point.
  interact({ x, y, radius = 36, strength = 0.5, kind = 'impact', push = 0 } = {}) {
    if (!this.profile || !SettingsManager.getTerrainFx() || this.scene.isPaused || this.scene.lobbyGateActive) return;
    if (![x, y, radius, strength].every(Number.isFinite) || radius <= 0) return;
    const view = this.scene.cameras.main.worldView;
    radius = Math.min(radius, 350);
    if (x + radius < view.x || x - radius > view.right || y + radius < view.y || y - radius > view.bottom) return;
    strength = Math.max(0, Math.min(1, strength));
    for (const slot of this.tufts) {
      if (!slot.key) continue;
      const distance = Math.hypot(slot.x - x, slot.y - y);
      if (distance < radius) {
        slot.bend = Math.max(slot.bend, (1 - distance / radius) * strength);
        slot.direction = slot.x >= x ? 1 : -1;
        // a grama é empurrada para longe dos pés (só quando o chamador pede, ex.: Minotauro)
        const amount = (1 - distance / radius) * push;
        if (amount > slot.push && distance > 0.001) {
          slot.push = amount; slot.pdx = (slot.x - x) / distance; slot.pdy = (slot.y - y) / distance * 0.6;
        }
      }
    }
    const band = this._grass(x, y);
    if (band < 0 || (kind === 'step' && this.profile === PROFILES.low)) return;
    let mark = this.marks.find(slot => !slot.live);
    if (!mark && this.marks.length >= this.profile.marks) return;
    if (reserveFx(this.scene, 1) < 1) return;
    if (!mark) { mark = { image: this._image() }; this.marks.push(mark); }
    Object.assign(mark, { live: true, life: kind === 'step' ? 700 : 1700, age: 0 });
    mark.image.setTexture(KEY, `${band}-0`).setPosition(x, y).setTint(0x182e33)
      .setScale(kind === 'step' ? 0.5 : Math.min(2, radius / 48), 0.35)
      .setAlpha(0.3).setVisible(true);
  }

  _sample(actor) {
    if (!actor?.active || actor.isDead) return;
    const x = actor.body?.center?.x ?? actor.x;
    const y = actor.body?.bottom ?? actor.y;
    const previous = this.positions.get(actor);
    this.positions.set(actor, { x, y });
    if (!previous) return;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    if (distance < 2 || distance > 128) return;
    // Minotauro: área um pouco maior que a dos gatos e a grama se afasta dos pés (push)
    const boss = !!actor.def?.boss;
    this.interact({ x, y, radius: boss ? 80 : 50, strength: boss ? 1 : 0.65, push: boss ? 12 : 0, kind: 'step' });
  }

  update(delta) {
    if (this.destroyed) return;
    const profile = !SettingsManager.getTerrainFx() ? null :
      PROFILES[this.scene.sys.game.device.input.touch || SettingsManager.getReducedTerrainFx() ? 'low' : 'full'];
    if (profile !== this.profile) {
      this._clear(); this.profile = profile;
    }
    if (!profile || this.scene.isPaused || this.scene.lobbyGateActive || this.scene.time.timeScale === 0) return;
    if (this.ready === null) this.ready = ensureDetails(this.scene);
    if (!this.ready) return;
    this.elapsed += Math.min(delta, 200) * this.scene.time.timeScale;
    if (this.elapsed < profile.interval) return;
    const dt = this.elapsed; this.elapsed = 0; this.age += dt;
    this._populate(this.scene.cameras.main.worldView);
    const enemies = this.scene.enemySpawner?.group.getChildren() || [];
    this._sample(this.scene.player);
    this._sample(this._findBoss(enemies));
    this.scene.multiplayer?.remotePlayers?.forEach(remote => this._sample(remote.sprite));
    for (let i = 0; i < Math.min(profile.actors, enemies.length); i++) this._sample(enemies[(this.cursor + i) % enemies.length]);
    this.cursor = (this.cursor + profile.actors) % Math.max(1, enemies.length);
    const motion = SettingsManager.getReducedMotion() ? 0 : 1;
    for (const slot of this.tufts) {
      if (!slot.key) continue;
      slot.bend = Math.max(0, slot.bend - dt / 750);
      // Onda de vento atravessando o mapa + rajadas lentas + tremor leve por tufo.
      const gust = 0.65 + 0.35 * Math.sin(this.age / 5200 + slot.x * 0.0011 - slot.y * 0.0007);
      const wave = Math.sin(this.age / 1100 - (slot.x * 0.006 + slot.y * 0.0035));
      const wind = (wave * 0.07 * gust + Math.sin(this.age / 430 + slot.phase) * 0.012) * motion;
      slot.grow = Math.min(1, slot.grow + dt / 400);
      slot.push = Math.max(0, slot.push - dt * 0.012);
      slot.image.setPosition(Math.round(slot.x + slot.pdx * slot.push), Math.round(slot.y + PIVOT_OFFSET + slot.pdy * slot.push));
      slot.image.setRotation(wind + slot.bend * slot.direction * 0.16 * motion)
        .setScale(1 + slot.bend * 0.15, 1 - slot.bend * 0.4).setAlpha(slot.alpha * slot.grow);
    }
    const view = this.scene.cameras.main.worldView;
    for (const mark of this.marks) {
      if (!mark.live) continue;
      mark.age += dt;
      if (mark.age >= mark.life || mark.image.x < view.x - 64 || mark.image.x > view.right + 64 ||
          mark.image.y < view.y - 64 || mark.image.y > view.bottom + 64) {
        mark.live = false; mark.image.setVisible(false);
      } else mark.image.setAlpha(0.3 * (1 - mark.age / mark.life));
    }
  }

  // Minotauro sempre amostrado (o rodízio de atores pode demorar a chegar nele).
  _findBoss(enemies) {
    if (this.boss?.active) return this.boss;
    if (this.age - (this.bossCheckedAt ?? -1e9) < 500) return null;
    this.bossCheckedAt = this.age;
    this.boss = enemies.find(e => e.active && e.def?.boss) || null;
    return this.boss;
  }

  _clear() {
    for (const slot of [...this.tufts, ...this.marks]) slot.image.destroy();
    this.tufts.length = 0; this.marks.length = 0; this.cellKey = ''; this.grassCache.clear();
    this.positions = new WeakMap(); this.elapsed = 0;
  }

  destroy() { this._clear(); this.destroyed = true; this.profile = null; }
}
