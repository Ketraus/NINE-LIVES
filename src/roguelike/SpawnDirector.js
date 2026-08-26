// Curva de dificuldade progressiva ao longo dos 10 minutos de run: em vez
// de degraus discretos, três curvas contínuas (teto de vivos, intervalo
// entre levas e tamanho da leva) definidas por pontos-chave em minutos e
// interpoladas linearmente entre eles (ver _lerpCurve()) — suave entre um
// ponto e outro, mas com liberdade pra ficar bem mais íngreme perto do
// fim só ajustando os pontos, sem mudar a lógica.
//
// Depois do último ponto (10:00), todas as curvas ficam travadas no valor
// final (ver _lerpCurve()) — a run não continua ficando mais difícil pra
// sempre, e o teto de vivos NUNCA passa de ABSOLUTE_MAX_ALIVE.

const ABSOLUTE_MAX_ALIVE = 150; // limite rígido, nunca ultrapassado em hipótese alguma

/**
 * Teto de inimigos vivos ao mesmo tempo, por tempo de run (ms -> cap).
 * Valores pedidos explicitamente: começa tranquilo (10), cresce de forma
 * constante até os 8:00 (120) e então acelera nos últimos 2 minutos,
 * fechando em 150 exatamente aos 10:00.
 */
const CAP_CURVE = [
  { t: 0, v: 10 }, // 0:00
  { t: 60000, v: 20 }, // 1:00
  { t: 120000, v: 32 }, // 2:00
  { t: 180000, v: 45 }, // 3:00
  { t: 240000, v: 60 }, // 4:00
  { t: 300000, v: 75 }, // 5:00
  { t: 360000, v: 90 }, // 6:00
  { t: 420000, v: 105 }, // 7:00
  { t: 480000, v: 120 }, // 8:00
  { t: 540000, v: 138 }, // 9:00
  { t: 570000, v: 145 }, // 9:30
  { t: 600000, v: 150 } // 10:00
];

/**
 * Intervalo entre levas de spawn, por tempo de run (ms -> delay em ms).
 * Acompanha o mesmo espírito da curva de teto (calmo no início, acelera
 * bastante nos últimos 2 minutos), mas separado dela porque é ele quem dá
 * a sensação de "frequência" — sem isso, o jogo só reporia os inimigos
 * mortos devagar mesmo com um teto alto.
 */
const INTERVAL_CURVE = [
  { t: 0, v: 3500 }, // 0:00 — bem espaçado, início tranquilo
  { t: 60000, v: 2600 }, // 1:00
  { t: 120000, v: 2000 }, // 2:00
  { t: 180000, v: 1600 }, // 3:00
  { t: 240000, v: 1300 }, // 4:00
  { t: 300000, v: 1050 }, // 5:00
  { t: 360000, v: 850 }, // 6:00
  { t: 420000, v: 650 }, // 7:00
  { t: 480000, v: 480 }, // 8:00
  { t: 540000, v: 320 }, // 9:00
  { t: 570000, v: 220 }, // 9:30
  { t: 600000, v: 150 } // 10:00 — quase uma leva a cada 1/7 de segundo: caos
];

/**
 * Quantos inimigos cada leva tenta criar, por tempo de run (ms -> qtd).
 * Cresce bem mais devagar que o teto/intervalo — ela só evita que o
 * "déficit" (ver _spawnBatch) precise fazer todo o trabalho sozinho a
 * cada leva; o grosso da sensação de intensidade vem do intervalo menor.
 */
const BATCH_CURVE = [
  { t: 0, v: 2 }, // 0:00
  { t: 120000, v: 3 }, // 2:00
  { t: 300000, v: 4 }, // 5:00
  { t: 480000, v: 5 }, // 8:00
  { t: 540000, v: 6 }, // 9:00
  { t: 600000, v: 8 } // 10:00
];

/**
 * Dono do "quando" e "quantos" da sobrevivência por tempo: cronometra a
 * run e, com base no tempo decorrido, decide a frequência das levas de
 * spawn e quantos inimigos cada leva pede. NÃO sabe nada sobre COMO um
 * inimigo é criado, posicionado ou de que tipo é — isso continua 100% em
 * EnemySpawner.spawnOne() (que também segue sendo quem decide se pode
 * spawnar mais, via setMaxAlive(), e quem garante que todo spawn nasce
 * fora da visão da câmera — ver _findSpawnPosition() lá). Este é só o
 * metrônomo; o spawner é quem toca o instrumento.
 *
 * Inimigos já vivos nunca são tocados aqui — cada leva só ADICIONA novos
 * via spawnOne(), então quem já estava na tela continua vivo normalmente.
 * Também controla, via EnemySpawner.setMaxAlive(), o teto de quantos
 * inimigos podem estar vivos ao mesmo tempo — esse teto cresce com o
 * tempo seguindo CAP_CURVE, então o enxame vai enchendo a tela aos poucos
 * em vez de já nascer lotado no primeiro minuto, e nunca passa de
 * ABSOLUTE_MAX_ALIVE (150), mesmo além dos 10 minutos.
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
    this.enemySpawner.setMaxAlive(CAP_CURVE[0].v);
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

    // Quando o teto sobe bastante entre uma leva e outra, o lote normal
    // (pequeno, pra não sufocar) demoraria muitos ciclos pra alcançar o
    // novo teto — daria a impressão de "poucos inimigos" logo depois da
    // virada. Por isso o tamanho do lote é o maior entre o ritmo normal e
    // o "déficit" até o teto atual: na maior parte do tempo (teto subindo
    // devagar) o déficit é pequeno e quem manda é o ritmo normal; só
    // quando o teto sobe rápido (últimos minutos) é que este lote fica
    // maior por uma ou duas levas, até alcançar o novo teto.
    const deficit = cap - this.enemySpawner.getAliveCount();
    const amount = Math.max(this._currentBatchSize(), deficit);
    for (let i = 0; i < amount; i++) {
      this.enemySpawner.spawnOne(this.getElapsedMs());
    }
  }

  _currentIntervalMs() {
    return Math.round(this._lerpCurve(INTERVAL_CURVE, this.getElapsedMs()));
  }

  _currentBatchSize() {
    return Math.round(this._lerpCurve(BATCH_CURVE, this.getElapsedMs()));
  }

  /**
   * @returns {number} teto de inimigos vivos no momento atual da run,
   * seguindo CAP_CURVE e travado (Math.min) em ABSOLUTE_MAX_ALIVE (150)
   * como segunda garantia, além do próprio último ponto da curva já ser 150.
   */
  _currentMaxAlive() {
    const value = this._lerpCurve(CAP_CURVE, this.getElapsedMs());
    return Math.min(ABSOLUTE_MAX_ALIVE, Math.round(value));
  }

  /**
   * Interpolação linear genérica entre os pontos {t, v} de uma curva
   * (CAP_CURVE, INTERVAL_CURVE ou BATCH_CURVE), todas ordenadas por t
   * crescente. Antes do primeiro ponto, usa o valor do primeiro; depois
   * do último (ex.: run passou de 10:00), trava no valor do último —
   * nunca extrapola pra além do que foi definido.
   */
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
