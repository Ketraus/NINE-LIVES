// Corte animado em pixel art (katana, Dança de Cortes e Cyberus).
// Cada folha tem 9 frames (3x3) de 64x47 px: o corte nasce no alto, abre
// num crescente grande apontando pra DIREITA (+x) e se desfaz em fiapos.
// Variantes: 'white' = katana normal, 'red' = Dança de Cortes, 'blue' = Cyberus.

import { playDanceCut, playCyberCut } from './BladeCutFx.js';

export const SLASH_VARIANTS = ['white', 'red', 'blue'];

const FRAME_W = 64;
const FRAME_H = 47;
const FRAME_COUNT = 9;
const FRAME_RATE = 40; // ~225ms por corte (a duração real é ajustada por animação)
// centro aproximado da curva do crescente dentro da célula — é o ponto
// que fica em cima do atacante (player/cachorro)
const ORIGIN_X = 19 / FRAME_W;
const ORIGIN_Y = 19 / FRAME_H;
// distância do centro até a ponta do crescente (px do sprite original)
const SPRITE_RADIUS = 41;

export function slashTextureKey(variant) {
  return `slash_${variant}`;
}

export function loadSlashSheets(scene) {
  SLASH_VARIANTS.forEach((variant) => {
    scene.load.spritesheet(slashTextureKey(variant), `assets/fx/slash_${variant}.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
  });
}

// chamado no create() da PreloadScene: pixel art nítida + animações
export function createSlashAnimations(scene) {
  SLASH_VARIANTS.forEach((variant) => {
    const key = slashTextureKey(variant);
    if (!scene.textures.exists(key)) return;
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: FRAME_COUNT - 1 }),
      frameRate: FRAME_RATE,
      repeat: 0
    });
  });
}

// 'red' (Dança de Cortes) e 'blue' (Cyberus) são desenhados por código
// (BladeCutFx.js) e não dependem dos PNGs; só a katana branca usa a folha.
const PROCEDURAL_VARIANTS = ['red', 'blue'];

export function hasSlashFx(scene, variant) {
  if (PROCEDURAL_VARIANTS.includes(variant)) return true;
  return SLASH_VARIANTS.includes(variant) && scene.textures.exists(slashTextureKey(variant));
}

// Toca um corte em (x, y) na direção `angle` (rad). `range` é o alcance
// do golpe em px (o crescente é escalado pra ele). `flip` espelha o
// sentido do corte (usado pra alternar os golpes do combo). `juice` liga
// o "suco" extra (só a katana base): estouro de escala, avanço, clarão
// quente no início, eco atrás do corte e faíscas na ponta.
export function playSlashFx(scene, { x, y, angle, range, variant, durationMs = 200, flip = false, depth = 20, juice = false, finisher = false, arcDegrees, baseAngle, swingIndex = 0 }) {
  if (variant === 'red') return playDanceCut(scene, { x, y, angle, baseAngle, swingIndex, range, durationMs, flip, depth, finisher, arcDegrees });
  if (variant === 'blue') return playCyberCut(scene, { x, y, angle, range, durationMs, flip, depth, arcDegrees });

  const key = slashTextureKey(variant);
  const scale = range / SPRITE_RADIUS;
  const sx = scale;
  const sy = flip ? -scale : scale;
  const animConfig = { key, frameRate: FRAME_COUNT / (durationMs / 1000) };

  const make = (extra = {}) => {
    const sprite = scene.add
      .sprite(x, y, key, 0)
      .setOrigin(ORIGIN_X, ORIGIN_Y)
      .setDepth(depth + (extra.depthOffset ?? 0))
      .setScale(sx * (extra.mult ?? 1), sy * (extra.mult ?? 1))
      .setRotation(angle);
    sprite.play(animConfig);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
    return sprite;
  };

  const sprite = make();
  if (!juice) return sprite;

  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  // estouro: começa menor e "morde" passando do tamanho antes de assentar
  sprite.setScale(sx * 0.78, sy * 0.78);
  scene.tweens.add({
    targets: sprite,
    scaleX: sx,
    scaleY: sy,
    duration: durationMs * 0.45,
    ease: 'Back.easeOut'
  });

  // avanço: o corte parte um pouco atrás e desliza pra frente
  const lunge = range * 0.2;
  sprite.x = x - dirX * lunge * 0.3;
  sprite.y = y - dirY * lunge * 0.3;
  scene.tweens.add({
    targets: sprite,
    x: x + dirX * lunge,
    y: y + dirY * lunge,
    duration: durationMs * 0.7,
    ease: 'Cubic.easeOut'
  });

  // clarão quente: cópia branca aditiva que apaga rápido no início
  const hot = make({ depthOffset: 1 });
  hot.setTintFill(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
  hot.setPosition(sprite.x, sprite.y);
  scene.tweens.add({
    targets: hot,
    alpha: 0,
    x: x + dirX * lunge * 0.6,
    y: y + dirY * lunge * 0.6,
    duration: 110,
    ease: 'Cubic.easeOut'
  });

  // eco: segunda cópia, maior e translúcida, que chega um instante depois
  scene.time.delayedCall(45, () => {
    const echo = make({ mult: 1.12, depthOffset: -1 });
    echo.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4);
    echo.setPosition(x + dirX * lunge * 0.4, y + dirY * lunge * 0.4);
  });

  // faíscas saindo da ponta do corte (no auge da animação)
  scene.time.delayedCall(durationMs * 0.22, () => {
    for (let i = 0; i < 6; i++) {
      const a = angle + Phaser.Math.DegToRad(Phaser.Math.Between(-38, 38));
      const r = range * 0.92;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      const dist = Phaser.Math.Between(14, 32);
      const spark = scene.add
        .image(px, py, 'hit_fx')
        .setDepth(depth + 2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xdff1ff)
        .setScale(Phaser.Math.FloatBetween(0.12, 0.24))
        .setRotation(a);
      scene.tweens.add({
        targets: spark,
        x: px + Math.cos(a) * dist,
        y: py + Math.sin(a) * dist,
        alpha: 0,
        scale: spark.scale * 0.3,
        duration: Phaser.Math.Between(150, 260),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy()
      });
    }
  });

  return sprite;
}

// Impacto do corte da katana base num inimigo: clarão, risco cruzado
// perpendicular ao golpe e faíscas pra frente. `angle` = direção do golpe.
export function spawnSlashHitFx(scene, x, y, angle) {
  const flash = scene.add
    .image(x, y, 'hit_fx')
    .setDepth(22)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xffffff)
    .setScale(0.5)
    .setAlpha(0.95);
  scene.tweens.add({
    targets: flash,
    scale: 1.3,
    alpha: 0,
    duration: 140,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  const streak = scene.add
    .image(x, y, 'hit_fx')
    .setDepth(22)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xcfe8ff)
    .setScale(1.1, 0.1)
    .setRotation(angle + Math.PI / 2)
    .setAlpha(0.9);
  scene.tweens.add({
    targets: streak,
    scaleX: 1.9,
    scaleY: 0.02,
    alpha: 0,
    duration: 160,
    ease: 'Cubic.easeOut',
    onComplete: () => streak.destroy()
  });

  for (let i = 0; i < 6; i++) {
    const a = angle + Phaser.Math.DegToRad(Phaser.Math.Between(-50, 50));
    const dist = Phaser.Math.Between(16, 38);
    const shard = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(21)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(i % 2 ? 0xffffff : 0xcfe8ff)
      .setScale(Phaser.Math.FloatBetween(0.14, 0.26))
      .setRotation(a);
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      scale: shard.scale * 0.3,
      duration: Phaser.Math.Between(150, 250),
      ease: 'Cubic.easeOut',
      onComplete: () => shard.destroy()
    });
  }
}
