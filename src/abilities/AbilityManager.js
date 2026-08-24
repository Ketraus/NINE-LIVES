import EventBus from '../systems/EventBus.js';
import SlamAbility from './SlamAbility.js';
import DroneAbility from './DroneAbility.js';
import AllyDogAbility from './AllyDogAbility.js';
import TornadoAbility from './TornadoAbility.js';

/**
 * Ponto de extensão central pras habilidades exclusivas de arma (as cartas
 * com type "unlockAbility" em data/upgrades.js). Escuta 'ability-unlocked'
 * (emitido por RunManager.chooseUpgrade) e instancia a classe certa.
 *
 * Cada habilidade só precisa implementar update(time, player, enemyGroup,
 * scene) — igual ao contrato de Weapon/RangedWeapon (fire(...)) — pra ser
 * suportada aqui sem tocar em mais nada.
 *
 * doubleStrike (katana) NÃO está aqui de propósito: em vez de rodar num
 * timer próprio, ela modifica o golpe que a katana já dá — é lida direto
 * de runState.unlockedAbilities dentro de Weapon.js.
 */
const ABILITY_CLASSES = {
  slam: SlamAbility,
  drone: DroneAbility,
  allyDog: AllyDogAbility,
  tornadoWalk: TornadoAbility
};

export default class AbilityManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {Player} player
   * @param {Phaser.Physics.Arcade.Group} enemyGroup
   */
  constructor(scene, player, enemyGroup) {
    this.scene = scene;
    this.player = player;
    this.enemyGroup = enemyGroup;
    this.active = [];

    EventBus.on('ability-unlocked', ({ abilityId, def }) => this._unlock(abilityId, def));
  }

  _unlock(abilityId, def) {
    const AbilityClass = ABILITY_CLASSES[abilityId];
    if (!AbilityClass) return; // ex.: doubleStrike, tratado direto em Weapon.js
    // índice de quantas instâncias desta MESMA habilidade já existem —
    // repassado pra a classe poder se posicionar numa formação (ver
    // AllyDogAbility/DroneAbility), em vez de todas nascerem empilhadas
    // exatamente no mesmo pixel quando uma carta empilha (ex.: Purificação
    // e GatoDrone agora vão até 3 cópias, ver data/upgrades.js maxStacks).
    const formationIndex = this.active.filter((a) => a instanceof AbilityClass).length;
    this.active.push(new AbilityClass(def, formationIndex));
  }

  /** Chamado todo frame pela GameScene, junto com player.update(). */
  update(time) {
    this.active.forEach((ability) => ability.update(time, this.player, this.enemyGroup, this.scene));
  }
}
