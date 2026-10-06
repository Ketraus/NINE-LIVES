import DamageSystem from '../combat/DamageSystem.js';
import {
  ensureShurikenTexture,
  SHURIKEN_DISPLAY_SCALE,
  launchShurikenFx,
  attachShurikenFlight,
  spawnShurikenHitFx,
  spawnChainLightningFx,
  spawnShurikenFadeFx
} from '../fx/ShurikenFx.js';

const BULLET_LIFETIME_MS = 1500;
const DEFAULT_PROJECTILE_SPEED = 380;
// intervalo entre cada shuriken dentro da MESMA rajada (ver _fireVolley…
const VOLLEY_STAGGER_MS = 120;
// giro contínuo do shuriken no ar (puramente visual, não mexe na
const SPIN_DURATION_MS = 260;

const SHURIKEN_COLOR = 0xcfe8ff;

// Visual/feedback da evolução "Shurivex" (ver upgrade()) — rastro cyber
const CHAIN_COLOR_DEFAULT = 0xb26bff;

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

      const fxColor = this.evolved ? this.chainColor : SHURIKEN_COLOR;
      DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player, scene.time.now, {
        kind: 'ability',
        color: fxColor
      });
      const flightAngle = Math.atan2(bullet.body?.velocity.y ?? 0, bullet.body?.velocity.x ?? 1);
      spawnShurikenHitFx(scene, enemy.x, enemy.y, fxColor, flightAngle, this.evolved);

      // Shurivex: ainda tem 1 salto disponível -> procura um segundo alvo
      const chainsLeft = bullet.getData('chainsLeft');
      if (chainsLeft > 0) {
        const next = this._findChainTarget(enemy, enemyGroup, hitSet);
        if (next) {
          bullet.setData('chainsLeft', chainsLeft - 1);
          this._redirect(scene, bullet, next);
          spawnChainLightningFx(scene, enemy, next, this.chainColor);
          return;
        }
      }
      bullet.destroy();
    });
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => {
      spawnShurikenFadeFx(scene, bullet.x, bullet.y, this.evolved ? this.chainColor : SHURIKEN_COLOR);
      bullet.destroy();
    });
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

    const bullet = this.bulletGroup.create(player.x, player.y, ensureShurikenTexture(scene));
    bullet.setDepth(15);
    bullet.setScale(SHURIKEN_DISPLAY_SCALE);
    bullet.body.setAllowGravity(false);
    // mesma hitbox de antes (~6px no mundo), compensando a escala do sprite
    const hb = 6 / SHURIKEN_DISPLAY_SCALE;
    bullet.body.setSize(hb, hb, true);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setData('damage', this.def.damage);
    bullet.setData('hitSet', new Set());
    // 1 salto disponível pra shurikens evoluídos (Shurivex); 0 = sem salto
    bullet.setData('chainsLeft', this.evolved ? 1 : 0);

    // giro contínuo no ar — puro visual (rotation), não mexe na velocity
    scene.tweens.add({
      targets: bullet,
      rotation: Math.PI * 2,
      duration: SPIN_DURATION_MS,
      repeat: -1,
      ease: 'Linear'
    });

    // VFX: clarão de lançamento + brilho + rastro (aço na base, roxo cyber na NeoShuriken)
    const fxColor = this.evolved ? this.chainColor : SHURIKEN_COLOR;
    launchShurikenFx(scene, player.x, player.y, Math.atan2(dir.y, dir.x), fxColor, this.evolved);
    attachShurikenFlight(scene, bullet, fxColor, this.evolved);

    scene.time.delayedCall(BULLET_LIFETIME_MS, () => {
      if (!bullet.active) return;
      spawnShurikenFadeFx(scene, bullet.x, bullet.y, fxColor);
      bullet.destroy();
    });
  }

}
