import Enemy from './Enemy.js';

const DEFAULT_MAX_ALIVE = 14; // trava inicial da quantidade simultânea, até o SpawnDirector assumir o controle via setMaxAlive()
// Quanto além da borda da câmera o inimigo precisa nascer pra garantir que
// nasce "fora da visão" (nunca literalmente colado na borda, senão dá pra
// ver ele aparecer do nada). Ver _findSpawnPosition().
const SPAWN_MARGIN_BEYOND_VIEW = 80;

/**
 * Responsável só por CRIAR inimigos: escolhe o tipo, acha uma posição fora
 * da visão da câmera e instancia. Não decide quando nem quantos spawnar —
 * isso é papel do SpawnDirector (ver src/roguelike/SpawnDirector.js), que
 * chama spawnOne() quantas vezes quiser, quando quiser, e também controla
 * o teto de inimigos vivos via setMaxAlive() (ex.: crescendo com o tempo
 * de run). Spawna sempre fora do que a câmera está mostrando no momento —
 * não em qualquer ponto do mapa. Isso é o que permite o mapa ser gigante
 * sem os inimigos nascerem longe demais pra chegar perto do jogador (spawn
 * "em qualquer lugar do mapa" só funciona bem em mapas pequenos, do
 * tamanho da tela). Hoje só usa um tipo ("grunt"); a leitura de enemies.js
 * já deixa pronto suportar múltiplos tipos/waves no futuro sem mudar a API.
 */
export default class EnemySpawner {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../../maps/MapManager.js').default} mapManager
   * @param {Player} player
   * @param {Array} enemyDefs - conteúdo de data/enemies.js
   */
  constructor(scene, mapManager, player, enemyDefs) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.player = player;
    this.enemyDefs = enemyDefs;
    this.maxAlive = DEFAULT_MAX_ALIVE;

    this.group = scene.physics.add.group({ runChildUpdate: false });
  }

  /** Muda o teto de inimigos vivos simultaneamente. Chamado pelo SpawnDirector. */
  setMaxAlive(value) {
    this.maxAlive = value;
  }

  /**
   * Cria um inimigo agora, se houver espaço (respeita maxAlive). Chamado
   * pelo SpawnDirector — quantas vezes e com que frequência é decisão dele,
   * não deste método.
   * @param {number} [nowMs] - tempo decorrido de run (SpawnDirector.getElapsedMs());
   *   usado só pra filtrar tipos com `def.minSpawnTimeMs` ainda não liberado
   * @returns {Enemy|null}
   */
  spawnOne(nowMs = 0) {
    // enxame sob controle: se já tem gente demais viva, pula esse ciclo
    if (this.group.countActive(true) >= this.maxAlive) return null;

    const availableDefs = this.enemyDefs.filter((def) => !def.minSpawnTimeMs || nowMs >= def.minSpawnTimeMs);
    const def = Phaser.Utils.Array.GetRandom(availableDefs.length > 0 ? availableDefs : this.enemyDefs);
    const pos = this._findSpawnPosition();
    const enemy = new Enemy(this.scene, pos.x, pos.y, def);
    this.group.add(enemy);
    this.mapManager.addCollider(enemy);
    return enemy;
  }

  /**
   * Escolhe um ponto fora da área visível da câmera, num ângulo aleatório
   * ao redor do jogador. `worldView` é o retângulo (em coordenadas do
   * mundo, não da tela) que a câmera está mostrando agora — muda sozinho
   * conforme o jogador anda, então isto funciona igual em mapa pequeno ou
   * gigante, sem precisar saber o tamanho total do mapa pra decidir a
   * distância de spawn.
   */
  _findSpawnPosition() {
    const bounds = this.mapManager.getWorldBounds();
    const margin = 64; // nunca nasce colado na borda do mapa
    const view = this.scene.cameras.main.worldView;
    // metade da diagonal da câmera + margem: distância mínima do jogador
    // que garante nascer fora da tela não importa o ângulo sorteado
    const minDist = Math.hypot(view.width, view.height) / 2 + SPAWN_MARGIN_BEYOND_VIEW;

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
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
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    return {
      x: Phaser.Math.Clamp(this.player.x + Math.cos(angle) * fallbackDist, margin, bounds.width - margin),
      y: Phaser.Math.Clamp(this.player.y + Math.sin(angle) * fallbackDist, margin, bounds.height - margin)
    };
  }

  /** Chamado no update da GameScene: faz todos perseguirem o jogador. */
  updateAll(nowMs) {
    this.group.children.iterate((enemy) => {
      enemy?.chase(this.player, nowMs);
    });
  }
}
