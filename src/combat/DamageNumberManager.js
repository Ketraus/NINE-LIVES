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
const ABILITY_COLOR = '#8ee7ff';
const CRITICAL_COLOR = '#ffd21f';
const BLEED_COLOR = '#ff4d5a';
const EXPLOSION_COLOR = '#ff9f43';
const STROKE_COLOR = '#16131a';

const BASE_FONT_SIZE = 10;
const BASE_DEPTH = 25;

const sceneNumbers = new WeakMap();
const sceneCleanupRegistered = new WeakSet();

function _cssColor(color) {
  if (typeof color === 'number') return `#${color.toString(16).padStart(6, '0')}`;
  return color;
}

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

function _styleFor(target, feedback) {
  const bossScale = target?.def?.boss ? 1.18 : 1;
  if (feedback.isCritical) {
    return { color: CRITICAL_COLOR, scale: 1.28 * bossScale, rise: 34, fontSize: 12 };
  }
  if (feedback.kind === 'bleed') {
    return { color: BLEED_COLOR, scale: bossScale, rise: 24, fontSize: 10 };
  }
  if (feedback.kind === 'explosion') {
    return { color: EXPLOSION_COLOR, scale: 1.08 * bossScale, rise: 27, fontSize: 10 };
  }
  if (feedback.kind === 'ability') {
    return { color: _cssColor(feedback.color) || ABILITY_COLOR, scale: 1.04 * bossScale, rise: 28, fontSize: 10 };
  }
  const baseColor = Math.random() < 0.45 ? '#ffffff' : NORMAL_COLOR;
  return { color: baseColor, scale: bossScale, rise: 24, fontSize: 10 };
}

function _finish(scene, text) {
  const set = sceneNumbers.get(scene);
  set?.delete(text);

  if (text?.scene === scene) {
    text.destroy();
  }
}

function _motionFor(style, isCritical) {
  const angle = Phaser.Math.FloatBetween(-2.55, -0.6);
  const speed = Phaser.Math.FloatBetween(isCritical ? 42 : 26, isCritical ? 62 : 44);
  const duration = Phaser.Math.Between(isCritical ? 560 : 500, isCritical ? 720 : 660);
  return {
    velocityX: Math.cos(angle) * speed,
    velocityY: Math.sin(angle) * speed,
    gravity: Phaser.Math.FloatBetween(isCritical ? 48 : 34, isCritical ? 68 : 52),
    duration,
    delay: Phaser.Math.Between(0, isCritical ? 18 : 34),
    popScale: isCritical ? style.scale * 1.12 : style.scale
  };
}

export default class DamageNumberManager {
  /**
   * Mostra o dano efetivamente aplicado à vida do alvo.
   * x/y são capturados pelo DamageSystem antes do alvo morrer/desaparecer.
   */
  static show(scene, x, y, damage, target, feedback = {}) {
    if (!scene || !scene.add || !scene.sys || !scene.sys.isActive()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Number.isFinite(damage) || damage <= 0) return;

    _ensureSceneCleanup(scene);

    const roundedDamage = Math.max(1, Math.round(damage));
    const spreadX = Phaser.Math.Between(-7, 7);
    const spreadY = Phaser.Math.Between(-4, 5);
    const startX = x + spreadX;
    const startY = y - 10 + spreadY;
    const style = _styleFor(target, feedback);
    const motion = _motionFor(style, feedback.isCritical);
    const initialScale = feedback.isCritical ? style.scale * 0.48 : style.scale * 0.62;
    const launchX = startX;
    const launchY = startY;

    const text = scene.add.text(startX, startY, String(roundedDamage), {
      fontFamily: PIXEL_FONT,
      fontSize: `${style.fontSize || BASE_FONT_SIZE}px`,
      fontStyle: 'bold',
      color: style.color,
      stroke: STROKE_COLOR,
      strokeThickness: 4
    });

    text
      .setOrigin(0.5, 0.65)
      .setDepth(BASE_DEPTH)
      .setAlpha(1)
      .setScale(initialScale)
      .setRotation(Phaser.Math.FloatBetween(-0.035, 0.035));

    _getSet(scene).add(text);

    scene.tweens.add({
      targets: text,
      scale: motion.popScale,
      duration: feedback.isCritical ? 115 : 85,
      delay: motion.delay,
      ease: 'Back.easeOut',
      onComplete: () => {
        // A cena pode ter sido reiniciada durante o tween.
        if (text.scene !== scene || !scene.sys.isActive()) return;

        scene.tweens.add({
          targets: { progress: 0 },
          progress: 1,
          duration: motion.duration,
          ease: 'Cubic.easeOut',
          onUpdate: (tween, target) => {
            if (text.scene !== scene || !scene.sys.isActive()) return;
            const elapsed = (target.progress * motion.duration) / 1000;
            text.x = launchX + motion.velocityX * elapsed;
            text.y = launchY + motion.velocityY * elapsed + 0.5 * motion.gravity * elapsed * elapsed;
            text.alpha = 1 - target.progress;
            text.setScale(Phaser.Math.Linear(motion.popScale, style.scale * 0.9, target.progress));
          },
          onComplete: () => _finish(scene, text)
        });
      }
    });
  }
}
