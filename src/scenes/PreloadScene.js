import cardArtIds from '../../data/cardArt.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    this._buildLoadingBar();

    // arte das cartas normais (comuns/épicas/raras/evoluções) — só carrega
    cardArtIds.forEach((id) => this.load.image(`card_${id}`, `assets/ui/cards/${id}.png`));

    // sprites placeholder
    this.load.spritesheet('player_idle', 'assets/sprites/player_idle.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.spritesheet('player_walk', 'assets/sprites/player_walk.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.image('enemy', 'assets/sprites/enemy.png');
    // Minotauro parado (idle) — imagem única (64x64), só troca de textura
    this.load.image('minotaur_idle', 'assets/sprites/minotaur_idle.png');
    // Minotauro (boss): sprite definitivo do Cybertaur, 6 frames de 64x64
    this.load.spritesheet('minotaur_walk', 'assets/sprites/minotaur_walk.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    // Versões SEM machado (ver Enemy.js _launchAxe/_endAxeThrow -> _setDisa…
    this.load.image('minotaur_idle_noaxe', 'assets/sprites/minotaur_idle_noaxe.png');
    this.load.spritesheet('minotaur_walk_noaxe', 'assets/sprites/minotaur_walk_noaxe.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    // Versão RAGE (ver Enemy.js _triggerRage/_refreshBossVisual): entra
    this.load.image('minotaur_idle_rage', 'assets/sprites/minotaur_idle_rage.png');
    this.load.spritesheet('minotaur_walk_rage', 'assets/sprites/minotaur_walk_rage.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    // Versão RAGE SEM MACHADO: usada quando ele já está em fúria (rage)
    this.load.image('minotaur_idle_rage_noaxe', 'assets/sprites/minotaur_idle_rage_noaxe.png');
    this.load.spritesheet('minotaur_walk_rage_noaxe', 'assets/sprites/minotaur_walk_rage_noaxe.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    // sprite do machado arremessado (normal e rage) — ver Enemy.js _launchAxe
    this.load.image('minotaur_axe_thrown', 'assets/sprites/minotaur_axe_thrown.png');
    this.load.image('minotaur_axe_thrown_rage', 'assets/sprites/minotaur_axe_thrown_rage.png');
    this.load.image('xp_orb', 'assets/sprites/xp_orb.png');
    this.load.image('hit_fx', 'assets/sprites/hit_fx.png');

    // salvar em assets/music/
     this.load.audio('music_menu', 'assets/music/menu_theme.mp3');
     this.load.audio('music_game', 'assets/music/game_theme.mp3');

    // trilha da tela de cartas (level-up/evolução) — mais baixa e suave,
    this.load.audio('music_card_select', 'assets/music/card_select_theme.mp3');

    // tema do Minotauro (Boss) — ver MusicManager.playBoss/stopBoss e
    // SpawnDirector._triggerBossEntrance/_checkBossMusicRestore
    this.load.audio('music_minotaur', 'assets/music/minotaur_theme.mp3');

    // som de clique da UI (botões do menu etc.)
    this.load.audio('sfx_ui_click', 'assets/sfx/ui_click.mp3');

    // som de escolher carta — arma, upgrade normal e evolução (não o
    this.load.audio('sfx_card_select', 'assets/sfx/card_select.mp3');

    // som de hover — menu e cartas (arma, upgrade, evolução)
    this.load.audio('sfx_hover', 'assets/sfx/hover.mp3');

    // sons de combate: golpe de cada arma (soco, katana, pistola) + som
    this.load.audio('sfx_punch', 'assets/sfx/punch.mp3');
    this.load.audio('sfx_katana', 'assets/sfx/katana.mp3');
    this.load.audio('sfx_pistol', 'assets/sfx/pistol.mp3');
    this.load.audio('sfx_hit', 'assets/sfx/hit.mp3');

    // som de disparo da pistola depois da carta rara "Split Bullet"
    this.load.audio('sfx_shotgun', 'assets/sfx/shotgun.mp3');

    // som ao coletar um orb de xp (ver GameScene, overlap player x xpOrbGro…
    this.load.audio('sfx_xp_collect', 'assets/sfx/xp_collect.mp3');

    // som genérico de evolução — toca em QUALQUER carta de evolução
    this.load.audio('sfx_evolution_effect', 'assets/sfx/evolution_effect.mp3');

    // som ao escolher a evolução Cyberus (fusão dos 3 cachorros) — toca
    this.load.audio('sfx_cyberus_wakeup', 'assets/sfx/cyberus_wakeup.mp3');

    // som ao escolher a evolução Tornado (speed_up_evo_tornado) — mesmo
    this.load.audio('sfx_tornado', 'assets/sfx/tornado.mp3');

    // demais sons específicos por evolução (ver EVOLUTION_SFX em
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
    this.load.audio('sfx_elite_lock', 'assets/sfx/elite_lock.mp3');
    this.load.audio('sfx_elite_warning', 'assets/sfx/elite_warning.mp3');
    this.load.audio('sfx_elite_launch', 'assets/sfx/elite_launch.mp3');
    this.load.audio('sfx_elite_explosion', 'assets/sfx/elite_explosion.mp3');

    // sons específicos do Elite fora da sequência de mísseis acima: hit
    this.load.audio('sfx_elite_hit', 'assets/sfx/elitehitsound.mp3');
    this.load.audio('sfx_elite_death', 'assets/sfx/elitedeathsound.mp3');
    this.load.audio('sfx_elite_punch', 'assets/sfx/elitepunchsound.mp3');
    // toca no instante em que o Elite nasce de verdade (ver
    this.load.audio('sfx_elite_spawn', 'assets/sfx/elitespawnsong.mp3');

    // sons de habilidade (não são de evolução, ver LevelUpUI/EVOLUTION_SFX
    this.load.audio('sfx_drone_shot', 'assets/sfx/drone_shot.mp3');
    this.load.audio('sfx_shuriken_throw', 'assets/sfx/shuriken_throw.mp3');
    this.load.audio('sfx_shockwave', 'assets/sfx/shockwave.mp3');
    this.load.audio('sfx_slam_impact', 'assets/sfx/slam_impact.mp3');

    // som ambiente assustador que toca raramente durante a run (a cada
    this.load.audio('sfx_leviathan_bg', 'assets/sfx/leviathan_bg.mp3');

    // corte de espada da 2ª cabeça do Cyberus (ver AllyDogAbility._updateSw…
    this.load.audio('sfx_cyberus_slash', 'assets/sfx/cyberus_slash.mp3');

    // sequência da habilidade Machado Arremessado do Minotauro (ver Enemy.js
    // _launchAxe/_stickAxe/_updateAxeStuck/_explodeAxe): joga -> (terra +
    // impacto, ao cravar) -> carrega -> apita -> explode
    this.load.audio('sfx_axe_throw', 'assets/sfx/axe_throw.mp3');
    this.load.audio('sfx_axe_dirt', 'assets/sfx/axe_dirt.mp3');
    this.load.audio('sfx_axe_impact', 'assets/sfx/axe_impact.mp3');
    this.load.audio('sfx_axe_charging', 'assets/sfx/axe_charging.mp3');
    this.load.audio('sfx_axe_beep', 'assets/sfx/axe_beep.mp3');
    this.load.audio('sfx_axe_explosion', 'assets/sfx/axe_explosion.mp3');

    // Pisão do Minotauro (4ª habilidade, ver Enemy.js _resolveStomp) —
    // toca no instante em que ele pisa e empurra o jogador pra longe
    this.load.audio('sfx_minotaur_stomp', 'assets/sfx/minotaur_stomp.mp3');

    // sons de dor do Minotauro ao levar dano (3 variações aleatórias, ver
    // DamageSystem._hitSfxKey)
    this.load.audio('sfx_minotaur_hit1', 'assets/sfx/minotaur_hit1.mp3');
    this.load.audio('sfx_minotaur_hit2', 'assets/sfx/minotaur_hit2.mp3');
    this.load.audio('sfx_minotaur_hit3', 'assets/sfx/minotaur_hit3.mp3');

    // Investida do Minotauro (ver Enemy.js _startCharge/_launchCharge/
    // _startSwing/_endCharge): ruge (charge) -> investe com um impacto de
    // largada (charge_impact) + passos correndo (footsteps, em loop) ->
    // pára e golpeia (swing_attack) -> ofegante na janela vulnerável (breath)
    this.load.audio('sfx_minotaur_charge', 'assets/sfx/minotaur_charge.mp3');
    this.load.audio('sfx_minotaur_charge_impact', 'assets/sfx/minotaur_charge_impact.mp3');
    this.load.audio('sfx_minotaur_footsteps', 'assets/sfx/minotaur_footsteps.mp3');
    this.load.audio('sfx_minotaur_swing_attack', 'assets/sfx/minotaur_swing_attack.mp3');
    this.load.audio('sfx_minotaur_breath', 'assets/sfx/minotaur_breath.mp3');

    // Corte Destrutivo (3ª habilidade, ataque mais forte do Minotauro —
    // ver Enemy.js _startCleave/_executeCleave): ruge (cleave_roar) no
    // início do aviso, depois golpeia de verdade com o whoosh do machado
    // no ar junto do impacto pesado (tocam ao mesmo tempo)
    this.load.audio('sfx_minotaur_cleave_roar', 'assets/sfx/minotaur_cleave_roar.mp3');
    this.load.audio('sfx_minotaur_axe_whoosh', 'assets/sfx/minotaur_axe_whoosh.mp3');
    this.load.audio('sfx_minotaur_heavy_axe_impact', 'assets/sfx/minotaur_heavy_axe_impact.mp3');

    // cartas de arte real da tela de escolha de arma (ver WeaponSelectScene)
    this.load.image('card_fists', 'assets/ui/card_fists.png');
    this.load.image('card_katana', 'assets/ui/card_katana.png');
    this.load.image('card_pistol', 'assets/ui/card_pistol.png');

    // fundo do menu principal (ver MainMenuScene) — foto 1024x1024,
    this.load.image('menu_bg', 'assets/ui/menu_bg.jpg');

    // mapa feito no Tiled (tileset embutido no JSON)
    this.load.image('tileset', 'assets/maps/tileset.png');
    this.load.tilemapTiledJSON('map', 'assets/maps/map.json');
    this.load.image('darbluegrass', 'assets/maps/darbluegrass.png');
    this.load.image('deathterrain', 'assets/maps/deathterrain.png');
    // dados de balanceamento (data/*.json) são importados via ES Modules
  }

  create() {
    // as artes das cartas de arma não são pixel art, então usam filtro
    const smoothKeys = ['card_fists', 'card_katana', 'card_pistol']
      .concat(cardArtIds.map((id) => `card_${id}`));
    smoothKeys.forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    });

    // animações do gato jogável (ver Player._updateAnimation) — criadas uma
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

    // animação de andar do Minotauro (ver Enemy.js constructor -> def.walkA…
    this.anims.create({
      key: 'minotaur-walk',
      frames: this.anims.generateFrameNumbers('minotaur_walk', { start: 0, end: 5 }),
      frameRate: 6,
      repeat: -1
    });
    // versão sem machado (ver minotaur_walk_noaxe acima e Enemy.js _setDisa…
    this.anims.create({
      key: 'minotaur-walk-noaxe',
      frames: this.anims.generateFrameNumbers('minotaur_walk_noaxe', { start: 0, end: 5 }),
      frameRate: 6,
      repeat: -1
    });
    // versão rage sem machado (ver minotaur_walk_rage_noaxe acima e
    this.anims.create({
      key: 'minotaur-walk-rage-noaxe',
      frames: this.anims.generateFrameNumbers('minotaur_walk_rage_noaxe', { start: 0, end: 5 }),
      frameRate: 6,
      repeat: -1
    });
    // versão rage (ver minotaur_walk_rage acima e Enemy.js _triggerRage)
    this.anims.create({
      key: 'minotaur-walk-rage',
      frames: this.anims.generateFrameNumbers('minotaur_walk_rage', { start: 0, end: 5 }),
      frameRate: 6,
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
