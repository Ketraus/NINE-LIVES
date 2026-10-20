// Sala de espera do multiplayer. Roda POR CIMA da GameScene (scene.launch): o
// mapa já está carregado, mas o jogo fica parado até todos apertarem PRONTO
// (mínimo 2 jogadores, máximo 4). Quem decide a hora de começar é o Host, ver
// MultiplayerManager._evaluateLobbyStart. Quem entra numa sala que já está
// rolando não vê esta tela (a GameScene destrava na hora).

const PIXEL_FONT = '"Press Start 2P", monospace';
const PANEL_FILL = 0x061014;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const TEXT_DIM = '#5f808c';
const READY_COLOR = '#7dffb0';
const WARN_COLOR = '#ff8a8a';
const CHAMFER = 8;

const PANEL_W = 560;
const PANEL_H = 380;
const SLOT_W = 456;
const SLOT_H = 32;
const SLOT_GAP = 8;
const CONNECT_TIMEOUT_MS = 8000;
const REFRESH_MS = 100;

export default class LobbyGateScene extends Phaser.Scene {
  constructor() {
    super('LobbyGateScene');
  }

  create(data) {
    this.gameScene = data?.gameScene;
    this._closing = false;
    this._leaving = false;
    this._signature = '';
    this._nextRefreshAt = 0;

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.backdrop = this.add.rectangle(cx, cy, width, height, 0x02080c, 0.74);

    this.ui = this.add.container(cx, cy);
    const panel = this.add.graphics();
    this._drawPanel(panel, PANEL_W, PANEL_H, BORDER_IDLE);

    const header = this.add
      .text(0, -166, 'SALA DE ESPERA', { fontFamily: PIXEL_FONT, fontSize: '9px', color: TEXT_DIM })
      .setOrigin(0.5);
    this.codeText = this.add
      .text(0, -138, '-----', { fontFamily: PIXEL_FONT, fontSize: '24px', color: '#cfefff' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#2a8fc0', 12, false, true);
    this.tagText = this.add
      .text(0, -110, '', { fontFamily: PIXEL_FONT, fontSize: '8px', color: TEXT_DIM })
      .setOrigin(0.5);

    this.slotGfx = this.add.graphics();
    this.slotNames = [];
    this.slotStatus = [];
    for (let i = 0; i < 4; i++) {
      const y = this._slotY(i);
      this.slotNames.push(
        this.add.text(-SLOT_W / 2 + 14, y, '', { fontFamily: PIXEL_FONT, fontSize: '10px', color: TEXT_IDLE }).setOrigin(0, 0.5)
      );
      this.slotStatus.push(
        this.add.text(SLOT_W / 2 - 14, y, '', { fontFamily: PIXEL_FONT, fontSize: '9px', color: TEXT_DIM }).setOrigin(1, 0.5)
      );
    }

    this.statusText = this.add
      .text(0, 96, '', { fontFamily: PIXEL_FONT, fontSize: '9px', color: TEXT_HOVER, align: 'center' })
      .setOrigin(0.5);
    this.hintText = this.add
      .text(0, 118, 'O JOGO COMEÇA QUANDO TODOS ESTIVEREM PRONTOS (MÍN. 2)', {
        fontFamily: PIXEL_FONT,
        fontSize: '7px',
        color: TEXT_DIM
      })
      .setOrigin(0.5);

    this.readyButton = this._buildButton(-112, 152, 210, 38, 'ESTOU PRONTO', () => this._toggleReady());
    this.leaveButton = this._buildButton(112, 152, 210, 38, 'SAIR', () => this._leave());

    this.ui.add([
      panel, header, this.codeText, this.tagText, this.slotGfx,
      ...this.slotNames, ...this.slotStatus, this.statusText, this.hintText,
      this.readyButton, this.leaveButton
    ]);

    // entrada: painel sobe de leve enquanto aparece
    this.ui.setAlpha(0).setY(cy + 10);
    this.backdrop.setAlpha(0);
    this.tweens.add({ targets: this.ui, alpha: 1, y: cy, duration: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.backdrop, alpha: 0.74, duration: 260 });

    this.input.keyboard.on('keydown-ENTER', () => this._toggleReady());
    this._refresh(true);
  }

  update(time) {
    if (this._closing || this._leaving) return;
    const gm = this.gameScene;
    if (!gm) return;

    // GameScene liberou o mundo (todos prontos, ou entrou com a partida rolando)
    if (!gm.lobbyGateActive) {
      this._close();
      return;
    }
    if (time < this._nextRefreshAt) return;
    this._nextRefreshAt = time + REFRESH_MS;
    this._refresh(false);
  }

  _slotY(i) {
    const top = -88 + SLOT_H / 2;
    return top + i * (SLOT_H + SLOT_GAP);
  }

  _refresh(force) {
    const mp = this.gameScene?.multiplayer;
    if (!mp) return;
    const s = mp.getLobbyState();
    const you = s.players.find((p) => p.you);
    const signature = JSON.stringify([
      s.connected, s.phase, s.hostSeen, s.priv, s.roomCode, s.players,
      s.waitedMs > CONNECT_TIMEOUT_MS
    ]);
    if (!force && signature === this._signature) return;
    this._signature = signature;

    this.codeText.setText(s.roomCode ? String(s.roomCode).toUpperCase() : '-----');
    this.tagText.setText(s.priv ? '[ PARTIDA PRIVADA ]' : '[ PARTIDA PÚBLICA ]');

    // vagas
    this.slotGfx.clear();
    for (let i = 0; i < 4; i++) {
      const p = s.players[i];
      const y = this._slotY(i);
      const filled = Boolean(p);
      this.slotGfx.fillStyle(PANEL_FILL, filled ? 0.9 : 0.45);
      this.slotGfx.fillRect(-SLOT_W / 2, y - SLOT_H / 2, SLOT_W, SLOT_H);
      this.slotGfx.lineStyle(1, p?.ready ? 0x7dffb0 : filled ? BORDER_HOVER : BORDER_IDLE, filled ? 0.9 : 0.5);
      this.slotGfx.strokeRect(-SLOT_W / 2, y - SLOT_H / 2, SLOT_W, SLOT_H);

      if (filled) {
        const tags = `${p.you ? ' (VOCÊ)' : ''}${p.host ? ' [HOST]' : ''}`;
        this.slotNames[i].setText(`JOGADOR ${i + 1}${tags}`).setColor(p.you ? TEXT_HOVER : TEXT_IDLE);
        this.slotStatus[i]
          .setText(p.ready ? 'PRONTO' : 'AGUARDANDO')
          .setColor(p.ready ? READY_COLOR : TEXT_DIM);
      } else {
        this.slotNames[i].setText(`JOGADOR ${i + 1}`).setColor(TEXT_DIM);
        this.slotStatus[i].setText('VAGA ABERTA').setColor(TEXT_DIM);
      }
    }

    // mensagem de estado
    const timedOut = s.waitedMs > CONNECT_TIMEOUT_MS;
    const total = s.players.length;
    const readyCount = s.players.filter((p) => p.ready).length;
    let status;
    let statusColor = TEXT_HOVER;
    if (!s.connected) {
      status = timedOut ? 'SEM CONEXÃO COM O SERVIDOR' : 'CONECTANDO AO SERVIDOR...';
      if (timedOut) statusColor = WARN_COLOR;
    } else if (s.phase === 'syncing') {
      status = timedOut ? 'A SALA NÃO RESPONDEU. SAIA E TENTE DE NOVO.' : 'PROCURANDO A SALA...';
      if (timedOut) statusColor = WARN_COLOR;
    } else if (total < s.min) {
      status = `AGUARDANDO MAIS JOGADORES (${total}/${s.min} MÍNIMO)`;
    } else if (readyCount < total) {
      status = `AGUARDANDO TODOS FICAREM PRONTOS (${readyCount}/${total})`;
    } else {
      status = 'INICIANDO...';
    }
    this.statusText.setText(status).setColor(statusColor);

    // botão PRONTO
    const canReady = s.connected && s.phase === 'waiting';
    this._setButtonLabel(this.readyButton, you?.ready ? 'CANCELAR PRONTO' : 'ESTOU PRONTO');
    this._setButtonEnabled(this.readyButton, canReady);
    this._setButtonAccent(this.readyButton, Boolean(you?.ready));
  }

  _toggleReady() {
    if (this._closing || this._leaving) return;
    const mp = this.gameScene?.multiplayer;
    if (!mp) return;
    const s = mp.getLobbyState();
    if (!s.connected || s.phase !== 'waiting') return;
    const you = s.players.find((p) => p.you);
    mp.setLocalReady(!you?.ready);
    this._safePlay('sfx_ui_click', 0.6);
    this._refresh(true);
  }

  _leave() {
    if (this._leaving || this._closing) return;
    this._leaving = true;
    this._safePlay('sfx_ui_click', 0.6);
    this.tweens.add({ targets: [this.ui, this.backdrop], alpha: 0, duration: 200 });
    this.gameScene?.leaveToMenu();
  }

  _close() {
    if (this._closing) return;
    this._closing = true;
    this.statusText.setText('INICIANDO!').setColor(READY_COLOR);
    this.tweens.add({
      targets: [this.ui, this.backdrop],
      alpha: 0,
      duration: 320,
      delay: 120,
      onComplete: () => this.scene.stop()
    });
  }

  _safePlay(key, volume) {
    try {
      this.sound.play(key, { volume });
    } catch (e) {
      /* sem áudio: segue */
    }
  }

  // ---------- botões (mesma linguagem "placa de terminal" do menu) ----------

  _buildButton(x, y, w, h, label, onSelect) {
    const container = this.add.container(x, y);
    const panel = this.add.graphics();
    const text = this.add
      .text(0, 0, label, { fontFamily: PIXEL_FONT, fontSize: '10px', color: TEXT_IDLE })
      .setOrigin(0.5);
    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    container.add([panel, text, hit]);
    container._b = { panel, text, hit, w, h, hover: false, enabled: true, accent: false };

    const redraw = () => {
      const b = container._b;
      panel.clear();
      let border = b.hover && b.enabled ? BORDER_HOVER : BORDER_IDLE;
      if (b.accent && b.enabled) border = 0x7dffb0;
      this._drawPanel(panel, w, h, border);
      text.setColor(!b.enabled ? TEXT_DIM : b.accent ? READY_COLOR : b.hover ? TEXT_HOVER : TEXT_IDLE);
      container.setAlpha(b.enabled ? 1 : 0.6);
    };
    container._redraw = redraw;
    redraw();

    hit.on('pointerover', () => {
      if (!container._b.enabled) return;
      container._b.hover = true;
      redraw();
      this._safePlay('sfx_hover', 0.5);
    });
    hit.on('pointerout', () => {
      container._b.hover = false;
      redraw();
    });
    hit.on('pointerdown', () => {
      if (!container._b.enabled) return;
      onSelect();
    });
    return container;
  }

  _setButtonLabel(button, label) {
    if (button._b.text.text !== label) button._b.text.setText(label);
  }

  _setButtonEnabled(button, enabled) {
    if (button._b.enabled === enabled) return;
    button._b.enabled = enabled;
    button._redraw();
  }

  _setButtonAccent(button, accent) {
    if (button._b.accent === accent) return;
    button._b.accent = accent;
    button._redraw();
  }

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
    g.fillStyle(PANEL_FILL, 0.92);
    g.fillPoints(points, true);
    g.lineStyle(1, borderColor, 1);
    g.strokePoints(points, true);
  }
}
