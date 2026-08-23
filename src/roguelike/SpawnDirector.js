// A cada DIFFICULTY_STEP_MS de run, a dificuldade sobe um "degrau": o
// intervalo entre levas de spawn encolhe e, a cada poucos degraus, a
// quantidade de inimigos por leva aumenta. Tudo em degraus discretos (em
// vez de uma fórmula contínua) pra ficar fácil de prever e ajustar.
const DIFFICULTY_STEP_MS = 20000; // um degrau a cada 20s de run

// Intervalo entre levas de spawn: começa mais espaçado (pedido: "delay
// maior entre eles" no início) e encolhe aos poucos até o piso.
const INITIAL_INTERVAL_MS = 3500;
const MIN_INTERVAL_MS = 900; // piso: nunca spawna mais rápido que isso
const INTERVAL_STEP_MS = 150; // quanto o intervalo encolhe por degrau

const INITIAL_BATCH = 2; // poucos inimigos por leva no início — evita "tudo de uma vez"
const MAX_BATCH = 6; // teto de inimigos por leva (o teto de vivos abaixo ainda se aplica em cima disso)
const STEPS_PER_BATCH_INCREASE = 4; // a cada 4 degraus, +1 inimigo por leva

/**
 * Teto de inimigos vivos ao mesmo tempo: tabela de degraus pedida
 * explicitamente (0-25s / 25-55s / 1:00-1:40), progressiva — nunca pula
 * direto pro máximo. Depois do último degrau da tabela, continua
 * crescendo aos poucos (rampa linear) até MAX_ALIVE_TARGET, em vez de
 * ficar travado em 30 pro resto da run.
 */
const ALIVE_STEPS = [
  { atMs: 0, cap: 10 }, // 0:00–0:25 → no máx. 10 vivos
  { atMs: 25000, cap: 15 }, // 0:25–0:55 (e até 1:00) → 15
  { atMs: 60000, cap: 30 } // a partir de 1:00 → 30
];
const MAX_ALIVE_TARGET = 100; // teto final, bem mais pra frente na run
const MAX_ALIVE_RAMP_START_MS = 100000; // 1:40 — fim do degrau fixo pedido, começa a rampa progressiva
const MAX_ALIVE_RAMP_MS = 4 * 60 * 1000; // 4 minutos pra ir do último degrau (30) até o TARGET

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
    this.enemySpawner.setMaxAlive(ALIVE_STEPS[0].cap);
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
    const cap = this._currentMaxAlive();
    this.enemySpawner.setMaxAlive(cap);

    // Quando o teto sobe de um degrau pro outro (ex.: 15 -> 30 na virada
    // de 1:00), o lote normal (pequeno, pra não sufocar) demoraria muitos
    // ciclos pra alcançar o novo teto — daria a impressão de "poucos
    // inimigos" logo depois da virada. Por isso o tamanho do lote é o
    // maior entre o ritmo normal e o "déficit" até o teto atual: na maior
    // parte do tempo (teto parado) o déficit é pequeno e quem manda é o
    // ritmo normal; só quando o teto acabou de subir é que este lote fica
    // maior por uma ou duas levas, até alcançar o novo teto.
    const deficit = cap - this.enemySpawner.getAliveCount();
    const amount = Math.max(this._currentBatchSize(), deficit);
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

  /**
   * @returns {number} teto de inimigos vivos no momento atual da run.
   * Primeiro segue a tabela fixa de degraus (ALIVE_STEPS); depois do
   * último degrau, passa a crescer aos poucos (rampa linear) até
   * MAX_ALIVE_TARGET, em vez de saltar ou travar no valor do último degrau.
   */
  _currentMaxAlive() {
    const elapsed = this.getElapsedMs();

    // degrau fixo: pega o maior "cap" cujo atMs já foi alcançado
    let stepCap = ALIVE_STEPS[0].cap;
    for (const step of ALIVE_STEPS) {
      if (elapsed >= step.atMs) stepCap = step.cap;
    }

    if (elapsed < MAX_ALIVE_RAMP_START_MS) return stepCap;

    // rampa progressiva depois do fim da tabela fixa
    const progress = Math.min(1, (elapsed - MAX_ALIVE_RAMP_START_MS) / MAX_ALIVE_RAMP_MS);
    const value = stepCap + (MAX_ALIVE_TARGET - stepCap) * progress;
    return Math.round(value);
  }
}
