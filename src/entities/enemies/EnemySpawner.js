import Enemy from './Enemy.js';
import SwarmSystem from './SwarmSystem.js';

const DEFAULT_MAX_ALIVE = 14; // trava inicial da quantidade simultânea, até o SpawnDirector assumir o controle via setMaxAlive()
// Quanto além da borda da câmera o inimigo precisa nascer pra garantir que
// nasce "fora da visão" (nunca literalmente colado na borda, senão dá pra
// ver ele aparecer do nada). Ver _findSpawnPosition().
const SPAWN_MARGIN_BEYOND_VIEW = 80;

// Fatias de 360° ao redor do jogador usadas pra decidir "de que lado" cada
// grupo de spawn nasce (ver _pickSector/_sectorOccupancy) — granularidade
// dos "setores", não um raio fixo.
const SPAWN_SECTOR_COUNT = 8;
// Quanto espalhar o ângulo de cada inimigo DENTRO do grupo (pra não nascer
// todo mundo grudado no mesmo pixel), em graus — menor que o tamanho de um
// setor (360/SPAWN_SECTOR_COUNT = 45°) de propósito, senão o grupo vazaria
// pro setor vizinho e a ideia de "setor" perderia sentido. Ver
// _findSpawnPosition(baseAngle).
const GROUP_SPREAD_DEG = 18;
// Tamanhos possíveis de um grupo de spawn e o peso relativo de cada um no
// sorteio (ver _pickGroupSize) — pequenos mais comuns que grandes, mas
// todos possíveis; dá pra adicionar mais tamanhos aqui sem mexer em mais
// nada ("variando entre 1, 3, 6 etc.", pedido do usuário).
const GROUP_SIZE_WEIGHTS = [
  { size: 1, weight: 5 },
  { size: 3, weight: 3 },
  { size: 6, weight: 1 }
];

/**
 * Responsável só por CRIAR inimigos: escolhe o tipo, acha uma posição fora
 * da visão da câmera e instancia. Não decide quando nem quantos spawnar —
 * isso é papel do SpawnDirector (ver src/roguelike/SpawnDirector.js), que
 * chama spawnBatch() quantas vezes quiser, quando quiser, e também
 * controla o teto de inimigos vivos via setMaxAlive() (ex.: crescendo com
 * o tempo de run). Spawna sempre fora do que a câmera está mostrando no
 * momento — não em qualquer ponto do mapa. Isso é o que permite o mapa
 * ser gigante sem os inimigos nascerem longe demais pra chegar perto do
 * jogador (spawn "em qualquer lugar do mapa" só funciona bem em mapas
 * pequenos, do tamanho da tela). Hoje só usa um tipo ("grunt"); a leitura
 * de enemies.js já deixa pronto suportar múltiplos tipos/waves no futuro
 * sem mudar a API.
 *
 * spawnBatch() também decide COMO cada leva chega: em vez de espalhar
 * cada inimigo num ângulo individual aleatório (esfera uniforme), agrupa
 * a leva em pequenos blocos (ver GROUP_SIZE_WEIGHTS) que nascem juntos
 * num mesmo setor ao redor do jogador (ver _pickSector/SPAWN_SECTOR_COUNT),
 * enviesado pros setores menos ocupados agora — sem forçar equilíbrio
 * perfeito, então concentração ainda acontece por acaso. NÃO mexe em
 * como os inimigos se comportam depois de nascer (isso é 100% do
 * SwarmSystem, ver updateAll()).
 */
export default class EnemySpawner {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../../maps/MapManager.js').default} mapManager
   * @param {Player} player
   * @param {Array} enemyDefs - conteúdo de data/enemies.js
   * @param {Object} [flockingConfig] - conteúdo de data/flockingConfig.js,
   *   repassado pro SwarmSystem (comportamento de enxame, ver updateAll)
   */
  constructor(scene, mapManager, player, enemyDefs, flockingConfig) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.player = player;
    this.enemyDefs = enemyDefs;
    this.maxAlive = DEFAULT_MAX_ALIVE;
    this.swarmSystem = new SwarmSystem(flockingConfig);

    this.group = scene.physics.add.group({ runChildUpdate: false });

    // Freeze (cheat "freeze" do DevConsole, F9): true = inimigos param no
    // lugar (chase() não roda), mas o resto do jogo continua normal — o
    // jogador ainda se move/ataca, e um inimigo congelado ainda pode levar
    // dano ou até morrer normalmente, só não persegue nem anda.
    this.frozen = false;
  }

  /** Muda o teto de inimigos vivos simultaneamente. Chamado pelo SpawnDirector. */
  setMaxAlive(value) {
    this.maxAlive = value;
  }

  /** @returns {number} quantos inimigos estão vivos agora. */
  getAliveCount() {
    return this.group.countActive(true);
  }

  /**
   * Cria um inimigo agora, se houver espaço (respeita maxAlive), num ângulo
   * TOTALMENTE aleatório ao redor do jogador. Chamado pelo SpawnDirector —
   * quantas vezes e com que frequência é decisão dele, não deste método.
   * Fica de fora do agrupamento por setor de spawnBatch() de propósito —
   * é o spawn "avulso" (usado por quem quiser um inimigo sem se importar
   * com de que lado ele vem); pra hordas em grupo, ver spawnBatch().
   * @param {number} [nowMs] - tempo decorrido de run (SpawnDirector.getElapsedMs());
   *   usado só como fallback (filtro por `def.minSpawnTimeMs`) quando `weights` não é passado
   * @param {Object<string, number>|null} [weights] - pesos por id de
   *   inimigo pra esta leva (SpawnDirector._currentWeights, vindo de
   *   data/spawnPhases.js). Se vier null/vazio, cai no sorteio uniforme
   *   antigo filtrado por minSpawnTimeMs — mantém o spawner funcionando
   *   mesmo sem fases configuradas.
   * @returns {Enemy|null}
   */
  spawnOne(nowMs = 0, weights = null) {
    return this._spawnOneAt(nowMs, weights, null);
  }

  /**
   * Spawna até `amount` inimigos de uma leva, divididos em pequenos GRUPOS
   * (tamanhos sorteados em GROUP_SIZE_WEIGHTS — 1, 3, 6 etc.), cada grupo
   * nascendo inteiro num mesmo setor ao redor do jogador (ver _pickSector:
   * setores menos ocupados agora têm mais chance, mas NUNCA chance zero —
   * então grupos seguidos ainda podem calhar do mesmo lado por acaso, não
   * é uma distribuição perfeitamente equilibrada). Troca o "chuvisco" de
   * inimigos nascendo em ângulos individuais aleatórios (esfera uniforme)
   * por hordas chegando em blocos, de direções variadas e com viés pros
   * lados mais vazios — usado pelo SpawnDirector no lugar do loop de
   * spawnOne() que existia antes. Não muda QUANTOS nascem no total (isso
   * continua 100% do SpawnDirector) nem como cada um se move depois
   * (SwarmSystem) — só COMO e ONDE eles chegam.
   * @param {number} amount - total de inimigos a tentar spawnar nesta leva
   * @param {number} [nowMs] - ver spawnOne
   * @param {Object<string, number>|null} [weights] - ver spawnOne
   * @returns {number} quantos de fato nasceram (pode ser menos que amount, se bateu no maxAlive)
   */
  spawnBatch(amount, nowMs = 0, weights = null) {
    let spawned = 0;
    while (spawned < amount) {
      const groupSize = Math.min(this._pickGroupSize(), amount - spawned);
      const sectorAngle = this._sectorCenterAngle(this._pickSector());

      for (let i = 0; i < groupSize; i++) {
        const enemy = this._spawnOneAt(nowMs, weights, sectorAngle);
        if (!enemy) return spawned; // maxAlive atingido (ou nenhum def disponível) — leva encerra aqui
        spawned += 1;
      }
    }
    return spawned;
  }

  /** Núcleo compartilhado por spawnOne/spawnBatch: escolhe o tipo, acha
   * posição (opcionalmente enviesada por `baseAngle`, ver
   * _findSpawnPosition) e cria, respeitando maxAlive. */
  _spawnOneAt(nowMs, weights, baseAngle) {
    if (this.group.countActive(true) >= this.maxAlive) return null;

    const def = weights ? this._pickWeighted(weights) : this._pickUniform(nowMs);
    if (!def) return null;
    const pos = def.sealer ? this._findSealerSpawnPosition(def) : this._findSpawnPosition(baseAngle);
    return this._createAt(def, pos);
  }

  /** Tamanho de grupo sorteado a partir de GROUP_SIZE_WEIGHTS (roleta ponderada). */
  _pickGroupSize() {
    const total = GROUP_SIZE_WEIGHTS.reduce((sum, g) => sum + g.weight, 0);
    let roll = Phaser.Math.FloatBetween(0, total);
    for (const g of GROUP_SIZE_WEIGHTS) {
      if (roll < g.weight) return g.size;
      roll -= g.weight;
    }
    return GROUP_SIZE_WEIGHTS[GROUP_SIZE_WEIGHTS.length - 1].size; // sobra de arredondamento
  }

  /**
   * Conta quantos inimigos vivos existem em cada setor angular ao redor do
   * jogador agora (setor 0 = eixo +X do jogador, sentido horário, fatias
   * de 360°/SPAWN_SECTOR_COUNT). É "ocupação" no sentido de "quanta gente
   * já vindo daquele lado", não histórico de onde já nasceu spawn antes.
   */
  _sectorOccupancy() {
    const counts = new Array(SPAWN_SECTOR_COUNT).fill(0);
    const sectorSize = (Math.PI * 2) / SPAWN_SECTOR_COUNT;
    this.group.getChildren().forEach((enemy) => {
      if (!enemy.active) return;
      const angle = Phaser.Math.Angle.Normalize(
        Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y)
      );
      const sector = Math.min(SPAWN_SECTOR_COUNT - 1, Math.floor(angle / sectorSize));
      counts[sector] += 1;
    });
    return counts;
  }

  /**
   * Sorteia o setor onde o próximo grupo nasce, enviesado pros menos
   * ocupados agora (ver _sectorOccupancy) SEM zerar a chance dos mais
   * cheios — o setor mais ocupado ainda cai no piso (peso 1), nunca fica
   * de fora do sorteio. É só um viés (não um round-robin forçado): ainda
   * dá pra dois grupos seguidos calharem do mesmo lado por acaso, o que é
   * o "concentração ainda deve ser possível" pedido — só reduz a CHANCE
   * de ficar sempre voltando pro mesmo lado enquanto os outros ficam vazios.
   */
  _pickSector() {
    const counts = this._sectorOccupancy();
    const maxCount = Math.max(...counts, 0);
    const weights = counts.map((count) => 1 + (maxCount - count));

    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Phaser.Math.FloatBetween(0, total);
    for (let i = 0; i < weights.length; i++) {
      if (roll < weights[i]) return i;
      roll -= weights[i];
    }
    return weights.length - 1; // sobra de arredondamento
  }

  /** Ângulo (radianos) do meio do setor `sector` — usado como `baseAngle`
   * de _findSpawnPosition pra todo mundo de um mesmo grupo nascer perto
   * dali (com o espalhamento de GROUP_SPREAD_DEG). */
  _sectorCenterAngle(sector) {
    const sectorSize = (Math.PI * 2) / SPAWN_SECTOR_COUNT;
    return sector * sectorSize + sectorSize / 2;
  }

  /**
   * Sorteio ponderado: cada id em `weights` com peso > 0 entra na roleta
   * proporcional ao seu valor (não precisa somar 100 — é tudo relativo ao
   * total). Ids com peso 0/ausente ou que não existem em enemyDefs não
   * entram no sorteio.
   */
  _pickWeighted(weights) {
    const entries = this.enemyDefs
      .map((def) => ({ def, weight: weights[def.id] ?? 0 }))
      .filter((e) => e.weight > 0)
      // Sealer é único: se já existe um vivo, ele nem entra no sorteio
      // desta leva (ver _hasActiveSealer) — regra pedida: nunca mais de
      // 1 ao mesmo tempo.
      .filter((e) => !e.def.sealer || !this._hasActiveSealer());
    if (entries.length === 0) return null;

    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let roll = Phaser.Math.FloatBetween(0, total);
    for (const entry of entries) {
      if (roll < entry.weight) return entry.def;
      roll -= entry.weight;
    }
    return entries[entries.length - 1].def; // sobra de arredondamento de ponto flutuante
  }

  /** Sorteio antigo (uniforme, filtrado por minSpawnTimeMs) — só usado quando não há spawnPhases. */
  _pickUniform(nowMs) {
    const availableDefs = this.enemyDefs.filter((def) =>
      (!def.minSpawnTimeMs || nowMs >= def.minSpawnTimeMs) &&
      (!def.sealer || !this._hasActiveSealer())
    );
    return Phaser.Utils.Array.GetRandom(availableDefs.length > 0 ? availableDefs : this.enemyDefs);
  }

  /** true se já existe um Sealer vivo agora — usado por _pickWeighted/
   * _pickUniform/spawnByDefId pra nunca deixar existir mais de 1 ao
   * mesmo tempo (regra pedida). */
  _hasActiveSealer() {
    return this.group.getChildren().some((e) => e.active && e.def.sealer);
  }

  /**
   * Cria de fato um Enemy num ponto e registra ele no grupo/colisor —
   * extraído de spawnOne pra ser reaproveitado por spawnByDefId (cheat
   * "spawn" do DevConsole, F9), que escolhe o tipo na mão em vez de
   * sortear e ignora o teto de maxAlive de propósito (é um comando
   * explícito do testador, não o SpawnDirector automático).
   */
  _createAt(def, pos) {
    const enemy = new Enemy(this.scene, pos.x, pos.y, def);
    this.group.add(enemy);
    this.mapManager.addCollider(enemy);
    return enemy;
  }

  /**
   * Cheat (DevConsole "spawn <inimigoId> [quantidade]"): cria `count`
   * inimigos de um tipo específico, ignorando `minSpawnTimeMs` e o teto
   * `maxAlive` (é um pedido explícito do testador). Usa a mesma lógica de
   * posição fora da câmera que o spawn normal (_findSpawnPosition), então
   * eles aparecem "de fora da tela" como qualquer inimigo, só que do tipo
   * pedido.
   * @returns {number} quantos foram de fato criados
   */
  spawnByDefId(defId, count = 1) {
    const def = this.enemyDefs.find((d) => d.id === defId);
    if (!def) return 0;
    if (def.sealer && this._hasActiveSealer()) return 0; // já tem um vivo — cheat também respeita a regra
    const n = Math.max(1, Math.floor(count));
    for (let i = 0; i < n; i++) {
      this._createAt(def, def.sealer ? this._findSealerSpawnPosition(def) : this._findSpawnPosition());
    }
    return n;
  }

  /**
   * Posição de spawn exclusiva do Sealer: diferente de todo mundo (que
   * nasce fora da câmera, ver _findSpawnPosition), ele PRECISA nascer
   * dentro do raio que a própria arena vai ter (def.arenaStartRadius,
   * centrada no jogador — ver Enemy._updateArena) — nunca fora dela, por
   * mais que o mapa permita. Sorteia um ponto a uma distância segura do
   * jogador (não colado, mas bem dentro do raio) e, se o mapa/paredes não
   * permitirem esse ponto exato, tenta de novo; no pior caso cai bem perto
   * do jogador (ainda garantidamente dentro do raio).
   */
  _findSealerSpawnPosition(def) {
    const bounds = this.mapManager.getWorldBounds();
    const margin = 64;
    // entre 55% e 85% do raio inicial — visível, mas nunca na borda exata
    // nem em cima do jogador
    const safeDist = def.arenaStartRadius * Phaser.Math.FloatBetween(0.55, 0.85);
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    return {
      x: Phaser.Math.Clamp(this.player.x + Math.cos(angle) * safeDist, margin, bounds.width - margin),
      y: Phaser.Math.Clamp(this.player.y + Math.sin(angle) * safeDist, margin, bounds.height - margin)
    };
  }

  /**
   * Cheat (DevConsole "killall"): mata todos os inimigos vivos AGORA,
   * chamando o mesmo Enemy.die() do fluxo normal — dá XP e conta kill
   * normalmente, só acontece tudo de uma vez. Copia a lista antes de
   * iterar porque die()/destroy() remove o inimigo do grupo, o que
   * bagunçaria uma iteração direta sobre group.getChildren().
   * @returns {number} quantos inimigos foram eliminados
   */
  killAll() {
    const alive = this.group.getChildren().filter((e) => e.active);
    alive.forEach((enemy) => enemy.die());
    return alive.length;
  }

  /**
   * Escolhe um ponto fora da área visível da câmera, ao redor do jogador.
   * `worldView` é o retângulo (em coordenadas do mundo, não da tela) que a
   * câmera está mostrando agora — muda sozinho conforme o jogador anda,
   * então isto funciona igual em mapa pequeno ou gigante, sem precisar
   * saber o tamanho total do mapa pra decidir a distância de spawn.
   * @param {number|null} [baseAngle] - se null (spawnOne avulso), ângulo
   *   totalmente aleatório, igual ao comportamento antigo. Se vier um
   *   ângulo (radianos, ver spawnBatch/_sectorCenterAngle), sorteia perto
   *   dali (± GROUP_SPREAD_DEG) em vez de em qualquer direção — é assim
   *   que todo mundo de um mesmo grupo nasce no mesmo "lado" sem nascer
   *   literalmente empilhado no mesmo pixel.
   */
  _findSpawnPosition(baseAngle = null) {
    const bounds = this.mapManager.getWorldBounds();
    const margin = 64; // nunca nasce colado na borda do mapa
    const view = this._currentCameraView();
    // metade da diagonal da câmera + margem: distância mínima do jogador
    // que garante nascer fora da tela não importa o ângulo sorteado
    const minDist = Math.hypot(view.width, view.height) / 2 + SPAWN_MARGIN_BEYOND_VIEW;
    const spreadRad = Phaser.Math.DegToRad(GROUP_SPREAD_DEG);

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = baseAngle == null
        ? Phaser.Math.FloatBetween(0, Math.PI * 2)
        : baseAngle + Phaser.Math.FloatBetween(-spreadRad, spreadRad);
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * minDist, margin, bounds.width - margin);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * minDist, margin, bounds.height - margin);

      // se o mapa for pequeno (ou o jogador estiver perto da borda), o
      // clamp acima pode ter puxado o ponto de volta pra dentro da área
      // visível — só aceita se realmente ficou fora
      if (!view.contains(x, y)) {
        return { x, y };
      }
    }

    // fallback: mapa pequeno demais pra caber um ponto fora da visão em
    // qualquer direção — pelo menos garante alguma distância do jogador,
    // igual ao comportamento antigo (usado só em mapas minúsculos/debug)
    const fallbackDist = Math.min(minDist, Math.hypot(bounds.width, bounds.height) / 2);
    const angle = baseAngle == null ? Phaser.Math.FloatBetween(0, Math.PI * 2) : baseAngle;
    return {
      x: Phaser.Math.Clamp(this.player.x + Math.cos(angle) * fallbackDist, margin, bounds.width - margin),
      y: Phaser.Math.Clamp(this.player.y + Math.sin(angle) * fallbackDist, margin, bounds.height - margin)
    };
  }

  /**
   * Retângulo da área visível da câmera agora, calculado na mão a partir
   * de scrollX/scrollY/zoom — NÃO usa `camera.worldView`. `worldView` é um
   * retângulo cacheado que o Phaser só recalcula dentro do preRender() do
   * ciclo de render da câmera; se a gente ler ele durante o create() da
   * cena (ex.: no primeiro lote de spawn, antes do primeiro frame
   * renderizar), ele ainda reflete a posição ANTERIOR da câmera, não a
   * atual — foi exatamente isso que causava inimigos nascendo colados no
   * jogador logo no início, mesmo com a câmera já centralizada via
   * `centerOn()`. Calculando na mão, o retângulo bate com o scroll atual
   * em qualquer momento, sem depender do timing de renderização.
   */
  _currentCameraView() {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    return new Phaser.Geom.Rectangle(cam.scrollX, cam.scrollY, cam.width / zoom, cam.height / zoom);
  }

  /**
   * Chamado no update da GameScene: faz todos perseguirem o jogador com
   * comportamento de enxame (SwarmSystem — Perseguição + Coesão +
   * Separação + Densidade, pesos por tipo em def.flocking). O grid
   * espacial é reconstruído UMA vez por frame aqui (não por inimigo) e
   * reaproveitado por todo mundo, senão cada computeMoveDir() varreria
   * o grupo inteiro de novo. Repassa o multiplicador de velocidade da
   * câmera lenta só-inimigos (scene.slowmoSystem — evolução "Reflexos de
   * Predador", punhos, ver src/systems/SlowmoSystem.js) pra cada
   * Enemy.chase(); 1 (velocidade normal) se a run não tiver essa
   * evolução ou ela não estiver ativa agora.
   */
  updateAll(nowMs) {
    const speedMultiplier = this.scene.slowmoSystem?.getEnemySpeedMultiplier(nowMs) ?? 1;
    const active = this.group.getChildren().filter((e) => e.active);
    this.swarmSystem.rebuild(active);

    active.forEach((enemy) => {
      if (this.frozen) {
        enemy.setVelocity(0, 0);
      } else {
        const moveDir = this.swarmSystem.computeMoveDir(enemy, this.player);
        enemy.chase(this.player, nowMs, speedMultiplier, moveDir);
      }
      enemy.updateBleed(nowMs);
    });
  }

  /** Cheat (DevConsole "freeze"): liga/desliga o congelamento de todos os inimigos. */
  toggleFrozen() {
    this.frozen = !this.frozen;
    return this.frozen;
  }
}
