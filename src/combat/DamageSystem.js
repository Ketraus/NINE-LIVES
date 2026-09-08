// Funções utilitárias de dano. Ficam centralizadas aqui em vez de
export default class DamageSystem {
  // 3 variações de grito de dor do Minotauro (ver _hitSfxKey) — sorteadas
  // a cada golpe pra não ficar repetitivo
  static MINOTAUR_HIT_SFX_KEYS = ['sfx_minotaur_hit1', 'sfx_minotaur_hit2', 'sfx_minotaur_hit3'];

  // Dano de contato com cooldown por-alvo (evita tirar vida todo frame
  static applyContactDamage(attacker, target, damage, cooldownMs, nowMs) {
    if (target.godMode) return false; // cheat "god" do DevConsole (F9) — ver Player.godMode
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return false;
    if (target.invulnerableUntil && nowMs < target.invulnerableUntil) return false;

    const lastHitKey = `_lastHit_${attacker.id || attacker.name || 'atk'}`;
    const lastHit = target[lastHitKey] || 0;
    if (nowMs - lastHit < cooldownMs) return false;

    target[lastHitKey] = nowMs;

    if (this._rollDodge(target)) return false;

    target.healthSystem.takeDamage(this._applyShield(target, this._applyDamageReduction(target, damage), nowMs));
    target.playHitReaction?.();

    if (target.invulnerableMs) {
      target.invulnerableUntil = nowMs + target.invulnerableMs;
    }

    return true;
  }

  // Dano direto de um ataque de arma (sem cooldown próprio — quem
  static applyWeaponHit(target, damage, source, nowMs) {
    if (target.godMode) return false; // cheat "god" do DevConsole (F9) — ver Player.godMode
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return false;
    if (this._rollDodge(target)) return false;
    // janela vulnerável do Minotauro pós-investida (ver Enemy._endCharge) —
    damage *= target.vulnerableDamageMultiplier || 1;
    // guardado ANTES de takeDamage: se este golpe matar o alvo, o
    const targetScene = target.scene;
    target.healthSystem.takeDamage(this._applyShield(target, this._applyDamageReduction(target, damage), nowMs ?? 0));
    target.playHitReaction?.();
    // som de impacto genérico — toca sempre que um golpe de arma/ataque
    targetScene?.sound?.play(this._hitSfxKey(target), { volume: 0.5 });
    this._applyLifesteal(source, damage);
    this._applyParalyze(target, source, nowMs);
    this._applyBleed(target, source, damage, nowMs);
    return true;
  }

  // Escolhe o som de "hit" certo pro alvo: Minotauro sorteia entre as 3
  // variações de dor dele, Elite tem o som próprio, o resto usa o genérico
  static _hitSfxKey(target) {
    if (target.def?.boss) {
      const keys = this.MINOTAUR_HIT_SFX_KEYS;
      return keys[Math.floor(Math.random() * keys.length)];
    }
    return target.def?.elite ? 'sfx_elite_hit' : 'sfx_hit';
  }

  // Cura `source` em uma fração do dano que ele acabou de causar, se ele
  static _applyLifesteal(source, damage) {
    const fraction = source?.runState?.lifestealFraction;
    if (!fraction || !source.healthSystem || source.healthSystem.isDead()) return;
    source.healthSystem.heal(damage * fraction);
  }

  // Rola a chance de paralisar `target` (carta "Overcharge" — evolução do
  static _applyParalyze(target, source, nowMs) {
    const chance = source?.runState?.paralyzeOnHitChance;
    if (!chance || nowMs === undefined) return;
    if (target.paralyzedUntil === undefined) return;
    if (Math.random() >= chance) return;
    target.paralyzedUntil = nowMs + source.runState.paralyzeOnHitDurationMs;
  }

  // Aplica Sangramento em `target` (carta "Hemorragia", evolução da
  static _applyBleed(target, source, damage, nowMs) {
    const fraction = source?.runState?.bleedFraction;
    if (!fraction || nowMs === undefined) return;
    if (typeof target.applyBleed !== 'function') return;
    target.applyBleed(
      damage * fraction,
      nowMs,
      source.runState.bleedDurationMs,
      source.runState.bleedTickIntervalMs
    );
  }

  // Reduz o dano recebido por `target.runState.damageReductionFraction`
  static _applyDamageReduction(target, damage) {
    const reduction = target?.runState?.damageReductionFraction;
    if (!reduction) return damage;
    return damage * (1 - reduction);
  }

  // Deixa o escudo (carta "Escudo Energético", evolução de Blindagem)
  static _applyShield(target, damage, nowMs) {
    if (!target.shieldSystem) return damage;
    return target.shieldSystem.absorb(damage, nowMs);
  }

  // Rola a chance de `target` desviar de UM ataque por completo (carta
  static _rollDodge(target) {
    const chance = target?.runState?.dodgeChance;
    if (!chance) return false;
    if (Math.random() >= chance) return false;
    target.onDodge?.();
    return true;
  }
}
