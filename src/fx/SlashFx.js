// Corte animado em pixel art (katana, Dança de Cortes e Cyberus).
// Cada folha tem 9 frames (3x3) de 64x47 px: o corte nasce no alto, abre
// num crescente grande apontando pra DIREITA (+x) e se desfaz em fiapos.
// Variantes: 'white' = katana normal, 'red' = Dança de Cortes, 'blue' = Cyberus.

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

export function hasSlashFx(scene, variant) {
  return SLASH_VARIANTS.includes(variant) && scene.textures.exists(slashTextureKey(variant));
}

// Toca um corte em (x, y) na direção `angle` (rad). `range` é o alcance
// do golpe em px (o crescente é escalado pra ele). `flip` espelha o
// sentido do corte (usado pra alternar os golpes do combo).
export function playSlashFx(scene, { x, y, angle, range, variant, durationMs = 200, flip = false, depth = 20 }) {
  const key = slashTextureKey(variant);
  const scale = range / SPRITE_RADIUS;
  const sprite = scene.add
    .sprite(x, y, key, 0)
    .setOrigin(ORIGIN_X, ORIGIN_Y)
    .setDepth(depth)
    .setScale(scale, flip ? -scale : scale)
    .setRotation(angle);

  // ajusta a velocidade da animação pra durar `durationMs`
  sprite.play({ key, frameRate: FRAME_COUNT / (durationMs / 1000) });
  sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  return sprite;
}
