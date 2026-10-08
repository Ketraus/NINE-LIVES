import EventBus from '../systems/EventBus.js';
import MusicManager from '../systems/MusicManager.js';
import MapManager from '../maps/MapManager.js';
import Player, { BASE_VISUAL_SCALE } from '../entities/Player.js';
import EnemySpawner from '../entities/enemies/EnemySpawner.js';
import WeaponManager from '../weapons/WeaponManager.js';
import AbilityManager from '../abilities/AbilityManager.js';
import DamageSystem from '../combat/DamageSystem.js';
import DamageNumberManager from '../combat/DamageNumberManager.js';
import RunState from '../roguelike/RunState.js';
import RunManager from '../roguelike/RunManager.js';
import ScoreManager from '../roguelike/ScoreManager.js';
import SpawnDirector from '../roguelike/SpawnDirector.js';
import HUD from '../ui/HUD.js';
import LevelUpUI from '../ui/LevelUpUI.js';
import PauseUI from '../ui/PauseUI.js';
import ResultUI from '../ui/ResultUI.js';
import DevConsole from '../systems/DevConsole.js';
import TouchJoystick from '../systems/TouchJoystick.js';
import SlowmoSystem from '../systems/SlowmoSystem.js';
import MultiplayerManager from '../systems/MultiplayerManager.js';
import MedkitRareFx from '../fx/MedkitRareFx.js';

import enemiesData from '../../data/enemies.js';
import weaponsData from '../../data/weapons.js';
import upgradesData from '../../data/upgrades.js';
import spawnPhasesData from '../../data/spawnPhases.js';
import spawnCurvesData from '../../data/spawnCurves.js';
import flockingConfigData from '../../data/flockingConfig.js';
import sealerScheduleData from '../../data/sealerSchedule.js';
import eliteScheduleData from '../../data/eliteSchedule.js';
import bossScheduleData from '../../data/bossSchedule.js';
import scoreValuesData from '../../data/scoreValues.js';

const XP_ORB_MAGNET_RANGE = 90; // distância (px) a partir da qual o orb passa a ser puxado
const XP_ORB_MAGNET_SPEED = 420; // velocidade (px/s) do orb voando até o jogador
const MEDKIT_HEAL_AMOUNT = 20;
const MEDKIT_BRUTE_DROP_CHANCE = 0.01;
const MEDKIT_SCALE = 0.86;
const MEDKIT_PULSE_SCALE = 1.07;
const MEDKIT_PULSE_DURATION_MS = 850;
const MEDKIT_DROP_OFFSET_MIN = 42;
const MEDKIT_DROP_OFFSET_MAX = 56;

// Ímã raro: puxa TODO o XP existente no mapa. As chances seguem o id real
// dos inimigos (CyberHound é o Runner em data/enemies.js).
const MAGNET_DROP_CHANCES = Object.freeze({
  cyber_brute: 0.03, // 3%
  grunt: 0.001, // 0,1%
  cyber_hound: 0.001, // 0,1% — Runner
  sealer: 0.15 // 15%
});
const MAGNET_SCALE = 0.92;
const MAGNET_PULSE_SCALE = 1.07;
const MAGNET_PULSE_DURATION_MS = 780;
const MAGNET_DROP_OFFSET_MIN = 44;
const MAGNET_DROP_OFFSET_MAX = 62;
const MAGNET_FORCE_DROP_LEAD_MS = 40000; // 5:20 numa run em que o Mino vem aos 6:00
const MAGNET_HARD_GUARANTEE_LEAD_MS = 20000; // fallback absoluto: 5:40
const MAGNET_ALL_XP_MIN_SPEED = 680;
const MAGNET_ALL_XP_MAX_SPEED = 1450;
const MAGNET_ALL_XP_DISTANCE_SPEED = 0.42;
const MAGNET_ALL_XP_STAGGER_MS = 180;
const PICKUP_MAGNET_UPDATE_INTERVAL_MS = 33; // ~30 Hz: centenas de gemas sem recalcular todo frame
const XP_COLLECT_SFX_MIN_INTERVAL_MS = 45; // evita centenas de instâncias de áudio quando o ímã junta tudo
const RUN_WIN_SECONDS = 600; // 10:00 — sobreviver até aqui vence a run
const PICKUP_CLAIM_RETRY_MS = 600; // cliente repete o pedido de coleta se o Host não confirmar

// Sprite do cristal de XP por faixa de valor — dá pra reconhecer de longe
// se vale a pena correr atrás. Faixas batem com data/enemies.js: verde
// (grunt 8, cyber_hound 4), azul (cyber_brute 20, exploder 26), vermelho
// (sealer 60, elite 120) e roxo (só o Minotauro/boss, 500, dropa).
// scale: quanto mais raro, maior (PNG é 64x64, gema ocupa ~31x60 — em 0.3 fica ~18px de altura)
// glow: brilho máximo do pulso aditivo (quanto mais raro, mais forte)
const XP_GEM_TIERS = [
  { min: 0, texture: 'xp_verde', scale: 0.3, glow: 0.22 }, // verde — inimigos comuns
  { min: 10, texture: 'xp_azul', scale: 0.36, glow: 0.3 }, // azul — intermediários
  { min: 60, texture: 'xp_vermelho', scale: 0.44, glow: 0.38 }, // vermelho — pesados (Sealer/Elite)
  { min: 200, texture: 'xp_roxo', scale: 0.62, glow: 0.5 } // roxo — só o boss dropa isso
];
const XP_GEM_BASE_SCALE = 0.3; // escala do verde: referência pro raio de coleta
const XP_GEM_PICKUP_RADIUS = 10; // raio de coleta (px do mundo) do verde; cresce junto com a escala
const XP_GEM_GLOW_SCALE = 1.25; // halo aditivo um pouco maior que a gema
const XP_GEM_PULSE_MIN_MS = 650;
const XP_GEM_PULSE_MAX_MS = 950;
const XP_GEM_MIN_ALPHA = 0.85; // a própria gema oscila entre isso e 1

function _xpGemTierFor(xpReward) {
  let found = XP_GEM_TIERS[0];
  for (const tier of XP_GEM_TIERS) {
    if (xpReward >= tier.min) found = tier;
  }
  return found;
}

// som ambiente assustador, sorteado, raro — nada de específico o dispara
const AMBIENT_SFX_MIN_DELAY_MS = 120000; // 2min
const AMBIENT_SFX_MAX_DELAY_MS = 240000; // 4min

// resto da transição de entrada (ver WeaponSelectScene._choose pro iníc…
const MAP_FADE_IN_MS = 220;
const HUD_FADE_IN_DELAY_MS = 80;
const HUD_FADE_IN_MS = 180;
const LEVEL_UP_INVULNERABILITY_MS = 2000;
const GAMEPLAY_NEAREST_TEXTURE_KEYS = [
  'player_idle', 'player_walk', 'player_white_idle', 'player_white_walk', 'player_white_katana_idle', 'player_white_katana_walk', 'player_white_paws_idle', 'player_white_paws_walk', 'player_katana_idle', 'player_katana_walk', 'player_paws_walk', 'player_paws_idle',
  'enemy', 'grunt_idle', 'grunt_walk', 'cyber_hound_idle', 'cyber_hound_walk', 'cyber_brute_idle', 'cyber_brute_walk',
  'exploder_idle', 'exploder_walk', 'cyber_elite_idle', 'cyber_elite_walk', 'cyber_sealer_idle', 'cyber_sealer_walk',
  'minotaur_idle', 'minotaur_walk', 'minotaur_idle_noaxe', 'minotaur_walk_noaxe', 'minotaur_idle_rage',
  'minotaur_walk_rage', 'minotaur_idle_rage_noaxe', 'minotaur_walk_rage_noaxe', 'minotaur_axe_thrown',
  'minotaur_axe_thrown_rage', 'xp_verde', 'xp_azul', 'xp_vermelho', 'xp_roxo', 'medkit', 'magnet', 'hit_fx'
];

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(data) {
    // limpa listeners de uma partida anterior (esta scene pode restartar
    EventBus.removeAllListeners();
    this._setGameplayTextureFilters(Phaser.Textures.FilterMode.NEAREST);
    this.events.once('shutdown', () => {
      this._setGameplayTextureFilters(Phaser.Textures.FilterMode.LINEAR);
    });

    // troca pra música da run (no-op se o arquivo ainda não foi
    MusicManager.play(this, 'music_game');

    // nasce preta (chegando do silêncio da WeaponSelectScene) e clareia —
    this.cameras.main.fadeIn(MAP_FADE_IN_MS, 0, 0, 0);

    // guarda pra poder repassar no restart (tecla R) sem perder a arma esco…
    this.weaponId = data?.weaponId || this.weaponId || null;
    this.multiplayerRoom = data?.multiplayerRoom || null;
    this.isRoomHost = Boolean(data?.isRoomHost);

    this._buildMap();
    this._buildRun();
    this._buildPlayer();
    this._buildMultiplayer();
    this._buildEnemies();
    this._buildWeapon();
    this._buildAbilities();
    this._buildPickups();
    this._buildUI();
    this._buildCollisions();
    this._buildInput();
    this._scheduleAmbientSfx();

    // EventBus é global e sobrevive ao scene.restart() (morte + R/toque) —
    this.events.once('shutdown', () => {
      this.spawnDirector?.stop();
      this._ambientSfxEvent?.remove();
      EventBus.removeAllListeners();
    });

    EventBus.emit('run-restart');
  }

  _setGameplayTextureFilters(filterMode) {
    GAMEPLAY_NEAREST_TEXTURE_KEYS.forEach((key) => {
      const texture = this.textures.get(key);
      texture?.source.forEach((source) => source.setFilter(filterMode));
    });
  }

  update(time, delta) {
    this._updateRunTimer();
    this.multiplayer?.update(time, delta);

    if (this.isGameOver) {
      if (this.multiplayer?.isMultiplayer && this.multiplayer.isRoomHost) {
        this.enemySpawner.updateAll(this.time.now);
      }
      return;
    }
    if (this.isPaused) return;
    this.player.update();
    if (!this.multiplayer?.isMultiplayer || this.multiplayer.isRoomHost || !this.multiplayer.mqtt) {
      this.enemySpawner.updateAll(this.time.now);
    }
    this.abilityManager.update(this.time.now);
    this._updateXpOrbMagnet(time);
    this._updateXpGlows();
    this._updateRarePickupFx(time);
    this._updateMagnetGuarantee();
  }

  // o halo não tem física: só copia a posição da gema (que pode estar sendo puxada pelo ímã)
  _updateXpGlows() {
    this.xpOrbGroup.getChildren().forEach((orb) => {
      orb.getData('glow')?.setPosition(orb.x, orb.y);
    });
  }

  // Medkit e ímã compartilham a mesma linguagem de item raro: contorno
  // rainbow, seta no mundo e indicador na borda quando saem da câmera.
  _updateRarePickupFx(time) {
    [this.medkitGroup, this.magnetGroup].forEach((group) => {
      group?.getChildren().forEach((pickup) => pickup.getData('rareFx')?.update(time));
    });
  }

  // Magnetismo comum (curta distância) + o efeito do item Ímã, que marca
  // somente os cristais de XP para virem do mapa inteiro. O cálculo de
  // direção é limitado a ~30 Hz; a física continua suave entre atualizações.
  _updateXpOrbMagnet(time) {
    if (time < (this._nextPickupMagnetUpdateAt || 0)) return;
    this._nextPickupMagnetUpdateAt = time + PICKUP_MAGNET_UPDATE_INTERVAL_MS;

    this.xpOrbGroup.children.each((orb) => {
      if (!orb?.active) return;
      const distance = Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y);
      const mapMagnetActive = orb.getData('mapMagnet') === true && time >= (orb.getData('mapMagnetWakeAt') || 0);

      if (mapMagnetActive) {
        const speed = Phaser.Math.Clamp(
          MAGNET_ALL_XP_MIN_SPEED + distance * MAGNET_ALL_XP_DISTANCE_SPEED,
          MAGNET_ALL_XP_MIN_SPEED,
          MAGNET_ALL_XP_MAX_SPEED
        );
        this.physics.moveToObject(orb, this.player, speed);
      } else if (distance <= XP_ORB_MAGNET_RANGE) {
        this.physics.moveToObject(orb, this.player, XP_ORB_MAGNET_SPEED);
      } else if (orb.body.velocity.x !== 0 || orb.body.velocity.y !== 0) {
        orb.setVelocity(0, 0);
      }
    });

    // Medkit e o próprio ímã continuam com o magnetismo local normal.
    [this.medkitGroup, this.magnetGroup].forEach((group) => {
      group?.children.each((pickup) => {
        if (!pickup?.active) return;
        const distance = Phaser.Math.Distance.Between(pickup.x, pickup.y, this.player.x, this.player.y);
        if (distance <= XP_ORB_MAGNET_RANGE) {
          this.physics.moveToObject(pickup, this.player, XP_ORB_MAGNET_SPEED);
        } else if (pickup.body.velocity.x !== 0 || pickup.body.velocity.y !== 0) {
          pickup.setVelocity(0, 0);
        }
      });
    });
  }

  // A chance normal continua valendo a run inteira. Esta proteção existe só
  // para impedir uma run azarada de chegar ao Minotauro sem NUNCA ter visto
  // um ímã. Aos 40 s antes do boss, o próximo inimigo elegível força o drop;
  // se até 20 s antes ninguém elegível morreu, o jogo coloca um no chão perto
  // do jogador como fallback absoluto.
  _updateMagnetGuarantee() {
    if (this.multiplayer?.isMultiplayer || this._magnetHasAppeared) return;
    const bossAt = Number(bossScheduleData?.t);
    const elapsed = this.spawnDirector?.getElapsedMs?.() || 0;
    if (!Number.isFinite(bossAt) || bossAt <= 0) return;

    if (elapsed >= bossAt - MAGNET_FORCE_DROP_LEAD_MS) {
      this._forceNextMagnetDrop = true;
    }

    if (elapsed < bossAt - MAGNET_HARD_GUARANTEE_LEAD_MS) return;

    const bounds = this.physics.world.bounds;
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(105, 145);
    const margin = 28;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * distance, bounds.left + margin, bounds.right - margin);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * distance, bounds.top + margin, bounds.bottom - margin);
    this._spawnMagnet(Math.round(x), Math.round(y), this.nextPickupId++);
    this._magnetHasAppeared = true;
    this._forceNextMagnetDrop = false;
  }

  // Emite o tempo de run decorrido (em segundos inteiros) só quando ele
  _updateRunTimer() {
    if (this.isGameOver) {
      // Host morto continua dono do relógio do grupo: se os outros sobreviverem
      // até o fim, a vitória do grupo ainda precisa ser declarada por ele.
      const multiplayer = this.multiplayer;
      if (multiplayer?.isMultiplayer && multiplayer.mqtt && multiplayer.isRoomHost &&
        this.spawnDirector.getElapsedMs() / 1000 >= RUN_WIN_SECONDS) {
        multiplayer.declareMatchWon();
      }
      return;
    }
    const seconds = Math.floor(this.spawnDirector.getElapsedMs() / 1000);
    if (seconds !== this._lastRunTimeSeconds) {
      this._lastRunTimeSeconds = seconds;
      this.scoreManager.updateSurvivedTime(seconds);
      EventBus.emit('run-time-changed', { seconds });
    }
    if (seconds >= RUN_WIN_SECONDS) {
      this._onRunTimeUp();
    }
  }

  // Tempo esgotado: solo vence na hora; em multiplayer só o Host decide (e o
  // resultado chega a todos como estado do grupo — ver applyGroupMatchState).
  _onRunTimeUp() {
    const multiplayer = this.multiplayer;
    if (multiplayer?.isMultiplayer && multiplayer.mqtt) {
      if (multiplayer.isRoomHost) multiplayer.declareMatchWon();
      return;
    }
    this._triggerWin();
  }

  // Vitória/derrota do GRUPO, definida pelo Host (ver MultiplayerManager).
  applyGroupMatchState(state) {
    if (state === 'won') {
      this.groupWon = true;
      if (!this.isGameOver) this._triggerWin();
    } else if (state === 'lost') {
      if (!this.isGameOver) this.player.die();
    }
    // quem já apertou "reiniciar" esperando o grupo terminar segue agora
    if (this._pendingGroupRestart) {
      this._pendingGroupRestart = false;
      this.time.delayedCall(250, () => this._restartOrGoToWeaponSelect());
    }
  }

  // Sobreviveu até RUN_WIN_SECONDS: mesmo "fim de run" da morte (trava
  _triggerWin() {
    this.isGameOver = true;
    this.hasWon = true;
    this.spawnDirector.stop();
    this.scoreManager.finalize(true, { finalLevel: this.runState.level });
    EventBus.emit('player-won');
  }

  // Fim de run: morreu -> reinicia a mesma run (mesma arma, ver
  _restartOrGoToWeaponSelect() {
    // Multiplayer: a partida só acaba quando o Host declara vitória/derrota do
    // grupo. Quem morreu antes espera aqui (o pedido fica na fila).
    const multiplayer = this.multiplayer;
    if (multiplayer?.isMultiplayer && multiplayer.mqtt?.connected && multiplayer.matchState === 'running') {
      this._pendingGroupRestart = true;
      return;
    }
    if (this.hasWon || this.groupWon) {
      this.scene.start('WeaponSelectScene', {
        multiplayerRoom: this.multiplayerRoom,
        isRoomHost: this.isRoomHost
      });
      return;
    }
    // repassa a arma explicitamente: scene.restart() sozinho não
    this.scene.restart({
      weaponId: this.weaponId,
      multiplayerRoom: this.multiplayerRoom,
      isRoomHost: this.isRoomHost
    });
  }

  // ---------- construção ----------

  _buildMap() {
    this.mapManager = new MapManager(this).build();
    const bounds = this.mapManager.getWorldBounds();
    this.physics.world.setBounds(0, 0, bounds.width, bounds.height);
    this.cameras.main.setBounds(0, 0, bounds.width, bounds.height);
  }

  _buildRun() {
    this.runState = new RunState(this.weaponId);
    this.isGameOver = false;
    this.resultComplete = false; // vira true quando a tela de resultado (ResultUI) termina
    this.hasWon = false;
    this.groupWon = false; // vitória do grupo anunciada pelo Host (quem já tinha morrido também a recebe)
    this._pendingGroupRestart = false;
    this.isPaused = false;
    // câmera lenta só-inimigos (evolução "Reflexos de Predador", punhos) —
    this.slowmoSystem = new SlowmoSystem();
    // pontuação da partida (separada de XP/level — ver ScoreManager)
    this.scoreManager = new ScoreManager(scoreValuesData, RUN_WIN_SECONDS);
  }

  _buildPlayer() {
    const spawn = this.mapManager.getPlayerSpawn();
    // Multiplayer: quem ENTRA na sala (não é o Host original) joga de gato
    // branco; o Host continua preto. Fixado aqui, então não troca se o Host
    // mudar no meio da partida.
    const inRoom = this.multiplayerRoom || new URLSearchParams(window.location.search).get('room');
    const skin = inRoom && !this.isRoomHost ? 'white' : 'default';
    this.skin = skin;
    this.player = new Player(this, spawn.x, spawn.y, this.runState, skin);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    // Zoom-base compensa o BASE_VISUAL_SCALE do Player.js: como o gato/boss
    // agora são 1.5x maiores (fix do mapa novo), sem isso ficariam "gigantes"
    // na tela. Dividindo o zoom pela mesma escala, a câmera puxa pra trás na
    // medida exata — a proporção gato:tile nova fica de pé, mas o tamanho do
    // gato na tela volta a ser o de antes (e ainda sobra mais mapa visível).
    const baseZoom = 0.9 / BASE_VISUAL_SCALE;
    // celular: câmera um pouco mais próxima, só estética/sensação de jogo
    // (mesmo bônus relativo de antes — 1.4x mais perto que o desktop)
    const zoom = this.sys.game.device.input.touch ? baseZoom * 1.4 : baseZoom;
    this.cameras.main.setZoom(zoom);
    // startFollow() só define o alvo; o scroll real da câmera (e portanto
    this.cameras.main.centerOn(spawn.x, spawn.y);
    this.mapManager.addCollider(this.player);
  }

  _buildMultiplayer() {
    this.multiplayer = new MultiplayerManager(
      this,
      this.player,
      this.multiplayerRoom,
      this.isRoomHost
    );
    this.events.once('shutdown', () => {
      this.multiplayer?.destroy();
      this.multiplayer = null;
    });
  }

  // Reagenda a cada disparo (delay sorteado de novo toda vez), mesmo
  _scheduleAmbientSfx() {
    const delay = Phaser.Math.Between(AMBIENT_SFX_MIN_DELAY_MS, AMBIENT_SFX_MAX_DELAY_MS);
    this._ambientSfxEvent = this.time.addEvent({
      delay,
      callback: () => {
        this.sound.play('sfx_leviathan_bg', { volume: 0.5 });
        this._scheduleAmbientSfx();
      }
    });
  }

  _buildEnemies() {
    this.enemySpawner = new EnemySpawner(this, this.mapManager, this.player, enemiesData, flockingConfigData);
    // Inimigos colidem entre si (mas continuam atravessáveis pelo jogador —
    this.enemySpawner.enemyCollisionCollider = this.physics.add.collider(
      this.enemySpawner.group,
      this.enemySpawner.group
    );
    // SpawnDirector cronometra a run e decide quando/quantos inimigos pedir;
    this.spawnDirector = new SpawnDirector(this, this.enemySpawner, spawnPhasesData, spawnCurvesData, sealerScheduleData, eliteScheduleData, bossScheduleData);
    this._lastRunTimeSeconds = -1;
    this.spawnDirector.start(
      !this.multiplayer?.isMultiplayer || this.multiplayer.isRoomHost || !this.multiplayer.mqtt
    );
    this.multiplayer?.attachRunClock(this.spawnDirector);
  }

  _buildWeapon() {
    this.weaponManager = new WeaponManager(
      this,
      this.enemySpawner.group,
      weaponsData,
      this.runState,
      this.runState.weaponId
    );
    this.player.setWeaponManager(this.weaponManager);
  }

  // AbilityManager escuta 'ability-unlocked' (emitido por RunManager quan…
  _buildAbilities() {
    this.abilityManager = new AbilityManager(this, this.player, this.enemySpawner.group);
  }

  _buildPickups() {
    this.xpOrbGroup = this.physics.add.group();
    this.medkitGroup = this.physics.add.group();
    this.magnetGroup = this.physics.add.group();
    this._magnetHasAppeared = false;
    this._forceNextMagnetDrop = false;
    this._nextPickupMagnetUpdateAt = 0;
    this._nextXpCollectSfxAt = 0;
    this.pickupsById = new Map(); // id (decidido pelo Host) -> sprite
    this.nextPickupId = 1; // só o Host/solo atribui ids
    this.runManager = new RunManager(this.runState, this.player, upgradesData);
  }

  _buildUI() {
    this.hud = new HUD(this);

    // HUD nasce invisível e só entra depois que o mapa terminar de
    this.hud.uiContainer.setAlpha(0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.time.delayedCall(HUD_FADE_IN_DELAY_MS, () => {
        this.tweens.add({ targets: this.hud.uiContainer, alpha: 1, duration: HUD_FADE_IN_MS });
      });
    });

    // Player já emitiu 'player-health-changed' no próprio construtor
    EventBus.emit('player-health-changed', {
      current: this.player.healthSystem.current,
      max: this.player.healthSystem.maxHp
    });
    this.levelUpUI = new LevelUpUI(this, this.runManager);
    // botão de pausa (PC + celular) + saída de fullscreen (só celular) —
    this.pauseUI = new PauseUI(this);
    // tela de resultado (pontuação), aparece só depois do "Você Morreu"/
    // vitória (ver ResultUI/HUD)
    this.resultUI = new ResultUI(this);
    // console de hack (F9) — dá cartas por comando, ver src/systems/DevCons…
    this.devConsole = new DevConsole(this, this.runManager);
  }

  _buildCollisions() {
    // inimigo encosta no jogador -> dano de contato (+ contra-ataque de
    this.physics.add.overlap(this.player, this.enemySpawner.group, (player, enemy) => {
      if (enemy.networkReplica && this.multiplayer?.isMultiplayer && !this.multiplayer.isRoomHost) return;
      const hit = DamageSystem.applyContactDamage(
        enemy,
        player,
        enemy.def.contactDamage,
        enemy.def.contactCooldownMs,
        this.time.now
      );
      if (hit && this.runState.thornsDamage > 0) {
        DamageSystem.applyWeaponHit(enemy, this.runState.thornsDamage, player);
      }
    });

    // jogador encosta em orb de xp -> coleta
    this.physics.add.overlap(this.player, this.xpOrbGroup, (player, orb) => this._onPickupOverlap(orb));
    this.physics.add.overlap(this.player, this.medkitGroup, (player, medkit) => this._onPickupOverlap(medkit));
    this.physics.add.overlap(this.player, this.magnetGroup, (player, magnet) => this._onPickupOverlap(magnet));

    // inimigo morre -> registra abate, dropa orb de xp e explode em FX
    EventBus.on('enemy-died', (death) => this._handleEnemyDeath(death, true));
    EventBus.on('network-enemy-died', (death) => this._handleEnemyDeath(death, false));

    EventBus.on('player-died', () => {
      this.isGameOver = true;
      this.runManager.discardPendingLevelUps();
      this.multiplayer?.cancelPendingLevelUps();
      if (!this.multiplayer?.isMultiplayer || !this.multiplayer.isRoomHost) {
        this.spawnDirector.stop();
      }
      this.scoreManager.finalize(false, { finalLevel: this.runState.level });
    });

    EventBus.on('levelup-opened', () => {
      this.isPaused = true;
      this.spawnDirector.pause();
      this._setGameplayVisualsPaused(true);
      MusicManager.duckForCards(this);
    });
    EventBus.on('levelup-closed', () => {
      this.player.grantLevelUpInvulnerability(LEVEL_UP_INVULNERABILITY_MS);
      this.multiplayer?.grantLevelUpInvulnerability(LEVEL_UP_INVULNERABILITY_MS);
      this.isPaused = false;
      this.spawnDirector.resume();
      this._setGameplayVisualsPaused(false);
      MusicManager.restoreFromCards(this);
    });

    // menu de pausa (ver src/ui/PauseUI.js) — mesmo tratamento do level-up
    EventBus.on('pause-opened', () => {
      this.isPaused = true;
      this.spawnDirector.pause();
      this._setGameplayVisualsPaused(true);
    });
    EventBus.on('pause-closed', () => {
      this.isPaused = false;
      this.spawnDirector.resume();
      this._setGameplayVisualsPaused(false);
    });
  }

  // Morte, score, XP e drops são UM evento. Quem tem autoridade (Host / solo)
  // decide os drops uma vez e os manda dentro do próprio pacote da morte; os
  // clientes só executam o que veio (nada de Math.random por cliente).
  _handleEnemyDeath(death, isAuthority) {
    const { enemyId, x, y, xpReward, color } = death;
    let event = death;
    if (isAuthority) {
      event = { ...death, drops: this._rollDrops(death) };
      this.multiplayer?.broadcastEnemyDeath(event);
    }
    this.runManager.registerKill();
    this.scoreManager.registerKill(enemyId);
    this._spawnDrops(event.drops, x, y, xpReward);
    this._spawnDeathFx(x, y, color);
  }

  // Só o Host/solo chama. O ímã fica desativado no multiplayer por
  // enquanto; quando formos sincronizá-lo, entra no mesmo pacote de drops.
  _rollDrops(death) {
    const drops = { orbId: this.nextPickupId++, medkit: null, magnet: null };
    if (death.enemyId === 'elite' ||
      (death.enemyId === 'cyber_brute' && Math.random() < MEDKIT_BRUTE_DROP_CHANCE)) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const offset = Phaser.Math.Between(MEDKIT_DROP_OFFSET_MIN, MEDKIT_DROP_OFFSET_MAX);
      drops.medkit = [
        this.nextPickupId++,
        Math.round(death.x + Math.cos(angle) * offset),
        Math.round(death.y + Math.sin(angle) * offset)
      ];
    }

    if (!this.multiplayer?.isMultiplayer) {
      const chance = MAGNET_DROP_CHANCES[death.enemyId] || 0;
      const eligible = chance > 0;
      const force = eligible && this._forceNextMagnetDrop && !this._magnetHasAppeared;
      if (eligible && (force || Math.random() < chance)) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const offset = Phaser.Math.Between(MAGNET_DROP_OFFSET_MIN, MAGNET_DROP_OFFSET_MAX);
        drops.magnet = [
          this.nextPickupId++,
          Math.round(death.x + Math.cos(angle) * offset),
          Math.round(death.y + Math.sin(angle) * offset)
        ];
        this._magnetHasAppeared = true;
        this._forceNextMagnetDrop = false;
      }
    }

    return drops;
  }

  _canSpawnPickup(id) {
    return !this.pickupsById.has(id) && !this.multiplayer?.appliedPickupRemovals?.has(id);
  }

  _spawnDrops(drops, x, y, xpReward) {
    if (Number.isInteger(drops?.orbId) && this._canSpawnPickup(drops.orbId)) {
      this._spawnXpOrb(x, y, xpReward, drops.orbId);
    }
    const medkit = drops?.medkit;
    if (Array.isArray(medkit) && Number.isInteger(medkit[0]) && Number.isFinite(medkit[1]) &&
      Number.isFinite(medkit[2]) && this._canSpawnPickup(medkit[0])) {
      this._spawnMedkit(medkit[1], medkit[2], medkit[0]);
    }
    const magnet = drops?.magnet;
    if (Array.isArray(magnet) && Number.isInteger(magnet[0]) && Number.isFinite(magnet[1]) &&
      Number.isFinite(magnet[2]) && this._canSpawnPickup(magnet[0])) {
      this._spawnMagnet(magnet[1], magnet[2], magnet[0]);
    }
  }

  // ---------- coleta de orbs/medkits/ímã ----------

  _registerPickup(id, sprite, kind, value) {
    sprite.setData({ pickupId: id, pickupKind: kind, pickupValue: value });
    this.pickupsById.set(id, sprite);
    sprite.once('destroy', () => {
      if (this.pickupsById.get(id) === sprite) this.pickupsById.delete(id);
    });
  }

  _onPickupOverlap(pickup) {
    if (!pickup.active) return;
    const multiplayer = this.multiplayer;
    const id = pickup.getData('pickupId');
    if (multiplayer?.isMultiplayer && multiplayer.mqtt) {
      if (this.player.isDead) return; // morto não rouba item dos vivos
      if (multiplayer.isRoomHost) {
        this.hostCollectPickup(id, multiplayer.playerId);
      } else if (this.time.now >= (pickup.getData('claimRetryAt') || 0)) {
        // cliente só PEDE; o item some quando o Host confirmar (pra todos)
        pickup.setData('claimRetryAt', this.time.now + PICKUP_CLAIM_RETRY_MS);
        multiplayer.claimPickup(id);
      }
      return;
    }
    this.grantPickupReward(pickup.getData('pickupKind'), pickup.getData('pickupValue'));
    pickup.destroy();
  }

  // Host: única porta de coleta em multiplayer. Retorna false se o item já não existe.
  hostCollectPickup(pickupId, byPlayerId) {
    const sprite = this.pickupsById.get(pickupId);
    if (!sprite || !sprite.active) return false;
    const kind = sprite.getData('pickupKind');
    const value = sprite.getData('pickupValue');
    sprite.destroy();
    if (byPlayerId === this.multiplayer?.playerId) this.grantPickupReward(kind, value);
    this.multiplayer?.broadcastPickupRemoval(pickupId, byPlayerId, kind, value);
    return true;
  }

  grantPickupReward(kind, value) {
    if (this.isGameOver) return;
    if (kind === 'xp') {
      this.runManager.collectXp(value);
      // Um ímã pode trazer centenas de gemas quase juntas. Limitar só o SFX
      // mantém a sensação de "chuva de XP" sem criar centenas de vozes de áudio.
      if (this.time.now >= (this._nextXpCollectSfxAt || 0)) {
        this._nextXpCollectSfxAt = this.time.now + XP_COLLECT_SFX_MIN_INTERVAL_MS;
        this.sound.play('sfx_xp_collect', { volume: 0.4 });
      }
    } else if (kind === 'medkit') {
      const healed = this.player.healthSystem.heal(value);
      if (healed > 0) {
        DamageNumberManager.show(this, this.player.x, this.player.y, healed, this.player, { kind: 'heal' });
      }
    } else if (kind === 'magnet') {
      this._activateMapXpMagnet();
    }
  }

  _activateMapXpMagnet() {
    const now = this.time.now;
    const orbs = this.xpOrbGroup?.getChildren?.().filter((orb) => orb?.active) || [];

    // Stagger curtíssimo: em vez de centenas de corpos mudarem de direção no
    // mesmo tick, a nuvem inteira começa a vir em uma "onda" de ~180 ms.
    orbs.forEach((orb, index) => {
      orb.setData('mapMagnet', true);
      // Distribuição estável e barata; evita criar centenas de timers/tweens.
      const stagger = orbs.length > 1
        ? Math.round((index % 24) / 23 * MAGNET_ALL_XP_STAGGER_MS)
        : 0;
      orb.setData('mapMagnetWakeAt', now + stagger);
    });

    this._playMagnetCollectFx(orbs.length);
  }

  _playMagnetCollectFx(orbCount) {
    const x = this.player.x;
    const y = this.player.y;
    const palette = [0x52f7ff, 0xff4fe1, 0xfff06a];

    // Impacto visual curto e procedural: três anéis finos, poucos pixels e
    // um micro-shake. Não cria emitter permanente nem pós-processamento.
    palette.forEach((color, index) => {
      const ring = this.add.circle(x, y, 44 + index * 8, color, 0)
        .setStrokeStyle(2, color, 0.9 - index * 0.18)
        .setScale(0.24 + index * 0.03)
        .setDepth(80);
      this.tweens.add({
        targets: ring,
        scale: 1 + index * 0.12,
        alpha: 0,
        duration: 320 + index * 60,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy()
      });
    });

    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10 + Phaser.Math.FloatBetween(-0.12, 0.12);
      const spark = this.add.rectangle(x, y, 3, 3, palette[i % palette.length], 1).setDepth(81);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(28, 52),
        y: y + Math.sin(angle) * Phaser.Math.Between(28, 52),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(220, 360),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy()
      });
    }

    this.cameras.main.shake(90, 0.0025);
    if (this.cache.audio.exists('sfx_xp_collect')) {
      this.sound.play('sfx_xp_collect', { volume: orbCount > 0 ? 0.75 : 0.5, rate: 0.82 });
    }
  }

  removeNetworkPickup(pickupId) {
    this.pickupsById?.get(pickupId)?.destroy();
  }

  clearNetworkPickups() {
    this.pickupsById?.forEach((sprite) => sprite.destroy());
    this.pickupsById?.clear();
  }

  _setGameplayVisualsPaused(paused) {
    if (paused) this.player?.pauseVisual?.();
    else this.player?.resumeVisual?.();
    this.enemySpawner?.group?.getChildren().forEach((enemy) => {
      if (paused) enemy.pauseVisual?.();
      else enemy.resumeVisual?.();
    });
    if (paused) this.abilityManager?.pauseVisuals();
    else this.abilityManager?.resumeVisuals();
  }

  _buildInput() {
    this.input.keyboard.on('keydown-R', () => {
      if (this.isGameOver && this.resultComplete) this._restartOrGoToWeaponSelect();
    });

    // ESC no PC alterna o menu de pausa — o botão (canto superior direito,
    this.input.keyboard.on('keydown-ESC', () => this.pauseUI.toggle());

    // reiniciar (tecla R ou botões) só depois do relatório (ver ResultUI); no
    // celular quem reinicia são os botões — toque solto na tela não faz nada

    // celular: ataque continua automático, jogador só controla movimento
    if (this.sys.game.device.input.touch) {
      this.touchJoystick = new TouchJoystick(this);
    }

    // TouchJoystick acabou de nascer (se nasceu) DEPOIS do PauseUI
    // (ver _buildUI, antes de _buildInput) — sem isso a pauseCam dele
    // desenharia o joystick de novo por cima (duplicado), ver PauseUI.refreshIgnoreList
    this.pauseUI.refreshIgnoreList();

    this._buildAutoPauseOnBlur();
  }

  // Perdeu o foco da janela/aba (trocou de aba, minimizou, alt-tab, etc.):
  // abre o menu de pausa sozinho (nunca fecha sozinho ao voltar — quem
  // decide retomar é o jogador). Phaser.Core.Events BLUR/HIDDEN cobrem
  // tanto blur de janela quanto document.visibilitychange, num só lugar.
  _buildAutoPauseOnBlur() {
    const handleBlur = () => {
      if (this.multiplayer?.isMultiplayer || this.isGameOver || this.hasWon) return;
      this.pauseUI.open();
    };
    const handleVisibilityChange = () => {
      if (this.multiplayer?.isMultiplayer) {
        if (document.hidden && this.multiplayer.isRoomHost) this.multiplayer.pauseForHiddenHost();
        return;
      }
      if (document.hidden) {
        handleBlur();
        this.sys.game.loop.sleep();
      } else {
        this.sys.game.loop.wake();
      }
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Os listeners globais sobrevivem ao scene.restart() — sem isso os
    // listeners se acumulariam a cada morte/restart da run
    this.events.once('shutdown', () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });
  }

  _spawnXpOrb(x, y, xpReward, pickupId) {
    const tier = _xpGemTierFor(xpReward);
    const orb = this.physics.add.image(x, y, tier.texture).setDepth(5).setScale(tier.scale);
    this._registerPickup(pickupId, orb, 'xp', xpReward);
    // raio/offset do body circular são em pixels da textura (o Phaser multiplica pela escala)
    const worldRadius = XP_GEM_PICKUP_RADIUS * (tier.scale / XP_GEM_BASE_SCALE);
    const radius = worldRadius / tier.scale;
    orb.body.setCircle(radius, orb.width / 2 - radius, orb.height / 2 - radius);
    this.xpOrbGroup.add(orb);

    // brilho: cópia aditiva atrás da gema, pulsando; cada gema começa numa fase diferente
    const glow = this.add.image(x, y, tier.texture)
      .setDepth(4)
      .setScale(tier.scale * XP_GEM_GLOW_SCALE)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    orb.setData('glow', glow);
    const pulse = this.tweens.add({
      targets: glow,
      alpha: tier.glow,
      duration: Phaser.Math.Between(XP_GEM_PULSE_MIN_MS, XP_GEM_PULSE_MAX_MS),
      delay: Phaser.Math.Between(0, XP_GEM_PULSE_MAX_MS),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        // a gema acompanha o pulso: mais brilho no halo = gema mais "cheia"
        orb.setAlpha(XP_GEM_MIN_ALPHA + (1 - XP_GEM_MIN_ALPHA) * (glow.alpha / tier.glow));
      }
    });
    orb.once('destroy', () => {
      pulse.stop();
      glow.destroy();
    });
  }

  // x/y já vêm finais (offset sorteado uma vez pelo Host em _rollDrops)
  _spawnMedkit(x, y, pickupId) {
    const medkit = this.physics.add.image(x, y, 'medkit').setDepth(5).setScale(MEDKIT_SCALE);
    this._registerPickup(pickupId, medkit, 'medkit', MEDKIT_HEAL_AMOUNT);
    const radius = Math.min(medkit.width, medkit.height) * 0.42;
    medkit.body.setCircle(radius, medkit.width / 2 - radius, medkit.height / 2 - radius);
    this.medkitGroup.add(medkit);

    const rareFx = new MedkitRareFx(this, medkit);
    medkit.setData('rareFx', rareFx);
    medkit.once('destroy', () => rareFx.destroy());

    this.tweens.add({
      targets: medkit,
      scale: MEDKIT_SCALE * MEDKIT_PULSE_SCALE,
      duration: MEDKIT_PULSE_DURATION_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  _spawnMagnet(x, y, pickupId) {
    this._magnetHasAppeared = true;
    const magnet = this.physics.add.image(x, y, 'magnet').setDepth(5).setScale(MAGNET_SCALE);
    this._registerPickup(pickupId, magnet, 'magnet', 0);
    const radius = Math.min(magnet.width, magnet.height) * 0.43;
    magnet.body.setCircle(radius, magnet.width / 2 - radius, magnet.height / 2 - radius);
    this.magnetGroup.add(magnet);

    const rareFx = new MedkitRareFx(this, magnet, 'magnet');
    magnet.setData('rareFx', rareFx);
    magnet.once('destroy', () => rareFx.destroy());

    this.tweens.add({
      targets: magnet,
      scale: MAGNET_SCALE * MAGNET_PULSE_SCALE,
      duration: MAGNET_PULSE_DURATION_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // "Explosão" de morte do inimigo: um flash branco central + estilhaços
  _spawnDeathFx(x, y, color) {
    // flash central: "pop" rápido que dá o estalo do impacto final
    const flash = this.add.image(x, y, 'hit_fx').setDepth(21).setScale(0.7).setAlpha(0.95).setTint(0xffffff);
    this.tweens.add({
      targets: flash,
      scale: flash.scale * 2.4,
      alpha: 0,
      duration: 160,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    // estilhaços voando em várias direções, na cor do inimigo que morreu
    const shardCount = 7;
    for (let i = 0; i < shardCount; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(20, 46);
      const shard = this.add
        .image(x, y, 'hit_fx')
        .setDepth(20)
        .setScale(Phaser.Math.FloatBetween(0.22, 0.4))
        .setRotation(angle)
        .setTint(color ?? 0xffffff);

      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: shard.scale * 0.3,
        duration: Phaser.Math.Between(220, 320),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }
}
