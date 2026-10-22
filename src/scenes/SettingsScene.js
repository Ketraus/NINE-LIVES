import MusicManager from '../systems/MusicManager.js';
import SettingsManager from '../systems/SettingsManager.js';
import EventBus from '../systems/EventBus.js';
import { UI_SCALE } from '../config/layout.js';

// mesma paleta "terminal cyberpunk" do MainMenuScene — ver comentários lá
const PANEL_FILL = 0x061014;
const PANEL_FILL_ALPHA = 0.55;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const PIXEL_FONT = '"Press Start 2P", monospace';
const CHAMFER = 8;

// fade só quando aberta como cena própria (vinda do MainMenuScene) — o
// modo overlay (aberta por cima do pause) já usa a cortina do PauseUI
// (transitionCover), então não recebe fade de câmera aqui.
const SCENE_FADE_MS = 220;

const TRACK_WIDTH = Math.round(240 * UI_SCALE);
const TRACK_HEIGHT = Math.round(6 * UI_SCALE);
const HANDLE_WIDTH = Math.round(10 * UI_SCALE);
const HANDLE_HEIGHT = Math.round(20 * UI_SCALE);
const TRACK_COLOR = 0x1c2a2f;
const FILL_COLOR = 0x8fd6ff;

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  // `returnTo`: cena pra onde o botão VOLTAR vai (usado quando a tela é
  // aberta a partir do menu principal). `overlay`: true quando é aberta
  // por cima do pause do GameScene (ver PauseUI._openSettings) — nesse
  // caso VOLTAR só fecha esta cena (this.scene.stop()) em vez de trocar
  // de cena, deixando o jogo pausado por baixo do jeito que estava.
  init(data) {
    this.returnTo = data?.returnTo || 'MainMenuScene';
    this.overlay = !!data?.overlay;
  }

  create() {
    const { width, height } = this.scale;

    this._transitioning = false; // trava clique duplo no VOLTAR

    if (!this.overlay) {
      this.cameras.main.fadeIn(SCENE_FADE_MS, 0, 0, 0);
    }

    const bg = this.add.image(width / 2, height / 2, 'menu_bg');
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale);
    this.add.rectangle(width / 2, height / 2, width, height, 0x05080a, 0.55); // escurece pra sliders ficarem legíveis

    this.add
      .text(width / 2, height * 0.16, 'SETTINGS', {
        fontFamily: PIXEL_FONT,
        fontSize: `${Math.round(22 * UI_SCALE)}px`,
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 2, false, true);

    const startY = height * 0.30;
    const spacing = Math.round(62 * UI_SCALE);

    this._buildSlider(width / 2, startY, 'MASTER VOLUME', SettingsManager.getMaster(), (v) => {
      SettingsManager.setMaster(v);
      this.sound.setVolume(v);
    });

    this._buildSlider(width / 2, startY + spacing, 'MUSIC VOLUME', SettingsManager.getMusic(), (v) => {
      SettingsManager.setMusic(v);
      MusicManager.applyLiveMusicVolume();
    });

    this._buildSlider(width / 2, startY + spacing * 2, 'SFX GLOBAL', SettingsManager.getSfx(), (v) => {
      SettingsManager.setSfx(v);
    });

    this._buildSlider(width / 2, startY + spacing * 3, 'PLAYER SFX', SettingsManager.getPlayerSfx(), (v) => {
      SettingsManager.setPlayerSfx(v);
    });

    const accessibilityX = Math.max(110, width * 0.16);
    const accessibilityY = height - Math.round(181 * UI_SCALE);
    this.add
      .text(accessibilityX, accessibilityY - Math.round(42 * UI_SCALE), 'ACESSIBILIDADE', {
        fontFamily: PIXEL_FONT,
        fontSize: `${Math.round(9 * UI_SCALE)}px`,
        color: TEXT_HOVER
      })
      .setOrigin(0.5);

    this._buildToggle(accessibilityX, accessibilityY, 'REDUZIR TREMOR', SettingsManager.getReducedMotion(), (value) => {
      SettingsManager.setReducedMotion(value);
    });
    this._buildToggle(accessibilityX, accessibilityY + Math.round(48 * UI_SCALE), 'REDUZIR FLASH', SettingsManager.getReducedFlashes(), (value) => {
      SettingsManager.setReducedFlashes(value);
    });
    this._buildToggle(accessibilityX, accessibilityY + Math.round(96 * UI_SCALE), 'TEXTOS MAIORES', SettingsManager.getLargeHud(), (value) => {
      SettingsManager.setLargeHud(value);
      EventBus.emit('accessibility-settings-changed');
    });
    this._buildFullscreenButton(accessibilityX, accessibilityY + Math.round(144 * UI_SCALE));

    this._buildBackButton(width / 2, startY + spacing * 4 + Math.round(10 * UI_SCALE));

    this._setupRetroFx();
  }

  _buildFullscreenButton(x, y) {
    const button = this._buildToggle(x, y, 'TELA CHEIA', this.scale.isFullscreen, () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
      refresh();
    });
    // O estado vem do navegador: ESC e pedidos recusados também atualizam o botão.
    const refresh = () => button.setEnabledState(this.scale.isFullscreen);
    const events = ['enterfullscreen', 'leavefullscreen', 'fullscreenfailed', 'fullscreenunsupported'];
    events.forEach((event) => this.scale.on(event, refresh));
    if (!this.scale.fullscreen.available) {
      button.hitArea.disableInteractive();
      button.stateText.setText('N/D');
      button.setAlpha(0.5);
    }
    this.events.once('shutdown', () => {
      events.forEach((event) => this.scale.off(event, refresh));
    });
  }

  _buildToggle(x, y, label, initialValue, onChange) {
    const width = Math.round(180 * UI_SCALE);
    const height = Math.round(32 * UI_SCALE);
    const container = this.add.container(x, y);
    const panel = this.add
      .rectangle(0, 0, width, height, PANEL_FILL, PANEL_FILL_ALPHA)
      .setStrokeStyle(1, BORDER_IDLE);
    const labelText = this.add
      .text(-width / 2 + 10 * UI_SCALE, 0, label, { fontFamily: PIXEL_FONT, fontSize: `${Math.round(8 * UI_SCALE)}px`, color: TEXT_IDLE })
      .setOrigin(0, 0.5);
    const stateText = this.add
      .text(width / 2 - 10 * UI_SCALE, 0, '', { fontFamily: PIXEL_FONT, fontSize: `${Math.round(8 * UI_SCALE)}px`, color: TEXT_IDLE })
      .setOrigin(1, 0.5);
    const hitArea = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    let enabled = Boolean(initialValue);
    const render = () => {
      stateText.setText(enabled ? 'ON' : 'OFF').setColor(enabled ? TEXT_HOVER : TEXT_IDLE);
      panel.setStrokeStyle(1, enabled ? BORDER_HOVER : BORDER_IDLE);
    };

    hitArea.on('pointerover', () => {
      panel.setStrokeStyle(1, BORDER_HOVER);
      this.sound.play('sfx_hover', { volume: 0.4 });
    });
    hitArea.on('pointerout', render);
    hitArea.on('pointerdown', () => {
      enabled = !enabled;
      render();
      onChange(enabled);
      this.sound.play('sfx_ui_click', { volume: 0.6 });
    });

    container.add([panel, labelText, stateText, hitArea]);
    container.hitArea = hitArea;
    container.stateText = stateText;
    container.setEnabledState = (value) => {
      enabled = Boolean(value);
      render();
    };
    render();
    return container;
  }

  // Mesmo pipeline CRT do menu principal (Bloom + CrtWave + GhostTrail +
  // Scanlines + ChromaticAberration + Flicker), reaplicado aqui porque
  // cada cena/câmera do Phaser precisa do seu próprio setPostPipeline —
  // ver MainMenuScene._setupRetroFx pros comentários de cada efeito.
  _setupRetroFx() {
    if (this.renderer.type !== Phaser.WEBGL) return; // efeitos exigem WebGL

    const cam = this.cameras.main;
    cam.setPostPipeline(['Bloom', 'CrtWave', 'GhostTrail', 'Scanlines', 'ChromaticAberration', 'Flicker']);

    cam.getPostPipeline('Bloom').setThreshold(0.72).setRadius(1.6).setIntensity(0.18);
    cam.getPostPipeline('ChromaticAberration').setMaxShift(1.5);
    cam.getPostPipeline('CrtWave').setAmplitude(0.0012).setFrequency(9).setSpeed(0.9);
    cam.getPostPipeline('GhostTrail').setDecay(0.55).setThreshold(0.6);
    cam.getPostPipeline('Scanlines').setLineHeight(2).setDarkAmount(0.12);
    cam.getPostPipeline('Flicker').setRate(4).setAmount(0.05);

    this.events.once('shutdown', () => cam.resetPostPipeline());
  }

  // Slider: trilha + preenchimento + alça arrastável, com clique na trilha
  // pulando direto pro ponto clicado. onChange recebe 0..1 a cada mudança.
  _buildSlider(x, y, label, initialValue, onChange) {
    const container = this.add.container(x, y);

    const labelText = this.add
      .text(0, -20 * UI_SCALE, label, { fontFamily: PIXEL_FONT, fontSize: `${Math.round(11 * UI_SCALE)}px`, color: TEXT_IDLE })
      .setOrigin(0.5);

    const trackLeft = -TRACK_WIDTH / 2;
    const track = this.add.rectangle(0, 6 * UI_SCALE, TRACK_WIDTH, TRACK_HEIGHT, TRACK_COLOR).setOrigin(0, 0.5);
    track.x = trackLeft;

    const fill = this.add.rectangle(trackLeft, 6 * UI_SCALE, TRACK_WIDTH * initialValue, TRACK_HEIGHT, FILL_COLOR).setOrigin(0, 0.5);

    const percentText = this.add
      .text(TRACK_WIDTH / 2 + 34 * UI_SCALE, 6 * UI_SCALE, `${Math.round(initialValue * 100)}%`, {
        fontFamily: PIXEL_FONT,
        fontSize: `${Math.round(11 * UI_SCALE)}px`,
        color: TEXT_IDLE
      })
      .setOrigin(0.5);

    const handle = this.add
      .rectangle(trackLeft + TRACK_WIDTH * initialValue, 6 * UI_SCALE, HANDLE_WIDTH, HANDLE_HEIGHT, 0xe8f6ff)
      .setStrokeStyle(1, BORDER_HOVER)
      .setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(handle);

    // feedback de toque na alça: cresce um pouco no hover, um "punch" maior
    // ao começar a arrastar — só escala (sem redesenhar a alça em si).
    let hovering = false;
    let dragging = false;
    const setHandleScale = (target, duration = 120) => {
      this.tweens.add({ targets: handle, scale: target, duration, ease: 'Quad.easeOut' });
    };

    const applyFromX = (localX, { animate = false } = {}) => {
      const clamped = Phaser.Math.Clamp(localX, trackLeft, trackLeft + TRACK_WIDTH);
      const value = (clamped - trackLeft) / TRACK_WIDTH;
      const newWidth = TRACK_WIDTH * value;

      if (animate) {
        // clique na trilha: desliza suave até o ponto tocado em vez de
        // pular instantâneo — arraste continua instantâneo (responsivo).
        this.tweens.add({ targets: handle, x: clamped, duration: 110, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: fill, width: newWidth, duration: 110, ease: 'Quad.easeOut' });
      } else {
        handle.x = clamped;
        fill.width = newWidth;
      }

      percentText.setText(`${Math.round(value * 100)}%`);
      onChange(value);
      return value;
    };

    handle.on('drag', (pointer, dragX) => applyFromX(dragX));

    handle.on('pointerover', () => {
      hovering = true;
      setHandleScale(1.15);
      this.sound.play('sfx_hover', { volume: 0.4 });
    });
    handle.on('pointerout', () => {
      hovering = false;
      if (!dragging) setHandleScale(1);
    });
    handle.on('dragstart', () => {
      dragging = true;
      setHandleScale(1.3, 90);
    });
    handle.on('dragend', () => {
      dragging = false;
      setHandleScale(hovering ? 1.15 : 1);
    });

    // clicar/arrastar na trilha em si também move a alça pro ponto tocado
    const trackHit = this.add
      .rectangle(trackLeft + TRACK_WIDTH / 2, 6 * UI_SCALE, TRACK_WIDTH, HANDLE_HEIGHT, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    trackHit.on('pointerdown', (pointer) => applyFromX(pointer.x - x, { animate: true }));

    container.add([labelText, track, fill, trackHit, handle, percentText]);
    return container;
  }

  _buildBackButton(x, y) {
    const w = Math.round(160 * UI_SCALE);
    const h = Math.round(36 * UI_SCALE);
    const container = this.add.container(x, y);

    const panel = this.add.graphics();
    this._drawPanel(panel, w, h, BORDER_IDLE);

    const caret = this.add
      .text(-w / 2 + 12 * UI_SCALE, 0, '>', { fontFamily: PIXEL_FONT, fontSize: `${Math.round(11 * UI_SCALE)}px`, color: TEXT_HOVER })
      .setOrigin(0, 0.5)
      .setVisible(false);

    const text = this.add
      .text(4 * UI_SCALE, 0, 'VOLTAR', { fontFamily: PIXEL_FONT, fontSize: `${Math.round(11 * UI_SCALE)}px`, color: TEXT_IDLE })
      .setOrigin(0.5);

    const hitArea = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });

    let blinkTween = null;

    hitArea.on('pointerover', () => {
      panel.clear();
      this._drawPanel(panel, w, h, BORDER_HOVER);
      text.setColor(TEXT_HOVER);
      caret.setVisible(true);
      caret.setAlpha(1);
      blinkTween = this.tweens.add({
        targets: caret,
        alpha: { from: 1, to: 0.15 },
        duration: 260,
        yoyo: true,
        repeat: -1
      });
      this.sound.play('sfx_hover', { volume: 0.5 });
    });
    hitArea.on('pointerout', () => {
      panel.clear();
      this._drawPanel(panel, w, h, BORDER_IDLE);
      text.setColor(TEXT_IDLE);
      caret.setVisible(false);
      if (blinkTween) {
        blinkTween.stop();
        caret.setAlpha(1);
        blinkTween = null;
      }
    });
    hitArea.on('pointerdown', () => {
      if (this._transitioning) return;
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      EventBus.emit('settings-closed');
      if (this.overlay) {
        this.scene.stop();
      } else {
        this._transitioning = true;
        const cam = this.cameras.main;
        cam.fadeOut(SCENE_FADE_MS, 0, 0, 0);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start(this.returnTo);
        });
      }
    });

    container.add([panel, caret, text, hitArea]);
    return container;
  }

  // Desenha o painel com cantos cortados — igual ao MainMenuScene.
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
}
