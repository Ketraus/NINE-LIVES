// Horário (em ms de tempo de RUN decorrido, ver SpawnDirector.getElapsedMs)
// em que o Boss nasce. Diferente de eliteSchedule.js/sealerSchedule.js
// (listas, várias aparições), isto é um evento ÚNICO — só existe 1 boss
// por enquanto ("primeiro e único", o Minotauro) — por isso é um objeto
// simples, não um array.
//
// Quando o tempo bate (ver SpawnDirector._checkBossSchedule): todo
// inimigo vivo na tela foge (EnemySpawner.fleeAll -> Enemy.flee, eles
// somem sozinhos depois, sem virar kill/XP) e o Minotauro nasce logo em
// seguida (EnemySpawner.spawnByDefId('minotaur', 1)) — nunca entra no
// sorteio automático de spawnPhases.js, igual ao Elite/Sealer.
export default {
  t: 360000 // 6:00
};
