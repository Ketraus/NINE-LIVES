import EventBus from '../systems/EventBus.js';
import { BASE_MAX_HP } from '../entities/Player.js';

// Regra atual: obter a MESMA carta base 5 vezes evolui ela. Único número
// mágico do sistema — se um dia cada carta precisar de um número diferente
// de cópias, isto vira um campo em data/upgrades.js (ex.: `evolvesAtStacks`)
// em vez de uma constante global.
const EVOLUTION_STACK_THRESHOLD = 5;

// Quantas opções normais de carta o level-up mostra por padrão. A carta
// "Arsenal Expandido" (maxCardSlotsBonus em RunState) soma a este número —
// pegar a carta faz o PRÓXIMO level-up (e os seguintes) oferecer +1 opção.
const BASE_LEVEL_UP_OPTIONS = 3;

// Peso de sorteio por raridade — usado só pra decidir QUAIS das cartas
// disponíveis aparecem entre as opções do level-up (ver
// _pickWeightedUpgrades). Quanto menor o peso, mais rara a carta é de
// aparecer; não é uma probabilidade absoluta, é relativa às outras cartas
// ainda disponíveis no sorteio.
const RARITY_WEIGHTS = { common: 70, rare: 25, epic: 5 };

// Toda carta épica (rarity: 'epic') que não declarar seu próprio
// `maxStacks` cai neste teto por padrão (ver _maxStacksFor).
const EPIC_STACK_LIMIT = 3;

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
    // "Arsenal Expandido" soma ao número base de opções mostradas — ver
    // BASE_LEVEL_UP_OPTIONS e RunState.maxCardSlotsBonus.
    const optionCount = BASE_LEVEL_UP_OPTIONS + this.runState.maxCardSlotsBonus;
    const options = this._pickWeightedUpgrades(pool, optionCount);
    EventBus.emit('level-up', { options });
  }

  /**
   * Sorteia `count` cartas sem repetir, ponderando pela raridade
   * (RARITY_WEIGHTS): a cada rodada, o peso de cada candidata restante
   * define a chance dela ser a escolhida, e ela sai do grupo antes da
   * próxima rodada — assim uma carta épica pode aparecer mais de uma vez
   * entre as 3 opções em runs diferentes, mas com bem menos frequência
   * que uma comum ou rara.
   */
  _pickWeightedUpgrades(pool, count) {
    const remaining = [...pool];
    const picks = [];

    while (remaining.length > 0 && picks.length < count) {
      const totalWeight = remaining.reduce((sum, u) => sum + this._rarityWeight(u), 0);
      let roll = Phaser.Math.FloatBetween(0, totalWeight);
      let chosenIndex = remaining.length - 1;

      for (let i = 0; i < remaining.length; i++) {
        roll -= this._rarityWeight(remaining[i]);
        if (roll <= 0) {
          chosenIndex = i;
          break;
        }
      }

      picks.push(remaining[chosenIndex]);
      remaining.splice(chosenIndex, 1);
    }

    return picks;
  }

  _rarityWeight(upgrade) {
    return RARITY_WEIGHTS[upgrade.rarity] ?? RARITY_WEIGHTS.common;
  }

  /**
   * Cartas "base" (sem weaponId) valem pra qualquer classe. Cartas
   * "exclusive" só entram no pool se `weaponId` bater com a arma escolhida
   * na WeaponSelectScene. Cartas "evolution" nunca aparecem aqui — elas
   * são forçadas sozinhas via evento 'evolution-ready' (ver
   * _findPendingEvolution), nunca misturadas com as 3 opções normais. Uma
   * vez evoluída, a carta base original some do pool (não faz sentido
   * continuar oferecendo Vitalidade depois de virar COLOSSO).
   *
   * Toda carta tem um teto de cópias (ver _maxStacksFor) — uma vez
   * atingido, some do pool. É esse teto (e não mais um caso especial por
   * tipo) que trata `unique` (1x), `unlockAbility` sem `maxStacks` (1x,
   * ex.: Pancada Sísmica, Corte Duplo) e cartas com `maxStacks` explícito
   * (ex.: Purificação e GatoDrone agora empilham até 3x, cada cópia soma
   * mais um cachorro/drone — ver AbilityManager._unlock).
   *
   * Ponto de extensão: uma arma nova só precisa de novas entradas em
   * data/upgrades.js com o `weaponId` certo — nada aqui muda. O mesmo vale
   * pra cartas base novas (basta não setar `weaponId`).
   */
  _getAvailableUpgrades() {
    return this.upgradeDefs.filter((upgrade) => {
      if (upgrade.category === 'evolution') return false;
      if (upgrade.weaponId && upgrade.weaponId !== this.runState.weaponId) return false;
      if (upgrade.evolvesInto && this.runState.ownedUpgradeIds.has(upgrade.evolvesInto)) return false;
      const owned = this.runState.upgradeCounts[upgrade.id] || 0;
      if (owned >= this._maxStacksFor(upgrade)) return false;
      return true;
    });
  }

  /**
   * Quantas cópias de uma carta o jogador pode ter no total, antes dela
   * sumir do pool de ofertas. Ordem de prioridade:
   *  1. `maxStacks` explícito em data/upgrades.js — vence sempre que
   *     presente (ex.: Purificação e GatoDrone: 3).
   *  2. `unlockAbility` sem `maxStacks` — 1x por padrão (habilidades
   *     exclusivas de arma que não foram pensadas pra empilhar, ex.:
   *     Pancada Sísmica, Corte Duplo).
   *  3. raridade `epic` sem `maxStacks` — EPIC_STACK_LIMIT (3).
   *  4. qualquer outra carta base comum/rara — sem teto (Infinity).
   */
  _maxStacksFor(upgrade) {
    if (upgrade.maxStacks) return upgrade.maxStacks;
    if (upgrade.type === 'unlockAbility') return 1;
    if (upgrade.rarity === 'epic') return EPIC_STACK_LIMIT;
    return Infinity;
  }

  /**
   * Chamado pela LevelUpUI quando o jogador escolhe uma das 3 cartas
   * normais. O efeito da carta É SEMPRE aplicado normalmente (o estado das
   * cópias anteriores nunca é apagado — elas continuam valendo). Se esta
   * escolha completou o número de cópias exigido (N = EVOLUTION_STACK_
   * THRESHOLD) e a carta tiver `evolvesInto`, a evolução é oferecida
   * *em cima* do que já foi aplicado, forçada sozinha em destaque pra
   * confirmação — o efeito da evolução em si só entra em confirmEvolution().
   * @returns {boolean} true se esta escolha disparou uma evolução pendente
   * (usado pela LevelUpUI pra saber se deve manter a tela aberta em vez de
   * fechar, já que showEvolution() acabou de reconstruir o overlay).
   */
  chooseUpgrade(upgrade) {
    this._applyUpgrade(upgrade);

    const evolution = this._findPendingEvolution(upgrade);
    if (evolution) {
      EventBus.emit('evolution-ready', { evolution });
      return true;
    }
    return false;
  }

  /** Chamado pela LevelUpUI quando o jogador confirma a carta de evolução. */
  confirmEvolution(evolution) {
    this._applyUpgrade(evolution);
  }

  /**
   * @returns {object|null} a entrada de evolução correspondente se a carta
   * acabou de completar (exatamente) o número de cópias exigido, senão
   * null. Chamado DEPOIS de _applyUpgrade, então upgradeCounts já reflete
   * esta escolha.
   */
  _findPendingEvolution(upgrade) {
    if (!upgrade.evolvesInto) return null;
    const picks = this.runState.upgradeCounts[upgrade.id] || 0;
    if (picks !== EVOLUTION_STACK_THRESHOLD) return null;
    const evolution = this.upgradeDefs.find((u) => u.id === upgrade.evolvesInto);
    if (!evolution) return null;
    // algumas evoluções de carta base só fazem sentido pra uma arma
    // específica (ex.: "Instinto Caçador" mexe direto no projétil da
    // pistola, ver RangedWeapon). Se a evolução tiver `weaponId` e não
    // bater com a arma da run, ela simplesmente não fica pronta ainda —
    // a carta base continua empilhando normalmente pra essa arma, até
    // uma evolução própria ser criada pra ela.
    if (evolution.weaponId && evolution.weaponId !== this.runState.weaponId) return null;
    return this._resolveEvolutionName(evolution);
  }

  /**
   * Algumas evoluções (ex.: `dmg_up_evo_overcharge` / Overclock) valem pra
   * qualquer arma mas mudam de nome conforme a arma escolhida na run —
   * mesmo `id`/`effects`, só o texto muda. `namesByWeapon` em
   * data/upgrades.js mapeia weaponId -> nome; se a entrada não tiver esse
   * campo (ex.: COLOSSO), devolve a evolução como está, sem cópia.
   */
  _resolveEvolutionName(evolution) {
    if (!evolution.namesByWeapon) return evolution;
    const name = evolution.namesByWeapon[this.runState.weaponId] ?? evolution.name;
    return { ...evolution, name };
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
    effects.forEach((effect) => {
      this._applyRuntimeEffect(effect);

      // AbilityManager (soco/drone/tornado) escuta este evento pra
      // instanciar a habilidade; a katana lê runState.unlockedAbilities
      // direto em Weapon.js. RunManager não precisa saber qual é qual.
      // Checado por EFEITO (não pelo `upgrade` como um todo) pra também
      // funcionar quando o unlockAbility vem de dentro de `effects` de uma
      // evolução (ex.: Patas Turbo -> Vórtice Turbo) e não só de uma carta
      // exclusiva normal (onde effects é só [upgrade], então o resultado
      // pra elas continua idêntico a antes).
      if (effect.type === 'unlockAbility') {
        EventBus.emit('ability-unlocked', { abilityId: effect.abilityId, def: effect });
      }
    });
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

  /**
   * Usado só pelo DevConsole (F9, ver src/systems/DevConsole.js). Dá uma
   * carta específica por id, reaproveitando as MESMAS regras de
   * exclusividade por arma que o level-up normal usa — nunca deixa pegar
   * carta de outra classe. Cartas "unlockAbility" só fazem sentido 1x
   * (quantidade é ignorada pra elas). Evoluções não podem ser pedidas
   * direto (só a carta base, EVOLUTION_STACK_THRESHOLD vezes, exatamente
   * como no jogo normal) — se a quantidade pedida completar o limiar, ela
   * evolui sozinha no meio do loop e o resto da quantidade pedida é
   * descartado (a carta base some
   * do pool depois de evoluir, igual ao fluxo normal de RunManager).
   * @returns {{ ok: boolean, message: string }}
   */
  cheatGiveCard(cardId, quantity = 1) {
    const upgrade = this.upgradeDefs.find((u) => u.id === cardId);
    if (!upgrade) {
      return { ok: false, message: `Carta "${cardId}" não existe. Digite "list" pra ver os ids.` };
    }
    if (upgrade.category === 'evolution') {
      return {
        ok: false,
        message: `"${upgrade.name}" é uma evolução, não dá pra pegar direto — dê a carta base "${upgrade.evolvesFrom}" ${EVOLUTION_STACK_THRESHOLD}x.`
      };
    }
    if (upgrade.weaponId && upgrade.weaponId !== this.runState.weaponId) {
      return {
        ok: false,
        message: `"${upgrade.name}" é exclusiva de ${upgrade.weaponId}, e você está com ${this.runState.weaponId}.`
      };
    }

    const maxStacks = this._maxStacksFor(upgrade);
    const owned = this.runState.upgradeCounts[upgrade.id] || 0;
    if (owned >= maxStacks) {
      return { ok: false, message: `Você já tem o máximo de "${upgrade.name}" (${owned}/${maxStacks}).` };
    }

    const requested = Math.max(1, Math.floor(quantity));
    const room = Number.isFinite(maxStacks) ? maxStacks - owned : requested;
    const toApply = Math.min(requested, room);
    let applied = 0;
    let evolvedInto = null;

    for (let i = 0; i < toApply; i++) {
      this._applyUpgrade(upgrade);
      applied += 1;
      const evolution = this._findPendingEvolution(upgrade);
      if (evolution) {
        this._applyUpgrade(evolution);
        evolvedInto = evolution.name;
        break;
      }
    }

    let message = `+${applied}x "${upgrade.name}"`;
    if (evolvedInto) {
      message += ` → evoluiu para "${evolvedInto}"`;
      if (applied < requested) message += ` (parou aí, o resto do pedido foi ignorado)`;
    } else if (requested > applied) {
      message += ` (limitado ao máximo de ${maxStacks}x, resto do pedido foi ignorado)`;
    }
    return { ok: true, message };
  }

  /**
   * Usado só pelo DevConsole ("list"). Cartas base + as exclusivas da
   * arma atual, marcando quantas cópias já foram tiradas (e o teto de
   * cada uma, ver _maxStacksFor) — a mesma visão que RunManager usaria
   * pra montar o pool de ofertas normais.
   */
  cheatListCards() {
    return this.upgradeDefs
      .filter((u) => u.category !== 'evolution')
      .filter((u) => !u.weaponId || u.weaponId === this.runState.weaponId)
      .map((u) => {
        const owned = this.runState.upgradeCounts[u.id] || 0;
        const maxStacks = this._maxStacksFor(u);
        let tag = '';
        if (u.evolvesInto && this.runState.ownedUpgradeIds.has(u.evolvesInto)) {
          tag = ' [já evoluiu]';
        } else if (owned > 0) {
          tag = Number.isFinite(maxStacks) ? ` [${owned}/${maxStacks}]` : ` [${owned}x]`;
        }
        const rarityIcon = { common: '⚪', rare: '🔵', epic: '🟣' }[u.rarity] ?? '⚪';
        return `${rarityIcon} ${u.id} — ${u.name}${tag}`;
      });
  }

  registerKill() {
    this.runState.registerKill();
  }

  restart() {
    this.runState.reset();
  }
}
