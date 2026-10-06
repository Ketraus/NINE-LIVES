// FX do Shockwave (carta rara dos Punhos): um soco tão forte que desloca o
// ar de forma brutal. Tudo BRANCO. A onda é a arte em pixel art
// (assets/fx/shockwave_wave.png, 4 frames 32x32, apontando pra DIREITA) com:
// frente de ar comprimido (arco macio) na ponta, fantasmas esticados atrás e
// "tiras" de vento sendo empurradas pros lados; no impacto, clarão + anéis
// de pressão + linhas radiais + o estouro do soco. Só visual — não mexe em
// dano, velocidade, alcance nem hitbox.

import { ensureWindTexture, hasPunchFx, playPunchFx } from './PunchFx.js';

export const SHOCKWAVE_KEY = 'shockwave_wave';
const FRAME_SIZE = 32;
const FRAME_COUNT = 4;
// ponto de ancoragem: corpo branco da onda (a "cauda" fica pra trás)
export const SHOCKWAVE_ORIGIN_X = 0.65;
export const SHOCKWAVE_ORIGIN_Y = 0.5;
const RING_KEY = 'fx_air_ring';
// fator de tamanho dos FX em volta da onda (1 = tamanho antigo, grande demais)
const FX_SIZE = 0.6;

export function loadShockwaveSheet(scene) {
  scene.load.spritesheet(SHOCKWAVE_KEY, 'assets/fx/shockwave_wave.png', {
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE
  });
}

// chamado no create() da PreloadScene
export function createShockwaveAnimation(scene) {
  if (!scene.textures.exists(SHOCKWAVE_KEY)) return;
  scene.textures.get(SHOCKWAVE_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
  if (scene.anims.exists(SHOCKWAVE_KEY)) return;
  scene.anims.create({
    key: SHOCKWAVE_KEY,
    frames: scene.anims.generateFrameNumbers(SHOCKWAVE_KEY, { start: 0, end: FRAME_COUNT - 1 }),
    frameRate: 18,
    repeat: -1
  });
}

export function hasShockwaveFx(scene) {
  return scene.textures.exists(SHOCKWAVE_KEY) && scene.anims.exists(SHOCKWAVE_KEY);
}

// anel fino e macio (borda em degradê feita empilhando traços translúcidos)
function ensureRingTexture(scene) {
  if (scene.textures.exists(RING_KEY)) return RING_KEY;
  const g = scene.add.graphics();
  [
    [10, 0.06],
    [7, 0.1],
    [4.5, 0.18],
    [2.2, 0.5]
  ].forEach(([width, alpha]) => {
    g.lineStyle(width, 0xffffff, alpha);
    g.strokeCircle(32, 32, 26);
  });
  g.generateTexture(RING_KEY, 64, 64);
  g.destroy();
  return RING_KEY;
}

function additive(img, depth, scaleX, scaleY, alpha) {
  return img.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setScale(scaleX, scaleY).setAlpha(alpha);
}

// ------------------------------------------------------------ lançamento
// Soco que deforma o ar: anel de pressão achatado à frente + leque de 5
// arcos de vento saindo do gato. `shake` só na 1ª onda da salva.
export function launchShockwaveFx(scene, x, y, dir, { shake = true } = {}) {
  const angle = dir.angle();
  const ox = x + dir.x * 18;
  const oy = y + dir.y * 18;

  const ring = additive(scene.add.image(ox, oy, ensureRingTexture(scene)), 18, 0.3 * FX_SIZE, 0.8 * FX_SIZE, 0.85).setRotation(angle);
  scene.tweens.add({
    targets: ring,
    scaleX: 0.95 * FX_SIZE,
    scaleY: 2.3 * FX_SIZE,
    alpha: 0,
    duration: 170,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });

  const wind = ensureWindTexture(scene);
  [-40, -20, 0, 20, 40].forEach((deg, i) => {
    const a = angle + Phaser.Math.DegToRad(deg);
    const arc = additive(
      scene.add.image(ox + Math.cos(a) * 10, oy + Math.sin(a) * 10, wind),
      18,
      0.6 * FX_SIZE,
      0.75 * FX_SIZE,
      0
    ).setRotation(a);
    scene.tweens.add({
      targets: arc,
      delay: i * 10,
      x: ox + Math.cos(a) * Phaser.Math.Between(46, 64) * FX_SIZE,
      y: oy + Math.sin(a) * Phaser.Math.Between(46, 64) * FX_SIZE,
      scaleX: 1.25 * FX_SIZE,
      scaleY: 1.2 * FX_SIZE,
      duration: 150,
      ease: 'Cubic.easeOut',
      onStart: () => arc.setAlpha(0.7),
      onUpdate: (t) => arc.setAlpha(0.7 * (1 - t.progress)),
      onComplete: () => arc.destroy()
    });
  });

  if (shake) scene.cameras.main.shake(90, 0.0035);
}

// ------------------------------------------------------------------ voo
// Frente de ar comprimido (arco macio) à frente da onda, fantasmas esticados
// atrás dela e tiras de vento sendo empurradas pros lados em "V".
export function attachShockwaveFlight(scene, wave, dir) {
  const angle = dir.angle();
  const perpX = -dir.y;
  const perpY = dir.x;
  const windKey = ensureWindTexture(scene);

  // frente de pressão: arco macio que acompanha a ponta da onda
  const front = additive(scene.add.image(wave.x, wave.y, windKey), 15, 1.5 * FX_SIZE, 1.9 * FX_SIZE, 0.5).setRotation(angle);
  const pulse = scene.tweens.add({
    targets: front,
    scaleY: 2.2 * FX_SIZE,
    duration: 90,
    yoyo: true,
    repeat: -1
  });

  const follow = () => {
    if (!wave.active) {
      scene.events.off('update', follow);
      pulse.stop();
      scene.tweens.add({
        targets: front,
        alpha: 0,
        scaleX: front.scaleX * 1.3,
        duration: 120,
        onComplete: () => front.destroy()
      });
      return;
    }
    front.setPosition(wave.x + dir.x * 40 * FX_SIZE, wave.y + dir.y * 40 * FX_SIZE).setAlpha(0.5 * wave.alpha);
  };
  scene.events.on('update', follow);

  const ev = scene.time.addEvent({
    delay: 30,
    loop: true,
    callback: () => {
      if (!wave.active) {
        ev.remove(false);
        return;
      }
      // fantasma esticado (mesmo frame da onda) — sensação de velocidade brutal
      const ghost = additive(
        scene.add.image(wave.x, wave.y, SHOCKWAVE_KEY, wave.frame.name),
        14,
        wave.scaleX * 1.1,
        wave.scaleY * 0.95,
        0.35 * wave.alpha
      )
        .setOrigin(SHOCKWAVE_ORIGIN_X, SHOCKWAVE_ORIGIN_Y)
        .setRotation(angle);
      scene.tweens.add({
        targets: ghost,
        alpha: 0,
        scaleX: wave.scaleX * 1.6,
        scaleY: wave.scaleY * 0.7,
        duration: 150,
        onComplete: () => ghost.destroy()
      });

      // ar sendo empurrado pros lados: 2 tiras brancas em "V" que ficam pra trás
      [-1, 1].forEach((side) => {
        const lx = wave.x - dir.x * 10 * FX_SIZE + perpX * side * 14 * FX_SIZE;
        const ly = wave.y - dir.y * 10 * FX_SIZE + perpY * side * 14 * FX_SIZE;
        const line = additive(scene.add.image(lx, ly, 'hit_fx'), 14, 1.2 * FX_SIZE, 0.07, 0.8 * wave.alpha).setRotation(
          angle + side * 0.42
        );
        scene.tweens.add({
          targets: line,
          x: lx + perpX * side * 26 * FX_SIZE - dir.x * 10 * FX_SIZE,
          y: ly + perpY * side * 26 * FX_SIZE - dir.y * 10 * FX_SIZE,
          alpha: 0,
          scaleX: 1.9 * FX_SIZE,
          duration: 170,
          ease: 'Cubic.easeOut',
          onComplete: () => line.destroy()
        });
      });
    }
  });
}

// -------------------------------------------------------------- impacto
// Clarão + 2 anéis de pressão + linhas radiais + o estouro do soco por cima.
// `small` = batida na parede / fim do alcance (sem tremor, tudo menor).
export function spawnShockwaveHitFx(scene, x, y, angle, { small = false } = {}) {
  const k = (small ? 0.55 : 1) * FX_SIZE;
  const ringKey = ensureRingTexture(scene);

  const flash = additive(scene.add.image(x, y, 'hit_fx'), 22, 1.2 * k, 1.2 * k, 0.95);
  scene.tweens.add({
    targets: flash,
    scale: 2.6 * k,
    alpha: 0,
    duration: 140,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  [0, 60].forEach((delay, i) => {
    const ring = additive(scene.add.image(x, y, ringKey), 21, 0.3 * k, 0.3 * k, 0).setRotation(angle);
    scene.tweens.add({
      targets: ring,
      delay,
      scale: (i === 0 ? 2.2 : 3.2) * k,
      duration: 230,
      ease: 'Cubic.easeOut',
      onStart: () => ring.setAlpha(i === 0 ? 0.85 : 0.5),
      onUpdate: (t) => ring.setAlpha((i === 0 ? 0.85 : 0.5) * (1 - t.progress)),
      onComplete: () => ring.destroy()
    });
  });

  // linhas radiais de ar deslocado (mais pra frente do que pra trás)
  const lines = small ? 6 : 12;
  for (let i = 0; i < lines; i++) {
    const a = angle + Phaser.Math.FloatBetween(-2.1, 2.1);
    const dist = Phaser.Math.Between(30, 62) * k;
    const line = additive(
      scene.add.image(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 'hit_fx'),
      21,
      Phaser.Math.FloatBetween(0.9, 1.5),
      0.07,
      0.9
    ).setRotation(a);
    scene.tweens.add({
      targets: line,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      scaleX: 0.4,
      duration: Phaser.Math.Between(150, 230),
      ease: 'Cubic.easeOut',
      onComplete: () => line.destroy()
    });
  }

  if (hasPunchFx(scene)) playPunchFx(scene, { x, y, size: 2.4 * k, durationMs: 140, depth: 23 });
  if (!small) scene.cameras.main.shake(80, 0.004);
}

// fim do alcance: o ar se desfaz em um anel e 3 arcos de vento
export function spawnShockwaveFadeFx(scene, x, y, angle) {
  const ring = additive(scene.add.image(x, y, ensureRingTexture(scene)), 18, 0.3 * FX_SIZE, 0.8 * FX_SIZE, 0.6).setRotation(angle);
  scene.tweens.add({
    targets: ring,
    scaleX: 0.8 * FX_SIZE,
    scaleY: 1.8 * FX_SIZE,
    alpha: 0,
    duration: 200,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });
}
