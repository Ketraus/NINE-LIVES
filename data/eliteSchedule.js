// Cada entrada dispara UMA tentativa de spawn (via
// SpawnDirector._checkEliteSchedule -> EnemySpawner.spawnByDefId('elite',
// count)), uma única vez, mesmo que a run passe por ela em vários frames
// seguidos. Pra adicionar mais aparições (ex.: 5 elites de uma vez porque
// o Arquiteto perdeu a sanidade), só acrescentar mais entradas na lista.
export default [
  { t: 210000, count: 1 }, // 3:30 — dois de uma vez
  { t: 480000, count: 2 } // 8:00 — três de uma vez
];
