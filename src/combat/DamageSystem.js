/**
 * Funções utilitárias de dano. Ficam centralizadas aqui em vez de
 * espalhadas em Player/Enemy para que no futuro (venenos, crítico,
 * resistências) só este arquivo precise crescer.
 */
export default class DamageSystem {
  /**
   * Dano de contato com cooldown por-alvo (evita tirar vida todo frame
   * enquanto os corpos ficam sobrepostos) + invulnerabilidade global
   * opcional no alvo (evita ser atingido por vários inimigos ao mesmo
   * tempo e perder metade da vida num único frame).
   * @param {Phaser.Physics.Arcade.Sprite} attacker
   * @param {Phaser.Physics.Arcade.Sprite} target - precisa ter target.healthSystem;
   *   se tiver target.invulnerableMs, ganha i-frames após ser atingido
   * @param {number} damage
   * @param {number} cooldownMs
   * @param {number} nowMs
   * @returns {boolean} true se o dano foi de fato aplicado
   */
  static applyContactDamage(attacker, target, damage, cooldownMs, nowMs) {
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return false;
    if (target.invulnerableUntil && nowMs < target.invulnerableUntil) return false;

    const lastHitKey = `_lastHit_${attacker.id || attacker.name || 'atk'}`;
    const lastHit = target[lastHitKey] || 0;
    if (nowMs - lastHit < cooldownMs) return false;

    target[lastHitKey] = nowMs;
    target.healthSystem.takeDamage(this._applyDamageReduction(target, damage));
    target.playHitReaction?.();

    if (target.invulnerableMs) {
      target.invulnerableUntil = nowMs + target.invulnerableMs;
    }

    return true;
  }

  /**
   * Dano direto de um ataque de arma (sem cooldown próprio — quem
   * controla a cadência é o WeaponManager).
   * @returns {boolean} true se o dano foi de fato aplicado (alvo vivo/ativo)
   */
  static applyWeaponHit(target, damage) {
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return false;
    target.healthSystem.takeDamage(this._applyDamageReduction(target, damage));
    target.playHitReaction?.();
    return true;
  }

  /**
   * Reduz o dano recebido por `target.runState.damageReductionFraction`
   * (carta "Blindagem", -10% por cópia, acumulado em RunState). Só o
   * Player tem `runState`, então inimigos passam por aqui sem nenhum
   * efeito — mantém as duas funções de dano como o único ponto de
   * extensão pra futuras resistências/fraquezas.
   */
  static _applyDamageReduction(target, damage) {
    const reduction = target?.runState?.damageReductionFraction;
    if (!reduction) return damage;
    return damage * (1 - reduction);
  }
}
