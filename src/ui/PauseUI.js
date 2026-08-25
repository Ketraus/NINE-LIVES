import EventBus from '../systems/EventBus.js';

const BTN_RADIUS = 16;
const PANEL_W = 260;
const PANEL_H = 200;

/**
 * Menu de pausa. Dois pedaços:
 *  - botão (ícone de pausa, canto superior direito) — sempre visível, PC e
 *    celular, clique/toque abre e fecha o menu.
 *  - painel (overlay + "Continuar") — só no celular, quando o jogo está em
 *    fullscreen (ver MainMenuScene, que entra em fullscreen ao começar a
 *    run), ganha um botão extra "Sair da Tela Cheia".
 *
 * Pausa igual ao LevelUpUI (physics.pause + time.timeScale = 0) e avisa
 * GameScene via EventBus ('pause-opened'/'pause-closed') pra ele cuidar de
 * isPaused/spawnDirector — ver GameScene._buildCollisions.
 */
export default class PauseUI {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;

    this._buildButton();
    this._buildPanel();

    EventBus.on('player-died', () => this._setButtonVisible(false));
    EventBus.on('run-restart', () => {
      this.close();
      this._setButtonVisible(true);
    });

    scene.events.once('shutdown', () => this.destroy());
  }

  /**
   * BUG (PC: clique em "Continuar" não registrava): `container.setScrollFactor(0)`
   * só afeta o container em si, não propaga pros filhos (é preciso passar
   * `true` como 3º argumento, ou setar em cada um — ver docs do Phaser).
   * Sem isso, cada retângulo/texto aqui dentro mantinha o scrollFactor
   * padrão (1), e assim que a câmera saía da posição inicial (ela segue o
   * jogador, ver GameScene._buildPlayer) a área de clique real ficava
   * deslocada da posição desenhada na tela — cada vez mais longe da run
   * quanto mais o jogador tivesse andado. Por isso o botão de pausa em si
   * (perto do canto, erro pequeno) ainda dava pra acertar às vezes, mas o
   * "Continuar" (mais pro centro) praticamente nunca. Corrigido setando
   * `.setScrollFactor(0)` em cada elemento individualmente, do mesmo jeito
   * que HUD.js e LevelUpUI.js já faziam.
   */
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

    this.panelContainer.add(this._buildMenuButton(cx, cy - 10, 'Continuar', () => this.close()));

    // só existe em dispositivo touch com suporte à Fullscreen API — mesma
    // checagem usada pra ENTRAR em fullscreen (ver MainMenuScene.create).
    // BUG que isto corrige: antes o botão só sabia SAIR da tela cheia e,
    // quando o jogo já não estava mais em fullscreen, _refreshFullscreenButton
    // escondia ele (setVisible(false)) — ou seja, depois de sair uma vez,
    // não tinha mais como voltar (o botão sumia e nunca reaparecia).
    // Agora é um único botão que alterna (ver _toggleFullscreen) e nunca
    // se esconde sozinho; só o texto muda ("Entrar"/"Sair") conforme o
    // estado atual, atualizado toda vez que o menu abre (ver open()) e
    // logo após o próprio clique.
    if (this.scene.sys.game.device.input.touch && this.scene.scale.fullscreen.available) {
      this.fullscreenButton = this._buildMenuButton(cx, cy + 55, '', () => this._toggleFullscreen());
      this._refreshFullscreenButton();
      this.panelContainer.add(this.fullscreenButton);
    }
  }

  /** Botão retangular simples reaproveitado pro painel (Continuar / Entrar-Sair da Tela Cheia). */
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
    group.labelText = text; // referência pra _refreshFullscreenButton poder trocar o texto depois
    return group;
  }

  /** Alterna tela cheia nos dois sentidos (ver comentário em _buildPanel acima). */
  _toggleFullscreen() {
    if (this.scene.scale.isFullscreen) {
      this.scene.scale.stopFullscreen();
    } else {
      this.scene.scale.startFullscreen();
    }
    this._refreshFullscreenButton();
  }

  /**
   * Só troca o TEXTO do botão ("Entrar"/"Sair") conforme o estado atual —
   * o botão em si nunca se esconde (ver comentário em _buildPanel). Chamado
   * ao abrir o menu (o jogador pode ter saído da tela cheia por fora,
   * gesto do sistema, back do Android etc., enquanto o menu estava
   * fechado) e logo após o próprio clique no botão.
   */
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
    // da tela de game over — cada overlay cuida da sua própria pausa
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

  /**
   * Mesma correção de zoom do HUD (ver HUD._applyZoomCompensation em
   * src/ui/HUD.js) — botão e painel são fixos na tela e sofreriam o mesmo
   * deslocamento no celular (zoom 1.4x, ver GameScene._buildPlayer) sem isto.
   */
  _applyZoomCompensation(container) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    if (zoom === 1) return;
    const inv = 1 / zoom;
    container.setScale(inv);
    container.setPosition(cam.centerX * (1 - inv), cam.centerY * (1 - inv));
  }

  destroy() {
    this.buttonContainer?.destroy();
    this.panelContainer?.destroy();
  }
}
