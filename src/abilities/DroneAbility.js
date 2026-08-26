import DamageSystem from '../combat/DamageSystem.js';

const FOLLOW_LERP = 0.15; // suaviza o "voo" do drone atrás do jogador
const BULLET_LIFETIME_MS = 1200;
const DEFAULT_PROJECTILE_SPEED = 320;

// Visual/feedback do laser (evolução "CatForce 2.0", ver data/upgrades.js
// pistol_drone_evo_catforce). Dano, cooldown, alcance e velocidade do tiro
// NÃO mudam com a evolução — só o que está aqui embaixo.
const LASER_DEFAULT_COLOR = 0xb26bff;
const LASER_TRAIL_INTERVAL_MS = 40;
const LASER_TRAIL_COPIES = 5;

// Posição de escolta de cada cópia relativa ao jogador. Até 3 drones
// mantêm o "chapéu" de sempre (HAT_OFFSETS); ao chegar no 4º (GatoDrone
// completa, maxStacks: 4 em data/upgrades.js) TODOS migram pra um quadrado,
// um em cada canto (SQUARE_OFFSETS) — ver DroneAbility.onFormationChanged.
const HAT_OFFSETS = [
  { x: 30, y: -30 },
  { x: -34, y: -26 },
  { x: 0, y: -46 }
];
const SQUARE_RADIUS = 38;
const SQUARE_OFFSETS = [
  { x: SQUARE_RADIUS, y: -SQUARE_RADIUS }, // canto superior direito
  { x: -SQUARE_RADIUS, y: -SQUARE_RADIUS }, // canto superior esquerdo
  { x: -SQUARE_RADIUS, y: SQUARE_RADIUS }, // canto inferior esquerdo
  { x: SQUARE_RADIUS, y: SQUARE_RADIUS } // canto inferior direito
];

/**
 * Habilidade exclusiva da Pistola (carta "pistol_drone"): um sprite que
 * segue o jogador com um pequeno atraso e atira sozinho no inimigo mais
 * próximo dentro de def.range, com seu próprio cooldown (independente do
 * WeaponManager). Reaproveita o mesmo padrão de projétil físico que
 * RangedWeapon usa, mas partindo da posição do drone, não do jogador.
 *
 * Mesma interface que SlamAbility (update(time, player, enemyGroup, scene)).
 */
export default class DroneAbility {
  /**
   * @param {object} def - entrada de data/upgrades.js (type: "unlockAbility")
   * @param {number} [formationIndex] - 0 pro 1º drone, 1 pro 2º, etc.
   *   (ver AbilityManager._unlock) — define o offset de escolta usado.
   */
  constructor(def, formationIndex = 0) {
    this.def = def;
    this.lastMs = 0;
    this.sprite = null;
    this.bulletGroup = null;
    this.scene = null;
    this.formationIndex = formationIndex;
    this.offset = HAT_OFFSETS[formationIndex % HAT_OFFSETS.length];
    // ligado por upgrade() quando CatForce 2.0 é confirmada — ver
    // AbilityManager._upgrade / RunManager effect "upgradeAbility"
    this.laser = false;
    this.laserColor = LASER_DEFAULT_COLOR;
  }

  update(time, player, enemyGroup, scene) {
    if (!this.sprite) this._create(scene, player, enemyGroup);

    this._follow(player);

    if (time - this.lastMs < this.def.cooldownMs) return;
    const target = this._findNearestEnemy(enemyGroup);
    if (!target) return; // sem alvo à vista: não atira, não gasta cooldown (igual à pistola)

    this.lastMs = time;
    this._fire(scene, target);
  }

  /**
   * Chamado pela evolução CatForce 2.0 (upgradeAbility, não unlockAbility —
   * ver AbilityManager._upgrade): melhora ESTE drone que já existe em vez
   * de criar mais um. Dano/cooldown/range/velocidade do tiro (this.def)
   * não são tocados — só o modo de disparo e o visual.
   */
  upgrade(def) {
    this.laser = true;
    this.laserColor = def.laserColor ?? LASER_DEFAULT_COLOR;
    this.sprite?.setTint(this.laserColor);
    if (this.scene && this.sprite) this._playUpgradeFx(this.scene, this.sprite.x, this.sprite.y);
  }

  /** Usado só por AbilityManager (via setFormationOffset) — troca o ponto
   * de escolta deste drone. Como this.offset só é lido em _follow() (não
   * mexe na posição atual do sprite direto), a troca aparece como um
   * reposicionamento suave via FOLLOW_LERP, não um teleporte. */
  setFormationOffset(offset) {
    this.offset = offset;
  }

  /**
   * Chamado pelo AbilityManager toda vez que um drone novo entra em cena
   * (ver AbilityManager._unlock), com TODAS as instâncias já ativas.
   * Recalcula a formação de todas de uma vez: até 3 cópias mantém o
   * "chapéu" de sempre (HAT_OFFSETS); ao completar a 4ª (GatoDrone no teto,
   * ver data/upgrades.js maxStacks: 4) todas migram junto pro quadrado
   * (SQUARE_OFFSETS) — nunca fica misturado (3 em chapéu + 1 solto).
   */
  static onFormationChanged(instances) {
    const layout = instances.length >= 4 ? SQUARE_OFFSETS : HAT_OFFSETS;
    instances.forEach((drone, i) => drone.setFormationOffset(layout[i % layout.length]));
  }

  _create(scene, player, enemyGroup) {
    this.scene = scene;
    this.sprite = scene.add
      .image(player.x + this.offset.x, player.y + this.offset.y, 'xp_orb')
      .setDepth(16)
      .setTint(this.laser ? this.laserColor : 0x7af0ff)
      .setScale(1.1);

    this.bulletGroup = scene.physics.add.group();
    scene.physics.add.overlap(this.bulletGroup, enemyGroup, (bullet, enemy) => {
      // pierce: cada bala só pode acertar o MESMO inimigo uma vez (senão o
      // overlap dispara todo frame enquanto ela atravessa) — as demais
      // continuam sendo atingidas normalmente enquanto a bala segue viva
      const hitSet = bullet.getData('hitSet');
      if (hitSet.has(enemy)) return;
      hitSet.add(enemy);

      DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player);
      if (bullet.getData('pierce')) {
        this._spawnHitSpark(this.scene, enemy.x, enemy.y, bullet.getData('color'));
      } else {
        bullet.destroy();
      }
    });
    // bala do drone também não deve atravessar parede
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  _follow(player) {
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, player.x + this.offset.x, FOLLOW_LERP);
    this.sprite.y = Phaser.Math.Linear(this.sprite.y, player.y + this.offset.y, FOLLOW_LERP);
  }

  _findNearestEnemy(enemyGroup) {
    let nearest = null;
    let nearestDist = this.def.range;

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    });

    return nearest;
  }

  _fire(scene, target) {
    const dir = new Phaser.Math.Vector2(target.x - this.sprite.x, target.y - this.sprite.y).normalize();
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    const color = this.laser ? this.laserColor : 0x7af0ff;

    const bullet = this.bulletGroup.create(this.sprite.x, this.sprite.y, 'hit_fx');
    bullet
      .setDepth(15)
      .setTint(color)
      .setRotation(dir.angle());
    bullet.body.setAllowGravity(false);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setData('damage', this.def.damage);
    bullet.setData('pierce', this.laser);
    bullet.setData('color', color);
    bullet.setData('hitSet', new Set());

    if (this.laser) {
      // feixe fino e alongado (em vez da bolinha padrão) + blend ADD pra
      // brilhar como um laser de verdade contra o mapa escuro
      bullet.setScale(0.85, 0.22).setBlendMode(Phaser.BlendModes.ADD);
      this._spawnMuzzleFlash(scene, this.sprite.x, this.sprite.y, color);
      this._attachLaserTrail(scene, bullet, color);
    } else {
      bullet.setScale(0.3);
    }

    scene.time.delayedCall(BULLET_LIFETIME_MS, () => bullet.destroy());
  }

  /** Pulso rápido no cano do drone no instante do disparo — só o laser tem,
   * pra marcar bem o "estalo" de quando ele acorda e começa a atirar. */
  _spawnMuzzleFlash(scene, x, y, color) {
    const flash = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(17)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(0.5)
      .setAlpha(0.9);
    scene.tweens.add({
      targets: flash,
      scale: flash.scale * 2,
      alpha: 0,
      duration: 120,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });
  }

  /** Rastro de "fantasmas" desbotando atrás do feixe enquanto ele viaja —
   * só rodado pro laser (não muda em nada o funcionamento da bala em si,
   * é puramente cosmético e some sozinho se a bala já tiver morrido). */
  _attachLaserTrail(scene, bullet, color) {
    scene.time.addEvent({
      delay: LASER_TRAIL_INTERVAL_MS,
      repeat: LASER_TRAIL_COPIES - 1,
      callback: () => {
        if (!bullet.active) return;
        const ghost = scene.add
          .image(bullet.x, bullet.y, 'hit_fx')
          .setDepth(14)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(color)
          .setScale(bullet.scaleX * 0.75, bullet.scaleY * 0.75)
          .setRotation(bullet.rotation)
          .setAlpha(0.4);
        scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 160,
          onComplete: () => ghost.destroy()
        });
      }
    });
  }

  /** Faísca de impacto ao perfurar um inimigo (laser não destrói a bala,
   * então cada acerto no meio do caminho precisa do próprio feedback —
   * senão o "atravessar vários inimigos" passaria despercebido). */
  _spawnHitSpark(scene, x, y, color) {
    const shardCount = 4;
    for (let i = 0; i < shardCount; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(10, 22);
      const shard = scene.add
        .image(x, y, 'hit_fx')
        .setDepth(20)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(Phaser.Math.FloatBetween(0.16, 0.26))
        .setRotation(angle)
        .setTint(color);

      scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: shard.scale * 0.4,
        duration: Phaser.Math.Between(140, 200),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  /** Pulso único no drone no instante em que ele vira laser (feedback de
   * "upgrade" — sem isto, os drones mudariam de cor do nada, sem graça). */
  _playUpgradeFx(scene, x, y) {
    const ring = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.laserColor)
      .setScale(0.6)
      .setAlpha(0.9);
    scene.tweens.add({
      targets: ring,
      scale: ring.scale * 3.2,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
  }
}
