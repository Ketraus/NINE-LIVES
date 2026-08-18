import HealthSystem from '../../combat/HealthSystem.js';
import EventBus from '../../systems/EventBus.js';

let nextInstanceId = 1;

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} def - entrada de data/enemies.json
   */
  constructor(scene, x, y, def) {
    super(scene, x, y, def.sprite);
    this.def = def;
    this.name = def.id;
    // id único por instância — usado como chave de cooldown de dano de
    // contato (se usássemos def.id, todo "grunt" compartilharia o mesmo
    // cooldown no alvo, o que deixaria o dano de contato incorreto)
    this.id = `${def.id}_${nextInstanceId++}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const radius = this.width / 2 - 2;
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setDepth(9);
    this.setTint(def.color);

    this.healthSystem = new HealthSystem(def.hp, {
      onDeath: () => this.die()
    });
  }

  /** Persegue o alvo (o jogador) em linha reta. IA simples de propósito — é o protótipo. */
  chase(target) {
    if (!this.active || this.healthSystem.isDead()) return;
    const dir = new Phaser.Math.Vector2(target.x - this.x, target.y - this.y);
    if (dir.lengthSq() === 0) return;
    dir.normalize();
    this.setVelocity(dir.x * this.def.speed, dir.y * this.def.speed);
  }

  die() {
    if (!this.active) return;
    EventBus.emit('enemy-died', { x: this.x, y: this.y, xpReward: this.def.xpReward });
    this.destroy();
  }
}
