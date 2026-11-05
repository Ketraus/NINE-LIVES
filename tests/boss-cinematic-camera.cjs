const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/export default class/g, 'class').replace(/export const/g, 'const');
const Camera = vm.runInNewContext(read('src/systems/BossCinematicCamera.js') + '\nBossCinematicCamera;');
const timers = [];
let shutdown;
const player = { x: 100, y: 200, active: true };
const pans = [];
const cam = {
  _follow: player, roundPixels: true, lerp: { x: .15, y: .2 }, followOffset: { x: 2, y: 3 },
  midPoint: { x: 100, y: 200 }, panEffect: { reset() {} },
  stopFollow() { this._follow = null; },
  pan(...args) { pans.push(args); },
  startFollow(...args) { this.restored = args; this._follow = args[0]; }
};
const scene = { cameras: { main: cam }, events: { once(_event, fn) { shutdown = fn; } },
  time: { delayedCall(ms, fn) { const timer = { ms, fn, remove() { this.removed = true; } }; timers.push(timer); return timer; } } };
const camera = new Camera(scene);
camera.focus({ x: 9000, y: 8000 });
assert.equal(cam._follow, null);
assert.deepEqual(pans[0].slice(0, 3), [9000, 8000, 600]);
camera.focus({ x: 9100, y: 8100 });
assert.ok(timers[0].removed);
player.x = 500;
camera.release();
assert.deepEqual(pans.at(-1).slice(0, 2), [500, 200]);
pans.at(-1)[5](cam, 1);
assert.deepEqual(cam.restored, [player, true, .15, .2, 2, 3]);
camera.focus({ x: 9000, y: 8000 });
shutdown(); assert.equal(cam._follow, player);
camera.focus({ x: 9000, y: 8000 });
timers.at(-1).fn(); assert.equal(camera.saved, null, 'Missing release cue has recovery');

let tremors = 0;
const Director = vm.runInNewContext(read('src/roguelike/SpawnDirector.js') + '\nSpawnDirector;', {
  BOSS_CAMERA_TRAVEL_MS: 600,
  playBossTremor: () => { tremors++; return { stop() {} }; },
  MusicManager: { playBoss() {} }
});
const director = Object.create(Director.prototype);
Object.assign(director, { scene, bossCamera: camera, authorityActive: false, authorityGeneration: 1 });
director._startBossTensionBuildup = (...args) => { director.buildup = args; };
director.playNetworkCinematic({ kind: 'boss-focus', epicenter: { x: 9000, y: 8000 }, ageMs: 100 });
assert.equal(timers.at(-1).ms, 500);
const pendingTremor = timers.at(-1);
director.playNetworkCinematic({ kind: 'boss-buildup', epicenter: { x: 9000, y: 8000 }, ageMs: 700 });
assert.equal(director.buildup[2], true); assert.equal(director.buildup[3], 700);
pendingTremor.fn(); assert.equal(tremors, 0, 'Old phase callback cannot restart tremor');
director.playNetworkCinematic({ kind: 'boss-impact' });
director.playNetworkCinematic({ kind: 'boss-release' }); assert.equal(camera.saved, null);

const Manager = vm.runInNewContext(read('src/systems/MultiplayerManager.js') + '\nMultiplayerManager;');
const manager = Object.create(Manager.prototype);
let received = 0;
Object.assign(manager, { seenCinematics: new Set(), isRoomHost: false,
  scene: { playNetworkCinematic(cue) { received++; assert.equal(cue.ageMs, 250); } } });
const cue = { id: 'test', kind: 'boss-focus', epicenter: { x: 9000, y: 8000 }, ageMs: 250 };
manager._applyHostCinematic(cue); manager._applyHostCinematic(cue);
assert.equal(received, 1, 'Heartbeat replay does not restart camera');
console.log('Boss camera: travel, restore, shutdown, recovery, phase transitions and replay passed.');
