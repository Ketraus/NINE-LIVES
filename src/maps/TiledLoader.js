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
   * @param {{imageKey:string, nameInTiled:string}[]} tilesetConfigs - um
   *   item por tileset usado no mapa. imageKey é a chave carregada no
   *   PreloadScene (this.load.image); nameInTiled precisa bater
   *   exatamente com Map > Tileset Properties > Name daquele tileset
   *   no Tiled. Um mapa com tiles de 2+ tilesets diferentes na mesma
   *   layer precisa de uma entrada aqui pra cada um — ver MapManager.js.
   * @param {{ground:string, walls:string}} layerNames - nomes das Tile
   *   Layers no Tiled
   */
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
    // layer usa tiles vindos de mais de um tileset (o Phaser resolve
    // sozinho qual tileset cada gid pertence)
    const groundLayer = TiledLoader._createLayer(map, tilesets, layerNames.ground);
    const wallsLayer = TiledLoader._createLayer(map, tilesets, layerNames.walls);

    return { map, groundLayer, wallsLayer };
  }

  static _createLayer(map, tilesets, layerName) {
    const layer = map.createLayer(layerName, tilesets, 0, 0);
    if (!layer) {
      throw new Error(
        `[TiledLoader] Tile Layer "${layerName}" não encontrada no mapa. ` +
          `No Tiled: Layer > New > Tile Layer, nomeie exatamente "${layerName}".`
      );
    }
    return layer;
  }
}
