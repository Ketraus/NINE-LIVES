// Horários (em ms de tempo de RUN decorrido, ver SpawnDirector.getElapsedMs)
// em que o Elite nasce. Igual ao Sealer (ver sealerSchedule.js), o Elite
// NÃO entra no sorteio automático de spawnPhases.js — ele não tem peso em
// nenhuma fase, então o sorteio normal nunca escolhe ele sozinho. É sempre
// um spawn manual, agendado aqui na mão.
//
// Diferente do Sealer (que só nasce 1 por vez e sempre em quantidade 1),
// cada entrada aqui define {t, count}: `t` é o instante (ms) e `count`
// quantos Elites nascem juntos naquele instante. Não existe limite de "só
// 1 vivo por vez" — vários podem estar vivos ao mesmo tempo, inclusive de
// entradas diferentes que se sobrepõem.
//
// Cada entrada dispara UMA tentativa de spawn (via
// SpawnDirector._checkEliteSchedule -> EnemySpawner.spawnByDefId('elite',
// count)), uma única vez, mesmo que a run passe por ela em vários frames
// seguidos. Pra adicionar mais aparições (ex.: 5 elites de uma vez porque
// o Arquiteto perdeu a sanidade), só acrescentar mais entradas na lista.
export default [
  { t: 210000, count: 1 }, // 3:30 — dois de uma vez
  { t: 480000, count: 2 } // 8:00 — três de uma vez
];
