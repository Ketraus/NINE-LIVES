import DamageSystem from '../combat/DamageSystem.js';

const DEFAULT_PROJECTILE_SPEED = 380;
const DEFAULT_PROJECTILE_LIFETIME_MS = 1200;

/**
 * Arma à distância (pistola, ...): mira automaticamente no inimigo mais
 * próximo dentro do alcance e dispara um projétil físico de verdade
 * (sprite com velocidade, não um "raycast" instantâneo como o melee).
 *
 * Implementa a mesma interface que Weapon.js (fire(scene, player,
 * enemyGroup, statMods)) — é por isso que WeaponManager não precisa
 * saber se está lidando com um soco ou uma bala.
 *
 * Diferença de contrato: fire() aqui pode retornar `false` quando não
 * há nenhum inimigo no alcance. WeaponManager usa isso pra NÃO gastar o
 * cooldown à toa — assim que um inimigo entra no alcance, a pistola
 * atira imediatamente, em vez de ficar "recarregando" enquanto mirava
 * no vazio.
 */
export default class RangedWeapon {
  /** @param {object} def - entrada de data/weapons.js (type: "ranged") */
  constructor(def) {
    this.def = def;
    this.bulletGroup = null; // criado no primeiro fire() (precisa da scene)
  }

  fire(scene, player, enemyGroup, statMods) {
    const range = this.def.range * (1 + statMods.rangeMultiplier);
    const target = this._findNearestEnemy(player, enemyGroup, range);
    if (!target) return false; // sem alvo à vista: não atira, não gasta cooldown

    this._ensureBulletGroup(scene, player, enemyGroup);

    const damage = this.def.damage * (1 + statMods.damageMultiplier);
    const dir = new Phaser.Math.Vector2(target.x - player.x, target.y - player.y).normalize();
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;

    const bullet = this.bulletGroup.create(player.x, player.y, 'hit_fx');
    bullet
      .setDepth(15)
      .setScale(0.35)
      .setTint(this.def.projectileTint ?? 0xffffff)
      .setRotation(dir.angle());
    bullet.body.setAllowGravity(false);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setData('damage', damage);
    // guardado pra empurrar o inimigo na hora do impacto (ver knockback
    // em _ensureBulletGroup) — mesma direção que a bala está viajando
    bullet.setData('dirX', dir.x);
    bullet.setData('dirY', dir.y);

    // projétil não deve viver pra sempre caso erre todo mundo
    scene.time.delayedCall(DEFAULT_PROJECTILE_LIFETIME_MS, () => bullet.destroy());

    return true;
  }

  /** Overlap bala x inimigos, e colisão bala x paredes, registrados uma única vez (não a cada tiro). */
  _ensureBulletGroup(scene, player, enemyGroup) {
    if (this.bulletGroup) return;
    this.bulletGroup = scene.physics.add.group();
    scene.physics.add.overlap(this.bulletGroup, enemyGroup, (bullet, enemy) => {
      const hit = DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player, scene.time.now);
      if (hit && this.def.knockback) {
        enemy.applyKnockback(bullet.getData('dirX'), bullet.getData('dirY'), this.def.knockback, scene.time.now);
      }
      bullet.destroy();
    });
    // reaproveita o mapManager que a GameScene já monta — bala não deve
    // atravessar parede, então destrói ao colidir com a layer de paredes.
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  _findNearestEnemy(player, enemyGroup, range) {
    let nearest = null;
    let nearestDist = range;

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    });

    return nearest;
  }
}
