// FX do Corte Destrutivo do Minotauro (o golpe mais forte do kit dele).
// Só visual — dano, cone, tremor de câmera e sons ficam no Minotaur.js.
//
// Peças (ver playMinotaurCleave):
//  - arco do machado   -> crescente roxo varrendo o ângulo do corte em volta do boss
//  - ondas de energia  -> o arco do sprite (CorteMino.png, recolorido) corre pelo cone todo
//  - cometas           -> 2 riscos do sprite correndo pelas bordas do cone
//  - impacto           -> clarão + anéis de choque no ponto do golpe
//  - chão destruído    -> mancha escura + rachaduras com energia roxa + chamas roxas
//                         saindo das frestas (frame 3 do sprite)
//  - detritos          -> pedaços de terra e estilhaços de energia arremessados
//  - poeira
// A marca do chão (mancha, rachaduras, entulho) fica ~2s e se desfaz aos poucos,
// começando pelo fim do cone (longe do Minotauro) e voltando até ele.

let KEY = 'minotaur_cleave'; // folha 3 frames 32x72: 0 cometa, 1 arco, 2 chama
const FRAME_W = 32;
const FRAME_H = 72;
const F_COMET = 0;
const F_ARC = 1;
const F_FLAME = 2;
const ARC_FRAME_HEIGHT = 67; // altura real do desenho do arco dentro do frame

const GLOW_KEY = 'mcleave_glow';
const DEBRIS_KEYS = ['mcleave_debris_0', 'mcleave_debris_1', 'mcleave_debris_2'];

let DARK = 0x0b0612;
let DEEP = 0x3a0c6e;
let PURPLE = 0x8a2be2;
let BRIGHT = 0xb56bff;
let PALE = 0xe9c6ff;
const WHITE = 0xffffff;
let DUST = [0x4a3a5c, 0x5d4b72, 0x3a2e4a];

// o chão fica abaixo de tudo (XP 4-5, sombras 8, inimigos 9, gato 10)
const DEPTH_GROUND = 2;
const DEPTH_RUBBLE = 3;
const DEPTH_DUST = 12;
const DEPTH_AIR = 19;
const DEPTH_FLASH = 21;

const WAVE_MS = 280; // quanto leva a frente de destruição pra chegar no fim do cone
const HOLD_MS = 2000; // marca no chão inteira antes de começar a se desfazer
const FADE_MS = 900; // cada pedaço some nesse tempo
const FADE_SPREAD_MS = 1100; // diferença entre o 1º e o último pedaço sumirem

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- carregamento (PreloadScene) ----------

export function loadMinotaurCleaveSheet(scene) {
  scene.load.spritesheet('minotaur_cleave', 'assets/fx/minotaur_cleave.png', {
    frameWidth: FRAME_W,
    frameHeight: FRAME_H
  });
  scene.load.spritesheet('minotaur_cleave_rage', 'assets/fx/minotaur_cleave_rage.png', { frameWidth: FRAME_W, frameHeight: FRAME_H });
}

// chamado no create() da PreloadScene
export function createMinotaurCleaveTextures(scene) {
  if (scene.textures.exists(KEY)) {
    scene.textures.get(KEY).setFilter(Phaser.Textures.FilterMode.NEAREST); // pixel art nítida mesmo esticada
  }
  ensureGlowTexture(scene);
  DEBRIS_KEYS.forEach((key) => ensureDebrisTexture(scene, key));
}

export function hasMinotaurCleaveFx(scene) {
  return scene.textures.exists(KEY) && scene.textures.exists(GLOW_KEY) && scene.textures.exists(DEBRIS_KEYS[0]);
}

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

// pedacinho irregular de chão quebrado (terra escura com quina mais clara)
function ensureDebrisTexture(scene, key) {
  if (scene.textures.exists(key)) return;
  const size = 16;
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  const c = size / 2;
  const n = Phaser.Math.Between(5, 7);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = rand(3.2, 6.6);
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
  }
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = '#2b2233';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#7a62a0';
  ctx.stroke();
  tex.refresh();
}

// ---------- API ----------

// x,y = centro do Minotauro; angle = direção travada do corte; range/half = cone do dano
export function playMinotaurCleave(scene, x, y, angle, range, half) {
  if (!hasMinotaurCleaveFx(scene)) return;
  const t0 = scene.time.now;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const tanHalf = Math.tan(half);
  // ponto a distância d do boss, deslocado lat pro lado (perpendicular ao corte)
  const at = (d, lat = 0) => ({ x: x + dirX * d - dirY * lat, y: y + dirY * d + dirX * lat });
  const latMax = (d) => tanHalf * d;
  const delayFor = (d) => (Math.min(d, range) / range) * WAVE_MS;

  // some um objeto do chão: o fim do cone vai primeiro, a base (perto do boss) por último
  const scheduleFade = (obj, d) => {
    const wait = HOLD_MS + (1 - Math.min(d / range, 1)) * FADE_SPREAD_MS - (scene.time.now - t0);
    scene.time.delayedCall(Math.max(0, wait), () => {
      if (!obj.scene) return;
      scene.tweens.add({
        targets: obj,
        alpha: 0,
        duration: FADE_MS,
        ease: 'Sine.easeIn',
        onComplete: () => obj.destroy()
      });
    });
  };

  // aparece quando a frente de destruição passa por ali
  const revealAt = (obj, d, duration = 90) => {
    obj.setAlpha(0);
    scene.time.delayedCall(delayFor(d), () => {
      if (!obj.scene) return;
      scene.tweens.add({ targets: obj, alpha: 1, duration, ease: 'Quad.easeOut' });
    });
  };

  swingArc(scene, x, y, angle, half);
  energyWaves(scene, x, y, angle, range, half, at);
  impact(scene, at(110));
  const cracks = groundDestruction(scene, x, y, angle, range, half, at, latMax, delayFor, revealAt, scheduleFade);
  flames(scene, cracks, range, delayFor);
  debris(scene, angle, range, at, latMax, delayFor, scheduleFade);
  dust(scene, range, at, latMax, delayFor);
}

// ---------- peças ----------

// crescente de energia varrendo o ângulo do corte em volta do Minotauro (o "traço" do machado)
function swingArc(scene, x, y, angle, half) {
  const g = scene.add.graphics().setDepth(DEPTH_FLASH - 1).setBlendMode(Phaser.BlendModes.ADD);
  const a0 = angle - half * 1.6;
  const a1 = angle + half * 1.6;
  const radius = 118;
  const prog = { t: 0 };
  const layers = [[30, DEEP, 0.5], [18, PURPLE, 0.75], [8, PALE, 0.95], [3, WHITE, 1]];
  scene.tweens.add({
    targets: prog,
    t: 1,
    duration: 120,
    ease: 'Cubic.easeIn',
    onUpdate: () => {
      g.clear();
      const head = a0 + (a1 - a0) * prog.t;
      const tail = Math.max(a0, head - 1.1);
      const segs = 7; // afina em direção à cauda
      for (let s = 0; s < segs; s++) {
        const sa = tail + ((head - tail) * s) / segs;
        const sb = tail + ((head - tail) * (s + 1)) / segs;
        const k = (s + 1) / segs;
        layers.forEach(([w, color, alpha]) => {
          g.lineStyle(Math.max(1, w * k), color, alpha * (0.35 + 0.65 * k));
          g.beginPath();
          g.arc(x, y, radius, sa, sb + 0.01, false);
          g.strokePath();
        });
      }
    },
    onComplete: () => {
      scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
    }
  });
}

// arcos do sprite correndo pelo cone (esticados pra cobrir a largura) + 2 cometas nas bordas
function energyWaves(scene, x, y, angle, range, half, at) {
  for (let k = 0; k < 3; k++) {
    const s = scene.add.image(x, y, KEY, F_ARC).setDepth(DEPTH_FLASH).setRotation(angle).setAlpha(0);
    if (k > 0) s.setBlendMode(Phaser.BlendModes.ADD);
    const state = { d: 70 };
    scene.tweens.add({
      targets: state,
      d: range * 0.98,
      duration: 300 + k * 40,
      delay: k * 45,
      ease: 'Cubic.easeOut',
      onStart: () => s.setAlpha(1),
      onUpdate: () => {
        const p = at(state.d);
        const sy = Math.min((2 * Math.tan(half) * state.d * 1.05) / ARC_FRAME_HEIGHT, 5.5);
        s.setPosition(p.x, p.y);
        s.setScale(Math.max(2.4, sy * 0.6), sy);
        s.setAlpha(Math.max(0, 1 - Math.pow(state.d / range, 1.2) * 0.9));
      },
      onComplete: () => s.destroy()
    });
  }

  [-1, 1].forEach((side) => {
    const edge = angle + side * half * 0.85;
    const s = scene.add.image(x, y, KEY, F_COMET)
      .setDepth(DEPTH_FLASH)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(3)
      .setRotation(edge - 0.55); // a cabeça do cometa aponta ~32° pra baixo-direita no sprite
    const dx = Math.cos(edge);
    const dy = Math.sin(edge);
    const state = { d: 60 };
    scene.tweens.add({
      targets: state,
      d: range,
      duration: 260,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        s.setPosition(x + dx * state.d, y + dy * state.d);
        s.setAlpha(1 - (state.d / range) * 0.8);
      },
      onComplete: () => s.destroy()
    });
  });
}

// o momento do acerto: clarão + 2 anéis de choque achatados no chão
function impact(scene, p) {
  const flash = scene.add.image(p.x, p.y, GLOW_KEY)
    .setDepth(DEPTH_FLASH)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(PALE)
    .setScale(0.6);
  scene.tweens.add({
    targets: flash,
    scale: 3.6,
    alpha: 0,
    duration: 190,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  [0, 70].forEach((delay, i) => {
    const g = scene.add.graphics().setDepth(DEPTH_AIR).setBlendMode(Phaser.BlendModes.ADD);
    const state = { r: 18 };
    scene.tweens.add({
      targets: state,
      r: 190 - i * 40,
      duration: 340,
      delay,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const k = state.r / (190 - i * 40);
        g.clear();
        g.lineStyle(Math.max(1, 9 * (1 - k)), i === 0 ? PALE : BRIGHT, 1 - k);
        g.strokeEllipse(p.x, p.y, state.r * 2, state.r * 1.15);
      },
      onComplete: () => g.destroy()
    });
  });
}

function strokePoly(g, pts, width, color, alpha) {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.strokePath();
}

// mancha de terra revirada + rachaduras serrilhadas com energia roxa por dentro.
// Devolve os pontos principais de cada rachadura (pras chamas nascerem nelas).
function groundDestruction(scene, x, y, angle, range, half, at, latMax, delayFor, revealAt, scheduleFade) {
  // mancha irregular (várias elipses escuras translúcidas sobrepostas)
  for (let i = 0; i < 30; i++) {
    const d = rand(60, range * 0.97);
    const p = at(d, rand(-1, 1) * latMax(d) * 0.9);
    const e = scene.add.ellipse(p.x, p.y, rand(60, 150), rand(40, 100), DARK, 0.16)
      .setDepth(DEPTH_GROUND)
      .setRotation(angle + rand(-0.6, 0.6));
    revealAt(e, d, 120);
    scheduleFade(e, d);
  }

  const cracks = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const base = angle + Phaser.Math.Linear(-half * 0.92, half * 0.92, u) + rand(-0.04, 0.04);
    const d0 = rand(70, 130);
    const len = range * (1 - Math.abs(u - 0.5) * 0.7) * rand(0.8, 1);
    const bx = Math.cos(base);
    const by = Math.sin(base);

    // linha principal serrilhada
    const main = [{ x: x + bx * d0, y: y + by * d0 }];
    let walked = 0;
    while (walked < len) {
      const step = rand(28, 46);
      walked += step;
      const jitter = rand(-10, 10);
      main.push({
        x: x + bx * (d0 + walked) - by * jitter,
        y: y + by * (d0 + walked) + bx * jitter
      });
    }

    // ramificações curtas saindo da principal
    const polys = [{ pts: main, main: true }];
    for (let j = 2; j < main.length; j++) {
      if (Math.random() > 0.35) continue;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dir = base + side * rand(0.5, 1.0);
      const branch = [main[j]];
      const segs = Phaser.Math.Between(2, 3);
      for (let s = 1; s <= segs; s++) {
        const prev = branch[s - 1];
        const stepLen = rand(18, 34);
        const wob = rand(-0.35, 0.35);
        branch.push({ x: prev.x + Math.cos(dir + wob) * stepLen, y: prev.y + Math.sin(dir + wob) * stepLen });
      }
      polys.push({ pts: branch, main: false });
    }

    // camada escura (fica até o fim) e camada de energia (pulsa e apaga antes)
    const dark = scene.add.graphics().setDepth(DEPTH_GROUND);
    const glow = scene.add.graphics().setDepth(DEPTH_GROUND).setBlendMode(Phaser.BlendModes.ADD);
    polys.forEach(({ pts, main: isMain }) => {
      strokePoly(dark, pts, isMain ? 7 : 4, DARK, 0.92);
      strokePoly(glow, pts, isMain ? 5 : 3, PURPLE, 0.8);
      strokePoly(glow, pts, isMain ? 1.8 : 1.1, PALE, 0.95);
    });

    revealAt(dark, d0, 70);
    revealAt(glow, d0, 70);
    scheduleFade(dark, d0);

    // energia pulsando dentro da fenda, apagando bem antes da marca sumir
    scene.time.delayedCall(delayFor(d0) + 120, () => {
      if (!glow.scene) return;
      scene.tweens.add({ targets: glow, alpha: 0.55, duration: 140, yoyo: true, repeat: 5 });
    });
    scene.time.delayedCall(delayFor(d0) + 1000 + rand(0, 500), () => {
      if (!glow.scene) return;
      scene.tweens.killTweensOf(glow);
      scene.tweens.add({
        targets: glow,
        alpha: 0,
        duration: 700,
        onComplete: () => glow.destroy()
      });
    });

    cracks.push({ main, d0 });
  }
  return cracks;
}

// chamas roxas (frame 3 do sprite) estourando das frestas, em pé no chão
function flames(scene, cracks, range, delayFor) {
  cracks.forEach(({ main, d0 }) => {
    const picks = Math.random() < 0.5 ? 2 : 1;
    for (let k = 0; k < picks; k++) {
      const p = main[Phaser.Math.Between(1, main.length - 1)];
      const dist = d0 + k * 120;
      const s = scene.add.image(p.x, p.y, KEY, F_FLAME)
        .setOrigin(0.5, 0.92)
        .setDepth(DEPTH_AIR)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(rand(-0.15, 0.15))
        .setAlpha(0)
        .setScale(rand(2.2, 3.2), 0.3);
      const targetY = rand(2.4, 3.6);
      scene.time.delayedCall(delayFor(dist) + 20, () => {
        if (!s.scene) return;
        s.setAlpha(0.95);
        scene.tweens.add({
          targets: s,
          scaleY: targetY,
          alpha: 0,
          duration: Phaser.Math.Between(340, 460),
          ease: 'Cubic.easeOut',
          onComplete: () => s.destroy()
        });
      });
    }
  });
}

// pedaços de chão e estilhaços de energia arremessados; o entulho fica no chão e some com a marca
function debris(scene, angle, range, at, latMax, delayFor, scheduleFade) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  for (let i = 0; i < 44; i++) {
    const d = Math.min(range, 50 + range * Math.pow(Math.random(), 0.8) * 0.95);
    const lat = rand(-1, 1) * latMax(d) * 0.95;
    const start = at(d, lat);
    const side = lat === 0 ? 1 : Math.sign(lat);
    // jogado pra frente e pro lado de fora do cone
    const throwD = rand(50, 170);
    const dx = dirX * throwD * 0.7 - dirY * side * throwD * 0.5 + rand(-20, 20);
    const dy = dirY * throwD * 0.7 + dirX * side * throwD * 0.5 + rand(-20, 20);
    const height = rand(45, 130);
    const duration = Phaser.Math.Between(480, 820);
    const isEnergy = Math.random() < 0.3;
    const baseScale = rand(0.7, 1.6);

    const img = isEnergy
      ? scene.add.image(start.x, start.y, 'hit_fx').setTint(pick([PURPLE, BRIGHT, PALE])).setBlendMode(Phaser.BlendModes.ADD)
      : scene.add.image(start.x, start.y, pick(DEBRIS_KEYS));
    img.setDepth(DEPTH_AIR).setScale(baseScale).setAlpha(0).setRotation(rand(0, Math.PI * 2));
    const spin = rand(-0.25, 0.25);
    const prog = { t: 0 };

    scene.time.delayedCall(delayFor(d), () => {
      if (!img.scene) return;
      img.setAlpha(1);
      scene.tweens.add({
        targets: prog,
        t: 1,
        duration,
        ease: 'Linear',
        onUpdate: () => {
          const t = prog.t;
          const lift = 4 * height * t * (1 - t); // parábola: sobe e cai
          img.x = start.x + dx * t;
          img.y = start.y + dy * t - lift;
          img.rotation += spin;
          img.setScale(baseScale * (1 + 0.35 * (4 * t * (1 - t))));
        },
        onComplete: () => {
          if (!img.scene) return;
          if (isEnergy) {
            img.destroy();
            return;
          }
          img.setDepth(DEPTH_RUBBLE).setScale(baseScale);
          scheduleFade(img, d);
        }
      });
    });
  }
}

// nuvens escuras de poeira subindo
function dust(scene, range, at, latMax, delayFor) {
  for (let i = 0; i < 18; i++) {
    const d = rand(60, range * 0.95);
    const p = at(d, rand(-1, 1) * latMax(d) * 0.9);
    const s = scene.add.image(p.x, p.y, GLOW_KEY)
      .setDepth(DEPTH_DUST)
      .setTint(pick(DUST))
      .setAlpha(0)
      .setScale(rand(0.5, 0.9));
    scene.time.delayedCall(delayFor(d), () => {
      if (!s.scene) return;
      s.setAlpha(0.4);
      scene.tweens.add({
        targets: s,
        y: s.y - rand(20, 50),
        scale: rand(1.6, 2.4),
        alpha: 0,
        duration: Phaser.Math.Between(700, 1100),
        ease: 'Cubic.easeOut',
        onComplete: () => s.destroy()
      });
    });
  }
}

// Alterna apenas a paleta visual; nenhuma regra de dano muda.
export function setMinotaurCleaveFxRage(enabled) {
  KEY = enabled ? 'minotaur_cleave_rage' : 'minotaur_cleave';
  DARK = enabled ? 0x061b24 : 0x0b0612;
  DEEP = enabled ? 0x07535e : 0x3a0c6e;
  PURPLE = enabled ? 0x16a99f : 0x8a2be2;
  BRIGHT = enabled ? 0x32e9d6 : 0xb56bff;
  PALE = enabled ? 0xbafff1 : 0xe9c6ff;
  DUST = enabled ? [0x27474d,0x37585c,0x263b43] : [0x4a3a5c,0x5d4b72,0x3a2e4a];
  
}
