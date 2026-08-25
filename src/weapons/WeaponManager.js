import Weapon from './Weapon.js';
import RangedWeapon from './RangedWeapon.js';

/**
 * Dono do cooldown e dos stat mods (dano/alcance/cooldown) que vêm do
 * RunState. Player só chama tryAttack() automaticamente todo frame (o
 * ataque é 100% automático — o jogador só controla o movimento); toda a
 * matemática de upgrade e o disparo em si ficam isolados aqui.
 *
 * Ponto de extensão pra novas armas: cada `def.type` em data/weapons.js
 * mapeia pra uma classe que implementa fire(scene, player, enemyGroup,
 * statMods). Hoje só existem "melee" (Weapon) e "ranged" (RangedWeapon);
 * uma arma nova só precisa de uma entrada em data/weapons.js e, se o
 * `type` já existir, nem precisa de código novo aqui.
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
    this.currentWeapon = def.type === 'ranged' ? new RangedWeapon(def) : new Weapon(def);
    this.lastAttackMs = 0;
  }

  /** Chamado todo frame por Player.update() — o cooldown interno decide se ataca de fato. */
  tryAttack(player) {
    const now = this.scene.time.now;
    const cooldown =
      this.currentWeapon.def.cooldownMs * (1 - this.runState.cooldownMultiplier);

    if (now - this.lastAttackMs < cooldown) return;

    const fired = this.currentWeapon.fire(this.scene, player, this.enemyGroup, {
      damageMultiplier: this.runState.damageMultiplier,
      rangeMultiplier: this.runState.rangeMultiplier,
      // true só depois da carta exclusiva "katana_double" (unlockAbility:
      // doubleStrike); Weapon.js ignora este campo se a arma não for a katana
      doubleStrike: this.runState.unlockedAbilities.has('doubleStrike'),
      // true só depois da evolução "Instinto Caçador" (Visão Aguçada,
      // pistola); RangedWeapon.js ignora este campo se a arma não for a
      // pistola (só ela usa RangedWeapon pra começo de conversa)
      chainShot: this.runState.unlockedAbilities.has('chainShot')
    });

    // armas melee sempre "golpeiam" (fire() não retorna nada -> truthy);
    // armas à distância podem devolver false quando não há alvo no
    // alcance, e nesse caso não queremos gastar o cooldown à toa.
    if (fired !== false) this.lastAttackMs = now;
  }
}
