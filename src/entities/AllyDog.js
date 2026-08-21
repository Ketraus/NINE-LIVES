let nextInstanceId = 1;

/**
 * Cachorro aliado, criado pela carta base épica "Purificação" (ver
 * src/abilities/AllyDogAbility.js). Reaproveita o sprite 'enemy' (mesma
 * lógica que DroneAbility reaproveita 'xp_orb' pro drone) com um tint
 * verde só pra deixar claro visualmente que este não é mais um inimigo.
 *
 * Sem HealthSystem de propósito: inimigos hoje só perseguem o jogador
 * (Enemy.chase sempre recebe o player como alvo, ver EnemySpawner.
 * updateAll), então o aliado nunca é atacado — não altera essa mecânica.
 */
export default class AllyDog extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'enemy');
    // id único de instância — mesma razão que Enemy.js: chave de cooldown
    // de dano de contato por-alvo (ver DamageSystem.applyContactDamage)
    this.id = `allyDog_${nextInstanceId++}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const radius = this.width / 2 - 2;
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setDepth(11); // acima do jogador (10) e dos inimigos (9)
    this.setTint(0x55ff7a);

    // não deve atravessar parede, igual a inimigos e ao jogador
    scene.mapManager?.addCollider(this);
  }

  /** Move em linha reta até `target` ({x,y}) na velocidade dada. Mesma matemática de Enemy.chase(). */
  moveToward(target, speed) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq === 0) {
      this.setVelocity(0, 0);
      return;
    }
    const dist = Math.sqrt(distSq);
    this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  stop() {
    this.setVelocity(0, 0);
  }
}
