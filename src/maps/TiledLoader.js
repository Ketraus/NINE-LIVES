// Responsabilidade única: pegar o JSON exportado do Tiled (já carregado
export default class TiledLoader {
  // item por tileset usado no mapa. imageKey é a chave carregada no
  static build(scene, mapKey, tilesetConfigs, layerNames) {
    const map = scene.make.tilemap({ key: mapKey });

    const tilesets = tilesetConfigs.map(({ imageKey, nameInTiled }) => {
      const tileset = map.addTilesetImage(nameInTiled, imageKey);
      if (!tileset) {
        throw new Error(
          `[TiledLoader] Tileset "${nameInTiled}" não encontrado no mapa "${mapKey}". ` +
            'No Tiled: Map > Tileset Properties > Name precisa ser exatamente esse valor.'
        );
      }
      return tileset;
    });

    // createLayer aceita um array de tilesets — necessário sempre que a
    const layers = {};
    const createLayer = (layerName, required = false) => {
      if (!layerName) return null;
      if (Object.prototype.hasOwnProperty.call(layers, layerName)) return layers[layerName];
      const layer = TiledLoader._createLayer(map, tilesets, layerName, required);
      if (layer) layers[layerName] = layer;
      return layer;
    };

    createLayer(layerNames.ground, true);
    (layerNames.visual || []).forEach((layerName) => createLayer(layerName));
    (layerNames.support || []).forEach((layerName) => createLayer(layerName));
    Object.values(layerNames.collisions || {}).forEach((layerName) => createLayer(layerName));
    // walls é opcional: se layerNames.walls vier null/undefined (mapa ainda
    // sem layer de colisão separada), simplesmente não cria nada e não quebra
    return {
      map,
      layers,
      groundLayer: layers[layerNames.ground] || null
    };
  }

  static _createLayer(map, tilesets, layerName, required) {
    const layer = map.createLayer(layerName, tilesets, 0, 0);
    if (!layer) {
      if (!required) {
        console.warn(
          `[TiledLoader] Tile Layer "${layerName}" não encontrada no mapa — seguindo sem ela.`
        );
        return null;
      }
      throw new Error(
        `[TiledLoader] Tile Layer "${layerName}" não encontrada no mapa. ` +
          `No Tiled: Layer > New > Tile Layer, nomeie exatamente "${layerName}".`
      );
    }
    return layer;
  }
}
