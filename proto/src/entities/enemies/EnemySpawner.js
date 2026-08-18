import Enemy from './Enemy.js';

const SPAWN_INTERVAL_MS = 2200;
const MIN_DIST_FROM_PLAYER = 140;

/**
 * Spawna inimigos periodicamente dentro dos limites do mapa.
 * Hoje só usa um tipo ("grunt"); a leitura de enemies.json já deixa
 * pronto suportar múltiplos tipos/waves no futuro sem mudar a API.
 */
export default class EnemySpawner {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../../maps/MapManager.js').default} mapManager
   * @param {Player} player
   * @param {Array} enemyDefs - conteúdo de data/enemies.json
   */
  constructor(scene, mapManager, player, enemyDefs) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.player = player;
    this.enemyDefs = enemyDefs;

    this.group = scene.physics.add.group({ runChildUpdate: false });
    this.timerEvent = null;
  }

  start() {
    this.timerEvent = this.scene.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnOne()
    });
    // primeiro inimigo imediato pra não deixar a cena vazia
    this.spawnOne();
  }

  stop() {
    this.timerEvent?.remove();
  }

  spawnOne() {
    const def = Phaser.Utils.Array.GetRandom(this.enemyDefs);
    const pos = this._findSpawnPosition();
    const enemy = new Enemy(this.scene, pos.x, pos.y, def);
    this.group.add(enemy);
    this.mapManager.addCollider(enemy);
    return enemy;
  }

  _findSpawnPosition() {
    const bounds = this.mapManager.getWorldBounds();
    const margin = 64;

    for (let attempt = 0; attempt < 10; attempt++) {
      const x = Phaser.Math.Between(margin, bounds.width - margin);
      const y = Phaser.Math.Between(margin, bounds.height - margin);
      const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
      if (dist >= MIN_DIST_FROM_PLAYER) {
        return { x, y };
      }
    }
    return { x: margin, y: margin };
  }

  /** Chamado no update da GameScene: faz todos perseguirem o jogador. */
  updateAll() {
    this.group.children.iterate((enemy) => {
      enemy?.chase(this.player);
    });
  }
}
