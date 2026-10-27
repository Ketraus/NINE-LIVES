const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
function load(file, names, globals = {}) {
  const code = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${code}\n({${names}})`, { ...globals, Phaser: { BlendModes: { ADD: 1 } } });
}
function makeScene(mobile = true) {
  const images = [];
  const timers = [];
  return {
    images, timers, events: new EventEmitter(),
    sys: { game: { device: { input: { touch: mobile } } } },
    time: { now: 0, timeScale: 1, addEvent(config) {
      const timer = { ...config, removed: false, remove() { this.removed = true; } };
      timers.push(timer); return timer;
    } },
    add: { image() {
      const image = { active: true, destroy() { this.destroyed = true; this.active = false; } };
      for (const name of ['Texture', 'Position', 'Rotation', 'Tint', 'BlendMode', 'Depth', 'Scale', 'Alpha', 'Active', 'Visible']) {
        image[`set${name}`] = function (...args) {
          this[name.toLowerCase()] = args.length === 1 ? args[0] : args;
          return this;
        };
      }
      images.push(image); return image;
    } }
  };
}
const { reserveFx, fxBudgetStats } = load('src/fx/FxBudget.js', 'reserveFx, fxBudgetStats');
const scene = makeScene();
assert.equal(reserveFx(scene, 54), 54, 'isolated mobile missile volley retains secondary particles');
assert.equal(reserveFx(scene, 30), 10, 'concurrent effects share one budget');
assert.equal(fxBudgetStats(scene).skipped, 20);
scene.time.now = 100;
assert.equal(reserveFx(scene, 30), 18, 'budget recovers over time');
assert.equal(reserveFx(makeScene(), 64), 64, 'scenes are isolated');
scene.events.emit('shutdown');
assert.equal(reserveFx(scene, 64), 64, 'restart resets budget');

const { shotTrailPool } = load('src/fx/ShotTrailPool.js', 'shotTrailPool');
const trails = makeScene();
const pool = shotTrailPool(trails);
const bullet = Object.assign(new EventEmitter(), {
  active: true, x: 5, y: 10, texture: { key: 'bullet' }, frame: { name: 3 }, scaleX: 2, scaleY: 1, rotation: 0.8
});
pool.emit(bullet, 0xff0000, 1);
assert.equal(trails.images.length, 2);
assert.deepEqual(Array.from(trails.images[0].texture), ['bullet', 3]);
trails.time.timeScale = 0;
trails.events.emit('update', 0, 500);
assert.ok(trails.images.every(image => image.active), 'console pause freezes trails');
trails.time.timeScale = 1;
trails.events.emit('update', 0, 151);
assert.ok(trails.images.every(image => !image.active && !image.visible));
pool.emit(bullet, 0x00ff00, 1);
assert.equal(trails.images.length, 2, 'next emission reuses images');
assert.equal(trails.images[1].tint, 0x00ff00, 'reused state is reset');
for (let i = 0; i < 200; i++) pool.emit(bullet, 0, 1);
assert.equal(trails.images.length, 160, 'pool has a hard mobile bound');
trails.events.emit('shutdown');
assert.ok(trails.images.every(image => image.destroyed));
assert.equal(trails.events.listenerCount('update'), 0);
assert.notEqual(shotTrailPool(trails), pool, 'restart creates fresh pool');

let emissions = 0;
const { attachShotTrail } = load('src/fx/ShotFx.js', 'attachShotTrail', {
  reserveFx, shotTrailPool: () => ({ emit() { emissions++; } })
});
const timing = makeScene();
attachShotTrail(timing, bullet, 0xffffff);
assert.equal(timing.timers[0].delay, 50);
timing.timers[0].callback(); timing.timers[0].callback();
assert.equal(emissions, 1, 'late timer ticks cannot create a burst in one frame');
timing.time.now = 50; timing.timers[0].callback();
assert.equal(emissions, 2);
bullet.emit('destroy');
assert.ok(timing.timers[0].removed, 'destroy cancels trail timer immediately');
let wallTime = 100;
const consoleCode = fs.readFileSync('src/systems/DevConsole.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default class', 'class');
const DevConsole = vm.runInNewContext(`${consoleCode}\nDevConsole`, {
  fxBudgetStats, document: { hidden: false }, performance: { now: () => wallTime }
});
const dev = Object.create(DevConsole.prototype);
const logs = [];
dev.scene = makeScene(); dev.isOpen = true; dev._log = line => logs.push(line);
dev._run('perf start');
dev.scene.events.emit('preupdate');
assert.equal(dev._perf.count, 0, 'console-open frames are excluded');
dev.isOpen = false;
for (let i = 0; i < 1900; i++) {
  wallTime += 20; dev.scene.events.emit('preupdate');
}
dev.isOpen = true; dev.scene.events.emit('preupdate');
dev._run('perf stop');
assert.ok(logs.some(line => line.includes('1800 frames') && line.includes('p95 20.0 ms')));
assert.equal(dev.scene.events.listenerCount('preupdate'), 0, 'capture detaches on stop');
console.log('FX performance: budget, pooling, pause, restart and timer cleanup passed.');
