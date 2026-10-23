// Tremor de entrada do Minotauro (cenas 2 a 4 da cinemática, chamado por
// SpawnDirector._waitForEmptyScreenThenBuildup quando a tela esvazia).
// Tudo converge pra um EPICENTRO (onde o Minotauro vai nascer): é ali que
// o mundo é forçado por baixo.
//
//   t=0      PRIMEIRO ESTRONDO: sub-grave subterrâneo + tranco de câmera;
//            pedrinhas começam a vibrar e dão um pulinho; poeira fina
//   t~0.5-3  RACHADURAS SE ESPALHAM do epicentro (crescem de verdade, com
//            ramificações); por dentro delas vaza energia corrompida
//            violeta (brilho + partículas que sobem); o tremor e o ronco
//            sobem juntos
//   t=3.2    SEGUNDO IMPACTO, muito pior: estrondo enorme, câmera sacode
//            forte, nuvem de poeira sobe, fragmentos de pedra são
//            arremessados em arco, pedrinhas saltam, rachaduras clareiam
//
// LUZ ROXA (a cena respira junto das rachaduras): feixes de luz sobem das
// fendas (pequenos no começo, colunas acesas depois do 2º impacto), poça de
// energia pulsando no epicentro, ondas de choque no chão, rachaduras em
// arco (como chão estilhaçado) e rachaduras secundárias bem finas. O
// chamador pode sincronizar com os batimentos (pulse) e dar o estouro final
// da luz um instante antes da entrada (climax).
//   t~4.6    onDone — o tremor residual segue só até o chamador assumir
//            (escurecimento do SpawnDirector); stop() desfaz tudo
//
// Só visual/áudio, em coordenadas de MUNDO. stop() é idempotente.

import MinotaurAudio from '../systems/MinotaurAudio.js';
import SettingsManager from '../systems/SettingsManager.js';

export const TREMOR_DURATION_MS = 4600;

const PEBBLE_KEYS = ['tremor_pebble_a', 'tremor_pebble_b', 'tremor_pebble_c'];
const SHARD_KEYS = ['tremor_shard_a', 'tremor_shard_b', 'tremor_shard_c'];
const DUST_KEY = 'tremor_dust';
const SPARK_KEY = 'tremor_spark';
const BEAM_KEY = 'tremor_beam';
const GLOW_KEY = 'tremor_glow';

const DEPTH_CRACK = 2.2;
const DEPTH_CRACK_GLOW = 2.3;
const DEPTH_PEBBLE = 3;
const DEPTH_SHARD_SHADOW = 2.6;
const DEPTH_DUST = 11;
const DEPTH_SPARK = 12;
const DEPTH_SHARD = 20;
const DEPTH_POOL = 2.35;
const DEPTH_RING = 2.5;
const DEPTH_BEAM = 8.6;
const ADD = Phaser.BlendModes.ADD;
const MAX_CRACKS = 135; // teto de rachaduras vivas (cada uma é um Graphics)

const PEBBLE_COUNT = 34;
const MAIN_CRACKS = 11;

const IMPACT1_SHAKE_MS = 520;
const IMPACT1_SHAKE = 0.02;
const SPREAD_START_MS = 450;
const IMPACT2_AT_MS = 3200;
const IMPACT2_SHAKE_MS = 1100;
const IMPACT2_SHAKE = 0.05;

const PEBBLE_TINTS = [0x6b665d, 0x7d776b, 0x57524a, 0x8a8377, 0x4a463f];
const VIOLETS = [0x9b4dff, 0xc084ff, 0x6a1fd0, 0xe0c4ff];

function ensureTextures(scene) {
  if (!scene.textures.exists(PEBBLE_KEYS[0])) {
    const shapes = [
      [[1, 4], [3, 1], [6, 2], [7, 5], [4, 7]],
      [[0, 3], [3, 0], [7, 3], [6, 6], [2, 6]],
      [[1, 2], [5, 1], [7, 4], [5, 7], [1, 6]]
    ];
    shapes.forEach((pts, i) => {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillPoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
      g.fillStyle(0x000000, 0.28);
      g.fillRect(2, 6, 4, 1);
      g.generateTexture(PEBBLE_KEYS[i], 8, 8);
      g.destroy();
    });
  }
  if (!scene.textures.exists(SHARD_KEYS[0])) {
    const shapes = [
      [[2, 9], [0, 4], [5, 0], [11, 3], [12, 9], [7, 12]],
      [[1, 7], [4, 1], [10, 2], [13, 8], [8, 12], [3, 11]],
      [[0, 6], [6, 0], [12, 5], [10, 12], [3, 11]]
    ];
    shapes.forEach((pts, i) => {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillPoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
      g.fillStyle(0x000000, 0.32); // face escura embaixo, dá volume
      g.fillTriangle(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1], 6, 12);
      g.generateTexture(SHARD_KEYS[i], 14, 14);
      g.destroy();
    });
  }
  // feixe de luz: núcleo fino e quente + halo largo; firme na base, some pra cima
  if (!scene.textures.exists(BEAM_KEY)) {
    const w = 48;
    const h = 256;
    const tex = scene.textures.createCanvas(BEAM_KEY, w, h);
    const ctx = tex.getContext();
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      const vy = y / (h - 1); // 0 topo .. 1 base
      const vertical = Math.pow(vy, 1.35);
      for (let x = 0; x < w; x += 1) {
        const dx = (x - w / 2) / (w / 2);
        const core = Math.exp(-Math.pow(dx / 0.14, 2));
        const halo = Math.exp(-Math.pow(dx / 0.52, 2)) * 0.42;
        const a = Math.min(1, (core + halo) * vertical);
        const i = (y * w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }
  if (!scene.textures.exists(GLOW_KEY)) {
    const tex = scene.textures.createCanvas(GLOW_KEY, 128, 128);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    tex.refresh();
  }
  [[DUST_KEY, 32], [SPARK_KEY, 16]].forEach(([key, size]) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, size, size);
    const ctx = tex.getContext();
    const h = size / 2;
    const grad = ctx.createRadialGradient(h, h, 0.5, h, h, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  });
}

// trilha de rachadura: caminhada aleatória que se afasta de (x,y) no ângulo
function buildPath(x, y, angle, length, wander = 0.45) {
  const pts = [{ x, y }];
  let acc = 0;
  let a = angle;
  while (acc < length) {
    a += Phaser.Math.FloatBetween(-wander, wander);
    const seg = Phaser.Math.Between(9, 18);
    x += Math.cos(a) * seg;
    y += Math.sin(a) * seg;
    acc += seg;
    pts.push({ x, y });
  }
  return pts;
}

export function playBossTremor(scene, epicenter, hooks = {}) {
  ensureTextures(scene);
  const cam = scene.cameras.main;
  const view = cam.worldView;
  const margin = 18;
  const randX = () => Phaser.Math.Between(Math.round(view.x + margin), Math.round(view.right - margin));
  const randY = () => Phaser.Math.Between(Math.round(view.y + margin), Math.round(view.bottom - margin));
  const ex = epicenter?.x ?? cam.midPoint.x;
  const ey = epicenter?.y ?? cam.midPoint.y;

  const fadeables = []; // objetos que somem no stop()
  const timers = [];
  const startedAt = scene.time.now;
  let stopped = false;
  let phase = 1; // 1 = primeiro estrondo, 2 = rachaduras, 3 = depois do 2º impacto
  let boost = 1; // multiplicador de vibração das pedrinhas
  let glowLevel = 0.55;
  const flickerAmt = SettingsManager.getReducedFlashes() ? 0.08 : 0.3;
  const fxState = { pulse: 0 }; // batimento: some depressa, soma no brilho de tudo
  const shafts = []; // feixes de luz vivos

  const later = (ms, fn) => {
    const ev = scene.time.delayedCall(ms, () => { if (!stopped) fn(); });
    timers.push(ev);
    return ev;
  };
  const loop = (delay, fn) => {
    const ev = scene.time.addEvent({ delay, loop: true, callback: () => { if (!stopped) fn(); } });
    timers.push(ev);
    return ev;
  };

  // ---------- PRIMEIRO ESTRONDO ----------
  MinotaurAudio.impact(scene, 0.75);
  scene.sound.play('sfx_cyberus_explosion', { volume: 0.8, rate: 0.4 });
  if (scene.cache.audio.exists('sfx_terremoto')) scene.sound.play('sfx_terremoto', { volume: 0.55, rate: 0.5 });
  cam.shake(IMPACT1_SHAKE_MS, IMPACT1_SHAKE, true);
  MinotaurAudio.startRumble(scene, 900);

  // pedrinhas
  const pebbles = [];
  for (let i = 0; i < PEBBLE_COUNT; i += 1) {
    const bx = randX();
    const by = randY();
    const sprite = scene.add
      .image(bx, by, Phaser.Utils.Array.GetRandom(PEBBLE_KEYS))
      .setDepth(DEPTH_PEBBLE)
      .setTint(Phaser.Utils.Array.GetRandom(PEBBLE_TINTS))
      .setScale(Phaser.Math.FloatBetween(0.8, 1.6))
      .setAngle(Phaser.Math.Between(0, 359));
    const p = { sprite, bx, by, hop: 0, baseAngle: sprite.angle };
    pebbles.push(p);
    fadeables.push(sprite);
    scene.tweens.add({
      targets: p, hop: -Phaser.Math.Between(4, 9), duration: Phaser.Math.Between(90, 140),
      delay: Phaser.Math.Between(0, 120), yoyo: true, ease: 'Quad.easeOut'
    });
  }
  loop(40, () => {
    const k = Phaser.Math.Clamp((scene.time.now - startedAt) / 3000, 0, 1);
    const amp = (0.5 + 1.8 * k) * boost;
    pebbles.forEach((p) => {
      if (!p.sprite.active) return;
      p.sprite.x = p.bx + Phaser.Math.FloatBetween(-amp, amp);
      p.sprite.y = p.by + p.hop + Phaser.Math.FloatBetween(-amp, amp);
      p.sprite.angle = p.baseAngle + Phaser.Math.FloatBetween(-amp * 3, amp * 3);
    });
  });

  const puff = (x, y, { tint = 0xcfc6b8, alpha = 0.32, s0 = 0.3, s1 = 0.9, rise = 16, min = 500, max = 800 } = {}) => {
    const d = scene.add.image(x, y, DUST_KEY).setDepth(DEPTH_DUST).setTint(tint).setAlpha(alpha).setScale(s0);
    scene.tweens.add({
      targets: d, y: y - rise, scale: s1, alpha: 0,
      duration: Phaser.Math.Between(min, max), ease: 'Sine.easeOut', onComplete: () => d.destroy()
    });
  };
  const dustTimer = loop(80, () => puff(randX(), randY()));

  // ---------- RACHADURAS (crescem do epicentro) ----------
  const cracks = [];
  const mainCracks = [];
  // weight: 1 principal, 0.75 ramificação, 0.5 fio de cabelo (sem halo, mais barato)
  const makeCrack = (pts, delay, speed, weight = 1) => {
    if (cracks.length >= MAX_CRACKS) return null;
    const core = scene.add.graphics().setDepth(DEPTH_CRACK);
    const glow = scene.add.graphics().setDepth(DEPTH_CRACK_GLOW).setBlendMode(ADD).setAlpha(0);
    const halo = weight >= 0.7
      ? scene.add.graphics().setDepth(DEPTH_CRACK_GLOW - 0.01).setBlendMode(ADD).setAlpha(0)
      : null;
    fadeables.push(core, glow);
    if (halo) fadeables.push(halo);
    let total = 0;
    const lens = [0];
    for (let i = 1; i < pts.length; i += 1) {
      total += Phaser.Math.Distance.Between(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      lens.push(total);
    }
    const crack = { pts, lens, total, core, glow, halo, drawn: 1, progress: 0, flash: 0 };
    cracks.push(crack);
    const draw = () => {
      const target = crack.progress * total;
      let idx = 1;
      while (idx < pts.length - 1 && lens[idx] < target) idx += 1;
      crack.drawn = idx;
      const last = { x: pts[0].x, y: pts[0].y };
      const part = (g, width, color, alpha) => {
        g.clear();
        g.lineStyle(width, color, alpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < idx; i += 1) g.lineTo(pts[i].x, pts[i].y);
        const prev = pts[idx - 1];
        const nxt = pts[idx];
        const span = lens[idx] - lens[idx - 1] || 1;
        const f = Phaser.Math.Clamp((target - lens[idx - 1]) / span, 0, 1);
        last.x = prev.x + (nxt.x - prev.x) * f;
        last.y = prev.y + (nxt.y - prev.y) * f;
        g.lineTo(last.x, last.y);
        g.strokePath();
      };
      part(core, Math.max(1, 2 * weight), 0x0d0a10, 0.95);
      if (halo) part(halo, 15 * weight, 0x5a1fb0, 0.24); // luz vazando pro chão em volta
      part(glow, 6 * weight, 0x7a2bd9, 0.5);
      glow.lineStyle(Math.max(1, 1.5 * weight), 0xe9d5ff, 0.95); // fio quente no meio do brilho
      glow.beginPath();
      glow.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < idx; i += 1) glow.lineTo(pts[i].x, pts[i].y);
      glow.lineTo(last.x, last.y);
      glow.strokePath();
    };
    scene.tweens.add({
      targets: crack, progress: 1, duration: (total / speed) * 1000, delay, ease: 'Quad.easeOut',
      onUpdate: draw,
      onStart: () => { glow.setAlpha(glowLevel); halo?.setAlpha(glowLevel * 0.8); }
    });
    return crack;
  };

  const spawnCrackSet = (count, baseDelay, speedMul = 1, lenMul = 1, main = false) => {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.3, 0.3);
      const length = Phaser.Math.Between(150, 300) * lenMul;
      const pts = buildPath(ex, ey, angle, length);
      const speed = Phaser.Math.Between(90, 150) * speedMul;
      const delay = baseDelay + Phaser.Math.Between(0, 500);
      const root = makeCrack(pts, delay, speed, 1);
      if (!root) continue;
      if (main) mainCracks.push(root);
      // ramificações saindo do meio do caminho (e fios finos saindo delas)
      [0.3, 0.55, 0.8].forEach((frac) => {
        if (Math.random() < 0.42) return;
        const from = pts[Math.min(pts.length - 1, Math.floor(pts.length * frac))];
        const sign = Math.random() < 0.5 ? -1 : 1;
        const bAngle = angle + Phaser.Math.FloatBetween(0.5, 0.95) * sign;
        const bPts = buildPath(from.x, from.y, bAngle, Phaser.Math.Between(40, 95) * lenMul, 0.55);
        const bDelay = delay + (length * frac / speed) * 1000;
        makeCrack(bPts, bDelay, speed * 0.8, 0.75);
        if (bPts.length > 3 && Math.random() < 0.5) {
          const mid = bPts[Math.floor(bPts.length * 0.5)];
          const hAngle = bAngle + Phaser.Math.FloatBetween(0.5, 0.9) * -sign;
          makeCrack(buildPath(mid.x, mid.y, hAngle, Phaser.Math.Between(22, 55) * lenMul, 0.7), bDelay + 250, speed * 0.6, 0.5);
        }
      });
    }
  };

  // rachaduras em arco em volta do epicentro: o chão parece estilhaçado
  const spawnRingCracks = (radius, arcs) => {
    for (let k = 0; k < arcs; k += 1) {
      const a0 = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const span = Phaser.Math.FloatBetween(0.7, 1.5);
      const n = Math.max(5, Math.round((radius * span) / 13));
      const pts = [];
      for (let i = 0; i <= n; i += 1) {
        const a = a0 + (span * i) / n;
        const rr = radius + Phaser.Math.FloatBetween(-7, 7);
        pts.push({ x: ex + Math.cos(a) * rr, y: ey + Math.sin(a) * rr });
      }
      makeCrack(pts, k * 70, 330, 0.7);
    }
  };

  later(SPREAD_START_MS, () => { phase = 2; spawnCrackSet(MAIN_CRACKS, 0, 1, 1, true); });
  later(1150, () => spawnRingCracks(70, 3));
  later(1550, () => spawnCrackSet(5, 0, 1.3, 0.75));
  later(2050, () => spawnRingCracks(135, 4));
  later(2650, () => spawnRingCracks(200, 5));

  // ---------- ENERGIA CORROMPIDA SAINDO DAS RACHADURAS ----------
  const emitSpark = (burst = false) => {
    if (!cracks.length) return;
    const c = Phaser.Utils.Array.GetRandom(cracks);
    if (c.drawn < 2) return;
    const i = Phaser.Math.Between(1, c.drawn - 1);
    const x = c.pts[i].x + Phaser.Math.FloatBetween(-3, 3);
    const y = c.pts[i].y + Phaser.Math.FloatBetween(-3, 3);
    const s = scene.add.image(x, y, SPARK_KEY).setDepth(DEPTH_SPARK)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom(VIOLETS))
      .setAlpha(0.95).setScale(Phaser.Math.FloatBetween(0.5, burst ? 1.5 : 1.0));
    scene.tweens.add({
      targets: s,
      x: x + Phaser.Math.FloatBetween(-8, 8),
      y: y - Phaser.Math.Between(burst ? 30 : 14, burst ? 90 : 46), // sobe devagar, "vazando" do chão
      alpha: 0, scale: 0.1,
      duration: Phaser.Math.Between(700, burst ? 1700 : 1400),
      ease: 'Sine.easeOut',
      onComplete: () => s.destroy()
    });
  };
  loop(45, () => {
    if (phase < 2) return;
    emitSpark();
    if (phase === 3) emitSpark();
  });

  // ---------- LUZ ROXA: feixes, poça de energia, ondas de choque ----------
  const pick = (arr) => Phaser.Utils.Array.GetRandom(arr);
  const randF = Phaser.Math.FloatBetween;

  // poça de energia no epicentro (cresce e pulsa)
  const pool = scene.add.image(ex, ey, GLOW_KEY).setDepth(DEPTH_POOL).setBlendMode(ADD).setTint(0x8a3dff).setAlpha(0);
  const poolCore = scene.add.image(ex, ey, GLOW_KEY).setDepth(DEPTH_POOL + 0.01).setBlendMode(ADD).setTint(0xe9d5ff).setAlpha(0);
  fadeables.push(pool, poolCore);
  const poolState = { a: 0, s: 0.8 };
  const renderPool = () => {
    if (!pool.active) return;
    const br = 1 + 0.06 * Math.sin(scene.time.now / 140);
    const pa = Math.min(1, poolState.a + fxState.pulse * 0.35);
    pool.setAlpha(pa).setScale(poolState.s * br, poolState.s * br * 0.7);
    poolCore.setAlpha(Math.min(1, pa * 0.9)).setScale(poolState.s * 0.38 * br, poolState.s * 0.38 * br * 0.7);
  };

  // onda de choque no chão (elipse que abre e some)
  const shockRing = (r1, ms, a0 = 0.8, width = 3, color = 0xc084ff) => {
    const g = scene.add.graphics().setDepth(DEPTH_RING).setBlendMode(ADD);
    const st = { r: 10, a: a0 };
    scene.tweens.add({
      targets: st, r: r1, a: 0, duration: ms, ease: 'Cubic.easeOut',
      onUpdate: () => {
        if (!g.active) return;
        g.clear();
        g.lineStyle(width * (0.35 + 0.65 * (st.a / a0)), color, st.a);
        g.strokeEllipse(ex, ey, st.r * 2, st.r * 2 * 0.72);
      },
      onComplete: () => g.destroy()
    });
  };

  // feixe de luz: núcleo quente + halo largo, nasce rápido; life > 0 some sozinho,
  // life = 0 fica aceso (pisca) até o stop()
  const addShaft = (x, y, { h = 100, w = 10, a = 0.9, life = 0, tilt = randF(-0.14, 0.14), tint = pick(VIOLETS) } = {}) => {
    const mk = (wm, am, color) => {
      const img = scene.add.image(x, y, BEAM_KEY)
        .setOrigin(0.5, 1).setDepth(DEPTH_BEAM).setBlendMode(ADD)
        .setTint(color).setRotation(tilt).setAlpha(0).setScale(0.01);
      fadeables.push(img);
      return [img, wm, am];
    };
    const p = { parts: [mk(1, 1, 0xf1e4ff), mk(3.4, 0.3, tint)], h, w, a, g: 0, boost: 1, boostW: 1 };
    shafts.push(p);
    scene.tweens.add({ targets: p, g: 1, duration: 90, ease: 'Quad.easeOut' });
    if (life > 0) {
      later(life, () => {
        scene.tweens.add({
          targets: p, g: 0, duration: life * 0.7, ease: 'Quad.easeIn',
          onComplete: () => {
            p.parts.forEach(([img]) => { if (img.active) img.destroy(); });
            const at = shafts.indexOf(p);
            if (at >= 0) shafts.splice(at, 1);
          }
        });
      });
    }
    return p;
  };
  const renderShafts = () => {
    const dim = scene.time.now - startedAt >= TREMOR_DURATION_MS ? 1.35 : 1; // sob o escurecimento, a luz precisa de mais força
    shafts.forEach((p) => {
      const f = 1 - flickerAmt + flickerAmt * Math.random();
      p.parts.forEach(([img, wm, am]) => {
        if (!img.active) return;
        img.setAlpha(Math.min(1, p.a * am * p.g * f * dim * (1 + fxState.pulse * 0.5)));
        img.setScale(
          ((p.w * wm) / 48) * p.boostW * (0.88 + 0.12 * Math.random()) * (0.4 + 0.6 * p.g),
          (p.h / 256) * p.g * p.boost
        );
      });
    });
  };

  // vários feixes de uma vez, saindo de pontos já abertos das rachaduras
  const burst = (n, k = 1) => {
    for (let i = 0; i < n; i += 1) {
      later(Phaser.Math.Between(0, 140), () => {
        const c = pick(cracks);
        if (!c || c.drawn < 2) return;
        const j = Phaser.Math.Between(1, c.drawn - 1);
        addShaft(c.pts[j].x, c.pts[j].y, {
          h: randF(80, 200) * (0.6 + 0.6 * k), w: randF(7, 14), life: Phaser.Math.Between(450, 800)
        });
      });
    }
  };

  const emitMote = () => {
    const a = randF(0, Math.PI * 2);
    const r = Phaser.Math.Between(10, phase === 3 ? 150 : 80);
    const x = ex + Math.cos(a) * r;
    const y = ey + Math.sin(a) * r * 0.7;
    const m = scene.add.image(x, y, SPARK_KEY).setDepth(DEPTH_SPARK).setBlendMode(ADD)
      .setTint(pick(VIOLETS)).setAlpha(0.9).setScale(randF(0.6, 1.4));
    scene.tweens.add({
      targets: m, y: y - Phaser.Math.Between(70, 160), x: x + randF(-18, 18), alpha: 0, scale: 0.1,
      duration: Phaser.Math.Between(1100, 2000), ease: 'Sine.easeOut', onComplete: () => m.destroy()
    });
  };

  // brilho das rachaduras (pisca + batimento), feixes e poça: tudo num laço só
  loop(33, () => {
    const t = scene.time.now - startedAt;
    if (phase === 2) glowLevel = Math.max(glowLevel, 0.55 + 0.3 * Phaser.Math.Clamp((t - SPREAD_START_MS) / 2750, 0, 1));
    else if (phase === 3) glowLevel = Math.max(glowLevel, 0.85 + 0.15 * Phaser.Math.Clamp((t - IMPACT2_AT_MS) / 9000, 0, 1));
    cracks.forEach((c) => {
      if (c.progress <= 0) return;
      const f = 1 - flickerAmt + flickerAmt * Math.random();
      const a = Math.min(1, glowLevel * f + fxState.pulse * 0.6 + c.flash);
      c.glow.setAlpha(a);
      c.halo?.setAlpha(Math.min(1, a * 0.8));
    });
    renderShafts();
    renderPool();
  });

  // feixes saindo das fendas: pequenos enquanto abrem, bem maiores depois do 2º impacto
  loop(110, () => {
    if (phase < 2) return;
    if (phase === 2) {
      if (Math.random() < 0.7) burst(1, 0.3);
    } else {
      burst(2, 0.9);
    }
  });
  loop(100, () => {
    if (phase < 2) return;
    emitMote();
    if (phase === 3) { emitMote(); if (Math.random() < 0.5) emitMote(); }
  });

  // luz do primeiro estrondo (a poça de energia só acende no 2º impacto)
  shockRing(260, 700, 0.9, 4);
  // alguns feixes médios que ficam acesos antes do 2º impacto: a luz já está "presa" lá embaixo
  later(1900, () => {
    for (let i = 0; i < 4; i += 1) {
      const c = pick(mainCracks);
      if (!c || c.drawn < 3) continue;
      const j = Phaser.Math.Between(2, c.drawn - 1);
      addShaft(c.pts[j].x, c.pts[j].y, { h: randF(70, 110), w: randF(6, 9), a: 0.8 });
    }
  });

  // ---------- ESTRONDO CONTÍNUO + TREMOR CRESCENTE ----------
  loop(110, () => {
    if (phase < 2) return;
    const t = scene.time.now - startedAt;
    if (t >= TREMOR_DURATION_MS) {
      // acabou o tremor "em cena": só um ronco baixo continua por baixo do
      // escurecimento (sem shake forçado, senão engole os batimentos dele)
      boost = 1.2;
      MinotaurAudio.setRumbleLevel(0.4, 400);
      return;
    }
    if (phase === 2) {
      const k = Phaser.Math.Clamp((t - SPREAD_START_MS) / (IMPACT2_AT_MS - SPREAD_START_MS), 0, 1);
      cam.shake(160, 0.003 + 0.007 * k, true);
      MinotaurAudio.setRumbleLevel(0.35 + 0.55 * k, 200);
    } else {
      const after = IMPACT2_AT_MS + IMPACT2_SHAKE_MS;
      const k = Phaser.Math.Clamp((t - after) / (TREMOR_DURATION_MS - after), 0, 1);
      if (t > after) cam.shake(160, 0.013 - 0.009 * k, true); // réplica forte que decai até o fim
      MinotaurAudio.setRumbleLevel(1.25 - 0.5 * k, 200);
    }
  });

  // ---------- SEGUNDO IMPACTO (muito pior) ----------
  later(IMPACT2_AT_MS, () => {
    phase = 3;
    boost = 2.4;
    MinotaurAudio.impact(scene, 1.5);
    scene.sound.play('sfx_cyberus_explosion', { volume: 1, rate: 0.34 });
    scene.sound.play('sfx_minotaur_stomp', { volume: 0.9, rate: 0.5 });
    if (scene.cache.audio.exists('sfx_terremoto')) scene.sound.play('sfx_terremoto', { volume: 0.9, rate: 0.42 });
    cam.shake(IMPACT2_SHAKE_MS, IMPACT2_SHAKE, true);

    // rachaduras clareiam num clarão, ganham mais conjuntos (mais longos) e a luz roxa rasga o chão
    cracks.forEach((c) => {
      c.flash = 1;
      scene.tweens.add({ targets: c, flash: 0, duration: 520, ease: 'Quad.easeOut' });
    });
    glowLevel = 0.85;
    fxState.pulse = 1;
    scene.tweens.add({ targets: fxState, pulse: 0, duration: 700, ease: 'Quad.easeOut' });
    spawnCrackSet(6, 80, 2, 1.25);
    later(450, () => spawnCrackSet(5, 0, 2.4, 1.7));
    cam.flash(240, 170, 110, 255);
    shockRing(440, 950, 1, 6, 0xe0c4ff);
    later(150, () => shockRing(320, 850, 0.8, 4, 0xc084ff));
    later(320, () => shockRing(560, 1200, 0.6, 3, 0x9b4dff));
    scene.tweens.add({ targets: poolState, a: 0.85, s: 3.4, duration: 400, ease: 'Cubic.easeOut' });
    later(900, () => scene.tweens.add({ targets: poolState, a: 0.65, s: 3.9, duration: 5000, ease: 'Sine.easeInOut' }));

    // jato central + colunas de luz nas pontas das rachaduras principais (ficam acesas até a entrada)
    addShaft(ex, ey, { h: 460, w: 34, a: 0.95, tilt: 0, tint: 0xb06bff });
    const tipShafts = (hMin, hMax, wMin, wMax) => mainCracks.forEach((c, i) => later(60 + i * 35, () => {
      const tip = c.pts[Math.min(c.pts.length - 1, c.drawn)];
      addShaft(tip.x, tip.y, { h: randF(hMin, hMax), w: randF(wMin, wMax), a: 0.85 });
    }));
    tipShafts(120, 240, 9, 15);
    later(1700, () => tipShafts(90, 170, 7, 11)); // as rachaduras que ainda estavam crescendo
    burst(16, 1);

    // pedrinhas saltam alto
    pebbles.forEach((p) => {
      scene.tweens.add({
        targets: p, hop: -Phaser.Math.Between(14, 34), duration: Phaser.Math.Between(140, 230),
        delay: Phaser.Math.Between(0, 90), yoyo: true, ease: 'Quad.easeOut'
      });
    });

    // nuvem de poeira subindo do epicentro e das rachaduras
    for (let i = 0; i < 30; i += 1) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const r = Phaser.Math.Between(0, 110);
      later(Phaser.Math.Between(0, 260), () => puff(ex + Math.cos(a) * r, ey + Math.sin(a) * r * 0.7, {
        tint: Phaser.Utils.Array.GetRandom([0xcfc6b8, 0xb5ab9b, 0x9a9183]),
        alpha: Phaser.Math.FloatBetween(0.4, 0.62), s0: 0.6, s1: Phaser.Math.FloatBetween(1.8, 2.8),
        rise: Phaser.Math.Between(30, 80), min: 1000, max: 1700
      }));
    }

    // explosão de energia violeta
    for (let i = 0; i < 30; i += 1) later(Phaser.Math.Between(0, 220), () => emitSpark(true));

    // fragmentos de pedra arremessados em arco
    const shardCount = 18;
    for (let i = 0; i < shardCount; i += 1) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sx = ex + Math.cos(a) * Phaser.Math.Between(0, 40);
      const sy = ey + Math.sin(a) * Phaser.Math.Between(0, 25);
      const dist = Phaser.Math.Between(50, 200);
      const tx = sx + Math.cos(a) * dist;
      const ty = sy + Math.sin(a) * dist * 0.7;
      const peak = Phaser.Math.Between(40, 120);
      const dur = Phaser.Math.Between(520, 950);
      const scale = Phaser.Math.FloatBetween(0.7, 1.7);
      const shard = scene.add.image(sx, sy, Phaser.Utils.Array.GetRandom(SHARD_KEYS))
        .setDepth(DEPTH_SHARD).setTint(Phaser.Utils.Array.GetRandom(PEBBLE_TINTS)).setScale(scale);
      const shadow = scene.add.image(sx, sy, DUST_KEY).setDepth(DEPTH_SHARD_SHADOW)
        .setTint(0x000000).setAlpha(0.4).setScale(0.35 * scale, 0.18 * scale);
      fadeables.push(shard, shadow);
      const spin = Phaser.Math.FloatBetween(-18, 18);
      const prog = { k: 0 };
      scene.tweens.add({
        targets: prog, k: 1, duration: dur, delay: Phaser.Math.Between(0, 120), ease: 'Linear',
        onUpdate: () => {
          const k = prog.k;
          const gx = sx + (tx - sx) * k;
          const gy = sy + (ty - sy) * k;
          const h = 4 * peak * k * (1 - k);
          shard.setPosition(gx, gy - h);
          shard.rotation += spin * 0.016;
          shadow.setPosition(gx, gy).setAlpha(0.4 * (1 - h / (peak * 1.4)));
        },
        onComplete: () => {
          shard.setDepth(DEPTH_PEBBLE).setPosition(tx, ty); // pousa e vira entulho no chão
          puff(tx, ty, { alpha: 0.35, s0: 0.3, s1: 0.9, rise: 10, min: 350, max: 550 });
        }
      });
    }
  });

  later(TREMOR_DURATION_MS, () => { if (hooks.onDone) hooks.onDone(); });

  return {
    // batimento do Minotauro (i-ésimo de total): a luz toda pulsa, anel no chão, feixes novos
    pulse(i = 0, total = 6) {
      if (stopped) return;
      const k = Phaser.Math.Clamp((i + 1) / Math.max(1, total), 0, 1);
      scene.tweens.killTweensOf(fxState);
      fxState.pulse = 0.4 + 0.6 * k;
      scene.tweens.add({ targets: fxState, pulse: 0, duration: 420, ease: 'Quad.easeOut' });
      shockRing(200 + 160 * k, 650 + 300 * k, 0.5 + 0.5 * k, 2 + 3 * k);
      burst(3 + Math.round(9 * k), k);
    },

    // chamar logo antes do stop() da entrada: toda a luz estoura de uma vez
    climax() {
      if (stopped) return;
      fxState.pulse = 1;
      shafts.forEach((p) => { p.boost = 1.7; p.boostW = 2.4; p.g = 1; });
      cracks.forEach((c) => { c.flash = 1; });
      poolState.a = 1;
      poolState.s *= 1.25;
      renderShafts();
      renderPool();
      cracks.forEach((c) => { c.glow.setAlpha(1); c.halo?.setAlpha(1); });
      shockRing(620, 650, 1, 7, 0xffffff);
    },

    stop(fadeMs = 300) {
      if (stopped) return;
      stopped = true;
      timers.forEach((t) => t.remove?.());
      dustTimer.remove();
      MinotaurAudio.stopRumble(Math.max(300, fadeMs * 2));
      fadeables.forEach((o) => {
        if (!o.active) return;
        scene.tweens.add({ targets: o, alpha: 0, duration: fadeMs, onComplete: () => o.destroy() });
      });
    }
  };
}

export default playBossTremor;
