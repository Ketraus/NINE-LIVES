const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/ui/ResultUI.js', 'utf8');
const start = source.indexOf('  _buildButtons() {');
const end = source.indexOf('\n  }', start) + 4;
const buildButtons = vm.runInNewContext(`({${source.slice(start, end)}})`, {
  COLOR: { dim: '#6b8894' },
  EVALUATION_FORM_URL: 'https://evaluation.example/form',
  window: { open(url) { this.openedUrl = url; } }
})._buildButtons;

function createResultUi(isMultiplayer) {
  const buttons = [];
  const navigations = [];
  const ui = {
    scene: {
      hasWon: false,
      multiplayer: isMultiplayer ? { isMultiplayer: true } : null,
      sys: { game: { device: { input: { touch: true } } } },
      input: { keyboard: { once() {} } },
      scene: { start(sceneName) { navigations.push(sceneName); } },
      _restartOrGoToWeaponSelect() {},
      tweens: { add() {} }
    },
    _sfx() {},
    _txt() { return { setAlpha() { return this; } }; },
    _button(_x, _y, label, onSelect) {
      const button = {
        label,
        onSelect,
        labelText: {
          setText(value) { button.label = value; return this; },
          setColor() { return this; },
          setAlpha() { return this; }
        },
        hitArea: {
          enabled: true,
          disableInteractive() { this.enabled = false; },
          setInteractive() { this.enabled = true; }
        }
      };
      buttons.push(button);
      return button;
    }
  };
  buildButtons.call(ui);
  return { buttons, navigations };
}

const multiplayer = createResultUi(true);
const multiplayerMenu = multiplayer.buttons[1];
assert.equal(multiplayerMenu.label, 'AVALIE PARA MENU');
assert.equal(multiplayerMenu.hitArea.enabled, false);
multiplayerMenu.onSelect();
assert.deepEqual(multiplayer.navigations, [], 'multiplayer cannot return before opening evaluation');

multiplayer.buttons[2].onSelect();
assert.equal(multiplayerMenu.label, 'MENU');
assert.equal(multiplayerMenu.hitArea.enabled, true);
multiplayerMenu.onSelect();
assert.deepEqual(multiplayer.navigations, ['MainMenuScene']);

const solo = createResultUi(false);
assert.equal(solo.buttons[1].label, 'MENU');
solo.buttons[1].onSelect();
assert.deepEqual(solo.navigations, ['MainMenuScene'], 'solo menu behavior remains unchanged');

console.log('Result UI evaluation gate: multiplayer return is gated; solo remains unchanged.');
