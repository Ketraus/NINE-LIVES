// Orçamento compartilhado apenas para detalhes; corpos, clarões e avisos ficam intactos.
const states = new WeakMap();

function stateFor(scene) {
  let state = states.get(scene);
  if (state) return state;
  const mobile = !!scene.sys.game.device.input.touch;
  state = { capacity: mobile ? 64 : 192, rate: mobile ? 180 : 600,
    tokens: mobile ? 64 : 192, now: scene.time.now, skipped: 0 };
  states.set(scene, state);
  scene.events.once('shutdown', () => states.delete(scene));
  return state;
}

export function reserveFx(scene, requested) {
  const state = stateFor(scene);
  const now = scene.time.now;
  state.tokens = Math.min(state.capacity,
    state.tokens + Math.max(0, now - state.now) * state.rate / 1000);
  state.now = now;
  const count = Math.min(requested, Math.floor(state.tokens));
  state.tokens -= count;
  state.skipped += requested - count;
  return count;
}

export function fxBudgetStats(scene) {
  const state = stateFor(scene);
  return { skipped: state.skipped };
}
