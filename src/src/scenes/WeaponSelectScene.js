import weaponsData from '../../data/weapons.js';

const CARD_W = 180;
const CARD_H = 220;
const GAP = 24;

/**
 * Tela entre o menu e a run: mostra as armas de data/weapons.js como
 * cartas clicáveis e manda pra GameScene já com a escolha
 * (`scene.start('GameScene', { weaponId })`).
 *
 * De propósito NÃO usa o EventBus (é fluxo local de uma cena só, sem
 * ninguém mais precisando escutar) e NÃO reaproveita o _buildCard do
 * LevelUpUI — visualmente parecido, mas são contextos diferentes (cena
 * cheia x overlay que pausa a física no meio da run); extrair um
 * componente de carta compartilhado só vale a pena se um terceiro caso
 * de uso aparecer.
 */
export default class WeaponSelectScene extends Phaser.Scene {
  constructor() {
    super('WeaponSelectScene');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.add
      .text(cx, 70, 'ESCOLHA SUA ARMA', { fontSize: '24px', color: '#ffffff' })
      .setOrigin(0.5);

    const totalW = weaponsData.length * CARD_W + (weaponsData.length - 1) * GAP;
    const startX = cx - totalW / 2 + CARD_W / 2;
    const cy = height / 2 + 20;

    weaponsData.forEach((weapon, i) => {
      const x = startX + i * (CARD_W + GAP);
      this._buildCard(x, cy, weapon);
    });
  }

  _buildCard(x, y, weapon) {
    const group = this.add.container(x, y);

    const bg = this.add
      .rectangle(0, 0, CARD_W, CARD_H, 0x22252e, 0.95)
      .setStrokeStyle(2, 0x4fd1ff)
      .setInteractive({ useHandCursor: true });

    const name = this.add
      .text(0, -CARD_H / 2 + 28, weapon.name, { fontSize: '18px', color: '#4fd1ff' })
      .setOrigin(0.5);

    const desc = this.add
      .text(0, -CARD_H / 2 + 60, weapon.description, {
        fontSize: '12px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: CARD_W - 24 }
      })
      .setOrigin(0.5);

    const stats = this.add
      .text(
        0,
        30,
        [
          `Dano: ${weapon.damage}`,
          `Alcance: ${weapon.range}`,
          `Recarga: ${weapon.cooldownMs}ms`
        ].join('\n'),
        { fontSize: '13px', color: '#9fc8ff', align: 'center' }
      )
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x4fd1ff));
    bg.on('pointerdown', () => this._choose(weapon));

    group.add([bg, name, desc, stats]);
    return group;
  }

  _choose(weapon) {
    this.scene.start('GameScene', { weaponId: weapon.id });
  }
}
