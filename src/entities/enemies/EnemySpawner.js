import Enemy from './Enemy.js';

const SPAWN_INTERVAL_MS = 2800;
const MAX_ALIVE = 14; // trava a quantidade simultânea pra não virar enxame incontrolável
// Quanto além da borda da câmera o inimigo precisa nascer pra garantir que
// nasce "fora da visão" (nunca literalmente colado na borda, senão dá pra
// ver ele aparecer do nada). Ver _findSpawnPosition().
const SPAWN_MARGIN_BEYOND_VIEW = 80;

/**
 * Spawna inimigos periodicamente ao redor do jogador, sempre fora do que
 * a câmera está mostrando no momento — não em qualquer ponto do mapa.
 * Isso é o que permite o mapa ser gigante sem os inimigos nascerem longe
 * demais pra chegar perto do jogador (spawn "em qualquer lugar do mapa"
 * só funciona bem em mapas pequenos, do tamanho da tela). Hoje só usa um
 * tipo ("grunt"); a leitura de enemies.js já deixa pronto suportar
 * múltiplos tipos/waves no futuro sem mudar a API.
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

    this.group = scene.physics.add.group({ runChildUpdate: false });
    this.timerEvent = null;
  }

  start() {
    this.timerEvent = this.scene.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnOne()
    });
    // primeiro inimigo imediato pra não deixar a cena vazia
    this.spawnOne();
  }

  stop() {
    this.timerEvent?.remove();
  }

  spawnOne() {
    // enxame sob controle: se já tem gente demais viva, pula esse ciclo
    if (this.group.countActive(true) >= MAX_ALIVE) return null;

    const def = Phaser.Utils.Array.GetRandom(this.enemyDefs);
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
  updateAll() {
    this.group.children.iterate((enemy) => {
      enemy?.chase(this.player);
    });
  }
}
