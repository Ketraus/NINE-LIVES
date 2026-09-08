import DamageSystem from '../combat/DamageSystem.js';

// A onda reaproveita a textura hit_fx esticada (mesma técnica do laser
const SHOCKWAVE_COLOR = 0xffb199;
// Ângulo entre cada onda extra da salva, em graus — todas nascem no MES…
const SHOCKWAVE_SPREAD_DEG = 22;
// Cor da explosão da evolução "Blastix" (ver upgrade()) — laranja, pra
const BLASTIX_EXPLOSION_COLOR = 0xff6a2b;

// Habilidade exclusiva dos Punhos (carta "fists_shockwave"): a cada
export default class ShockwaveAbility {
  constructor(def) {
    this.def = def;
    this.lastMs = 0;
    this.waveCount = 1;
    this.group = null;
    this.enemyGroup = null;
    // ligados por upgrade() quando "Blastix" é confirmada — ver upgrade()
    this.evolved = false;
    this.explosionRadius = 0;
    this.explosionDamageFraction = 0;
  }

  // Chamado pela evolução Blastix (upgradeAbility, não unlockAbility — ver
  upgrade(def) {
    this.evolved = true;
    this.explosionRadius = def.explosionRadius;
    this.explosionDamageFraction = def.explosionDamageFraction;
  }

  // Chamado a cada cópia extra da carta (até 4, ver data/upgrades.js
  restack() {
    this.waveCount += 1;
  }

  update(time, player, enemyGroup, scene) {
    if (!this.group) this._createGroup(scene, enemyGroup, player);
    if (time - this.lastMs < this.def.cooldownMs) return;
    this.lastMs = time;
    this._fire(scene, player);
  }

  // Cria (uma única vez) o grupo físico das ondas e o overlap contra os
  _createGroup(scene, enemyGroup, player) {
    this.enemyGroup = enemyGroup;
    this.group = scene.physics.add.group();
    scene.physics.add.overlap(this.group, enemyGroup, (wave, enemy) => {
      // não atravessa: para no primeiro inimigo que acertar em vez de
      if (!wave.active) return;

      const hit = DamageSystem.applyWeaponHit(enemy, wave.getData('damage'), player, scene.time.now);
      if (hit && this.def.knockback) {
        const dir = wave.getData('dir');
        enemy.applyKnockback(dir.x, dir.y, this.def.knockback, scene.time.now);
      }
      // Blastix: explode NO PONTO de impacto (não fica de área), ferindo
      if (this.evolved) this._explode(scene, player, wave.x, wave.y, enemy);
      wave.destroy();
    });
    scene.mapManager?.addCollider(this.group, (wave) => wave.destroy());
  }

  // Explosão pontual da evolução Blastix ao acertar um inimigo: dano
  _explode(scene, player, x, y, hitEnemy) {
    const dmg = this.def.damage * this.explosionDamageFraction;
    this.enemyGroup.getChildren().forEach((enemy) => {
      if (enemy === hitEnemy || !enemy.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist <= this.explosionRadius) {
        DamageSystem.applyWeaponHit(enemy, dmg, player, scene.time.now);
      }
    });
    this._showExplosionFx(scene, x, y);
  }

  _showExplosionFx(scene, x, y) {
    const fx = scene.add
      .circle(x, y, this.explosionRadius, BLASTIX_EXPLOSION_COLOR, 0.35)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(17);
    scene.tweens.add({
      targets: fx,
      scale: 1.3,
      alpha: 0,
      duration: 220,
      onComplete: () => fx.destroy()
    });
  }

  // Dispara `this.waveCount` ondas TODAS DE UMA VEZ (sem stagger,
  _fire(scene, player) {
    const aim = player.getAimDirection();
    this._angleOffsets(this.waveCount).forEach((angleOffset) => {
      const dir = aim.clone().rotate(angleOffset);
      this._spawnWave(scene, player.x, player.y, dir);
    });
  }

  // Ângulos (radianos) de cada onda da salva em relação à mira, todas
  _angleOffsets(count) {
    const step = Phaser.Math.DegToRad(SHOCKWAVE_SPREAD_DEG);
    const offsets = [];
    for (let i = 0; i < count; i++) {
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      offsets.push(step * side * Math.ceil(i / 2));
    }
    return offsets;
  }

  // Uma única onda de choque, nascendo em (x, y) e viajando na direção
  _spawnWave(scene, x, y, dir) {
    scene.sound.play('sfx_shockwave', { volume: 0.5, player: true });

    const wave = this.group.create(x, y, 'hit_fx');
    wave.setDepth(16);
    wave.body.setAllowGravity(false);
    wave.body.setSize(this.def.width, this.def.width, true);
    wave.setRotation(dir.angle());
    // esticado tipo "onda": comprido no eixo do movimento, estreito na
    wave.setScale(this.def.width / 34, this.def.width / 90);
    wave.setBlendMode(Phaser.BlendModes.ADD);
    wave.setTint(SHOCKWAVE_COLOR);
    wave.setAlpha(0.85);
    wave.setData('damage', this.def.damage);
    wave.setData('dir', dir.clone());
    wave.setVelocity(dir.x * this.def.speed, dir.y * this.def.speed);

    const lifetimeMs = (this.def.distance / this.def.speed) * 1000;
    scene.tweens.add({
      targets: wave,
      alpha: 0,
      duration: lifetimeMs,
      onComplete: () => wave.destroy()
    });
  }
}
