// Feedback visual de dano.
//
// IMPORTANTE: os números não usam pool de GameObjects de propósito.
// Phaser Text cria uma textura/frame interno e, se um Text destruído for
// reutilizado depois de um scene.restart(), o Phaser 3.80 pode chegar ao
// Frame.setSize() com a textura nula ("reading 'cut'").
// Para o volume de damage numbers do jogo, criar/destruir textos curtos é
// muito mais seguro. O manager também limpa tudo no shutdown da cena.

const PIXEL_FONT = '"Press Start 2P", monospace';
const NORMAL_COLOR = '#fff1a8';
const ELITE_COLOR = '#ffd166';
const BOSS_COLOR = '#ff8b66';
const STROKE_COLOR = '#16131a';

const BASE_FONT_SIZE = 10;
const BASE_DEPTH = 25;

const sceneNumbers = new WeakMap();
const sceneCleanupRegistered = new WeakSet();

function _getSet(scene) {
  let set = sceneNumbers.get(scene);
  if (!set) {
    set = new Set();
    sceneNumbers.set(scene, set);
  }
  return set;
}

function _ensureSceneCleanup(scene) {
  if (sceneCleanupRegistered.has(scene)) return;
  sceneCleanupRegistered.add(scene);

  const cleanup = () => {
    const set = sceneNumbers.get(scene);
    if (!set) return;

    for (const text of set) {
      if (!text) continue;
      scene.tweens?.killTweensOf(text);
      if (text.scene === scene) text.destroy();
    }

    set.clear();
    sceneNumbers.delete(scene);
  };

  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
}

function _colorForTarget(target) {
  if (target?.def?.boss) return BOSS_COLOR;
  if (target?.def?.elite) return ELITE_COLOR;
  return NORMAL_COLOR;
}

function _finish(scene, text) {
  const set = sceneNumbers.get(scene);
  set?.delete(text);

  if (text?.scene === scene) {
    text.destroy();
  }
}

export default class DamageNumberManager {
  /**
   * Mostra o dano efetivamente aplicado à vida do alvo.
   * x/y são capturados pelo DamageSystem antes do alvo morrer/desaparecer.
   */
  static show(scene, x, y, damage, target) {
    if (!scene || !scene.add || !scene.sys || !scene.sys.isActive()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Number.isFinite(damage) || damage <= 0) return;

    _ensureSceneCleanup(scene);

    const roundedDamage = Math.max(1, Math.round(damage));
    const spreadX = Phaser.Math.Between(-7, 7);
    const spreadY = Phaser.Math.Between(-4, 5);
    const startX = x + spreadX;
    const startY = y - 10 + spreadY;
    const rise = Phaser.Math.Between(20, 28);
    const color = _colorForTarget(target);

    const text = scene.add.text(startX, startY, String(roundedDamage), {
      fontFamily: PIXEL_FONT,
      fontSize: `${BASE_FONT_SIZE}px`,
      fontStyle: 'bold',
      color,
      stroke: STROKE_COLOR,
      strokeThickness: 4
    });

    text
      .setOrigin(0.5, 0.65)
      .setDepth(BASE_DEPTH)
      .setAlpha(1)
      .setScale(0.62)
      .setRotation(Phaser.Math.FloatBetween(-0.035, 0.035));

    _getSet(scene).add(text);

    scene.tweens.add({
      targets: text,
      scale: 1.0,
      duration: 85,
      ease: 'Back.easeOut',
      onComplete: () => {
        // A cena pode ter sido reiniciada durante o tween.
        if (text.scene !== scene || !scene.sys.isActive()) return;

        scene.tweens.add({
          targets: text,
          y: startY - rise,
          alpha: 0,
          scale: 0.9,
          duration: 470,
          ease: 'Cubic.easeOut',
          onComplete: () => _finish(scene, text)
        });
      }
    });
  }
}
