import DamageSystem from '../combat/DamageSystem.js';

// Visual: verde claro, condizente com a descrição da carta. Fica só aqui
const TORNADO_COLOR = 0x90ee90;

// Fração final da vida do tornado em que ele começa a piscar e desvanec…
const FADE_OUT_RATIO = 0.4;
const FADE_BLINK_INTERVAL_MS = 80;

// Habilidade exclusiva da evolução "Vórtice Turbo" (Patas Turbo evoluíd…
export default class TornadoAbility {
  constructor(def) {
    this.def = def;
    this.walkAccumMs = 0;
    this._lastFrameMs = null;
    this.tornadoes = []; // { x, y, spawnMs, lastTickMs, fx }
  }

  update(time, player, enemyGroup, scene) {
    this.player = player; // guardado só pra passar como `source` do dano nos ticks (lifesteal/par…
    this._advanceWalkTimer(time, player, scene);
    this._updateTornadoes(time, enemyGroup);
  }

  // Acumula tempo só enquanto o jogador está de fato se movendo.
  _advanceWalkTimer(time, player, scene) {
    const delta = this._lastFrameMs === null ? 0 : time - this._lastFrameMs;
    this._lastFrameMs = time;

    const isWalking = !player.isDead && player.body
      && (player.body.velocity.x !== 0 || player.body.velocity.y !== 0);

    if (isWalking) this.walkAccumMs += delta;

    if (this.walkAccumMs >= this.def.cooldownMs) {
      this.walkAccumMs -= this.def.cooldownMs;
      this._spawnTornado(scene, player, time);
    }
  }

  _spawnTornado(scene, player, time) {
    const fx = this._createFx(scene, player.x, player.y);
    this.tornadoes.push({
      x: player.x,
      y: player.y,
      spawnMs: time,
      lastTickMs: 0, // 0 força o primeiro tick de dano já no próximo update
      fx
    });
  }

  _updateTornadoes(time, enemyGroup) {
    this.tornadoes = this.tornadoes.filter((tornado) => {
      const age = time - tornado.spawnMs;

      if (age >= this.def.durationMs) {
        this._destroyFx(tornado.fx);
        return false;
      }

      this._updateFadeOut(tornado, age, time);

      if (time - tornado.lastTickMs >= this.def.tickIntervalMs) {
        tornado.lastTickMs = time;
        this._damageEnemiesInRange(tornado, enemyGroup, time);
      }

      return true;
    });
  }

  // Nos últimos FADE_OUT_RATIO da vida do tornado, ele pisca (liga/desliga
  _updateFadeOut(tornado, age, time) {
    const fadeStartAge = this.def.durationMs * (1 - FADE_OUT_RATIO);
    if (age < fadeStartAge) return;

    const fadeMs = this.def.durationMs - fadeStartAge;
    const fadeProgress = (age - fadeStartAge) / fadeMs; // 0 -> 1
    const baseAlpha = 1 - fadeProgress;
    const isBlinkOn = Math.floor(time / FADE_BLINK_INTERVAL_MS) % 2 === 0;

    tornado.fx.setAlpha(Math.max(0, isBlinkOn ? baseAlpha : baseAlpha * 0.35));
  }

  // Mata os tweens (rotação, pulso, pop de hit) antes de destruir, senão
  _destroyFx(fx) {
    fx.scene?.tweens.killTweensOf([fx, ...fx.list]);
    fx.destroy();
  }

  _damageEnemiesInRange(tornado, enemyGroup, time) {
    let hitSomeone = false;
    // snapshot: mesma razão do fix em SlamAbility/AuraShockAbility/Weapon
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(tornado.x, tornado.y, enemy.x, enemy.y);
      if (dist <= this.def.radius) {
        DamageSystem.applyWeaponHit(enemy, this.def.damage, this.player, time);
        hitSomeone = true;
      }
    });
    // um "aperta" só por tick (mesmo que tenha acertado vários inimigos de
    if (hitSomeone) this._pulseHit(tornado.fx);
  }

  // Container simples com dois anéis girando em sentidos opostos.
  _createFx(scene, x, y) {
    const radius = this.def.radius;
    const outer = scene.add.circle(0, 0, radius, TORNADO_COLOR, 0.22).setStrokeStyle(2, TORNADO_COLOR, 0.55);
    const inner = scene.add.circle(0, 0, radius * 0.55, TORNADO_COLOR, 0.3);

    const container = scene.add.container(x, y, [outer, inner]).setDepth(8);

    scene.tweens.add({
      targets: outer,
      angle: 360,
      duration: 900,
      repeat: -1
    });
    scene.tweens.add({
      targets: inner,
      angle: -360,
      duration: 600,
      repeat: -1
    });
    // sobe e desce suavemente pra reforçar a leitura de "vórtice" parado
    scene.tweens.add({
      targets: container,
      scale: { from: 0.9, to: 1.05 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    return container;
  }

  // Mesma sensação de "aperto" que Enemy.playHitReaction dá quando um
  _pulseHit(fx) {
    if (!fx.scene) return;
    fx.list.forEach((ring) => {
      ring.setScale(1, 1);
      fx.scene.tweens.add({
        targets: ring,
        scaleX: 1.3,
        scaleY: 0.7,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => ring.setScale(1, 1)
      });
    });
  }
}
