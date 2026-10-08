// Corte circular pós-investida do Minotauro.
// Usa a arte enviada pelo artista, mas com um boost de brilho/legibilidade na 2ª fase.
const KEY = 'minotaur_charge_swing';

export function loadMinotaurChargeSwing(scene) {
  scene.load.image(KEY, 'assets/fx/minotaur_charge_swing.png');
  scene.load.image(KEY + '_rage', 'assets/fx/minotaur_charge_swing_rage.png');
}

export function prepareMinotaurChargeSwing(scene) {
  if (scene.textures.exists(KEY)) scene.textures.get(KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
  if (scene.textures.exists(KEY + '_rage')) scene.textures.get(KEY + '_rage').setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function playMinotaurChargeSwing(scene, x, y, radius, rage = false) {
  if (!scene.textures.exists(KEY)) return;
  leaveChargeSwingScar(scene, x, y, radius, rage);

  const imgKey = rage ? KEY + '_rage' : KEY;

  // Clarão central rápido pra dar mais leitura ao corte da 2ª fase.
  if (rage) {
    const flareBack = scene.add.image(x, y, 'hit_fx')
      .setDepth(23)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0x35dccc)
      .setScale(radius / 13)
      .setAlpha(0.48);
    const flareCore = scene.add.image(x, y, 'hit_fx')
      .setDepth(24)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xf2fffd)
      .setScale(radius / 20)
      .setAlpha(0.58);
    scene.tweens.add({ targets: flareBack, scale: flareBack.scale * 1.5, alpha: 0, duration: 220, ease: 'Cubic.easeOut', onComplete: () => flareBack.destroy() });
    scene.tweens.add({ targets: flareCore, scale: flareCore.scale * 1.35, alpha: 0, duration: 170, ease: 'Cubic.easeOut', onComplete: () => flareCore.destroy() });
  }

  // Elos do desenho giram e se expandem como a lâmina circular.
  const layers = [
    { start: 0.44, alpha: 1.0, rot: 0, dur: 240, target: 2.08 },
    { start: 0.52, alpha: rage ? 0.88 : 0.72, rot: Math.PI / 2, dur: 320, target: 2.02 },
    { start: 0.36, alpha: rage ? 0.52 : 0.36, rot: Math.PI / 4, dur: 210, target: 1.88 }
  ];

  layers.forEach((cfg, i) => {
    const ring = scene.add.image(x, y, imgKey)
      .setDepth(20 + i)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(cfg.start)
      .setAlpha(cfg.alpha)
      .setRotation(cfg.rot);
    scene.tweens.add({
      targets: ring,
      scaleX: radius * cfg.target / ring.width,
      scaleY: radius * (rage ? cfg.target * 0.95 : cfg.target * 0.9) / ring.height,
      rotation: cfg.rot + (i % 2 === 0 ? 1 : -1) * Math.PI * (rage ? 1.45 : 1.2),
      alpha: 0,
      duration: cfg.dur,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
  });

  // Aro de energia por cima da arte.
  const g = scene.add.graphics().setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
  const state = { r: radius * 0.22, a: 1 };
  scene.tweens.add({
    targets: state,
    r: radius * 1.05,
    a: 0,
    duration: 320,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      g.clear();
      const outerColor = rage ? 0x117783 : 0x7a22dd;
      const midColor = rage ? 0x39ded0 : 0xd9a2ff;
      const innerColor = rage ? 0xf2fffd : 0xf6dbff;
      g.lineStyle(rage ? 16 : 12, outerColor, state.a * (rage ? 0.34 : 0.44));
      g.strokeEllipse(x, y, state.r * 2.06, state.r * 1.86);
      g.lineStyle(rage ? 8 : 4, midColor, state.a * 0.95);
      g.strokeEllipse(x, y, state.r * 1.98, state.r * 1.78);
      g.lineStyle(rage ? 3 : 2, innerColor, state.a);
      g.strokeEllipse(x, y, state.r * 1.84, state.r * 1.64);
    },
    onComplete: () => g.destroy()
  });

  // Faíscas mais intensas na 2ª fase.
  const sparkCount = rage ? 22 : 16;
  for (let i = 0; i < sparkCount; i++) {
    const a = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.18;
    const d = radius * (0.5 + Math.random() * 0.52);
    const spark = scene.add.rectangle(
      x + Math.cos(a) * radius * 0.26,
      y + Math.sin(a) * radius * 0.26,
      rage ? 6 : 5,
      rage ? 3.5 : 3,
      i % 3 ? (rage ? 0x39ded0 : 0xa04dff) : (rage ? 0xf2fffd : 0xf0ceff),
      1
    )
      .setDepth(25)
      .setRotation(a)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      scaleX: 0.18,
      duration: 220 + Math.random() * 170,
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy()
    });
  }
}

// Cicatriz física do impacto: sulcos e rachaduras no chão.
// Na 2ª fase, o desenho fica mais claro e menos apagado.
function leaveChargeSwingScar(scene, x, y, radius, rage = false) {
  const scar = scene.add.graphics().setDepth(1);
  const angle = Math.random() * Math.PI * 2;
  const sweep = Math.PI * 1.58;
  const draw = (opacity) => {
    scar.clear();
    const segments = 32;
    for (let layer = 0; layer < 3; layer++) {
      const r = radius * (0.90 + layer * 0.065);
      const start = angle + layer * 0.09;
      const end = start + sweep - layer * 0.16;
      const width = layer === 0 ? 8 : layer === 1 ? 5 : 2.5;
      const color = !rage
        ? (layer === 0 ? 0x160d24 : layer === 1 ? 0x3c2057 : 0x9452c2)
        : (layer === 0 ? 0x0b1c22 : layer === 1 ? 0x11707c : 0x4ce5d6);
      const alpha = !rage
        ? (layer === 0 ? 0.82 : layer === 1 ? 0.72 : 0.48)
        : (layer === 0 ? 0.52 : layer === 1 ? 0.8 : 0.9);
      scar.lineStyle(width, color, opacity * alpha);
      scar.beginPath();
      for (let i = 0; i <= segments; i++) {
        const a = start + (end - start) * i / segments;
        const jitter = Math.sin(i * 4.7 + layer * 2) * radius * 0.012;
        const px = x + Math.cos(a) * (r + jitter);
        const py = y + Math.sin(a) * (r + jitter) * 0.82;
        if (i === 0) scar.moveTo(px, py); else scar.lineTo(px, py);
      }
      scar.strokePath();
    }

    // Fraturas radiais curtas saindo da marca.
    for (let i = 0; i < 11; i++) {
      const a = angle + 0.13 + sweep * (i + 0.3) / 11;
      const r = radius * 0.97;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.82;
      const length = radius * (0.10 + (i % 4) * 0.035);
      scar.lineStyle(i % 3 === 0 ? 3 : 2, rage ? 0x145963 : 0x25132e, opacity * (rage ? 0.72 : 0.78));
      scar.beginPath();
      scar.moveTo(px, py);
      scar.lineTo(px + Math.cos(a) * length, py + Math.sin(a) * length * 0.82);
      scar.lineTo(px + Math.cos(a + 0.27) * length * 1.38, py + Math.sin(a + 0.27) * length * 1.1 * 0.82);
      scar.strokePath();
      if (rage) {
        scar.lineStyle(1.5, 0xdffffb, opacity * 0.24);
        scar.beginPath();
        scar.moveTo(px, py);
        scar.lineTo(px + Math.cos(a) * length * 0.72, py + Math.sin(a) * length * 0.72 * 0.82);
        scar.strokePath();
      }
    }
  };

  draw(1);
  const state = { opacity: 1 };
  scene.tweens.add({
    targets: state,
    opacity: 0,
    delay: 2200,
    duration: 2400,
    onUpdate: () => draw(state.opacity),
    onComplete: () => scar.destroy()
  });
}
