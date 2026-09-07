let nextInstanceId = 1;

// Tint verde normal (cachorro comum) vs. cinza do Cyberus (ver becomeCy…
const NORMAL_TINT = 0x55ff7a;
const CYBERUS_TINT = 0x9a9a9a;
const CYBERUS_SCALE = 1.22; // maior que o cachorro normal, mas sem exagerar

// Cachorro aliado, criado pela carta base épica "Purificação" (ver
export default class AllyDog extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'enemy');
    // id único de instância — mesma razão que Enemy.js: chave de cooldown
    this.id = `allyDog_${nextInstanceId++}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // guardado sem tint/escala aplicados — becomeCyberus() recalcula o
    this.baseRadius = this.width / 2 - 2;
    this.body.setCircle(this.baseRadius, this.width / 2 - this.baseRadius, this.height / 2 - this.baseRadius);
    this.setDepth(11); // acima do jogador (10) e dos inimigos (9)
    this.setTint(NORMAL_TINT);
    this._isCyberus = false;

    // não deve atravessar parede, igual a inimigos e ao jogador
    scene.mapManager?.addCollider(this);
  }

  // Chamado quando a Purificação evolui pra Cyberus (ver AllyDogAbility.
  becomeCyberus() {
    if (this._isCyberus) return;
    this._isCyberus = true;

    this.setScale(CYBERUS_SCALE);

    // 'enemy.png' é um círculo VERMELHO sólido. setTint multiplica cores
    this.setTexture(this._ensureCyberusTexture());
    this.clearTint();

    // Arcade Body NÃO reescala sozinho com setScale (pegadinha conhecida
    const worldRadius = this.baseRadius * CYBERUS_SCALE;
    this.body.setCircle(worldRadius, this.width / 2 - this.baseRadius, this.height / 2 - this.baseRadius);
  }

  // Desenha (uma única vez, cacheada em scene.textures) um círculo cinza
  _ensureCyberusTexture() {
    const key = `fx_ally_dog_cyberus_${CYBERUS_TINT.toString(16)}`;
    if (this.scene.textures.exists(key)) return key;

    const size = this.width; // mesmo tamanho de 'enemy.png' (26x26)
    const radius = size / 2;
    const g = this.scene.add.graphics();
    g.fillStyle(CYBERUS_TINT, 1);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, size, size);
    g.destroy();

    return key;
  }

  // Move em linha reta até `target` ({x,y}) na velocidade dada. Mesma mat…
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

  // Feedback visual de "acabei de atacar": um pulso rápido de escala (some
  playAttackPulse() {
    const baseScale = this._isCyberus ? CYBERUS_SCALE : 1;
    this.scene.tweens.killTweensOf(this);
    this.setScale(baseScale * 1.22);
    this.scene.tweens.add({
      targets: this,
      scaleX: baseScale,
      scaleY: baseScale,
      duration: 130,
      ease: 'Back.easeOut'
    });
  }
}
