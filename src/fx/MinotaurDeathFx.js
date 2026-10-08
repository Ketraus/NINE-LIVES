// Sequência de morte do Minotauro.
// Não depende de animação desenhada: usa o próprio sprite, Graphics, hit_fx,
// câmera e sons já carregados. Quando uma animação de morte existir, ela pode
// entrar no lugar do squash/tint sem jogar fora o resto desta coreografia.

const PHASE1 = Object.freeze({
  main: 0xe044ff,
  bright: 0xffb9ff,
  mid: 0x8d2ab6,
  deep: 0x2a0a36,
  smoke: 0x171019,
  scar: 0x32133e
});

const PHASE2 = Object.freeze({
  main: 0x32e9d6,
  bright: 0xeafffb,
  mid: 0x159aa0,
  deep: 0x062b32,
  smoke: 0x0b171a,
  scar: 0x163b40
});

const DEPTH_GROUND = 2;
const DEPTH_BEHIND_BOSS = 8;
const DEPTH_BODY_FX = 18;
const DEPTH_FRONT_FX = 24;

function safeLater(scene, delay, callback) {
  return scene.time.delayedCall(delay, () => {
    if (!scene?.sys?.isActive()) return;
    callback();
  });
}

function briefHitstop(scene, duration = 80) {
  const world = scene.physics?.world;
  if (!world) return;
  const wasPaused = world.isPaused === true;
  if (!wasPaused) world.pause();
  safeLater(scene, duration, () => {
    if (!wasPaused && scene.physics?.world) scene.physics.world.resume();
  });
}

function shockRing(scene, x, y, radius, palette, strength = 1, delay = 0) {
  safeLater(scene, delay, () => {
    const g = scene.add.graphics().setDepth(DEPTH_BODY_FX).setBlendMode(Phaser.BlendModes.ADD);
    const state = { r: radius * 0.12, a: 1 };
    scene.tweens.add({
      targets: state,
      r: radius,
      a: 0,
      duration: 300 + strength * 90,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(12 * strength, palette.deep, state.a * 0.26);
        g.strokeEllipse(x, y + 7, state.r * 2.25, state.r * 1.12);
        g.lineStyle(5 * strength, palette.main, state.a * 0.72);
        g.strokeEllipse(x, y + 6, state.r * 2.05, state.r * 0.98);
        g.lineStyle(2.2 * strength, palette.bright, state.a * 0.92);
        g.strokeEllipse(x, y + 5, state.r * 1.84, state.r * 0.84);
      },
      onComplete: () => g.destroy()
    });
  });
}

function bodyFlash(scene, boss, palette, alpha = 0.95, duration = 110) {
  if (!boss.active) return;
  const oldTint = boss.tintTopLeft;
  boss.setTintFill(palette.bright);
  boss.setAlpha(Math.max(boss.alpha, alpha));
  safeLater(scene, duration, () => {
    if (!boss.active) return;
    boss.clearTint();
    // Minotauro usa a arte como cor principal; não precisamos manter o fill.
    // Um tint antigo de status seria indevido aqui porque ele já está morto.
    if (oldTint && oldTint !== 0xffffff) boss.setTint(0xffffff);
  });
}

function spawnLeakBurst(scene, boss, palette, count = 9, power = 1) {
  const x = boss.x;
  const y = boss.y - boss.displayHeight * 0.06;
  for (let i = 0; i < count; i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const startR = Phaser.Math.FloatBetween(4, Math.max(8, boss.displayWidth * 0.2));
    const dist = Phaser.Math.FloatBetween(28, 76) * power;
    const p = scene.add.image(
      x + Math.cos(a) * startR,
      y + Math.sin(a) * startR * 0.7,
      'hit_fx'
    )
      .setDepth(DEPTH_FRONT_FX)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(i % 4 === 0 ? palette.bright : palette.main)
      .setAlpha(Phaser.Math.FloatBetween(0.55, 0.95))
      .setRotation(a)
      .setScale(
        Phaser.Math.FloatBetween(0.08, 0.2) * power,
        Phaser.Math.FloatBetween(0.025, 0.07)
      );
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist * 0.72 - Phaser.Math.Between(5, 24),
      scaleX: p.scaleX * 0.18,
      alpha: 0,
      duration: Phaser.Math.Between(260, 520),
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy()
    });
  }
}

function spawnGroundDebris(scene, x, y, radius, palette, count = 12) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.28, 0.28);
    const dist = radius * Phaser.Math.FloatBetween(0.45, 1.15);
    const size = Phaser.Math.FloatBetween(3, 7);
    const piece = scene.add.rectangle(
      x,
      y + 10,
      size,
      size * Phaser.Math.FloatBetween(0.45, 0.85),
      i % 4 === 0 ? palette.mid : 0x172126,
      0.9
    )
      .setDepth(DEPTH_FRONT_FX - 2)
      .setRotation(a + Phaser.Math.FloatBetween(-0.6, 0.6));
    scene.tweens.add({
      targets: piece,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist * 0.7 - Phaser.Math.FloatBetween(6, 26),
      rotation: piece.rotation + Phaser.Math.FloatBetween(-3.5, 3.5),
      alpha: 0,
      duration: Phaser.Math.Between(340, 620),
      ease: 'Cubic.easeOut',
      onComplete: () => piece.destroy()
    });
  }
}

function createDeathScar(scene, x, y, radius, palette) {
  const g = scene.add.graphics().setDepth(DEPTH_GROUND);
  const rng = (a, b) => Phaser.Math.FloatBetween(a, b);

  // Mancha irregular: escura o suficiente para parecer terreno queimado,
  // mas não um buraco preto chapado.
  const points = [];
  const pointCount = 30;
  const rotation = rng(0, Math.PI * 2);
  for (let i = 0; i < pointCount; i++) {
    const a = rotation + (i / pointCount) * Math.PI * 2;
    const r = radius * rng(0.72, 1.05);
    points.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.68 });
  }
  g.fillStyle(0x10191d, 0.68);
  g.fillPoints(points, true);

  // Centro quebrado e borda levantada.
  g.fillStyle(palette.deep, 0.26);
  g.fillEllipse(x, y + 5, radius * 1.2, radius * 0.62);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng(-0.11, 0.11);
    const d = radius * rng(0.62, 0.95);
    g.fillStyle(i % 3 === 0 ? 0x26343a : 0x1b282d, rng(0.45, 0.68));
    g.fillEllipse(
      x + Math.cos(a) * d,
      y + Math.sin(a) * d * 0.68,
      radius * rng(0.12, 0.22),
      radius * rng(0.045, 0.09)
    );
  }

  // Rachaduras radiais, núcleo escuro + veia energética estreita.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng(-0.16, 0.16);
    const length = radius * rng(0.7, 1.45);
    const crack = [];
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      const wobble = rng(-0.11, 0.11);
      crack.push([
        x + Math.cos(a + wobble) * length * t,
        y + Math.sin(a + wobble) * length * t * 0.72
      ]);
    }
    g.lineStyle(6, 0x111a1e, 0.9);
    g.beginPath();
    crack.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.strokePath();
    g.lineStyle(2, palette.main, 0.58);
    g.beginPath();
    crack.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.strokePath();
  }

  // A energia morre antes da cicatriz, deixando o chão queimado por mais tempo.
  const energy = scene.add.ellipse(x, y + 4, radius * 1.16, radius * 0.58, palette.main, 0.22)
    .setDepth(DEPTH_GROUND + 0.1)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: energy,
    alpha: 0,
    scaleX: 0.72,
    scaleY: 0.72,
    duration: 1800,
    ease: 'Sine.easeOut',
    onComplete: () => energy.destroy()
  });

  scene.tweens.add({
    targets: g,
    alpha: 0,
    delay: 5000,
    duration: 2600,
    ease: 'Sine.easeIn',
    onComplete: () => g.destroy()
  });
}

function spawnImplosion(scene, boss, palette) {
  const x = boss.x;
  const y = boss.y - 4;

  // Escuridão atrás do corpo: cria a sensação de energia sendo sugada para dentro.
  const vacuum = scene.add.circle(x, y, 10, 0x020608, 0.82).setDepth(DEPTH_BEHIND_BOSS);
  scene.tweens.add({
    targets: vacuum,
    scale: 5.5,
    alpha: 0.92,
    duration: 150,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: vacuum,
        scale: 0.08,
        alpha: 0,
        duration: 210,
        ease: 'Cubic.easeIn',
        onComplete: () => vacuum.destroy()
      });
    }
  });

  // Partículas começam longe e são puxadas violentamente pro centro.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.16, 0.16);
    const r = Phaser.Math.FloatBetween(70, 155);
    const p = scene.add.rectangle(
      x + Math.cos(a) * r,
      y + Math.sin(a) * r * 0.72,
      Phaser.Math.FloatBetween(3, 8),
      Phaser.Math.FloatBetween(1, 3),
      i % 5 === 0 ? palette.bright : palette.main,
      0.9
    )
      .setDepth(DEPTH_FRONT_FX)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(a + Math.PI);
    scene.tweens.add({
      targets: p,
      x: x + Phaser.Math.FloatBetween(-4, 4),
      y: y + Phaser.Math.FloatBetween(-5, 5),
      alpha: 0.15,
      scaleX: 0.16,
      duration: Phaser.Math.Between(180, 300),
      ease: 'Cubic.easeIn',
      onComplete: () => p.destroy()
    });
  }

  // Eco espectral do próprio Minotauro: sobe um pouco e volta pro corpo.
  try {
    const echo = scene.add.image(x, boss.y, boss.texture.key, boss.frame.name)
      .setDepth(boss.depth + 0.4)
      .setOrigin(boss.originX, boss.originY)
      .setScale(boss.scaleX, boss.scaleY)
      .setFlipX(boss.flipX)
      .setTint(palette.bright)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.32);
    scene.tweens.add({
      targets: echo,
      y: boss.y - 24,
      scaleX: boss.scaleX * 1.05,
      scaleY: boss.scaleY * 1.05,
      alpha: 0.5,
      duration: 150,
      ease: 'Sine.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: echo,
          x,
          y: boss.y,
          scaleX: boss.scaleX * 0.35,
          scaleY: boss.scaleY * 0.35,
          alpha: 0,
          duration: 180,
          ease: 'Cubic.easeIn',
          onComplete: () => echo.destroy()
        });
      }
    });
  } catch (_) {
    // Se o frame atual não puder ser clonado, o resto da sequência continua.
  }
}

function finalRupture(scene, boss, x, y, palette) {
  const cam = scene.cameras.main;
  briefHitstop(scene, 78);
  cam.flash(105, 225, 255, 250, true);
  cam.shake(560, 0.042);
  scene.sound.play('sfx_blastwave', { volume: 0.82, rate: 0.92 });
  scene.sound.play('sfx_cyberus_explosion', { volume: 0.58, rate: 0.88 });

  createDeathScar(scene, x, y + 12, 86, palette);
  spawnGroundDebris(scene, x, y + 8, 115, palette, 22);

  // Clarão em três camadas: núcleo branco, aqua/roxo e halo escuro.
  const darkHalo = scene.add.circle(x, y, 16, palette.deep, 0.78).setDepth(DEPTH_BODY_FX - 1);
  const energyHalo = scene.add.image(x, y, 'hit_fx')
    .setDepth(DEPTH_BODY_FX)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(palette.main)
    .setScale(4.2)
    .setAlpha(0.8);
  const whiteCore = scene.add.image(x, y, 'hit_fx')
    .setDepth(DEPTH_FRONT_FX + 2)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(palette.bright)
    .setScale(2.4)
    .setAlpha(1);

  scene.tweens.add({ targets: darkHalo, scale: 7.5, alpha: 0, duration: 390, ease: 'Cubic.easeOut', onComplete: () => darkHalo.destroy() });
  scene.tweens.add({ targets: energyHalo, scale: 10, alpha: 0, duration: 430, ease: 'Cubic.easeOut', onComplete: () => energyHalo.destroy() });
  scene.tweens.add({ targets: whiteCore, scale: 7.2, alpha: 0, duration: 230, ease: 'Cubic.easeOut', onComplete: () => whiteCore.destroy() });

  // Duas ondas de choque, uma imediata e outra atrasada.
  shockRing(scene, x, y + 12, 135, palette, 1.25, 0);
  shockRing(scene, x, y + 12, 165, palette, 0.75, 90);

  // Raios curtos, largos e pixelados: grande impacto sem encher a tela de partículas miúdas.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.1, 0.1);
    const ray = scene.add.rectangle(
      x,
      y,
      Phaser.Math.FloatBetween(18, 40),
      Phaser.Math.FloatBetween(2, 5),
      i % 4 === 0 ? palette.bright : palette.main,
      Phaser.Math.FloatBetween(0.55, 0.9)
    )
      .setDepth(DEPTH_FRONT_FX)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setOrigin(0, 0.5)
      .setRotation(a);
    scene.tweens.add({
      targets: ray,
      scaleX: Phaser.Math.FloatBetween(2.5, 5.5),
      alpha: 0,
      duration: Phaser.Math.Between(220, 410),
      ease: 'Cubic.easeOut',
      onComplete: () => ray.destroy()
    });
  }

  // Pixels do corpo se desfazendo em fragmentos energizados.
  const halfW = Math.max(22, boss.displayWidth * 0.28);
  const halfH = Math.max(28, boss.displayHeight * 0.32);
  for (let i = 0; i < 34; i++) {
    const sx = x + Phaser.Math.FloatBetween(-halfW, halfW);
    const sy = y + Phaser.Math.FloatBetween(-halfH, halfH);
    const a = Math.atan2(sy - y, sx - x) + Phaser.Math.FloatBetween(-0.45, 0.45);
    const dist = Phaser.Math.FloatBetween(45, 145);
    const size = Phaser.Math.Between(3, 7);
    const pixel = scene.add.rectangle(
      sx,
      sy,
      size,
      Phaser.Math.Between(2, 6),
      Phaser.Utils.Array.GetRandom([palette.deep, palette.mid, palette.main, palette.bright, 0x26343a]),
      0.95
    )
      .setDepth(DEPTH_FRONT_FX + 1)
      .setRotation(Phaser.Math.FloatBetween(0, Math.PI));
    scene.tweens.add({
      targets: pixel,
      x: sx + Math.cos(a) * dist,
      y: sy + Math.sin(a) * dist * 0.72 - Phaser.Math.FloatBetween(0, 35),
      rotation: pixel.rotation + Phaser.Math.FloatBetween(-4, 4),
      alpha: 0,
      duration: Phaser.Math.Between(380, 720),
      ease: 'Cubic.easeOut',
      onComplete: () => pixel.destroy()
    });
  }

  // Poeira pesada fica baixa, para o jogador continuar enxergando a arena.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
    const d = Phaser.Math.FloatBetween(20, 75);
    const puff = scene.add.circle(
      x + Math.cos(a) * d * 0.35,
      y + 10 + Math.sin(a) * d * 0.18,
      Phaser.Math.FloatBetween(8, 17),
      i % 3 === 0 ? palette.deep : palette.smoke,
      Phaser.Math.FloatBetween(0.38, 0.62)
    ).setDepth(DEPTH_BODY_FX - 2);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(a) * d * 1.25,
      y: y + 10 + Math.sin(a) * d * 0.5 - Phaser.Math.FloatBetween(4, 18),
      scale: Phaser.Math.FloatBetween(1.4, 2.1),
      alpha: 0,
      duration: Phaser.Math.Between(520, 900),
      ease: 'Sine.easeOut',
      onComplete: () => puff.destroy()
    });
  }

  if (boss.active) {
    scene.tweens.killTweensOf(boss);
    scene.tweens.add({
      targets: boss,
      alpha: 0,
      scaleX: boss.scaleX * 1.12,
      scaleY: boss.scaleY * 1.12,
      duration: 190,
      ease: 'Cubic.easeOut'
    });
    if (boss.shadow?.active) {
      scene.tweens.add({ targets: boss.shadow, alpha: 0, scaleX: 1.5, scaleY: 0.75, duration: 260 });
    }
  }
}

// Duração aproximada: 2,55 s.
// onComplete é chamado só depois do grande estouro, para XP/score/música de boss
// não cortarem o clímax no primeiro frame em que a vida chegou a zero.
export function playMinotaurDeathSequence(scene, boss, onComplete) {
  if (!scene?.sys?.isActive() || !boss?.active) {
    onComplete?.();
    return;
  }

  const palette = boss.isEnraged ? PHASE2 : PHASE1;
  const originX = boss.x;
  const originY = boss.y;
  const baseScaleX = boss.scaleX;
  const baseScaleY = boss.scaleY;

  // 0 ms — golpe fatal: trava curta, corpo branco e o chão responde na hora.
  briefHitstop(scene, 92);
  scene.cameras.main.shake(190, 0.024);
  scene.sound.play('sfx_minotaur_heavy_axe_impact', { volume: 0.82, rate: 0.78 });
  bodyFlash(scene, boss, palette, 1, 105);
  shockRing(scene, originX, originY + 10, 78, palette, 0.8);
  spawnGroundDebris(scene, originX, originY + 12, 70, palette, 8);

  // 180 ms — pernas cedem. Sem fingir animação: squash curto e deliberado.
  safeLater(scene, 180, () => {
    if (!boss.active) return;
    scene.tweens.add({
      targets: boss,
      y: originY + 11,
      scaleX: baseScaleX * 1.055,
      scaleY: baseScaleY * 0.88,
      duration: 360,
      ease: 'Cubic.easeOut'
    });
    if (boss.shadow?.active) {
      scene.tweens.add({ targets: boss.shadow, scaleX: 1.16, scaleY: 0.86, alpha: 0.32, duration: 360 });
    }
  });

  // 420/760/1080 ms — três batidas de instabilidade, cada uma mais forte.
  [
    { t: 420, shake: 0.006, count: 7, power: 0.75, ring: 58 },
    { t: 760, shake: 0.009, count: 10, power: 0.95, ring: 72 },
    { t: 1080, shake: 0.014, count: 14, power: 1.18, ring: 92 }
  ].forEach((pulse, index) => {
    safeLater(scene, pulse.t, () => {
      if (!boss.active) return;
      scene.cameras.main.shake(95 + index * 25, pulse.shake);
      scene.sound.play('sfx_minotaur_stomp', { volume: 0.18 + index * 0.08, rate: 0.72 + index * 0.08 });
      bodyFlash(scene, boss, palette, 0.9, 68);
      spawnLeakBurst(scene, boss, palette, pulse.count, pulse.power);
      shockRing(scene, boss.x, originY + 12, pulse.ring, palette, 0.5 + index * 0.12);
    });
  });

  // 1320 ms — rachaduras começam a anunciar o ponto do colapso final.
  safeLater(scene, 1320, () => {
    const crack = scene.add.graphics().setDepth(DEPTH_GROUND + 0.2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const len = Phaser.Math.FloatBetween(34, 72);
      crack.lineStyle(5, 0x111a1e, 0.78);
      crack.beginPath();
      crack.moveTo(originX, originY + 12);
      crack.lineTo(originX + Math.cos(a) * len * 0.48, originY + 12 + Math.sin(a) * len * 0.34);
      crack.lineTo(originX + Math.cos(a + 0.1) * len, originY + 12 + Math.sin(a + 0.1) * len * 0.7);
      crack.strokePath();
      crack.lineStyle(1.7, palette.main, 0.68);
      crack.beginPath();
      crack.moveTo(originX, originY + 12);
      crack.lineTo(originX + Math.cos(a) * len * 0.48, originY + 12 + Math.sin(a) * len * 0.34);
      crack.lineTo(originX + Math.cos(a + 0.1) * len, originY + 12 + Math.sin(a + 0.1) * len * 0.7);
      crack.strokePath();
    }
    scene.tweens.add({ targets: crack, alpha: 0, delay: 1150, duration: 900, onComplete: () => crack.destroy() });
  });

  // 1640 ms — implosão: tudo vai para dentro antes do rompimento.
  safeLater(scene, 1640, () => {
    if (!boss.active) return;
    scene.cameras.main.shake(160, 0.008);
    scene.sound.play('sfx_blastwave', { volume: 0.28, rate: 0.55 });
    spawnImplosion(scene, boss, palette);
    boss.setTint(0x071216);
    scene.tweens.add({
      targets: boss,
      scaleX: baseScaleX * 0.94,
      scaleY: baseScaleY * 0.82,
      duration: 280,
      ease: 'Cubic.easeIn'
    });
  });

  // 1980 ms — ruptura final.
  safeLater(scene, 1980, () => {
    finalRupture(scene, boss, originX, originY + 2, palette);
  });

  // Dá tempo da onda/fragmentos aparecerem antes do objeto real sumir e do
  // evento enemy-died disparar score/XP/restauração da música.
  safeLater(scene, 2550, () => onComplete?.());
}
