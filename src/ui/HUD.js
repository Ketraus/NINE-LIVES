import EventBus from '../systems/EventBus.js';

const SHIELD_BAR_COLOR = 0xffd166; // dourado — precisa contrastar com o gradiente ciano->vermelho da vida,…
const SHIELD_FILL_ALPHA = 0.95; // escudo cobre a barra de vida por cima, então precisa ser bem mais opa…
const HP_BREAK_FLASH_COLOR = 0xffffff;
const HP_BREAK_FLASH_MS = 220; // pisca branco rápido quando o escudo estoura, some sozinho

// barra de vida "terminal": painel de cantos cortados (mesmo estilo do
const HP_PANEL_W = 150;
const HP_PANEL_H = 26;
const HP_CHAMFER = 5;
const HP_BORDER_COLOR = 0x4fd1ff;
const HP_BORDER_ALPHA = 0.7;
const HP_PANEL_FILL = 0x081217;
const HP_PANEL_FILL_ALPHA = 0.35;
const HP_PAD_X = 8;
const HP_TRACK_Y = 18; // distância do topo do painel até a linha da seta
const HP_TRACK_HEIGHT = 2;
const HP_TRACK_COLOR = 0x2a3a40; // trilho fixo, discreto
const HP_TRACK_ALPHA = 0.7;
const HP_FILL_HEIGHT = 7;
const HP_FILL_ALPHA = 0.85;
const HP_ARROW_HEAD_LEN = 8;
const HP_COLOR_HEALTHY = 0x4fd1ff;
const HP_COLOR_DANGER = 0xe33e3e;

// barra de xp: mesmo desenho da barra de vida (painel de cantos cortado…
const XP_PANEL_W = HP_PANEL_W;
const XP_PANEL_H = 16;
const XP_CHAMFER = 4;
const XP_PAD_X = 6;
const XP_TRACK_Y = 11;
const XP_TRACK_HEIGHT = 2;
const XP_FILL_HEIGHT = 5;
const XP_ARROW_HEAD_LEN = 6;
const XP_BORDER_COLOR = 0x6b7f8c;
const XP_BORDER_ALPHA = 0.5;
const XP_PANEL_FILL = 0x0c1216;
const XP_PANEL_FILL_ALPHA = 0.3;
const XP_TRACK_COLOR = 0x2a323a;
const XP_TRACK_ALPHA = 0.6;
const XP_FILL_COLOR = 0x8fa3af;
const XP_FILL_ALPHA = 0.85;

// tamanho da "achatada" na ponta das setas (vida e xp): sem isso a pont…
const SHARP_TIP_FLAT = 2;

// layout vertical do resto da HUD. Escudo não tem mais linha própria —
const XP_Y = 16 + HP_PANEL_H + 6;

// UI puramente reativa: só escuta EventBus e desenha. Não tem
export default class HUD {
  constructor(scene) {
    this.scene = scene;

    // Container único pra todo o HUD "fixo na tela" — ver _applyZoomCompens…
    this.uiContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(0);

    this._buildHealthBar();
    this._buildXpBar();
    this._buildKillCounter();
    this._buildRunTimer();
    this._buildGameOverText();
    this._buildWinText();

    // gameOverGroup/winGroup são containers à parte (ver _buildGameOverText
    this._applyZoomCompensation(this.uiContainer);
    this._applyZoomCompensation(this.gameOverGroup);
    this._applyZoomCompensation(this.winGroup);

    this._bindEvents();
  }

  // BUG (zoom no celular): GameScene dá setZoom(1.4) na câmera em telas
  _applyZoomCompensation(container) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    if (zoom === 1) return;
    const inv = 1 / zoom;
    container.setScale(inv);
    container.setPosition(cam.centerX * (1 - inv), cam.centerY * (1 - inv));
  }

  _buildHealthBar() {
    const x = 16;
    const y = 16;

    // painel (borda + fundo), desenhado uma vez só
    this.hpPanel = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    HUD._drawChamferedRect(
      this.hpPanel,
      x,
      y,
      HP_PANEL_W,
      HP_PANEL_H,
      HP_CHAMFER,
      HP_PANEL_FILL,
      HP_PANEL_FILL_ALPHA,
      HP_BORDER_COLOR,
      HP_BORDER_ALPHA
    );

    // trilho fixo (linha fina até a borda direita, com seta na ponta) —
    const trackMaxW = HP_PANEL_W - HP_PAD_X * 2;
    HUD._drawArrowShape(
      this.hpPanel,
      x + HP_PAD_X,
      y + HP_TRACK_Y,
      trackMaxW,
      HP_TRACK_HEIGHT,
      HP_ARROW_HEAD_LEN,
      HP_TRACK_COLOR,
      HP_TRACK_ALPHA
    );

    // seta grossa: vida atual, redesenhada a cada 'player-health-changed'
    this.hpFill = this.scene.add.graphics().setScrollFactor(0).setDepth(101);
    this._hpOrigin = { x: x + HP_PAD_X, y: y + HP_TRACK_Y };
    this._hpMaxW = trackMaxW;

    // overlay do escudo (carta "Escudo Energético"): mesma seta, por cima da
    this.shieldFill = this.scene.add.graphics().setScrollFactor(0).setDepth(102);
    this._hadShield = false; // pra detectar a transição "tinha escudo -> estourou" e disparar o flash

    // flash branco rápido sobre o painel inteiro, usado só no momento em
    this.hpBreakFlash = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(103)
      .setAlpha(0);
    HUD._drawChamferedRect(
      this.hpBreakFlash,
      x,
      y,
      HP_PANEL_W,
      HP_PANEL_H,
      HP_CHAMFER,
      HP_BREAK_FLASH_COLOR,
      1,
      HP_BREAK_FLASH_COLOR,
      0
    );

    this.hpText = this.scene.add
      .text(x + HP_PANEL_W + 8, y + HP_TRACK_Y - 6, '', { fontSize: '11px', color: '#cfeaff' })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);

    this.uiContainer.add([this.hpPanel, this.hpFill, this.shieldFill, this.hpBreakFlash, this.hpText]);
  }

  // Redesenha só a seta de vida atual (o painel e o trilho são estáticos).
  _drawHpFill(ratio) {
    this.hpFill.clear();
    const fillW = this._hpMaxW * ratio;
    const color = HUD._hpColor(ratio);
    HUD._drawArrowShape(
      this.hpFill,
      this._hpOrigin.x,
      this._hpOrigin.y,
      fillW,
      HP_FILL_HEIGHT,
      HP_ARROW_HEAD_LEN,
      color,
      HP_FILL_ALPHA
    );
  }

  // Redesenha o overlay de escudo por cima da barra de vida.
  _drawShieldFill(ratio) {
    this.shieldFill.clear();
    if (ratio <= 0) return;
    HUD._drawArrowShape(
      this.shieldFill,
      this._hpOrigin.x,
      this._hpOrigin.y,
      this._hpMaxW * ratio,
      HP_FILL_HEIGHT,
      HP_ARROW_HEAD_LEN,
      SHIELD_BAR_COLOR,
      SHIELD_FILL_ALPHA
    );
  }

  // Feedback rápido de "escudo quebrou": pisca branco e some, a barra vol…
  _flashShieldBreak() {
    this.hpBreakFlash.setAlpha(0.6);
    this.scene.tweens.add({
      targets: this.hpBreakFlash,
      alpha: 0,
      duration: HP_BREAK_FLASH_MS,
      ease: 'Cubic.easeOut'
    });
  }

  _buildXpBar() {
    const x = 16;
    const y = XP_Y;

    // mesmo desenho da barra de vida (painel de cantos cortados + seta,
    this.xpPanel = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    HUD._drawChamferedRect(
      this.xpPanel,
      x,
      y,
      XP_PANEL_W,
      XP_PANEL_H,
      XP_CHAMFER,
      XP_PANEL_FILL,
      XP_PANEL_FILL_ALPHA,
      XP_BORDER_COLOR,
      XP_BORDER_ALPHA
    );

    const trackMaxW = XP_PANEL_W - XP_PAD_X * 2;
    HUD._drawArrowShape(
      this.xpPanel,
      x + XP_PAD_X,
      y + XP_TRACK_Y,
      trackMaxW,
      XP_TRACK_HEIGHT,
      XP_ARROW_HEAD_LEN,
      XP_TRACK_COLOR,
      XP_TRACK_ALPHA
    );

    this.xpFill = this.scene.add.graphics().setScrollFactor(0).setDepth(101);
    this._xpOrigin = { x: x + XP_PAD_X, y: y + XP_TRACK_Y };
    this._xpMaxW = trackMaxW;

    // nível ao lado do painel (não embaixo, pra não empilhar altura),
    this.levelText = this.scene.add
      .text(x + XP_PANEL_W + 8, y + XP_PANEL_H / 2, 'Nível 1', { fontSize: '11px', color: '#cfeaff' })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(101);
    this.uiContainer.add([this.xpPanel, this.xpFill, this.levelText]);
  }

  // Redesenha só a seta de xp atual (o painel e o trilho são estáticos).
  _drawXpFill(ratio) {
    this.xpFill.clear();
    HUD._drawArrowShape(
      this.xpFill,
      this._xpOrigin.x,
      this._xpOrigin.y,
      this._xpMaxW * ratio,
      XP_FILL_HEIGHT,
      XP_ARROW_HEAD_LEN,
      XP_FILL_COLOR,
      XP_FILL_ALPHA
    );
  }

  _buildKillCounter() {
    this.killText = this.scene.add
      .text(this.scene.scale.width - 16, 16, 'Abates: 0', { fontSize: '12px', color: '#ffffff' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.uiContainer.add(this.killText);
  }

  _buildRunTimer() {
    this.timeText = this.scene.add
      .text(this.scene.scale.width / 2, 16, '00:00', { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.uiContainer.add(this.timeText);
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
      .text(cx, cy + 10, 'Pressione R ou toque na tela para reiniciar', { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.gameOverGroup.add([bg, title, hint]);
  }

  // Mesmo esquema visual do game over (ver _buildGameOverText), cores de
  _buildWinText() {
    this.winGroup = this.scene.add.container(0, 0).setDepth(200).setVisible(false);
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    const bg = this.scene.add.rectangle(cx, cy, 340, 140, 0x000000, 0.75).setScrollFactor(0);
    const title = this.scene.add
      .text(cx, cy - 30, 'Parabéns, você venceu o jogo!', {
        fontSize: '20px',
        color: '#7CFC9C',
        align: 'center',
        wordWrap: { width: 300 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const hint = this.scene.add
      .text(cx, cy + 30, 'Pressione R ou toque na tela para escolher outra arma', {
        fontSize: '14px',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.winGroup.add([bg, title, hint]);
  }

  _bindEvents() {
    EventBus.on('player-health-changed', ({ current, max }) => {
      const ratio = Phaser.Math.Clamp(current / max, 0, 1);
      this._drawHpFill(ratio);
      this.hpText.setText(`${Math.ceil(current)} / ${max}`);
    });

    // só existe pra quem pegou "Escudo Energético" — o overlay fica com
    EventBus.on('player-shield-changed', ({ current, max }) => {
      const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
      this._drawShieldFill(ratio);
      // "tinha escudo e zerou" -> flash; recarregar do zero não conta
      if (this._hadShield && ratio <= 0) this._flashShieldBreak();
      this._hadShield = ratio > 0;
    });

    EventBus.on('xp-changed', ({ xp, xpToNext, level }) => {
      const ratio = Phaser.Math.Clamp(xp / xpToNext, 0, 1);
      this._drawXpFill(ratio);
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

    EventBus.on('player-won', () => {
      this.winGroup.setVisible(true);
    });

    EventBus.on('run-restart', () => {
      this.gameOverGroup.setVisible(false);
      this.winGroup.setVisible(false);
      this._kills = 0;
      this.killText.setText('Abates: 0');
      this.timeText.setText('00:00');
      // a nova run pode não ter (ou ainda não ter pego) o Escudo Energético
      this._drawShieldFill(0);
      this._hadShield = false;
    });
  }

  static _formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Painel de cantos cortados (mesmo visual das placas do menu principal),
  static _drawChamferedRect(g, x, y, w, h, chamfer, fillColor, fillAlpha, borderColor, borderAlpha = 1) {
    const c = chamfer;
    const points = [
      { x: x + c, y },
      { x: x + w - c, y },
      { x: x + w, y: y + c },
      { x: x + w, y: y + h - c },
      { x: x + w - c, y: y + h },
      { x: x + c, y: y + h },
      { x, y: y + h - c },
      { x, y: y + c }
    ];
    g.fillStyle(fillColor, fillAlpha);
    g.fillPoints(points, true);
    g.lineStyle(1, borderColor, borderAlpha);
    g.strokePoints(points, true);
  }

  // Seta: corpo retangular que termina numa pontinha achatada em (x + wid…
  static _drawArrowShape(g, x, y, width, height, headLen, color, alpha = 1) {
    if (width <= 0) return;
    g.fillStyle(color, alpha);
    const tip = Math.min(SHARP_TIP_FLAT, width, height / 2);

    if (width <= headLen) {
      g.fillPoints(
        [
          { x, y: y - height / 2 },
          { x: x + width - tip, y: y - tip },
          { x: x + width, y },
          { x: x + width - tip, y: y + tip },
          { x, y: y + height / 2 }
        ],
        true
      );
      return;
    }

    const bodyW = width - headLen;
    g.fillPoints(
      [
        { x, y: y - height / 2 },
        { x: x + bodyW, y: y - height / 2 },
        { x: x + width - tip, y: y - tip },
        { x: x + width, y },
        { x: x + width - tip, y: y + tip },
        { x: x + bodyW, y: y + height / 2 },
        { x, y: y + height / 2 }
      ],
      true
    );
  }

  // Ciano (saudável) -> vermelho (crítico), interpolado pela vida restant…
  static _hpColor(ratio) {
    const danger = Phaser.Display.Color.ValueToColor(HP_COLOR_DANGER);
    const healthy = Phaser.Display.Color.ValueToColor(HP_COLOR_HEALTHY);
    const t = Phaser.Math.Clamp(ratio, 0, 1) * 100;
    const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(danger, healthy, 100, t);
    return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
  }

  // Sem destroy() aqui de propósito: nada chamava esse método (ele nunca
}