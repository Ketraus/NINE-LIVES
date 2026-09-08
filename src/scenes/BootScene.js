
import SettingsManager from '../systems/SettingsManager.js';

// Não carrega assets do jogo em si — só o suficiente para desenhar a
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    // volume master salvo (ver SettingsManager/SettingsScene) — aplicado
    // uma vez aqui porque o SoundManager é global (this.sound) pro jogo todo
    this.sound.setVolume(SettingsManager.getMaster());

    // espera a fonte pixelada do menu (ver index.html/MainMenuScene)
    const fontReady = document.fonts.load('16px "Press Start 2P"');
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    Promise.race([fontReady, timeout]).then(() => this.scene.start('PreloadScene'));
  }
}
