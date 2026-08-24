
export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 40, 'NINE LIVES', {
        fontSize: '28px',
        color: '#ffffff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 10, 'Pressione ESPAÇO (ou clique) para começar', {
        fontSize: '14px',
        color: '#9fc8ff'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 50, 'WASD/Setas: mover   ESPAÇO/Clique: atacar', {
        fontSize: '12px',
        color: '#888888'
      })
      .setOrigin(0.5);

    const start = () => {
      // celular: aproveita esse mesmo toque (gesto do usuário, exigido
      // pela API de Fullscreen) pra sumir com a barra do navegador. Sem
      // suporte (ex: iOS Safari não tem essa API pra página comum), só
      // ignora e segue normal — ver index.html/manifest.json pro caminho
      // que funciona no iPhone ("Adicionar à Tela de Início").
      if (this.sys.game.device.input.touch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
        try {
          this.scale.startFullscreen();
        } catch (e) {
          // sem suporte, sem problema — o jogo funciona normal do mesmo jeito
        }
      }
      this.scene.start('WeaponSelectScene');
    };
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.once('pointerdown', start);
  }
}
