// VFX da Investida do Minotauro.
// Tudo procedural: cascos cravam o chão, a arrancada quebra o terreno,
// a corrida deixa pegadas/rachaduras e o fim do dash arrasta o piso.

const PHASE1 = {
  // Roxo rosado/neon: a corrupção da fase 1 precisa LER no chão,
  // não virar uma mancha quase preta.
  energy: 0xff3bd4,
  light: 0xffd7f6,
  mid: 0xbd32d6,
  ground: 0x3c1746,
  ground2: 0x7a2d83,
  dust: 0x76506f
};

const PHASE2 = {
  energy: 0x31d5c6,
  light: 0xdffff8,
  mid: 0x176975,
  ground: 0x122126,
  ground2: 0x27383e,
  dust: 0x30464b
};

function palette(rage) {
  return rage ? PHASE2 : PHASE1;
}

function dirInfo(dir) {
  const len = Math.hypot(dir?.x || 0, dir?.y || 0) || 1;
  const dx = (dir?.x || 1) / len;
  const dy = (dir?.y || 0) / len;
  return { dx, dy, px: -dy, py: dx, angle: Math.atan2(dy, dx) };
}

function worldPoint(cx, cy, dx, dy, px, py, forward, lateral) {
  return {
    x: cx + dx * forward + px * lateral,
    y: cy + dy * forward + py * lateral
  };
}

function drawPath(g, pts) {
  if (!pts.length) return;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.strokePath();
}

function fillPoly(g, pts, color, alpha) {
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
}

// Pegada de casco bipartido (cloven hoof). O "V" frontal torna a silhueta
// legível mesmo quando a pegada aparece por poucos frames.
function drawHoof(g, cx, cy, dir, c, scale = 1, energyAlpha = 0.55, darkAlpha = 0.92) {
  const { dx, dy, px, py } = dirInfo(dir);
  const left = [
    worldPoint(cx, cy, dx, dy, px, py, 10 * scale, -1.6 * scale),
    worldPoint(cx, cy, dx, dy, px, py, 4 * scale, -7.2 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -7.5 * scale, -7.2 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -10 * scale, -3.2 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -2 * scale, -0.8 * scale)
  ];
  const right = [
    worldPoint(cx, cy, dx, dy, px, py, 10 * scale, 1.6 * scale),
    worldPoint(cx, cy, dx, dy, px, py, 4 * scale, 7.2 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -7.5 * scale, 7.2 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -10 * scale, 3.2 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -2 * scale, 0.8 * scale)
  ];

  fillPoly(g, left, c.ground, darkAlpha * 0.92);
  fillPoly(g, right, c.ground, darkAlpha * 0.92);
  // O miolo pega a cor da corrupção: deixa a pegada realmente neon,
  // mas ainda parece um sulco no chão em vez de tinta chapada.
  fillPoly(g, left, c.mid, energyAlpha * 0.16);
  fillPoly(g, right, c.mid, energyAlpha * 0.16);
  g.lineStyle(Math.max(1.5, 2.2 * scale), c.ground2, darkAlpha * 0.95);
  drawPath(g, left);
  drawPath(g, right);

  // Núcleo energético nas bordas recém-rasgadas.
  const insetLeft = [
    worldPoint(cx, cy, dx, dy, px, py, 7 * scale, -2.1 * scale),
    worldPoint(cx, cy, dx, dy, px, py, 2.5 * scale, -5.4 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -5.2 * scale, -5.2 * scale)
  ];
  const insetRight = [
    worldPoint(cx, cy, dx, dy, px, py, 7 * scale, 2.1 * scale),
    worldPoint(cx, cy, dx, dy, px, py, 2.5 * scale, 5.4 * scale),
    worldPoint(cx, cy, dx, dy, px, py, -5.2 * scale, 5.2 * scale)
  ];
  g.lineStyle(Math.max(1.4, 2.0 * scale), c.energy, Math.min(1, energyAlpha * 1.28));
  g.beginPath();
  g.moveTo(insetLeft[0].x, insetLeft[0].y);
  insetLeft.slice(1).forEach((p) => g.lineTo(p.x, p.y));
  g.strokePath();
  g.beginPath();
  g.moveTo(insetRight[0].x, insetRight[0].y);
  insetRight.slice(1).forEach((p) => g.lineTo(p.x, p.y));
  g.strokePath();
}

function drawCrack(g, x, y, baseAngle, length, c, hot = false, width = 4, alpha = 0.9) {
  const pts = [{ x, y }];
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const a = baseAngle + Phaser.Math.FloatBetween(-0.15, 0.15);
    const r = length * t;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.82 });
  }
  g.lineStyle(width, c.ground, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
  g.strokePath();
  g.lineStyle(Math.max(1, width * 0.35), hot ? c.light : c.energy, alpha * (hot ? 0.62 : 0.42));
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
  g.strokePath();
  return pts;
}

function fadeAndDestroy(scene, target, delay, duration, ease = 'Sine.easeIn') {
  scene.tweens.add({
    targets: target,
    alpha: 0,
    delay,
    duration,
    ease,
    onComplete: () => target.destroy()
  });
}

function burstGroundChunks(scene, x, y, dir, rage, count = 12, power = 1) {
  const c = palette(rage);
  const { dx, dy, px, py } = dirInfo(dir);
  for (let i = 0; i < count; i++) {
    const side = Phaser.Math.FloatBetween(-1, 1);
    const back = Phaser.Math.FloatBetween(28, 75) * power;
    const lateral = Phaser.Math.FloatBetween(8, 42) * side * power;
    const chip = scene.add.rectangle(
      x - dx * Phaser.Math.Between(3, 12),
      y - dy * Phaser.Math.Between(3, 12) + 7,
      Phaser.Math.Between(3, 7),
      Phaser.Math.Between(2, 5),
      i % 5 === 0 ? c.energy : (i % 2 ? c.ground2 : c.ground),
      0.92
    ).setDepth(14).setRotation(Phaser.Math.FloatBetween(0, Math.PI));
    scene.tweens.add({
      targets: chip,
      x: x - dx * back + px * lateral,
      y: y - dy * back + py * lateral - Phaser.Math.Between(4, 20) * power,
      rotation: chip.rotation + Phaser.Math.FloatBetween(-3.6, 3.6),
      alpha: 0,
      duration: Phaser.Math.Between(260, 500),
      ease: 'Cubic.easeOut',
      onComplete: () => chip.destroy()
    });
  }
}

// ---------- PREPARAÇÃO ----------

export function playMinotaurChargeWindup(scene, x, y, dir, rage = false, duration = 600) {
  if (!scene?.sys?.isActive()) return;
  const c = palette(rage);
  const { dx, dy, px, py, angle } = dirInfo(dir);
  const ground = scene.add.graphics().setDepth(2);

  // Chão comprimido/rachado sob os dois cascos.
  ground.fillStyle(c.ground, 0.32);
  ground.fillEllipse(x, y + 8, 76, 38);
  ground.lineStyle(3, c.ground2, 0.68);
  ground.strokeEllipse(x, y + 8, 68, 32);

  [-1, 1].forEach((side) => {
    const hx = x - dx * 5 + px * 16 * side;
    const hy = y - dy * 5 + py * 16 * side + 8;
    drawHoof(ground, hx, hy, dir, c, 1.12, rage ? 0.72 : 0.58, 0.96);

    // As rachaduras nascem do casco e abrem para trás/lados, como se ele
    // estivesse "travando" o corpo contra o piso antes de arrancar.
    for (let i = 0; i < 4; i++) {
      const a = angle + Math.PI + Phaser.Math.FloatBetween(-0.8, 0.8) + side * 0.08;
      drawCrack(ground, hx - dx * 5, hy - dy * 5, a, Phaser.Math.Between(18, 42), c, i === 0, i === 0 ? 5 : 3, 0.85);
    }
  });

  // Anel baixo de pressão no chão.
  const pressure = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
  const state = { r: 22, a: 0.8 };
  scene.tweens.add({
    targets: state,
    r: 54,
    a: 0,
    duration: Math.min(520, duration),
    ease: 'Quad.easeOut',
    onUpdate: () => {
      pressure.clear();
      pressure.lineStyle(7, c.mid, state.a * 0.28);
      pressure.strokeEllipse(x, y + 7, state.r * 2, state.r * 0.82);
      pressure.lineStyle(2, c.energy, state.a * 0.62);
      pressure.strokeEllipse(x, y + 7, state.r * 1.72, state.r * 0.68);
    },
    onComplete: () => pressure.destroy()
  });

  // Energia comprime em direção ao corpo.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
    const dist = Phaser.Math.FloatBetween(36, 70);
    const sx = x + Math.cos(a) * dist;
    const sy = y + Math.sin(a) * dist * 0.62 + 3;
    const shard = scene.add.rectangle(sx, sy, Phaser.Math.Between(3, 7), 2, i % 3 ? c.energy : c.light, 0.86)
      .setDepth(15)
      .setRotation(a + Math.PI)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: shard,
      x: x + Phaser.Math.FloatBetween(-8, 8),
      y: y + Phaser.Math.FloatBetween(-5, 8),
      alpha: 0,
      scaleX: 0.18,
      delay: i * 13,
      duration: Math.max(180, duration * 0.72),
      ease: 'Cubic.easeIn',
      onComplete: () => shard.destroy()
    });
  }

  // Poeira acumulando junto dos cascos.
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? -1 : 1;
    const dust = scene.add.ellipse(
      x - dx * Phaser.Math.Between(4, 22) + px * side * Phaser.Math.Between(8, 24),
      y - dy * Phaser.Math.Between(4, 22) + py * side * Phaser.Math.Between(8, 24) + 10,
      Phaser.Math.Between(8, 17), Phaser.Math.Between(3, 7), c.dust, 0.58
    ).setDepth(6);
    scene.tweens.add({
      targets: dust,
      x: dust.x - dx * Phaser.Math.Between(8, 22) + px * side * Phaser.Math.Between(2, 12),
      y: dust.y - dy * Phaser.Math.Between(8, 22) - Phaser.Math.Between(2, 9),
      scaleX: 1.55,
      alpha: 0,
      duration: Phaser.Math.Between(300, Math.max(360, duration)),
      ease: 'Quad.easeOut',
      onComplete: () => dust.destroy()
    });
  }

  fadeAndDestroy(scene, ground, Math.max(140, duration - 80), 700);
}

function spawnChargeDustPlume(scene, x, y, dir, rage, count = 8, power = 1, spread = 1) {
  const c = palette(rage);
  const { dx, dy, px, py, angle } = dirInfo(dir);
  for (let i = 0; i < count; i++) {
    const side = Phaser.Math.FloatBetween(-1, 1) * spread;
    const backAngle = angle + Math.PI + Phaser.Math.FloatBetween(-0.72, 0.72) * spread;
    const dist = Phaser.Math.FloatBetween(22, 58) * power;
    const w = Phaser.Math.Between(10, 20) * power;
    const h = Phaser.Math.Between(4, 9) * power;
    const puff = scene.add.ellipse(
      x - dx * Phaser.Math.FloatBetween(0, 10) + px * side * 18,
      y - dy * Phaser.Math.FloatBetween(0, 10) + py * side * 18 + 10,
      w, h,
      i % 4 === 0 ? c.ground2 : c.dust,
      Phaser.Math.FloatBetween(0.44, 0.68)
    ).setDepth(9);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(backAngle) * dist + px * side * 8,
      y: y + Math.sin(backAngle) * dist * 0.58 - Phaser.Math.FloatBetween(10, 30) * power,
      scaleX: Phaser.Math.FloatBetween(1.7, 2.7),
      scaleY: Phaser.Math.FloatBetween(1.8, 3.0),
      alpha: 0,
      duration: Phaser.Math.Between(420, 760),
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy()
    });
  }
}

// ---------- ARRANCADA ----------

export function playMinotaurChargeLaunch(scene, x, y, dir, rage = false) {
  if (!scene?.sys?.isActive()) return;
  const c = palette(rage);
  const { dx, dy, px, py, angle } = dirInfo(dir);

  // O chão literalmente estoura atrás dos cascos no impulso.
  const ripped = scene.add.graphics().setDepth(2);
  [-1, 1].forEach((side) => {
    const hx = x - dx * 7 + px * 16 * side;
    const hy = y - dy * 7 + py * 16 * side + 8;
    drawHoof(ripped, hx, hy, dir, c, 1.28, rage ? 0.86 : 0.68, 1);
    for (let i = 0; i < 6; i++) {
      const a = angle + Math.PI + Phaser.Math.FloatBetween(-1.05, 1.05);
      const pts = drawCrack(ripped, hx - dx * 6, hy - dy * 6, a, Phaser.Math.Between(30, 68), c, i < 2, i < 2 ? 6 : 4, 0.94);
      if (i % 2 === 0 && pts.length > 2) {
        const p = pts[2];
        drawCrack(ripped, p.x, p.y, a + Phaser.Math.FloatBetween(-1.1, 1.1), Phaser.Math.Between(14, 28), c, false, 2.5, 0.7);
      }
    }
  });
  fadeAndDestroy(scene, ripped, 900, 1200);

  // Onda de força muito baixa no chão; vende o impulso sem cobrir sprites.
  const blast = scene.add.graphics().setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
  const blastState = { r: 10, a: 1 };
  scene.tweens.add({
    targets: blastState,
    r: 78,
    a: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      blast.clear();
      blast.lineStyle(13, c.mid, blastState.a * 0.24);
      blast.strokeEllipse(x - dx * 7, y - dy * 7 + 7, blastState.r * 2.2, blastState.r * 0.9);
      blast.lineStyle(5, c.energy, blastState.a * 0.72);
      blast.strokeEllipse(x - dx * 7, y - dy * 7 + 7, blastState.r * 1.8, blastState.r * 0.7);
      blast.lineStyle(2, c.light, blastState.a * 0.82);
      blast.strokeEllipse(x - dx * 7, y - dy * 7 + 7, blastState.r * 1.5, blastState.r * 0.58);
    },
    onComplete: () => blast.destroy()
  });

  // Linhas de impacto arremessadas para trás.
  const burst = scene.add.graphics().setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
  for (let i = -3; i <= 3; i++) {
    const side = i * 8;
    burst.lineStyle(i === 0 ? 7 : 3.5, i === 0 ? c.light : c.energy, i === 0 ? 0.94 : 0.6);
    burst.beginPath();
    burst.moveTo(x + px * side - dx * 9, y + py * side - dy * 9 + 4);
    burst.lineTo(x + px * side * 1.35 - dx * (44 + Math.abs(i) * 7), y + py * side * 1.35 - dy * (44 + Math.abs(i) * 7) + 4);
    burst.strokePath();
  }
  scene.tweens.add({
    targets: burst,
    alpha: 0,
    scaleX: 1.32,
    scaleY: 1.16,
    duration: 190,
    ease: 'Cubic.easeOut',
    onComplete: () => burst.destroy()
  });

  burstGroundChunks(scene, x, y, dir, rage, 24, 1.28);

  // A arrancada levanta uma parede curta de poeira. É isso que vende o
  // PESO antes mesmo do jogador perceber a velocidade do dash.
  spawnChargeDustPlume(scene, x - dx * 5, y - dy * 5, dir, rage, 22, 1.28, 1.15);

  // Clarão de pressão no ponto exato onde os cascos largam o chão.
  const launchFlash = scene.add.image(x - dx * 7, y - dy * 7 + 4, 'hit_fx')
    .setDepth(20)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(c.light)
    .setScale(rage ? 3.6 : 3.2)
    .setAlpha(rage ? 0.82 : 0.72);
  scene.tweens.add({
    targets: launchFlash,
    scale: launchFlash.scale * 1.85,
    alpha: 0,
    duration: 150,
    ease: 'Cubic.easeOut',
    onComplete: () => launchFlash.destroy()
  });

  // Duas nuvens de poeira pesadas explodem atrás dos cascos.
  for (let i = 0; i < 16; i++) {
    const side = Phaser.Math.FloatBetween(-1, 1);
    const backAngle = angle + Math.PI + Phaser.Math.FloatBetween(-0.78, 0.78);
    const d = Phaser.Math.Between(30, 78);
    const puff = scene.add.ellipse(
      x - dx * 8 + px * side * 14,
      y - dy * 8 + py * side * 14 + 9,
      Phaser.Math.Between(13, 27), Phaser.Math.Between(6, 12), c.dust, 0.74
    ).setDepth(8);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(backAngle) * d,
      y: y + Math.sin(backAngle) * d * 0.7 - Phaser.Math.Between(8, 24),
      scaleX: Phaser.Math.FloatBetween(1.8, 2.7),
      scaleY: Phaser.Math.FloatBetween(1.8, 2.8),
      alpha: 0,
      duration: Phaser.Math.Between(360, 620),
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy()
    });
  }
}

// ---------- CORRIDA ----------

// stepSide alterna -1/+1 para formar pegadas reais, em vez de duas linhas.
export function emitMinotaurChargeTrail(scene, x, y, dir, rage = false, stepSide = 1, stepIndex = 0) {
  if (!scene?.sys?.isActive()) return;
  const c = palette(rage);
  const { dx, dy, px, py, angle } = dirInfo(dir);
  const side = stepSide < 0 ? -1 : 1;

  // Uma pegada de casco bipartido por passada.
  const hx = x - dx * 16 + px * 14 * side;
  const hy = y - dy * 16 + py * 14 * side + 8;
  const mark = scene.add.graphics().setDepth(2);
  drawHoof(mark, hx, hy, dir, c, 1.05, rage ? 0.8 : 0.78, 0.84);

  // Cada pisada abre pequenas fissuras no chão. Algumas passadas criam uma
  // fissura maior, para a corrida parecer pesada em vez de "deslizar".
  const cracks = side > 0 ? 4 : 3;
  for (let i = 0; i < cracks; i++) {
    const a = angle + Math.PI + Phaser.Math.FloatBetween(-1.15, 1.15);
    const len = Phaser.Math.Between(14, i === 0 ? 38 : 29);
    const pts = drawCrack(mark, hx - dx * 4, hy - dy * 4, a, len, c, i === 0 && rage, i === 0 ? 4.5 : 2.5, 0.82);
    if (i === 0 && side > 0 && pts.length > 2) {
      const p = pts[2];
      drawCrack(mark, p.x, p.y, a + Phaser.Math.FloatBetween(-0.9, 0.9), Phaser.Math.Between(10, 20), c, false, 2, 0.58);
    }
  }
  fadeAndDestroy(scene, mark, 720, 1150);

  // Cada passada levanta poeira do casco. Durante a investida isso forma
  // uma cauda de chão sendo arrancado, não só uma sequência de desenhos.
  spawnChargeDustPlume(scene, hx, hy, dir, rage, stepIndex % 3 === 0 ? 7 : 5, stepIndex % 3 === 0 ? 0.82 : 0.62, 0.7);

  // Pancada curtíssima a cada algumas passadas: sensação de tonelagem sem
  // transformar o dash em uma câmera tremendo o tempo todo.
  if (stepIndex % 3 === 0) {
    scene.cameras.main.shake(58, rage ? 0.0025 : 0.0022);
    const stomp = scene.add.graphics().setDepth(10).setBlendMode(Phaser.BlendModes.ADD);
    const kick = { r: 6, a: 0.58 };
    scene.tweens.add({
      targets: kick, r: 26, a: 0, duration: 135, ease: 'Cubic.easeOut',
      onUpdate: () => {
        stomp.clear();
        stomp.lineStyle(3.5, c.energy, kick.a);
        stomp.strokeEllipse(hx, hy + 1, kick.r * 2, kick.r * 0.72);
      },
      onComplete: () => stomp.destroy()
    });
  }

  // Poeira/fragmentos saem da própria pisada, não do centro do Minotauro.
  for (let i = 0; i < 4; i++) {
    const a = angle + Math.PI + Phaser.Math.FloatBetween(-0.75, 0.75);
    const d = Phaser.Math.Between(18, 42);
    const chip = scene.add.rectangle(hx, hy, Phaser.Math.Between(2, 5), Phaser.Math.Between(2, 4), i === 0 ? c.light : (i === 1 ? c.energy : c.ground2), 0.88)
      .setDepth(8).setRotation(Phaser.Math.FloatBetween(0, Math.PI));
    scene.tweens.add({
      targets: chip,
      x: hx + Math.cos(a) * d,
      y: hy + Math.sin(a) * d * 0.68 - Phaser.Math.Between(2, 10),
      alpha: 0,
      rotation: chip.rotation + Phaser.Math.FloatBetween(-2, 2),
      duration: Phaser.Math.Between(220, 360),
      ease: 'Quad.easeOut',
      onComplete: () => chip.destroy()
    });
  }

  // Compressão do ar na frente, curta e agressiva.
  const air = scene.add.graphics().setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
  for (let i = -1; i <= 1; i += 2) {
    const off = i * 23;
    air.lineStyle(rage ? 5 : 3.5, i > 0 ? c.light : c.energy, rage ? 0.68 : 0.5);
    air.beginPath();
    air.moveTo(x + dx * 17 + px * off, y + dy * 17 + py * off);
    air.lineTo(x + dx * 49 + px * (off * 0.48), y + dy * 49 + py * (off * 0.48));
    air.strokePath();
  }
  scene.tweens.add({ targets: air, alpha: 0, duration: 90, onComplete: () => air.destroy() });
}

// ---------- FRENAGEM / FIM ----------

export function playMinotaurChargeStop(scene, x, y, dir, rage = false) {
  if (!scene?.sys?.isActive()) return;
  const c = palette(rage);
  const { dx, dy, px, py, angle } = dirInfo(dir);

  // Os dois cascos raspam e abrem sulcos longos antes do ponto de parada.
  const scar = scene.add.graphics().setDepth(2);
  [-1, 1].forEach((side) => {
    const off = 15 * side;
    const endX = x + px * off - dx * 5;
    const endY = y + py * off - dy * 5 + 7;
    const startX = endX - dx * 94 + px * side * 4;
    const startY = endY - dy * 94 + py * side * 4;

    scar.lineStyle(12, c.ground, 0.84);
    scar.beginPath();
    scar.moveTo(startX, startY);
    scar.lineTo(endX, endY);
    scar.strokePath();
    scar.lineStyle(5, c.ground2, 0.8);
    scar.beginPath();
    scar.moveTo(startX + dx * 7, startY + dy * 7);
    scar.lineTo(endX, endY);
    scar.strokePath();
    scar.lineStyle(2, c.energy, rage ? 0.7 : 0.46);
    scar.beginPath();
    scar.moveTo(startX + dx * 26, startY + dy * 26);
    scar.lineTo(endX - dx * 2, endY - dy * 2);
    scar.strokePath();

    // Pegada final profundamente cravada.
    drawHoof(scar, endX, endY, dir, c, 1.15, rage ? 0.78 : 0.58, 0.96);
  });

  // Fratura frontal em leque.
  for (let i = -3; i <= 3; i++) {
    const fan = i * 0.22;
    const ca = angle + fan;
    const start = 10 + Math.abs(i) * 2;
    const len = 28 + (3 - Math.abs(i)) * 11;
    const sx = x + Math.cos(ca) * start;
    const sy = y + Math.sin(ca) * start * 0.78 + 6;
    const pts = drawCrack(scar, sx, sy, ca, len, c, i === 0, i === 0 ? 6 : 3.5, 0.94);
    if (Math.abs(i) <= 1 && pts.length > 2) {
      const p = pts[2];
      drawCrack(scar, p.x, p.y, ca + Phaser.Math.FloatBetween(-0.85, 0.85), Phaser.Math.Between(13, 24), c, false, 2.2, 0.62);
    }
  }
  fadeAndDestroy(scene, scar, 1500, 1500);

  // Pancada baixa no ponto de parada.
  const shock = scene.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
  const state = { r: 8, a: 1 };
  scene.tweens.add({
    targets: state,
    r: 64,
    a: 0,
    duration: 280,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      shock.clear();
      shock.lineStyle(10, c.mid, state.a * 0.34);
      shock.strokeEllipse(x, y + 6, state.r * 2.2, state.r * 0.9);
      shock.lineStyle(4, c.energy, state.a * 0.82);
      shock.strokeEllipse(x, y + 6, state.r * 1.86, state.r * 0.72);
      shock.lineStyle(1.8, c.light, state.a * 0.76);
      shock.strokeEllipse(x, y + 6, state.r * 1.56, state.r * 0.58);
    },
    onComplete: () => shock.destroy()
  });

  // Poeira e pedaços de chão são jogados para trás pela frenagem.
  burstGroundChunks(scene, x, y, dir, rage, 12, 0.9);
  for (let i = 0; i < 10; i++) {
    const spread = Phaser.Math.FloatBetween(-0.92, 0.92);
    const backAngle = angle + Math.PI + spread;
    const d = Phaser.Math.Between(26, 66);
    const dust = scene.add.ellipse(x - dx * 4, y - dy * 4 + 8, Phaser.Math.Between(9, 18), Phaser.Math.Between(4, 8), c.dust, 0.6)
      .setDepth(7);
    scene.tweens.add({
      targets: dust,
      x: x + Math.cos(backAngle) * d,
      y: y + Math.sin(backAngle) * d * 0.64 + 5,
      scaleX: 1.8,
      alpha: 0,
      duration: Phaser.Math.Between(330, 560),
      ease: 'Cubic.easeOut',
      onComplete: () => dust.destroy()
    });
  }
}
