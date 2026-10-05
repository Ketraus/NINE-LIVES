import DamageSystem from '../combat/DamageSystem.js';
import { hasAuraShockFx, createAuraShockFx, updateAuraShockFx, zapAuraShockFx } from '../fx/AuraShockFx.js';

// Amarelo elétrico — remete a "choque"/"sobrecarga" sem repetir o verde…
const AURA_COLOR = 0x66e6ff;

// Habilidade exclusiva da evolução "Sobrecarga" (Pelo Condutor evoluída,
export default class AuraShockAbility {
  constructor(def) {
    this.def = def; // { tickIntervalMs, damage, radius }
    this.lastTickMs = 0;
    this.fx = null;
    // multiplicador do "aperto" ao acertar, por cima da escala do jogador
    this._pulseMultiplier = 1;
    this._fxLastMs = null;
    this.networkHitSequence = 0;
    this.networkHitTargets = [];
  }

  update(time, player, enemyGroup, scene) {
    if (!this.fx) this._createFx(scene);

    this.fx.setPosition(player.x, player.y);
    this.fx.setVisible(!player.isDead);
    // acompanha o tamanho atual do jogador (setScale em Player.applySize —
    this.fx.setScale(player.scale * this._pulseMultiplier);
    const dt = this._fxLastMs === null ? 16 : time - this._fxLastMs;
    this._fxLastMs = time;
    updateAuraShockFx(this.fx, time, dt); // no-op no visual de fallback (círculo)
    if (player.isDead) return; // morto não eletrocuta ninguém

    if (time - this.lastTickMs >= this.def.tickIntervalMs) {
      this.lastTickMs = time;
      this._damageEnemiesInRange(player, enemyGroup, time);
    }
  }

  _damageEnemiesInRange(player, enemyGroup, time) {
    // raio de detecção também precisa crescer junto com o jogador, senão
    const effectiveRadius = this.def.radius * player.scale;
    let hitSomeone = false;
    const hitEnemies = [];
    // snapshot: mesma razão do fix em SlamAbility/TornadoAbility/Weapon
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= effectiveRadius) {
        DamageSystem.applyWeaponHit(enemy, this.def.damage, player, time, { kind: 'ability', color: AURA_COLOR });
        hitSomeone = true;
        hitEnemies.push(enemy);
      }
    });
    if (hitSomeone) {
      this.networkHitSequence += 1;
      this.networkHitTargets = hitEnemies.slice(0, 3).map(({ x, y }) => ({ x, y }));
      this._pulse();
      zapAuraShockFx(this.fx, hitEnemies);
    }
  }

  // Anelzinho fino ao redor do jogador, com uma respiração leve de alpha.
  _createFx(scene) {
    const radius = this.def.radius;
    // sprite animado + raios por código; o círculo abaixo é só fallback
    // caso a folha não tenha carregado
    if (hasAuraShockFx(scene)) {
      this.fx = createAuraShockFx(scene, radius);
      return;
    }
    this.fx = scene.add
      .circle(0, 0, radius, AURA_COLOR, 0.1)
      .setStrokeStyle(2, AURA_COLOR, 0.65)
      .setDepth(7);

    scene.tweens.add({
      targets: this.fx,
      alpha: { from: 0.55, to: 1 },
      duration: 240,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // Mesmo "aperto" das outras habilidades (TornadoAbility/Enemy) ao
  _pulse() {
    if (!this.fx?.scene) return;
    this.fx.scene.tweens.killTweensOf(this);
    this._pulseMultiplier = 1;
    this.fx.scene.tweens.add({
      targets: this,
      _pulseMultiplier: 1.18,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut'
    });
  }
}
