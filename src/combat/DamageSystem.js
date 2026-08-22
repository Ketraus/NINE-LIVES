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
   * @param {Phaser.Physics.Arcade.Sprite} target
   * @param {number} damage
   * @param {Player} [source] - quem causou o dano; opcional. Se tiver
   *   source.healthSystem e source.runState.lifestealFraction > 0 (carta
   *   "Sanguessuga"), uma fração do dano é curada de volta (ver
   *   _applyLifesteal). Passar undefined mantém o comportamento de sempre.
   * @returns {boolean} true se o dano foi de fato aplicado (alvo vivo/ativo)
   */
  static applyWeaponHit(target, damage, source) {
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return false;
    target.healthSystem.takeDamage(this._applyDamageReduction(target, damage));
    target.playHitReaction?.();
    this._applyLifesteal(source, damage);
    return true;
  }

  /**
   * Cura `source` em uma fração do dano que ele acabou de causar, se ele
   * tiver `runState.lifestealFraction` (carta "Sanguessuga", ver
   * RunState). Função isolada pra não duplicar a checagem em todo lugar
   * que chama applyWeaponHit.
   */
  static _applyLifesteal(source, damage) {
    const fraction = source?.runState?.lifestealFraction;
    if (!fraction || !source.healthSystem || source.healthSystem.isDead()) return;
    source.healthSystem.heal(damage * fraction);
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
