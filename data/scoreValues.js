// Pontos por abate, por id de inimigo (ids batem com data/enemies.js).
// Só abates valem ponto de propósito — XP, cartas de upgrade e outras
// ações obrigatórias da run não entram aqui (ver ScoreManager.registerKill).
// Elite, Sealer e o boss (minotaur) valem bem mais que os inimigos comuns.
// Ordem = ordem de exibição na tela de resultado (ver ResultUI), crescente
// por valor, terminando no boss.
// `label` é o nome mostrado na tela de resultado (independente do `name`
// de data/enemies.js, que carrega apelidos como "(Tank)"/"(Runner)").
export default {
  cyber_hound: { points: 5, label: 'CyberHound' },
  grunt: { points: 10, label: 'Grunt' },
  cyber_brute: { points: 25, label: 'CyberBrute' },
  exploder: { points: 30, label: 'Exploder' },
  elite: { points: 150, label: 'Elite' },
  sealer: { points: 200, label: 'Sealer' },
  minotaur: { points: 1000, label: 'Minotauro' }
};
