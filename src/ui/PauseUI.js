import EventBus from '../systems/EventBus.js';

const BTN_RADIUS = 16;
const PANEL_W = 260;
const PANEL_H = 260;

// Menu de pausa. Dois pedaços:
export default class PauseUI {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;

    this._buildButton();
    this._buildPanel();

    EventBus.on('player-died', () => this._setButtonVisible(false));
    EventBus.on('player-won', () => this._setButtonVisible(false));
    EventBus.on('run-restart', () => {
      this.close();
      this._setButtonVisible(true);
    });

    scene.events.once('shutdown', () => this.destroy());
  }

  // scrollFactor(0) no container não propaga pros filhos, então cada
  _buildButton() {
    const x = this.scene.scale.width - 40;
    const y = 32;

    this.buttonContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(120);
    this._applyZoomCompensation(this.buttonContainer);

    const bg = this.scene.add
      .circle(x, y, BTN_RADIUS, 0x000000, 0.5)
      .setStrokeStyle(1, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const bar1 = this.scene.add.rectangle(x - 4, y, 3, 14, 0xffffff).setScrollFactor(0);
    const bar2 = this.scene.add.rectangle(x + 4, y, 3, 14, 0xffffff).setScrollFactor(0);

    bg.on('pointerover', () => bg.setFillStyle(0x000000, 0.7));
    bg.on('pointerout', () => bg.setFillStyle(0x000000, 0.5));
    bg.on('pointerdown', () => this.toggle());

    this.toggleBg = bg; // guardado pra desabilitar clique enquanto a Settings overlay está aberta (ver _openSettings)
    this.buttonContainer.add([bg, bar1, bar2]);
  }

  _buildPanel() {
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    this.panelContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(250).setVisible(false);
    this._applyZoomCompensation(this.panelContainer);

    const overlay = this.scene.add
      .rectangle(
        cx,
        cy,
        this.scene.scale.width,
        this.scene.scale.height,
        0x000000,
        0.65
      )
      .setScrollFactor(0);

    const panelBg = this.scene.add
      .rectangle(cx, cy, PANEL_W, PANEL_H, 0x22252e, 0.97)
      .setStrokeStyle(2, 0xffffff)
      .setScrollFactor(0);

    const title = this.scene.add
      .text(cx, cy - PANEL_H / 2 + 32, 'PAUSADO', { fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.panelContainer.add([overlay, panelBg, title]);

    this.panelContainer.add(this._buildMenuButton(cx, cy - 55, 'Continuar', () => this.close()));

    this.panelContainer.add(this._buildMenuButton(cx, cy, 'Settings', () => this._openSettings()));

    // só existe em dispositivo touch com suporte à Fullscreen API — mesma
    if (this.scene.sys.game.device.input.touch && this.scene.scale.fullscreen.available) {
      this.fullscreenButton = this._buildMenuButton(cx, cy + 55, '', () => this._toggleFullscreen());
      this._refreshFullscreenButton();
      this.panelContainer.add(this.fullscreenButton);
    }
  }

  // Abre a SettingsScene por cima do jogo (que continua pausado por
  // baixo, ver init(overlay:true) na própria SettingsScene). Desabilita
  // o botão de pausa (canto superior) enquanto ela estiver aberta, senão
  // um clique ali passaria por baixo da tela de Settings sem querer.
  _openSettings() {
    this.toggleBg.disableInteractive();
    EventBus.once('settings-closed', () => this.toggleBg.setInteractive({ useHandCursor: true }));
    this.scene.scene.launch('SettingsScene', { overlay: true });
    // sem isto, GameScene desenha por cima dela (vem depois na lista de
    // cenas do gameConfig) e a tela abre "escondida" atrás do jogo
    this.scene.scene.bringToTop('SettingsScene');
  }

  // Botão retangular simples reaproveitado pro painel (Continuar / Entrar…
  _buildMenuButton(x, y, label, onClick) {
    const group = this.scene.add.container(x, y);
    const bg = this.scene.add
      .rectangle(0, 0, PANEL_W - 40, 40, 0x33384a, 1)
      .setStrokeStyle(1, 0x9fc8ff)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(0, 0, label, { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0);

    bg.on('pointerover', () => bg.setFillStyle(0x3d4358));
    bg.on('pointerout', () => bg.setFillStyle(0x33384a));
    bg.on('pointerdown', onClick);

    group.add([bg, text]);
    group.labelText = text;
    return group;
  }

  // Alterna tela cheia nos dois sentidos.
  _toggleFullscreen() {
    if (this.scene.scale.isFullscreen) {
      this.scene.scale.stopFullscreen();
    } else {
      this.scene.scale.startFullscreen();
    }
    this._refreshFullscreenButton();
  }

  // troca só o texto ("Entrar"/"Sair") conforme o estado atual — chamado
  _refreshFullscreenButton() {
    if (!this.fullscreenButton) return;
    const label = this.scene.scale.isFullscreen ? 'Sair da Tela Cheia' : 'Entrar em Tela Cheia';
    this.fullscreenButton.labelText.setText(label);
  }

  _setButtonVisible(visible) {
    this.buttonContainer.setVisible(visible);
  }

  toggle() {
    // evita abrir o menu de pausa por cima da tela de level-up/evolução ou
    if (!this.isOpen && (this.scene.isGameOver || this.scene.levelUpUI?.container.visible)) return;
    this.isOpen ? this.close() : this.open();
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._refreshFullscreenButton();
    this.scene.physics.pause();
    this.scene.time.timeScale = 0;
    this.panelContainer.setVisible(true);
    EventBus.emit('pause-opened');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panelContainer.setVisible(false);
    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    EventBus.emit('pause-closed');
  }

  // Mesma correção de zoom do HUD (ver HUD._applyZoomCompensation em
  _applyZoomCompensation(container) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    if (zoom === 1) return;
    const inv = 1 / zoom;
    container.setScale(inv);
    container.setPosition(cam.centerX * (1 - inv), cam.centerY * (1 - inv));
  }

  destroy() {
    // se o GameScene foi desligado (morte/restart) com a Settings overlay
    // ainda aberta por cima, fecha ela junto pra não sobrar rodando
    if (this.scene.scene.isActive('SettingsScene')) this.scene.scene.stop('SettingsScene');
    this.buttonContainer?.destroy();
    this.panelContainer?.destroy();
  }
}
