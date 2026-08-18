import EventBus from '../systems/EventBus.js';

const CARD_W = 160;
const CARD_H = 200;
const GAP = 20;

/**
 * Mostra 3 cartas de upgrade, pausa a física enquanto escolhe,
 * aplica a escolha via RunManager e despausa.
 */
export default class LevelUpUI {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../roguelike/RunManager.js').default} runManager
   */
  constructor(scene, runManager) {
    this.scene = scene;
    this.runManager = runManager;
    this.container = scene.add.container(0, 0).setDepth(300).setVisible(false);

    EventBus.on('level-up', ({ options }) => this.show(options));
  }

  show(options) {
    this.container.removeAll(true);
    this.scene.physics.pause();
    this.scene.time.timeScale = 0;
    EventBus.emit('levelup-opened');

    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;
    const totalW = options.length * CARD_W + (options.length - 1) * GAP;
    const startX = cx - totalW / 2 + CARD_W / 2;

    const overlay = this.scene.add
      .rectangle(cx, cy, this.scene.scale.width, this.scene.scale.height, 0x000000, 0.6)
      .setScrollFactor(0);
    this.container.add(overlay);

    const title = this.scene.add
      .text(cx, cy - CARD_H / 2 - 30, 'SUBIU DE NÍVEL — escolha um upgrade', {
        fontSize: '16px',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.container.add(title);

    options.forEach((upgrade, i) => {
      const x = startX + i * (CARD_W + GAP);
      this.container.add(this._buildCard(x, cy, upgrade));
    });

    this.container.setVisible(true);
  }

  _buildCard(x, y, upgrade) {
    const group = this.scene.add.container(x, y);

    const bg = this.scene.add
      .rectangle(0, 0, CARD_W, CARD_H, 0x22252e, 0.95)
      .setStrokeStyle(2, 0x4fd1ff)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const name = this.scene.add
      .text(0, -CARD_H / 2 + 30, upgrade.name, { fontSize: '16px', color: '#4fd1ff' })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const desc = this.scene.add
      .text(0, 0, upgrade.description, {
        fontSize: '13px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: CARD_W - 24 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x4fd1ff));
    bg.on('pointerdown', () => this._choose(upgrade));

    group.add([bg, name, desc]);
    return group;
  }

  _choose(upgrade) {
    this.runManager.chooseUpgrade(upgrade);
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    EventBus.emit('levelup-closed');
  }
}
