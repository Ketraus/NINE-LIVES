import EventBus from '../systems/EventBus.js';
import { anchorToScreen } from '../config/layout.js';

// Tamanho "ideal" das cartas — usado como base pro layout, mas o layout
// real (ver _computeLayout) ENCOLHE isso automaticamente quando não cabe
// na tela (ex.: com "Arsenal Expandido" empilhado + Restock, o level-up
// pode ter que mostrar 6 cartas em 2 linhas, o que não cabe nos 512px de
// altura do canvas em tamanho cheio — por isso nunca usar CARD_W/CARD_H
// direto pra montar a tela, sempre passar pelas dimensões calculadas)
// Tamanho grande na tela normal. O cálculo abaixo reduz somente quando o
// número de linhas/Restock realmente exige isso.
// Proporção "oficial" das cartas (as artes têm ~340x565, ou seja, 0,60).
// CARD_W/CARD_H são só a REFERÊNCIA do layout (fontes/paddings escalam a
// partir dela): o tamanho real vem de _computeLayout, que agora AMPLIA as
// cartas até ocupar a tela (MAX_LAYOUT_SCALE) em vez de travar em 230x377.
const CARD_W = 230;
const CARD_H = 377;
const GAP = 10;
const ROW_GAP = 12;

// Botão "Restock" (evolução ARSENAL OVERRIDE): faixa larga embaixo das
// cartas, em tamanho FIXO (não encolhe com as cartas) pra ficar sempre
// legível e fácil de tocar no celular.
const RESTOCK_BTN_W = 300;
const RESTOCK_BTN_H = 54;
const RESTOCK_BTN_GAP = 14; // espaço entre as cartas e o botão
const RESTOCK_ACCENT = 0x4fd1ff;

// Cabeçalho fixo (independe do encolhimento das cartas): margem do topo
// até o título + o próprio título + uma faixa exclusiva reservada só pro
// cursor ">" do hover — nada mais desenha nela, então o cursor nunca
// encosta/invade o texto do título, não importa quantas linhas de carta
// tenham abaixo.
const TITLE_TOP_MARGIN = 14;
const TITLE_TEXT_SIZE = 18;
const CARET_ZONE_H = 24;
const HEADER_H = TITLE_TOP_MARGIN + TITLE_TEXT_SIZE + CARET_ZONE_H;

// Margens de segurança do layout (ver _computeLayout) — nunca deixa o
// baralho encostar na borda do canvas nem no cabeçalho.
const LAYOUT_MARGIN_X = 16;
// folga embaixo: o hover aumenta a carta em 5%, então precisa sobrar espaço
const LAYOUT_MARGIN_BOTTOM = 18;
// 1.5 ≈ tamanho nativo das artes (340x565) — acima disso começa a perder nitidez
const MAX_LAYOUT_SCALE = 1.5;
// com até 3 opções (level-up normal) as cartas ficam um pouco menores, só um
// pouco acima do tamanho das 4 cartas do Arsenal Expandido
const MAX_LAYOUT_SCALE_FEW = 1.2;
const MIN_LAYOUT_SCALE = 0.3;

// Visual "placa de terminal" (mesma paleta do MainMenuScene) usado no
// botão de Restock, pra ele parecer parte do mesmo jogo em vez de um
// retângulo qualquer.
const PIXEL_FONT = '"Press Start 2P", monospace';
const PANEL_FILL = 0x061014;
const PANEL_FILL_ALPHA = 0.55;
const BORDER_IDLE = 0x3d5a66;
const BORDER_HOVER = 0x8fd6ff;
const TEXT_IDLE = '#8fb3bf';
const TEXT_HOVER = '#e8f6ff';
const CHAMFER = 8;

// Visual da raridade (ver campo independente `rarity` em data/upgrades.…
const RARITY_COLORS = { common: 0xe6e6e6, rare: 0x4fd1ff, epic: 0xb26bff };
const RARITY_ICONS = { common: '⚪', rare: '🔵', epic: '🟣' };
const RARITY_LABELS = { common: 'COMUM', rare: 'RARA', epic: 'ÉPICA' };

// Som extra por evolução (id de data/upgrades.js -> chave carregada em
const EVOLUTION_SFX = {
  dog_purify_evo_cyberus: 'sfx_cyberus_wakeup',
  speed_up_evo_tornado: 'sfx_tornado',
  hp_up_evo_colosso: 'sfx_colosso',
  thorns_up_evo_sobrecarga: 'sfx_sobrecarga',
  fists_slam_evo_terremoto: 'sfx_terremoto',
  fists_shockwave_evo_blastix: 'sfx_blastwave',
  katana_double_evo_danca_cortes: 'sfx_danca_cortes',
  pistol_fragmentation_evo_smartshot: 'sfx_smartshot',
  lifesteal_up_evo_hemorrhage: 'sfx_hemorragia',
  arsenal_expandido_evo_override: 'sfx_restock',
  cooldown_down_evo_sixth_sense: 'sfx_sexto_sentido',
  range_up_evo_hunter_instinct: 'sfx_instinto_cacador',
  armor_up_evo_shield: 'sfx_barreira',
  range_up_evo_katana_stray: 'sfx_corte_fantasma',
  // Overcharge é UM id só (dmg_up_evo_overcharge) reaproveitado pelas 3
  dmg_up_evo_overcharge: 'sfx_overcharge',
  katana_shuriken_evo_shurivex: 'sfx_neoshuriken',
  pistol_drone_evo_catforce: 'sfx_catforce',
  range_up_evo_fists_bullet_time: 'sfx_reflexos_predador'
};

// tamanho do quadrado de arte dentro da carta normal/evolução (ver
const CARD_ART_SIZE = 56;
const EVOLUTION_ART_SIZE = 72;

// Cabeçalho fixo da tela de evolução (mesmo padrão do header do level-up
// normal) — título ancorado no topo, carta ocupa o espaço restante e por
// isso pode crescer bastante sem nunca ficar maior que a tela.
const EVOLUTION_GOLD = 0xffd166;
const EVOLUTION_TITLE_SIZE = 20;
const EVOLUTION_TITLE_TOP_MARGIN = 16;
const EVOLUTION_TITLE_GAP = 20;
const EVOLUTION_MARGIN_X = 40;
const EVOLUTION_MARGIN_BOTTOM = 24;
const EVOLUTION_MAX_SCALE = 2.0; // trava de segurança pra não ficar gigante em telas muito largas/altas

// Mostra as cartas de progressão, pausa a física enquanto escolhe, apli…
export default class LevelUpUI {
  constructor(scene, runManager) {
    this.scene = scene;
    this.runManager = runManager;
    this.container = scene.add.container(0, 0).setDepth(300).setVisible(false).setScrollFactor(0);
    this.contentContainer = null;
    this._applyZoomCompensation(this.container);
    // limite do Restock: 1 uso por level-up (zera só quando um NOVO level-up
    this._restockUsed = false;
    this._selectedUpgradeId = null;

    EventBus.on('level-up', ({ options }) => {
      if (this.scene.isGameOver || this.scene.hasWon) return;
      this._restockUsed = false;
      if (!this.scene.multiplayer?.queueLevelUp(options)) this.show(options);
    });
    EventBus.on('evolution-ready', ({ evolution }) => this.showEvolution(evolution));
  }

  // Mesmo bug/correção do HUD (ver HUD._applyZoomCompensation): a câmera
  // Pixels de tela 1:1: (0,0) = canto superior esquerdo REAL da tela.
  _applyZoomCompensation(container) {
    anchorToScreen(container, this.scene.cameras.main, 1);
  }

  show(options) {
    if (this.scene.isGameOver || this.scene.hasWon) return;
    const excludedIds = this.scene.multiplayer?.getSelectedUpgradeIds() || [];
    // prioriza cartas que os outros jogadores não pegaram, mas NUNCA reduz a
    // quantidade: as repetidas vão pro fim da lista (antes sobravam 1-2 cartas)
    if (excludedIds.length > 0) {
      options = [
        ...options.filter((option) => !excludedIds.includes(option.id)),
        ...options.filter((option) => excludedIds.includes(option.id))
      ];
    }
    this._selectedUpgradeId = null;
    this._openOverlay();

    const hasRestock = !!this.runManager.runState.hasRestock;
    this._setLevelUpContentMode(false);

    // o layout escolhe sozinho quantas cartas por linha deixam as cartas
    // MAIORES possíveis dentro da tela (3 cartas = 1 linha grande; com
    // Arsenal Expandido pode virar 1 linha de 4-6 ou 2 linhas)
    const { cardW, cardH, gap, rowGap, cardsPerRow } = this._computeLayout(options.length, hasRestock);
    const rows = [];
    for (let i = 0; i < options.length; i += cardsPerRow) {
      rows.push(options.slice(i, i + cardsPerRow));
    }

    const screenCx = this.scene.scale.width / 2;
    const visible = this._getVisibleUiBounds();
    const cx = screenCx;
    // o botão Restock ocupa uma faixa fixa no fim da tela
    const restockZone = hasRestock ? RESTOCK_BTN_H + RESTOCK_BTN_GAP : 0;

    // as cartas vivem só no espaço ABAIXO do cabeçalho fixo (título + faixa
    // do cursor), centralizadas verticalmente no que sobra
    const totalH = rows.length * cardH + (rows.length - 1) * rowGap;
    const availableRowsH = visible.bottom - visible.top - HEADER_H - LAYOUT_MARGIN_BOTTOM - restockZone;
    const rowsTop = visible.top + HEADER_H + Math.max(0, (availableRowsH - totalH) / 2);
    const startY = rowsTop + cardH / 2;

    const title = this.scene.add
      .text(screenCx, visible.top + TITLE_TOP_MARGIN + TITLE_TEXT_SIZE / 2, 'SUBIU DE NÍVEL — escolha um upgrade', {
        fontSize: `${TITLE_TEXT_SIZE}px`,
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
      this.contentContainer.add(title);

    rows.forEach((row, rowIndex) => {
      const rowY = startY + rowIndex * (cardH + rowGap);
      const totalW = row.length * cardW + (row.length - 1) * gap;
      const startX = cx - totalW / 2 + cardW / 2;
      row.forEach((upgrade, i) => {
        const x = startX + i * (cardW + gap);
        const card = this._buildCard(x, rowY, upgrade, cardW, cardH);
        this.contentContainer.add(card);
        this._animateCardIn(card, rowIndex * row.length + i);
      });
    });

    if (hasRestock) {
      // logo abaixo das cartas (centralizado), sempre dentro da tela
      const btnY = Math.min(
        rowsTop + totalH + RESTOCK_BTN_GAP + RESTOCK_BTN_H / 2,
        visible.bottom - 8 - RESTOCK_BTN_H / 2
      );
      this.contentContainer.add(this._buildRestockButton(cx, btnY));
    }

    this.container.setVisible(true);
  }

  showWaiting() {
    if (this.scene.isGameOver || this.scene.hasWon || this.scene.multiplayerWaitingForLevelUp) return;
    this.scene.multiplayerWaitingForLevelUp = true;
    this._openOverlay();
    this._setLevelUpContentMode(false);
    this.contentContainer.add(this.scene.add.text(
      this.scene.scale.width / 2,
      this.scene.scale.height / 2,
      'AGUARDANDO OUTRO JOGADOR',
      { fontSize: '16px', color: '#e8f6ff' }
    ).setOrigin(0.5).setScrollFactor(0));
    this.container.setVisible(true);
  }

  finishMultiplayerRound() {
    this.scene.multiplayerWaitingForLevelUp = false;
    this.scene.multiplayer.levelUpActive = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    EventBus.emit('levelup-closed');
  }

  // Calcula o tamanho REAL das cartas nesta tela. Testa todas as formas de
  // dividir as opções em linhas (1 linha de N, 2 linhas...) e fica com a
  // que permite a MAIOR carta dentro da tela útil (largura x altura abaixo do
  // cabeçalho), limitada a MAX_LAYOUT_SCALE (tamanho nativo da arte). Gaps e o
  // bloco do Restock escalam junto, então nada vaza da tela.
  _computeLayout(optionCount, hasRestock) {
    const visible = this._getVisibleUiBounds();
    const availableW = visible.right - visible.left - LAYOUT_MARGIN_X * 2;
    const availableH = visible.bottom - visible.top - HEADER_H - LAYOUT_MARGIN_BOTTOM
      - (hasRestock ? RESTOCK_BTN_H + RESTOCK_BTN_GAP : 0);

    let best = null;
    for (let perRow = 1; perRow <= Math.max(1, optionCount); perRow++) {
      const rowCount = Math.ceil(optionCount / perRow);
      const naturalW = perRow * CARD_W + (perRow - 1) * GAP;
      const naturalH = rowCount * CARD_H + (rowCount - 1) * ROW_GAP;
      const fit = Math.min(availableW / naturalW, availableH / naturalH);
      // empate -> menos linhas (leitura mais natural)
      if (!best || fit > best.fit + 0.001) best = { perRow, fit };
    }

    const maxScale = optionCount <= 3 ? MAX_LAYOUT_SCALE_FEW : MAX_LAYOUT_SCALE;
    const scale = Math.max(MIN_LAYOUT_SCALE, Math.min(maxScale, best.fit));
    return {
      scale,
      cardsPerRow: best.perRow,
      cardW: CARD_W * scale,
      cardH: CARD_H * scale,
      gap: GAP * scale,
      rowGap: ROW_GAP * scale
    };
  }

  // Tela dedicada de evolução: uma carta só, sem escolha entre opções — s…
  showEvolution(evolution) {
    if (this.scene.isGameOver || this.scene.hasWon) return;
    this._openOverlay();
    this._setLevelUpContentMode(false);

    // toca assim que a carta evoluída APARECE na tela (o jogador acabou de
    this.scene.sound.play('sfx_evolution_effect', { volume: 0.6 });

    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const visible = this._getVisibleUiBounds();
    const cx = screenW / 2;

    // carta cresce pra ocupar o espaço abaixo do título (mesma lógica do
    // header do level-up normal) — é uma carta só na tela, então sobra
    // bastante espaço, e isso resolve o "está pequeno" sem chute manual
    const scale = this._computeEvolutionScale();
    const cardW = CARD_W * scale;
    const cardH = CARD_H * scale;
    const headerH = EVOLUTION_TITLE_TOP_MARGIN + EVOLUTION_TITLE_SIZE + EVOLUTION_TITLE_GAP;
    const availableH = visible.bottom - visible.top - headerH - EVOLUTION_MARGIN_BOTTOM;
    const cardTop = visible.top + headerH + Math.max(0, (availableH - cardH) / 2);
    const cardCenterY = cardTop + cardH / 2;

    const title = this.scene.add
      .text(cx, visible.top + EVOLUTION_TITLE_TOP_MARGIN + EVOLUTION_TITLE_SIZE / 2, 'Você desbloqueou uma Evolução!', {
        fontSize: `${EVOLUTION_TITLE_SIZE}px`,
        color: '#ffd166',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.contentContainer.add(title);

    this.contentContainer.add(this._buildEvolutionCard(cx, cardCenterY, evolution, cardW, cardH));

    // clarão dourado rápido no instante em que a carta aparece — não
    // bloqueia clique (não é interativo), só dá aquele "impacto" de
    // conquista antes de sumir
    const flash = this.scene.add
      .rectangle(cx, screenH / 2, screenW, screenH, 0xffe9a8, 0.32)
      .setScrollFactor(0);
    this.contentContainer.add(flash);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 320,
      ease: 'Sine.easeOut',
      onComplete: () => flash.destroy()
    });

    this.container.setVisible(true);
  }

  // Tamanho da carta de evolução: cresce pra ocupar o espaço abaixo do
  // título, travado num teto (EVOLUTION_MAX_SCALE) pra não ficar absurda
  // em telas muito largas.
  _computeEvolutionScale() {
    const screenW = this.scene.scale.width;
    const visible = this._getVisibleUiBounds();
    const headerH = EVOLUTION_TITLE_TOP_MARGIN + EVOLUTION_TITLE_SIZE + EVOLUTION_TITLE_GAP;
    const availableW = visible.right - visible.left - EVOLUTION_MARGIN_X * 2;
    const availableH = visible.bottom - visible.top - headerH - EVOLUTION_MARGIN_BOTTOM;
    return Math.min(availableW / CARD_W, availableH / CARD_H, EVOLUTION_MAX_SCALE);
  }

  // O container já está preso à tela em pixels 1:1 (ver _applyZoomCompensation),
  // então a área útil é simplesmente a tela inteira.
  _getVisibleUiBounds() {
    return { left: 0, right: this.scene.scale.width, top: 0, bottom: this.scene.scale.height };
  }

  // Comum a show() e showEvolution(): limpa a tela anterior e pausa o jog…
  _openOverlay() {
    this._applyZoomCompensation(this.container); // zoom pode ter mudado desde o construtor
    this.container.removeAll(true);
    this.scene.physics.pause();
    this.scene.time.timeScale = 0;
    EventBus.emit('levelup-opened');

    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;
    const overlay = this.scene.add
      .rectangle(cx, cy, this.scene.scale.width, this.scene.scale.height, 0x000000, 0.65)
      .setScrollFactor(0);
    this.container.add(overlay);
    this.contentContainer = this.scene.add.container(0, 0).setScrollFactor(0);
    this.container.add(this.contentContainer);
  }

  // Mantido por compatibilidade: o conteúdo agora usa sempre a mesma escala
  // do container (a tela inteira em pixels 1:1), sem modo especial de Arsenal.
  _setLevelUpContentMode() {
    this.contentContainer?.setScale(1).setPosition(0, 0);
  }

  _buildCard(x, y, upgrade, cardW = CARD_W, cardH = CARD_H) {
    const group = this.scene.add.container(x, y);
    const ratio = cardW / CARD_W; // reduz fontes/paddings junto do encolhimento automático

    // raridade decide a cor do glow/cursor também (comum=branco, rara=azul,
    // épica=roxo) — calculada ANTES dos dois caminhos (com/sem arte)
    const isExclusive = upgrade.category === 'exclusive';
    const rarity = upgrade.rarity || 'common';
    const accentColor = RARITY_COLORS[rarity] ?? RARITY_COLORS.common;
    const accentHex = `#${accentColor.toString(16).padStart(6, '0')}`;

    // com arte própria (ver data/cardArt.js), a imagem VIRA a carta inteira
    const artKey = `card_${upgrade.id}`;
    if (this.scene.textures.exists(artKey)) {
      const art = this.scene.add
        .image(0, 0, artKey)
        .setDisplaySize(cardW, cardH)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      group.add(art);

      // criado DEPOIS da arte pra desenhar por CIMA dela — é a carta que
      // acende na própria borda, não um brilho atrás vazando pro cenário
      const setHoverFx = this._addHoverFx(group, cardW, cardH, accentColor);

      art.on('pointerover', () => {
        this._springHover(group, true);
        setHoverFx(true);
        this.scene.sound.play('sfx_hover', { volume: 0.5 });
      });
      art.on('pointerout', () => {
        this._springHover(group, false);
        setHoverFx(false);
      });
      art.on('pointerdown', () => this._choose(upgrade));

      return group;
    }

    const bg = this.scene.add
      .rectangle(0, 0, cardW, cardH, 0x22252e, 0.95)
      .setStrokeStyle(2, accentColor)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const name = this.scene.add
      .text(0, -cardH / 2 + 30 * ratio, upgrade.name, {
        fontSize: `${Math.round(16 * ratio)}px`,
        color: accentHex
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const desc = this.scene.add
      .text(0, 8 * ratio, upgrade.description, {
        fontSize: `${Math.round(13 * ratio)}px`,
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: cardW - 24 * ratio }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // topo da carta: raridade sempre visível (ícone + rótulo); cartas
    const rarityLabel = RARITY_LABELS[rarity] ?? RARITY_LABELS.common;
    const tagText = isExclusive
      ? `${RARITY_ICONS[rarity]} ${rarityLabel} · EXCLUSIVA`
      : `${RARITY_ICONS[rarity]} ${rarityLabel}`;
    const tag = this.scene.add
      .text(0, -cardH / 2 + 12 * ratio, tagText, { fontSize: `${Math.round(10 * ratio)}px`, color: accentHex })
      .setOrigin(0.5)
      .setScrollFactor(0);

    group.add([bg, name, desc, tag]);

    // criado DEPOIS do fundo/textos pra desenhar por cima, mesmo motivo
    // do caminho com arte acima
    const setHoverFx = this._addHoverFx(group, cardW, cardH, accentColor);

    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, 0xffffff);
      this._springHover(group, true); // mola/boing (ver _springHover) no lugar do scale seco de antes
      setHoverFx(true);
      this.scene.sound.play('sfx_hover', { volume: 0.5 });
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, accentColor);
      this._springHover(group, false);
      setHoverFx(false);
    });
    bg.on('pointerdown', () => this._choose(upgrade));

    return group;
  }

  // Efeito de mola (squash/stretch com overshoot) ao entrar/sair do hover.
  // Rápido e sutil: um esticão inicial em direções opostas nos dois eixos
  // (a carta "reage" ao toque), seguido de um acomodar com Back.easeOut
  // (passa um pouquinho do tamanho final e volta) — física, não um scale
  // instantâneo/seco. Saída é mais direta, sem mola, pra não enrolar
  // quando o mouse passa rápido pra próxima carta.
  _springHover(group, entering, targetScale = 1.05) {
    this.scene.tweens.killTweensOf(group);
    // se a carta ainda estava no fade-in de entrada (ver _animateCardIn) e
    // o hover matou aquele tween no meio do caminho, sem isso ela ficava
    // travada transparente pra sempre — hover nunca pode deixar a carta
    // com opacidade parcial.
    group.setAlpha(1);

    if (!entering) {
      this.scene.tweens.add({
        targets: group,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Sine.easeOut'
      });
      return;
    }

    const TARGET = targetScale;
    this.scene.tweens.add({
      targets: group,
      scaleX: TARGET * 0.94, // esticão rápido: aperta na horizontal...
      scaleY: TARGET * 1.08, // ...e estica na vertical, como um "boing" de impacto
      duration: 70,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: group,
          scaleX: TARGET,
          scaleY: TARGET,
          duration: 150,
          ease: 'Back.easeOut',
          easeParams: [2.4] // overshoot pequeno, some rápido — sutil, não exagerado
        });
      }
    });
  }

  // Glow por raridade (comum=branco, rara=azul, épica=roxo — mesmas cores
  // de RARITY_COLORS) + cursor de terminal "v" (">" rotacionado, apontando
  // reto pra carta) piscando acima dela — ligados juntos no pointerover/
  // pointerout de quem chamar. Retorna a função pra ativar/desativar os
  // dois de uma vez.
  //
  // IMPORTANTE: nada aqui passa do tamanho w x h da própria carta — os
  // anéis crescem só PRA DENTRO (pad <= 0) e o véu de luz é do tamanho
  // exato da carta. É a carta acendendo por dentro/na própria borda, sem
  // nenhum brilho escapando pro cenário atrás (grama do menu etc.). Por
  // isso também precisa ser adicionado ao grupo DEPOIS da arte/fundo —
  // desenhado por cima, não atrás.
  _addHoverFx(group, w, h, color = 0x8fd6ff) {
    const glowContainer = this.scene.add.container(0, 0).setScrollFactor(0).setVisible(false);

    // véu aditivo do tamanho EXATO da carta — clareia ela por dentro,
    // nunca maior que isso (bem suave, só um "aquecimento" de tom)
    const wash = this.scene.add.rectangle(0, 0, w, h, color, 0.07).setBlendMode(Phaser.BlendModes.ADD);
    glowContainer.add(wash);

    // anéis colados/PRA DENTRO da borda (pad 0 ou negativo) — acende bem
    // na linha da carta, sem sobrar nem 1px pro lado de fora
    [
      { pad: 0, strokeW: 3, alpha: 0.65 },
      { pad: -6, strokeW: 2, alpha: 0.3 },
      { pad: -12, strokeW: 2, alpha: 0.12 }
    ].forEach(({ pad, strokeW, alpha }) => {
      const ring = this.scene.add.rectangle(0, 0, w + pad * 2, h + pad * 2).setStrokeStyle(strokeW, color, alpha);
      glowContainer.add(ring);
    });
    group.add(glowContainer);

    // ">" deitado de lado vira uma seta pra baixo — aponta reto pra carta,
    // não solta no vazio.
    const colorHex = `#${color.toString(16).padStart(6, '0')}`;
    const caret = this.scene.add
      .text(0, -h / 2 - CARET_ZONE_H / 2, '>', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: colorHex
      })
      .setOrigin(0.5)
      .setRotation(Math.PI / 2)
      .setScrollFactor(0)
      .setVisible(false);
    group.add(caret);

    const caretBaseY = caret.y;
    let tweens = [];
    return (active) => {
      tweens.forEach((t) => t.stop());
      tweens = [];
      glowContainer.setVisible(active);
      caret.setVisible(active);
      if (!active) return;

      glowContainer.setAlpha(0.65);
      caret.setAlpha(1);
      caret.y = caretBaseY;

      // respiro do glow (não é um blink duro, é uma pulsação de "coisa viva")
      tweens.push(
        this.scene.tweens.add({
          targets: glowContainer,
          alpha: { from: 0.55, to: 0.85 },
          duration: 620,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
      );
      // cursor de terminal: pisca...
      tweens.push(
        this.scene.tweens.add({
          targets: caret,
          alpha: { from: 1, to: 0.1 },
          duration: 260,
          yoyo: true,
          repeat: -1
        })
      );
      // ...e baila bem de leve pra baixo/cima, empurrando o olhar pra carta.
      tweens.push(
        this.scene.tweens.add({
          targets: caret,
          y: caretBaseY + 5,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
      );
    };
  }

  // Entrada suave das cartas ao abrir o level-up: sobem um pouco enquanto
  // aparecem, com um pequeno atraso escalonado por carta (esquerda->direita).
  _animateCardIn(group, index) {
    const targetY = group.y;
    group.y = targetY + 18;
    group.setAlpha(0);
    this.scene.tweens.add({
      targets: group,
      y: targetY,
      alpha: 1,
      duration: 260,
      delay: index * 40,
      ease: 'Cubic.easeOut'
    });
  }

  // Carta única de evolução: maior, com brilho dourado, sem "rivais" ao l…
  _buildEvolutionCard(x, y, evolution, w, h) {
    const group = this.scene.add.container(x, y);
    const ratio = w / CARD_W; // fontes/paddings acompanham o tamanho dinâmico da carta

    // mesma arte da carta base (ver data/cardArt.js) — a evolução usa o
    // artId quando existe (evolução com nome/arte por arma, ver
    // RunManager._resolveEvolutionName), senão cai no próprio id
    const artKey = `card_${evolution.artId ?? evolution.id}`;
    if (this.scene.textures.exists(artKey)) {
      const art = this.scene.add
        .image(0, 0, artKey)
        .setDisplaySize(w, h)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      group.add(art);

      this._addEvolutionGoldFrame(group, w, h); // por cima da arte, sempre visível

      art.on('pointerover', () => {
        this._springHover(group, true, 1.06);
        this.scene.sound.play('sfx_hover', { volume: 0.5 });
      });
      art.on('pointerout', () => this._springHover(group, false));
      art.on('pointerdown', () => this._chooseEvolution(evolution));

      this._popIn(group);
      return group;
    }

    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x2a2410, 0.97)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const name = this.scene.add
      .text(0, -h / 2 + 30 * ratio, evolution.name, {
        fontSize: `${Math.round(20 * ratio)}px`,
        color: '#ffd166',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const desc = this.scene.add
      .text(0, 6 * ratio, evolution.description, {
        fontSize: `${Math.round(12 * ratio)}px`,
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: w - 30 * ratio }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const hint = this.scene.add
      .text(0, h / 2 - 22 * ratio, 'Clique para confirmar', {
        fontSize: `${Math.round(9 * ratio)}px`,
        color: '#ffe9a8'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    group.add([bg, name, desc, hint]);
    this._addEvolutionGoldFrame(group, w, h); // por cima de tudo, sempre visível

    bg.on('pointerover', () => {
      this._springHover(group, true, 1.06);
      this.scene.sound.play('sfx_hover', { volume: 0.5 });
    });
    bg.on('pointerout', () => this._springHover(group, false));
    bg.on('pointerdown', () => this._chooseEvolution(evolution));

    this._popIn(group);
    return group;
  }

  // Moldura dourada da carta de evolução: fica ligada o tempo TODO (não
  // depende de hover — é isso que faz o jogador sentir "eu ganhei uma
  // evolução" assim que a tela abre), respirando bem devagar. Mesma regra
  // das outras cartas: anéis só PRA DENTRO da borda (nunca vaza pro
  // cenário atrás) + 4 cantos ornamentados, tudo contido em w x h.
  _addEvolutionGoldFrame(group, w, h) {
    const frame = this.scene.add.container(0, 0).setScrollFactor(0);

    const wash = this.scene.add.rectangle(0, 0, w, h, EVOLUTION_GOLD, 0.07).setBlendMode(Phaser.BlendModes.ADD);
    frame.add(wash);

    const rings = [
      { pad: 0, strokeW: 4, alpha: 0.95 },
      { pad: -8, strokeW: 2, alpha: 0.5 },
      { pad: -16, strokeW: 2, alpha: 0.22 }
    ].map(({ pad, strokeW, alpha }) => {
      const ring = this.scene.add.rectangle(0, 0, w + pad * 2, h + pad * 2).setStrokeStyle(strokeW, EVOLUTION_GOLD, alpha);
      frame.add(ring);
      return ring;
    });

    // acentos nos 4 cantos — toque de "moldura antiga", sem precisar de
    // arte nova, sempre dentro dos limites da carta
    const inset = 12 * (w / (CARD_W * 1.2));
    const corners = [
      [-w / 2 + inset, -h / 2 + inset],
      [w / 2 - inset, -h / 2 + inset],
      [w / 2 - inset, h / 2 - inset],
      [-w / 2 + inset, h / 2 - inset]
    ];
    const cornerMarks = corners.map(([mx, my]) => {
      const mark = this.scene.add.rectangle(mx, my, 9, 9, EVOLUTION_GOLD, 0.9).setRotation(Math.PI / 4);
      frame.add(mark);
      return mark;
    });

    group.add(frame);

    // respiro contínuo — bem devagar, piscando levemente, não gated por
    // hover (a carta já nasce brilhando)
    this.scene.tweens.add({
      targets: [...rings, ...cornerMarks, wash],
      alpha: { from: 0.55, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    return frame;
  }

  // Entrada da carta de evolução: um "pop" mais dramático que o das
  // cartas normais (nasce menor e some crescendo com um pequeno estouro),
  // pra marcar bem o momento — é uma conquista, tem que parecer uma.
  _popIn(group) {
    group.setAlpha(0);
    group.setScale(0.6);
    this.scene.tweens.add({
      targets: group,
      alpha: 1,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 260,
      ease: 'Back.easeOut',
      easeParams: [2],
      onComplete: () => {
        this.scene.tweens.add({ targets: group, scaleX: 1, scaleY: 1, duration: 160, ease: 'Sine.easeOut' });
      }
    });
  }

  // Botão do Restock (evolução ARSENAL OVERRIDE): faixa simples embaixo das
  // cartas — ícone de recarregar + "RESTOCK" + legenda curta. Azul-ciano
  // bem visível quando disponível; cinza e "JÁ USADO" depois do uso.
  _buildRestockButton(x, y) {
    const w = RESTOCK_BTN_W;
    const h = RESTOCK_BTN_H;
    const used = this._restockUsed;
    const group = this.scene.add.container(x, y);

    const idleBorder = used ? 0x3a444b : RESTOCK_ACCENT;
    const textColor = used ? '#5c666c' : '#e8f6ff';
    const subColor = used ? '#4a5358' : '#8fd6ff';
    const iconColor = used ? 0x5c666c : RESTOCK_ACCENT;

    const panel = this.scene.add.graphics().setScrollFactor(0);
    const paint = (border, fillAlpha) => {
      panel.clear();
      this._drawChamferPanel(panel, w, h, border);
      if (!used) {
        panel.fillStyle(RESTOCK_ACCENT, fillAlpha);
        panel.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 2);
      }
    };
    paint(idleBorder, 0.1);

    const icon = this.scene.add.graphics().setScrollFactor(0);
    icon.setPosition(-w / 2 + 34, 0);
    this._drawRefreshIcon(icon, 11, iconColor);

    const name = this.scene.add
      .text(-w / 2 + 62, used ? 0 : -8, used ? 'RESTOCK  ·  JÁ USADO' : 'RESTOCK', {
        fontFamily: PIXEL_FONT,
        fontSize: '14px',
        color: textColor
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    const sub = this.scene.add
      .text(-w / 2 + 62, 11, 'SORTEAR NOVAS CARTAS', {
        fontFamily: PIXEL_FONT,
        fontSize: '8px',
        color: subColor
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setVisible(!used);

    group.add([panel, icon, name, sub]);

    if (!used) {
      const spin = this.scene.tweens.add({ targets: icon, rotation: Math.PI * 2, duration: 6000, repeat: -1 });
      const hit = this.scene.add
        .rectangle(0, 0, w, h, 0xffffff, 0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      group.add(hit);

      hit.on('pointerover', () => {
        paint(0xffffff, 0.22);
        spin.timeScale = 4;
        this.scene.sound.play('sfx_hover', { volume: 0.5 });
      });
      hit.on('pointerout', () => {
        paint(idleBorder, 0.1);
        spin.timeScale = 1;
      });
      hit.on('pointerdown', () => this._restock());
    }

    return group;
  }

  // Painel "placa de terminal" com cantos cortados — mesmo desenho do
  // MainMenuScene._drawPanel, reaproveitado aqui pro Restock ter a
  // mesma identidade visual do resto do jogo em vez de um placeholder.
  _drawChamferPanel(g, w, h, borderColor) {
    const c = Math.min(CHAMFER, w / 2, h / 2);
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
    g.lineStyle(2, borderColor, 1);
    g.strokePoints(points, true);
  }

  // Ícone de "recarregar" desenhado na mão (arco + ponta de seta) em vez
  // de emoji — combina com o resto da UI e pode ser recolorido/girado.
  _drawRefreshIcon(g, radius, color) {
    g.clear();
    g.lineStyle(Math.max(2, radius * 0.22), color, 1);
    const start = Phaser.Math.DegToRad(-50);
    const end = Phaser.Math.DegToRad(230);
    g.beginPath();
    g.arc(0, 0, radius, start, end, false);
    g.strokePath();

    const tipX = Math.cos(start) * radius;
    const tipY = Math.sin(start) * radius;
    const headSize = radius * 0.55;
    const a1 = start + 2.5;
    const a2 = start - 1.1;
    g.fillStyle(color, 1);
    g.fillTriangle(
      tipX,
      tipY,
      tipX + Math.cos(a1) * headSize,
      tipY + Math.sin(a1) * headSize,
      tipX + Math.cos(a2) * headSize,
      tipY + Math.sin(a2) * headSize
    );
  }

  // Reamostra as opções do level-up atual e redesenha a tela (mantém
  _restock() {
    if (this._restockUsed) return;
    const options = this.runManager.rerollOptions();
    if (!options) return;
    this._restockUsed = true;
    this.show(options);
  }

  _choose(upgrade) {
    this.scene.sound.play('sfx_card_select', { volume: 0.6 });
    this._selectedUpgradeId = upgrade.id;
    // chooseUpgrade() pode, de forma síncrona, emitir 'evolution-ready' e
    const evolutionTriggered = this.runManager.chooseUpgrade(upgrade);
    if (!evolutionTriggered) {
      this._close();
    }
  }

  _chooseEvolution(evolution) {
    this.scene.sound.play('sfx_card_select', { volume: 0.6 });
    // sfx_evolution_effect agora toca em showEvolution() (quando a carta
    const extraSfx = EVOLUTION_SFX[evolution.id];
    if (extraSfx) this.scene.sound.play(extraSfx, { volume: 0.7 });
    this.runManager.confirmEvolution(evolution);
    this._close();
  }

  _close() {
    this.container.setVisible(false);
    this.container.removeAll(true);

    // ainda tem level-up na fila (XP de sobra rendeu mais de um nível de
    // uma vez, ver RunState.addXp) — abre o próximo direto, sem retomar o
    // jogo no meio do caminho
    const hasPendingLevelUp = this.runManager.hasPendingLevelUp();
    if (hasPendingLevelUp) {
      this.runManager.triggerNextLevelUp();
    }

    if (this.scene.multiplayer?.completeLevelUpChoice(this._selectedUpgradeId)) {
      this._selectedUpgradeId = null;
      return;
    }
    if (hasPendingLevelUp) return;

    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    EventBus.emit('levelup-closed');
  }
}
