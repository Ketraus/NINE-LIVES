import SettingsManager from './SettingsManager.js';

// O DESPERTAR — o Leviatã NÃO aparece: o que causava os tremores está embaixo
// d'água. Quando a câmera chega ao mar (VictoryFinale._playAwakening) este
// sistema faz o oceano "ganhar vida":
//
//   - o mar AGITA: as ondas do shader aceleram (SeaFx.agitation) e anéis de
//     ondulação brotam da superfície, cada vez mais fortes
//   - uma SILHUETA colossal emerge das profundezas: massa escura de bordas
//     moles (como vista através da água), com cristas nas costas e veias de
//     energia roxa que acendem a cada tremor — a mesma energia das crateras
//   - a cada tremor (kick do VictoryTremor) a superfície estoura num anel; duas
//     vezes ela rompe de verdade (ondas grandes), a última maior que a primeira
//   - nada de olhos, cabeça nítida ou corpo inteiro: só a sensação de que algo
//     imenso passa logo abaixo
//
// Fases: awakening -> (fadeOut) dissolving -> calm -> (beginBubbles) bubbles
//
// fadeOut(ms) [VictoryFinale._playClosing]: no silêncio a silhueta e as ondas se
// dissolvem junto com o resto da cena e o mar volta a acalmar.
//
// beginBubbles(ms) [VictoryFinale, depois do mar calmo]: SÓ AGORA surgem as
// bolhas e a espuma: poucas e isoladas no começo, depois mais e mais, com uma
// mancha escura crescendo sob a água, como se algo fosse emergir. A criatura
// nunca emerge: o impacto final corta antes.
//
// Se o mapa não tiver água sob a câmera, nada aparece (o resto da cinemática
// segue normal).

// ---------------------------------------------------------------- camadas
// shader do mar = 1.5 (data/seaFx.js), layer Costa = 2: tudo aqui fica entre os dois
const DEPTH_SHADOW = 1.58;
const DEPTH_BODY = 1.6;
const DEPTH_VEIN = 1.62;
const DEPTH_RING = 1.64;
const DEPTH_FOAM = 1.66;

// ---------------------------------------------------------------- tempos
const BODY_FADE_START_MS = 700; // a massa começa a se insinuar
const BODY_FADE_MS = 4200;
const BUILD_MS = 6500; // a criatura sobe (escala/brilho) até o pico
const AGITATION_MS = 3500; // o mar leva isso pra ficar bravo
const BREAKS = [
  { at: 3800, power: 0.8 },
  { at: 6000, power: 1.15 }
];

// ---------------------------------------------------------------- forma
const BODY_LENGTH_VIEW = 1.2; // comprimento da silhueta × largura da tela (cabe com folga: nunca aparece inteira)
const BODY_ALPHA = 0.74;
const SHADOW_SCALE = 1.34;
const SHADOW_ALPHA = 0.36;
const SHADOW_TINT = 0x03070b; // quase neutro, sem azul saturado
const VEIN_ALPHA = 0.8;
const DRIFT_VIEW = 0.035; // deriva lateral lenta
const WATER_MARGIN_PX = 56; // nada passa da borda da água (a praia fica limpa)

// ---------------------------------------------------------------- ondulações
const RING_CAP = 40;
const FOAM_CAP = 70;
const AMBIENT_RING_MIN_MS = 750;
const AMBIENT_RING_MAX_MS = 1400;
const RING_TINT = 0xd6ecf6;
const PULSE_KICK_RISE = 0.35; // salto do kick que conta como um novo tremor

// ---------------------------------------------------------------- bolhas (mar já calmo)
const BUBBLE_CAP = 70;
const BUBBLE_RATE_START = 0.7; // bolhas por segundo no começo (raras, isoladas)
const BUBBLE_RATE_END = 13; // e no pico
const BUBBLE_SIZE_MIN = 0.009; // × largura da tela
const BUBBLE_SIZE_MAX = 0.026;
const BUBBLE_LIFE_MIN_MS = 900;
const BUBBLE_LIFE_MAX_MS = 1700;
const BUBBLE_FIELD_START = 0.05; // raio do campo de bolhas × largura da tela (cresce)
const BUBBLE_FIELD_END = 0.22;
const FOAM_PATCH_FROM = 0.3; // espuma começa a se juntar depois de 30% da fase
const FOAM_PATCH_RATE_START = 0.4;
const FOAM_PATCH_RATE_END = 2.2;
const SWELL_ALPHA_MAX = 0.32; // mancha escura crescendo sob a água
const SWELL_SIZE_START = 0.2; // × largura da tela
const SWELL_SIZE_END = 0.62;

const KEY_BODY = 'vlv_body';
const KEY_VEIN = 'vlv_vein';
const KEY_RING = 'vlv_ring';
const KEY_FOAM = 'vlv_foam';
const KEY_BUBBLE = 'vlv_bubble';
const BUBBLE_TEX = 64;
const TEX_W = 1100;
const TEX_H = 420;
const RING_TEX = 256;
const FOAM_TEX = 48;

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 2.2);

export default class VictoryLeviathan {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    this._phase = 'idle'; // idle | awakening | calm | bubbles
    this._fading = false;
    this._fade = 1;
    this._t = 0;
    this._rings = [];
    this._foam = [];
    this._bubbles = [];
    this._pool = { ring: [], foam: [], bubble: [] };
    this._nextAmbient = 0;
    this._lastKick = 0;
    this._breaksDone = 0;
    this._spine = [];
    scene.events.once('shutdown', () => this.destroy());
  }

  // target: ponto do mar onde a câmera chegou (FinalCameraTarget)
  start(target) {
    if (this.started) return;
    const scene = this.scene;
    const view = scene.cameras.main.worldView;
    this._reduced = !!SettingsManager.getReducedFlashes?.();
    this._calm = !!SettingsManager.getReducedMotion?.();

    this._U = view.width;
    this._ensureTextures();
    this._scale = (this._U * BODY_LENGTH_VIEW) / TEX_W;
    const bodyH = TEX_H * this._scale;

    // centro: na metade de cima da tela (a água fica ao norte), nunca na praia
    this._waterBottom = this._findWaterBottom(target.x, this._U);
    const spawn = scene.mapManager?.getLeviathanSpawn?.();
    let cy = Phaser.Math.Clamp(spawn?.y ?? view.y + view.height * 0.3, view.y + view.height * 0.2, view.y + view.height * 0.4);
    cy = Math.min(cy, this._waterBottom - bodyH * 0.5 - WATER_MARGIN_PX);
    this._cx = target.x;
    this._cy = cy;

    this.shadow = scene.add.image(this._cx, this._cy, KEY_BODY).setDepth(DEPTH_SHADOW).setTint(SHADOW_TINT).setAlpha(0);
    this.body = scene.add.image(this._cx, this._cy, KEY_BODY).setDepth(DEPTH_BODY).setAlpha(0);
    this.vein = scene.add
      .image(this._cx, this._cy, KEY_VEIN)
      .setDepth(DEPTH_VEIN)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    this._nextAmbient = 300;
    this.started = true;
    this._phase = 'awakening';
  }

  // dissolve tudo em `ms` e acalma o mar; no fim remove os objetos
  fadeOut(ms = 2600) {
    if (!this.started || this._fading) return;
    this._fading = true;
    this._fadeMs = Math.max(1, ms);
    this._fadeAt = 0;
  }

  update(delta) {
    if (!this.started) return;
    const scene = this.scene;
    const dt = Math.min(delta, 100);
    if (this._phase === 'bubbles') {
      this._updateBubbles(dt);
      return;
    }
    if (this._phase !== 'awakening') return; // calm: mar parado, nada na tela
    this._t += dt;
    const t = this._t;

    if (this._fading) {
      this._fadeAt += dt;
      this._fade = 1 - smooth(this._fadeAt / this._fadeMs);
    }
    const fade = this._fade;

    // mar agitado: as ondas do shader aceleram e voltam a acalmar no fim
    const agit = smooth(t / AGITATION_MS) * fade * (this._calm ? 0.5 : 1);
    if (scene.seaFx) scene.seaFx.agitation = agit;

    const build = smooth(t / BUILD_MS);
    const kick = Math.max(scene.victoryTremor?.kick || 0, scene.victoryTremorKick || 0);

    // ---- a massa sob a água
    const rise = smooth((t - BODY_FADE_START_MS) / BODY_FADE_MS);
    const sc = this._scale * (0.88 + 0.14 * build) * (1 + 0.012 * Math.sin(t / 620));
    const x = this._cx + Math.sin(t / 2300) * this._U * DRIFT_VIEW;
    const y = this._cy + Math.sin(t / 1900) * 7 - build * 10;
    const ang = Math.sin(t / 3100) * 2.2;
    const squash = 1 + 0.05 * Math.sin(t / 710);
    this.body.setPosition(x, y).setScale(sc, sc * squash).setAngle(ang).setAlpha(BODY_ALPHA * rise * fade);
    this.shadow.setPosition(x, y + 4).setScale(sc * SHADOW_SCALE, sc * SHADOW_SCALE * squash * 1.08).setAngle(ang).setAlpha(SHADOW_ALPHA * rise * fade);
    const glow = (0.14 + 0.86 * kick) * build * (this._reduced ? 0.6 : 1);
    this.vein.setPosition(x, y).setScale(sc, sc * squash).setAngle(ang).setAlpha(Math.min(1, VEIN_ALPHA * glow) * rise * fade);

    // ---- cada tremor estoura a superfície em anéis
    if (!this._fading && kick > this._lastKick + PULSE_KICK_RISE) this._pulse(0.5 + 0.5 * build);
    this._lastKick = kick;

    // ---- ondulações contínuas, cada vez mais frequentes
    if (!this._fading && t >= this._nextAmbient) {
      const k = Phaser.Math.Linear(1, 0.45, build);
      this._nextAmbient = t + rand(AMBIENT_RING_MIN_MS, AMBIENT_RING_MAX_MS) * k;
      const p = this._surfacePoint();
      this._ring(p.x, p.y, 12, this._U * rand(0.05, 0.09) * (0.7 + 0.5 * build), rand(1500, 2200), 0.22 + 0.12 * build);
    }

    // ---- a superfície rompe (duas vezes, a segunda maior)
    if (!this._fading && this._breaksDone < BREAKS.length && t >= BREAKS[this._breaksDone].at) {
      this._burst(BREAKS[this._breaksDone].power);
      this._breaksDone++;
    }

    this._stepRings(dt);
    this._stepFoam(dt);

    if (this._fading && this._fadeAt >= this._fadeMs) this._finishDissolve();
  }

  // ---------------------------------------------------------------- efeitos de superfície

  // ponto aleatório sobre o dorso (dentro da água)
  _surfacePoint() {
    const b = this.body;
    const s = this._spine[Math.floor(rand(0.12, 0.88) * (this._spine.length - 1))] || { nx: 0, ny: 0 };
    const x = b.x + s.nx * TEX_W * b.scaleX + rand(-30, 30);
    let y = b.y + s.ny * TEX_H * b.scaleY + rand(-20, 20);
    y = Math.min(y, this._waterBottom - WATER_MARGIN_PX);
    return { x, y };
  }

  // um tremor: 1–2 anéis saindo do dorso + um punhado de espuma
  _pulse(strength) {
    const n = strength > 0.8 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p = this._surfacePoint();
      this._ring(p.x, p.y, 16, this._U * rand(0.1, 0.17) * strength, rand(1600, 2300), 0.4 * strength);
    }
  }

  // a criatura quase rompe a superfície: ondas grandes (a espuma só vem depois, com o mar calmo)
  _burst(power) {
    const p = this._surfacePoint();
    const R = this._U * 0.26 * power;
    this._ring(p.x, p.y, 24, R, 2300, 0.62);
    this._ring(p.x, p.y, 10, R * 0.62, 1700, 0.55);
    this._ring(p.x + rand(-60, 60), p.y + rand(-30, 30), 10, R * 0.4, 1400, 0.5);
    this._ring(p.x + rand(-90, 90), p.y + rand(-40, 40), 14, R * 0.8, 2000, 0.4);
  }

  _ring(x, y, r0, r1, life, a0) {
    if (this._rings.length >= RING_CAP || this._fading) return;
    y = Math.min(y, this._waterBottom - WATER_MARGIN_PX - r1 * 0.15);
    const img = this._pool.ring.pop() || this.scene.add.image(0, 0, KEY_RING).setDepth(DEPTH_RING).setBlendMode(Phaser.BlendModes.ADD);
    img.setPosition(x, y).setTint(RING_TINT).setVisible(true).setAlpha(0);
    this._rings.push({ img, x, y, r0, r1, life, age: 0, a0: a0 * (this._reduced ? 0.6 : 1) });
  }

  _foamBlob(x, y, size) {
    if (this._foam.length >= FOAM_CAP) return;
    this._foamSprite({ x, y, vx: rand(-8, 8), vy: rand(-5, 5), drag: 0.8, s0: 0.5 * size, s1: 1.6 * size, life: rand(1800, 2800), a0: rand(0.28, 0.42), blob: true });
  }

  _foamSprite(cfg) {
    const img = this._pool.foam.pop() || this.scene.add.image(0, 0, KEY_FOAM).setDepth(DEPTH_FOAM);
    img.setPosition(cfg.x, Math.min(cfg.y, this._waterBottom - WATER_MARGIN_PX)).setVisible(true).setAlpha(0).setTint(0xeaf6fb);
    this._foam.push({ img, age: 0, ...cfg });
  }

  _stepRings(dt) {
    const fade = this._fade;
    for (let i = this._rings.length - 1; i >= 0; i--) {
      const r = this._rings[i];
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.img.setVisible(false);
        this._pool.ring.push(r.img);
        this._rings.splice(i, 1);
        continue;
      }
      const radius = r.r0 + (r.r1 - r.r0) * easeOut(k);
      const a = r.a0 * smooth(k / 0.12) * Math.pow(1 - k, 1.6) * fade;
      r.img.setScale((radius * 2) / RING_TEX).setAlpha(a);
    }
  }

  _stepFoam(dt) {
    const dtS = dt / 1000;
    const fade = this._fade;
    for (let i = this._foam.length - 1; i >= 0; i--) {
      const f = this._foam[i];
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) {
        f.img.setVisible(false);
        this._pool.foam.push(f.img);
        this._foam.splice(i, 1);
        continue;
      }
      const d = Math.max(0, 1 - f.drag * dtS);
      f.vx *= d;
      f.vy *= d;
      f.x += f.vx * dtS;
      f.y += f.vy * dtS;
      const s = f.s0 + (f.s1 - f.s0) * easeOut(k);
      const a = f.a0 * smooth(k / 0.1) * (1 - smooth((k - 0.35) / 0.65)) * fade;
      f.img.setPosition(f.x, Math.min(f.y, this._waterBottom - WATER_MARGIN_PX)).setScale(s).setAlpha(a);
    }
  }

  // ---------------------------------------------------------------- mapa

  // primeira linha (em px) abaixo da água, olhando algumas colunas em volta
  _findWaterBottom(x, span) {
    const map = this.scene.mapManager?.map;
    const layer = map?.getLayer?.('Mar');
    if (!layer) return Infinity;
    const tw = map.tileWidth;
    const th = map.tileHeight;
    let bottom = Infinity;
    for (let k = -2; k <= 2; k++) {
      const col = Math.floor((x + (k * span) / 4) / tw);
      let row = 0;
      while (row < map.height && layer.data[row]?.[col]?.index > 0) row++;
      bottom = Math.min(bottom, row * th);
    }
    return bottom < 256 ? Infinity : bottom;
  }

  // ---------------------------------------------------------------- texturas

  _ensureTextures() {
    const tex = this.scene.textures;
    if (!tex.exists(KEY_BODY) || !tex.exists(KEY_VEIN)) this._makeBody();
    else this._rebuildSpine();
    if (!tex.exists(KEY_RING)) this._makeRing();
    if (!tex.exists(KEY_FOAM)) this._makeFoam();
    if (!tex.exists(KEY_BUBBLE)) this._makeBubble();
  }

  // pontos do corpo (serpente colossal, curva suave) em coordenadas de textura
  _bodyPoints() {
    const pts = [];
    const N = 46;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = 70 + t * (TEX_W - 140);
      const y = TEX_H * 0.5 + Math.sin(t * Math.PI * 1.7 + 0.4) * TEX_H * 0.17;
      let r = TEX_H * 0.19 * (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * t), 0.7));
      if (t > 0.85 && t < 0.97) r *= 1.2; // a cabeça, só um inchaço borrado
      pts.push({ x, y, r, t });
    }
    return pts;
  }

  _rebuildSpine() {
    this._spine = this._bodyPoints().map((p) => ({ nx: p.x / TEX_W - 0.5, ny: (p.y - p.r * 0.5) / TEX_H - 0.5 }));
  }

  _makeBody() {
    const tex = this.scene.textures;
    const pts = this._bodyPoints();
    this._rebuildSpine();

    // corpo: círculos de borda mole acumulados (visto através da água)
    const body = tex.createCanvas(KEY_BODY, TEX_W, TEX_H);
    const ctx = body.getContext();
    for (const p of pts) {
      const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.35, p.x, p.y, p.r * 1.3);
      g.addColorStop(0, 'rgba(2,5,9,0.55)');
      g.addColorStop(1, 'rgba(2,5,9,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // cristas nas costas: só insinuadas, bordas suavizadas pelo "vidro" da água
    ctx.fillStyle = 'rgba(2,5,9,0.55)';
    for (let i = 5; i < pts.length - 6; i += 2) {
      const p = pts[i];
      const h = p.r * rand(0.45, 0.8);
      const bx = p.x;
      const by = p.y - p.r * 0.85;
      ctx.beginPath();
      ctx.moveTo(bx - p.r * 0.18, by + 4);
      ctx.lineTo(bx + rand(-6, 6), by - h);
      ctx.lineTo(bx + p.r * 0.18, by + 4);
      ctx.closePath();
      ctx.fill();
    }
    body.refresh();

    // veias de energia roxa ao longo do dorso (ADD, pulsam a cada tremor)
    const vein = tex.createCanvas(KEY_VEIN, TEX_W, TEX_H);
    const vctx = vein.getContext();
    for (let i = 3; i < pts.length - 3; i++) {
      if (Math.random() < 0.35) continue;
      const p = pts[i];
      const vx = p.x + rand(-8, 8);
      const vy = p.y - p.r * rand(0.35, 0.75);
      const vr = rand(10, 24);
      const g = vctx.createRadialGradient(vx, vy, 0, vx, vy, vr);
      g.addColorStop(0, 'rgba(210,160,255,0.85)');
      g.addColorStop(0.4, 'rgba(138,43,226,0.45)');
      g.addColorStop(1, 'rgba(58,12,110,0)');
      vctx.fillStyle = g;
      vctx.beginPath();
      vctx.arc(vx, vy, vr, 0, Math.PI * 2);
      vctx.fill();
    }
    vein.refresh();
  }

  _makeRing() {
    const c = this.scene.textures.createCanvas(KEY_RING, RING_TEX, RING_TEX);
    const ctx = c.getContext();
    const m = RING_TEX / 2;
    const g = ctx.createRadialGradient(m, m, m * 0.74, m, m, m);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, RING_TEX, RING_TEX);
    c.refresh();
  }

  // bolha vista de cima: aro claro, miolo translúcido e um brilho no canto
  _makeBubble() {
    const c = this.scene.textures.createCanvas(KEY_BUBBLE, BUBBLE_TEX, BUBBLE_TEX);
    const ctx = c.getContext();
    const m = BUBBLE_TEX / 2;
    const body = ctx.createRadialGradient(m, m, 0, m, m, m);
    body.addColorStop(0, 'rgba(205,232,246,0.08)');
    body.addColorStop(0.72, 'rgba(205,232,246,0.2)');
    body.addColorStop(0.86, 'rgba(235,248,255,0.85)');
    body.addColorStop(0.95, 'rgba(235,248,255,0.4)');
    body.addColorStop(1, 'rgba(235,248,255,0)');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, BUBBLE_TEX, BUBBLE_TEX);
    const hx = m * 0.66;
    const hy = m * 0.6;
    const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, m * 0.26);
    hl.addColorStop(0, 'rgba(255,255,255,0.95)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(hx, hy, m * 0.26, 0, Math.PI * 2);
    ctx.fill();
    c.refresh();
  }

  _makeFoam() {
    const c = this.scene.textures.createCanvas(KEY_FOAM, FOAM_TEX, FOAM_TEX);
    const ctx = c.getContext();
    const m = FOAM_TEX / 2;
    const g = ctx.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FOAM_TEX, FOAM_TEX);
    c.refresh();
  }

  // ---------------------------------------------------------------- fim

  // A dissolução terminou: some a silhueta, o mar fica calmo e a tela, limpa.
  // (a fase de bolhas só começa quando o VictoryFinale chamar beginBubbles)
  _finishDissolve() {
    if (this.scene.seaFx) this.scene.seaFx.agitation = 0;
    [this.body, this.shadow, this.vein].forEach((o) => o?.destroy());
    this.body = this.shadow = this.vein = null;
    this._rings.forEach((r) => {
      r.img.setVisible(false);
      this._pool.ring.push(r.img);
    });
    this._foam.forEach((f) => {
      f.img.setVisible(false);
      this._pool.foam.push(f.img);
    });
    this._rings = [];
    this._foam = [];
    this._fading = false;
    this._fade = 1;
    this._phase = 'calm';
  }

  // ---------------------------------------------------------------- bolhas

  // O mar está calmo e em silêncio. Bolhas isoladas começam a subir, depois mais
  // e mais, com espuma se juntando e uma sombra crescendo sob a água: algo vai
  // emergir. Dura `ms`; o impacto final do VictoryFinale corta no pico.
  beginBubbles(ms = 5200) {
    if (!this.started || this._phase === 'bubbles') return;
    if (this._phase === 'awakening') this._finishDissolve(); // segurança: nunca bolhas por cima da agitação
    const scene = this.scene;
    this._phase = 'bubbles';
    this._bt = 0;
    this._bubbleMs = Math.max(1, ms);
    this._bubbleDebt = 0.6; // a primeira bolha não demora
    this._patchDebt = 0;
    this._nextRipple = 500;
    this._ex = this._cx;
    this._ey = Math.min(this._cy, this._waterBottom - WATER_MARGIN_PX - this._U * 0.1);
    this.swell = scene.add
      .image(this._ex, this._ey, KEY_FOAM)
      .setDepth(DEPTH_SHADOW)
      .setTint(SHADOW_TINT)
      .setAlpha(0);
  }

  _updateBubbles(dt) {
    this._bt += dt;
    const p = Math.min(1, this._bt / this._bubbleMs);
    const build = Math.pow(p, 1.8);
    const soft = this._reduced ? 0.6 : 1;
    const U = this._U;

    // bolhas: raras no começo, enxame no fim
    this._bubbleDebt += Phaser.Math.Linear(BUBBLE_RATE_START, BUBBLE_RATE_END, build) * soft * (dt / 1000);
    while (this._bubbleDebt >= 1) {
      this._bubbleDebt -= 1;
      this._spawnBubble(p);
    }

    // espuma se juntando (só depois de um tempo)
    if (p > FOAM_PATCH_FROM) {
      const q = (p - FOAM_PATCH_FROM) / (1 - FOAM_PATCH_FROM);
      this._patchDebt += Phaser.Math.Linear(FOAM_PATCH_RATE_START, FOAM_PATCH_RATE_END, q) * soft * (dt / 1000);
      while (this._patchDebt >= 1) {
        this._patchDebt -= 1;
        const r = U * Phaser.Math.Linear(BUBBLE_FIELD_START, BUBBLE_FIELD_END, p) * 0.8;
        const a = rand(0, Math.PI * 2);
        const d = Math.sqrt(Math.random()) * r;
        this._foamBlob(this._ex + Math.cos(a) * d * 1.3, this._ey + Math.sin(a) * d * 0.7, rand(0.3, 0.8));
      }
    }

    // ondulações lentas no centro, cada vez mais próximas
    this._nextRipple -= dt;
    if (this._nextRipple <= 0) {
      this._nextRipple = Phaser.Math.Linear(1100, 450, p);
      this._ring(
        this._ex + rand(-0.03, 0.03) * U,
        this._ey + rand(-0.015, 0.015) * U,
        8,
        U * Phaser.Math.Linear(0.05, 0.12, p),
        2000,
        (0.14 + 0.14 * p) * (this._reduced ? 0.6 : 1)
      );
    }

    // a sombra sob a água cresce: algo sobe
    const size = U * Phaser.Math.Linear(SWELL_SIZE_START, SWELL_SIZE_END, build);
    this.swell?.setScale(size / FOAM_TEX).setAlpha(SWELL_ALPHA_MAX * Math.pow(p, 1.5));

    this._stepBubbles(dt);
    this._stepRings(dt);
    this._stepFoam(dt);
  }

  _spawnBubble(p) {
    if (this._bubbles.length >= BUBBLE_CAP) return;
    const U = this._U;
    const r = U * Phaser.Math.Linear(BUBBLE_FIELD_START, BUBBLE_FIELD_END, p) * Math.sqrt(Math.random());
    const a = rand(0, Math.PI * 2);
    const x = this._ex + Math.cos(a) * r * 1.3;
    const y = Math.min(this._ey + Math.sin(a) * r * 0.7, this._waterBottom - WATER_MARGIN_PX);
    const img = this._pool.bubble.pop() || this.scene.add.image(0, 0, KEY_BUBBLE).setDepth(DEPTH_FOAM + 0.01);
    img.setPosition(x, y).setVisible(true).setAlpha(0).setScale(0.01);
    this._bubbles.push({
      img,
      x,
      y,
      age: 0,
      life: rand(BUBBLE_LIFE_MIN_MS, BUBBLE_LIFE_MAX_MS),
      size: U * rand(BUBBLE_SIZE_MIN, BUBBLE_SIZE_MAX) * (1 + 0.5 * p),
      ph: rand(0, Math.PI * 2)
    });
  }

  _stepBubbles(dt) {
    for (let i = this._bubbles.length - 1; i >= 0; i--) {
      const b = this._bubbles[i];
      b.age += dt;
      const k = b.age / b.life;
      if (k >= 1) {
        // estoura: um anel pequeno na superfície
        this._ring(b.x, b.y, b.size * 0.5, b.size * 2.4, 520, 0.34);
        b.img.setVisible(false);
        this._pool.bubble.push(b.img);
        this._bubbles.splice(i, 1);
        continue;
      }
      const grow = k < 0.35 ? easeOut(k / 0.35) : 1 + 0.06 * Math.sin(b.age / 140 + b.ph); // incha e fica trêmula
      const a = smooth(k / 0.1) * (k > 0.9 ? 1 - (k - 0.9) / 0.1 : 1) * 0.92;
      b.img
        .setPosition(b.x + Math.sin(b.age / 260 + b.ph) * 2, b.y - b.age * 0.004)
        .setScale((b.size * grow) / BUBBLE_TEX)
        .setAlpha(a);
    }
  }

  _destroyObjects() {
    [this.body, this.shadow, this.vein].forEach((o) => o?.destroy());
    this.body = this.shadow = this.vein = null;
    this._rings.forEach((r) => r.img?.destroy());
    this._foam.forEach((f) => f.img?.destroy());
    this._pool.ring.forEach((i) => i?.destroy());
    this._pool.foam.forEach((i) => i?.destroy());
    this.swell?.destroy();
    this.swell = null;
    this._bubbles.forEach((b) => b.img?.destroy());
    this._pool.bubble.forEach((i) => i?.destroy());
    this._rings = [];
    this._foam = [];
    this._bubbles = [];
    this._pool = { ring: [], foam: [], bubble: [] };
  }

  destroy() {
    if (this.scene?.seaFx) this.scene.seaFx.agitation = 0;
    this._destroyObjects();
    this.started = false;
    this._phase = 'idle';
  }
}
