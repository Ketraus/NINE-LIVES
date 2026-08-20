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

  /**
   * Persegue o alvo (o jogador) em linha reta. IA simples de propósito — é
   * o protótipo. Matemática feita na mão (em vez de Phaser.Math.Vector2)
   * pra não alocar um objeto novo por inimigo a cada frame — com poucos
   * inimigos isso não importa nada, mas em enxames grandes (dezenas+) esse
   * lixo extra de memória é o tipo de coisa que pesa mais em celular do
   * que no PC, por causa da garbage collection.
   */
  chase(target) {
    if (!this.active || this.healthSystem.isDead()) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq === 0) return;
    const dist = Math.sqrt(distSq);
    this.setVelocity((dx / dist) * this.def.speed, (dy / dist) * this.def.speed);
  }

  die() {
    if (!this.active) return;
    EventBus.emit('enemy-died', { x: this.x, y: this.y, xpReward: this.def.xpReward });
    this.destroy();
  }
}
