// FX do Pisão do Minotauro (4ª habilidade — ver Minotaur._resolveStomp).
// Só visual: dano, raio, cooldown e knockback continuam no Minotaur.js.
// `radius` é o raio REAL do dano: a explosão, as ondas e a cratera terminam nele.
//
// Peças (ver playMinotaurStomp):
//  - clarão + explosão   -> sprite roxo (minotaur_stomp.png, 4 frames 32x32) no ponto do pisão
//  - cratera             -> chão afundado: poço escuro com borda levantada, rachaduras e
//                           entulho. Fica ~8s e se desfaz devagar (ver CRATER_HOLD_MS)
//  - rachaduras de energia -> brilho roxo nas frestas da cratera que esfria em ~1.5s
//  - ondas de choque     -> 2 anéis roxos correndo até o raio do dano
//  - poeira              -> nuvem baixa empurrada pra fora + poeira SUBINDO (coluna no centro
//                           e nuvens ao redor)
//  - detritos / faíscas  -> pedaços de chão arremessados em arco + faíscas roxas
//  - câmera              -> tremor pesado
// Extras:
//  - drawMinotaurStompTelegraph -> aviso roxo no chão (anéis convergindo + rachaduras crescendo)
//  - playMinotaurStompLaunch    -> rastro de poeira e estrela de impacto no jogador arremessado

const KEY = 'minotaur_stomp'; // folha 4 frames 32x32: faísca, explosão, anel, anel esvaindo
const FRAME = 32;
const FRAME_COUNT = 4;
const RING_FRAME_DIAMETER = 30; // diâmetro do anel dentro do frame (pra casar com o raio do dano)

const GLOW_KEY = 'mstomp_glow';
const DUST_KEY = 'mstomp_dust';
const DEBRIS_KEYS = ['mstomp_debris_0', 'mstomp_debris_1', 'mstomp_debris_2'];
const CRATER_KEYS = ['mstomp_crater_0', 'mstomp_crater_1'];
const CRACK_KEYS = ['mstomp_crack_0', 'mstomp_crack_1']; // só as frestas brilhando (ADD)
const CRATER_TEX = 144; // grão fino (~2px no jogo), filtro suave: some o aspecto 'pixelão'
const CRATER_SPAN = 1.05; // a textura cobre radius * 1.05 (buraco raso, só some a grama)

const DARK = 0x0b0612;
const DEEP = 0x3a0c6e;
const PURPLE = 0x8a2be2;
const BRIGHT = 0xb56bff;
const PALE = 0xe9c6ff;
const WHITE = 0xffffff;
const DUST = [0x4a3a5c, 0x5d4b72, 0x6e5a88, 0x3a2e4a];
const SPARK = [PALE, BRIGHT, WHITE, PURPLE];

// o chão fica abaixo de tudo (XP 4-5, sombras 8, inimigos 9, gato 10)
const DEPTH_CRATER = 2;
const DEPTH_CRACK_GLOW = 2.1;
const DEPTH_RUBBLE = 3;
const DEPTH_DUST = 12;
const DEPTH_AIR = 19;
const DEPTH_FX = 20;
const DEPTH_FLASH = 21;

const CRATER_HOLD_MS = 8000; // cratera inteira antes de começar a se desfazer
const CRATER_FADE_MS = 2600;
const CRATER_MAX = 6; // várias crateras ao mesmo tempo: a mais velha some rápido

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- carregamento (PreloadScene) ----------

export function loadMinotaurStompSheet(scene) {
  scene.load.spritesheet(KEY, 'assets/fx/minotaur_stomp.png', {
    frameWidth: FRAME,
    frameHeight: FRAME
  });
}

// chamado no create() da PreloadScene
export function createMinotaurStompTextures(scene) {
  if (scene.textures.exists(KEY)) {
    scene.textures.get(KEY).setFilter(Phaser.Textures.FilterMode.NEAREST); // pixel art nítida mesmo esticada
  }
  ensureGlowTexture(scene);
  ensureDustTexture(scene);
  DEBRIS_KEYS.forEach((key) => ensureDebrisTexture(scene, key));
  CRATER_KEYS.forEach((key, i) => ensureCraterTextures(scene, key, CRACK_KEYS[i], 1000 + i * 7919));
}

export function hasMinotaurStompFx(scene) {
  return scene.textures.exists(KEY) &&
    scene.textures.exists(GLOW_KEY) &&
    scene.textures.exists(DUST_KEY) &&
    scene.textures.exists(DEBRIS_KEYS[0]) &&
    scene.textures.exists(CRATER_KEYS[0]) &&
    scene.textures.exists(CRACK_KEYS[0]);
}

// ---------- texturas geradas por código ----------

function ensureGlowTexture(scene) {
  if (scene.textures.exists(GLOW_KEY)) return;
  const size = 128;
  const tex = scene.textures.createCanvas(GLOW_KEY, size, size);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

// Cratera desenhada pixel a pixel num canvas de grão fino (144x144) e esticada com filtro suave:
// textura de terra com ruído, sem degradê vetor liso e sem pixelão.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// terra escura puxada pro roxo (a cratera é de chão, o roxo fica nas rachaduras)
const SOIL = {
  rimLight: 0x8a7590,
  rimMid: 0x66526b,
  rimDark: 0x4a3a50,
  wallLight: 0x5c485c,
  wallMid: 0x4b3a4b,
  wallDark: 0x3d2e3e,
  floor: 0x4a3949,
  floorDeep: 0x3b2c3a,
  crack: 0x1a1020,
  crackEdge: 0x6a5670
};

function pixelBuffer(w, h) {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

function setPx(b, x, y, hex, a = 255) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  b.data[i] = (hex >> 16) & 255;
  b.data[i + 1] = (hex >> 8) & 255;
  b.data[i + 2] = hex & 255;
  b.data[i + 3] = a;
}

function alphaAt(b, x, y) {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.data[(y * b.w + x) * 4 + 3];
}

function flushBuffer(scene, key, b, scale = 1, smooth = true) {
  const tex = scene.textures.createCanvas(key, b.w * scale, b.h * scale);
  const small = document.createElement('canvas');
  small.width = b.w;
  small.height = b.h;
  small.getContext('2d').putImageData(new ImageData(b.data, b.w, b.h), 0, 0);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, b.w * scale, b.h * scale);
  tex.refresh();
  tex.setFilter(smooth ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
}

// gerador pseudo-aleatório com semente
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// nuvem de poeira: disco macio (branco, é tingido na hora)
function ensureDustTexture(scene) {
  if (scene.textures.exists(DUST_KEY)) return;
  const size = 64;
  const tex = scene.textures.createCanvas(DUST_KEY, size, size);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

// pedacinho irregular de chão quebrado (terra escura com quina roxa)
function ensureDebrisTexture(scene, key) {
  if (scene.textures.exists(key)) return;
  const size = 16;
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  const c = size / 2;
  const n = Phaser.Math.Between(5, 7);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = rand(3.2, 6.6);
    const px = c + Math.cos(a) * r;
    const py = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#2b2233';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#9b6fe0';
  ctx.stroke();
  tex.refresh();
}

// rachaduras irregulares em pixels: a cratera e o brilho usam os MESMOS caminhos
function pixelCracks(rng, c, rimR, K) {
  const cracks = [];
  const count = 11;
  const maxR = c - 1.5 * K;
  for (let i = 0; i < count; i++) {
    let a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    let r = rimR * (0.55 + rng() * 0.25);
    const end = Math.min(maxR, rimR + (8 + rng() * 12) * K);
    const pts = [];
    while (r < end) {
      pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
      r += (2 + rng() * 3) * K;
      a += (rng() - 0.5) * 0.5;
    }
    cracks.push(pts);
    if (rng() < 0.55 && pts.length > 3) {
      const [bx, by] = pts[Math.floor(pts.length / 2)];
      let ba = Math.atan2(by - c, bx - c) + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.4);
      const branch = [[bx, by]];
      let px = bx;
      let py = by;
      const steps = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < steps; s++) {
        ba += (rng() - 0.5) * 0.5;
        px += Math.cos(ba) * (2 + rng() * 2.5) * K;
        py += Math.sin(ba) * (2 + rng() * 2.5) * K;
        branch.push([px, py]);
      }
      cracks.push(branch);
    }
  }
  return cracks;
}

// linha de Bresenham: devolve os pixels do caminho
function linePixels(x0, y0, x1, y1, out) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Cratera em pixel art (72x72, vista de cima, luz vindo de cima/esquerda): contorno torto (não é
// círculo), poço escuro, parede interna com 4 tons (sombra em cima/esquerda, luz embaixo/direita),
// borda de terra levantada e esfarelada, halo de terra amassada tracejado, rachaduras de 1px,
// pedras soltas. A textura de brilho tem só as frestas roxas + brasas no fundo (esfriam).
function ensureCraterTextures(scene, baseKey, glowKey, seed) {
  if (scene.textures.exists(baseKey) && scene.textures.exists(glowKey)) return;
  const rng = makeRng(seed);
  const size = CRATER_TEX;
  const c = size / 2;
  const K = size / 72; // as medidas abaixo foram pensadas em 72px
  const Rp = 24 * K; // raio médio do poço
  const base = pixelBuffer(size, size);
  const glow = pixelBuffer(size, size);

  // contorno irregular: lóbulos + ruído suave
  const lobes = [[2, 0.06], [3, 0.05], [5, 0.035]].map(([k, amp]) => [k, amp, rng() * 6.28]);
  const N = 24;
  const noise = Array.from({ length: N }, () => rng() * 2 - 1);
  const radiusAt = (ang) => {
    let r = 1;
    lobes.forEach(([k, amp, ph]) => { r += Math.sin(ang * k + ph) * amp; });
    const t = ((ang + Math.PI) / (Math.PI * 2)) * N;
    r += Phaser.Math.Linear(noise[Math.floor(t) % N], noise[Math.ceil(t) % N], t % 1) * 0.05;
    return r;
  };

  const pitPx = []; // pixels do fundo do poço (pras brasas)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const edge = Rp * radiusAt(ang);
      const u = dist / edge;
      const facing = dist > 0 ? (-dx - dy) / (dist * Math.SQRT2) : 0; // + = lado da luz (cima/esquerda)
      const bz = bayer(x, y);

      if (u < 0.6) {
        setPx(base, x, y, bz < 0.35 + u * 0.4 ? SOIL.floor : SOIL.floorDeep);
        pitPx.push([x, y, u]);
      } else if (u < 1) {
        // parede interna: o lado da luz fica na sombra (parede vira as costas), o oposto pega luz
        const t = (u - 0.6) / 0.4;
        const v = 0.2 + t * 0.3 - facing * 0.38 * t + (bz - 0.5) * 0.22;
        const col = v < 0.2 ? SOIL.floor : v < 0.36 ? SOIL.wallDark : v < 0.52 ? SOIL.wallMid : SOIL.wallLight;
        setPx(base, x, y, col);
      } else {
        const out = dist - edge; // px além do poço
        if (out < 4.6 * K) {
          // borda levantada: clara no lado da luz, escura no oposto, esfarelando por fora
          if (out > 3 * K && bz > 1 - ((4.6 * K - out) / (1.6 * K)) * 0.9) continue;
          const v = 0.5 + facing * 0.5 + (bz - 0.5) * 0.3 - (out / (4.6 * K)) * 0.1;
          setPx(base, x, y, v > 0.62 ? SOIL.rimLight : v > 0.34 ? SOIL.rimMid : SOIL.rimDark);
        } else if (out < 10 * K) {
          // terra amassada: sombra tracejada, mais forte no lado oposto à luz
          const k = (1 - (out - 4.6 * K) / (5.4 * K)) * (0.35 + 0.35 * (1 - facing));
          if (bz < k) setPx(base, x, y, SOIL.floorDeep, 90);
        }
      }
    }
  }

  // rachaduras: escuras no chão (com fio claro no lado da luz), roxas no brilho
  const cracks = pixelCracks(rng, c, Rp, K);
  const crackSet = new Set();
  cracks.forEach((pts) => {
    const px = [];
    for (let i = 1; i < pts.length; i++) linePixels(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], px);
    px.forEach(([x, y]) => crackSet.add(`${x},${y}`));
  });
  Array.from(crackSet).forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    crackSet.add(`${x + 1},${y}`);
  });
  const isCrack = (x, y) => crackSet.has(`${x},${y}`);
  crackSet.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    [[-1, 0], [0, -1], [-1, -1]].forEach(([ox, oy]) => {
      const nx = x + ox;
      const ny = y + oy;
      if (!isCrack(nx, ny) && alphaAt(base, nx, ny) > 0) setPx(base, nx, ny, SOIL.crackEdge, 200);
    });
  });
  crackSet.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    setPx(base, x, y, SOIL.crack);
    setPx(glow, x, y, PALE);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
      if (!isCrack(x + ox, y + oy)) setPx(glow, x + ox, y + oy, PURPLE, 150);
    });
  });
  crackSet.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]].forEach(([ox, oy]) => {
      if (alphaAt(glow, x + ox, y + oy) === 0 && rng() < 0.55) setPx(glow, x + ox, y + oy, DEEP, 120);
    });
  });

  // brasas roxas no fundo do poço (esfriam junto com as frestas)
  pitPx.forEach(([x, y, u]) => {
    const p = (0.6 - u) / 0.6;
    if (rng() < p * 0.42) setPx(glow, x, y, bayer(x, y) < 0.4 ? BRIGHT : PURPLE, 170);
  });

  // pedras soltas ao redor da borda
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2;
    const r = Rp * radiusAt(a) + (5 + rng() * 9) * K;
    const px = Math.round(c + Math.cos(a) * r);
    const py = Math.round(c + Math.sin(a) * r);
    const w = K * (1 + Math.floor(rng() * 2));
    const h = K * (1 + Math.floor(rng() * 2));
    if (px < 2 || py < 2 || px > size - 3 - w || py > size - 3 - h) continue;
    for (let yy = 0; yy <= h; yy++) {
      for (let xx = 0; xx <= w; xx++) {
        const col = xx === 0 || yy === 0 ? SOIL.rimLight : xx === w || yy === h ? SOIL.rimDark : SOIL.rimMid;
        setPx(base, px + xx, py + yy, col);
      }
    }
    if (rng() < 0.3) setPx(base, px, py, 0x9b6fe0);
  }

  flushBuffer(scene, baseKey, base);
  flushBuffer(scene, glowKey, glow);
}

// ---------- peças ----------

// clarão do impacto (curto e aditivo)
function flash(scene, x, y, radius) {
  const f = scene.add.image(x, y, GLOW_KEY)
    .setDepth(DEPTH_FLASH)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(PALE)
    .setScale(((radius * 1.3) / 64) * 0.5)
    .setAlpha(0.95);
  scene.tweens.add({
    targets: f,
    scale: (radius * 1.3) / 64,
    alpha: 0,
    duration: 160,
    ease: 'Cubic.easeOut',
    onComplete: () => f.destroy()
  });
}

// explosão do sprite roxo: 4 frames em ~300ms; o anel (frame 2) chega no raio do dano
function burst(scene, x, y, radius) {
  const scale = (radius * 2 * 1.04) / RING_FRAME_DIAMETER;
  const main = scene.add.image(x, y, KEY, 0).setDepth(DEPTH_FX).setScale(scale * 0.5);
  const add = scene.add.image(x, y, KEY, 0)
    .setDepth(DEPTH_FX)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(scale * 0.5)
    .setAlpha(0.8);
  const prog = { t: 0 };
  scene.tweens.add({
    targets: prog,
    t: FRAME_COUNT - 0.01,
    duration: 320,
    ease: 'Linear',
    onUpdate: () => {
      const f = Math.min(FRAME_COUNT - 1, Math.floor(prog.t));
      const k = prog.t / FRAME_COUNT;
      main.setFrame(f);
      add.setFrame(f);
      const s = scale * (0.5 + 0.5 * Math.min(1, k * 1.8));
      main.setScale(s);
      add.setScale(s * 1.04);
      main.setAlpha(f === FRAME_COUNT - 1 ? 0.7 : 1);
    },
    onComplete: () => {
      scene.tweens.add({
        targets: [main, add],
        alpha: 0,
        duration: 90,
        onComplete: () => { main.destroy(); add.destroy(); }
      });
    }
  });
}

const craters = new WeakMap(); // scene -> [{ base, glow }]

// o chão cede: a cratera nasce um pouco maior e "assenta"; fica por um bom tempo e se desfaz devagar
function crater(scene, x, y, radius) {
  const i = Math.floor(Math.random() * CRATER_KEYS.length);
  const finalScale = (radius * CRATER_SPAN * 2) / CRATER_TEX;

  const base = scene.add.image(x, y, CRATER_KEYS[i])
    .setDepth(DEPTH_CRATER)
    .setScale(finalScale * 1.22)
    .setAlpha(0);
  scene.tweens.add({
    targets: base,
    scale: finalScale,
    alpha: 1,
    duration: 110,
    ease: 'Cubic.easeIn'
  });

  // frestas com energia roxa esfriando (~2.7s)
  const glow = scene.add.image(x, y, CRACK_KEYS[i])
    .setDepth(DEPTH_CRACK_GLOW)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(finalScale * 1.22)
    .setAlpha(0);
  scene.tweens.add({
    targets: glow,
    scale: finalScale,
    alpha: 1,
    duration: 90,
    ease: 'Cubic.easeIn'
  });
  scene.tweens.add({
    targets: glow,
    alpha: 0,
    delay: 500,
    duration: 2200,
    ease: 'Sine.easeIn',
    onComplete: () => glow.destroy()
  });

  // limite de crateras vivas: a mais antiga some rápido
  let list = craters.get(scene);
  if (!list) { list = []; craters.set(scene, list); }
  const entry = { base };
  list.push(entry);
  while (list.length > CRATER_MAX) {
    const old = list.shift();
    if (old.base?.scene) {
      scene.tweens.killTweensOf(old.base);
      scene.tweens.add({ targets: old.base, alpha: 0, duration: 500, onComplete: () => old.base.destroy() });
    }
  }

  scene.tweens.add({
    targets: base,
    alpha: 0,
    scale: finalScale * 0.97,
    delay: CRATER_HOLD_MS,
    duration: CRATER_FADE_MS,
    ease: 'Sine.easeIn',
    onComplete: () => {
      const l = craters.get(scene);
      if (l) {
        const idx = l.indexOf(entry);
        if (idx >= 0) l.splice(idx, 1);
      }
      base.destroy();
    }
  });
}

// anéis de choque roxos que correm até o raio do dano
function shockRings(scene, x, y, radius) {
  [0, 90].forEach((delay, i) => {
    const ring = scene.add.graphics().setDepth(DEPTH_DUST);
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 360 + i * 60,
      delay,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue();
        const r = radius * (0.2 + 0.8 * t) * (i === 0 ? 1 : 0.82);
        const fade = Math.pow(1 - t, 1.3) * (i === 0 ? 1 : 0.7);
        ring.clear();
        ring.lineStyle(10 * (1 - t) + 2, DEEP, 0.5 * fade);
        ring.strokeCircle(x, y, r);
        ring.lineStyle(3, BRIGHT, 0.85 * fade);
        ring.strokeCircle(x, y, r);
        ring.lineStyle(1, PALE, 0.9 * fade);
        ring.strokeCircle(x, y, r);
      },
      onComplete: () => ring.destroy()
    });
  });
}

// poeira: nuvem baixa empurrada pra fora + poeira SUBINDO (coluna no centro e nuvens ao redor)
function dust(scene, x, y, radius, q) {
  const puffScale = radius / 110;

  // nuvem baixa empurrada pela onda
  const low = Math.max(1, Math.round(Phaser.Math.Between(16, 20) * q));
  for (let i = 0; i < low; i++) {
    const a = (Math.PI * 2 * i) / low + rand(-0.15, 0.15);
    const start = radius * rand(0.15, 0.3);
    const end = radius * rand(0.85, 1.1);
    const puff = scene.add.image(x + Math.cos(a) * start, y + Math.sin(a) * start, DUST_KEY)
      .setDepth(DEPTH_DUST)
      .setTint(pick(DUST))
      .setScale(rand(0.3, 0.45) * puffScale)
      .setAlpha(0.6);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(a) * end,
      y: y + Math.sin(a) * end,
      scale: rand(0.7, 1.05) * puffScale,
      duration: Phaser.Math.Between(340, 460),
      ease: 'Cubic.easeOut'
    });
    scene.tweens.add({
      targets: puff,
      alpha: 0,
      delay: 140,
      duration: Phaser.Math.Between(300, 420),
      ease: 'Quad.easeIn',
      onComplete: () => puff.destroy()
    });
  }

  // poeira subindo ao redor (do anel do impacto pra cima)
  const rising = Math.max(2, Math.round(20 * q));
  for (let i = 0; i < rising; i++) {
    const a = rand(0, Math.PI * 2);
    const r = radius * rand(0.2, 0.95);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.8;
    const puff = scene.add.image(px, py, DUST_KEY)
      .setDepth(DEPTH_DUST)
      .setTint(pick(DUST))
      .setScale(rand(0.22, 0.34) * puffScale)
      .setAlpha(0);
    const delay = rand(0, 140);
    scene.tweens.add({
      targets: puff,
      alpha: 0.62,
      delay,
      duration: 100,
      onComplete: () => {
        if (!puff.scene) return;
        scene.tweens.add({
          targets: puff,
          alpha: 0,
          duration: Phaser.Math.Between(700, 1100),
          ease: 'Quad.easeIn'
        });
      }
    });
    scene.tweens.add({
      targets: puff,
      x: px + rand(-26, 26),
      y: py - rand(70, 170) * Math.max(0.7, puffScale),
      scale: rand(0.9, 1.5) * puffScale,
      delay,
      duration: Phaser.Math.Between(950, 1400),
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy()
    });
  }

  // coluna de poeira no ponto exato do pisão
  const column = Math.max(3, Math.round(8 * q));
  for (let i = 0; i < column; i++) {
    const puff = scene.add.image(x + rand(-10, 10), y + rand(-6, 6), DUST_KEY)
      .setDepth(DEPTH_DUST + 1)
      .setTint(pick(DUST))
      .setScale(rand(0.5, 0.7) * puffScale)
      .setAlpha(0);
    const delay = i * 40;
    scene.tweens.add({
      targets: puff,
      alpha: 0.55,
      delay,
      duration: 90,
      onComplete: () => {
        if (!puff.scene) return;
        scene.tweens.add({ targets: puff, alpha: 0, duration: 900, ease: 'Quad.easeIn' });
      }
    });
    scene.tweens.add({
      targets: puff,
      x: x + rand(-18, 18),
      y: y - (50 + i * 24) * Math.max(0.75, puffScale),
      scale: rand(1.2, 2) * puffScale,
      delay,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy()
    });
  }
}

// pedaços de chão arremessados em arco; os que pousam ficam um tempo no chão e somem
function debris(scene, x, y, radius, q) {
  const count = Math.max(4, Math.round(16 * q));
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + rand(-0.25, 0.25);
    const dist = radius * rand(0.5, 1.25);
    const tx = x + Math.cos(a) * dist;
    const ty = y + Math.sin(a) * dist;
    const h = rand(50, 120);
    const piece = scene.add.image(x, y, pick(DEBRIS_KEYS))
      .setDepth(DEPTH_AIR)
      .setScale(rand(0.9, 1.9));
    const spin = rand(-9, 9);
    const prog = { t: 0 };
    scene.tweens.add({
      targets: prog,
      t: 1,
      duration: Phaser.Math.Between(520, 780),
      ease: 'Quad.easeOut',
      onUpdate: () => {
        piece.x = x + (tx - x) * prog.t;
        piece.y = y + (ty - y) * prog.t - Math.sin(prog.t * Math.PI) * h;
        piece.rotation = spin * prog.t;
      },
      onComplete: () => {
        piece.setDepth(DEPTH_RUBBLE);
        scene.tweens.add({
          targets: piece,
          alpha: 0,
          delay: rand(1800, 3200),
          duration: 700,
          onComplete: () => piece.destroy()
        });
      }
    });
  }
}

// faíscas de energia roxa disparadas pra fora: rápidas e pequenas
function sparks(scene, x, y, radius, q) {
  const count = Math.max(4, Math.round(30 * q));
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + rand(-0.2, 0.2);
    const start = radius * rand(0.1, 0.3);
    const end = radius * rand(0.7, 1.2);
    const size = Phaser.Math.Between(2, 5);
    const p = scene.add.rectangle(x + Math.cos(a) * start, y + Math.sin(a) * start, size, size, pick(SPARK))
      .setDepth(DEPTH_FX)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.95);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * end,
      y: y + Math.sin(a) * end - rand(4, 16),
      alpha: 0,
      scale: 0.4,
      duration: Phaser.Math.Between(300, 520),
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy()
    });
  }
}

// ---------- API ----------

// Toca o Pisão inteiro em (x, y). Devolve false se o FX não está carregado
// (aí o Minotaur usa o visual antigo). `opts` (multiplayer): q = fator de partículas, shake = fator do tremor.
export function playMinotaurStomp(scene, x, y, radius, { q = 1, shake = 1 } = {}) {
  if (!hasMinotaurStompFx(scene)) return false;
  flash(scene, x, y, radius);
  burst(scene, x, y, radius);
  crater(scene, x, y, radius);
  shockRings(scene, x, y, radius);
  dust(scene, x, y, radius, q);
  debris(scene, x, y, radius, q);
  sparks(scene, x, y, radius, q);
  if (shake > 0) scene.cameras.main.shake(320, 0.028 * shake);
  return true;
}

// Aviso no chão enquanto o Minotauro levanta o pé: disco roxo pulsando, anel externo
// convergindo pro raio do dano e rachaduras crescendo do centro. `radius` = raio atual do
// aviso (cresce até o raio do dano), `fullRadius` = raio real do dano.
const TELEGRAPH_CRACK_ANGLES = Array.from({ length: 9 }, (_, i) => (i / 9) * Math.PI * 2 + ((i * 37) % 11) * 0.03);

export function drawMinotaurStompTelegraph(g, x, y, radius, fullRadius, progress, fillAlpha) {
  g.fillStyle(PURPLE, fillAlpha);
  g.fillCircle(x, y, radius);
  g.fillStyle(DARK, fillAlpha * 0.5);
  g.fillCircle(x, y, radius * 0.55 * progress);
  g.lineStyle(3, BRIGHT, Math.min(fillAlpha + 0.4, 1));
  g.strokeCircle(x, y, radius);
  // anel externo fecha em cima do raio real conforme o pisão se aproxima
  const outer = fullRadius * (1 + 0.28 * (1 - progress));
  g.lineStyle(2, PALE, 0.35 + 0.5 * progress);
  g.strokeCircle(x, y, outer);
  // rachaduras nascendo do centro
  TELEGRAPH_CRACK_ANGLES.forEach((a, i) => {
    const len = radius * (0.25 + 0.7 * progress) * (0.8 + 0.2 * ((i % 3) / 2));
    const mx = x + Math.cos(a + 0.12) * len * 0.55;
    const my = y + Math.sin(a + 0.12) * len * 0.55;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    g.lineStyle(4, DARK, 0.8);
    g.lineBetween(x, y, mx, my);
    g.lineBetween(mx, my, ex, ey);
    g.lineStyle(1.5, BRIGHT, 0.5 + 0.5 * progress);
    g.lineBetween(x, y, mx, my);
    g.lineBetween(mx, my, ex, ey);
  });
}

// Jogador arremessado pelo pisão: estrela de impacto no corpo, rastro de poeira durante o
// voo e poeira de pouso no fim. (dirX, dirY) = direção do arremesso, durationMs = duração do knockback.
export function playMinotaurStompLaunch(scene, target, dirX, dirY, durationMs = 300) {
  if (!hasMinotaurStompFx(scene) || !target?.active) return;

  const star = scene.add.image(target.x, target.y, KEY, 1)
    .setDepth(DEPTH_FX)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(2.6)
    .setRotation(Math.atan2(dirY, dirX));
  scene.tweens.add({
    targets: star,
    scale: 4.2,
    alpha: 0,
    duration: 200,
    ease: 'Cubic.easeOut',
    onComplete: () => star.destroy()
  });

  const trailEvery = 35;
  const reps = Math.max(1, Math.floor(durationMs / trailEvery));
  scene.time.addEvent({
    delay: trailEvery,
    repeat: reps - 1,
    callback: () => {
      if (!target.active) return;
      const puff = scene.add.image(target.x, target.y, DUST_KEY)
        .setDepth(DEPTH_DUST)
        .setTint(pick(DUST))
        .setScale(rand(0.35, 0.5))
        .setAlpha(0.6);
      scene.tweens.add({
        targets: puff,
        x: puff.x - dirX * rand(6, 18) + rand(-8, 8),
        y: puff.y - dirY * rand(6, 18) - rand(8, 22),
        scale: rand(0.8, 1.2),
        alpha: 0,
        duration: Phaser.Math.Between(320, 460),
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy()
      });
      const sp = scene.add.rectangle(target.x, target.y, 3, 3, pick(SPARK))
        .setDepth(DEPTH_FX)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: sp,
        x: sp.x - dirX * rand(10, 30) + rand(-10, 10),
        y: sp.y - dirY * rand(10, 30) + rand(-10, 10),
        alpha: 0,
        duration: 260,
        onComplete: () => sp.destroy()
      });
    }
  });

  // pouso: nuvem de poeira onde ele para
  scene.time.delayedCall(durationMs, () => {
    if (!target.active) return;
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7 + rand(-0.3, 0.3);
      const puff = scene.add.image(target.x, target.y, DUST_KEY)
        .setDepth(DEPTH_DUST)
        .setTint(pick(DUST))
        .setScale(rand(0.4, 0.6))
        .setAlpha(0.55);
      scene.tweens.add({
        targets: puff,
        x: puff.x + Math.cos(a) * rand(22, 44),
        y: puff.y + Math.sin(a) * rand(14, 30) - rand(6, 18),
        scale: rand(0.9, 1.3),
        alpha: 0,
        duration: Phaser.Math.Between(380, 560),
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy()
      });
    }
  });
}