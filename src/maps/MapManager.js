import TiledLoader from './TiledLoader.js';

/**
 * Fachada sobre o mapa: é o que GameScene, EnemySpawner etc. consultam.
 * Nenhum outro arquivo do jogo deveria acessar map.getLayer(...) direto.
 */
export default class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.map = null;
    this.groundLayer = null;
    this.wallsLayer = null;
  }

  build() {
    const { map, groundLayer, wallsLayer } = TiledLoader.build(
      this.scene,
      'map',
      'tileset',
      'tileset'
    );
    this.map = map;
    this.groundLayer = groundLayer;
    this.wallsLayer = wallsLayer;

    // qualquer tile não-vazio na layer Walls colide (gid 0 = vazio)
    this.wallsLayer.setCollisionByExclusion([-1, 0]);

    return this;
  }

  /** Registra colisão física entre um sprite/group e as paredes do mapa. */
  addCollider(gameObjectOrGroup, callback) {
    this.scene.physics.add.collider(gameObjectOrGroup, this.wallsLayer, callback);
  }

  /** Ponto de spawn do jogador definido no Tiled (Objects > PlayerSpawn). */
  getPlayerSpawn() {
    const objectLayer = this.map.getObjectLayer('Objects');
    const spawn = objectLayer?.objects?.find((o) => o.name === 'PlayerSpawn');
    if (!spawn) {
      return { x: this.map.widthInPixels / 2, y: this.map.heightInPixels / 2 };
    }
    return { x: spawn.x, y: spawn.y };
  }

  getWorldBounds() {
    return { width: this.map.widthInPixels, height: this.map.heightInPixels };
  }
}
