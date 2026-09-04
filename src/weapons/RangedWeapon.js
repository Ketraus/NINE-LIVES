import DamageSystem from '../combat/DamageSystem.js';

const DEFAULT_PROJECTILE_SPEED = 380;
const DEFAULT_PROJECTILE_LIFETIME_MS = 1200;
// cor padrão do projétil quando a arma não define "projectileTint" — azul
// elétrico, mesma família de cor já usada em outros acentos do jogo (ex:
// barra de loading, fxTint da katana)
const DEFAULT_PROJECTILE_TINT = 0x4fd1ff;
// tamanho (em px) da textura do "raio" gerada em _ensureBulletTexture —
// desenhada já no tamanho final pra evitar reamostragem (o jogo usa
// pixelArt: true, então redimensionar uma textura pequena fica granulado)
const LASER_TEX_WIDTH = 20;
const LASER_TEX_HEIGHT = 8;

/**
 * Arma à distância (pistola, ...): mira automaticamente no inimigo mais
 * próximo dentro do alcance e dispara um projétil físico de verdade
 * (sprite com velocidade, não um "raycast" instantâneo como o melee).
 *
 * Implementa a mesma interface que Weapon.js (fire(scene, player,
 * enemyGroup, statMods)) — é por isso que WeaponManager não precisa
 * saber se está lidando com um soco ou uma bala.
 *
 * Diferença de contrato: fire() aqui pode retornar `false` quando não
 * há nenhum inimigo no alcance. WeaponManager usa isso pra NÃO gastar o
 * cooldown à toa — assim que um inimigo entra no alcance, a pistola
 * atira imediatamente, em vez de ficar "recarregando" enquanto mirava
 * no vazio.
 */
// quantos "saltos" pra um novo inimigo a evolução "Instinto Caçador"
// (range_up_evo_hunter_instinct, ver data/upgrades.js) permite por tiro.
// Só 1 por enquanto (acerta o primeiro, salta pro segundo mais próximo
// DELE) — se um dia quisermos mais saltos, isto vira parte do efeito da
// carta em vez de uma constante fixa aqui.
const CHAIN_SHOT_JUMPS = 1;

// ---- "Fragmentação" (pistol_fragmentation, ver data/upgrades.js) ----
// Cada projétil do leque causa uma fração do dano normal (mas maior que
// 1x: com o dano base da pistola em 5, 3 balas × (5 × 4/3) = 20 se as 3
// conectarem no mesmo alvo) e viaja bem menos longe (lifetime reduzido em
// vez de mexer no alcance de MIRA, que continua o mesmo pra achar o
// alvo). Ângulo entre projéteis adjacentes do leque — mesmo padrão "em
// cone a partir da origem" do ShockwaveAbility._angleOffsets (nascem
// todos no mesmo ponto, direções levemente diferentes, leque mais fechado
// que a v1 pra não espalhar tanto).
const FRAGMENTATION_DAMAGE_FRACTION = 4 / 3;
const FRAGMENTATION_LIFETIME_FRACTION = 0.55;
const FRAGMENTATION_SPREAD_DEG = 7;

// ---- "SMARTSHOT" (pistol_fragmentation_evo_smartshot) ----
// Ponto do voo (fração do lifetime total da bala) em que uma bala que
// ainda não acertou ninguém ganha a "segunda chance": procura o inimigo
// mais próximo dentro de chainRange e muda de direção pra ele; sem
// ninguém por perto, segue reto (nada muda).
const SMART_SHOT_TRIGGER_FRACTION = 0.5;

export default class RangedWeapon {
  /** @param {object} def - entrada de data/weapons.js (type: "ranged") */
  constructor(def) {
    this.def = def;
    this.bulletGroup = null; // criado no primeiro fire() (precisa da scene)
  }

  fire(scene, player, enemyGroup, statMods) {
    const range = this.def.range * (1 + statMods.rangeMultiplier);
    const target = this._findNearestEnemy(player.x, player.y, enemyGroup, range);
    if (!target) return false; // sem alvo à vista: não atira, não gasta cooldown

    this._ensureBulletGroup(scene, player, enemyGroup);
    // toca uma vez por disparo, mesmo na Fragmentação (leque de várias
    // balas saindo do mesmo tiro) — não uma vez por bala
    scene.sound.play('sfx_pistol', { volume: 0.6 });

    const damage = this.def.damage * (1 + statMods.damageMultiplier);
    const dir = new Phaser.Math.Vector2(target.x - player.x, target.y - player.y).normalize();

    // "Fragmentação": em vez de 1 bala normal, dispara pelletCount balas
    // mais fracas num leque em volta de `dir` (mira continua no inimigo
    // mais próximo, só abre a saída em várias direções a partir dali).
    // Sem a carta, pelletCount vem null/0 e cai no tiro único de sempre.
    if (statMods.fragmentation) {
      this._fireFragmentationVolley(scene, player, enemyGroup, dir, damage, statMods);
    } else {
      this._spawnBullet(scene, player, enemyGroup, dir, damage, statMods, {});
    }

    return true;
  }

  /**
   * Leque de projéteis da "Fragmentação" (statMods.fragmentation.pelletCount
   * — 1 cópia = 3, cada cópia extra soma +1, ver WeaponManager). Cada bala
   * causa FRAGMENTATION_DAMAGE_FRACTION do dano normal e vive bem menos
   * tempo (FRAGMENTATION_LIFETIME_FRACTION), então acerta de perto — daí a
   * sensação de escopeta. Ângulos em leque a partir de `dir`, mesmo padrão
   * de ShockwaveAbility._angleOffsets (1ª reta, demais alternando lado).
   */
  _fireFragmentationVolley(scene, player, enemyGroup, dir, damage, statMods) {
    const pelletCount = statMods.fragmentation.pelletCount;
    const pelletDamage = damage * FRAGMENTATION_DAMAGE_FRACTION;
    const step = Phaser.Math.DegToRad(FRAGMENTATION_SPREAD_DEG);

    for (let i = 0; i < pelletCount; i++) {
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      const angleOffset = step * side * Math.ceil(i / 2);
      const pelletDir = dir.clone().rotate(angleOffset);
      this._spawnBullet(scene, player, enemyGroup, pelletDir, pelletDamage, statMods, {
        lifetimeMs: DEFAULT_PROJECTILE_LIFETIME_MS * FRAGMENTATION_LIFETIME_FRACTION,
        scale: 0.8
      });
    }
  }

  /**
   * Cria e lança um único projétil físico — usado tanto pelo tiro único
   * padrão quanto por cada bala do leque da Fragmentação (ver
   * _fireFragmentationVolley). `overrides.lifetimeMs`/`overrides.scale`
   * deixam a Fragmentação encolher o alcance/tamanho de cada bala sem
   * mexer no tiro normal.
   */
  _spawnBullet(scene, player, enemyGroup, dir, damage, statMods, overrides) {
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    const tint = this.def.projectileTint ?? DEFAULT_PROJECTILE_TINT;
    const textureKey = this._ensureBulletTexture(scene, tint);
    const lifetimeMs = overrides.lifetimeMs ?? DEFAULT_PROJECTILE_LIFETIME_MS;

    const bullet = this.bulletGroup.create(player.x, player.y, textureKey);
    bullet
      .setDepth(15)
      .setScale((this.def.projectileScale ?? 1) * (overrides.scale ?? 1))
      // ADD faz o raio "brilhar" contra o fundo em vez de só colar uma
      // textura em cima — é o que dá a sensação de laser/energia
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(dir.angle());
    bullet.body.setAllowGravity(false);
    // a textura desenhada é bem mais comprida que o hitbox real do tiro
    // (é só o "rastro" visual do raio) — encolhe e centraliza a hitbox
    // pra manter o mesmo tamanho de acerto de antes, senão a bala passaria
    // a acertar inimigos de mais longe do que deveria
    bullet.body.setSize(6, 4, true);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    // brilho extra em volta do sprite (some sozinho se o navegador cair
    // pra renderer Canvas, onde preFX não existe — por isso o guard)
    if (bullet.preFX) {
      bullet.preFX.addGlow(tint, 0, 1.5, false, 0.2, 6);
    }
    bullet.setData('damage', damage);
    // guardado pra empurrar o inimigo na hora do impacto (ver knockback
    // em _ensureBulletGroup) — mesma direção que a bala está viajando
    bullet.setData('dirX', dir.x);
    bullet.setData('dirY', dir.y);
    // inimigos já acertados por ESTE projétil (o próprio + qualquer salto
    // da "Instinto Caçador") — evita re-acertar o mesmo alvo enquanto a
    // bala ainda está sobreposta a ele, e evita saltar de volta pra quem
    // já foi atingido
    bullet.setData('hitEnemies', []);
    // quantos saltos pra um novo inimigo esta bala ainda pode dar; range
    // do salto usa o mesmo alcance (já com rangeMultiplier) do tiro em si,
    // já que a evolução parte justamente de Visão Aguçada
    bullet.setData('chainJumpsLeft', statMods.chainShot ? CHAIN_SHOT_JUMPS : 0);
    bullet.setData('chainRange', this.def.range * (1 + statMods.rangeMultiplier));

    // "SMARTSHOT": a meio caminho do tempo de vida, se a bala ainda não
    // acertou ninguém, dá uma última chance de mirar em quem estiver por
    // perto em vez de simplesmente ir embora — ver _trySmartRetarget.
    if (statMods.smartShot) {
      const triggerMs = lifetimeMs * SMART_SHOT_TRIGGER_FRACTION;
      scene.time.delayedCall(triggerMs, () => this._trySmartRetarget(bullet, enemyGroup));
    }

    // projétil não deve viver pra sempre caso erre todo mundo
    scene.time.delayedCall(lifetimeMs, () => bullet.destroy());
  }

  /**
   * "SMARTSHOT" (evolução de Fragmentação): dá à bala uma segunda chance
   * de mirar em alguém antes de sumir sem acertar nada. Só mexe em balas
   * que ainda estão vivas e que ainda não acertaram ninguém (hitEnemies
   * vazio) — uma bala que já conectou segue seu curso normal (ou seu
   * salto normal de "Instinto Caçador", se houver). Sem inimigo dentro de
   * chainRange, não faz nada: a bala continua reto, como sempre.
   */
  _trySmartRetarget(bullet, enemyGroup) {
    if (!bullet.active) return;
    if (bullet.getData('hitEnemies').length > 0) return;

    const nearest = this._findNearestEnemy(bullet.x, bullet.y, enemyGroup, bullet.getData('chainRange'));
    if (!nearest) return;
    this._retarget(bullet, nearest);
  }

  /**
   * Desenha (uma única vez por cor, com Graphics + generateTexture) a
   * textura do "raio" usado como projétil — uma cápsula alongada com
   * halo em volta e um núcleo quase branco na ponta, em vez de reusar o
   * hit_fx (bolinha redonda de efeito de impacto) tingido de amarelo.
   * Cacheada em scene.textures, então só é gerada de fato no primeiro
   * tiro de cada cor de projétil.
   */
  _ensureBulletTexture(scene, tint) {
    const key = `fx_laser_bolt_${tint.toString(16)}`;
    if (scene.textures.exists(key)) return key;

    const w = LASER_TEX_WIDTH;
    const h = LASER_TEX_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;

    const g = scene.add.graphics();

    // halo externo — bem suave, é o que lê como "brilho" do raio à distância
    g.fillStyle(tint, 0.16);
    g.fillEllipse(cx, cy, w, h);
    g.fillStyle(tint, 0.32);
    g.fillEllipse(cx, cy, w * 0.72, h * 0.6);

    // corpo do raio: cápsula alongada apontando pra frente (direção +X,
    // depois rotacionada em fire() conforme a direção real do tiro)
    g.fillStyle(tint, 0.95);
    g.fillRoundedRect(cx - w * 0.4, cy - h * 0.16, w * 0.8, h * 0.32, h * 0.16);

    // núcleo quase branco — "ponto quente" na frente do disparo
    g.fillStyle(0xffffff, 0.95);
    g.fillRoundedRect(cx - w * 0.3, cy - h * 0.09, w * 0.55, h * 0.18, h * 0.09);

    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  /** Overlap bala x inimigos, e colisão bala x paredes, registrados uma única vez (não a cada tiro). */
  _ensureBulletGroup(scene, player, enemyGroup) {
    if (this.bulletGroup) return;
    this.bulletGroup = scene.physics.add.group();
    scene.physics.add.overlap(this.bulletGroup, enemyGroup, (bullet, enemy) => {
      const hitEnemies = bullet.getData('hitEnemies');
      if (hitEnemies.includes(enemy)) return; // mesmo alvo, bala ainda sobreposta a ele

      const hit = DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player, scene.time.now);
      if (!hit) return; // desviou/já morreu: bala segue intacta, sem contar como impacto

      hitEnemies.push(enemy);
      if (this.def.knockback) {
        enemy.applyKnockback(bullet.getData('dirX'), bullet.getData('dirY'), this.def.knockback, scene.time.now);
      }

      // "Instinto Caçador": em vez de destruir a bala aqui, procura o
      // inimigo mais próximo DO INIMIGO QUE ACABOU DE SER ATINGIDO (não
      // do player) e redireciona o projétil pra ele — é um salto pro
      // próximo alvo, não um "atravessar e continuar reto"
      const jumpsLeft = bullet.getData('chainJumpsLeft');
      if (jumpsLeft > 0) {
        const nextTarget = this._findNearestEnemy(enemy.x, enemy.y, enemyGroup, bullet.getData('chainRange'), hitEnemies);
        if (nextTarget) {
          this._retarget(bullet, nextTarget);
          bullet.setData('chainJumpsLeft', jumpsLeft - 1);
          return;
        }
      }

      bullet.destroy();
    });
    // reaproveita o mapManager que a GameScene já monta — bala não deve
    // atravessar parede, então destrói ao colidir com a layer de paredes.
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  /** Reaponta uma bala já em voo pro alvo dado, sem recriar o sprite. */
  _retarget(bullet, target) {
    const dir = new Phaser.Math.Vector2(target.x - bullet.x, target.y - bullet.y).normalize();
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setRotation(dir.angle());
    bullet.setData('dirX', dir.x);
    bullet.setData('dirY', dir.y);
  }

  /**
   * @param {number} originX/originY - de onde medir a distância (player no
   *   tiro inicial, o inimigo recém-atingido no salto da "Instinto Caçador")
   * @param {Array} [exclude] - inimigos a ignorar (usado no salto, pra não
   *   voltar pro alvo que a bala acabou de atingir)
   */
  _findNearestEnemy(originX, originY, enemyGroup, range, exclude = []) {
    let nearest = null;
    let nearestDist = range;

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      if (exclude.includes(enemy)) return;
      const dist = Phaser.Math.Distance.Between(originX, originY, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    });

    return nearest;
  }
}
