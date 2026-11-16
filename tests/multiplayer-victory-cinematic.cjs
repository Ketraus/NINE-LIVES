const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function method(source, name, globals = {}) {
  const start = source.indexOf(`  ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = source.indexOf('\n  }', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}})`, globals)[name];
}

const gameSource = fs.readFileSync('src/scenes/GameScene.js', 'utf8');
const applyGroupMatchState = method(gameSource, 'applyGroupMatchState');
const updates = [];
const game = {
  groupWon: false,
  isGameOver: false,
  _beginVictorySequence() { updates.push('sequence'); },
  time: { delayedCall() {} }
};

applyGroupMatchState.call(game, 'won');
assert.equal(game.groupWon, true);
assert.equal(game.isGameOver, false, 'the cinematic can run before the result state');
assert.deepEqual(updates, ['sequence']);

const recoveryCalls = [];
const deadGame = {
  groupWon: false,
  isGameOver: true,
  _pendingGroupRestart: true,
  hud: { dismissForGroupVictory() { recoveryCalls.push('dismiss-hud'); } },
  resultUI: { dismissForGroupVictory() { recoveryCalls.push('dismiss-results'); } },
  _beginVictorySequence() { recoveryCalls.push('sequence'); },
  time: { delayedCall() { recoveryCalls.push('restart'); } }
};

applyGroupMatchState.call(deadGame, 'won');
assert.equal(deadGame.isGameOver, false, 'a dead player can join the group finale');
assert.equal(deadGame._pendingGroupRestart, false, 'a pending restart does not leave the finale');
assert.deepEqual(recoveryCalls, ['dismiss-hud', 'dismiss-results', 'sequence']);

let restartDelay;
const lostGame = {
  isGameOver: true,
  _pendingGroupRestart: true,
  time: { delayedCall(delay) { restartDelay = delay; } }
};
applyGroupMatchState.call(lostGame, 'lost');
assert.equal(lostGame._pendingGroupRestart, false);
assert.equal(restartDelay, 250, 'a pending restart still follows a group loss');

const finaleSource = fs.readFileSync('src/systems/VictoryFinale.js', 'utf8');
const cutToCredits = method(finaleSource, '_cutToBlackThenCredits', {
  BLACK_SILENCE_MS: 3000,
  VictoryAudio: { silenceAll() {} }
});

function runFinalCut(groupWon) {
  let finish;
  const calls = [];
  const scene = {
    groupWon,
    hud: { cutToBlack() { calls.push('black'); } },
    cameras: { main: { resetFX() { calls.push('reset'); } } },
    time: { delayedCall(_delay, callback) { finish = callback; } },
    scene: { start(name) { calls.push(name); } }
  };
  cutToCredits.call({ scene, _aborted: () => false });
  finish();
  return calls;
}

assert.deepEqual(runFinalCut(true), ['black', 'reset', 'CreditsScene']);
assert.deepEqual(runFinalCut(false), ['black', 'reset', 'CreditsScene']);
console.log('Solo and multiplayer victory sequences share the same finale and credits route.');
