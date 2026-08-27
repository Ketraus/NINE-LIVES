import DamageSystem from '../combat/DamageSystem.js';

// Fração do dano principal que cada acerto "avulso" da evolução "Corte
// Fantasma" (katana) causa — ver Weapon._applyStrayHits. Metade, pra ser
// um bônus de cobertura/alcance e não um segundo corte de graça no mesmo dano.
const STRAY_DAMAGE_FRACTION = 0.5;

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
      // acumula quem já foi acertado pelo(s) corte(s) reto(s) deste golpe
      // (1 a 8, dependendo das cópias de doubleStrike — ver abaixo) —
      // evolução "Corte Fantasma" (statMods.strayHits, ver abaixo) não
      // pode dar um segundo hit em quem já foi cortado
      const hitEnemies = new Set();
      this._fireLine(scene, player, enemyGroup, aim, range, damage, hitEnemies);

      // carta exclusiva "katana_double" (unlockAbility: doubleStrike): cada
      // cópia soma mais um par de cortes espaçado igualmente ao redor do
      // jogador — 1 cópia = 2 cortes (frente/trás, igual sempre foi), 2 =
      // 4 (cruz), 3 = 6, 4 cópias = 8 cortes a cada 45°, quase fechando
      // como uma estrela/lótus. totalCuts inclui o corte principal já
      // disparado acima (por isso o loop começa em i=1, não em i=0).
      const totalCuts = statMods.doubleStrikeStacks > 0 ? statMods.doubleStrikeStacks * 2 : 1;
      if (totalCuts > 1) {
        const angleStep = Phaser.Math.PI2 / totalCuts;
        for (let i = 1; i < totalCuts; i++) {
          const cutAim = aim.clone().rotate(angleStep * i);
          this._fireLine(scene, player, enemyGroup, cutAim, range, damage, hitEnemies);
        }
      }

      // evolução "Corte Fantasma" (Visão Aguçada, katana): chance de
      // também acertar inimigos fora da(s) faixa(s) acima, mas ainda numa
      // área ao redor do jogador — ver _applyStrayHits. null se a
      // evolução não foi obtida (WeaponManager só monta o objeto quando
      // runState.strayHitsMaxTargets > 0).
      if (statMods.strayHits) {
        this._applyStrayHits(scene, player, enemyGroup, damage, statMods.strayHits, hitEnemies);
      }
    } else {
      const aim = player.getAimDirection();
      const landedHit = this._fireArc(scene, player, enemyGroup, aim, range, damage);

      // evolução "Reflexos de Predador" (Visão Aguçada, punhos): chance
      // baixa a cada soco QUE REALMENTE ACERTOU alguém (soco no vazio não
      // rola nada) de deixar os inimigos em câmera lenta por um tempo
      // curto — ver src/systems/SlowmoSystem.js. null se a evolução não
      // foi obtida.
      if (landedHit && statMods.bulletTime && Math.random() < statMods.bulletTime.chance) {
        scene.slowmoSystem?.trigger(scene.time.now, statMods.bulletTime.durationMs);
        this._showBulletTimeFx(scene);
      }
    }
  }

  /**
   * Leque na direção do olhar — usado pelos punhos.
   * @returns {boolean} true se acertou pelo menos um inimigo (ver fire() —
   *   evolução "Reflexos de Predador" só rola a chance de câmera lenta em
   *   socos que realmente conectaram)
   */
  _fireArc(scene, player, enemyGroup, aim, range, damage) {
    const halfArc = Phaser.Math.DegToRad(this.def.arcDegrees) / 2;

    this._showArcFx(scene, player, aim, range);

    let landedHit = false;
    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const toEnemy = new Phaser.Math.Vector2(enemy.x - player.x, enemy.y - player.y);
      const dist = toEnemy.length();
      if (dist > range) return;

      const angleBetween = Math.abs(aim.angle() - toEnemy.angle());
      const normalizedAngle = Math.min(angleBetween, Phaser.Math.PI2 - angleBetween);
      if (normalizedAngle <= halfArc) {
        if (!this._hasLineOfSight(scene, player, enemy)) return;
        this._applyHit(scene, enemy, damage, player, aim);
        landedHit = true;
      }
    });
    return landedHit;
  }

  /**
   * Faixa reta na direção do olhar (só "pra frente", igual ao arco, mas
   * em formato de linha) — acerta tudo que estiver dentro do alcance e
   * perto o suficiente do eixo de mira (lineWidth). Usado pela katana.
   * É um retângulo, não um leque/explosão: a largura não varia com a
   * distância, então continua lendo como "corte reto atravessando a
   * fileira", só que mais longo/largo que antes pra pegar mais gente.
   */
  /**
   * @param {Set} [hitEnemies] - se passado, todo inimigo realmente acertado
   *   é adicionado aqui (ver fire() e _applyStrayHits — evita que a
   *   evolução "Corte Fantasma" dê um segundo hit em quem já foi cortado)
   */
  _fireLine(scene, player, enemyGroup, aim, range, damage, hitEnemies) {
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
      hitEnemies?.add(enemy);
      this._applyHit(scene, enemy, damage, player, aim);
    });
  }

  /**
   * Evolução "Corte Fantasma" (Visão Aguçada, katana): rola, pra cada
   * inimigo dentro de `def.radius` do jogador que NÃO foi acertado pela
   * faixa reta do corte (`hitEnemies`), a chance de também ser atingido —
   * até `def.maxTargets` acertos "avulsos" por golpe. Não é alcance
   * infinito (o raio é curto, pouco mais que o dobro do alcance normal da
   * katana) nem garantido (é uma chance por inimigo, não todos dentro do
   * raio são acertados de uma vez). Balanceamento: cada acerto avulso vale
   * só metade do dano do corte principal (STRAY_DAMAGE_FRACTION) — é um
   * bônus de alcance/cobertura, não um segundo corte "de graça".
   * @param {object} def - { chance, radius, maxTargets } (ver WeaponManager)
   * @param {Set} hitEnemies - quem já foi cortado neste golpe; também
   *   recebe cada inimigo acertado aqui, pra nunca ultrapassar maxTargets
   *   mesmo iterando o grupo inteiro
   */
  _applyStrayHits(scene, player, enemyGroup, damage, def, hitEnemies) {
    let struck = 0;
    const strayDamage = damage * STRAY_DAMAGE_FRACTION;

    enemyGroup.children.iterate((enemy) => {
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

  /**
   * Aplica o dano e, se o golpe realmente acertou, dispara o empurrão
   * (knockback) na direção `aim` do golpe — ver campo `knockback` em
   * data/weapons.js — e o tremor de câmera específico da arma, se houver
   * (def.cameraShake, hoje só nos punhos). O flash/"pop" de impacto no
   * inimigo em si é centralizado em DamageSystem.applyWeaponHit (ver
   * Enemy.playHitReaction), então toda arma/habilidade ganha o mesmo
   * feedback sem precisar chamar nada daqui.
   */
  _applyHit(scene, enemy, damage, player, aim) {
    const hit = DamageSystem.applyWeaponHit(enemy, damage, player, scene.time.now);
    if (hit) {
      if (this.def.cameraShake) {
        scene.cameras.main.shake(60, this.def.cameraShake);
      }
      if (this.def.knockback) {
        enemy.applyKnockback(aim.x, aim.y, this.def.knockback, scene.time.now);
      }
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

  /**
   * Visual de um acerto "avulso" da evolução Corte Fantasma: um flash
   * pequeno direto em cima do inimigo (diferente da faixa reta normal,
   * já que este hit não segue o eixo do corte) — deixa claro que aquele
   * inimigo específico foi pego "fora" do golpe.
   */
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

  /**
   * Visual de gatilho da evolução Reflexos de Predador: um flash rápido e
   * sutil na tela toda, só pra marcar o instante em que a câmera lenta
   * começou (o efeito em si — inimigos mais devagar — já é visível sozinho
   * o resto da duração, isto é só o "estalo" inicial).
   */
  _showBulletTimeFx(scene) {
    scene.cameras.main.flash(120, 60, 90, 160, false);
  }
}
