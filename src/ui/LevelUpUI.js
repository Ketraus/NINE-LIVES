import EventBus from '../systems/EventBus.js';

// Tamanho "ideal" das cartas — usado como base pro layout, mas o layout
// real (ver _computeLayout) ENCOLHE isso automaticamente quando não cabe
// na tela (ex.: com "Arsenal Expandido" empilhado + Restock, o level-up
// pode ter que mostrar 6 cartas em 2 linhas, o que não cabe nos 512px de
// altura do canvas em tamanho cheio — por isso nunca usar CARD_W/CARD_H
// direto pra montar a tela, sempre passar pelas dimensões calculadas)
const CARD_W = 170;
const CARD_H = 281;
const GAP = 14;
const ROW_GAP = 18;
// Máximo de cartas por linha antes de quebrar pra próxima — com
const CARDS_PER_ROW = 3;

// Carta "Restock" (evolução ARSENAL OVERRIDE): fica ao lado do baralho…
const RESTOCK_W = 96;
const RESTOCK_GAP = 16;

// Cabeçalho fixo (independe do encolhimento das cartas): margem do topo
// até o título + o próprio título + uma faixa exclusiva reservada só pro
// cursor ">" do hover — nada mais desenha nela, então o cursor nunca
// encosta/invade o texto do título, não importa quantas linhas de carta
// tenham abaixo.
const TITLE_TOP_MARGIN = 14;
const TITLE_TEXT_SIZE = 16;
const CARET_ZONE_H = 30;
const HEADER_H = TITLE_TOP_MARGIN + TITLE_TEXT_SIZE + CARET_ZONE_H;

// Margens de segurança do layout (ver _computeLayout) — nunca deixa o
// baralho encostar na borda do canvas nem no cabeçalho.
const LAYOUT_MARGIN_X = 14;
const LAYOUT_MARGIN_BOTTOM = 16;
// não deixa o encolhimento automático virar sopa de letrinhas ilegível
const MIN_LAYOUT_SCALE = 0.6;

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

// Mostra as cartas de progressão, pausa a física enquanto escolhe, apli…
export default class LevelUpUI {
  constructor(scene, runManager) {
    this.scene = scene;
    this.runManager = runManager;
    this.container = scene.add.container(0, 0).setDepth(300).setVisible(false);
    this._applyZoomCompensation(this.container);
    // limite do Restock: 1 uso por level-up (zera só quando um NOVO level-up
    this._restockUsed = false;

    EventBus.on('level-up', ({ options }) => {
      this._restockUsed = false;
      this.show(options);
    });
    EventBus.on('evolution-ready', ({ evolution }) => this.showEvolution(evolution));
  }

  // Mesmo bug/correção do HUD (ver HUD._applyZoomCompensation): a câmera
  _applyZoomCompensation(container) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    if (zoom === 1) return;
    const inv = 1 / zoom;
    container.setScale(inv);
    container.setPosition(cam.centerX * (1 - inv), cam.centerY * (1 - inv));
  }

  show(options) {
    this._openOverlay();

    const hasRestock = !!this.runManager.runState.hasRestock;

    // quebra as opções em linhas de até CARDS_PER_ROW cartas, pra não
    const rows = [];
    for (let i = 0; i < options.length; i += CARDS_PER_ROW) {
      rows.push(options.slice(i, i + CARDS_PER_ROW));
    }

    // dimensões desta tela em particular — encolhem sozinhas se o baralho
    // (rows x cards, + Restock) não couber no espaço abaixo do cabeçalho
    const { cardW, cardH, gap, rowGap, restockW, restockGap } = this._computeLayout(rows, hasRestock);

    const screenCx = this.scene.scale.width / 2;
    const screenH = this.scene.scale.height;
    // com Restock ativo, o baralho normal é deslocado pra esquerda pra
    const cx = hasRestock ? screenCx - (restockW + restockGap) / 2 : screenCx;

    // as cartas vivem só no espaço ABAIXO do cabeçalho fixo (título + faixa
    // do cursor), centralizadas no que sobra até o fim da tela — o título
    const totalH = rows.length * cardH + (rows.length - 1) * rowGap;
    const availableRowsH = screenH - HEADER_H - LAYOUT_MARGIN_BOTTOM;
    const rowsTop = HEADER_H + Math.max(0, (availableRowsH - totalH) / 2);
    const startY = rowsTop + cardH / 2;

    const title = this.scene.add
      .text(screenCx, TITLE_TOP_MARGIN + TITLE_TEXT_SIZE / 2, 'SUBIU DE NÍVEL — escolha um upgrade', {
        fontSize: `${TITLE_TEXT_SIZE}px`,
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.container.add(title);

    rows.forEach((row, rowIndex) => {
      const rowY = startY + rowIndex * (cardH + rowGap);
      const totalW = row.length * cardW + (row.length - 1) * gap;
      const startX = cx - totalW / 2 + cardW / 2;
      row.forEach((upgrade, i) => {
        const x = startX + i * (cardW + gap);
        const card = this._buildCard(x, rowY, upgrade, cardW, cardH);
        this.container.add(card);
        this._animateCardIn(card, rowIndex * row.length + i);
      });
    });

    if (hasRestock) {
      const fullRowW = CARDS_PER_ROW * cardW + (CARDS_PER_ROW - 1) * gap;
      const restockX = cx + fullRowW / 2 + restockGap + restockW / 2;
      const blockCenterY = rowsTop + totalH / 2;
      this.container.add(this._buildRestockCard(restockX, blockCenterY, totalH, restockW));
    }

    this.container.setVisible(true);
  }

  // Calcula o tamanho REAL das cartas nesta tela: começa do tamanho
  // "ideal" (CARD_W/CARD_H) e encolhe tudo proporcionalmente (cartas,
  // gaps e o bloco do Restock) só o suficiente pra caber no espaço
  // disponível abaixo do cabeçalho fixo — é isso que evita cartas
  // cortadas/fora da tela quando o baralho cresce (Arsenal Expandido soma
  // opções, e com 2+ linhas as cartas em tamanho cheio não cabem na
  // altura). Margens laterais e gaps enxutos + o mínimo mais alto (0.6)
  // deixam a área de seleção ocupar mais tela mesmo no pior caso (3x
  // Arsenal Expandido + Restock = 6 cartas em 2 linhas).
  _computeLayout(rows, hasRestock) {
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;

    const maxCardsInRow = rows.reduce((max, row) => Math.max(max, row.length), 1);
    const restockBlock = hasRestock ? RESTOCK_GAP + RESTOCK_W : 0;
    const naturalW = maxCardsInRow * CARD_W + (maxCardsInRow - 1) * GAP + restockBlock;
    const naturalH = rows.length * CARD_H + Math.max(0, rows.length - 1) * ROW_GAP;

    const availableW = screenW - LAYOUT_MARGIN_X * 2;
    const availableH = screenH - HEADER_H - LAYOUT_MARGIN_BOTTOM;

    const scale = Math.max(MIN_LAYOUT_SCALE, Math.min(1, availableW / naturalW, availableH / naturalH));

    return {
      scale,
      cardW: CARD_W * scale,
      cardH: CARD_H * scale,
      gap: GAP * scale,
      rowGap: ROW_GAP * scale,
      restockW: RESTOCK_W * scale,
      restockGap: RESTOCK_GAP * scale
    };
  }

  // Tela dedicada de evolução: uma carta só, sem escolha entre opções — s…
  showEvolution(evolution) {
    this._openOverlay();

    // toca assim que a carta evoluída APARECE na tela (o jogador acabou de
    this.scene.sound.play('sfx_evolution_effect', { volume: 0.6 });

    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    const title = this.scene.add
      .text(cx, cy - CARD_H / 2 - 46, 'Você desbloqueou uma Evolução!', {
        fontSize: '18px',
        color: '#ffd166',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.container.add(title);

    this.container.add(this._buildEvolutionCard(cx, cy, evolution));
    this.container.setVisible(true);
  }

  // Comum a show() e showEvolution(): limpa a tela anterior e pausa o jog…
  _openOverlay() {
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
  _springHover(group, entering) {
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

    const TARGET = 1.05;
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
  _buildEvolutionCard(x, y, evolution) {
    // mesmo fator nos dois eixos (em vez dos antigos 1.3/1.15) pra manter
    // a proporção 0.6 da arte real — carta de evolução só fica maior,
    // sem distorcer
    const EVOLUTION_SCALE = 1.2;
    const w = CARD_W * EVOLUTION_SCALE;
    const h = CARD_H * EVOLUTION_SCALE;
    const group = this.scene.add.container(x, y);

    // mesma arte da carta base (ver data/cardArt.js) — a evolução usa o
    // artId quando existe (evolução com nome/arte por arma, ver
    // RunManager._resolveEvolutionName), senão cai no próprio id
    const artKey = `card_${evolution.artId ?? evolution.id}`;
    if (this.scene.textures.exists(artKey)) {
      const glow = this.scene.add.rectangle(0, 0, w + 18, h + 18, 0xffd166, 0.22).setScrollFactor(0);
      const art = this.scene.add
        .image(0, 0, artKey)
        .setDisplaySize(w, h)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      art.on('pointerover', () => {
        art.setDisplaySize(w * 1.04, h * 1.04);
        this.scene.sound.play('sfx_hover', { volume: 0.5 });
      });
      art.on('pointerout', () => art.setDisplaySize(w, h));
      art.on('pointerdown', () => this._chooseEvolution(evolution));

      group.add([glow, art]);
      return group;
    }

    const glow = this.scene.add.rectangle(0, 0, w + 18, h + 18, 0xffd166, 0.22).setScrollFactor(0);

    const bg = this.scene.add
      .rectangle(0, 0, w, h, 0x2a2410, 0.97)
      .setStrokeStyle(3, 0xffd166)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const name = this.scene.add
      .text(0, -h / 2 + 36, evolution.name, { fontSize: '24px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const desc = this.scene.add
      .text(0, 6, evolution.description, {
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: w - 30 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const hint = this.scene.add
      .text(0, h / 2 - 26, 'Clique para confirmar', { fontSize: '11px', color: '#ffe9a8' })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const children = [glow, bg, name, desc, hint];

    bg.on('pointerover', () => {
      bg.setStrokeStyle(3, 0xffffff);
      group.setScale(1.04); // carta já nasce maior que as normais, expande um pouco menos
      this.scene.sound.play('sfx_hover', { volume: 0.5 });
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(3, 0xffd166);
      group.setScale(1);
    });
    bg.on('pointerdown', () => this._chooseEvolution(evolution));

    group.add(children);
    return group;
  }

  // Carta especial da evolução ARSENAL OVERRIDE: fica plantada ao lado do
  // baralho. Agora usa a MESMA linguagem visual do menu principal (placa
  // de terminal com cantos cortados) em vez de um retângulo genérico —
  // ícone de "recarregar" desenhado (não emoji), girando bem devagar
  // sozinho, e acelera + acende no hover, com o mesmo glow/caret das
  // cartas normais avisando que é clicável.
  _buildRestockCard(x, y, h, w = RESTOCK_W) {
    const group = this.scene.add.container(x, y);
    const used = this._restockUsed;

    const idleBorder = used ? 0x3a444b : BORDER_IDLE;
    const idleTextColor = used ? '#5c666c' : TEXT_IDLE;
    const iconColor = used ? 0x5c666c : 0x8fd6ff;

    const panel = this.scene.add.graphics().setScrollFactor(0);
    this._drawChamferPanel(panel, w, h, idleBorder);

    const iconRadius = Math.min(w, h) * 0.15;
    const icon = this.scene.add.graphics().setScrollFactor(0);
    icon.setPosition(0, -h / 2 + iconRadius + 22);
    this._drawRefreshIcon(icon, iconRadius, iconColor);

    const name = this.scene.add
      .text(0, 4, 'RESTOCK', {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: idleTextColor,
        align: 'center',
        wordWrap: { width: w - 14 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const desc = this.scene.add
      .text(0, h / 2 - 28, used ? 'JÁ USADA\nNESTE LEVEL' : 'ROLAR\nDE NOVO', {
        fontFamily: PIXEL_FONT,
        fontSize: '7px',
        color: idleTextColor,
        align: 'center',
        lineSpacing: 5
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // mesmo glow em anel + cursor ">" das cartas normais — reaproveitado
    // aqui pra deixar claro que o Restock é uma opção selecionável igual
    const setHoverFx = used ? null : this._addHoverFx(group, w, h);

    group.add([panel, icon, name, desc]);

    // respiro sozinho, bem devagar — só enquanto disponível, pra não
    // parecer um botão morto/estático (mesmo parado, ele "existe")
    const idleSpin = used
      ? null
      : this.scene.tweens.add({ targets: icon, rotation: Math.PI * 2, duration: 7000, repeat: -1 });

    if (!used) {
      const hit = this.scene.add
        .rectangle(0, 0, w, h, 0xffffff, 0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      group.add(hit);

      hit.on('pointerover', () => {
        panel.clear();
        this._drawChamferPanel(panel, w, h, BORDER_HOVER);
        name.setColor(TEXT_HOVER);
        desc.setColor(TEXT_HOVER);
        setHoverFx(true);
        if (idleSpin) idleSpin.timeScale = 3.4; // acelera igual um HD "acordando"
        this.scene.sound.play('sfx_hover', { volume: 0.5 });
      });
      hit.on('pointerout', () => {
        panel.clear();
        this._drawChamferPanel(panel, w, h, idleBorder);
        name.setColor(idleTextColor);
        desc.setColor(idleTextColor);
        setHoverFx(false);
        if (idleSpin) idleSpin.timeScale = 1;
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
    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    EventBus.emit('levelup-closed');
  }
}
