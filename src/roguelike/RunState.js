// Dados puros da run em andamento. Sem lógica de fluxo (isso é o
export default class RunState {
  constructor(weaponId = null) {
    this.weaponId = weaponId;
    this.reset();
  }

  // weaponId não é resetado aqui de propósito: um restart (tecla R)
  reset() {
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 12;
    this.kills = 0;
    this.wave = 1;
    this.resetUpgrades();
  }

  // Zera só a parte de cartas/upgrades (multiplicadores, contagens,
  resetUpgrades() {
    // multiplicadores/bônus que upgrades (cartas) alteram
    this.damageMultiplier = 0;
    this.speedMultiplier = 0;
    this.cooldownMultiplier = 0; // fração de redução, ex 0.15 = -15%
    this.rangeMultiplier = 0;
    this.maxHpBonus = 0; // flat, pra cartas futuras que não sejam percentuais
    this.maxHpPercentBonus = 0; // fração da vida BASE, ex 0.2 = +20% (ver Player.BASE_MAX_HP)
    this.sizeMultiplier = 0; // fração de crescimento do sprite, ex 0.4 = +40% de tamanho
    this.thornsDamage = 2; // dano de contra-ataque ao ser atingido (base pequena, upgradável)
    this.lifestealFraction = 0; // fração do dano causado pelo jogador convertida em cura (carta "Sangue…
    this.damageReductionFraction = 0; // fração do dano recebido que é ignorada (carta "Blindagem"), acumula n…
    this.paralyzeOnHitChance = 0; // chance (0-1) de paralisar o inimigo ao acertar (evolução "Overcharge"…
    this.paralyzeOnHitDurationMs = 0; // duração da paralisia quando ela procar (ver DamageSystem._applyParaly…
    this.dodgeChance = 0; // chance (0-1) de desviar de um ataque por completo, sem tomar dano nen…

    // evolução "Hemorragia" (Sanguessuga): fração do dano do ataque
    this.bleedFraction = 0;
    this.bleedTickIntervalMs = 0;
    this.bleedDurationMs = 0;

    // evolução "Corte Fantasma" (Visão Aguçada, katana): chance por golpe de
    this.strayHitsChance = 0;
    this.strayHitsRadius = 0;
    this.strayHitsMaxTargets = 0;

    // evolução "Reflexos de Predador" (Visão Aguçada, punhos): chance por
    this.bulletTimeChance = 0;
    this.bulletTimeDurationMs = 0;

    // bônus ao número de opções de carta mostradas em cada level-up (carta
    this.maxCardSlotsBonus = 0;

    // evolução "ARSENAL OVERRIDE" (Arsenal Expandido): libera a carta
    this.hasRestock = false;

    // ids de habilidades exclusivas desbloqueadas (ex.: 'slam', 'doubleStri…
    this.unlockedAbilities = new Set();

    // todo id de carta (ou evolução) já escolhida nesta run — usado pra
    this.ownedUpgradeIds = new Set();

    // quantas vezes cada carta base foi escolhida (por id). É isto que
    this.upgradeCounts = {};
  }

  registerKill() {
    this.kills += 1;
  }

  addXp(amount) {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.round(this.xpToNext * 1.2);
      return true;
    }
    return false;
  }

  // Sobe 1 nível sem exigir XP de verdade — usado só pelo cheat "levelup"
  forceLevelUp() {
    this.xp = 0;
    this.level += 1;
    this.xpToNext = Math.round(this.xpToNext * 1.2);
  }

  // Inverso de applyUpgrade — usado só pelo cheat "remove" do DevConsole
  removeUpgrade(upgrade, times = 1) {
    const owned = this.upgradeCounts[upgrade.id] || 0;
    const toRemove = Math.min(times, owned);
    if (toRemove <= 0) return 0;

    const effects = upgrade.type === 'evolution' ? upgrade.effects : [upgrade];
    for (let i = 0; i < toRemove; i++) {
      effects.forEach((effect) => this._removeEffect(effect));
      this.upgradeCounts[upgrade.id] -= 1;
    }
    if (this.upgradeCounts[upgrade.id] <= 0) {
      delete this.upgradeCounts[upgrade.id];
      this.ownedUpgradeIds.delete(upgrade.id);
    }
    return toRemove;
  }

  _removeEffect(effect) {
    switch (effect.type) {
      case 'damageMultiplier':
        this.damageMultiplier -= effect.value;
        break;
      case 'speedMultiplier':
        this.speedMultiplier -= effect.value;
        break;
      case 'cooldownMultiplier':
        this.cooldownMultiplier = Math.max(0, this.cooldownMultiplier - effect.value);
        break;
      case 'rangeMultiplier':
        this.rangeMultiplier -= effect.value;
        break;
      case 'maxHpBonus':
        this.maxHpBonus -= effect.value;
        break;
      case 'maxHpPercentBonus':
        this.maxHpPercentBonus -= effect.value;
        break;
      case 'sizeMultiplier':
        this.sizeMultiplier -= effect.value;
        break;
      case 'thornsDamage':
        this.thornsDamage -= effect.value;
        break;
      case 'lifestealFraction':
        this.lifestealFraction -= effect.value;
        break;
      case 'damageReductionFraction':
        this.damageReductionFraction = Math.max(0, this.damageReductionFraction - effect.value);
        break;
      case 'maxCardSlotsBonus':
        this.maxCardSlotsBonus -= effect.value;
        break;
      case 'dodgeChance':
        this.dodgeChance = Math.max(0, this.dodgeChance - effect.value);
        break;
      case 'paralyzeOnHit':
        this.paralyzeOnHitChance = Math.max(0, this.paralyzeOnHitChance - (effect.chance ?? 0));
        break;
      default:
        // unlockAbility/unlockRestock/unlockBleed/strayHits/bulletTimeOnAttack:
        break;
    }
  }

  // Registra mais uma cópia de uma carta (sem aplicar efeito nenhum) —
  registerPick(id) {
    this.ownedUpgradeIds.add(id);
    this.upgradeCounts[id] = (this.upgradeCounts[id] || 0) + 1;
    return this.upgradeCounts[id];
  }

  // Aplica uma carta normal (um efeito só) ou uma evolução (`effects`:
  applyUpgrade(upgrade) {
    this.registerPick(upgrade.id);

    const effects = upgrade.type === 'evolution' ? upgrade.effects : [upgrade];
    effects.forEach((effect) => this._applyEffect(effect));
  }

  _applyEffect(effect) {
    switch (effect.type) {
      case 'damageMultiplier':
        this.damageMultiplier += effect.value;
        break;
      case 'speedMultiplier':
        this.speedMultiplier += effect.value;
        break;
      case 'cooldownMultiplier':
        this.cooldownMultiplier = Math.min(0.8, this.cooldownMultiplier + effect.value);
        break;
      case 'rangeMultiplier':
        this.rangeMultiplier += effect.value;
        break;
      case 'maxHpBonus':
        this.maxHpBonus += effect.value;
        break;
      case 'maxHpPercentBonus':
        this.maxHpPercentBonus += effect.value;
        break;
      case 'sizeMultiplier':
        this.sizeMultiplier += effect.value;
        break;
      case 'thornsDamage':
        this.thornsDamage += effect.value;
        break;
      case 'lifestealFraction':
        this.lifestealFraction += effect.value;
        break;
      case 'damageReductionFraction':
        // cap em 0.9 pelo mesmo motivo do cooldownMultiplier: várias cópias
        this.damageReductionFraction = Math.min(0.9, this.damageReductionFraction + effect.value);
        break;
      case 'maxCardSlotsBonus':
        this.maxCardSlotsBonus += effect.value;
        break;
      case 'unlockAbility':
        this.unlockedAbilities.add(effect.abilityId);
        break;
      case 'unlockRestock':
        this.hasRestock = true;
        break;
      case 'unlockBleed':
        // atribuição direta, não soma: única fonte possível hoje
        this.bleedFraction = effect.fraction ?? this.bleedFraction;
        this.bleedTickIntervalMs = effect.tickIntervalMs ?? this.bleedTickIntervalMs;
        this.bleedDurationMs = effect.durationMs ?? this.bleedDurationMs;
        break;
      case 'paralyzeOnHit':
        // acumula igual às outras frações (thorns, lifesteal etc.) caso um
        this.paralyzeOnHitChance += effect.chance ?? 0;
        this.paralyzeOnHitDurationMs = Math.max(this.paralyzeOnHitDurationMs, effect.durationMs ?? 0);
        break;
      case 'dodgeChance':
        // cap em 0.9 pelo mesmo motivo do damageReductionFraction: não
        this.dodgeChance = Math.min(0.9, this.dodgeChance + effect.value);
        break;
      case 'strayHits':
        // não acumula (+=) de propósito: só existe uma fonte possível hoje
        this.strayHitsChance = effect.chance ?? this.strayHitsChance;
        this.strayHitsRadius = effect.radius ?? this.strayHitsRadius;
        this.strayHitsMaxTargets = effect.maxTargets ?? this.strayHitsMaxTargets;
        break;
      case 'bulletTimeOnAttack':
        // mesmo raciocínio do case 'strayHits' acima: única fonte hoje
        this.bulletTimeChance = effect.chance ?? this.bulletTimeChance;
        this.bulletTimeDurationMs = effect.durationMs ?? this.bulletTimeDurationMs;
        break;
      default:
        break;
    }
  }
}
