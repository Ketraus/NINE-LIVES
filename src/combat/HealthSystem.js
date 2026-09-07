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
    if (this.dead || amount <= 0) return;
    this.current = Math.max(0, this.current - amount);
    this.onChange(this.current, this.maxHp);
    if (this.current <= 0) {
      this.dead = true;
      this.onDeath();
    }
  }

  heal(amount) {
    if (this.dead) return;
    this.current = Math.min(this.maxHp, this.current + amount);
    this.onChange(this.current, this.maxHp);
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
