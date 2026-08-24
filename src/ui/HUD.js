import EventBus from '../systems/EventBus.js';

const BAR_W = 200;
const SHIELD_BAR_COLOR = 0x3aa8ff; // mesmo azul do círculo de escudo em Player.js

/**
 * UI puramente reativa: só escuta EventBus e desenha. Não tem
 * nenhuma referência a Player/Enemy/RunState diretamente.
 */
export default class HUD {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this._buildHealthBar();
    this._buildShieldBar();
    this._buildXpBar();
    this._buildKillCounter();
    this._buildRunTimer();
    this._buildGameOverText();
    this._bindEvents();
  }

  _buildHealthBar() {
    this.hpBg = this.scene.add
      .rectangle(16, 16, BAR_W, 16, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.hpFill = this.scene.add
      .rectangle(18, 18, BAR_W - 4, 12, 0xe33e3e)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);
    this.hpText = this.scene.add
      .text(16, 34, '', { fontSize: '12px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(101);
  }

  /**
   * Barra de escudo (carta "Escudo Energético", evolução de Blindagem) —
   * criada já no HUD, mas invisível até o primeiro 'player-shield-changed'
   * chegar (ver _bindEvents), já que nem toda run tem a habilidade.
   */
  _buildShieldBar() {
    this.shieldBg = this.scene.add
      .rectangle(16, 52, BAR_W, 10, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    this.shieldFill = this.scene.add
      .rectangle(18, 53.5, BAR_W - 4, 7, SHIELD_BAR_COLOR)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
  }

  _buildXpBar() {
    this.xpBg = this.scene.add
      .rectangle(16, 68, BAR_W, 8, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.xpFill = this.scene.add
      .rectangle(18, 70, 0, 4, 0x4fd1ff)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);
    this.levelText = this.scene.add
      .text(16, 80, 'Nível 1', { fontSize: '12px', color: '#cfeaff' })
      .setScrollFactor(0)
      .setDepth(101);
  }

  _buildKillCounter() {
    this.killText = this.scene.add
      .text(this.scene.scale.width - 16, 16, 'Abates: 0', { fontSize: '12px', color: '#ffffff' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  _buildRunTimer() {
    this.timeText = this.scene.add
      .text(this.scene.scale.width / 2, 16, '00:00', { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  _buildGameOverText() {
    this.gameOverGroup = this.scene.add.container(0, 0).setDepth(200).setVisible(false);
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    const bg = this.scene.add.rectangle(cx, cy, 320, 140, 0x000000, 0.75).setScrollFactor(0);
    const title = this.scene.add
      .text(cx, cy - 30, 'VOCÊ MORREU', { fontSize: '22px', color: '#ff6666' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const hint = this.scene.add
      .text(cx, cy + 10, 'Pressione R para reiniciar', { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.gameOverGroup.add([bg, title, hint]);
  }

  _bindEvents() {
    EventBus.on('player-health-changed', ({ current, max }) => {
      const ratio = Phaser.Math.Clamp(current / max, 0, 1);
      this.hpFill.width = (BAR_W - 4) * ratio;
      this.hpText.setText(`${Math.ceil(current)} / ${max}`);
    });

    // só existe pra quem pegou "Escudo Energético" — a barra fica invisível
    // (ver _buildShieldBar) até o primeiro evento chegar
    EventBus.on('player-shield-changed', ({ current, max }) => {
      if (!this.shieldBg.visible) {
        this.shieldBg.setVisible(true);
        this.shieldFill.setVisible(true);
      }
      const ratio = Phaser.Math.Clamp(current / max, 0, 1);
      this.shieldFill.width = (BAR_W - 4) * ratio;
    });

    EventBus.on('xp-changed', ({ xp, xpToNext, level }) => {
      const ratio = Phaser.Math.Clamp(xp / xpToNext, 0, 1);
      this.xpFill.width = (BAR_W - 4) * ratio;
      this.levelText.setText(`Nível ${level}`);
    });

    EventBus.on('enemy-died', () => {
      this._kills = (this._kills || 0) + 1;
      this.killText.setText(`Abates: ${this._kills}`);
    });

    EventBus.on('run-time-changed', ({ seconds }) => {
      this.timeText.setText(HUD._formatTime(seconds));
    });

    EventBus.on('player-died', () => {
      this.gameOverGroup.setVisible(true);
    });

    EventBus.on('run-restart', () => {
      this.gameOverGroup.setVisible(false);
      this._kills = 0;
      this.killText.setText('Abates: 0');
      this.timeText.setText('00:00');
      // a nova run pode não ter (ou ainda não ter pego) o Escudo Energético
      // de novo — some com a barra até o próximo 'player-shield-changed'
      this.shieldBg.setVisible(false);
      this.shieldFill.setVisible(false).width = BAR_W - 4;
    });
  }

  /** @param {number} totalSeconds @returns {string} "mm:ss" */
  static _formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Sem destroy() aqui de propósito: nada chamava esse método (ele nunca
  // rodava) e, se rodasse, `EventBus.removeAllListeners()` apagaria os
  // listeners de QUALQUER coisa no bus, não só do HUD — um bug esperando
  // pra acontecer. A limpeza real já acontece uma vez só, no início de
  // GameScene.create(), antes de tudo se registrar de novo.
}
