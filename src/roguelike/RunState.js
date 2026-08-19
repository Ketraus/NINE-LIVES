/**
 * Dados puros da run em andamento. Sem lógica de fluxo (isso é o
 * RunManager) — só os números que o resto do jogo consulta.
 * Já vem com os campos que features futuras (XP, waves, progressão)
 * vão precisar, mesmo usando só uma fração deles agora.
 */
export default class RunState {
  /** @param {string} [weaponId] - arma escolhida na WeaponSelectScene */
  constructor(weaponId = null) {
    this.weaponId = weaponId;
    this.reset();
  }

  // weaponId não é resetado aqui de propósito: um restart (tecla R)
  // deve manter a arma escolhida, só zerar o progresso da run.
  reset() {
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 20;
    this.kills = 0;

    // multiplicadores/bônus que upgrades (cartas) alteram
    this.damageMultiplier = 0;
    this.speedMultiplier = 0;
    this.cooldownMultiplier = 0; // fração de redução, ex 0.15 = -15%
    this.rangeMultiplier = 0;
    this.maxHpBonus = 0; // flat, pra cartas futuras que não sejam percentuais
    this.maxHpPercentBonus = 0; // fração da vida BASE, ex 0.2 = +20% (ver Player.BASE_MAX_HP)
    this.sizeMultiplier = 0; // fração de crescimento do sprite, ex 0.4 = +40% de tamanho
    this.thornsDamage = 2; // dano de contra-ataque ao ser atingido (base pequena, upgradável)

    // ids de habilidades exclusivas desbloqueadas (ex.: 'slam', 'doubleStrike',
    // 'drone') — cartas do tipo "unlockAbility" só podem ser tiradas uma vez,
    // então RunManager consulta este set pra não reoferecer o que já foi pego
    this.unlockedAbilities = new Set();

    // todo id de carta (ou evolução) já escolhida nesta run — usado pra
    // filtrar ofertas repetidas (unlockAbility) e esconder a carta base
    // depois que ela evolui (ver RunManager._getAvailableUpgrades)
    this.ownedUpgradeIds = new Set();

    // quantas vezes cada carta base foi escolhida (por id). É isto que
    // RunManager consulta pra saber quando uma carta completou o número de
    // cópias necessário pra evoluir (ver RunManager._findPendingEvolution)
    this.upgradeCounts = {};

    // pronto para o futuro, não usado ainda neste protótipo
    this.wave = 1;
  }

  registerKill() {
    this.kills += 1;
  }

  /** @returns {boolean} true se subiu de nível */
  addXp(amount) {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.round(this.xpToNext * 1.35);
      return true;
    }
    return false;
  }

  /**
   * Registra mais uma cópia de uma carta (sem aplicar efeito nenhum) —
   * usado por RunManager quando a escolha vira uma evolução em vez do
   * efeito normal, mas a contagem de cópias ainda precisa avançar.
   * @returns {number} quantas cópias desta carta já foram registadas
   */
  registerPick(id) {
    this.ownedUpgradeIds.add(id);
    this.upgradeCounts[id] = (this.upgradeCounts[id] || 0) + 1;
    return this.upgradeCounts[id];
  }

  /**
   * Aplica uma carta normal (um efeito só) ou uma evolução (`effects`:
   * vários efeitos de uma vez, ex.: COLOSSO = +vida% + tamanho + -velocidade).
   * Ponto de extensão: um efeito novo só precisa de um `case` aqui SE for
   * puramente numérico; efeitos que mexem no Player/scene de verdade (vida
   * atual, sprite, spawnar habilidade) são tratados em RunManager, não aqui.
   */
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
      case 'unlockAbility':
        this.unlockedAbilities.add(effect.abilityId);
        break;
      default:
        break;
    }
  }
}
