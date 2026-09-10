import MusicManager from '../systems/MusicManager.js';

// paleta "terminal cyberpunk" pedida: fundo do botão quase transparente,
const PANEL_FILL = 0x061014;
const PANEL_FILL_ALPHA = 0.55;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const PIXEL_FONT = '"Press Start 2P", monospace';
const CHAMFER = 8; // corte dos cantos, em px — visual de placa tecnológica

// transição de saída (JOGAR -> WeaponSelectScene), "troca de sistema":
const EXIT_GLITCH_MS = 160; // duração do desaparecer + glitch juntos
const EXIT_BLACK_MS = 180;

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create() {
    const { width, height } = this.scale;

    this._transitioning = false; // trava clique duplo durante a saída

    MusicManager.play(this, 'music_menu');

    // tudo que precisa sumir junto na transição (ver _playExitTransition)
    this.menuLayer = this.add.container(0, 0);

    const bg = this._buildBackground(width, height);

    const title = this.add
      .text(width / 2, height * 0.28, 'NINE LIVES', {
        fontFamily: PIXEL_FONT,
        fontSize: '26px',
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 2, false, true);

    const button = this._buildTerminalButton(width / 2, height * 0.6, 220, 40, 'JOGAR', () =>
      this._start()
    );

    const settingsButton = this._buildTerminalButton(width / 2, height * 0.6 + 56, 220, 40, 'SETTINGS', () => {
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      this.scene.start('SettingsScene', { returnTo: 'MainMenuScene' });
    });

    this.menuLayer.add([bg, title, button, settingsButton]);

    this._setupCrtWave();

    this.input.keyboard.once('keydown-SPACE', () => {
      if (this._transitioning) return;
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      this._start();
    });
  }

  // Ondulação horizontal sutil no menu inteiro (sinal CRT instável).
  // Intensidade/velocidade ficam aqui — únicos números pra mexer depois.
  _setupCrtWave() {
    if (this.renderer.type !== Phaser.WEBGL) return; // efeito exige WebGL

    const cam = this.cameras.main;
    cam.setPostPipeline('CrtWave');
    this._crtWaveFx = cam.getPostPipeline('CrtWave');
    this._crtWaveFx.setAmplitude(0.0025).setFrequency(12).setSpeed(1.4);

    this.events.once('shutdown', () => cam.resetPostPipeline());
  }

  _buildBackground(width, height) {
    const bg = this.add.image(width / 2, height / 2, 'menu_bg');
    // cover-fit: preenche o canvas todo sem distorcer, cortando o excesso.
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale);
    return bg;
  }

  // Botão estilo "placa de terminal": fundo quase transparente, borda
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

  // Desenha o painel com cantos cortados (visual de placa tecnológica).
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
    if (this._transitioning) return;
    this._transitioning = true;

    // celular: aproveita esse mesmo toque (gesto do usuário, exigido pela
    if (this.sys.game.device.input.touch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
      try {
        this.scale.startFullscreen();
      } catch (e) {
        // sem suporte, sem problema — o jogo funciona normal do mesmo jeito
      }
    }
    // esconde o botão HTML de tela cheia (#fullscreen-btn) — só existe no
    window.dispatchEvent(new Event('nine-lives:fullscreen-started'));

    this._playExitTransition();
  }

  // "Troca de sistema": menu some ENQUANTO glitcha (em paralelo — o
  _playExitTransition() {
    this.tweens.add({
      targets: this.menuLayer,
      alpha: 0,
      duration: EXIT_GLITCH_MS
    });

    this._playGlitch(EXIT_GLITCH_MS, () => {
      const cam = this.cameras.main;
      cam.fadeOut(EXIT_BLACK_MS, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('WeaponSelectScene');
      });
    });
  }

  // Jitter horizontal rápido (passos discretos, não tween suave — o "digi…
  _playGlitch(durationMs, onDone) {
    const cam = this.cameras.main;
    const steps = 8;
    let i = 0;
    this.time.addEvent({
      delay: durationMs / steps,
      repeat: steps - 1,
      callback: () => {
        i++;
        cam.scrollX = Phaser.Math.Between(-14, 14);
        if (i >= steps) {
          cam.scrollX = 0;
          onDone();
        }
      }
    });
  }
}
