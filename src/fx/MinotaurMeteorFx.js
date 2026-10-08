// FX do impacto dos meteoros da 2ª fase do Minotauro.
// A ideia aqui é vender que houve um impacto PESADO no chão:
// cratera escurecida, borda estourada, rachaduras quentes e um estouro curto
// pra não poluir a visão do jogador.

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

export function playMeteorImpact(scene, x, y, radius) {
  if (!scene?.sys?.isActive()) return;
  const rng = (a, b) => Phaser.Math.FloatBetween(a, b);

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

  const dust = scene.add.graphics().setDepth(14);
  dust.fillStyle(0x071015, 0.68);
  dust.fillEllipse(x, y - radius * 0.02, radius * 1.46, radius * 0.72);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng(-0.25, 0.25);
    const d = radius * rng(0.08, 0.32);
    dust.fillStyle(i % 2 ? 0x12242a : 0x0b171b, 0.76);
    dust.fillCircle(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55 - radius * 0.04, rng(radius * 0.11, radius * 0.18));
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
