import TiledLoader from './TiledLoader.js';

// Tudo que depende de nomes definidos no Tiled fica centralizado aqui.
const MAP_KEY = 'map';

// Um item por tileset usado no mapa. imageKey precisa ter sido carregado
// e o nome precisa bater com o tileset definido no map.json.
const TILESETS = [
  { imageKey: 'Tilesetgrass', nameInTiled: 'TX Tileset Grass-1.png' }
];

// O map.json atual só tem uma Tile Layer chamada "chao" (sem "Ground"/
// "Walls" separadas). walls fica null até o mapa ter uma layer de
// colisão de verdade — sem isso o jogador simplesmente não colide com nada.
const LAYER_NAMES = {
  ground: 'chao',
  visual: ['chao', 'Mar', 'Costa', 'FimDoMapa', 'Decoracao'],
  support: ['AreaJogavel'],
  collisions: {
    player: 'ColisaoJogador',
    sea: 'BloqueioMar',
    absolute: 'LimiteAbsoluto'
  }
};
// A praia (layer Costa) é andável: quem bloqueia o jogador é a ÁGUA (layer
// Mar). O bloqueio de mar é refeito a partir da layer Mar na hora de montar o
// mapa, então não depende do desenho da layer BloqueioMar no Tiled.
const WATER_LAYER = 'Mar';
const OBJECT_LAYER_NAME = 'Objects';
const PLAYER_SPAWN_OBJECT_NAME = 'PlayerSpawn';
const MAP_OBJECT_NAMES = {
  leviathanSpawn: 'LeviathanSpawn',
  finalCameraTarget: 'FinalCameraTarget',
  northCoastCenter: 'NorthCoastCenter'
};

// Fachada sobre o mapa: é o que GameScene, EnemySpawner etc. consultam.
export default class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.map = null;
    this.groundLayer = null;
    this.visualLayers = [];
    this.supportLayers = {};
    this.collisionLayers = {};
    this.worldCollisionLayers = [];
    this.blockingLayers = [];
    this.spawnBlockedLayers = [];
    this.wallsLayer = null;
  }

  build() {
    const { map, layers, groundLayer } = TiledLoader.build(
      this.scene,
      MAP_KEY,
      TILESETS,
      LAYER_NAMES
    );
    this.map = map;
    this.groundLayer = groundLayer;
    this._rebuildSeaBlocker(layers);
    this.visualLayers = LAYER_NAMES.visual.map((name) => layers[name]).filter(Boolean);
    this.supportLayers = Object.fromEntries(
      LAYER_NAMES.support.filter((name) => layers[name]).map((name) => [name, layers[name]])
    );
    this.collisionLayers = Object.fromEntries(
      Object.entries(LAYER_NAMES.collisions)
        .filter(([, name]) => layers[name])
        .map(([kind, name]) => [kind, layers[name]])
    );
    this.worldCollisionLayers = [this.collisionLayers.sea, this.collisionLayers.absolute].filter(Boolean);
    this.blockingLayers = [this.collisionLayers.player, ...this.worldCollisionLayers].filter(Boolean);
    this.spawnBlockedLayers = [
      layers[WATER_LAYER],
      this.collisionLayers.player,
      this.collisionLayers.sea,
      this.collisionLayers.absolute
    ].filter(Boolean);

    this.visualLayers.forEach((layer, index) => layer.setDepth(index));
    Object.values(this.supportLayers).forEach((layer) => layer.setVisible(false));
    Object.values(this.collisionLayers).forEach((layer) => {
      layer.setVisible(false);
      layer.setCollisionByExclusion([-1, 0]);
    });

    // Compatibilidade com sistemas antigos que consultavam wallsLayer.
    this.wallsLayer = this.collisionLayers.player || this.collisionLayers.sea || this.collisionLayers.absolute || null;

    // qualquer tile não-vazio na layer Walls colide (gid 0 = vazio)
    // — só roda se a layer Walls existir no mapa atual (ver LAYER_NAMES acima)
    return this;
  }

  // Tile bloqueado = água. Edita os dados da layer de bloqueio do mar (que é
  // invisível) antes de setCollisionByExclusion marcar a colisão.
  _rebuildSeaBlocker(layers) {
    const blocker = layers[LAYER_NAMES.collisions.sea];
    const water = layers[WATER_LAYER];
    if (!blocker || !water) return;
    const wData = water.layer.data;
    const bData = blocker.layer.data;
    for (let y = 0; y < bData.length; y++) {
      for (let x = 0; x < bData[y].length; x++) {
        bData[y][x].index = wData[y][x].index > 0 ? 1 : -1;
      }
    }
  }

  // Registra colisão física entre um sprite/group e as paredes do mapa.
  addCollider(gameObjectOrGroup, callback) {
    if (!this.wallsLayer) return; // mapa atual não tem layer de paredes ainda
    this.addWorldCollider(gameObjectOrGroup, callback);
  }

  addPlayerCollider(gameObjectOrGroup, callback) {
    const layers = this.blockingLayers.length
      ? this.blockingLayers
      : (this.wallsLayer ? [this.wallsLayer] : []);
    layers.forEach((layer) => {
      this.scene.physics.add.collider(gameObjectOrGroup, layer, callback);
    });
  }

  addWorldCollider(gameObjectOrGroup, callback) {
    const layers = this.worldCollisionLayers.length
      ? this.worldCollisionLayers
      : (this.wallsLayer ? [this.wallsLayer] : []);
    layers.forEach((layer) => {
      this.scene.physics.add.collider(gameObjectOrGroup, layer, callback);
    });
  }

  hasBlockingTileAtWorldXY(x, y, includePlayerLayer = true) {
    const configuredLayers = includePlayerLayer ? this.blockingLayers : this.worldCollisionLayers;
    const layers = configuredLayers.length
      ? configuredLayers
      : (this.wallsLayer ? [this.wallsLayer] : []);
    return layers.some((layer) => layer.hasTileAtWorldXY(x, y));
  }

  hasSpawnBlockedTileAtWorldXY(x, y) {
    const layers = this.spawnBlockedLayers.length ? this.spawnBlockedLayers : this.blockingLayers;
    return layers.some((layer) => layer.hasTileAtWorldXY(x, y));
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

  getLeviathanSpawn() {
    return this.getObjectPoint(OBJECT_LAYER_NAME, MAP_OBJECT_NAMES.leviathanSpawn);
  }

  getFinalCameraTarget() {
    return this.getObjectPoint(OBJECT_LAYER_NAME, MAP_OBJECT_NAMES.finalCameraTarget);
  }

  getNorthCoastCenter() {
    return this.getObjectPoint(OBJECT_LAYER_NAME, MAP_OBJECT_NAMES.northCoastCenter);
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
