import EventBus from '../systems/EventBus.js';
import weaponsData from '../../data/weapons.js';
import upgradesData from '../../data/upgrades.js';
import { UI_SCALE, anchorToScreen, getUiSize } from '../config/layout.js';

const BTN_RADIUS = 16;
const BTN_HIT_RADIUS_DESKTOP = 22;
const BTN_HIT_RADIUS_TOUCH = 26;
const BTN_W = 220;
const BTN_H = 40;
const BTN_GAP = 48;

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

// ---------- tela de build ----------
// Layout em "pixels de design" (ver config/layout.js): o painel é centrado e
// escalado por UI_SCALE, então 1 unidade aqui ≈ 1,125px reais. Três colunas
// (arma/atributos | cartas | detalhe da carta) + faixa de habilidades embaixo.
// Regra da tela: nenhuma fonte abaixo de 8px de design e quase tudo em 9-12px
// (antes era 6-8px, ilegível), com texto renderizado em resolução alta.
const BUILD_PANEL_W = 872;
const BUILD_PANEL_H = 488;
const BUILD_COL_TOP = -182;
const BUILD_COL_H = 328;
const BUILD_LEFT_X = -320;
const BUILD_LEFT_W = 200;
const BUILD_CARDS_X = -10;
const BUILD_CARDS_W = 400;
const BUILD_DETAIL_X = 310;
const BUILD_DETAIL_W = 220;
const BUILD_FOOTER_Y = 192;
const BUILD_FOOTER_H = 72;
const BUILD_CONTENT_TOP = BUILD_COL_TOP + 37;
const BUILD_LIST_H = 283;
const BUILD_ROW_W = 368;
const BUILD_ROW_H = 40;
const BUILD_ROW_GAP = 4;
const BUILD_LIST_CX = BUILD_CARDS_X - 6;
const BUILD_TRACK_X = BUILD_CARDS_X + BUILD_CARDS_W / 2 - 9;
const BUILD_TEXT_RES = 3;
const BUILD_EVOLUTION_GOLD = 0xffd166;
const BUILD_RARITY_COLORS = {
  common: 0xe6e6e6,
  rare: 0x4fd1ff,
  epic: 0xb26bff
};
const BUILD_RARITY_TEXT = {
  common: 'COMUM',
  rare: 'RARA',
  epic: 'EPICA'
};
const BUILD_RARITY_ORDER = { epic: 0, rare: 1, common: 2 };
const TEXT_DIM = '#6f8c98';
const TEXT_GOOD = '#7cfc9c';
const TEXT_BAD = '#ff8a7a';
const TEXT_GOLD = '#ffd166';
const WEAPON_CARD_TEXTURES = {
  fists: 'card_fists',
  katana: 'card_katana',
  pistol: 'card_pistol'
};
const ABILITY_LABELS = {
  slam: 'Pancada Sísmica',
  shockwave: 'Shockwave',
  doubleStrike: 'Multi-Blade',
  shuriken: 'Shuriken',
  drone: 'GatoDrone',
  fragmentation: 'Split Bullet',
  allyDog: 'Purificação',
  tornadoWalk: 'Tornado',
  auraShock: 'Sobrecarga',
  energyShield: 'Barreira',
  smartShot: 'Smartshot',
  chainShot: 'Instinto Caçador',
  danceOfCuts: 'Dança de Cortes'
};

// Menu de pausa. Dois pedaços:
export default class PauseUI {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.buildOpen = false;
    this.isWaitingForPlayer = false;

    this._buildButton();
    this._buildWaitingMessage();
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
    // pixels de design (ver config/layout.js): colado na borda direita da tela
    const x = getUiSize(this.scene).w - 40;
    const y = 32;
    const hitRadius = this.scene.sys.game.device.input.touch
      ? BTN_HIT_RADIUS_TOUCH
      : BTN_HIT_RADIUS_DESKTOP;

    this.buttonContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(120);
    this._applyZoomCompensation(this.buttonContainer);

    const bg = this.scene.add
      .circle(x, y, BTN_RADIUS, 0x000000, 0.5)
      .setStrokeStyle(1, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setInteractive(
        new Phaser.Geom.Circle(0, 0, hitRadius),
        Phaser.Geom.Circle.Contains,
        { useHandCursor: true }
      );
    const bar1 = this.scene.add.rectangle(x - 4, y, 3, 14, 0xffffff).setScrollFactor(0);
    const bar2 = this.scene.add.rectangle(x + 4, y, 3, 14, 0xffffff).setScrollFactor(0);

    bg.on('pointerover', () => bg.setFillStyle(0x000000, 0.7));
    bg.on('pointerout', () => bg.setFillStyle(0x000000, 0.5));
    // mesmo fluxo do ESC (ver _buildInput no GameScene) — os dois só chamam toggle()
    bg.on('pointerdown', () => this.toggle());

    this.toggleBg = bg; // guardado pra desabilitar clique enquanto a Settings overlay está aberta (ver _openSettings)
    this.buttonContainer.add([bg, bar1, bar2]);
  }

  _buildWaitingMessage() {
    const { width } = this.scene.scale;
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    // posição de MUNDO que cai no ponto (width/2, 72*UI_SCALE) da tela com o zoom aplicado
    const worldX = cam.centerX + (width / 2 - cam.centerX) / zoom;
    const worldY = cam.centerY + (72 * UI_SCALE - cam.centerY) / zoom;
    this.waitingText = this.scene.add
      .text(worldX, worldY, 'ESPERANDO O SEGUNDO JOGADOR', {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: TEXT_HOVER,
        stroke: '#061014',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setScale(UI_SCALE / zoom)
      .setDepth(200)
      .setVisible(false);
  }

  setWaitingForPlayer(waiting) {
    if (this.isWaitingForPlayer === waiting) return;
    this.isWaitingForPlayer = waiting;
    this.scene.tweens.killTweensOf(this.waitingText);
    this.waitingText.setVisible(waiting).setAlpha(1);
    if (waiting) {
      this.waitingBlink = this.scene.tweens.add({
        targets: this.waitingText,
        alpha: { from: 1, to: 0.25 },
        duration: 550,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  // Painel construído centrado na própria origem do container (0,0 local =
  // centro da tela) pra que o scale-in/out da entrada/saída cresça a partir
  // do centro, e não "escorregue" de um canto.
  _buildPanel() {
    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.panelContainer = this.scene.add.container(cx, cy).setScrollFactor(0).setDepth(250).setVisible(false).setScale(UI_SCALE);

    // overlay escurece a gameplay mas mantém ela visível ao fundo
    const overlay = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.72)
      .setScrollFactor(0)
      .setInteractive(); // bloqueia clique vazando pro jogo por baixo

    this.pauseTitle = this.scene.add
      .text(0, -120, 'PAUSADO', {
        fontFamily: PIXEL_FONT,
        fontSize: '26px',
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 2, false, true)
      .setScrollFactor(0);

    this.panelContainer.add([overlay, this.pauseTitle]);

    // agrupa os botões principais (+ frame/readout) pra poder escondê-los
    // juntos quando o diálogo de confirmação abrir por cima (ver _showQuitConfirm)
    this.mainButtonsGroup = this.scene.add.container(0, 0);
    this.panelContainer.add(this.mainButtonsGroup);

    const buttonYs = [-20, -20 + BTN_GAP, -20 + BTN_GAP * 2, -20 + BTN_GAP * 3];
    this.mainButtonsGroup.add(this._buildTerminalButton(0, buttonYs[0], 'CONTINUAR', () => this.toggle()));
    this.mainButtonsGroup.add(this._buildTerminalButton(0, buttonYs[1], 'MINHA BUILD', () => this._showBuild()));
    this.mainButtonsGroup.add(this._buildTerminalButton(0, buttonYs[2], 'SETTINGS', () => this._openSettings()));
    this.mainButtonsGroup.add(this._buildTerminalButton(0, buttonYs[3], 'MENU INICIAL', () => this._showQuitConfirm()));

    // só existe em dispositivo touch com suporte à Fullscreen API — mesma
    if (this.scene.sys.game.device.input.touch && this.scene.scale.fullscreen.available) {
      const y = -20 + BTN_GAP * 4;
      buttonYs.push(y);
      this.fullscreenButton = this._buildTerminalButton(0, y, '', () => this._toggleFullscreen());
      this._refreshFullscreenButton();
      this.mainButtonsGroup.add(this.fullscreenButton);
    }

    this._buildTechDetails(buttonYs);
    this._buildBuildScreen();
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

  // ---------- tela de build ----------

  _hex(color) {
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  // Texto da tela de build: fonte pixel, resolução alta (sem borrar com a
  // escala da UI) e origem configurável.
  _bt(x, y, value, size, color, { ox = 0, oy = 0.5, wrap = 0, align = 'left', spacing = 0 } = {}) {
    const style = { fontFamily: PIXEL_FONT, fontSize: `${size}px`, color, align };
    if (wrap) style.wordWrap = { width: wrap };
    if (spacing) style.lineSpacing = spacing;
    return this.scene.add
      .text(x, y, value, style)
      .setOrigin(ox, oy)
      .setResolution(BUILD_TEXT_RES)
      .setScrollFactor(0);
  }

  // Placa com cantos cortados em coordenadas absolutas (x/y = canto sup. esq.)
  _drawPlate(g, x, y, w, h, { fill = PANEL_FILL, alpha = 0.9, border = BORDER_IDLE, borderAlpha = 1, chamfer = CHAMFER } = {}) {
    const c = chamfer;
    const pts = [
      { x: x + c, y },
      { x: x + w - c, y },
      { x: x + w, y: y + c },
      { x: x + w, y: y + h - c },
      { x: x + w - c, y: y + h },
      { x: x + c, y: y + h },
      { x, y: y + h - c },
      { x, y: y + c }
    ];
    g.fillStyle(fill, alpha);
    g.fillPoints(pts, true);
    g.lineStyle(1, border, borderAlpha);
    g.strokePoints(pts, true);
  }

  _buildBuildScreen() {
    this.buildContainer = this.scene.add.container(0, 0).setVisible(false).setAlpha(0);

    const px = -BUILD_PANEL_W / 2;
    const py = -BUILD_PANEL_H / 2;

    const frame = this.scene.add.graphics().setScrollFactor(0);
    this._drawPlate(frame, px, py, BUILD_PANEL_W, BUILD_PANEL_H, { fill: 0x03080b, alpha: 0.95, chamfer: 14 });
    // moldura interna fina + colchetes de canto (assinatura "terminal")
    frame.lineStyle(1, BORDER_IDLE, 0.35);
    frame.strokeRect(px + 6, py + 6, BUILD_PANEL_W - 12, BUILD_PANEL_H - 12);
    frame.lineStyle(2, BORDER_HOVER, 0.9);
    const tick = 18;
    [
      [px + 4, py + 4, 1, 1],
      [-px - 4, py + 4, -1, 1],
      [px + 4, -py - 4, 1, -1],
      [-px - 4, -py - 4, -1, -1]
    ].forEach(([x, y, dx, dy]) => {
      frame.beginPath();
      frame.moveTo(x, y + tick * dy);
      frame.lineTo(x, y);
      frame.lineTo(x + tick * dx, y);
      frame.strokePath();
    });

    const title = this._bt(px + 26, -226, 'BUILD // LOADOUT', 18, '#cfefff').setShadow(2, 2, '#000000', 2, false, true);
    this.buildSubtitle = this._bt(px + 26, -205, 'CONFIGURAÇÃO DA RUN ATUAL', 9, TEXT_IDLE);
    const rule = this.scene.add.graphics().setScrollFactor(0);
    rule.lineStyle(1, BORDER_IDLE, 0.8);
    rule.lineBetween(px + 20, -192, -px - 20, -192);

    this.buildContainer.add([frame, title, this.buildSubtitle, rule]);

    this.buildSections = {
      left: this._buildBuildSection(BUILD_LEFT_X, BUILD_LEFT_W, 'ARMAMENTO'),
      center: this._buildBuildSection(BUILD_CARDS_X, BUILD_CARDS_W, 'CARTAS ATIVAS'),
      right: this._buildBuildSection(BUILD_DETAIL_X, BUILD_DETAIL_W, 'DETALHES')
    };

    // rodapé: habilidades ativas
    const footer = this.scene.add.graphics().setScrollFactor(0);
    this._drawPlate(footer, -420, BUILD_FOOTER_Y - BUILD_FOOTER_H / 2, 840, BUILD_FOOTER_H, { fill: 0x081318, alpha: 0.9 });
    this.buildContainer.add(footer);
    this.buildContainer.add(this._bt(-406, BUILD_FOOTER_Y - BUILD_FOOTER_H / 2 + 15, 'HABILIDADES ATIVAS', 10, TEXT_HOVER));

    this.buildLeftDynamic = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildDetailDynamic = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildFooterDynamic = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildOverlay = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildListContent = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildListViewport = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildListViewport.add(this.buildListContent);

    // Máscara fixa: só a lista rola; cabeçalho, moldura e contador ficam parados.
    const maskGraphics = this.scene.make.graphics({ x: 0, y: 0, add: false });
    const rect = this._getBuildListScreenRect();
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(rect.left, rect.top, rect.width, rect.height);
    this.buildListMaskGraphics = maskGraphics;
    this.buildListViewport.setMask(maskGraphics.createGeometryMask());

    const track = this.scene.add
      .rectangle(BUILD_TRACK_X, BUILD_CONTENT_TOP + BUILD_LIST_H / 2, 3, BUILD_LIST_H, 0x1c2e36, 0.9)
      .setScrollFactor(0);
    this.buildScrollTrack = track;
    this.buildScrollThumb = this.scene.add
      .rectangle(BUILD_TRACK_X, BUILD_CONTENT_TOP, 5, 30, BORDER_HOVER, 0.95)
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    this.buildContainer.add([
      this.buildLeftDynamic,
      this.buildListViewport,
      track,
      this.buildScrollThumb,
      this.buildOverlay,
      this.buildDetailDynamic,
      this.buildFooterDynamic
    ]);

    this.buildScrollY = 0;
    this.buildMaxScroll = 0;
    this.buildContentHeight = 0;
    this.buildDragging = false;
    this.buildRows = [];
    this.buildEntries = [];
    this.buildSelectedId = null;

    this._onBuildWheel = (pointer, _objects, _dx, deltaY) => {
      if (!this.buildOpen || !this._isPointerInBuildList(pointer)) return;
      this._setBuildScroll(this.buildScrollY - (deltaY * 0.65) / UI_SCALE);
    };
    this._onBuildPointerDown = (pointer) => {
      if (!this.buildOpen || !this._isPointerInBuildList(pointer)) return;
      this.buildDragging = true;
      this.buildDragStartY = pointer.y;
      this.buildDragStartScroll = this.buildScrollY;
    };
    this._onBuildPointerMove = (pointer) => {
      if (!this.buildDragging) return;
      this._setBuildScroll(this.buildDragStartScroll + (pointer.y - this.buildDragStartY) / UI_SCALE);
    };
    this._onBuildPointerUp = () => {
      this.buildDragging = false;
    };
    this.scene.input.on('wheel', this._onBuildWheel);
    this.scene.input.on('pointerdown', this._onBuildPointerDown);
    this.scene.input.on('pointermove', this._onBuildPointerMove);
    this.scene.input.on('pointerup', this._onBuildPointerUp);

    // teclado: setas/W/S percorrem a lista (ESC já volta, ver toggle())
    this._onBuildKeyUp = () => this._moveBuildSelection(-1);
    this._onBuildKeyDown = () => this._moveBuildSelection(1);
    const kb = this.scene.input.keyboard;
    if (kb) {
      ['UP', 'W'].forEach((k) => kb.on(`keydown-${k}`, this._onBuildKeyUp));
      ['DOWN', 'S'].forEach((k) => kb.on(`keydown-${k}`, this._onBuildKeyDown));
    }

    this.buildBackButton = this._buildTerminalButton(
      BUILD_PANEL_W / 2 - 26 - 65,
      -216,
      'VOLTAR',
      () => this._hideBuild(),
      130,
      32
    );
    this.buildContainer.add(this.buildBackButton);
    this.panelContainer.add(this.buildContainer);
  }

  _buildBuildSection(cx, width, label) {
    const x0 = cx - width / 2;
    const panel = this.scene.add.graphics().setScrollFactor(0);
    this._drawPlate(panel, x0, BUILD_COL_TOP, width, BUILD_COL_H, { fill: 0x081318, alpha: 0.9 });
    // faixa do cabeçalho da seção
    panel.fillStyle(0x0e2630, 0.9);
    panel.fillRect(x0 + 1, BUILD_COL_TOP + 1, width - 2, 28);
    panel.lineStyle(1, BORDER_IDLE, 0.9);
    panel.lineBetween(x0, BUILD_COL_TOP + 29, x0 + width, BUILD_COL_TOP + 29);
    panel.fillStyle(BORDER_HOVER, 1);
    panel.fillRect(x0 + 10, BUILD_COL_TOP + 11, 6, 6);

    const title = this._bt(x0 + 24, BUILD_COL_TOP + 15, label, 10, TEXT_HOVER);
    this.buildContainer.add([panel, title]);
    return { panel, title, x0, width };
  }

  _showBuild() {
    if (!this.isOpen || this._quitting || this.buildOpen) return;
    this.buildOpen = true;
    this._resetQuitConfirm();
    this._renderBuildScreen();

    this.mainButtonsGroup.setVisible(false);
    this.pauseTitle.setVisible(false);
    this._setPauseCameraFx(false);
    this.scene.tweens.killTweensOf(this.buildContainer);
    // só fade: a máscara da lista é fixa na tela, então não escalamos o container
    this.buildContainer.setVisible(true).setAlpha(0);
    this.scene.tweens.add({
      targets: this.buildContainer,
      alpha: 1,
      duration: ENTER_MS,
      ease: 'Cubic.easeOut'
    });

    // linhas entram em cascata curta
    this.buildRows.forEach((row, i) => {
      row.container.setAlpha(0);
      this.scene.tweens.add({
        targets: row.container,
        alpha: 1,
        delay: 60 + Math.min(i, 10) * 22,
        duration: 150,
        ease: 'Sine.easeOut'
      });
    });
  }

  _hideBuild(instant = false) {
    if (!this.buildOpen) return;
    this.buildOpen = false;
    this.buildDragging = false;
    this.scene.tweens.killTweensOf(this.buildContainer);
    this.pauseTitle.setVisible(true);
    this.mainButtonsGroup.setVisible(true).setAlpha(instant ? 1 : 0);
    this._setPauseCameraFx(true);

    if (instant) {
      this.buildContainer.setVisible(false).setAlpha(0);
      return;
    }

    this.buildContainer.setVisible(true).setAlpha(1);
    this.scene.tweens.add({
      targets: this.buildContainer,
      alpha: 0,
      duration: EXIT_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => this.buildContainer.setVisible(false)
    });
    this.scene.tweens.add({
      targets: this.mainButtonsGroup,
      alpha: 1,
      duration: EXIT_MS,
      ease: 'Cubic.easeOut'
    });
  }

  _renderBuildScreen() {
    if (!this.buildListContent) return;
    this.buildLeftDynamic.removeAll(true);
    this.buildDetailDynamic.removeAll(true);
    this.buildFooterDynamic.removeAll(true);
    this.buildOverlay.removeAll(true);
    this.buildListContent.removeAll(true);
    this.buildRows = [];

    const state = this.scene.runState;
    const player = this.scene.player;
    const weapon = weaponsData.find((item) => item.id === state.weaponId) || weaponsData[0];

    const seconds = Math.floor((this.scene.spawnDirector?.getElapsedMs?.() || 0) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    this.buildSubtitle.setText(`CONFIGURAÇÃO DA RUN ATUAL   TEMPO ${mm}:${ss}`);

    this._renderBuildWeapon(weapon, state, player);
    this._renderBuildCards(state);
    this._renderBuildAbilities(state);
  }

  // ----- coluna esquerda: arma + atributos -----

  _renderBuildWeapon(weapon, state, player) {
    const g = this.buildLeftDynamic;
    const x0 = BUILD_LEFT_X - BUILD_LEFT_W / 2 + 12;
    const x1 = BUILD_LEFT_X + BUILD_LEFT_W / 2 - 12;
    const top = BUILD_CONTENT_TOP;
    const innerW = x1 - x0;

    // arte da classe (miniatura nítida da carta) com moldura
    const artKey = WEAPON_CARD_TEXTURES[weapon.id];
    const artW = 56;
    const artH = 77;
    const frame = this.scene.add.graphics().setScrollFactor(0);
    frame.lineStyle(1, BORDER_HOVER, 0.9);
    frame.strokeRect(x0 - 1, top - 1, artW + 2, artH + 2);
    g.add(frame);
    if (artKey && this.scene.textures.exists(artKey)) {
      g.add(this.scene.add.image(x0 + artW / 2, top + artH / 2, artKey).setDisplaySize(artW, artH).setScrollFactor(0));
    }

    const tx = x0 + artW + 10;
    g.add(this._bt(tx, top + 8, weapon.name.toUpperCase(), 11, TEXT_HOVER, { wrap: x1 - tx }));
    g.add(this._bt(tx, top + 24, weapon.type === 'ranged' ? 'DISTÂNCIA' : 'CORPO A CORPO', 8, TEXT_DIM));
    g.add(this._bt(tx, top + 46, `NV ${state.level}`, 15, '#8fd6ff'));
    g.add(this._bt(tx, top + 65, `ABATES ${state.kills}`, 9, TEXT_GOOD));

    // barra de XP
    let y = top + artH + 14;
    g.add(this._bt(x0, y, 'XP', 9, TEXT_IDLE));
    g.add(this._bt(x1, y, `${state.xp}/${state.xpToNext}`, 9, TEXT_HOVER, { ox: 1 }));
    y += 12;
    this._addBuildBar(g, x0, y, innerW, 6, state.xp / Math.max(1, state.xpToNext), 0x8fd6ff);

    // stats da arma (base > atual)
    y += 18;
    const dmgNow = Math.round(weapon.damage * (1 + state.damageMultiplier));
    const rngNow = Math.round(weapon.range * (1 + state.rangeMultiplier));
    const cdNow = Math.max(1, Math.round(weapon.cooldownMs * (1 - state.cooldownMultiplier)));
    [
      ['DANO', weapon.damage, dmgNow, true],
      ['ALCANCE', weapon.range, rngNow, true],
      ['RECARGA', weapon.cooldownMs, cdNow, false]
    ].forEach(([label, base, now, higherIsBetter]) => {
      g.add(this._bt(x0, y, label, 9, TEXT_IDLE));
      const better = higherIsBetter ? now > base : now < base;
      const worse = higherIsBetter ? now < base : now > base;
      const nowText = this._bt(x1, y, `${now}`, 10, better ? TEXT_GOOD : worse ? TEXT_BAD : TEXT_HOVER, { ox: 1 });
      g.add(nowText);
      if (now !== base) {
        g.add(this._bt(x1 - nowText.width - 6, y, `${base} >`, 8, TEXT_DIM, { ox: 1 }));
      }
      y += 17;
    });

    // divisória
    y += 2;
    const line = this.scene.add.graphics().setScrollFactor(0);
    line.lineStyle(1, BORDER_IDLE, 0.7);
    line.lineBetween(x0, y, x1, y);
    g.add(line);
    y += 14;

    // vida (com barra)
    const hp = player?.healthSystem;
    const hpNow = Math.ceil(hp?.current ?? 0);
    const hpMax = Math.max(1, Math.ceil(hp?.maxHp ?? 1));
    g.add(this._bt(x0, y, 'VIDA', 9, TEXT_IDLE));
    g.add(this._bt(x1, y, `${hpNow}/${hpMax}`, 10, TEXT_HOVER, { ox: 1 }));
    this._addBuildBar(g, x0, y + 9, innerW, 5, hpNow / hpMax, 0x7cfc9c);
    y += 28;

    const pct = (v, sign = '+') => `${v > 0 ? sign : v < 0 ? '-' : ''}${Math.abs(Math.round(v * 100))}%`;
    const attrs = [
      ['VELOCIDADE', pct(state.speedMultiplier), state.speedMultiplier > 0 ? TEXT_GOOD : state.speedMultiplier < 0 ? TEXT_BAD : TEXT_DIM],
      ['REDUÇÃO', pct(state.damageReductionFraction, '-'), state.damageReductionFraction > 0 ? TEXT_GOOD : TEXT_DIM],
      ['DESVIO', `${Math.round(state.dodgeChance * 100)}%`, state.dodgeChance > 0 ? TEXT_GOOD : TEXT_DIM],
      ['ESPINHOS', `${Math.round(state.thornsDamage)}`, state.thornsDamage > 2 ? TEXT_GOOD : TEXT_HOVER],
      ['ROUBO VIDA', `${Math.round(state.lifestealFraction * 100)}%`, state.lifestealFraction > 0 ? TEXT_GOOD : TEXT_DIM]
    ];
    attrs.forEach(([label, value, color]) => {
      g.add(this._bt(x0, y, label, 9, TEXT_IDLE));
      g.add(this._bt(x1, y, value, 10, color, { ox: 1 }));
      y += 17;
    });
  }

  _addBuildBar(container, x, y, w, h, ratio, color) {
    const bar = this.scene.add.graphics().setScrollFactor(0);
    bar.fillStyle(0x1c2e36, 1);
    bar.fillRect(x, y, w, h);
    const fill = Phaser.Math.Clamp(ratio, 0, 1);
    if (fill > 0) {
      bar.fillStyle(color, 1);
      bar.fillRect(x, y, Math.max(2, Math.round(w * fill)), h);
    }
    bar.lineStyle(1, BORDER_IDLE, 0.9);
    bar.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    container.add(bar);
  }

  // ----- coluna central: lista de cartas -----

  _getBuildEntries(state) {
    return [...state.ownedUpgradeIds]
      .map((id) => upgradesData.find((upgrade) => upgrade.id === id))
      .filter(Boolean)
      .map((upgrade) => ({
        upgrade,
        count: state.upgradeCounts[upgrade.id] || 1,
        isEvolution: upgrade.category === 'evolution',
        rarity: upgrade.rarity || 'common'
      }))
      .sort((a, b) => {
        if (a.isEvolution !== b.isEvolution) return a.isEvolution ? -1 : 1;
        const byRarity = (BUILD_RARITY_ORDER[a.rarity] ?? 3) - (BUILD_RARITY_ORDER[b.rarity] ?? 3);
        return byRarity || this._buildUpgradeName(a.upgrade).localeCompare(this._buildUpgradeName(b.upgrade));
      });
  }

  _renderBuildCards(state) {
    const entries = this._getBuildEntries(state);
    this.buildEntries = entries;

    const contentHeight = entries.length * (BUILD_ROW_H + BUILD_ROW_GAP) - (entries.length ? BUILD_ROW_GAP : 0);
    this.buildContentHeight = contentHeight;
    this.buildMaxScroll = Math.max(0, contentHeight - BUILD_LIST_H);
    this.buildScrollY = 0;
    this._setBuildScroll(0);

    const evoCount = entries.filter((e) => e.isEvolution).length;
    const countLabel = this._bt(
      BUILD_CARDS_X + BUILD_CARDS_W / 2 - 14,
      BUILD_COL_TOP + 15,
      evoCount ? `${entries.length} ITENS  ${evoCount} EVO` : `${entries.length} ITENS`,
      9,
      evoCount ? TEXT_GOLD : TEXT_IDLE,
      { ox: 1 }
    );
    this.buildOverlay.add(countLabel);

    if (entries.length === 0) {
      this.buildOverlay.add(
        this._bt(BUILD_CARDS_X, BUILD_CONTENT_TOP + 120, 'NENHUMA CARTA AINDA', 11, TEXT_IDLE, { ox: 0.5 }),
      );
      this.buildOverlay.add(
        this._bt(BUILD_CARDS_X, BUILD_CONTENT_TOP + 146, 'SUBA DE NIVEL PARA\nESCOLHER SUAS CARTAS', 9, TEXT_DIM, { ox: 0.5, align: 'center', spacing: 6 })
      );
      this.buildSelectedId = null;
      this._renderBuildDetail(null);
      return;
    }

    entries.forEach((entry, index) => {
      const row = this._buildBuildRow(entry, index);
      this.buildListContent.add(row.container);
      this.buildRows.push(row);
    });

    const keep = entries.findIndex((e) => e.upgrade.id === this.buildSelectedId);
    this._selectBuildEntry(keep >= 0 ? keep : 0, { sound: false });
  }

  _buildBuildRow(entry, index) {
    const { upgrade, count, isEvolution, rarity } = entry;
    const accent = isEvolution ? BUILD_EVOLUTION_GOLD : BUILD_RARITY_COLORS[rarity] || BUILD_RARITY_COLORS.common;
    const accentText = this._hex(accent);
    const w = BUILD_ROW_W;
    const h = BUILD_ROW_H;
    const y = BUILD_CONTENT_TOP + index * (BUILD_ROW_H + BUILD_ROW_GAP) + h / 2;
    const container = this.scene.add.container(BUILD_LIST_CX, y).setScrollFactor(0);

    const bg = this.scene.add.graphics().setScrollFactor(0);
    const draw = (selected) => {
      bg.clear();
      bg.fillStyle(selected ? 0x12303b : 0x0a1a21, selected ? 1 : 0.9);
      bg.fillRect(-w / 2, -h / 2, w, h);
      bg.lineStyle(1, selected ? accent : BORDER_IDLE, selected ? 1 : 0.7);
      bg.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
      bg.fillStyle(accent, selected ? 1 : 0.75);
      bg.fillRect(-w / 2, -h / 2, 4, h);
      if (selected) {
        bg.fillStyle(accent, 0.1);
        bg.fillRect(-w / 2 + 4, -h / 2 + 1, w - 5, h - 2);
      }
    };
    draw(false);
    container.add(bg);

    // mini carta
    const artKey = this._getBuildArtKey(upgrade);
    const thumbH = 32;
    const thumbX = -w / 2 + 4 + 8 + 12;
    if (artKey) {
      const tex = this.scene.textures.get(artKey).getSourceImage();
      const aspect = tex && tex.height ? tex.width / tex.height : 0.61;
      const thumb = this.scene.add.image(thumbX, 0, artKey).setDisplaySize(Math.round(thumbH * aspect), thumbH).setScrollFactor(0);
      const thumbFrame = this.scene.add.graphics().setScrollFactor(0);
      thumbFrame.lineStyle(1, accent, 0.9);
      thumbFrame.strokeRect(thumbX - (thumbH * aspect) / 2, -thumbH / 2, thumbH * aspect, thumbH);
      container.add([thumb, thumbFrame]);
    } else {
      const diamond = this.scene.add.graphics().setScrollFactor(0);
      diamond.fillStyle(accent, 1);
      diamond.fillPoints([{ x: thumbX, y: -7 }, { x: thumbX + 7, y: 0 }, { x: thumbX, y: 7 }, { x: thumbX - 7, y: 0 }], true);
      container.add(diamond);
    }

    const textX = -w / 2 + 48;
    const name = this._shortBuildText(this._buildUpgradeName(upgrade), 21);
    container.add(this._bt(textX, -7, name, 10, TEXT_HOVER));
    const tag = isEvolution ? 'EVOLUÇÃO' : BUILD_RARITY_TEXT[rarity] || 'COMUM';
    const exclusive = upgrade.weaponId ? ' EXCLUSIVA' : '';
    container.add(this._bt(textX, 9, tag + exclusive, 8, accentText));

    // lado direito: pips de cópias ou selo EVO
    const rx = w / 2 - 10;
    if (isEvolution) {
      const chip = this.scene.add.graphics().setScrollFactor(0);
      chip.lineStyle(1, BUILD_EVOLUTION_GOLD, 1);
      chip.strokeRect(rx - 38, -9, 38, 18);
      container.add(chip);
      container.add(this._bt(rx - 19, 0, 'EVO', 9, TEXT_GOLD, { ox: 0.5 }));
    } else {
      const target = this._getBuildStackTarget(upgrade);
      if (Number.isFinite(target) && target <= 6) {
        const done = count >= target;
        const pipColor = done ? BUILD_EVOLUTION_GOLD : accent;
        for (let i = 0; i < target; i++) {
          const px = rx - (target - 1 - i) * 11 - 4;
          const pip = this.scene.add.graphics().setScrollFactor(0);
          if (i < count) {
            pip.fillStyle(pipColor, 1);
            pip.fillRect(px - 4, -4, 8, 8);
          } else {
            pip.lineStyle(1, BORDER_IDLE, 1);
            pip.strokeRect(px - 3.5, -3.5, 7, 7);
          }
          container.add(pip);
        }
      } else {
        container.add(this._bt(rx, 0, `x${count}`, 13, TEXT_HOVER, { ox: 1 }));
      }
    }

    const hit = this.scene.add
      .rectangle(0, 0, w, h, 0xffffff, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', (pointer) => {
      if (!this.buildOpen || this.buildDragging || !this._isPointerInBuildList(pointer)) return;
      this._selectBuildEntry(index, { sound: 'hover' });
    });
    hit.on('pointerdown', (pointer) => {
      if (!this.buildOpen || !this._isPointerInBuildList(pointer)) return;
      this._selectBuildEntry(index, { sound: 'click' });
    });
    container.add(hit);

    return { container, draw, entry };
  }

  _selectBuildEntry(index, { sound = false, scroll = false } = {}) {
    const row = this.buildRows[index];
    if (!row) return;
    const changed = this.buildSelectedId !== row.entry.upgrade.id;
    this.buildSelectedId = row.entry.upgrade.id;
    this.buildRows.forEach((r, i) => r.draw(i === index));
    if (scroll) this._scrollBuildToRow(index);
    if (!changed && sound === 'hover') return;
    if (sound && this.scene.cache.audio.exists(sound === 'click' ? 'sfx_ui_click' : 'sfx_hover')) {
      this.scene.sound.play(sound === 'click' ? 'sfx_ui_click' : 'sfx_hover', { volume: sound === 'click' ? 0.5 : 0.35 });
    }
    if (changed || !this.buildDetailDynamic.length) this._renderBuildDetail(row.entry);
  }

  _moveBuildSelection(delta) {
    if (!this.buildOpen || this.buildRows.length === 0) return;
    const current = this.buildRows.findIndex((r) => r.entry.upgrade.id === this.buildSelectedId);
    const next = Phaser.Math.Clamp((current < 0 ? 0 : current) + delta, 0, this.buildRows.length - 1);
    if (next === current) return;
    this._selectBuildEntry(next, { sound: 'hover', scroll: true });
  }

  _scrollBuildToRow(index) {
    const top = index * (BUILD_ROW_H + BUILD_ROW_GAP);
    const bottom = top + BUILD_ROW_H;
    let scroll = this.buildScrollY;
    if (top + scroll < 0) scroll = -top;
    else if (bottom + scroll > BUILD_LIST_H) scroll = BUILD_LIST_H - bottom;
    this._setBuildScroll(scroll);
  }

  // ----- coluna direita: detalhe da carta selecionada -----

  _renderBuildDetail(entry) {
    const g = this.buildDetailDynamic;
    g.removeAll(true);
    const x0 = BUILD_DETAIL_X - BUILD_DETAIL_W / 2 + 12;
    const x1 = BUILD_DETAIL_X + BUILD_DETAIL_W / 2 - 12;
    const innerW = x1 - x0;
    const top = BUILD_CONTENT_TOP;

    if (!entry) {
      g.add(this._bt(BUILD_DETAIL_X, top + 110, 'SELECIONE UMA CARTA', 9, TEXT_DIM, { ox: 0.5 }));
      return;
    }

    const { upgrade, count, isEvolution, rarity } = entry;
    const accent = isEvolution ? BUILD_EVOLUTION_GOLD : BUILD_RARITY_COLORS[rarity] || BUILD_RARITY_COLORS.common;
    const accentText = this._hex(accent);

    // nome (até 2 linhas)
    g.add(this._bt(x0, top, this._buildUpgradeName(upgrade), 11, TEXT_HOVER, { oy: 0, wrap: innerW, spacing: 3 }));

    // arte grande da carta
    const artW = 84;
    const artH = 137;
    const artTop = top + 32;
    const artKey = this._getBuildArtKey(upgrade);
    const glow = this.scene.add.graphics().setScrollFactor(0);
    glow.fillStyle(accent, 0.12);
    glow.fillRect(x0 - 4, artTop - 4, artW + 8, artH + 8);
    glow.lineStyle(2, accent, 1);
    glow.strokeRect(x0 - 1, artTop - 1, artW + 2, artH + 2);
    g.add(glow);
    if (artKey) {
      const art = this.scene.add.image(x0 + artW / 2, artTop + artH / 2, artKey).setDisplaySize(artW, artH).setScrollFactor(0).setAlpha(0);
      g.add(art);
      this.scene.tweens.add({ targets: art, alpha: 1, duration: 140, ease: 'Sine.easeOut' });
    }

    // painel lateral da arte
    const sx = x0 + artW + 12;
    const sw = x1 - sx;
    const label = isEvolution ? 'EVOLUÇÃO' : BUILD_RARITY_TEXT[rarity] || 'COMUM';
    const chip = this.scene.add.graphics().setScrollFactor(0);
    chip.lineStyle(1, accent, 1);
    chip.fillStyle(accent, 0.14);
    chip.fillRect(sx, artTop, sw, 20);
    chip.strokeRect(sx + 0.5, artTop + 0.5, sw - 1, 19);
    g.add(chip);
    g.add(this._bt(sx + sw / 2, artTop + 10, label, 8, accentText, { ox: 0.5 }));

    let y = artTop + 34;
    if (upgrade.weaponId) {
      g.add(this._bt(sx, y, 'EXCLUSIVA', 8, TEXT_DIM));
      y += 14;
    }

    if (!isEvolution) {
      const target = this._getBuildStackTarget(upgrade);
      g.add(this._bt(sx, y + 4, 'COPIAS', 8, TEXT_DIM));
      y += 22;
      g.add(this._bt(sx, y, Number.isFinite(target) ? `${count}/${target}` : `x${count}`, 16, count >= target ? TEXT_GOLD : TEXT_HOVER));
      y += 20;
      if (Number.isFinite(target) && target <= 6) {
        const pips = this.scene.add.graphics().setScrollFactor(0);
        const gap = Math.min(14, Math.floor((sw - 8) / target));
        for (let i = 0; i < target; i++) {
          const px = sx + i * gap;
          if (i < count) {
            pips.fillStyle(count >= target ? BUILD_EVOLUTION_GOLD : accent, 1);
            pips.fillRect(px, y, 10, 10);
          } else {
            pips.lineStyle(1, BORDER_IDLE, 1);
            pips.strokeRect(px + 0.5, y + 0.5, 9, 9);
          }
        }
        g.add(pips);
      }
    } else {
      const base = upgradesData.find((u) => u.id === upgrade.evolvesFrom);
      if (base) {
        g.add(this._bt(sx, y + 4, 'EVOLUIDA DE', 8, TEXT_DIM));
        g.add(this._bt(sx, y + 18, this._buildUpgradeName(base), 9, TEXT_HOVER, { oy: 0, wrap: sw, spacing: 4 }));
      }
    }

    // dica de evolução (calculada antes pra reservar espaço da descrição)
    let hintText = null;
    let hintColor = TEXT_GOLD;
    if (!isEvolution) {
      const evolution = upgradesData.find((u) =>
        u.category === 'evolution' && u.evolvesFrom === upgrade.id &&
        (!u.weaponId || u.weaponId === this.scene.runState.weaponId)
      );
      if (evolution) {
        const owned = this.scene.runState.ownedUpgradeIds.has(evolution.id);
        const target = this._getBuildStackTarget(upgrade);
        const missing = Math.max(0, target - count);
        const evoName = this._buildUpgradeName(evolution);
        if (owned) {
          hintText = `EVOLUIDA EM:\n${evoName}`;
          hintColor = TEXT_GOOD;
        } else if (missing > 0) {
          hintText = `EVOLUI EM:\n${evoName}\nFALTAM ${missing} COPIA${missing > 1 ? 'S' : ''}`;
        } else {
          hintText = `PRONTA PARA EVOLUIR:\n${evoName}`;
        }
      }
    }
    const hintH = hintText ? 46 : 0;

    // descrição
    const descTop = artTop + artH + 10;
    const descMax = BUILD_CONTENT_TOP + BUILD_LIST_H - hintH - descTop + 6;
    const desc = this._bt(x0, descTop, upgrade.description || '', 9, TEXT_IDLE, { oy: 0, wrap: innerW, spacing: 3 });
    let size = 9;
    while (desc.height > descMax && size > 7) {
      size -= 1;
      desc.setFontSize(size);
    }
    g.add(desc);

    if (hintText) {
      const bar = this.scene.add.graphics().setScrollFactor(0);
      const hintTop = BUILD_CONTENT_TOP + BUILD_LIST_H - 40;
      bar.lineStyle(1, BORDER_IDLE, 0.7);
      bar.lineBetween(x0, hintTop - 6, x1, hintTop - 6);
      g.add(bar);
      g.add(this._bt(x0, hintTop, hintText, 8, hintColor, { oy: 0, wrap: innerW, spacing: 4 }));
    }
  }

  // ----- rodapé: habilidades -----

  _renderBuildAbilities(state) {
    const g = this.buildFooterDynamic;
    const abilityIds = [...state.unlockedAbilities];
    if (state.hasRestock) abilityIds.push('restock');
    const abilities = [...new Set(abilityIds)];
    const left = -406;
    const top = BUILD_FOOTER_Y - BUILD_FOOTER_H / 2 + 28;

    if (abilities.length === 0) {
      g.add(this._bt(left, top + 8, 'NENHUMA HABILIDADE AINDA', 9, TEXT_DIM));
    } else {
      const maxW = 812;
      let size = 10;
      let placements;
      const measure = (fs) => {
        const out = [];
        let cx = 0;
        let row = 0;
        abilities.forEach((id) => {
          const label = ABILITY_LABELS[id] || (id === 'restock' ? 'Restock' : id);
          const w = label.length * fs + 22;
          if (cx + w > maxW && cx > 0) {
            cx = 0;
            row += 1;
          }
          out.push({ id, label, w, cx, row });
          cx += w + 8;
        });
        return out;
      };
      placements = measure(size);
      while (placements.some((p) => p.row > 1) && size > 8) {
        size -= 1;
        placements = measure(size);
      }
      placements.forEach(({ id, label, w, cx, row }) => {
        const color = id === 'restock' ? BUILD_EVOLUTION_GOLD : 0x7cfc9c;
        const cy = top + row * 21 + 9;
        const chip = this.scene.add.graphics().setScrollFactor(0);
        chip.fillStyle(color, 0.1);
        chip.fillRect(left + cx, cy - 9, w, 18);
        chip.lineStyle(1, color, 0.8);
        chip.strokeRect(left + cx + 0.5, cy - 8.5, w - 1, 17);
        chip.fillStyle(color, 1);
        chip.fillRect(left + cx + 6, cy - 2, 4, 4);
        g.add(chip);
        g.add(this._bt(left + cx + 15, cy, label, size, this._hex(color)));
      });
    }

    const hint = this.scene.sys.game.device.input.touch
      ? 'TOQUE NA CARTA PARA VER DETALHES'
      : 'SETAS: NAVEGAR   ESC: VOLTAR';
    g.add(this._bt(406, BUILD_FOOTER_Y - BUILD_FOOTER_H / 2 + 15, hint, 8, TEXT_DIM, { ox: 1 }));
  }

  // ----- rolagem -----

  _getBuildListScreenRect() {
    const left = this.scene.scale.width / 2 + (BUILD_LIST_CX - BUILD_ROW_W / 2 - 1) * UI_SCALE;
    const top = this.scene.scale.height / 2 + BUILD_CONTENT_TOP * UI_SCALE;
    return { left, top, width: (BUILD_ROW_W + 2) * UI_SCALE, height: BUILD_LIST_H * UI_SCALE };
  }

  _setBuildScroll(value) {
    if (!this.buildListContent) return;
    const max = this.buildMaxScroll || 0;
    this.buildScrollY = Phaser.Math.Clamp(value || 0, -max, 0);
    this.buildListContent.y = this.buildScrollY;
    this._updateBuildScrollbar();
  }

  _updateBuildScrollbar() {
    if (!this.buildScrollThumb) return;
    const max = this.buildMaxScroll || 0;
    this.buildScrollTrack.setVisible(max > 0);
    if (max <= 0) {
      this.buildScrollThumb.setVisible(false);
      return;
    }
    const ratio = BUILD_LIST_H / Math.max(BUILD_LIST_H, this.buildContentHeight || BUILD_LIST_H);
    const thumbHeight = Math.max(30, BUILD_LIST_H * ratio);
    const travel = BUILD_LIST_H - thumbHeight;
    const progress = Phaser.Math.Clamp(-this.buildScrollY / max, 0, 1);
    this.buildScrollThumb
      .setVisible(true)
      .setSize(5, thumbHeight)
      .setPosition(BUILD_TRACK_X, BUILD_CONTENT_TOP + travel * progress);
  }

  _isPointerInBuildList(pointer) {
    if (!pointer) return false;
    const r = this._getBuildListScreenRect();
    return pointer.x >= r.left && pointer.x <= r.left + r.width &&
      pointer.y >= r.top && pointer.y <= r.top + r.height;
  }

  // ----- helpers de dados -----

  _getBuildArtKey(upgrade) {
    let artId = upgrade.id;
    if (upgrade.id === 'dmg_up_evo_overcharge') {
      artId = `${upgrade.id}_${this.scene.runState.weaponId}`;
    }
    const exact = `card_${artId}`;
    if (this.scene.textures.exists(exact)) return exact;
    if (upgrade.evolvesFrom) {
      const base = `card_${upgrade.evolvesFrom}`;
      if (this.scene.textures.exists(base)) return base;
    }
    return null;
  }

  _buildUpgradeName(upgrade) {
    return upgrade.namesByWeapon?.[this.scene.runState.weaponId] || upgrade.name;
  }

  // Quantas cópias a carta "pede": limiar da evolução (se houver) ou o teto
  // de cópias; Infinity quando é ilimitada e sem evolução.
  _getBuildStackTarget(upgrade) {
    const hasEvolution = upgradesData.some((c) =>
      c.category === 'evolution' && c.evolvesFrom === upgrade.id &&
      (!c.weaponId || c.weaponId === this.scene.runState.weaponId)
    );
    if (hasEvolution) return upgrade.evolvesAtStacks ?? 5;
    if (upgrade.maxStacks) return upgrade.maxStacks;
    if (upgrade.type === 'unlockAbility') return 1;
    return Infinity;
  }

  _shortBuildText(value, maxLength) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
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
    this.refreshIgnoreList();

    this._setPauseCameraFx(true);
  }

  // A build precisa ser consultada, não apenas sentida. Os filtros CRT ficam
  // ótimos no menu curto, mas scanlines + onda CRT em fontes de 6/7px e mini
  // cartas destroem a leitura. A gameplay e o menu continuam com o efeito;
  // só a tela de build recebe este modo limpo.
  _setPauseCameraFx(enabled) {
    if (!this.pauseCam || this._pauseCameraFxEnabled === enabled) return;
    this._pauseCameraFxEnabled = enabled;
    if (!enabled) {
      this.pauseCam.resetPostPipeline();
      return;
    }
    this.pauseCam.setPostPipeline(['Scanlines', 'CrtWave']);
    this.pauseCam.getPostPipeline('Scanlines').setLineHeight(2).setDarkAmount(0.12);
    this.pauseCam.getPostPipeline('CrtWave').setAmplitude(0.001).setFrequency(9).setSpeed(0.9);
  }

  // Recalcula o que a pauseCam ignora (tudo, exceto o painel de pausa).
  // Precisa rodar de novo sempre que algo nascer DEPOIS do PauseUI (ex.:
  // TouchJoystick, criado em GameScene._buildInput, que roda depois de
  // _buildUI) — senão esse objeto fica fora do filtro inicial e a pauseCam
  // desenha ele por cima de novo (aparência de "duplicado" na tela, mesmo
  // com a pausa fechada, já que essa câmera está sempre ativa).
  refreshIgnoreList() {
    if (!this.pauseCam) return;
    this.pauseCam.ignore(this.scene.children.list.filter((obj) => obj !== this.panelContainer));
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
    if (this.scene.multiplayer?.togglePauseVote()) return;
    // ESC e o botão de pausa funcionam como "voltar" quando a tela de build
    // está aberta; só o segundo toque fecha a pausa de verdade.
    if (this.isOpen && this.buildOpen) {
      this._hideBuild();
      return;
    }
    this.isOpen ? this.close() : this.open();
  }

  open() {
    if (this.isOpen || this.scene.isGameOver || this.scene.levelUpUI?.container.visible) return;
    this.isOpen = true;
    this._refreshFullscreenButton();
    this.scene.physics.pause();
    this.scene.time.timeScale = 0;

    // câmera de pausa só deve desenhar o painel — recalcula a cada abertura
    // pra cobrir inimigos/objetos que tenham spawnado depois da criação
    this.refreshIgnoreList();

    // entrada suave: some com o "pop" instantâneo de tela travando de vez
    this.scene.tweens.killTweensOf(this.panelContainer);
    this.panelContainer.setVisible(true).setAlpha(0).setScale(UI_SCALE * 0.96);
    this.scene.tweens.add({
      targets: this.panelContainer,
      alpha: 1,
      scale: UI_SCALE,
      duration: ENTER_MS,
      ease: 'Cubic.easeOut'
    });

    EventBus.emit('pause-opened');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    if (this.buildOpen) this._hideBuild(true);

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
      scale: UI_SCALE * 0.96,
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
    anchorToScreen(container, this.scene.cameras.main, UI_SCALE);
  }

  destroy() {
    // se o GameScene foi desligado (morte/restart) com a Settings overlay
    // ainda aberta por cima, fecha ela junto pra não sobrar rodando
    if (this.scene.scene.isActive('SettingsScene')) this.scene.scene.stop('SettingsScene');
    this._readoutBlink?.stop();
    this.waitingBlink?.stop();
    this.scene.input.off('wheel', this._onBuildWheel);
    this.scene.input.off('pointerdown', this._onBuildPointerDown);
    this.scene.input.off('pointermove', this._onBuildPointerMove);
    this.scene.input.off('pointerup', this._onBuildPointerUp);
    const kb = this.scene.input.keyboard;
    if (kb) {
      ['UP', 'W'].forEach((k) => kb.off(`keydown-${k}`, this._onBuildKeyUp));
      ['DOWN', 'S'].forEach((k) => kb.off(`keydown-${k}`, this._onBuildKeyDown));
    }
    this.buildListMaskGraphics?.destroy();
    this.waitingText?.destroy();
    if (this.pauseCam) this.scene.cameras.remove(this.pauseCam);
    this.buttonContainer?.destroy();
    this.panelContainer?.destroy();
  }
}
