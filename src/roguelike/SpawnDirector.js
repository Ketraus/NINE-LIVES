// Curva de dificuldade progressiva ao longo dos 10 minutos de run: em vez
// de degraus discretos, três curvas contínuas (teto de vivos, intervalo
// entre levas e tamanho da leva), interpoladas linearmente entre seus
// pontos (ver _lerpCurve()) — suave entre um ponto e outro. Os valores
// vivem em data/spawnCurves.js, não aqui — é lá que se edita.

/**
 * Dono do "quando", "quantos" e "de que tipo" da sobrevivência por tempo:
 * cronometra a run e, com base no tempo decorrido, decide a frequência das
 * levas de spawn, quantos inimigos cada leva pede E os pesos de cada tipo
 * de inimigo na hora do sorteio (ver _currentWeights/data/spawnPhases.js).
 * NÃO sabe nada sobre COMO um inimigo é criado, posicionado ou sorteado de
 * fato — isso continua 100% em EnemySpawner.spawnBatch() (que também segue
 * sendo quem decide se pode spawnar mais, via setMaxAlive(), quem faz o
 * sorteio ponderado a partir dos pesos recebidos, quem garante que todo
 * spawn nasce fora da visão da câmera, e quem agrupa cada leva em pequenos
 * blocos por setor ao redor do jogador — ver EnemySpawner.spawnBatch()).
 * Este é só o metrônomo (e o "roteirista" da composição da horda); o
 * spawner é quem toca o instrumento.
 *
 * Inimigos já vivos nunca são tocados aqui — cada leva só ADICIONA novos
 * via spawnBatch(), então quem já estava na tela continua vivo normalmente.
 * Também controla, via EnemySpawner.setMaxAlive(), o teto de quantos
 * inimigos podem estar vivos ao mesmo tempo — esse teto cresce com o
 * tempo seguindo spawnCurves.capCurve (data/spawnCurves.js), então o
 * enxame vai enchendo a tela aos poucos em vez de já nascer lotado no
 * primeiro minuto, e nunca passa de spawnCurves.absoluteMaxAlive (150),
 * mesmo além dos 10 minutos.
 */
// Fallback de segurança, só usado se GameScene não passar spawnCurves pro
// construtor (ex.: algum código legado/teste) — mesmos valores de
// data/spawnCurves.js. Editar dificuldade é lá, não aqui.
const DEFAULT_SPAWN_CURVES = {
  absoluteMaxAlive: 150,
  capCurve: [{ t: 0, v: 10 }, { t: 600000, v: 150 }],
  intervalCurve: [{ t: 0, v: 3500 }, { t: 600000, v: 150 }],
  batchCurve: [{ t: 0, v: 2 }, { t: 600000, v: 8 }]
};

export default class SpawnDirector {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../entities/enemies/EnemySpawner.js').default} enemySpawner
   * @param {Array} [spawnPhases] - conteúdo de data/spawnPhases.js; pontos
   *   {t, weights} com o peso de cada tipo de inimigo ao longo do tempo de
   *   run (ver _currentWeights). Opcional só por segurança — sem ele, cai
   *   no sorteio uniforme antigo (EnemySpawner.spawnBatch sem weights).
   * @param {Object} [spawnCurves] - conteúdo de data/spawnCurves.js
   *   (absoluteMaxAlive/capCurve/intervalCurve/batchCurve). É AQUI que se
   *   edita teto de vivos, frequência de leva e tamanho de leva — não
   *   direto nesta classe.
   * @param {Array} [sealerSchedule] - conteúdo de data/sealerSchedule.js
   * @param {Array} [eliteSchedule] - conteúdo de data/eliteSchedule.js
   * @param {Object|null} [bossSchedule] - conteúdo de data/bossSchedule.js
   *   ({t}); evento único do Boss (ver _checkBossSchedule) — null desliga
   *   o boss por completo (compat/teste), sem afetar mais nada
   */
  constructor(scene, enemySpawner, spawnPhases = [], spawnCurves = DEFAULT_SPAWN_CURVES, sealerSchedule = [], eliteSchedule = [], bossSchedule = null) {
    this.scene = scene;
    this.enemySpawner = enemySpawner;
    this.spawnPhases = spawnPhases;
    this.spawnCurves = spawnCurves;
    this.startTime = null;
    this.timerEvent = null;
    this.pausedMs = 0; // soma de todo tempo já pausado (tela de cartas), descontado do relógio da run
    this.pauseStartedAt = null; // timestamp de quando a pausa atual começou, ou null se não está pausado

    // Horário manual (data/sealerSchedule.js) de quando o Sealer nasce —
    // ver _checkSealerSchedule. Não usa spawnPhases/sorteio nenhum de
    // propósito (pedido: "não pode dar spawn como os outros... eu tenho
    // que colocar a mão o tempo que ele aparece"). sealerTriggered guarda
    // os ÍNDICES de sealerSchedule já disparados, pra cada horário só
    // tentar nascer uma vez (mesmo que a run passe por ele em vários
    // frames/levas seguidas).
    this.sealerSchedule = sealerSchedule;
    this.sealerTriggered = new Set();

    // Horário manual (data/eliteSchedule.js) de quando o(s) Elite(s)
    // nascem — mesmo espírito do Sealer acima, mas cada entrada é
    // {t, count} (quantidade própria por aparição) e sem restrição de "só
    // 1 vivo por vez" (ver _checkEliteSchedule). Nunca entra no sorteio
    // automático de spawnPhases porque simplesmente não tem peso definido
    // em nenhuma fase — só nasce por aqui.
    this.eliteSchedule = eliteSchedule;
    this.eliteTriggered = new Set();

    // Evento único do Boss (data/bossSchedule.js, {t}) — "primeiro e
    // único" (pedido), por isso é só um horário, não uma lista como
    // sealer/elite acima. bossTriggered garante que só dispara uma vez
    // mesmo passando por vários frames depois do horário.
    this.bossSchedule = bossSchedule;
    this.bossTriggered = false;

    // Cheat (DevConsole "autospawn"): true = levas automáticas continuam
    // sendo agendadas normalmente (_scheduleNextBatch/timerEvent), mas
    // _spawnBatch() não chama enemySpawner.spawnBatch() enquanto isto for
    // false — só spawns manuais (cheat "spawn", ver EnemySpawner.
    // spawnByDefId) continuam criando inimigos. Não pausa o relógio da
    // run nem o teto de vivos (setMaxAlive ainda roda), só a criação.
    this.autoSpawnEnabled = true;
  }

  /**
   * scene.time.now só é atualizado depois do 1º ciclo de update da cena
   * (fica travado em 0 antes disso) — na criação da GameScene (ou logo
   * após o boot), ler scene.time.now aqui pegava esse 0 como startTime,
   * fazendo getElapsedMs() nascer já "adiantado" pelo tempo real gasto em
   * Boot/Preload/Menu (daí o cronômetro começar em valores aleatórios tipo
   * 05:00). game.loop.time é o relógio bruto do jogo, sempre atualizado.
   */
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
    this.pauseStartedAt = this._now();
  }

  /** Retoma o relógio da run (tela de cartas fechada). */
  resume() {
    if (this.pauseStartedAt == null) return;
    this.pausedMs += this._now() - this.pauseStartedAt;
    this.pauseStartedAt = null;
  }

  /** @returns {number} milissegundos de run decorridos, sem contar tempo pausado (0 se ainda não iniciou) */
  getElapsedMs() {
    if (this.startTime == null) return 0;
    const now = this._now();
    const currentPauseMs = this.pauseStartedAt != null ? now - this.pauseStartedAt : 0;
    return now - this.startTime - this.pausedMs - currentPauseMs;
  }

  /**
   * Cheat (DevConsole "settime"): ajusta o relógio da run pra um tempo
   * decorrido específico, sem mexer em pausedMs/pauseStartedAt — só
   * recalcula startTime pra que getElapsedMs() passe a devolver targetMs
   * a partir de agora. Afeta tudo que lê getElapsedMs() (as curvas de
   * data/spawnCurves.js aqui, minSpawnTimeMs dos inimigos em
   * EnemySpawner, e a checagem de vitória aos 10:00 em GameScene) — é
   * assim que dá pra pular direto pro fim do jogo (ou voltar pro início)
   * pra testar.
   */
  setElapsedMs(targetMs) {
    const now = this._now();
    const currentPauseMs = this.pauseStartedAt != null ? now - this.pauseStartedAt : 0;
    this.startTime = now - this.pausedMs - currentPauseMs - Math.max(0, targetMs);
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

    // Sealer nasce SEMPRE por horário manual, nunca pelo sorteio normal
    // abaixo (ver data/sealerSchedule.js) — checado mesmo com autospawn
    // desligado, é um script à parte.
    this._checkSealerSchedule();

    // Elite também é checado sempre, mesmo com autospawn desligado —
    // igual ao Sealer, é um script manual à parte do sorteio automático,
    // não algo que o cheat "autospawn" deveria conseguir travar.
    this._checkEliteSchedule();

    // Boss também é checado sempre, mesmo com autospawn desligado — evento
    // único, à parte de tudo o mais (ver _checkBossSchedule).
    this._checkBossSchedule();

    if (!this.autoSpawnEnabled) return; // cheat "autospawn" desligado: só spawn manual (ver toggleAutoSpawn)

    // Arena do Sealer ativa: NINGUÉM mais nasce até ele morrer (ou a
    // horda squeeze fica impossível de sobreviver, pedido: "chato, mas
    // não quebrado"). Só pausa a criação — quem já estava vivo antes
    // continua normal, sendo empurrado/contido pela arena igual a todo
    // mundo (ver Enemy._updateArena).
    if (this.enemySpawner.hasActiveSealer()) return;

    // Quando o teto sobe bastante entre uma leva e outra, o lote normal
    // (pequeno, pra não sufocar) demoraria muitos ciclos pra alcançar o
    // novo teto — daria a impressão de "poucos inimigos" logo depois da
    // virada. Por isso o tamanho do lote é o maior entre o ritmo normal e
    // o "déficit" até o teto atual: na maior parte do tempo (teto subindo
    // devagar) o déficit é pequeno e quem manda é o ritmo normal; só
    // quando o teto sobe rápido (últimos minutos) é que este lote fica
    // maior por uma ou duas levas, até alcançar o novo teto.
    // Deficit limitado a 2x o lote normal: sem isso, o catch-up após a
    // arena do Sealer (que segura os spawns por até 40s) descarrega o
    // déficit inteiro numa leva só, artificial. Assim ele ainda recupera
    // rápido, só que em 2-3 levas em vez de uma explosão.
    const deficit = cap - this.enemySpawner.getAliveCount();
    const batchSize = this._currentBatchSize();
    const amount = Math.max(batchSize, Math.min(deficit, batchSize * 2));
    // a fase atual (pesos por tipo, ver _currentWeights) é escolhida uma
    // vez por leva e vale pra todos os inimigos dela — evita recalcular a
    // mesma interpolação `amount` vezes seguidas
    const weights = this._currentWeights();
    // spawnBatch (não mais um loop de spawnOne aqui) é quem decide COMO
    // esses `amount` inimigos chegam — agrupados em pequenos blocos, cada
    // um nascendo de um lado ao redor do jogador (ver EnemySpawner.
    // spawnBatch); esta classe continua só decidindo QUANTOS.
    this.enemySpawner.spawnBatch(amount, this.getElapsedMs(), weights);
  }

  /** Cheat (DevConsole "autospawn"): liga/desliga as levas automáticas
   * (ver guard em _spawnBatch); "spawn <id>" manual continua funcionando
   * sempre, independente deste estado. */
  toggleAutoSpawn() {
    this.autoSpawnEnabled = !this.autoSpawnEnabled;
    return this.autoSpawnEnabled;
  }

  /**
   * Dispara o spawn do Sealer nos horários fixos de data/sealerSchedule.js
   * (não é sorteio — é script). Cada índice da lista só é tentado uma vez
   * (sealerTriggered); spawnByDefId já recusa sozinho se algum Sealer
   * ainda estiver vivo (ver EnemySpawner.hasActiveSealer), então mesmo que
   * dois horários caiam perto um do outro, nunca nasce um segundo em cima
   * do primeiro.
   */
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

  /**
   * Dispara o spawn do Elite nos horários fixos de data/eliteSchedule.js
   * (script, não sorteio). Cada entrada só é tentada uma vez
   * (eliteTriggered guarda os ÍNDICES já disparados), e cada uma spawna
   * exatamente `count` Elites de uma vez via
   * EnemySpawner.spawnByDefId('elite', count) — sem checar se já existe
   * Elite vivo (diferente do Sealer): podem coexistir vários.
   */
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

  /**
   * Dispara o evento do Boss no horário fixo de data/bossSchedule.js
   * (script, não sorteio) — uma vez só (bossTriggered), sem lista de
   * índices como sealer/elite porque só existe um evento. Quando o tempo
   * bate: manda todo mundo que estiver vivo agora fugir da tela
   * (EnemySpawner.fleeAll) e, na sequência, nasce o Minotauro
   * (spawnByDefId('minotaur', 1)) — bem simples de propósito por agora,
   * sem pausar o spawn normal nem nada além disso.
   */
  _checkBossSchedule() {
    if (!this.bossSchedule || this.bossTriggered) return;
    if (this.getElapsedMs() >= this.bossSchedule.t) {
      this.bossTriggered = true;
      this.enemySpawner.fleeAll();
      this.enemySpawner.spawnByDefId('minotaur', 1);
    }
  }

  _currentIntervalMs() {
    return Math.round(this._lerpCurve(this.spawnCurves.intervalCurve, this.getElapsedMs()));
  }

  _currentBatchSize() {
    return Math.round(this._lerpCurve(this.spawnCurves.batchCurve, this.getElapsedMs()));
  }

  /**
   * Escolhe a fase atual da horda: interpola os pesos por id de inimigo
   * entre os dois pontos de spawnPhases (data/spawnPhases.js) que cercam o
   * tempo decorrido, igual em espírito ao _lerpCurve (suave, sem degraus),
   * mas por objeto {id: peso} em vez de um número só — um id ausente num
   * dos dois pontos entra com peso 0 nele (ainda não "chegou" ou já não
   * existe mais nessa fase). Antes do primeiro ponto ou depois do último,
   * usa os pesos daquele ponto direto, sem interpolar.
   * @returns {Object<string, number>|null} pesos por id de inimigo, ou
   *   null se não houver spawnPhases configuradas (EnemySpawner cai pro
   *   sorteio uniforme antigo nesse caso)
   */
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

  /**
   * @returns {number} teto de inimigos vivos no momento atual da run,
   * seguindo spawnCurves.capCurve e travado (Math.min) em
   * spawnCurves.absoluteMaxAlive como segunda garantia, além do próprio
   * último ponto da curva já bater com esse valor.
   */
  _currentMaxAlive() {
    const value = this._lerpCurve(this.spawnCurves.capCurve, this.getElapsedMs());
    return Math.min(this.spawnCurves.absoluteMaxAlive, Math.round(value));
  }

  /**
   * Interpolação linear genérica entre os pontos {t, v} de uma curva
   * (capCurve, intervalCurve ou batchCurve, de data/spawnCurves.js), todas ordenadas por t
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
