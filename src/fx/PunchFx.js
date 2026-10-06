// FX do soco base do Paws: estouro de linhas em pixel art (4 frames,
// folha 2x2 de 440x440 em assets/fx/punch_burst.png) tocado no PONTO DE
// CONTATO do soco (em cima do inimigo atingido). Se o soco não acerta
// ninguém, aparece só um estouro menor na ponta do punho.
// Só visual — não mexe em dano, alcance nem knockback.

const KEY = 'punch_burst';
const FRAME_SIZE = 440;
const FRAME_COUNT = 4;
// centro do estouro dentro de cada célula (onde as linhas convergem)
const ORIGIN_X = 0.5;
const ORIGIN_Y = 0.55;
// diâmetro aproximado do estouro no frame mais cheio (px da arte original)
const SPRITE_DIAMETER = 300;
// tamanho do estouro em px no mundo (independe do alcance: impacto, não explosão)
const BURST_SIZE_PX = 46;
// onde o soco "pega" no vazio, como fração do alcance
export const WHIFF_POINT = 0.78;

export function loadPunchSheet(scene) {
  scene.load.spritesheet(KEY, 'assets/fx/punch_burst.png', {
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE
  });
}

// chamado no create() da PreloadScene
export function createPunchAnimation(scene) {
  if (!scene.textures.exists(KEY) || scene.anims.exists(KEY)) return;
  scene.anims.create({
    key: KEY,
    frames: scene.anims.generateFrameNumbers(KEY, { start: 0, end: FRAME_COUNT - 1 }),
    frameRate: 24,
    repeat: 0
  });
}

export function hasPunchFx(scene) {
  return scene.textures.exists(KEY) && scene.anims.exists(KEY);
}

// Toca o estouro exatamente em (x, y). `size` multiplica o tamanho
// (1 = acerto em inimigo, ~0.6 = soco no vazio). Nada de traço/anel/faísca:
// só o estouro, que "morde" rápido e se desfaz.
export function playPunchFx(scene, { x, y, size = 1, durationMs = 100, depth = 21 }) {
  const scale = (BURST_SIZE_PX * size) / SPRITE_DIAMETER;
  const lifeMs = Math.max(durationMs * 1.4, 130);

  const sprite = scene.add
    .sprite(x, y, KEY, 0)
    .setOrigin(ORIGIN_X, ORIGIN_Y)
    .setDepth(depth)
    .setScale(scale * 0.7)
    .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2))
    .setFlipX(Math.random() < 0.5);
  sprite.play({ key: KEY, frameRate: FRAME_COUNT / (lifeMs / 1000) });
  sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());

  // "morde": começa um pouco menor e assenta rápido no tamanho final
  scene.tweens.add({
    targets: sprite,
    scale,
    duration: lifeMs * 0.3,
    ease: 'Back.easeOut'
  });

  return sprite;
}

// ------------------------------------------------------------------ vulto
// A patada como VULTO: uma rajada de socos rápidos, vista como 4 arcos de
// vento bem suaves e borrados (translúcidos, sem borda dura) que saem do
// gato um atrás do outro, alternando esquerda/direita, como se ele desse
// vários socos seguidos. O estouro (playPunchFx) só aparece quando o soco
// acerta (`onContact`).
const WIND_KEY = 'fx_wind_arc';
const PUNCH_COUNT = 4;
const PUNCH_STAGGER_MS = 18;
// até onde os vultos vão (px a partir do gato) — curto de propósito
export const SMEAR_MAX_REACH = 58;
const START_DIST = 12;

export function ensureWindTexture(scene) {
  if (scene.textures.exists(WIND_KEY)) return WIND_KEY;
  const g = scene.add.graphics();
  const cx = 6;
  const cy = 28;
  const r = 24;
  // pilha de traços largos e quase transparentes = borda macia (borrão)
  [
    [18, 0.05, 46],
    [14, 0.07, 44],
    [10, 0.1, 42],
    [6, 0.14, 38],
    [3, 0.22, 32]
  ].forEach(([width, alpha, half]) => {
    g.lineStyle(width, 0xffffff, alpha);
    g.beginPath();
    g.arc(cx, cy, r, Phaser.Math.DegToRad(-half), Phaser.Math.DegToRad(half), false);
    g.strokePath();
  });
  g.generateTexture(WIND_KEY, 44, 56);
  g.destroy();
  return WIND_KEY;
}

export function playPunchSmear(scene, { x, y, owner = null, angle, reach, durationMs = 100, tint = 0xffffff, onContact = null, depth = 19 }) {
  const key = ensureWindTexture(scene);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const perpX = -dirY;
  const perpY = dirX;
  const baseX = owner?.x ?? x;
  const baseY = owner?.y ?? y;
  const endDist = Math.max(START_DIST + 14, Math.min(reach, SMEAR_MAX_REACH));

  for (let i = 0; i < PUNCH_COUNT; i++) {
    // alterna esquerda/direita do gato; leve variação de ângulo e alcance
    const side = i % 2 === 0 ? 1 : -1;
    const lateral = side * Phaser.Math.Between(5, 9);
    const tilt = side * Phaser.Math.DegToRad(Phaser.Math.Between(6, 16));
    const travel = endDist * Phaser.Math.FloatBetween(0.7, 1);
    const size = Phaser.Math.FloatBetween(0.85, 1.15);
    const delay = i * PUNCH_STAGGER_MS;

    const startX = baseX + dirX * START_DIST + perpX * lateral;
    const startY = baseY + dirY * START_DIST + perpY * lateral;

    const wind = scene.add
      .image(startX, startY, key)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(i % 2 ? tint : 0xffffff)
      .setRotation(angle + tilt)
      .setAlpha(0)
      .setScale(0.55 * size, 0.7 * size);

    scene.tweens.add({
      targets: wind,
      delay,
      x: baseX + dirX * travel + perpX * lateral * 0.5,
      y: baseY + dirY * travel + perpY * lateral * 0.5,
      scaleX: 1.15 * size,
      scaleY: 0.95 * size,
      duration: 70,
      ease: 'Cubic.easeOut',
      onStart: () => wind.setAlpha(0.75),
      onComplete: () => {
        scene.tweens.add({
          targets: wind,
          alpha: 0,
          x: wind.x + dirX * 8,
          y: wind.y + dirY * 8,
          scaleX: wind.scaleX * 1.25,
          scaleY: wind.scaleY * 1.1,
          duration: 110,
          ease: 'Quad.easeOut',
          onComplete: () => wind.destroy()
        });
      }
    });
  }

  // impacto sincronizado com o fim da rajada
  if (onContact) scene.time.delayedCall((PUNCH_COUNT - 1) * PUNCH_STAGGER_MS + 45, onContact);
}
