const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const callbacks = {};
const frames = [];
let refreshes = 0;
let visible = true;
const container = { style: {}, getBoundingClientRect: () => ({ width: visible ? 800 : 0 }) };
const viewport = { width: 800, height: 350, offsetLeft: 0, offsetTop: 0,
  addEventListener: (name, fn) => { callbacks[`visual:${name}`] = fn; } };
const windowMock = { visualViewport: viewport, innerWidth: 800, innerHeight: 400,
  __nineLivesGame: { scale: { refresh: () => refreshes++ } },
  requestAnimationFrame: fn => frames.push(fn),
  addEventListener: (name, fn) => { callbacks[name] = fn; } };
vm.runInNewContext(fs.readFileSync('src/systems/ViewportSizing.js', 'utf8').replace('export ', '') + '\ninstallViewportSizing();', {
  window: windowMock,
  document: { getElementById: () => container, addEventListener: (name, fn) => { callbacks[name] = fn; } }
});
assert.equal(container.style.height, '350px');
viewport.height = 400;
callbacks.fullscreenchange();
callbacks['visual:resize']();
assert.equal(frames.length, 1);
frames.shift()();
assert.equal(container.style.height, '400px');
visible = false;
callbacks.orientationchange();
frames.shift()();
assert.equal(refreshes, 2);
visible = true;
windowMock.visualViewport = undefined;
callbacks.resize();
frames.shift()();
assert.equal(refreshes, 3);
assert.equal(container.style.width, '800px');

const colors = [];
const gfx = { clear() {}, fillStyle(color) { colors.push(color); }, fillRect() {},
  setDepth() { return this; }, setVisible() { return this; } };
const Marker = vm.runInNewContext(fs.readFileSync('src/fx/TeammateMarkerFx.js', 'utf8')
  .replace('export default class', 'class') + '\nTeammateMarkerFx;', {
  Phaser: { Math: { Clamp: (v, min, max) => Math.max(min, Math.min(max, v)) } }
});
const marker = new Marker({ add: { graphics: () => gfx }, cameras: { cameras: [] } });
for (let slot = 1; slot < 4; slot++) marker.setSlot(slot);
const fills = colors.filter((_, i) => i % 2 === 1);
assert.deepEqual(fills, [0x000000, 0xffffff, 0xff8a1f, 0x8b5a3c]);
assert.equal(colors[0], 0xffffff, 'Black marker needs a visible white outline');
console.log('Mobile viewport and teammate marker regressions passed.');
