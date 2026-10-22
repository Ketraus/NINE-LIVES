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
//   t~4.6    onDone — o tremor residual segue só até o chamador assumir
//            (escurecimento do SpawnDirector); stop() desfaz tudo
//
// Só visual/áudio, em coordenadas de MUNDO. stop() é idempotente.

import MinotaurAudio from '../systems/MinotaurAudio.js';

export const TREMOR_DURATION_MS = 4600;

const PEBBLE_KEYS = ['tremor_pebble_a', 'tremor_pebble_b', 'tremor_pebble_c'];
const SHARD_KEYS = ['tremor_shard_a', 'tremor_shard_b', 'tremor_shard_c'];
const DUST_KEY = 'tremor_dust';
const SPARK_KEY = 'tremor_spark';

const DEPTH_CRACK = 2.2;
const DEPTH_CRACK_GLOW = 2.3;
const DEPTH_PEBBLE = 3;
const DEPTH_SHARD_SHADOW = 2.6;
const DEPTH_DUST = 11;
const DEPTH_SPARK = 12;
const DEPTH_SHARD = 20;

const PEBBLE_COUNT = 34;
const MAIN_CRACKS = 9;

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
  const makeCrack = (pts, delay, speed) => {
    const core = scene.add.graphics().setDepth(DEPTH_CRACK);
    const glow = scene.add.graphics().setDepth(DEPTH_CRACK_GLOW).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    fadeables.push(core, glow);
    let total = 0;
    const lens = [0];
    for (let i = 1; i < pts.length; i += 1) {
      total += Phaser.Math.Distance.Between(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      lens.push(total);
    }
    const crack = { pts, lens, total, core, glow, drawn: 1, progress: 0 };
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
      part(core, 2, 0x0d0a10, 0.95);
      part(glow, 6, 0x7a2bd9, 0.5);
      glow.lineStyle(1.5, 0xd9b3ff, 0.9); // fio quente no meio do brilho
      glow.beginPath();
      glow.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < idx; i += 1) glow.lineTo(pts[i].x, pts[i].y);
      glow.lineTo(last.x, last.y);
      glow.strokePath();
    };
    scene.tweens.add({
      targets: crack, progress: 1, duration: (total / speed) * 1000, delay, ease: 'Quad.easeOut',
      onUpdate: draw,
      onStart: () => { glow.setAlpha(glowLevel); }
    });
    return crack;
  };

  const spawnCrackSet = (count, baseDelay, speedMul = 1, lenMul = 1) => {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.3, 0.3);
      const length = Phaser.Math.Between(150, 300) * lenMul;
      const pts = buildPath(ex, ey, angle, length);
      const speed = Phaser.Math.Between(90, 150) * speedMul;
      const delay = baseDelay + Phaser.Math.Between(0, 500);
      makeCrack(pts, delay, speed);
      // ramificações saindo do meio do caminho
      [0.35, 0.65].forEach((frac) => {
        if (Math.random() < 0.35) return;
        const from = pts[Math.min(pts.length - 1, Math.floor(pts.length * frac))];
        const bAngle = angle + Phaser.Math.FloatBetween(0.5, 0.95) * (Math.random() < 0.5 ? -1 : 1);
        const bPts = buildPath(from.x, from.y, bAngle, Phaser.Math.Between(40, 95) * lenMul, 0.55);
        makeCrack(bPts, delay + (length * frac / speed) * 1000, speed * 0.8);
      });
    }
  };
  later(SPREAD_START_MS, () => { phase = 2; spawnCrackSet(MAIN_CRACKS, 0); });

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

    // rachaduras clareiam num clarão e ganham mais um conjunto, mais longo
    cracks.forEach((c) => scene.tweens.add({ targets: c.glow, alpha: 1, duration: 90, yoyo: true, hold: 120 }));
    glowLevel = 0.85;
    spawnCrackSet(6, 80, 2, 1.25);

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
