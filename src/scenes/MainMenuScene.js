import MusicManager from '../systems/MusicManager.js';
import { UI_SCALE } from '../config/layout.js';
import MenuAtmosphereFx from '../fx/MenuAtmosphereFx.js';

// paleta "terminal cyberpunk" pedida: fundo do botão quase transparente,
const PANEL_FILL = 0x061014;
const PANEL_FILL_ALPHA = 0.55;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const PIXEL_FONT = '"Press Start 2P", monospace';
const CHAMFER = 8; // corte dos cantos, em px — visual de placa tecnológica

// transição de saída (JOGAR -> WeaponSelectScene), "troca de sistema":
const EXIT_GLITCH_MS = 160; // duração do desaparecer + glitch juntos
const EXIT_BLACK_MS = 180;

// fade simples de entrada (ao chegar aqui) e na ida pra SettingsScene —
// sem glitch, só a cortina preta mesmo (ver _goToSettings)
const ENTER_FADE_MS = 220;

// abertura "cinema" (só na 1ª entrada no menu — ver _buildCinema)
const INTRO_FADE_MS = 1200;
const BAR_H = 34; // altura das barras de cinema (com a barra de status)
const BAR_START_H = 150; // altura inicial, antes de recolher
const CORP_NAME = 'NINE LIVES CORP.';
const SETTINGS_FADE_MS = 220;

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create() {
    const { width, height } = this.scale;

    this._transitioning = false; // trava clique duplo durante a saída

    // fade de entrada (chegando do Boot ou voltando da SettingsScene/pause)
    const firstTime = !MainMenuScene._introPlayed;
    MainMenuScene._introPlayed = true;
    this.cameras.main.fadeIn(firstTime ? INTRO_FADE_MS : ENTER_FADE_MS, 0, 0, 0);

    MusicManager.play(this, 'music_menu');

    // tudo que precisa sumir junto na transição (ver _playExitTransition)
    this.menuLayer = this.add.container(0, 0);

    const bg = this._buildBackground(width, height);

    const title = this.add
      .text(width / 2, height * 0.28, 'NINE LIVES', {
        fontFamily: PIXEL_FONT,
        fontSize: '30px',
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#2a8fc0', 12, false, true);

    const button = this._buildTerminalButton(width / 2, height * 0.6, 220, 40, 'JOGAR', () =>
      this._start()
    );

    const multiplayerButton = this._buildTerminalButton(
      width / 2,
      height * 0.6 + 56,
      300,
      40,
      'MULTIPLAYER',
      () => this._setRoomMenuOpen(true)
    );

    const settingsButton = this._buildTerminalButton(width / 2, height * 0.6 + 112, 220, 40, 'SETTINGS', () => {
      if (this._transitioning) return;
      this._transitioning = true;
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      this._goToSettings();
    });

    const createRoomButton = this._buildTerminalButton(
      width / 2,
      height * 0.6,
      300,
      40,
      'CRIAR SALA',
      () => this._createRoom()
    ).setVisible(false);
    const joinRoomButton = this._buildTerminalButton(
      width / 2,
      height * 0.6 + 56,
      300,
      40,
      'ENTRAR EM SALA',
      () => this._joinRoom()
    ).setVisible(false);
    const backButton = this._buildTerminalButton(
      width / 2,
      height * 0.6 + 112,
      220,
      40,
      'VOLTAR',
      () => this._setRoomMenuOpen(false)
    ).setVisible(false);

    this.roomMenuButtons = [createRoomButton, joinRoomButton, backButton];
    this.menuButtons = [button, multiplayerButton, settingsButton];
    this.menuLayer.add([
      bg,
      title,
      button,
      multiplayerButton,
      settingsButton,
      ...this.roomMenuButtons
    ]);
    this.menuLayer
      .setScale(UI_SCALE)
      .setPosition((width / 2) * (1 - UI_SCALE), (height / 2) * (1 - UI_SCALE));

    this._setupRetroFx();

    this._buildCinema({ bg, title, firstTime });

    this.input.keyboard.once('keydown-SPACE', () => {
      if (this._transitioning || this.roomMenuOpen) return;
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      this._start();
    });
  }

  // ------------------------------------------------------------------
  // Apresentação "cinema" do menu. Só visual: fundo, botões e paleta
  // continuam os mesmos. Na PRIMEIRA entrada rola a abertura completa
  // (barras de cinema recolhendo, push-in lento no fundo, título sendo
  // digitado no terminal, botões entrando em sequência); ao voltar de
  // Settings/pause o menu já aparece pronto.
  // ------------------------------------------------------------------
  _buildCinema({ bg, title, firstTime }) {
    const { width, height } = this.scale;
    const cx = width / 2;
    this._isTouch = this.sys.game.device.input.touch;
    this._bg = bg;
    this._bgBase = { x: bg.x, y: bg.y, scale: bg.scaleX };
    this._zoom = { v: firstTime ? 0.1 : 0 };
    this._parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this._barsUi = { a: firstTime ? 0 : 1 };
    this._introDone = !firstTime;
    this._nextGlitch = 9000;
    this._glitchUntil = 0;
    this._clockT = 0;

    // atmosfera (névoa, chuva fina, luzes da arte, hovercars) por cima do
    // fundo e por baixo do título
    this._atmos = new MenuAtmosphereFx(this, bg.width, bg.height, width, height);
    this.menuLayer.addAt(this._atmos.anchored, 1);
    this.menuLayer.addAt(this._atmos.layer, 2);
    if (firstTime) this._atmos.setAlpha(0);

    // título: mesmo texto/fonte, agora com glow e "ghost" cromático que
    // trava no lugar (mesma linguagem da tela de loading)
    const label = 'NINE LIVES';
    const ty = title.y;
    title.setOrigin(0, 0.5);
    const tx = cx - title.width / 2;
    title.setPosition(tx, ty);
    const ghostStyle = { fontFamily: PIXEL_FONT, fontSize: '30px' };
    const ghostA = this.add.text(tx, ty, label, { ...ghostStyle, color: '#00e5ff' }).setOrigin(0, 0.5);
    const ghostB = this.add.text(tx, ty, label, { ...ghostStyle, color: '#ff2d95' }).setOrigin(0, 0.5);
    this.menuLayer.addAt(ghostA, 3);
    this.menuLayer.addAt(ghostB, 4);
    this._titleObjs = { title, ghostA, ghostB, tx };
    this._ghost = { off: firstTime ? 8 : 2, a: firstTime ? 0 : 0.5 };

    // subtítulo + 9 "vidas" (pips) sob o título
    const sub = this.add
      .text(cx, ty + 36, 'TERMINAL DE ACESSO // NL-OS v2.04', {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: '#5f808c',
        letterSpacing: 2
      })
      .setOrigin(0.5)
      .setAlpha(firstTime ? 0 : 1);
    this._pipsG = this.add.graphics().setAlpha(firstTime ? 0 : 1);
    this._pips = { lit: firstTime ? 0 : 9, cx, y: ty + 58 };
    this.menuLayer.add([sub, this._pipsG]);

    // camada de tela: vinheta + barras de cinema com "barra de status"
    this.cineLayer = this.add.container(0, 0);
    const vig = this.add.graphics();
    for (let i = 0; i < 6; i++) {
      vig.lineStyle(26, 0x000000, 0.1);
      vig.strokeRect(-i * 10 + 13, -i * 10 + 13, width + i * 20 - 26, height + i * 20 - 26);
    }
    this._bars = this.add.graphics();
    const txt = { fontFamily: PIXEL_FONT, fontSize: '8px', color: '#5f808c' };
    const my = BAR_H / 2;
    this._barDot = this.add.rectangle(18, my, 6, 6, 0x8fd6ff);
    const tl = this.add.text(32, my, 'NL-OS // TERMINAL 01', txt).setOrigin(0, 0.5);
    const clockX = this._isTouch ? width - 64 : width - 16; // celular: foge do botão de tela cheia
    this._clockText = this.add.text(clockX, my, '', { ...txt, color: '#8fb3bf' }).setOrigin(1, 0.5);
    const bl = this.add.text(16, height - my, `(C) ${CORP_NAME}`, txt).setOrigin(0, 0.5);
    const barItems = [tl, this._clockText, bl];
    if (!this._isTouch) {
      barItems.push(this.add.text(width - 16, height - my, '', txt).setOrigin(1, 0.5));
    }
    this._barTexts = barItems;
    this.cineLayer.add([vig, this._bars, this._barDot, ...barItems]);
    this._setBarHeight(firstTime ? BAR_START_H : BAR_H);

    // parallax suave com o mouse (desktop)
    if (!this._isTouch) {
      this.input.on('pointermove', (ptr) => {
        this._parallax.tx = -Phaser.Math.Clamp((ptr.x - cx) / cx, -1, 1) * 12;
        this._parallax.ty = -Phaser.Math.Clamp((ptr.y - height / 2) / (height / 2), -1, 1) * 7;
      });
    }

    if (firstTime) this._playIntro({ title, ghostA, ghostB, sub, label });
  }

  _setBarHeight(h) {
    const { width, height } = this.scale;
    const g = this._bars;
    g.clear();
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 0, width, h);
    g.fillRect(0, height - h, width, h);
    g.fillStyle(BORDER_IDLE, 0.5);
    g.fillRect(0, h, width, 1);
    g.fillRect(0, height - h - 1, width, 1);
  }

  _safePlay(key, volume) {
    try {
      this.sound.play(key, { volume });
    } catch (e) {
      /* sem áudio disponível: segue sem som */
    }
  }

  _playIntro({ title, ghostA, ghostB, sub, label }) {
    const T_TITLE = 1100; // quando começa a digitar o título
    const TYPE_MS = 85; // ms por letra

    // barras de cinema recolhem; fundo faz push-in lento; atmosfera aparece
    this.tweens.addCounter({
      from: BAR_START_H,
      to: BAR_H,
      delay: 250,
      duration: 1900,
      ease: 'Cubic.easeInOut',
      onUpdate: (tw) => this._setBarHeight(tw.getValue())
    });
    this.tweens.add({ targets: this._zoom, v: 0, duration: 6000, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: [this._atmos.anchored, this._atmos.layer], alpha: 1, delay: 800, duration: 2500 });
    this.tweens.add({ targets: this._barsUi, a: 1, delay: 2000, duration: 600 });

    // botões escondidos, entram em sequência depois do título
    this.menuButtons.forEach((b) => {
      b._finalY = b.y;
      b.setAlpha(0);
      b.y += 14;
    });

    // título digitado no terminal
    title.setText('');
    ghostA.setText('');
    ghostB.setText('');
    this.time.delayedCall(T_TITLE, () => {
      let i = 0;
      this.time.addEvent({
        delay: TYPE_MS,
        repeat: label.length - 1,
        callback: () => {
          i++;
          const shown = label.slice(0, i);
          title.setText(shown + (i < label.length ? '_' : ''));
          ghostA.setText(shown);
          ghostB.setText(shown);
        }
      });
    });

    // título completo: ghost cromático "trava", subtítulo + vidas + botões
    this.time.delayedCall(T_TITLE + label.length * TYPE_MS + 150, () => {
      this._safePlay('sfx_hover', 0.4);
      this.tweens.add({
        targets: this._ghost,
        off: 2,
        a: 0.5,
        duration: 800,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this._introDone = true;
        }
      });
      this.tweens.add({ targets: sub, alpha: 1, delay: 350, duration: 700 });
      this.tweens.add({ targets: this._pipsG, alpha: 1, delay: 350, duration: 400 });
      this.tweens.add({ targets: this._pips, lit: 9, delay: 450, duration: 800, ease: 'Linear' });
      this.menuButtons.forEach((b, i) => {
        this.tweens.add({
          targets: b,
          alpha: 1,
          y: b._finalY,
          delay: 900 + i * 150,
          duration: 450,
          ease: 'Cubic.easeOut'
        });
      });
    });
  }

  update(time, delta) {
    if (!this._bg) return;

    // parallax + push-in/"respiração" do fundo
    const p = this._parallax;
    const f = Math.min(1, Math.min(delta, 50) * 0.004);
    p.x += (p.tx - p.x) * f;
    p.y += (p.ty - p.y) * f;
    const sc = this._bgBase.scale * (1 + this._zoom.v + Math.sin(time / 9000) * 0.004);
    this._bg.setScale(sc).setPosition(this._bgBase.x + p.x, this._bgBase.y + p.y);
    this._atmos.update(time, delta, this._bg, p.x, p.y);

    // ghost cromático respirando + glitch curtinho e raro (sem flash)
    const { title, ghostA, ghostB, tx } = this._titleObjs;
    let off = this._ghost.off;
    let jit = 0;
    if (this._introDone) {
      if (time > this._nextGlitch) {
        this._glitchUntil = time + 140;
        this._nextGlitch = time + Phaser.Math.Between(6000, 13000);
      }
      if (time < this._glitchUntil) {
        off = Phaser.Math.Between(5, 9);
        jit = Phaser.Math.Between(-2, 2);
      } else {
        off += Math.sin(time / 1400) * 0.7;
      }
    }
    title.x = tx + jit;
    ghostA.x = tx + jit - off;
    ghostB.x = tx + jit + off;
    const breath = 0.85 + 0.15 * Math.sin(time / 1100);
    ghostA.setAlpha(this._ghost.a * breath);
    ghostB.setAlpha(this._ghost.a * 0.9 * breath);

    this._drawPips(time);

    // barras: texto, ponto de status pulsando devagar e relógio do terminal
    const a = this._barsUi.a;
    this._barTexts.forEach((o) => o.setAlpha(a));
    this._barDot.setAlpha(a * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time / 500))));
    if (time - this._clockT > 500) {
      this._clockT = time;
      this._clockText.setText(new Date().toTimeString().slice(0, 8));
    }
  }

  // as 9 vidas sob o título; depois de acesas, uma "onda" de brilho corre
  _drawPips(time) {
    const g = this._pipsG;
    g.clear();
    const n = 9;
    const w = 12;
    const h = 6;
    const gap = 6;
    const total = n * w + (n - 1) * gap;
    const x0 = this._pips.cx - total / 2;
    const cy = this._pips.y;

    g.lineStyle(1, BORDER_IDLE, 0.5);
    g.lineBetween(x0 - 14, cy, x0 - 104, cy);
    g.lineBetween(x0 + total + 14, cy, x0 + total + 104, cy);

    const wavePos = (time / 220) % (n + 8);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (w + gap);
      const y = cy - h / 2;
      const lit = Phaser.Math.Clamp(this._pips.lit - i, 0, 1);
      g.fillStyle(PANEL_FILL, 0.9);
      g.fillRect(x, y, w, h);
      if (lit > 0) {
        const wave = lit >= 1 ? Math.max(0, 1 - Math.abs(i - wavePos) / 1.6) * 0.4 : 0;
        g.fillStyle(BORDER_HOVER, 0.55 * lit + wave);
        g.fillRect(x + 1, y + 1, (w - 2) * lit, h - 2);
      }
      g.lineStyle(1, lit >= 1 ? BORDER_HOVER : BORDER_IDLE, lit >= 1 ? 0.8 : 1);
      g.strokeRect(x, y, w, h);
    }
  }

  _setRoomMenuOpen(open) {
    if (this._transitioning) return;
    this.roomMenuOpen = open;
    this.menuButtons.forEach((button) => button.setVisible(!open));
    this.roomMenuButtons.forEach((button) => button.setVisible(open));
  }

  _createRoom() {
    const roomId = `sala-${Math.random().toString(36).slice(2, 8)}`;
    window.prompt('ID da sala criada. Copie para compartilhar:', roomId);
    this._start(roomId, true);
  }

  _joinRoom() {
    const roomId = window.prompt('Digite o ID da sala:')?.trim();
    if (roomId) this._start(roomId, false);
  }

  // Efeitos "retrô" do menu inteiro: bloom/bleeding sutil nas áreas claras
  // + ondulação horizontal (sinal CRT instável) + ghosting sutil nas áreas
  // claras (persistência de fósforo) + scanlines finíssimas + aberração
  // cromática radial bem sutil + flicker irregular de brilho.
  // Intensidade/velocidade ficam só aqui — únicos números pra mexer depois.
  _setupRetroFx() {
    if (this.renderer.type !== Phaser.WEBGL) return; // efeitos exigem WebGL

    const cam = this.cameras.main;
    // Bloom primeiro: espalha luz a partir da imagem "limpa", antes dos
    // outros efeitos distorcerem/escurecerem a imagem em cima disso.
    // Aberração cromática por último (antes do flicker): separa as cores
    // do resultado já composto, como uma lente/CRT olhando pra tela toda.
    cam.setPostPipeline(['Bloom', 'CrtWave', 'GhostTrail', 'Scanlines', 'ChromaticAberration', 'Flicker']);

    this._bloomFx = cam.getPostPipeline('Bloom');
    this._bloomFx.setThreshold(0.72).setRadius(1.6).setIntensity(0.18);

    this._chromaticAberrationFx = cam.getPostPipeline('ChromaticAberration');
    this._chromaticAberrationFx.setMaxShift(1.5);

    this._crtWaveFx = cam.getPostPipeline('CrtWave');
    this._crtWaveFx.setAmplitude(0.0012).setFrequency(9).setSpeed(0.9);

    this._ghostTrailFx = cam.getPostPipeline('GhostTrail');
    this._ghostTrailFx.setDecay(0.55).setThreshold(0.6);

    this._scanlinesFx = cam.getPostPipeline('Scanlines');
    this._scanlinesFx.setLineHeight(2).setDarkAmount(0.12);

    this._flickerFx = cam.getPostPipeline('Flicker');
    this._flickerFx.setRate(4).setAmount(0.05);

    this.events.once('shutdown', () => cam.resetPostPipeline());
  }

  _buildBackground(width, height) {
    const bg = this.add.image(width / 2, height / 2, 'menu_bg');
    // cover-fit: preenche o canvas todo sem distorcer, cortando o excesso.
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale);
    return bg;
  }

  // Botão estilo "placa de terminal": fundo quase transparente, borda
  _buildTerminalButton(x, y, w, h, label, onSelect) {
    const container = this.add.container(x, y);

    const panel = this.add.graphics();
    this._drawPanel(panel, w, h, BORDER_IDLE);

    const caret = this.add
      .text(-w / 2 + 14, 0, '>', { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_HOVER })
      .setOrigin(0, 0.5)
      .setVisible(false);

    const text = this.add
      .text(4, 0, label, { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_IDLE })
      .setOrigin(0.5);

    const hitArea = this.add
      .rectangle(0, 0, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    let blinkTween = null;

    const setHover = (hovering) => {
      panel.clear();
      this._drawPanel(panel, w, h, hovering ? BORDER_HOVER : BORDER_IDLE);
      text.setColor(hovering ? TEXT_HOVER : TEXT_IDLE);
      caret.setVisible(hovering);

      if (hovering) {
        blinkTween = this.tweens.add({
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
      this.sound.play('sfx_hover', { volume: 0.5 });
    });
    hitArea.on('pointerout', () => setHover(false));
    hitArea.on('pointerdown', () => {
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      onSelect();
    });

    container.add([panel, caret, text, hitArea]);
    return container;
  }

  // Desenha o painel com cantos cortados (visual de placa tecnológica).
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

  _start(multiplayerRoom = null, isRoomHost = false) {
    if (this._transitioning) return;
    this._transitioning = true;
    this.nextSceneData = multiplayerRoom ? { multiplayerRoom, isRoomHost } : {};

    // celular: aproveita esse mesmo toque (gesto do usuário, exigido pela
    if (this.sys.game.device.input.touch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
      try {
        this.scale.startFullscreen();
      } catch (e) {
        // sem suporte, sem problema — o jogo funciona normal do mesmo jeito
      }
    }
    // esconde o botão HTML de tela cheia (#fullscreen-btn) — só existe no
    window.dispatchEvent(new Event('nine-lives:fullscreen-started'));

    this._playExitTransition();
  }

  // Fade simples pra SettingsScene (sem glitch, diferente do JOGAR) — a
  // SettingsScene faz o fadeIn correspondente na entrada (ver create() lá).
  _goToSettings() {
    const cam = this.cameras.main;
    cam.fadeOut(SETTINGS_FADE_MS, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('SettingsScene', { returnTo: 'MainMenuScene' });
    });
  }

  // "Troca de sistema": menu some ENQUANTO glitcha (em paralelo — o
  _playExitTransition() {
    this.tweens.add({
      targets: [this.menuLayer, this.cineLayer],
      alpha: 0,
      duration: EXIT_GLITCH_MS
    });

    this._playGlitch(EXIT_GLITCH_MS, () => {
      const cam = this.cameras.main;
      cam.fadeOut(EXIT_BLACK_MS, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('WeaponSelectScene', this.nextSceneData);
      });
    });
  }

  // Jitter horizontal rápido (passos discretos, não tween suave — o "digi…
  _playGlitch(durationMs, onDone) {
    const cam = this.cameras.main;
    const steps = 8;
    let i = 0;
    this.time.addEvent({
      delay: durationMs / steps,
      repeat: steps - 1,
      callback: () => {
        i++;
        cam.scrollX = Phaser.Math.Between(-14, 14);
        if (i >= steps) {
          cam.scrollX = 0;
          onDone();
        }
      }
    });
  }
}
