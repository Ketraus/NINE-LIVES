// "Suco" dos tiros (pistola, GatoDrone, CatForce): clarão no cano, estica
// ao sair, rastro de brilho enquanto voa e faíscas no impacto. Tudo é só
// visual — não mexe em dano, velocidade nem hitbox das balas.
// `intensity` (padrão 1 = pistola) deixa tudo maior/mais cheio — usado nos
// tiros pequenos do GatoDrone e do CatForce, que precisam de mais pra serem sentidos.

const LAUNCH_STRETCH_MS = 90;
const TRAIL_INTERVAL_MS = 26;
const TRAIL_LIFE_MS = 150;

// Clarão curto no cano + 3 faíscas pra frente e estica o sprite da bala
// ao sair (comprida/fina → tamanho normal). `muzzle: false` pula o clarão.
export function launchShotFx(scene, bullet, { x, y, angle, color, muzzle = true, intensity = 1 }) {
  // estica ao sair: só visual, volta ao tamanho normal em ~90ms
  const sx = bullet.scaleX;
  const sy = bullet.scaleY;
  bullet.setScale(sx * (1 + 0.7 * intensity), sy * Math.max(0.35, 1 - 0.4 * intensity));
  scene.tweens.add({
    targets: bullet,
    scaleX: sx,
    scaleY: sy,
    duration: LAUNCH_STRETCH_MS,
    ease: 'Cubic.easeOut'
  });

  if (!muzzle) return;

  const flash = scene.add
    .image(x, y, 'hit_fx')
    .setDepth(17)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(color)
    .setScale(0.35 * intensity)
    .setAlpha(0.95)
    .setRotation(angle);
  scene.tweens.add({
    targets: flash,
    scale: 1.1 * intensity,
    alpha: 0,
    duration: 110,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  for (let i = 0, n = Math.round(3 * intensity); i < n; i++) {
    const a = angle + Phaser.Math.FloatBetween(-0.45 * intensity, 0.45 * intensity);
    const dist = Phaser.Math.Between(10, 22) * intensity;
    const spark = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(17)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(Phaser.Math.FloatBetween(0.1, 0.18) * intensity)
      .setRotation(a);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      duration: Phaser.Math.Between(90, 150),
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy()
    });
  }
}

// Rastro: a cada ~26ms deixa um "fantasma" da bala (mesma textura) e um
// brilho redondo que somem rápido — a bala parece arrastar luz.
export function attachShotTrail(scene, bullet, color, { intervalMs = TRAIL_INTERVAL_MS, intensity = 1 } = {}) {
  const ev = scene.time.addEvent({
    delay: intervalMs,
    loop: true,
    callback: () => {
      if (!bullet.active) {
        ev.remove(false);
        return;
      }
      const ghost = scene.add
        .image(bullet.x, bullet.y, bullet.texture.key)
        .setDepth(14)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(bullet.scaleX, bullet.scaleY)
        .setRotation(bullet.rotation)
        .setAlpha(Math.min(0.6, 0.35 * intensity));
      const halo = scene.add
        .image(bullet.x, bullet.y, 'hit_fx')
        .setDepth(13)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setScale(0.32 * intensity)
        .setAlpha(Math.min(0.5, 0.28 * intensity));
      scene.tweens.add({
        targets: ghost,
        alpha: 0,
        scaleY: ghost.scaleY * 0.3,
        duration: TRAIL_LIFE_MS * Math.min(1.6, intensity),
        onComplete: () => ghost.destroy()
      });
      scene.tweens.add({
        targets: halo,
        alpha: 0,
        scale: 0.12,
        duration: TRAIL_LIFE_MS * Math.min(1.6, intensity),
        onComplete: () => halo.destroy()
      });
    }
  });
}

// Impacto: clarão branco + anel + faíscas que voltam pro lado de onde o
// tiro veio. `angle` = direção em que a bala viajava (rad).
export function spawnShotHitFx(scene, x, y, color, angle, intensity = 1) {
  const flash = scene.add
    .image(x, y, 'hit_fx')
    .setDepth(21)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xffffff)
    .setScale(0.35 * intensity)
    .setAlpha(0.95);
  scene.tweens.add({
    targets: flash,
    scale: 0.9 * intensity,
    alpha: 0,
    duration: 120,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  const ring = scene.add
    .image(x, y, 'hit_fx')
    .setDepth(20)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(color)
    .setScale(0.3 * intensity)
    .setAlpha(0.7);
  scene.tweens.add({
    targets: ring,
    scale: 1.3 * intensity,
    alpha: 0,
    duration: 170,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });

  const back = angle + Math.PI;
  for (let i = 0, n = Math.round(5 * intensity); i < n; i++) {
    const a = back + Phaser.Math.FloatBetween(-0.9, 0.9);
    const dist = Phaser.Math.Between(12, 30) * intensity;
    const shard = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(i % 2 ? 0xffffff : color)
      .setScale(Phaser.Math.FloatBetween(0.12, 0.22) * intensity)
      .setRotation(a);
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      scale: shard.scale * 0.3,
      duration: Phaser.Math.Between(130, 220),
      ease: 'Cubic.easeOut',
      onComplete: () => shard.destroy()
    });
  }
}
