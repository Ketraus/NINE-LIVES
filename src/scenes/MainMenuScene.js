import MusicManager from '../systems/MusicManager.js';

// paleta "terminal cyberpunk" pedida: fundo do botão quase transparente,
// borda fina azul/cinza, sem RGB espalhafatoso — a imagem de fundo já
// carrega a atmosfera sozinha, os botões só precisam ser legíveis por
// cima dela.
const PANEL_FILL = 0x061014;
const PANEL_FILL_ALPHA = 0.55;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const PIXEL_FONT = '"Press Start 2P", monospace';
const CHAMFER = 8; // corte dos cantos, em px — visual de placa tecnológica

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create() {
    const { width, height } = this.scale;

    MusicManager.play(this, 'music_menu');

    this._buildBackground(width, height);

    this.add
      .text(width / 2, height * 0.28, 'NINE LIVES', {
        fontFamily: PIXEL_FONT,
        fontSize: '26px',
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 2, false, true);

    this._buildTerminalButton(width / 2, height * 0.6, 220, 40, 'JOGAR', () => this._start());

    this.input.keyboard.once('keydown-SPACE', () => {
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      this._start();
    });
  }

  _buildBackground(width, height) {
    const bg = this.add.image(width / 2, height / 2, 'menu_bg');
    // cover-fit: preenche o canvas todo sem distorcer, cortando o excesso.
    // A largura lógica muda em celular (ver gameConfig.js), então não dá
    // pra fixar uma escala — recalcula toda vez que a cena abre.
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale);
  }

  /**
   * Botão estilo "placa de terminal": fundo quase transparente, borda
   * fina, cantos cortados. Ao passar o mouse: borda mais evidente e o
   * ">" à esquerda aparece piscando. Retorna o container, pra dar pra
   * reaproveitar caso apareçam mais botões no menu no futuro.
   */
  _buildTerminalButton(x, y, w, h, label, onSelect) {
    const container = this.add.container(x, y);

    const panel = this.add.graphics();
    this._drawPanel(panel, w, h, BORDER_IDLE);

    const caret = this.add
      .text(-w / 2 + 14, 0, '>', { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_HOVER })
      .setOrigin(0, 0.5)
      .setVisible(false);

    const text = this.add
      .text(4, 0, label, { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_IDLE })
      .setOrigin(0.5);

    const hitArea = this.add
      .rectangle(0, 0, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    let blinkTween = null;

    const setHover = (hovering) => {
      panel.clear();
      this._drawPanel(panel, w, h, hovering ? BORDER_HOVER : BORDER_IDLE);
      text.setColor(hovering ? TEXT_HOVER : TEXT_IDLE);
      caret.setVisible(hovering);

      if (hovering) {
        blinkTween = this.tweens.add({
          targets: caret,
          alpha: { from: 1, to: 0.15 },
          duration: 260,
          yoyo: true,
          repeat: -1
        });
      } else if (blinkTween) {
        blinkTween.stop();
        caret.setAlpha(1);
        blinkTween = null;
      }
    };

    hitArea.on('pointerover', () => {
      setHover(true);
      this.sound.play('sfx_hover', { volume: 0.5 });
    });
    hitArea.on('pointerout', () => setHover(false));
    hitArea.on('pointerdown', () => {
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      onSelect();
    });

    container.add([panel, caret, text, hitArea]);
    return container;
  }

  /** Desenha o painel com cantos cortados (visual de placa tecnológica). */
  _drawPanel(g, w, h, borderColor) {
    const c = CHAMFER;
    const points = [
      { x: -w / 2 + c, y: -h / 2 },
      { x: w / 2 - c, y: -h / 2 },
      { x: w / 2, y: -h / 2 + c },
      { x: w / 2, y: h / 2 - c },
      { x: w / 2 - c, y: h / 2 },
      { x: -w / 2 + c, y: h / 2 },
      { x: -w / 2, y: h / 2 - c },
      { x: -w / 2, y: -h / 2 + c }
    ];
    g.fillStyle(PANEL_FILL, PANEL_FILL_ALPHA);
    g.fillPoints(points, true);
    g.lineStyle(1, borderColor, 1);
    g.strokePoints(points, true);
  }

  _start() {
    // celular: aproveita esse mesmo toque (gesto do usuário, exigido pela
    // API de Fullscreen) pra sumir com a barra do navegador. Sem suporte
    // (ex: iOS Safari não tem essa API pra página comum), só ignora e
    // segue normal — ver index.html/manifest.json pro caminho que
    // funciona no iPhone ("Adicionar à Tela de Início").
    if (this.sys.game.device.input.touch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
      try {
        this.scale.startFullscreen();
      } catch (e) {
        // sem suporte, sem problema — o jogo funciona normal do mesmo jeito
      }
    }
    // esconde o botão HTML de tela cheia (#fullscreen-btn) — só existe no
    // menu; na run quem controla é o menu pausa (PauseUI.js)
    window.dispatchEvent(new Event('nine-lives:fullscreen-started'));
    this.scene.start('WeaponSelectScene');
  }
}
