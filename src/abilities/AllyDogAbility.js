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
