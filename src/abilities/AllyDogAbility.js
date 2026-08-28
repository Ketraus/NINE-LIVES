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

// Visual da poça de chamas azuis da granada (1ª cabeça do Cyberus,
// evolução "Cyberus" — dog_purify_evo_cyberus). Fica aqui (não em
// data/upgrades.js) por ser puramente estético, mesmo padrão do
// TORNADO_COLOR em TornadoAbility.js.
const FLAME_COLOR = 0x33bbff;
const FLAME_FADE_OUT_RATIO = 0.35;
const FLAME_FADE_BLINK_INTERVAL_MS = 90;

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

  /** Liga a 1ª cabeça do Cyberus (granada) nesta cópia — ver
   *  AbilityManager._upgrade, chamado em TODAS as AllyDogAbility ativas. */
  upgrade(def) {
    this.grenadeDef = def;
    this.dog?.setTint(0x66d9ff); // pista visual: virou Cyberus
  }

  /** A cada grenadeCooldownMs, se houver um inimigo à vista dentro de
   *  grenadeRange, arremessa a granada nele — cria uma poça de chamas
   *  azuis que fica no lugar e causa dano contínuo a quem entrar/ficar
   *  dentro. Mesmo padrão de zona persistente que TornadoAbility usa. */
  _updateGrenade(time, target, enemyGroup, scene) {
    this._advanceFlameZones(time, enemyGroup);

    if (!target || time - this.lastGrenadeMs < this.grenadeDef.grenadeCooldownMs) return;
    const dist = Phaser.Math.Distance.Between(this.dog.x, this.dog.y, target.x, target.y);
    if (dist > this.grenadeDef.grenadeRange) return;

    this.lastGrenadeMs = time;
    this._throwGrenade(scene, target.x, target.y, time);
  }

  _throwGrenade(scene, x, y, time) {
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
