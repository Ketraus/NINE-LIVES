import Weapon from './Weapon.js';

/**
 * Dono do cooldown e dos stat mods (dano/alcance/cooldown) que vêm do
 * RunState. Player só chama tryAttack(); toda a matemática de upgrade
 * fica isolada aqui — é o ponto de extensão pra múltiplas armas depois.
 */
export default class WeaponManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.Physics.Arcade.Group} enemyGroup
   * @param {Array} weaponDefs - data/weapons.js
   * @param {import('../roguelike/RunState.js').default} runState
   * @param {string} [weaponId] - arma escolhida na WeaponSelectScene; cai
   *   para a primeira do array se não vier (ex.: ao pular a tela de escolha)
   */
  constructor(scene, enemyGroup, weaponDefs, runState, weaponId) {
    this.scene = scene;
    this.enemyGroup = enemyGroup;
    this.runState = runState;
    const def = weaponDefs.find((w) => w.id === weaponId) || weaponDefs[0];
    this.currentWeapon = new Weapon(def);
    this.lastAttackMs = 0;
  }

  tryAttack(player) {
    const now = this.scene.time.now;
    const cooldown =
      this.currentWeapon.def.cooldownMs * (1 - this.runState.cooldownMultiplier);

    if (now - this.lastAttackMs < cooldown) return;
    this.lastAttackMs = now;

    this.currentWeapon.fire(this.scene, player, this.enemyGroup, {
      damageMultiplier: this.runState.damageMultiplier,
      rangeMultiplier: this.runState.rangeMultiplier
    });
  }
}
