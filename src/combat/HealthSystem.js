// Componente de vida. Não é uma classe base — é composição:
export default class HealthSystem {
  constructor(maxHp, callbacks = {}) {
    this.maxHp = maxHp;
    this.current = maxHp;
    this.onChange = callbacks.onChange || (() => {});
    this.onDeath = callbacks.onDeath || (() => {});
    this.dead = false;
  }

  takeDamage(amount) {
    if (this.dead || amount <= 0) return 0;

    const appliedDamage = Math.min(this.current, amount);
    this.current = Math.max(0, this.current - amount);
    this.onChange(this.current, this.maxHp);

    if (this.current <= 0) {
      this.dead = true;
      this.onDeath();
    }

    // Retorna o dano que realmente saiu da vida. Útil para feedback visual
    // sem expor o dano bruto antes de redução/escudo.
    return appliedDamage;
  }

  heal(amount) {
    if (this.dead || amount <= 0) return 0;

    const appliedHeal = Math.min(this.maxHp - this.current, amount);
    this.current = Math.min(this.maxHp, this.current + amount);
    this.onChange(this.current, this.maxHp);

    // Retorna a cura que realmente entrou na vida (útil pro feedback
    // visual do lifesteal não mostrar número maior que o que encheu).
    return appliedHeal;
  }

  increaseMax(amount, { healToFull = false } = {}) {
    this.maxHp += amount;
    this.current = healToFull ? this.maxHp : Math.min(this.maxHp, this.current + amount);
    this.onChange(this.current, this.maxHp);
  }

  isDead() {
    return this.dead;
  }
}
