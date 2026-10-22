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
const orbs = [8, 13, 21].map((value, id) => ({
  active: true,
  getData(key) { return key === 'pickupId' ? id : value; },
  destroy() { this.active = false; }
}));
const scene = {
  multiplayer: {
    playerId: 'host', getRoster: () => recipients.slice(),
    broadcastPickupRemoval: (...record) => records.push(record)
  },
  xpOrbGroup: { getChildren: () => orbs },
  grantPickupReward: (_, value) => { hostXp += value; },
  _playMagnetCollectFx() {}
};
const collect = method(game, '_collectSharedMagnetXp');
collect.call(scene);
collect.call(scene);
assert.equal(hostXp, 14);
assert.equal(records.length, 3);
assert.ok(orbs.every(orb => !orb.active));
const apply = method(network, '_applyPickupRemovals', {
  REPLAY_MAX_ENTRIES: 80, PICKUP_KINDS: new Set(['xp', 'medkit', 'magnet', 'gone'])
});
for (const id of ['guest', 'third', 'outsider']) {
  let xp = 0;
  const client = {
    playerId: id, appliedPickupRemovals: new Set(),
    scene: { removeNetworkPickup() {}, grantPickupReward: (_, value) => { xp += value; } }
  };
  apply.call(client, records);
  apply.call(client, records);
  assert.equal(xp, id === 'outsider' ? 0 : 14);
}
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
