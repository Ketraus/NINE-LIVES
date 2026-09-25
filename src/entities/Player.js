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

// Correção visual pro mapa novo (tiles maiores fazem o gato de 64x64 parecer
// minúsculo do lado do chão). Puramente estético — NÃO é a mesma coisa que
// a carta "Colosso" (sizeMultiplier em applySize abaixo): esse multiplicador
// aumenta a escala base de TODOS os personagens sem mudar nenhum % daquela
// mecânica (a carta continua crescendo o jogador na mesma proporção de
// sempre, só que a partir desse novo tamanho-base). Se ainda estiver
// pequeno/grande demais no mapa novo, é só ajustar este número.
export const BASE_VISUAL_SCALE = 1.3;

// Sprite do gato por classe de arma (runState.weaponId). Katana e Paws têm
// visual próprio; qualquer outro id cai no "default" (o mesmo da Pistola).
// shadowOffsetLeft/Right: testamos um único valor espelhado por sinal
// (offset * (flipX?-1:1)) e ele NUNCA acertou os dois lados ao mesmo tempo
// — só um lado por vez, e com offset 0 o desvio residual é igual nos dois
// sentidos (viés fixo, não depende de flip). Isso mostra que a correção
// necessária não é simétrica nesse projeto, então agora são 2 valores
// independentes, calibrados olhando o jogo direto — sem assumir que um é
// o negativo do outro. Ajuste cada um manualmente até a sombra bater.
const SPRITE_SETS = {
  katana: {
    idleKey: 'player_katana_idle',
    walkKey: 'player_katana_walk',
    idleAnim: 'player-katana-idle',
    walkAnim: 'player-katana-walk',
    shadowOffsetLeft: -12,
    shadowOffsetRight: -14
  },
  fists: {
    idleKey: 'player_paws_idle',
    walkKey: 'player_paws_walk',
    idleAnim: 'player-paws-idle',
    walkAnim: 'player-paws-walk',
    shadowOffsetLeft: -12,
    shadowOffsetRight: -14
  },
  default: {
    idleKey: 'player_idle',
    walkKey: 'player_walk',
    idleAnim: 'player-idle',
    walkAnim: 'player-walk',
    shadowOffsetLeft: -12,
    shadowOffsetRight: -14
  }
};

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, runState) {
    const spriteSet = SPRITE_SETS[runState.weaponId] || SPRITE_SETS.default;
    super(scene, x, y, spriteSet.idleKey);
    this.runState = runState;
    this._spriteSet = spriteSet;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    // raio/offset "base" (sem escala) guardados pra recalcular o body
    this._baseRadius = this.width / 2 - 2;
    this._baseOffsetX = this.width / 2 - this._baseRadius;
    this._baseOffsetY = this.height / 2 - this._baseRadius;
    this.body.setCircle(this._baseRadius, this._baseOffsetX, this._baseOffsetY);
    this.setDepth(10);
    // Sombra simples embaixo do jogador (mesma ideia da Enemy.js): elipse
    // escura translúcida, sem luz/dinâmica nenhuma. Tamanho reajustado em
    // applySize (Colosso etc.), posição seguida a cada frame em update().
    this.shadow = scene.add.ellipse(x, y, 10, 10, 0x000000, 0.35).setDepth(8);
    this.play(this._spriteSet.idleAnim);
    this._currentAnim = this._spriteSet.idleAnim;

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
  // `runState.sizeMultiplier` (carta/evolução que muda o tamanho, ex.:
  // Colosso). O Arcade Body do Phaser re-escala sozinho (auto, todo frame)
  // pelo scale ATUAL do sprite — então se passássemos o _baseRadius puro
  // pro setCircle, o hitbox cresceria NA MESMA proporção do visual (ex.:
  // Colosso 2x maior = hitbox 2x maior), o que fica gigante e ruim de
  // circular entre inimigos. Por isso o raio "fonte" passado pro
  // setCircle já vem PRÉ-DIVIDIDO pelo scale visual: o Phaser vai
  // multiplicar de volta sozinho, e o resultado final cresce só
  // HITBOX_GROWTH_FACTOR do que o visual (ex.: 45% do crescimento).
  applySize(sizeMultiplier) {
    const HITBOX_GROWTH_FACTOR = 0.45;
    // BASE_VISUAL_SCALE multiplica os dois lados (visual e hitbox) pela
    // mesma proporção — a curva de crescimento do sizeMultiplier (Colosso)
    // em cima disso fica idêntica à de antes, só que partindo de um
    // gato/hitbox já maiores por padrão.
    const visualScale = BASE_VISUAL_SCALE * (1 + sizeMultiplier);
    this.setScale(visualScale);

    const hitboxScale = BASE_VISUAL_SCALE * (1 + sizeMultiplier * HITBOX_GROWTH_FACTOR);
    const sourceRadius = (this._baseRadius * hitboxScale) / visualScale;
    const sourceOffsetX = this.width / 2 - sourceRadius;
    const sourceOffsetY = this.height / 2 - sourceRadius;
    this.body.setCircle(sourceRadius, sourceOffsetX, sourceOffsetY);

    const shadowWidth = this.displayWidth * 0.55;
    this.shadow?.setSize(shadowWidth, shadowWidth * 0.4);
  }

  get speed() {
    return BASE_SPEED * (1 + this.runState.speedMultiplier);
  }

  update() {
    if (this.isDead) {
      this.setVelocity(0, 0);
      this._updateShadow();
      return;
    }

    this._handleMovement();
    this._autoAttack();
    this._updateInvulnerableFlash();
    this._updateShield(this.scene.time.now);
    // Roda depois de _handleMovement (que chama _updateAnimation/setFlipX):
    // se rodasse antes, usaria o flipX do frame anterior e a sombra ficaria
    // 1 frame atrasada sempre que o jogador trocasse de direção.
    this._updateShadow();
  }

  _updateShadow() {
    if (!this.shadow) return;
    // flipX true = olhando pra direita (ver _updateAnimation). Cada lado
    // usa seu próprio valor (shadowOffsetLeft/Right) em vez de um só
    // espelhado por sinal — não são simétricos nesse projeto (ver
    // comentário acima do SPRITE_SETS).
    const rawOffset = this.flipX ? this._spriteSet.shadowOffsetRight : this._spriteSet.shadowOffsetLeft;
    this.shadow.x = this.x + (rawOffset || 0) * this.scaleX;
    this.shadow.y = this.y + this.displayHeight * 0.46;
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
    const anim = isMoving ? this._spriteSet.walkAnim : this._spriteSet.idleAnim;
    if (this._currentAnim !== anim) {
      this.play(anim);
      this._currentAnim = anim;
    }
    if (this.lastHorizontalDir) {
      this.setFlipX(this.lastHorizontalDir > 0);
    }
  }

  pauseVisual() {
    if (!this.active) return;
    this.anims.pause();
  }

  resumeVisual() {
    if (!this.active) return;
    this.anims.resume();
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
