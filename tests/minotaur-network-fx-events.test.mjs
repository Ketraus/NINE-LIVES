import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NETWORK_FX_AGE_MS,
  minotaurFxEventSnapshot,
  readMinotaurFxEvents,
  recordMinotaurFxEvent,
  rememberMinotaurFxEvent
} from '../src/fx/MinotaurNetworkFxEvents.js';

test('network FX events are replayable once and retain sequence across promotion', () => {
  const boss = { isEnraged: true, scene: { time: { now: 1000 } } };
  recordMinotaurFxEvent(boss, 'cleave', 100.4, 200.6, Math.PI / 3, 0);
  boss.scene.time.now = 1200;
  recordMinotaurFxEvent(boss, 'meteor-impact', 300, 400, -1, 0);

  const snapshot = minotaurFxEventSnapshot(boss, boss.scene.time.now);
  assert.equal(snapshot.length, 2);
  assert.deepEqual(snapshot[0].slice(0, 4), [1, 'cleave', 100, 201]);
  assert.equal(snapshot[0][7], 200, 'events carry their age for bounded replay');
  assert.deepEqual(readMinotaurFxEvents(snapshot, 1).map((event) => event[1]), ['meteor-impact']);
  assert.deepEqual(readMinotaurFxEvents(snapshot, 2), [], 'replayed event IDs are ignored');
  assert.equal(readMinotaurFxEvents([[3, 'unknown', 0, 0, 0, 0, 0, 0]]).length, 0);

  const replica = {};
  rememberMinotaurFxEvent(replica, snapshot[0], 1300);
  assert.equal(replica._networkFxEventSequence, 1);
  assert.equal(minotaurFxEventSnapshot(replica, 1400)[0][7], 300);
  assert.equal(MAX_NETWORK_FX_AGE_MS, 900);
});

test('network FX history is bounded and expires old events', () => {
  const boss = { isEnraged: false, scene: { time: { now: 0 } } };
  for (let i = 0; i < 12; i++) {
    boss.scene.time.now = i * 100;
    recordMinotaurFxEvent(boss, 'stomp', i, i, 50, 0);
  }
  assert.equal(minotaurFxEventSnapshot(boss, 1100).length, 8);
  assert.equal(minotaurFxEventSnapshot(boss, 3000).length, 0);
});
