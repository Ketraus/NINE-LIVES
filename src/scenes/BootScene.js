
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
    // espera a fonte pixelada do menu (ver index.html/MainMenuScene)
    // carregar antes de seguir — sem isso, o texto do menu nasceria com
    // a fonte padrão do navegador por um instante e trocaria de repente
    // assim que a fonte terminasse de baixar. Timeout de segurança: se
    // ela falhar ou demorar demais, segue sem esperar mais (cai pro
    // "monospace" do CSS, ainda dá o clima terminal, só não pixelado).
    const fontReady = document.fonts.load('16px "Press Start 2P"');
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    Promise.race([fontReady, timeout]).then(() => this.scene.start('PreloadScene'));
  }
}
