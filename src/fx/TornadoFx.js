// Visual do Tornado (TornadoAbility): funil de pixel art (assets/fx/tornado.png,
// 4 frames 32x32) + camadas procedurais que dão volume e vida:
//   chão   -> brilho aditivo, espirais girando em sentidos opostos, marca da área de dano
//   funil  -> sprite principal + "fantasma" aditivo maior (profundidade) + núcleo luminoso
//   ar     -> riscos de vento, detritos/folhas e poeira orbitando em espiral subindo
// Partículas orbitam por código (sem tweens) e trocam de camada (atrás/na frente
// do funil) conforme a posição na órbita. Tudo é filho de um único container.
// O raio real do dano não muda.

const KEY = 'tornado_fx';
const FRAME = 32;
const FRAME_COUNT = 4;
const FRAME_RATE = 10;
const GROUND_COLOR = 0x5fb36a;

const TEX_GLOW = 'tfx_glow';
const TEX_SPIRAL = 'tfx_spiral';
const TEX_STREAK = 'tfx_streak';
const TEX_PIXEL = 'tfx_px';
const TEX_LEAF = 'tfx_leaf';
const TEX_RING = 'tfx_ring';

const STREAK_COLORS = [0xf4ffd6, 0xd8ff9c, 0xfff6a0];
const DEBRIS_COLORS = [0x3f8f4a, 0x6bc46d, 0xa8e07a, 0x8a6a3c, 0xe8e08a];
const DUST_COLORS = [0x7a8f5a, 0x9bb06a, 0x6b7a4a];

export function loadTornadoSheet(scene) {
  scene.load.spritesheet(KEY, 'assets/fx/tornado.png', { frameWidth: FRAME, frameHeight: FRAME });
}

// chamado no create() da PreloadScene: pixel art nítida + animação em loop
export function createTornadoAnimation(scene) {
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

export function hasTornadoFx(scene) {
  return scene.textures.exists(KEY);
}

// Texturas auxiliares desenhadas uma única vez (canvas).
function buildTextures(scene) {
  const tm = scene.textures;

  if (!tm.exists(TEX_GLOW)) {
    const size = 64;
    const tex = tm.createCanvas(TEX_GLOW, size, size);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  // 3 braços de espiral que afinam e somem: girando vira "redemoinho no chão"
  if (!tm.exists(TEX_SPIRAL)) {
    const size = 128;
    const tex = tm.createCanvas(TEX_SPIRAL, size, size);
    const ctx = tex.getContext();
    const c = size / 2;
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      const base = (arm / 3) * Math.PI * 2;
      const steps = 46;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a0 = base + t * 4.2;
        const a1 = base + (t + 1 / steps) * 4.2;
        const r0 = 8 + t * (c - 12);
        const r1 = 8 + (t + 1 / steps) * (c - 12);
        ctx.strokeStyle = `rgba(255,255,255,${(1 - t) * 0.0 + Math.sin(t * Math.PI) * 0.9})`;
        ctx.lineWidth = 1 + Math.sin(t * Math.PI) * 3.2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0);
        ctx.lineTo(c + Math.cos(a1) * r1, c + Math.sin(a1) * r1);
        ctx.stroke();
      }
    }
    tex.refresh();
  }

  // risco de vento: afina nas duas pontas
  if (!tm.exists(TEX_STREAK)) {
    const w = 24;
    const h = 3;
    const tex = tm.createCanvas(TEX_STREAK, w, h);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 1, w, 1);
    ctx.globalAlpha = 0.45;
    ctx.fillRect(4, 0, w - 10, 3);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  if (!tm.exists(TEX_PIXEL)) {
    const tex = tm.createCanvas(TEX_PIXEL, 3, 3);
    const ctx = tex.getContext();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 3, 3);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // folha pixelada (losango alongado)
  if (!tm.exists(TEX_LEAF)) {
    const tex = tm.createCanvas(TEX_LEAF, 7, 4);
    const ctx = tex.getContext();
    ctx.fillStyle = '#fff';
    ctx.fillRect(2, 0, 3, 1);
    ctx.fillRect(1, 1, 5, 2);
    ctx.fillRect(0, 2, 7, 1);
    ctx.fillRect(2, 3, 3, 1);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 1, 1, 1);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // anel fino (onda de choque ao nascer / ao acertar)
  if (!tm.exists(TEX_RING)) {
    const size = 128;
    const tex = tm.createCanvas(TEX_RING, size, size);
    const ctx = tex.getContext();
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, c * 0.62, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
}

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Container — a ordem de `list` NÃO é garantida; use os dados (`getData`)
// pra achar as peças. Guardados: shadow, sprite, ghost, ground, back, front.
export function createTornadoFx(scene, x, y, radius, { remote = false } = {}) {
  const unit = radius / 40; // tudo é desenhado pensando em radius 40
  const baseScale = (radius * 2 * 0.95) / FRAME;
  const baseY = radius * 0.32; // ponta de baixo do funil

  // ---- chão -------------------------------------------------------------
  const shadow = scene.add.ellipse(0, 0, radius * 2, radius * 0.95, GROUND_COLOR, 0.16);
  shadow.setStrokeStyle(1, GROUND_COLOR, 0.4);

  const ground = scene.add.container(0, baseY * 0.55);
  ground.setScale(1, 0.46); // achata o plano: vira "chão" em perspectiva
  const glow = scene.add.image(0, 0, TEX_GLOW)
    .setTint(0xa6f58a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55)
    .setDisplaySize(radius * 3.1, radius * 3.1);
  const spiralA = scene.add.image(0, 0, TEX_SPIRAL)
    .setTint(0xd8ffae).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5)
    .setDisplaySize(radius * 2.5, radius * 2.5);
  const spiralB = scene.add.image(0, 0, TEX_SPIRAL)
    .setTint(0x7ee07a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35)
    .setDisplaySize(radius * 1.6, radius * 1.6);
  ground.add([glow, spiralA, spiralB]);

  // ---- funil ------------------------------------------------------------
  const back = scene.add.container(0, 0); // partículas atrás do funil

  const ghost = scene.add
    .sprite(0, baseY, KEY, 0)
    .setOrigin(0.5, 0.9)
    .setFlipX(true)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xcfff8f)
    .setAlpha(0.2);
  ghost.play({ key: KEY, startFrame: (Phaser.Math.Between(0, FRAME_COUNT - 1) + 2) % FRAME_COUNT });

  const sprite = scene.add.sprite(0, baseY, KEY, 0).setOrigin(0.5, 0.9);
  // cada tornado começa num frame diferente: vários juntos não ficam sincronizados
  sprite.play({ key: KEY, startFrame: Phaser.Math.Between(0, FRAME_COUNT - 1) });

  const core = scene.add.image(0, baseY - radius * 0.7, TEX_GLOW)
    .setTint(0xfff3a0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.11)
    .setDisplaySize(radius * 1.1, radius * 1.7);

  const front = scene.add.container(0, 0); // partículas na frente do funil

  // ---- partículas ------------------------------------------------------
  const particles = [];
  const addParticle = (kind, tex, tint, additive) => {
    const img = scene.add.image(0, 0, tex).setTint(tint);
    if (additive) img.setBlendMode(Phaser.BlendModes.ADD);
    back.add(img);
    particles.push(makeParticle(kind, img, unit));
  };
  for (let i = 0; i < (remote ? 4 : 11); i++) addParticle('streak', TEX_STREAK, pick(STREAK_COLORS), true);
  for (let i = 0; i < (remote ? 3 : 9); i++) addParticle('debris', Math.random() < 0.45 ? TEX_LEAF : TEX_PIXEL, pick(DEBRIS_COLORS), false);
  for (let i = 0; i < (remote ? 2 : 4); i++) addParticle('dust', TEX_GLOW, pick(DUST_COLORS), false);
  particles.forEach((p, i) => { p.t = i / particles.length; }); // espalhadas desde o 1º frame

  const container = scene.add
    .container(x, y, [shadow, ground, back, ghost, sprite, core, front])
    .setDepth(8);

  container.setData({
    shadow, sprite, ghost, ground, glow, spiralA, spiralB, core, back, front, particles,
    baseScale, baseY, radius, unit,
    phase: rand(0, Math.PI * 2),
    glowBase: 0.55
  });

  // ---- entrada: o funil "puxa" pra cima com um leve estouro --------------
  if (remote) {
    sprite.setScale(baseScale);
    ghost.setScale(baseScale * 1.16, baseScale * 1.1);
  } else {
    sprite.setScale(baseScale * 0.2);
    ghost.setScale(baseScale * 0.2);
    scene.tweens.add({ targets: [sprite], scaleX: baseScale, scaleY: baseScale, duration: 240, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: [ghost], scaleX: baseScale * 1.16, scaleY: baseScale * 1.1, duration: 300, ease: 'Back.easeOut' });
    ground.setScale(0.3, 0.14);
    scene.tweens.add({ targets: ground, scaleX: 1, scaleY: 0.46, duration: 320, ease: 'Cubic.easeOut' });
    shadow.setScale(0.3);
    scene.tweens.add({ targets: shadow, scale: 1, duration: 260, ease: 'Cubic.easeOut' });
    spawnShockRing(scene, x, y + baseY * 0.55, radius * 2.6, 0xc8ffa0, 0.7, 380);
    spawnDustBurst(scene, x, y + baseY * 0.5, unit, 8, 0.55);
  }

  return container;
}

function makeParticle(kind, img, unit) {
  const p = { kind, img, layer: 'back', t: 0 };
  resetParticle(p, unit, true);
  return p;
}

// (re)sorteia a órbita de uma partícula
function resetParticle(p, unit, first = false) {
  p.t = first ? Math.random() : 0;
  p.angle = rand(0, Math.PI * 2);
  p.dir = Math.random() < 0.9 ? 1 : -1; // quase todas giram no mesmo sentido
  if (p.kind === 'streak') {
    p.rise = rand(0.35, 0.6);
    p.spin = rand(7.5, 10.5);
    p.rScale = rand(0.95, 1.12);
    p.len = rand(1.0, 1.9) * unit;
    p.maxAlpha = rand(0.7, 1);
  } else if (p.kind === 'debris') {
    p.rise = rand(0.22, 0.45);
    p.spin = rand(5.5, 8.5);
    p.rScale = rand(1.1, 1.55); // fora do funil: sendo arremessado
    p.size = rand(0.9, 1.7) * unit;
    p.rot = rand(0, Math.PI * 2);
    p.rotSpeed = rand(-9, 9);
    p.maxAlpha = 1;
  } else {
    p.rise = rand(0.1, 0.2);
    p.spin = rand(3.5, 5.5);
    p.rScale = rand(0.8, 1.2);
    p.size = rand(0.45, 0.8) * unit;
    p.maxAlpha = rand(0.22, 0.38);
  }
}

// Chamado todo frame pela TornadoAbility. `time` em ms, `dt` em ms.
export function updateTornadoFx(fx, time, dt) {
  if (!fx?.scene || !fx.active) return;
  const d = fx.getData('particles');
  if (!d) return;
  const sec = Math.min(dt, 50) / 1000;
  const radius = fx.getData('radius');
  const unit = fx.getData('unit');
  const baseY = fx.getData('baseY');
  const phase = fx.getData('phase');
  const sprite = fx.getData('sprite');
  const ghost = fx.getData('ghost');
  const back = fx.getData('back');
  const front = fx.getData('front');
  const core = fx.getData('core');

  // balanço do funil: ancorado na base, o topo é que oscila (+ leve inclinação)
  const sway = Math.sin(time * 0.0075 + phase);
  const sway2 = Math.sin(time * 0.0051 + phase * 1.7);
  sprite.x = sway * 2.4 * unit;
  sprite.angle = sway * 2.2 + sway2 * 1.2;
  ghost.x = Math.sin(time * 0.0075 + phase - 0.6) * 3.2 * unit;
  ghost.angle = -sway * 2.8;

  // chão: espirais em sentidos opostos
  fx.getData('spiralA').angle += 210 * sec;
  fx.getData('spiralB').angle -= 340 * sec;

  // núcleo pulsando
  core.setAlpha(0.1 + 0.05 * Math.sin(time * 0.012 + phase));

  // brilho do chão volta ao normal depois do flash de acerto
  const glow = fx.getData('glow');
  const gBase = fx.getData('glowBase');
  if (glow.alpha > gBase) glow.setAlpha(Math.max(gBase, glow.alpha - 2.6 * sec));

  for (let i = 0; i < d.length; i++) {
    const p = d[i];
    p.t += p.rise * sec;
    if (p.t >= 1) resetParticle(p, unit);
    p.angle += p.dir * p.spin * (1.25 - p.t * 0.55) * sec;

    const t = p.t;
    const env = Math.sin(Math.PI * Math.min(1, t)); // entra e sai suave
    // perfil do funil: fino embaixo, largo em cima
    const profile = p.kind === 'dust' ? 1.15 : 0.22 + 0.82 * Math.pow(t, 0.8);
    const r = radius * profile * p.rScale;
    const heightSpan = radius * 1.65;
    const cx = Math.cos(p.angle) * r;
    const sn = Math.sin(p.angle);
    const lift = p.kind === 'dust' ? t * radius * 0.35 : t * heightSpan;
    const px = cx + sprite.x * (0.3 + t * 0.7);
    const py = baseY - lift + sn * r * 0.3 + (p.kind === 'dust' ? radius * 0.1 : 0);

    const img = p.img;
    img.setPosition(px, py);

    // atrás/na frente do funil (sn>0 = lado da câmera)
    const wantFront = sn > 0;
    if (wantFront !== (p.layer === 'front')) {
      p.layer = wantFront ? 'front' : 'back';
      (wantFront ? front : back).add(img);
    }
    const depthShade = wantFront ? 1 : 0.55; // atrás fica mais apagado

    if (p.kind === 'streak') {
      // tangente da órbita projetada
      const vx = -Math.sin(p.angle) * p.dir;
      const vy = Math.cos(p.angle) * 0.3 * p.dir;
      img.setRotation(Math.atan2(vy, vx));
      img.setScale(p.len * (0.7 + t * 0.6), unit * 1.1);
      img.setAlpha(p.maxAlpha * env * depthShade);
    } else if (p.kind === 'debris') {
      p.rot += p.rotSpeed * sec;
      img.setRotation(p.rot);
      img.setScale(p.size);
      img.setAlpha(p.maxAlpha * Math.min(1, env * 2.2) * depthShade);
    } else {
      const s = p.size * (1 + t * 1.6);
      img.setScale(s * 0.6, s * 0.38);
      img.setAlpha(p.maxAlpha * env);
    }
  }
}

// "aperto" quando o tornado acerta alguém + flash no chão e anel de impacto
export function pulseTornadoFx(fx) {
  const scene = fx.scene;
  if (!scene) return;
  const sprite = fx.getData('sprite');
  const ghost = fx.getData('ghost');
  const shadow = fx.getData('shadow');
  const glow = fx.getData('glow');
  const radius = fx.getData('radius');
  const baseY = fx.getData('baseY');

  if (sprite?.active) {
    const base = fx.getData('baseScale') ?? 1;
    sprite.setScale(base, base);
    scene.tweens.add({
      targets: sprite,
      scaleX: base * 1.18,
      scaleY: base * 0.9,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.active && sprite.setScale(base, base)
    });
    if (ghost?.active) {
      ghost.setScale(base * 1.16, base * 1.1);
      scene.tweens.add({
        targets: ghost,
        scaleX: base * 1.34,
        scaleY: base * 1.0,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => ghost.active && ghost.setScale(base * 1.16, base * 1.1)
      });
    }
  }
  if (shadow?.active) {
    shadow.setScale(1, 1);
    scene.tweens.add({
      targets: shadow,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => shadow.active && shadow.setScale(1, 1)
    });
  }
  if (glow?.active) glow.setAlpha(1);
  spawnShockRing(scene, fx.x, fx.y + baseY * 0.55, radius * 2.1, 0xe4ffb8, 0.5, 260);
}

// Fim de vida: pequena nuvem de poeira onde o tornado estava.
export function playTornadoEndFx(fx) {
  const scene = fx?.scene;
  if (!scene || fx.getData('baseY') === undefined) return; // fallback sem folha
  spawnDustBurst(scene, fx.x, fx.y + fx.getData('baseY') * 0.5, fx.getData('unit') ?? 1, 6, 0.4);
}

// ---- efeitos soltos (vivem na cena, se destroem sozinhos) ---------------

function spawnShockRing(scene, x, y, size, color, alpha, duration) {
  if (!scene.textures.exists(TEX_RING)) return;
  const ring = scene.add.image(x, y, TEX_RING)
    .setTint(color).setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(alpha).setDepth(7)
    .setDisplaySize(size * 0.25, size * 0.25 * 0.46);
  const s0 = ring.scaleX;
  const sy0 = ring.scaleY;
  scene.tweens.add({
    targets: ring,
    scaleX: s0 * 4,
    scaleY: sy0 * 4,
    alpha: 0,
    duration,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });
}

function spawnDustBurst(scene, x, y, unit, count, alpha) {
  if (!scene.textures.exists(TEX_GLOW)) return;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const dist = rand(18, 40) * unit;
    const puff = scene.add.image(x, y, TEX_GLOW)
      .setTint(pick(DUST_COLORS)).setDepth(7)
      .setAlpha(alpha)
      .setScale(rand(0.15, 0.25) * unit, rand(0.1, 0.16) * unit);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist * 0.45 - rand(2, 8),
      scaleX: puff.scaleX * 2.2,
      scaleY: puff.scaleY * 2.2,
      alpha: 0,
      duration: rand(350, 550),
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy()
    });
  }
}
