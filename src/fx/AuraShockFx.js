// Visual da Sobrecarga (AuraShockAbility, evolução de thorns_up): área de
// choque ao redor do gato. A folha (assets/fx/aura_shock.png) tem 4 frames de
// 32x32 em linha — um anel de raios ciano. Em cima dela, camadas por código:
//   brilho   -> halo aditivo respirando + disco fraco marcando a área de dano
//   anel     -> sprite animado + "fantasma" aditivo girando devagar
//   raios    -> descargas dentro da área e arcos correndo na borda, redesenhados
//               em ritmo irregular (crepitar), com brilho largo + núcleo claro
//   faíscas  -> pixels que escapam do anel e somem
// A cada tick de dano: flash, rajada de raios e descargas até os inimigos
// atingidos. O raio real do dano não muda. Tudo em unidades locais (radius).

const KEY = 'aura_shock_fx';
const FRAME = 32;
const FRAME_COUNT = 4;
const FRAME_RATE = 12;
const RING_DIAMETER_IN_FRAME = 30; // o anel ocupa ~30 dos 32px do frame

const TEX_GLOW = 'afx_glow';
const TEX_SPARK = 'afx_spark';

const COLOR_HOT = 0xdffcff; // núcleo do raio
const COLOR_MID = 0x4fd8f5;
const COLOR_GLOW = 0x1296ff; // brilho largo ao redor do raio
const SPARK_COLORS = [0xdffcff, 0xa6f1ff, 0x4fd8f5, 0x2bb4ff];

export function loadAuraShockSheet(scene) {
  scene.load.spritesheet(KEY, 'assets/fx/aura_shock.png', { frameWidth: FRAME, frameHeight: FRAME });
}

export function createAuraShockAnimation(scene) {
  if (!scene.textures.exists(KEY)) return;
  scene.textures.get(KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
  buildTextures(scene);
  if (scene.anims.exists(KEY)) return;
  scene.anims.create({
    key: KEY,
    frames: scene.anims.generateFrameNumbers(KEY, { start: 0, end: FRAME_COUNT - 1 }),
    frameRate: FRAME_RATE,
    repeat: -1
  });
}

export function hasAuraShockFx(scene) {
  return scene.textures.exists(KEY) && scene.textures.exists(TEX_GLOW);
}

function buildTextures(scene) {
  const tm = scene.textures;
  if (!tm.exists(TEX_GLOW)) {
    const size = 64;
    const tex = tm.createCanvas(TEX_GLOW, size, size);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
  if (!tm.exists(TEX_SPARK)) {
    const tex = tm.createCanvas(TEX_SPARK, 2, 2);
    const ctx = tex.getContext();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 2, 2);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Container com tudo; posição/escala quem controla é a habilidade.
export function createAuraShockFx(scene, radius) {
  const ringScale = (radius * 2) / RING_DIAMETER_IN_FRAME;

  const halo = scene.add.image(0, 0, TEX_GLOW)
    .setTint(0x22b8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4)
    .setDisplaySize(radius * 3.6, radius * 3.6);
  const disc = scene.add.circle(0, 0, radius, 0x3cc8ff, 0.07);
  const inner = scene.add.image(0, 0, TEX_GLOW)
    .setTint(0x8fe9ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.18)
    .setDisplaySize(radius * 1.7, radius * 1.7);

  const ghost = scene.add.sprite(0, 0, KEY, 0)
    .setScale(ringScale * 1.1)
    .setBlendMode(Phaser.BlendModes.ADD).setTint(0xbff6ff).setAlpha(0.3);
  ghost.play({ key: KEY, startFrame: Phaser.Math.Between(0, FRAME_COUNT - 1) });

  const ring = scene.add.sprite(0, 0, KEY, 0).setScale(ringScale);
  ring.play({ key: KEY, startFrame: Phaser.Math.Between(0, FRAME_COUNT - 1) });

  const bolts = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

  const sparks = [];
  for (let i = 0; i < 12; i++) {
    const img = scene.add.image(0, 0, TEX_SPARK).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    sparks.push({ img, life: 0, maxLife: 1, x: 0, y: 0, vx: 0, vy: 0 });
  }

  const container = scene.add
    .container(0, 0, [halo, disc, inner, ghost, ring, bolts, ...sparks.map((s) => s.img)])
    .setDepth(7);

  container.setData({
    halo, inner, ghost, ring, bolts, sparks, radius,
    ringScale, nextBoltAt: 0, flash: 0, lastTime: 0
  });
  return container;
}

// Todo frame (time e dt em ms).
export function updateAuraShockFx(fx, time, dt) {
  if (!fx?.scene || !fx.active) return;
  const radius = fx.getData('radius');
  if (radius === undefined) return;
  const sec = Math.min(dt, 50) / 1000;

  const halo = fx.getData('halo');
  const inner = fx.getData('inner');
  const ghost = fx.getData('ghost');
  const ring = fx.getData('ring');
  const sparks = fx.getData('sparks');

  // flash do tick de dano decai rápido
  let flash = fx.getData('flash');
  flash = Math.max(0, flash - 4.2 * sec);
  fx.setData('flash', flash);

  // respiração irregular (duas ondas somadas) + flash
  const breathe = 0.5 + 0.5 * Math.sin(time * 0.011) * Math.sin(time * 0.0047 + 1.3);
  halo.setAlpha(0.3 + 0.18 * breathe + 0.45 * flash);
  inner.setAlpha(0.14 + 0.1 * breathe + 0.4 * flash);
  ghost.angle += 38 * sec;
  ghost.setAlpha(0.22 + 0.12 * breathe + 0.4 * flash);
  const ringBase = fx.getData('ringScale');
  ring.setScale(ringBase * (1 + 0.03 * Math.sin(time * 0.02) + 0.05 * flash));

  // raios: redesenha em ritmo irregular (crepita) e sempre que há rajada
  if (time >= fx.getData('nextBoltAt')) {
    const burst = flash > 0.55;
    drawBolts(fx.getData('bolts'), radius, burst ? Phaser.Math.Between(5, 7) : Phaser.Math.Between(2, 4), burst);
    fx.setData('nextBoltAt', time + (burst ? 45 : rand(60, 115)));
  }

  // faíscas: nascem na borda, escapam e somem
  if (Math.random() < 0.22) emitSpark(sparks, radius, 1);
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    if (s.life <= 0) continue;
    s.life -= sec;
    if (s.life <= 0) { s.img.setVisible(false); continue; }
    s.vx *= 1 - 1.6 * sec;
    s.vy *= 1 - 1.6 * sec;
    s.x += s.vx * sec;
    s.y += s.vy * sec;
    const k = s.life / s.maxLife;
    s.img.setPosition(s.x, s.y);
    s.img.setAlpha(k * (Math.random() < 0.25 ? 0.4 : 1)); // pisca ao morrer
    s.img.setScale(0.7 + k * 0.9);
  }
}

function emitSpark(sparks, radius, count) {
  for (let n = 0; n < count; n++) {
    const s = sparks.find((p) => p.life <= 0);
    if (!s) return;
    const a = rand(0, Math.PI * 2);
    const r = radius * rand(0.7, 1.02);
    s.x = Math.cos(a) * r;
    s.y = Math.sin(a) * r;
    const speed = radius * rand(1.2, 3.2);
    s.vx = Math.cos(a + rand(-0.6, 0.6)) * speed;
    s.vy = Math.sin(a + rand(-0.6, 0.6)) * speed;
    s.maxLife = s.life = rand(0.22, 0.5);
    s.img.setTint(pick(SPARK_COLORS)).setVisible(true).setPosition(s.x, s.y);
  }
}

// Polilinha "elétrica": pontos entre (x1,y1) e (x2,y2) com desvio lateral
// aleatório, que zera nas pontas.
function jaggedPath(x1, y1, x2, y2, segments, jitter) {
  const pts = [{ x: x1, y: y1 }];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = rand(-1, 1) * jitter * Math.sin(Math.PI * t);
    pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

function strokePath(g, pts, width, color, alpha) {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.strokePath();
}

// brilho largo + meio + núcleo claro
function strokeBolt(g, pts, unit, strong = 1) {
  strokePath(g, pts, 4.5 * unit, COLOR_GLOW, 0.2 * strong);
  strokePath(g, pts, 2.2 * unit, COLOR_MID, 0.55 * strong);
  strokePath(g, pts, 1 * unit, COLOR_HOT, 0.95 * strong);
}

function drawBolts(g, radius, count, burst) {
  g.clear();
  const unit = Math.max(0.6, radius / 22);

  // descargas do centro até perto da borda, com bifurcação ocasional
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const r0 = radius * rand(0.05, 0.3);
    const r1 = radius * rand(0.75, 1.0);
    const x1 = Math.cos(a) * r0;
    const y1 = Math.sin(a) * r0;
    const x2 = Math.cos(a) * r1;
    const y2 = Math.sin(a) * r1;
    const pts = jaggedPath(x1, y1, x2, y2, 6, radius * 0.2);
    strokeBolt(g, pts, unit, burst ? 1 : 0.85);

    if (Math.random() < 0.45) {
      const m = pts[Math.floor(pts.length / 2)];
      const fa = a + rand(-1, 1);
      const fr = radius * rand(0.25, 0.45);
      const fork = jaggedPath(m.x, m.y, m.x + Math.cos(fa) * fr, m.y + Math.sin(fa) * fr, 3, radius * 0.1);
      strokePath(g, fork, 1.6 * unit, COLOR_MID, 0.5);
      strokePath(g, fork, 0.8 * unit, COLOR_HOT, 0.8);
    }
  }

  // arcos correndo pela borda, tremendo
  const arcs = burst ? 4 : Phaser.Math.Between(1, 3);
  for (let i = 0; i < arcs; i++) {
    const a0 = rand(0, Math.PI * 2);
    const span = rand(0.35, 1.0);
    const steps = 7;
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (span * k) / steps;
      const r = radius * (1 + rand(-0.07, 0.07) * Math.sin((Math.PI * k) / steps));
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    strokePath(g, pts, 3 * unit, COLOR_GLOW, 0.22);
    strokePath(g, pts, 1.2 * unit, COLOR_HOT, 0.9);
  }
}

// Tick de dano: flash + rajada + faíscas, e descargas até os inimigos atingidos.
export function zapAuraShockFx(fx, targets = []) {
  const scene = fx?.scene;
  if (!scene || fx.getData('radius') === undefined) return;
  fx.setData('flash', 1);
  fx.setData('nextBoltAt', 0); // redesenha já, em modo rajada
  emitSpark(fx.getData('sparks'), fx.getData('radius'), 6);

  const maxTargets = 3;
  const chosen = targets.length <= maxTargets ? targets : Phaser.Utils.Array.Shuffle(targets.slice()).slice(0, maxTargets);
  chosen.forEach((enemy) => {
    if (!enemy?.active) return;
    spawnZap(scene, fx.x, fx.y, enemy.x, enemy.y, fx.scaleX);
  });
}

// Descarga solta no mundo, do gato até o inimigo; some sozinha.
function spawnZap(scene, x1, y1, x2, y2, scale) {
  const g = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const segs = Math.max(4, Math.round(dist / 9));
  const pts = jaggedPath(x1, y1, x2, y2, segs, Math.min(9, 3 + dist * 0.08));
  strokeBolt(g, pts, Math.max(0.8, scale), 1);

  const end = scene.add.image(x2, y2, TEX_GLOW)
    .setTint(0x8fe9ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9)
    .setDisplaySize(26, 26).setAlpha(0.9);

  scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: 140,
    ease: 'Quad.easeIn',
    onComplete: () => g.destroy()
  });
  scene.tweens.add({
    targets: end,
    alpha: 0,
    scaleX: end.scaleX * 1.8,
    scaleY: end.scaleY * 1.8,
    duration: 180,
    ease: 'Cubic.easeOut',
    onComplete: () => end.destroy()
  });
}
