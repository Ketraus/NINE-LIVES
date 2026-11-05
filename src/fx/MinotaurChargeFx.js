// Investida: compressão -> ruptura -> esteira de pressão -> frenagem.
// Texturas compartilhadas e partículas recicladas; nenhum tween por partícula.
import {
  CHARGE_PALETTES, chargePool, chargeDirection, chargeDebris,
  chargeDetailCount, cancelChargeVisuals
} from './MinotaurChargeVisuals.js';

function footOffset(boss) {
  return boss ? boss.displayHeight * (boss._shadowYFrac ?? 0.46) - 5 : 45;
}

export function playMinotaurChargeWindup(scene, x, y, direction, rage = false, duration = 600, boss = null) {
  if (!scene?.sys?.isActive()) return;
  const pool = chargePool(scene), c = CHARGE_PALETTES[Number(!!rage)];
  const dir = chargeDirection(direction), gy = y + footOffset(boss);
  const owner = boss || {};
  cancelChargeVisuals(scene, owner, 'windup');
  const shared = { owner, tag: 'windup', life: duration, hold: 0.87, fadeIn: 70, essential: true };
  // Energy pulls inward while the body stays readable above the ground.
  pool.emit('halo', x, gy, { ...shared, tint: c.deep, depth: 3, sx: 1.8, sy: 0.72,
    ex: 0.85, ey: 0.34, alpha: 0.8, ease: 'in' });
  pool.emit('boundary', x, gy, { ...shared, tint: c.energy, add: true, depth: 6,
    sx: 0.9, sy: 0.38, ex: 0.34, ey: 0.15, alpha: 0.65, ease: 'in' });
  pool.emit('halo', x, y, { ...shared, tint: c.energy, add: true, depth: 8.5,
    sx: 0.6, sy: 0.7, ex: 0.85, ey: 1.05, alpha: rage ? 0.4 : 0.3, ease: 'in' });
  const n = chargeDetailCount(scene, 10);
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const back = 75 + (i % 4) * 26;
    const lateral = side * (30 + (i % 3) * 13);
    const sx = x - dir.x * back - dir.y * lateral;
    const sy = gy - dir.y * back + dir.x * lateral * 0.5;
    pool.emit('streak', sx, sy, { owner, tag: 'windup', tint: i % 3 ? c.energy : c.hot,
      add: true, depth: 8, sx: 0.22, sy: 0.1, ex: 0.07, ey: 0.05,
      rotation: dir.angle, dx: x - sx, dy: gy - sy,
      delay: duration * i / Math.max(1, n) * 0.48,
      life: duration * 0.5, alpha: 0.8, fadeIn: 50, hold: 0.65, ease: 'in' });
  }
  // Cancelled if transformation/death interrupts the attack.
  pool.emit('flare', x + dir.x * 33, y + dir.y * 16 - 20, {
    owner, tag: 'windup', essential: true, tint: c.hot, add: true, depth: 18,
    delay: Math.max(0, duration - 120), life: 120, sx: 0.08, sy: 0.08,
    ex: 0.45, ey: 0.25, rotation: dir.angle, alpha: 0.95
  });
}

export function playMinotaurChargeLaunch(scene, x, y, direction, rage = false, boss = null) {
  if (!scene?.sys?.isActive()) return;
  if (boss) cancelChargeVisuals(scene, boss, 'windup');
  const pool = chargePool(scene), c = CHARGE_PALETTES[Number(!!rage)];
  const dir = chargeDirection(direction), gy = y + footOffset(boss);
  // Dark contact then a bright front: contrast gives the burst its weight.
  pool.emit('halo', x, gy, { tint: 0x090a12, depth: 2.4, sx: 0.4, sy: 0.18,
    ex: 1.6, ey: 0.55, life: 450, alpha: 0.9, essential: true });
  pool.emit('boundary', x, gy, { tint: c.energy, add: true, depth: 6, sx: 0.16, sy: 0.08,
    ex: 1.2, ey: 0.5, life: 260, alpha: 0.9, essential: true });
  pool.emit('flare', x, gy, { tint: c.hot, add: true, depth: 18, sx: 0.35, sy: 0.18,
    ex: 1.25, ey: 0.4, life: 130, alpha: 0.9, rotation: dir.angle });
  pool.emit('pressure', x + dir.x * 40, y + dir.y * 40, { tint: c.hot, add: true,
    depth: 18, sx: 0.4, ex: 0.9, life: 180, rotation: dir.angle, alpha: 0.85,
    dx: dir.x * 40, dy: dir.y * 40, essential: true });
  for (const side of [-1, 1]) {
    const hx = x - dir.y * side * 21, hy = gy + dir.x * side * 12;
    pool.emit('hoof', hx, hy, { tint: c.deep, depth: 2.5, sx: 0.55, sy: 0.4,
      rotation: dir.angle, hold: 0.5, life: 1800, alpha: 0.85 });
    pool.emit('streak', hx - dir.x * 55, hy - dir.y * 55, { tint: c.energy,
      add: true, depth: 5, sx: 0.8, sy: 0.25, ex: 1.15, ey: 0.1,
      rotation: dir.angle, life: 320, alpha: 0.8 });
  }
  chargeDebris(scene, x, gy, dir.angle + Math.PI, rage, 16, 2.3, 1.3);
}

// One sample per 70/100ms, using the interpolated body position on clients.
export function emitMinotaurChargeTrail(scene, x, y, direction, rage = false, stepSide = 1, stepIndex = 0, boss = null) {
  if (!scene?.sys?.isActive()) return;
  const pool = chargePool(scene), c = CHARGE_PALETTES[Number(!!rage)];
  const dir = chargeDirection(direction), gy = y + footOffset(boss);
  const side = stepSide < 0 ? -1 : 1;
  const hx = x - dir.x * 15 - dir.y * side * 19;
  const hy = gy - dir.y * 15 + dir.x * side * 12;
  pool.emit('hoof', hx, hy, { tint: c.deep, depth: 2.5, sx: 0.38, sy: 0.29,
    rotation: dir.angle, life: 1150, hold: 0.35, alpha: 0.8 });
  pool.emit('streak', x - dir.x * 54, gy - dir.y * 54, { tint: c.energy,
    add: true, depth: 5, rotation: dir.angle, sx: 0.8, sy: 0.2,
    ex: 1.05, ey: 0.05, alpha: 0.65, life: 260 });
  pool.emit('pressure', x + dir.x * 26, y + dir.y * 26 + 8, {
    tint: stepIndex % 3 === 0 ? c.hot : c.energy, add: true, depth: 18,
    rotation: dir.angle, sx: 0.62, sy: 0.62, ex: 0.76, ey: 0.76,
    dx: dir.x * 22, dy: dir.y * 22, life: 145, alpha: rage ? 0.7 : 0.55,
    essential: true
  });
  if (boss?.texture && stepIndex % 2 === 0 && chargeDetailCount(scene, 1)) {
    pool.emit('halo', x - dir.x * 10, y - dir.y * 10, {
      texture: boss.texture.key, frame: boss.frame.name, tint: c.energy,
      add: true, depth: 8.7, sx: boss.scaleX, sy: boss.scaleY,
      ex: boss.scaleX * 1.02, ey: boss.scaleY * 1.02, flipX: boss.flipX,
      life: 170, alpha: 0.25, dx: -dir.x * 12, dy: -dir.y * 12
    });
  }
  chargeDebris(scene, hx, hy, dir.angle + Math.PI, rage, 3, 1.8, 0.6);
}

export function playMinotaurChargeStop(scene, x, y, direction, rage = false, boss = null) {
  if (!scene?.sys?.isActive()) return;
  const pool = chargePool(scene), c = CHARGE_PALETTES[Number(!!rage)];
  const dir = chargeDirection(direction), gy = y + footOffset(boss);
  for (const side of [-1, 1]) {
    const hx = x - dir.y * side * 22, hy = gy + dir.x * side * 12;
    pool.emit('streak', hx - dir.x * 48, hy - dir.y * 48, { tint: 0x17121e,
      depth: 2.5, sx: 0.95, sy: 1, rotation: dir.angle, life: 2300, hold: 0.55, alpha: 0.9 });
    pool.emit('streak', hx - dir.x * 40, hy - dir.y * 40, { tint: c.energy,
      add: true, depth: 3, sx: 0.78, sy: 0.3, rotation: dir.angle, life: 700, alpha: 0.65 });
    chargeDebris(scene, hx, hy, dir.angle + side * 0.95, rage, 5, 0.9, 0.85);
  }
  pool.emit('boundary', x, gy, { tint: c.energy, add: true, depth: 6, sx: 0.1, sy: 0.05,
    ex: 0.8, ey: 0.3, life: 220, alpha: 0.65 });
}

export function playMinotaurChargeSwingWindup(scene, boss, duration = 200) {
  const pool = chargePool(scene), c = CHARGE_PALETTES[Number(!!boss.isEnraged)];
  const direction = chargeDirection(boss.bossChargeDir);
  pool.emit('boundary', boss.x, boss.y, { owner: boss, tag: 'swingWindup',
    tint: c.energy, add: true, depth: 7, sx: 0.45, ex: boss.def.chargeSwingRadius * 1.3 / 112,
    rotation: direction.angle, alpha: 0.65, fadeIn: 25, hold: 0.9,
    life: duration, ease: 'in', essential: true });
  pool.emit('flare', boss.x + direction.x * 65, boss.y + direction.y * 65, {
    owner: boss, tag: 'swingWindup', tint: c.hot, add: true, depth: 18,
    sx: 0.05, ex: 0.46, ey: 0.3, rotation: direction.angle + 0.5,
    life: duration, fadeIn: 25, hold: 0.9, ease: 'in'
  });
}
