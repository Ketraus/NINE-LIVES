// Horários (em ms de tempo de RUN decorrido, ver SpawnDirector.getElapsedMs)
// em que o Sealer nasce. Diferente de todo resto em data/enemies.js, ele
// NÃO entra no sorteio automático de spawnPhases.js ("tem espaço, aparece")
// — é sempre um spawn manual, agendado aqui na mão, um de cada vez.
//
// Cada valor dispara UMA tentativa de spawn (via SpawnDirector._checkSealerSchedule
// -> EnemySpawner.spawnByDefId('sealer', 1)); se já existir um Sealer vivo
// naquele instante, a tentativa simplesmente não faz nada (EnemySpawner já
// garante isso sozinho, ver hasActiveSealer()) — nunca nasce um segundo.
// Pra adicionar mais aparições, só acrescentar mais valores na lista
// (ex.: [240000, 480000] pra 4:00 e 8:00).
export default [
  240000, 480000 // 4:00 e 8:00
  
];
