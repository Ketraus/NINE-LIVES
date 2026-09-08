import DamageSystem from '../combat/DamageSystem.js';

const BULLET_LIFETIME_MS = 1500;
const DEFAULT_PROJECTILE_SPEED = 380;
// intervalo entre cada shuriken dentro da MESMA rajada (ver _fireVolley…
const VOLLEY_STAGGER_MS = 120;
// giro contínuo do shuriken no ar (puramente visual, não mexe na
const SPIN_DURATION_MS = 260;

const SHURIKEN_COLOR = 0xd9d9e6;
const SHURIKEN_TEX_SIZE = 16;

// Visual/feedback da evolução "Shurivex" (ver upgrade()) — rastro cyber
const CHAIN_COLOR_DEFAULT = 0xb26bff;
const TRAIL_INTERVAL_MS = 45;
const CHAIN_SPARK_COUNT = 5;

// Habilidade exclusiva da Katana (carta "katana_shuriken"): a cada
export default class ShurikenAbility {
  constructor(def) {
    this.def = def;
    this.lastMs = 0;
    this.volleyCount = 1;
    this.bulletGroup = null;
    this.scene = null;

    // ligado por upgrade() quando Shurivex é confirmada — ver
    this.evolved = false;
    this.chainColor = CHAIN_COLOR_DEFAULT;
  }

  // Chamado a cada cópia extra da carta (até 4, ver data/upgrades.js
  restack() {
    this.volleyCount += 1;
  }

  // Chamado pela evolução Shurivex (upgradeAbility, não unlockAbility —
  upgrade(def) {
    this.evolved = true;
    this.chainColor = def.chainColor ?? CHAIN_COLOR_DEFAULT;
  }

  update(time, player, enemyGroup, scene) {
    if (!this.bulletGroup) this._create(scene, player, enemyGroup);

    if (time - this.lastMs < this.def.cooldownMs) return;
    const targets = this._findNearbyTargets(player, enemyGroup, this.volleyCount);
    if (targets.length === 0) return; // sem alvo à vista: não gasta cooldown (igual à pistola/GatoDrone)

    this.lastMs = time;
    this._fireVolley(scene, player, targets);
  }

  _create(scene, player, enemyGroup) {
    this.scene = scene;
    this.bulletGroup = scene.physics.add.group();
    scene.physics.add.overlap(this.bulletGroup, enemyGroup, (bullet, enemy) => {
      // hitSet evita o mesmo shuriken acertar o mesmo inimigo 2x seguidas
      const hitSet = bullet.getData('hitSet');
      if (hitSet.has(enemy)) return;
      hitSet.add(enemy);

      DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player, scene.time.now);

      // Shurivex: ainda tem 1 salto disponível -> procura um segundo alvo
      const chainsLeft = bullet.getData('chainsLeft');
      if (chainsLeft > 0) {
        const next = this._findChainTarget(enemy, enemyGroup, hitSet);
        if (next) {
          bullet.setData('chainsLeft', chainsLeft - 1);
          this._redirect(scene, bullet, next);
          this._spawnChainSpark(scene, enemy.x, enemy.y);
          return;
        }
      }
      bullet.destroy();
    });
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  // Alvos pra uma rajada de `count` shurikens — mesma lógica pra
  _findNearbyTargets(player, enemyGroup, count) {
    const candidates = [];
    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= this.def.range) candidates.push({ enemy, dist });
    });
    if (candidates.length === 0) return [];
    candidates.sort((a, b) => a.dist - b.dist);

    const targets = [];
    for (let i = 0; i < count; i++) {
      targets.push(candidates[i % candidates.length].enemy);
    }
    return targets;
  }

  // Inimigo vivo mais próximo de `fromEnemy`, dentro de def.range, que
  _findChainTarget(fromEnemy, enemyGroup, hitSet) {
    let nearest = null;
    let nearestDist = this.def.range;
    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active || hitSet.has(enemy)) return;
      const dist = Phaser.Math.Distance.Between(fromEnemy.x, fromEnemy.y, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    });
    return nearest;
  }

  // Recalcula a velocity do shuriken a partir da posição ATUAL dele (não
  _redirect(scene, bullet, next) {
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    const dir = new Phaser.Math.Vector2(next.x - bullet.x, next.y - bullet.y).normalize();
    bullet.setVelocity(dir.x * speed, dir.y * speed);
  }

  // Arremessa um shuriken por alvo, espaçados por VOLLEY_STAGGER_MS —
  _fireVolley(scene, player, targets) {
    targets.forEach((target, i) => {
      scene.time.delayedCall(i * VOLLEY_STAGGER_MS, () => {
        if (!player.active || !target.active) return; // alvo morreu enquanto a rajada ainda disparava
        this._throw(scene, player, target);
      });
    });
  }

  _throw(scene, player, target) {
    scene.sound.play('sfx_shuriken_throw', { volume: 0.5, player: true });

    const dir = new Phaser.Math.Vector2(target.x - player.x, target.y - player.y).normalize();
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;

    const bullet = this.bulletGroup.create(player.x, player.y, this._ensureTexture(scene));
    bullet.setDepth(15);
    bullet.body.setAllowGravity(false);
    bullet.body.setSize(6, 6, true);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setData('damage', this.def.damage);
    bullet.setData('hitSet', new Set());
    // 1 salto disponível pra shurikens evoluídos (Shurivex); 0 = se
    bullet.setData('chainsLeft', this.evolved ? 1 : 0);

    // giro contínuo no ar — puro visual (rotation), não mexe na velocity
    scene.tweens.add({
      targets: bullet,
      rotation: Math.PI * 2,
      duration: SPIN_DURATION_MS,
      repeat: -1,
      ease: 'Linear'
    });

    if (this.evolved) {
      // visual mais "cyber": tint roxo + brilho + rastro de fantasmas
      bullet.setTint(this.chainColor);
      if (bullet.preFX) bullet.preFX.addGlow(this.chainColor, 0, 1.2, false, 0.2, 5);
      this._attachTrail(scene, bullet, this.chainColor);
    }

    scene.time.delayedCall(BULLET_LIFETIME_MS, () => bullet.destroy());
  }

  // Rastro de "fantasmas" desbotando atrás do shuriken enquanto ele viaja
  _attachTrail(scene, bullet, color) {
    scene.time.addEvent({
      delay: TRAIL_INTERVAL_MS,
      repeat: Math.ceil(BULLET_LIFETIME_MS / TRAIL_INTERVAL_MS),
      callback: () => {
        if (!bullet.active) return;
        const ghost = scene.add
          .image(bullet.x, bullet.y, 'fx_shuriken')
          .setDepth(14)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(color)
          .setScale(0.7)
          .setRotation(bullet.rotation)
          .setAlpha(0.4);
        scene.tweens.add({
          targets: ghost,
          alpha: 0,
          scale: 0.35,
          duration: 180,
          onComplete: () => ghost.destroy()
        });
      }
    });
  }

  // Faísca roxa no instante do salto (Shurivex) — marca bem o "pulo" de
  _spawnChainSpark(scene, x, y) {
    for (let i = 0; i < CHAIN_SPARK_COUNT; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(10, 24);
      const shard = scene.add
        .image(x, y, 'hit_fx')
        .setDepth(20)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(Phaser.Math.FloatBetween(0.18, 0.28))
        .setRotation(angle)
        .setTint(this.chainColor);

      scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: shard.scale * 0.4,
        duration: Phaser.Math.Between(150, 220),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  // Desenha (uma única vez, com Graphics + generateTexture) a textura do
  _ensureTexture(scene) {
    const key = 'fx_shuriken';
    if (scene.textures.exists(key)) return key;

    const s = SHURIKEN_TEX_SIZE;
    const c = s / 2;
    const g = scene.add.graphics();

    g.fillStyle(SHURIKEN_COLOR, 1);
    // 4 pontas (losangos) em cruz, cada uma desenhada como um triângulo
    const tip = s * 0.5;
    const wing = s * 0.16;
    [
      [c, c - tip, c - wing, c - wing, c + wing, c - wing], // ponta de cima
      [c, c + tip, c - wing, c + wing, c + wing, c + wing], // ponta de baixo
      [c - tip, c, c - wing, c - wing, c - wing, c + wing], // ponta da esquerda
      [c + tip, c, c + wing, c - wing, c + wing, c + wing] // ponta da direita
    ].forEach(([x1, y1, x2, y2, x3, y3]) => g.fillTriangle(x1, y1, x2, y2, x3, y3));

    g.fillStyle(0x1a1a22, 1);
    g.fillCircle(c, c, s * 0.14);

    g.generateTexture(key, s, s);
    g.destroy();
    return key;
  }
}
