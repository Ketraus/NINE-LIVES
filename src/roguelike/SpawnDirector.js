// A cada DIFFICULTY_STEP_MS de run, a dificuldade sobe um "degrau": o
// intervalo entre levas de spawn encolhe e, a cada poucos degraus, a
// quantidade de inimigos por leva aumenta. Tudo em degraus discretos (em
// vez de uma fórmula contínua) pra ficar fácil de prever e ajustar.
const DIFFICULTY_STEP_MS = 20000; // um degrau a cada 20s de run

const INITIAL_INTERVAL_MS = 2800; // igual ao intervalo fixo que existia antes
const MIN_INTERVAL_MS = 900; // piso: nunca spawna mais rápido que isso
const INTERVAL_STEP_MS = 200; // quanto o intervalo encolhe por degrau

const INITIAL_BATCH = 5; // quantos inimigos por leva no início da run
const MAX_BATCH = 8; // teto de inimigos por leva (o teto de vivos abaixo ainda se aplica em cima disso)
const STEPS_PER_BATCH_INCREASE = 3; // a cada 3 degraus, +1 inimigo por leva

// Teto de inimigos vivos ao mesmo tempo: cresce linearmente com o tempo de
// run, começando já com vários (mas só Grunt disponível nesse início, ver
// data/enemies.js `minSpawnTimeMs` — por isso continua fácil) e terminando
// alto (estilo enxame de Vampire Survivors) só depois de alguns minutos.
const MAX_ALIVE_START = 30; // vários inimigos já visíveis desde o início
const MAX_ALIVE_TARGET = 100; // teto final, alcançado em MAX_ALIVE_RAMP_MS
const MAX_ALIVE_RAMP_MS = 5 * 60 * 1000; // 5 minutos pra ir de START até TARGET

/**
 * Dono do "quando" e "quantos" da sobrevivência por tempo: cronometra a
 * run e, com base no tempo decorrido, decide a frequência das levas de
 * spawn e quantos inimigos cada leva pede. NÃO sabe nada sobre COMO um
 * inimigo é criado, posicionado ou de que tipo é — isso continua 100% em
 * EnemySpawner.spawnOne() (que também segue sendo quem decide se pode
 * spawnar mais, via setMaxAlive()). Este é só o metrônomo; o spawner é
 * quem toca o instrumento.
 *
 * Inimigos já vivos nunca são tocados aqui — cada leva só ADICIONA novos
 * via spawnOne(), então quem já estava na tela continua vivo normalmente.
 * Também controla, via EnemySpawner.setMaxAlive(), o teto de quantos
 * inimigos podem estar vivos ao mesmo tempo — esse teto também cresce com
 * o tempo (ver MAX_ALIVE_*), então o enxame vai enchendo a tela aos poucos
 * em vez de já nascer lotado no primeiro minuto.
 */
export default class SpawnDirector {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../entities/enemies/EnemySpawner.js').default} enemySpawner
   */
  constructor(scene, enemySpawner) {
    this.scene = scene;
    this.enemySpawner = enemySpawner;
    this.startTime = null;
    this.timerEvent = null;
    this.pausedMs = 0; // soma de todo tempo já pausado (tela de cartas), descontado do relógio da run
    this.pauseStartedAt = null; // timestamp de quando a pausa atual começou, ou null se não está pausado
  }

  start() {
    this.startTime = this.scene.time.now;
    this.enemySpawner.setMaxAlive(MAX_ALIVE_START);
    this._scheduleNextBatch();
    this._spawnBatch(); // primeira leva imediata, mapa não fica vazio
  }

  stop() {
    this.timerEvent?.remove();
    this.timerEvent = null;
  }

  /**
   * Congela o relógio da run (chamado quando a tela de escolha de carta
   * abre — ver GameScene). scene.time.timeScale=0 (setado por LevelUpUI/
   * DevConsole) já congela sozinho o disparo das levas de spawn, mas
   * scene.time.now continua andando em tempo real mesmo com timeScale 0 —
   * por isso o contador de tempo da run precisa descontar esse intervalo
   * manualmente, senão ele continuaria correndo com o jogo pausado.
   */
  pause() {
    if (this.pauseStartedAt != null) return; // já pausado
    this.pauseStartedAt = this.scene.time.now;
  }

  /** Retoma o relógio da run (tela de cartas fechada). */
  resume() {
    if (this.pauseStartedAt == null) return;
    this.pausedMs += this.scene.time.now - this.pauseStartedAt;
    this.pauseStartedAt = null;
  }

  /** @returns {number} milissegundos de run decorridos, sem contar tempo pausado (0 se ainda não iniciou) */
  getElapsedMs() {
    if (this.startTime == null) return 0;
    const now = this.scene.time.now;
    const currentPauseMs = this.pauseStartedAt != null ? now - this.pauseStartedAt : 0;
    return now - this.startTime - this.pausedMs - currentPauseMs;
  }

  /**
   * Reagenda a cada disparo (em vez de um addEvent com loop:true de delay
   * fixo) porque o intervalo muda com o tempo — cada leva precisa recalcular
   * o delay da PRÓXIMA leva com base na dificuldade atual.
   */
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
    // ele acompanha o relógio da run (inclusive descontando pausas, já
    // que usa o mesmo getElapsedMs() do resto da classe)
    this.enemySpawner.setMaxAlive(this._currentMaxAlive());

    const amount = this._currentBatchSize();
    for (let i = 0; i < amount; i++) {
      this.enemySpawner.spawnOne(this.getElapsedMs());
    }
  }

  _currentStep() {
    return Math.floor(this.getElapsedMs() / DIFFICULTY_STEP_MS);
  }

  _currentIntervalMs() {
    const reduction = this._currentStep() * INTERVAL_STEP_MS;
    return Math.max(MIN_INTERVAL_MS, INITIAL_INTERVAL_MS - reduction);
  }

  _currentBatchSize() {
    const increases = Math.floor(this._currentStep() / STEPS_PER_BATCH_INCREASE);
    return Math.min(MAX_BATCH, INITIAL_BATCH + increases);
  }

  /** @returns {number} teto de inimigos vivos no momento atual da run (rampa linear START → TARGET) */
  _currentMaxAlive() {
    const progress = Math.min(1, this.getElapsedMs() / MAX_ALIVE_RAMP_MS);
    const value = MAX_ALIVE_START + (MAX_ALIVE_TARGET - MAX_ALIVE_START) * progress;
    return Math.round(value);
  }
}
