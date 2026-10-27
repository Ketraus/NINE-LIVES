// Simulação da queda involuntária do Host: migração, readmissão do ex-Host,
// autoridade antiga ignorada, saída voluntária e inatividade prolongada.
// Usa os métodos REAIS do MultiplayerManager (sem Phaser/MQTT), com relógio falso.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let clock = 1_000_000;
const source = fs.readFileSync('src/systems/MultiplayerManager.js', 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace('export default class', 'class');
const ctx = vm.createContext({ MAX_ROOM_PLAYERS: 4, MIN_PLAYERS_TO_START: 2, Date: { now: () => clock }, console: { info() {}, warn() {}, error() {}, log() {} }, window: { addEventListener() {}, removeEventListener() {} } });
const Manager = vm.runInContext(`${source}\nMultiplayerManager`, ctx);

const ids = { A: 'nlA', B: 'nlB', C: 'nlC', D: 'nlD', E: 'nlE' };
function makeNode(id, isHost, roster) {
  const m = Object.create(Manager.prototype);
  Object.assign(m, {
    playerId: id, isMultiplayer: true, isRoomHost: isHost, mqtt: { connected: true, publish() {} },
    hostPlayerId: isHost ? id : ids.A, hostTerm: 1, matchState: 'running', matchPhase: 'playing', runEpoch: 'ep1',
    remotePlayers: new Map(), remoteEnemies: new Map(), receivedEnemyDeaths: new Set(),
    pendingEnemyDamage: new Map(), appliedPickupRemovals: new Set(),
    slotOrder: isHost ? [...roster] : [], roster: isHost ? null : [...roster],
    rejected: false, notInRosterSince: null, wasAdmitted: true, reservedSlots: new Map(), leftIds: new Set(),
    hostMissingSince: null, lastEnemySnapshotSequence: 0, hostEnemySnapshotSequence: 0,
    hostRunTimeMs: 5000, hostRunTimeReceivedAt: clock, hostPauseVoteGen: 0, pauseVoteGen: 0, pauseRequested: false,
    scene: { onRoomRejected() { m.sceneRejected = true; } }, _destroyRemote() {}
  });
  roster.filter((other) => other !== id).forEach((other) => m.remotePlayers.set(other, { lastSeenAt: clock, hp: 100 }));
  return m;
}
// espelha a parte relevante de update(): timeout dos remotos + migração + roster + rejeição
function tick(node, dtMs = 100) {
  clock += dtMs;
  node.remotePlayers.forEach((remote, id) => { if (clock - remote.lastSeenAt > 8000) node.remotePlayers.delete(id); });
  node._checkHostMigration(clock);
  node._updateRoster(clock);
  node._checkRejected(clock);
}
const run = (nodes, ms) => { for (let t = 0; t < ms; t += 100) nodes.forEach((n) => tick(n)); };
const seen = (node, from) => { const r = node.remotePlayers.get(from); if (r) r.lastSeenAt = clock; else node.remotePlayers.set(from, { lastSeenAt: clock, hp: 100 }); };
const announce = (host) => ({ isHost: true, hostTerm: host.hostTerm, runEpoch: host.runEpoch, roster: host.getRoster(), roomPhase: 'playing', matchState: 'running' });
const hear = (node, host) => { seen(node, host.playerId); return node._acceptHostAnnouncement(host.playerId, announce(host)) && (node._applyHostLobby(announce(host)), true); };

function scenario() {
  const roster = [ids.A, ids.B, ids.C];
  return { A: makeNode(ids.A, true, roster), B: makeNode(ids.B, false, roster), C: makeNode(ids.C, false, roster) };
}

// 1) Queda involuntária do Host: B e C deixam de ouvir A -> B (menor id) assume
{
  const { A, B, C } = scenario();
  run([A, B, C], 500);
  for (let t = 0; t < 9000; t += 100) { // A isolado: só B e C se falam
    seen(B, ids.C); seen(C, ids.B);
    [A, B, C].forEach((n) => tick(n));
    if (B.isRoomHost) break;
  }
  run([B, C], 1500);
  assert.equal(B.isRoomHost, true, 'B deveria assumir');
  assert.equal(C.isRoomHost, false, 'C não pode assumir junto');
  assert.equal(B.hostTerm, 2);
  assert.equal(B.getRoster().includes(ids.A), true, 'vaga do ex-Host reservada, sem expulsar');
  assert.equal(hear(C, B), true);
  assert.equal(C.hostPlayerId, ids.B);
  assert.equal(C.hostTerm, 2);

  // 2) A volta: reconhece o novo Host e NÃO recupera a autoridade
  A.mqtt.connected = true;
  assert.equal(A.isRoomHost, true, 'A ainda se acha Host antes de ouvir B');
  assert.equal(B._acceptHostAnnouncement(ids.A, { isHost: true, hostTerm: 1, runEpoch: 'ep1', roster: [ids.A], roomPhase: 'playing', matchState: 'running' }), false, 'termo velho ignorado por B');
  assert.equal(C._acceptHostAnnouncement(ids.A, { isHost: true, hostTerm: 1, runEpoch: 'ep1', roster: [ids.A], roomPhase: 'playing', matchState: 'running' }), false, 'termo velho ignorado por C');
  assert.equal(hear(A, B), true);
  assert.equal(A.isRoomHost, false, 'A rebaixado');
  assert.equal(A.hostPlayerId, ids.B);
  assert.equal(A.hostTerm, 2);

  // A passa a mandar posição como cliente: B readmite sem "sala cheia"
  B.remotePlayers.delete(ids.A);
  assert.equal(B._admitNewPlayer(ids.A, {}, false), true);
  seen(B, ids.A); seen(C, ids.A); seen(A, ids.C);
  hear(A, B);
  for (let t = 0; t < 20000; t += 100) { seen(A, ids.B); seen(A, ids.C); seen(B, ids.A); seen(B, ids.C); seen(C, ids.A); seen(C, ids.B); [A, B, C].forEach((n) => tick(n)); hear(A, B); }
  assert.equal(A.rejected, false, 'ex-Host não pode ver "partida cheia"');
  assert.equal(A.sceneRejected, undefined);
  assert.deepEqual([...B.getRoster()].sort(), [ids.A, ids.B, ids.C]);
  console.log('OK: Host cai por rede, B assume, A volta como cliente sem recuperar autoridade nem ser expulso');
}

// 3) Saída voluntária: vaga liberada na hora e sem reserva
{
  const { A, B, C } = scenario();
  run([A, B, C], 200);
  A._onPlayerLeft(ids.C); // A (Host) ouve C sair de propósito
  assert.equal(A.getRoster().includes(ids.C), false);
  run([A], 70000);
  assert.equal(A.getRoster().includes(ids.C), false);
  assert.equal(A.reservedSlots.has(ids.C), false);

  // Host sai de propósito: clientes elegem outro rápido, sem reservar a vaga dele
  const s = scenario();
  [s.B, s.C].forEach((n) => n._onPlayerLeft(ids.A));
  for (let t = 0; t < 3000; t += 100) { seen(s.B, ids.C); seen(s.C, ids.B); tick(s.B); tick(s.C); }
  assert.equal(s.B.isRoomHost, true);
  assert.equal(s.B.getRoster().includes(ids.A), false, 'Host que saiu de propósito não fica reservado');
  console.log('OK: saída voluntária libera a vaga na hora (cliente e Host)');
}

// 4) Inatividade prolongada: reserva expira; sala lotada recusa o retorno tardio
{
  const { A, B, C } = scenario();
  for (let t = 0; t < 9000; t += 100) { seen(B, ids.C); seen(C, ids.B); [A, B, C].forEach((n) => tick(n)); if (B.isRoomHost) break; }
  run([B, C], 1500);
  assert.equal(B.getRoster().includes(ids.A), true);
  for (let t = 0; t < 61000; t += 100) { seen(B, ids.C); seen(C, ids.B); tick(B); tick(C); }
  assert.equal(B.getRoster().includes(ids.A), false, 'após 60s sem sinal a vaga é liberada');
  // partida em andamento: quem perdeu a vaga não volta como jogador novo
  assert.equal(B._admitNewPlayer(ids.A, {}, false), false);
  A.isRoomHost = false; A.hostPlayerId = ids.B; A.hostTerm = 2; A.roster = B.getRoster();
  for (let t = 0; t < 14000; t += 100) { seen(A, ids.B); tick(A); }
  assert.equal(A.rejected, false, 'ainda dentro do prazo de 15s');
  for (let t = 0; t < 2000; t += 100) { seen(A, ids.B); tick(A); }
  assert.equal(A.rejected, true, 'vaga perdida e partida em andamento: recusa');
  assert.equal(A.sceneRejected, true);
  console.log('OK: após inatividade prolongada a vaga é perdida; partida em andamento recusa o retorno tardio');
}

// 5) Partida em andamento: ninguém novo entra, nem com vaga livre ou reservada
{
  const roster = [ids.A, ids.B, ids.C, ids.D];
  const B = makeNode(ids.B, true, roster);
  run([B], 9000); // A, C, D somem durante a partida -> vagas reservadas
  seen(B, ids.C); seen(B, ids.D);
  run([B], 100);
  assert.equal(B.reservedSlots.has(ids.A), true);
  assert.equal(B._admitNewPlayer(ids.E, {}, false), false, 'novo jogador não entra em partida em andamento');
  assert.equal(B._admitNewPlayer(ids.A, {}, false), true, 'quem caiu por rede volta à própria vaga');
  const lobby = makeNode(ids.A, true, [ids.A]);
  lobby.matchPhase = 'waiting';
  assert.equal(lobby._admitNewPlayer(ids.E, {}, false), true, 'no lobby ainda entra');
  console.log('OK: partida em andamento bloqueia novos jogadores; lobby e retorno por queda continuam funcionando');
}

// 6) Cliente novo numa sala em andamento é recusado na hora (sem iniciar a partida)
{
  const host = makeNode(ids.B, true, [ids.B, ids.C]);
  const newcomer = makeNode(ids.E, false, [ids.B, ids.C]);
  newcomer.wasAdmitted = false; newcomer.roster = null; newcomer.matchPhase = 'waiting'; newcomer.matchState = 'running';
  let started = false;
  newcomer.scene.beginMatch = () => { started = true; };
  newcomer._applyHostLobby({ roster: host.getRoster(), roomPhase: 'playing', matchState: 'running', runEpoch: 'ep1' });
  assert.equal(newcomer.rejected, true);
  assert.equal(newcomer.sceneRejected, true);
  assert.equal(started, false, 'não pode nem começar a partida');
  console.log('OK: quem tenta entrar em sala em andamento é recusado imediatamente');
}
