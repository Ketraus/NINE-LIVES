let nextInstanceId = 1;

const CYBERUS_SCALE = 1.22;

// Cachorro aliado, criado pela carta base épica "Purificação" (ver
export default class AllyDog extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'asset_purification_idle');
    // id único de instância — mesma razão que Enemy.js: chave de cooldown
    this.id = `allyDog_${nextInstanceId++}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // guardado sem tint/escala aplicados — becomeCyberus() recalcula o
    this.baseRadius = this.width / 2 - 2;
    this.body.setCircle(this.baseRadius, this.width / 2 - this.baseRadius, this.height / 2 - this.baseRadius);
    this.setDepth(11); // acima do jogador (10) e dos inimigos (9)
    this._isCyberus = false;

    // não deve atravessar parede, igual a inimigos e ao jogador
    scene.mapManager?.addCollider(this);
  }

  // Chamado quando a Purificação evolui pra Cyberus (ver AllyDogAbility.
  becomeCyberus() {
    if (this._isCyberus) return;
    this._isCyberus = true;

    // O spritesheet da Purificação não é o visual da evolução. Até o asset
    // próprio do Cyberus ser adicionado, usa o fallback neutro original.
    this.setTexture('enemy');
    this.clearTint();
    this.setScale(CYBERUS_SCALE);

    // Arcade Body NÃO reescala sozinho com setScale (pegadinha conhecida
    // já usada no resto do arquivo). this.width já reflete o frame 64x64
    // do sprite novo (setado pelo play() acima), não mais os 26x26 do
    // círculo 'enemy'.
    const sourceRadius = this.width / 2 - 2;
    const worldRadius = sourceRadius * CYBERUS_SCALE;
    const offset = this.width / 2 - sourceRadius;
    this.body.setCircle(worldRadius, offset, offset);
  }

  // Move em linha reta até `target` ({x,y}) na velocidade dada. Mesma mat…
  moveToward(target, speed) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 25) {
      this.setVelocity(0, 0);
      this.pauseVisual();
      return;
    }
    if (dx > 0) this.setFlipX(true);
    else if (dx < 0) this.setFlipX(false);
    if (!this.anims.isPlaying || this.anims.currentAnim?.key !== 'purification-walk') {
      this.play('purification-walk');
    }
    const dist = Math.sqrt(distSq);
    this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  stop() {
    this.setVelocity(0, 0);
    this.pauseVisual();
  }

  pauseVisual() {
    if (!this.active) return;
    this.anims.stop();
    if (!this._isCyberus) this.setTexture('asset_purification_idle');
  }

  resumeVisual() {
    if (!this.active || this._isCyberus) return;
    if (this.body.velocity.lengthSq() > 25) this.play('purification-walk');
    else this.setTexture('asset_purification_idle');
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
