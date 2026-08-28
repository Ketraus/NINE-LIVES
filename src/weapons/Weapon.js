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
 *  - "sword" (usado pela katana): uma sequência de golpes em arco na
 *    direção que o jogador está olhando — cada golpe usa o mesmo teste
 *    geométrico do "arc" (mesma sensação de "corte real ao redor do
 *    corpo"), só que maior e, com Corte Duplo, encadeado em combo em vez
 *    de espalhado em todas as direções (ver Weapon._fireSword).
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

    if (this.def.shape === 'sword') {
      this._fireSword(scene, player, enemyGroup, range, damage, statMods);
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
   * Katana: golpes em arco na direção horizontal da mira do jogador —
   * cortes de verdade ao redor do corpo (mesmo teste geométrico de
   * _fireArc), não mais uma faixa reta nem vários cortes espalhados em
   * todas as direções ao mesmo tempo.
   *
   * Corte Duplo (katana_double, statMods.doubleStrikeStacks) não soma
   * cortes ao redor do jogador: soma golpes SEQUENCIAIS, alternando um
   * pouco pra esquerda/direita do eixo de mira (def.comboOffsetDeg), com
   * um pequeno atraso entre eles (def.comboDelayMs) — sensação de combo
   * de espada, não de estrela de cortes. 1 cópia = 2 golpes em sequência,
   * até 4 cópias (teto de katana_double em upgrades.js) = 5 golpes.
   */
  _fireSword(scene, player, enemyGroup, range, damage, statMods) {
    const aim = player.getHorizontalAimDirection();
    const swings = statMods.doubleStrikeStacks > 0 ? statMods.doubleStrikeStacks + 1 : 1;
    const offsetDeg = this.def.comboOffsetDeg ?? 24;
    const delayMs = this.def.comboDelayMs ?? 90;
    // acumula quem já foi acertado por qualquer golpe deste combo — evita
    // que a evolução "Corte Fantasma" (ver abaixo) dê um segundo hit em
    // quem já foi cortado por um dos golpes em sequência
    const hitEnemies = new Set();
    // "Dança de Cortes" (evolução de Corte Duplo): só entra em jogo com o
    // combo completo (5 golpes) — os 4 primeiros ganham a cor vermelha
    // viva da evolução, o 5º é o golpe final ampliado (ver _swingStyle)
    const isDance = !!statMods.danceOfCuts;

    for (let i = 0; i < swings; i++) {
      // 1º golpe sempre reto no eixo de mira; os seguintes alternam
      // esquerda/direita (side) com o desvio crescendo a cada par (i.e.
      // 2º golpe já abre bem, 3º/4º abrem um pouco mais)
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
    // último golpe do combo, pra não "adiantar" o dano avulso antes dos
    // cortes principais acontecerem. null se a evolução não foi obtida.
    if (statMods.strayHits) {
      scene.time.delayedCall(delayMs * (swings - 1), () => {
        this._applyStrayHits(scene, player, enemyGroup, damage, statMods.strayHits, hitEnemies);
      });
    }
  }

  /**
   * Define a "roupagem" de cada golpe do combo da katana quando a
   * evolução "Dança de Cortes" está ativa: os cortes normais só trocam de
   * cor (vermelho vivo, def.danceCutTint); o golpe final (5º) também
   * cresce em área/arco, dura mais na tela e bate mais forte (def.danceFinisher).
   * Sem a evolução, devolve os valores neutros (visual/comportamento de
   * sempre, sem custo de dano/cooldown).
   */
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

  /**
   * Leque na direção do olhar — usado pelos punhos e por cada golpe do
   * combo da katana (ver _fireSword).
   * @param {Set} [hitEnemies] - se passado, todo inimigo realmente
   *   acertado é adicionado aqui (katana: evita segundo hit da evolução
   *   "Corte Fantasma" em quem já foi cortado)
   * @param {boolean} [useSwordFx] - true pros golpes da katana: troca o
   *   flash pequeno dos punhos por um corte em arco de verdade (ver
   *   _showSwordSwingFx)
   * @returns {boolean} true se acertou pelo menos um inimigo (ver fire() —
   *   evolução "Reflexos de Predador" só rola a chance de câmera lenta em
   *   socos que realmente conectaram)
   */
  _fireArc(scene, player, enemyGroup, aim, range, damage, hitEnemies, useSwordFx, options = {}) {
    const arcDegrees = options.arcDegreesOverride ?? this.def.arcDegrees;
    const halfArc = Phaser.Math.DegToRad(arcDegrees) / 2;

    if (useSwordFx) {
      this._showSwordSwingFx(scene, player, aim, range, halfArc, options);
    } else {
      this._showArcFx(scene, player, aim, range);
    }

    let landedHit = false;
    // snapshot: applyHit pode matar/remover do grupo e quebrar a iteração live
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
        // já aplicados acima, um estouro de partículas extra em cima de
        // quem foi atingido — ver _showFinisherImpactFx
        if (hit && options.isFinisher) this._showFinisherImpactFx(scene, enemy.x, enemy.y, options.tint);
        hitEnemies?.add(enemy);
        landedHit = true;
      }
    });
    return landedHit;
  }

  /**
   * Evolução "Corte Fantasma" (Visão Aguçada, katana): rola, pra cada
   * inimigo dentro de `def.radius` do jogador que NÃO foi acertado por
   * nenhum golpe do combo (`hitEnemies`), a chance de também ser atingido —
   * até `def.maxTargets` acertos "avulsos" por ataque. Não é alcance
   * infinito (o raio é curto, pouco mais que o dobro do alcance normal da
   * katana) nem garantido (é uma chance por inimigo, não todos dentro do
   * raio são acertados de uma vez). Balanceamento: cada acerto avulso vale
   * só metade do dano do corte principal (STRAY_DAMAGE_FRACTION) — é um
   * bônus de alcance/cobertura, não um golpe "de graça".
   * @param {object} def - { chance, radius, maxTargets } (ver WeaponManager)
   * @param {Set} hitEnemies - quem já foi cortado neste ataque; também
   *   recebe cada inimigo acertado aqui, pra nunca ultrapassar maxTargets
   *   mesmo iterando o grupo inteiro
   */
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
   * (def.cameraShake, hoje punhos e katana). O flash/"pop" de impacto no
   * inimigo em si é centralizado em DamageSystem.applyWeaponHit (ver
   * Enemy.playHitReaction), então toda arma/habilidade ganha o mesmo
   * feedback sem precisar chamar nada daqui.
   */
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
   * Visual da katana: um corte em arco de verdade — uma fatia desenhada
   * com Graphics (não um retângulo/flash reaproveitado), nascendo colado
   * no jogador e cobrindo exatamente a área que o teste de hit usa
   * (mesmo `range`/`halfArc` de _fireArc), com uma borda mais clara
   * acompanhando o fio da lâmina pra reforçar a leitura do golpe.
   */
  _showSwordSwingFx(scene, player, aim, range, halfArc, options = {}) {
    const baseAngle = aim.angle();
    const tint = options.tint ?? this.def.fxTint ?? 0xcfe8ff;
    const durationMult = options.fxDurationMultiplier ?? 1;
    // golpe final da Dança de Cortes: fatia mais opaca, borda mais grossa
    // e expande mais — reforça que é o corte "grande" da sequência
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

  /**
   * Impacto extra do golpe final da "Dança de Cortes": um estouro de
   * estilhaços na cor do combo em cima de cada inimigo atingido, além do
   * knockback/screen shake já ampliados em _applyHit — reforça a
   * sensação de "golpe de misericórdia" no fim da sequência.
   */
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

  /**
   * Visual de um acerto "avulso" da evolução Corte Fantasma: um flash
   * pequeno direto em cima do inimigo (diferente do arco do golpe
   * principal, já que este hit não segue a direção da mira) — deixa
   * claro que aquele inimigo específico foi pego "fora" do golpe.
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
