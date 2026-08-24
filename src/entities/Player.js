import HealthSystem from '../combat/HealthSystem.js';
import ShieldSystem from '../combat/ShieldSystem.js';
import EventBus from '../systems/EventBus.js';

const BASE_SPEED = 160;
export const BASE_MAX_HP = 100;
const INVULNERABLE_MS = 350; // i-frames após tomar dano — evita ser "trancado" por vários inimigos ao mesmo tempo

// Desvio (carta "Sexto Sentido", evolução de Reflexo Felino): o jogador não
// pisca como nos i-frames normais (isso já significa "tomando dano
// repetido") — fica translúcido de forma mais "sólida" por um instante, pra
// ler como "o ataque passou direto", não como dano.
const DODGE_ALPHA = 0.25;
const DODGE_FLASH_MS = 220;

// Visual do escudo (carta "Escudo Energético"): só um círculo azul ao redor
// do gato, sem enfeite extra — pedido explícito ("só um círculo azul").
const SHIELD_COLOR = 0x3aa8ff;
const SHIELD_RADIUS_PADDING = 8; // um pouco maior que o corpo do jogador, pra "envolver" ele
const SHIELD_BLINK_INTERVAL_MS = 80; // mesmo intervalo que TornadoAbility usa pro piscar de recarga
const SHIELD_HIT_FLASH_MS = 90;

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

    // desvio (carta "Sexto Sentido"): 0 = não está desviando agora. Separado
    // de invulnerableUntil de propósito — dodge não dá i-frames, é só o
    // resultado visual de UM ataque que não acertou (ver onDodge/DamageSystem._rollDodge)
    this._dodgeFlashUntil = 0;

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D');

    this.weaponManager = null; // injetado pela GameScene depois de criado
    this.isDead = false;
    this.lastHorizontalDir = 1; // direção horizontal "travada" pra armas tipo katana (1 = direita, -1 = esquerda)

    // escudo (carta "Escudo Energético"): null até a habilidade ser
    // desbloqueada. Ouvido aqui (e não no AbilityManager) porque, assim
    // como a katana lê doubleStrike direto em Weapon.js, o escudo precisa
    // mexer direto no fluxo de dano do Player (ver DamageSystem._applyShield)
    // e não só rodar um update() isolado. EventBus.removeAllListeners() no
    // início de GameScene.create() evita duplicar isto entre restarts.
    this.shieldSystem = null;
    this.shieldFx = null;
    EventBus.on('ability-unlocked', ({ abilityId, def }) => {
      if (abilityId === 'energyShield') this._unlockShield(def);
    });
    // mesmos eventos que já pausam o SpawnDirector (ver GameScene) — o
    // escudo precisa descontar o mesmo intervalo, senão recarrega (ou até
    // enche de um pulo) só de o jogador demorar na tela de cartas
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

    const radius = this._baseRadius + SHIELD_RADIUS_PADDING;
    this.shieldFx = this.scene.add
      .circle(this.x, this.y, radius, SHIELD_COLOR, 0.18)
      .setStrokeStyle(2, SHIELD_COLOR, 0.8)
      .setDepth(9); // logo abaixo do jogador (depth 10), acima do chão
  }

  /** Flash branco rápido no escudo — mesma linguagem visual que Enemy.playHitReaction usa pro corpo dos inimigos. */
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

  /**
   * Acompanha o jogador e cuida da recarga + do visual: pisca (liga/
   * desliga, mesmo estilo do vórtice de TornadoAbility) enquanto está
   * recarregando, e fica mais apagado conforme o escudo esvazia.
   */
  _updateShield(time) {
    if (!this.shieldSystem || !this.shieldFx) return;

    this.shieldSystem.update(time);
    this.shieldFx.setPosition(this.x, this.y);
    // o círculo é um objeto à parte do sprite do gato (não um filho dele),
    // então não cresce sozinho com COLOSSO (evolução de vida que aplica
    // setScale no Player via applySize) — precisa copiar a escala atual
    // do jogador todo frame, senão fica pequeno demais quando ele cresce
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
    this._updateShield(this.scene.time.now);
  }

  /**
   * Controla a transparência do sprite: desvio (carta "Sexto Sentido") tem
   * prioridade — fica num alpha fixo e mais visível que os i-frames, sem
   * piscar, pra não ser confundido com "tomando dano". Sem desvio ativo,
   * volta ao piscar normal dos i-frames (liga/desliga a cada 80ms) enquanto
   * eles durarem.
   */
  _updateInvulnerableFlash() {
    const now = this.scene.time.now;
    if (now < this._dodgeFlashUntil) {
      this.setAlpha(DODGE_ALPHA);
      return;
    }
    const isInvulnerable = now < this.invulnerableUntil;
    this.setAlpha(isInvulnerable ? (Math.floor(now / 80) % 2 === 0 ? 0.4 : 1) : 1);
  }

  /**
   * Chamado por DamageSystem._rollDodge quando o desvio proca — nenhum
   * dano chegou a ser aplicado. Só marca a janela de transparência; quem
   * desenha é _updateInvulnerableFlash, todo frame.
   */
  onDodge() {
    this._dodgeFlashUntil = this.scene.time.now + DODGE_FLASH_MS;
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

    // celular: soma o vetor do joystick virtual (ver TouchJoystick) ao do
    // teclado. Sem toque ativo o vetor é (0,0), então isto não muda nada
    // no PC nem quando o joystick simplesmente não existe (this.scene.touchJoystick undefined).
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
    this.shieldFx?.setVisible(false);
    EventBus.emit('player-died');
  }
}
