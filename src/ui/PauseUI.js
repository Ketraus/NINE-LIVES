import EventBus from '../systems/EventBus.js';
import weaponsData from '../../data/weapons.js';
import upgradesData from '../../data/upgrades.js';

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

// Tela de build: cabe na mesma base 704x512 do resto da interface, mas usa
// uma grade compacta para continuar legível também no celular em landscape.
const BUILD_PANEL_W = 650;
const BUILD_PANEL_H = 420;
const BUILD_SECTION_Y = -4;
const BUILD_SECTION_H = 322;
const BUILD_BACK_Y = 193;
const BUILD_LEFT_X = -238;
const BUILD_LEFT_W = 145;
const BUILD_CARDS_X = -7;
const BUILD_CARDS_W = 300;
const BUILD_SYSTEM_X = 220;
const BUILD_SYSTEM_W = 155;
const BUILD_GALLERY_TOP = -126;
const BUILD_GALLERY_H = 276;
const BUILD_GALLERY_CARD_W = 124;
const BUILD_GALLERY_CARD_H = 172;
const BUILD_GALLERY_GAP = 10;
const BUILD_GALLERY_TRACK_X = BUILD_CARDS_X + BUILD_CARDS_W / 2 - 12;
const BUILD_GALLERY_TRACK_TOP = -116;
const BUILD_GALLERY_TRACK_H = 256;
const BUILD_RARITY_COLORS = {
  common: 0x3d5a66,
  rare: 0x4fd1ff,
  epic: 0xffd166
};
const BUILD_RARITY_TEXT = {
  common: 'COMUM',
  rare: 'RARA',
  epic: 'EPICA'
};
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
    const x = this.scene.scale.width - 40;
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
    const zoom = this.scene.cameras.main.zoom || 1;
    this.waitingText = this.scene.add
      .text(width / 2, 72, 'ESPERANDO O SEGUNDO JOGADOR', {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: TEXT_HOVER,
        stroke: '#061014',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setScale(1 / zoom)
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

    this.panelContainer = this.scene.add.container(cx, cy).setScrollFactor(0).setDepth(250).setVisible(false);

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

  _buildBuildScreen() {
    this.buildContainer = this.scene.add.container(0, 0).setVisible(false).setAlpha(0);

    const frame = this.scene.add.graphics().setScrollFactor(0);
    this._drawPanel(frame, BUILD_PANEL_W, BUILD_PANEL_H, BORDER_IDLE);

    const title = this.scene.add
      .text(0, -194, 'BUILD // LOADOUT', {
        fontFamily: PIXEL_FONT,
        fontSize: '19px',
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 2, false, true)
      .setScrollFactor(0);

    const subtitle = this.scene.add
      .text(0, -170, 'CONFIGURAÇÃO DA RUN ATUAL', {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: TEXT_IDLE
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const rule = this.scene.add.graphics().setScrollFactor(0);
    rule.lineStyle(1, BORDER_IDLE, 0.8);
    rule.lineBetween(-300, -155, 300, -155);

    this.buildContainer.add([frame, title, subtitle, rule]);

    const left = this._buildBuildSection(BUILD_LEFT_X, BUILD_SECTION_Y, BUILD_LEFT_W, BUILD_SECTION_H, 'ARMAMENTO');
    const center = this._buildBuildSection(BUILD_CARDS_X, BUILD_SECTION_Y, BUILD_CARDS_W, BUILD_SECTION_H, 'CARTAS ATIVAS');
    const right = this._buildBuildSection(BUILD_SYSTEM_X, BUILD_SECTION_Y, BUILD_SYSTEM_W, BUILD_SECTION_H, 'SISTEMA');
    this.buildSectionTitles = { left, center, right };

    this.buildDynamic = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildWeaponDynamic = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildCardsDynamic = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildStatsDynamic = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildCardsOverlay = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildGalleryContent = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildGalleryViewport = this.scene.add.container(0, 0).setScrollFactor(0);
    this.buildGalleryViewport.add(this.buildGalleryContent);

    // Máscara fixa: só a área abaixo de "CARTAS ATIVAS" rola; o cabeçalho,
    // moldura e contador permanecem parados.
    const maskGraphics = this.scene.make.graphics({ x: 0, y: 0, add: false });
    const maskX = this.scene.scale.width / 2 + BUILD_CARDS_X - (BUILD_CARDS_W - 20) / 2;
    const maskY = this.scene.scale.height / 2 + BUILD_GALLERY_TOP;
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(maskX, maskY, BUILD_CARDS_W - 20, BUILD_GALLERY_H);
    this.buildGalleryMaskGraphics = maskGraphics;
    this.buildGalleryViewport.setMask(maskGraphics.createGeometryMask());

    const track = this.scene.add
      .rectangle(BUILD_GALLERY_TRACK_X, BUILD_GALLERY_TRACK_TOP + BUILD_GALLERY_TRACK_H / 2, 3, BUILD_GALLERY_TRACK_H, 0x1c2e36, 0.9)
      .setScrollFactor(0);
    this.buildGalleryScrollThumb = this.scene.add
      .rectangle(BUILD_GALLERY_TRACK_X, BUILD_GALLERY_TRACK_TOP, 7, 30, 0x8fd6ff, 0.9)
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    this.buildCardsDynamic.add([
      this.buildGalleryViewport,
      track,
      this.buildGalleryScrollThumb,
      this.buildCardsOverlay
    ]);
    this.buildDynamic.add([
      this.buildWeaponDynamic,
      this.buildCardsDynamic,
      this.buildStatsDynamic
    ]);

    this.buildGalleryScrollY = 0;
    this.buildGalleryMaxScroll = 0;
    this.buildGalleryDragging = false;
    this._onBuildWheel = (_pointer, _gameObjects, _deltaX, deltaY) => {
      if (!this.buildOpen || !this._isPointerInBuildGallery(_pointer)) return;
      this._setBuildGalleryScroll(this.buildGalleryScrollY + deltaY * 0.65);
    };
    this._onBuildPointerDown = (pointer) => {
      if (!this.buildOpen || !this._isPointerInBuildGallery(pointer)) return;
      this.buildGalleryDragging = true;
      this.buildGalleryDragStartY = pointer.y;
      this.buildGalleryDragStartScroll = this.buildGalleryScrollY;
    };
    this._onBuildPointerMove = (pointer) => {
      if (!this.buildGalleryDragging) return;
      this._setBuildGalleryScroll(this.buildGalleryDragStartScroll + (pointer.y - this.buildGalleryDragStartY));
    };
    this._onBuildPointerUp = () => {
      this.buildGalleryDragging = false;
    };
    this.scene.input.on('wheel', this._onBuildWheel);
    this.scene.input.on('pointerdown', this._onBuildPointerDown);
    this.scene.input.on('pointermove', this._onBuildPointerMove);
    this.scene.input.on('pointerup', this._onBuildPointerUp);

    this.buildBackButton = this._buildTerminalButton(
      0,
      BUILD_BACK_Y,
      'VOLTAR',
      () => this._hideBuild(),
      180,
      34
    );

    this.buildContainer.add([this.buildDynamic, this.buildBackButton]);
    this.panelContainer.add(this.buildContainer);
  }

  _buildBuildSection(x, y, width, height, label) {
    const panel = this.scene.add.graphics().setScrollFactor(0);
    this._drawPanel(panel, width, height, BORDER_IDLE);
    panel.setPosition(x, y);

    const title = this.scene.add
      .text(x - width / 2 + 12, y - height / 2 + 13, label, {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: TEXT_HOVER
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    const line = this.scene.add.graphics().setScrollFactor(0);
    line.lineStyle(1, BORDER_IDLE, 0.7);
    line.lineBetween(x - width / 2 + 10, y - height / 2 + 28, x + width / 2 - 10, y - height / 2 + 28);

    this.buildContainer.add([panel, title, line]);
    return { panel, title, line, x, y, width, height };
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
    this.buildContainer.setVisible(true).setAlpha(0).setScale(0.96);
    this.scene.tweens.add({
      targets: this.buildContainer,
      alpha: 1,
      scale: 1,
      duration: ENTER_MS,
      ease: 'Cubic.easeOut'
    });
  }

  _hideBuild(instant = false) {
    if (!this.buildOpen) return;
    this.buildOpen = false;
    this.scene.tweens.killTweensOf(this.buildContainer);
    this.pauseTitle.setVisible(true);
    this.mainButtonsGroup.setVisible(true).setAlpha(instant ? 1 : 0);
    this._setPauseCameraFx(true);

    if (instant) {
      this.buildContainer.setVisible(false).setAlpha(0).setScale(1);
      return;
    }

    this.buildContainer.setVisible(true).setAlpha(1).setScale(1);
    this.scene.tweens.add({
      targets: this.buildContainer,
      alpha: 0,
      scale: 0.96,
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
    if (!this.buildDynamic) return;
    this.buildWeaponDynamic.removeAll(true);
    this.buildStatsDynamic.removeAll(true);
    this.buildCardsOverlay.removeAll(true);
    this.buildGalleryContent.removeAll(true);

    const state = this.scene.runState;
    const player = this.scene.player;
    const weapon = weaponsData.find((item) => item.id === state.weaponId) || weaponsData[0];
    const weaponDamage = Math.round(weapon.damage * (1 + state.damageMultiplier));
    const weaponRange = Math.round(weapon.range * (1 + state.rangeMultiplier));
    const weaponCooldown = Math.max(1, Math.round(weapon.cooldownMs * (1 - state.cooldownMultiplier)));

    this._renderBuildWeapon(weapon, weaponDamage, weaponRange, weaponCooldown, state);
    this._renderBuildCards(state);
    this._renderBuildStats(state, player);
  }

  _renderBuildWeapon(weapon, damage, range, cooldown, state) {
    const x = BUILD_LEFT_X;
    const artKey = WEAPON_CARD_TEXTURES[weapon.id];
    if (artKey && this.scene.textures.exists(artKey)) {
      const art = this.scene.add.image(x, -45, artKey).setDisplaySize(78, 108).setScrollFactor(0);
      this.buildWeaponDynamic.add(art);
    }

    const name = this.scene.add
      .text(x, 24, weapon.name.toUpperCase(), {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: TEXT_HOVER,
        align: 'center'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const type = weapon.type === 'ranged' ? 'DISTÂNCIA' : 'CORPO A CORPO';
    const info = this.scene.add
      .text(x, 47, `${type}\nDMG ${damage}  RNG ${range}\nCD ${cooldown}MS`, {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: TEXT_IDLE,
        align: 'center',
        lineSpacing: 6
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const runInfo = this.scene.add
      .text(x, 112, `LV ${state.level}  ·  KILLS ${state.kills}`, {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: '#7cfc9c',
        align: 'center'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.buildWeaponDynamic.add([name, info, runInfo]);
  }

  _renderBuildCards(state) {
    const entries = [...state.ownedUpgradeIds]
      .map((id) => upgradesData.find((upgrade) => upgrade.id === id))
      .filter(Boolean)
      .map((upgrade) => ({
        upgrade,
        count: state.upgradeCounts[upgrade.id] || 1
      }))
      .sort((a, b) => {
        const aEvolution = a.upgrade.category === 'evolution' ? 1 : 0;
        const bEvolution = b.upgrade.category === 'evolution' ? 1 : 0;
        return aEvolution - bEvolution || a.upgrade.name.localeCompare(b.upgrade.name);
      });

    const rows = Math.ceil(entries.length / 2);
    const contentHeight = rows > 0
      ? rows * BUILD_GALLERY_CARD_H + Math.max(0, rows - 1) * BUILD_GALLERY_GAP
      : 0;
    this.buildGalleryContentHeight = contentHeight;
    this.buildGalleryMaxScroll = Math.max(0, contentHeight - BUILD_GALLERY_H);
    this._setBuildGalleryScroll(this.buildGalleryScrollY);

    const countLabel = this.scene.add
      .text(BUILD_CARDS_X + BUILD_CARDS_W / 2 - 12, -144, `${entries.length} ITENS`, {
        fontFamily: PIXEL_FONT,
        fontSize: '7px',
        color: TEXT_IDLE
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);
    this.buildCardsOverlay.add(countLabel);

    if (entries.length === 0) {
      const empty = this.scene.add
        .text(BUILD_CARDS_X, 4, 'NENHUMA CARTA\nAINDA', {
          fontFamily: PIXEL_FONT,
          fontSize: '8px',
          color: TEXT_IDLE,
          align: 'center',
          lineSpacing: 10
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.buildCardsOverlay.add(empty);
      return;
    }

    entries.forEach((entry, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = BUILD_CARDS_X + (col === 0 ? -((BUILD_GALLERY_CARD_W + BUILD_GALLERY_GAP) / 2) : (BUILD_GALLERY_CARD_W + BUILD_GALLERY_GAP) / 2);
      const y = BUILD_GALLERY_TOP + BUILD_GALLERY_CARD_H / 2 + row * (BUILD_GALLERY_CARD_H + BUILD_GALLERY_GAP);
      this.buildGalleryContent.add(this._buildBuildGalleryCard(entry, x, y));
    });
  }

  _buildBuildGalleryCard(entry, x, y) {
    const { upgrade, count } = entry;
    const rarity = upgrade.rarity || 'common';
    const border = BUILD_RARITY_COLORS[rarity] || BUILD_RARITY_COLORS.common;
    const tile = this.scene.add.container(x, y).setScrollFactor(0);

    const artKey = this._getBuildArtKey(upgrade);
    if (artKey) {
      const art = this.scene.add.image(0, 0, artKey)
        // A carta completa tem tÃ­tulo e descriÃ§Ã£o pequenos demais para virar
        // miniatura. Mostramos sÃ³ a ilustraÃ§Ã£o central; o nome e o progresso
        // ficam como texto real ao lado, sem virar uma mancha ilegÃ­vel.
        .setDisplaySize(BUILD_GALLERY_CARD_W, BUILD_GALLERY_CARD_H)
        .setScrollFactor(0);
      tile.add(art);
    } else {
      const icon = this.scene.add
        .text(0, 0, rarity === 'epic' ? '★' : rarity === 'rare' ? '◆' : '•', {
          fontFamily: PIXEL_FONT,
          fontSize: '13px',
          color: `#${border.toString(16).padStart(6, '0')}`
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      tile.add(icon);
    }

    const frame = this.scene.add.graphics().setScrollFactor(0);
    frame.lineStyle(2, border, 1);
    frame.strokeRect(-BUILD_GALLERY_CARD_W / 2, -BUILD_GALLERY_CARD_H / 2, BUILD_GALLERY_CARD_W, BUILD_GALLERY_CARD_H);
    tile.add(frame);

    const progress = this._buildUpgradeProgress(upgrade, count);
    const badge = this.scene.add.rectangle(
      BUILD_GALLERY_CARD_W / 2 - 25,
      -BUILD_GALLERY_CARD_H / 2 + 12,
      42,
      18,
      0x061014,
      0.9
    ).setStrokeStyle(1, border, 1).setScrollFactor(0);
    const badgeText = this.scene.add
      .text(BUILD_GALLERY_CARD_W / 2 - 25, -BUILD_GALLERY_CARD_H / 2 + 12, upgrade.category === 'evolution' ? 'EVO' : progress, {
        fontFamily: PIXEL_FONT,
        fontSize: '7px',
        color: upgrade.category === 'evolution' ? '#ffd166' : TEXT_HOVER,
        align: 'center'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    tile.add([badge, badgeText]);
    return tile;
  }

  _renderBuildStats(state, player) {
    const x = BUILD_SYSTEM_X;
    const left = x - BUILD_SYSTEM_W / 2 + 12;
    const right = x + BUILD_SYSTEM_W / 2 - 12;
    const hp = player?.healthSystem;
    const stats = [
      ['XP', `${state.xp}/${state.xpToNext}`],
      ['VIDA', `${Math.ceil(hp?.current ?? 0)}/${Math.ceil(hp?.maxHp ?? 0)}`],
      ['DANO', `+${Math.round(state.damageMultiplier * 100)}%`],
      ['VELOCIDADE', `+${Math.round(state.speedMultiplier * 100)}%`],
      ['RECARGA', `-${Math.round(state.cooldownMultiplier * 100)}%`],
      ['ALCANCE', `+${Math.round(state.rangeMultiplier * 100)}%`],
      ['REDUÇÃO', `-${Math.round(state.damageReductionFraction * 100)}%`],
      ['DESVIO', `${Math.round(state.dodgeChance * 100)}%`],
      ['ESPINHOS', `${Math.round(state.thornsDamage)}`],
      ['ROUBO', `${Math.round(state.lifestealFraction * 100)}%`]
    ];

    stats.forEach(([label, value], index) => {
      const y = -111 + index * 17;
      const labelText = this.scene.add
        .text(left, y, label, { fontFamily: PIXEL_FONT, fontSize: '7px', color: TEXT_IDLE })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      const valueText = this.scene.add
        .text(right, y, value, { fontFamily: PIXEL_FONT, fontSize: '8px', color: TEXT_HOVER })
        .setOrigin(1, 0.5)
        .setScrollFactor(0);
      this.buildStatsDynamic.add([labelText, valueText]);
    });

    const abilityHeader = this.scene.add
      .text(left, 72, 'HABILIDADES', { fontFamily: PIXEL_FONT, fontSize: '8px', color: TEXT_HOVER })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    this.buildStatsDynamic.add(abilityHeader);

    const abilityIds = [...state.unlockedAbilities];
    if (state.hasRestock) abilityIds.push('restock');
    const abilities = [...new Set(abilityIds)];
    if (abilities.length === 0) {
      const empty = this.scene.add
        .text(x, 105, 'NENHUMA\nDESBLOQUEADA', {
          fontFamily: PIXEL_FONT,
          fontSize: '6px',
          color: TEXT_IDLE,
          align: 'center',
          lineSpacing: 7
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.buildStatsDynamic.add(empty);
      return;
    }

    abilities.slice(0, 4).forEach((id, index) => {
      const label = ABILITY_LABELS[id] || (id === 'restock' ? 'Restock' : id);
      const abilityText = this.scene.add
        .text(left, 91 + index * 14, `> ${this._shortBuildText(label, 20)}`, {
          fontFamily: PIXEL_FONT,
          fontSize: '7px',
          color: id === 'restock' ? '#ffd166' : '#7cfc9c'
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      this.buildStatsDynamic.add(abilityText);
    });

    if (abilities.length > 4) {
      const more = this.scene.add
        .text(left, 149, `+${abilities.length - 4} SISTEMAS`, {
          fontFamily: PIXEL_FONT,
          fontSize: '6px',
          color: TEXT_IDLE
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      this.buildStatsDynamic.add(more);
    }
  }

  _setBuildGalleryScroll(value) {
    if (!this.buildGalleryContent) return;
    const max = this.buildGalleryMaxScroll || 0;
    this.buildGalleryScrollY = Phaser.Math.Clamp(value || 0, -max, 0);
    this.buildGalleryContent.y = this.buildGalleryScrollY;
    this._updateBuildGalleryScrollbar();
  }

  _updateBuildGalleryScrollbar() {
    if (!this.buildGalleryScrollThumb) return;
    const max = this.buildGalleryMaxScroll || 0;
    if (max <= 0) {
      this.buildGalleryScrollThumb.setVisible(false);
      return;
    }

    const ratio = BUILD_GALLERY_H / Math.max(BUILD_GALLERY_H, this.buildGalleryContentHeight || BUILD_GALLERY_H);
    const thumbHeight = Math.max(30, BUILD_GALLERY_TRACK_H * ratio);
    const travel = BUILD_GALLERY_TRACK_H - thumbHeight;
    const progress = Phaser.Math.Clamp(-this.buildGalleryScrollY / max, 0, 1);
    this.buildGalleryScrollThumb
      .setVisible(true)
      .setSize(7, thumbHeight)
      .setPosition(BUILD_GALLERY_TRACK_X, BUILD_GALLERY_TRACK_TOP + travel * progress);
  }

  _isPointerInBuildGallery(pointer) {
    if (!pointer) return false;
    const left = this.scene.scale.width / 2 + BUILD_CARDS_X - (BUILD_CARDS_W - 20) / 2;
    const top = this.scene.scale.height / 2 + BUILD_GALLERY_TOP;
    return pointer.x >= left && pointer.x <= left + BUILD_CARDS_W - 20 &&
      pointer.y >= top && pointer.y <= top + BUILD_GALLERY_H;
  }

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

  _buildUpgradeProgress(upgrade, count) {
    if (upgrade.category === 'evolution') return 'EVOLUÇÃO';
    const evolution = upgradesData.find((candidate) => {
      if (candidate.category !== 'evolution' || candidate.evolvesFrom !== upgrade.id) return false;
      return !candidate.weaponId || candidate.weaponId === this.scene.runState.weaponId;
    });
    if (!evolution) return `x${count}`;
    return `x${count}/${upgrade.evolvesAtStacks ?? 5}`;
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
    this.waitingBlink?.stop();
    this.scene.input.off('wheel', this._onBuildWheel);
    this.scene.input.off('pointerdown', this._onBuildPointerDown);
    this.scene.input.off('pointermove', this._onBuildPointerMove);
    this.scene.input.off('pointerup', this._onBuildPointerUp);
    this.buildGalleryMaskGraphics?.destroy();
    this.waitingText?.destroy();
    if (this.pauseCam) this.scene.cameras.remove(this.pauseCam);
    this.buttonContainer?.destroy();
    this.panelContainer?.destroy();
  }
}
