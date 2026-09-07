import DamageSystem from '../combat/DamageSystem.js';

// Quanto o intervalo entre pancadas diminui a cada cópia extra da carta
const COOLDOWN_STEP_MS = 500;
const MIN_COOLDOWN_MS = 1200;

// Visual da onda de choque da evolução "Terremoto" (ver upgrade()) — cor
const TERREMOTO_SHOCKWAVE_COLOR = 0xffae42;
const TERREMOTO_SHARD_COUNT = 10;

// Habilidade exclusiva dos Punhos (carta "fists_slam"): a cada
export default class SlamAbility {
  constructor(def) {
    this.def = def;
    this.cooldownMs = def.cooldownMs;
    this.lastMs = 0;

    // ligado por upgrade() quando Terremoto é confirmada — ver
    this.evolved = false;
    this.radiusMultiplier = 1;
    this.shockwaveRadiusMultiplier = 0;
    this.shockwaveDamageFraction = 0;
    this.shockwaveKnockback = 0;
    this.shockwaveDelayMs = 0;
  }

  // Chamado a cada cópia extra da carta "Pancada Sísmica" (até 4, ver
  restack() {
    this.cooldownMs = Math.max(MIN_COOLDOWN_MS, this.cooldownMs - COOLDOWN_STEP_MS);
  }

  // Chamado pela evolução Terremoto (upgradeAbility, não unlockAbility —
  upgrade(def) {
    this.evolved = true;
    this.radiusMultiplier = def.radiusMultiplier ?? 1;
    this.shockwaveRadiusMultiplier = def.shockwaveRadiusMultiplier ?? 0;
    this.shockwaveDamageFraction = def.shockwaveDamageFraction ?? 0;
    this.shockwaveKnockback = def.shockwaveKnockback ?? 0;
    this.shockwaveDelayMs = def.shockwaveDelayMs ?? 0;
  }

  update(time, player, enemyGroup, scene) {
    if (time - this.lastMs < this.cooldownMs) return;
    this.lastMs = time;
    this._slam(player, enemyGroup, scene);
  }

  _slam(player, enemyGroup, scene) {
    scene.sound.play('sfx_slam_impact', { volume: 0.5 });

    const radius = this.def.radius * this.radiusMultiplier;

    // snapshot: se applyWeaponHit matar e remover o inimigo do grupo, iterar
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= radius) DamageSystem.applyWeaponHit(enemy, this.def.damage, player);
    });
    this._showFx(scene, player, radius);

    // Terremoto: o tremor secundário vem um instante DEPOIS do impacto
    if (this.evolved) this._scheduleShockwave(scene, player, enemyGroup);
  }

  // Onda circular simples se expandindo a partir do jogador.
  _showFx(scene, player, radius) {
    const fx = scene.add
      .circle(player.x, player.y, radius, 0xff5555, 0.28)
      .setDepth(19);
    scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: 1.3,
      duration: 220,
      onComplete: () => fx.destroy()
    });
    scene.cameras.main.shake(90, 0.004);
  }

  // Terremoto: agenda a onda de choque pra `shockwaveDelayMs` depois do
  _scheduleShockwave(scene, player, enemyGroup) {
    scene.time.delayedCall(this.shockwaveDelayMs, () => {
      if (!player.active) return;

      const radius = this.def.radius * this.shockwaveRadiusMultiplier;
      const damage = Math.round(this.def.damage * this.shockwaveDamageFraction);
      const now = scene.time.now;

      enemyGroup.getChildren().slice().forEach((enemy) => {
        if (!enemy?.active) return;
        const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
        if (dist > radius) return;

        if (damage > 0) DamageSystem.applyWeaponHit(enemy, damage, player);

        // direção radial (jogador -> inimigo), já normalizada — mesma
        const dirX = dist > 0 ? (enemy.x - player.x) / dist : 1;
        const dirY = dist > 0 ? (enemy.y - player.y) / dist : 0;
        enemy.applyKnockback(dirX, dirY, this.shockwaveKnockback, now, 220);
      });

      this._showShockwaveFx(scene, player, radius);
    });
  }

  // Segunda fase visual do Terremoto: anel alaranjado se expandindo bem
  _showShockwaveFx(scene, player, radius) {
    const wave = scene.add
      .circle(player.x, player.y, radius, TERREMOTO_SHOCKWAVE_COLOR, 0.24)
      .setDepth(18)
      .setScale(0.2);
    scene.tweens.add({
      targets: wave,
      scale: 1,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => wave.destroy()
    });

    this._spawnShockwaveShards(scene, player, radius);
    scene.cameras.main.shake(180, 0.008);
  }

  // Estilhaços de terra arremessados radialmente em todas as direções —
  _spawnShockwaveShards(scene, player, radius) {
    for (let i = 0; i < TERREMOTO_SHARD_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / TERREMOTO_SHARD_COUNT + Phaser.Math.FloatBetween(-0.15, 0.15);
      const dist = radius * Phaser.Math.FloatBetween(0.55, 1);
      const shard = scene.add
        .image(player.x, player.y, 'hit_fx')
        .setDepth(20)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(TERREMOTO_SHOCKWAVE_COLOR)
        .setScale(Phaser.Math.FloatBetween(0.32, 0.5))
        .setRotation(angle);
      scene.tweens.add({
        targets: shard,
        x: player.x + Math.cos(angle) * dist,
        y: player.y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.05,
        duration: Phaser.Math.Between(260, 380),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }
}
