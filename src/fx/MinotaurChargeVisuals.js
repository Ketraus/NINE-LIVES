import SettingsManager from '../systems/SettingsManager.js';
import { reserveFx } from './FxBudget.js';

// One shared atlas, one bounded image pool and one update listener per scene.
// No per-particle tweens, timers, Graphics rebuilds or post-processing passes.
const ATLAS = 'minotaur_charge_v2';
const TILE = 256;
export const CHARGE_SWEEP = Math.PI * 5 / 3;
export const CHARGE_PALETTES = [
  { energy: 0xc45bff, hot: 0xffd8ff, deep: 0x521e76, dust: 0x887989 },
  { energy: 0x36ead4, hot: 0xd6fff5, deep: 0x12575f, dust: 0x748c8d }
];
const pools = new WeakMap();

function stroke(ctx, points, width, alpha = 1) {
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}

function arc(ctx, radius, start, end, width, alpha = 1) {
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(128, 128, radius, start, end);
  ctx.stroke();
}

export function prepareChargeVisuals(scene) {
  if (scene.textures.exists(ATLAS)) return;
  const texture = scene.textures.createCanvas(ATLAS, 1024, 1024);
  const ctx = texture.getContext();
  let tile = 0;
  const paint = (name, fn) => {
    const x = (tile % 4) * TILE;
    const y = Math.floor(tile / 4) * TILE;
    texture.add(name, 0, x, y, TILE, TILE);
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.rect(0, 0, TILE, TILE); ctx.clip();
    fn(ctx); ctx.restore(); tile++;
  };
  paint('halo', c => {
    const g = c.createRadialGradient(128, 128, 1, 128, 128, 120);
    g.addColorStop(0, '#fff'); g.addColorStop(0.16, '#ffffffb0');
    g.addColorStop(0.48, '#ffffff30'); g.addColorStop(1, '#ffffff00');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  paint('flare', c => {
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(8, 128); c.lineTo(112, 120);
    c.lineTo(128, 34); c.lineTo(141, 120); c.lineTo(248, 128);
    c.lineTo(141, 136); c.lineTo(128, 222); c.lineTo(112, 136); c.fill();
    stroke(c, [[54, 54], [128, 128], [202, 202]], 2, 0.55);
    stroke(c, [[60, 196], [128, 128], [196, 60]], 2, 0.55);
  });
  paint('streak', c => {
    const g = c.createLinearGradient(12, 0, 244, 0);
    g.addColorStop(0, '#ffffff00'); g.addColorStop(0.65, '#ffffffa0');
    g.addColorStop(0.9, '#fff'); g.addColorStop(1, '#ffffff00');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(8, 128); c.lineTo(210, 119);
    c.lineTo(248, 128); c.lineTo(210, 137); c.fill();
    stroke(c, [[74, 126], [226, 126]], 1.5, 0.9);
  });
  paint('dust', c => {
    // Layered, uneven silhouette. Alpha is baked once, never re-painted in combat.
    for (let i = 0; i < 9; i++) {
      const x = 66 + ((i * 47) % 128), y = 88 + ((i * 29) % 82);
      const r = 24 + (i % 3) * 9;
      const g = c.createRadialGradient(x - 7, y - 8, 1, x, y, r);
      g.addColorStop(0, '#ffffff70'); g.addColorStop(0.55, '#ffffff55');
      g.addColorStop(1, '#ffffff00');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  paint('hoof', c => {
    c.fillStyle = '#fff';
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(166, 128 + side * 7);
      c.lineTo(143, 128 + side * 28); c.lineTo(97, 128 + side * 25);
      c.lineTo(89, 128 + side * 12); c.lineTo(127, 128 + side * 4); c.fill();
      for (let j = 0; j < 3; j++) {
        stroke(c, [[109, 128 + side * 23], [82 - j * 8, 128 + side * (34 + j * 7)],
          [57 - j * 11, 128 + side * (30 + j * 13)]], 3 - j * 0.5, 0.7);
      }
    }
  });
  paint('pressure', c => {
    for (let i = 0; i < 3; i++) arc(c, 104 - i * 10, -1.24, 1.24, i ? 2 : 9, i ? 0.8 : 0.35);
    stroke(c, [[153, 32], [184, 49], [199, 74]], 2, 0.6);
    stroke(c, [[153, 224], [184, 207], [199, 182]], 2, 0.6);
  });
  paint('boundary', c => {
    arc(c, 112, -CHARGE_SWEEP / 2, CHARGE_SWEEP / 2, 12, 0.15);
    arc(c, 112, -CHARGE_SWEEP / 2, CHARGE_SWEEP / 2, 2.5, 1);
    arc(c, 104, -CHARGE_SWEEP / 2 + 0.07, CHARGE_SWEEP / 2 - 0.07, 1, 0.5);
  });
  paint('scar', c => {
    for (let band = 0; band < 3; band++) {
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const a = -CHARGE_SWEEP / 2 + CHARGE_SWEEP * i / 64;
        const r = 105 - band * 8 + Math.sin(i * 3.7 + band) * 2;
        pts.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r]);
      }
      stroke(c, pts, band ? 2 : 6, band ? 0.45 : 0.85);
    }
    for (let i = 0; i < 15; i++) {
      const a = -2.5 + i * 5 / 14;
      stroke(c, [[128 + Math.cos(a) * 97, 128 + Math.sin(a) * 97],
        [128 + Math.cos(a + 0.02) * 111, 128 + Math.sin(a + 0.02) * 111],
        [128 + Math.cos(a - 0.02) * 122, 128 + Math.sin(a - 0.02) * 122]], 1.5, 0.7);
    }
  });
  // Eight authored sweep frames: tapered blade, hot edge, filaments and torn tail.
  // The back opening stays anchored to the dash direction in every frame.
  for (let f = 0; f < 8; f++) paint(`blade${f}`, c => {
    const end = -CHARGE_SWEEP / 2 + CHARGE_SWEEP * (f + 1) / 8;
    const start = Math.max(-CHARGE_SWEEP / 2, end - 2.6);
    for (let layer = 0; layer < 3; layer++) {
      const outer = [], inner = [];
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, a = start + (end - start) * t;
        const width = Math.sin(t * Math.PI * 0.86) * (layer === 0 ? 27 : layer === 1 ? 15 : 5);
        const r = 110 - layer * 2 + Math.sin(a * 11) * (1 - t) * 1.7;
        outer.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r]);
        inner.push([128 + Math.cos(a) * (r - width), 128 + Math.sin(a) * (r - width)]);
      }
      c.fillStyle = layer === 0 ? '#ffffff28' : layer === 1 ? '#ffffff85' : '#fff';
      c.beginPath(); [...outer, ...inner.reverse()].forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath(); c.fill();
    }
    arc(c, 111, start + 0.12, end, 1.6, 0.95);
    for (let j = 0; j < 5; j++) {
      const a = Math.max(start, end - 0.45 - j * 0.38);
      arc(c, 85 - j * 5, a, Math.min(end, a + 0.45 + j * 0.07), 1.5, 0.6 - j * 0.07);
    }
    const hx = 128 + Math.cos(end) * 107, hy = 128 + Math.sin(end) * 107;
    stroke(c, [[hx - Math.sin(end) * 14, hy + Math.cos(end) * 14],
      [hx + Math.sin(end) * 9, hy - Math.cos(end) * 9]], 3, 1);
  });
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

class ChargePool {
  constructor(scene) {
    prepareChargeVisuals(scene);
    this.scene = scene;
    this.mobile = !!scene.sys.game.device.input.touch;
    this.capacity = this.mobile ? 72 : 128;
    this.items = [];
    this.activeCount = 0;
    this.peak = 0;
    this.dropped = 0;
    scene.events.on('update', this.update, this);
    scene.events.once('shutdown', this.destroy, this);
  }

  emit(frame, x, y, o = {}) {
    const view = this.scene.cameras.main.worldView;
    const margin = o.margin ?? 300;
    if (view && (x < view.x - margin || x > view.right + margin || y < view.y - margin || y > view.bottom + margin)) return null;
    let e = this.items.find(item => !item.live);
    if (!e && this.items.length < this.capacity) {
      e = { image: this.scene.add.image(x, y, ATLAS, frame), live: false };
      this.items.push(e);
    }
    if (!e) {
      if (!o.essential) { this.dropped++; return null; }
      // Recycle the oldest detail without allocating/sorting a temporary array.
      for (const item of this.items) {
        if (!item.essential && (!e || item.age > e.age)) e = item;
      }
      if (!e) { this.dropped++; return null; }
    }
    if (!e.live) this.activeCount++;
    Object.assign(e, { live: true, age: -(o.delay || 0), life: o.life ?? 300,
      x, y, dx: o.dx || 0, dy: o.dy || 0, lift: o.lift || 0,
      sx: o.sx ?? 1, sy: o.sy ?? o.sx ?? 1,
      ex: o.ex ?? o.sx ?? 1, ey: o.ey ?? o.ex ?? o.sy ?? o.sx ?? 1,
      alpha: o.alpha ?? 1, rotation: o.rotation || 0, spin: o.spin || 0,
      hold: o.hold ?? 0, fadeIn: o.fadeIn || 0, ease: o.ease || 'out',
      sweep: o.sweep || 0, lastFrame: -1, owner: o.owner || null, tag: o.tag || null,
      essential: !!o.essential, follow: !!o.follow, ox: o.ox || 0, oy: o.oy || 0 });
    const alpha = SettingsManager.getReducedFlashes() && o.add ? e.alpha * 0.55 : e.alpha;
    e.alpha = alpha;
    e.image.setTexture(o.texture || ATLAS, o.frame ?? frame).setPosition(x, y)
      .setScale(e.sx, e.sy).setRotation(e.rotation).setTint(o.tint ?? 0xffffff)
      .setFlipX(!!o.flipX).setOrigin(0.5).setDepth(o.depth ?? 7)
      .setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setAlpha(e.fadeIn ? 0 : alpha).setVisible(e.age >= 0).setActive(true);
    this.peak = Math.max(this.peak, this.activeCount);
    return e;
  }

  cancel(owner, tag = null) {
    for (const e of this.items) if (e.live && e.owner === owner && (!tag || e.tag === tag)) this.release(e);
  }

  release(e) {
    if (e.live) this.activeCount--;
    e.live = false; e.owner = null; e.image.setVisible(false).setActive(false);
  }

  update(_time, delta) {
    if (this.scene.isPaused || this.scene.time.paused) return;
    const dt = Math.min(delta, 80) * this.scene.time.timeScale;
    for (const e of this.items) {
      if (!e.live) continue;
      e.age += dt;
      if (e.age < 0) continue;
      if (e.age >= e.life || (e.follow && (!e.owner?.active || e.owner.visible === false))) { this.release(e); continue; }
      const p = e.age / e.life;
      const k = e.ease === 'in' ? p * p * p : e.ease === 'linear' ? p : 1 - (1 - p) ** 3;
      const fade = p <= e.hold ? 1 : 1 - (p - e.hold) / Math.max(0.001, 1 - e.hold);
      const entry = e.fadeIn ? Math.min(1, e.age / e.fadeIn) : 1;
      const x = e.follow ? e.owner.x + e.ox : e.x;
      const y = e.follow ? e.owner.y + e.oy : e.y;
      e.image.setVisible(true).setPosition(x + e.dx * k, y + e.dy * k - Math.sin(p * Math.PI) * e.lift)
        .setScale(e.sx + (e.ex - e.sx) * k, e.sy + (e.ey - e.sy) * k)
        .setRotation(e.rotation + e.spin * k).setAlpha(e.alpha * fade * entry);
      if (e.sweep) {
        const frame = Math.min(7, Math.floor(e.age / e.sweep * 8));
        if (frame !== e.lastFrame) { e.image.setFrame(`blade${frame}`); e.lastFrame = frame; }
      }
    }
  }

  destroy() {
    this.scene.events.off('update', this.update, this);
    for (const e of this.items) e.image.destroy();
    this.items.length = 0;
    this.activeCount = 0;
    pools.delete(this.scene);
  }
}

export function chargePool(scene) {
  let pool = pools.get(scene);
  if (!pool) { pool = new ChargePool(scene); pools.set(scene, pool); }
  return pool;
}

export function cancelChargeVisuals(scene, owner, tag = null) { pools.get(scene)?.cancel(owner, tag); }

export function chargeVisualStats(scene) {
  const p = pools.get(scene);
  return p ? { allocated: p.items.length, active: p.activeCount,
    peak: p.peak, capacity: p.capacity, dropped: p.dropped } : { allocated: 0, active: 0 };
}

export function chargeDetailCount(scene, requested) {
  const mobile = !!scene.sys.game.device.input.touch;
  const fps = scene.sys.game.loop?.actualFps || 60;
  const q = (mobile ? 0.55 : 1) * (fps < 42 ? 0.5 : 1);
  return reserveFx(scene, Math.ceil(requested * q));
}

export function chargeDirection(dir) {
  const x = Number.isFinite(dir?.x) ? dir.x : 1;
  const y = Number.isFinite(dir?.y) ? dir.y : 0;
  const len = Math.hypot(x, y);
  return len > 0 ? { x: x / len, y: y / len, angle: Math.atan2(y, x) } : { x: 1, y: 0, angle: 0 };
}

export function chargeDebris(scene, x, y, angle, rage, count, spread = 1.2, power = 1) {
  const pool = chargePool(scene), c = CHARGE_PALETTES[Number(!!rage)];
  const n = chargeDetailCount(scene, count);
  for (let i = 0; i < n; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const d = (35 + Math.random() * 70) * power;
    const dust = i % 4 === 0, stone = i % 4 === 1;
    // Small opaque chips share the angular hoof silhouette. Their parabolic
    // flight and slower fade provide physical mass underneath the sparks.
    pool.emit(dust ? 'dust' : stone ? 'hoof' : 'streak', x, y, {
      tint: dust ? c.dust : stone ? 0x736b70 : i % 3 === 0 ? c.hot : c.energy,
      add: !dust && !stone, depth: dust ? 8 : stone ? 12 : 18,
      sx: dust ? 0.28 : stone ? 0.13 : 0.12, sy: dust ? 0.19 : stone ? 0.13 : 0.18,
      ex: dust ? 0.65 * power : stone ? 0.11 : 0.025,
      ey: dust ? 0.4 * power : stone ? 0.11 : 0.04,
      dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7,
      lift: dust ? 12 : (stone ? 28 : 15) + Math.random() * 22,
      rotation: dust ? a * 0.15 : a, spin: dust ? 0.12 : stone ? 2.4 : 0.6,
      hold: stone ? 0.55 : 0,
      alpha: dust ? 0.75 : 0.9, life: dust ? 560 : stone ? 520 : 260 + Math.random() * 200
    });
  }
}
