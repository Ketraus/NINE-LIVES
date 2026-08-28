import DamageSystem from '../combat/DamageSystem.js';

// Quanto o intervalo entre pancadas diminui a cada cópia extra da carta
// (ver restack()) e piso de segurança pra nunca ficar rápido demais.
const COOLDOWN_STEP_MS = 500;
const MIN_COOLDOWN_MS = 1200;

/**
 * Habilidade exclusiva dos Punhos (carta "fists_slam"): a cada
 * this.cooldownMs, causa def.damage em todo inimigo dentro de def.radius
 * ao redor do jogador. Roda em paralelo ao ataque automático normal —
 * não usa WeaponManager, tem cooldown próprio.
 *
 * Mesma interface que DroneAbility (update(time, player, enemyGroup, scene))
 * — é o que permite AbilityManager tratar qualquer habilidade nova do
 * mesmo jeito, sem saber o que tem "dentro" dela.
 */
export default class SlamAbility {
  /** @param {object} def - entrada de data/upgrades.js (type: "unlockAbility") */
  constructor(def) {
    this.def = def;
    this.cooldownMs = def.cooldownMs;
    this.lastMs = 0;
  }

  /**
   * Chamado a cada cópia extra da carta "Pancada Sísmica" (até 4, ver
   * data/upgrades.js maxStacks e AbilityManager._unlock) — em vez de
   * empilhar mais uma pancada rodando em paralelo (o que faria 4 ondas
   * idênticas se sobrepondo no mesmo raio, ao redor do mesmo jogador),
   * a MESMA pancada fica mais frequente: cada carta reduz o intervalo em
   * COOLDOWN_STEP_MS, até o piso MIN_COOLDOWN_MS.
   */
  restack() {
    this.cooldownMs = Math.max(MIN_COOLDOWN_MS, this.cooldownMs - COOLDOWN_STEP_MS);
  }

  update(time, player, enemyGroup, scene) {
    if (time - this.lastMs < this.cooldownMs) return;
    this.lastMs = time;
    this._slam(player, enemyGroup, scene);
  }

  _slam(player, enemyGroup, scene) {
    // snapshot: se applyWeaponHit matar e remover o inimigo do grupo, iterar
    // direto no Set vivo pula o próximo item (causava "só ~2 acertos" em AoE)
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= this.def.radius) DamageSystem.applyWeaponHit(enemy, this.def.damage, player);
    });
    this._showFx(scene, player);
  }

  /** Onda circular simples se expandindo a partir do jogador. */
  _showFx(scene, player) {
    const fx = scene.add
      .circle(player.x, player.y, this.def.radius, 0xff5555, 0.28)
      .setDepth(19);
    scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: 1.3,
      duration: 220,
      onComplete: () => fx.destroy()
    });
    scene.cameras.main.shake(90, 0.004);
  }
}
