/**
 * Responsabilidade única: pegar o JSON exportado do Tiled (já carregado
 * pelo Phaser.Loader) e transformar em tilemap + layers do Phaser.
 * Não sabe nada sobre spawn de jogador/inimigo, colisão de gameplay etc.
 * Isso é papel do MapManager — se você quer mudar nomes de layer/tileset,
 * mexe nas constantes lá no topo de MapManager.js, não aqui.
 */
export default class TiledLoader {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} mapKey - chave usada no this.load.tilemapTiledJSON
   * @param {string} tilesetImageKey - chave da imagem do tileset carregada
   * @param {string} tilesetNameInTiled - nome do tileset conforme definido
   *   no Tiled (Map > Tileset Properties > Name) — precisa bater exatamente
   * @param {{ground:string, walls:string}} layerNames - nomes das Tile
   *   Layers no Tiled
   */
  static build(scene, mapKey, tilesetImageKey, tilesetNameInTiled, layerNames) {
    const map = scene.make.tilemap({ key: mapKey });

    const tileset = map.addTilesetImage(tilesetNameInTiled, tilesetImageKey);
    if (!tileset) {
      throw new Error(
        `[TiledLoader] Tileset "${tilesetNameInTiled}" não encontrado no mapa "${mapKey}". ` +
          'No Tiled: Map > Tileset Properties > Name precisa ser exatamente esse valor.'
      );
    }

    const groundLayer = TiledLoader._createLayer(map, tileset, layerNames.ground);
    const wallsLayer = TiledLoader._createLayer(map, tileset, layerNames.walls);

    return { map, groundLayer, wallsLayer };
  }

  static _createLayer(map, tileset, layerName) {
    const layer = map.createLayer(layerName, tileset, 0, 0);
    if (!layer) {
      throw new Error(
        `[TiledLoader] Tile Layer "${layerName}" não encontrada no mapa. ` +
          `No Tiled: Layer > New > Tile Layer, nomeie exatamente "${layerName}".`
      );
    }
    return layer;
  }
}
