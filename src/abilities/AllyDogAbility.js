import DamageSystem from '../combat/DamageSystem.js';
import AllyDog from '../entities/AllyDog.js';

const FOLLOW_STOP_DIST = 50; // não fica colado no jogador, dá um respiro visual

// Posição de "escolta" de cada cópia relativa ao jogador — até 3 cachorros
// (carta Purificação, maxStacks: 3 em data/upgrades.js) se espalham em vez
// de ficar todos empilhados no mesmo pixel atrás do jogador.
const FORMATION_OFFSETS = [
  { x: -26, y: 20 },
  { x: -44, y: -8 },
  { x: -4, y: 34 }
];

// Posição de escolta do Cyberus já fundido (1 cachorro só, maior) — mais
// central que os offsets de formação acima, que foram pensados pra
// espalhar 3 cachorros pequenos.
const CYBERUS_OFFSET = { x: -34, y: 6 };

// Visual da poça de chamas azuis da granada (1ª cabeça do Cyberus,
// evolução "Cyberus" — dog_purify_evo_cyberus). Fica aqui (não em
// data/upgrades.js) por ser puramente estético, mesmo padrão do
// TORNADO_COLOR em TornadoAbility.js.
const FLAME_COLOR = 0x33bbff;
const FLAME_FADE_OUT_RATIO = 0.35;
const FLAME_FADE_BLINK_INTERVAL_MS = 90;

// Projétil da granada em voo (arremesso de verdade: sai do cachorro, viaja
// pelo ar, e só explode — cria a poça de chamas — ao ENCOSTAR num inimigo
// ou ao terminar o trajeto). Puramente estético/timing, por isso também
// fica aqui e não em data/upgrades.js.
const GRENADE_PROJECTILE_SPEED = 480; // px/s — mais rápido que o cachorro anda, é um arremesso
const GRENADE_PROJECTILE_RADIUS = 7;
const GRENADE_HIT_RADIUS = 20; // raio de detecção em voo: qualquer inimigo que encostar aqui detona a granada
const GRENADE_ARC_HEIGHT = 18; // "salto" visual do arremesso — puramente estético, offset renderizado em y
const GRENADE_MIN_TRAVEL_MS = 150;
const GRENADE_MAX_TRAVEL_MS = 900;

/**
 * Habilidade da carta base épica "Purificação" (dog_purify): nasce um
 * cachorro aliado ao lado do jogador que persiste pro resto da run. Mesma
 * interface que SlamAbility/DroneAbility (update(time, player, enemyGroup,
 * scene)) — é o que permite AbilityManager tratar ela igual às outras,
 * sem precisar saber o que tem "dentro" dela.
 *
 * Comportamento simples de propósito ("por enquanto", como pedido):
 *  - se houver algum inimigo dentro de def.engageRadius, persegue o mais
 *    próximo e causa dano de contato nele (reaproveita DamageSystem.
 *    applyContactDamage, o mesmo mecanismo que os inimigos usam contra o
 *    jogador, só que invertido: aqui o cachorro é o atacante).
 *  - senão, segue o jogador a uma distância curta.
 * O dano do cachorro NÃO conta pra "Sanguessuga" (lifesteal) — ele é um
 * aliado próprio, com dano próprio, não uma extensão do jogador (ao
 * contrário de espinhos/soco/drone, que já eram habilidades do próprio
 * jogador antes desta carta existir).
 */
export default class AllyDogAbility {
  /**
   * @param {object} def - entrada de data/upgrades.js (type: "unlockAbility")
   * @param {number} [formationIndex] - 0 pro 1º cachorro, 1 pro 2º, etc.
   *   (ver AbilityManager._unlock) — define o offset de escolta usado.
   */
  constructor(def, formationIndex = 0) {
    this.def = def;
    this.dog = null;
    this.offset = FORMATION_OFFSETS[formationIndex % FORMATION_OFFSETS.length];

    // 1ª cabeça do Cyberus (granada), ligada por upgrade() quando a
    // evolução "Cyberus" é confirmada — ver AbilityManager._upgrade /
    // RunManager effect "upgradeAbility". Sem ela, comportamento de
    // sempre (só perseguir/contato).
    this.grenadeDef = null;
    this.lastGrenadeMs = 0;
    this.flameZones = []; // { x, y, spawnMs, lastTickMs, fx }
    this.grenadesInFlight = []; // { fx, startX, startY, targetX, targetY, startMs, durationMs }
  }

  update(time, player, enemyGroup, scene) {
    if (!this.dog) this.dog = new AllyDog(scene, player.x, player.y);
    if (!this.dog.active) return;

    const target = this._findNearestEnemy(enemyGroup);
    if (target) {
      this.dog.moveToward(target, this.def.speed);
      const dist = Phaser.Math.Distance.Between(this.dog.x, this.dog.y, target.x, target.y);
      if (dist <= this.def.contactRange) {
        DamageSystem.applyContactDamage(this.dog, target, this.def.damage, this.def.cooldownMs, time);
      }
    } else {
      this._followPlayer(player);
    }

    if (this.grenadeDef) this._updateGrenade(time, target, enemyGroup, scene);
  }

  /** Liga a 1ª cabeça do Cyberus (granada) e aplica o visual de fusão
   *  (cachorro maior e cinza) nesta cópia — chamado só na instância
   *  sobrevivente, ver mergeOnUpgrade abaixo. */
  upgrade(def) {
    this.grenadeDef = def;
    this.dog?.becomeCyberus();
    this.offset = CYBERUS_OFFSET;
  }

  /** Extension point lido por AbilityManager._upgrade: quando "Purificação"
   *  evolui pra Cyberus, as até-3 AllyDogAbility ativas (uma por cópia)
   *  precisam virar UM cachorro só, maior e cinza — a fusão visual dos 3
   *  cachorros num Cyberus, em vez de 3 cachorros ciano soltos como era
   *  antes desta correção. Mantém a primeira instância (com seu AllyDog já
   *  existente) como sobrevivente, destrói o AllyDog das outras e as
   *  remove — AbilityManager troca `this.active` pelo array devolvido
   *  aqui. Cabeças 2 e 3 do Cyberus ficam pra depois: por ora ele segue
   *  sendo controlado por esta mesma AllyDogAbility, só com o grenadeDef
   *  ligado. */
  static mergeOnUpgrade(instances, def) {
    const [survivor, ...extras] = instances;

    extras.forEach((ability) => {
      ability.flameZones.forEach((zone) => ability._destroyFlameFx(zone.fx));
      ability.grenadesInFlight.forEach((g) => g.fx.destroy());
      ability.dog?.destroy();
    });

    survivor.upgrade(def);
    return [survivor];
  }

  /** A cada grenadeCooldownMs, se houver um inimigo à vista dentro de
   *  grenadeRange, arremessa a granada nele — o projétil viaja pelo ar e só
   *  explode (cria a poça de chamas azuis) ao encostar num inimigo ou ao
   *  fim do trajeto, ver _advanceGrenadesInFlight/_launchGrenade. A poça
   *  causa dano contínuo a quem entrar/ficar dentro dela — mesmo padrão de
   *  zona persistente que TornadoAbility usa. */
  _updateGrenade(time, target, enemyGroup, scene) {
    this._advanceFlameZones(time, enemyGroup);
    this._advanceGrenadesInFlight(time, enemyGroup, scene);

    if (!target || time - this.lastGrenadeMs < this.grenadeDef.grenadeCooldownMs) return;
    const dist = Phaser.Math.Distance.Between(this.dog.x, this.dog.y, target.x, target.y);
    if (dist > this.grenadeDef.grenadeRange) return;

    this.lastGrenadeMs = time;
    this._launchGrenade(scene, target.x, target.y, time);
  }

  /** Cria o projétil visual (bolinha) que sai do cachorro e viaja em linha
   *  reta até o ponto mirado (com um leve arco pra "ler" como arremesso,
   *  não deslizamento). A duração escala com a distância, dentro de um
   *  teto mín/máx pra não ficar nem instantâneo nem eterno em alcances
   *  extremos. A explosão em si só acontece em _advanceGrenadesInFlight,
   *  quando o projétil encosta em alguém ou termina o trajeto. */
  _launchGrenade(scene, targetX, targetY, time) {
    const startX = this.dog.x;
    const startY = this.dog.y;
    const dist = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
    const durationMs = Phaser.Math.Clamp(
      (dist / GRENADE_PROJECTILE_SPEED) * 1000,
      GRENADE_MIN_TRAVEL_MS,
      GRENADE_MAX_TRAVEL_MS
    );

    const fx = scene.add
      .circle(startX, startY, GRENADE_PROJECTILE_RADIUS, FLAME_COLOR, 0.95)
      .setStrokeStyle(2, 0xffffff, 0.7)
      .setDepth(12); // acima do cachorro (11)

    this.grenadesInFlight.push({ fx, startX, startY, targetX, targetY, startMs: time, durationMs });
  }

  /** Move cada granada em voo (interpolação manual, não Phaser.tweens, pra
   *  poder checar contato com inimigos a cada frame) e detona a que
   *  encostar em algum inimigo — ou, se não encostar em ninguém, a que
   *  completar o trajeto até o ponto mirado originalmente. */
  _advanceGrenadesInFlight(time, enemyGroup, scene) {
    this.grenadesInFlight = this.grenadesInFlight.filter((g) => {
      const progress = Math.min((time - g.startMs) / g.durationMs, 1);
      g.fx.x = Phaser.Math.Linear(g.startX, g.targetX, progress);
      // arco: sobe no meio do trajeto e volta a "aterrissar" no fim —
      // puramente visual, offset de y por cima da linha reta
      g.fx.y = Phaser.Math.Linear(g.startY, g.targetY, progress) - Math.sin(progress * Math.PI) * GRENADE_ARC_HEIGHT;

      const hitEnemy = this._findEnemyNear(g.fx.x, g.fx.y, GRENADE_HIT_RADIUS, enemyGroup);
      if (!hitEnemy && progress < 1) return true; // ainda em voo, sem ninguém no caminho

      const explodeX = g.fx.x;
      const explodeY = g.fx.y;
      g.fx.destroy();
      this._explodeGrenade(scene, explodeX, explodeY, time);
      return false;
    });
  }

  /** Cria a poça de chamas persistente no ponto de detonação — chamado só
   *  daqui pra frente por _advanceGrenadesInFlight, nunca direto de
   *  _updateGrenade (a explosão agora depende do voo do projétil, não do
   *  instante do arremesso). */
  _explodeGrenade(scene, x, y, time) {
    const fx = this._createFlameFx(scene, x, y);
    this.flameZones.push({ x, y, spawnMs: time, lastTickMs: 0, fx });
  }

  _advanceFlameZones(time, enemyGroup) {
    this.flameZones = this.flameZones.filter((zone) => {
      const age = time - zone.spawnMs;

      if (age >= this.grenadeDef.grenadeDurationMs) {
        this._destroyFlameFx(zone.fx);
        return false;
      }

      this._updateFlameFadeOut(zone, age, time);

      if (time - zone.lastTickMs >= this.grenadeDef.grenadeTickIntervalMs) {
        zone.lastTickMs = time;
        this._damageEnemiesInFlame(zone, enemyGroup, time);
      }

      return true;
    });
  }

  _damageEnemiesInFlame(zone, enemyGroup, time) {
    // snapshot: mesma razão do fix em TornadoAbility/SlamAbility/Weapon
    enemyGroup.getChildren().slice().forEach((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(zone.x, zone.y, enemy.x, enemy.y);
      if (dist <= this.grenadeDef.grenadeRadius) {
        // sem `source`: dano do Cyberus, igual ao contato normal do
        // cachorro, não conta pra Sanguessuga (ver topo do arquivo)
        DamageSystem.applyWeaponHit(enemy, this.grenadeDef.grenadeDamage, undefined, time);
      }
    });
  }

  _createFlameFx(scene, x, y) {
    const radius = this.grenadeDef.grenadeRadius;
    const outer = scene.add.circle(0, 0, radius, FLAME_COLOR, 0.25).setStrokeStyle(2, FLAME_COLOR, 0.6);
    const inner = scene.add.circle(0, 0, radius * 0.5, FLAME_COLOR, 0.35);
    const container = scene.add.container(x, y, [outer, inner]).setDepth(8);

    scene.tweens.add({
      targets: inner,
      scale: { from: 0.85, to: 1.15 },
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    return container;
  }

  _updateFlameFadeOut(zone, age, time) {
    const fadeStartAge = this.grenadeDef.grenadeDurationMs * (1 - FLAME_FADE_OUT_RATIO);
    if (age < fadeStartAge) return;

    const fadeMs = this.grenadeDef.grenadeDurationMs - fadeStartAge;
    const fadeProgress = (age - fadeStartAge) / fadeMs;
    const baseAlpha = 1 - fadeProgress;
    const isBlinkOn = Math.floor(time / FLAME_FADE_BLINK_INTERVAL_MS) % 2 === 0;

    zone.fx.setAlpha(Math.max(0, isBlinkOn ? baseAlpha : baseAlpha * 0.35));
  }

  _destroyFlameFx(fx) {
    fx.scene?.tweens.killTweensOf([fx, ...fx.list]);
    fx.destroy();
  }

  _findNearestEnemy(enemyGroup) {
    let nearest = null;
    let nearestDist = this.def.engageRadius;

    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(this.dog.x, this.dog.y, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    });

    return nearest;
  }

  /** Usado pelo projétil da granada em voo (_advanceGrenadesInFlight) pra
   *  saber se encostou em algum inimigo — primeiro que encontrar dentro do
   *  raio, não necessariamente o mais próximo (o projétil já está bem
   *  perto de qualquer um que retorne aqui). */
  _findEnemyNear(x, y, radius, enemyGroup) {
    let found = null;
    enemyGroup.children.iterate((enemy) => {
      if (found || !enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist <= radius) found = enemy;
    });
    return found;
  }

  _followPlayer(player) {
    const targetX = player.x + this.offset.x;
    const targetY = player.y + this.offset.y;
    const dist = Phaser.Math.Distance.Between(this.dog.x, this.dog.y, targetX, targetY);
    if (dist <= FOLLOW_STOP_DIST) {
      this.dog.stop();
      return;
    }
    this.dog.moveToward({ x: targetX, y: targetY }, this.def.speed);
  }
}
