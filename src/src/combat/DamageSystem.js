/**
 * Funções utilitárias de dano. Ficam centralizadas aqui em vez de
 * espalhadas em Player/Enemy para que no futuro (venenos, crítico,
 * resistências) só este arquivo precise crescer.
 */
export default class DamageSystem {
  /**
   * Dano de contato com cooldown por-alvo (evita tirar vida todo frame
   * enquanto os corpos ficam sobrepostos).
   * @param {Phaser.Physics.Arcade.Sprite} attacker
   * @param {Phaser.Physics.Arcade.Sprite} target - precisa ter target.healthSystem
   * @param {number} damage
   * @param {number} cooldownMs
   * @param {number} nowMs
   */
  static applyContactDamage(attacker, target, damage, cooldownMs, nowMs) {
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return;

    const lastHitKey = `_lastHit_${attacker.id || attacker.name || 'atk'}`;
    const lastHit = target[lastHitKey] || 0;
    if (nowMs - lastHit < cooldownMs) return;

    target[lastHitKey] = nowMs;
    target.healthSystem.takeDamage(damage);
  }

  /**
   * Dano direto de um ataque de arma (sem cooldown próprio — quem
   * controla a cadência é o WeaponManager).
   */
  static applyWeaponHit(target, damage) {
    if (!target.active || !target.healthSystem || target.healthSystem.isDead()) return;
    target.healthSystem.takeDamage(damage);
  }
}
