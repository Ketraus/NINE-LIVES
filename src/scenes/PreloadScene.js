import cardArtIds from '../../data/cardArt.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    this._buildLoadingBar();

    // arte das cartas normais (comuns/épicas/raras/evoluções) — só carrega
    // as que já estão na lista de data/cardArt.js; o resto continua sem
    // ícone (ver LevelUpUI._buildCard) até a Ketlin entregar
    cardArtIds.forEach((id) => this.load.image(`card_${id}`, `assets/ui/cards/${id}.png`));

    // sprites placeholder
    this.load.image('player', 'assets/sprites/player.png');
    this.load.image('enemy', 'assets/sprites/enemy.png');
    this.load.image('xp_orb', 'assets/sprites/xp_orb.png');
    this.load.image('hit_fx', 'assets/sprites/hit_fx.png');

    // salvar em assets/music/
    // com esses nomes exatos e descomentar as duas linhas abaixo; nada
    // mais no código precisa mudar (MusicManager já está pronto pra usar
    // estas chaves em MainMenuScene e GameScene).
     this.load.audio('music_menu', 'assets/music/menu_theme.mp3');
     this.load.audio('music_game', 'assets/music/game_theme.mp3');

    // som de clique da UI (botões do menu etc.)
    this.load.audio('sfx_ui_click', 'assets/sfx/ui_click.mp3');

    // som de escolher carta — arma, upgrade normal e evolução (não o
    // menu principal, esse já usa sfx_ui_click)
    this.load.audio('sfx_card_select', 'assets/sfx/card_select.mp3');

    // som de hover — menu e cartas (arma, upgrade, evolução)
    this.load.audio('sfx_hover', 'assets/sfx/hover.mp3');

    // sons de combate: golpe de cada arma (soco, katana, pistola) + som
    // de impacto genérico quando o dano realmente conecta no alvo (ver
    // Weapon.js, RangedWeapon.js e DamageSystem.applyWeaponHit)
    this.load.audio('sfx_punch', 'assets/sfx/punch.mp3');
    this.load.audio('sfx_katana', 'assets/sfx/katana.mp3');
    this.load.audio('sfx_pistol', 'assets/sfx/pistol.mp3');
    this.load.audio('sfx_hit', 'assets/sfx/hit.mp3');

    // som de disparo da pistola depois da carta rara "Split Bullet"
    // (pistol_fragmentation, vira escopeta) — troca o sfx_pistol normal
    // enquanto a carta estiver ativa, ver RangedWeapon.fire()
    this.load.audio('sfx_shotgun', 'assets/sfx/shotgun.mp3');

    // som ao coletar um orb de xp (ver GameScene, overlap player x xpOrbGroup)
    this.load.audio('sfx_xp_collect', 'assets/sfx/xp_collect.mp3');

    // som genérico de evolução — toca em QUALQUER carta de evolução
    // escolhida (category: "evolution" em data/upgrades.js), além do
    // clique normal de carta (ver LevelUpUI._chooseEvolution)
    this.load.audio('sfx_evolution_effect', 'assets/sfx/evolution_effect.mp3');

    // som ao escolher a evolução Cyberus (fusão dos 3 cachorros) — toca
    // junto do clique normal de carta, só nesta evolução (ver LevelUpUI._chooseEvolution)
    this.load.audio('sfx_cyberus_wakeup', 'assets/sfx/cyberus_wakeup.mp3');

    // som ao escolher a evolução Tornado (speed_up_evo_tornado) — mesmo
    // padrão do Cyberus acima, específico desta evolução
    this.load.audio('sfx_tornado', 'assets/sfx/tornado.mp3');

    // demais sons específicos por evolução (ver EVOLUTION_SFX em
    // LevelUpUI.js) — cada um toca só quando aquela carta é escolhida,
    // por cima do sfx_evolution_effect genérico
    this.load.audio('sfx_colosso', 'assets/sfx/colosso.mp3');
    this.load.audio('sfx_sobrecarga', 'assets/sfx/sobrecarga.mp3');
    this.load.audio('sfx_terremoto', 'assets/sfx/terremoto.mp3');
    this.load.audio('sfx_blastwave', 'assets/sfx/blastwave.mp3');
    this.load.audio('sfx_danca_cortes', 'assets/sfx/danca_cortes.mp3');
    this.load.audio('sfx_smartshot', 'assets/sfx/smartshot.mp3');

    // som ambiente assustador que toca raramente durante a run (a cada
    // poucos minutos, sorteado — ver GameScene._scheduleAmbientSfx),
    // não ligado a nenhum inimigo/carta específica
    this.load.audio('sfx_leviathan_bg', 'assets/sfx/leviathan_bg.mp3');

    // corte de espada da 2ª cabeça do Cyberus (ver AllyDogAbility._updateSword)
    this.load.audio('sfx_cyberus_slash', 'assets/sfx/cyberus_slash.mp3');

    // cartas de arte real da tela de escolha de arma (ver WeaponSelectScene)
    this.load.image('card_fists', 'assets/ui/card_fists.png');
    this.load.image('card_katana', 'assets/ui/card_katana.png');
    this.load.image('card_pistol', 'assets/ui/card_pistol.png');

    // fundo do menu principal (ver MainMenuScene) — foto 1024x1024,
    // escalada em cover-fit pra preencher o canvas todo sem distorcer
    this.load.image('menu_bg', 'assets/ui/menu_bg.jpg');

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
