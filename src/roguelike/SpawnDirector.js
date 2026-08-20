// A cada DIFFICULTY_STEP_MS de run, a dificuldade sobe um "degrau": o
// intervalo entre levas de spawn encolhe e, a cada poucos degraus, a
// quantidade de inimigos por leva aumenta. Tudo em degraus discretos (em
// vez de uma fórmula contínua) pra ficar fácil de prever e ajustar.
const DIFFICULTY_STEP_MS = 20000; // um degrau a cada 20s de run

const INITIAL_INTERVAL_MS = 2800; // igual ao intervalo fixo que existia antes
const MIN_INTERVAL_MS = 900; // piso: nunca spawna mais rápido que isso
const INTERVAL_STEP_MS = 200; // quanto o intervalo encolhe por degrau

const INITIAL_BATCH = 1; // quantos inimigos por leva no início da run
const MAX_BATCH = 5; // teto de inimigos por leva (MAX_ALIVE do spawner ainda se aplica em cima disso)
const STEPS_PER_BATCH_INCREASE = 3; // a cada 3 degraus, +1 inimigo por leva

/**
 * Dono do "quando" e "quantos" da sobrevivência por tempo: cronometra a
 * run e, com base no tempo decorrido, decide a frequência das levas de
 * spawn e quantos inimigos cada leva pede. NÃO sabe nada sobre COMO um
 * inimigo é criado, posicionado ou de que tipo é — isso continua 100% em
 * EnemySpawner.spawnOne() (que também segue sendo quem decide se pode
 * spawnar mais, via MAX_ALIVE). Este é só o metrônomo; o spawner é quem
 * toca o instrumento.
 *
 * Inimigos já vivos nunca são tocados aqui — cada leva só ADICIONA novos
 * via spawnOne(), então quem já estava na tela continua vivo normalmente.
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
  }

  start() {
    this.startTime = this.scene.time.now;
    this._scheduleNextBatch();
    this._spawnBatch(); // primeira leva imediata, mapa não fica vazio
  }

  stop() {
    this.timerEvent?.remove();
    this.timerEvent = null;
  }

  /** @returns {number} milissegundos desde que a run começou (0 se ainda não iniciou) */
  getElapsedMs() {
    if (this.startTime == null) return 0;
    return this.scene.time.now - this.startTime;
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
    const amount = this._currentBatchSize();
    for (let i = 0; i < amount; i++) {
      this.enemySpawner.spawnOne();
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
}
