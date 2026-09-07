// Curva de dificuldade progressiva ao longo dos 10 minutos de run: em v…
import MusicManager from '../systems/MusicManager.js';

// Dono do "quando", "quantos" e "de que tipo" da sobrevivência por temp…
// Fallback de segurança, só usado se GameScene não passar spawnCurves p…
const DEFAULT_SPAWN_CURVES = {
  absoluteMaxAlive: 150,
  capCurve: [{ t: 0, v: 10 }, { t: 600000, v: 150 }],
  intervalCurve: [{ t: 0, v: 3500 }, { t: 600000, v: 150 }],
  batchCurve: [{ t: 0, v: 2 }, { t: 600000, v: 8 }]
};

// Entrada do Boss (evento único, ver _checkBossSchedule): depois de todo
const BOSS_SILENCE_MS = 6000;
// Intervalo de checagem "a tela já esvaziou?" depois da fuga — polling
const BOSS_EMPTY_SCREEN_POLL_MS = 200;
// Escurecimento gradual da tela pro PRETO (pedido — era vermelho antes)
const BOSS_OVERLAY_COLOR = 0x000000;
const BOSS_OVERLAY_MAX_ALPHA = 0.55;
// Tremores CRESCENTES tipo batimento cardíaco espalhados pelos 6s de
const BOSS_HEARTBEAT_TIMES_MS = [2500, 3600, 4400, 5000, 5450, 5750];
const BOSS_HEARTBEAT_INTENSITIES = [0.003, 0.005, 0.007, 0.009, 0.011, 0.014];
const BOSS_HEARTBEAT_SHAKE_MS = 130;
// Flash branco na tela inteira (Phaser Camera FX nativo) — dura pouco de
const BOSS_FLASH_MS = 350;
// Vibração da entrada — reduzida de 0.02 pra 0.016 (era forte demais em
const BOSS_FLASH_SHAKE_MS = 400;
const BOSS_FLASH_SHAKE_INTENSITY = 0.016;
// Hitstop: física do jogo congela por este tanto de tempo bem no auge do
const BOSS_HITSTOP_MS = 130;

export default class SpawnDirector {
  // {t, weights} com o peso de cada tipo de inimigo ao longo do tempo de
  constructor(scene, enemySpawner, spawnPhases = [], spawnCurves = DEFAULT_SPAWN_CURVES, sealerSchedule = [], eliteSchedule = [], bossSchedule = null) {
    this.scene = scene;
    this.enemySpawner = enemySpawner;
    this.spawnPhases = spawnPhases;
    this.spawnCurves = spawnCurves;
    this.startTime = null;
    this.timerEvent = null;
    this.pausedMs = 0; // soma de todo tempo já pausado (tela de cartas), descontado do relógio…
    this.pauseStartedAt = null; // timestamp de quando a pausa atual começou, ou null se não está pausado

    // Horário manual (data/sealerSchedule.js) de quando o Sealer nasce —
    this.sealerSchedule = sealerSchedule;
    this.sealerTriggered = new Set();

    // Horário manual (data/eliteSchedule.js) de quando o(s) Elite(s)
    this.eliteSchedule = eliteSchedule;
    this.eliteTriggered = new Set();

    // Evento único do Boss (data/bossSchedule.js, {t}) — "primeiro e
    this.bossSchedule = bossSchedule;
    this.bossTriggered = false;
    this.bossHasSpawned = false;
    this._bossMusicRestoreDone = false;

    // Cheat (DevConsole "autospawn"): true = levas automáticas continuam
    this.autoSpawnEnabled = true;
  }

  // scene.time.now só é atualizado depois do 1º ciclo de update da cena
  _now() {
    return this.scene.sys.game.loop.time;
  }

  start() {
    this.startTime = this._now();
    this.enemySpawner.setMaxAlive(this.spawnCurves.capCurve[0].v);
    this._scheduleNextBatch();
    this._spawnBatch(); // primeira leva imediata, mapa não fica vazio
  }

  stop() {
    this.timerEvent?.remove();
    this.timerEvent = null;
  }

  // Congela o relógio da run (chamado quando a tela de escolha de carta
  pause() {
    if (this.pauseStartedAt != null) return; // já pausado
    this.pauseStartedAt = this._now();
  }

  // Retoma o relógio da run (tela de cartas fechada).
  resume() {
    if (this.pauseStartedAt == null) return;
    this.pausedMs += this._now() - this.pauseStartedAt;
    this.pauseStartedAt = null;
  }

  getElapsedMs() {
    if (this.startTime == null) return 0;
    const now = this._now();
    const currentPauseMs = this.pauseStartedAt != null ? now - this.pauseStartedAt : 0;
    return now - this.startTime - this.pausedMs - currentPauseMs;
  }

  // Cheat (DevConsole "settime"): ajusta o relógio da run pra um tempo
  setElapsedMs(targetMs) {
    const now = this._now();
    const currentPauseMs = this.pauseStartedAt != null ? now - this.pauseStartedAt : 0;
    this.startTime = now - this.pausedMs - currentPauseMs - Math.max(0, targetMs);
  }

  // Reagenda a cada disparo (em vez de um addEvent com loop:true de delay
  _scheduleNextBatch() {
    this.timerEvent = this.scene.time.addEvent({
      delay: this._currentIntervalMs(),
      callback: () => {
        this._spawnBatch();
        this._scheduleNextBatch();
      }
    });
  }

  _spawnBatch() {
    // teto de vivos é recalculado a cada leva, não só na largada — assim
    const cap = this._currentMaxAlive();
    this.enemySpawner.setMaxAlive(cap);

    // Sealer nasce SEMPRE por horário manual, nunca pelo sorteio normal
    this._checkSealerSchedule();

    // Elite também é checado sempre, mesmo com autospawn desligado —
    this._checkEliteSchedule();

    // Boss também é checado sempre, mesmo com autospawn desligado — evento
    this._checkBossSchedule();
    // idem: música só volta quando o Minotauro morrer de verdade (ver
    this._checkBossMusicRestore();

    if (!this.autoSpawnEnabled) return; // cheat "autospawn" desligado: só spawn manual (ver toggleAutoSpawn)

    // Arena do Sealer ativa: NINGUÉM mais nasce até ele morrer (ou a
    if (this.enemySpawner.hasActiveSealer()) return;

    // Boss (Minotauro): trava TODO spawn automático desde o instante do
    if (this._isBossEncounterActive()) return;

    // Quando o teto sobe bastante entre uma leva e outra, o lote normal
    const deficit = cap - this.enemySpawner.getAliveCount();
    const batchSize = this._currentBatchSize();
    const amount = Math.max(batchSize, Math.min(deficit, batchSize * 2));
    // a fase atual (pesos por tipo, ver _currentWeights) é escolhida uma
    const weights = this._currentWeights();
    // spawnBatch (não mais um loop de spawnOne aqui) é quem decide COMO
    this.enemySpawner.spawnBatch(amount, this.getElapsedMs(), weights);
  }

  // Cheat (DevConsole "autospawn"): liga/desliga as levas automáticas
  toggleAutoSpawn() {
    this.autoSpawnEnabled = !this.autoSpawnEnabled;
    return this.autoSpawnEnabled;
  }

  // Dispara o spawn do Sealer nos horários fixos de data/sealerSchedule.js
  _checkSealerSchedule() {
    if (!this.sealerSchedule || this.sealerSchedule.length === 0) return;
    const elapsedMs = this.getElapsedMs();
    this.sealerSchedule.forEach((timeMs, index) => {
      if (elapsedMs >= timeMs && !this.sealerTriggered.has(index)) {
        this.sealerTriggered.add(index);
        this.enemySpawner.spawnByDefId('sealer', 1);
      }
    });
  }

  // Dispara o spawn do Elite nos horários fixos de data/eliteSchedule.js
  _checkEliteSchedule() {
    if (!this.eliteSchedule || this.eliteSchedule.length === 0) return;
    const elapsedMs = this.getElapsedMs();
    this.eliteSchedule.forEach((entry, index) => {
      if (elapsedMs >= entry.t && !this.eliteTriggered.has(index)) {
        this.eliteTriggered.add(index);
        this.enemySpawner.spawnByDefId('elite', entry.count ?? 1);
      }
    });
  }

  // Dispara o evento do Boss no horário fixo de data/bossSchedule.js
  _checkBossSchedule() {
    if (!this.bossSchedule || this.bossTriggered) return;
    if (this.getElapsedMs() >= this.bossSchedule.t) {
      this.bossTriggered = true;
      this.enemySpawner.fleeAll();
      this._waitForEmptyScreenThenBuildup();
    }
  }

  // true desde o instante do gatilho do Boss até ele nascer E morrer —
  _isBossEncounterActive() {
    if (!this.bossTriggered) return false;
    if (this.enemySpawner.hasActiveBoss()) {
      this.bossHasSpawned = true;
      return true;
    }
    return !this.bossHasSpawned;
  }

  // Depois de mandar todo mundo fugir (Enemy.flee não é instantâneo, ver
  _waitForEmptyScreenThenBuildup() {
    const poll = this.scene.time.addEvent({
      delay: BOSS_EMPTY_SCREEN_POLL_MS,
      loop: true,
      callback: () => {
        if (this.enemySpawner.hasAnyAlive()) return;
        poll.remove();
        this._startBossTensionBuildup();
        this.scene.time.delayedCall(BOSS_SILENCE_MS, () => this._triggerBossEntrance());
      }
    });
  }

  // Começo do silêncio de verdade (tela já vazia): escurece a tela
  _startBossTensionBuildup() {
    const cam = this.scene.cameras.main;
    this.bossOverlay = this.scene.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width * 3, cam.height * 3, BOSS_OVERLAY_COLOR, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.scene.tweens.add({
      targets: this.bossOverlay,
      fillAlpha: BOSS_OVERLAY_MAX_ALPHA,
      duration: BOSS_SILENCE_MS,
      ease: 'Sine.easeIn'
    });

    // música de jogo vai sumindo ("cada vez mais distante") no mesmo
    MusicManager.duckForBoss(this.scene, BOSS_SILENCE_MS);

    BOSS_HEARTBEAT_TIMES_MS.forEach((t, i) => {
      this.scene.time.delayedCall(t, () => {
        this.scene.cameras.main.shake(BOSS_HEARTBEAT_SHAKE_MS, BOSS_HEARTBEAT_INTENSITIES[i]);
      });
    });
  }

  // Fim do silêncio: corta o escurecimento na hora (contraste forte com
  _triggerBossEntrance() {
    this.bossOverlay?.destroy();
    this.bossOverlay = null;

    const cam = this.scene.cameras.main;
    cam.flash(BOSS_FLASH_MS, 255, 255, 255);
    cam.shake(BOSS_FLASH_SHAKE_MS, BOSS_FLASH_SHAKE_INTENSITY);
    // som grave/impacto gigantesco bem no instante do flash — reaproveita
    this.scene.sound.play('sfx_cyberus_explosion', { volume: 0.9 });

    this.scene.physics.world.pause();
    this.scene.time.delayedCall(BOSS_HITSTOP_MS, () => {
      this.scene.physics.world.resume();
      this.enemySpawner.spawnByDefId('minotaur', 1);
      // música NÃO volta aqui — fica parada (silêncio) durante toda a
    });
  }

  // Música (ducked em _startBossTensionBuildup) só volta quando o
  _checkBossMusicRestore() {
    if (!this.bossHasSpawned || this._bossMusicRestoreDone) return;
    if (this.enemySpawner.hasActiveBoss()) return; // ainda vivo
    this._bossMusicRestoreDone = true;
    MusicManager.restoreFromBoss(this.scene);
  }

  _currentIntervalMs() {
    return Math.round(this._lerpCurve(this.spawnCurves.intervalCurve, this.getElapsedMs()));
  }

  _currentBatchSize() {
    return Math.round(this._lerpCurve(this.spawnCurves.batchCurve, this.getElapsedMs()));
  }

  // Escolhe a fase atual da horda: interpola os pesos por id de inimigo
  _currentWeights() {
    if (!this.spawnPhases || this.spawnPhases.length === 0) return null;

    const elapsedMs = this.getElapsedMs();
    if (elapsedMs <= this.spawnPhases[0].t) return this.spawnPhases[0].weights;

    const last = this.spawnPhases[this.spawnPhases.length - 1];
    if (elapsedMs >= last.t) return last.weights;

    for (let i = 0; i < this.spawnPhases.length - 1; i++) {
      const a = this.spawnPhases[i];
      const b = this.spawnPhases[i + 1];
      if (elapsedMs >= a.t && elapsedMs <= b.t) {
        const progress = (elapsedMs - a.t) / (b.t - a.t);
        const ids = new Set([...Object.keys(a.weights), ...Object.keys(b.weights)]);
        const result = {};
        ids.forEach((id) => {
          const wa = a.weights[id] ?? 0;
          const wb = b.weights[id] ?? 0;
          result[id] = wa + (wb - wa) * progress;
        });
        return result;
      }
    }

    return last.weights; // inalcançável na prática, só por segurança
  }

  // seguindo spawnCurves.capCurve e travado (Math.min) em
  _currentMaxAlive() {
    const value = this._lerpCurve(this.spawnCurves.capCurve, this.getElapsedMs());
    return Math.min(this.spawnCurves.absoluteMaxAlive, Math.round(value));
  }

  // Interpolação linear genérica entre os pontos {t, v} de uma curva
  _lerpCurve(curve, elapsedMs) {
    if (elapsedMs <= curve[0].t) return curve[0].v;

    const last = curve[curve.length - 1];
    if (elapsedMs >= last.t) return last.v;

    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i];
      const b = curve[i + 1];
      if (elapsedMs >= a.t && elapsedMs <= b.t) {
        const progress = (elapsedMs - a.t) / (b.t - a.t);
        return a.v + (b.v - a.v) * progress;
      }
    }

    return last.v; // inalcançável na prática, só por segurança
  }
}
