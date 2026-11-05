// FX do impacto dos meteoros da 2ª fase do Minotauro.
// A ideia aqui é vender que houve um impacto PESADO no chão:
// cratera escurecida, borda estourada, rachaduras quentes e um estouro curto
// pra não poluir a visão do jogador.

import SettingsManager from '../systems/SettingsManager.js';

const CRATER_DARK = 0x10181c;
const CRATER_MID = 0x1c2b31;
const CRATER_RIM = 0x27363d;
const HOT_CORE = 0x185760;
const AQUA = 0x29cbbd;
const AQUA_LIGHT = 0xbafff1;

function makeIrregularBlobPoints(x, y, rx, ry, points, jitter, rotation = 0) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = rotation + (i / points) * Math.PI * 2;
    const mul = 1 + Phaser.Math.FloatBetween(-jitter, jitter);
    pts.push({
      x: x + Math.cos(a) * rx * mul,
      y: y + Math.sin(a) * ry * mul
    });
  }
  return pts;
}

function fillBlob(g, pts, color, alpha) {
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
}

function makeCrackPoints(x, y, angle, length) {
  const pts = [];
  const segments = 4;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const r = length * t;
    const wobble = Phaser.Math.FloatBetween(-0.17, 0.17);
    pts.push([
      x + Math.cos(angle + wobble) * r,
      y + Math.sin(angle + wobble) * r * 0.78
    ]);
  }
  return pts;
}

function strokeCrack(g, pts, darkColor, hotColor, alpha = 1) {
  g.lineStyle(5, darkColor, 0.96 * alpha);
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.strokePath();
  g.lineStyle(2, hotColor, 0.78 * alpha);
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.strokePath();
}

// ---------- chuva de meteoros: peças compartilhadas ----------
const GLOW = 'mmeteor_glow';
const sceneState = new WeakMap(); // scene -> { nextAmbient, ambientLive, sparksLive }
const isMobile = (scene) => !!scene.sys.game.device.input.touch;
const reduced = () => !!SettingsManager.getReducedFlashes?.();
const R = (a, b) => Phaser.Math.FloatBetween(a, b);

function stateOf(scene) {
  let st = sceneState.get(scene);
  if (!st) {
    st = { nextAmbient: 0, ambientLive: 0, sparksLive: 0 };
    sceneState.set(scene, st);
    scene.events.once('shutdown', () => sceneState.delete(scene));
  }
  return st;
}

function ensureGlow(scene) {
  if (scene.textures.exists(GLOW)) return;
  const tex = scene.textures.createCanvas(GLOW, 128, 128);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  tex.refresh();
}

function glowFlash(scene, x, y, tint, fromD, toD, duration, alpha, depth = 18) {
  ensureGlow(scene);
  const g = scene.add.image(x, y, GLOW).setDepth(depth).setTint(tint)
    .setBlendMode(Phaser.BlendModes.ADD).setScale(fromD / 128)
    .setAlpha(reduced() ? alpha * 0.6 : alpha);
  scene.tweens.add({
    targets: g, scale: toD / 128, alpha: 0, duration, ease: 'Cubic.easeOut',
    onComplete: () => g.destroy()
  });
}

// Chamado quando o meteoro nasce (Minotaur._spawnMeteor): troca os brilhos minúsculos antigos
// por halos redondos de verdade e deixa o rastro aditivo.
export function setupMeteorRockFx(scene, m) {
  ensureGlow(scene);
  m.glow?.setTexture(GLOW).setTint(0x38d8cb);
  m.headGlow?.setTexture(GLOW).setTint(0xeaffff).setRotation(0);
  m.tail?.setBlendMode(Phaser.BlendModes.ADD).setDepth(14);
  m._nextSpark = 0;
}

// Cada frame de cada meteoro: halo pulsando, cauda de cometa em 3 camadas (larga/média/núcleo)
// e faíscas soltas. (dirX, dirY) = direção da queda (do alto pro ponto de impacto).
export function updateMeteorRockFx(scene, m, rockX, rockY, t, nowMs, dirX, dirY) {
  if (m.glow) m.glow.setScale(Phaser.Math.Linear(0.95, 1.5, t)).setAlpha(0.55 + 0.15 * Math.sin(nowMs / 40));
  if (m.headGlow) m.headGlow.setScale(Phaser.Math.Linear(0.45, 0.75, t)).setAlpha(0.9);
  if (!m.tail) return;
  const bx = -dirX; // aponta de volta pra onde o meteoro veio
  const by = -dirY;
  const nx = -by;
  const ny = bx;
  const L = Phaser.Math.Linear(220, 380, t);
  const w = Phaser.Math.Linear(14, 26, t);
  const g = m.tail;
  g.clear();
  [[1.0, 1.9, 0x0f7f86, 0.2], [0.85, 1.05, 0x29cbbd, 0.42], [0.6, 0.42, 0xeaffff, 0.8]].forEach(([len, wid, col, al]) => {
    const ww = w * wid;
    g.fillStyle(col, al);
    g.fillTriangle(
      rockX + bx * L * len, rockY + by * L * len,
      rockX + nx * ww, rockY + ny * ww,
      rockX - nx * ww, rockY - ny * ww
    );
  });
  g.lineStyle(2, 0xffffff, 0.55);
  g.lineBetween(rockX, rockY, rockX + bx * L * 1.35, rockY + by * L * 1.35);

  // faíscas soltas (limitadas)
  const st = stateOf(scene);
  const cap = isMobile(scene) ? 14 : 40;
  if (nowMs >= m._nextSpark && st.sparksLive < cap && t > 0.45) {
    m._nextSpark = nowMs + (isMobile(scene) ? 70 : 38);
    for (let i = 0; i < 2; i++) {
      const sp = scene.add.rectangle(rockX + R(-6, 6), rockY + R(-6, 6), R(3, 7), 2, i ? 0xeaffff : 0x29cbbd, 0.95)
        .setDepth(14).setRotation(Math.atan2(by, bx)).setBlendMode(Phaser.BlendModes.ADD);
      st.sparksLive++;
      scene.tweens.add({
        targets: sp,
        x: sp.x + bx * R(30, 90) + nx * R(-26, 26),
        y: sp.y + by * R(30, 90) + ny * R(-26, 26),
        alpha: 0, scaleX: 0.3, duration: R(240, 420), ease: 'Cubic.easeOut',
        onComplete: () => { st.sparksLive--; sp.destroy(); }
      });
    }
  }
}

// Meteoros decorativos (sem dano) cruzando o céu bem fininhos: é o que faz parecer uma
// CHUVA de verdade sem esconder os meteoros reais. Chamado a cada update enquanto a chuva roda.
export function playMeteorAmbientRain(scene, nowMs, offX, offY) {
  const st = stateOf(scene);
  if (nowMs < st.nextAmbient) return;
  const mobile = isMobile(scene);
  st.nextAmbient = nowMs + (mobile ? 260 : 150) + R(0, 120);
  if (st.ambientLive >= (mobile ? 3 : 8)) return;
  const view = scene.cameras.main.worldView;
  if (!view) return;
  ensureGlow(scene);
  const len = Math.hypot(offX, offY) || 1;
  const dx = -offX / len * -1; // direção do alto pro chão
  const ux = Math.abs(offX) / len * Math.sign(-offX);
  const uy = Math.abs(offY) / len;
  const ang = Math.atan2(uy, ux);
  const travel = (view.height + 220) / uy;
  const sx = view.x + R(-0.25, 1.05) * view.width;
  const sy = view.y - 80;
  const length = R(60, 150);
  const fast = R(380, 560);
  const col = Math.random() < 0.5 ? 0x29cbbd : 0xbafff1;
  const alpha = R(0.28, 0.5) * (reduced() ? 0.6 : 1);
  const streak = scene.add.rectangle(sx, sy, length, R(1.5, 2.5), col, alpha)
    .setDepth(11).setRotation(ang).setBlendMode(Phaser.BlendModes.ADD);
  const head = scene.add.image(sx, sy, GLOW).setDepth(11).setTint(0xeaffff)
    .setBlendMode(Phaser.BlendModes.ADD).setScale(R(0.1, 0.18)).setAlpha(alpha * 1.3);
  st.ambientLive++;
  scene.tweens.add({
    targets: [streak, head],
    x: sx + ux * travel, y: sy + uy * travel,
    duration: fast, ease: 'Linear',
    onComplete: () => { st.ambientLive--; streak.destroy(); head.destroy(); }
  });
  scene.tweens.add({ targets: [streak, head], alpha: 0, delay: fast * 0.7, duration: fast * 0.3 });
}

export function playMeteorImpact(scene, x, y, radius, dir = null) {
  if (!scene?.sys?.isActive()) return;
  const rng = (a, b) => Phaser.Math.FloatBetween(a, b);
  const mobile = isMobile(scene);
  const k = mobile ? 0.6 : 1;

  // ---------- IMPACTO ESPETACULAR (curto: não polui a luta) ----------
  glowFlash(scene, x, y, 0xffffff, radius * 0.6, radius * 2.4, 150, 1, 20);
  glowFlash(scene, x, y, AQUA, radius * 1.2, radius * 3.6, 300, 0.6, 17);
  // o rastro final do meteoro: um risco de luz do alto até o ponto de impacto
  if (dir) {
    const ln = scene.add.graphics().setDepth(19).setBlendMode(Phaser.BlendModes.ADD);
    const bx = -dir.x, by = -dir.y;
    ln.lineStyle(10, AQUA, 0.45); ln.lineBetween(x, y, x + bx * 340, y + by * 340);
    ln.lineStyle(3, 0xffffff, 0.95); ln.lineBetween(x, y, x + bx * 340, y + by * 340);
    scene.tweens.add({ targets: ln, alpha: 0, duration: 170, ease: 'Quad.easeOut', onComplete: () => ln.destroy() });
  }
  ensureGlow(scene);
  const pil = scene.add.image(x, y + 4, GLOW).setOrigin(0.5, 1).setDepth(19).setTint(AQUA_LIGHT)
    .setBlendMode(Phaser.BlendModes.ADD).setScale(radius * 0.5 / 128, 1.2).setAlpha(reduced() ? 0.4 : 0.8);
  scene.tweens.add({
    targets: pil, scaleX: radius * 0.95 / 128, scaleY: 2.2, alpha: 0, duration: 260, ease: 'Cubic.easeOut',
    onComplete: () => pil.destroy()
  });
  const ring = scene.add.circle(x, y + 3, radius * 0.9, AQUA_LIGHT, 0.02).setDepth(18)
    .setStrokeStyle(3, 0xffffff, 0.95).setScale(0.12, 0.08).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ring, scaleX: 1.15, scaleY: 0.72, alpha: 0, duration: 260, ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });
  for (let i = 0; i < Math.round(16 * k); i++) {
    const a = (i / Math.round(16 * k)) * Math.PI * 2 + rng(-0.2, 0.2);
    const sp = scene.add.rectangle(x, y, rng(9, 24), 2, i % 3 ? AQUA : 0xeaffff, 1)
      .setDepth(19).setRotation(a).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: sp,
      x: x + Math.cos(a) * radius * rng(0.9, 1.5),
      y: y + Math.sin(a) * radius * rng(0.9, 1.5) * 0.75 - rng(2, 14),
      alpha: 0, scaleX: 0.25, duration: rng(240, 420), ease: 'Cubic.easeOut',
      onComplete: () => sp.destroy()
    });
  }
  // pedras maiores lançadas em arco
  for (let i = 0; i < Math.round(7 * k); i++) {
    const a = rng(0, Math.PI * 2);
    const d = radius * rng(0.6, 1.4);
    const h = rng(40, 110);
    const rock = scene.add.rectangle(x, y, rng(5, 10), rng(4, 8), i % 2 ? 0x1f2e35 : 0x0d1418, 1)
      .setDepth(16).setStrokeStyle(1, AQUA, 0.8);
    const prog = { t: 0 };
    scene.tweens.add({
      targets: prog, t: 1, duration: rng(380, 560), ease: 'Quad.easeOut',
      onUpdate: () => {
        rock.x = x + Math.cos(a) * d * prog.t;
        rock.y = y + Math.sin(a) * d * 0.7 * prog.t - Math.sin(prog.t * Math.PI) * h;
        rock.rotation = prog.t * 6;
      },
      onComplete: () => scene.tweens.add({ targets: rock, alpha: 0, duration: 400, onComplete: () => rock.destroy() })
    });
  }
  // brasas subindo
  for (let i = 0; i < Math.round(10 * k); i++) {
    const e = scene.add.rectangle(x + rng(-radius * 0.5, radius * 0.5), y + rng(-8, 8), rng(2, 3.5), rng(2, 3.5), i % 3 ? AQUA : AQUA_LIGHT, 0.95)
      .setDepth(19).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: e, y: e.y - rng(40, 110), x: e.x + rng(-14, 14), alpha: 0, scale: 0.3,
      duration: rng(500, 900), ease: 'Quad.easeOut', onComplete: () => e.destroy()
    });
  }

  // Dados fixos da cratera, para não "flickar" enquanto desvanece.
  const baseBlob = makeIrregularBlobPoints(x, y + 1, radius * 1.02, radius * 0.76, 26, 0.18, Phaser.Math.FloatBetween(0, Math.PI * 2));
  const innerBlob = makeIrregularBlobPoints(x, y + 2, radius * 0.7, radius * 0.48, 18, 0.16, Phaser.Math.FloatBetween(0, Math.PI * 2));
  const rimBlobs = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + rng(-0.1, 0.1);
    const d = radius * rng(0.58, 0.94);
    return {
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d * 0.72,
      w: radius * rng(0.16, 0.28),
      h: radius * rng(0.07, 0.12),
      color: i % 3 === 0 ? 0x182128 : CRATER_RIM,
      alpha: 0.62 + rng(0, 0.12)
    };
  });
  const cracks = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + rng(-0.18, 0.18);
    const start = radius * rng(0.08, 0.18);
    const sx = x + Math.cos(a) * start;
    const sy = y + Math.sin(a) * start * 0.78;
    const main = makeCrackPoints(sx, sy, a, radius * rng(0.42, 0.95));
    let branch = null;
    if (i % 2 === 0) {
      const bx = sx + Math.cos(a) * radius * rng(0.22, 0.35);
      const by = sy + Math.sin(a) * radius * rng(0.22, 0.35) * 0.78;
      branch = makeCrackPoints(bx, by, a + rng(-0.9, 0.9), radius * rng(0.16, 0.28));
    }
    return { main, branch };
  });
  const hotSpecks = Array.from({ length: 6 }, () => ({
    x: x + rng(-radius * 0.34, radius * 0.34),
    y: y + rng(-radius * 0.18, radius * 0.18),
    r: rng(1.2, 2.4),
    color: Math.random() < 0.5 ? AQUA : AQUA_LIGHT
  }));

  // ---------- marca persistente no chão ----------
  const crater = scene.add.graphics().setDepth(2);
  const drawCrater = (opacity) => {
    crater.clear();

    fillBlob(crater, baseBlob, CRATER_DARK, 0.68 * opacity);
    fillBlob(crater, innerBlob, CRATER_MID, 0.58 * opacity);

    rimBlobs.forEach((blob) => {
      crater.fillStyle(blob.color, blob.alpha * opacity);
      crater.fillEllipse(blob.x, blob.y, blob.w, blob.h);
    });

    cracks.forEach(({ main, branch }) => {
      strokeCrack(crater, main, CRATER_MID, AQUA, opacity);
      if (branch) strokeCrack(crater, branch, 0x23333a, 0x3cdccd, opacity * 0.66);
    });

    crater.lineStyle(3, HOT_CORE, 0.42 * opacity);
    crater.strokeEllipse(x, y, radius * 0.78, radius * 0.46);
    crater.lineStyle(1.5, AQUA_LIGHT, 0.24 * opacity);
    crater.strokeEllipse(x, y, radius * 0.56, radius * 0.32);

    hotSpecks.forEach((s) => {
      crater.fillStyle(s.color, 0.18 * opacity);
      crater.fillCircle(s.x, s.y, s.r);
    });
  };
  drawCrater(1);
  const craterState = { a: 1 };
  scene.tweens.add({
    targets: craterState,
    a: 0,
    delay: 2500,
    duration: 2200,
    ease: 'Sine.easeIn',
    onUpdate: () => drawCrater(craterState.a),
    onComplete: () => crater.destroy()
  });

  // ---------- impacto imediato ----------
  const flash = scene.add.circle(x, y, Math.max(8, radius * 0.18), AQUA_LIGHT, 0.82).setDepth(18);
  scene.tweens.add({ targets: flash, alpha: 0, scale: 1.9, duration: 110, onComplete: () => flash.destroy() });

  const shock = scene.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
  const shockState = { r: radius * 0.16, a: 1 };
  scene.tweens.add({
    targets: shockState,
    r: radius * 1.08,
    a: 0,
    duration: 280,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      shock.clear();
      shock.lineStyle(10, 0x10252b, shockState.a * 0.22);
      shock.strokeEllipse(x, y, shockState.r * 2.3, shockState.r * 1.18);
      shock.lineStyle(5, AQUA, shockState.a * 0.55);
      shock.strokeEllipse(x, y, shockState.r * 2.05, shockState.r * 1.02);
      shock.lineStyle(2, AQUA_LIGHT, shockState.a * 0.6);
      shock.strokeEllipse(x, y, shockState.r * 1.8, shockState.r * 0.88);
    },
    onComplete: () => shock.destroy()
  });

  // Graphics escala a partir da própria origem: desenhado em coords do mundo e escalado, a
  // nuvem escura "voava" pelo mapa. Por isso ele nasce no ponto do impacto e desenha local.
  const dust = scene.add.graphics({ x, y }).setDepth(14);
  dust.fillStyle(0x071015, 0.68);
  dust.fillEllipse(0, -radius * 0.02, radius * 1.46, radius * 0.72);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng(-0.25, 0.25);
    const d = radius * rng(0.08, 0.32);
    dust.fillStyle(i % 2 ? 0x12242a : 0x0b171b, 0.76);
    dust.fillCircle(Math.cos(a) * d, Math.sin(a) * d * 0.55 - radius * 0.04, rng(radius * 0.11, radius * 0.18));
  }
  scene.tweens.add({
    targets: dust,
    alpha: 0,
    scaleX: 1.18,
    scaleY: 1.08,
    duration: 390,
    ease: 'Cubic.easeOut',
    onComplete: () => dust.destroy()
  });

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rng(-0.35, 0.35);
    const d = radius * rng(0.45, 1.2);
    const piece = scene.add.rectangle(x, y, rng(3, 6), rng(2, 4), i % 3 === 0 ? 0x1f2e35 : 0x0d1418, 0.92)
      .setDepth(16)
      .setRotation(a + rng(-0.5, 0.5));
    scene.tweens.add({
      targets: piece,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d * 0.72 - rng(2, 10),
      rotation: piece.rotation + rng(-2.4, 2.4),
      alpha: 0,
      duration: rng(260, 420),
      ease: 'Cubic.easeOut',
      onComplete: () => piece.destroy()
    });
  }

  for (let i = 0; i < 8; i++) {
    const a = rng(0, Math.PI * 2);
    const d = radius * rng(0.12, 0.8);
    const ember = scene.add.image(x, y, 'hit_fx')
      .setDepth(17)
      .setTint(i % 3 === 0 ? AQUA_LIGHT : AQUA)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(rng(0.06, 0.16), rng(0.03, 0.08))
      .setRotation(a)
      .setAlpha(0.72);
    scene.tweens.add({
      targets: ember,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d * 0.72 - rng(10, 28),
      alpha: 0,
      duration: rng(300, 560),
      ease: 'Sine.easeOut',
      onComplete: () => ember.destroy()
    });
  }
}
