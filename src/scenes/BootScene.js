
/**
 * Não carrega assets do jogo em si — só o suficiente para desenhar a
 * tela de loading do PreloadScene (aqui não precisamos de nada, então
 * o boot é praticamente instantâneo).
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.scene.start('PreloadScene');
  }
}
