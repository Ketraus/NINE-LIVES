/**
 * Responsabilidade única: pegar o JSON exportado do Tiled (já carregado
 * pelo Phaser.Loader) e transformar em tilemap + layers do Phaser.
 * Não sabe nada sobre spawn de jogador/inimigo, colisão de gameplay etc.
 * Isso é papel do MapManager.
 */
export default class TiledLoader {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} mapKey - chave usada no this.load.tilemapTiledJSON
   * @param {string} tilesetImageKey - chave da imagem do tileset carregada
   * @param {string} tilesetNameInTiled - nome do tileset conforme definido no Tiled
   */
  static build(scene, mapKey, tilesetImageKey, tilesetNameInTiled) {
    const map = scene.make.tilemap({ key: mapKey });
    const tileset = map.addTilesetImage(tilesetNameInTiled, tilesetImageKey);

    const groundLayer = map.createLayer('Ground', tileset, 0, 0);
    const wallsLayer = map.createLayer('Walls', tileset, 0, 0);

    return { map, groundLayer, wallsLayer };
  }
}
