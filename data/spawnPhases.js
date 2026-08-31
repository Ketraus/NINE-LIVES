// Fases de composição da horda: cada ponto {t, weights} define, num
// instante do tempo de run (ms), o peso relativo de cada tipo de inimigo
// (por id, ver data/enemies.js) na hora de sortear quem nasce na próxima
// leva. Não precisam somar 100 nem incluir todos os ids — um id ausente
// num ponto vale peso 0 nesse ponto (ainda não "liberado" pra aparecer).
//
// Entre um ponto e o próximo, os pesos são interpolados linearmente (ver
// SpawnDirector._currentWeights), então a composição muda aos poucos, sem
// degraus bruscos — ex.: entre 1:00 (grunt 70/runner 30) e 3:00 (grunt 50/
// runner 35/tank 15), o tank vai de 0% a 15% suavemente, não pula direto.
// Depois do último ponto, a composição fica travada nos valores dele.
export default [
  { t: 0, weights: { grunt: 100, cyber_hound: 50 } }, // 0:00 — só grunt
  { t: 60000, weights: { grunt: 70, cyber_hound: 30 } }, // 1:00 — runner entra
  { t: 180000, weights: { grunt: 50, cyber_hound: 35, cyber_brute: 15 } }, // 3:00 — tank entra
  { t: 360000, weights: { grunt: 25, cyber_hound: 40, cyber_brute: 35 } } // 6:00
];
