// FX da granada do Cyberus (1ª cabeça): explosão de plasma azul ciano +
// poça de chamas azuis que continua queimando depois da explosão.
// Tudo aqui é só visual — o dano (explosão e área) fica em AllyDogAbility.
//
// Peças:
//  - granada em voo: orbe de plasma (frame 0 do sprite) girando, com rastro
//  - explosão: clarão branco → sprite animado (4 frames) → anéis de choque
//    → faíscas/estilhaços de plasma → tremida curta de câmera
//  - poça: mancha escura queimada + brilho no chão + anéis de HUD girando
//    (identidade cyberpunk) + chamas de pixel art subindo o tempo todo

const KEY = 'plasma_explosion';
const FLAME_KEY = 'plasma_flame';
const FRAME = 32;
const FRAME_COUNT = 4;

const CYAN = 0x33bbff;
const ICE = 0x9ff4ff;
const DEEP = 0x1e6bff;
const FLAME_TINTS = [0xffffff, ICE, ICE, CYAN, CYAN, DEEP];

// quanto o sprite da explosão é maior que o raio de dano (0.5 = diâmetro
// do sprite ≈ raio*1.7 — pixel art grande demais destoa do gato de 28px)
const BLAST_SPRITE_DIAMETER_PER_RADIUS = 1.7;
const FLAME_SPAWN_INTERVAL_MS = 65;

// ---------- carregamento (PreloadScene) ----------

export function loadPlasmaExplosionSheet(scene) {
  scene.load.spritesheet(KEY, 'assets/fx/plasma_explosion.png', {
    frameWidth: FRAME,
    frameHeight: FRAME
  });
}

// chamado no create() da PreloadScene
export function createPlasmaGrenadeTextures(scene) {
  if (scene.textures.exists(KEY)) scene.textures.get(KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
  if (scene.textures.exists(FLAME_KEY)) return;

  // chama de pixel art desenhada no código (10x16): borda azul, meio ciano,
  // miolo gelo, ponta branca quente embaixo
  const W = 10;
  const H = 16;
  const tex = scene.textures.createCanvas(FLAME_KEY, W, H);
  const ctx = tex.getContext();
  const profile = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 4, 4, 3, 2]; // meia-largura por linha
  const palette = ['#1e6bff', '#33bbff', '#9ff4ff', '#ffffff'];
  for (let y = 0; y < H; y++) {
    const half = profile[y];
    for (let dx = -half; dx < half; dx++) {
      const rel = (Math.abs(dx + 0.5) + 0.5) / Math.max(half, 1); // 0 centro … 1 borda
      let level = rel > 0.8 ? 0 : rel > 0.5 ? 1 : rel > 0.25 ? 2 : 3;
      if (y < 6 && level > 1) level = 1; // ponta de cima só azul/ciano
      if (y < 3) level = 0;
      ctx.fillStyle = palette[level];
      ctx.fillRect(W / 2 + dx, y, 1, 1);
    }
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function hasPlasmaGrenadeFx(scene) {
  return scene.textures.exists(KEY) && scene.textures.exists(FLAME_KEY);
}

// ---------- granada em voo ----------

export function createPlasmaGrenadeProjectile(scene, x, y) {
  const orb = scene.add
    .sprite(x, y, KEY, 0)
    .setDepth(12)
    .setScale(0.7);
  const glow = scene.add
    .sprite(x, y, KEY, 1)
    .setDepth(11)
    .setScale(1.15)
    .setAlpha(0.55)
    .setTint(ICE)
    .setBlendMode(Phaser.BlendModes.ADD);

  // o objeto devolvido se comporta como 1 imagem (x/y/destroy) pro
  // AllyDogAbility, mas move/destrói as duas camadas juntas
  const proxy = {
    orb,
    glow,
    _x: x,
    _y: y,
    get x() { return this._x; },
    set x(v) { this._x = v; orb.x = v; glow.x = v; },
    get y() { return this._y; },
    set y(v) { this._y = v; orb.y = v; glow.y = v; },
    lastTrailMs: 0,
    destroy() {
      scene.tweens.killTweensOf([orb, glow]);
      orb.destroy();
      glow.destroy();
    }
  };

  scene.tweens.add({ targets: orb, angle: 360, duration: 420, repeat: -1 });
  scene.tweens.add({
    targets: glow,
    scale: { from: 1.0, to: 1.35 },
    alpha: { from: 0.35, to: 0.7 },
    duration: 140,
    yoyo: true,
    repeat: -1
  });
  return proxy;
}

// rastro de plasma deixado pela granada (chamado a cada frame, se limita sozinho)
export function trailPlasmaGrenade(scene, proxy, time) {
  if (time - proxy.lastTrailMs < 28) return;
  proxy.lastTrailMs = time;
  const puff = scene.add
    .sprite(proxy.x + Phaser.Math.Between(-2, 2), proxy.y + Phaser.Math.Between(-2, 2), KEY, 1)
    .setDepth(11)
    .setScale(Phaser.Math.FloatBetween(0.35, 0.55))
    .setTint(Phaser.Utils.Array.GetRandom([ICE, CYAN, DEEP]))
    .setAlpha(0.7)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: puff,
    scale: 0.08,
    alpha: 0,
    duration: 260,
    ease: 'Quad.easeIn',
    onComplete: () => puff.destroy()
  });
}

// ---------- explosão ----------

export function playPlasmaExplosion(scene, x, y, radius) {
  const flare = (scale, alpha, ms, tint) => {
    const img = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(19)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setScale(scale)
      .setAlpha(alpha);
    scene.tweens.add({
      targets: img,
      scale: scale * 1.6,
      alpha: 0,
      duration: ms,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy()
    });
  };

  // 1) clarão: branco seco por cima, azul largo por baixo
  flare((radius * 2.2) / 20, 0.95, 120, 0xffffff);
  flare((radius * 3.4) / 20, 0.6, 220, CYAN);

  // 2) corpo da explosão: sprite animado + cópia aditiva maior (brilho)
  const baseScale = (radius * BLAST_SPRITE_DIAMETER_PER_RADIUS) / FRAME;
  const body = scene.add.sprite(x, y, KEY, 0).setDepth(18).setScale(baseScale * 0.55);
  const halo = scene.add
    .sprite(x, y, KEY, 0)
    .setDepth(17)
    .setScale(baseScale * 0.8)
    .setAlpha(0.7)
    .setTint(ICE)
    .setBlendMode(Phaser.BlendModes.ADD);
  body.setAngle(Phaser.Math.Between(0, 3) * 90); // varia a cada granada
  halo.setAngle(body.angle);

  const frameMs = [55, 70, 110, 130];
  const growTo = [0.8, 1.15, 1.35, 1.5];
  let t = 0;
  frameMs.forEach((ms, i) => {
    scene.time.delayedCall(t, () => {
      if (!body.active) return;
      body.setFrame(i);
      halo.setFrame(i);
      scene.tweens.add({
        targets: [body, halo],
        scale: (target) => baseScale * growTo[i] * (target === halo ? 1.3 : 1),
        duration: ms,
        ease: 'Quad.easeOut'
      });
    });
    t += ms;
  });
  scene.time.delayedCall(t, () => {
    scene.tweens.add({
      targets: [body, halo],
      alpha: 0,
      duration: 120,
      onComplete: () => {
        body.destroy();
        halo.destroy();
      }
    });
  });

  // 3) anéis de choque (2, o segundo atrasado e mais fino)
  [0, 70].forEach((delay, i) => {
    const g = scene.add.graphics().setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
    const state = { r: radius * 0.15, a: 1 };
    scene.tweens.add({
      targets: state,
      r: radius * (i === 0 ? 1.15 : 0.95),
      a: 0,
      delay,
      duration: 320,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(i === 0 ? 4 : 2, i === 0 ? ICE : CYAN, state.a);
        g.strokeCircle(x, y, state.r);
      },
      onComplete: () => g.destroy()
    });
  });

  // 4) estilhaços de plasma saindo em todas as direções
  const shards = 18;
  for (let i = 0; i < shards; i++) {
    const a = (i / shards) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
    const dist = radius * Phaser.Math.FloatBetween(0.7, 1.5);
    const shard = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(19)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom(FLAME_TINTS))
      .setRotation(a)
      .setScale(Phaser.Math.FloatBetween(0.25, 0.6), Phaser.Math.FloatBetween(0.12, 0.2));
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      scaleX: 0.05,
      alpha: 0,
      duration: Phaser.Math.Between(220, 420),
      ease: 'Cubic.easeOut',
      onComplete: () => shard.destroy()
    });
  }

  // 5) chamas "cuspidas" pra fora que já plantam o fogo da poça
  for (let i = 0; i < 8; i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const d = radius * Phaser.Math.FloatBetween(0.2, 0.9);
    spawnFlame(scene, null, x + Math.cos(a) * d, y + Math.sin(a) * d, 1.2, 80 + i * 20);
  }

  scene.cameras.main.shake(110, 0.0028);
}

// ---------- poça de chamas ----------

// Devolve um Container (compatível com o fx antigo: setAlpha pra fade-out,
// list pra matar tweens, destroy). `container.stopFx()` para o emissor.
export function createPlasmaFlameZone(scene, x, y, radius) {
  const container = scene.add.container(x, y).setDepth(8);

  // mancha queimada (escura, blend normal) + brilho azul no chão
  const scorch = scene.add.ellipse(0, 2, radius * 2.1, radius * 1.7, 0x040a1c, 0.5);
  const glow = scene.add.graphics();
  for (let i = 0; i < 7; i++) {
    glow.fillStyle(CYAN, 0.05 + i * 0.006);
    glow.fillEllipse(0, 0, radius * 2 * (1 - i * 0.11), radius * 1.65 * (1 - i * 0.11));
  }
  glow.setBlendMode(Phaser.BlendModes.ADD);

  // anéis de HUD tracejados girando em sentidos opostos (identidade NINE LIVES)
  const ringOuter = makeDashedRing(scene, radius, 10, 2, ICE, 0.75);
  const ringInner = makeDashedRing(scene, radius * 0.62, 6, 1.5, CYAN, 0.55);
  ringOuter.setBlendMode(Phaser.BlendModes.ADD);
  ringInner.setBlendMode(Phaser.BlendModes.ADD);
  container.add([scorch, glow, ringOuter, ringInner]);

  scene.tweens.add({ targets: ringOuter, angle: 360, duration: 6500, repeat: -1 });
  scene.tweens.add({ targets: ringInner, angle: -360, duration: 4200, repeat: -1 });
  scene.tweens.add({
    targets: glow,
    alpha: { from: 0.75, to: 1 },
    duration: 330,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  // ignição: rajada de chamas logo de cara, depois emissor contínuo
  for (let i = 0; i < 16; i++) {
    const p = randomPointInDisc(radius * 0.9);
    spawnFlame(scene, container, p.x, p.y, Phaser.Math.FloatBetween(1, 1.5), i * 25);
  }

  container.emitter = scene.time.addEvent({
    delay: FLAME_SPAWN_INTERVAL_MS,
    loop: true,
    callback: () => {
      if (!container.active) return;
      // some junto com o fade-out da poça
      if (Math.random() > container.alpha) return;
      const n = Phaser.Math.Between(1, 2);
      for (let i = 0; i < n; i++) {
        // sorteio puxado pra borda (sqrt invertido) pro círculo ser legível
        const edge = Math.random() < 0.4;
        const p = edge ? randomPointOnRing(radius * 0.92) : randomPointInDisc(radius * 0.85);
        spawnFlame(scene, container, p.x, p.y, Phaser.Math.FloatBetween(0.7, 1.4), 0);
      }
      if (Math.random() < 0.35) spawnEmber(scene, container, radius);
    }
  });

  return container;
}

export function destroyPlasmaFlameZone(container) {
  if (!container) return;
  container.emitter?.remove(false);
  container.scene?.tweens.killTweensOf([container, ...container.list]);
  container.destroy();
}

// ---------- internos ----------

function makeDashedRing(scene, r, dashes, width, color, alpha) {
  const g = scene.add.graphics();
  g.lineStyle(width, color, alpha);
  const step = (Math.PI * 2) / dashes;
  for (let i = 0; i < dashes; i++) {
    g.beginPath();
    g.arc(0, 0, r, i * step, i * step + step * 0.55, false);
    g.strokePath();
  }
  return g;
}

function randomPointInDisc(r) {
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * r;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.82 }; // um pouco achatado: chão em perspectiva
}

function randomPointOnRing(r) {
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.82 };
}

// uma língua de fogo azul: nasce pequena no chão, estica pra cima tremendo e some.
// `parent` = container da poça (coords locais); null = coords de mundo.
function spawnFlame(scene, parent, px, py, size, delay) {
  const make = () => {
    if (parent && !parent.active) return;
    const flame = scene.add
      .image(px, py, FLAME_KEY)
      .setOrigin(0.5, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom(FLAME_TINTS))
      .setScale(size * 0.7, size * 0.4)
      .setAlpha(0.95);
    if (parent) parent.add(flame);
    else flame.setDepth(16);

    const rise = Phaser.Math.Between(10, 24) * size;
    scene.tweens.add({
      targets: flame,
      y: py - rise,
      x: px + Phaser.Math.Between(-4, 4),
      scaleX: size * Phaser.Math.FloatBetween(0.9, 1.25),
      scaleY: size * Phaser.Math.FloatBetween(1.2, 1.9),
      alpha: 0,
      duration: Phaser.Math.Between(380, 640),
      ease: 'Sine.easeOut',
      onComplete: () => flame.destroy()
    });
  };
  if (delay > 0) scene.time.delayedCall(delay, make);
  else make();
}

// fagulha de plasma subindo devagar (dá "vida" ao fogo)
function spawnEmber(scene, parent, radius) {
  const p = randomPointInDisc(radius * 0.8);
  const ember = scene.add
    .image(p.x, p.y, 'hit_fx')
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(Phaser.Utils.Array.GetRandom([0xffffff, ICE, CYAN]))
    .setScale(Phaser.Math.FloatBetween(0.1, 0.2))
    .setAlpha(0.9);
  parent.add(ember);
  scene.tweens.add({
    targets: ember,
    x: p.x + Phaser.Math.Between(-12, 12),
    y: p.y - Phaser.Math.Between(26, 52),
    alpha: 0,
    duration: Phaser.Math.Between(600, 950),
    ease: 'Sine.easeOut',
    onComplete: () => ember.destroy()
  });
}
