import DamageSystem from '../combat/DamageSystem.js';
import AllyDog from '../entities/AllyDog.js';

const FOLLOW_OFFSET_X = -26;
const FOLLOW_OFFSET_Y = 20;
const FOLLOW_STOP_DIST = 50; // não fica colado no jogador, dá um respiro visual

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
  /** @param {object} def - entrada de data/upgrades.js (type: "unlockAbility") */
  constructor(def) {
    this.def = def;
    this.dog = null;
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
    const targetX = player.x + FOLLOW_OFFSET_X;
    const targetY = player.y + FOLLOW_OFFSET_Y;
    const dist = Phaser.Math.Distance.Between(this.dog.x, this.dog.y, targetX, targetY);
    if (dist <= FOLLOW_STOP_DIST) {
      this.dog.stop();
      return;
    }
    this.dog.moveToward({ x: targetX, y: targetY }, this.def.speed);
  }
}
