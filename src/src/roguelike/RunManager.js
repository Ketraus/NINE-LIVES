import EventBus from '../systems/EventBus.js';

/**
 * Dono do FLUXO de progressão. RunState guarda os números; RunManager
 * decide o que acontece quando eles mudam (subir de nível -> pausar e
 * oferecer cartas). GameScene só ouve os eventos que ele emite.
 *
 * Isto é o "extra" pedido: XP -> level up -> 3 cartas -> upgrade.
 * Implementado mínimo de propósito — é o gancho para waves/upgrades
 * mais ricos depois, não o sistema final.
 */
export default class RunManager {
  /**
   * @param {import('./RunState.js').default} runState
   * @param {Player} player
   * @param {Array} upgradeDefs - data/upgrades.json
   */
  constructor(runState, player, upgradeDefs) {
    this.runState = runState;
    this.player = player;
    this.upgradeDefs = upgradeDefs;
  }

  collectXp(amount) {
    const leveledUp = this.runState.addXp(amount);
    EventBus.emit('xp-changed', {
      xp: this.runState.xp,
      xpToNext: this.runState.xpToNext,
      level: this.runState.level
    });

    if (leveledUp) {
      this._triggerLevelUp();
    }
  }

  _triggerLevelUp() {
    const pool = this._getAvailableUpgrades();
    const options = Phaser.Utils.Array.Shuffle([...pool]).slice(0, 3);
    EventBus.emit('level-up', { options });
  }

  /**
   * Ponto de extensão: hoje devolve o pool inteiro de upgrades.
   * Quando upgrades específicos de arma existirem em data/upgrades.js
   * (ex.: um campo `weaponId` ou `tags` na entrada), filtrar aqui usando
   * this.runState.weaponId — nenhum outro arquivo precisa mudar.
   */
  _getAvailableUpgrades() {
    return this.upgradeDefs;
  }

  /** Chamado pela LevelUpUI quando o jogador escolhe uma carta. */
  chooseUpgrade(upgrade) {
    this.runState.applyUpgrade(upgrade);

    if (upgrade.type === 'maxHpBonus') {
      this.player.healthSystem.increaseMax(upgrade.value, { healToFull: false });
      this.player.healthSystem.heal(upgrade.value);
    }
  }

  registerKill() {
    this.runState.registerKill();
  }

  restart() {
    this.runState.reset();
  }
}
