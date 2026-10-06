// FX da evolução "Terremoto" (Pancada Sísmica evoluída). Três atos, só visual
// — não mexe em dano, raio, cooldown nem knockback:
//
//   1) IMPACTO CENTRAL (playQuakeImpact, no instante do dano)
//      o chão COMPRIME (anel converge + disco afunda), clarão duplo e
//      fragmentos de pedra explodem radialmente, fagulhas e poeira.
//   2) ONDAS SÍSMICAS (playQuakeWaves, junto da onda de choque)
//      3 ondas concêntricas escalonadas; rachaduras correm pra fora junto
//      com a primeira e pedaços do chão saltam por onde cada onda passa.
//   3) CLÍMAX (playQuakeClimax, logo depois das ondas)
//      a arena inteira treme: soco de zoom + balanço da câmera + ondulações
//      que passam da tela, e um SEGUNDO impacto no centro.
//
// Usa as texturas geradas pelo SlamFx (slam_dent / slam_dust).

const DENT_KEY = 'slam_dent';
const DUST_KEY = 'slam_dust';
const DENT_SIZE = 128;

// chão abaixo de tudo (XP 4-5, sombras 8, inimigos 9, gato 10); poeira logo
// acima dos personagens; fragmentos/clarão por cima
const DEPTH_DENT = 2;
const DEPTH_CRACK = 2.2;
const DEPTH_LANDED = 3;
const DEPTH_DUST = 11;
const DEPTH_SHARD = 20;
const DEPTH_FLASH = 21;

// quanto tempo depois do início das ondas o clímax acontece (ms)
export const QUAKE_CLIMAX_DELAY_MS = 420;

const STONE = [0x3f3b36, 0x54504a, 0x6e675d, 0x857e72, 0x9c958a];
const DUST = [0xd9d4ca, 0xc4bfb4, 0xaaa59b];
const SPARK = [0xffffff, 0xece8de, 0xd2cdc2];
const CRACK_DARK = 0x0e0b09;
const CRACK_RIM = 0xb8b0a2;

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function hasQuakeFx(scene) {
  return scene.textures.exists(DENT_KEY) && scene.textures.exists(DUST_KEY);
}

// ------------------------------------------------------------- helpers
function flash(scene, x, y, radius, power = 1) {
  const scale = (radius * 1.25) / 64;
  const big = scene.add
    .image(x, y, DUST_KEY)
    .setDepth(DEPTH_FLASH)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xfff6e6)
    .setScale(scale * 0.45)
    .setAlpha(0.95 * power);
  scene.tweens.add({
    targets: big,
    scale,
    alpha: 0,
    duration: 150,
    ease: 'Cubic.easeOut',
    onComplete: () => big.destroy()
  });
  // núcleo branco pequeno e seco: o "estalo"
  const core = scene.add
    .image(x, y, DUST_KEY)
    .setDepth(DEPTH_FLASH)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xffffff)
    .setScale(scale * 0.25)
    .setAlpha(1);
  scene.tweens.add({
    targets: core,
    scale: scale * 0.55,
    alpha: 0,
    duration: 90,
    ease: 'Quad.easeOut',
    onComplete: () => core.destroy()
  });
}

// o chão afunda: nasce maior e escuro e assenta no raio; some devagar
function dent(scene, x, y, radius, alpha = 1, holdMs = 380) {
  const finalScale = (radius * 2) / DENT_SIZE;
  const d = scene.add
    .image(x, y, DENT_KEY)
    .setDepth(DEPTH_DENT)
    .setScale(finalScale * 1.25)
    .setAlpha(0);
  scene.tweens.add({
    targets: d,
    scale: finalScale,
    alpha,
    duration: 80,
    ease: 'Cubic.easeIn'
  });
  scene.tweens.add({
    targets: d,
    alpha: 0,
    delay: holdMs,
    duration: 650,
    ease: 'Quad.easeIn',
    onComplete: () => d.destroy()
  });
}

// anel que CONVERGE pro centro (a compressão antes do estouro)
function compressionRing(scene, x, y, radius) {
  const g = scene.add.graphics().setDepth(DEPTH_DUST);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 90,
    ease: 'Cubic.easeIn',
    onUpdate: (tw) => {
      const t = tw.getValue();
      g.clear();
      g.lineStyle(3 + 3 * t, 0xffffff, 0.2 + 0.5 * t);
      g.strokeCircle(x, y, radius * (1.15 - 0.7 * t));
    },
    onComplete: () => g.destroy()
  });
}

function poly(scene, x, y, size, color) {
  const n = Phaser.Math.Between(5, 7);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const r = size * rand(0.55, 1);
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75 });
  }
  const p = scene.add.polygon(x, y, pts, color).setStrokeStyle(1, 0x15110d);
  return p;
}

// pedaço de chão arremessado em arco (altura simulada no Y). Pousa, vira
// detrito no chão por um instante e some.
function chunk(scene, sx, sy, ex, ey, size, peak, flightMs) {
  const c = poly(scene, sx, sy, size, pick(STONE)).setDepth(DEPTH_SHARD);
  const spin = rand(-6, 6);
  scene.tweens.add({
    targets: c,
    duration: flightMs,
    ease: 'Linear',
    onUpdate: (tw) => {
      const p = tw.progress;
      const e = 1 - Math.pow(1 - p, 2.2);
      c.setPosition(sx + (ex - sx) * e, sy + (ey - sy) * e - 4 * peak * p * (1 - p));
      c.setRotation(spin * p);
    },
    onComplete: () => {
      if (!c.active) return;
      c.setPosition(ex, ey).setDepth(DEPTH_LANDED);
      scene.tweens.add({
        targets: c,
        alpha: 0,
        delay: Phaser.Math.Between(350, 800),
        duration: 400,
        onComplete: () => c.destroy()
      });
    }
  });
}

function burstChunks(scene, x, y, radius, count, scale = 1) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sd = radius * rand(0.05, 0.3);
    const ed = radius * rand(0.45, 1.15);
    chunk(
      scene,
      x + Math.cos(a) * sd,
      y + Math.sin(a) * sd,
      x + Math.cos(a) * ed,
      y + Math.sin(a) * ed * 0.9,
      Phaser.Math.Between(3, 8) * scale,
      rand(18, 46) * scale,
      Phaser.Math.Between(420, 640)
    );
  }
}

function sparks(scene, x, y, radius, count) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + rand(-0.2, 0.2);
    const size = Phaser.Math.Between(2, 4);
    const p = scene.add
      .rectangle(x + Math.cos(a) * radius * 0.1, y + Math.sin(a) * radius * 0.1, size, size, pick(SPARK))
      .setDepth(DEPTH_SHARD)
      .setAlpha(0.95);
    const end = radius * rand(0.7, 1.2);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * end,
      y: y + Math.sin(a) * end - rand(2, 10),
      alpha: 0,
      scale: 0.4,
      duration: Phaser.Math.Between(260, 440),
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy()
    });
  }
}

function dustBurst(scene, x, y, radius, count, strength = 1) {
  const puffScale = radius / 110;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + rand(-0.15, 0.15);
    const start = radius * rand(0.15, 0.35);
    const end = radius * rand(0.8, 1.05);
    const puff = scene.add
      .image(x + Math.cos(a) * start, y + Math.sin(a) * start, DUST_KEY)
      .setDepth(DEPTH_DUST)
      .setTint(pick(DUST))
      .setScale(rand(0.3, 0.45) * puffScale)
      .setAlpha(0.55 * strength);
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
      delay: 130,
      duration: Phaser.Math.Between(280, 400),
      ease: 'Quad.easeIn',
      onComplete: () => puff.destroy()
    });
  }
}

// polilinha "rachada": desvio lateral que zera nas pontas
function crackPath(x1, y1, x2, y2, segments, jitter) {
  const pts = [{ x: x1, y: y1 }];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = rand(-1, 1) * jitter * Math.sin(Math.PI * t);
    pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

function strokePartial(g, pts, t, width, color, alpha, ox = 0, oy = 0) {
  if (t <= 0) return;
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  let remaining = total * t;
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x + ox, pts[0].y + oy);
  for (let i = 1; i < pts.length && remaining > 0; i++) {
    const l = lens[i - 1];
    const k = Math.min(1, remaining / l);
    g.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k + ox, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k + oy);
    remaining -= l;
  }
  g.strokePath();
}

// ----------------------------------------------------- 1) impacto central
export function playQuakeImpact(scene, x, y, radius) {
  flash(scene, x, y, radius, 1);
  compressionRing(scene, x, y, radius);
  dent(scene, x, y, radius, 1, 420);
  burstChunks(scene, x, y, radius, 38);
  sparks(scene, x, y, radius, 30);
  dustBurst(scene, x, y, radius, 22);
  scene.cameras.main.shake(190, 0.011);
}

// ------------------------------------------------------- 2) ondas sísmicas
const WAVE_COUNT = 3;
const WAVE_STAGGER_MS = 110;
const WAVE_MS = 400;

function crackField(scene, x, y, radius) {
  const g = scene.add.graphics().setDepth(DEPTH_CRACK);
  const base = rand(0, Math.PI * 2);
  const count = Phaser.Math.Between(9, 11);
  const fissures = [];
  for (let i = 0; i < count; i++) {
    const a = base + (Math.PI * 2 * i) / count + rand(-0.2, 0.2);
    const r0 = radius * rand(0.05, 0.18);
    const r1 = radius * rand(0.65, 1.0);
    const pts = crackPath(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, 9, radius * 0.06);
    const forks = [];
    const forkCount = Phaser.Math.Between(1, 2);
    for (let f = 0; f < forkCount; f++) {
      const from = pts[Phaser.Math.Between(3, pts.length - 3)];
      const fa = a + rand(0.5, 0.95) * (Math.random() < 0.5 ? -1 : 1);
      const fl = (r1 - r0) * rand(0.2, 0.38);
      forks.push(crackPath(from.x, from.y, from.x + Math.cos(fa) * fl, from.y + Math.sin(fa) * fl, 3, radius * 0.025));
    }
    fissures.push({ pts, forks });
  }
  const draw = (t) => {
    g.clear();
    fissures.forEach(({ pts, forks }) => {
      strokePartial(g, pts, t, 3.4, CRACK_RIM, 0.4, 1, 1);
      strokePartial(g, pts, t, 2.6, CRACK_DARK, 0.95);
      forks.forEach((f) => strokePartial(g, f, Math.max(0, (t - 0.35) / 0.65), 1.8, CRACK_DARK, 0.85));
    });
  };
  draw(0);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 260,
    ease: 'Cubic.easeOut',
    onUpdate: (tw) => draw(tw.getValue())
  });
  scene.tweens.add({
    targets: g,
    alpha: 0,
    delay: 700,
    duration: 600,
    ease: 'Quad.easeIn',
    onComplete: () => g.destroy()
  });
}

function seismicWave(scene, x, y, radius, reach, strength) {
  const g = scene.add.graphics().setDepth(DEPTH_DUST);
  const maxR = radius * reach;
  let popped = 0;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: WAVE_MS,
    ease: 'Cubic.easeOut',
    onUpdate: (tw) => {
      const t = tw.getValue();
      const r = maxR * (0.12 + 0.88 * t);
      const fade = Math.pow(1 - t, 1.2) * strength;
      g.clear();
      g.lineStyle(14 * (1 - t) + 3, 0xaaa59b, 0.28 * fade); // faixa de poeira
      g.strokeCircle(x, y, r);
      g.lineStyle(2.5, 0xffffff, 0.7 * fade); // frente
      g.strokeCircle(x, y, r);
      // pedaços do chão saltando por onde a frente passa
      const want = Math.floor(t * 14);
      for (; popped < want; popped++) {
        const a = rand(0, Math.PI * 2);
        const sx = x + Math.cos(a) * r;
        const sy = y + Math.sin(a) * r * 0.95;
        const push = rand(10, 34);
        chunk(
          scene,
          sx,
          sy,
          sx + Math.cos(a) * push,
          sy + Math.sin(a) * push,
          Phaser.Math.Between(2, 6),
          rand(10, 28),
          Phaser.Math.Between(300, 460)
        );
      }
    },
    onComplete: () => g.destroy()
  });
}

export function playQuakeWaves(scene, x, y, radius) {
  crackField(scene, x, y, radius);
  dent(scene, x, y, radius * 0.55, 0.8, 300);
  for (let i = 0; i < WAVE_COUNT; i++) {
    const reach = [0.7, 0.86, 1][i];
    const strength = [1, 0.85, 0.7][i];
    scene.time.delayedCall(i * WAVE_STAGGER_MS, () => seismicWave(scene, x, y, radius, reach, strength));
  }
  dustBurst(scene, x, y, radius, 24, 0.8);
  scene.cameras.main.shake(240, 0.009);
}

// ---------------------------------------------------------------- 3) clímax
// o mundo inteiro dá um tranco: zoom + balanço, restaurados exatos no fim
function arenaJolt(scene) {
  const cam = scene.cameras.main;
  if (cam._quakeJolt) return;
  cam._quakeJolt = true;
  const baseZoom = cam.zoom;
  const baseRot = cam.rotation;
  const restore = () => {
    cam.setZoom(baseZoom);
    cam.setRotation(baseRot);
    cam._quakeJolt = false;
  };
  scene.tweens.add({
    targets: cam,
    zoom: baseZoom * 1.06,
    duration: 70,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: cam,
        zoom: baseZoom,
        duration: 300,
        ease: 'Cubic.easeOut'
      });
    }
  });
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 420,
    onUpdate: (tw) => {
      const t = tw.getValue();
      cam.setRotation(baseRot + Math.sin(t * Math.PI * 5) * 0.012 * (1 - t));
    },
    onComplete: restore
  });
}

// ondulações que atravessam a tela inteira: a arena "balança"
function arenaRipples(scene, x, y) {
  const cam = scene.cameras.main;
  const view = Math.hypot(cam.width, cam.height) / (cam.zoom || 1);
  for (let i = 0; i < 2; i++) {
    const g = scene.add.graphics().setDepth(DEPTH_DUST);
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 480,
      delay: i * 90,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue();
        const r = 40 + view * 0.62 * t;
        const fade = Math.pow(1 - t, 1.4) * (i === 0 ? 1 : 0.7);
        g.clear();
        g.lineStyle(18 * (1 - t) + 3, 0xffffff, 0.12 * fade);
        g.strokeCircle(x, y, r);
        g.lineStyle(2, 0xece8de, 0.5 * fade);
        g.strokeCircle(x, y, r);
      },
      onComplete: () => g.destroy()
    });
  }
}

export function playQuakeClimax(scene, x, y, radius) {
  arenaJolt(scene);
  arenaRipples(scene, x, y);
  // segundo impacto no centro
  flash(scene, x, y, radius * 0.8, 1);
  compressionRing(scene, x, y, radius * 0.6);
  dent(scene, x, y, radius * 0.7, 1, 300);
  burstChunks(scene, x, y, radius * 0.7, 24, 1.15);
  sparks(scene, x, y, radius * 0.7, 20);
  dustBurst(scene, x, y, radius * 0.9, 18, 1);
  scene.cameras.main.shake(300, 0.015);
}
