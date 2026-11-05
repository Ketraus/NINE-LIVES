// FX do Corte Destrutivo do Minotauro (o golpe mais forte do kit dele).
// Só visual — dano, cone, tremor de câmera e sons ficam no Minotaur.js.
//
// Peças (ver playMinotaurCleave):
//  - arco do machado   -> crescente roxo varrendo o ângulo do corte em volta do boss
//  - FRENTE DE CORTE   -> lâmina de energia nítida (fio branco, corpo em crescente, esteira serrilhada)
//                         que nasce quando o machado cruza o centro do golpe e avança pelo cone;
//                         perto do fim ela vai se quebrando em pedaços e soltando estilhaços
//  - ondas de energia  -> o arco do sprite (CorteMino.png, recolorido) segue ATRÁS da frente, como esteira elétrica
//  - cometas           -> 2 riscos do sprite correndo pelas bordas do cone
//  - impacto           -> clarão + anéis de choque no ponto do golpe
//  - chão destruído    -> mancha escura + rachaduras que CRESCEM atrás da lâmina (ponta em brasa,
//                         energia roxa por dentro) + chamas roxas saindo das frestas (frame 3 do sprite)
//  - detritos          -> pedaços de terra e estilhaços de energia arremessados
//  - poeira
// A marca do chão (mancha, rachaduras, entulho) fica ~2s e se desfaz aos poucos,
// começando pelo fim do cone (longe do Minotauro) e voltando até ele.

import SettingsManager from '../systems/SettingsManager.js';

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
const SWING_MS = 100; // varredura do machado em volta do boss
const FRONT_DELAY_MS = 75; // a frente nasce quando a lâmina cruza o centro do golpe (~79% da varredura)
// A frente, a fenda, as rachaduras, os blocos e as brasas usam a MESMA curva (Cubic.easeOut) pra
// aparecerem exatamente onde a lâmina acabou de passar. frontInv = tempo em que a frente chega em k.
const frontEase = (t) => 1 - Math.pow(1 - t, 3);
const frontInv = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 1 / 3);
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

// ---------- extras do golpe mais brutal do Minotauro ----------
const reduced = () => !!SettingsManager.getReducedFlashes?.();
const isMobile = (scene) => !!scene.sys.game.device.input.touch;
const cnt = (scene, n) => Math.max(2, Math.round(n * (isMobile(scene) ? 0.55 : 1)));
const hardShake = (scene, ms, intensity) => scene.cameras.main.shake(ms, intensity, true);

// HITSTOP: o mundo (física) congela por um instante no momento do corte; os efeitos continuam.
function hitStop(scene, ms) {
  const world = scene.physics?.world;
  if (!world || world.isPaused || scene.isPaused) return;
  world.pause();
  scene.time.delayedCall(ms, () => { if (world && !scene.isPaused) world.resume(); });
}

// SOCO DE CÂMERA: zoom rápido pra dentro + empurrão na direção do corte, depois volta suave.
function camPunch(scene, angle) {
  const cam = scene.cameras.main;
  if (scene._cleavePunch) return;
  scene._cleavePunch = true;
  const base = cam.zoom;
  const off0 = { x: cam.followOffset?.x || 0, y: cam.followOffset?.y || 0 };
  const kick = reduced() ? 14 : 34;
  const kx = -Math.cos(angle) * kick;
  const ky = -Math.sin(angle) * kick;
  const st = { k: 0 };
  const apply = () => {
    cam.setZoom(base * (1 + 0.085 * st.k));
    cam.setFollowOffset(off0.x + kx * st.k, off0.y + ky * st.k);
  };
  const done = () => { cam.setZoom(base); cam.setFollowOffset(off0.x, off0.y); scene._cleavePunch = false; };
  scene.tweens.add({
    targets: st, k: 1, duration: 55, ease: 'Cubic.easeOut', onUpdate: apply,
    onComplete: () => scene.tweens.add({ targets: st, k: 0, duration: 520, ease: 'Cubic.easeOut', onUpdate: apply, onComplete: done })
  });
}

function polyFill(g, pts, color, alpha) {
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
}

// blocos GRANDES de chão arremessados bem alto, com sombra no chão e poeira ao cair
function bigChunks(scene, angle, range, at, delayFor, scheduleFade) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const n = cnt(scene, 9);
  for (let i = 0; i < n; i++) {
    const d = rand(100, range * 0.85);
    const start = at(d, rand(-1, 1) * 46);
    const side = Math.random() < 0.5 ? -1 : 1;
    const throwD = rand(110, 250);
    const ex = start.x + dirX * throwD * 0.55 - dirY * side * throwD * 0.6;
    const ey = start.y + dirY * throwD * 0.55 + dirX * side * throwD * 0.6;
    const height = rand(100, 220);
    const duration = Phaser.Math.Between(700, 1100);
    const sc = rand(1.0, 1.9);
    const img = scene.add.image(start.x, start.y, pick(DEBRIS_KEYS)).setDepth(DEPTH_AIR).setScale(sc).setAlpha(0)
      .setRotation(rand(0, 6.28)).setTint(0xb9a6d0);
    const shadow = scene.add.ellipse(start.x, start.y, 30 * sc * 0.5, 14 * sc * 0.5, 0x000000, 0.4).setDepth(DEPTH_GROUND + 1).setAlpha(0);
    const spin = rand(-0.18, 0.18);
    const prog = { t: 0 };
    scene.time.delayedCall(delayFor(d), () => {
      if (!img.scene) return;
      img.setAlpha(1); shadow.setAlpha(0.4);
      scene.tweens.add({
        targets: prog, t: 1, duration, ease: 'Linear',
        onUpdate: () => {
          const t = prog.t;
          const lift = 4 * height * t * (1 - t);
          const gx = start.x + (ex - start.x) * t;
          const gy = start.y + (ey - start.y) * t;
          img.x = gx; img.y = gy - lift; img.rotation += spin;
          shadow.setPosition(gx, gy + 4).setScale(1 - 0.55 * (lift / height));
        },
        onComplete: () => {
          shadow.destroy();
          if (!img.scene) return;
          for (let k = 0; k < 3; k++) {
            const puff = scene.add.image(img.x + rand(-10, 10), img.y, GLOW_KEY).setDepth(DEPTH_DUST).setTint(pick(DUST)).setScale(rand(0.3, 0.5)).setAlpha(0.45);
            scene.tweens.add({ targets: puff, y: puff.y - rand(14, 40), scale: rand(1.1, 1.8), alpha: 0, duration: rand(450, 750), ease: 'Cubic.easeOut', onComplete: () => puff.destroy() });
          }
          img.setDepth(DEPTH_RUBBLE).setTint(0xffffff).setScale(sc * 0.85);
          scheduleFade(img, d);
        }
      });
    });
  }
}

// onda de poeira rasteira saindo do Minotauro em todas as direções + anel grosso no chão
function dustRing(scene, x, y) {
  const n = cnt(scene, 26);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + rand(-0.12, 0.12);
    const far = rand(280, 440);
    const puff = scene.add.image(x + Math.cos(a) * 40, y + Math.sin(a) * 26, GLOW_KEY).setDepth(DEPTH_DUST)
      .setTint(pick(DUST)).setScale(rand(0.5, 0.9)).setAlpha(0.55);
    scene.tweens.add({ targets: puff, x: x + Math.cos(a) * far, y: y + Math.sin(a) * far * 0.62, scale: rand(1.6, 2.6), alpha: 0, duration: rand(460, 720), ease: 'Cubic.easeOut', onComplete: () => puff.destroy() });
  }
  const g = scene.add.graphics().setDepth(DEPTH_DUST);
  const st = { r: 30 };
  scene.tweens.add({
    targets: st, r: 420, duration: 520, ease: 'Cubic.easeOut',
    onUpdate: () => {
      const k = st.r / 420;
      g.clear();
      g.lineStyle(Math.max(2, 22 * (1 - k)), DUST[1], 0.55 * (1 - k));
      g.strokeEllipse(x, y + 8, st.r * 2, st.r * 1.2);
    },
    onComplete: () => g.destroy()
  });
}

// clarão no próprio Minotauro (a origem do golpe)
function bossBurst(scene, x, y) {
  const mk = (tint, from, to, dur, alpha, depth) => {
    const g = scene.add.image(x, y, GLOW_KEY).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(from).setAlpha(reduced() ? alpha * 0.6 : alpha);
    scene.tweens.add({ targets: g, scale: to, alpha: 0, duration: dur, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  };
  mk(WHITE, 1, 6, 150, 1, DEPTH_FLASH + 3);
  mk(PURPLE, 2, 11, 380, 0.7, DEPTH_FLASH - 1);
}

// brasas de energia subindo pelo cone inteiro, esfriando devagar
function emberField(scene, at, latMax, range, delayFor) {
  const n = cnt(scene, 32);
  for (let i = 0; i < n; i++) {
    const d = rand(80, range * 0.97);
    const p = at(d, rand(-1, 1) * latMax(d) * 0.9);
    const e = scene.add.rectangle(p.x, p.y, rand(2, 4.5), rand(2, 4.5), i % 3 ? PURPLE : PALE, 0)
      .setDepth(DEPTH_AIR + 1).setBlendMode(Phaser.BlendModes.ADD);
    scene.time.delayedCall(delayFor(d), () => {
      if (!e.scene) return;
      e.setAlpha(0.95);
      scene.tweens.add({
        targets: e, x: e.x + rand(-26, 26), y: e.y - rand(80, 220), alpha: 0, scale: 0.3,
        duration: rand(900, 1700), ease: 'Quad.easeOut', onComplete: () => e.destroy()
      });
    });
  }
}

// CARGA (telegraph + pausa): energia SUGADA pra dentro do Minotauro. Fagulhas com rastro entram em
// espiral, cada vez mais rápidas; pedras do chão levantam e são puxadas; uma esfera escura cresce
// no peito dele, com borda luminosa e um poço de gravidade no chão. Tudo some sozinho se o estado
// sair de cleave_*.
export function playMinotaurCleaveBuildup(scene, boss, durationMs, rage = false) {
  if (!scene?.sys?.isActive() || !boss) return;
  setMinotaurCleaveFxRage(rage);
  ensureGlowTexture(scene);
  const C = { purple: PURPLE, bright: BRIGHT, pale: PALE, dark: DARK, deep: DEEP };
  const mobile = isMobile(scene);
  const MAX = mobile ? 22 : 46;
  const ROCKS = mobile ? 5 : 10;
  const well = scene.add.graphics().setDepth(3);
  const coreG = scene.add.graphics().setDepth(8.85);
  const fx = scene.add.graphics().setDepth(8.95).setBlendMode(Phaser.BlendModes.ADD);
  const halo = scene.add.image(boss.x, boss.y, GLOW_KEY).setDepth(8.8).setTint(C.purple)
    .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  const parts = [];
  const rocks = [];
  const state = { last: scene.time.now, rumble: 0, pulse: 0 };
  const cleanup = () => {
    well.destroy(); coreG.destroy(); fx.destroy(); halo.destroy();
    rocks.forEach((r) => r.obj.destroy());
    rocks.length = 0; parts.length = 0;
  };
  const newPart = () => {
    const r0 = rand(190, 400);
    return { a: rand(0, Math.PI * 2), r: r0, r0, w: (Math.random() < 0.5 ? -1 : 1) * rand(0.9, 1.5),
      v: rand(0.7, 1.15), size: rand(1.5, 3.1), col: [C.pale, C.bright, C.purple][Math.floor(Math.random() * 3)], trail: [] };
  };
  const newRock = () => {
    const r0 = rand(90, 240);
    const obj = scene.add.rectangle(boss.x, boss.y, rand(4, 9), rand(3, 7), 0x2b2233, 1)
      .setDepth(8.9).setStrokeStyle(1, C.bright, 0.9);
    return { obj, a: rand(0, Math.PI * 2), r: r0, r0, spin: rand(-6, 6) };
  };

  scene.tweens.addCounter({
    from: 0, to: 1, duration: Math.max(200, durationMs), ease: 'Linear',
    onUpdate: (tw) => {
      if (!boss.active || !halo.scene || !['cleave_telegraph', 'cleave_pause'].includes(boss.bossState)) {
        tw.stop(); if (halo.scene) cleanup(); return;
      }
      const now = scene.time.now;
      const dt = Math.min(0.05, (now - state.last) / 1000);
      state.last = now;
      const p = tw.getValue();
      const urgent = boss.bossState === 'cleave_pause';
      const speedUp = (urgent ? 1.9 : 1) * (0.75 + 0.6 * p);
      const cx = boss.x;
      const cy = boss.y - (boss.displayHeight || 60) * 0.08;
      const gy = boss.y + (boss.displayHeight || 60) * 0.4;

      // poço de gravidade no chão
      well.clear();
      const wr = Phaser.Math.Linear(60, 175, p);
      well.fillStyle(C.dark, 0.16 + 0.22 * p);
      well.fillEllipse(cx, gy, wr * 2, wr * 1.1);
      well.lineStyle(2 + 2 * p, C.purple, 0.25 + 0.4 * p);
      well.strokeEllipse(cx, gy, wr * 2, wr * 1.1);

      // fagulhas em espiral com rastro
      const target = Math.floor(MAX * (0.25 + 0.75 * p));
      for (let k = 0; k < 2 && parts.length < target; k++) parts.push(newPart());
      fx.clear();
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        const f = 1 - q.r / q.r0;
        q.r -= (55 + 540 * f * f) * q.v * speedUp * dt;
        q.a += q.w * (1.2 + 6 * f) * dt;
        const px = cx + Math.cos(q.a) * q.r;
        const py = cy + Math.sin(q.a) * q.r * 0.62;
        q.trail.push(px, py);
        if (q.trail.length > 14) q.trail.splice(0, 2);
        if (q.r < 16) { state.pulse = 1; parts.splice(i, 1); continue; }
        if (q.trail.length >= 4) {
          [[q.size * 2.6, 0.22, C.purple], [q.size * 1.1, 0.85, q.col]].forEach(([w, al, col]) => {
            fx.lineStyle(w, col, al * (0.4 + 0.6 * f));
            fx.beginPath(); fx.moveTo(q.trail[0], q.trail[1]);
            for (let t = 2; t < q.trail.length; t += 2) fx.lineTo(q.trail[t], q.trail[t + 1]);
            fx.strokePath();
          });
        }
        fx.fillStyle(C.pale, 0.95);
        fx.fillCircle(px, py, q.size * (0.8 + f));
      }

      // pedras do chão sendo levantadas e puxadas
      if (p > 0.12) while (rocks.length < Math.floor(ROCKS * Math.min(1, p * 1.6))) rocks.push(newRock());
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        const f = 1 - r.r / r.r0;
        r.r -= (40 + 260 * f * f) * speedUp * dt;
        r.a += (0.8 + 4 * f) * dt;
        const lift = Math.pow(f, 0.8) * 52;
        r.obj.setPosition(cx + Math.cos(r.a) * r.r, gy + Math.sin(r.a) * r.r * 0.62 - lift);
        r.obj.rotation += r.spin * dt;
        r.obj.setAlpha(Math.min(1, 1.2 - f * 0.4));
        if (r.r < 20) {
          r.obj.destroy(); rocks.splice(i, 1);
        }
      }

      // esfera escura no peito + halo
      state.pulse = Math.max(0, state.pulse - dt * 4);
      const rc = Phaser.Math.Linear(5, 36, p) + state.pulse * 5 + (urgent ? 3 : 0);
      const jx = p > 0.8 ? rand(-2, 2) : 0;
      const jy = p > 0.8 ? rand(-2, 2) : 0;
      coreG.clear();
      coreG.fillStyle(0x05020a, 0.97);
      coreG.fillCircle(cx + jx, cy + jy, rc);
      coreG.lineStyle(3, C.bright, 0.9);
      coreG.strokeCircle(cx + jx, cy + jy, rc + 1);
      coreG.lineStyle(1.5, C.pale, 0.9);
      coreG.strokeCircle(cx + jx, cy + jy, rc + 4 + 2 * Math.sin(now / 55));
      const beat = 0.5 + 0.5 * Math.sin(now / Phaser.Math.Linear(170, 50, p));
      halo.setPosition(cx, cy).setTint(urgent && beat > 0.5 ? C.pale : C.purple)
        .setScale(Phaser.Math.Linear(0.9, 2.4, p) * (1 + 0.1 * beat))
        .setAlpha((0.1 + 0.38 * p) * (0.7 + 0.3 * beat) * (reduced() ? 0.6 : 1));

      if (p > 0.55 && now >= state.rumble) {
        state.rumble = now + 140;
        scene.cameras.main.shake(130, 0.0012 + 0.0022 * p);
      }
    },
    onComplete: () => { if (halo.scene) cleanup(); }
  });
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
  const delayFor = (d) => FRONT_DELAY_MS + frontInv(Math.min(d, range) / range) * WAVE_MS;

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

  // o momento do corte: congela o mundo, soca a câmera e abre uma fenda no chão
  hitStop(scene, 120);
  camPunch(scene, angle);
  bossBurst(scene, x, y);
  swingArc(scene, x, y, angle, half);
  cutFront(scene, x, y, angle, range, half);
  energyWaves(scene, x, y, angle, range, half, at);
  impact(scene, at(110));
  dustRing(scene, x, y);
  // tremor forçado bem mais pesado + réplicas (sobrepõe o tremor base do Minotaur.js)
  hardShake(scene, 820, 0.058);
  scene.time.delayedCall(260, () => { if (scene.sys?.isActive()) hardShake(scene, 520, 0.03); });
  scene.time.delayedCall(640, () => { if (scene.sys?.isActive()) hardShake(scene, 320, 0.014); });
  const cracks = groundDestruction(scene, x, y, angle, range, half, at, latMax, delayFor, revealAt, scheduleFade);
  flames(scene, cracks, range, delayFor);
  debris(scene, angle, range, at, latMax, delayFor, scheduleFade);
  bigChunks(scene, angle, range, at, delayFor, scheduleFade);
  dust(scene, range, at, latMax, delayFor);
  emberField(scene, at, latMax, range, delayFor);
}

// ---------- peças ----------

// crescente de energia varrendo o ângulo do corte em volta do Minotauro (o "traço" do machado)
function swingArc(scene, x, y, angle, half, arcRadius = 118, startDelay = 0) {
  const g = scene.add.graphics().setDepth(DEPTH_FLASH - 1).setBlendMode(Phaser.BlendModes.ADD);
  const a0 = angle - half * 1.6;
  const a1 = angle + half * 1.6;
  const radius = arcRadius;
  const prog = { t: 0 };
  const layers = [[30, DEEP, 0.5], [18, PURPLE, 0.75], [8, PALE, 0.95], [3, WHITE, 1]];
  scene.tweens.add({
    targets: prog,
    t: 1,
    duration: SWING_MS,
    delay: startDelay,
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
      // ponta dura da lâmina: fio branco radial na cabeça do arco (é onde o machado está)
      g.lineStyle(5, WHITE, 1);
      g.beginPath();
      g.moveTo(x + Math.cos(head) * (radius - 34), y + Math.sin(head) * (radius - 34));
      g.lineTo(x + Math.cos(head) * (radius + 30), y + Math.sin(head) * (radius + 30));
      g.strokePath();
    },
    onComplete: () => {
      scene.tweens.add({ targets: g, alpha: 0, duration: 130, onComplete: () => g.destroy() });
    }
  });
}

// arcos do sprite correndo pelo cone, agora como ESTEIRA elétrica atrás da frente de corte
// (mais estreitos e apagando antes do fim) + 2 cometas nas bordas
function energyWaves(scene, x, y, angle, range, half, at) {
  for (let k = 0; k < 2; k++) {
    const s = scene.add.image(x, y, KEY, F_ARC).setDepth(DEPTH_FLASH).setRotation(angle).setAlpha(0);
    if (k > 0) s.setBlendMode(Phaser.BlendModes.ADD);
    const peak = k === 0 ? 0.7 : 0.4;
    const state = { d: 62 };
    scene.tweens.add({
      targets: state,
      d: range * 0.98,
      duration: WAVE_MS,
      delay: FRONT_DELAY_MS + 22 + k * 34, // sempre atrás da lâmina
      ease: 'Cubic.easeOut',
      onStart: () => s.setAlpha(peak),
      onUpdate: () => {
        const p = at(state.d);
        const sy = Math.min((2 * Math.tan(half) * state.d * 0.55) / ARC_FRAME_HEIGHT, 3.4);
        s.setPosition(p.x, p.y);
        s.setScale(Math.max(1.3, sy * 0.4), sy);
        s.setAlpha(peak * Math.max(0, 1 - Math.pow(state.d / range, 1.4) * 1.05));
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
      .setAlpha(0)
      .setRotation(edge - 0.55); // a cabeça do cometa aponta ~32° pra baixo-direita no sprite
    const dx = Math.cos(edge);
    const dy = Math.sin(edge);
    const state = { d: 60 };
    scene.tweens.add({
      targets: state,
      d: range,
      duration: WAVE_MS,
      delay: FRONT_DELAY_MS - 10,
      ease: 'Cubic.easeOut',
      onStart: () => s.setAlpha(1),
      onUpdate: () => {
        s.setPosition(x + dx * state.d, y + dy * state.d);
        s.setAlpha(1 - (state.d / range) * 0.8);
      },
      onComplete: () => s.destroy()
    });
  });
}

// FRENTE DE CORTE: a lâmina de energia que o machado deixa pra trás. Em vez de uma barra reta
// (efeito de laser), é um crescente com fio branco duro na frente — o centro vai à frente e as
// pontas ficam pra trás, como o gume de um machado entrando no chão — e uma esteira serrilhada.
// Perto do fim a lâmina se parte em pedaços (cada vez mais pedaços somem) e solta estilhaços de
// energia que escorrem pelas bordas, o que alimenta visualmente as rachaduras que já estão ali.
// Um único Graphics redesenhado por frame, pontos pré-alocados e ruído fixo por golpe.
function cutFront(scene, x, y, angle, range, half) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const nX = -dirY;
  const nY = dirX;
  const tanHalf = Math.tan(half);
  const N = isMobile(scene) ? 9 : 13;
  const mk = () => Array.from({ length: N + 1 }, () => ({ x: 0, y: 0 }));
  const F = mk(); // fio (borda de ataque)
  const B = mk(); // fundo do corpo
  const M = mk(); // miolo claro
  const W = mk(); // ponta da esteira
  const quad = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  const jag = [];
  const gone = [];
  for (let i = 0; i <= N; i++) { jag.push(rand(-1, 1)); gone.push(Math.random()); }

  const g = scene.add.graphics().setDepth(DEPTH_FLASH + 1).setBlendMode(Phaser.BlendModes.ADD);
  const fillQuad = (A, Bq, i, color, alpha) => {
    quad[0].x = A[i].x; quad[0].y = A[i].y;
    quad[1].x = A[i + 1].x; quad[1].y = A[i + 1].y;
    quad[2].x = Bq[i + 1].x; quad[2].y = Bq[i + 1].y;
    quad[3].x = Bq[i].x; quad[3].y = Bq[i].y;
    g.fillStyle(color, alpha);
    g.fillPoints(quad, true);
  };
  // posição da lâmina quando a frente está em d (progresso k)
  const place = (d, k, big) => {
    const w = Math.max(16, tanHalf * d * 0.96);
    const tmax = Phaser.Math.Linear(40, 13, k);
    for (let i = 0; i <= N; i++) {
      const u = -1 + (2 * i) / N;
      const lag = w * 0.5 * u * u + jag[i] * 5 * k; // pontas ficam atrás: formato de crescente
      const fx = x + dirX * (d - lag) + nX * u * w;
      const fy = y + dirY * (d - lag) + nY * u * w;
      const th = tmax * Math.pow(Math.max(0, 1 - u * u), 0.6) + 2;
      F[i].x = fx; F[i].y = fy;
      if (!big) continue;
      B[i].x = fx - dirX * th; B[i].y = fy - dirY * th;
      M[i].x = fx - dirX * th * 0.42; M[i].y = fy - dirY * th * 0.42;
      const tail = th * 2.6 + 34 * (1 - k * 0.45) + jag[(i + 3) % (N + 1)] * 9; // esteira serrilhada
      W[i].x = fx - dirX * tail; W[i].y = fy - dirY * tail;
    }
  };

  const st = { t: 0 };
  scene.tweens.add({
    targets: st,
    t: 1,
    duration: WAVE_MS,
    delay: FRONT_DELAY_MS,
    ease: 'Linear',
    onUpdate: () => {
      const k = frontEase(st.t);
      const d = Math.max(42, range * k);
      const broken = Phaser.Math.Clamp((k - 0.62) / 0.36, 0, 1); // fração da lâmina que já se partiu
      place(d, k, true);
      g.clear();
      const fade = 1 - 0.55 * broken;
      // esteira (escura/fria), some em pedaços
      for (let i = 0; i < N; i++) {
        if (gone[i] < broken * 0.8) continue;
        fillQuad(F, W, i, DEEP, 0.5 * fade);
      }
      // corpo + miolo, e o fio branco por cima
      for (let i = 0; i < N; i++) {
        if (gone[i] < broken) continue; // pedaço já se desfez
        fillQuad(F, B, i, PURPLE, 0.9 * fade);
        fillQuad(F, M, i, PALE, 0.95 * fade);
        g.lineStyle(7, BRIGHT, 0.45 * fade);
        g.beginPath(); g.moveTo(F[i].x, F[i].y); g.lineTo(F[i + 1].x, F[i + 1].y); g.strokePath();
        g.lineStyle(3, WHITE, fade);
        g.beginPath(); g.moveTo(F[i].x, F[i].y); g.lineTo(F[i + 1].x, F[i + 1].y); g.strokePath();
      }
    },
    onComplete: () => {
      g.destroy();
      // última centelha onde a lâmina morre
      const e = scene.add.image(x + dirX * range * 0.96, y + dirY * range * 0.96, GLOW_KEY)
        .setDepth(DEPTH_FLASH).setBlendMode(Phaser.BlendModes.ADD).setTint(PALE).setScale(0.6).setAlpha(reduced() ? 0.5 : 0.85);
      scene.tweens.add({ targets: e, scale: 2.6, alpha: 0, duration: 200, ease: 'Cubic.easeOut', onComplete: () => e.destroy() });
    }
  });

  // estilhaços que se soltam do fio, escorrendo pra trás e pros lados (energia virando fragmento)
  const n = cnt(scene, 12);
  for (let i = 0; i < n; i++) {
    const k = rand(0.12, 0.95);
    const d = Math.max(42, range * k);
    const w = Math.max(16, tanHalf * d * 0.96);
    const u = rand(-1, 1);
    const bx = x + dirX * (d - w * 0.5 * u * u) + nX * u * w;
    const by = y + dirY * (d - w * 0.5 * u * u) + nY * u * w;
    const side = u === 0 ? 1 : Math.sign(u);
    const vx = -dirX * 0.55 + nX * side * 0.85;
    const vy = -dirY * 0.55 + nY * side * 0.85;
    const dist = rand(45, 130);
    const rot = Math.atan2(vy, vx);
    scene.time.delayedCall(FRONT_DELAY_MS + frontInv(k) * WAVE_MS, () => {
      if (!scene.sys?.isActive()) return;
      const sh = scene.add.image(bx, by, 'hit_fx').setDepth(DEPTH_FLASH + 1).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(i % 3 ? BRIGHT : PALE).setScale(rand(0.5, 0.9)).setRotation(rot);
      scene.tweens.add({
        targets: sh, x: bx + vx * dist, y: by + vy * dist - rand(4, 16), alpha: 0, scale: 0.1,
        duration: Phaser.Math.Between(240, 400), ease: 'Cubic.easeOut', onComplete: () => sh.destroy()
      });
    });
  }
}

// o momento do acerto: clarão + 2 anéis de choque achatados no chão
function impact(scene, p) {
  const flash = scene.add.image(p.x, p.y, GLOW_KEY)
    .setDepth(DEPTH_FLASH)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(PALE)
    .setScale(0.8);
  scene.tweens.add({
    targets: flash,
    scale: 7,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });
  const core = scene.add.image(p.x, p.y, GLOW_KEY).setDepth(DEPTH_FLASH + 2)
    .setBlendMode(Phaser.BlendModes.ADD).setTint(WHITE).setScale(0.5).setAlpha(reduced() ? 0.6 : 1);
  scene.tweens.add({ targets: core, scale: 3.4, alpha: 0, duration: 140, ease: 'Cubic.easeOut', onComplete: () => core.destroy() });

  [0, 70, 140].forEach((delay, i) => {
    const g = scene.add.graphics().setDepth(DEPTH_AIR).setBlendMode(Phaser.BlendModes.ADD);
    const state = { r: 18 };
    scene.tweens.add({
      targets: state,
      r: 260 - i * 50,
      duration: 420,
      delay,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const k = state.r / (260 - i * 50);
        g.clear();
        g.lineStyle(Math.max(1, 14 * (1 - k)), i === 0 ? PALE : BRIGHT, 1 - k);
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

// mancha de terra revirada + rachaduras que CRESCEM acompanhando a lâmina (a ponta de cada uma fica
// branca, em brasa, e esfria pra roxo logo atrás). Nenhuma rachadura nasce no eixo central: elas
// saem em leque, tortas, mais curtas no meio e longas nas bordas, pra não formar uma linha reta.
// Devolve os pontos principais de cada rachadura (pras chamas nascerem nelas).
function groundDestruction(scene, x, y, angle, range, half, at, latMax, delayFor, revealAt, scheduleFade) {
  // mancha irregular (várias elipses escuras translúcidas sobrepostas)
  for (let i = 0; i < 26; i++) {
    const d = rand(60, range * 0.97);
    const p = at(d, rand(-1, 1) * latMax(d) * 0.9);
    const e = scene.add.ellipse(p.x, p.y, rand(46, 110), rand(32, 76), DARK, 0.16)
      .setDepth(DEPTH_GROUND)
      .setRotation(angle + rand(-0.6, 0.6));
    revealAt(e, d, 120);
    scheduleFade(e, d);
  }

  const withDist = (pt) => { pt.d = Math.hypot(pt.x - x, pt.y - y); return pt; };
  const cracks = [];
  const count = isMobile(scene) ? 8 : 11;
  for (let i = 0; i < count; i++) {
    let sv = (i / (count - 1)) * 2 - 1; // -1..1 dentro do cone
    if (Math.abs(sv) < 0.18) sv = (i % 2 ? 1 : -1) * rand(0.18, 0.3); // nada no eixo central
    const base = angle + sv * half * 0.94 + rand(-0.05, 0.05);
    const d0 = rand(60, 120);
    const len = range * (0.5 + 0.5 * Math.pow(Math.abs(sv), 0.6)) * rand(0.8, 1);
    const bx = Math.cos(base);
    const by = Math.sin(base);

    // linha principal serrilhada, vagando de lado (torta)
    const main = [withDist({ x: x + bx * d0, y: y + by * d0 })];
    let walked = 0;
    let drift = 0;
    while (walked < len) {
      walked += rand(22, 38);
      drift = Phaser.Math.Clamp(drift + rand(-10, 10), -24, 24);
      main.push(withDist({ x: x + bx * (d0 + walked) - by * drift, y: y + by * (d0 + walked) + bx * drift }));
    }

    // ramificações saindo da principal (mais que antes, curtas e agudas)
    const polys = [{ pts: main, main: true }];
    for (let j = 2; j < main.length; j++) {
      if (Math.random() > 0.5) continue;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dir = base + side * rand(0.45, 1.0);
      const branch = [main[j]];
      const segs = Phaser.Math.Between(2, 4);
      for (let k = 1; k <= segs; k++) {
        const prev = branch[k - 1];
        const stepLen = rand(14, 30);
        const wob = rand(-0.4, 0.4);
        branch.push(withDist({ x: prev.x + Math.cos(dir + wob) * stepLen, y: prev.y + Math.sin(dir + wob) * stepLen }));
      }
      polys.push({ pts: branch, main: false });
    }

    // camada escura (fica até o fim) e camada de energia (pulsa e apaga antes)
    const dark = scene.add.graphics().setDepth(DEPTH_GROUND);
    const glow = scene.add.graphics().setDepth(DEPTH_GROUND).setBlendMode(Phaser.BlendModes.ADD);
    scheduleFade(dark, d0);
    cracks.push({ main, d0, polys, dark, glow, shown: -1 });
  }

  // trecho da polilinha que a frente já alcançou (interpola o último pedaço)
  const visible = (pts, fd) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].d <= fd) { out.push(pts[i]); continue; }
      if (i > 0 && pts[i - 1].d <= fd) {
        const t = (fd - pts[i - 1].d) / Math.max(1, pts[i].d - pts[i - 1].d);
        out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t });
      }
      break;
    }
    return out;
  };
  const drawCrack = (c, fd, growing) => {
    c.dark.clear(); c.glow.clear();
    c.polys.forEach(({ pts, main: isMain }) => {
      const v = visible(pts, fd);
      if (v.length < 2) return;
      strokePoly(c.dark, v, isMain ? 7 : 4, DARK, 0.92);
      strokePoly(c.glow, v, isMain ? 5 : 3, PURPLE, 0.8);
      strokePoly(c.glow, v, isMain ? 1.8 : 1.1, PALE, 0.95);
      if (growing) strokePoly(c.glow, v.slice(-2), isMain ? 4 : 2.5, WHITE, 1); // ponta em brasa
    });
  };

  const st = { t: 0 };
  scene.tweens.add({
    targets: st, t: 1, duration: WAVE_MS, delay: FRONT_DELAY_MS, ease: 'Linear',
    onUpdate: () => {
      const fd = range * frontEase(st.t);
      cracks.forEach((c) => { if (c.d0 <= fd) drawCrack(c, fd, true); });
    },
    onComplete: () => {
      cracks.forEach((c) => {
        drawCrack(c, Infinity, false);
        const { glow } = c;
        // energia pulsando dentro da fenda, apagando bem antes da marca sumir
        scene.tweens.add({ targets: glow, alpha: 0.55, duration: 140, yoyo: true, repeat: 5 });
        scene.time.delayedCall(880 + rand(0, 500), () => {
          if (!glow.scene) return;
          scene.tweens.killTweensOf(glow);
          scene.tweens.add({ targets: glow, alpha: 0, duration: 700, onComplete: () => glow.destroy() });
        });
      });
    }
  });
  return cracks;
}

// chamas roxas (frame 3 do sprite) estourando das frestas, em pé no chão
function flames(scene, cracks, range, delayFor) {
  cracks.forEach(({ main, d0 }) => {
    const picks = Math.random() < 0.3 ? 2 : 1;
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
  for (let i = 0; i < cnt(scene, 46); i++) {
    const d = Math.min(range, 50 + range * Math.pow(Math.random(), 0.8) * 0.95);
    const lat = rand(-1, 1) * latMax(d) * 0.95;
    const start = at(d, lat);
    const side = lat === 0 ? 1 : Math.sign(lat);
    // jogado pra frente e pro lado de fora do cone
    const throwD = rand(60, 230);
    const dx = dirX * throwD * 0.7 - dirY * side * throwD * 0.5 + rand(-20, 20);
    const dy = dirY * throwD * 0.7 + dirX * side * throwD * 0.5 + rand(-20, 20);
    const height = rand(60, 190);
    const duration = Phaser.Math.Between(480, 820);
    const isEnergy = Math.random() < 0.18;
    const baseScale = rand(0.4, 0.95);

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
  for (let i = 0; i < cnt(scene, 28); i++) {
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
