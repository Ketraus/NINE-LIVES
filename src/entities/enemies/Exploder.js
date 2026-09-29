import Enemy from './Enemy.js';
import DamageSystem from '../../combat/DamageSystem.js';

// Exploder (def.explodes = true, ver data/enemies.js): corre em cima do jogador e
// explode. Máquina de estados: chasing → charging → preparing → exploding.
export default class Exploder extends Enemy {
  constructor(scene, x, y, def) {
    super(scene, x, y, def);
    // Exploder (def.explodes = true, ver data/enemies.js): máquina de
    this.explodeState = 'chasing';
    this.explodePrepUntil = 0;
  }

  _specialChase(target, nowMs) {
    // Exploder: enquanto preparando/explodindo, a máquina de estados
    return this._updateExplosive(target, nowMs);
  }

  _cleanupSpecial() {
    // Exploder: o timer do pisca-pisca frenético de explosão também não
    // morre sozinho com o sprite, senão continua chamando callback à toa.
    this._explodeFlashTimer?.remove();
  }

  // Estado do Exploder (só roda quando def.explodes = true). Retorna
  _updateExplosive(target, nowMs) {
    if (this.explodeState === 'preparing') {
      this._moveTo(0, 0);
      if (nowMs >= this.explodePrepUntil) this._explode(target, nowMs);
      return true;
    }
    if (this.explodeState === 'exploding') return true; // já explodindo, die() está a caminho

    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

    if (this.explodeState === 'charging') {
      if (dist <= this.def.explodeTriggerRadius) {
        this._startPreparing(nowMs);
        return true;
      }
      this._seekAt(target, this.def.speed * this.def.explodeChargeSpeedMultiplier);
      return true;
    }

    // 'chasing': ainda no ritmo normal (SwarmSystem/chase() cuida do
    if (dist <= this.def.explodeTriggerRadius) {
      this._startPreparing(nowMs);
      return true;
    }
    if (dist <= this.def.explodeChargeRadius) {
      this._startCharging();
      this._seekAt(target, this.def.speed * this.def.explodeChargeSpeedMultiplier);
      return true;
    }
    return false; // ainda longe: segue perseguição normal (fora daqui)
  }

  // Seek em linha reta pro alvo numa velocidade dada — usado pela
  _seekAt(target, speed) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) { this._moveTo(0, 0); return; }
    this._moveTo((dx / dist) * speed, (dy / dist) * speed);
  }

  // Início da arrancada ("XANBLAU"): flash branco + esticada rápida,
  _startCharging() {
    this.explodeState = 'charging';
    this.scene.tweens.killTweensOf(this);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (!this.active) return;
      // Do fim do flash branco até bater no alvo (ou virar 'preparing'),
      // volta pra cor normal (sem tint vermelho) e só pisca em alpha.
      this._currentStatusTint = null;
      this._refreshStatusTint(this.scene.time.now);
      this.scene.tweens.add({
        targets: this,
        alpha: { from: 1, to: 0.5 },
        duration: 80,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });
    this.setScale(1, 1);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.5,
      scaleY: 0.65,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => { if (this.active) this.setScale(1, 1); }
    });
  }

  // Início da preparação: para no lugar, incha e pisca frenéticamente
  // branco (aviso final de que vai explodir).
  _startPreparing(nowMs) {
    this.explodeState = 'preparing';
    this.explodePrepUntil = nowMs + this.def.explodePrepMs;
    this._moveTo(0, 0);
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScale * 1.25,
      scaleY: this.baseScale * 1.25,
      duration: 110,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    // pisca branco/normal bem rápido (frenético) até explodir de vez
    this._explodeFlashOn = false;
    this._explodeFlashTimer?.remove();
    this._explodeFlashTimer = this.scene.time.addEvent({
      delay: 45,
      loop: true,
      callback: () => {
        if (!this.active) return;
        this._explodeFlashOn = !this._explodeFlashOn;
        if (this._explodeFlashOn) {
          this.setTintFill(0xffffff);
        } else {
          this._currentStatusTint = null;
          this._refreshStatusTint(this.scene.time.now);
        }
      }
    });
  }

  // Fim da preparação: dano em área (via DamageSystem) e morte.
  _explode(target, nowMs) {
    this.explodeState = 'exploding';
    this.scene.tweens.killTweensOf(this);
    this._explodeFlashTimer?.remove();
    this.setAlpha(1);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.explodeRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this.def.explodeDamage, this, nowMs);
    }
    this.die();
  }
}
