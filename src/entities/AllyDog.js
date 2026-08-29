let nextInstanceId = 1;

// Tint verde normal (cachorro comum) vs. cinza do Cyberus (ver becomeCyberus).
const NORMAL_TINT = 0x55ff7a;
const CYBERUS_TINT = 0x9a9a9a;
const CYBERUS_SCALE = 1.35; // "um pouco maior", não um monstro gigante

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

    // guardado sem tint/escala aplicados — becomeCyberus() recalcula o
    // corpo físico em cima deste raio-base, em vez de acumular escala
    // sobre um setCircle já escalado.
    this.baseRadius = this.width / 2 - 2;
    this.body.setCircle(this.baseRadius, this.width / 2 - this.baseRadius, this.height / 2 - this.baseRadius);
    this.setDepth(11); // acima do jogador (10) e dos inimigos (9)
    this.setTint(NORMAL_TINT);

    // não deve atravessar parede, igual a inimigos e ao jogador
    scene.mapManager?.addCollider(this);
  }

  /** Chamado quando a Purificação evolui pra Cyberus (ver AllyDogAbility.
   *  mergeOnUpgrade): os até-3 cachorros viram só este, um pouco maior e
   *  cinza — a fusão visual dos 3 num só, em vez de 3 cachorros ciano
   *  separados. O corpo físico (circle) é recalculado em cima do
   *  baseRadius pra acompanhar a nova escala. */
  becomeCyberus() {
    this.setScale(CYBERUS_SCALE);

    // 'enemy.png' é um círculo VERMELHO sólido. setTint multiplica cores
    // (vermelho não vira cinza só multiplicando — o canal vermelho segue
    // dominante) e setTintFill depende do renderer (não é confiável no
    // Canvas renderer, só garante cor sólida no WebGL). Solução robusta,
    // que funciona em qualquer renderer: gera uma textura cinza sólida do
    // zero (mesmo padrão de RangedWeapon._ensureBulletTexture) e troca a
    // textura do sprite, em vez de tentar tingir a vermelha.
    this.setTexture(this._ensureCyberusTexture());
    this.clearTint();

    // Arcade Body NÃO reescala sozinho com setScale (pegadinha conhecida
    // do Phaser) — o raio precisa ser recalculado em pixels "de mundo"
    // (baseRadius * escala). O offset fica no espaço não-escalado do
    // frame (mesma conta do construtor); o próprio Arcade multiplica esse
    // offset por scaleX/scaleY ao posicionar o corpo a cada frame.
    const worldRadius = this.baseRadius * CYBERUS_SCALE;
    this.body.setCircle(worldRadius, this.width / 2 - this.baseRadius, this.height / 2 - this.baseRadius);
  }

  /** Desenha (uma única vez, cacheada em scene.textures) um círculo cinza
   *  sólido do mesmo tamanho do frame original de 'enemy.png' — é a
   *  textura usada pelo Cyberus no lugar do círculo vermelho normal. */
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
