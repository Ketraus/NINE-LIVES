import TiledLoader from './TiledLoader.js';

// Tudo que depende de nomes definidos no Tiled fica centralizado aqui.
// Renomeou uma layer ou o tileset no editor? Só mexe nessas 6 linhas —
// nenhum outro arquivo do jogo referencia esses nomes diretamente.
const MAP_KEY = 'map';
const TILESET_IMAGE_KEY = 'tileset';
const TILESET_NAME_IN_TILED = 'tileset'; // Map > Tileset Properties > Name
const LAYER_NAMES = { ground: 'Ground', walls: 'Walls' };
const OBJECT_LAYER_NAME = 'Objects';
const PLAYER_SPAWN_OBJECT_NAME = 'PlayerSpawn';

/**
 * Fachada sobre o mapa: é o que GameScene, EnemySpawner etc. consultam.
 * Nenhum outro arquivo do jogo deveria acessar map.getLayer(...) direto.
 *
 * Guia rápido de como montar o mapa no Tiled: ver README.md
 * ("Como montar o mapa no Tiled").
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
      MAP_KEY,
      TILESET_IMAGE_KEY,
      TILESET_NAME_IN_TILED,
      LAYER_NAMES
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
    const point = this.getObjectPoint(OBJECT_LAYER_NAME, PLAYER_SPAWN_OBJECT_NAME);
    if (!point) {
      console.warn(
        `[MapManager] Objeto "${PLAYER_SPAWN_OBJECT_NAME}" não encontrado na layer ` +
          `"${OBJECT_LAYER_NAME}" — nascendo no centro do mapa. No Tiled: crie uma Object ` +
          `Layer chamada "${OBJECT_LAYER_NAME}" com um Point chamado "${PLAYER_SPAWN_OBJECT_NAME}".`
      );
      return { x: this.map.widthInPixels / 2, y: this.map.heightInPixels / 2 };
    }
    return point;
  }

  /**
   * Pega qualquer objeto-ponto de qualquer Object Layer do Tiled pelo
   * nome. Ponto de extensão genérico: baús, portas de sala, spawns de
   * inimigo específicos etc. no futuro usam isso em vez de precisar de
   * um método novo pra cada tipo de objeto.
   * @returns {{x:number, y:number}|null}
   */
  getObjectPoint(layerName, objectName) {
    const objectLayer = this.map.getObjectLayer(layerName);
    const obj = objectLayer?.objects?.find((o) => o.name === objectName);
    return obj ? { x: obj.x, y: obj.y } : null;
  }

  getWorldBounds() {
    return { width: this.map.widthInPixels, height: this.map.heightInPixels };
  }
}
