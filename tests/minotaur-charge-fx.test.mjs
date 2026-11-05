// Offline tests. No browser, game boot, renderer, audio or network connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { recordChargeEvent, chargeEventSnapshot, readChargeEvents } from '../src/fx/MinotaurChargeEvents.js';
globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 }, Textures: { FilterMode: { LINEAR: 0 } },
  Sound: { BaseSoundManager: class { play() {} } } };
const { chargePool, chargeVisualStats, chargeDirection, prepareChargeVisuals,
  cancelChargeVisuals, CHARGE_SWEEP } = await import('../src/fx/MinotaurChargeVisuals.js');
const { playMinotaurChargeWindup, playMinotaurChargeLaunch, emitMinotaurChargeTrail,
  playMinotaurChargeStop, playMinotaurChargeSwingWindup } = await import('../src/fx/MinotaurChargeFx.js');
const { playMinotaurChargeSwing } = await import('../src/fx/MinotaurChargeSwingFx.js');
const { default: SettingsManager } = await import('../src/systems/SettingsManager.js');

function sceneStub(mobile = false) {
  // EventEmitter3's explicit context differs from node's emitter.
  const emitter = new EventEmitter(), handlers = new Map();
  const events = {
    on(name, fn, ctx) { const bound = ctx ? fn.bind(ctx) : fn; handlers.set(fn, bound); emitter.on(name, bound); },
    once(name, fn, ctx) { const bound = ctx ? fn.bind(ctx) : fn; handlers.set(fn, bound); emitter.once(name, bound); },
    off(name, fn) { emitter.off(name, handlers.get(fn) || fn); },
    emit: (...args) => emitter.emit(...args),
    count: name => emitter.listenerCount(name)
  };
  const frames = new Set(), images = [], textures = new Map();
  const noOp = () => {};
  const context = new Proxy({}, { get: (_target, key) => key.startsWith('create')
    ? () => ({ addColorStop: noOp }) : noOp, set: () => true });
  const scene = {
    sys: { game: { device: { input: { touch: mobile } }, loop: { actualFps: 60 } }, isActive: () => true },
    events, time: { now: 0, timeScale: 1, paused: false }, isPaused: false,
    cameras: { main: { worldView: { x: 0, y: 0, right: 1400, bottom: 900 } } },
    textures: {
      exists: key => textures.has(key),
      createCanvas(key, w, h) {
        const texture = {
          getContext: () => context, refresh: noOp, setFilter: noOp,
          add(name, _index, x, y, fw, fh) {
            assert.ok(x >= 0 && y >= 0 && x + fw <= w && y + fh <= h, 'atlas frame stays in bounds');
            frames.add(name);
          }
        };
        textures.set(key, texture); return texture;
      }
    },
    add: { image(x, y, key, frame) {
      const img = { x, y, key, frame, destroyed: false,
        setTexture(k, f) { this.key = k; this.frame = f; return this; },
        setFrame(f) { assert.ok(frames.has(f)); this.frame = f; return this; },
        setPosition(a, b) { assert.ok(Number.isFinite(a) && Number.isFinite(b)); this.x = a; this.y = b; return this; },
        setScale(a, b) { assert.ok(Number.isFinite(a) && Number.isFinite(b)); this.scaleX = a; this.scaleY = b; return this; },
        setAlpha(a) { assert.ok(Number.isFinite(a) && a >= 0 && a <= 1); this.alpha = a; return this; },
        setRotation(a) { assert.ok(Number.isFinite(a)); this.rotation = a; return this; },
        setVisible(v) { this.visible = v; return this; }, setActive(v) { this.active = v; return this; },
        setTint(v) { this.tint = v; return this; }, setFlipX(v) { this.flipX = v; return this; },
        setOrigin() { return this; }, setDepth() { return this; }, setBlendMode(v) { this.blend = v; return this; },
        destroy() { this.destroyed = true; }
      };
      images.push(img); return img;
    } },
    frames, images,
    advance(ms) {
      for (let elapsed = 0; elapsed < ms; elapsed += 16) {
        this.time.now += 16; events.emit('update', this.time.now, 16);
      }
    }
  };
  return scene;
}

function bossStub() {
  return { x: 450, y: 300, isEnraged: false, active: true, visible: true,
    displayHeight: 256, _shadowYFrac: 0.46, scaleX: 4, scaleY: 4, flipX: false,
    texture: { key: 'minotaur_walk' }, frame: { name: 2 },
    bossChargeDir: { x: 1, y: 0 }, def: { chargeSwingRadius: 150 } };
}

test('loss of the 200ms swing state still delivers the impact once', () => {
  const boss = bossStub();
  recordChargeEvent(boss, 'launch', 0);
  recordChargeEvent(boss, 'stop', 550);
  recordChargeEvent(boss, 'swing', 750);
  // All snapshots up to 900ms were lost. Events survive in the replay window.
  const recovered = readChargeEvents(chargeEventSnapshot(boss, 900));
  assert.deepEqual(recovered.map(e => e[1]), ['launch', 'stop', 'swing']);
  assert.deepEqual(readChargeEvents(chargeEventSnapshot(boss, 1100), recovered.at(-1)[0]), []);
  assert.deepEqual(chargeEventSnapshot(boss, 2400), []);
});

test('network history is bounded and malformed payloads cannot advance sequence', () => {
  const boss = bossStub();
  for (let i = 0; i < 30; i++) recordChargeEvent(boss, 'launch', i * 10);
  assert.equal(chargeEventSnapshot(boss, 300).length, 6);
  assert.deepEqual(readChargeEvents([[999, 'swing', NaN, 0, 1, 0, 0, 0],
    [1000, 'swing', 0, 0, 1, 0, 0, -1], [1001, 'bad', 0, 0, 1, 0, 0, 0]]), []);
  boss._chargeEventSeq = 80; // promoted replica continues the sequence
  recordChargeEvent(boss, 'swing', 400);
  assert.equal(chargeEventSnapshot(boss, 400).at(-1)[0], 81);
});

test('atlas is baked once with eight sweep frames; directions include vertical dash', () => {
  const scene = sceneStub();
  prepareChargeVisuals(scene); prepareChargeVisuals(scene);
  assert.equal(scene.frames.size, 16);
  assert.ok(scene.frames.has('blade7'));
  assert.deepEqual(chargeDirection({ x: 0, y: -4 }), { x: 0, y: -1, angle: -Math.PI / 2 });
  assert.deepEqual(chargeDirection({ x: 0, y: 0 }), { x: 1, y: 0, angle: 0 });
  assert.ok(Math.abs(CHARGE_SWEEP - 300 * Math.PI / 180) < 1e-10);
});

for (const mobile of [false, true]) test('pool stays bounded, reuses images and cleans up: ' + (mobile ? 'mobile' : 'desktop'), () => {
  const scene = sceneStub(mobile), pool = chargePool(scene);
  for (let i = 0; i < 1000; i++) pool.emit('halo', 500, 400, { life: 100 });
  const cap = mobile ? 72 : 128;
  assert.equal(scene.images.length, cap);
  assert.equal(chargeVisualStats(scene).active, cap);
  assert.ok(pool.emit('boundary', 500, 400, { essential: true, life: 100 }), 'important effect replaces an expendable detail');
  scene.advance(150);
  assert.equal(chargeVisualStats(scene).active, 0);
  pool.emit('halo', 500, 400);
  assert.equal(scene.images.length, cap, 'reuses the previous allocation');
  assert.equal(scene.events.count('update'), 1);
  scene.events.emit('shutdown');
  assert.equal(scene.events.count('update'), 0);
  assert.ok(scene.images.every(i => i.destroyed));
});

test('pause, cancellation and texture state survive reuse', () => {
  const scene = sceneStub(), pool = chargePool(scene), boss = bossStub();
  const e = pool.emit('halo', 500, 400, { texture: 'minotaur_walk', frame: 2,
    flipX: true, add: true, owner: boss, tag: 'windup', delay: 50, life: 100 });
  scene.isPaused = true; scene.advance(200); assert.equal(e.age, -50);
  scene.isPaused = false; scene.time.timeScale = 0; scene.advance(200); assert.equal(e.age, -50);
  cancelChargeVisuals(scene, boss, 'windup');
  const reused = pool.emit('dust', 500, 400);
  assert.equal(e.image, reused.image);
  assert.equal(reused.image.frame, 'dust'); assert.equal(reused.image.flipX, false);
  assert.equal(reused.image.blend, Phaser.BlendModes.NORMAL);
  assert.equal(pool.emit('halo', 9000, 9000), null, 'offscreen effects are culled');
  scene.events.emit('shutdown');
});

test('both phases complete their charge and swing offline without timers or tweens', () => {
  for (const mobile of [false, true]) for (const rage of [false, true]) {
    const scene = sceneStub(mobile), boss = bossStub(); boss.isEnraged = rage;
    const duration = rage ? 585 : 1300;
    playMinotaurChargeWindup(scene, boss.x, boss.y, boss.bossChargeDir, rage, duration, boss);
    scene.advance(duration);
    playMinotaurChargeLaunch(scene, boss.x, boss.y, boss.bossChargeDir, rage, boss);
    for (let i = 0; i < 8; i++) {
      boss.x += 43;
      emitMinotaurChargeTrail(scene, boss.x, boss.y, boss.bossChargeDir, rage, i % 2 ? -1 : 1, i, boss);
      scene.advance(70);
    }
    playMinotaurChargeStop(scene, boss.x, boss.y, boss.bossChargeDir, rage, boss);
    playMinotaurChargeSwingWindup(scene, boss, 200); scene.advance(200);
    playMinotaurChargeSwing(scene, boss.x, boss.y, 195, rage, boss.bossChargeDir);
    scene.advance(3200);
    const stats = chargeVisualStats(scene);
    assert.equal(stats.active, 0);
    assert.equal(stats.dropped, 0, 'one full attack fits the configured capacity');
    assert.ok(stats.peak <= (mobile ? 72 : 128));
    scene.events.emit('shutdown');
  }
});

test('reduced flashes attenuate light without hiding the geometry', () => {
  const scene = sceneStub();
  const original = SettingsManager.values.reducedFlashes;
  try {
    SettingsManager.values.reducedFlashes = true;
    const e = chargePool(scene).emit('boundary', 400, 300, { add: true, alpha: 1 });
    assert.equal(e.image.alpha, 0.55);
  } finally { SettingsManager.values.reducedFlashes = original; scene.events.emit('shutdown'); }
});
