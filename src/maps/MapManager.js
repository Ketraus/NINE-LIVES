import TiledLoader from './TiledLoader.js';

// Tudo que depende de nomes definidos no Tiled fica centralizado aqui.
const MAP_KEY = 'map';

// Um item por tileset usado no mapa. imageKey precisa ter sido carregado
// IMPORTANTE: esses nomes têm que bater exatamente com os tilesets que
// existem dentro do assets/maps/map.json atual (confira no Tiled em
// Map > Tileset Properties > Name). O map.json exportado atualmente só
// tem estes 3 tilesets — "tileset"/"darbluegrass"/"deathterrain" eram de
// uma versão antiga do mapa (mapaa.json) e não existem mais aqui.
const TILESETS = [
  { imageKey: 'Tilesetgrass', nameInTiled: 'TX Tileset Grass-1.png' },
  { imageKey: 'Tilesetprops', nameInTiled: 'TX Props-1.png' },
  { imageKey: 'Tilesetplant', nameInTiled: 'TX Plant-1.png' }
];

// O map.json atual só tem uma Tile Layer chamada "chao" (sem "Ground"/
// "Walls" separadas). walls fica null até o mapa ter uma layer de
// colisão de verdade — sem isso o jogador simplesmente não colide com nada.
const LAYER_NAMES = { ground: 'chao', walls: null };
const OBJECT_LAYER_NAME = 'Objects';
const PLAYER_SPAWN_OBJECT_NAME = 'PlayerSpawn';

// Fachada sobre o mapa: é o que GameScene, EnemySpawner etc. consultam.
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
      TILESETS,
      LAYER_NAMES
    );
    this.map = map;
    this.groundLayer = groundLayer;
    this.wallsLayer = wallsLayer;

    // qualquer tile não-vazio na layer Walls colide (gid 0 = vazio)
    // — só roda se a layer Walls existir no mapa atual (ver LAYER_NAMES acima)
    if (this.wallsLayer) {
      this.wallsLayer.setCollisionByExclusion([-1, 0]);
    }

    return this;
  }

  // Registra colisão física entre um sprite/group e as paredes do mapa.
  addCollider(gameObjectOrGroup, callback) {
    if (!this.wallsLayer) return; // mapa atual não tem layer de paredes ainda
    this.scene.physics.add.collider(gameObjectOrGroup, this.wallsLayer, callback);
  }

  // Ponto de spawn do jogador definido no Tiled (Objects > PlayerSpawn).
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

  // Pega qualquer objeto-ponto de qualquer Object Layer do Tiled pelo
  getObjectPoint(layerName, objectName) {
    const objectLayer = this.map.getObjectLayer(layerName);
    const obj = objectLayer?.objects?.find((o) => o.name === objectName);
    return obj ? { x: obj.x, y: obj.y } : null;
  }

  getWorldBounds() {
    return { width: this.map.widthInPixels, height: this.map.heightInPixels };
  }
}
