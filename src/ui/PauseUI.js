import EventBus from '../systems/EventBus.js';

const BTN_RADIUS = 16;
const BTN_W = 220;
const BTN_H = 40;
const BTN_GAP = 56;

// paleta "terminal cyberpunk" — mesma do MainMenuScene/SettingsScene
const PANEL_FILL = 0x061014;
const PANEL_FILL_ALPHA = 0.55;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const PIXEL_FONT = '"Press Start 2P", monospace';
const CHAMFER = 8;

const ENTER_MS = 170; // entrada suave (fade + leve scale-up)
const EXIT_MS = 130; // saída suave, um pouco mais rápida que a entrada

// Menu de pausa. Dois pedaços:
export default class PauseUI {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;

    this._buildButton();
    this._buildPanel();
    this._setupPauseCamera();

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
    // mesmo fluxo do ESC (ver _buildInput no GameScene) — os dois só chamam toggle()
    bg.on('pointerdown', () => this.toggle());

    this.toggleBg = bg; // guardado pra desabilitar clique enquanto a Settings overlay está aberta (ver _openSettings)
    this.buttonContainer.add([bg, bar1, bar2]);
  }

  // Painel construído centrado na própria origem do container (0,0 local =
  // centro da tela) pra que o scale-in/out da entrada/saída cresça a partir
  // do centro, e não "escorregue" de um canto.
  _buildPanel() {
    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.panelContainer = this.scene.add.container(cx, cy).setScrollFactor(0).setDepth(250).setVisible(false);

    // overlay escurece a gameplay mas mantém ela visível ao fundo
    const overlay = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.72)
      .setScrollFactor(0)
      .setInteractive(); // bloqueia clique vazando pro jogo por baixo

    const title = this.scene.add
      .text(0, -120, 'PAUSADO', {
        fontFamily: PIXEL_FONT,
        fontSize: '26px',
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 2, false, true)
      .setScrollFactor(0);

    this.panelContainer.add([overlay, title]);

    const buttonYs = [-20, -20 + BTN_GAP];
    this.panelContainer.add(this._buildTerminalButton(0, buttonYs[0], 'CONTINUAR', () => this.close()));
    this.panelContainer.add(this._buildTerminalButton(0, buttonYs[1], 'SETTINGS', () => this._openSettings()));

    // só existe em dispositivo touch com suporte à Fullscreen API — mesma
    if (this.scene.sys.game.device.input.touch && this.scene.scale.fullscreen.available) {
      const y = -20 + BTN_GAP * 2;
      buttonYs.push(y);
      this.fullscreenButton = this._buildTerminalButton(0, y, '', () => this._toggleFullscreen());
      this._refreshFullscreenButton();
      this.panelContainer.add(this.fullscreenButton);
    }

    this._buildTechDetails(buttonYs);
  }

  // Poucos detalhes técnicos ao redor do bloco de botões (reticle nos
  // cantos + linha de status piscando) só pra tirar a cara de placeholder,
  // seguindo a mesma paleta/fonte do resto da UI.
  _buildTechDetails(buttonYs) {
    const top = buttonYs[0] - BTN_H / 2 - 14;
    const bottom = buttonYs[buttonYs.length - 1] + BTN_H / 2 + 14;
    const halfW = BTN_W / 2 + 14;
    const tick = 10;

    const frame = this.scene.add.graphics().setScrollFactor(0);
    frame.lineStyle(1, BORDER_IDLE, 0.6);
    const corners = [
      [-halfW, top, 1, 1],
      [halfW, top, -1, 1],
      [-halfW, bottom, 1, -1],
      [halfW, bottom, -1, -1]
    ];
    corners.forEach(([x, y, dx, dy]) => {
      frame.beginPath();
      frame.moveTo(x, y + tick * dy);
      frame.lineTo(x, y);
      frame.lineTo(x + tick * dx, y);
      frame.strokePath();
    });

    const readout = this.scene.add
      .text(0, bottom + 20, '> SYS.PAUSE_STATE : ACTIVE_', {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: TEXT_IDLE
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this._readoutBlink = this.scene.tweens.add({
      targets: readout,
      alpha: { from: 1, to: 0.35 },
      duration: 900,
      yoyo: true,
      repeat: -1
    });

    this.panelContainer.add([frame, readout]);
  }

  // Câmera extra só pra este painel: permite rodar o CRT (scanlines +
  // ondulação) na interface de pausa sem tocar na câmera principal, que é
  // a mesma que desenha a gameplay (zoom/follow do player etc).
  //
  // IMPORTANTE: uma câmera recém-criada desenha TUDO por padrão, com scroll
  // travado em (0,0). Se a gente não filtrar ela pra desenhar só o
  // panelContainer logo aqui na criação, ela fica sobreposta à main câmera
  // (que já está corretamente centrada no player) até a primeira vez que
  // open() rodar o ignore() — foi isso que causava a câmera "fora do mundo"
  // no spawn, que só se corrigia depois de pausar/despausar uma vez.
  _setupPauseCamera() {
    if (this.scene.renderer.type !== Phaser.WEBGL) return;

    const { width, height } = this.scene.scale;
    this.pauseCam = this.scene.cameras.add(0, 0, width, height);
    this.scene.cameras.main.ignore(this.panelContainer);

    // filtro inicial: já nasce só desenhando o panelContainer
    this.pauseCam.ignore(this.scene.children.list.filter((obj) => obj !== this.panelContainer));

    this.pauseCam.setPostPipeline(['Scanlines', 'CrtWave']);
    this.pauseCam.getPostPipeline('Scanlines').setLineHeight(2).setDarkAmount(0.12);
    this.pauseCam.getPostPipeline('CrtWave').setAmplitude(0.001).setFrequency(9).setSpeed(0.9);
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

  // Botão estilo "placa de terminal" (mesmo padrão do Menu): fundo quase
  // transparente, borda com chamfer, caret ">" piscando e brilho no hover.
  _buildTerminalButton(x, y, label, onSelect) {
    const container = this.scene.add.container(x, y);

    const panel = this.scene.add.graphics().setScrollFactor(0);
    this._drawPanel(panel, BTN_W, BTN_H, BORDER_IDLE);

    const caret = this.scene.add
      .text(-BTN_W / 2 + 14, 0, '>', { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_HOVER })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setVisible(false);

    const text = this.scene.add
      .text(4, 0, label, { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_IDLE })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const hitArea = this.scene.add
      .rectangle(0, 0, BTN_W, BTN_H, 0xffffff, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    let blinkTween = null;

    const setHover = (hovering) => {
      panel.clear();
      this._drawPanel(panel, BTN_W, BTN_H, hovering ? BORDER_HOVER : BORDER_IDLE);
      text.setColor(hovering ? TEXT_HOVER : TEXT_IDLE);
      caret.setVisible(hovering);

      if (hovering) {
        blinkTween = this.scene.tweens.add({
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
      this.scene.sound.play('sfx_hover', { volume: 0.5 });
    });
    hitArea.on('pointerout', () => setHover(false));
    hitArea.on('pointerdown', () => {
      this.scene.sound.play('sfx_ui_click', { volume: 0.6 });
      onSelect();
    });

    container.add([panel, caret, text, hitArea]);
    container.labelText = text;
    return container;
  }

  // Desenha o painel com cantos cortados (visual de placa tecnológica) —
  // mesma lógica do MainMenuScene._drawPanel.
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
    const label = this.scene.scale.isFullscreen ? 'SAIR DA TELA CHEIA' : 'ENTRAR EM TELA CHEIA';
    this.fullscreenButton.labelText.setText(label);
  }

  _setButtonVisible(visible) {
    this.buttonContainer.setVisible(visible);
  }

  // ESC (keydown-ESC no GameScene._buildInput) e o botão do canto chamam
  // exatamente este método — um único fluxo de abrir/fechar para os dois.
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

    // câmera de pausa só deve desenhar o painel — recalcula a cada abertura
    // pra cobrir inimigos/objetos que tenham spawnado depois da criação
    if (this.pauseCam) {
      this.pauseCam.ignore(this.scene.children.list.filter((obj) => obj !== this.panelContainer));
    }

    // entrada suave: some com o "pop" instantâneo de tela travando de vez
    this.scene.tweens.killTweensOf(this.panelContainer);
    this.panelContainer.setVisible(true).setAlpha(0).setScale(0.96);
    this.scene.tweens.add({
      targets: this.panelContainer,
      alpha: 1,
      scale: 1,
      duration: ENTER_MS,
      ease: 'Cubic.easeOut'
    });

    EventBus.emit('pause-opened');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    // saída suave e um pouco mais rápida — some antes do jogo voltar a
    // rodar, então já libera a física/tempo de imediato
    this.scene.tweens.killTweensOf(this.panelContainer);
    this.scene.tweens.add({
      targets: this.panelContainer,
      alpha: 0,
      scale: 0.96,
      duration: EXIT_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => this.panelContainer.setVisible(false)
    });

    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    EventBus.emit('pause-closed');
  }

  // Mesma correção de zoom do HUD (ver HUD._applyZoomCompensation em
  // HUD.js) — só o botão do canto precisa, já que ele continua sendo
  // desenhado pela câmera principal (com zoom) durante a gameplay normal.
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
    this._readoutBlink?.stop();
    if (this.pauseCam) this.scene.cameras.remove(this.pauseCam);
    this.buttonContainer?.destroy();
    this.panelContainer?.destroy();
  }
}
