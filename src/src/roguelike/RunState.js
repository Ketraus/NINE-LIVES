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
    this.maxHpBonus = 0;

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

  applyUpgrade(upgrade) {
    switch (upgrade.type) {
      case 'damageMultiplier':
        this.damageMultiplier += upgrade.value;
        break;
      case 'speedMultiplier':
        this.speedMultiplier += upgrade.value;
        break;
      case 'cooldownMultiplier':
        this.cooldownMultiplier = Math.min(0.8, this.cooldownMultiplier + upgrade.value);
        break;
      case 'rangeMultiplier':
        this.rangeMultiplier += upgrade.value;
        break;
      case 'maxHpBonus':
        this.maxHpBonus += upgrade.value;
        break;
      default:
        break;
    }
  }
}
