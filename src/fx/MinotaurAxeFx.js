// VFX do Machado Arremessado do Minotauro.
// Procedural e deliberadamente leve: poucos objetos persistentes durante a
// carga, trail amostrado (~20 FPS visuais) e bursts pontuais no impacto.

import SettingsManager from '../systems/SettingsManager.js';

const PHASE1 = Object.freeze({
  main: 0xe044ff,
  bright: 0xffb2ff,
  pale: 0xffedff,
  dark: 0x52105f,
  ground: 0x24152a,
  ground2: 0x5f2a69,
  dust: 0x66506b
});

const PHASE2 = Object.freeze({
  main: 0x32e9d6,
  bright: 0xbafff1,
  pale: 0xeaffff,
  dark: 0x0d5860,
  ground: 0x14262a,
  ground2: 0x31555a,
  dust: 0x405c60
});

const TELEGRAPH_PULSE_WINDOW_MS = 520;
const TELEGRAPH_PULSE_INTERVAL_MS = 155;
const TRAIL_INTERVAL_OUT_MS = 52;
const TRAIL_INTERVAL_RETURN_MS = 42;
const IMPLOSION_MS = 72;
const CHARGE_MOTE_COUNT = 9;

function palette(rage) {
  return rage ? PHASE2 : PHASE1;
}

function active(scene) {
  return Boolean(scene?.sys?.isActive());
}

function safeDestroy(obj) {
  if (obj?.active !== false && obj?.destroy) obj.destroy();
}

function fadeDestroy(scene, target, duration, delay = 0, ease = 'Cubic.easeOut') {
  if (!target || !active(scene)) return;
  scene.tweens.add({
    targets: target,
    alpha: 0,
    duration,
    delay,
    ease,
    onComplete: () => safeDestroy(target)
  });
}

// ---------- peças compartilhadas do "absurdo" ----------
const GLOW = 'maxe_glow';
function ensureGlow(scene) {
  if (scene.textures.exists(GLOW)) return;
  const tex = scene.textures.createCanvas(GLOW, 128, 128);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  tex.refresh();
}

const reducedFlashes = () => !!SettingsManager.getReducedFlashes?.();
const fxCount = (scene, n) => Math.max(2, Math.round(n * (scene.sys.game.device.input.touch ? 0.55 : 1)));
const hardShake = (scene, ms, intensity) => scene.cameras.main.shake(ms, intensity, true);

// clarão redondo que cresce e some (diâmetro em px)
function glowAt(scene, x, y, tint, fromD, toD, duration, alpha = 1, depth = 22, delay = 0) {
  ensureGlow(scene);
  const g = scene.add.image(x, y, GLOW).setDepth(depth).setTint(tint)
    .setBlendMode(Phaser.BlendModes.ADD).setScale(fromD / 128)
    .setAlpha(reducedFlashes() ? alpha * 0.55 : alpha);
  scene.tweens.add({
    targets: g, scale: toD / 128, alpha: 0, duration, delay,
    ease: 'Cubic.easeOut', onComplete: () => g.destroy()
  });
  return g;
}

// coluna de luz vertical saindo do chão
function pillar(scene, x, y, tint, width, height, duration, alpha = 0.9) {
  ensureGlow(scene);
  const p = scene.add.image(x, y + 6, GLOW).setOrigin(0.5, 1).setDepth(23).setTint(tint)
    .setBlendMode(Phaser.BlendModes.ADD).setScale(width / 256, height / 400)
    .setAlpha(reducedFlashes() ? alpha * 0.5 : alpha);
  scene.tweens.add({
    targets: p, scaleX: width / 90, scaleY: height / 128, alpha: 0, duration,
    ease: 'Cubic.easeOut', onComplete: () => p.destroy()
  });
}

// anel de choque achatado (visão de cima inclinada)
function shockRing(scene, x, y, color, radius, duration, thick = 5, delay = 0, alpha = 0.9) {
  const r = scene.add.circle(x, y + 5, radius, color, 0.03).setDepth(22)
    .setStrokeStyle(thick, color, alpha).setScale(0.12, 0.08)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: r, scaleX: 1, scaleY: 0.68, alpha: 0, duration, delay,
    ease: 'Cubic.easeOut', onComplete: () => r.destroy()
  });
}

// raios de energia correndo pelo chão (cresce rápido, esfria devagar)
function rayBurst(scene, x, y, c, length, count, duration = 820) {
  const rays = [];
  for (let i = 0; i < count; i++) {
    let a = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.15, 0.15);
    const pts = [];
    let px = 0;
    let py = 0;
    const len = length * Phaser.Math.FloatBetween(0.75, 1.15);
    for (let k = 0; k < 6; k++) {
      a += Phaser.Math.FloatBetween(-0.32, 0.32);
      px += Math.cos(a) * len / 6;
      py += Math.sin(a) * len / 6 * 0.82;
      pts.push([px, py]);
    }
    rays.push(pts);
  }
  const g = scene.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.addCounter({
    from: 0, to: 1, duration, ease: 'Linear',
    onUpdate: (tw) => {
      const t = tw.getValue();
      const grow = Math.min(1, t / 0.15);
      const fade = t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / 0.7);
      g.clear();
      rays.forEach((pts) => {
        const n = Math.max(1, Math.ceil(pts.length * grow));
        [[7, c.dark, 0.55], [2.6, c.main, 1], [1, 0xffffff, 1]].forEach(([w, col, al]) => {
          g.lineStyle(w, col, al * fade);
          g.beginPath(); g.moveTo(x, y + 5);
          for (let k = 0; k < n; k++) g.lineTo(x + pts[k][0], y + 5 + pts[k][1]);
          g.strokePath();
        });
      });
    },
    onComplete: () => g.destroy()
  });
}

// brasas subindo devagar (energia que sobra)
function embers(scene, x, y, c, count, spread) {
  for (let i = 0; i < count; i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const r = spread * Math.sqrt(Math.random());
    const e = scene.add.rectangle(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6,
      Phaser.Math.Between(2, 4), Phaser.Math.Between(2, 4), i % 3 ? c.main : c.pale, 0.95)
      .setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: e,
      x: e.x + Phaser.Math.Between(-24, 24),
      y: e.y - Phaser.Math.Between(70, 190),
      alpha: 0, scale: 0.3,
      delay: Phaser.Math.Between(0, 180),
      duration: Phaser.Math.Between(700, 1300),
      ease: 'Quad.easeOut',
      onComplete: () => e.destroy()
    });
  }
}

function drawJaggedCrack(g, x, y, angle, length, darkColor, hotColor, hotAlpha = 0.42, width = 3) {
  const pts = [{ x, y }];
  let px = x;
  let py = y;
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const a = angle + Phaser.Math.FloatBetween(-0.18, 0.18);
    const step = length / steps;
    px += Math.cos(a) * step;
    py += Math.sin(a) * step * 0.82;
    pts.push({ x: px, y: py });
  }

  g.lineStyle(width + 2, darkColor, 0.72);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
  g.strokePath();

  g.lineStyle(Math.max(1, width * 0.42), hotColor, hotAlpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
  g.strokePath();

  return pts;
}

function spawnDust(scene, x, y, c, count = 6, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.35, 0.35);
    const dist = Phaser.Math.FloatBetween(24, 52) * power;
    const puff = scene.add.ellipse(
      x + Math.cos(a) * Phaser.Math.Between(2, 10),
      y + 7 + Math.sin(a) * Phaser.Math.Between(1, 5),
      Phaser.Math.Between(8, 15) * power,
      Phaser.Math.Between(3, 6) * power,
      i % 3 === 0 ? c.ground2 : c.dust,
      Phaser.Math.FloatBetween(0.32, 0.54)
    ).setDepth(8);

    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist * 0.55 - Phaser.Math.Between(2, 12) * power,
      scaleX: Phaser.Math.FloatBetween(1.4, 2.1),
      scaleY: Phaser.Math.FloatBetween(1.3, 2),
      alpha: 0,
      duration: Phaser.Math.Between(320, 520),
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy()
    });
  }
}

function spawnGroundChips(scene, x, y, c, count = 6, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.28, 0.28);
    const dist = Phaser.Math.FloatBetween(28, 62) * power;
    const chip = scene.add.rectangle(
      x,
      y + 4,
      Phaser.Math.Between(3, 7),
      Phaser.Math.Between(2, 5),
      i % 3 === 0 ? c.main : (i % 2 ? c.ground2 : c.ground),
      0.9
    )
      .setDepth(15)
      .setRotation(Phaser.Math.FloatBetween(0, Math.PI));

    scene.tweens.add({
      targets: chip,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist * 0.62 - Phaser.Math.Between(8, 28) * power,
      rotation: chip.rotation + Phaser.Math.FloatBetween(-3.2, 3.2),
      alpha: 0,
      scaleX: 0.35,
      scaleY: 0.35,
      duration: Phaser.Math.Between(300, 500),
      ease: 'Cubic.easeOut',
      onComplete: () => chip.destroy()
    });
  }
}

export function createMinotaurAxeFxState() {
  return {
    lastTelegraphPulseAt: -Infinity,
    lastTrailAt: -Infinity,
    trailPrevX: null,
    trailPrevY: null,
    charge: null,
    detonationTimer: null
  };
}

export function cleanupMinotaurAxeFx(state) {
  if (!state) return;
  state.detonationTimer?.remove?.(false);
  state.detonationTimer = null;
  destroyMinotaurAxeChargeFx(state);
  state.trailPrevX = null;
  state.trailPrevY = null;
  state.lastTrailAt = -Infinity;
  state.lastTelegraphPulseAt = -Infinity;
}

export function resetMinotaurAxeTrail(state, x, y, nowMs = 0) {
  if (!state) return;
  state.trailPrevX = x;
  state.trailPrevY = y;
  state.lastTrailAt = nowMs - 999;
}

// Só entra nos últimos instantes do telegraph. Em vez de redesenhar a linha
// inteira todo frame, um pequeno pulso viaja nela e se autodestrói.
export function playMinotaurAxeTelegraphPulse(scene, state, fromX, fromY, toX, toY, nowMs, endsAt, rage = false) {
  if (!active(scene) || !state) return;
  const remaining = endsAt - nowMs;
  if (remaining > TELEGRAPH_PULSE_WINDOW_MS || remaining <= 0) return;
  if (nowMs - state.lastTelegraphPulseAt < TELEGRAPH_PULSE_INTERVAL_MS) return;
  state.lastTelegraphPulseAt = nowMs;

  const c = palette(rage);
  const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
  const pulse = scene.add.image(fromX, fromY, 'hit_fx')
    .setDepth(7)
    .setTint(c.bright)
    .setAlpha(0.88)
    .setScale(0.28)
    .setBlendMode(Phaser.BlendModes.ADD);
  const streak = scene.add.rectangle(fromX, fromY, 18, 2, c.main, 0.7)
    .setDepth(6)
    .setRotation(angle)
    .setBlendMode(Phaser.BlendModes.ADD);

  const duration = Math.max(110, Math.min(210, remaining * 0.72));
  scene.tweens.add({
    targets: [pulse, streak],
    x: toX,
    y: toY,
    duration,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      pulse.destroy();
      streak.destroy();
    }
  });
}

export function playMinotaurAxeLaunchFx(scene, x, y, targetX, targetY, rage = false) {
  if (!active(scene)) return;
  const c = palette(rage);
  const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;

  const flash = scene.add.image(x + dx * 7, y + dy * 7, 'hit_fx')
    .setDepth(20)
    .setTint(c.pale)
    .setAlpha(0.95)
    .setScale(0.32)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flash,
    scale: 1.15,
    alpha: 0,
    duration: 150,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy()
  });

  // Fragmentos de energia saem para trás da mão, vendendo a arrancada sem
  // criar uma nuvem gigante que esconda o boss.
  for (let i = 0; i < 6; i++) {
    const side = Phaser.Math.FloatBetween(-1, 1);
    const chip = scene.add.rectangle(
      x - dx * Phaser.Math.Between(1, 9) + px * side * 7,
      y - dy * Phaser.Math.Between(1, 9) + py * side * 7,
      Phaser.Math.Between(5, 10),
      2,
      i % 3 === 0 ? c.bright : c.main,
      0.86
    )
      .setDepth(19)
      .setRotation(angle + Math.PI)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: chip,
      x: chip.x - dx * Phaser.Math.Between(20, 48) + px * side * Phaser.Math.Between(5, 18),
      y: chip.y - dy * Phaser.Math.Between(20, 48) + py * side * Phaser.Math.Between(5, 18),
      scaleX: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(170, 270),
      ease: 'Cubic.easeOut',
      onComplete: () => chip.destroy()
    });
  }

  spawnDust(scene, x - dx * 4, y - dy * 4, c, 4, 0.75);

  // Arrancada brutal: clarão grande, anel de pressão e linhas de velocidade na direção do arremesso.
  glowAt(scene, x + dx * 10, y + dy * 10, c.bright, 20, 150, 220, 0.9, 20);
  shockRing(scene, x, y, c.bright, 70, 260, 4);
  for (let i = 0; i < fxCount(scene, 12); i++) {
    const side = Phaser.Math.FloatBetween(-1, 1);
    const sx = x + dx * Phaser.Math.Between(10, 40) + px * side * 24;
    const sy = y + dy * Phaser.Math.Between(10, 40) + py * side * 24;
    const line = scene.add.rectangle(sx, sy, Phaser.Math.Between(26, 60), 2, i % 3 ? c.main : c.pale, 0.9)
      .setDepth(19).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: line, x: sx + dx * Phaser.Math.Between(90, 190), y: sy + dy * Phaser.Math.Between(90, 190),
      alpha: 0, scaleX: 0.3, duration: Phaser.Math.Between(160, 280),
      ease: 'Cubic.easeOut', onComplete: () => line.destroy()
    });
  }
  hardShake(scene, 140, 0.007);
}

// Trail quebrado: uma afterimage + dois segmentos pixelados por amostra.
// Com 42-52 ms entre amostras, normalmente existem só 6-9 objetos de trail
// simultaneamente mesmo em 120 FPS.
export function emitMinotaurAxeTrail(scene, state, axeSprite, nowMs, rage = false, returning = false) {
  if (!active(scene) || !state || !axeSprite?.visible) return;
  const interval = returning ? TRAIL_INTERVAL_RETURN_MS : TRAIL_INTERVAL_OUT_MS;
  if (state.trailPrevX == null || state.trailPrevY == null) {
    resetMinotaurAxeTrail(state, axeSprite.x, axeSprite.y, nowMs);
    return;
  }
  if (nowMs - state.lastTrailAt < interval) return;

  const prevX = state.trailPrevX;
  const prevY = state.trailPrevY;
  const dx = axeSprite.x - prevX;
  const dy = axeSprite.y - prevY;
  const len = Math.hypot(dx, dy);
  state.trailPrevX = axeSprite.x;
  state.trailPrevY = axeSprite.y;
  state.lastTrailAt = nowMs;
  if (len < 1) return;

  const c = palette(rage);
  const ux = dx / len;
  const uy = dy / len;
  const moveAngle = Math.atan2(dy, dx);
  const duration = returning ? 105 : 145;

  const ghost = scene.add.image(
    axeSprite.x - ux * (returning ? 12 : 9),
    axeSprite.y - uy * (returning ? 12 : 9),
    axeSprite.texture.key,
    axeSprite.frame?.name
  )
    .setOrigin(axeSprite.originX, axeSprite.originY)
    .setDepth(14)
    .setRotation(axeSprite.rotation)
    .setScale(axeSprite.scaleX * (returning ? 0.82 : 0.9), axeSprite.scaleY * (returning ? 0.82 : 0.9))
    .setTint(returning ? c.bright : c.main)
    .setAlpha(returning ? 0.34 : 0.26)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: ghost,
    x: ghost.x - ux * (returning ? 11 : 7),
    y: ghost.y - uy * (returning ? 11 : 7),
    alpha: 0,
    scaleX: ghost.scaleX * 0.72,
    scaleY: ghost.scaleY * 0.72,
    duration,
    ease: 'Quad.easeOut',
    onComplete: () => ghost.destroy()
  });

  // Rastro contínuo: faixa de energia entre as amostras + clarão no machado + faíscas soltas.
  const beam = scene.add.rectangle(
    (prevX + axeSprite.x) / 2, (prevY + axeSprite.y) / 2,
    len + 14, returning ? 7 : 11, returning ? c.bright : c.main, returning ? 0.7 : 0.55
  ).setDepth(15).setRotation(moveAngle).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: beam, alpha: 0, scaleY: 0.2, duration: returning ? 150 : 210,
    ease: 'Quad.easeOut', onComplete: () => beam.destroy()
  });
  glowAt(scene, axeSprite.x, axeSprite.y, returning ? c.pale : c.bright, 26, 78, 170, 0.45, 13);
  for (let j = 0; j < 2; j++) {
    const sp = scene.add.rectangle(axeSprite.x, axeSprite.y, Phaser.Math.Between(3, 7), 2, j ? c.pale : c.main, 0.95)
      .setDepth(17).setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2)).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: sp,
      x: sp.x + Phaser.Math.Between(-30, 30) - ux * 16,
      y: sp.y + Phaser.Math.Between(-30, 30) - uy * 16,
      alpha: 0, duration: Phaser.Math.Between(180, 320), onComplete: () => sp.destroy()
    });
  }

  for (let i = 0; i < 2; i++) {
    const back = (i + 1) * (returning ? 15 : 12);
    const seg = scene.add.rectangle(
      axeSprite.x - ux * back,
      axeSprite.y - uy * back,
      returning ? 14 - i * 3 : 10 - i * 2,
      returning ? 2 : 3,
      i === 0 ? c.bright : c.main,
      returning ? 0.8 : 0.58
    )
      .setDepth(16)
      .setRotation(moveAngle)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: seg,
      x: seg.x - ux * 10,
      y: seg.y - uy * 10,
      alpha: 0,
      scaleX: 0.28,
      duration: returning ? 95 : 130,
      ease: 'Cubic.easeOut',
      onComplete: () => seg.destroy()
    });
  }
}

export function playMinotaurAxeImpactFx(scene, state, axeSprite, x, y, radius, rage = false) {
  if (!active(scene) || !state) return;
  destroyMinotaurAxeChargeFx(state);
  const c = palette(rage);

  const impactFlash = scene.add.image(x, y, 'hit_fx')
    .setDepth(21)
    .setTint(c.pale)
    .setAlpha(0.96)
    .setScale(0.3)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: impactFlash,
    scale: 3.4,
    alpha: 0,
    duration: 210,
    ease: 'Cubic.easeOut',
    onComplete: () => impactFlash.destroy()
  });

  const pressure = scene.add.circle(x, y + 4, Math.max(18, radius * 0.32), c.main, 0.08)
    .setDepth(10)
    .setStrokeStyle(3, c.bright, 0.8)
    .setScale(0.25, 0.14)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: pressure,
    scaleX: 2.25,
    scaleY: 0.9,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => pressure.destroy()
  });

  spawnDust(scene, x, y, c, fxCount(scene, 14), 1.5);
  spawnGroundChips(scene, x, y, c, fxCount(scene, 16), 1.5);

  // Crava com violência: clarão branco, coluna de luz, anéis duplos, raios no chão e brasas.
  glowAt(scene, x, y, c.pale, 30, radius * 2.4, 240, 0.95, 24);
  glowAt(scene, x, y, c.main, 50, radius * 3.2, 380, 0.6, 21);
  pillar(scene, x, y, c.bright, radius * 0.7, 360, 380, 0.85);
  shockRing(scene, x, y, c.bright, radius * 1.1, 340, 6);
  shockRing(scene, x, y, c.pale, radius * 0.9, 260, 3, 60);
  rayBurst(scene, x, y, c, radius * 1.15, fxCount(scene, 10), 700);
  embers(scene, x, y, c, fxCount(scene, 12), radius * 0.6);
  hardShake(scene, 260, 0.024);

  // O machado realmente "entra" no piso por alguns pixels e volta, sem
  // alterar a posição final usada pela hitbox.
  if (axeSprite) {
    const baseY = y;
    scene.tweens.killTweensOf(axeSprite);
    scene.tweens.add({
      targets: axeSprite,
      y: baseY + 5,
      duration: 52,
      ease: 'Quad.easeIn',
      yoyo: true,
      hold: 18,
      onComplete: () => {
        if (axeSprite.active) axeSprite.y = baseY;
      }
    });
  }

  const cracks = scene.add.graphics().setDepth(3);
  const glowCracks = scene.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
  const crackCount = 7;
  for (let i = 0; i < crackCount; i++) {
    const a = (Math.PI * 2 * i) / crackCount + Phaser.Math.FloatBetween(-0.22, 0.22);
    const len = radius * Phaser.Math.FloatBetween(0.35, 0.68);
    drawJaggedCrack(cracks, x, y + 5, a, len, c.ground, c.ground2, 0.16, 3.5);
    drawJaggedCrack(glowCracks, x, y + 5, a, len * 0.84, c.dark, c.main, rage ? 0.38 : 0.34, 1.3);
  }

  const ring = scene.add.circle(x, y + 5, Math.max(22, radius * 0.46), c.main, 0.035)
    .setDepth(5)
    .setStrokeStyle(2, c.main, 0.46)
    .setBlendMode(Phaser.BlendModes.ADD);
  const innerRing = scene.add.circle(x, y + 5, Math.max(12, radius * 0.26), c.bright, 0.025)
    .setDepth(6)
    .setStrokeStyle(2, c.bright, 0.32)
    .setBlendMode(Phaser.BlendModes.ADD);
  const glow = scene.add.image(x, y + 1, 'hit_fx')
    .setDepth(7)
    .setTint(c.main)
    .setAlpha(0.16)
    .setScale(0.42)
    .setBlendMode(Phaser.BlendModes.ADD);
  const flash = scene.add.image(x, y, 'hit_fx')
    .setDepth(18)
    .setTint(c.pale)
    .setAlpha(0)
    .setScale(0.36)
    .setBlendMode(Phaser.BlendModes.ADD);

  const motes = [];
  for (let i = 0; i < CHARGE_MOTE_COUNT; i++) {
    const mote = scene.add.rectangle(x, y, i % 2 ? 7 : 5, 2, i % 2 ? c.main : c.bright, 0.9)
      .setDepth(17)
      .setBlendMode(Phaser.BlendModes.ADD);
    motes.push(mote);
  }

  ensureGlow(scene);
  const beam = scene.add.image(x, y + 4, GLOW).setOrigin(0.5, 1).setDepth(16)
    .setTint(c.main).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3, 1.4).setAlpha(0.2);
  state.charge = { cracks, glowCracks, ring, innerRing, glow, flash, motes, beam, lastEmberAt: 0, radius, x, y, rage };
}

export function updateMinotaurAxeChargeFx(scene, state, x, y, nowMs, chargeStartAt, chargeEndAt, urgent = false) {
  const fx = state?.charge;
  if (!active(scene) || !fx) return;
  const c = palette(fx.rage);
  const duration = Math.max(1, chargeEndAt - chargeStartAt);
  const progress = Phaser.Math.Clamp((nowMs - chargeStartAt) / duration, 0, 1);
  const period = urgent ? 105 : Phaser.Math.Linear(330, 210, progress);
  const pulse = (Math.sin((nowMs / period) * Math.PI * 2) + 1) / 2;

  fx.ring.setPosition(x, y + 5);
  fx.innerRing.setPosition(x, y + 5);
  fx.glow.setPosition(x, y + 1);
  fx.flash.setPosition(x, y);

  // Durante a carga o círculo cresce discretamente; no beep ele "fecha" em
  // direção ao centro, como se tudo estivesse comprimindo antes da ruptura.
  const ringScale = urgent
    ? Phaser.Math.Linear(1.03, 0.78, pulse)
    : 0.86 + progress * 0.18 + pulse * 0.035;
  fx.ring.setScale(ringScale, ringScale * 0.72)
    .setAlpha((urgent ? 0.5 : 0.22 + progress * 0.26) + pulse * 0.08);
  fx.innerRing.setScale(urgent ? 0.72 + pulse * 0.08 : 0.82 + progress * 0.1)
    .setAlpha(urgent ? 0.74 : 0.22 + progress * 0.22);
  fx.glow.setScale((urgent ? 0.54 : 0.38 + progress * 0.18) + pulse * (urgent ? 0.12 : 0.05))
    .setAlpha(urgent ? 0.34 + pulse * 0.28 : 0.12 + progress * 0.2);
  fx.glowCracks.setAlpha(urgent ? 0.9 : 0.34 + progress * 0.42);
  fx.cracks.setAlpha(0.62 + progress * 0.26);

  // Um único sprite de flash é reutilizado; nada novo é criado a cada pulso.
  fx.flash
    .setTint(urgent ? c.pale : c.bright)
    .setAlpha(urgent && pulse > 0.62 ? (pulse - 0.62) * 1.8 : 0)
    .setScale(0.34 + pulse * 0.26);

  // Pilar de energia sobe do machado e fica mais largo/intenso até a explosão.
  if (fx.beam) {
    const flicker = urgent ? 0.55 + pulse * 0.45 : 0.55 + pulse * 0.2;
    fx.beam.setPosition(x, y + 4)
      .setTint(urgent ? c.pale : c.main)
      .setScale((0.28 + progress * 0.5 + (urgent ? 0.12 * pulse : 0)), 1.5 + progress * 2.2)
      .setAlpha((0.16 + progress * 0.4) * flicker + (urgent ? 0.18 : 0));
  }
  if (nowMs - fx.lastEmberAt > (urgent ? 60 : 130)) {
    fx.lastEmberAt = nowMs;
    embers(scene, x, y, c, urgent ? 2 : 1, fx.radius * 0.5);
  }

  const speed = urgent ? 2.85 : Phaser.Math.Linear(1.1, 2.0, progress);
  const maxR = fx.radius * (urgent ? 0.78 : 0.9);
  fx.motes.forEach((mote, index) => {
    const cycle = ((nowMs * 0.001 * speed + index / fx.motes.length) % 1 + 1) % 1;
    const inward = 1 - cycle;
    const angle = index * (Math.PI * 2 / fx.motes.length) + nowMs * (urgent ? 0.0045 : 0.0024);
    const r = maxR * inward;
    mote.setPosition(
      x + Math.cos(angle) * r,
      y + Math.sin(angle) * r * 0.62 + 2
    );
    mote.setRotation(angle + Math.PI);
    mote.setScale(0.58 + cycle * 0.62, urgent ? 0.72 : 0.58);
    mote.setAlpha(Phaser.Math.Clamp(0.2 + cycle * 1.05, 0, 0.95));
  });
}

export function playMinotaurAxeBeepFx(scene, state, x, y, rage = false) {
  if (!active(scene)) return;
  const c = palette(rage);
  const ring = scene.add.circle(x, y + 4, 18, c.bright, 0.03)
    .setDepth(19)
    .setStrokeStyle(3, c.pale, 0.92)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ring,
    scaleX: 3.3,
    scaleY: 2.1,
    alpha: 0,
    duration: 190,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });

  shockRing(scene, x, y, c.pale, 90, 260, 4, 40);
  glowAt(scene, x, y, c.pale, 20, 170, 200, 0.8, 24);
  hardShake(scene, 70, 0.005);
  if (state?.charge?.glowCracks) state.charge.glowCracks.setAlpha(1);
}

export function destroyMinotaurAxeChargeFx(state) {
  const fx = state?.charge;
  if (!fx) return;
  safeDestroy(fx.cracks);
  safeDestroy(fx.glowCracks);
  safeDestroy(fx.ring);
  safeDestroy(fx.innerRing);
  safeDestroy(fx.glow);
  safeDestroy(fx.flash);
  safeDestroy(fx.beam);
  fx.motes?.forEach(safeDestroy);
  state.charge = null;
}

function spawnExplosionScar(scene, x, y, radius, c) {
  const scar = scene.add.graphics().setDepth(2);
  const hot = scene.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);

  scar.fillStyle(c.ground, 0.42);
  scar.fillEllipse(x, y + 6, radius * 1.22, radius * 0.72);
  scar.lineStyle(4, c.ground2, 0.65);
  scar.strokeEllipse(x, y + 6, radius * 1.12, radius * 0.64);

  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.28, 0.28);
    const length = radius * Phaser.Math.FloatBetween(0.62, 1.08);
    drawJaggedCrack(scar, x, y + 5, a, length, c.ground, c.ground2, 0.08, 4);
    drawJaggedCrack(hot, x, y + 5, a, length * Phaser.Math.FloatBetween(0.65, 0.88), c.dark, c.main, 0.62, 1.5);
  }

  fadeDestroy(scene, hot, 1050, 230, 'Sine.easeIn');
  fadeDestroy(scene, scar, 1250, 2300, 'Sine.easeIn');
}

function spawnRupture(scene, x, y, radius, rage) {
  const c = palette(rage);

  // ===== EXPLOSÃO ABSURDA =====
  // clarão branco que engole a tela local + onda de cor + coluna de luz gigante
  glowAt(scene, x, y, 0xffffff, 40, radius * 2.8, 300, 1, 26);
  glowAt(scene, x, y, c.bright, 60, radius * 4.2, 560, 0.75, 22);
  glowAt(scene, x, y, c.main, 80, radius * 5.2, 800, 0.4, 20, 60);
  pillar(scene, x, y, c.pale, radius * 0.8, 900, 620, 1);
  pillar(scene, x, y, c.main, radius * 1.5, 700, 760, 0.55);
  // 4 anéis de choque em sequência, até o raio real do dano
  shockRing(scene, x, y, 0xffffff, radius, 380, 7, 0);
  shockRing(scene, x, y, c.bright, radius * 1.05, 520, 10, 60);
  shockRing(scene, x, y, c.main, radius * 1.15, 680, 14, 140, 0.7);
  shockRing(scene, x, y, c.dark, radius * 1.25, 820, 18, 230, 0.5);
  rayBurst(scene, x, y, c, radius * 1.15, fxCount(scene, 20), 1000);
  embers(scene, x, y, c, fxCount(scene, 34), radius * 0.9);
  hardShake(scene, 720, 0.062);
  scene.time.delayedCall(200, () => { if (active(scene)) hardShake(scene, 460, 0.03); });

  const core = scene.add.circle(x, y, Math.max(18, radius * 0.3), c.pale, 0.92)
    .setDepth(24)
    .setScale(0.22)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: core,
    scale: 2.35,
    alpha: 0,
    duration: 190,
    ease: 'Cubic.easeOut',
    onComplete: () => core.destroy()
  });

  const shock = scene.add.circle(x, y + 4, Math.max(20, radius * 0.42), c.main, 0.04)
    .setDepth(21)
    .setStrokeStyle(5, c.bright, 0.9)
    .setScale(0.3, 0.2)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: shock,
    scaleX: 2.65,
    scaleY: 1.75,
    alpha: 0,
    duration: 360,
    ease: 'Cubic.easeOut',
    onComplete: () => shock.destroy()
  });

  const outer = scene.add.circle(x, y + 5, Math.max(22, radius * 0.5), c.dark, 0.02)
    .setDepth(18)
    .setStrokeStyle(7, c.main, 0.28)
    .setScale(0.25, 0.18);
  scene.tweens.add({
    targets: outer,
    scaleX: 2.55,
    scaleY: 1.7,
    alpha: 0,
    duration: 520,
    ease: 'Cubic.easeOut',
    onComplete: () => outer.destroy()
  });

  spawnGroundChips(scene, x, y, c, fxCount(scene, 28), 2.6);
  spawnDust(scene, x, y, c, fxCount(scene, 18), 2.1);

  // Poucos estilhaços energéticos, mais longos que a poeira e bem legíveis.
  const shardCount = fxCount(scene, 22);
  for (let i = 0; i < shardCount; i++) {
    const a = (Math.PI * 2 * i) / shardCount + Phaser.Math.FloatBetween(-0.2, 0.2);
    const dist = radius * Phaser.Math.FloatBetween(0.85, 1.45);
    const shard = scene.add.rectangle(x, y, Phaser.Math.Between(16, 40), 3, i % 2 ? c.main : c.bright, 0.95)
      .setDepth(23)
      .setRotation(a)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist * 0.82,
      alpha: 0,
      scaleX: 0.35,
      duration: Phaser.Math.Between(320, 520),
      ease: 'Cubic.easeOut',
      onComplete: () => shard.destroy()
    });
  }

  spawnExplosionScar(scene, x, y, radius, c);
}

// Implosão curta -> ruptura. O callback é disparado exatamente no frame da
// ruptura para o dano/som/shake do Minotauro ficarem sincronizados ao VFX.
export function playMinotaurAxeExplosionFx(scene, state, x, y, radius, rage = false, onRupture = null) {
  if (!active(scene) || !state) {
    onRupture?.();
    return;
  }
  const c = palette(rage);
  const fx = state.charge;

  if (fx) {
    fx.motes?.forEach((mote, index) => {
      scene.tweens.add({
        targets: mote,
        x,
        y,
        scaleX: 0.15,
        scaleY: 0.15,
        alpha: index % 2 ? 1 : 0.7,
        duration: IMPLOSION_MS,
        ease: 'Cubic.easeIn'
      });
    });
    scene.tweens.add({
      targets: [fx.ring, fx.innerRing],
      scaleX: 0.16,
      scaleY: 0.12,
      alpha: 1,
      duration: IMPLOSION_MS,
      ease: 'Cubic.easeIn'
    });
    scene.tweens.add({
      targets: fx.glow,
      scale: 0.2,
      alpha: 1,
      duration: IMPLOSION_MS,
      ease: 'Cubic.easeIn'
    });
  }

  const implosionCore = scene.add.image(x, y, 'hit_fx')
    .setDepth(25)
    .setTint(c.pale)
    .setAlpha(0.9)
    .setScale(0.72)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: implosionCore,
    scale: 0.08,
    alpha: 1,
    duration: IMPLOSION_MS,
    ease: 'Cubic.easeIn'
  });

  state.detonationTimer?.remove?.(false);
  state.detonationTimer = scene.time.delayedCall(IMPLOSION_MS, () => {
    state.detonationTimer = null;
    implosionCore.destroy();
    destroyMinotaurAxeChargeFx(state);
    spawnRupture(scene, x, y, radius, rage);
    onRupture?.();
  });
}

export function playMinotaurAxeCatchFx(scene, x, y, rage = false) {
  if (!active(scene)) return;
  const c = palette(rage);
  const flash = scene.add.image(x, y, 'hit_fx')
    .setDepth(22)
    .setTint(c.pale)
    .setAlpha(0.9)
    .setScale(0.24)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flash,
    scale: 0.8,
    alpha: 0,
    duration: 135,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy()
  });

  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 * i) / 4 + Phaser.Math.FloatBetween(-0.35, 0.35);
    const spark = scene.add.rectangle(x, y, Phaser.Math.Between(5, 9), 2, i % 2 ? c.main : c.bright, 0.92)
      .setDepth(21)
      .setRotation(a)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(a) * Phaser.Math.Between(18, 34),
      y: y + Math.sin(a) * Phaser.Math.Between(18, 34),
      alpha: 0,
      scaleX: 0.2,
      duration: Phaser.Math.Between(120, 190),
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy()
    });
  }

  glowAt(scene, x, y, c.bright, 20, 130, 220, 0.9, 24);
  shockRing(scene, x, y, c.pale, 60, 240, 4);
  for (let i = 0; i < fxCount(scene, 8); i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const sp = scene.add.rectangle(x, y, Phaser.Math.Between(10, 22), 2, i % 2 ? c.pale : c.main, 0.95)
      .setDepth(22).setRotation(a).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: sp, x: x + Math.cos(a) * Phaser.Math.Between(34, 80), y: y + Math.sin(a) * Phaser.Math.Between(34, 80),
      alpha: 0, scaleX: 0.2, duration: Phaser.Math.Between(180, 300), ease: 'Cubic.easeOut',
      onComplete: () => sp.destroy()
    });
  }
  hardShake(scene, 140, 0.009);
}
