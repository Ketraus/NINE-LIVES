import EventBus from '../systems/EventBus.js';
import SlamAbility from './SlamAbility.js';
import DroneAbility from './DroneAbility.js';
import AllyDogAbility from './AllyDogAbility.js';
import TornadoAbility from './TornadoAbility.js';
import AuraShockAbility from './AuraShockAbility.js';
import ShurikenAbility from './ShurikenAbility.js';
import ShockwaveAbility from './ShockwaveAbility.js';

// Ponto de extensão central pras habilidades exclusivas de arma (as car…
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
  constructor(scene, player, enemyGroup) {
    this.scene = scene;
    this.player = player;
    this.enemyGroup = enemyGroup;
    this.active = [];

    EventBus.on('ability-unlocked', ({ abilityId, def }) => this._unlock(abilityId, def));
    EventBus.on('ability-upgraded', ({ abilityId, def }) => this._upgrade(abilityId, def));
    // cheat "resetcards" do DevConsole (F9, ver RunManager.cheatResetCards):
    EventBus.on('ability-reset', () => this.reset());
  }

  // Desmonta todas as habilidades ativas — melhor esforço genérico (cada
  reset() {
    this.active.forEach((ability) => {
      try {
        ability.dog?.destroy();
        ability.sprite?.destroy();
        ability.fx?.destroy?.();
        ability.bulletGroup?.clear(true, true);
        ability.group?.clear(true, true);
        ability.tornadoes?.forEach((t) => t.fx?.destroy?.());
      } catch (e) {
        // melhor esforço — uma habilidade que falhar ao limpar não deve
      }
    });
    this.active = [];
  }

  _unlock(abilityId, def) {
    const AbilityClass = ABILITY_CLASSES[abilityId];
    if (!AbilityClass) return; // ex.: doubleStrike, tratado direto em Weapon.js

    // Algumas habilidades (ex.: Pancada Sísmica, até 4 cópias) não fazem
    const existing = this.active.find((a) => a instanceof AbilityClass);
    if (existing && typeof existing.restack === 'function') {
      existing.restack(def);
      return;
    }

    // índice de quantas instâncias desta MESMA habilidade já existem —
    const formationIndex = this.active.filter((a) => a instanceof AbilityClass).length;
    this.active.push(new AbilityClass(def, formationIndex));

    // Ponto de extensão opcional: classes que precisam recalcular a
    if (typeof AbilityClass.onFormationChanged === 'function') {
      AbilityClass.onFormationChanged(this.active.filter((a) => a instanceof AbilityClass));
    }
  }

  // Aplica uma melhoria a TODAS as instâncias já ativas de uma habilidade
  _upgrade(abilityId, def) {
    const AbilityClass = ABILITY_CLASSES[abilityId];
    if (!AbilityClass) return;
    const instances = this.active.filter((a) => a instanceof AbilityClass);
    if (instances.length === 0) return;

    // Ponto de extensão opcional (mesmo padrão de restack/
    if (typeof AbilityClass.mergeOnUpgrade === 'function') {
      const survivors = AbilityClass.mergeOnUpgrade(instances, def);
      this.active = this.active.filter((a) => !(a instanceof AbilityClass)).concat(survivors);
      return;
    }

    instances.forEach((a) => a.upgrade?.(def));
  }

  // Chamado todo frame pela GameScene, junto com player.update().
  update(time) {
    this.active.forEach((ability) => ability.update(time, this.player, this.enemyGroup, this.scene));
  }
}
