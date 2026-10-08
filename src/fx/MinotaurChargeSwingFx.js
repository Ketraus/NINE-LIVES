// Corte circular roxo pós-investida. Usa a arte CorteCircular enviada pelo artista.
const KEY = 'minotaur_charge_swing';
export function loadMinotaurChargeSwing(scene) {
  scene.load.image(KEY, 'assets/fx/minotaur_charge_swing.png');
  scene.load.image(KEY + '_rage', 'assets/fx/minotaur_charge_swing_rage.png');
}
export function prepareMinotaurChargeSwing(scene) {
  if (scene.textures.exists(KEY)) scene.textures.get(KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
}
export function playMinotaurChargeSwing(scene, x, y, radius, rage = false) {
  if (!scene.textures.exists(KEY)) return;
  leaveChargeSwingScar(scene, x, y, radius, rage);
  // Quatro elos do desenho giram e se expandem como uma lâmina circular.
  for (let i = 0; i < 2; i++) {
    const ring = scene.add.image(x, y, rage ? KEY + '_rage' : KEY)
      .setDepth(21 + i).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.55).setAlpha(i ? 0.65 : 1)
      .setRotation(i ? Math.PI / 2 : 0);
    scene.tweens.add({
      targets: ring,
      scaleX: radius * 2.1 / ring.width,
      scaleY: radius * 1.9 / ring.height,
      rotation: (i ? -1 : 1) * Math.PI * 1.2,
      alpha: 0,
      duration: 260 + i * 75,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
  }
  const g = scene.add.graphics().setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
  const state = { r: radius * 0.24, a: 0.95 };
  scene.tweens.add({
    targets: state, r: radius, a: 0, duration: 310, ease: 'Cubic.easeOut',
    onUpdate: () => {
      g.clear();
      g.lineStyle(12, rage ? 0x087d86 : 0x7a22dd, state.a * 0.5);
      g.strokeCircle(x, y, state.r);
      g.lineStyle(4, rage ? 0xbafff1 : 0xd9a2ff, state.a);
      g.strokeCircle(x, y, state.r * 0.97);
    },
    onComplete: () => g.destroy()
  });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
    const d = radius * (0.5 + Math.random() * 0.5);
    const spark = scene.add.rectangle(x + Math.cos(a) * radius * 0.3, y + Math.sin(a) * radius * 0.3, 5, 3, i % 3 ? rage ? 0x32e9d6 : 0xa04dff : rage ? 0xbafff1 : 0xf0ceff)
      .setDepth(22).setRotation(a).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: spark, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      alpha: 0, scaleX: 0.2, duration: 220 + Math.random() * 170,
      onComplete: () => spark.destroy() });
  }
}

// Cicatriz física do impacto: sulcos escuros e rachaduras violetas ficam no chão
// depois que a energia do golpe desaparece. Não altera hitbox nem dano.
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
      scar.lineStyle(layer === 0 ? 9 : layer === 1 ? 5 : 2,
        layer === 0 ? (rage ? 0x071d25 : 0x160d24) : layer === 1 ? (rage ? 0x0a5360 : 0x3c2057) : (rage ? 0x35cdbf : 0x9452c2),
        opacity * (layer === 0 ? 0.85 : layer === 1 ? 0.72 : 0.48));
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
    // Fraturas radiais curtas saindo da marca circular.
    for (let i = 0; i < 11; i++) {
      const a = angle + 0.13 + sweep * (i + 0.3) / 11;
      const r = radius * 0.97;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.82;
      const length = radius * (0.10 + (i % 4) * 0.035);
      scar.lineStyle(i % 3 === 0 ? 3 : 2, rage ? 0x093740 : 0x25132e, opacity * 0.78);
      scar.beginPath();
      scar.moveTo(px, py);
      scar.lineTo(px + Math.cos(a) * length, py + Math.sin(a) * length * 0.82);
      scar.lineTo(px + Math.cos(a + 0.27) * length * 1.38, py + Math.sin(a + 0.27) * length * 1.1 * 0.82);
      scar.strokePath();
    }
  };
  draw(1);
  const state = { opacity: 1 };
  scene.tweens.add({ targets: state, opacity: 0, delay: 2200, duration: 2400,
    onUpdate: () => draw(state.opacity), onComplete: () => scar.destroy() });
}
