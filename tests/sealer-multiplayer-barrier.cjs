const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/entities/enemies/Sealer.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default class', 'class');
const Sealer = vm.runInNewContext(`${source}\nSealer;`, {
  Enemy: class {},
  DamageSystem: {},
  Phaser: { Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)) } }
});

const sealer = Object.create(Sealer.prototype);
sealer.arenaCenter = { x: 100, y: 200 };
sealer.arenaRadius = 100;
sealer.arenaEnteredPlayerIds = new Set();
const player = {
  active: true,
  playerId: 'player-1',
  x: 250,
  y: 200,
  body: { radius: 20, velocity: { x: 5, y: 0 } },
  setPosition(x, y) { this.x = x; this.y = y; },
  setVelocity(x, y) { this.body.velocity = { x, y }; }
};

sealer.enforcePlayerBoundary(player);
assert.equal(player.x, 250, 'players outside may approach and enter');
assert.equal(sealer.arenaEnteredPlayerIds.has(player.playerId), false);

player.x = 150;
sealer.enforcePlayerBoundary(player);
assert.equal(sealer.arenaEnteredPlayerIds.has(player.playerId), true, 'entry locks the player in');

player.x = 190;
player.body.velocity = { x: 5, y: 3 };
sealer.enforcePlayerBoundary(player);
assert.equal(player.x, 180, 'player is kept inside the boundary accounting for body radius');
assert.equal(player.y, 200);
assert.equal(player.body.velocity.x, 0, 'outward velocity is removed');
assert.equal(player.body.velocity.y, 3, 'tangential movement is preserved');

const secondPlayer = { ...player, playerId: 'player-2', x: 250, y: 200,
  setPosition(x, y) { this.x = x; this.y = y; } };
sealer.enforcePlayerBoundary(secondPlayer);
assert.equal(secondPlayer.x, 250, 'entry state is tracked independently per player');

const replica = Object.create(Sealer.prototype);
replica.scene = {
  time: { now: 5000 },
  player: { active: true, x: 100, y: 200, body: { radius: 20 }, setPosition() {} },
  multiplayer: { playerId: 'player-1' },
  add: { graphics: () => ({ setDepth() { return this; } }) }
};
replica.def = { arenaShrinkDurationMs: 60000 };
replica.arenaBirthMs = null;
replica.arenaEnteredPlayerIds = new Set();
replica._drawArena = () => {};
replica.syncArenaVisual(100, 200, 500, 0.25, 'player-2');
assert.equal(replica.arenaBirthMs, -10000, 'replica reconstructs arena age for host migration');

console.log('Sealer multiplayer one-way barrier checks passed.');
