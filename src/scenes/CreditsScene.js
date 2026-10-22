import credits from '../../data/credits.js';
import gameVersion from '../../data/gameVersion.js';

const PIXEL_FONT = '"Press Start 2P", monospace';
const SCROLL_PX_PER_S = 38;
const FADE_IN_MS = 1800;
const FADE_OUT_MS = 1400;
const END_HOLD_MS = 2500; // fica parado no "OBRIGADO POR JOGAR." antes de sair
const CARD_FADE_IN_MS = 1600;
const CARD_HOLD_MS = 3800;
const CARD_FADE_OUT_MS = 1200;
const CARD_GAP_MS = 900; // preto puro entre um cartão e o próximo
const SKIP_UNLOCK_MS = 3500; // só dá pra pular depois disso (ninguém pula sem querer)

// Créditos em silêncio sobre preto (conteúdo em data/credits.js). Ao fim — ou
// ao pular — volta pro menu principal.
export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super('CreditsScene');
  }

  init(data) {
    this._customCards = data?.cards?.length ? data.cards : null; // ex.: final beta da SNCT (SnctEnding)
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);
    this._leaving = false;
    this._holdMs = 0;
    this._elapsedMs = 0;
    this._cardsMode = Boolean(this._customCards) || (gameVersion.version !== 'feira' && credits.snctEpilogue?.length > 0);

    if (this._cardsMode) {
      this._buildCards();
      this._wireSkip();
      return;
    }

    this.roll = this.add.container(width / 2, height + 40);
    let y = 0;
    const addLine = (text, size, color, gapAfter, spacing = 2) => {
      const t = this.add
        .text(0, y, text, { fontFamily: PIXEL_FONT, fontSize: `${size}px`, color, align: 'center', lineSpacing: 10 })
        .setOrigin(0.5, 0)
        .setLetterSpacing(spacing);
      this.roll.add(t);
      y += t.height + gapAfter;
    };

    addLine(credits.title, 36, '#ffffff', credits.subtitle ? 18 : 90, 6);
    if (credits.subtitle) addLine(credits.subtitle, 12, '#8a8f99', 90);
    (credits.sections || []).forEach((section) => {
      if (!section?.lines?.length) return;
      if (section.heading) addLine(section.heading, 11, '#6f7c91', 22);
      section.lines.forEach((line) => addLine(line, 14, '#e6e9ef', 14));
      y += 56;
    });
    if (credits.closing) addLine(credits.closing, 14, '#ffffff', 0, 3);
    this._rollHeight = y;

    this.hint = this.add
      .text(width - 16, height - 14, '[ TOQUE PARA PULAR ]', { fontFamily: PIXEL_FONT, fontSize: '8px', color: '#ffffff' })
      .setOrigin(1, 1)
      .setAlpha(0);
    this.time.delayedCall(SKIP_UNLOCK_MS, () => this.tweens.add({ targets: this.hint, alpha: 0.3, duration: 600 }));

    this._wireSkip();
  }

  _wireSkip() {
    const skip = () => {
      if (this._elapsedMs >= SKIP_UNLOCK_MS) this._leave();
    };
    this.input.on('pointerdown', skip);
    this.input.keyboard?.on('keydown', skip);
  }

  // Encerramento da SNCT: um cartão por vez, sobre preto (credits.snctEpilogue).
  _buildCards() {
    const { width, height } = this.scale;
    const cards = this._customCards || credits.snctEpilogue;
    let index = 0;
    const next = () => {
      if (this._leaving) return;
      if (index >= cards.length) {
        this.time.delayedCall(600, () => this._leave());
        return;
      }
      const card = cards[index++];
      const container = this.add.container(width / 2, height / 2).setAlpha(0);
      let y = card.title ? -(card.lines.length * 12) - 26 : -(card.lines.length * 24) / 2;
      if (card.title) {
        const title = this.add
          .text(0, y, card.title, { fontFamily: PIXEL_FONT, fontSize: '30px', color: '#ffffff', align: 'center' })
          .setOrigin(0.5, 0)
          .setLetterSpacing(6);
        container.add(title);
        y += title.height + 30;
      }
      card.lines.forEach((line) => {
        const t = this.add
          .text(0, y, line, { fontFamily: PIXEL_FONT, fontSize: '12px', color: '#dfe3ea', align: 'center', wordWrap: { width: width * 0.86 } })
          .setOrigin(0.5, 0)
          .setLetterSpacing(2);
        container.add(t);
        y += t.height + 16;
      });
      this.tweens.add({
        targets: container,
        alpha: 1,
        duration: CARD_FADE_IN_MS,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          this.time.delayedCall(CARD_HOLD_MS, () => {
            this.tweens.add({
              targets: container,
              alpha: 0,
              duration: CARD_FADE_OUT_MS,
              ease: 'Sine.easeInOut',
              onComplete: () => {
                container.destroy();
                this.time.delayedCall(CARD_GAP_MS, next);
              }
            });
          });
        }
      });
    };
    this.time.delayedCall(800, next);
  }

  update(time, delta) {
    if (this._leaving) return;
    this._elapsedMs += delta;
    if (this._cardsMode) return; // cartões rodam por tweens/timers
    const lastLineY = this.roll.y + this._rollHeight;
    if (lastLineY > this.scale.height * 0.55) {
      this.roll.y -= (SCROLL_PX_PER_S * delta) / 1000;
    } else {
      this._holdMs += delta;
      if (this._holdMs >= END_HOLD_MS) this._leave();
    }
  }

  _leave() {
    if (this._leaving) return;
    this._leaving = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MainMenuScene'));
  }
}
