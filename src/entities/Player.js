import HealthSystem from '../combat/HealthSystem.js';
import ShieldSystem from '../combat/ShieldSystem.js';
import EventBus from '../systems/EventBus.js';

const BASE_SPEED = 160;
export const BASE_MAX_HP = 100;
const INVULNERABLE_MS = 350; // i-frames após tomar dano — evita ser "trancado" por vários inimigos a…

// Desvio (carta "Sexto Sentido", evolução de Reflexo Felino): o jogador…
const DODGE_ALPHA = 0.25;
const DODGE_FLASH_MS = 220;

// Visual do escudo (carta "Escudo Energético"): só um círculo azul ao r…
const SHIELD_COLOR = 0x3aa8ff;
const SHIELD_RADIUS_PADDING = 8; // um pouco maior que o corpo do jogador, pra "envolver" ele
const SHIELD_BLINK_INTERVAL_MS = 80; // mesmo intervalo que TornadoAbility usa pro piscar de recarga
const SHIELD_HIT_FLASH_MS = 90;

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, runState) {
    super(scene, x, y, 'player_idle');
    this.runState = runState;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    // raio/offset "base" (sem escala) guardados pra recalcular o body
    this._baseRadius = this.width / 2 - 2;
    this._baseOffsetX = this.width / 2 - this._baseRadius;
    this._baseOffsetY = this.height / 2 - this._baseRadius;
    this.body.setCircle(this._baseRadius, this._baseOffsetX, this._baseOffsetY);
    this.setDepth(10);
    this.play('player-idle');
    this._currentAnim = 'player-idle';

    const startingMaxHp = Math.round(BASE_MAX_HP * (1 + runState.maxHpPercentBonus)) + runState.maxHpBonus;
    this.healthSystem = new HealthSystem(startingMaxHp, {
      onChange: (current, max) => EventBus.emit('player-health-changed', { current, max }),
      onDeath: () => this.die()
    });
    EventBus.emit('player-health-changed', {
      current: this.healthSystem.current,
      max: this.healthSystem.maxHp
    });

    // aplica de cara qualquer tamanho já ganho antes deste Player existir
    this.applySize(runState.sizeMultiplier);

    // DamageSystem.applyContactDamage lê essas duas props: define a
    this.invulnerableMs = INVULNERABLE_MS;
    this.invulnerableUntil = 0;

    // desvio (carta "Sexto Sentido"): 0 = não está desviando agora. Separado
    this._dodgeFlashUntil = 0;

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D');

    this.weaponManager = null; // injetado pela GameScene depois de criado
    this.isDead = false;
    // Knockback (ex.: Pisão do Minotauro) — enquanto ativo, sobrescreve o
    this.knockbackUntil = 0;
    // God Mode (cheat "god" do DevConsole, F9): checado em DamageSystem
    this.godMode = false;
    this.lastHorizontalDir = 1; // direção horizontal "travada" pra armas tipo katana (1 = direita, -1 =…

    // escudo (carta "Escudo Energético"): null até a habilidade ser
    this.shieldSystem = null;
    this.shieldFx = null;
    EventBus.on('ability-unlocked', ({ abilityId, def }) => {
      if (abilityId === 'energyShield') this._unlockShield(def);
    });
    // mesmos eventos que já pausam o SpawnDirector (ver GameScene) — o
    EventBus.on('levelup-opened', () => this.shieldSystem?.pause(this.scene.time.now));
    EventBus.on('levelup-closed', () => this.shieldSystem?.resume(this.scene.time.now));
  }

  _unlockShield(def) {
    if (this.shieldSystem) return; // carta é 1x só, mas não custa nada garantir
    this.shieldSystem = new ShieldSystem(def.maxShield, {
      rechargeDelayMs: def.rechargeDelayMs,
      rechargeRatePerSec: def.rechargeRatePerSec,
      onChange: (current, max) => EventBus.emit('player-shield-changed', { current, max }),
      onHit: () => this._flashShieldHit()
    });
    // sem isto o HUD só fica sabendo que existe escudo no primeiro onChange
    EventBus.emit('player-shield-changed', {
      current: this.shieldSystem.current,
      max: this.shieldSystem.maxShield
    });

    const radius = this._baseRadius + SHIELD_RADIUS_PADDING;
    this.shieldFx = this.scene.add
      .circle(this.x, this.y, radius, SHIELD_COLOR, 0.18)
      .setStrokeStyle(2, SHIELD_COLOR, 0.8)
      .setDepth(9); // logo abaixo do jogador (depth 10), acima do chão
  }

  // Flash branco rápido no escudo — mesma linguagem visual que Enemy.play…
  _flashShieldHit() {
    if (!this.shieldFx) return;
    this.shieldFx.setFillStyle(0xffffff, 0.45);
    this.shieldFx.setStrokeStyle(3, 0xffffff, 1);
    this.scene.time.delayedCall(SHIELD_HIT_FLASH_MS, () => {
      if (!this.shieldFx?.active) return;
      this.shieldFx.setFillStyle(SHIELD_COLOR, 0.18);
      this.shieldFx.setStrokeStyle(2, SHIELD_COLOR, 0.8);
    });
  }

  // Acompanha o jogador e cuida da recarga + do visual: pisca (liga/
  _updateShield(time) {
    if (!this.shieldSystem || !this.shieldFx) return;

    this.shieldSystem.update(time);
    this.shieldFx.setPosition(this.x, this.y);
    // o círculo é um objeto à parte do sprite do gato (não um filho dele),
    this.shieldFx.setScale(this.scale);

    if (this.shieldSystem.isRegenerating(time)) {
      const isBlinkOn = Math.floor(time / SHIELD_BLINK_INTERVAL_MS) % 2 === 0;
      this.shieldFx.setAlpha(isBlinkOn ? 0.9 : 0.25);
    } else {
      const ratio = Phaser.Math.Clamp(this.shieldSystem.current / this.shieldSystem.maxShield, 0, 1);
      this.shieldFx.setAlpha(0.25 + ratio * 0.6);
    }
  }

  setWeaponManager(weaponManager) {
    this.weaponManager = weaponManager;
  }

  // Recalcula escala visual + corpo de colisão a partir de
  applySize(sizeMultiplier) {
    const scale = 1 + sizeMultiplier;
    this.setScale(scale);
    this.body.setCircle(this._baseRadius, this._baseOffsetX, this._baseOffsetY);
  }

  get speed() {
    return BASE_SPEED * (1 + this.runState.speedMultiplier);
  }

  update() {
    if (this.isDead) {
      this.setVelocity(0, 0);
      return;
    }

    this._handleMovement();
    this._autoAttack();
    this._updateInvulnerableFlash();
    this._updateShield(this.scene.time.now);
  }

  // Controla a transparência do sprite: desvio (carta "Sexto Sentido") tem
  _updateInvulnerableFlash() {
    const now = this.scene.time.now;
    if (now < this._dodgeFlashUntil) {
      this.setAlpha(DODGE_ALPHA);
      return;
    }
    const isInvulnerable = now < this.invulnerableUntil;
    this.setAlpha(isInvulnerable ? (Math.floor(now / 80) % 2 === 0 ? 0.4 : 1) : 1);
  }

  // Chamado por DamageSystem._rollDodge quando o desvio proca — nenhum
  onDodge() {
    this._dodgeFlashUntil = this.scene.time.now + DODGE_FLASH_MS;
  }

  // Empurra o jogador na direção (dirX, dirY) — vetor já normalizado —
  applyKnockback(dirX, dirY, force, nowMs, durationMs = 200) {
    if (this.isDead) return;
    this.setVelocity(dirX * force, dirY * force);
    this.knockbackUntil = nowMs + durationMs;
  }

  _handleMovement() {
    if (this.scene.time.now < this.knockbackUntil) return; // ainda sendo empurrado, não sobrescreve a velocity

    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;

    const vec = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0)
    );

    // celular: soma o vetor do joystick virtual (ver TouchJoystick) ao do
    const joyVec = this.scene.touchJoystick?.getVector();
    if (joyVec) {
      vec.x += joyVec.x;
      vec.y += joyVec.y;
    }

    if (vec.length() > 1) {
      vec.normalize();
    }
    if (vec.lengthSq() > 0) {
      this.lastMoveDir = vec.clone();
    }
    // rastreado separado do lastMoveDir: só muda quando há componente
    if (vec.x !== 0) {
      this.lastHorizontalDir = Math.sign(vec.x);
    }

    this.setVelocity(vec.x * this.speed, vec.y * this.speed);
    this._updateAnimation(vec);
  }

  // Troca idle<->walk conforme o jogador se move, e espelha o sprite
  _updateAnimation(vec) {
    const isMoving = vec.lengthSq() > 0;
    const anim = isMoving ? 'player-walk' : 'player-idle';
    if (this._currentAnim !== anim) {
      this.play(anim);
      this._currentAnim = anim;
    }
    if (this.lastHorizontalDir) {
      this.setFlipX(this.lastHorizontalDir > 0);
    }
  }

  // Ataque 100% automático: o jogador só controla o movimento.
  _autoAttack() {
    this.weaponManager?.tryAttack(this);
  }

  // Direção para onde o jogador está "olhando" (último movimento).
  getAimDirection() {
    return this.lastMoveDir || new Phaser.Math.Vector2(0, 1);
  }

  // Versão "travada em horizontal" da direção de mira: nunca aponta pra
  getHorizontalAimDirection() {
    return new Phaser.Math.Vector2(this.lastHorizontalDir, 0);
  }

  takeDamage(amount) {
    this.healthSystem.takeDamage(amount);
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.setTint(0x555555);
    this.setVelocity(0, 0);
    this.shieldFx?.setVisible(false);
    EventBus.emit('player-died');
  }
}
