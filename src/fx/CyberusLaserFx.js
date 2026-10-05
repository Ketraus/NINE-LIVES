// Laser da 3ª cabeça do Cyberus (AllyDogAbility._fireCannon).
// O sprite (128x131, só as linhas 54-77 têm desenho) é fatiado em dois
// pedaços: a "cabeça" (orbe de energia, à esquerda) e o "corpo" do feixe
// (faixa que se repete). O corpo vira um TileSprite que ROLA pra frente
// enquanto o feixe existe, então a energia parece fluir em vez de ser
// uma imagem parada. O disparo cresce com um "estouro", treme/pulsa
// enquanto segura e some afinando.

const SRC_KEY = 'cyberus_laser';
const HEAD_KEY = 'cyberus_laser_head';
const BEAM_KEY = 'cyberus_laser_beam';

// recortes dentro do sprite original
const ROW_Y = 54;
const ROW_H = 24;
const HEAD_W = 28; // orbe: x 0-27
const BEAM_X = 28; // corpo: x 28-127
const BEAM_W = 100;

const TOTAL_MS = 460;
const GROW_END = 0.14; // fração do tempo: nasce grosso e estoura
const HOLD_END = 0.58; // depois disso começa a afinar e sumir
const SCROLL_PX_PER_SEC = 900; // velocidade do fluxo de energia
const PEAK_THICKNESS = 1.35; // espessura no estouro (x a espessura normal)

const GLOW_TINT = 0x7a2cff;
const FLASH_TINT = 0xd9a3ff;

// Chamado no create() da PreloadScene (depois do load.image do sprite).
export function createCyberusLaserTextures(scene) {
  if (!scene.textures.exists(SRC_KEY)) return;
  const src = scene.textures.get(SRC_KEY).getSourceImage();

  const cut = (key, sx, w) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, ROW_H);
    tex.getContext().drawImage(src, sx, ROW_Y, w, ROW_H, 0, 0, w, ROW_H);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  };
  cut(HEAD_KEY, 0, HEAD_W);
  cut(BEAM_KEY, BEAM_X, BEAM_W);
}

export function hasCyberusLaserFx(scene) {
  return scene.textures.exists(HEAD_KEY) && scene.textures.exists(BEAM_KEY);
}

// Toca o feixe de (x1,y1) até (x2,y2). `width` é a largura de dano do
// laser (px) — o desenho é escalado pra ela.
export function playCyberusLaser(scene, x1, y1, x2, y2, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Phaser.Math.Distance.Between(x1, y1, x2, y2);

  // espessura normal do feixe em px (sprite tem 24px de altura)
  const tileScale = Math.max(0.5, (width * 2.2) / ROW_H);
  const beamH = ROW_H * tileScale;

  const makeBeam = (depth, tint, alpha) => {
    const beam = scene.add
      .tileSprite(x1, y1, length, beamH, BEAM_KEY)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(alpha);
    beam.setTileScale(tileScale, tileScale);
    if (tint !== null) beam.setTint(tint);
    return beam;
  };

  // brilho largo e escuro por baixo + feixe principal por cima
  const glow = makeBeam(21, GLOW_TINT, 0.55);
  const beam = makeBeam(22, null, 1);

  const head = scene.add
    .image(x1, y1, HEAD_KEY)
    .setDepth(23)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setRotation(angle);

  // anel de choque + clarão no cano
  const ring = scene.add
    .image(x1, y1, 'hit_fx')
    .setDepth(23)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(FLASH_TINT)
    .setScale(0.6)
    .setAlpha(0.95);
  scene.tweens.add({
    targets: ring,
    scale: 3.6,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });

  const parts = [glow, beam, head];
  const destroyAll = () => parts.forEach((p) => p.destroy());

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: TOTAL_MS,
    onUpdate: (tween) => {
      const p = tween.getValue();
      let thickness;
      let alpha;

      if (p < GROW_END) {
        // estouro: sai fino e passa do tamanho (efeito de "mola")
        const q = p / GROW_END;
        thickness = Phaser.Math.Easing.Back.Out(q) * PEAK_THICKNESS;
        alpha = 1;
      } else if (p < HOLD_END) {
        // segura: assenta na espessura normal com tremida de energia
        const settle = (p - GROW_END) / (HOLD_END - GROW_END);
        thickness = Phaser.Math.Linear(PEAK_THICKNESS, 1, Math.min(1, settle * 3));
        thickness *= 1 + Phaser.Math.FloatBetween(-0.12, 0.12);
        alpha = 1;
      } else {
        // some afinando, rápido no fim
        const q = (p - HOLD_END) / (1 - HOLD_END);
        thickness = Math.max(0.02, Phaser.Math.Easing.Cubic.In(1 - q));
        alpha = 1 - q * q;
      }

      // o fluxo de energia anda pra frente (principal) e o brilho anda
      // mais devagar, pra camadas não ficarem sincronizadas
      const scroll = (p * TOTAL_MS / 1000) * SCROLL_PX_PER_SEC;
      beam.tilePositionX = -scroll / tileScale;
      glow.tilePositionX = -scroll * 0.55 / tileScale;

      beam.setScale(1, thickness).setAlpha(alpha);
      glow.setScale(1, thickness * 1.9).setAlpha(alpha * 0.55);
      head
        .setScale(tileScale * (0.9 + thickness * 0.9))
        .setAlpha(alpha)
        .setRotation(angle + p * 9);
    },
    onComplete: destroyAll
  });
}

// Estouro roxo no ponto onde o feixe acerta um inimigo.
export function spawnCyberusLaserHitFx(scene, x, y) {
  const flash = scene.add
    .image(x, y, 'hit_fx')
    .setDepth(24)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xffffff)
    .setScale(0.5)
    .setAlpha(0.95);
  scene.tweens.add({
    targets: flash,
    scale: 1.6,
    alpha: 0,
    duration: 200,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  for (let i = 0; i < 7; i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist = Phaser.Math.Between(18, 46);
    const shard = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(23)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(i % 2 ? FLASH_TINT : GLOW_TINT)
      .setScale(Phaser.Math.FloatBetween(0.18, 0.34))
      .setRotation(a);
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      scale: shard.scale * 0.3,
      duration: Phaser.Math.Between(180, 300),
      ease: 'Cubic.easeOut',
      onComplete: () => shard.destroy()
    });
  }
}
