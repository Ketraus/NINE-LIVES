// Dois rastros por amostra, como antes, sem criar imagens/tweens por emissão.
const pools = new WeakMap();

export function shotTrailPool(scene) {
  if (pools.has(scene)) return pools.get(scene);
  const slots = [];
  const limit = scene.sys.game.device.input.touch ? 160 : 384;
  const update = (_time, delta) => {
    if (scene.time.timeScale === 0) return;
    for (const slot of slots) {
      if (!slot.image.active) continue;
      slot.age += delta * scene.time.timeScale;
      const t = Math.min(1, slot.age / slot.life);
      if (t >= 1) {
        slot.image.setActive(false).setVisible(false);
        continue;
      }
      slot.image.setAlpha(slot.alpha * (1 - t));
      slot.image.setScale(slot.sx + (slot.ex - slot.sx) * t,
        slot.sy + (slot.ey - slot.sy) * t);
    }
  };
  const pool = {
    emit(bullet, color, intensity) {
      // Reserva o par inteiro: nunca deixa só metade do rastro.
      let available = limit - slots.length;
      for (const slot of slots) if (!slot.image.active) available++;
      if (available < 2) return;
      for (let kind = 0; kind < 2; kind++) {
        let slot = slots.find((entry) => !entry.image.active);
        if (!slot) {
          slot = { image: scene.add.image(0, 0, 'hit_fx') };
          slots.push(slot);
        }
        const ghost = kind === 0;
        slot.age = 0;
        slot.life = 150 * Math.min(1.6, intensity);
        slot.alpha = Math.min(ghost ? 0.6 : 0.5, (ghost ? 0.35 : 0.28) * intensity);
        slot.sx = ghost ? bullet.scaleX : 0.32 * intensity;
        slot.sy = ghost ? bullet.scaleY : slot.sx;
        slot.ex = ghost ? slot.sx : 0.12;
        slot.ey = ghost ? slot.sy * 0.3 : 0.12;
        slot.image.setTexture(ghost ? bullet.texture.key : 'hit_fx', ghost ? bullet.frame.name : undefined)
          .setPosition(bullet.x, bullet.y).setRotation(ghost ? bullet.rotation : 0)
          .setTint(ghost ? 0xffffff : color).setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(ghost ? 14 : 13).setScale(slot.sx, slot.sy).setAlpha(slot.alpha)
          .setActive(true).setVisible(true);
      }
    }
  };
  pools.set(scene, pool);
  scene.events.on('update', update);
  scene.events.once('shutdown', () => {
    scene.events.off('update', update);
    for (const slot of slots) slot.image.destroy();
    slots.length = 0;
    pools.delete(scene);
  });
  return pool;
}
