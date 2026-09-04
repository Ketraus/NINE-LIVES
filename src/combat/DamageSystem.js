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

  /**
   * Dano direto de um ataque de arma (sem cooldown próprio — quem
   * controla a cadência é o WeaponManager).
   * @param {Phaser.Physics.Arcade.Sprite} target
   * @param {number} damage
   * @param {Player} [source] - quem causou o dano; opcional. Se tiver
   *   source.healthSystem e source.runState.lifestealFraction > 0 (carta
   *   "Sanguessuga"), uma fração do dano é curada de volta (ver
   *   _applyLifesteal). Passar undefined mantém o comportamento de sempre.
   * @param {number} [nowMs] - scene.time.now; só necessário pra rolar a
   *   paralisia da evolução "Overcharge" (ver _applyParalyze) — sem ele
   *   (chamadores que não passam, ex.: espinhos/Pancada Sísmica/GatoDrone)
   *   a paralisia simplesmente não é checada, resto do dano funciona igual.
   * @returns {boolean} true se o dano foi de fato aplicado (alvo vivo/ativo)
   */
  static applyWeaponHit(target, damage, source, nowMs) {
    if (target.godMode) return false; // cheat "god" do DevConsole (F9) — ver Player.godMode
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return false;
    if (this._rollDodge(target)) return false;
    // guardado ANTES de takeDamage: se este golpe matar o alvo, o
    // onDeath() do HealthSystem chama target.destroy() na hora (dentro do
    // próprio takeDamage), e um sprite destruído perde target.scene (fica
    // null) — sem isto, o som de hit simplesmente não tocaria em nenhum
    // golpe que mata (é exatamente o caso comum da katana, que costuma
    // matar vários inimigos fracos de uma vez no mesmo corte)
    const targetScene = target.scene;
    target.healthSystem.takeDamage(this._applyShield(target, this._applyDamageReduction(target, damage), nowMs ?? 0));
    target.playHitReaction?.();
    // som de impacto genérico — toca sempre que um golpe de arma/ataque
    // realmente conecta (soco, katana, pistola e as habilidades que usam
    // este mesmo método)
    targetScene?.sound?.play('sfx_hit', { volume: 0.5 });
    this._applyLifesteal(source, damage);
    this._applyParalyze(target, source, nowMs);
    this._applyBleed(target, source, damage, nowMs);
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
   * Rola a chance de paralisar `target` (carta "Overcharge" — evolução do
   * Overclock/dmg_up, ver RunState.paralyzeOnHitChance). Só faz algo se
   * `source.runState.paralyzeOnHitChance` > 0, `nowMs` foi passado, e o
   * alvo suporta paralisia (Enemy.js inicializa `paralyzedUntil`; se não
   * existir, este método não inventa a propriedade em cima de outra coisa).
   */
  static _applyParalyze(target, source, nowMs) {
    const chance = source?.runState?.paralyzeOnHitChance;
    if (!chance || nowMs === undefined) return;
    if (target.paralyzedUntil === undefined) return;
    if (Math.random() >= chance) return;
    target.paralyzedUntil = nowMs + source.runState.paralyzeOnHitDurationMs;
  }

  /**
   * Aplica Sangramento em `target` (carta "Hemorragia", evolução da
   * Sanguessuga — ver RunState.bleedFraction/bleedDurationMs/
   * bleedTickIntervalMs). O dano por tick usa `damage` BRUTO (o mesmo valor
   * cru que _applyLifesteal usa — dano do ataque que aplicou, não o que
   * sobrou depois de escudo/redução do alvo), conforme pedido. Precisa de
   * `nowMs` pra agendar os ticks (ver Enemy.applyBleed); sem ele (alguns
   * chamadores de applyWeaponHit não passam, ex.: espinhos/drone/pancada
   * sísmica), o Sangramento simplesmente não é aplicado nesse hit — mesmo
   * padrão de _applyParalyze.
   */
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

  /**
   * Deixa o escudo (carta "Escudo Energético", evolução de Blindagem)
   * absorver o dano antes da vida, se o alvo tiver um. Só o Player pode
   * ter `shieldSystem` (ver Player._unlockShield); inimigos passam por
   * aqui sem efeito, igual a _applyDamageReduction.
   */
  static _applyShield(target, damage, nowMs) {
    if (!target.shieldSystem) return damage;
    return target.shieldSystem.absorb(damage, nowMs);
  }

  /**
   * Rola a chance de `target` desviar de UM ataque por completo (carta
   * "Sexto Sentido", evolução de Reflexo Felino — ver RunState.dodgeChance).
   * Se acertar, nenhum dano é aplicado (nem reduzido, nem absorvido pelo
   * escudo — simplesmente não conecta) e `target.onDodge?.()` é chamado
   * pro visual (Player fica transparente por um instante). Só o Player tem
   * `runState`, então inimigos passam por aqui sem nunca desviar.
   */
  static _rollDodge(target) {
    const chance = target?.runState?.dodgeChance;
    if (!chance) return false;
    if (Math.random() >= chance) return false;
    target.onDodge?.();
    return true;
  }
}
