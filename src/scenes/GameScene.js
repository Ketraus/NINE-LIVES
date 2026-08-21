import EventBus from '../systems/EventBus.js';
import MapManager from '../maps/MapManager.js';
import Player from '../entities/Player.js';
import EnemySpawner from '../entities/enemies/EnemySpawner.js';
import WeaponManager from '../weapons/WeaponManager.js';
import AbilityManager from '../abilities/AbilityManager.js';
import DamageSystem from '../combat/DamageSystem.js';
import RunState from '../roguelike/RunState.js';
import RunManager from '../roguelike/RunManager.js';
import SpawnDirector from '../roguelike/SpawnDirector.js';
import HUD from '../ui/HUD.js';
import LevelUpUI from '../ui/LevelUpUI.js';
import DevConsole from '../systems/DevConsole.js';

import enemiesData from '../../data/enemies.js';
import weaponsData from '../../data/weapons.js';
import upgradesData from '../../data/upgrades.js';

const XP_ORB_PICKUP_RANGE_HINT = 4; // margem extra no corpo físico do orb

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  /** @param {{ weaponId?: string }} data - vem da WeaponSelectScene (ou de scene.restart) */
  create(data) {
    // limpa listeners de uma partida anterior (esta scene pode restartar
    // várias vezes e EventBus é um singleton compartilhado)
    EventBus.removeAllListeners();

    // guarda pra poder repassar no restart (tecla R) sem perder a arma escolhida
    this.weaponId = data?.weaponId || this.weaponId || null;

    this._buildMap();
    this._buildRun();
    this._buildPlayer();
    this._buildEnemies();
    this._buildWeapon();
    this._buildAbilities();
    this._buildPickups();
    this._buildUI();
    this._buildCollisions();
    this._buildInput();

    this.events.once('shutdown', () => this.spawnDirector?.stop());

    EventBus.emit('run-restart');
  }

  update() {
    this._updateRunTimer();

    if (this.isGameOver || this.isPaused) return;
    this.player.update();
    this.enemySpawner.updateAll();
    this.abilityManager.update(this.time.now);
  }

  /**
   * Emite o tempo de run decorrido (em segundos inteiros) só quando ele
   * muda, pra HUD desenhar o contador — sem dar a HUD acesso direto ao
   * SpawnDirector (ela só escuta EventBus, ver ui/HUD.js). Congela ao
   * morrer; também congela durante a tela de escolha de carta (ver
   * SpawnDirector.pause/resume, chamados em 'levelup-opened'/'-closed').
   */
  _updateRunTimer() {
    if (this.isGameOver) return;
    const seconds = Math.floor(this.spawnDirector.getElapsedMs() / 1000);
    if (seconds !== this._lastRunTimeSeconds) {
      this._lastRunTimeSeconds = seconds;
      EventBus.emit('run-time-changed', { seconds });
    }
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
    this.isPaused = false;
  }

  _buildPlayer() {
    const spawn = this.mapManager.getPlayerSpawn();
    this.player = new Player(this, spawn.x, spawn.y, this.runState);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.mapManager.addCollider(this.player);
  }

  _buildEnemies() {
    this.enemySpawner = new EnemySpawner(this, this.mapManager, this.player, enemiesData);
    // Inimigos colidem entre si (mas continuam atravessáveis pelo jogador —
    // aquilo é overlap, não collider, ver _buildCollisions) pra não ficarem
    // empilhados uns dentro dos outros; a física arcade já separa sozinha
    // corpos que se sobrepõem quando existe um collider entre eles.
    this.physics.add.collider(this.enemySpawner.group, this.enemySpawner.group);
    // SpawnDirector cronometra a run e decide quando/quantos inimigos pedir;
    // EnemySpawner só sabe criar (ver src/roguelike/SpawnDirector.js)
    this.spawnDirector = new SpawnDirector(this, this.enemySpawner);
    this._lastRunTimeSeconds = -1;
    this.spawnDirector.start();
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

  /**
   * AbilityManager escuta 'ability-unlocked' (emitido por RunManager quando
   * uma carta exclusiva é escolhida) e cuida das habilidades autônomas
   * (soco em área, drone). Precisa existir antes de qualquer carta poder
   * ser oferecida, então entra logo após a arma.
   */
  _buildAbilities() {
    this.abilityManager = new AbilityManager(this, this.player, this.enemySpawner.group);
  }

  _buildPickups() {
    this.xpOrbGroup = this.physics.add.group();
    this.runManager = new RunManager(this.runState, this.player, upgradesData);
  }

  _buildUI() {
    this.hud = new HUD(this);
    this.levelUpUI = new LevelUpUI(this, this.runManager);
    // console de hack (F9) — dá cartas por comando, ver src/systems/DevConsole.js
    this.devConsole = new DevConsole(this, this.runManager);
  }

  _buildCollisions() {
    // inimigo encosta no jogador -> dano de contato (+ contra-ataque de
    // espinhos, se o hit realmente aconteceu — não durante i-frames)
    this.physics.add.overlap(this.player, this.enemySpawner.group, (player, enemy) => {
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
    this.physics.add.overlap(this.player, this.xpOrbGroup, (player, orb) => {
      this.runManager.collectXp(orb.getData('xpReward'));
      orb.destroy();
    });

    // inimigo morre -> registra abate e dropa orb de xp
    EventBus.on('enemy-died', ({ x, y, xpReward }) => {
      this.runManager.registerKill();
      this._spawnXpOrb(x, y, xpReward);
    });

    EventBus.on('player-died', () => {
      this.isGameOver = true;
      this.spawnDirector.stop();
    });

    EventBus.on('levelup-opened', () => {
      this.isPaused = true;
      this.spawnDirector.pause();
    });
    EventBus.on('levelup-closed', () => {
      this.isPaused = false;
      this.spawnDirector.resume();
    });
  }

  _buildInput() {
    this.input.keyboard.on('keydown-R', () => {
      if (this.isGameOver) {
        // repassa a arma explicitamente: scene.restart() sozinho não
        // garante que os dados do create() anterior sejam reaproveitados
        this.scene.restart({ weaponId: this.weaponId });
      }
    });
  }

  _spawnXpOrb(x, y, xpReward) {
    const orb = this.physics.add.image(x, y, 'xp_orb').setDepth(5);
    orb.setData('xpReward', xpReward);
    const radius = orb.width / 2 + XP_ORB_PICKUP_RANGE_HINT;
    orb.body.setCircle(radius, orb.width / 2 - radius, orb.height / 2 - radius);
    this.xpOrbGroup.add(orb);
  }
}
