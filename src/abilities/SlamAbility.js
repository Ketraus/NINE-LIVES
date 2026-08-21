import DamageSystem from '../combat/DamageSystem.js';

/**
 * Habilidade exclusiva dos Punhos (carta "fists_slam"): a cada
 * def.cooldownMs, causa def.damage em todo inimigo dentro de def.radius
 * ao redor do jogador. Roda em paralelo ao ataque automático normal —
 * não usa WeaponManager, tem cooldown próprio.
 *
 * Mesma interface que DroneAbility (update(time, player, enemyGroup, scene))
 * — é o que permite AbilityManager tratar qualquer habilidade nova do
 * mesmo jeito, sem saber o que tem "dentro" dela.
 */
export default class SlamAbility {
  /** @param {object} def - entrada de data/upgrades.js (type: "unlockAbility") */
  constructor(def) {
    this.def = def;
    this.lastMs = 0;
  }

  update(time, player, enemyGroup, scene) {
    if (time - this.lastMs < this.def.cooldownMs) return;
    this.lastMs = time;
    this._slam(player, enemyGroup, scene);
  }

  _slam(player, enemyGroup, scene) {
    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= this.def.radius) DamageSystem.applyWeaponHit(enemy, this.def.damage, player);
    });
    this._showFx(scene, player);
  }

  /** Onda circular simples se expandindo a partir do jogador. */
  _showFx(scene, player) {
    const fx = scene.add
      .circle(player.x, player.y, this.def.radius, 0xff5555, 0.28)
      .setDepth(19);
    scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: 1.3,
      duration: 220,
      onComplete: () => fx.destroy()
    });
    scene.cameras.main.shake(90, 0.004);
  }
}
