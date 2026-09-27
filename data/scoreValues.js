// Pontos por abate, por id de inimigo (ids batem com data/enemies.js).
// Só abates valem ponto de propósito — XP, cartas de upgrade e outras
// ações obrigatórias da run não entram aqui (ver ScoreManager.registerKill).
// Elite, Sealer e o boss (minotaur) valem bem mais que os inimigos comuns.
export default {
  cyber_hound: 5,
  grunt: 10,
  cyber_brute: 25,
  exploder: 30,
  elite: 150,
  sealer: 200,
  minotaur: 1000
};
