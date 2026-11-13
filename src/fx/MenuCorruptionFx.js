// Menu principal CORROMPIDO — só aparece depois que o jogador terminou o jogo
// (ver systems/GameProgress.js). A energia do Leviatã chegou até a cidade.
//
// O fundo é montado em CAMADAS (todas no mesmo espaço da imagem 1024x1024 do
// menu normal, cobrindo as linhas 120..840), de trás pra frente:
//
//   1. sky   (menu_corr_sky.jpg)   céu liso, sem dither/pixel: gradiente violeta,
//                                  névoa suave e halos difusos dos feixes
//   2. energy (canvas, por código) a ENERGIA viva: feixes que sobem de trás dos
//                                  prédios com fluxo contínuo, pulsos viajando,
//                                  brasas, névoa roxa e brilho na base de cada
//                                  feixe. Fica ATRÁS da cidade, então os prédios
//                                  recortam a luz de verdade (nada de efeito
//                                  jogado por cima)
//   3. city  (menu_corr_city.png)  os prédios corroídos, com borda suavizada
//                                  (PNG com transparência)
//   4. glow  (menu_corr_glow.png)  só o que brilha NOS prédios: manchas, janelas
//                                  infectadas e a luz de contorno que a energia
//                                  de trás joga na silhueta; soma (ADD) e pulsa
//                                  junto com a energia
//
// `level` (0..1) é o quanto do fundo corrompido aparece: a transição "a energia
// chegou" (reveal()) faz tudo surgir sobre o fundo normal, o céu e a energia
// primeiro e os prédios depois.

import SettingsManager from '../systems/SettingsManager.js';

const clamp01 = (v) => Phaser.Math.Clamp(v, 0, 1);

// ruído suave e irregular (soma de senos lentos) -> 0..1
export function softNoise(t) {
  return 0.5 + 0.5 * (Math.sin(t * 1.7) * 0.5 + Math.sin(t * 2.9 + 1.3) * 0.3 + Math.sin(t * 5.1 + 4) * 0.2);
}

export function mixColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// ------------------------------------------------------------------
// Geometria (pixels da imagem 1024x1024 do menu)
// ------------------------------------------------------------------
const REGION_Y0 = 120; // as texturas novas cobrem as linhas 120..840
const REGION_H = 720;
const REGION_W = 1024;
const REGION_CENTER_Y = REGION_Y0 + REGION_H / 2; // 480
const IMG_CENTER_Y = 512;

const ER = 0.625; // resolução do canvas de energia (suave de propósito)
const EW = Math.round(REGION_W * ER);
const EH = Math.round(REGION_H * ER);

// x do feixe, y do topo do prédio de onde ele sai, alcance (px acima do
// prédio) e largura relativa. A base fica um pouco DENTRO do prédio.
const BEAMS = [
  { x: 517, roof: 356, reach: 760, w: 1.35, speed: 1.0 },
  { x: 395, roof: 461, reach: 520, w: 0.95, speed: 0.9 },
  { x: 272, roof: 489, reach: 430, w: 0.85, speed: 1.1 },
  { x: 628, roof: 492, reach: 470, w: 0.95, speed: 0.95 },
  { x: 697, roof: 520, reach: 520, w: 1.0, speed: 1.05 },
  { x: 848, roof: 623, reach: 450, w: 0.8, speed: 0.85 },
  { x: 967, roof: 596, reach: 430, w: 0.8, speed: 1.15 },
  { x: 170, roof: 529, reach: 280, w: 0.6, speed: 1.0 },
  { x: 745, roof: 508, reach: 330, w: 0.65, speed: 0.9 }
];
const BASE_SINK = 34; // quanto a base do feixe afunda dentro do prédio

const TEX_W = 64;
const TEX_H = 512;
const SPARK_COUNT = 70;
const HAZE_COUNT = 7;

// ------------------------------------------------------------------
// Texturas procedurais (geradas uma vez)
// ------------------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ruído de valor periódico em y (tileável na vertical)
function makeNoise(cellsX, cellsY, seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const grid = [];
  for (let j = 0; j < cellsY; j++) {
    const row = [];
    for (let i = 0; i <= cellsX; i++) row.push(rnd());
    grid.push(row);
  }
  const sm = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    // u 0..1 (x), v 0..1 (y, periódico)
    const fx = u * cellsX, fy = v * cellsY;
    const i = Math.min(cellsX - 1, Math.floor(fx)), j = Math.floor(fy) % cellsY;
    const tx = sm(fx - i), ty = sm(fy - Math.floor(fy));
    const j2 = (j + 1) % cellsY;
    const a = grid[j][i] + (grid[j][i + 1] - grid[j][i]) * tx;
    const b = grid[j2][i] + (grid[j2][i + 1] - grid[j2][i]) * tx;
    return a + (b - a) * ty;
  };
}

// faixa de fluxo de energia (tileável na vertical): perfil horizontal de
// feixe x estrias de ruído. `halo` = perfil largo e macio (camada B).
function bakeFlow(seed, halo) {
  const c = makeCanvas(TEX_W, TEX_H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TEX_W, TEX_H);
  const n1 = makeNoise(4, 22, seed);
  const n2 = makeNoise(8, 61, seed + 17);
  const n3 = makeNoise(3, 9, seed + 33);
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / (TEX_W - 1);
      const d = Math.abs(u - 0.5) * 2; // 0 centro .. 1 borda
      const prof = halo
        ? Math.exp(-Math.pow(d / 0.62, 2)) * 0.55
        : Math.min(1, Math.exp(-Math.pow(d / 0.075, 2)) + Math.exp(-Math.pow(d / 0.36, 2)) * 0.42);
      let s = 0.45 * n1(u, v) + 0.35 * n2(u, v) + 0.2 * n3(u, v);
      s = Math.pow(Math.min(1, Math.max(0, (s - 0.2) / 0.65)), halo ? 1.1 : 1.5);
      const edge = Math.pow(Math.max(0, 1 - d * d), 2); // zera nas bordas: sem corte reto
      const a = Math.min(1, prof * edge * (halo ? 0.3 + 0.7 * s : 0.18 + 0.82 * s));
      const k = (y * TEX_W + x) * 4;
      // cor: violeta profundo nas bordas -> lavanda quase branca no miolo
      const hot = Math.pow(a, 1.4);
      img.data[k] = 105 + 150 * hot;
      img.data[k + 1] = 42 + 150 * Math.pow(hot, 1.4);
      img.data[k + 2] = 200 + 55 * hot;
      img.data[k + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// pulso de energia subindo pelo feixe: cabeça brilhante, cauda longa
function bakePacket() {
  const w = 24, h = 112;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1); // 0 cabeça (topo) .. 1 fim da cauda
    const tail = t < 0.12 ? t / 0.12 : Math.pow(1 - (t - 0.12) / 0.88, 2.2);
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x / (w - 1) - 0.5) * 2;
      const a = Math.exp(-Math.pow(d / 0.4, 2)) * tail;
      const k = (y * w + x) * 4;
      img.data[k] = 235;
      img.data[k + 1] = 190 + 50 * a;
      img.data[k + 2] = 255;
      img.data[k + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function bakeGlow(r, g, b) {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.35, `rgba(${r},${g},${b},0.42)`);
  grd.addColorStop(0.7, `rgba(${r},${g},${b},0.1)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

const rand = (a, b) => a + Math.random() * (b - a);

export default class MenuCorruptionFx {
  // `bg` = a imagem do fundo normal (as camadas copiam posição/escala dela)
  constructor(scene, bg, { level = 1 } = {}) {
    this.scene = scene;
    this.level = level;
    this._surge = 0; // brilho extra (reveal / drone absorvido)
    this._calm = SettingsManager.getReducedMotion();
    this._lowFlashes = SettingsManager.getReducedFlashes();
    this._touch = Boolean(scene.sys.game.device.input.touch);
    this._frame = 0;

    this.sky = scene.add.image(bg.x, bg.y, 'menu_corr_sky').setScale(bg.scaleX).setAlpha(level);

    this._bakeEnergy(scene);
    this.energy = scene.add
      .image(bg.x, bg.y, 'menu_corr_energy')
      .setScale(bg.scaleX / ER)
      .setAlpha(level * level)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.city = scene.add.image(bg.x, bg.y, 'menu_corr_city').setScale(bg.scaleX).setAlpha(level);
    this.glow = scene.add
      .image(bg.x, bg.y, 'menu_corr_glow')
      .setScale(bg.scaleX)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);

    // ordem de trás pra frente (MainMenuScene insere nessa ordem)
    this.layers = [this.sky, this.energy, this.city, this.glow];
  }

  // ----------------------------------------------------------------
  // preparação da energia (texturas + estado das partículas)
  // ----------------------------------------------------------------
  _bakeEnergy(scene) {
    if (scene.textures.exists('menu_corr_energy')) scene.textures.remove('menu_corr_energy');
    this._tex = scene.textures.createCanvas('menu_corr_energy', EW, EH);
    this._ctx = this._tex.getContext();

    this._flowA = bakeFlow(11, false);
    this._flowB = bakeFlow(47, true);
    this._packetTex = bakePacket();
    this._glowViolet = bakeGlow(150, 70, 255);
    this._glowMagenta = bakeGlow(255, 60, 200);

    this._beams = BEAMS.map((b, i) => {
      const yBase = b.roof + BASE_SINK;
      const yTop = Math.max(yBase - b.reach, REGION_Y0 - 12);
      const len = Math.ceil((yBase - yTop) * ER);
      const mk = (power) => {
        const canvas = makeCanvas(TEX_W, len);
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, len);
        // alpha em função da distância à base (d: 0 base .. 1 alcance)
        for (let k = 0; k <= 12; k++) {
          const d = k / 12;
          const pos = 1 - (d * b.reach * ER) / len;
          const a = Math.pow(1 - d, power) * (d < 0.03 ? 1 : 1);
          if (pos < 0) {
            grad.addColorStop(0, `rgba(0,0,0,${Math.max(0, a)})`);
            break;
          }
          grad.addColorStop(pos, `rgba(0,0,0,${a})`);
        }
        // a base afunda no prédio: some devagar pra nunca aparecer um corte reto
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        grad.addColorStop(Math.max(0, 1 - (BASE_SINK * ER * 0.9) / len), 'rgba(0,0,0,0.9)');
        return { canvas, ctx, grad };
      };
      return {
        ...b,
        i,
        yBase,
        len,
        A: mk(0.85),
        B: mk(1.7),
        phase: rand(0, TEX_H),
        seed: rand(0, 100),
        packets: [0, 1, 2].map(() => ({ p: rand(0, 1), v: rand(150, 230) / b.reach, wait: rand(0, 2.5) }))
      };
    });

    this._sparks = [];
    for (let i = 0; i < SPARK_COUNT; i++) this._sparks.push(this._newSpark(true));

    this._haze = [];
    for (let i = 0; i < HAZE_COUNT; i++) {
      this._haze.push({
        x: rand(-100, 1124),
        y: rand(380, 590),
        w: rand(380, 620),
        h: rand(120, 190),
        v: rand(6, 16) * (Math.random() < 0.5 ? -1 : 1),
        a: rand(0.06, 0.12),
        mag: Math.random() < 0.35,
        seed: rand(0, 100)
      });
    }
  }

  _newSpark(initial) {
    const b = BEAMS[Math.floor(Math.random() * BEAMS.length)];
    return {
      x: b.x + rand(-26, 26),
      y: b.roof + rand(-10, 30) - (initial ? rand(0, 260) : 0),
      vy: rand(22, 70),
      sway: rand(0.6, 2),
      swayA: rand(3, 11),
      ph: rand(0, 6.28),
      life: 0,
      max: rand(3.5, 7),
      big: Math.random() < 0.2
    };
  }

  // Transição "a energia chegou até aqui": o menu começa normal, a câmera
  // sente um golpe grave e a cidade corrompida toma o fundo aos poucos.
  reveal() {
    this.level = 0;
    this._applyLevel(0, 0);
    const scene = this.scene;
    scene.time.delayedCall(1500, () => {
      if (!scene.sys?.isActive()) return;
      this._surge = 1.3;
      scene.cameras.main.shake(1100, 0.0035, true);
      try {
        if (scene.cache.audio.exists('sfx_cyberus_explosion')) {
          scene.sound.play('sfx_cyberus_explosion', { volume: 0.45, rate: 0.35 });
        }
      } catch (e) {
        /* sem áudio: segue sem som */
      }
      scene.tweens.add({ targets: this, level: 1, duration: 5200, ease: 'Sine.easeInOut' });
    });
  }

  // um drone foi absorvido pela torre: a energia dá um pulso
  feed() {
    this._surge = Math.min(1.4, this._surge + 0.4);
  }

  _applyLevel(L, energyMul) {
    // céu e energia chegam primeiro; os prédios corroídos depois
    this.sky.setAlpha(L);
    this.energy.setAlpha(L * L * energyMul);
    const k = clamp01((L - 0.25) / 0.75);
    this.city.setAlpha(k * k * (3 - 2 * k));
  }

  update(time, delta, bg) {
    const L = clamp01(this.level);
    const dt = Math.min(delta, 50) / 1000;
    this._surge = Math.max(0, this._surge - dt / 2.2);
    const t = time / 1000;
    const calm = this._calm ? 0.45 : 1;
    const flashK = this._lowFlashes ? 0.4 : 1;

    // acompanham zoom/parallax do fundo
    const s = bg.scaleX;
    const y = bg.y + (REGION_CENTER_Y - IMG_CENTER_Y) * s;
    this.sky.setPosition(bg.x, y).setScale(s);
    this.city.setPosition(bg.x, y).setScale(s);
    this.glow.setPosition(bg.x, y).setScale(s);
    this.energy.setPosition(bg.x, y).setScale(s / ER);

    // batimento: de tempos em tempos a fonte "bombeia" e os feixes crescem
    const beat = Math.exp(-Math.pow(((t % 6.8) - 0.5) / 0.4, 2)) * 0.45 * flashK * calm;
    const surge = this._surge * flashK;
    const energyBoost = 1 + surge * 0.5 + beat * 0.5;

    this._applyLevel(L, 1);
    // luz de contorno e manchas dos prédios pulsam junto com a energia
    const glowPulse = 0.5 + 0.28 * softNoise(t * 0.7) * calm + 0.4 * beat + 0.45 * surge;
    this.glow.setAlpha(L * L * glowPulse);

    if (L <= 0.01) return;
    this._frame++;
    if (this._touch && this._frame % 2) return; // celular: energia a 30 fps
    this._drawEnergy(t, dt * (this._touch ? 2 : 1), calm, energyBoost, surge, beat);
  }

  // ----------------------------------------------------------------
  // desenho da energia (canvas 2D, soma de luz sobre preto)
  // ----------------------------------------------------------------
  _drawEnergy(t, dt, calm, boost, surge, beat) {
    const ctx = this._ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, EW, EH);
    ctx.globalCompositeOperation = 'lighter';

    const toX = (x) => x * ER;
    const toY = (y) => (y - REGION_Y0) * ER;

    // névoa roxa subindo de trás da cidade
    for (const h of this._haze) {
      h.x += h.v * dt * calm;
      if (h.x < -h.w) h.x = REGION_W + h.w * 0.5;
      if (h.x > REGION_W + h.w) h.x = -h.w * 0.5;
      const a = h.a * (0.65 + 0.35 * softNoise(t * 0.35 + h.seed)) * (0.8 + 0.5 * surge + 0.3 * beat);
      ctx.globalAlpha = Math.min(0.5, a);
      ctx.drawImage(h.mag ? this._glowMagenta : this._glowViolet, toX(h.x - h.w / 2), toY(h.y - h.h / 2), h.w * ER, h.h * ER);
    }

    for (const b of this._beams) {
      const flick = 0.72 + 0.28 * softNoise(t * 1.1 + b.seed);
      const I = Math.min(1.35, flick * boost);
      const sway = Math.sin(t * 0.55 * calm + b.seed) * 1.3;
      const cx = toX(b.x) + sway;
      const top = toY(b.yBase) - b.len;

      // brilho na base (atrás do prédio): a fonte da energia
      const gs = (150 + 60 * b.w) * (0.9 + 0.2 * softNoise(t * 0.9 + b.seed * 2));
      ctx.globalAlpha = Math.min(0.9, 0.42 * I);
      ctx.drawImage(this._glowViolet, toX(b.x) - (gs * ER) / 2, toY(b.roof + 10) - (gs * ER) / 2, gs * ER, gs * ER);
      ctx.globalAlpha = Math.min(0.9, 0.18 * I);
      const gm = gs * 0.55;
      ctx.drawImage(this._glowMagenta, toX(b.x) - (gm * ER) / 2, toY(b.roof + 4) - (gm * ER) / 2, gm * ER, gm * ER);

      // corpo largo e macio + miolo fino: duas faixas de fluxo em
      // velocidades diferentes (a energia "corre" por dentro do feixe)
      const wobble = 1 + 0.12 * Math.sin(t * 1.7 + b.seed);
      this._beamLayer(b.B, this._flowB, ((t * 55 * b.speed * calm + b.phase * 0.7) % TEX_H), cx, top, b.w * 1.35 * wobble * (1 + surge * 0.2), 0.8 * I);
      this._beamLayer(b.A, this._flowA, ((t * 170 * b.speed * calm + b.phase) % TEX_H), cx, top, b.w * wobble, 1.15 * I);

      // pulsos de energia viajando pelo feixe
      for (const pk of b.packets) {
        if (pk.wait > 0) {
          pk.wait -= dt;
          continue;
        }
        pk.p += pk.v * dt * calm * (1 + surge * 0.6);
        if (pk.p > 1) {
          pk.p = 0;
          pk.wait = rand(0.4, 3.2) / (1 + surge);
          pk.v = rand(150, 240) / b.reach;
          continue;
        }
        const py = toY(b.yBase - pk.p * b.reach * 0.92);
        const fade = Math.sin(Math.PI * pk.p);
        ctx.globalAlpha = Math.min(1, 0.85 * fade * I);
        const pw = 11 * b.w;
        ctx.drawImage(this._packetTex, cx - pw / 2, py, pw, 62 * (0.7 + 0.6 * pk.p));
      }
    }

    // brasas subindo de trás dos prédios
    ctx.fillStyle = '#d8b8ff';
    for (let i = 0; i < this._sparks.length; i++) {
      let sp = this._sparks[i];
      sp.life += dt * calm;
      if (sp.life > sp.max) sp = this._sparks[i] = this._newSpark(false);
      const k = sp.life / sp.max;
      sp.y -= sp.vy * dt * calm;
      const x = sp.x + Math.sin(sp.life * sp.sway + sp.ph) * sp.swayA;
      const a = Math.sin(Math.PI * k) * (0.55 + 0.45 * Math.sin(t * 7 + sp.ph));
      ctx.globalAlpha = Math.max(0, Math.min(1, a * (0.8 + surge * 0.6)));
      const sz = sp.big ? 2.2 : 1.4;
      ctx.fillRect(toX(x), toY(sp.y), sz, sz * 1.5);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this._tex.refresh();
  }

  _beamLayer(layer, flow, offset, cx, top, widthMul, alpha) {
    const { canvas, ctx, grad } = layer;
    const len = canvas.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, TEX_W, len);
    for (let y = -offset; y < len; y += TEX_H) ctx.drawImage(flow, 0, y);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEX_W, len);
    ctx.globalCompositeOperation = 'source-over';

    const main = this._ctx;
    main.globalAlpha = Math.min(1, alpha);
    const w = TEX_W * widthMul * 0.9;
    main.drawImage(canvas, 0, 0, TEX_W, len, cx - w / 2, top, w, len);
  }
}
