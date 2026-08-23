
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

    const start = () => this.scene.start('WeaponSelectScene');
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.once('pointerdown', start);
  }
}
