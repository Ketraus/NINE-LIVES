import RoomDirectory from '../systems/RoomDirectory.js';
import {
  generateRoomCode,
  hashRoomPassword,
  ROOM_PASSWORD_MIN,
  ROOM_PASSWORD_MAX
} from '../systems/roomConfig.js';
import promptText from './TextPrompt.js';

// Menu de multiplayer estilo "Among Us", dentro do próprio MainMenuScene (o
// fundo/atmosfera continuam; só os painéis trocam, com fade curto):
//   hub    -> CRIAR SALA / ENTRAR EM SALA / VOLTAR
//   create -> código da sala, partida privada + senha, CRIAR
//   browse -> lista de salas abertas (inclusive privadas; pedem senha)
// Usa _buildTerminalButton/_drawPanel do MainMenuScene pra manter o visual.

const PIXEL_FONT = '"Press Start 2P", monospace';
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const PANEL_FILL = 0x061014;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const TEXT_DIM = '#5f808c';
const OK_COLOR = '#7dffb0';
const WARN_COLOR = '#ff8a8a';
const PRIVATE_COLOR = '#ffb347';

const SWITCH_OUT_MS = 120;
const SWITCH_IN_MS = 200;
const ROW_W = 520;
const ROW_H = 30;
const ROW_GAP = 4;
const VISIBLE_ROWS = 5;

export default class RoomMenuUI {
  constructor(scene) {
    this.scene = scene;
    const { width, height } = scene.scale;
    this.cx = width / 2;
    this.height = height;
    this.top = Math.round(height * 0.43); // logo abaixo do título/vidas do menu

    this.container = scene.add.container(0, 0).setVisible(false);
    this.isOpen = false;
    this.screen = null;
    this.directory = null;
    this.scrollIndex = 0;
    this.rowObjects = [];
    this.createState = { code: generateRoomCode(), priv: false, password: null };

    this.screens = {
      hub: this._buildHub(),
      create: this._buildCreate(),
      browse: this._buildBrowse()
    };
    Object.values(this.screens).forEach((screen) => {
      screen.setVisible(false).setAlpha(0);
      this.container.add(screen);
    });

    scene.input.keyboard.on('keydown-ESC', () => {
      if (this.isOpen && this.screen && !scene._transitioning && !scene._roomSwitching) this.back();
    });
    scene.input.on('wheel', (_pointer, _objects, _dx, dy) => {
      if (this.isOpen && this.screen === 'browse') this._scroll(dy > 0 ? 1 : -1);
    });
    scene.events.once('shutdown', () => this._stopDirectory());
  }

  // ---------- abrir / fechar / navegar ----------

  open() {
    this.isOpen = true;
    this.container.setVisible(true);
    this._show('hub');
  }

  close(onDone) {
    const current = this.screens[this.screen];
    this.isOpen = false;
    this._stopDirectory();
    if (!current) {
      this.container.setVisible(false);
      onDone?.();
      return;
    }
    this.scene.tweens.add({
      targets: current,
      alpha: 0,
      duration: SWITCH_OUT_MS,
      onComplete: () => {
        current.setVisible(false);
        this.container.setVisible(false);
        this.screen = null;
        onDone?.();
      }
    });
  }

  back() {
    if (this.screen === 'hub') this.scene._setRoomMenuOpen(false);
    else this._show('hub');
  }

  _show(name) {
    if (this._switching) return;
    const prev = this.screens[this.screen];
    const next = this.screens[name];
    if (prev === next) return;

    if (this.screen === 'browse') this._stopDirectory();

    const enter = () => {
      this.screen = name;
      this._onEnter(name);
      next.setVisible(true).setAlpha(0).setY(10);
      this.scene.tweens.add({
        targets: next,
        alpha: 1,
        y: 0,
        duration: SWITCH_IN_MS,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this._switching = false;
        }
      });
    };

    this._switching = true;
    if (prev) {
      this.scene.tweens.add({
        targets: prev,
        alpha: 0,
        duration: SWITCH_OUT_MS,
        onComplete: () => {
          prev.setVisible(false);
          enter();
        }
      });
    } else {
      enter();
    }
  }

  _onEnter(name) {
    if (name === 'create') {
      this.createState = { code: generateRoomCode(), priv: false, password: null };
      this._refreshCreate();
    } else if (name === 'browse') {
      this.scrollIndex = 0;
      this._setBrowseMessage('');
      this._startDirectory();
      this._renderRooms();
    }
  }

  // ---------- helpers de desenho ----------

  _text(x, y, label, size, color, originX = 0.5) {
    return this.scene.add
      .text(x, y, label, { fontFamily: PIXEL_FONT, fontSize: `${size}px`, color })
      .setOrigin(originX, 0.5);
  }

  _backPanel(h) {
    const g = this.scene.add.graphics();
    g.setPosition(this.cx, this.top - 6 + h / 2);
    this.scene._drawPanel(g, 560, h, BORDER_IDLE);
    return g;
  }

  _button(x, y, w, h, label, onSelect) {
    const b = this.scene._buildTerminalButton(x, y, w, h, label, onSelect);
    b.labelText = b.list[2];
    b.hitArea = b.list[3];
    return b;
  }

  // ---------- hub ----------

  _buildHub() {
    const c = this.scene.add.container(0, 0);
    const by = this.height * 0.6;
    const header = this._text(this.cx, by - 40, 'REDE // MULTIPLAYER', 9, TEXT_DIM);
    c.add([
      header,
      this._button(this.cx, by, 300, 40, 'CRIAR SALA', () => this._show('create')),
      this._button(this.cx, by + 56, 300, 40, 'ENTRAR EM SALA', () => this._show('browse')),
      this._button(this.cx, by + 112, 220, 40, 'VOLTAR', () => this.scene._setRoomMenuOpen(false))
    ]);
    return c;
  }

  // ---------- criar sala ----------

  _buildCreate() {
    const c = this.scene.add.container(0, 0);
    const { cx, top } = this;
    const ui = {};

    ui.title = this._text(cx, top + 14, 'CRIAR SALA', 10, TEXT_HOVER);
    ui.codeLabel = this._text(cx, top + 46, 'CÓDIGO DA SALA', 8, TEXT_DIM);
    ui.code = this._text(cx, top + 76, '-----', 24, '#cfefff').setShadow(0, 0, '#2a8fc0', 12, false, true);
    ui.hint = this._text(cx, top + 102, 'SEUS AMIGOS ENCONTRAM A SALA NA LISTA', 7, TEXT_DIM);
    ui.privBtn = this._button(cx, top + 140, 340, 34, 'PARTIDA PRIVADA: NÃO', () => this._togglePrivate());
    ui.pwBtn = this._button(cx, top + 182, 340, 34, 'SENHA: DEFINIR', () => this._askPassword());
    ui.error = this._text(cx, top + 214, '', 8, WARN_COLOR);
    ui.createBtn = this._button(cx - 112, top + 248, 210, 36, 'CRIAR', () => this._confirmCreate());
    ui.backBtn = this._button(cx + 112, top + 248, 210, 36, 'VOLTAR', () => this._show('hub'));

    c.add([
      this._backPanel(290),
      ui.title, ui.codeLabel, ui.code, ui.hint,
      ui.privBtn, ui.pwBtn, ui.error, ui.createBtn, ui.backBtn
    ]);
    c._ui = ui;
    return c;
  }

  _refreshCreate() {
    const { code, priv, password } = this.createState;
    const ui = this.screens.create._ui;
    ui.code.setText(code);
    ui.privBtn.labelText.setText(`PARTIDA PRIVADA: ${priv ? 'SIM' : 'NÃO'}`);
    ui.pwBtn.setVisible(priv);
    ui.pwBtn.labelText.setText(password ? `SENHA: ${'*'.repeat(Math.min(password.length, 12))}` : 'SENHA: DEFINIR');
    ui.error.setText('');
  }

  _setCreateError(message) {
    this.screens.create._ui.error.setText(message);
  }

  async _togglePrivate() {
    this.createState.priv = !this.createState.priv;
    this._refreshCreate();
    // ao ligar, já pede a senha; se cancelar sem ter uma, volta pra pública
    if (this.createState.priv && !this.createState.password) {
      await this._askPassword();
      if (!this.createState.password) {
        this.createState.priv = false;
        this._refreshCreate();
      }
    }
  }

  async _askPassword() {
    const value = await promptText({
      title: 'SENHA DA SALA',
      hint: `DE ${ROOM_PASSWORD_MIN} A ${ROOM_PASSWORD_MAX} CARACTERES. QUEM QUISER ENTRAR VAI PRECISAR DELA.`,
      password: true,
      maxLength: ROOM_PASSWORD_MAX,
      confirmLabel: 'DEFINIR'
    });
    if (value == null) return;
    const trimmed = value.trim();
    if (trimmed.length < ROOM_PASSWORD_MIN) {
      this._setCreateError(`A SENHA PRECISA TER NO MÍNIMO ${ROOM_PASSWORD_MIN} CARACTERES`);
      return;
    }
    this.createState.password = trimmed;
    this._refreshCreate();
  }

  _confirmCreate() {
    const { code, priv, password } = this.createState;
    if (priv && !password) {
      this._setCreateError('DEFINA UMA SENHA OU DESLIGUE A PARTIDA PRIVADA');
      return;
    }
    this.scene._start(code, true, {
      priv,
      pw: priv ? hashRoomPassword(code, password) : null
    });
  }

  // ---------- entrar em sala ----------

  _buildBrowse() {
    const c = this.scene.add.container(0, 0);
    const { cx, top } = this;
    const ui = {};

    ui.title = this._text(cx - ROW_W / 2, top + 14, 'SALAS ABERTAS', 10, TEXT_HOVER, 0);
    ui.status = this._text(cx + ROW_W / 2, top + 14, 'CONECTANDO...', 8, TEXT_DIM, 1);
    ui.empty = this._text(cx, top + 112, '', 9, TEXT_DIM);
    ui.empty2 = this._text(cx, top + 134, '', 7, TEXT_DIM);
    ui.error = this._text(cx, top + 222, '', 8, WARN_COLOR);
    ui.rows = this.scene.add.container(0, 0);
    ui.up = this._button(cx + ROW_W / 2 + 26, top + 58, 34, 28, '^', () => this._scroll(-1));
    ui.down = this._button(cx + ROW_W / 2 + 26, top + 58 + (VISIBLE_ROWS - 1) * (ROW_H + ROW_GAP) - 4, 34, 28, 'v', () => this._scroll(1));
    ui.backBtn = this._button(cx, top + 252, 220, 36, 'VOLTAR', () => this._show('hub'));
    ui.up.setVisible(false);
    ui.down.setVisible(false);

    c.add([
      this._backPanel(296),
      ui.title, ui.status, ui.empty, ui.empty2, ui.rows, ui.error, ui.up, ui.down, ui.backBtn
    ]);
    c._ui = ui;
    return c;
  }

  _startDirectory() {
    this._stopDirectory();
    this.directory = new RoomDirectory(() => this._renderRooms());
    this.directory.start();
  }

  _stopDirectory() {
    if (!this.directory) return;
    this.directory.stop();
    this.directory = null;
  }

  _scroll(dir) {
    const total = this.directory ? this.directory.getRooms().length : 0;
    const max = Math.max(0, total - VISIBLE_ROWS);
    const next = Phaser.Math.Clamp(this.scrollIndex + dir, 0, max);
    if (next === this.scrollIndex) return;
    this.scrollIndex = next;
    this._renderRooms();
  }

  _setBrowseMessage(message) {
    this.screens.browse._ui.error.setText(message);
  }

  _renderRooms() {
    const ui = this.screens.browse._ui;
    if (!ui || this.screen !== 'browse') return;

    this.rowObjects.forEach((row) => row.destroy());
    this.rowObjects = [];

    const status = this.directory?.status ?? 'connecting';
    const rooms = this.directory ? this.directory.getRooms() : [];
    const maxScroll = Math.max(0, rooms.length - VISIBLE_ROWS);
    this.scrollIndex = Phaser.Math.Clamp(this.scrollIndex, 0, maxScroll);

    if (status === 'online') ui.status.setText('ONLINE').setColor(OK_COLOR);
    else if (status === 'error') ui.status.setText('SEM CONEXÃO').setColor(WARN_COLOR);
    else ui.status.setText('CONECTANDO...').setColor(TEXT_DIM);

    if (rooms.length === 0) {
      if (status === 'online') {
        ui.empty.setText('NENHUMA SALA ABERTA NO MOMENTO');
        ui.empty2.setText('CRIE UMA E CONVIDE ALGUÉM');
      } else if (status === 'error') {
        ui.empty.setText('NÃO FOI POSSÍVEL CONECTAR AO SERVIDOR');
        ui.empty2.setText('VERIFIQUE A INTERNET E TENTE DE NOVO');
      } else {
        ui.empty.setText('PROCURANDO SALAS...');
        ui.empty2.setText('');
      }
    } else {
      ui.empty.setText('');
      ui.empty2.setText('');
    }

    const visible = rooms.slice(this.scrollIndex, this.scrollIndex + VISIBLE_ROWS);
    visible.forEach((entry, i) => {
      const y = this.top + 58 + i * (ROW_H + ROW_GAP);
      const row = this._buildRow(entry, y);
      ui.rows.add(row);
      this.rowObjects.push(row);
    });

    const overflow = rooms.length > VISIBLE_ROWS;
    ui.up.setVisible(overflow && this.scrollIndex > 0);
    ui.down.setVisible(overflow && this.scrollIndex < maxScroll);
  }

  _buildRow(entry, y) {
    const scene = this.scene;
    const full = entry.players >= entry.max;
    const row = scene.add.container(this.cx, y);

    const g = scene.add.graphics();
    const draw = (hover) => {
      g.clear();
      g.fillStyle(PANEL_FILL, hover ? 0.95 : 0.7);
      g.fillRect(-ROW_W / 2, -ROW_H / 2, ROW_W, ROW_H);
      g.lineStyle(1, hover && !full ? BORDER_HOVER : BORDER_IDLE, full ? 0.5 : 1);
      g.strokeRect(-ROW_W / 2, -ROW_H / 2, ROW_W, ROW_H);
    };
    draw(false);

    const nameColor = full ? TEXT_DIM : TEXT_HOVER;
    const name = this._text(-ROW_W / 2 + 14, 0, `SALA ${entry.room}`, 10, nameColor, 0);
    const kind = this._text(-70, 0, entry.priv ? 'PRIVADA' : 'PÚBLICA', 8, entry.priv ? PRIVATE_COLOR : TEXT_DIM, 0);
    const count = this._text(ROW_W / 2 - 110, 0, `${entry.players}/${entry.max}`, 10, full ? WARN_COLOR : OK_COLOR, 1);
    const stateLabel = full ? 'CHEIA' : entry.phase === 'playing' ? 'EM JOGO' : 'LOBBY';
    const stateColor = full ? WARN_COLOR : entry.phase === 'playing' ? PRIVATE_COLOR : TEXT_IDLE;
    const state = this._text(ROW_W / 2 - 14, 0, stateLabel, 8, stateColor, 1);

    const hit = scene.add.rectangle(0, 0, ROW_W, ROW_H, 0xffffff, 0).setInteractive({ useHandCursor: !full });
    hit.on('pointerover', () => {
      draw(true);
      if (!full) scene.sound.play('sfx_hover', { volume: 0.5 });
    });
    hit.on('pointerout', () => draw(false));
    hit.on('pointerdown', () => {
      scene.sound.play('sfx_ui_click', { volume: 0.6 });
      this._joinRoom(entry);
    });

    row.add([g, name, kind, count, state, hit]);
    return row;
  }

  async _joinRoom(entry) {
    if (this.scene._transitioning || this._joining) return;
    if (entry.players >= entry.max) {
      this._setBrowseMessage('ESSA SALA JÁ ESTÁ CHEIA (4/4)');
      return;
    }
    this._setBrowseMessage('');
    if (!entry.priv) {
      this.scene._start(entry.room, false, { priv: false, pw: null });
      return;
    }

    this._joining = true;
    const value = await promptText({
      title: `SALA ${entry.room}`,
      hint: 'PARTIDA PRIVADA. DIGITE A SENHA PARA ENTRAR.',
      password: true,
      maxLength: ROOM_PASSWORD_MAX,
      confirmLabel: 'ENTRAR'
    });
    this._joining = false;
    if (value == null) return;

    const hash = hashRoomPassword(entry.room, value.trim());
    this.scene._start(entry.room, false, { priv: true, pw: hash });
  }
}
