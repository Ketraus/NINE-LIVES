const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function method(file, name, globals = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(`  ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}})`, globals)[name];
}
const file = 'src/systems/MultiplayerManager.js';
const events = [];
let physicsPaused = false;
const scene = {
  isGameOver: true, isPaused: false, time: { timeScale: 1 },
  physics: { pause() { physicsPaused = true; }, resume() { physicsPaused = false; } }
};
const globals = {
  PLAYER_TIMEOUT_MS: 5000,
  EventBus: { emit(name) { events.push(name); scene.isPaused = name === 'levelup-opened'; } }
};
const remote = { combatant: { active: true }, lastSeenAt: Date.now(), levelUpPendingCount: 2 };
const manager = {
  isMultiplayer: true, mqtt: {}, isRoomHost: true,
  player: { isDead: true }, scene, remotePlayers: new Map([['guest', remote]]),
  levelUpPhase: 'idle', levelUpRound: 0, spectatorLevelUpPaused: false,
  _syncSpectatorLevelUpPause: method(file, '_syncSpectatorLevelUpPause', globals)
};
const sync = method(file, '_syncLevelUp', globals);
sync.call(manager);
assert.equal(manager.levelUpPhase, 'selecting');
assert.equal(physicsPaused, true);
assert.equal(scene.time.timeScale, 0);
sync.call(manager);
assert.equal(events.length, 1, 'Repeated synchronization must not reopen pause');
remote.levelUpPendingCount = 1;
sync.call(manager);
assert.equal(physicsPaused, true, 'Keep paused while more choices remain');
remote.levelUpPendingCount = 0;
sync.call(manager);
assert.equal(manager.levelUpPhase, 'idle');
assert.equal(physicsPaused, false);
assert.equal(scene.time.timeScale, 1);
assert.deepEqual(events, ['levelup-opened', 'levelup-closed']);
remote.levelUpPendingCount = 1;
sync.call(manager);
remote.lastSeenAt = Date.now() - 6000;
sync.call(manager);
assert.equal(physicsPaused, false, 'Disconnected participant must not lock the round');
// The dead host must continue networking while skipping enemy AI during pause.
const update = method('src/scenes/GameScene.js', 'update');
let networkTicks = 0;
let enemyTicks = 0;
const game = {
  isGameOver: true, isPaused: true, time: { now: 1 }, _updateRunTimer() {},
  multiplayer: { isMultiplayer: true, isRoomHost: true, update() { networkTicks++; } },
  enemySpawner: { updateAll() { enemyTicks++; } }
};
update.call(game, 1, 16);
assert.equal(networkTicks, 1);
assert.equal(enemyTicks, 0);
game.isPaused = false;
update.call(game, 2, 16);
assert.equal(enemyTicks, 1);
console.log('OK: dead host pauses selection, waits for all choices, resumes, handles disconnect and stops enemy AI');
