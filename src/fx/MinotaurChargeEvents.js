// Small replay window for QoS 0 enemy snapshots. The 200ms swing preparation
// can be skipped by a snapshot; its impact must be an event, not a transition.
const MAX_EVENTS = 6;
const RETAIN_MS = 1600;
const KINDS = new Set(['launch', 'stop', 'swing']);

export function recordChargeEvent(boss, kind, now) {
  if (!KINDS.has(kind)) return;
  boss._chargeEventSeq = (boss._chargeEventSeq || 0) + 1;
  const events = (boss._chargeEvents || []).filter(e => now - e.at <= RETAIN_MS);
  events.push({ id: boss._chargeEventSeq, kind, x: boss.x, y: boss.y,
    dx: boss.bossChargeDir.x, dy: boss.bossChargeDir.y, rage: boss.isEnraged ? 1 : 0, at: now });
  boss._chargeEvents = events.slice(-MAX_EVENTS);
}

export function chargeEventSnapshot(boss, now) {
  return (boss._chargeEvents || []).filter(e => now - e.at <= RETAIN_MS)
    .map(e => [e.id, e.kind, Math.round(e.x), Math.round(e.y),
      e.dx, e.dy, e.rage, Math.max(0, Math.round(now - e.at))]);
}

export function readChargeEvents(events, after = 0) {
  if (!Array.isArray(events)) return [];
  return events.slice(-MAX_EVENTS).filter(e => Array.isArray(e) && e.length === 8 &&
    Number.isSafeInteger(e[0]) && e[0] > after && KINDS.has(e[1]) &&
    [e[2], e[3], e[4], e[5], e[7]].every(Number.isFinite) &&
    Math.abs(e[4]) <= 1.01 && Math.abs(e[5]) <= 1.01 &&
    (e[6] === 0 || e[6] === 1) && e[7] >= 0 && e[7] <= RETAIN_MS)
    .sort((a, b) => a[0] - b[0]);
}
