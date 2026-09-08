import DamageSystem from '../combat/DamageSystem.js';

// Fração do dano principal que cada acerto "avulso" da evolução "Corte
const STRAY_DAMAGE_FRACTION = 0.5;

// Arma melee (punhos, katana, ...): em vez de uma hitbox física, checa
export default class Weapon {
  constructor(def) {
    this.def = def;
  }

  fire(scene, player, enemyGroup, statMods) {
    const range = this.def.range * (1 + statMods.rangeMultiplier);
    const damage = this.def.damage * (1 + statMods.damageMultiplier);

    if (this.def.shape === 'sword') {
      scene.sound.play('sfx_katana', { volume: 0.6, player: true });
      this._fireSword(scene, player, enemyGroup, range, damage, statMods);
    } else {
      scene.sound.play('sfx_punch', { volume: 0.6, player: true });
      const aim = player.getAimDirection();
      const landedHit = this._fireArc(scene, player, enemyGroup, aim, range, damage);

      // evolução "Reflexos de Predador" (Visão Aguçada, punhos): chance
      if (landedHit && statMods.bulletTime && Math.random() < statMods.bulletTime.chance) {
        scene.slowmoSystem?.trigger(scene.time.now, statMods.bulletTime.durationMs);
        this._showBulletTimeFx(scene);
      }

    }
  }

  // Katana: golpes em arco na direção horizontal da mira do jogador —
  _fireSword(scene, player, enemyGroup, range, damage, statMods) {
    const aim = player.getHorizontalAimDirection();
    const swings = statMods.doubleStrikeStacks > 0 ? statMods.doubleStrikeStacks + 1 : 1;
    const offsetDeg = this.def.comboOffsetDeg ?? 24;
    const delayMs = this.def.comboDelayMs ?? 90;
    // acumula quem já foi acertado por qualquer golpe deste combo — evita
    const hitEnemies = new Set();
    // "Dança de Cortes" (evolução de Corte Duplo): só entra em jogo com o
    const isDance = !!statMods.danceOfCuts;

    for (let i = 0; i < swings; i++) {
      // 1º golpe sempre reto no eixo de mira; os seguintes alternam
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      const angleOffset = Phaser.Math.DegToRad(offsetDeg) * side * Math.ceil(i / 2);
      const swingAim = aim.clone().rotate(angleOffset);
      const isFinisher = isDance && i === swings - 1;
      const style = this._swingStyle(isDance, isFinisher);
      const swingRange = range * style.rangeMultiplier;

      const doSwing = () =>
        this._fireArc(scene, player, enemyGroup, swingAim, swingRange, damage, hitEnemies, true, {
          tint: style.tint,
          arcDegreesOverride: this.def.arcDegrees + style.arcDegreesBonus,
          fxDurationMultiplier: style.fxDurationMultiplier,
          knockbackMultiplier: style.knockbackMultiplier,
          cameraShakeMultiplier: style.cameraShakeMultiplier,
          isFinisher
        });

      if (i === 0) doSwing();
      else scene.time.delayedCall(delayMs * i, doSwing);
    }

    // evolução "Corte Fantasma" (Visão Aguçada, katana): roda depois do
    if (statMods.strayHits) {
      scene.time.delayedCall(delayMs * (swings - 1), () => {
        this._applyStrayHits(scene, player, enemyGroup, damage, statMods.strayHits, hitEnemies);
      });
    }
  }

  // Define a "roupagem" de cada golpe do combo da katana quando a
  _swingStyle(isDance, isFinisher) {
    const neutral = {
      tint: null,
      rangeMultiplier: 1,
      arcDegreesBonus: 0,
      fxDurationMultiplier: 1,
      knockbackMultiplier: 1,
      cameraShakeMultiplier: 1
    };
    if (!isDance) return neutral;

    const tint = this.def.danceCutTint ?? 0xff2b2b;
    if (!isFinisher) return { ...neutral, tint };

    const f = this.def.danceFinisher ?? {};
    return {
      tint,
      rangeMultiplier: f.rangeMultiplier ?? 1.35,
      arcDegreesBonus: f.arcDegreesBonus ?? 30,
      fxDurationMultiplier: f.fxDurationMultiplier ?? 1.6,
      knockbackMultiplier: f.knockbackMultiplier ?? 1.8,
      cameraShakeMultiplier: f.cameraShakeMultiplier ?? 3
    };
  }

  // Leque na direção do olhar — usado pelos punhos e por cada golpe do
  _fireArc(scene, player, enemyGroup, aim, range, damage, hitEnemies, useSwordFx, options = {}) {
    const arcDegrees = options.arcDegreesOverride ?? this.def.arcDegrees;
    const halfArc = Phaser.Math.DegToRad(arcDegrees) / 2;

    if (useSwordFx) {
      this._showSwordSwingFx(scene, player, aim, range, halfArc, options);
    } else {
      this._showArcFx(scene, player, aim, range);
    }

    let landedHit = false;
    // snapshot: applyHit pode matar/remover do grupo e quebrar a iteração l…
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (!enemy?.active) return;
      const toEnemy = new Phaser.Math.Vector2(enemy.x - player.x, enemy.y - player.y);
      const dist = toEnemy.length();
      if (dist > range) return;

      const angleBetween = Math.abs(aim.angle() - toEnemy.angle());
      const normalizedAngle = Math.min(angleBetween, Phaser.Math.PI2 - angleBetween);
      if (normalizedAngle <= halfArc) {
        if (!this._hasLineOfSight(scene, player, enemy)) return;
        const hit = this._applyHit(
          scene,
          enemy,
          damage,
          player,
          aim,
          options.knockbackMultiplier ?? 1,
          options.cameraShakeMultiplier ?? 1
        );
        // golpe final da "Dança de Cortes": além do knockback/shake maiores
        if (hit && options.isFinisher) this._showFinisherImpactFx(scene, enemy.x, enemy.y, options.tint);
        hitEnemies?.add(enemy);
        landedHit = true;
      }
    });
    return landedHit;
  }

  // Evolução "Corte Fantasma" (Visão Aguçada, katana): rola, pra cada
  _applyStrayHits(scene, player, enemyGroup, damage, def, hitEnemies) {
    let struck = 0;
    const strayDamage = damage * STRAY_DAMAGE_FRACTION;

    // snapshot: mesma razão do fix em _fireArc
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (struck >= def.maxTargets) return;
      if (!enemy?.active || hitEnemies.has(enemy)) return;

      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist > def.radius) return;
      if (Math.random() >= def.chance) return;
      if (!this._hasLineOfSight(scene, player, enemy)) return;

      const toEnemy = new Phaser.Math.Vector2(enemy.x - player.x, enemy.y - player.y).normalize();
      this._showStrayFx(scene, enemy);
      this._applyHit(scene, enemy, strayDamage, player, toEnemy);
      hitEnemies.add(enemy);
      struck += 1;
    });
  }

  // Amostra pontos entre atacante e alvo checando a layer de paredes do
  _hasLineOfSight(scene, player, enemy) {
    const wallsLayer = scene.mapManager?.wallsLayer;
    if (!wallsLayer) return true;

    const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
    const steps = Math.max(1, Math.ceil(dist / 8)); // um ponto a cada ~8px

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Phaser.Math.Linear(player.x, enemy.x, t);
      const y = Phaser.Math.Linear(player.y, enemy.y, t);
      if (wallsLayer.hasTileAtWorldXY(x, y)) return false;
    }
    return true;
  }

  // Aplica o dano e, se o golpe realmente acertou, dispara o empurrão
  _applyHit(scene, enemy, damage, player, aim, knockbackMultiplier = 1, cameraShakeMultiplier = 1) {
    const hit = DamageSystem.applyWeaponHit(enemy, damage, player, scene.time.now);
    if (hit) {
      if (this.def.cameraShake) {
        scene.cameras.main.shake(60, this.def.cameraShake * cameraShakeMultiplier);
      }
      if (this.def.knockback) {
        enemy.applyKnockback(aim.x, aim.y, this.def.knockback * knockbackMultiplier, scene.time.now);
      }
    }
    return hit;
  }

  // Visual do soco: flash curto e pequeno, ofertado à frente do jogador.
  _showArcFx(scene, player, aim, range) {
    const fxX = player.x + aim.x * range * 0.5;
    const fxY = player.y + aim.y * range * 0.5;
    const fx = scene.add
      .image(fxX, fxY, 'hit_fx')
      .setDepth(20)
      .setScale(range / 40)
      .setRotation(aim.angle())
      .setTint(this.def.fxTint ?? 0xffffff);
    scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: fx.scale * 1.4,
      duration: this.def.fxDurationMs ?? 150,
      onComplete: () => fx.destroy()
    });
  }

  // Visual da katana: um corte em arco de verdade — uma fatia desenhada
  _showSwordSwingFx(scene, player, aim, range, halfArc, options = {}) {
    const baseAngle = aim.angle();
    const tint = options.tint ?? this.def.fxTint ?? 0xcfe8ff;
    const durationMult = options.fxDurationMultiplier ?? 1;
    // golpe final da Dança de Cortes: fatia mais opaca, borda mais grossa
    const strokeWidth = options.isFinisher ? 9 : 5;
    const fillAlpha = options.isFinisher ? 0.65 : 0.5;
    const expandScale = options.isFinisher ? 1.3 : 1.15;
    const g = scene.add.graphics({ x: player.x, y: player.y }).setDepth(20);

    g.fillStyle(tint, fillAlpha);
    g.slice(0, 0, range, baseAngle - halfArc, baseAngle + halfArc, false);
    g.fillPath();

    g.lineStyle(strokeWidth, tint, 0.95);
    g.beginPath();
    g.arc(0, 0, range, baseAngle - halfArc, baseAngle + halfArc, false);
    g.strokePath();

    scene.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: expandScale,
      scaleY: expandScale,
      duration: (this.def.fxDurationMs ?? 200) * durationMult,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
  }

  // Impacto extra do golpe final da "Dança de Cortes": um estouro de
  _showFinisherImpactFx(scene, x, y, tint) {
    const color = tint ?? 0xff2b2b;

    const flash = scene.add.image(x, y, 'hit_fx').setDepth(21).setScale(0.6).setAlpha(0.95).setTint(0xffffff);
    scene.tweens.add({
      targets: flash,
      scale: flash.scale * 2.2,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    const shardCount = 8;
    for (let i = 0; i < shardCount; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(24, 52);
      const shard = scene.add
        .image(x, y, 'hit_fx')
        .setDepth(20)
        .setScale(Phaser.Math.FloatBetween(0.25, 0.45))
        .setRotation(angle)
        .setTint(color);
      scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: shard.scale * 0.3,
        duration: Phaser.Math.Between(220, 320),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  // Visual de um acerto "avulso" da evolução Corte Fantasma: um flash
  _showStrayFx(scene, enemy) {
    const fx = scene.add
      .image(enemy.x, enemy.y, 'hit_fx')
      .setDepth(20)
      .setScale(0.5)
      .setAlpha(0.9)
      .setTint(this.def.fxTint ?? 0xffffff);
    scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: fx.scale * 1.8,
      duration: 150,
      onComplete: () => fx.destroy()
    });
  }

  // Visual de gatilho da evolução Reflexos de Predador: um flash rápido e
  _showBulletTimeFx(scene) {
    scene.cameras.main.flash(120, 60, 90, 160, false);
  }
}
