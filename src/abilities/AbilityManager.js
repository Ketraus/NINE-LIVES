import EventBus from '../systems/EventBus.js';
import SlamAbility from './SlamAbility.js';
import DroneAbility from './DroneAbility.js';
import AllyDogAbility from './AllyDogAbility.js';
import TornadoAbility from './TornadoAbility.js';
import AuraShockAbility from './AuraShockAbility.js';
import ShurikenAbility from './ShurikenAbility.js';
import ShockwaveAbility from './ShockwaveAbility.js';

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
 *
 * Além de 'ability-unlocked' (nova instância), também escuta
 * 'ability-upgraded' — usado por evoluções que melhoram uma habilidade já
 * ativa em vez de somar mais uma (ex.: CatForce 2.0 nos 3 drones do
 * GatoDrone). A classe da habilidade só precisa implementar um método
 * opcional upgrade(def) pra ser suportada; sem ele, o evento é ignorado.
 */
const ABILITY_CLASSES = {
  slam: SlamAbility,
  drone: DroneAbility,
  allyDog: AllyDogAbility,
  tornadoWalk: TornadoAbility,
  auraShock: AuraShockAbility,
  shuriken: ShurikenAbility,
  shockwave: ShockwaveAbility
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
    EventBus.on('ability-upgraded', ({ abilityId, def }) => this._upgrade(abilityId, def));
  }

  _unlock(abilityId, def) {
    const AbilityClass = ABILITY_CLASSES[abilityId];
    if (!AbilityClass) return; // ex.: doubleStrike, tratado direto em Weapon.js

    // Algumas habilidades (ex.: Pancada Sísmica, até 4 cópias) não fazem
    // sentido empilhando em várias instâncias paralelas idênticas — cada
    // carta extra só intensifica a ÚNICA instância já ativa (fica mais
    // frequente), em vez de somar mais uma rodando ao mesmo tempo no mesmo
    // lugar. Uma classe opta nisso implementando restack(); sem o método,
    // o comportamento de sempre continua (uma instância nova por cópia,
    // ex.: GatoDrone/AllyDog, que têm formação própria pra várias cópias).
    const existing = this.active.find((a) => a instanceof AbilityClass);
    if (existing && typeof existing.restack === 'function') {
      existing.restack(def);
      return;
    }

    // índice de quantas instâncias desta MESMA habilidade já existem —
    // repassado pra a classe poder se posicionar numa formação (ver
    // AllyDogAbility/DroneAbility), em vez de todas nascerem empilhadas
    // exatamente no mesmo pixel quando uma carta empilha (ex.: Purificação
    // e GatoDrone agora vão até 4 cópias, ver data/upgrades.js maxStacks).
    const formationIndex = this.active.filter((a) => a instanceof AbilityClass).length;
    this.active.push(new AbilityClass(def, formationIndex));

    // Ponto de extensão opcional: classes que precisam recalcular a
    // formação de TODAS as cópias já ativas (não só posicionar a nova)
    // quando uma cópia extra entra em cena implementam este hook estático
    // — ex.: DroneAbility muda de "chapéu" pra quadrado só ao completar 4.
    // Sem o hook, nada muda aqui (AllyDogAbility etc. continuam como antes).
    if (typeof AbilityClass.onFormationChanged === 'function') {
      AbilityClass.onFormationChanged(this.active.filter((a) => a instanceof AbilityClass));
    }
  }

  /** Aplica uma melhoria a TODAS as instâncias já ativas de uma habilidade
   * (ex.: os 3 drones do GatoDrone viram laser de uma vez com CatForce
   * 2.0), em vez de instanciar mais uma cópia do zero. */
  _upgrade(abilityId, def) {
    const AbilityClass = ABILITY_CLASSES[abilityId];
    if (!AbilityClass) return;
    const instances = this.active.filter((a) => a instanceof AbilityClass);
    if (instances.length === 0) return;

    // Ponto de extensão opcional (mesmo padrão de restack/
    // onFormationChanged acima): algumas evoluções não melhoram cada
    // instância isoladamente, e sim FUNDEM várias em uma só — ex.: as até
    // 3 AllyDogAbility da "Purificação" viram 1 único Cyberus quando
    // evolui. A classe implementa mergeOnUpgrade(instances, def) e devolve
    // a lista de instâncias que devem continuar em `this.active`; sem o
    // hook, o comportamento de sempre continua (upgrade() em cada uma).
    if (typeof AbilityClass.mergeOnUpgrade === 'function') {
      const survivors = AbilityClass.mergeOnUpgrade(instances, def);
      this.active = this.active.filter((a) => !(a instanceof AbilityClass)).concat(survivors);
      return;
    }

    instances.forEach((a) => a.upgrade?.(def));
  }

  /** Chamado todo frame pela GameScene, junto com player.update(). */
  update(time) {
    this.active.forEach((ability) => ability.update(time, this.player, this.enemyGroup, this.scene));
  }
}
