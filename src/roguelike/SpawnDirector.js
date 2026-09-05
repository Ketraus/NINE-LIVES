// Curva de dificuldade progressiva ao longo dos 10 minutos de run: em vez
// de degraus discretos, três curvas contínuas (teto de vivos, intervalo
// entre levas e tamanho da leva), interpoladas linearmente entre seus
// pontos (ver _lerpCurve()) — suave entre um ponto e outro. Os valores
// vivem em data/spawnCurves.js, não aqui — é lá que se edita.
import MusicManager from '../systems/MusicManager.js';

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

// Entrada do Boss (evento único, ver _checkBossSchedule): depois de todo
// mundo fugir, espera a tela ficar REALMENTE vazia (ver
// _waitForEmptyScreenThenBuildup — fugir ainda leva um tempinho até sair
// de vista, não é instantâneo) e só ENTÃO conta BOSS_SILENCE_MS de
// silêncio antes do flash + vibração + o Minotauro nascer de verdade.
const BOSS_SILENCE_MS = 6000;
// Intervalo de checagem "a tela já esvaziou?" depois da fuga — polling
// próprio, rápido, em vez de amarrado ao intervalo de leva normal
// (spawnCurves.intervalCurve, que varia e pode passar de 1s de folga).
const BOSS_EMPTY_SCREEN_POLL_MS = 200;
// Escurecimento gradual da tela pro PRETO (pedido — era vermelho antes)
// durante o silêncio (ver _startBossTensionBuildup) — sobe até este alpha
// ao longo de todo BOSS_SILENCE_MS, e é cortado na hora quando o flash
// estoura.
const BOSS_OVERLAY_COLOR = 0x000000;
const BOSS_OVERLAY_MAX_ALPHA = 0.55;
// Tremores CRESCENTES tipo batimento cardíaco espalhados pelos 6s de
// silêncio (índice a índice com BOSS_HEARTBEAT_INTENSITIES) — tempos em
// ms a partir do INÍCIO do silêncio (que só começa a contar com a tela já
// vazia, ver acima), não do fim. Mais pulsos que antes (eram só 4, perto
// do fim de um silêncio de 3s) pra preencher o silêncio bem mais longo
// sem deixar um vazio no meio — vai acelerando/intensificando de
// verdade conforme se aproxima do fim, como um coração disparando.
const BOSS_HEARTBEAT_TIMES_MS = [2500, 3600, 4400, 5000, 5450, 5750];
const BOSS_HEARTBEAT_INTENSITIES = [0.003, 0.005, 0.007, 0.009, 0.011, 0.014];
const BOSS_HEARTBEAT_SHAKE_MS = 130;
// Flash branco na tela inteira (Phaser Camera FX nativo) — dura pouco de
// propósito, é só o "clarão" do instante, não um fade longo.
const BOSS_FLASH_MS = 350;
// Vibração da entrada — reduzida de 0.02 pra 0.016 (era forte demais em
// cima do pop de escala do Minotauro entrando, ficava "tremido"/bugado
// em vez de impactante; ver também a curva sem overshoot em
// EnemySpawner._playBossEntranceFx).
const BOSS_FLASH_SHAKE_MS = 400;
const BOSS_FLASH_SHAKE_INTENSITY = 0.016;
// Hitstop: física do jogo congela por este tanto de tempo bem no auge do
// flash, antes do Minotauro nascer — dá peso ao momento (padrão comum em
// jogo de ação). Curto de propósito: sente-se o "soco", não trava o jogo.
const BOSS_HITSTOP_MS = 130;

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
    // mesmo passando por vários frames depois do horário. bossHasSpawned
    // vira true quando o Minotauro nasce de verdade (ver
    // _triggerBossEntrance) — junto com bossTriggered, é o que
    // _isBossEncounterActive() usa pra saber se ainda está "no meio do
    // evento" (esperando a tela esvaziar, no silêncio, ou o boss vivo) ou
    // se já era (nasceu e morreu) — spawn automático só volta no último
    // caso.
    this.bossSchedule = bossSchedule;
    this.bossTriggered = false;
    this.bossHasSpawned = false;
    this._bossMusicRestoreDone = false;

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
    // idem: música só volta quando o Minotauro morrer de verdade (ver
    // _checkBossMusicRestore) — não é sorteio nem spawn, então também
    // roda sempre, autospawn ligado ou não.
    this._checkBossMusicRestore();

    if (!this.autoSpawnEnabled) return; // cheat "autospawn" desligado: só spawn manual (ver toggleAutoSpawn)

    // Arena do Sealer ativa: NINGUÉM mais nasce até ele morrer (ou a
    // horda squeeze fica impossível de sobreviver, pedido: "chato, mas
    // não quebrado"). Só pausa a criação — quem já estava vivo antes
    // continua normal, sendo empurrado/contido pela arena igual a todo
    // mundo (ver Enemy._updateArena).
    if (this.enemySpawner.hasActiveSealer()) return;

    // Boss (Minotauro): trava TODO spawn automático desde o instante do
    // gatilho (esperando a tela esvaziar, durante o silêncio, e enquanto
    // ele estiver vivo) até ele nascer E morrer — ver
    // _isBossEncounterActive(). Spawn manual (cheat "spawn" do
    // DevConsole) continua funcionando, pois chama
    // enemySpawner.spawnByDefId direto, sem passar por _spawnBatch/este
    // guard.
    if (this._isBossEncounterActive()) return;

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
   * índices como sealer/elite porque só existe um evento. Sequência:
   * todo mundo foge JÁ -> espera a tela ficar REALMENTE vazia (fugir
   * ainda leva um tempinho, ver _waitForEmptyScreenThenBuildup) ->
   * BOSS_SILENCE_MS de tela preta escurecendo aos poucos, com tremores
   * crescentes tipo batimento cardíaco perto do fim (ver
   * _startBossTensionBuildup) -> flash + vibração + hitstop (jogo
   * congela um instante, ver _triggerBossEntrance) -> só ENTÃO o
   * Minotauro nasce, com entrada em pop de escala + onda de choque (ver
   * EnemySpawner._playBossEntranceFx).
   */
  _checkBossSchedule() {
    if (!this.bossSchedule || this.bossTriggered) return;
    if (this.getElapsedMs() >= this.bossSchedule.t) {
      this.bossTriggered = true;
      this.enemySpawner.fleeAll();
      this._waitForEmptyScreenThenBuildup();
    }
  }

  /** true desde o instante do gatilho do Boss até ele nascer E morrer —
   * cobre a espera da tela esvaziar, o silêncio E ele vivo, tudo como um
   * período só em que o spawn automático (_spawnBatch) fica travado.
   * Volta a false só depois que ele já nasceu (bossHasSpawned) e não está
   * mais vivo (ou seja, morreu) — spawn automático normal retoma aí. */
  _isBossEncounterActive() {
    if (!this.bossTriggered) return false;
    if (this.enemySpawner.hasActiveBoss()) {
      this.bossHasSpawned = true;
      return true;
    }
    return !this.bossHasSpawned;
  }

  /** Depois de mandar todo mundo fugir (Enemy.flee não é instantâneo, ver
   * FLEE_* em Enemy.js), fica de olho num polling próprio e rápido
   * (BOSS_EMPTY_SCREEN_POLL_MS, não amarrado ao intervalo de leva normal,
   * que varia e pode passar de 1s) até a tela ficar de fato sem nenhum
   * inimigo — só ENTÃO começa a contar o silêncio (pedido: escurecer só
   * quando ficar vazio, não no instante do gatilho). */
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

  /** Começo do silêncio de verdade (tela já vazia): escurece a tela
   * inteira pro PRETO aos poucos (retângulo fixo na câmera, bem maior que
   * a view pra nunca deixar borda sobrando mesmo com zoom) e agenda
   * tremores CRESCENTES perto do fim do silêncio (BOSS_HEARTBEAT_TIMES_MS/
   * INTENSITIES, emparelhados por índice) — a ideia é a tensão ir subindo
   * até estourar no flash. */
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
    // ritmo do escurecimento acima — mesma duração, mesmo easing
    MusicManager.duckForBoss(this.scene, BOSS_SILENCE_MS);

    BOSS_HEARTBEAT_TIMES_MS.forEach((t, i) => {
      this.scene.time.delayedCall(t, () => {
        this.scene.cameras.main.shake(BOSS_HEARTBEAT_SHAKE_MS, BOSS_HEARTBEAT_INTENSITIES[i]);
      });
    });
  }

  /** Fim do silêncio: corta o escurecimento na hora (contraste forte com
   * o flash branco que vem em seguida), flash + vibração e um HITSTOP
   * curto (física do jogo congela por BOSS_HITSTOP_MS — padrão comum em
   * jogo de ação pra dar peso a um golpe/entrada) antes do Minotauro
   * nascer de verdade. Nunca nasce antes do flash (pedido). */
  _triggerBossEntrance() {
    this.bossOverlay?.destroy();
    this.bossOverlay = null;

    const cam = this.scene.cameras.main;
    cam.flash(BOSS_FLASH_MS, 255, 255, 255);
    cam.shake(BOSS_FLASH_SHAKE_MS, BOSS_FLASH_SHAKE_INTENSITY);
    // som grave/impacto gigantesco bem no instante do flash — reaproveita
    // a explosão já pronta do Cyberus (grave e pesada), sem precisar de
    // asset novo
    this.scene.sound.play('sfx_cyberus_explosion', { volume: 0.9 });

    this.scene.physics.world.pause();
    this.scene.time.delayedCall(BOSS_HITSTOP_MS, () => {
      this.scene.physics.world.resume();
      this.enemySpawner.spawnByDefId('minotaur', 1);
      // música NÃO volta aqui — fica parada (silêncio) durante toda a
      // luta contra o Minotauro; só retorna quando ele morrer de verdade
      // (ver _checkBossMusicRestore). Uma trilha própria de luta contra
      // boss pode entrar aqui no futuro, no lugar deste silêncio.
    });
  }

  /** Música (ducked em _startBossTensionBuildup) só volta quando o
   * Minotauro morre de verdade — checa todo frame, junto do resto dos
   * scripts do Boss, e dispara só uma vez (_bossMusicRestoreDone). */
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
