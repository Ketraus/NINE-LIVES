const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const callbacks = {};
const frames = [];
let refreshes = 0;
let visible = true;
const container = { style: {}, classList: { add() {} }, getBoundingClientRect: () => ({ width: visible ? 800 : 0 }) };
const viewport = { width: 800, height: 350, offsetLeft: 0, offsetTop: 0,
  addEventListener: (name, fn) => { callbacks[`visual:${name}`] = fn; } };
const windowMock = { visualViewport: viewport, innerWidth: 800, innerHeight: 400,
  __nineLivesGame: { scale: { refresh: () => refreshes++ } },
  requestAnimationFrame: fn => frames.push(fn),
  addEventListener: (name, fn) => { callbacks[name] = fn; } };
const sizingSource = fs.readFileSync('src/systems/ViewportSizing.js', 'utf8').replace('export ', '');
// Desktop must not read/write DOM sizing or register mobile resize handlers.
vm.runInNewContext(sizingSource + '\ninstallViewportSizing(false);', {});
vm.runInNewContext(sizingSource + '\ninstallViewportSizing(true);', {
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

const configSource = fs.readFileSync('src/config/gameConfig.js', 'utf8');
const dependencies = Object.fromEntries([...configSource.matchAll(/^import (\w+) from/gm)]
  .map(([, name]) => [name, class {}]));
function configFor(coarse) {
  return vm.runInNewContext(configSource.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\ngameConfig;', {
    ...dependencies, BASE_WIDTH: 1024, BASE_HEIGHT: 576,
    window: { innerWidth: 1920, innerHeight: 1080, matchMedia: () => ({ matches: coarse }) },
    navigator: { maxTouchPoints: coarse ? 1 : 0 }, document: { documentElement: 'root' },
    Phaser: { AUTO: 'auto', Scale: { FIT: 'fit', CENTER_BOTH: 'center' } }
  });
}
const desktopScale = configFor(false).scale;
assert.equal('expandParent' in desktopScale, false, 'Desktop retains Phaser defaults');
assert.equal('fullscreenTarget' in desktopScale, false, 'Desktop retains original fullscreen wrapper');
assert.equal(configFor(true).scale.fullscreenTarget, 'root');
assert.equal(configFor(true).scale.expandParent, false);

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
