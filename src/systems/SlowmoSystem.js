// Quão devagar os inimigos ficam enquanto a câmera lenta está ativa (25%
// da velocidade normal — perceptível, mas não um "freeze" total).
const SLOWMO_SPEED_FACTOR = 0.25;

/**
 * Câmera lenta que afeta SÓ os inimigos, nunca o jogador. Diferente do
 * timeScale usado por LevelUpUI/PauseUI/DevConsole (que pausa a scene
 * inteira), isto não mexe em scene.time.timeScale nem em physics — é só
 * um multiplicador de velocidade que EnemySpawner.updateAll lê a cada
 * frame e repassa pra Enemy.chase() (ver lá). O jogador nunca consulta
 * isto, então seu movimento continua 100% normal.
 *
 * Efeito da evolução "Reflexos de Predador" (Visão Aguçada, punhos, ver
 * data/upgrades.js): pequena chance a cada soco de ativar por um tempo
 * curto (ver Weapon._fireArc). Uma instância vive em GameScene
 * (scene.slowmoSystem), recriada a cada create()/restart.
 */
export default class SlowmoSystem {
  constructor() {
    // até este timestamp (scene.time.now) a câmera lenta está ativa. 0 = nunca ativada.
    this.activeUntil = 0;
  }

  /**
   * Ativa (ou renova, se já estava ativa) a câmera lenta a partir de agora.
   * @param {number} nowMs - scene.time.now
   * @param {number} durationMs
   */
  trigger(nowMs, durationMs) {
    this.activeUntil = Math.max(this.activeUntil, nowMs + durationMs);
  }

  /** @returns {boolean} true se a câmera lenta está ativa agora */
  isActive(nowMs) {
    return nowMs < this.activeUntil;
  }

  /**
   * @param {number} nowMs - scene.time.now
   * @returns {number} multiplicador de velocidade pra Enemy.chase() aplicar
   *   (1 = velocidade normal, SLOWMO_SPEED_FACTOR = câmera lenta ativa)
   */
  getEnemySpeedMultiplier(nowMs) {
    return this.isActive(nowMs) ? SLOWMO_SPEED_FACTOR : 1;
  }
}
