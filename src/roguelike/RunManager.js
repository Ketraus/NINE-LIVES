import EventBus from '../systems/EventBus.js';
import { BASE_MAX_HP } from '../entities/Player.js';

// Regra atual: obter a MESMA carta base 3 vezes evolui ela. Único número
// mágico do sistema — se um dia cada carta precisar de um número diferente
// de cópias, isto vira um campo em data/upgrades.js (ex.: `evolvesAtStacks`)
// em vez de uma constante global.
const EVOLUTION_STACK_THRESHOLD = 3;

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
   * Cartas "base" (sem weaponId) valem pra qualquer classe. Cartas
   * "exclusive" só entram no pool se `weaponId` bater com a arma escolhida
   * na WeaponSelectScene, e cartas do tipo "unlockAbility" já tiradas somem
   * do pool (não fazem sentido stackar, ao contrário das cartas base).
   * Cartas "evolution" nunca aparecem aqui — elas são forçadas sozinhas via
   * evento 'evolution-ready' (ver _findPendingEvolution), nunca misturadas
   * com as 3 opções normais. Uma vez evoluída, a carta base original some
   * do pool (não faz sentido continuar oferecendo Vitalidade depois de
   * virar COLOSSO).
   *
   * Ponto de extensão: uma arma nova só precisa de novas entradas em
   * data/upgrades.js com o `weaponId` certo — nada aqui muda. O mesmo vale
   * pra cartas base novas (basta não setar `weaponId`).
   */
  _getAvailableUpgrades() {
    return this.upgradeDefs.filter((upgrade) => {
      if (upgrade.category === 'evolution') return false;
      if (upgrade.weaponId && upgrade.weaponId !== this.runState.weaponId) return false;
      if (upgrade.type === 'unlockAbility' && this.runState.unlockedAbilities.has(upgrade.abilityId)) {
        return false;
      }
      if (upgrade.evolvesInto && this.runState.ownedUpgradeIds.has(upgrade.evolvesInto)) return false;
      return true;
    });
  }

  /**
   * Chamado pela LevelUpUI quando o jogador escolhe uma das 3 cartas
   * normais. Se esta escolha for a Nª cópia da mesma carta (N =
   * EVOLUTION_STACK_THRESHOLD) e ela tiver `evolvesInto`, a carta normal é
   * substituída pela evolução: o efeito de base NÃO é aplicado agora — só
   * fica registada a cópia, e a UI mostra a evolução sozinha em destaque
   * pra confirmação. O efeito de fato entra em confirmEvolution().
   */
  chooseUpgrade(upgrade) {
    const evolution = this._findPendingEvolution(upgrade);
    if (evolution) {
      this.runState.registerPick(upgrade.id);
      EventBus.emit('evolution-ready', { evolution });
      return;
    }

    this._applyUpgrade(upgrade);
  }

  /** Chamado pela LevelUpUI quando o jogador confirma a carta de evolução. */
  confirmEvolution(evolution) {
    this._applyUpgrade(evolution);
  }

  /**
   * @returns {object|null} a entrada de evolução correspondente se esta
   * escolha completa o número de cópias exigido, senão null.
   */
  _findPendingEvolution(upgrade) {
    if (!upgrade.evolvesInto) return null;
    const picksSoFar = this.runState.upgradeCounts[upgrade.id] || 0;
    if (picksSoFar + 1 < EVOLUTION_STACK_THRESHOLD) return null;
    return this.upgradeDefs.find((u) => u.id === upgrade.evolvesInto) || null;
  }

  /**
   * Aplica os efeitos de uma carta normal OU de uma evolução (que tem
   * vários efeitos em `effects` em vez de um só). Efeitos puramente
   * numéricos (multiplicadores etc.) ficam em RunState; os que precisam
   * mexer no Player/scene de verdade (vida atual, tamanho do sprite,
   * spawnar uma habilidade) ficam aqui.
   */
  _applyUpgrade(upgrade) {
    this.runState.applyUpgrade(upgrade);

    const effects = upgrade.type === 'evolution' ? upgrade.effects : [upgrade];
    effects.forEach((effect) => this._applyRuntimeEffect(effect));

    if (upgrade.type === 'unlockAbility') {
      // AbilityManager (soco/drone) escuta este evento pra instanciar a
      // habilidade; a katana lê runState.unlockedAbilities direto em
      // Weapon.js. RunManager não precisa saber qual é qual.
      EventBus.emit('ability-unlocked', { abilityId: upgrade.abilityId, def: upgrade });
    }
  }

  /**
   * Ponto de extensão pra novos efeitos que precisam tocar o Player/scene
   * de verdade (não só um número em RunState). Uma evolução nova só
   * precisa listar o `type` certo em `effects` — se for puramente numérico
   * (ex.: mais um damageMultiplier), nem precisa de case aqui.
   */
  _applyRuntimeEffect(effect) {
    switch (effect.type) {
      case 'maxHpBonus':
        this.player.healthSystem.increaseMax(effect.value, { healToFull: false });
        this.player.healthSystem.heal(effect.value);
        break;
      case 'maxHpPercentBonus': {
        const delta = Math.round(BASE_MAX_HP * effect.value);
        this.player.healthSystem.increaseMax(delta, { healToFull: false });
        this.player.healthSystem.heal(delta);
        break;
      }
      case 'sizeMultiplier':
        this.player.applySize(this.runState.sizeMultiplier);
        break;
      default:
        break;
    }
  }

  registerKill() {
    this.runState.registerKill();
  }

  restart() {
    this.runState.reset();
  }
}
