import EventBus from './EventBus.js';

// Joystick virtual pra controlar o MESMO movimento que WASD/setas já
// controlam (ver Player._handleMovement) — não faz nada de ataque, o
// ataque continua 100% automático. Só existe em dispositivos com touch
// (ver GameScene._buildInput), então não aparece nem escuta pointer em PC.
const BASE_RADIUS = 55;
const KNOB_RADIUS = 26;
const DEAD_ZONE_PX = 6; // evita "vazamento" de input com o dedo quase parado
const ACTIVATION_ZONE_RATIO = 0.5; // só ativa tocando na metade esquerda da tela

export default class TouchJoystick {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this.baseX = 0;
    this.baseY = 0;

    const { width, height } = scene.scale;
    this.zoneWidth = width * ACTIVATION_ZONE_RATIO;

    // Container fixo na tela (não rola com a câmera), acima do chão/inimigos
    // mas abaixo do overlay de game over (depth 200, ver HUD.js). Igual ao
    // HUD (ver HUD._applyZoomCompensation): base/knob são posicionados com
    // pointer.x/pointer.y, que são coordenadas reais de tela — sem
    // compensar o zoom da câmera (celular = 1.4x, GameScene._buildPlayer),
    // esse valor é reinterpretado como coordenada de MUNDO fixa e a câmera
    // zoomada desloca o círculo pra longe de onde o dedo realmente está.
    this.uiContainer = scene.add.container(0, 0).setScrollFactor(0).setDepth(150);
    this._applyZoomCompensation(this.uiContainer);

    this.base = scene.add
      .circle(width * 0.2, height - 90, BASE_RADIUS, 0xffffff, 0.12)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setVisible(false);
    this.knob = scene.add
      .circle(width * 0.2, height - 90, KNOB_RADIUS, 0xffffff, 0.3)
      .setVisible(false);
    // ordem de inserção = ordem de desenho dentro do container: knob por
    // último fica por cima da base, sem precisar de depth aqui
    this.uiContainer.add([this.base, this.knob]);

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    scene.input.on('pointerdown', this._onPointerDown);
    scene.input.on('pointermove', this._onPointerMove);
    scene.input.on('pointerup', this._onPointerUp);
    scene.input.on('pointerupoutside', this._onPointerUp);

    // esconde durante a tela de cartas/game over, igual o resto do HUD —
    // movimento já é ignorado nesses estados (ver GameScene.update), isto
    // é só pra não deixar o círculo largado no meio da tela de escolha
    EventBus.on('levelup-opened', () => this._setVisible(false));
    EventBus.on('levelup-closed', () => this._setVisible(this.pointerId !== null));
    // menu de pausa (ver src/ui/PauseUI.js) — mesmo tratamento do level-up
    EventBus.on('pause-opened', () => this._setVisible(false));
    EventBus.on('pause-closed', () => this._setVisible(this.pointerId !== null));
    EventBus.on('player-died', () => this._setVisible(false));
    EventBus.on('player-won', () => this._setVisible(false));

    scene.events.once('shutdown', () => this.destroy());
  }

  /**
   * Mesma correção do HUD (ver HUD._applyZoomCompensation em src/ui/HUD.js):
   * contra-escala o container por 1/zoom e reposiciona pra cancelar o zoom
   * da câmera, fazendo os círculos aparecerem exatamente onde pointer.x/y
   * diz que o dedo está — sem mexer na câmera nem no resto do jogo.
   */
  _applyZoomCompensation(container) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    if (zoom === 1) return;
    const inv = 1 / zoom;
    container.setScale(inv);
    container.setPosition(cam.centerX * (1 - inv), cam.centerY * (1 - inv));
  }

  _setVisible(visible) {
    this.base.setVisible(visible);
    this.knob.setVisible(visible);
  }

  _onPointerDown(pointer) {
    if (this.pointerId !== null) return; // já tem um dedo controlando o joystick
    if (pointer.x > this.zoneWidth) return; // só ativa no lado esquerdo da tela

    this.pointerId = pointer.id;
    this.baseX = pointer.x;
    this.baseY = pointer.y;
    this.base.setPosition(this.baseX, this.baseY).setVisible(true);
    this.knob.setPosition(this.baseX, this.baseY).setVisible(true);
  }

  _onPointerMove(pointer) {
    if (pointer.id !== this.pointerId) return;

    const dx = pointer.x - this.baseX;
    const dy = pointer.y - this.baseY;
    const dist = Math.hypot(dx, dy);

    if (dist < DEAD_ZONE_PX) {
      this.vector = { x: 0, y: 0 };
      this.knob.setPosition(this.baseX, this.baseY);
      return;
    }

    const angle = Math.atan2(dy, dx);
    const clamped = Math.min(dist, BASE_RADIUS);
    this.knob.setPosition(this.baseX + Math.cos(angle) * clamped, this.baseY + Math.sin(angle) * clamped);

    // magnitude analógica (0..1) conforme o quanto o dedo se afasta do
    // centro — Player soma isto ao vetor do teclado e recorta em 1
    const ratio = clamped / BASE_RADIUS;
    this.vector = { x: Math.cos(angle) * ratio, y: Math.sin(angle) * ratio };
  }

  _onPointerUp(pointer) {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this._setVisible(false);
  }

  /** @returns {{x: number, y: number}} vetor de -1..1 em cada eixo (0,0 = solto) */
  getVector() {
    return this.vector;
  }

  destroy() {
    this.scene.input.off('pointerdown', this._onPointerDown);
    this.scene.input.off('pointermove', this._onPointerMove);
    this.scene.input.off('pointerup', this._onPointerUp);
    this.scene.input.off('pointerupoutside', this._onPointerUp);
    this.uiContainer?.destroy(); // destrói base e knob junto (são filhos dele)
  }
}
