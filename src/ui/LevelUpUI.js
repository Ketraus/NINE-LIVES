import EventBus from '../systems/EventBus.js';

const CARD_W = 160;
const CARD_H = 200;
const GAP = 20;

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

    EventBus.on('level-up', ({ options }) => this.show(options));
    EventBus.on('evolution-ready', ({ evolution }) => this.showEvolution(evolution));
  }

  show(options) {
    this._openOverlay();

    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;
    const totalW = options.length * CARD_W + (options.length - 1) * GAP;
    const startX = cx - totalW / 2 + CARD_W / 2;

    const title = this.scene.add
      .text(cx, cy - CARD_H / 2 - 30, 'SUBIU DE NÍVEL — escolha um upgrade', {
        fontSize: '16px',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.container.add(title);

    options.forEach((upgrade, i) => {
      const x = startX + i * (CARD_W + GAP);
      this.container.add(this._buildCard(x, cy, upgrade));
    });

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
    const accentColor = isExclusive ? 0xffb347 : 0x4fd1ff;

    const bg = this.scene.add
      .rectangle(0, 0, CARD_W, CARD_H, 0x22252e, 0.95)
      .setStrokeStyle(2, accentColor)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const name = this.scene.add
      .text(0, -CARD_H / 2 + 30, upgrade.name, {
        fontSize: '16px',
        color: isExclusive ? '#ffb347' : '#4fd1ff'
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

    const children = [bg, name, desc];

    if (isExclusive) {
      const tag = this.scene.add
        .text(0, -CARD_H / 2 + 12, 'EXCLUSIVA', { fontSize: '10px', color: '#ffb347' })
        .setOrigin(0.5)
        .setScrollFactor(0);
      children.push(tag);
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

    bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(3, 0xffd166));
    bg.on('pointerdown', () => this._chooseEvolution(evolution));

    group.add([glow, bg, name, desc, hint]);
    return group;
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
