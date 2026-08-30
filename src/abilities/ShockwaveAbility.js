import DamageSystem from '../combat/DamageSystem.js';

// A onda reaproveita a textura hit_fx esticada (mesma técnica do laser
// evoluído do GatoDrone, ver DroneAbility._createBullet) em vez de gerar
// uma textura própria — cor quente, no mesmo tom do fxTint padrão dos
// punhos.
const SHOCKWAVE_COLOR = 0xffb199;
// Ângulo entre cada onda extra da salva, em graus — todas nascem no MESMO
// ponto (as mãos do jogador) e se abrem em leque a partir daí conforme
// viajam, "em cone" (ver _angleOffsets), não em linhas paralelas já
// afastadas na origem.
const SHOCKWAVE_SPREAD_DEG = 22;

/**
 * Habilidade exclusiva dos Punhos (carta "fists_shockwave"): a cada
 * this.def.cooldownMs (3s), dispara this.waveCount onda(s) de choque na
 * direção que o jogador está olhando, causando pouco dano a cada inimigo
 * atingido pelo caminho — dispara sozinha, não depende de socar ninguém.
 * Roda em paralelo ao ataque normal, com cooldown próprio (mesmo padrão
 * de SlamAbility), não passa por WeaponManager.
 *
 * Mesma interface que as outras habilidades (update(time, player,
 * enemyGroup, scene)).
 */
export default class ShockwaveAbility {
  /** @param {object} def - entrada de data/upgrades.js (type: "unlockAbility") */
  constructor(def) {
    this.def = def;
    this.lastMs = 0;
    this.waveCount = 1;
    this.group = null;
  }

  /**
   * Chamado a cada cópia extra da carta (até 4, ver data/upgrades.js
   * maxStacks) — em vez de outra instância disparando em paralelo no
   * mesmo cooldown, a MESMA habilidade passa a soltar mais uma onda por
   * disparo (mesmo padrão de ShurikenAbility.volleyCount).
   */
  restack() {
    this.waveCount += 1;
  }

  update(time, player, enemyGroup, scene) {
    if (!this.group) this._createGroup(scene, enemyGroup, player);
    if (time - this.lastMs < this.def.cooldownMs) return;
    this.lastMs = time;
    this._fire(scene, player);
  }

  /** Cria (uma única vez) o grupo físico das ondas e o overlap contra os
   * inimigos — mesmo padrão de ShurikenAbility._create. */
  _createGroup(scene, enemyGroup, player) {
    this.group = scene.physics.add.group();
    scene.physics.add.overlap(this.group, enemyGroup, (wave, enemy) => {
      // não atravessa: para no primeiro inimigo que acertar em vez de
      // seguir viajando e acertando mais gente pelo caminho (diferente
      // da Shuriken/laser do GatoDrone, que perfuram de propósito)
      if (!wave.active) return;

      const hit = DamageSystem.applyWeaponHit(enemy, wave.getData('damage'), player, scene.time.now);
      if (hit && this.def.knockback) {
        const dir = wave.getData('dir');
        enemy.applyKnockback(dir.x, dir.y, this.def.knockback, scene.time.now);
      }
      wave.destroy();
    });
    scene.mapManager?.addCollider(this.group, (wave) => wave.destroy());
  }

  /**
   * Dispara `this.waveCount` ondas TODAS DE UMA VEZ (sem stagger,
   * diferente da rajada da Shuriken) — todas nascendo no MESMO ponto (as
   * mãos do jogador), não espalhadas lado a lado na origem. O que varia
   * entre elas é o ÂNGULO de saída (ver _angleOffsets): a primeira sempre
   * reta no eixo da mira (o "meio"), e cada onda extra abre mais uma pro
   * lado (alternando direita/esquerda, ângulo crescendo a cada par —
   * mesmo padrão de Weapon._fireSword pro combo da katana). Como todas
   * partem do mesmo ponto mas com direções ligeiramente diferentes, elas
   * se AFASTAM conforme viajam — abrem "em leque/cone" a partir da
   * origem, não chegam já abertas.
   */
  _fire(scene, player) {
    const aim = player.getAimDirection();
    this._angleOffsets(this.waveCount).forEach((angleOffset) => {
      const dir = aim.clone().rotate(angleOffset);
      this._spawnWave(scene, player.x, player.y, dir);
    });
  }

  /** Ângulos (radianos) de cada onda da salva em relação à mira, todas
   * partindo do mesmo ponto — 1 onda = [0] (reto); a partir da 2ª,
   * alterna lado (direita/esquerda) com o desvio crescendo a cada par,
   * igual ao combo da katana (ver Weapon._fireSword: `side`/`angleOffset`). */
  _angleOffsets(count) {
    const step = Phaser.Math.DegToRad(SHOCKWAVE_SPREAD_DEG);
    const offsets = [];
    for (let i = 0; i < count; i++) {
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      offsets.push(step * side * Math.ceil(i / 2));
    }
    return offsets;
  }

  /** Uma única onda de choque, nascendo em (x, y) e viajando na direção
   * `dir` — ver _fire pra como x/y (sempre as mãos do jogador) e dir
   * (ângulo em leque) de cada onda da salva são calculados. Some sozinha
   * ao esgotar def.distance (calculado a partir de def.speed) ou ao
   * esbarrar numa parede do mapa (ver _createGroup). */
  _spawnWave(scene, x, y, dir) {
    const wave = this.group.create(x, y, 'hit_fx');
    wave.setDepth(16);
    wave.body.setAllowGravity(false);
    wave.body.setSize(this.def.width, this.def.width, true);
    wave.setRotation(dir.angle());
    // esticado tipo "onda": comprido no eixo do movimento, estreito na
    // perpendicular — mesma técnica do laser evoluído do GatoDrone
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
