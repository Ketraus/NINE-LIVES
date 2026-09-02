
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    this._buildLoadingBar();

    // sprites placeholder
    this.load.image('player', 'assets/sprites/player.png');
    this.load.image('enemy', 'assets/sprites/enemy.png');
    this.load.image('xp_orb', 'assets/sprites/xp_orb.png');
    this.load.image('hit_fx', 'assets/sprites/hit_fx.png');

    // música de fundo (ver src/systems/MusicManager.js) — a Ketlin ainda
    // vai mandar os arquivos. Quando chegarem, salvar em assets/music/
    // com esses nomes exatos e descomentar as duas linhas abaixo; nada
    // mais no código precisa mudar (MusicManager já está pronto pra usar
    // estas chaves em MainMenuScene e GameScene).
    // this.load.audio('music_menu', 'assets/music/menu_theme.mp3');
    // this.load.audio('music_game', 'assets/music/game_theme.mp3');

    // cartas de arte real da tela de escolha de arma (ver WeaponSelectScene)
    this.load.image('card_fists', 'assets/ui/card_fists.png');
    this.load.image('card_katana', 'assets/ui/card_katana.png');
    this.load.image('card_pistol', 'assets/ui/card_pistol.png');

    // mapa feito no Tiled (tileset embutido no JSON)
    this.load.image('tileset', 'assets/maps/tileset.png');
    this.load.tilemapTiledJSON('map', 'assets/maps/map.json');

    // dados de balanceamento (data/*.json) são importados via ES Modules
    // diretamente onde são usados (GameScene) — não precisam passar pelo
    // loader do Phaser, já que não são assets de mídia.
  }

  create() {
    this.scene.start('MainMenuScene');
  }

  _buildLoadingBar() {
    const { width, height } = this.scale;
    const box = this.add.rectangle(width / 2, height / 2, 220, 20, 0x222222).setStrokeStyle(1, 0x555555);
    const bar = this.add.rectangle(width / 2 - 108, height / 2, 4, 14, 0x4fd1ff).setOrigin(0, 0.5);

    this.load.on('progress', (value) => {
      bar.width = 216 * value;
    });
    this.load.on('complete', () => {
      box.destroy();
      bar.destroy();
    });
  }
}
