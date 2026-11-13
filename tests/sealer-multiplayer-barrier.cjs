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

let arenaDestroyed = false;
let warningCleared = false;
const fleeingSealer = Object.create(Sealer.prototype);
fleeingSealer.body = { setImmovable(value) { this.immovable = value; } };
fleeingSealer.arenaCenter = { x: 100, y: 200 };
fleeingSealer.arenaBirthMs = 1000;
fleeingSealer.arenaRadius = 250;
fleeingSealer.arenaProgress = 0.5;
fleeingSealer.arenaTargetPlayerId = 'player-1';
fleeingSealer.arenaGraphics = { destroy() { arenaDestroyed = true; } };
fleeingSealer.arenaEnteredPlayerIds = new Set(['player-1']);
fleeingSealer.scene = { hud: { clearSealerArenaWarning() { warningCleared = true; } } };
fleeingSealer._cancelActionsForFlee();
assert.equal(fleeingSealer.body.immovable, false);
assert.equal(arenaDestroyed, true, 'fleeing destroys the arena graphics immediately');
assert.equal(warningCleared, true, 'fleeing clears the arena warning');
assert.equal(fleeingSealer.arenaCenter, null, 'fleeing clears replicated arena state');
assert.equal(fleeingSealer.arenaEnteredPlayerIds.size, 0, 'fleeing clears player boundary state');

let syncedArenaDestroyed = false;
const replicaWithArena = Object.create(Sealer.prototype);
replicaWithArena.arenaCenter = { x: 100, y: 200 };
replicaWithArena.arenaBirthMs = 1000;
replicaWithArena.arenaRadius = 250;
replicaWithArena.arenaProgress = 0.5;
replicaWithArena.arenaTargetPlayerId = 'player-1';
replicaWithArena.arenaGraphics = { destroy() { syncedArenaDestroyed = true; } };
replicaWithArena.arenaEnteredPlayerIds = new Set(['player-1']);
replicaWithArena.scene = { hud: { clearSealerArenaWarning() {} } };
replicaWithArena.syncArenaVisual(null, null, null, null, null);
assert.equal(syncedArenaDestroyed, true, 'a snapshot without an arena clears the replica');
assert.equal(replicaWithArena.arenaCenter, null);

const drawCalls = [];
const visual = Object.create(Sealer.prototype);
visual.arenaCenter = { x: 100, y: 200 };
visual.arenaMarkerPoints = Array.from({ length: 16 }, () => [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 }
]);
visual.arenaGraphics = {
  clear: () => drawCalls.push('clear'),
  fillStyle: () => {},
  fillCircle: () => drawCalls.push('fill-circle'),
  lineStyle: () => {},
  strokeCircle: () => drawCalls.push('stroke-circle'),
  fillPoints: () => drawCalls.push('inward-marker')
};
visual.scene = {
  hud: {
    setSealerArenaProgress(progress, duration) {
      visual.warning = { progress, duration };
    }
  }
};
visual.def = { arenaShrinkDurationMs: 60000 };
visual.arenaNextVisualUpdateAt = 0;
visual._drawArena(400, 0.5, 1000, true);
assert.equal(drawCalls.filter((call) => call === 'stroke-circle').length, 3, 'arena border has layered contrast');
assert.equal(drawCalls.filter((call) => call === 'inward-marker').length, 16, 'boundary markers point toward the arena center');
assert.deepEqual(visual.warning, { progress: 0.5, duration: 60000 }, 'HUD receives arena progress for its warning bar');

const touchDrawCalls = [];
const touchVisual = Object.create(Sealer.prototype);
touchVisual.arenaCenter = { x: 100, y: 200 };
touchVisual.arenaMarkerPoints = visual.arenaMarkerPoints.map((points) => points.map(() => ({ x: 0, y: 0 })));
touchVisual.arenaGraphics = {
  clear() {},
  fillStyle() {},
  fillCircle() { touchDrawCalls.push('fill-circle'); },
  lineStyle() {},
  strokeCircle() {},
  fillPoints() {}
};
touchVisual.scene = {
  sys: { game: { device: { input: { touch: true } } } },
  hud: { setSealerArenaProgress() {} }
};
touchVisual.def = { arenaShrinkDurationMs: 60000 };
touchVisual.arenaNextVisualUpdateAt = 0;
touchVisual._drawArena(400, 0.5, 1000, true);
assert.equal(touchDrawCalls.includes('fill-circle'), false, 'touch devices skip the expensive arena fill');
assert.equal(touchVisual.arenaNextVisualUpdateAt, 1066, 'touch devices redraw the arena at a lower rate');

console.log('Sealer multiplayer one-way barrier checks passed.');
