import DamageSystem from '../combat/DamageSystem.js';
import {
  hasShockwaveFx,
  hasShockwaveEvoFx,
  SHOCKWAVE_KEY,
  SHOCKWAVE_EVO_KEY,
  SHOCKWAVE_ORIGIN_X,
  SHOCKWAVE_ORIGIN_Y,
  launchShockwaveFx,
  attachShockwaveFlight,
  spawnShockwaveHitFx,
  spawnShockwaveFadeFx,
  spawnShockwaveZapFx
} from '../fx/ShockwaveFx.js';

// A onda reaproveita a textura hit_fx esticada (mesma técnica do laser
const SHOCKWAVE_COLOR = 0xffffff;
// Ângulo entre cada onda extra da salva, em graus — todas nascem no MES…
const SHOCKWAVE_SPREAD_DEG = 22;
// Cor da explosão da evolução "Blastix" (ver upgrade()) — laranja, pra
const BLASTIX_EXPLOSION_COLOR = 0x8fe9ff;

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
    this.networkBursts = [];
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

      const hit = DamageSystem.applyWeaponHit(enemy, wave.getData('damage'), player, scene.time.now, {
        kind: 'ability',
        color: SHOCKWAVE_COLOR
      });
      if (hit && this.def.knockback) {
        const dir = wave.getData('dir');
        enemy.applyKnockback(dir.x, dir.y, this.def.knockback, scene.time.now);
      }
      if (hasShockwaveFx(scene)) {
        const evo = this.evolved && hasShockwaveEvoFx(scene);
        spawnShockwaveHitFx(scene, wave.x, wave.y, wave.getData('dir').angle(), {
          evolved: evo,
          radius: this.explosionRadius
        });
        // multiplayer: o impacto (e a explosão da evolução) é tocado no outro cliente
        scene.abilityManager?.emitNetworkFx('swhit', {
          x: Math.round(wave.x), y: Math.round(wave.y),
          a: Math.round(wave.getData('dir').angle() * 100) / 100,
          e: evo ? 1 : 0, r: Math.round(this.explosionRadius)
        });
      }
      // Blastix: explode NO PONTO de impacto (não fica de área), ferindo
      if (this.evolved) this._explode(scene, player, wave.x, wave.y, enemy);
      wave.destroy();
    });
    scene.mapManager?.addCollider(this.group, (wave) => {
      if (hasShockwaveFx(scene)) {
        spawnShockwaveHitFx(scene, wave.x, wave.y, wave.getData('dir').angle(), {
          small: true,
          evolved: !!wave.getData('evo')
        });
        scene.abilityManager?.emitNetworkFx('swhit', {
          x: Math.round(wave.x), y: Math.round(wave.y),
          a: Math.round(wave.getData('dir').angle() * 100) / 100,
          e: wave.getData('evo') ? 1 : 0, sm: 1
        });
      }
      wave.destroy();
    });
  }

  // Explosão pontual da evolução Blastix ao acertar um inimigo: dano
  _explode(scene, player, x, y, hitEnemy) {
    const dmg = this.def.damage * this.explosionDamageFraction;
    const struck = [];
    this.enemyGroup.getChildren().forEach((enemy) => {
      if (enemy === hitEnemy || !enemy.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist <= this.explosionRadius) {
        struck.push(enemy);
        DamageSystem.applyWeaponHit(enemy, dmg, player, scene.time.now, {
          kind: 'explosion',
          color: BLASTIX_EXPLOSION_COLOR
        });
      }
    });
    this._showExplosionFx(scene, x, y);
    // VFX: a eletricidade do choque salta até alguns inimigos pegos na explosão
    if (hasShockwaveEvoFx(scene)) {
      Phaser.Utils.Array.Shuffle(struck)
        .slice(0, 4)
        .forEach((enemy) => spawnShockwaveZapFx(scene, x, y, enemy.x, enemy.y));
    }
  }

  _showExplosionFx(scene, x, y) {
    // com a arte evoluída a explosão visual já nasce no impacto (ShockwaveFx)
    if (hasShockwaveEvoFx(scene)) return;
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
    this._angleOffsets(this.waveCount).forEach((angleOffset, index) => {
      const dir = aim.clone().rotate(angleOffset);
      this._spawnWave(scene, player.x, player.y, dir, index === 0);
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

  // Onda com a arte branca em pixel art + FX de ar deslocado (ShockwaveFx).
  // Hitbox em mundo idêntica à da onda antiga (~92x35 px).
  _spawnWaveSprite(scene, x, y, dir, firstOfVolley) {
    const startX = x + dir.x * 16;
    const startY = y + dir.y * 16;
    // Blastwave: arte evoluída (branco + arcos elétricos); sem ela, a normal
    const evo = this.evolved && hasShockwaveEvoFx(scene);
    const waveKey = evo ? SHOCKWAVE_EVO_KEY : SHOCKWAVE_KEY;
    const wave = this.group.create(startX, startY, waveKey, 0);
    const scale = (this.def.width / 32) * 0.85;
    wave.setDepth(16);
    wave.setOrigin(SHOCKWAVE_ORIGIN_X, SHOCKWAVE_ORIGIN_Y);
    wave.setScale(scale);
    wave.body.setAllowGravity(false);
    wave.body.setSize((this.def.width * this.def.width) / 34 / scale, (this.def.width * this.def.width) / 90 / scale, true);
    wave.setRotation(dir.angle());
    wave.play(waveKey);
    wave.setData('evo', evo);
    wave.setData('damage', this.def.damage);
    wave.setData('dir', dir.clone());
    wave.setVelocity(dir.x * this.def.speed, dir.y * this.def.speed);

    launchShockwaveFx(scene, x, y, dir, { shake: firstOfVolley, evolved: evo });
    attachShockwaveFlight(scene, wave, dir, { evolved: evo });

    // forte durante a maior parte do caminho e some só no final
    const lifetimeMs = (this.def.distance / this.def.speed) * 1000;
    scene.tweens.add({
      targets: wave,
      alpha: 0,
      delay: lifetimeMs * 0.55,
      duration: lifetimeMs * 0.45,
      onComplete: () => {
        if (!wave.active) return;
        spawnShockwaveFadeFx(scene, wave.x, wave.y, dir.angle(), { evolved: evo });
        wave.destroy();
      }
    });
  }

  // Uma única onda de choque, nascendo em (x, y) e viajando na direção
  _spawnWave(scene, x, y, dir, firstOfVolley = true) {
    scene.sound.play('sfx_shockwave', { volume: 0.5, player: true });

    if (hasShockwaveFx(scene)) {
      this._spawnWaveSprite(scene, x, y, dir, firstOfVolley);
      return;
    }

    // fallback (folha não carregou): onda antiga feita com hit_fx esticado
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
