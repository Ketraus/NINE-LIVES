// Relíquia do Minotauro: o machado cravado no chão e as rachaduras que ficam depois da morte.
// Só visual (sem hitbox, sem dano). Criada pelo MinotaurDeathFx quando o machado pousa e vive até a
// cena fechar, com um update próprio:
//   machado  -> pixels de energia (ciano/claros do próprio sprite) trocam de cor e brilho um a um,
//               como o machado vivo; mais um halo pulsando no "tum-tum" da fase 2
//   rachadura -> de vez em quando uma descarga de energia corre pelas rachaduras, mais forte perto
//               do machado (camada "near" = mesmas rachaduras, intensidade cai com a distância)
import SettingsManager from '../systems/SettingsManager.js';
import { reserveFx } from './FxBudget.js';

export const RELIC_AXE_SCALE = 3.5;   // era 2.8
const AXE_KEY = 'minotaur_axe_thrown_rage';
const SHIMMER_KEY = 'minotaur_relic_axe_energy';
const TAU = Math.PI * 2;
const AQUA = [50, 233, 214];
const WHITE = [223, 255, 247];
const clamp = v => Math.max(0, Math.min(1, v));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const hash = n => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;

export default class MinotaurRelicFx {
  constructor(scene, { axe, axeGlow, mound, landX, landY, age0 = 0, lite = false }) {
    this.scene = scene;
    this.axe = axe; this.axeGlow = axeGlow; this.mound = mound;
    this.landX = landX; this.landY = landY;
    this.lite = lite;
    this.calm = SettingsManager.getReducedFlashes() ? 0.4 : 1;
    this.motionK = SettingsManager.getReducedMotion() ? 0.18 : 1;
    this.age = Math.max(0, age0);   // ms desde o pouso
    this.clock = 0;
    this.done = false;
    this.extras = [];
    this.nextPaint = 0;
    this.shimmer = null;
    this.cracks = null;
    this.sparks = [];
    this.buildShimmer();
    this.buildSparks();
    this.tick = (_time, delta) => this.update(delta);
    this.shutdown = () => this.destroy();
    scene.events.on('update', this.tick);
    scene.events.once('shutdown', this.shutdown);
  }

  image(key, depth) {
    const image = this.scene.add.image(0, 0, key).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    for (const cam of this.scene.cameras.cameras) if (cam !== this.scene.cameras.main) cam.ignore(image);
    this.extras.push(image);
    return image;
  }

  // ---------- machado ----------
  buildShimmer() {
    const scene = this.scene;
    this.pixels = [];
    if (!scene.textures.exists(AXE_KEY)) return;
    try {
      const src = scene.textures.get(AXE_KEY).getSourceImage();
      const W = src.width, H = src.height;
      const scratch = document.createElement('canvas');
      scratch.width = W; scratch.height = H;
      const sctx = scratch.getContext('2d', { willReadFrequently: true });
      sctx.drawImage(src, 0, 0);
      const px = sctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < W * H; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
        const m = Math.max(r, g, b);
        if (a < 200 || !((g - r >= 35 && m >= 70) || m >= 190)) continue;   // só a energia do machado
        this.pixels.push({ i: i * 4, r, g, b, light: m >= 190, ph: rand(0, TAU), sp: rand(2.2, 6.5) / 1000 });
      }
      if (scene.textures.exists(SHIMMER_KEY)) scene.textures.remove(SHIMMER_KEY);
      this.tex = scene.textures.createCanvas(SHIMMER_KEY, W, H);
      this.ctx = this.tex.getContext();
      this.data = this.ctx.createImageData(W, H);
      this.tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.shimmer = this.image(SHIMMER_KEY, 8.2).setOrigin(23 / 64, 40 / 64);
    } catch (error) {
      this.shimmer = null;
      console.warn('[MinotaurRelicFx] Brilho do machado indisponível', error);
    }
  }

  paint(t) {
    if (!this.shimmer) return;
    const d = this.data.data, slot = Math.floor(t / 170);
    for (let k = 0; k < this.pixels.length; k++) {
      const p = this.pixels[k];
      const w = 0.5 + 0.5 * Math.sin(t * p.sp + p.ph);
      const spark = hash(k * 7.31 + slot) > 0.955;          // pixel que "estala" pro branco
      const toAqua = p.light ? 0.25 * w : 0.75 * w;
      const toWhite = spark ? 0.85 : w ** 5 * 0.45;
      let r = p.r + (AQUA[0] - p.r) * toAqua, g = p.g + (AQUA[1] - p.g) * toAqua, b = p.b + (AQUA[2] - p.b) * toAqua;
      r += (WHITE[0] - r) * toWhite; g += (WHITE[1] - g) * toWhite; b += (WHITE[2] - b) * toWhite;
      d[p.i] = r; d[p.i + 1] = g; d[p.i + 2] = b;
      d[p.i + 3] = Math.min(255, (p.light ? 60 : 90) + (p.light ? 110 : 165) * w + (spark ? 80 : 0));
    }
    this.ctx.putImageData(this.data, 0, 0);
    this.tex.refresh();
  }

  buildSparks() {
    if (this.lite || !this.scene.textures.exists('tremor_spark')) return;
    this.sparks = Array.from({ length: 10 }, () => ({
      image: this.image('tremor_spark', 8.3), live: false, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, scale: 1
    }));
  }

  burstSparks(count) {
    if (this.motionK < 0.5 || !this.sparks.length) return;
    let remaining = reserveFx(this.scene, count);
    for (const s of this.sparks) {
      if (!remaining) break;
      if (s.live) continue;
      remaining--;
      s.live = true; s.age = 0; s.life = rand(600, 1200); s.scale = rand(0.3, 0.7);
      s.x = this.landX + rand(-26, 26); s.y = this.landY - rand(0, 34);
      s.vx = rand(-18, 18); s.vy = -rand(30, 85);
      s.image.setTint(Math.random() < 0.4 ? 0xdffff7 : 0x32e9d6).setPosition(s.x, s.y).setVisible(true);
    }
  }

  // ---------- rachaduras ----------
  // Chamado quando a cena da morte termina: assume as imagens das rachaduras (que ficam no chão).
  adoptCracks({ fissure, fissureGlow, scar }) {
    if (this.cracks || this.done) return;
    this.cracks = { fissure, glow: fissureGlow, scar, since: this.clock };
    const near = this.scene.textures.exists('minotaur_death_fissure_near')
      ? this.image('minotaur_death_fissure_near', 2.25) : null;
    if (near) near.setPosition(fissure.x, fissure.y).setScale(fissure.scaleX, fissure.scaleY);
    this.cracks.near = near;
    this.surge = 0;            // intensidade da descarga atual (0..1)
    this.surgeBoost = 1;
    this.nextSurge = this.clock + rand(700, 1800);
    this.echoAt = 0;
  }

  updateCracks(dt) {
    const c = this.cracks;
    if (!c) return;
    const t = this.clock, k = this.calm;
    const ramp = smooth((t - c.since) / 1600);
    if (t >= this.nextSurge) {
      this.surge = rand(0.55, 1);
      this.echoAt = Math.random() < 0.35 ? t + rand(110, 220) : 0;   // às vezes pisca duas vezes
      this.nextSurge = t + rand(1500, 4600);
      this.burstSparks(Math.random() < 0.6 ? 2 : 4);
    }
    if (this.echoAt && t >= this.echoAt) { this.surge = Math.max(this.surge, rand(0.4, 0.8)); this.echoAt = 0; }
    this.surge *= Math.exp(-dt / 330);     // sobe de uma vez, desce devagar
    const idle = 0.5 + 0.5 * Math.sin(t / 900 + 1.7);
    const nearA = (0.13 + 0.1 * idle + this.surge * 0.8) * ramp * k;
    const glowA = (0.05 + 0.04 * idle + this.surge * 0.3) * ramp * k;
    if (c.glow?.active) c.glow.setVisible(glowA > 0.01).setAlpha(glowA);
    if (c.near?.active) c.near.setVisible(nearA > 0.01).setAlpha(nearA).setTint(this.surge > 0.5 ? 0xdffff7 : 0xffffff);
  }

  // ---------- quadro ----------
  update(delta) {
    if (this.done) return;
    if (this.scene.isPaused || this.scene.time.timeScale === 0) return;
    const dt = Math.min(delta, 80);
    this.clock += dt; this.age += dt;
    const age = this.age / 1000, t = this.clock;
    const axe = this.axe;
    if (axe?.active) {
      axe.setDepth(8.1).setPosition(this.landX, this.landY).setScale(RELIC_AXE_SCALE)
        .setRotation(-1.35 + Math.sin(age * 29) * Math.exp(-age * 6) * 0.16 * this.motionK);
    }
    this.mound?.setVisible(true);

    const ph = (t % 1000) / 1000;
    const beat = Math.min(1, bump(ph, 0.1, 0.06) + 0.6 * bump(ph, 0.3, 0.07));   // "tum-tum"
    if (this.axeGlow?.active) {
      const base = 0.6 + (0.3 - 0.6) * smooth(age / 2.4);
      this.axeGlow.setVisible(true).setPosition(this.landX, this.landY - 24)
        .setScale(2 + Math.sin(t * 0.004) * 0.15 + beat * 0.12).setAlpha((base + 0.14 * beat) * this.calm);
    }

    if (this.shimmer) {
      if (t >= this.nextPaint) { this.nextPaint = t + (this.lite ? 150 : 85); this.paint(t); }
      this.shimmer.setVisible(true).setDepth(8.2).setPosition(axe.x, axe.y).setScale(RELIC_AXE_SCALE)
        .setRotation(axe.rotation).setAlpha(Math.min(1, (0.8 + 0.2 * beat) * this.calm + 0.1));
    }
    this.updateCracks(dt);

    for (const s of this.sparks) {
      if (!s.live) continue;
      s.age += dt;
      const u = s.age / s.life;
      if (u >= 1) { s.live = false; s.image.setVisible(false); continue; }
      const sec = dt / 1000;
      s.x += s.vx * sec; s.y += s.vy * sec;
      s.image.setPosition(s.x, s.y).setScale(s.scale * (1 - u * 0.4)).setAlpha(Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.9);
    }
  }

  destroy() {
    if (this.done) return;
    this.done = true;
    this.scene.events.off('update', this.tick);
    this.scene.events.off('shutdown', this.shutdown);
    for (const image of this.extras) if (image.scene) image.destroy();
    this.extras.length = 0;
    this.sparks.length = 0;
    if (this.tex && this.scene.textures.exists(SHIMMER_KEY)) this.scene.textures.remove(SHIMMER_KEY);
    this.tex = null;
  }
}
