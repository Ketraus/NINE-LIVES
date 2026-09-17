import EventBus from '../systems/EventBus.js';

const BTN_RADIUS = 16;
const BTN_W = 220;
const BTN_H = 40;
const BTN_GAP = 56;

// diálogo de confirmação (voltar pro menu inicial)
const CONFIRM_BTN_W = 96;
const CONFIRM_BTN_H = 36;
const CONFIRM_BTN_GAP = 16;
const CONFIRM_PANEL_W = 280;
const CONFIRM_PANEL_H = 150;

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
const DIALOG_CROSSFADE_MS = 150; // crossfade entre botões principais <-> diálogo de confirmação
const SETTINGS_COVER_MS = 260; // fade suave da cortina preta ao entrar/sair da Settings
const QUIT_FADE_MS = 420; // fade suave pra preto antes de trocar pra MainMenuScene
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

    // agrupa os botões principais (+ frame/readout) pra poder escondê-los
    // juntos quando o diálogo de confirmação abrir por cima (ver _showQuitConfirm)
    this.mainButtonsGroup = this.scene.add.container(0, 0);
    this.panelContainer.add(this.mainButtonsGroup);

    const buttonYs = [-20, -20 + BTN_GAP, -20 + BTN_GAP * 2];
    this.mainButtonsGroup.add(this._buildTerminalButton(0, buttonYs[0], 'CONTINUAR', () => this.close()));
    this.mainButtonsGroup.add(this._buildTerminalButton(0, buttonYs[1], 'SETTINGS', () => this._openSettings()));
    this.mainButtonsGroup.add(this._buildTerminalButton(0, buttonYs[2], 'MENU INICIAL', () => this._showQuitConfirm()));

    // só existe em dispositivo touch com suporte à Fullscreen API — mesma
    if (this.scene.sys.game.device.input.touch && this.scene.scale.fullscreen.available) {
      const y = -20 + BTN_GAP * 3;
      buttonYs.push(y);
      this.fullscreenButton = this._buildTerminalButton(0, y, '', () => this._toggleFullscreen());
      this._refreshFullscreenButton();
      this.mainButtonsGroup.add(this.fullscreenButton);
    }

    this._buildTechDetails(buttonYs);
    this._buildQuitConfirmDialog();

    // retângulo preto full-screen, por cima de tudo no painel — usado só
    // como "cortina" nas trocas de cena (Settings / MainMenuScene) pra
    // nunca deixar um frame sem nada cobrindo o jogo por baixo (ver
    // _openSettings e _playQuitTransition). fillAlpha fica em 1 (opaco) —
    // quem controla visibilidade é o alpha do próprio objeto, começando
    // em 0 (ver bug abaixo).
    this.transitionCover = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 1)
      .setScrollFactor(0)
      .setAlpha(0); // BUG anterior: fillAlpha=0 aqui deixava a cortina permanentemente invisível, já que tweenar .alpha (que já nascia em 1) não tinha efeito nenhum sobre o fill
    this.panelContainer.add(this.transitionCover);
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

    this._readoutText = readout; // reaproveitado na transição de saída (ver _playQuitTransition)
    this.mainButtonsGroup.add([frame, readout]);
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
  // Usa o transitionCover (cortina preta) em vez de apagar o painel: se a
  // gente fizesse o painel sumir (alpha 0) pra dar lugar à Settings, o
  // overlay escuro sumia junto e por um instante dava pra ver o jogo por
  // baixo antes da Settings terminar de entrar. Cobrindo com preto sólido
  // primeiro, o painel nunca precisa ficar transparente.
  _openSettings() {
    this.toggleBg.disableInteractive();
    EventBus.once('settings-closed', () => {
      this.toggleBg.setInteractive({ useHandCursor: true });
      // Settings já fechou (this.scene.stop() síncrono) — painel por baixo
      // continua opaco o tempo todo, só a cortina precisa sumir de novo
      this.scene.tweens.add({
        targets: this.transitionCover,
        alpha: 0,
        duration: SETTINGS_COVER_MS,
        ease: 'Sine.easeInOut'
      });
    });

    this.scene.tweens.add({
      targets: this.transitionCover,
      alpha: 1,
      duration: SETTINGS_COVER_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.scene.scene.launch('SettingsScene', { overlay: true });
        // sem isto, GameScene desenha por cima dela (vem depois na lista de
        // cenas do gameConfig) e a tela abre "escondida" atrás do jogo
        this.scene.scene.bringToTop('SettingsScene');
      }
    });
  }

  // Botão estilo "placa de terminal" (mesmo padrão do Menu): fundo quase
  // transparente, borda com chamfer, caret ">" piscando e brilho no hover.
  // w/h opcionais pra caber botões menores (ver diálogo de confirmação).
  _buildTerminalButton(x, y, label, onSelect, w = BTN_W, h = BTN_H) {
    const container = this.scene.add.container(x, y);

    const panel = this.scene.add.graphics().setScrollFactor(0);
    this._drawPanel(panel, w, h, BORDER_IDLE);

    const caret = this.scene.add
      .text(-w / 2 + 14, 0, '>', { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_HOVER })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setVisible(false);

    const text = this.scene.add
      .text(4, 0, label, { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_IDLE })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const hitArea = this.scene.add
      .rectangle(0, 0, w, h, 0xffffff, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    let blinkTween = null;

    const setHover = (hovering) => {
      panel.clear();
      this._drawPanel(panel, w, h, hovering ? BORDER_HOVER : BORDER_IDLE);
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

  // Diálogo "Você tem certeza...?" que aparece por cima dos botões
  // principais (que ficam escondidos enquanto ele está visível) — mesmo
  // estilo de placa/botão terminal do resto da UI.
  _buildQuitConfirmDialog() {
    this.confirmContainer = this.scene.add.container(0, 0).setVisible(false);

    const panel = this.scene.add.graphics().setScrollFactor(0);
    this._drawPanel(panel, CONFIRM_PANEL_W, CONFIRM_PANEL_H, BORDER_HOVER);

    const message = this.scene.add
      .text(0, -CONFIRM_PANEL_H / 2 + 40, 'Você tem certeza que quer\nvoltar pro menu inicial?', {
        fontFamily: PIXEL_FONT,
        fontSize: '11px',
        color: TEXT_HOVER,
        align: 'center',
        lineSpacing: 10
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const btnY = CONFIRM_PANEL_H / 2 - 34;
    const halfGap = (CONFIRM_BTN_W + CONFIRM_BTN_GAP) / 2;
    const simBtn = this._buildTerminalButton(
      -halfGap,
      btnY,
      'SIM',
      () => this._confirmQuitToMenu(),
      CONFIRM_BTN_W,
      CONFIRM_BTN_H
    );
    const naoBtn = this._buildTerminalButton(
      halfGap,
      btnY,
      'NÃO',
      () => this._hideQuitConfirm(),
      CONFIRM_BTN_W,
      CONFIRM_BTN_H
    );

    this.confirmContainer.add([panel, message, simBtn, naoBtn]);
    this.panelContainer.add(this.confirmContainer);
  }

  // Mostra o diálogo de confirmação com um crossfade rápido: os botões
  // principais somem enquanto o diálogo aparece por cima.
  _showQuitConfirm() {
    this.scene.tweens.killTweensOf(this.mainButtonsGroup);
    this.scene.tweens.killTweensOf(this.confirmContainer);

    this.scene.tweens.add({
      targets: this.mainButtonsGroup,
      alpha: 0,
      duration: DIALOG_CROSSFADE_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.mainButtonsGroup.setVisible(false);
        this.confirmContainer.setVisible(true).setAlpha(0);
        this.scene.tweens.add({
          targets: this.confirmContainer,
          alpha: 1,
          duration: DIALOG_CROSSFADE_MS,
          ease: 'Cubic.easeOut'
        });
      }
    });
  }

  // NÃO (ou reabertura da pausa com o diálogo ainda aberto): mesmo
  // crossfade, no sentido contrário, de volta aos botões principais.
  _hideQuitConfirm() {
    this.scene.tweens.killTweensOf(this.mainButtonsGroup);
    this.scene.tweens.killTweensOf(this.confirmContainer);

    if (!this.confirmContainer.visible) {
      // já estava fechado — só garante o estado final, sem animar de novo
      this.mainButtonsGroup.setVisible(true).setAlpha(1);
      this.confirmContainer.setAlpha(0);
      return;
    }

    this.scene.tweens.add({
      targets: this.confirmContainer,
      alpha: 0,
      duration: DIALOG_CROSSFADE_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.confirmContainer.setVisible(false);
        this.mainButtonsGroup.setVisible(true).setAlpha(0);
        this.scene.tweens.add({
          targets: this.mainButtonsGroup,
          alpha: 1,
          duration: DIALOG_CROSSFADE_MS,
          ease: 'Cubic.easeOut'
        });
      }
    });
  }

  // Reset instantâneo (sem animação) do estado do diálogo — usado quando
  // a pausa inteira está fechando (close()) ou a run está de saída de
  // vez (_confirmQuitToMenu()), onde uma animação a mais não faz sentido.
  _resetQuitConfirm() {
    this.scene.tweens.killTweensOf(this.mainButtonsGroup);
    this.scene.tweens.killTweensOf(this.confirmContainer);
    this.mainButtonsGroup.setVisible(true).setAlpha(1);
    this.confirmContainer.setVisible(false).setAlpha(0);
  }

  // SIM: sai da run de vez e volta pro MainMenuScene. Fade pra preto (câmera
  // principal + câmera de pausa, que desenha o painel por cima) antes de
  // trocar de cena — mesmo tipo de transição que o MainMenuScene usa pra
  // sair pro WeaponSelectScene (ver MainMenuScene._playExitTransition).
  // NÃO chama _resetQuitConfirm() aqui: o diálogo "tem certeza? SIM/NÃO"
  // deve continuar visível enquanto a tela funde pra preto, em vez de
  // voltar de repente pros botões principais (CONTINUAR/SETTINGS/etc) —
  // a cena toda é destruída no fim da transição, então não precisa resetar.
  _confirmQuitToMenu() {
    if (this._quitting) return;
    this._quitting = true;

    this.isOpen = false;
    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    EventBus.emit('pause-closed');

    this._playQuitTransition();
  }

  // Transição de saída: só um fade suave pra preto (câmera principal +
  // câmera de pausa, que desenha o painel por cima) antes de trocar pra
  // MainMenuScene. Nada de zoom/jitter na câmera aqui: o ícone de pausa
  // (canto superior, ver _applyZoomCompensation) usa uma compensação de
  // zoom calculada só uma vez — se o zoom mudasse ao vivo durante a
  // transição, essa compensação ficava desatualizada e a interface
  // "deslocava" visivelmente. Fade puro evita esse problema de vez.
  _playQuitTransition() {
    // readout do painel vira aviso de saída, sem o piscar contínuo
    this._readoutBlink?.stop();
    this._readoutText?.setText('> SYS.EXIT : RETURNING_TO_MENU_').setAlpha(1).setColor(TEXT_HOVER);

    const cam = this.scene.cameras.main;
    cam.fadeOut(QUIT_FADE_MS, 0, 0, 0);
    if (this.pauseCam) this.pauseCam.fadeOut(QUIT_FADE_MS, 0, 0, 0);

    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.scene.start('MainMenuScene');
    });
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

    // se o diálogo "tem certeza?" ficou aberto, reseta pra próxima vez que
    // a pausa abrir mostrar os botões principais, não o diálogo (instantâneo
    // — o painel inteiro já está saindo, não precisa de mais uma animação)
    this._resetQuitConfirm();

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