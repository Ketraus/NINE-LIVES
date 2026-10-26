const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const network = fs.readFileSync('src/systems/MultiplayerManager.js', 'utf8');
const game = fs.readFileSync('src/scenes/GameScene.js', 'utf8');
function method(source, name, globals = {}) {
  let start = source.indexOf(`  ${name}(`);
  if (start < 0) start = source.indexOf(`  async ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}})`, globals)[name];
}
const now = Date.now();
const alive = method(network, 'getAlivePlayerIds', { PLAYER_TIMEOUT_MS: 8000 });
const remote = { hp: 80, lastSeenAt: now, pauseRequested: true, targetX: 10, targetY: 10 };
let paused = false;
const events = [];
const host = {
  isMultiplayer: true, mqtt: {}, matchState: 'running', isRoomHost: true,
  playerId: 'host', player: { isDead: true, healthSystem: { current: 0 } },
  getRoster: () => ['host', 'guest', 'dead', 'stale'], getAlivePlayerIds: alive,
  remotePlayers: new Map([['guest', remote], ['dead', { hp: 0, lastSeenAt: now }], ['stale', { hp: 80, lastSeenAt: now - 9000 }]]),
  pauseApplied: false, pauseRequested: false, levelUpPhase: 'idle',
  scene: {
    isGameOver: true, time: { timeScale: 1 },
    physics: { pause() { paused = true; }, resume() { paused = false; } },
    pauseUI: { setWaitingForPlayer() {}, open() { throw Error('Dead host must not open menu'); } }
  }
};
assert.deepEqual(Array.from(alive.call(host)), ['guest']);
const vote = method(network, '_syncPauseVote', { EventBus: { emit: event => events.push(event) } });
vote.call(host);
assert.equal(paused, true);
assert.equal(host.scene.time.timeScale, 0);
vote.call(host);
assert.equal(events.length, 1);
remote.pauseRequested = false;
vote.call(host);
assert.equal(paused, false);
assert.equal(host.scene.time.timeScale, 1);
assert.deepEqual(events, ['pause-opened', 'pause-closed']);
// Voto local não pausa um cliente antes da confirmação do host.
host.isRoomHost = false;
host.pauseRequested = true;
vote.call(host);
assert.equal(paused, false);
// Com host vivo, os dois precisam votar; qualquer retirada retoma.
host.isRoomHost = true;
host.player.isDead = false;
host.player.healthSystem.current = 100;
host.scene.isGameOver = false;
host.scene.pauseUI = {
  isOpen: false, setWaitingForPlayer() {},
  open() { this.isOpen = true; }, close() { this.isOpen = false; }
};
host.pauseRequested = true;
remote.pauseRequested = false;
vote.call(host);
assert.equal(host.pauseApplied, false);
remote.pauseRequested = true;
vote.call(host);
assert.equal(host.pauseApplied, true);
host.pauseRequested = false;
vote.call(host);
assert.equal(host.pauseApplied, false);
assert.equal(host.scene.pauseUI.isOpen, false);
host.player.isDead = true;
host.player.healthSystem.current = 0;
// Uma gema de 40 XP vai integralmente ao único sobrevivente.
const rewards = [];
const orb = { active: true, getData: key => key === 'pickupId' ? 1 : 40, destroy() { this.active = false; } };
method(game, '_collectSharedMagnetXp').call({
  multiplayer: { playerId: 'host', getAlivePlayerIds: () => alive.call(host), broadcastPickupRemoval: (...args) => rewards.push(args) },
  xpOrbGroup: { getChildren: () => [orb] },
  grantPickupReward() { throw Error('Dead host must not receive XP'); }, _playMagnetCollectFx() {}
});
assert.equal(rewards[0][3], 40);
assert.deepEqual(Array.from(rewards[0][1]), ['guest']);
// Fila grande: nenhuma entrada desaparece antes de ser reenviada.
const queue = Array.from({ length: 501 }, (_, id) => ({ at: now, sends: 0, record: id }));
const replay = method(network, '_takeReplay', { REPLAY_SNAPSHOTS: 5, REPLAY_MAX_AGE_MS: 5000, REPLAY_MAX_ENTRIES: 80 });
const seen = new Set();
for (let i = 0; i < 7; i++) replay(queue).forEach(entry => seen.add(entry.record));
assert.equal(seen.size, 501);
// Rebaixar host limpa inimigos autoritativos e suas ações especiais.
let removed = 0;
const oldHost = { isRoomHost: true, remoteEnemies: new Map([[1, {}]]), scene: {
  spawnDirector: { stop() {} }, multiplayer: { attachRunClock() {} },
  enemySpawner: { group: { getChildren: () => [{ _leave() { removed++; } }] } }
} };
method(network, '_demoteFromHost').call(oldHost);
assert.equal(removed, 1);
assert.equal(oldHost.remoteEnemies.size, 0);
// Coleta exige jogador vivo, epoch/host corretos e proximidade.
let claims = 0;
const claimHost = {
  isRoomHost: true, playerId: 'host', hostTerm: 1, runEpoch: 'run',
  getAlivePlayerIds: () => ['guest'], remotePlayers: new Map([['guest', remote]]),
  scene: { pickupsById: new Map([[1, { active: true, x: 10, y: 10, getData: () => 10 }]]),
    hostCollectPickup() { claims++; return true; } }
};
const claim = method(network, '_onPickupClaim');
const message = { id: 'guest', pickupId: 1, epoch: 'run', hostId: 'host', hostTerm: 1 };
claim.call(claimHost, 'guest', message);
claim.call(claimHost, 'outsider', { ...message, id: 'outsider' });
claim.call(claimHost, 'guest', { ...message, epoch: 'old' });
remote.targetX = 2000;
claim.call(claimHost, 'guest', message);
assert.equal(claims, 1);
// Uma queda de conexão não libera reinício enquanto o grupo joga.
const restarting = { multiplayer: { isMultiplayer: true, mqtt: { connected: false }, matchState: 'running' },
  scene: { restart() { throw Error('Unexpected restart'); } } };
method(game, '_restartOrGoToWeaponSelect').call(restarting);
assert.equal(restarting._pendingGroupRestart, true);
// Transporte: o QoS solicitado é preservado na assinatura e publicação.
const transportSource = fs.readFileSync('src/systems/MqttClient.js', 'utf8').replace('export default ', '');
const packets = [];
const transport = vm.runInNewContext(`${transportSource}; MqttClient`, {
  mqtt: { connect: () => ({ subscribe(topic, options, callback) { packets.push(options); callback(null, []); },
    publish(topic, message, options) { packets.push(options); } }) }
});
const client = new transport('unused', {});
client.subscribe('critical', 1);
client.publish('critical', {}, 1);
assert.ok(packets.every(packet => packet.qos === 1));
(async () => {
  const auth = fs.readFileSync('src/systems/RoomAuth.js', 'utf8').replace('export async', 'async');
  const proof = vm.runInNewContext(`${auth}; createRoomProof`, { crypto: webcrypto, TextEncoder });
  const signed = await proof('secret', 'ROOM', 'player', 'epoch', 1, false);
  assert.equal(signed, await proof('secret', 'ROOM', 'player', 'epoch', 1, false));
  assert.notEqual(signed, await proof('wrong', 'ROOM', 'player', 'epoch', 1, false));
  assert.notEqual(signed, await proof('secret', 'ROOM', 'other', 'epoch', 1, false));
  assert.notEqual(signed, await proof('secret', 'ROOM', 'player', 'new-run', 1, false));
  assert.notEqual(signed, await proof('secret', 'ROOM', 'player', 'epoch', 2, true));
  let damage = 0;
  const receive = method(network, '_onMessage', { Phaser: { Math: { Clamp: (n, min, max) => Math.max(min, Math.min(max, n)) } }, MAX_DAMAGE_PER_MESSAGE: 5000 });
  const receiver = {
    isRoomHost: false, playerId: 'guest', topicPrefix: 'room/players', runEpoch: 'run',
    lastReceivedPlayerDamageSequence: 0,
    _isCurrentAuthorityMessage: message => message.hostId === 'host' && message.hostTerm === 1,
    player: { applyNetworkDamage: amount => { damage += amount; } }
  };
  const packet = { hostId: 'host', hostTerm: 1, epoch: 'run', seq: 1, amount: 12 };
  await receive.call(receiver, 'room/players/guest/damage', JSON.stringify(packet));
  await receive.call(receiver, 'room/players/guest/damage', JSON.stringify(packet));
  await receive.call(receiver, 'room/players/guest/damage', JSON.stringify({ ...packet, seq: 2, epoch: 'old' }));
  assert.equal(damage, 12, 'QoS retransmission must not repeat damage; old epochs must be ignored');
  let rejected = false;
  const privateReceiver = { ...receiver, roomMeta: { priv: true, pw: 'wrong' }, roomCode: 'ROOM',
    scene: { onRoomRejected: () => { rejected = true; } } };
  const privateReceive = method(network, '_onMessage', { createRoomProof: proof });
  const hostProof = await proof('secret', 'ROOM', 'host', 'epoch', 1, true);
  await privateReceive.call(privateReceiver, 'room/players/host/position', JSON.stringify({
    id: 'host', x: 0, y: 0, isHost: true, runEpoch: 'epoch', hostTerm: 1,
    authEpoch: 'epoch', authTerm: 1, roomProof: hostProof
  }));
  assert.equal(rejected, true, 'Wrong password must exit the waiting screen');
  console.log('OK: manual pause, living-only XP, large replay, demotion, pickup validation, restart, QoS and room proofs');
})().catch(error => { console.error(error); process.exitCode = 1; });
