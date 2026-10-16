import SettingsManager from '../systems/SettingsManager.js';
import config from '../../data/worldEnd.js';
import { UI_SCALE } from '../config/layout.js';

const DEPTH_WORLD_FOG = 9; // acima de chão/inimigos, abaixo do jogador (10)
const DEPTH_PUFFS = 12; // lufadas passam por cima do jogador
const DEPTH_SCREEN = 140; // abaixo do HUD (150)
const DENSITY_PX_PER_TILE = 2;
const WORLD_END_GROUND_TILE = 1;
const NEAR_ZONE_TILES = 22; // longe disso nada é desenhado/atualizado

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hexOf = ([r, g, b]) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ruído de valor periódico (tileável), várias oitavas, 0..1
function noiseField(size, seed, baseCells = 4, octaves = 5) {
  const rng = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = baseCells * 2 ** o;
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells;
      const y0 = Math.floor(gy);
      const fy0 = gy - y0;
      const fy = fy0 * fy0 * (3 - 2 * fy0);
      const ya = (y0 % cells) * cells;
      const yb = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells;
        const x0 = Math.floor(gx);
        const fx0 = gx - x0;
        const fx = fx0 * fx0 * (3 - 2 * fx0);
        const xa = x0 % cells;
        const xb = (x0 + 1) % cells;
        const top = lattice[ya + xa] + (lattice[ya + xb] - lattice[ya + xa]) * fx;
        const bot = lattice[yb + xa] + (lattice[yb + xb] - lattice[yb + xa]) * fx;
        out[y * size + x] += (top + (bot - top) * fy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function ensureCanvasTexture(scene, key, w, h, painter) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  painter(ctx, w, h);
  tex.refresh();
  tex.setFilter?.(Phaser.Textures.FilterMode.LINEAR);
}

function paintNoise(ctx, size, seed, color, { cloud = false, lo = 0.38, hi = 0.85, maxAlpha = 0.9 } = {}) {
  const n = noiseField(size, seed, cloud ? 3 : 4, cloud ? 5 : 5);
  const img = ctx.createImageData(size, size);
  const [r, g, b] = color;
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let a = smoothstep(lo, hi, n[i]);
      if (cloud) {
        const dx = (x - c) / c;
        const dy = (y - c) / c;
        const fall = clamp01(1 - Math.sqrt(dx * dx + dy * dy));
        a *= fall * fall * (3 - 2 * fall);
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(a * maxAlpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Som sintetizado (sem arquivos): zumbido grave que cresce com a profundidade,
// batimento e um "estalo" a cada dano. Entra no mesmo mixer do Phaser, então
// obedece volume mestre/mudo; o slider de SFX é aplicado aqui.
class WorldEndAudio {
  constructor(scene) {
    const mgr = scene.sound;
    this.ctx = mgr?.context || null;
    this.ok = !!this.ctx && !!this.ctx.createOscillator;
    if (!this.ok) return;
    const ctx = this.ctx;
    this.dest = mgr.destination || ctx.destination;

    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 140;
    this.filter.Q.value = 5;
    this.filter.connect(this.drone);
    this.drone.connect(this.dest);

    this.nodes = [];
    [['sine', 41, 0.6], ['sine', 43.7, 0.6], ['triangle', 82.4, 0.22], ['sawtooth', 55, 0.16]].forEach(([type, freq, vol]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = vol;
      osc.connect(g);
      g.connect(this.filter);
      osc.start();
      this.nodes.push(osc, g);
    });
    // o timbre "respira" devagar
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 55;
    lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    lfo.start();
    this.nodes.push(lfo, lfoGain);

    const len = Math.floor(ctx.sampleRate * 0.25);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  // chamado todo frame de jogo: se os updates param (pausa), o "vigia" abaixo
  // apaga o zumbido sozinho em ~0,4s
  setLevel(level) {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    const target = config.droneVolume * Math.pow(level, 1.3) * SettingsManager.getSfx();
    const g = this.drone.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(target, now, 0.15);
    g.setTargetAtTime(0, now + 0.35, 0.12);
    this.filter.frequency.setTargetAtTime(120 + level * 150, now, 0.3);
  }

  silence() {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    this.drone.gain.cancelScheduledValues(now);
    this.drone.gain.setTargetAtTime(0, now, 0.05);
  }

  thump(strength) {
    if (!this.ok) return;
    const vol = config.thumpVolume * strength * SettingsManager.getSfx();
    if (vol < 0.01) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.24);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g);
    g.connect(this.dest);
    osc.start(t);
    osc.stop(t + 0.34);
  }

  zap(strength) {
    if (!this.ok) return;
    const sfx = SettingsManager.getSfx();
    if (sfx < 0.01) return;
    const t = this.ctx.currentTime;
    const saw = this.ctx.createOscillator();
    const sawGain = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(210, t);
    saw.frequency.exponentialRampToValueAtTime(52, t + 0.28);
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    sawGain.gain.setValueAtTime(0.0001, t);
    sawGain.gain.exponentialRampToValueAtTime(0.32 * strength * sfx, t + 0.01);
    sawGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    saw.connect(lp);
    lp.connect(sawGain);
    sawGain.connect(this.dest);
    saw.start(t);
    saw.stop(t + 0.32);

    const src = this.ctx.createBufferSource();
    const bp = this.ctx.createBiquadFilter();
    const nGain = this.ctx.createGain();
    src.buffer = this.noise;
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    nGain.gain.value = 0.28 * strength * sfx;
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.dest);
    src.start(t);
  }

  destroy() {
    if (!this.ok) return;
    this.nodes.forEach((n) => {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch (e) {
        /* já parado */
      }
    });
    this.drone.disconnect();
    this.ok = false;
  }
}

// Visual do fim do mundo: névoa no mundo (densidade + lufadas à deriva),
// névoa/escuridão/vinheta na tela, shader de oscilação e aviso.
export default class WorldEndFx {
  constructor(scene, system, mapManager) {
    this.scene = scene;
    this.system = system;
    this.field = system.field;
    this.t = 0;
    this._phase = 0;
    this._dubDone = true;
    this._lub = 0;
    this._dub = 0;
    this._hurt = 0;
    this._near = false;
    this.isTouch = !!scene.sys.game.device.input.touch;
    this._edgeRgb = rgb(config.fogColorEdge);
    this._deepRgb = rgb(config.fogColorDeep);

    this.audio = new WorldEndAudio(scene);
    this._buildTextures();
    this._buildWorldLayer(mapManager);
    this._buildPuffs();
    this._buildScreenLayer();
    this._buildPipeline();

    scene.events.once('shutdown', () => this.audio.destroy());
  }

  // ---------------------------------------------------------------- build

  _buildTextures() {
    const s = this.scene;
    const edge = rgb(config.fogColorEdge);
    const deep = rgb(config.fogColorDeep);
    ensureCanvasTexture(s, 'worldend_mist_a', 256, 256, (ctx) => paintNoise(ctx, 256, 1337, edge, { lo: 0.40, hi: 0.82, maxAlpha: 0.9 }));
    ensureCanvasTexture(s, 'worldend_mist_b', 256, 256, (ctx) => paintNoise(ctx, 256, 9001, deep, { lo: 0.36, hi: 0.78, maxAlpha: 1 }));
    [11, 23, 47].forEach((seed, i) =>
      ensureCanvasTexture(s, `worldend_puff_${i}`, 256, 256, (ctx) => paintNoise(ctx, 256, seed, [255, 255, 255], { cloud: true, lo: 0.28, hi: 0.72, maxAlpha: 1 }))
    );

    const w = s.scale.width;
    const h = s.scale.height;
    const dark = rgb(config.darkColor);
    const grad = (key, innerStop, maxAlpha) =>
      ensureCanvasTexture(s, key, w, h, (ctx) => {
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy);
        const g = ctx.createRadialGradient(cx, cy, maxR * innerStop, cx, cy, maxR);
        g.addColorStop(0, `rgba(${dark[0]},${dark[1]},${dark[2]},0)`);
        g.addColorStop(1, `rgba(${dark[0]},${dark[1]},${dark[2]},${maxAlpha})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
    grad('worldend_vignette_wide', 0.30, 0.8);
    grad('worldend_vignette_tight', 0.10, 1);
  }

  // mapa de densidade em 2px/tile, esticado pelo mundo todo (filtro linear)
  _buildWorldLayer(mapManager) {
    const s = this.scene;
    const field = this.field;
    this._buildWorldEndGround();
    const key = 'worldend_density';
    const wTiles = field.width;
    const hTiles = field.height;
    const px = DENSITY_PX_PER_TILE;
    if (!s.textures.exists(key)) {
      const W = wTiles * px;
      const H = hTiles * px;
      const tex = s.textures.createCanvas(key, W, H);
      const ctx = tex.getContext();
      const img = ctx.createImageData(W, H);
      const edge = rgb(config.fogColorEdge);
      const deep = rgb(config.fogColorDeep);
      for (let y = 0; y < H; y++) {
        const wy = ((y + 0.5) / px) * field.tileSize;
        for (let x = 0; x < W; x++) {
          const wx = ((x + 0.5) / px) * field.tileSize;
          const d = field.sample(wx, wy);
          const warn = smoothstep(-config.warnTiles, 0, d);
          const dp = smoothstep(0, config.maxDepthTiles, d);
          const a = 0.3 * warn * warn + 0.52 * dp;
          const col = mix(edge, deep, Math.pow(dp, 0.7));
          const i = (y * W + x) * 4;
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = Math.round(clamp01(a) * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
      tex.setFilter?.(Phaser.Textures.FilterMode.LINEAR);
    }
    const bounds = mapManager.getWorldBounds();
    this.density = s.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(bounds.width, bounds.height).setDepth(DEPTH_WORLD_FOG).setVisible(false);
  }

  _buildWorldEndGround() {
    const s = this.scene;
    if (!s.textures.exists('Tilesetgrass6')) return;

    const map = s.make.tilemap({
      tileWidth: this.field.tileSize,
      tileHeight: this.field.tileSize,
      width: this.field.width,
      height: this.field.height
    });
    const tileset = map.addTilesetImage(
      'worldend_tileset6',
      'Tilesetgrass6',
      this.field.tileSize,
      this.field.tileSize,
      0,
      0,
      1
    );
    if (!tileset) return;

    this.worldEndGround = map.createBlankLayer('WorldEndGround', tileset, 0, 0);
    if (!this.worldEndGround) return;
    this.worldEndGround.setDepth(0).setAlpha(1);

    for (let y = 0; y < this.field.height; y++) {
      for (let x = 0; x < this.field.width; x++) {
        const depth = this.field.sample(
          (x + 0.5) * this.field.tileSize,
          (y + 0.5) * this.field.tileSize
        );
        if (depth > 0) this.worldEndGround.putTileAt(WORLD_END_GROUND_TILE, x, y);
      }
    }
  }

  _buildPuffs() {
    const count = this.isTouch ? config.puffsTouch : config.puffsDesktop;
    this.puffs = [];
    const view = this._view();
    for (let i = 0; i < count; i++) {
      const sprite = this.scene.add.image(0, 0, `worldend_puff_${i % 3}`).setDepth(DEPTH_PUFFS).setAlpha(0).setVisible(false);
      const puff = {
        sprite,
        size: Phaser.Math.Between(420, 980),
        base: Phaser.Math.FloatBetween(0.16, 0.34),
        vx: Phaser.Math.FloatBetween(-12, 12),
        vy: Phaser.Math.FloatBetween(-8, 8),
        phase: Math.random() * Math.PI * 2,
        spin: Phaser.Math.FloatBetween(-0.04, 0.04),
        x: 0,
        y: 0,
        alpha: 0
      };
      sprite.setRotation(Math.random() * Math.PI * 2);
      puff.x = view.x + Math.random() * view.w;
      puff.y = view.y + Math.random() * view.h;
      this.puffs.push(puff);
    }
  }

  _buildScreenLayer() {
    const s = this.scene;
    const w = s.scale.width;
    const h = s.scale.height;
    const c = (this.container = s.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH_SCREEN).setVisible(false));
    const add = (obj) => {
      obj.setScrollFactor(0);
      c.add(obj);
      return obj;
    };

    this.mistA = add(s.add.tileSprite(w / 2, h / 2, w + 8, h + 8, 'worldend_mist_a').setAlpha(0));
    this.mistA.setTileScale(1.7, 1.7);
    this.mistB = add(s.add.tileSprite(w / 2, h / 2, w + 8, h + 8, 'worldend_mist_b').setAlpha(0));
    this.mistB.setTileScale(2.8, 2.8);
    this.darkRect = add(s.add.rectangle(w / 2, h / 2, w + 8, h + 8, config.darkColor, 1).setAlpha(0));
    this.vigWide = add(s.add.image(w / 2, h / 2, 'worldend_vignette_wide').setAlpha(0));
    this.vigTight = add(s.add.image(w / 2, h / 2, 'worldend_vignette_tight').setAlpha(0));
    this.pulseRect = add(s.add.rectangle(w / 2, h / 2, w + 8, h + 8, config.pulseColor, 1).setAlpha(0));

    this.warning = add(
      s.add
        .text(w / 2, h * 0.82, 'NÃO HÁ MUNDO ALÉM DESTE PONTO.\nRETORNE.', {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '11px',
          color: '#ff3d6e',
          align: 'center',
          lineSpacing: 8,
          stroke: '#000000',
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setAlpha(0)
    );
    this._warningAlpha = 0;

    // mesma compensação de zoom do HUD: o container cobre exatamente a tela
    const cam = s.cameras.main;
    const zoom = cam.zoom || 1;
    if (zoom !== 1) {
      const inv = UI_SCALE / zoom;
      c.setScale(inv);
      c.setPosition(cam.centerX * (1 - inv), cam.centerY * (1 - inv));
    }
  }

  _buildPipeline() {
    this.pipeline = null;
    if (this.scene.renderer.type !== Phaser.WEBGL) return;
    const cam = this.scene.cameras.main;
    cam.setPostPipeline('WorldEnd');
    const found = cam.getPostPipeline('WorldEnd');
    this.pipeline = Array.isArray(found) ? found[0] : found;
    if (this.pipeline) this.pipeline.active = false;
  }

  // ---------------------------------------------------------------- helpers

  _view() {
    const cam = this.scene.cameras.main;
    const w = cam.width / cam.zoom;
    const h = cam.height / cam.zoom;
    return { x: cam.scrollX + cam.width / 2 - w / 2, y: cam.scrollY + cam.height / 2 - h / 2, w, h };
  }

  silence() {
    this.audio.silence();
  }

  // ---------------------------------------------------------------- update

  update(dt, hurtDamage) {
    const sys = this.system;
    const sec = dt / 1000;
    this.t += sec;
    const level = sys.level;
    const vis = sys.vis;
    const reducedMotion = SettingsManager.getReducedMotion();
    const reducedFlashes = SettingsManager.getReducedFlashes();

    // --- batimento: acelera conforme o mundo aperta
    if (level > 0.04) {
      const period = lerp(config.heartbeat.slowSeconds, config.heartbeat.fastSeconds, level);
      this._phase += sec / period;
      if (this._phase >= 1) {
        this._phase -= 1;
        this._dubDone = false;
        this._lub = 1;
        this.audio.thump(0.45 + 0.55 * level);
      }
      if (!this._dubDone && this._phase >= 0.3) {
        this._dubDone = true;
        this._dub = 0.7;
        this.audio.thump((0.45 + 0.55 * level) * 0.7);
      }
    }
    const decay = Math.exp(-sec * 9);
    this._lub *= decay;
    this._dub *= decay;
    this._hurt *= Math.exp(-sec * 4.5);
    const beat = Math.max(this._lub, this._dub);

    if (hurtDamage) this._onHurt(hurtDamage);

    this.audio.setLevel(level * vis);
    this.worldEndGround?.setAlpha(vis);

    // --- mundo
    const near = sys.depth > -(config.warnTiles + NEAR_ZONE_TILES) && vis > 0.002;
    if (near !== this._near) {
      this._near = near;
      this.density.setVisible(near);
      if (!near) this.puffs.forEach((p) => p.sprite.setVisible(false));
    }
    if (near) {
      this.density.setAlpha(vis * (0.94 + 0.06 * Math.sin(this.t * 0.8) + 0.04 * beat * level));
      this._updatePuffs(sec, level, vis);
    }

    // --- tela
    const screenOn = level > 0.003 || sys.warn > 0.01;
    this.container.setVisible(screenOn);
    if (screenOn) this._updateScreen(level, beat, vis, reducedMotion, reducedFlashes);

    // --- shader
    if (this.pipeline) {
      const on = level * vis > 0.002;
      this.pipeline.active = on;
      if (on) {
        this.pipeline.time += sec * (1 + level);
        this.pipeline.intensity = level * vis;
        this.pipeline.pulse = Math.max(beat * 0.5, this._hurt);
        this.pipeline.motion = reducedMotion ? 0.2 : 1;
      }
    }
  }

  _onHurt(damage) {
    const s = this.scene;
    const p = this.system.player;
    this._hurt = 1;
    this._lub = Math.max(this._lub, 1);
    this.audio.zap(0.55 + 0.45 * this.system.deep);
    s.cameras.main.shake(170, 0.0032 + 0.0045 * this.system.deep);

    const label = s.add
      .text(p.x, p.y - 26, `-${damage}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#d86bff',
        stroke: '#1a0630',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(100);
    s.tweens.add({
      targets: label,
      y: label.y - 34,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy()
    });
  }

  _updatePuffs(sec, level, vis) {
    const view = this._view();
    const m = 520;
    const windX = -16 - 20 * level;
    const windY = 5;
    const field = this.field;
    for (let i = 0; i < this.puffs.length; i++) {
      const pf = this.puffs[i];
      pf.x += (windX + pf.vx + Math.sin(this.t * 0.31 + pf.phase) * 7) * sec;
      pf.y += (windY + pf.vy + Math.cos(this.t * 0.23 + pf.phase * 1.7) * 6) * sec;
      if (pf.x < view.x - m || pf.x > view.x + view.w + m || pf.y < view.y - m || pf.y > view.y + view.h + m) {
        this._respawnPuff(pf, view, m);
      }
      const d = field.sample(pf.x, pf.y);
      const f = smoothstep(-config.warnTiles * 0.7, 1.5, d);
      const dp = clamp01(d / config.maxDepthTiles);
      const target = pf.base * f * (0.55 + 0.45 * dp) * (0.85 + 0.15 * Math.sin(this.t * 0.7 + pf.phase)) * vis;
      pf.alpha += (target - pf.alpha) * Math.min(1, sec * 3);
      const sp = pf.sprite;
      if (pf.alpha < 0.004) {
        sp.setVisible(false);
        continue;
      }
      const tint = hexOf(mix(this._edgeRgb, this._deepRgb, Math.pow(dp, 0.6)));
      sp.setVisible(true)
        .setPosition(pf.x, pf.y)
        .setAlpha(pf.alpha)
        .setTint(tint)
        .setDisplaySize(pf.size * (1 + 0.25 * dp), pf.size * (1 + 0.25 * dp))
        .setRotation(sp.rotation + pf.spin * sec);
    }
  }

  _respawnPuff(pf, view, m) {
    const field = this.field;
    for (let tries = 0; tries < 8; tries++) {
      pf.x = view.x - m * 0.6 + Math.random() * (view.w + m * 1.2);
      pf.y = view.y - m * 0.6 + Math.random() * (view.h + m * 1.2);
      if (smoothstep(-config.warnTiles * 0.7, 1.5, field.sample(pf.x, pf.y)) > 0.12) break;
    }
    pf.alpha = 0;
  }

  _updateScreen(level, beat, vis, reducedMotion, reducedFlashes) {
    const cam = this.scene.cameras.main;
    const sys = this.system;
    const warn = sys.warn;
    const t = this.t;
    const lv = level * vis;
    const flash = reducedFlashes ? 0.3 : 1;

    // névoa que passa na frente da câmera (parallax em relação ao mapa)
    this.mistA.setAlpha(vis * (0.05 * warn + 0.2 * lv) * (1 - 0.5 * lv));
    this.mistA.tilePositionX = cam.scrollX * 0.35 + t * 18;
    this.mistA.tilePositionY = cam.scrollY * 0.35 + Math.sin(t * 0.2) * 30;
    this.mistB.setAlpha(0.62 * Math.pow(lv, 1.2));
    this.mistB.tilePositionX = -cam.scrollX * 0.6 - t * 26;
    this.mistB.tilePositionY = cam.scrollY * 0.5 + Math.cos(t * 0.17) * 40;

    // escuridão: geral + vinheta larga + túnel que fecha no fundo
    this.darkRect.setAlpha(clamp01(0.5 * Math.pow(lv, 1.1) * (1 + 0.12 * beat)));
    this.vigWide.setAlpha(clamp01(lv * 1.05 * (1 + 0.18 * beat)));
    this.vigTight.setAlpha(clamp01(Math.pow(lv, 2.2) * (1 + 0.22 * beat)));

    // clarão arroxeado de dor + pulsinho do batimento
    this.pulseRect.setAlpha(clamp01((this._hurt * 0.32 + beat * 0.07 * lv) * flash));

    // aviso: pisca/treme enquanto está dentro da zona proibida
    const inside = sys.depth > 0 && vis > 0.5;
    this._warningAlpha += ((inside ? 1 : 0) - this._warningAlpha) * Math.min(1, 0.016 * 12);
    const blink = reducedFlashes ? 1 : 0.55 + 0.45 * Math.sin(t * 9) * (Math.sin(t * 2.3) > 0 ? 1 : 0.6);
    this.warning.setAlpha(this._warningAlpha * blink);
    if (this._warningAlpha > 0.02 && !reducedMotion) {
      const jitter = Math.random() < 0.06 ? 3 : 0.4;
      this.warning.setPosition(this.scene.scale.width / 2 + (Math.random() - 0.5) * jitter * 2, this.scene.scale.height * 0.82 + (Math.random() - 0.5) * jitter);
    }
    this.warning.setColor(Math.random() < 0.03 * this._warningAlpha ? '#ffffff' : '#ff3d6e');
  }
}
