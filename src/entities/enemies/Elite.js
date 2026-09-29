import Enemy, { MISSILE_BLINK_PERIOD_MS, MISSILE_BLINK_ALPHA_MIN, MISSILE_BLINK_ALPHA_MAX } from './Enemy.js';
import DamageSystem from '../../combat/DamageSystem.js';

// Visual do míssil de verdade do Elite (ver _launchMissiles/
const MISSILE_COLOR = 0xff6633;
const MISSILE_RADIUS = 7;
const MISSILE_ARC_HEIGHT = 60;
// Toca o som de lançamento mais rápido que o normal (Sound.rate do
const MISSILE_LAUNCH_SFX_RATE = 2.2;

// Tremida de câmera do ataque de mísseis — leve no lançamento (dá peso…
const MISSILE_LAUNCH_SHAKE_MS = 100;
const MISSILE_LAUNCH_SHAKE_INTENSITY = 0.006;
const MISSILE_EXPLOSION_SHAKE_MS = 260;
const MISSILE_EXPLOSION_SHAKE_INTENSITY = 0.012;

// Tremida do golpe corpo a corpo do Elite — mesmo espírito do lançamento
const MELEE_SHAKE_MS = 220;
const MELEE_SHAKE_INTENSITY = 0.012;


// Elite (def.elite = true, ver data/enemies.js): ataques de míssil e soco corpo a corpo.
export default class Elite extends Enemy {
  constructor(scene, x, y, def) {
    super(scene, x, y, def);
    // Elite (def.elite = true, ver data/enemies.js): no "estado normal"
    this.eliteState = 'chasing';
    this.eliteNextAttackAt = scene.time.now + Phaser.Math.Between(800, 1800);
    this.eliteTelegraphGraphics = null;
    this.eliteMissilePoints = [];
    this.eliteMissileRevealed = 0;
    this.eliteMissileNextStepAt = 0;
    this.eliteMissileDetonateAt = null;
    this.eliteLaunchDetonateAt = null;
    this.eliteLaunchStartMs = null;
    this.eliteMissileProjectiles = []; // bolas visuais em voo, ver _launchMissiles
    this.eliteMeleeTelegraphUntil = 0;
  }

  _specialChase(target, nowMs) {
    // Elite: só assume o movimento (parado) durante o telegraph/ataque
    return this._updateElite(target, nowMs);
  }

  _cancelActionsForFlee() {
    // Elite no meio de um ataque: cancela o telegraph/míssil em voo e
    if (this.eliteState && this.eliteState !== 'chasing') {
      this.eliteTelegraphGraphics?.clear();
      this.eliteMissileProjectiles?.forEach((m) => m.fx.destroy());
      this.eliteMissileProjectiles = [];
      this.eliteState = 'chasing';
    }
  }

  _cleanupSpecial() {
    // Elite: mesma lógica — o Graphics do telegraph (mísseis/melee) não é
    this.eliteTelegraphGraphics?.destroy();
    // Elite: bolas de míssil em voo também não são filhas do sprite —
    this.eliteMissileProjectiles?.forEach((m) => m.fx.destroy());
  }

  _onDie() {
    // Elite: som de morte próprio em vez de nenhum som (os inimigos
    this.scene.sound.play('sfx_elite_death', { volume: 0.6 });
  }

  // Estado do Elite (só roda quando def.elite = true). Retorna true quando
  _updateElite(target, nowMs) {
    if (this.eliteState === 'missile_telegraph') { this._updateMissileTelegraph(target, nowMs); return true; }
    if (this.eliteState === 'missile_launch') { this._updateMissileLaunch(target, nowMs); return true; }
    if (this.eliteState === 'melee_telegraph') { this._updateMeleeTelegraph(target, nowMs); return true; }
    if (this.eliteState === 'melee_swing') { this._updateMeleeSwing(target, nowMs); return true; }

    if (nowMs < this.eliteNextAttackAt) return false; // ainda na horda, flocking normal

    // Janela de ataque aberta: se o jogador estiver muito perto, golpe
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.eliteMeleeRange) this._startEliteMelee(target, nowMs);
    else this._startEliteMissiles(target, nowMs);
    return true;
  }

  // Início do ataque de mísseis: escolhe a posição do jogador AGORA (não
  _startEliteMissiles(target, nowMs) {
    this.eliteState = 'missile_telegraph';
    this._moveTo(0, 0);
    if (!this.eliteTelegraphGraphics) this.eliteTelegraphGraphics = this.scene.add.graphics().setDepth(4);

    // Lock: o Elite "trava a mira" no jogador — toca assim que o
    this.scene.sound.play('sfx_elite_lock', { volume: 0.6 });

    const count = this.def.eliteMissileCount;
    this.eliteMissilePoints = [{ x: target.x, y: target.y }];
    for (let i = 1; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.FloatBetween(this.def.eliteMissileSpreadRadius * 0.5, this.def.eliteMissileSpreadRadius);
      this.eliteMissilePoints.push({ x: target.x + Math.cos(angle) * dist, y: target.y + Math.sin(angle) * dist });
    }
    this.eliteMissileRevealed = 0;
    this.eliteMissileNextStepAt = nowMs; // revela a 1ª área já neste frame
    this.eliteMissileDetonateAt = null; // só definido depois que a última área aparecer
  }

  // Revela uma área vermelha por vez (a cada eliteMissileStepGapMs) —
  _updateMissileTelegraph(target, nowMs) {
    this._moveTo(0, 0);
    if (this.eliteMissileRevealed < this.eliteMissilePoints.length && nowMs >= this.eliteMissileNextStepAt) {
      this.eliteMissileRevealed += 1;
      this.eliteMissileNextStepAt = nowMs + this.def.eliteMissileStepGapMs;
      if (this.eliteMissileRevealed === this.eliteMissilePoints.length) {
        this.eliteMissileDetonateAt = nowMs + this.def.eliteMissileWarnAfterMs;
        // Warning: toca assim que a última área é revelada, cobrindo a
        this.scene.sound.play('sfx_elite_warning', { volume: 0.6 });
      }
    }
    this._drawMissileTelegraph(nowMs);
    if (this.eliteMissileDetonateAt != null && nowMs >= this.eliteMissileDetonateAt) {
      this._launchMissiles(nowMs);
    }
  }

  // Áreas vermelhas piscando (não opacidade fixa) — alterna entre
  _drawMissileTelegraph(nowMs) {
    const g = this.eliteTelegraphGraphics;
    g.clear();

    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const fillAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN, MISSILE_BLINK_ALPHA_MAX, blinkT);
    const strokeAlpha = Phaser.Math.Linear(0.55, 1, blinkT);

    for (let i = 0; i < this.eliteMissileRevealed; i++) {
      const p = this.eliteMissilePoints[i];
      g.fillStyle(0xff2222, fillAlpha);
      g.fillCircle(p.x, p.y, this.def.eliteMissileRadius);
      g.lineStyle(3, 0xff4444, strokeAlpha);
      g.strokeCircle(p.x, p.y, this.def.eliteMissileRadius);
    }
  }

  // Fim do aviso: o míssil sai de verdade. Toca o som de lançamento e usa
  _launchMissiles(nowMs) {
    this.eliteState = 'missile_launch';
    const travelMs = this._playTimedSfx('sfx_elite_launch', 0.6, MISSILE_LAUNCH_SFX_RATE);
    this.scene.cameras.main.shake(MISSILE_LAUNCH_SHAKE_MS, MISSILE_LAUNCH_SHAKE_INTENSITY);
    this.eliteLaunchStartMs = nowMs;
    this.eliteLaunchDetonateAt = nowMs + travelMs;

    this.eliteMissileProjectiles = this.eliteMissilePoints.map((p) => ({
      fx: this.scene.add
        .circle(this.x, this.y, MISSILE_RADIUS, MISSILE_COLOR, 0.95)
        .setStrokeStyle(2, 0xffffff, 0.8)
        .setDepth(15), // acima do chão/telegraph (4), abaixo de UI
      startX: this.x,
      startY: this.y,
      targetX: p.x,
      targetY: p.y
    }));
  }

  // Mísseis voando de verdade: interpola cada bola do Elite até a área
  _updateMissileLaunch(target, nowMs) {
    this._moveTo(0, 0);
    this._drawMissileTelegraph(nowMs);

    const progress = Math.min(
      (nowMs - this.eliteLaunchStartMs) / (this.eliteLaunchDetonateAt - this.eliteLaunchStartMs),
      1
    );
    this.eliteMissileProjectiles.forEach((m) => {
      m.fx.x = Phaser.Math.Linear(m.startX, m.targetX, progress);
      m.fx.y = Phaser.Math.Linear(m.startY, m.targetY, progress) - Math.sin(progress * Math.PI) * MISSILE_ARC_HEIGHT;
    });

    if (nowMs >= this.eliteLaunchDetonateAt) {
      this.eliteMissileProjectiles.forEach((m) => m.fx.destroy());
      this.eliteMissileProjectiles = [];
      this._detonateMissiles(target, nowMs);
    }
  }

  // Passos 5-6: dano alto em área em cada um dos 3 pontos, só se o
  _detonateMissiles(target, nowMs) {
    this.scene.sound.play('sfx_elite_explosion', { volume: 0.6 });
    this.scene.cameras.main.shake(MISSILE_EXPLOSION_SHAKE_MS, MISSILE_EXPLOSION_SHAKE_INTENSITY);

    this.eliteMissilePoints.forEach((p) => {
      if (target.active && !target.healthSystem?.isDead()) {
        const dist = Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y);
        if (dist <= this.def.eliteMissileRadius) {
          DamageSystem.applyWeaponHit(target, this.def.eliteMissileDamage, this, nowMs);
        }
      }
    });
    this.eliteTelegraphGraphics.clear();
    this.eliteState = 'chasing';
    this.eliteNextAttackAt = nowMs + this.def.eliteAttackIntervalMs;
  }

  // Início do golpe corpo a corpo: aviso em vermelho ao redor do próprio
  _startEliteMelee(target, nowMs) {
    this.eliteState = 'melee_telegraph';
    this._moveTo(0, 0);
    if (!this.eliteTelegraphGraphics) this.eliteTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.eliteMeleeTelegraphUntil = nowMs + this.def.eliteMeleeTelegraphMs;
  }

  _updateMeleeTelegraph(target, nowMs) {
    this._moveTo(0, 0);
    this._drawMeleeTelegraph(nowMs);
    if (nowMs >= this.eliteMeleeTelegraphUntil) this._startEliteMeleeSwing(nowMs);
  }

  // Fim do aviso: o soco sai de verdade. Toca sfx_elite_punch e agenda o
  _startEliteMeleeSwing(nowMs) {
    this.eliteState = 'melee_swing';
    this.scene.sound.play('sfx_elite_punch', { volume: 0.7 });
    this.eliteMeleeSwingDetonateAt = nowMs + this.def.eliteMeleePunchImpactMs;
  }

  _updateMeleeSwing(target, nowMs) {
    this._moveTo(0, 0);
    this._drawMeleeTelegraph(nowMs);
    if (nowMs >= this.eliteMeleeSwingDetonateAt) this._resolveMelee(target, nowMs);
  }

  // Mesmo piscar (alarme) do telegraph de mísseis, ver
  _drawMeleeTelegraph(nowMs) {
    const g = this.eliteTelegraphGraphics;
    g.clear();

    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const fillAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN, MISSILE_BLINK_ALPHA_MAX, blinkT);
    const strokeAlpha = Phaser.Math.Linear(0.55, 1, blinkT);

    g.fillStyle(0xff2222, fillAlpha);
    g.fillCircle(this.x, this.y, this.def.eliteMeleeRange);
    g.lineStyle(3, 0xff4444, strokeAlpha);
    g.strokeCircle(this.x, this.y, this.def.eliteMeleeRange);
  }

  // Dano alto corpo a corpo (só se o jogador ainda estiver no alcance —
  _resolveMelee(target, nowMs) {
    this.eliteTelegraphGraphics.clear();
    this.scene.cameras.main.shake(MELEE_SHAKE_MS, MELEE_SHAKE_INTENSITY);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.eliteMeleeRange && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this.def.eliteMeleeDamage, this, nowMs);
    }
    this.eliteState = 'chasing';
    this.eliteNextAttackAt = nowMs + this.def.eliteMeleeCooldownMs;
  }
}
