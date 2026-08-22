import HealthSystem from '../combat/HealthSystem.js';
import EventBus from '../systems/EventBus.js';

const BASE_SPEED = 160;
export const BASE_MAX_HP = 100;
const INVULNERABLE_MS = 350; // i-frames após tomar dano — evita ser "trancado" por vários inimigos ao mesmo tempo

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
    // raio/offset "base" (sem escala) guardados pra recalcular o body
    // sempre que o tamanho do personagem mudar (ver applySize) — cartas de
    // evolução como COLOSSO usam isso pra crescer sem perder a colisão.
    this._baseRadius = this.width / 2 - 2;
    this._baseOffsetX = this.width / 2 - this._baseRadius;
    this._baseOffsetY = this.height / 2 - this._baseRadius;
    this.body.setCircle(this._baseRadius, this._baseOffsetX, this._baseOffsetY);
    this.setDepth(10);

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
    // (não deveria acontecer hoje — Player só nasce uma vez por run, e
    // sizeMultiplier começa em 0 — mas deixa o construtor consistente com
    // applySize() em vez de assumir escala 1 na marra)
    this.applySize(runState.sizeMultiplier);

    // DamageSystem.applyContactDamage lê essas duas props: define a
    // janela de i-frame e onde ela expira. Sem isso o jogador tomaria
    // dano de cada inimigo encostado, todos no mesmo frame.
    this.invulnerableMs = INVULNERABLE_MS;
    this.invulnerableUntil = 0;

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D');

    this.weaponManager = null; // injetado pela GameScene depois de criado
    this.isDead = false;
    this.lastHorizontalDir = 1; // direção horizontal "travada" pra armas tipo katana (1 = direita, -1 = esquerda)
  }

  setWeaponManager(weaponManager) {
    this.weaponManager = weaponManager;
  }

  /**
   * Recalcula escala visual + corpo de colisão a partir de
   * runState.sizeMultiplier (0 = tamanho normal). Chamado pelo RunManager
   * sempre que um efeito "sizeMultiplier" é aplicado (hoje só a evolução
   * COLOSSO usa isto).
   *
   * IMPORTANTE: body.setCircle(radius, offsetX, offsetY) espera raio e
   * offset em pixels "de origem" (SEM escala) — o Arcade Physics aplica a
   * escala atual do sprite por conta própria a cada frame (ver
   * Body.updateBounds()/Body.radius nos docs do Phaser: "this is the
   * unscaled radius... the true radius is equal to halfWidth"). Passar
   * `_baseRadius * scale` aqui (como era antes) fazia o Phaser escalar de
   * novo por cima, resultando num raio de colisão MUITO maior que o
   * sprite visível — daí o jogador "travando" em paredes que ainda não
   * tinha tocado e tomando dano de inimigos ainda longe. Por isso agora
   * só passamos os valores base (sem multiplicar por scale): o
   * setScale(scale) já é suficiente pra crescer a colisão junto com o
   * sprite.
   */
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
  }

  /** Pisca o sprite enquanto os i-frames de DamageSystem estiverem ativos. */
  _updateInvulnerableFlash() {
    const isInvulnerable = this.scene.time.now < this.invulnerableUntil;
    this.setAlpha(isInvulnerable ? (Math.floor(this.scene.time.now / 80) % 2 === 0 ? 0.4 : 1) : 1);
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
    // rastreado separado do lastMoveDir: só muda quando há componente
    // horizontal de fato, então subir/descer "puro" mantém o último
    // lado (direita/esquerda) — é o que a katana usa pra nunca atacar
    // em diagonal/vertical.
    if (vec.x !== 0) {
      this.lastHorizontalDir = Math.sign(vec.x);
    }

    this.setVelocity(vec.x * this.speed, vec.y * this.speed);
  }

  /**
   * Ataque 100% automático: o jogador só controla o movimento.
   * WeaponManager.tryAttack() é chamado todo frame, mas só dispara de
   * fato quando o cooldown da arma atual permite (e, no caso de armas à
   * distância, quando há um inimigo no alcance).
   */
  _autoAttack() {
    this.weaponManager?.tryAttack(this);
  }

  /** Direção para onde o jogador está "olhando" (último movimento). */
  getAimDirection() {
    return this.lastMoveDir || new Phaser.Math.Vector2(0, 1);
  }

  /**
   * Versão "travada em horizontal" da direção de mira: nunca aponta pra
   * cima/baixo/diagonal, só (1,0) ou (-1,0). Usada por armas que não
   * devem atacar em ângulo (ex.: katana).
   */
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
    EventBus.emit('player-died');
  }
}
