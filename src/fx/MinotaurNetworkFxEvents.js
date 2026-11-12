const MAX_EVENTS = 8;
const RETAIN_MS = 1800;
export const MAX_NETWORK_FX_AGE_MS = 900;

const KINDS = new Set([
  'cleave',
  'stomp',
  'leap',
  'leap-takeoff',
  'axe-launch',
  'axe-beep',
  'axe-explosion',
  'axe-catch',
  'meteor-impact'
]);

export function recordMinotaurFxEvent(boss, kind, x, y, a = 0, b = 0, now = boss.scene.time.now) {
  if (!KINDS.has(kind) || ![x, y, a, b, now].every(Number.isFinite)) return;
  boss._networkFxEventSequence = (boss._networkFxEventSequence || 0) + 1;
  const events = (boss._networkFxEvents || []).filter((event) => now - event.at <= RETAIN_MS);
  events.push({
    id: boss._networkFxEventSequence,
    kind,
    x,
    y,
    a,
    b,
    rage: boss.isEnraged ? 1 : 0,
    at: now
  });
  boss._networkFxEvents = events.slice(-MAX_EVENTS);
}

export function minotaurFxEventSnapshot(boss, now) {
  return (boss._networkFxEvents || [])
    .filter((event) => now - event.at <= RETAIN_MS)
    .map((event) => [
      event.id,
      event.kind,
      Math.round(event.x),
      Math.round(event.y),
      event.a,
      event.b,
      event.rage,
      Math.max(0, Math.round(now - event.at))
    ]);
}

export function readMinotaurFxEvents(events, after = 0) {
  if (!Array.isArray(events)) return [];
  return events.slice(-MAX_EVENTS).filter((event) =>
    Array.isArray(event) &&
    event.length === 8 &&
    Number.isSafeInteger(event[0]) &&
    event[0] > after &&
    KINDS.has(event[1]) &&
    [event[2], event[3], event[4], event[5], event[7]].every(Number.isFinite) &&
    (event[6] === 0 || event[6] === 1) &&
    event[7] >= 0 &&
    event[7] <= RETAIN_MS
  ).sort((a, b) => a[0] - b[0]);
}

export function rememberMinotaurFxEvent(boss, event, now) {
  const [id, kind, x, y, a, b, rage, age] = event;
  boss._networkFxEventSequence = Math.max(boss._networkFxEventSequence || 0, id);
  const events = (boss._networkFxEvents || []).filter((item) =>
    item.id !== id && now - item.at <= RETAIN_MS
  );
  events.push({ id, kind, x, y, a, b, rage, at: now - age });
  boss._networkFxEvents = events.slice(-MAX_EVENTS);
}
