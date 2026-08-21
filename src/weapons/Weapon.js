import DamageSystem from '../combat/DamageSystem.js';

/**
 * Arma melee (punhos, katana, ...): em vez de uma hitbox física, checa
 * geometricamente quais inimigos estão na "área do golpe" no momento do
 * ataque. Dois formatos suportados via `def.shape`:
 *  - "arc" (padrão, usado pelos punhos): um leque na direção que o
 *    jogador está olhando — curto alcance, sensação de soco.
 *  - "line" (usado pela katana): uma faixa reta na direção que o jogador
 *    está olhando, mais larga e mais longa que o "arc" — corte que
 *    atravessa vários inimigos alinhados numa direção só.
 * "soco" vs "katana" continua sendo uma questão de dados em
 * data/weapons.js, não de duas classes de código.
 *
 * Implementa a mesma interface que RangedWeapon (fire(scene, player,
 * enemyGroup, statMods)) — é por isso que WeaponManager consegue
 * escolher entre as duas sem saber o que tem "dentro" de cada uma.
 */
export default class Weapon {
  /** @param {object} def - entrada de data/weapons.js */
  constructor(def) {
    this.def = def;
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {Player} player
   * @param {Phaser.Physics.Arcade.Group} enemyGroup
   * @param {{damageMultiplier:number, rangeMultiplier:number}} statMods
   */
  fire(scene, player, enemyGroup, statMods) {
    const range = this.def.range * (1 + statMods.rangeMultiplier);
    const damage = this.def.damage * (1 + statMods.damageMultiplier);

    if (this.def.shape === 'line') {
      // katana: nunca ataca em diagonal/vertical, só reto pro lado que
      // o jogador estava olhando por último (ver Player.getHorizontalAimDirection)
      const aim = player.getHorizontalAimDirection();
      this._fireLine(scene, player, enemyGroup, aim, range, damage);

      // carta exclusiva "katana_double" (unlockAbility: doubleStrike):
      // repete o mesmo corte espelhado pro lado oposto, no mesmo golpe
      if (statMods.doubleStrike) {
        this._fireLine(scene, player, enemyGroup, aim.clone().negate(), range, damage);
      }
    } else {
      const aim = player.getAimDirection();
      this._fireArc(scene, player, enemyGroup, aim, range, damage);
    }
  }

  /** Leque na direção do olhar — usado pelos punhos. */
  _fireArc(scene, player, enemyGroup, aim, range, damage) {
    const halfArc = Phaser.Math.DegToRad(this.def.arcDegrees) / 2;

    this._showArcFx(scene, player, aim, range);

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const toEnemy = new Phaser.Math.Vector2(enemy.x - player.x, enemy.y - player.y);
      const dist = toEnemy.length();
      if (dist > range) return;

      const angleBetween = Math.abs(aim.angle() - toEnemy.angle());
      const normalizedAngle = Math.min(angleBetween, Phaser.Math.PI2 - angleBetween);
      if (normalizedAngle <= halfArc) {
        if (!this._hasLineOfSight(scene, player, enemy)) return;
        this._applyHit(scene, enemy, damage, player);
      }
    });
  }

  /**
   * Faixa reta na direção do olhar (só "pra frente", igual ao arco, mas
   * em formato de linha) — acerta tudo que estiver dentro do alcance e
   * perto o suficiente do eixo de mira (lineWidth). Usado pela katana.
   */
  _fireLine(scene, player, enemyGroup, aim, range, damage) {
    const halfWidth = (this.def.lineWidth ?? 26) / 2;

    this._showLineFx(scene, player, aim, range);

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const toEnemy = new Phaser.Math.Vector2(enemy.x - player.x, enemy.y - player.y);

      // distância ao longo do eixo de mira; negativa = "atrás" do jogador, não conta
      const axialDist = toEnemy.dot(aim);
      if (axialDist < 0 || axialDist > range) return;

      // distância perpendicular ao eixo (o quão "fora da faixa" o inimigo está)
      const perpX = toEnemy.x - aim.x * axialDist;
      const perpY = toEnemy.y - aim.y * axialDist;
      const perpDist = Math.hypot(perpX, perpY);
      if (perpDist > halfWidth) return;

      if (!this._hasLineOfSight(scene, player, enemy)) return;
      this._applyHit(scene, enemy, damage, player);
    });
  }

  /**
   * Amostra pontos entre atacante e alvo checando a layer de paredes do
   * mapa (exposta como scene.mapManager.wallsLayer) — evita que golpes
   * melee atravessem paredes. Se não houver mapa (não deveria acontecer
   * no jogo real), assume visão livre em vez de travar o ataque.
   */
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

  /** Aplica o dano e, se o golpe realmente acertou, dispara a reação visual de impacto. */
  _applyHit(scene, enemy, damage, player) {
    const hit = DamageSystem.applyWeaponHit(enemy, damage, player);
    if (hit) this._showHitReaction(scene, enemy);
  }

  /**
   * Flash branco rápido no inimigo atingido — dá sensação de impacto em
   * qualquer arma melee. Punhos, além disso, tremem levemente a câmera
   * (def.cameraShake) pra reforçar o "peso" do soco.
   */
  _showHitReaction(scene, enemy) {
    if (!enemy.active) return;
    enemy.setTintFill(0xffffff);
    scene.time.delayedCall(70, () => {
      if (enemy.active) enemy.setTint(enemy.def.color);
    });
    if (this.def.cameraShake) {
      scene.cameras.main.shake(60, this.def.cameraShake);
    }
  }

  /** Visual do soco: flash curto e pequeno, ofertado à frente do jogador. */
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

  /**
   * Visual da katana: uma faixa deslocada pra frente do jogador (não
   * centrada nele) e orientada de forma fixa na direção do olhar — sem
   * girar, é só um corte reto numa direção só, igual aos punhos.
   */
  _showLineFx(scene, player, aim, range) {
    const width = this.def.lineWidth ?? 26;
    const fxX = player.x + aim.x * range * 0.5;
    const fxY = player.y + aim.y * range * 0.5;

    const fx = scene.add
      .image(fxX, fxY, 'hit_fx')
      .setDepth(20)
      .setDisplaySize(range, width)
      .setRotation(aim.angle())
      .setAlpha(0.9)
      .setTint(this.def.fxTint ?? 0xffffff);

    scene.tweens.add({
      targets: fx,
      alpha: 0,
      scaleX: fx.scaleX * 1.15,
      duration: this.def.fxDurationMs ?? 220,
      onComplete: () => fx.destroy()
    });
  }
}
