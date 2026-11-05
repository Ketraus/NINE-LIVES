import {
  CHARGE_SWEEP, CHARGE_PALETTES, prepareChargeVisuals, chargePool,
  chargeDirection, chargeDetailCount
} from './MinotaurChargeVisuals.js';

// The old four-ring strip is no longer stretched into one sprite.
// The new blade uses eight baked, directional sweep frames.
export function prepareMinotaurChargeSwing(scene) { prepareChargeVisuals(scene); }

export function playMinotaurChargeSwing(scene, x, y, radius, rage = false, direction = { x: 1, y: 0 }) {
  if (!scene?.sys?.isActive()) return;
  const pool = chargePool(scene), c = CHARGE_PALETTES[Number(!!rage)];
  const facing = chargeDirection(direction).angle;
  const scale = radius / 112;
  // Full damage boundary appears on the impact frame. The blade then travels
  // across it, leaving the same 60-degree safe opening behind the Minotaur.
  pool.emit('boundary', x, y, { tint: c.hot, add: true, depth: 19,
    sx: scale, ex: scale * 1.025, rotation: facing,
    life: 210, alpha: 0.9, essential: true });
  pool.emit('blade0', x, y, { tint: c.energy, add: true, depth: 20,
    sx: scale, ex: scale, rotation: facing, life: 310, sweep: 145,
    hold: 0.5, alpha: 1, essential: true });
  pool.emit('blade0', x, y, { tint: c.hot, add: true, depth: 21,
    sx: scale * 0.98, ex: scale * 0.98, rotation: facing,
    life: 205, sweep: 145, hold: 0.55, alpha: 0.72, essential: true });
  pool.emit('scar', x, y, { tint: 0x100f1a, depth: 2.6, sx: scale,
    rotation: facing, life: 2700, hold: 0.55, alpha: 0.85, essential: true });
  pool.emit('scar', x, y, { tint: c.energy, add: true, depth: 2.7, sx: scale,
    rotation: facing, life: 850, hold: 0.1, alpha: rage ? 0.62 : 0.45 });
  // Impacto final: clarão branco-quente seco, eco escuro do arco (peso), onda de pressão
  // que continua além do raio e rachaduras de chão ao longo do corte.
  pool.emit('halo', x, y, { tint: c.hot, add: true, depth: 19, sx: scale * 0.5, sy: scale * 0.5,
    ex: scale * 1.7, ey: scale * 1.7, rotation: 0, life: 120, alpha: 0.85, essential: true });
  pool.emit('blade0', x, y, { tint: c.deep, depth: 19.5, sx: scale * 1.06, ex: scale * 1.1,
    rotation: facing, life: 380, sweep: 190, hold: 0.45, alpha: 0.7, essential: true });
  pool.emit('boundary', x, y, { tint: c.energy, add: true, depth: 19, sx: scale * 0.95,
    ex: scale * 1.38, rotation: facing, life: 300, alpha: 0.75, essential: true });
  pool.emit('boundary', x, y, { tint: c.hot, add: true, depth: 21, sx: scale * 0.9,
    ex: scale * 1.2, rotation: facing, life: 170, alpha: 0.9, delay: 40 });
  // A local, short contact flash; the centre clears before the blade finishes.
  pool.emit('flare', x, y + 22, { tint: c.hot, add: true, depth: 18,
    sx: 0.3, sy: 0.16, ex: 1.1, ey: 0.35, rotation: facing,
    alpha: 0.8, life: 110 });
  const n = chargeDetailCount(scene, rage ? 24 : 20);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.35) / n;
    const a = facing - CHARGE_SWEEP / 2 + CHARGE_SWEEP * t;
    const r = radius * (0.77 + Math.random() * 0.16);
    const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r;
    // Tangential fragments sell a CUT; radial rings alone read as an explosion.
    const tangent = a + Math.PI / 2;
    const d = 40 + Math.random() * 70;
    pool.emit('streak', sx, sy, { tint: i % 3 ? c.energy : c.hot,
      add: true, depth: 22, sx: 0.3, sy: 0.18, ex: 0.04, ey: 0.03,
      rotation: tangent, spin: 0.2, dx: Math.cos(tangent) * d,
      dy: Math.sin(tangent) * d, lift: 5 + Math.random() * 12,
      delay: t * 110, life: 230 + Math.random() * 140, alpha: 0.95 });
    if (i % 2 === 0) pool.emit('dust', sx, sy + 10, { tint: c.dust, depth: 8,
      sx: 0.3, sy: 0.18, ex: 0.8, ey: 0.4,
      dx: Math.cos(a) * 24, dy: Math.sin(a) * 16, lift: 8,
      delay: t * 100, life: 530, alpha: 0.65 });
  }
}
