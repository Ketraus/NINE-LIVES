import DamageSystem from '../combat/DamageSystem.js';

const DEFAULT_PROJECTILE_SPEED = 380;
const DEFAULT_PROJECTILE_LIFETIME_MS = 1200;
// cor padrão do projétil quando a arma não define "projectileTint" — az…
const DEFAULT_PROJECTILE_TINT = 0x4fd1ff;
// tamanho (em px) da textura do "raio" gerada em _ensureBulletTexture —
const LASER_TEX_WIDTH = 20;
const LASER_TEX_HEIGHT = 8;

// Arma à distância (pistola, ...): mira automaticamente no inimigo mais
// quantos "saltos" pra um novo inimigo a evolução "Instinto Caçador"
const CHAIN_SHOT_JUMPS = 1;

// ---- "Fragmentação" (pistol_fragmentation, ver data/upgrades.js) ----
const FRAGMENTATION_DAMAGE_FRACTION = 4 / 3;
const FRAGMENTATION_LIFETIME_FRACTION = 0.55;
const FRAGMENTATION_SPREAD_DEG = 7;

// ---- "SMARTSHOT" (pistol_fragmentation_evo_smartshot) ----
const SMART_SHOT_TRIGGER_FRACTION = 0.5;

export default class RangedWeapon {
  constructor(def) {
    this.def = def;
    this.bulletGroup = null; // criado no primeiro fire() (precisa da scene)
  }

  fire(scene, player, enemyGroup, statMods) {
    const range = this.def.range * (1 + statMods.rangeMultiplier);
    const target = this._findNearestEnemy(player.x, player.y, enemyGroup, range);
    if (!target) return false; // sem alvo à vista: não atira, não gasta cooldown

    this._ensureBulletGroup(scene, player, enemyGroup);
    // toca uma vez por disparo, mesmo na Fragmentação (leque de várias
    scene.sound.play(statMods.fragmentation ? 'sfx_shotgun' : 'sfx_pistol', { volume: 0.6 });

    const damage = this.def.damage * (1 + statMods.damageMultiplier);
    const dir = new Phaser.Math.Vector2(target.x - player.x, target.y - player.y).normalize();

    // "Fragmentação": em vez de 1 bala normal, dispara pelletCount balas
    if (statMods.fragmentation) {
      this._fireFragmentationVolley(scene, player, enemyGroup, dir, damage, statMods);
    } else {
      this._spawnBullet(scene, player, enemyGroup, dir, damage, statMods, {});
    }

    return true;
  }

  // Leque de projéteis da "Fragmentação" (statMods.fragmentation.pelletCo…
  _fireFragmentationVolley(scene, player, enemyGroup, dir, damage, statMods) {
    const pelletCount = statMods.fragmentation.pelletCount;
    const pelletDamage = damage * FRAGMENTATION_DAMAGE_FRACTION;
    const step = Phaser.Math.DegToRad(FRAGMENTATION_SPREAD_DEG);

    for (let i = 0; i < pelletCount; i++) {
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      const angleOffset = step * side * Math.ceil(i / 2);
      const pelletDir = dir.clone().rotate(angleOffset);
      this._spawnBullet(scene, player, enemyGroup, pelletDir, pelletDamage, statMods, {
        lifetimeMs: DEFAULT_PROJECTILE_LIFETIME_MS * FRAGMENTATION_LIFETIME_FRACTION,
        scale: 0.8
      });
    }
  }

  // Cria e lança um único projétil físico — usado tanto pelo tiro único
  _spawnBullet(scene, player, enemyGroup, dir, damage, statMods, overrides) {
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    const tint = this.def.projectileTint ?? DEFAULT_PROJECTILE_TINT;
    const textureKey = this._ensureBulletTexture(scene, tint);
    const lifetimeMs = overrides.lifetimeMs ?? DEFAULT_PROJECTILE_LIFETIME_MS;

    const bullet = this.bulletGroup.create(player.x, player.y, textureKey);
    bullet
      .setDepth(15)
      .setScale((this.def.projectileScale ?? 1) * (overrides.scale ?? 1))
      // ADD faz o raio "brilhar" contra o fundo em vez de só colar uma
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(dir.angle());
    bullet.body.setAllowGravity(false);
    // a textura desenhada é bem mais comprida que o hitbox real do tiro
    bullet.body.setSize(6, 4, true);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    // brilho extra em volta do sprite (some sozinho se o navegador cair
    if (bullet.preFX) {
      bullet.preFX.addGlow(tint, 0, 1.5, false, 0.2, 6);
    }
    bullet.setData('damage', damage);
    // guardado pra empurrar o inimigo na hora do impacto (ver knockback
    bullet.setData('dirX', dir.x);
    bullet.setData('dirY', dir.y);
    // inimigos já acertados por ESTE projétil (o próprio + qualquer salto
    bullet.setData('hitEnemies', []);
    // quantos saltos pra um novo inimigo esta bala ainda pode dar; range
    bullet.setData('chainJumpsLeft', statMods.chainShot ? CHAIN_SHOT_JUMPS : 0);
    bullet.setData('chainRange', this.def.range * (1 + statMods.rangeMultiplier));

    // "SMARTSHOT": a meio caminho do tempo de vida, se a bala ainda não
    if (statMods.smartShot) {
      const triggerMs = lifetimeMs * SMART_SHOT_TRIGGER_FRACTION;
      scene.time.delayedCall(triggerMs, () => this._trySmartRetarget(bullet, enemyGroup));
    }

    // projétil não deve viver pra sempre caso erre todo mundo
    scene.time.delayedCall(lifetimeMs, () => bullet.destroy());
  }

  // "SMARTSHOT" (evolução de Fragmentação): dá à bala uma segunda chance
  _trySmartRetarget(bullet, enemyGroup) {
    if (!bullet.active) return;
    if (bullet.getData('hitEnemies').length > 0) return;

    const nearest = this._findNearestEnemy(bullet.x, bullet.y, enemyGroup, bullet.getData('chainRange'));
    if (!nearest) return;
    this._retarget(bullet, nearest);
  }

  // Desenha (uma única vez por cor, com Graphics + generateTexture) a
  _ensureBulletTexture(scene, tint) {
    const key = `fx_laser_bolt_${tint.toString(16)}`;
    if (scene.textures.exists(key)) return key;

    const w = LASER_TEX_WIDTH;
    const h = LASER_TEX_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;

    const g = scene.add.graphics();

    // halo externo — bem suave, é o que lê como "brilho" do raio à distância
    g.fillStyle(tint, 0.16);
    g.fillEllipse(cx, cy, w, h);
    g.fillStyle(tint, 0.32);
    g.fillEllipse(cx, cy, w * 0.72, h * 0.6);

    // corpo do raio: cápsula alongada apontando pra frente (direção +X,
    g.fillStyle(tint, 0.95);
    g.fillRoundedRect(cx - w * 0.4, cy - h * 0.16, w * 0.8, h * 0.32, h * 0.16);

    // núcleo quase branco — "ponto quente" na frente do disparo
    g.fillStyle(0xffffff, 0.95);
    g.fillRoundedRect(cx - w * 0.3, cy - h * 0.09, w * 0.55, h * 0.18, h * 0.09);

    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  // Overlap bala x inimigos, e colisão bala x paredes, registrados uma ún…
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
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  // Reaponta uma bala já em voo pro alvo dado, sem recriar o sprite.
  _retarget(bullet, target) {
    const dir = new Phaser.Math.Vector2(target.x - bullet.x, target.y - bullet.y).normalize();
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setRotation(dir.angle());
    bullet.setData('dirX', dir.x);
    bullet.setData('dirY', dir.y);
  }

  // tiro inicial, o inimigo recém-atingido no salto da "Instinto Caçador")
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
