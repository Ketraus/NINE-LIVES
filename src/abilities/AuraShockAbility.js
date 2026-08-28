import DamageSystem from '../combat/DamageSystem.js';

// Amarelo elétrico — remete a "choque"/"sobrecarga" sem repetir o verde do
// Vórtice Turbo nem o vermelho do soco. Hardcoded aqui, mesmo padrão que as
// outras habilidades usam pros próprios FX (ver TornadoAbility/SlamAbility).
const AURA_COLOR = 0xffe066;

/**
 * Habilidade exclusiva da evolução "Sobrecarga" (Pelo Condutor evoluída,
 * carta "thorns_up_evo_sobrecarga"): uma aurinha de choque fixa ao redor
 * do jogador (sempre ativa, sem gatilho/condição — ao contrário do
 * Vórtice Turbo, que só nasce enquanto anda). Todo inimigo que estiver
 * dentro de def.radius toma def.damage a cada def.tickIntervalMs.
 *
 * É cumulativo com o dano de contato normal e com os espinhos
 * (runState.thornsDamage, aplicado em GameScene._buildCollisions quando o
 * inimigo encosta): a aura não substitui nada, só soma mais uma fonte de
 * dano contínuo enquanto o inimigo ficar perto.
 *
 * Mesma interface que as outras habilidades (update(time, player,
 * enemyGroup, scene)).
 */
export default class AuraShockAbility {
  /** @param {object} def - efeito de data/upgrades.js (type: "unlockAbility") */
  constructor(def) {
    this.def = def; // { tickIntervalMs, damage, radius }
    this.lastTickMs = 0;
    this.fx = null;
    // multiplicador do "aperto" ao acertar, por cima da escala do jogador
    // (ver update/_pulse) — problema do bug: antes o pulse resetava a
    // escala do fx pra (1,1) direto, ignorando player.scale, então em
    // COLOSSO (jogador maior) a aura "encolhia" de volta pro tamanho
    // normal a cada tick de dano.
    this._pulseMultiplier = 1;
  }

  update(time, player, enemyGroup, scene) {
    if (!this.fx) this._createFx(scene);

    this.fx.setPosition(player.x, player.y);
    this.fx.setVisible(!player.isDead);
    // acompanha o tamanho atual do jogador (setScale em Player.applySize —
    // COLOSSO é o único efeito que muda isso hoje) multiplicado pelo pulso
    // de acerto, em vez de um valor fixo. Assim a aura cresce/encolhe
    // junto com o personagem e nunca fica menor que ele.
    this.fx.setScale(player.scale * this._pulseMultiplier);
    if (player.isDead) return; // morto não eletrocuta ninguém

    if (time - this.lastTickMs >= this.def.tickIntervalMs) {
      this.lastTickMs = time;
      this._damageEnemiesInRange(player, enemyGroup, time);
    }
  }

  _damageEnemiesInRange(player, enemyGroup, time) {
    // raio de detecção também precisa crescer junto com o jogador, senão
    // o círculo visual (maior, em COLOSSO) mentiria sobre onde o dano
    // realmente acontece.
    const effectiveRadius = this.def.radius * player.scale;
    let hitSomeone = false;
    // snapshot: mesma razão do fix em SlamAbility/TornadoAbility/Weapon
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= effectiveRadius) {
        DamageSystem.applyWeaponHit(enemy, this.def.damage, player, time);
        hitSomeone = true;
      }
    });
    if (hitSomeone) this._pulse();
  }

  /** Anelzinho fino ao redor do jogador, com uma respiração leve de alpha. */
  _createFx(scene) {
    const radius = this.def.radius;
    this.fx = scene.add
      .circle(0, 0, radius, AURA_COLOR, 0.1)
      .setStrokeStyle(2, AURA_COLOR, 0.65)
      .setDepth(7);

    scene.tweens.add({
      targets: this.fx,
      alpha: { from: 0.55, to: 1 },
      duration: 240,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * Mesmo "aperto" das outras habilidades (TornadoAbility/Enemy) ao
   * acertar — mas em vez de mexer direto em fx.scale (que brigava com
   * player.scale, ver update()), anima só o multiplicador e deixa o
   * update() de cada frame recombinar os dois.
   */
  _pulse() {
    if (!this.fx?.scene) return;
    this.fx.scene.tweens.killTweensOf(this);
    this._pulseMultiplier = 1;
    this.fx.scene.tweens.add({
      targets: this,
      _pulseMultiplier: 1.18,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut'
    });
  }
}
