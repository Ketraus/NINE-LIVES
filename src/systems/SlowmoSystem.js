// Quão devagar os inimigos ficam enquanto a câmera lenta está ativa (25%
const SLOWMO_SPEED_FACTOR = 0.25;

// Câmera lenta que afeta SÓ os inimigos, nunca o jogador. Diferente do
export default class SlowmoSystem {
  constructor() {
    // até este timestamp (scene.time.now) a câmera lenta está ativa. 0 = nu…
    this.activeUntil = 0;
  }

  // Ativa (ou renova, se já estava ativa) a câmera lenta a partir de agor…
  trigger(nowMs, durationMs) {
    this.activeUntil = Math.max(this.activeUntil, nowMs + durationMs);
  }

  isActive(nowMs) {
    return nowMs < this.activeUntil;
  }

  // (1 = velocidade normal, SLOWMO_SPEED_FACTOR = câmera lenta ativa)
  getEnemySpeedMultiplier(nowMs) {
    return this.isActive(nowMs) ? SLOWMO_SPEED_FACTOR : 1;
  }
}
