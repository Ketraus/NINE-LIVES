import test from 'node:test';
import assert from 'node:assert/strict';
import { runMinotaurCommand, minotaurCompletions, MINO_HELP } from '../src/systems/MinotaurDevCommands.js';
import { MINO_ATTACKS, updateMinotaurDevControl } from '../src/systems/MinotaurDevControl.js';

function fixture() {
  const calls = [], logs = [], bosses = [];
  const scene = {
    time: { now: 1000 }, tweens: { killTweensOf() {} },
    player: { active: true, x: 20, y: 40 }, devConsole: { isOpen: true },
    enemySpawner: { group: { getChildren: () => bosses }, frozen: false,
      spawnByDefId() { bosses.push(makeBoss('minotaur_1')); },
      _findBossSpawnPosition: () => ({ x: 250, y: 300 }) }
  };
  function makeBoss(id) {
    const b = { id, active: true, visible: true, scene, x: 100, y: 100,
      baseScale: 4, isEnraged: false, bossState: 'chasing', meteors: [], rageHpThreshold: 0.45,
      def: { id: 'minotaur', meteorFirstDelayMs: 1200 },
      healthSystem: { current: 3000, maxHp: 3000, isDead() { return this.current <= 0; } },
      setVisible(v) { this.visible = v; return this; }, setScale() { return this; }, clearTint() { return this; },
      shadow: { setVisible() {} }, _moveTo() {}, _freezeVisual() {}, _stopChargeFootsteps() {},
      _refreshBossVisual() { calls.push('refresh'); },
      _cancelActionsForFlee() { this.axePhase = null; this.bossState = 'chasing'; },
      _clearMeteors() { this.meteors.length = 0; }, _clearLeap() {},
      _onHealthChange(current, max) { if (!this.isEnraged && current <= max * 0.45) this._tfPending = true; }
    };
    b.body = { enable: true, reset(x, y) { b.x = x; b.y = y; } };
    for (const [attack, method] of Object.entries({ investida: '_startCharge', giro: '_startSwing',
      machado: '_startAxeThrow', corte: '_startCleave', pisao: '_startStomp', salto: '_startLeap',
      meteoro: '_spawnMeteor', transformar: '_beginTransformation' })) {
      b[method] = () => { calls.push(attack); b.bossState = attack === 'meteoro' ? 'chasing' : attack;
        if (attack === 'meteoro') b.meteors.push({}); };
    }
    return b;
  }
  const console = { scene, _log: line => logs.push(line) };
  const run = (...args) => runMinotaurCommand(console, 'mino', args);
  return { scene, console, run, calls, logs, bosses, makeBoss };
}

test('tutorial and completion cover attacks, phase controls and toggles', () => {
  const f = fixture(); runMinotaurCommand(f.console, 'helpmino', []);
  assert.equal(f.logs.length, MINO_HELP.length);
  for (const name of MINO_ATTACKS) assert.ok(MINO_HELP.some(line => line.includes(name)));
  assert.deepEqual(minotaurCompletions('mino inv'), ['mino investida', 'mino invencivel']);
  assert.deepEqual(minotaurCompletions('mino ataque pis'), ['mino ataque pisao']);
  assert.deepEqual(minotaurCompletions('mino fase '), ['mino fase 1', 'mino fase 2']);
});

test('every attack is queued while console is open and starts exactly once after closing', () => {
  for (const name of MINO_ATTACKS) {
    const f = fixture(); f.run('spawn'); const b = f.bosses[0];
    f.run('ataque', name);
    assert.equal(b._devManual, true);
    updateMinotaurDevControl(b, f.scene.player, 1000);
    assert.ok(!f.calls.includes(name));
    f.scene.devConsole.isOpen = false;
    updateMinotaurDevControl(b, f.scene.player, 1001);
    updateMinotaurDevControl(b, f.scene.player, 1002);
    assert.equal(f.calls.filter(c => c === name).length, 1);
  }
});

test('phase changes restore health/body and cancel pending transformation and airborne state', () => {
  const f = fixture(); f.run('spawn'); const b = f.bosses[0];
  b.bossState = 'leap_air'; b.body.enable = false; b.visible = false;
  b.leapGroundX = 150; b.leapGroundY = 250;
  b.transformFx = { destroy() { f.calls.push('cancel-transform'); } };
  f.run('fase', '2');
  assert.equal(b.isEnraged, true); assert.equal(b.healthSystem.current, 1350);
  assert.equal(b.x, 150); assert.equal(b.y, 250); assert.equal(b.body.enable, true);
  assert.equal(b.visible, true); assert.equal(b.transformFx, null);
  f.run('fase', '1');
  assert.equal(b.isEnraged, false); assert.equal(b.healthSystem.current, 3000);
  assert.equal(b._tfPending, false); assert.equal(b.meteorRainActive, false);
  f.run('transformar'); assert.equal(b._devQueue, 'transformar');
  f.scene.devConsole.isOpen = false;
  updateMinotaurDevControl(b, f.scene.player, 2000);
  assert.equal(b.invulnerable, true, 'cinematic has the same immunity as the health-triggered transformation');
});

test('repeat waits until the complete attack finishes, then respects its interval', () => {
  const f = fixture(); f.run('spawn'); const b = f.bosses[0];
  f.run('repetir', 'machado', '2'); f.scene.devConsole.isOpen = false;
  updateMinotaurDevControl(b, f.scene.player, 1000);
  b.bossState = 'chasing'; b.axePhase = 'stuck';
  updateMinotaurDevControl(b, f.scene.player, 9000);
  assert.equal(f.calls.filter(c => c === 'machado').length, 1);
  b.axePhase = null;
  updateMinotaurDevControl(b, f.scene.player, 10000);
  updateMinotaurDevControl(b, f.scene.player, 11999);
  assert.equal(f.calls.filter(c => c === 'machado').length, 1);
  updateMinotaurDevControl(b, f.scene.player, 12000);
  assert.equal(f.calls.filter(c => c === 'machado').length, 2);
  f.run('parar'); assert.equal(b._devRepeat, null); assert.equal(b._devQueue, null);
});

test('invalid arguments and frozen arena do not interrupt an existing test', () => {
  const f = fixture(); f.run('spawn'); const b = f.bosses[0];
  f.run('investida'); const revision = b._devRevision;
  for (const args of [['repetir', 'investida', 'NaN'], ['repetir', 'giro', '0'],
    ['repetir', 'giro', '999'], ['vida', '-5'], ['vida', '101%'], ['fase', '3'],
    ['invencivel', 'yes'], ['ataque', 'banana']]) f.run(...args);
  assert.equal(b._devRevision, revision); assert.equal(b._devQueue, 'investida');
  f.scene.enemySpawner.frozen = true; f.run('machado');
  assert.equal(b._devQueue, 'investida');
});

test('selection does not silently switch after the selected boss dies; spawn reuses a live boss', () => {
  const f = fixture(); f.run('spawn'); f.run('spawn'); assert.equal(f.bosses.length, 1);
  f.bosses.push(f.makeBoss('minotaur_2')); f.run('selecionar', 'minotaur_2');
  f.bosses[1]._deathSequenceStarted = true; f.run('investida');
  assert.equal(f.bosses[0]._devQueue, null);
  assert.match(f.logs.at(-1), /morreu/);
  f.run('spawn'); assert.equal(f.console._minoSelectedId, 'minotaur_1');
});

test('client mutations are refused but help remains available', () => {
  const f = fixture(); f.scene.multiplayer = { isMultiplayer: true, isRoomHost: false };
  f.run('spawn'); assert.equal(f.bosses.length, 0); assert.match(f.logs.at(-1), /host/);
  runMinotaurCommand(f.console, 'fase2', []); assert.match(f.logs.at(-1), /host/);
  runMinotaurCommand(f.console, 'helpmino', []); assert.ok(f.logs.includes(MINO_HELP[0]));
});

test('health, immunity, rain, auto and reset controls have explicit reversible effects', () => {
  const f = fixture(); f.run('spawn'); const b = f.bosses[0];
  f.run('invencivel', 'on'); assert.equal(b.invulnerable, true);
  f.run('vida', '40%'); assert.equal(b.healthSystem.current, 1200); assert.equal(b._tfPending, true);
  f.run('fase', '2'); f.run('meteoros', 'on'); assert.equal(b.meteorRainActive, true);
  f.run('curar'); assert.equal(b.isEnraged, true); assert.equal(b.healthSystem.current, 3000);
  f.run('auto'); assert.equal(b._devManual, false); assert.equal(b._devInvulnerable, true);
  assert.equal(b.meteorRainActive, true);
  f.run('reset'); assert.equal(b._devManual, true); assert.equal(b._devInvulnerable, false);
  assert.equal(b.isEnraged, false); assert.equal(b.meteorRainActive, false);
  f.run('trazer'); assert.equal(b.x, 250); assert.equal(b.y, 300);
});
