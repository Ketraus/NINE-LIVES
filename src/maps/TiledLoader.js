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
    const groundLayer = TiledLoader._createLayer(map, tilesets, layerNames.ground, true);
    // walls é opcional: se layerNames.walls vier null/undefined (mapa ainda
    // sem layer de colisão separada), simplesmente não cria nada e não quebra
    const wallsLayer = layerNames.walls
      ? TiledLoader._createLayer(map, tilesets, layerNames.walls, false)
      : null;

    return { map, groundLayer, wallsLayer };
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
