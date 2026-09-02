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
import PauseUI from '../ui/PauseUI.js';
import DevConsole from '../systems/DevConsole.js';
import TouchJoystick from '../systems/TouchJoystick.js';
import SlowmoSystem from '../systems/SlowmoSystem.js';

import enemiesData from '../../data/enemies.js';
import weaponsData from '../../data/weapons.js';
import upgradesData from '../../data/upgrades.js';
import spawnPhasesData from '../../data/spawnPhases.js';
import spawnCurvesData from '../../data/spawnCurves.js';
import flockingConfigData from '../../data/flockingConfig.js';
import sealerScheduleData from '../../data/sealerSchedule.js';

const XP_ORB_PICKUP_RANGE_HINT = 4; // margem extra no corpo físico do orb
const XP_ORB_MAGNET_RANGE = 90; // distância (px) a partir da qual o orb passa a ser puxado
const XP_ORB_MAGNET_SPEED = 420; // velocidade (px/s) do orb voando até o jogador
const RUN_WIN_SECONDS = 600; // 10:00 — sobreviver até aqui vence a run

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

    // EventBus é global e sobrevive ao scene.restart() (morte + R/toque) —
    // sem isto, cada restart empilha mais um jogo de listeners (LevelUpUI,
    // HUD, PauseUI, AbilityManager, Player, GameScene) por cima dos da run
    // anterior, todos ainda vivos e reagindo com estado velho. Era a causa
    // real do bug "Arsenal Expandido volta pro estado antigo": uma
    // LevelUpUI fantasma de uma run anterior também recebia 'level-up' e
    // desenhava sua própria versão (com menos opções) por cima da atual.
    // Limpa tudo aqui pra cada create() começar com listeners zerados.
    this.events.once('shutdown', () => {
      this.spawnDirector?.stop();
      EventBus.removeAllListeners();
    });

    EventBus.emit('run-restart');
  }

  update() {
    this._updateRunTimer();

    if (this.isGameOver || this.isPaused) return;
    this.player.update();
    this.enemySpawner.updateAll(this.time.now);
    this.abilityManager.update(this.time.now);
    this._updateXpOrbMagnet();
  }

  /**
   * "Ímã" de XP: todo orb dentro de XP_ORB_MAGNET_RANGE do jogador passa a
   * voar em direção a ele (em vez de esperar o jogador encostar). Overlap
   * de coleta continua o mesmo (ver _buildCollisions) — isto só move o
   * orb pra perto, quem recolhe é o overlap de sempre.
   */
  _updateXpOrbMagnet() {
    this.xpOrbGroup.children.each((orb) => {
      const distance = Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y);
      if (distance <= XP_ORB_MAGNET_RANGE) {
        this.physics.moveToObject(orb, this.player, XP_ORB_MAGNET_SPEED);
      } else if (orb.body.velocity.x !== 0 || orb.body.velocity.y !== 0) {
        // saiu do alcance (ex.: jogador se afastou rápido) -> para de voar
        orb.setVelocity(0, 0);
      }
    });
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
    if (seconds >= RUN_WIN_SECONDS) {
      this._triggerWin();
    }
  }

  /** Sobreviveu até RUN_WIN_SECONDS: mesmo "fim de run" da morte (trava
   * timer/spawn), só que com vitória — HUD mostra a tela de parabéns
   * (ver 'player-won' em HUD.js) e R/toque leva pra seleção de arma em
   * vez de reiniciar a mesma run (ver isGameOver+hasWon em _buildInput). */
  _triggerWin() {
    this.isGameOver = true;
    this.hasWon = true;
    this.spawnDirector.stop();
    EventBus.emit('player-won');
  }

  /** Fim de run: morreu -> reinicia a mesma run (mesma arma, ver
   * scene.restart() abaixo); venceu (10:00, ver _triggerWin) -> volta pra
   * seleção de arma em vez de reiniciar a mesma run de novo sozinha. */
  _restartOrGoToWeaponSelect() {
    if (this.hasWon) {
      this.scene.start('WeaponSelectScene');
      return;
    }
    // repassa a arma explicitamente: scene.restart() sozinho não
    // garante que os dados do create() anterior sejam reaproveitados
    this.scene.restart({ weaponId: this.weaponId });
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
    this.hasWon = false;
    this.isPaused = false;
    // câmera lenta só-inimigos (evolução "Reflexos de Predador", punhos) —
    // lida por EnemySpawner.updateAll a cada frame (ver src/systems/SlowmoSystem.js)
    this.slowmoSystem = new SlowmoSystem();
  }

  _buildPlayer() {
    const spawn = this.mapManager.getPlayerSpawn();
    this.player = new Player(this, spawn.x, spawn.y, this.runState);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    // celular: câmera um pouco mais próxima, só estética/sensação de jogo
    // (não muda hitbox/alcance de nada, é puramente visual)
    if (this.sys.game.device.input.touch) {
      this.cameras.main.setZoom(1.4);
    }
    // startFollow() só define o alvo; o scroll real da câmera (e portanto
    // cameras.main.worldView) só se atualiza no próximo passo de render.
    // Sem isso, o primeiro lote de inimigos (spawnado ainda dentro de
    // create(), antes de qualquer render) calcularia "fora da câmera" com
    // base numa worldView desatualizada (ainda no canto do mapa), fazendo
    // inimigos nascerem coladinhos no jogador. centerOn() força o scroll a
    // já nascer centralizado no jogador, de forma síncrona.
    this.cameras.main.centerOn(spawn.x, spawn.y);
    this.mapManager.addCollider(this.player);
  }

  _buildEnemies() {
    this.enemySpawner = new EnemySpawner(this, this.mapManager, this.player, enemiesData, flockingConfigData);
    // Inimigos colidem entre si (mas continuam atravessáveis pelo jogador —
    // aquilo é overlap, não collider, ver _buildCollisions) pra não ficarem
    // empilhados uns dentro dos outros; a física arcade já separa sozinha
    // corpos que se sobrepõem quando existe um collider entre eles.
    this.physics.add.collider(this.enemySpawner.group, this.enemySpawner.group);
    // SpawnDirector cronometra a run e decide quando/quantos inimigos pedir;
    // EnemySpawner só sabe criar (ver src/roguelike/SpawnDirector.js)
    this.spawnDirector = new SpawnDirector(this, this.enemySpawner, spawnPhasesData, spawnCurvesData, sealerScheduleData);
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
    // Player já emitiu 'player-health-changed' no próprio construtor
    // (_buildPlayer, antes do HUD existir), então o HUD perdia esse
    // primeiro evento e só mostrava o número de vida depois do primeiro
    // dano. Reemite aqui, agora que o HUD já está ouvindo, pra HP cheio
    // aparecer desde o início.
    EventBus.emit('player-health-changed', {
      current: this.player.healthSystem.current,
      max: this.player.healthSystem.maxHp
    });
    this.levelUpUI = new LevelUpUI(this, this.runManager);
    // botão de pausa (PC + celular) + saída de fullscreen (só celular) —
    // ver src/ui/PauseUI.js
    this.pauseUI = new PauseUI(this);
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

    // inimigo morre -> registra abate, dropa orb de xp e explode em FX
    EventBus.on('enemy-died', ({ x, y, xpReward, color }) => {
      this.runManager.registerKill();
      this._spawnXpOrb(x, y, xpReward);
      this._spawnDeathFx(x, y, color);
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

    // menu de pausa (ver src/ui/PauseUI.js) — mesmo tratamento do level-up
    // acima, só que quem cuida de physics.pause()/timeScale é o próprio
    // PauseUI (igual LevelUpUI já fazia antes deste botão existir)
    EventBus.on('pause-opened', () => {
      this.isPaused = true;
      this.spawnDirector.pause();
    });
    EventBus.on('pause-closed', () => {
      this.isPaused = false;
      this.spawnDirector.resume();
    });
  }

  _buildInput() {
    this.input.keyboard.on('keydown-R', () => {
      if (this.isGameOver) this._restartOrGoToWeaponSelect();
    });

    // ESC no PC alterna o menu de pausa — o botão (canto superior direito,
    // ver src/ui/PauseUI.js) já cobre PC e celular, isto é só um atalho a
    // mais pra quem tem teclado. toggle() já ignora sozinho se a run
    // acabou ou o level-up está aberto.
    this.input.keyboard.on('keydown-ESC', () => this.pauseUI.toggle());

    // celular não tem tecla R — toque na tela reinicia também (funciona
    // igual no PC com clique, sem prejudicar nada: só reage se já morreu)
    this.input.on('pointerdown', () => {
      if (this.isGameOver) this._restartOrGoToWeaponSelect();
    });

    // celular: ataque continua automático, jogador só controla movimento
    // (ver Player._handleMovement). Só existe em dispositivo com touch —
    // no PC nada muda, WASD/setas continuam sendo o único input de movimento.
    if (this.sys.game.device.input.touch) {
      this.touchJoystick = new TouchJoystick(this);
    }
  }

  _spawnXpOrb(x, y, xpReward) {
    const orb = this.physics.add.image(x, y, 'xp_orb').setDepth(5);
    orb.setData('xpReward', xpReward);
    const radius = orb.width / 2 + XP_ORB_PICKUP_RANGE_HINT;
    orb.body.setCircle(radius, orb.width / 2 - radius, orb.height / 2 - radius);
    this.xpOrbGroup.add(orb);
  }

  /**
   * "Explosão" de morte do inimigo: um flash branco central + estilhaços
   * (reaproveitando a textura 'hit_fx', mesma da reação de hit — sem
   * asset novo) voando pra fora na cor do inimigo, some rápido. Só
   * visual, não mexe em XP/dano/nada de gameplay — chamado junto com
   * _spawnXpOrb no listener de 'enemy-died' acima.
   */
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
