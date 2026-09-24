// Feedback visual de dano. Fica separado do DamageSystem para que a lógica
// de combate continue independente da apresentação.
//
// Os textos são reutilizados por cena (pool simples) para evitar criar e
// destruir dezenas de GameObjects por segundo em ataques de área.

const PIXEL_FONT = '"Press Start 2P", monospace';
const NORMAL_COLOR = '#fff1a8';
const ELITE_COLOR = '#ffd166';
const BOSS_COLOR = '#ff8b66';
const STROKE_COLOR = '#16131a';

const BASE_FONT_SIZE = 10;
const BASE_DEPTH = 25;
const MAX_POOL_SIZE = 80;

const scenePools = new WeakMap();

function _getPool(scene) {
  let pool = scenePools.get(scene);
  if (!pool) {
    pool = [];
    scenePools.set(scene, pool);
  }
  return pool;
}

function _colorForTarget(target) {
  if (target?.def?.boss) return BOSS_COLOR;
  if (target?.def?.elite) return ELITE_COLOR;
  return NORMAL_COLOR;
}

function _getText(scene) {
  const pool = _getPool(scene);
  const text = pool.pop();
  if (text) return text;

  return scene.add.text(0, 0, '', {
    fontFamily: PIXEL_FONT,
    fontSize: `${BASE_FONT_SIZE}px`,
    fontStyle: 'bold',
    color: NORMAL_COLOR,
    stroke: STROKE_COLOR,
    strokeThickness: 4,
    resolution: 2
  })
    .setOrigin(0.5, 0.65)
    .setDepth(BASE_DEPTH);
}

function _release(scene, text) {
  if (!text || !text.scene) return;
  text.setVisible(false);
  text.setActive(false);
  text.setAlpha(1);
  text.setScale(1);
  text.setRotation(0);

  const pool = _getPool(scene);
  if (pool.length < MAX_POOL_SIZE) pool.push(text);
  else text.destroy();
}

export default class DamageNumberManager {
  /**
   * Mostra o dano efetivamente aplicado à vida do alvo.
   * x/y são capturados pelo DamageSystem antes do alvo morrer/desaparecer.
   */
  static show(scene, x, y, damage, target) {
    if (!scene || !scene.add || !Number.isFinite(damage) || damage <= 0) return;

    const text = _getText(scene);
    const pool = _getPool(scene);

    const spreadX = Phaser.Math.Between(-7, 7);
    const spreadY = Phaser.Math.Between(-4, 5);
    const startX = x + spreadX;
    const startY = y - 10 + spreadY;
    const rise = Phaser.Math.Between(20, 28);

    const color = _colorForTarget(target);
    const roundedDamage = Math.max(1, Math.round(damage));

    text
      .setText(String(roundedDamage))
      .setColor(color)
      .setPosition(startX, startY)
      .setAlpha(1)
      .setScale(0.62)
      .setRotation(Phaser.Math.FloatBetween(-0.035, 0.035))
      .setDepth(BASE_DEPTH)
      .setVisible(true)
      .setActive(true);

    // Garante que um texto devolvido ao pool não carregue tweens antigos.
    scene.tweens.killTweensOf(text);

    // Primeiro: pequeno "pop" de impacto. Depois: sobe e desaparece.
    scene.tweens.add({
      targets: text,
      scale: 1.0,
      duration: 85,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!text.active) return;

        scene.tweens.add({
          targets: text,
          y: startY - rise,
          alpha: 0,
          scale: 0.9,
          duration: 470,
          ease: 'Cubic.easeOut',
          onComplete: () => _release(scene, text)
        });
      }
    });
  }
}
