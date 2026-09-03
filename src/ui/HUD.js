import EventBus from '../systems/EventBus.js';

const BAR_W = 200;
const SHIELD_BAR_COLOR = 0x3aa8ff; // mesmo azul do círculo de escudo em Player.js

// barra de vida "terminal": painel de cantos cortados (mesmo estilo do
// botão do menu principal, ver MainMenuScene._drawPanel) com uma seta
// dentro em vez de um retângulo cheio — corpo grosso = vida atual,
// afinando numa ponta, com uma linha fina de trilho até a borda direita
// do painel (o "alcance total"). Cor vai de ciano (saudável) a vermelho
// (crítico) conforme a vida cai. Alphas baixos de propósito — chamava
// atenção demais na tela cheia de ação.
const HP_PANEL_W = 220;
const HP_PANEL_H = 40;
const HP_CHAMFER = 6;
const HP_BORDER_COLOR = 0x4fd1ff;
const HP_BORDER_ALPHA = 0.7;
const HP_PANEL_FILL = 0x081217;
const HP_PANEL_FILL_ALPHA = 0.35;
const HP_PAD_X = 10;
const HP_TRACK_Y = 30; // distância do topo do painel até a linha da seta
const HP_TRACK_HEIGHT = 3;
const HP_TRACK_COLOR = 0x2a3a40; // trilho fixo, discreto
const HP_TRACK_ALPHA = 0.7;
const HP_FILL_HEIGHT = 9;
const HP_FILL_ALPHA = 0.85;
const HP_ARROW_HEAD_LEN = 10;
const HP_COLOR_HEALTHY = 0x4fd1ff;
const HP_COLOR_DANGER = 0xe33e3e;

// barra de xp "cápsula": moldura hexagonal (pontas nos dois lados) com uma
// barrinha reta por dentro pro progresso — cinza-azulado preenchido, escuro
// vazio, ver rascunho do usuário. Mais discreta que a de vida (contorno
// único em vez de duplo, tudo bem transparente) — não é uma informação tão
// urgente quanto vida, não precisa competir com o resto da tela.
const XP_H = 20;
const XP_CAP = 12; // comprimento da ponta lateral da cápsula
const XP_BORDER_COLOR = 0x14222c; // contorno
const XP_BORDER_ALPHA = 0.55;
const XP_CASING_COLOR = 0x6b7f8c; // corpo cinza-azulado da moldura
const XP_CASING_ALPHA = 0.25;
const XP_TRACK_COLOR = 0x101a22; // fundo da barra interna (vazio)
const XP_TRACK_ALPHA = 0.4;
const XP_FILL_COLOR = 0x8fa3af; // preenchido (xp atual)
const XP_FILL_ALPHA = 0.7;
const XP_INNER_INSET = 4; // respiro entre a moldura e a barra reta interna

// tamanho da "achatada" nas pontas dos dois desenhos acima (seta da vida e
// cápsula do xp): sem isso a ponta é um vértice único (triângulo de área
// zero), que o WebGL antialiasing pisca a cada frame nas bordas — era o
// bug de "piscadas nas extremidades". Um flat de poucos px é imperceptível
// no desenho mas resolve o flicker.
const SHARP_TIP_FLAT = 2;

// layout vertical do resto da HUD, empurrado pra baixo pra caber o painel
// de vida maior (antes tinha 16px de altura, agora tem HP_PANEL_H)
const SHIELD_Y = 16 + HP_PANEL_H + 6;
const XP_Y = SHIELD_Y + 10 + 6;
const LEVEL_TEXT_Y = XP_Y + XP_H + 4;

/**
 * UI puramente reativa: só escuta EventBus e desenha. Não tem
 * nenhuma referência a Player/Enemy/RunState diretamente.
 */
export default class HUD {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;

    // Container único pra todo o HUD "fixo na tela" — ver _applyZoomCompensation
    // logo abaixo pra entender por que ele existe.
    this.uiContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(0);

    this._buildHealthBar();
    this._buildShieldBar();
    this._buildXpBar();
    this._buildKillCounter();
    this._buildRunTimer();
    this._buildGameOverText();
    this._buildWinText();

    // gameOverGroup/winGroup são containers à parte (ver _buildGameOverText
    // / _buildWinText), então recebem a mesma correção separadamente.
    this._applyZoomCompensation(this.uiContainer);
    this._applyZoomCompensation(this.gameOverGroup);
    this._applyZoomCompensation(this.winGroup);

    this._bindEvents();
  }

  /**
   * BUG (zoom no celular): GameScene dá setZoom(1.4) na câmera em telas
   * touch (ver GameScene._buildPlayer). setScrollFactor(0) só faz o objeto
   * ignorar o SCROLL da câmera — o ZOOM continua se aplicando normalmente a
   * ele, como a qualquer outro objeto renderizado por ela. Resultado: um
   * ícone desenhado em coordenada de tela (16, 16) deixa de aparecer em
   * (16, 16) e passa a aparecer deslocado pra fora da área visível,
   * proporcional à distância dele até o centro da câmera.
   *
   * Correção: contra-escalar o container por 1/zoom e reposicioná-lo com
   * a fórmula inversa da transformação de câmera (em torno do centro dela),
   * cancelando o efeito do zoom só pra esse container — sem mexer na
   * câmera nem nos elementos do mundo do jogo.
   */
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
    // também estático, fica no mesmo Graphics do painel
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
    // (ver _drawHpFill/_bindEvents)
    this.hpFill = this.scene.add.graphics().setScrollFactor(0).setDepth(101);
    this._hpOrigin = { x: x + HP_PAD_X, y: y + HP_TRACK_Y };
    this._hpMaxW = trackMaxW;

    this.hpText = this.scene.add
      .text(x + HP_PANEL_W - 10, y + 6, '', { fontSize: '12px', color: '#cfeaff' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(101);

    this.uiContainer.add([this.hpPanel, this.hpFill, this.hpText]);
  }

  /** Redesenha só a seta de vida atual (o painel e o trilho são estáticos). */
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

  /**
   * Barra de escudo (carta "Escudo Energético", evolução de Blindagem) —
   * criada já no HUD, mas invisível até o primeiro 'player-shield-changed'
   * chegar (ver _bindEvents), já que nem toda run tem a habilidade.
   */
  _buildShieldBar() {
    this.shieldBg = this.scene.add
      .rectangle(16, SHIELD_Y, BAR_W, 10, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    this.shieldFill = this.scene.add
      .rectangle(18, SHIELD_Y + 1.5, BAR_W - 4, 7, SHIELD_BAR_COLOR)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
    this.uiContainer.add([this.shieldBg, this.shieldFill]);
  }

  _buildXpBar() {
    const x = 16;
    const y = XP_Y;

    // moldura hexagonal (pontas nos dois lados), desenhada uma vez só —
    // ver _drawHexShape. Contorno único (não duplo como antes): a segunda
    // linha por dentro ficava sobrepondo geometria bem em cima das pontas,
    // que é exatamente onde a tela estava piscando.
    this.xpCasing = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    HUD._drawHexShape(
      this.xpCasing,
      x,
      y,
      BAR_W,
      XP_H,
      XP_CAP,
      XP_CASING_COLOR,
      XP_CASING_ALPHA,
      XP_BORDER_COLOR,
      2,
      XP_BORDER_ALPHA
    );

    // barra reta por dentro da moldura (a moldura só afina nas pontas, a
    // barra em si fica sempre reta, ver rascunho do usuário)
    this._xpBar = {
      x: x + XP_CAP,
      y: y + XP_INNER_INSET,
      w: BAR_W - XP_CAP * 2,
      h: XP_H - XP_INNER_INSET * 2
    };
    this.xpTrack = this.scene.add
      .rectangle(this._xpBar.x, this._xpBar.y, this._xpBar.w, this._xpBar.h, XP_TRACK_COLOR, XP_TRACK_ALPHA)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);
    this.xpFill = this.scene.add
      .rectangle(this._xpBar.x, this._xpBar.y, 0, this._xpBar.h, XP_FILL_COLOR, XP_FILL_ALPHA)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(102);

    this.levelText = this.scene.add
      .text(16, LEVEL_TEXT_Y, 'Nível 1', { fontSize: '12px', color: '#cfeaff' })
      .setScrollFactor(0)
      .setDepth(101);
    this.uiContainer.add([this.xpCasing, this.xpTrack, this.xpFill, this.levelText]);
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

  /** Mesmo esquema visual do game over (ver _buildGameOverText), cores de
   * vitória — mostrada em 'player-won' quando a run chega em 10:00. */
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
      this.xpFill.width = this._xpBar.w * ratio;
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

  /** Painel de cantos cortados (mesmo visual das placas do menu principal),
   * (x, y) é o canto superior esquerdo — diferente de MainMenuScene._drawPanel,
   * que centraliza em (0,0), porque aqui é mais simples posicionar direto na
   * tela sem container extra. */
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

  /** Seta: corpo retangular que termina numa pontinha achatada em (x + width)
   * em vez de um vértice único — um vértice puro vira um triângulo de área
   * praticamente zero, que o antialiasing do WebGL pisca a cada frame (era
   * o bug de "piscadas nas extremidades"). Se width for menor que a cabeça
   * da seta, desenha só um triângulo encolhido (senão a seta "nasceria"
   * maior que a barra com pouca vida) — mesmo achatamento nesse caso. */
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

  /** Hexágono alongado (moldura de "cápsula" com pontas nos dois lados, ver
   * barra de xp). As pontas são achatadas por SHARP_TIP_FLAT em vez de um
   * vértice único — mesma correção de antialiasing da seta de vida acima. */
  static _drawHexShape(g, x, y, w, h, cap, fillColor, fillAlpha, borderColor, borderWidth, borderAlpha = 1) {
    const yMid = y + h / 2;
    const tip = Math.min(SHARP_TIP_FLAT, cap, h / 2);
    const points = [
      { x: x + cap, y },
      { x: x + w - cap, y },
      { x: x + w - tip, y: yMid - tip },
      { x: x + w, y: yMid },
      { x: x + w - tip, y: yMid + tip },
      { x: x + w - cap, y: y + h },
      { x: x + cap, y: y + h },
      { x: x + tip, y: yMid + tip },
      { x, y: yMid },
      { x: x + tip, y: yMid - tip }
    ];
    if (fillColor !== null) {
      g.fillStyle(fillColor, fillAlpha);
      g.fillPoints(points, true);
    }
    if (borderWidth > 0) {
      g.lineStyle(borderWidth, borderColor, borderAlpha);
      g.strokePoints(points, true);
    }
  }

  /** Ciano (saudável) -> vermelho (crítico), interpolado pela vida restante. */
  static _hpColor(ratio) {
    const danger = Phaser.Display.Color.ValueToColor(HP_COLOR_DANGER);
    const healthy = Phaser.Display.Color.ValueToColor(HP_COLOR_HEALTHY);
    const t = Phaser.Math.Clamp(ratio, 0, 1) * 100;
    const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(danger, healthy, 100, t);
    return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
  }

  // Sem destroy() aqui de propósito: nada chamava esse método (ele nunca
  // rodava) e, se rodasse, `EventBus.removeAllListeners()` apagaria os
  // listeners de QUALQUER coisa no bus, não só do HUD — um bug esperando
  // pra acontecer. A limpeza real já acontece uma vez só, no início de
  // GameScene.create(), antes de tudo se registrar de novo.
}
