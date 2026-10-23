import MinotaurAudio from '../systems/MinotaurAudio.js';
import SettingsManager from '../systems/SettingsManager.js';
import { defaultFx } from './BossEntrancePipeline.js';

// Entrada cinematográfica do Minotauro. Três peças, todas só visual/áudio:
//
//   startBossEntranceBuildup(scene, epicentro, ms)
//       os 6s de silêncio antes do nascimento (SpawnDirector): letterbox
//       desce, o mundo é sugado pro epicentro e a lente treme a cada batimento.
//   playBossEntranceImpact(scene, enemy)
//       o nascimento (EnemySpawner._playBossEntranceFx): clarão + glitch +
//       ondas de choque, coluna de luz, feixes de luz nas pontas das
//       raízes de energia, flare anamórfico e o Minotauro se materializando. Lança erro se não houver WebGL (o
//       chamador cai no pop simples).
//   startBossFightGrade(scene, enemy)
//       filtro da luta inteira (chamado ao fim do nascimento): viragem roxa
//       suave na fase 1; na fúria vira ciano e mais intenso; some na morte.
//   createPresenceFx(scene, epicentro)
//       versão SNCT (systems/SnctEnding.js): a criatura NÃO aparece; só a
//       lente reage — respiração, silêncio, rugido em cascata, corte seco.
//
// Tudo conversa com o shader fx/BossEntrancePipeline.js através de pipe.fx.

const PIPE = 'BossEntrance';
const GROUND_SQUASH = 0.55; // achatamento do chão (perspectiva)
const VIOLETS = [0x9b4dff, 0xc084ff, 0xe0c4ff, 0x6a1fd0];

const TEX = { glow: 'bossfx_glow', pillar: 'bossfx_pillar', dot: 'bossfx_dot' };
const DEPTH = { glowGround: 2.4, roots: 8.5, pillar: 8.8, slices: 8.9, spark: 12 };

const IMPACT_RELEASE_AT_MS = 2800; // a partir daqui a lente volta ao normal
const IMPACT_RELEASE_MS = 800;
const IMPACT_END_MS = 3700;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const rand = (a, b) => Phaser.Math.FloatBetween(a, b);

// ---------------------------------------------------------------- pipeline

function hasWebGl(scene) {
  return scene.renderer?.type === Phaser.WEBGL;
}

function findPipe(cam) {
  const found = cam.getPostPipeline(PIPE);
  return Array.isArray(found) ? found[0] : found;
}

// pega (ou cria) o shader na câmera principal e conta um uso (pins)
function acquirePipe(scene) {
  if (!hasWebGl(scene)) return null;
  const cam = scene.cameras.main;
  let pipe = findPipe(cam);
  if (!pipe) {
    cam.setPostPipeline(PIPE);
    pipe = findPipe(cam);
  }
  if (!pipe) return null;
  pipe.pins += 1;
  return pipe;
}

// quando ninguém usa e a imagem já está limpa, tira o shader da câmera
function scheduleReap(scene, pipe) {
  if (pipe._reap) return;
  const tick = () => {
    pipe._reap = null;
    if (!scene.sys?.isActive()) return;
    if (pipe.pins > 0 || pipe.impactActive || !pipe.isIdle()) {
      pipe._reap = scene.time.delayedCall(400, tick);
      return;
    }
    try { scene.cameras.main.removePostPipeline(pipe); } catch (e) { /* câmera já destruída */ }
  };
  pipe._reap = scene.time.delayedCall(400, tick);
}

function releasePipe(scene, pipe) {
  pipe.pins = Math.max(0, pipe.pins - 1);
  scheduleReap(scene, pipe);
}

// zera tudo na hora (mantém só o foco)
function hardReset(scene, pipe) {
  scene.tweens.killTweensOf(pipe.fx);
  pipe.fx.rings.forEach((ring) => scene.tweens.killTweensOf(ring));
  const { focusX, focusY } = pipe.fx;
  pipe.fx = Object.assign(defaultFx(), { focusX, focusY });
}

// volta suave ao normal e libera o shader
function easeOutToIdle(scene, pipe, ms) {
  const f = pipe.fx;
  scene.tweens.killTweensOf(f);
  scene.tweens.add({
    targets: f,
    zoom: 1, pinch: 0, blur: 0, aberr: 0, splitX: 0, splitY: 0, glitch: 0,
    pixel: 0, invert: 0, flashA: 0, gradeA: 0, vignette: 0, bars: 0,
    duration: ms,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      f.rings.length = 0;
      scheduleReap(scene, pipe);
    }
  });
}

// ---------------------------------------------------------------- utilitários

// agenda/tweens/updates de uma cinemática, todos cancelados juntos
function makeCine(scene) {
  const timers = [];
  const tweens = [];
  const updaters = [];
  let stopped = false;

  const onUpdate = () => {
    if (stopped) return;
    updaters.forEach((fn) => fn());
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const cine = {
    isStopped: () => stopped,
    later(ms, fn) {
      const ev = scene.time.delayedCall(ms, () => { if (!stopped) fn(); });
      timers.push(ev);
      return ev;
    },
    loop(ms, fn) {
      const ev = scene.time.addEvent({ delay: ms, loop: true, callback: () => { if (!stopped) fn(); } });
      timers.push(ev);
      return ev;
    },
    tween(cfg) {
      const tw = scene.tweens.add(cfg);
      tweens.push(tw);
      return tw;
    },
    update(fn) {
      updaters.push(fn);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cine.stop);
      timers.forEach((ev) => ev.remove?.(false));
      tweens.forEach((tw) => { try { tw.stop(); } catch (e) { /* já terminou */ } });
    }
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cine.stop);
  return cine;
}

function ensureTextures(scene) {
  const make = (key, w, h, painter) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, h);
    painter(tex.getContext(), w, h);
    tex.refresh();
  };

  make(TEX.glow, 128, 128, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  make(TEX.dot, 16, 16, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0.5, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  // coluna de luz: núcleo fino e quente + halo largo; some pra cima, firme na base
  make(TEX.pillar, 64, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      const vy = y / (h - 1); // 0 topo .. 1 base
      const vertical = Math.pow(clamp01(vy * 1.25), 0.8) * (0.55 + 0.45 * vy);
      for (let x = 0; x < w; x += 1) {
        const dx = (x - w / 2) / (w / 2);
        const core = Math.exp(-Math.pow(dx / 0.16, 2));
        const halo = Math.exp(-Math.pow(dx / 0.55, 2)) * 0.4;
        const a = clamp01((core + halo) * vertical);
        const i = (y * w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// caminhada aleatória que se afasta de (x,y) no ângulo, achatada pelo chão
function buildPath(x, y, angle, length, wander = 0.45) {
  const pts = [{ x, y }];
  let acc = 0;
  let a = angle;
  while (acc < length) {
    a += rand(-wander, wander);
    const seg = Phaser.Math.Between(9, 18);
    x += Math.cos(a) * seg;
    y += Math.sin(a) * seg * GROUND_SQUASH;
    acc += seg;
    pts.push({ x, y });
  }
  return pts;
}

function makeRoot(pts, delay, speed) {
  const lens = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    total += Phaser.Math.Distance.Between(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    lens.push(total);
  }
  return { pts, lens, total, delay, duration: (total / speed) * 1000 };
}

// pontos do pedaço já "crescido" da raiz, com tremidinha de relâmpago
function rootPoints(root, progress, jitter) {
  const target = progress * root.total;
  const out = [];
  for (let i = 0; i < root.pts.length; i += 1) {
    const p = root.pts[i];
    if (root.lens[i] > target) {
      const prev = root.pts[i - 1];
      if (prev) {
        const span = root.lens[i] - root.lens[i - 1] || 1;
        const f = clamp01((target - root.lens[i - 1]) / span);
        out.push({ x: prev.x + (p.x - prev.x) * f, y: prev.y + (p.y - prev.y) * f });
      }
      break;
    }
    out.push({
      x: p.x + (i > 0 ? rand(-jitter, jitter) : 0),
      y: p.y + (i > 0 ? rand(-jitter, jitter) : 0)
    });
  }
  return out;
}

function strokeLine(g, pts, width, color, alpha) {
  if (pts.length < 2) return;
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
  g.strokePath();
}

// onda de choque: nasce em (wx,wy) e abre até `to` (alturas de tela)
function addRing(cine, pipe, wx, wy, { delay = 0, to = 1.6, ms = 1100, a0 = 1.1, r0 = 0.02 } = {}) {
  cine.later(delay, () => {
    const ring = { wx, wy, r: r0, a: a0 };
    pipe.fx.rings.push(ring);
    cine.tween({
      targets: ring,
      r: to,
      a: 0,
      duration: ms,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        const list = pipe.fx.rings;
        const at = list.indexOf(ring);
        if (at >= 0) list.splice(at, 1);
      }
    });
  });
}

const NOOP_HANDLE = {
  heartbeat() {},
  finish() {},
  cancel() {}
};

// ---------------------------------------------------------------- 1) buildup

export function startBossEntranceBuildup(scene, epicenter, durationMs = 6000) {
  const pipe = acquirePipe(scene);
  if (!pipe) return NOOP_HANDLE;

  const cam = scene.cameras.main;
  const ex = epicenter?.x ?? cam.midPoint.x;
  const ey = epicenter?.y ?? cam.midPoint.y;
  const cine = makeCine(scene);
  let released = false;

  pipe.fx.focusX = ex;
  pipe.fx.focusY = ey;
  pipe.fx.barSize = 0.07;

  // o mundo é sugado devagar pro epicentro; cada batimento dá um tranco por cima
  const st = { pull: 0 };
  const bt = { beat: 0, kick: 0 };
  cine.update(() => {
    const f = pipe.fx;
    f.zoom = 1 + 0.05 * st.pull;
    f.pinch = 0.05 * st.pull + bt.beat;
    f.aberr = 0.25 * st.pull + bt.kick;
  });
  cine.tween({ targets: st, pull: 1, duration: durationMs, ease: 'Sine.easeIn' });
  cine.tween({ targets: pipe.fx, vignette: 0.5, gradeA: 0.3, duration: durationMs, ease: 'Sine.easeIn' });
  cine.tween({ targets: pipe.fx, bars: 1, duration: 1100, ease: 'Cubic.easeOut' });

  const release = () => {
    if (released) return;
    released = true;
    cine.stop();
    releasePipe(scene, pipe);
  };

  return {
    // i-ésimo batimento (0..total-1): ficam mais fortes e os últimos já racham a imagem
    heartbeat(i, total) {
      if (cine.isStopped()) return;
      const k = clamp01((i + 1) / Math.max(1, total));
      scene.tweens.killTweensOf(bt);
      cine.tween({
        targets: bt,
        beat: 0.04 + 0.08 * k,
        kick: 0.4 + 0.6 * k,
        duration: 70,
        ease: 'Quad.easeOut',
        onComplete: () => {
          cine.tween({ targets: bt, beat: 0, kick: 0, duration: 320, ease: 'Quad.easeOut' });
        }
      });
      if (i >= total - 3) {
        pipe.fx.glitch = 0.25 + 0.35 * k;
        pipe.fx.splitX = 0.004 * k;
        cine.tween({ targets: pipe.fx, glitch: 0, splitX: 0, duration: 150, ease: 'Quad.easeOut' });
      }
    },

    // o impacto assume o shader no estado em que está; se ele não vier, desfaz
    finish() {
      if (released) return;
      release();
      scene.time.delayedCall(1500, () => {
        if (!pipe.impactActive && pipe.pins === 0) easeOutToIdle(scene, pipe, 700);
      });
    },

    cancel() {
      if (released) return;
      released = true;
      cine.stop();
      hardReset(scene, pipe);
      releasePipe(scene, pipe);
    }
  };
}

// ---------------------------------------------------------------- 2) impacto

export function playBossEntranceImpact(scene, enemy) {
  if (!hasWebGl(scene)) throw new Error('BossEntrance: sem WebGL');
  const pipe = acquirePipe(scene);
  if (!pipe) throw new Error('BossEntrance: pipeline não registrado');

  ensureTextures(scene);
  const cam = scene.cameras.main;
  const cine = makeCine(scene);
  const objs = [];
  const t0 = scene.time.now;
  pipe.impactActive = true;

  const baseScale = enemy.baseScale || 1;
  const frameH = enemy.height * baseScale; // altura "cheia" (o enemy nasce pequeno)
  const ex = enemy.x;
  const ey = enemy.y;
  const feetY = ey + frameH * (enemy._shadowYFrac ?? 0.46);
  const focusY = ey - frameH * 0.05;
  const view = cam.worldView;

  const f = pipe.fx;
  f.focusX = ex;
  f.focusY = focusY;
  f.flashColor = [0.96, 0.9, 1];
  f.gradeColor = [0.62, 0.36, 1];
  f.edgeColor = [0.9, 0.7, 1];
  f.barSize = 0.06;

  // ---- estado "vivo" do shader: o glitch é base + rajadas, escrito todo frame
  const st = { glitch: 1, burst: 0 };
  cine.update(() => {
    pipe.fx.glitch = Math.min(1, st.glitch + st.burst);
  });

  // ---- 0ms: o golpe
  f.flashA = 0.55;
  f.pixel = 0.9;
  f.invert = 1;
  f.aberr = 1;
  f.splitX = 0.014;
  f.blur = 0.8;
  f.zoom = 1.14;
  f.pinch = 0;
  cine.tween({ targets: f, flashA: 0, duration: 380, delay: 30, ease: 'Cubic.easeOut' });
  cine.tween({ targets: f, pixel: 0, duration: 300, ease: 'Quad.easeOut' });
  cine.tween({ targets: f, invert: 0, duration: 200, delay: 40, ease: 'Linear' });
  cine.tween({ targets: f, splitX: 0, duration: 300, ease: 'Quad.easeOut' });
  cine.tween({ targets: f, blur: 0, duration: 400, ease: 'Quad.easeOut' });
  cine.tween({ targets: f, pinch: 0, splitY: 0, duration: 250, ease: 'Quad.easeOut' }); // resto do buildup
  cine.tween({ targets: f, aberr: 0.35, duration: 900, ease: 'Cubic.easeOut' });
  cine.tween({ targets: f, zoom: 1.03, duration: 450, ease: 'Cubic.easeOut' });
  cine.tween({ targets: f, gradeA: 0.55, vignette: 0.55, duration: 400, delay: 60, ease: 'Sine.easeOut' });
  cine.tween({ targets: f, bars: 1, duration: 320, delay: 80, ease: 'Cubic.easeOut' });
  cine.tween({ targets: st, glitch: 0, duration: 1900, ease: 'Quad.easeOut' });

  // rajadas de glitch espalhadas
  [40, 140, 260, 390, 520, 680, 860, 1050, 1300, 1600].forEach((ms) => {
    cine.later(ms, () => {
      st.burst = rand(0.55, 0.95);
      cine.tween({ targets: st, burst: 0, duration: 90 });
    });
  });

  // ondas de choque: uma no peito do boss, três no chão
  addRing(cine, pipe, ex, focusY, { to: 1.7, ms: 1000, a0: 1.2 });
  addRing(cine, pipe, ex, feetY, { delay: 60, to: 1.6, ms: 1100, a0: 1.2 });
  addRing(cine, pipe, ex, feetY, { delay: 170, to: 1.5, ms: 1200, a0: 1.0 });
  addRing(cine, pipe, ex, feetY, { delay: 420, to: 1.3, ms: 1500, a0: 0.8 });

  // ---- chão: brilho e anel fino
  const glow = scene.add.image(ex, feetY, TEX.glow)
    .setDepth(DEPTH.glowGround)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(VIOLETS[0])
    .setAlpha(0)
    .setScale((frameH * 3.2) / 128, ((frameH * 3.2) / 128) * GROUND_SQUASH);
  objs.push(glow);
  cine.tween({ targets: glow, alpha: 0.95, duration: 120, ease: 'Quad.easeOut' });
  cine.tween({ targets: glow, alpha: 0.4, duration: 1400, delay: 160, ease: 'Sine.easeOut' });

  const ringG = scene.add.graphics().setDepth(DEPTH.roots).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  objs.push(ringG);
  const ringState = { radius: frameH * 0.55 };
  cine.update(() => {
    if (!ringG.active || ringG.alpha <= 0.01) return;
    ringG.clear();
    ringG.lineStyle(2, 0xb06bff, 0.85);
    ringG.strokeEllipse(ex, feetY, ringState.radius * 2, ringState.radius * 2 * GROUND_SQUASH);
  });
  cine.later(300, () => {
    cine.tween({ targets: ringG, alpha: 0.55, duration: 200 });
    cine.tween({ targets: ringState, radius: frameH * 0.85, duration: 2400, ease: 'Sine.easeOut' });
  });

  // ---- coluna de luz
  const pillarH = (view.height * 1.6) + frameH;
  const pillar = scene.add.image(ex, feetY, TEX.pillar)
    .setOrigin(0.5, 1)
    .setDepth(DEPTH.pillar)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xd9b8ff)
    .setAlpha(0);
  objs.push(pillar);
  const pillarState = { width: 0.2 };
  const pillarBaseW = frameH * 0.85;
  const applyPillar = () => {
    if (!pillar.active) return;
    pillar.setDisplaySize(pillarBaseW * pillarState.width, pillarH);
  };
  cine.update(applyPillar);
  cine.tween({ targets: pillar, alpha: 1, duration: 70, delay: 20 });
  cine.tween({ targets: pillarState, width: 1, duration: 140, delay: 20, ease: 'Cubic.easeOut' });
  cine.tween({ targets: pillarState, width: 0.35, duration: 1500, delay: 900, ease: 'Sine.easeInOut' });
  cine.tween({ targets: pillar, alpha: 0, duration: 900, delay: 1700, ease: 'Sine.easeIn' });
  // pisca de leve enquanto está forte
  cine.loop(60, () => {
    if (!pillar.active || scene.time.now - t0 > 1700) return;
    pillar.setAlpha(rand(0.7, 1));
  });

  // fatias horizontais brilhantes no pé da coluna (glitch)
  const slices = [];
  for (let i = 0; i < 6; i += 1) {
    const s = scene.add.rectangle(ex, feetY, 100, 6, 0xe0c4ff, 0.9)
      .setDepth(DEPTH.slices)
      .setBlendMode(Phaser.BlendModes.ADD);
    slices.push(s);
    objs.push(s);
  }
  const scatterSlices = () => {
    slices.forEach((s) => {
      if (!s.active) return;
      s.setSize(rand(frameH * 0.5, frameH * 1.3), rand(3, 8));
      s.setPosition(ex + rand(-frameH * 0.5, frameH * 0.5), feetY - rand(4, frameH * 0.9));
      s.setFillStyle(Phaser.Utils.Array.GetRandom(VIOLETS), rand(0.55, 1));
    });
  };
  scatterSlices();
  const sliceTimer = cine.loop(55, () => {
    if (scene.time.now - t0 > 1100) {
      slices.forEach((s) => s.destroy());
      sliceTimer.remove(false);
      return;
    }
    scatterSlices();
  });

  // ---- raízes de energia (crescem do epicentro)
  const roots = [];
  const mainRoots = 12;
  for (let i = 0; i < mainRoots; i += 1) {
    const angle = (Math.PI * 2 * i) / mainRoots + rand(-0.3, 0.3);
    const length = Phaser.Math.Between(130, 290);
    const speed = Phaser.Math.Between(380, 520);
    const delay = Phaser.Math.Between(60, 220);
    const pts = buildPath(ex, feetY, angle, length);
    const mainRoot = makeRoot(pts, delay, speed);
    mainRoot.main = true;
    roots.push(mainRoot);
    [0.35, 0.65].forEach((frac) => {
      if (Math.random() < 0.35) return;
      const from = pts[Math.min(pts.length - 1, Math.floor(pts.length * frac))];
      const bAngle = angle + rand(0.5, 0.95) * (Math.random() < 0.5 ? -1 : 1);
      const bPts = buildPath(from.x, from.y, bAngle, Phaser.Math.Between(40, 100), 0.55);
      roots.push(makeRoot(bPts, delay + ((length * frac) / speed) * 1000, speed * 0.8));
    });
  }
  const rootsG = scene.add.graphics().setDepth(DEPTH.roots).setBlendMode(Phaser.BlendModes.ADD);
  objs.push(rootsG);
  let frameCount = 0;
  cine.update(() => {
    if (!rootsG.active) return;
    frameCount += 1;
    const t = scene.time.now - t0;
    if (t > 1300 && frameCount % 2 === 1) return; // depois de crescer, redesenha em metade dos quadros
    rootsG.clear();
    roots.forEach((root) => {
      const p = clamp01((t - root.delay) / Math.max(1, root.duration));
      if (p <= 0) return;
      const eased = 1 - Math.pow(1 - p, 2);
      const pts = rootPoints(root, eased, 1.6);
      strokeLine(rootsG, pts, 9, 0x7a2bd9, 0.16);
      strokeLine(rootsG, pts, 3.5, 0xb06bff, 0.75);
      strokeLine(rootsG, pts, 1.4, 0xf1e4ff, 1);
    });
  });
  cine.tween({ targets: rootsG, alpha: 0, duration: 1000, delay: 2600, ease: 'Sine.easeIn' });

  // ---- faíscas violeta subindo
  const sparkLoop = cine.loop(46, () => {
    if (scene.time.now - t0 > 2500) {
      sparkLoop.remove(false);
      return;
    }
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * frameH * 0.9;
    const x = ex + Math.cos(a) * r;
    const y = feetY + Math.sin(a) * r * GROUND_SQUASH;
    const dot = scene.add.image(x, y, TEX.dot)
      .setDepth(DEPTH.spark)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom(VIOLETS))
      .setAlpha(0.95)
      .setScale(rand(0.5, 1.2));
    scene.tweens.add({
      targets: dot,
      x: x + rand(-10, 10),
      y: y - Phaser.Math.Between(40, 120),
      alpha: 0,
      scale: 0.1,
      duration: Phaser.Math.Between(700, 1500),
      ease: 'Sine.easeOut',
      onComplete: () => dot.destroy()
    });
  });

  // ---- feixes de luz: rasgam o chão nas pontas das raízes e em volta do boss
  const addBeam = (x, y, h, w, life, alpha = 0.9, delay = 0) => {
    cine.later(delay, () => {
      const img = scene.add.image(x, y, TEX.pillar)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.pillar - 0.1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(Phaser.Utils.Array.GetRandom(VIOLETS))
        .setRotation(rand(-0.1, 0.1))
        .setAlpha(0)
        .setScale(w / 64, 0.02);
      objs.push(img);
      cine.tween({ targets: img, scaleY: h / 256, alpha, duration: 110, ease: 'Cubic.easeOut' });
      cine.tween({
        targets: img,
        alpha: 0,
        scaleX: (w / 64) * 0.3,
        duration: life,
        delay: 140,
        ease: 'Quad.easeIn',
        onComplete: () => { if (img.active) img.destroy(); }
      });
    });
  };
  // coroa de feixes em volta do Minotauro, na hora do golpe
  for (let i = 0; i < 7; i += 1) {
    const a = (Math.PI * 2 * i) / 7 + rand(-0.25, 0.25);
    const r = frameH * rand(0.45, 0.8);
    addBeam(ex + Math.cos(a) * r, feetY + Math.sin(a) * r * GROUND_SQUASH,
      rand(frameH * 0.9, frameH * 2), rand(26, 46), Phaser.Math.Between(650, 1000), 0.85, Phaser.Math.Between(0, 200));
  }
  // cada raiz principal, quando chega na ponta, solta um feixe maior
  roots.filter((root) => root.main).forEach((root) => {
    const tip = root.pts[root.pts.length - 1];
    addBeam(tip.x, tip.y, rand(frameH * 1.2, frameH * 2.6), rand(30, 54), Phaser.Math.Between(800, 1300), 0.9,
      root.delay + root.duration);
  });

  // ---- ondas de choque no chão (elipses de luz que abrem) + flare anamórfico
  const groundRing = (delay, to, ms, width, color, a0 = 0.9) => {
    cine.later(delay, () => {
      const g = scene.add.graphics().setDepth(DEPTH.roots).setBlendMode(Phaser.BlendModes.ADD);
      objs.push(g);
      const st = { r: frameH * 0.3, a: a0 };
      cine.tween({
        targets: st, r: to, a: 0, duration: ms, ease: 'Cubic.easeOut',
        onUpdate: () => {
          if (!g.active) return;
          g.clear();
          g.lineStyle(width * (0.3 + 0.7 * (st.a / a0)), color, st.a);
          g.strokeEllipse(ex, feetY, st.r * 2, st.r * 2 * GROUND_SQUASH);
        },
        onComplete: () => { if (g.active) g.destroy(); }
      });
    });
  };
  groundRing(0, 560, 1000, 7, 0xf1e4ff);
  groundRing(200, 420, 1100, 4, 0xb06bff, 0.75);
  groundRing(480, 640, 1400, 3, 0x9b4dff, 0.55);

  const streak = scene.add.image(ex, focusY, TEX.glow)
    .setDepth(DEPTH.spark)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xe0c4ff)
    .setAlpha(0.95)
    .setScale((view.width * 1.2) / 128, 0.07);
  objs.push(streak);
  cine.tween({ targets: streak, alpha: 0, scaleY: 0.015, duration: 520, delay: 40, ease: 'Cubic.easeOut' });

  // ---- o Minotauro se materializa
  enemy.setScale(baseScale * 0.25);
  enemy.setAlpha(0);
  enemy.shadow?.setVisible(false);

  const solidify = () => {
    if (!enemy.active) return;
    enemy._currentStatusTint = null;
    enemy._refreshStatusTint(scene.time.now);
  };
  // silhueta clara que pisca até estabilizar, sem overshoot na escala
  [[150, 1], [195, 0.15], [240, 1], [285, 0.4], [340, 1]].forEach(([ms, alpha]) => {
    cine.later(ms, () => {
      if (!enemy.active) return;
      enemy.setTintFill(0xe9d5ff);
      enemy.setAlpha(alpha);
    });
  });
  cine.later(150, () => {
    if (!enemy.active) return;
    scene.tweens.add({ targets: enemy, scaleX: baseScale, scaleY: baseScale, duration: 420, ease: 'Cubic.easeOut' });
  });
  cine.later(620, () => {
    if (!enemy.active) return;
    enemy.setTintFill(0xb06bff);
  });
  cine.later(760, () => {
    solidify();
    enemy.shadow?.setVisible(true);
  });

  // ---- tremor e som
  cine.later(260, () => cam.shake(300, 0.006, true));
  cine.later(700, () => cam.shake(500, 0.004, true));
  MinotaurAudio.impact(scene, 1.25);
  cine.later(120, () => {
    if (scene.cache.audio.exists('sfx_minotaur_stomp')) {
      scene.sound.play('sfx_minotaur_stomp', { volume: 0.8, rate: 0.55 });
    }
  });

  // ---- fim: a lente volta ao normal, os objetos somem
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    objs.forEach((o) => { if (o.active) o.destroy(); });
    cine.stop();
    // o enemy pode ter sido destruído no meio: nada mais a restaurar
    if (enemy.active) {
      solidify();
      enemy.setAlpha(1);
      enemy.shadow?.setVisible(true);
    }
    pipe.impactActive = false;
    easeOutToIdle(scene, pipe, 200); // no fim normal já está limpo; se foi cancelado antes, desfaz rápido
    releasePipe(scene, pipe);
  };

  cine.later(IMPACT_RELEASE_AT_MS, () => {
    // o filtro roxo da luta entra junto da lente voltando ao normal (sem corte)
    if (enemy.active) startBossFightGrade(scene, enemy);
    cine.tween({
      targets: pipe.fx,
      zoom: 1, aberr: 0, gradeA: 0, vignette: 0, bars: 0,
      duration: IMPACT_RELEASE_MS,
      ease: 'Sine.easeInOut'
    });
  });
  cine.later(IMPACT_END_MS, finish);

  return { cancel: finish };
}

// ---------------------------------------------------------------- 4) filtro da luta

const FIGHT_GRADE = {
  phase1: { a: 0.2, vig: 0.28, color: [0.62, 0.36, 1], edge: [0.9, 0.7, 1] }, // roxo suave
  phase2: { a: 0.42, vig: 0.52, color: [0.1, 0.82, 1], edge: [0.6, 0.95, 1] } // ciano intenso (fúria)
};
const FIGHT_FADE_IN_MS = 1600;
const FIGHT_PHASE_SWAP_MS = 700;
const FIGHT_FADE_OUT_MS = 1400;
const FIGHT_DEATH_FADE_MS = 2400;

export function startBossFightGrade(scene, enemy) {
  if (!hasWebGl(scene)) return null;
  scene._bossFightGrade?.stop(0);
  const pipe = acquirePipe(scene);
  if (!pipe) return null;

  const amb = pipe.amb;
  const st = { master: 0, k: enemy.isEnraged ? 1 : 0, spike: 0 };
  let enraged = Boolean(enemy.isEnraged);
  let ending = false;
  let done = false;

  const lerp = (a, b, t) => a + (b - a) * t;

  const apply = () => {
    const { phase1: p1, phase2: p2 } = FIGHT_GRADE;
    const reducedFlashes = SettingsManager.getReducedFlashes();
    const breath = reducedFlashes ? 1 : 1 + 0.1 * st.k * Math.sin(scene.time.now / 380); // fúria pulsa devagar
    const spike = reducedFlashes ? 0 : st.spike;
    amb.a = (lerp(p1.a, p2.a, st.k) * breath + spike * 0.35) * st.master;
    amb.vig = (lerp(p1.vig, p2.vig, st.k) * breath + spike * 0.2) * st.master;
    for (let i = 0; i < 3; i += 1) {
      amb.color[i] = lerp(p1.color[i], p2.color[i], st.k);
      amb.edge[i] = lerp(p1.edge[i], p2.edge[i], st.k);
    }
  };

  const finalize = () => {
    if (done) return;
    done = true;
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    scene.tweens.killTweensOf(st);
    amb.a = 0;
    amb.vig = 0;
    if (scene._bossFightGrade === handle) scene._bossFightGrade = null;
    releasePipe(scene, pipe);
  };

  const end = (ms) => {
    if (ending || done) return;
    ending = true;
    scene.tweens.killTweensOf(st);
    if (ms <= 0) { finalize(); return; }
    scene.tweens.add({ targets: st, master: 0, duration: ms, ease: 'Sine.easeInOut', onComplete: finalize });
  };

  function onUpdate() {
    if (done) return;
    if (!ending && (!enemy.active || enemy._deathSequenceStarted)) {
      end(enemy.active ? FIGHT_DEATH_FADE_MS : FIGHT_FADE_OUT_MS);
    }
    if (!ending && !enraged && enemy.isEnraged) {
      enraged = true; // fase 2: vira ciano, mais forte, com um golpe de luz na virada
      scene.tweens.add({ targets: st, k: 1, duration: FIGHT_PHASE_SWAP_MS, ease: 'Sine.easeInOut' });
      st.spike = 1;
      scene.tweens.add({ targets: st, spike: 0, duration: 1000, ease: 'Quad.easeOut' });
    }
    apply();
  }
  function onShutdown() {
    done = true;
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    if (scene._bossFightGrade === handle) scene._bossFightGrade = null;
  }

  const handle = { stop: end };
  scene._bossFightGrade = handle;
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  scene.tweens.add({ targets: st, master: 1, duration: FIGHT_FADE_IN_MS, ease: 'Sine.easeInOut' });
  return handle;
}

// ---------------------------------------------------------------- 3) presença (SNCT)

const NOOP_PRESENCE = {
  breath() {},
  silence() {},
  roar() {},
  cut() {}
};

export function createPresenceFx(scene, epicenter) {
  const pipe = acquirePipe(scene);
  if (!pipe) return NOOP_PRESENCE;

  const cam = scene.cameras.main;
  const ex = epicenter?.x ?? cam.midPoint.x;
  const ey = epicenter?.y ?? cam.midPoint.y;
  const cine = makeCine(scene);
  let cut = false;

  pipe.fx.focusX = ex;
  pipe.fx.focusY = ey;
  pipe.fx.barSize = 0.07;
  pipe.fx.flashColor = [0.96, 0.9, 1];

  // a lente é a única coisa que "vê" a criatura
  const st = { pinch: 0, zoom: 0, aberr: 0, glitch: 0 };
  cine.update(() => {
    const f = pipe.fx;
    f.pinch = st.pinch;
    f.zoom = 1 + st.zoom;
    f.aberr = st.aberr;
    f.glitch = st.glitch;
  });
  cine.tween({ targets: pipe.fx, bars: 1, duration: 1200, ease: 'Cubic.easeOut' });
  cine.tween({ targets: pipe.fx, vignette: 0.5, gradeA: 0.3, duration: 6000, ease: 'Sine.easeIn' });

  return {
    // inspira (o mundo é puxado pra dentro), solta (empurra e racha de leve)
    breath(strength = 1, cycleS = 2.8) {
      if (cut) return;
      const ms = cycleS * 1000;
      cine.tween({ targets: st, pinch: 0.045 * strength, zoom: 0.012 * strength, duration: ms * 0.4, ease: 'Sine.easeInOut' });
      cine.later(ms * 0.5, () => {
        cine.tween({ targets: st, pinch: -0.03 * strength, zoom: 0, aberr: 0.5 * strength, duration: ms * 0.12, ease: 'Quad.easeOut' });
        cine.later(ms * 0.12, () => {
          cine.tween({ targets: st, pinch: 0, aberr: 0, duration: ms * 0.38, ease: 'Sine.easeInOut' });
        });
      });
    },

    // tudo que rangia pára: a lente assenta
    silence() {
      if (cut) return;
      scene.tweens.killTweensOf(st);
      cine.tween({ targets: st, pinch: 0, zoom: 0, aberr: 0, glitch: 0, duration: 250, ease: 'Sine.easeOut' });
    },

    // rugido: ondas em cascata, glitch em rajadas, pixelização rápida e push-in
    roar(roarS = 1.9) {
      if (cut) return;
      const ms = roarS * 1000;
      scene.tweens.killTweensOf(st);
      st.aberr = 1;
      cine.tween({ targets: st, zoom: 0.2, duration: ms, ease: 'Quad.easeIn' });
      pipe.fx.splitX = 0.012;
      cine.tween({ targets: pipe.fx, splitX: 0.004, duration: ms, ease: 'Quad.easeOut' });

      [0, 350].forEach((at) => cine.later(at, () => {
        pipe.fx.pixel = 0.9;
        cine.tween({ targets: pipe.fx, pixel: 0, duration: 120 });
      }));

      for (let i = 0; i < 6; i += 1) {
        addRing(cine, pipe, ex, ey, { delay: i * 160, to: 1.7, ms: 1000, a0: 1.2 - i * 0.1 });
      }

      const glitchLoop = cine.loop(70, () => {
        st.glitch = rand(0.3, 1);
      });
      cine.later(ms, () => glitchLoop.remove(false));
    },

    // corte seco: tira tudo da lente na hora
    cut() {
      if (cut) return;
      cut = true;
      cine.stop();
      hardReset(scene, pipe);
      pipe.pins = Math.max(0, pipe.pins - 1);
      scheduleReap(scene, pipe);
    }
  };
}

export default { startBossEntranceBuildup, playBossEntranceImpact, startBossFightGrade, createPresenceFx };
