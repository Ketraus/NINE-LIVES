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
    // gato jogável: idle (parado) e walk (andando), 4 frames de 28x28 cada
    // (ver Player._handleMovement/_updateAnimation pra troca idle<->walk)
    this.load.spritesheet('player_idle', 'assets/sprites/player_idle.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.spritesheet('player_walk', 'assets/sprites/player_walk.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.image('enemy', 'assets/sprites/enemy.png');
    this.load.image('xp_orb', 'assets/sprites/xp_orb.png');
    this.load.image('hit_fx', 'assets/sprites/hit_fx.png');

    // salvar em assets/music/
    // com esses nomes exatos e descomentar as duas linhas abaixo; nada
    // mais no código precisa mudar (MusicManager já está pronto pra usar
    // estas chaves em MainMenuScene e GameScene).
     this.load.audio('music_menu', 'assets/music/menu_theme.mp3');
     this.load.audio('music_game', 'assets/music/game_theme.mp3');

    // trilha da tela de cartas (level-up/evolução) — mais baixa e suave,
    // ver MusicManager.duckForCards/restoreFromCards
    this.load.audio('music_card_select', 'assets/music/card_select_theme.mp3');

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
    this.load.audio('sfx_hemorragia', 'assets/sfx/hemorragia.mp3');
    this.load.audio('sfx_restock', 'assets/sfx/restock.mp3');
    this.load.audio('sfx_sexto_sentido', 'assets/sfx/sexto_sentido.mp3');
    this.load.audio('sfx_instinto_cacador', 'assets/sfx/instinto_cacador.mp3');
    this.load.audio('sfx_barreira', 'assets/sfx/barreira.mp3');
    this.load.audio('sfx_corte_fantasma', 'assets/sfx/corte_fantasma.mp3');
    this.load.audio('sfx_overcharge', 'assets/sfx/overcharge.mp3');
    this.load.audio('sfx_neoshuriken', 'assets/sfx/neoshuriken.mp3');
    this.load.audio('sfx_catforce', 'assets/sfx/catforce.mp3');
    this.load.audio('sfx_reflexos_predador', 'assets/sfx/reflexos_predador.mp3');
    this.load.audio('sfx_cyberus_cannon', 'assets/sfx/cyberus_cannon.mp3');
    this.load.audio('sfx_cyberus_click', 'assets/sfx/cyberus_click.mp3');
    this.load.audio('sfx_cyberus_explosion', 'assets/sfx/cyberus_explosion.mp3');

    // sequência de ataque de mísseis do Elite (ver Enemy.js
    // _startEliteMissiles -> _updateMissileTelegraph -> _launchMissiles ->
    // _detonateMissiles): lock ao travar mira, warning ao revelar a
    // última área, launch ao disparar de verdade (a duração REAL deste
    // som é o que cronometra o voo até a explosão, ver
    // Enemy._playTimedSfx) e explosion no impacto
    this.load.audio('sfx_elite_lock', 'assets/sfx/elite_lock.mp3');
    this.load.audio('sfx_elite_warning', 'assets/sfx/elite_warning.mp3');
    this.load.audio('sfx_elite_launch', 'assets/sfx/elite_launch.mp3');
    this.load.audio('sfx_elite_explosion', 'assets/sfx/elite_explosion.mp3');

    // sons específicos do Elite fora da sequência de mísseis acima: hit
    // (substitui o sfx_hit genérico quando quem apanha é o Elite, ver
    // DamageSystem.applyWeaponHit), death (Enemy.die() quando def.elite) e
    // punch — o soco corpo a corpo em si, cuja duração REAL cronometra o
    // impacto de verdade (ver Enemy._startEliteMeleeSwing/_playTimedSfx,
    // mesmo padrão do sfx_elite_launch acima).
    this.load.audio('sfx_elite_hit', 'assets/sfx/elitehitsound.mp3');
    this.load.audio('sfx_elite_death', 'assets/sfx/elitedeathsound.mp3');
    this.load.audio('sfx_elite_punch', 'assets/sfx/elitepunchsound.mp3');
    // toca no instante em que o Elite nasce de verdade (ver
    // EnemySpawner._createAt) — spawn automático, schedule ou cheat
    // "spawn", os três passam por ali
    this.load.audio('sfx_elite_spawn', 'assets/sfx/elitespawnsong.mp3');

    // sons de habilidade (não são de evolução, ver LevelUpUI/EVOLUTION_SFX
    // acima): tiro do GatoDrone (DroneAbility._fire), arremesso de shuriken
    // (ShurikenAbility._throw), onda de choque dos punhos (ShockwaveAbility
    // ._spawnWave) e impacto da Pancada Sísmica (SlamAbility._slam)
    this.load.audio('sfx_drone_shot', 'assets/sfx/drone_shot.mp3');
    this.load.audio('sfx_shuriken_throw', 'assets/sfx/shuriken_throw.mp3');
    this.load.audio('sfx_shockwave', 'assets/sfx/shockwave.mp3');
    this.load.audio('sfx_slam_impact', 'assets/sfx/slam_impact.mp3');

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
    // as artes das cartas de arma não são pixel art, então usam filtro
    // suave (LINEAR) mesmo com pixelArt:true global (gameConfig.js) —
    // sem isso ficam serrilhadas ao serem redimensionadas pro card
    const smoothKeys = ['card_fists', 'card_katana', 'card_pistol']
      .concat(cardArtIds.map((id) => `card_${id}`));
    smoothKeys.forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    });

    // animações do gato jogável (ver Player._updateAnimation) — criadas uma
    // única vez aqui, reaproveitadas em toda run/GameScene nova
    this.anims.create({
      key: 'player-idle',
      frames: this.anims.generateFrameNumbers('player_idle', { start: 0, end: 3 }),
      frameRate: 4,
      repeat: -1
    });
    this.anims.create({
      key: 'player-walk',
      frames: this.anims.generateFrameNumbers('player_walk', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1
    });

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
