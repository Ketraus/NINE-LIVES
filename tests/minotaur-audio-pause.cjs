const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync('src/entities/enemies/Enemy.js', 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}})`, {
    SettingsManager: { getSfx: () => 0.5 }
  })[name];
}
class Sound extends EventEmitter {
  constructor() { super(); this.duration = 2; this.isPlaying = false; this.isPaused = false; this.seek = 0.7; }
  play(config) { this.config = config; this.isPlaying = true; }
  pause() { this.isPlaying = false; this.isPaused = true; return true; }
  resume() { this.isPlaying = true; this.isPaused = false; this.resumes = (this.resumes || 0) + 1; }
  destroy() { this.isPlaying = false; this.isPaused = false; this.emit('destroy'); }
}
const sounds = [];
const enemy = { active: true, scene: { sound: { add() { const s = new Sound(); sounds.push(s); return s; } } } };
for (const name of ['_playTimedSfx', '_stopTimedSfx', 'pauseVisual', 'resumeVisual']) enemy[name] = method(name);
for (const key of ['sfx_axe_charging', 'sfx_axe_beep']) {
  assert.equal(enemy._playTimedSfx(key, 0.8), 2000);
  const sound = sounds.at(-1);
  enemy.pauseVisual(); enemy.pauseVisual();
  assert.equal(sound.isPlaying, false);
  enemy.resumeVisual(); enemy.resumeVisual();
  assert.equal(sound.isPlaying, true);
  assert.equal(sound.resumes, 1);
  assert.equal(sound.seek, 0.7, 'Resume does not restart the sound');
  assert.equal(sound.config.volume, 0.4);
  sound.emit('complete');
  assert.equal(enemy._timedSfx.size, 0);
}
enemy.scene.isPaused = true;
enemy._playTimedSfx('sfx_axe_charging', 1);
assert.equal(sounds.at(-1).isPaused, true);
enemy._stopTimedSfx(); enemy.resumeVisual();
assert.equal(sounds.at(-1).isPlaying, false, 'Cancelled sound cannot resume');
assert.equal(enemy._pausedTimedSfx.size, 0);
console.log('Minotaur audio: charging/beep pause, resume, completion and cancellation passed.');
