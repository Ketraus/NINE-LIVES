import weaponsData from '../../data/weapons.js';

// arte real das cartas (feita pelo Ketlin + usuário, ver assets/ui/) —
// cada weapon.id de data/weapons.js mapeia pra uma textura pré-carregada.
const CARD_TEXTURE_BY_WEAPON = {
  fists: 'card_fists',
  katana: 'card_katana',
  pistol: 'card_pistol'
};

// mesma paleta "terminal cyberpunk" do menu/settings — ver comentários lá.
const PANEL_FILL = 0x061014;
const PANEL_FILL_ALPHA = 0.55;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const TEXT_DIM = '#4a6a75'; // pros textos decorativos (CLASS_0X, stats) — mais apagado que TEXT_IDLE, só textura
const PIXEL_FONT = '"Press Start 2P", monospace';
const CHAMFER = 8;

// arte nasce em 331x459 (ver assets/ui/); reduzida em relação ao valor
// original (260) porque a moldura + labels novas precisam caber, com as
// 3 cartas lado a lado, dentro da BASE_WIDTH de 704 (ver gameConfig.js).
const CARD_DISPLAY_H = 235;
const CARD_DISPLAY_W = Math.round((331 / 459) * CARD_DISPLAY_H);
const GAP = 40; // espaço entre molduras
const FRAME_PAD = 10; // moldura ao redor da arte

// entrada das cartas: "ligando" uma de cada vez, rápido e seco (não bounce orgânico)
const ENTRY_DURATION_MS = 180;
const ENTRY_STAGGER_MS = 70;

// transição de entrada na run ("sistema carregando... PÁ, no jogo"), mesma receita do menu:
const VIBRATION_MS = 90;
const VIBRATION_INTENSITY = 0.008;
const OTHER_CARDS_FADE_MS = 140;
const FADE_TO_BLACK_MS = 220;
const SILENCE_MS = 100;

// Tela entre o menu e a run: mostra as armas de data/weapons.js como
// cartas colecionáveis, com uma moldura técnica discreta ao redor —
// linhas, cantos cortados e uns textos de "painel de sistema" (CLASS_0X,
// SYSTEM // ONLINE) pra reforçar o clima de terminal sem competir com a
// arte das cartas, que continua sendo a protagonista da tela.
export default class WeaponSelectScene extends Phaser.Scene {
  constructor() {
    super('WeaponSelectScene');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    this._transitioning = false;
    this.cardGroups = [];

    // chega em preto (ver MainMenuScene._playExitTransition) e clareia —
    this.cameras.main.fadeIn(140, 0, 0, 0);

    // tudo que não é carta (título, cabeçalho de sistema, cantos) — some
    // junto quando uma carta é escolhida, pra focar só na carta ativa.
    this.decorLayer = this.add.container(0, 0);
    this._buildDecor(cx, width, height);
    this.decorLayer.add(this._buildBackButton(68, 30));

    const totalW = weaponsData.length * (CARD_DISPLAY_W + FRAME_PAD * 2) + (weaponsData.length - 1) * GAP;
    const startX = cx - totalW / 2 + (CARD_DISPLAY_W + FRAME_PAD * 2) / 2;
    // deslocada pra baixo pra abrir espaço pro caret + CLASS_0X acima de
    // cada carta, sem encostar na régua/status do cabeçalho (y=124).
    const cy = height / 2 + 60;

    weaponsData.forEach((weapon, i) => {
      const x = startX + i * (CARD_DISPLAY_W + FRAME_PAD * 2 + GAP);
      const group = this._buildCard(x, cy, weapon, i);
      this.cardGroups.push(group);
    });

    this._playEntryAnimation();
    this._setupRetroFx();
  }

  // Cabeçalho "de sistema": título + linha de status com um LED piscando
  // + uma régua fina separando do resto, e um texto discreto no canto
  // superior direito — o canto esquerdo agora é o botão VOLTAR (ver
  // _buildBackButton), no lugar do texto decorativo que tinha ali antes.
  _buildDecor(cx, width, height) {
    const title = this.add
      .text(cx, 70, 'ESCOLHA SUA CARTA', {
        fontFamily: PIXEL_FONT,
        fontSize: '24px',
        color: '#cfefff'
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#000000', 2, false, true);

    const statusDot = this.add.circle(cx - 78, 106, 3, 0x8fd6ff, 1);
    this.tweens.add({
      targets: statusDot,
      alpha: { from: 1, to: 0.25 },
      duration: 700,
      yoyo: true,
      repeat: -1
    });

    const statusText = this.add
      .text(cx - 68, 106, 'SYSTEM // ONLINE', {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: TEXT_DIM
      })
      .setOrigin(0, 0.5);

    const rule = this.add.graphics();
    rule.lineStyle(1, BORDER_IDLE, 0.6);
    rule.lineBetween(cx - 220, 124, cx + 220, 124);

    const cornerTopRight = this.add
      .text(width - 20, 18, 'REV_1.0', { fontFamily: PIXEL_FONT, fontSize: '8px', color: TEXT_DIM })
      .setOrigin(1, 0);

    this.decorLayer.add([title, statusDot, statusText, rule, cornerTopRight]);
  }

  // Botão VOLTAR — mesmo componente visual dos outros botões do jogo
  // (painel com cantos cortados + `>` piscando no hover), só que compacto
  // pra caber no canto sem disputar espaço com o título/cartas.
  _buildBackButton(x, y) {
    const w = 96;
    const h = 26;
    const container = this.add.container(x, y);

    const panel = this.add.graphics();
    this._drawPanel(panel, w, h, BORDER_IDLE);

    const caret = this.add
      .text(-w / 2 + 8, 0, '>', { fontFamily: PIXEL_FONT, fontSize: '9px', color: TEXT_HOVER })
      .setOrigin(0, 0.5)
      .setVisible(false);

    const text = this.add
      .text(4, 0, 'VOLTAR', { fontFamily: PIXEL_FONT, fontSize: '9px', color: TEXT_IDLE })
      .setOrigin(0.5);

    const hitArea = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });

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
      if (this._transitioning) return;
      setHover(true);
      this.sound.play('sfx_hover', { volume: 0.5 });
    });
    hitArea.on('pointerout', () => setHover(false));
    hitArea.on('pointerdown', () => {
      if (this._transitioning) return; // trava clique duplo/em conjunto com uma carta
      this._transitioning = true;
      this.sound.play('sfx_ui_click', { volume: 0.6 });
      this.cardGroups.forEach((g) => g.hitArea.disableInteractive());
      this.scene.start('MainMenuScene');
    });

    container.add([panel, caret, text, hitArea]);
    this._backButtonHitArea = hitArea;
    return container;
  }

  // Uma carta = moldura (painel com cantos cortados, igual ao resto do
  // jogo) + arte por cima + tag "CLASS_0X" e o `>` piscando acima dela +
  // nome da arma e uma linha de stat técnico embaixo. A área clicável
  // cobre o bloco inteiro (moldura + labels), não só a imagem.
  _buildCard(x, y, weapon, index) {
    const group = this.add.container(x, y);

    const frameW = CARD_DISPLAY_W + FRAME_PAD * 2;
    const frameH = CARD_DISPLAY_H + FRAME_PAD * 2;

    const panel = this.add.graphics();
    this._drawPanel(panel, frameW, frameH, BORDER_IDLE);

    const textureKey = CARD_TEXTURE_BY_WEAPON[weapon.id];
    const art = this.add.image(0, 0, textureKey).setDisplaySize(CARD_DISPLAY_W, CARD_DISPLAY_H);
    // setDisplaySize já deixa art.scale numa fração bem menor que 1 (a
    // textura nasce em 331x459, bem maior que a carta exibida) — o hover
    // precisa multiplicar A PARTIR dessa escala base, nunca setar um
    // valor absoluto tipo 1 ou 1.04, senão a arte pula pro tamanho quase
    // real da textura (isso causava o bug do "carta gigante que não volta").
    const artBaseScaleX = art.scaleX;
    const artBaseScaleY = art.scaleY;

    const caret = this.add
      .text(0, -frameH / 2 - 34, '>', { fontFamily: PIXEL_FONT, fontSize: '12px', color: TEXT_HOVER })
      .setOrigin(0.5)
      .setAngle(90) // deitado, apontando pra baixo — "mirando" na carta selecionada
      .setVisible(false);

    const classLabel = this.add
      .text(0, -frameH / 2 - 14, `CLASS_0${index + 1}`, {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: TEXT_DIM
      })
      .setOrigin(0.5);

    const nameText = this.add
      .text(0, frameH / 2 + 22, weapon.name.toUpperCase(), {
        fontFamily: PIXEL_FONT,
        fontSize: '12px',
        color: TEXT_IDLE
      })
      .setOrigin(0.5);

    const statLine = weapon.range
      ? `DMG_${weapon.damage} · RNG_${weapon.range}`
      : `DMG_${weapon.damage} · CD_${weapon.cooldownMs}MS`;
    const statText = this.add
      .text(0, frameH / 2 + 40, statLine, { fontFamily: PIXEL_FONT, fontSize: '8px', color: TEXT_DIM })
      .setOrigin(0.5);

    const hitTop = -frameH / 2 - 44;
    const hitBottom = frameH / 2 + 50;
    const hitArea = this.add
      .rectangle(0, (hitTop + hitBottom) / 2, frameW + 16, hitBottom - hitTop, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hitArea.disableInteractive(); // só liga depois da animação de entrada, ver _playEntryAnimation

    let blinkTween = null;
    const setHover = (hovering) => {
      panel.clear();
      this._drawPanel(panel, frameW, frameH, hovering ? BORDER_HOVER : BORDER_IDLE);
      nameText.setColor(hovering ? TEXT_HOVER : TEXT_IDLE);
      caret.setVisible(hovering);
      this.tweens.add({
        targets: art,
        scaleX: hovering ? artBaseScaleX * 1.04 : artBaseScaleX,
        scaleY: hovering ? artBaseScaleY * 1.04 : artBaseScaleY,
        duration: 120,
        ease: 'Quad.easeOut'
      });

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
      if (this._transitioning) return; // trava clique duplo/em outra carta durante a saída
      this._choose(weapon, group);
    });

    group.add([panel, art, caret, classLabel, nameText, statText, hitArea]);
    group.hitArea = hitArea;
    return group;
  }

  // "Ligando" as cartas uma de cada vez: entra achatada na horizontal e
  // caindo um pouco, com leve overshoot — curto e seco, não flutuante.
  _playEntryAnimation() {
    this.cardGroups.forEach((group, i) => {
      const targetY = group.y;
      group.setScale(0.15, 1);
      group.setAlpha(0);
      group.y = targetY - 10;

      this.tweens.add({
        targets: group,
        scaleX: 1,
        alpha: 1,
        y: targetY,
        duration: ENTRY_DURATION_MS,
        delay: i * ENTRY_STAGGER_MS,
        ease: 'Back.easeOut',
        onComplete: () => group.hitArea.setInteractive({ useHandCursor: true })
      });
    });
  }

  // Mesmo pipeline CRT do menu/settings (Bloom + CrtWave + GhostTrail +
  // Scanlines + ChromaticAberration + Flicker), com os mesmos valores —
  // já testamos cada um isolado antes de chegar aqui, então não inventei
  // números novos. GhostTrail e ChromaticAberration são os que mais
  // arriscam borrar os textos pequenos (CLASS_0X, stats) — os valores
  // usados já são os mais discretos que aprovamos no menu/settings.
  _setupRetroFx() {
    if (this.renderer.type !== Phaser.WEBGL) return;

    const cam = this.cameras.main;
    cam.setPostPipeline(['Bloom', 'CrtWave', 'GhostTrail', 'Scanlines', 'ChromaticAberration', 'Flicker']);

    cam.getPostPipeline('Bloom').setThreshold(0.72).setRadius(1.6).setIntensity(0.18);
    cam.getPostPipeline('ChromaticAberration').setMaxShift(1.5);
    cam.getPostPipeline('CrtWave').setAmplitude(0.0012).setFrequency(9).setSpeed(0.9);
    cam.getPostPipeline('GhostTrail').setDecay(0.55).setThreshold(0.6);
    cam.getPostPipeline('Scanlines').setLineHeight(2).setDarkAmount(0.12);
    cam.getPostPipeline('Flicker').setRate(4).setAmount(0.05);

    this.events.once('shutdown', () => cam.resetPostPipeline());
  }

  _choose(weapon, chosenGroup) {
    this._transitioning = true;

    this.sound.play('sfx_card_select', { volume: 0.6 });

    // transição limpa: apaga o resto (cartas não escolhidas + cabeçalho)
    // e dá um pequeno "punch" na carta escolhida, antes do corte pra
    // preto — foca a atenção na carta ativa em vez de sumir tudo junto.
    this.cardGroups.forEach((g) => {
      if (g === chosenGroup) return;
      g.hitArea.disableInteractive();
      this.tweens.add({ targets: g, alpha: 0, scale: 0.92, duration: OTHER_CARDS_FADE_MS });
    });
    this._backButtonHitArea.disableInteractive();
    this.tweens.add({ targets: this.decorLayer, alpha: 0, duration: OTHER_CARDS_FADE_MS });
    this.tweens.add({ targets: chosenGroup, scaleX: 1.06, scaleY: 1.06, duration: OTHER_CARDS_FADE_MS, yoyo: true });

    // CLACK + vibração, ao mesmo tempo (senão o shake roda com a tela já mudando)
    this.cameras.main.shake(VIBRATION_MS, VIBRATION_INTENSITY);
    if (navigator.vibrate) navigator.vibrate(30); // haptic real em celular

    this.time.delayedCall(VIBRATION_MS + 60, () => {
      const cam = this.cameras.main;
      cam.fadeOut(FADE_TO_BLACK_MS, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        // silêncio puro antes de carregar — o "sistema processando"
        this.time.delayedCall(SILENCE_MS, () => {
          this.scene.start('GameScene', { weaponId: weapon.id });
        });
      });
    });
  }

  // Desenha o painel com cantos cortados — igual ao resto do jogo.
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
}
