import EventBus from '../systems/EventBus.js';
import { SURVIVAL_MULTIPLIER_MAX, COMPLETION_BONUS } from '../roguelike/ScoreManager.js';

// Tela de resultado: entra depois do "VOCÊ MORREU"/vitória (HUD emite
// 'gameover-shown' / 'win-shown'). Uma etapa por vez, nada sobreposto:
//   1. INIMIGOS DERROTADOS  -> tabela que se monta linha a linha, pontos base subindo
//   2. BÔNUS DE SOBREVIVÊNCIA -> tempo + barra + multiplicador (x1.00 -> xN)
//   3. PONTUAÇÃO FINAL      -> base x multiplicador (+ bônus), número final estoura
//   4. RELATÓRIO            -> placar + tempo/nível/abates/dano + botões
// Sem painel/moldura (pedido do jogador): o visual vem de tipografia, brilho e animação.

const PIXEL_FONT = '"Press Start 2P", monospace';
const COLOR = {
  main: '#e8f6ff',
  dim: '#6b8894',
  green: '#7CFC9C',
  cyan: '#4fd1ff',
  gold: '#ffd166'
};
const HEX = { track: 0x14232a, line: 0x1c2e36, cyan: 0x4fd1ff, borderIdle: 0x3d5a66, borderHover: 0x8fd6ff };

// A câmera própria da tela (uiCam) só enxerga um canto do mundo bem longe
// de qualquer inimigo/projétil: nada do gameplay aparece por engano por cima.
const FAR = 100000;
const CANCELLED = new Error('result-cancelled');
const SKIP_STAGE = new Error('result-skip-stage');

const fmt = (n) => String(Math.round(n));
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default class ResultUI {
  constructor(scene) {
    this.scene = scene;
    this._token = 0; // invalida a sequência em andamento (reset/shutdown)
    this._started = false;
    this._lastTick = 0;
    this.stage = null;
    this._stageIndex = -1; // 0..2 = etapas puláveis; 3 = relatório final
    this._skippingStage = false;
    this._skipWaiters = new Set();

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    const { width: W, height: H } = this.scene.scale;
    this.W = W;
    this.H = H;
    this.cx = W / 2;
    this.cy = H / 2;

    this.uiCam = this.scene.cameras.add(0, 0, W, H);
    this.uiCam.setScroll(FAR, FAR);

    this.root = this.scene.add.container(FAR, FAR).setDepth(300).setVisible(false);
    this.scene.cameras.cameras.forEach((cam) => {
      if (cam !== this.uiCam) cam.ignore(this.root);
    });
    // a uiCam só pode desenhar o root: sem isso ela redesenhava HUD, pausa e
    // cartas de level-up (tudo com scrollFactor 0) por cima da câmera principal
    this._isolateUiCam();

    this.dim = this.scene.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0, 0).setAlpha(0);
    this.root.add(this.dim);
  }

  _isolateUiCam() {
    this.uiCam.ignore(this.scene.children.list.filter((obj) => obj !== this.root));
  }

  _bindEvents() {
    EventBus.on('gameover-shown', () => this._start());
    EventBus.on('win-shown', () => this._start());
    EventBus.on('run-restart', () => this._reset());
    this._onSkipInput = () => this._skipCurrentStage();
    this.scene.input.on('pointerdown', this._onSkipInput);
    this.scene.input.keyboard?.on('keydown-SPACE', this._onSkipInput);
    this.scene.events.once('shutdown', () => {
      this._token += 1;
      this.scene.input.off('pointerdown', this._onSkipInput);
      this.scene.input.keyboard?.off('keydown-SPACE', this._onSkipInput);
    });
  }

  _reset() {
    this._token += 1;
    this._started = false;
    this._stageIndex = -1;
    this._skippingStage = false;
    this._skipWaiters.clear();
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
    this.dim.setAlpha(0);
    this.root.setVisible(false);
  }

  _start() {
    if (this._started) return;
    this._started = true;
    this._isolateUiCam(); // pega o que nasceu depois do construtor (joystick, console...)
    this.root.setVisible(true);
    this._run();
  }

  // ---------- sequência ----------

  async _run() {
    const token = this._token;
    const result = this.scene.scoreManager?.result;
    try {
      await this._tween({ targets: this.dim, alpha: 0.88, duration: 420 });
      if (result) {
        const stages = [
          this._stageKills.bind(this),
          this._stageBonus.bind(this),
          this._stageFinal.bind(this)
        ];
        for (let i = 0; i < stages.length; i++) {
          this._stageIndex = i;
          try {
            await stages[i](result);
          } catch (err) {
            if (err !== SKIP_STAGE) throw err;
            this._destroyStageImmediately();
            this._skippingStage = false;
          }
        }
        this._stageIndex = 3;
        await this._stageReport(result);
      } else {
        this._stageIndex = 3;
        this._newStage();
        this._buildButtons();
      }
    } catch (err) {
      if (err === CANCELLED || token !== this._token) return;
      // nunca deixa o jogador preso: qualquer erro cai direto nos botões
      console.error('[ResultUI]', err);
      if (this.stage) this.stage.destroy();
      this._newStage();
      this._buildButtons();
    }
    if (token === this._token) this._finish();
  }

  _finish() {
    this.scene.resultComplete = true;
    EventBus.emit('result-complete');
  }

  // Um toque/clique avança uma etapa por vez. O relatório final (etapa 4)
  // nunca é pulado, porque é onde ficam os botões de reiniciar e menu.
  _skipCurrentStage() {
    if (!this._started || this._stageIndex < 0 || this._stageIndex > 2 || this._skippingStage) return;
    this._skippingStage = true;
    [...this._skipWaiters].forEach((cancel) => cancel());
    this._skipWaiters.clear();
  }

  _destroyStageImmediately() {
    if (!this.stage) return;
    this.scene.tweens.killTweensOf(this.stage.list);
    this.stage.destroy();
    this.stage = null;
  }

  // Etapa 1 — tabela de abates
  async _stageKills(result) {
    this._newStage();
    const { cx, W, H } = this;
    const values = this.scene.scoreManager?.scoreValues || {};
    const kills = result.killsByType || {};

    // ordem de scoreValues (crescente por valor, termina no boss); ids
    // desconhecidos entram no fim só por segurança
    const order = Object.keys(values).filter((id) => kills[id] > 0);
    Object.keys(kills).forEach((id) => {
      if (kills[id] > 0 && !order.includes(id)) order.push(id);
    });

    const title = this._txt(cx, 58, 'INIMIGOS DERROTADOS', 16, COLOR.dim, { spacing: 1 });
    await this._enter(title);

    if (order.length === 0) {
      const none = this._txt(cx, this.cy, 'NENHUM INIMIGO DERROTADO', 12, COLOR.dim);
      await this._enter(none);
      await this._wait(1200);
      await this._clearStage();
      return;
    }

    const top = 112;
    const rowH = Math.min(38, (H - 116 - top) / order.length);
    const xName = cx - 250;
    const xCount = cx + 30;
    const xPts = cx + 250;

    const totalLabel = this._txt(cx, H - 100, 'PONTOS', 10, COLOR.dim);
    const totalText = this._txt(cx, H - 62, '0', 32, COLOR.green, { glow: COLOR.green });
    totalLabel.setAlpha(0);
    totalText.setAlpha(0);
    this.scene.tweens.add({ targets: [totalLabel, totalText], alpha: 1, duration: 300 });

    let running = 0;
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const count = kills[id];
      const def = values[id] || {};
      const pts = count * (def.points || 0);
      const big = (def.points || 0) >= 150;
      const y = top + rowH * i + rowH / 2;

      const name = this._txt(xName, y, def.label || id, 14, big ? COLOR.gold : COLOR.main, { originX: 0 });
      const cnt = this._txt(xCount, y, 'x0', 14, big ? COLOR.gold : COLOR.main, { originX: 1 });
      const pt = this._txt(xPts, y, '+0', 14, big ? COLOR.gold : COLOR.green, { originX: 1 });
      [name, cnt, pt].forEach((o) => o.setAlpha(0));

      this.scene.tweens.add({ targets: [name, cnt, pt], alpha: 1, duration: 180 });
      this.scene.tweens.add({ targets: name, x: { from: xName - 24, to: xName }, duration: 240, ease: 'Cubic.easeOut' });
      this._sfx('sfx_hover', 0.3);

      const from = running;
      running += pts;
      await Promise.all([
        this._count(0, count, 380, (v) => {
          cnt.setText(`x${fmt(v)}`);
          this._tick();
        }),
        this._count(0, pts, 380, (v) => pt.setText(`+${fmt(v)}`)),
        this._count(from, running, 380, (v) => totalText.setText(fmt(v)))
      ]);

      this.scene.tweens.add({ targets: totalText, scale: 1.12, duration: 90, yoyo: true });
      if (big) {
        this.uiCam.shake(160, 0.004);
        this._sfx('sfx_card_select', 0.5);
      }
      await this._wait(big ? 520 : 140);
    }

    await this._wait(900);
    await this._clearStage();
  }

  // Etapa 2 — multiplicador de sobrevivência
  async _stageBonus(result) {
    this._newStage();
    const { cx, cy } = this;
    const survived = result.survivedSeconds || 0;
    const winSeconds = this.scene.scoreManager?.runWinSeconds || 600;
    const ratio = Phaser.Math.Clamp(survived / winSeconds, 0, 1);
    const mult = result.survivalMultiplier || 1;

    const title = this._txt(cx, 58, 'BÔNUS DE SOBREVIVÊNCIA', 16, COLOR.dim, { spacing: 1 });
    await this._enter(title);

    const barW = 360;
    const barY = cy - 10;
    const timeLabel = this._txt(cx, cy - 104, 'TEMPO SOBREVIVIDO', 10, COLOR.dim);
    const timeText = this._txt(cx, cy - 64, '00:00', 40, COLOR.main);
    const track = this.scene.add.rectangle(cx, barY, barW, 8, HEX.track).setOrigin(0.5);
    const fill = this.scene.add.rectangle(cx - barW / 2, barY, barW, 8, HEX.cyan).setOrigin(0, 0.5).setScale(0, 1);
    this.stage.add([track, fill]);
    const startLbl = this._txt(cx - barW / 2, barY + 20, '00:00', 9, COLOR.dim, { originX: 0 });
    const endLbl = this._txt(cx + barW / 2, barY + 20, fmtTime(winSeconds), 9, COLOR.dim, { originX: 1 });
    const multLabel = this._txt(cx, cy + 58, 'MULTIPLICADOR', 10, COLOR.dim);
    const multText = this._txt(cx, cy + 104, 'x1.00', 48, COLOR.green, { glow: COLOR.green });

    const parts = [timeLabel, timeText, track, fill, startLbl, endLbl, multLabel, multText];
    parts.forEach((o) => o.setAlpha(0));
    await this._tween({ targets: parts, alpha: 1, duration: 320 });

    await Promise.all([
      this._count(0, survived, 1100, (v) => timeText.setText(fmtTime(Math.round(v))), 'Cubic.easeInOut'),
      this._count(0, ratio, 1100, (v) => (fill.scaleX = v), 'Cubic.easeInOut'),
      this._count(1, mult, 1100, (v) => {
        multText.setText(`x${v.toFixed(2)}`);
        this._tick();
      }, 'Cubic.easeInOut')
    ]);

    this.scene.tweens.add({ targets: multText, scale: { from: 1.25, to: 1 }, duration: 360, ease: 'Back.easeOut' });
    this._sfx('sfx_card_select', 0.55);
    await this._wait(500);

    if (result.completed) {
      const bonus = this._txt(cx, cy + 176, `+ ${fmt(result.completionBonus || 0)}  BÔNUS DE CONCLUSÃO`, 12, COLOR.gold, { glow: COLOR.gold });
      await this._enter(bonus, 8, 300);
      this.uiCam.shake(200, 0.005);
    } else {
      const note = this._txt(
        cx, cy + 176,
        `COMPLETE ${fmtTime(winSeconds)} PARA x${SURVIVAL_MULTIPLIER_MAX.toFixed(2)} E +${fmt(COMPLETION_BONUS)}`,
        9, COLOR.dim
      );
      await this._enter(note, 6, 300);
    }

    await this._wait(1400);
    await this._clearStage();
  }

  // Etapa 3 — pontuação final
  async _stageFinal(result) {
    this._newStage();
    const { cx, cy } = this;
    const raw = result.rawScore || 0;
    const mult = result.survivalMultiplier || 1;
    const bonus = result.completionBonus || 0;
    const finalScore = result.finalScore || 0;

    const title = this._txt(cx, 58, 'PONTUAÇÃO FINAL', 16, COLOR.dim, { spacing: 1 });
    await this._enter(title);

    const formula = `${fmt(raw)}  x  ${mult.toFixed(2)}` + (bonus > 0 ? `  +  ${fmt(bonus)}` : '');
    const line = this._txt(cx, cy - 64, formula, 16, COLOR.main);
    await this._enter(line);
    await this._wait(350);

    const number = this._txt(cx, cy + 14, fmt(raw), 56, COLOR.green, { glow: COLOR.green });
    await this._enter(number, 0, 240);
    await this._wait(200);

    if (finalScore !== raw) {
      await this._count(raw, finalScore, 1700, (v) => {
        number.setText(fmt(v));
        this._tick();
      });
    }

    if (finalScore > 0) {
      number.setColor(COLOR.main);
      this.uiCam.shake(260, 0.006);
      this.uiCam.flash(130, 200, 255, 220);
      this._sfx('sfx_evolution_effect', 0.55);
      this._burst(cx, cy + 14, 30);
      this.scene.tweens.add({ targets: number, scale: { from: 1.3, to: 1 }, duration: 400, ease: 'Back.easeOut' });
      this.scene.time.delayedCall(260, () => number.active && number.setColor(COLOR.green));
    }

    await this._wait(1700);
    await this._clearStage();
  }

  // Etapa 4 — relatório + botões
  async _stageReport(result) {
    this._newStage();
    const { cx } = this;
    const totalKills = Object.values(result.killsByType || {}).reduce((a, b) => a + b, 0);

    const label = this._txt(cx, 48, 'PONTUAÇÃO FINAL', 10, COLOR.dim, { spacing: 1 });
    const score = this._txt(cx, 92, fmt(result.finalScore || 0), 40, COLOR.green, { glow: COLOR.green });
    label.setAlpha(0);
    score.setAlpha(0);
    await this._tween({ targets: [label, score], alpha: 1, duration: 400 });

    const stats = [
      ['TEMPO', fmtTime(result.survivedSeconds || 0)],
      ['NÍVEL', String(result.finalLevel || 1)],
      ['ABATES', fmt(totalKills)],
      ['DANO', fmt(result.totalDamage || 0)]
    ];
    const top = 150;
    const rowH = 42;
    for (let i = 0; i < stats.length; i++) {
      const y = top + rowH * i;
      const name = this._txt(cx - 190, y, stats[i][0], 12, COLOR.dim, { originX: 0 });
      const value = this._txt(cx + 190, y, stats[i][1], 16, COLOR.main, { originX: 1 });
      const rule = this.scene.add.rectangle(cx, y + rowH / 2, 380, 1, HEX.line);
      this.stage.add(rule);
      [name, value, rule].forEach((o) => o.setAlpha(0));
      this.scene.tweens.add({ targets: [name, value, rule], alpha: 1, duration: 260 });
      this.scene.tweens.add({ targets: value, x: { from: cx + 190 + 20, to: cx + 190 }, duration: 260, ease: 'Cubic.easeOut' });
      this._sfx('sfx_hover', 0.25);
      await this._wait(260);
    }

    await this._wait(200);
    this._buildButtons();
  }

  _buildButtons() {
    const { cx, H } = this;
    const won = !!this.scene.hasWon;
    let acted = false;
    const once = (fn) => () => {
      if (acted) return;
      acted = true;
      this._sfx('sfx_ui_click', 0.6);
      fn();
    };
    const primary = once(() => this.scene._restartOrGoToWeaponSelect());
    const toMenu = once(() => this.scene.scene.start('MainMenuScene'));

    this._button(cx, H - 142, won ? 'ESCOLHER ARMA' : 'REINICIAR', primary);
    this._button(cx, H - 90, 'MENU', toMenu);

    if (!this.scene.sys.game.device.input.touch) {
      const hint = this._txt(cx, H - 30, won ? 'OU PRESSIONE R PARA ESCOLHER OUTRA ARMA' : 'OU PRESSIONE R PARA REINICIAR', 8, COLOR.dim);
      hint.setAlpha(0);
      this.scene.tweens.add({ targets: hint, alpha: 1, duration: 400 });
    }
    this.scene.input.keyboard?.once('keydown-ENTER', primary);
  }

  _button(x, y, label, onSelect) {
    const w = 240;
    const h = 40;
    const c = 8;
    const box = this.scene.add.container(x, y).setAlpha(0);
    const panel = this.scene.add.graphics();

    const draw = (color, fillAlpha) => {
      panel.clear();
      panel.fillStyle(0x061014, fillAlpha);
      panel.lineStyle(1, color, 1);
      const pts = [
        { x: -w / 2 + c, y: -h / 2 }, { x: w / 2 - c, y: -h / 2 },
        { x: w / 2, y: -h / 2 + c }, { x: w / 2, y: h / 2 - c },
        { x: w / 2 - c, y: h / 2 }, { x: -w / 2 + c, y: h / 2 },
        { x: -w / 2, y: h / 2 - c }, { x: -w / 2, y: -h / 2 + c }
      ];
      panel.fillPoints(pts, true);
      panel.strokePoints(pts, true);
    };
    draw(HEX.borderIdle, 0.55);

    const arrow = this.scene.add.text(-w / 2 + 18, 0, '>', { fontFamily: PIXEL_FONT, fontSize: '12px', color: COLOR.main })
      .setOrigin(0.5).setAlpha(0);
    const text = this.scene.add.text(0, 0, label, { fontFamily: PIXEL_FONT, fontSize: '12px', color: '#8fb3bf' })
      .setOrigin(0.5);
    const hit = this.scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });

    hit.on('pointerover', () => {
      draw(HEX.borderHover, 0.75);
      text.setColor(COLOR.main);
      arrow.setAlpha(1);
      this.scene.tweens.add({ targets: arrow, alpha: 0.2, duration: 380, yoyo: true, repeat: -1 });
      this._sfx('sfx_hover', 0.5);
    });
    hit.on('pointerout', () => {
      draw(HEX.borderIdle, 0.55);
      text.setColor('#8fb3bf');
      this.scene.tweens.killTweensOf(arrow);
      arrow.setAlpha(0);
    });
    hit.on('pointerdown', onSelect);

    box.add([panel, arrow, text, hit]);
    this.stage.add(box);
    this.scene.tweens.add({ targets: box, alpha: 1, duration: 300 });
    return box;
  }

  // ---------- helpers ----------

  _newStage() {
    this.stage = this.scene.add.container(0, 0);
    this.root.add(this.stage);
    return this.stage;
  }

  async _clearStage(ms = 280) {
    const stage = this.stage;
    if (!stage) return;
    await this._tween({ targets: stage, alpha: 0, x: -18, duration: ms, ease: 'Cubic.easeIn' });
    stage.destroy();
    if (this.stage === stage) this.stage = null;
  }

  _txt(x, y, str, size, color, { originX = 0.5, glow = null, spacing = 0 } = {}) {
    const t = this.scene.add
      .text(x, y, str, { fontFamily: PIXEL_FONT, fontSize: `${size}px`, color, align: 'center' })
      .setOrigin(originX, 0.5);
    if (spacing) t.setLetterSpacing(spacing);
    if (glow) t.setShadow(0, 0, glow, Math.round(size * 0.5), false, true);
    this.stage.add(t);
    return t;
  }

  _enter(obj, dy = 10, ms = 320) {
    const y = obj.y;
    obj.setAlpha(0).setY(y + dy);
    return this._tween({ targets: obj, alpha: 1, y, duration: ms, ease: 'Cubic.easeOut' });
  }

  _wait(ms) {
    const token = this._token;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = this.scene.time.delayedCall(ms, () => {
        if (settled) return;
        settled = true;
        this._skipWaiters.delete(cancel);
        token === this._token ? resolve() : reject(CANCELLED);
      });
      const cancel = () => {
        if (settled) return;
        settled = true;
        timer.remove();
        this._skipWaiters.delete(cancel);
        reject(SKIP_STAGE);
      };
      this._skipWaiters.add(cancel);
    });
  }

  _tween(config) {
    const token = this._token;
    return new Promise((resolve, reject) => {
      let settled = false;
      const originalOnComplete = config.onComplete;
      const tween = this.scene.tweens.add({
        ...config,
        onComplete: (...args) => {
          if (settled) return;
          settled = true;
          this._skipWaiters.delete(cancel);
          originalOnComplete?.(...args);
          token === this._token ? resolve() : reject(CANCELLED);
        }
      });
      const cancel = () => {
        if (settled) return;
        settled = true;
        tween.stop();
        this._skipWaiters.delete(cancel);
        reject(SKIP_STAGE);
      };
      this._skipWaiters.add(cancel);
    });
  }

  // Conta de `from` até `to`. IMPORTANTE: o valor vem do objeto proxy — o
  // primeiro argumento do onUpdate do Phaser é o Tween, não o alvo (era o
  // bug que deixava a pontuação sempre em 0).
  _count(from, to, duration, onValue, ease = 'Cubic.easeOut') {
    const proxy = { v: from };
    return this._tween({ targets: proxy, v: to, duration, ease, onUpdate: () => onValue(proxy.v) })
      .then(() => onValue(to));
  }

  _tick() {
    const now = this.scene.time.now;
    if (now - this._lastTick < 60) return;
    this._lastTick = now;
    this._sfx('sfx_hover', 0.18);
  }

  _sfx(key, volume = 0.5) {
    try {
      if (this.scene.cache.audio.exists(key)) this.scene.sound.play(key, { volume });
    } catch (_) {
      // som nunca pode derrubar a sequência
    }
  }

  _burst(x, y, count) {
    const colors = [0x7cfc9c, 0x4fd1ff, 0xe8f6ff];
    for (let i = 0; i < count; i++) {
      const size = Phaser.Math.Between(3, 6);
      const p = this.scene.add.rectangle(x, y, size, size, colors[i % colors.length]);
      this.root.add(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(90, 260);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist * 0.7,
        alpha: 0,
        angle: Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(500, 900),
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy()
      });
    }
  }
}
