import EventBus from '../systems/EventBus.js';

const CARD_W = 160;
const CARD_H = 200;
const GAP = 20;
const ROW_GAP = 24;
// Máximo de cartas por linha antes de quebrar pra próxima — com
// BASE_LEVEL_UP_OPTIONS (3) + até +3 de "Arsenal Expandido" empilhado
// (ver RunManager), o level-up pode oferecer até 6 cartas de uma vez;
// numa linha só isso não cabe na tela (704px de largura), então a partir
// de CARDS_PER_ROW+1 opções o layout vira grade em vez de fila única.
const CARDS_PER_ROW = 3;

// Carta "Restock" (evolução ARSENAL OVERRIDE): fica ao lado do baralho de
// opções, não numa linha/coluna junto das outras — por isso tem largura
// própria e o grid principal é deslocado pra deixar espaço pra ela na
// direita (ver show()).
const RESTOCK_W = 96;
const RESTOCK_GAP = 22;

// Visual da raridade (ver campo independente `rarity` em data/upgrades.js):
// cor do contorno/nome da carta + ícone/rótulo mostrados no topo dela.
const RARITY_COLORS = { common: 0xe6e6e6, rare: 0x4fd1ff, epic: 0xb26bff };
const RARITY_ICONS = { common: '⚪', rare: '🔵', epic: '🟣' };
const RARITY_LABELS = { common: 'COMUM', rare: 'RARA', epic: 'ÉPICA' };

// tamanho do quadrado de arte dentro da carta normal/evolução (ver
// data/cardArt.js) — só desenhado se a textura 'card_<id>' foi carregada;
// carta sem arte ainda fica exatamente como hoje, sem espaço reservado.
const CARD_ART_SIZE = 56;
const EVOLUTION_ART_SIZE = 72;

/**
 * Mostra as cartas de progressão, pausa a física enquanto escolhe, aplica
 * a escolha via RunManager e despausa. Dois modos, dois eventos:
 *  - 'level-up' (show): as 3 opções normais de sempre.
 *  - 'evolution-ready' (showEvolution): UMA carta só, em destaque, forçada
 *    — nunca misturada com as opções normais (ver RunManager.chooseUpgrade).
 * Os dois reaproveitam o mesmo container e os mesmos eventos de
 * pause/resume ('levelup-opened'/'levelup-closed'), então GameScene não
 * precisa saber qual dos dois está na tela.
 */
export default class LevelUpUI {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../roguelike/RunManager.js').default} runManager
   */
  constructor(scene, runManager) {
    this.scene = scene;
    this.runManager = runManager;
    this.container = scene.add.container(0, 0).setDepth(300).setVisible(false);
    this._applyZoomCompensation(this.container);
    // limite do Restock: 1 uso por level-up (zera só quando um NOVO level-up
    // abre — não em cada redesenho causado pelo próprio Restock, por isso
    // fica fora de show() e é resetado aqui, no listener do evento).
    this._restockUsed = false;

    EventBus.on('level-up', ({ options }) => {
      this._restockUsed = false;
      this.show(options);
    });
    EventBus.on('evolution-ready', ({ evolution }) => this.showEvolution(evolution));
  }

  /**
   * Mesmo bug/correção do HUD (ver HUD._applyZoomCompensation): a câmera
   * zoomada no celular (GameScene._buildPlayer) também empurra as cartas
   * de level-up pra fora da posição pensada em pixels de tela. Contra-
   * escala o container e reposiciona pra cancelar o zoom só na UI.
   */
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

    const screenCx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;
    const hasRestock = !!this.runManager.runState.hasRestock;
    // com Restock ativo, o baralho normal é deslocado pra esquerda pra
    // sobrar espaço fixo pra ela na direita (não é só mais uma carta na
    // fila/grade das outras — ver RESTOCK_W/RESTOCK_GAP acima)
    const cx = hasRestock ? screenCx - (RESTOCK_W + RESTOCK_GAP) / 2 : screenCx;

    // quebra as opções em linhas de até CARDS_PER_ROW cartas, pra não
    // estourar a largura da tela quando o level-up oferece mais de 3
    // (ver comentário de CARDS_PER_ROW acima)
    const rows = [];
    for (let i = 0; i < options.length; i += CARDS_PER_ROW) {
      rows.push(options.slice(i, i + CARDS_PER_ROW));
    }
    const totalH = rows.length * CARD_H + (rows.length - 1) * ROW_GAP;
    const startY = cy - totalH / 2 + CARD_H / 2;

    const title = this.scene.add
      .text(screenCx, startY - CARD_H / 2 - 30, 'SUBIU DE NÍVEL — escolha um upgrade', {
        fontSize: '16px',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.container.add(title);

    rows.forEach((row, rowIndex) => {
      const rowY = startY + rowIndex * (CARD_H + ROW_GAP);
      const totalW = row.length * CARD_W + (row.length - 1) * GAP;
      const startX = cx - totalW / 2 + CARD_W / 2;
      row.forEach((upgrade, i) => {
        const x = startX + i * (CARD_W + GAP);
        this.container.add(this._buildCard(x, rowY, upgrade));
      });
    });

    if (hasRestock) {
      const fullRowW = CARDS_PER_ROW * CARD_W + (CARDS_PER_ROW - 1) * GAP;
      const restockX = cx + fullRowW / 2 + RESTOCK_GAP + RESTOCK_W / 2;
      this.container.add(this._buildRestockCard(restockX, cy, totalH));
    }

    this.container.setVisible(true);
  }

  /** Tela dedicada de evolução: uma carta só, sem escolha entre opções — só confirmação. */
  showEvolution(evolution) {
    this._openOverlay();

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

  /** Comum a show() e showEvolution(): limpa a tela anterior e pausa o jogo. */
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

  _buildCard(x, y, upgrade) {
    const group = this.scene.add.container(x, y);
    const isExclusive = upgrade.category === 'exclusive';
    const rarity = upgrade.rarity || 'common';
    const accentColor = RARITY_COLORS[rarity] ?? RARITY_COLORS.common;
    const accentHex = `#${accentColor.toString(16).padStart(6, '0')}`;

    const bg = this.scene.add
      .rectangle(0, 0, CARD_W, CARD_H, 0x22252e, 0.95)
      .setStrokeStyle(2, accentColor)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const name = this.scene.add
      .text(0, -CARD_H / 2 + 30, upgrade.name, {
        fontSize: '16px',
        color: accentHex
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const desc = this.scene.add
      .text(0, 8, upgrade.description, {
        fontSize: '13px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: CARD_W - 24 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // topo da carta: raridade sempre visível (ícone + rótulo); cartas
    // exclusivas de arma ganham o sufixo "· EXCLUSIVA" na mesma linha em
    // vez de uma segunda tag, pra não disputar espaço vertical com o nome
    const rarityLabel = RARITY_LABELS[rarity] ?? RARITY_LABELS.common;
    const tagText = isExclusive
      ? `${RARITY_ICONS[rarity]} ${rarityLabel} · EXCLUSIVA`
      : `${RARITY_ICONS[rarity]} ${rarityLabel}`;
    const tag = this.scene.add
      .text(0, -CARD_H / 2 + 12, tagText, { fontSize: '10px', color: accentHex })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const children = [bg, name, desc, tag];

    // arte da carta (ver data/cardArt.js) — só entra se já foi carregada;
    // fica entre o nome e a descrição, no mesmo espaço que hoje fica vazio
    const artKey = `card_${upgrade.id}`;
    if (this.scene.textures.exists(artKey)) {
      const art = this.scene.add
        .image(0, -CARD_H / 2 + 64, artKey)
        .setDisplaySize(CARD_ART_SIZE, CARD_ART_SIZE)
        .setScrollFactor(0);
      children.push(art);
    }

    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(2, accentColor));
    bg.on('pointerdown', () => this._choose(upgrade));

    group.add(children);
    return group;
  }

  /** Carta única de evolução: maior, com brilho dourado, sem "rivais" ao lado. */
  _buildEvolutionCard(x, y, evolution) {
    const w = CARD_W * 1.3;
    const h = CARD_H * 1.15;
    const group = this.scene.add.container(x, y);

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

    // mesma arte da carta base (ver data/cardArt.js) — a evolução usa o
    // id dela mesma (ex.: 'hp_up_evo_colosso'), não o id da carta base
    const artKey = `card_${evolution.id}`;
    if (this.scene.textures.exists(artKey)) {
      const art = this.scene.add
        .image(0, -h / 2 + 82, artKey)
        .setDisplaySize(EVOLUTION_ART_SIZE, EVOLUTION_ART_SIZE)
        .setScrollFactor(0);
      children.push(art);
    }

    bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(3, 0xffd166));
    bg.on('pointerdown', () => this._chooseEvolution(evolution));

    group.add(children);
    return group;
  }

  /**
   * Carta especial da evolução ARSENAL OVERRIDE: fica plantada ao lado do
   * baralho normal (não é uma opção de upgrade), altura igual ao bloco
   * inteiro de cartas normais, e ao clicar sorteia as opções de novo SEM
   * fechar/pausar/despausar (a tela já está pausada — só troca as cartas).
   */
  _buildRestockCard(x, y, h) {
    const group = this.scene.add.container(x, y);
    // 1 uso por level-up (ver this._restockUsed) — esgotada, a carta fica
    // acinzentada e sem clique em vez de simplesmente sumir, pra deixar
    // claro que ela existe mas já foi gasta nesta tela.
    const used = this._restockUsed;
    const accent = used ? 0x555f66 : 0x4fd1ff;

    const bg = this.scene.add
      .rectangle(0, 0, RESTOCK_W, h, 0x102a2e, used ? 0.6 : 0.95)
      .setStrokeStyle(2, accent)
      .setScrollFactor(0);

    const icon = this.scene.add
      .text(0, -h / 2 + 34, '🔄', { fontSize: '26px' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(used ? 0.5 : 1);

    const name = this.scene.add
      .text(0, 0, 'RESTOCK', {
        fontSize: '14px',
        color: used ? '#8a949b' : '#4fd1ff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: RESTOCK_W - 16 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const desc = this.scene.add
      .text(0, h / 2 - 30, used ? 'Já usada\nneste level' : 'Rolar\nde novo', {
        fontSize: '11px',
        color: used ? '#8a949b' : '#bfe9f5',
        align: 'center'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    group.add([bg, icon, name, desc]);

    if (!used) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff));
      bg.on('pointerout', () => bg.setStrokeStyle(2, 0x4fd1ff));
      bg.on('pointerdown', () => this._restock());
    }

    return group;
  }

  /**
   * Reamostra as opções do level-up atual e redesenha a tela (mantém
   * pausado). Limitado a 1 uso por level-up — marca `_restockUsed` ANTES de
   * chamar show() de novo, pra a carta já nascer desabilitada no redesenho.
   */
  _restock() {
    if (this._restockUsed) return;
    const options = this.runManager.rerollOptions();
    if (!options) return;
    this._restockUsed = true;
    this.show(options);
  }

  _choose(upgrade) {
    // chooseUpgrade() pode, de forma síncrona, emitir 'evolution-ready' e
    // portanto chamar showEvolution() (que já reabre o overlay com a carta
    // de evolução). Esse era o bug: fechar aqui incondicionalmente destruía
    // a carta de evolução um instante depois dela aparecer, então o
    // jogador nunca via/clicava nela e a evolução nunca era confirmada.
    // Só fecha se NÃO houver evolução pendente — showEvolution() cuida do
    // resto e quem fecha, ao confirmar, é _chooseEvolution().
    const evolutionTriggered = this.runManager.chooseUpgrade(upgrade);
    if (!evolutionTriggered) {
      this._close();
    }
  }

  _chooseEvolution(evolution) {
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
