const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const game = fs.readFileSync('src/scenes/GameScene.js', 'utf8');
const network = fs.readFileSync('src/systems/MultiplayerManager.js', 'utf8');
function method(source, name, globals = {}) {
  const start = source.indexOf(`  ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}})`, globals)[name];
}
const recipients = ['host', 'guest', 'third'];
const records = [];
let hostXp = 0;
const magnetized = [8, 13, 21].map((value, id) => {
  const data = new Map([['pickupId', id + 1], ['pickupKind', 'xp'], ['pickupValue', value], ['mapMagnet', false]]);
  return {
    active: true,
    getData(key) { return data.get(key); },
    setData(key, value) { data.set(key, value); return this; },
    destroy() { this.active = false; }
  };
});
const pickupMap = new Map(magnetized.map((orb) => [orb.getData('pickupId'), orb]));
const scene = {
  multiplayer: {
    playerId: 'host', getAlivePlayerIds: () => recipients.slice(),
    broadcastPickupRemoval: (...record) => records.push(record)
  },
  pickupsById: pickupMap,
  time: { now: 100 },
  xpOrbGroup: { getChildren: () => magnetized },
  grantPickupReward: (_, value) => { hostXp += value; },
  _playMagnetCollectFx(count) { this.magnetFxCount = count; },
  _collectSharedMagnetXpOrb: method(game, '_collectSharedMagnetXpOrb')
};
scene._activateMapXpMagnet = method(game, '_activateMapXpMagnet', { MAGNET_ALL_XP_STAGGER_MS: 180 });
const collect = method(game, 'hostCollectPickup');
const magnetData = new Map([['pickupKind', 'magnet'], ['pickupValue', 0]]);
pickupMap.set(99, {
  active: true,
  getData(key) { return magnetData.get(key); },
  destroy() { this.active = false; }
});
assert.equal(collect.call(scene, 99, 'host'), true);
assert.ok(magnetized.every((orb) => orb.getData('mapMagnet') === true));
assert.deepEqual(magnetized.map((orb) => orb.getData('mapMagnetWakeAt')), [100, 108, 116]);
assert.equal(scene.magnetFxCount, 3);
assert.ok(magnetized.every(orb => orb.active), 'collecting a magnet attracts instead of deleting XP');
assert.equal(collect.call(scene, 1, 'host'), true);
assert.equal(collect.call(scene, 1, 'host'), false, 'a collected orb cannot be rewarded twice');
for (const orb of magnetized.slice(1)) collect.call(scene, orb.getData('pickupId'), 'guest');
assert.equal(hostXp, 14);
assert.equal(records.length, 4);
assert.ok(magnetized.every(orb => !orb.active));
const xpRecords = records.filter((record) => record[2] === 'xp');
assert.deepEqual(xpRecords.map(([id, by, kind, value]) => [id, by, kind, value]), [
  [1, recipients, 'xp', 8 / 3],
  [2, recipients, 'xp', 13 / 3],
  [3, recipients, 'xp', 21 / 3]
]);
const apply = method(network, '_applyPickupRemovals', {
  REPLAY_MAX_ENTRIES: 80, PICKUP_KINDS: new Set(['xp', 'medkit', 'magnet', 'gone'])
});
for (const id of ['guest', 'third', 'outsider']) {
  let xp = 0;
  const client = {
    playerId: id, appliedPickupRemovals: new Set(),
    scene: { removeNetworkPickup() {}, grantPickupReward: (_, value) => { xp += value; } }
  };
  apply.call(client, xpRecords);
  apply.call(client, xpRecords);
  assert.equal(xp, id === 'outsider' ? 0 : 14);
}
let clientMagnetActivated = false;
apply.call({
  isRoomHost: false, appliedPickupRemovals: new Set(), playerId: 'guest',
  scene: { removeNetworkPickup() {}, _activateMapXpMagnet() { clientMagnetActivated = true; } }
}, [[99, 'host', 'magnet', 0]]);
assert.equal(clientMagnetActivated, true, 'clients start pulling XP after the magnet is confirmed');

const claim = method(network, '_onPickupClaim');
let acceptedClaims = 0;
const host = {
  isRoomHost: true, playerId: 'host', hostTerm: 2, runEpoch: 'run',
  getAlivePlayerIds: () => ['guest'],
  remotePlayers: new Map([['guest', { targetX: 10000, targetY: 10000 }]]),
  scene: {
    pickupsById: new Map([[1, { active: true, x: 0, y: 0,
      getData: key => key === 'mapMagnet' ? true : null }]]),
    hostCollectPickup() { acceptedClaims++; return true; }
  }
};
claim.call(host, 'guest', { id: 'guest', pickupId: 1, epoch: 'run', hostId: 'host', hostTerm: 2 });
assert.equal(acceptedClaims, 1, 'magnetized orbs can be claimed after their local attraction');
host.scene.pickupsById.set(2, { active: true, x: 0, y: 0, getData: () => null });
claim.call(host, 'guest', { id: 'guest', pickupId: 2, epoch: 'run', hostId: 'host', hostTerm: 2 });
assert.equal(acceptedClaims, 1, 'ordinary pickups retain the distance check');
const roll = method(game, '_rollDrops', {
  MEDKIT_BRUTE_DROP_CHANCE: 0.01, MEDKIT_DROP_OFFSET_MIN: 42, MEDKIT_DROP_OFFSET_MAX: 56,
  MAGNET_DROP_CHANCES: { elite: 1 }, MAGNET_DROP_OFFSET_MIN: 44, MAGNET_DROP_OFFSET_MAX: 62,
  Phaser: { Math: { FloatBetween: () => 0, Between: (min) => min } }
});
for (const count of [1, 2, 4]) {
  const state = { nextPickupId: 1, multiplayer: { isMultiplayer: count > 1, getRoster: () => Array(count).fill('p') } };
  const drops = roll.call(state, { enemyId: 'elite', x: 100, y: 100 });
  assert.equal(drops.medkits.length, count);
  assert.ok(drops.magnet);
  assert.equal(new Set([drops.orbId, ...drops.medkits.map(m => m[0]), drops.magnet[0]]).size, count + 2);
}
console.log('OK: shared XP, duplicate collection/replay, recipients, medkit scaling and multiplayer magnet drops');
