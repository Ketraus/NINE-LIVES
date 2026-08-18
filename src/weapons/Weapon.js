import DamageSystem from '../combat/DamageSystem.js';

/**
 * Arma melee simples: em vez de uma hitbox física, checa por distância
 * + ângulo todos os inimigos dentro do alcance no momento do golpe.
 * Simples de propósito — dá pra trocar por hitbox/projétil depois sem
 * mexer em WeaponManager, que só chama fire().
 */
export default class Weapon {
  /** @param {object} def - entrada de data/weapons.json */
  constructor(def) {
    this.def = def;
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {Player} player
   * @param {Phaser.Physics.Arcade.Group} enemyGroup
   * @param {{damageMultiplier:number, rangeMultiplier:number}} statMods
   */
  fire(scene, player, enemyGroup, statMods) {
    const range = this.def.range * (1 + statMods.rangeMultiplier);
    const damage = this.def.damage * (1 + statMods.damageMultiplier);
    const aim = player.getAimDirection();
    const halfArc = Phaser.Math.DegToRad(this.def.arcDegrees) / 2;

    this._showSwingFx(scene, player, aim, range);

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const toEnemy = new Phaser.Math.Vector2(enemy.x - player.x, enemy.y - player.y);
      const dist = toEnemy.length();
      if (dist > range) return;

      const angleBetween = Math.abs(aim.angle() - toEnemy.angle());
      const normalizedAngle = Math.min(angleBetween, Phaser.Math.PI2 - angleBetween);
      if (normalizedAngle <= halfArc) {
        DamageSystem.applyWeaponHit(enemy, damage);
      }
    });
  }

  _showSwingFx(scene, player, aim, range) {
    const fxX = player.x + aim.x * range * 0.5;
    const fxY = player.y + aim.y * range * 0.5;
    const fx = scene.add.image(fxX, fxY, 'hit_fx').setDepth(20).setScale(range / 40);
    scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: fx.scale * 1.4,
      duration: 150,
      onComplete: () => fx.destroy()
    });
  }
}
