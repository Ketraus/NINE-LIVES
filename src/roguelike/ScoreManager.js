import EventBus from '../systems/EventBus.js';

// Multiplicador de sobrevivência: cresce linear de 1x (0s) até este valor
// no instante em que a run venceria (runWinSeconds) — prêmio por aguentar
// mais tempo mesmo sem chegar lá. Bônus fixo extra só se completar de fato.
const SURVIVAL_MULTIPLIER_MAX = 1.5;
const COMPLETION_BONUS = 1000;

// Dono da pontuação da partida (separado de RunState/RunManager, que
// cuidam de XP/level/cartas — pontuação não afeta e não é afetada por
// eles). Instanciado por run (ver GameScene._buildRun), igual ao RunState.
export default class ScoreManager {
  constructor(scoreValues, runWinSeconds) {
    this.scoreValues = scoreValues; // { [enemyId]: pontos }
    this.runWinSeconds = runWinSeconds;
    this.rawScore = 0;
    this.killsByType = {}; // { [enemyId]: quantidade morta }
    this.survivedSeconds = 0;
    this.result = null; // só preenchido depois de finalize()
  }

  // Chamado a cada 'enemy-died' (ver GameScene). De propósito só isto dá
  // ponto — XP, cartas de upgrade e outras ações obrigatórias da run não
  // passam por aqui.
  registerKill(enemyId) {
    const points = this.scoreValues[enemyId]?.points ?? 0;
    this.rawScore += points;
    this.killsByType[enemyId] = (this.killsByType[enemyId] || 0) + 1;
    EventBus.emit('score-changed', {
      rawScore: this.rawScore,
      killsByType: { ...this.killsByType }
    });
  }

  // Chamado a cada tick do relógio da run (ver GameScene._updateRunTimer)
  // pra saber quanto tempo foi sobrevivido na hora de finalizar.
  updateSurvivedTime(seconds) {
    this.survivedSeconds = seconds;
  }

  _survivalMultiplier() {
    const ratio = Phaser.Math.Clamp(this.survivedSeconds / this.runWinSeconds, 0, 1);
    return 1 + ratio * (SURVIVAL_MULTIPLIER_MAX - 1);
  }

  // Fim da run (morte ou vitória, ver GameScene) — calcula e guarda o
  // resultado final uma única vez. completed = true só quando bateu os
  // 10:00 (ver RUN_WIN_SECONDS em GameScene).
  finalize(completed) {
    if (this.result) return this.result; // já finalizado, não recalcula

    const survivalMultiplier = this._survivalMultiplier();
    const completionBonus = completed ? COMPLETION_BONUS : 0;
    const finalScore = Math.round(this.rawScore * survivalMultiplier) + completionBonus;

    this.result = {
      rawScore: this.rawScore,
      survivedSeconds: this.survivedSeconds,
      survivalMultiplier,
      completed,
      completionBonus,
      finalScore,
      killsByType: { ...this.killsByType }
    };

    // UI (barra de pontuação subindo etc.) escuta isto depois — ainda não
    // implementado de propósito (ver pedido do usuário: infra primeiro).
    EventBus.emit('score-finalized', this.result);
    return this.result;
  }
}
