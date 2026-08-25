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
// quantos "saltos" pra um novo inimigo a evolução "Instinto Caçador"
// (range_up_evo_hunter_instinct, ver data/upgrades.js) permite por tiro.
// Só 1 por enquanto (acerta o primeiro, salta pro segundo mais próximo
// DELE) — se um dia quisermos mais saltos, isto vira parte do efeito da
// carta em vez de uma constante fixa aqui.
const CHAIN_SHOT_JUMPS = 1;

export default class RangedWeapon {
  /** @param {object} def - entrada de data/weapons.js (type: "ranged") */
  constructor(def) {
    this.def = def;
    this.bulletGroup = null; // criado no primeiro fire() (precisa da scene)
  }

  fire(scene, player, enemyGroup, statMods) {
    const range = this.def.range * (1 + statMods.rangeMultiplier);
    const target = this._findNearestEnemy(player.x, player.y, enemyGroup, range);
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
    // inimigos já acertados por ESTE projétil (o próprio + qualquer salto
    // da "Instinto Caçador") — evita re-acertar o mesmo alvo enquanto a
    // bala ainda está sobreposta a ele, e evita saltar de volta pra quem
    // já foi atingido
    bullet.setData('hitEnemies', []);
    // quantos saltos pra um novo inimigo esta bala ainda pode dar; range
    // do salto usa o mesmo alcance (já com rangeMultiplier) do tiro em si,
    // já que a evolução parte justamente de Visão Aguçada
    bullet.setData('chainJumpsLeft', statMods.chainShot ? CHAIN_SHOT_JUMPS : 0);
    bullet.setData('chainRange', range);

    // projétil não deve viver pra sempre caso erre todo mundo
    scene.time.delayedCall(DEFAULT_PROJECTILE_LIFETIME_MS, () => bullet.destroy());

    return true;
  }

  /** Overlap bala x inimigos, e colisão bala x paredes, registrados uma única vez (não a cada tiro). */
  _ensureBulletGroup(scene, player, enemyGroup) {
    if (this.bulletGroup) return;
    this.bulletGroup = scene.physics.add.group();
    scene.physics.add.overlap(this.bulletGroup, enemyGroup, (bullet, enemy) => {
      const hitEnemies = bullet.getData('hitEnemies');
      if (hitEnemies.includes(enemy)) return; // mesmo alvo, bala ainda sobreposta a ele

      const hit = DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player, scene.time.now);
      if (!hit) return; // desviou/já morreu: bala segue intacta, sem contar como impacto

      hitEnemies.push(enemy);
      if (this.def.knockback) {
        enemy.applyKnockback(bullet.getData('dirX'), bullet.getData('dirY'), this.def.knockback, scene.time.now);
      }

      // "Instinto Caçador": em vez de destruir a bala aqui, procura o
      // inimigo mais próximo DO INIMIGO QUE ACABOU DE SER ATINGIDO (não
      // do player) e redireciona o projétil pra ele — é um salto pro
      // próximo alvo, não um "atravessar e continuar reto"
      const jumpsLeft = bullet.getData('chainJumpsLeft');
      if (jumpsLeft > 0) {
        const nextTarget = this._findNearestEnemy(enemy.x, enemy.y, enemyGroup, bullet.getData('chainRange'), hitEnemies);
        if (nextTarget) {
          this._retarget(bullet, nextTarget);
          bullet.setData('chainJumpsLeft', jumpsLeft - 1);
          return;
        }
      }

      bullet.destroy();
    });
    // reaproveita o mapManager que a GameScene já monta — bala não deve
    // atravessar parede, então destrói ao colidir com a layer de paredes.
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  /** Reaponta uma bala já em voo pro alvo dado, sem recriar o sprite. */
  _retarget(bullet, target) {
    const dir = new Phaser.Math.Vector2(target.x - bullet.x, target.y - bullet.y).normalize();
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setRotation(dir.angle());
    bullet.setData('dirX', dir.x);
    bullet.setData('dirY', dir.y);
  }

  /**
   * @param {number} originX/originY - de onde medir a distância (player no
   *   tiro inicial, o inimigo recém-atingido no salto da "Instinto Caçador")
   * @param {Array} [exclude] - inimigos a ignorar (usado no salto, pra não
   *   voltar pro alvo que a bala acabou de atingir)
   */
  _findNearestEnemy(originX, originY, enemyGroup, range, exclude = []) {
    let nearest = null;
    let nearestDist = range;

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      if (exclude.includes(enemy)) return;
      const dist = Phaser.Math.Distance.Between(originX, originY, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    });

    return nearest;
  }
}
