const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let now = 1000;
const timeOrigin = 1700000000000;
const source = fs.readFileSync('src/ui/LevelUpUI.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default class', 'class');
const UI = vm.runInNewContext(source + '\nLevelUpUI;', {
  performance: { now: () => now, timeOrigin }, EventBus: { emit() {} }
});
function makeUI(touch) {
  const ui = Object.create(UI.prototype);
  const container = { visible: true, removeAll() {}, add() {}, setScrollFactor() { return this; } };
  ui.container = container;
  ui._applyZoomCompensation = () => {};
  ui.scene = {
    sys: { game: { device: { input: { touch } } } },
    physics: { pause() {} }, time: { timeScale: 1 }, scale: { width: 1024, height: 576 },
    add: { rectangle: () => container, container: () => container }
  };
  ui._openOverlay();
  return ui;
}
const mobile = makeUI(true);
assert.equal(mobile.scene.time.timeScale, 0);
assert.equal(mobile._canSelect({ downTime: now }), true, 'Immediate intentional touch is accepted');
now = 4000;
mobile._openOverlay();
assert.equal(mobile._canSelect({ downTime: 900 }), false, 'Touch from gameplay');
assert.equal(mobile._canSelect({ downTime: 3999 }), false, 'Queued touch from before overlay');
assert.equal(mobile._canSelect({ downTime: timeOrigin + now }), true);
assert.equal(mobile._canSelect(), false);
// All three actions must return before applying changes or playing sound.
mobile._choose({ id: 'test' }, { downTime: 900 });
mobile._chooseEvolution({ id: 'test' }, { downTime: 900 });
mobile._restock({ downTime: 900 });
mobile._openOverlay();
assert.equal(mobile._canSelect({ downTime: now }), true, 'Next level accepts an immediate new touch');
const desktop = makeUI(false);
assert.equal(desktop._canSelect({ downTime: now }), true, 'Desktop has no delay');
desktop.container.visible = false;
assert.equal(desktop._canSelect({ downTime: now }), false);
console.log('Level-up touch delay and stale touch regressions passed.');
