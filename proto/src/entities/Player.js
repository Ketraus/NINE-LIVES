import HealthSystem from '../combat/HealthSystem.js';
import EventBus from '../systems/EventBus.js';

const BASE_SPEED = 160;
const BASE_MAX_HP = 100;

export default class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {import('../roguelike/RunState.js').default} runState
   */
  constructor(scene, x, y, runState) {
    super(scene, x, y, 'player');
    this.runState = runState;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    const radius = this.width / 2 - 2;
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setDepth(10);

    this.healthSystem = new HealthSystem(BASE_MAX_HP + runState.maxHpBonus, {
      onChange: (current, max) => EventBus.emit('player-health-changed', { current, max }),
      onDeath: () => this.die()
    });
    EventBus.emit('player-health-changed', {
      current: this.healthSystem.current,
      max: this.healthSystem.maxHp
    });

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,SPACE');

    this.weaponManager = null; // injetado pela GameScene depois de criado
    this.isDead = false;
  }

  setWeaponManager(weaponManager) {
    this.weaponManager = weaponManager;
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
    this._handleAttackInput();
  }

  _handleMovement() {
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;

    const vec = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0)
    );

    if (vec.lengthSq() > 0) {
      vec.normalize();
      this.lastMoveDir = vec.clone();
    }

    this.setVelocity(vec.x * this.speed, vec.y * this.speed);
  }

  _handleAttackInput() {
    const attackPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      this.scene.input.activePointer.justDown;

    if (attackPressed && this.weaponManager) {
      this.weaponManager.tryAttack(this);
    }
  }

  /** Direção para onde o jogador está "olhando" (último movimento). */
  getAimDirection() {
    return this.lastMoveDir || new Phaser.Math.Vector2(0, 1);
  }

  takeDamage(amount) {
    this.healthSystem.takeDamage(amount);
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.setTint(0x555555);
    this.setVelocity(0, 0);
    EventBus.emit('player-died');
  }
}
