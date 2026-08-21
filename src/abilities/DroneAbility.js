import DamageSystem from '../combat/DamageSystem.js';

const OFFSET_X = 30;
const OFFSET_Y = -30;
const FOLLOW_LERP = 0.15; // suaviza o "voo" do drone atrás do jogador
const BULLET_LIFETIME_MS = 1200;
const DEFAULT_PROJECTILE_SPEED = 320;

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
  /** @param {object} def - entrada de data/upgrades.js (type: "unlockAbility") */
  constructor(def) {
    this.def = def;
    this.lastMs = 0;
    this.sprite = null;
    this.bulletGroup = null;
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

  _create(scene, player, enemyGroup) {
    this.sprite = scene.add
      .image(player.x + OFFSET_X, player.y + OFFSET_Y, 'xp_orb')
      .setDepth(16)
      .setTint(0x7af0ff)
      .setScale(1.1);

    this.bulletGroup = scene.physics.add.group();
    scene.physics.add.overlap(this.bulletGroup, enemyGroup, (bullet, enemy) => {
      DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player);
      bullet.destroy();
    });
    // bala do drone também não deve atravessar parede
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  _follow(player) {
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, player.x + OFFSET_X, FOLLOW_LERP);
    this.sprite.y = Phaser.Math.Linear(this.sprite.y, player.y + OFFSET_Y, FOLLOW_LERP);
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

    const bullet = this.bulletGroup.create(this.sprite.x, this.sprite.y, 'hit_fx');
    bullet
      .setDepth(15)
      .setScale(0.3)
      .setTint(0x7af0ff)
      .setRotation(dir.angle());
    bullet.body.setAllowGravity(false);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setData('damage', this.def.damage);

    scene.time.delayedCall(BULLET_LIFETIME_MS, () => bullet.destroy());
  }
}
