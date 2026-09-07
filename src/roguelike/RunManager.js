import EventBus from '../systems/EventBus.js';
import { BASE_MAX_HP } from '../entities/Player.js';

// Regra padrão: obter a MESMA carta base 5 vezes evolui ela. Cartas com
const EVOLUTION_STACK_THRESHOLD = 5;

// Quantas opções normais de carta o level-up mostra por padrão. A carta
const BASE_LEVEL_UP_OPTIONS = 3;

// Peso de sorteio por raridade — usado só pra decidir QUAIS das cartas
const RARITY_WEIGHTS = { common: 70, rare: 25, epic: 5 };

// Toda carta épica (rarity: 'epic') que não declarar seu próprio
const EPIC_STACK_LIMIT = 3;

// Dono do FLUXO de progressão. RunState guarda os números; RunManager
export default class RunManager {
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
    const options = this._rollLevelUpOptions();
    // Pool vazio (jogador já pegou/maxou todas as cartas disponíveis pra
    if (options.length === 0) return;
    EventBus.emit('level-up', { options });
  }

  // Sorteia as opções de level-up (extraído de _triggerLevelUp pra ser re…
  _rollLevelUpOptions() {
    const pool = this._getAvailableUpgrades();
    // "Arsenal Expandido" soma ao número base de opções mostradas — ver
    const optionCount = BASE_LEVEL_UP_OPTIONS + this.runState.maxCardSlotsBonus;
    return this._pickWeightedUpgrades(pool, optionCount);
  }

  // Chamado pela carta "Restock" (evolução ARSENAL OVERRIDE, ver LevelUpU…
  rerollOptions() {
    const options = this._rollLevelUpOptions();
    return options.length > 0 ? options : null;
  }

  // Sorteia `count` cartas sem repetir, ponderando pela raridade
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

  // Cartas "base" (sem weaponId) valem pra qualquer classe. Cartas
  _getAvailableUpgrades() {
    return this.upgradeDefs.filter((upgrade) => {
      if (upgrade.category === 'evolution') return false;
      if (upgrade.weaponId && upgrade.weaponId !== this.runState.weaponId) return false;
      const evolution = this._findEvolutionFor(upgrade);
      if (evolution && this.runState.ownedUpgradeIds.has(evolution.id)) return false;
      const owned = this.runState.upgradeCounts[upgrade.id] || 0;
      if (owned >= this._maxStacksFor(upgrade)) return false;
      return true;
    });
  }

  // Quantas cópias de uma carta o jogador pode ter no total, antes dela
  _maxStacksFor(upgrade) {
    if (upgrade.maxStacks) return upgrade.maxStacks;
    if (upgrade.type === 'unlockAbility') return 1;
    if (upgrade.rarity === 'epic') return EPIC_STACK_LIMIT;
    return Infinity;
  }

  // Chamado pela LevelUpUI quando o jogador escolhe uma das 3 cartas
  chooseUpgrade(upgrade) {
    this._applyUpgrade(upgrade);

    const evolution = this._findPendingEvolution(upgrade);
    if (evolution) {
      EventBus.emit('evolution-ready', { evolution });
      return true;
    }
    return false;
  }

  // Chamado pela LevelUpUI quando o jogador confirma a carta de evolução.
  confirmEvolution(evolution) {
    this._applyUpgrade(evolution);
  }

  // acabou de completar (exatamente) o número de cópias exigido — o padrão
  _findPendingEvolution(upgrade) {
    const picks = this.runState.upgradeCounts[upgrade.id] || 0;
    const threshold = upgrade.evolvesAtStacks ?? EVOLUTION_STACK_THRESHOLD;
    if (picks !== threshold) return null;
    const evolution = this._findEvolutionFor(upgrade);
    if (!evolution) return null;
    return this._resolveEvolutionName(evolution);
  }

  // Acha, em data/upgrades.js, a entrada de evolução (category:
  _findEvolutionFor(upgrade) {
    const candidates = this.upgradeDefs.filter(
      (u) => u.category === 'evolution' && u.evolvesFrom === upgrade.id
    );
    if (candidates.length === 0) return null;
    const weaponId = this.runState.weaponId;
    return candidates.find((c) => c.weaponId === weaponId) ?? candidates.find((c) => !c.weaponId) ?? null;
  }

  // Algumas evoluções (ex.: `dmg_up_evo_overcharge` / Overclock) valem pra
  _resolveEvolutionName(evolution) {
    if (!evolution.namesByWeapon) return evolution;
    const name = evolution.namesByWeapon[this.runState.weaponId] ?? evolution.name;
    return { ...evolution, name };
  }

  // Aplica os efeitos de uma carta normal OU de uma evolução (que tem
  _applyUpgrade(upgrade) {
    this.runState.applyUpgrade(upgrade);

    const effects = upgrade.type === 'evolution' ? upgrade.effects : [upgrade];
    effects.forEach((effect) => {
      this._applyRuntimeEffect(effect);

      // AbilityManager (soco/drone/tornado) escuta este evento pra
      if (effect.type === 'unlockAbility') {
        EventBus.emit('ability-unlocked', { abilityId: effect.abilityId, def: effect });
      }

      // Como unlockAbility, mas pra evoluções que MELHORAM uma habilidade já
      if (effect.type === 'upgradeAbility') {
        EventBus.emit('ability-upgraded', { abilityId: effect.abilityId, def: effect });
      }
    });
  }

  // Ponto de extensão pra novos efeitos que precisam tocar o Player/scene
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

  // Usado só pelo DevConsole (F9, ver src/systems/DevConsole.js). Dá uma
  cheatGiveCard(cardId, quantity = 1) {
    const upgrade = this.upgradeDefs.find((u) => u.id === cardId);
    if (!upgrade) {
      return { ok: false, message: `Carta "${cardId}" não existe. Digite "list" pra ver os ids.` };
    }
    if (upgrade.category === 'evolution') {
      const baseCard = this.upgradeDefs.find((u) => u.id === upgrade.evolvesFrom);
      const threshold = baseCard?.evolvesAtStacks ?? EVOLUTION_STACK_THRESHOLD;
      return {
        ok: false,
        message: `"${upgrade.name}" é uma evolução, não dá pra pegar direto — dê a carta base "${upgrade.evolvesFrom}" ${threshold}x.`
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

  // Usado só pelo DevConsole ("list"). Cartas base + as exclusivas da
  cheatListCards() {
    return this.upgradeDefs
      .filter((u) => u.category !== 'evolution')
      .filter((u) => !u.weaponId || u.weaponId === this.runState.weaponId)
      .map((u) => {
        const owned = this.runState.upgradeCounts[u.id] || 0;
        const maxStacks = this._maxStacksFor(u);
        const evolution = this._findEvolutionFor(u);
        let tag = '';
        if (evolution && this.runState.ownedUpgradeIds.has(evolution.id)) {
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

  // Recalcula vida máxima e tamanho do Player a partir dos bônus atuais
  _syncPlayerFromRunState() {
    const hs = this.player.healthSystem;
    const newMax = Math.max(1, Math.round(BASE_MAX_HP * (1 + this.runState.maxHpPercentBonus)) + this.runState.maxHpBonus);
    hs.maxHp = newMax;
    hs.current = Math.min(hs.current, hs.maxHp);
    hs.onChange(hs.current, hs.maxHp);
    this.player.applySize(this.runState.sizeMultiplier);
  }

  // Cheat (DevConsole "xp"): dá XP de verdade, reaproveitando collectXp (…
  cheatAddXp(amount) {
    const qty = Math.max(1, Math.floor(amount));
    this.collectXp(qty);
    return { ok: true, message: `+${qty} XP (nível ${this.runState.level}, ${this.runState.xp}/${this.runState.xpToNext}).` };
  }

  // Cheat (DevConsole "levelup"): sobe N níveis instantaneamente, sem ofe…
  cheatLevelUp(count = 1) {
    const n = Math.max(1, Math.floor(count));
    for (let i = 0; i < n; i++) this.runState.forceLevelUp();
    EventBus.emit('xp-changed', { xp: this.runState.xp, xpToNext: this.runState.xpToNext, level: this.runState.level });
    return { ok: true, message: `Nível agora: ${this.runState.level}.` };
  }

  // Cheat (DevConsole "heal"): cura o jogador pra vida máxima atual.
  cheatHeal() {
    const hs = this.player.healthSystem;
    hs.heal(hs.maxHp);
    return { ok: true, message: `Vida restaurada (${hs.current}/${hs.maxHp}).` };
  }

  // Cheat (DevConsole "god"): liga/desliga invencibilidade (ver checagem…
  cheatToggleGodMode() {
    this.player.godMode = !this.player.godMode;
    return { ok: true, message: `God Mode ${this.player.godMode ? 'ATIVADO' : 'desativado'}.` };
  }

  // Cheat (DevConsole "kill"): mata o jogador na hora, pra testar a tela…
  cheatKillPlayer() {
    const hs = this.player.healthSystem;
    hs.takeDamage(hs.current + 9999);
    return { ok: true, message: 'Jogador morto (dano forçado).' };
  }

  // Cheat (DevConsole "remove"): desfaz até `quantity` cópias de uma carta
  cheatRemoveCard(cardId, quantity = 1) {
    const upgrade = this.upgradeDefs.find((u) => u.id === cardId);
    if (!upgrade) {
      return { ok: false, message: `Carta "${cardId}" não existe. Digite "list" pra ver os ids.` };
    }
    if (upgrade.category === 'evolution') {
      return { ok: false, message: `"${upgrade.name}" é uma evolução, não dá pra remover direto — use "resetcards".` };
    }
    const owned = this.runState.upgradeCounts[cardId] || 0;
    if (owned === 0) {
      return { ok: false, message: `Você não tem "${upgrade.name}".` };
    }

    const removed = this.runState.removeUpgrade(upgrade, Math.max(1, Math.floor(quantity)));
    this._syncPlayerFromRunState();
    const left = this.runState.upgradeCounts[cardId] || 0;
    return { ok: true, message: `-${removed}x "${upgrade.name}" (restam ${left}).` };
  }

  // Cheat (DevConsole "resetcards"): limpa todas as cartas/upgrades da run
  cheatResetCards() {
    this.runState.resetUpgrades();
    this._syncPlayerFromRunState();
    const hs = this.player.healthSystem;
    hs.heal(hs.maxHp);

    if (this.player.shieldSystem) {
      this.player.shieldSystem = null;
      this.player.shieldFx?.destroy();
      this.player.shieldFx = null;
      EventBus.emit('player-shield-changed', { current: 0, max: 0 });
    }
    EventBus.emit('ability-reset');

    return { ok: true, message: 'Todas as cartas e upgrades foram resetados.' };
  }
}
