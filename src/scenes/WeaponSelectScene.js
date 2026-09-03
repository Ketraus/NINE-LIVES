import weaponsData from '../../data/weapons.js';

// arte real das cartas (feita pelo Ketlin + usuário, ver assets/ui/) —
// carregada em PreloadScene com estas chaves. Mapeada por weaponId porque
// o nome do arquivo não precisa bater com o id.
const CARD_TEXTURE_BY_WEAPON = {
  fists: 'card_fists',
  katana: 'card_katana',
  pistol: 'card_pistol'
};

// arte nasce em 331x459 (ver assets/ui/); exibida um pouco menor pra caber
// as 3 lado a lado com folga, mantendo a proporção original.
const CARD_DISPLAY_H = 260;
const CARD_DISPLAY_W = Math.round((331 / 459) * CARD_DISPLAY_H);
const GAP = 32;

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

    const totalW = weaponsData.length * CARD_DISPLAY_W + (weaponsData.length - 1) * GAP;
    const startX = cx - totalW / 2 + CARD_DISPLAY_W / 2;
    const cy = height / 2;

    weaponsData.forEach((weapon, i) => {
      const x = startX + i * (CARD_DISPLAY_W + GAP);
      this._buildCard(x, cy, weapon);
    });
  }

  _buildCard(x, y, weapon) {
    const group = this.add.container(x, y);

    const textureKey = CARD_TEXTURE_BY_WEAPON[weapon.id];
    const art = this.add
      .image(0, 0, textureKey)
      .setDisplaySize(CARD_DISPLAY_W, CARD_DISPLAY_H)
      .setInteractive({ useHandCursor: true });

    art.on('pointerover', () => art.setScale(art.scaleX * 1.04, art.scaleY * 1.04));
    art.on('pointerout', () => art.setDisplaySize(CARD_DISPLAY_W, CARD_DISPLAY_H));
    art.on('pointerdown', () => this._choose(weapon));

    group.add([art]);
    return group;
  }

  _choose(weapon) {
    this.scene.start('GameScene', { weaponId: weapon.id });
  }
}
