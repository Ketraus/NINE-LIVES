// FX do ataque de mísseis do Elite: míssil de verdade em voo (corpo, chama,
// rastro de fumaça, sombra no chão) + explosão enorme quando bate no chão.
// Tudo aqui é só visual — dano, sons e tremida de câmera ficam no Elite.js.
//
// Peças da explosão (ver playEliteMissileExplosion):
//  - clarão branco/laranja + sprite animado (11 frames 64x64, Explosion.png)
//  - cópia aditiva maior (brilho de fogo) e anéis de choque no chão
//  - marca do raio de dano (anel vermelho curto — leitura de gameplay)
//  - faíscas, estilhaços com gravidade, fumaça subindo e brasas
//  - chão queimado (mancha escura + brasa esfriando) que some devagar

const KEY = 'elite_explosion';
const ANIM = 'elite_explosion-boom';
const FRAME = 64;
const FRAME_COUNT = 11;
const MISSILE_KEY = 'elite_missile';
const SMOKE_KEY = 'elite_smoke';
const DEBRIS_KEY = 'elite_debris';
const SCORCH_KEY = 'elite_scorch';

const WHITE = 0xffffff;
const YELLOW = 0xffe27a;
const ORANGE = 0xff8a1f;
const RED = 0xff3b1f;
const PURPLE = 0xb44cff;
const PURPLE_LIGHT = 0xe2b8ff;
const FIRE_TINTS = [WHITE, YELLOW, YELLOW, ORANGE, ORANGE, RED];

// ms de cada frame (o frame 0 é só a estrela amarela de ignição)
const FRAME_MS = [45, 40, 45, 55, 60, 65, 65, 70, 75, 85, 100];
// diâmetro do sprite em relação ao raio de dano (a explosão "passa" um pouco da área)
const SPRITE_DIAMETER_PER_RADIUS = 2.1;

const DEPTH_SCORCH = 2;
const DEPTH_SHADOW = 5;
const DEPTH_SMOKE = 14;
const DEPTH_MISSILE = 15;
const DEPTH_BOOM = 18;
const DEPTH_SPARK = 19;

// ---------- carregamento (PreloadScene) ----------

export function loadEliteMissileSheet(scene) {
  scene.load.spritesheet(KEY, 'assets/fx/elite_explosion.png', {
    frameWidth: FRAME,
    frameHeight: FRAME
  });
}

// chamado no create() da PreloadScene
export function createEliteMissileTextures(scene) {
  if (scene.textures.exists(KEY)) scene.textures.get(KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);

  if (scene.textures.exists(KEY) && !scene.anims.exists(ANIM)) {
    scene.anims.create({
      key: ANIM,
      frames: FRAME_MS.map((duration, frame) => ({ key: KEY, frame, duration })),
      repeat: 0
    });
  }

  // míssil em pixel art 20x8 apontando pra +x (direita): corpo cinza,
  // ponta vermelha, aletas vinho, faixa amarela de aviso
  if (!scene.textures.exists(MISSILE_KEY)) {
    const tex = scene.textures.createCanvas(MISSILE_KEY, 20, 8);
    const ctx = tex.getContext();
    const px = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    px(5, 2, 11, 4, '#8f98a8'); // corpo
    px(5, 2, 11, 1, '#d9dfeb'); // luz em cima
    px(5, 5, 11, 1, '#566074'); // sombra embaixo
    px(10, 2, 2, 4, '#ffcc33'); // faixa
    px(16, 2, 1, 4, '#b44cff'); // ponta
    px(17, 3, 1, 2, '#b44cff');
    px(18, 3, 1, 2, '#7a1fd1');
    px(4, 3, 1, 2, '#2a2f3a'); // bocal
    px(4, 0, 4, 2, '#5b1fa8'); // aletas
    px(4, 6, 4, 2, '#5b1fa8');
    px(5, 0, 3, 1, '#9b4dff');
    px(5, 7, 3, 1, '#9b4dff');
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // fumaça: bolinha macia
  if (!scene.textures.exists(SMOKE_KEY)) {
    const tex = scene.textures.createCanvas(SMOKE_KEY, 32, 32);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    tex.refresh();
  }

  // estilhaço: quadradinho de 4px (pixel art)
  if (!scene.textures.exists(DEBRIS_KEY)) {
    const tex = scene.textures.createCanvas(DEBRIS_KEY, 4, 4);
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // mancha de chão queimado: blob irregular com borda esfarelada
  if (!scene.textures.exists(SCORCH_KEY)) {
    const S = 128;
    const tex = scene.textures.createCanvas(SCORCH_KEY, S, S);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(8,6,6,0.95)');
    grad.addColorStop(0.6, 'rgba(14,10,10,0.7)');
    grad.addColorStop(1, 'rgba(14,10,10,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // respingos escuros ao redor (borda irregular)
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = S * (0.22 + Math.random() * 0.24);
      const r = 2 + Math.random() * 6;
      ctx.fillStyle = `rgba(10,8,8,${0.25 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.refresh();
  }
}

export function hasEliteMissileFx(scene) {
  return scene.textures.exists(KEY) && scene.textures.exists(MISSILE_KEY);
}

// ---------- míssil em voo ----------

// Devolve um objeto que se comporta como 1 imagem pro Elite.js
// (x/y/setPosition/destroy), mas move corpo, chama, sombra e rastro juntos.
// A rotação acompanha a trajetória (pega a direção do último movimento).
export function createEliteMissileProjectile(scene, x, y, groundTarget = null) {
  const body = scene.add.image(x, y, MISSILE_KEY).setDepth(DEPTH_MISSILE).setScale(1.5);
  const flame = scene.add
    .image(x, y, 'hit_fx')
    .setDepth(DEPTH_MISSILE - 1)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(PURPLE)
    .setOrigin(1, 0.5);
  // sombra no chão: anda em linha reta origem→alvo (o míssil é que voa em arco)
  const shadow = scene.add.ellipse(x, y, 16, 7, 0x000000, 0.3).setDepth(DEPTH_SHADOW);
  const startX = x;
  const startY = y;
  const flatLen = groundTarget ? Phaser.Math.Distance.Between(x, y, groundTarget.x, groundTarget.y) || 1 : 1;

  const proxy = {
    _x: x,
    _y: y,
    _lastTrailMs: 0,
    get x() { return this._x; },
    set x(v) { this._move(v, this._y, false); },
    get y() { return this._y; },
    set y(v) { this._move(this._x, v, false); },
    setPosition(nx, ny) { this._move(nx, ny); return this; },
    // rotate=false nos setters x/y: mover um eixo por vez dava ângulo só vertical;
    // a rotação só é recalculada em setPosition (x e y juntos)
    _move(nx, ny, rotate = true) {
      const dx = nx - this._x;
      const dy = ny - this._y;
      this._x = nx;
      this._y = ny;
      if (!body.active) return;
      if (rotate && Math.abs(dx) + Math.abs(dy) > 0.05) body.setRotation(Math.atan2(dy, dx));
      body.setPosition(nx, ny);

      // chama atrás do míssil, tremendo
      const back = body.rotation + Math.PI;
      flame
        .setPosition(nx + Math.cos(back) * 5, ny + Math.sin(back) * 5)
        .setRotation(body.rotation)
        .setScale(Phaser.Math.FloatBetween(1.5, 2.3), Phaser.Math.FloatBetween(0.5, 0.8));

      // sombra: progresso pela distância reta já andada; mais nítida perto do impacto
      if (groundTarget) {
        const t = Phaser.Math.Clamp(Phaser.Math.Distance.Between(startX, startY, nx, ny) / flatLen, 0, 1);
        shadow
          .setPosition(Phaser.Math.Linear(startX, groundTarget.x, t), Phaser.Math.Linear(startY, groundTarget.y, t))
          .setAlpha(0.15 + t * 0.35)
          .setScale(0.6 + t * 0.6);
      } else {
        shadow.setPosition(nx, ny + 28);
      }

      const now = scene.time.now;
      if (now - this._lastTrailMs >= 24) {
        this._lastTrailMs = now;
        spawnTrailPuff(scene, nx + Math.cos(back) * 8, ny + Math.sin(back) * 8);
      }
    },
    destroy() {
      body.destroy();
      flame.destroy();
      shadow.destroy();
    }
  };

  proxy._move(x, y);
  return proxy;
}

function spawnTrailPuff(scene, x, y) {
  const puff = scene.add
    .image(x + Phaser.Math.Between(-2, 2), y + Phaser.Math.Between(-2, 2), SMOKE_KEY)
    .setDepth(DEPTH_SMOKE)
    .setScale(Phaser.Math.FloatBetween(0.3, 0.45))
    .setTint(Phaser.Utils.Array.GetRandom([0xb36bff, 0x8f5ad6, 0x8a8a96]))
    .setAlpha(0.65);
  scene.tweens.add({
    targets: puff,
    scale: Phaser.Math.FloatBetween(0.8, 1.1),
    alpha: 0,
    y: y - Phaser.Math.Between(4, 12),
    duration: Phaser.Math.Between(380, 560),
    ease: 'Quad.easeOut',
    onComplete: () => puff.destroy()
  });
}

// ---------- lançamento ----------

// estouro de fumaça/fogo na boca do Elite no momento do disparo
export function playEliteMissileLaunch(scene, x, y) {
  const flash = scene.add
    .image(x, y - 10, 'hit_fx')
    .setDepth(DEPTH_SPARK)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(PURPLE_LIGHT)
    .setScale(3.2)
    .setAlpha(0.9);
  scene.tweens.add({
    targets: flash,
    scale: 6,
    alpha: 0,
    duration: 180,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });
  for (let i = 0; i < 9; i++) {
    const a = Phaser.Math.FloatBetween(-Math.PI * 0.95, -Math.PI * 0.05); // jato pra cima
    const d = Phaser.Math.Between(18, 46);
    const puff = scene.add
      .image(x, y - 6, SMOKE_KEY)
      .setDepth(DEPTH_SMOKE)
      .setScale(Phaser.Math.FloatBetween(0.4, 0.7))
      .setTint(Phaser.Utils.Array.GetRandom([0xe8e8f0, 0xb0b0ba, 0xb36bff]))
      .setAlpha(0.7);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(a) * d,
      y: y - 6 + Math.sin(a) * d,
      scale: puff.scale * 2.2,
      alpha: 0,
      duration: Phaser.Math.Between(420, 700),
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy()
    });
  }
}

// ---------- explosão ----------

// intensity: 1 = completa; menor = menos partículas (vários mísseis ao mesmo tempo)
export function playEliteMissileExplosion(scene, x, y, radius, intensity = 1) {
  const n = (count) => Math.max(2, Math.round(count * intensity));

  const flare = (scale, alpha, ms, tint) => {
    const img = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(DEPTH_SPARK)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setScale(scale)
      .setAlpha(alpha);
    scene.tweens.add({
      targets: img,
      scale: scale * 1.7,
      alpha: 0,
      duration: ms,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy()
    });
  };

  // 1) chão queimado (nasce já escuro, some devagar) + brasa esfriando
  const scorch = scene.add
    .image(x, y + 2, SCORCH_KEY)
    .setDepth(DEPTH_SCORCH)
    .setAngle(Phaser.Math.Between(0, 359))
    .setScale((radius * 2.3) / 128, ((radius * 2.3) / 128) * 0.82)
    .setAlpha(0);
  scene.tweens.add({
    targets: scorch,
    alpha: 0.75,
    duration: 120,
    onComplete: () => {
      scene.tweens.add({
        targets: scorch,
        alpha: 0,
        delay: 2600,
        duration: 2400,
        ease: 'Sine.easeIn',
        onComplete: () => scorch.destroy()
      });
    }
  });
  const ember = scene.add
    .ellipse(x, y + 2, radius * 1.5, radius * 1.2, ORANGE, 0.45)
    .setDepth(DEPTH_SCORCH + 1)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ember,
    alpha: 0,
    scaleX: 0.7,
    scaleY: 0.7,
    duration: 1300,
    ease: 'Quad.easeOut',
    onComplete: () => ember.destroy()
  });

  // 2) clarões: branco seco + laranja largo
  flare((radius * 2.4) / 20, 1, 130, WHITE);
  flare((radius * 4) / 20, 0.6, 260, ORANGE);

  // 3) corpo da explosão: sprite animado + cópia aditiva maior (brilho)
  const baseScale = (radius * SPRITE_DIAMETER_PER_RADIUS) / FRAME;
  const body = scene.add
    .sprite(x, y - radius * 0.1, KEY, 0)
    .setDepth(DEPTH_BOOM)
    .setScale(baseScale * 0.6)
    .setAngle(Phaser.Math.Between(0, 3) * 90);
  const halo = scene.add
    .sprite(x, y - radius * 0.1, KEY, 0)
    .setDepth(DEPTH_BOOM - 1)
    .setScale(baseScale * 0.9)
    .setAlpha(0.6)
    .setTint(ORANGE)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAngle(body.angle);
  body.play(ANIM);
  halo.play(ANIM);
  // cresce rápido no começo e desacelera (a bola de fogo "estoura" e assenta)
  scene.tweens.add({ targets: body, scale: baseScale * 1.25, duration: 260, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: halo, scale: baseScale * 1.7, duration: 300, ease: 'Cubic.easeOut' });
  body.once('animationcomplete', () => {
    scene.tweens.add({
      targets: [body, halo],
      alpha: 0,
      duration: 160,
      onComplete: () => {
        body.destroy();
        halo.destroy();
      }
    });
  });

  // 4) anéis de choque achatados no chão + marca do raio de dano (vermelho, curta)
  [
    { delay: 0, to: 1.25, w: 5, color: YELLOW, ms: 340 },
    { delay: 60, to: 1.0, w: 2.5, color: ORANGE, ms: 340 }
  ].forEach((cfg) => {
    const g = scene.add.graphics().setDepth(DEPTH_BOOM).setBlendMode(Phaser.BlendModes.ADD);
    const state = { r: radius * 0.15, a: 1 };
    scene.tweens.add({
      targets: state,
      r: radius * cfg.to,
      a: 0,
      delay: cfg.delay,
      duration: cfg.ms,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(cfg.w, cfg.color, state.a);
        g.strokeEllipse(x, y, state.r * 2, state.r * 2 * 0.82);
      },
      onComplete: () => g.destroy()
    });
  });
  const dmg = scene.add.graphics().setDepth(DEPTH_BOOM - 2);
  const dmgState = { a: 0.9 };
  scene.tweens.add({
    targets: dmgState,
    a: 0,
    duration: 380,
    ease: 'Quad.easeIn',
    onUpdate: () => {
      dmg.clear();
      dmg.lineStyle(3, RED, dmgState.a);
      dmg.strokeCircle(x, y, radius);
    },
    onComplete: () => dmg.destroy()
  });

  // 5) faíscas longas saindo em todas as direções
  const sparks = n(22);
  for (let i = 0; i < sparks; i++) {
    const a = (i / sparks) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
    const dist = radius * Phaser.Math.FloatBetween(0.8, 1.9);
    const spark = scene.add
      .image(x, y, 'hit_fx')
      .setDepth(DEPTH_SPARK)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom(FIRE_TINTS))
      .setRotation(a)
      .setScale(Phaser.Math.FloatBetween(0.35, 0.85), Phaser.Math.FloatBetween(0.1, 0.2));
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist * 0.85,
      scaleX: 0.05,
      alpha: 0,
      duration: Phaser.Math.Between(240, 480),
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy()
    });
  }

  // 6) estilhaços (quadradinhos) lançados pra cima e caindo com gravidade
  const debris = n(12);
  for (let i = 0; i < debris; i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const speed = radius * Phaser.Math.FloatBetween(0.9, 1.9);
    const vx = Math.cos(a) * speed;
    const vy = -Phaser.Math.FloatBetween(radius * 1.2, radius * 2.4); // sobe
    const piece = scene.add
      .image(x, y, DEBRIS_KEY)
      .setDepth(DEPTH_SPARK)
      .setTint(Phaser.Utils.Array.GetRandom([0x2b2420, 0x4a3a30, ORANGE, YELLOW]))
      .setScale(Phaser.Math.FloatBetween(0.7, 1.6));
    const life = { t: 0 };
    const dur = Phaser.Math.Between(480, 800);
    scene.tweens.add({
      targets: life,
      t: 1,
      duration: dur,
      ease: 'Linear',
      onUpdate: () => {
        const t = life.t;
        piece.x = x + vx * t;
        piece.y = y + vy * t + radius * 3.6 * t * t; // gravidade
        piece.rotation = t * 9 * (vx > 0 ? 1 : -1);
        piece.alpha = t > 0.75 ? 1 - (t - 0.75) * 4 : 1;
      },
      onComplete: () => piece.destroy()
    });
  }

  // 7) fumaça grossa subindo e se espalhando (escura, blend normal)
  const smokes = n(9);
  for (let i = 0; i < smokes; i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const d = radius * Phaser.Math.FloatBetween(0.1, 0.7);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d * 0.7;
    const puff = scene.add
      .image(px, py, SMOKE_KEY)
      .setDepth(DEPTH_SMOKE)
      .setScale(Phaser.Math.FloatBetween(0.8, 1.3))
      .setTint(Phaser.Utils.Array.GetRandom([0x1b1816, 0x2a2623, 0x3b3530]))
      .setAlpha(0.75)
      .setVisible(false);
    scene.tweens.add({
      targets: puff,
      alpha: { from: 0.75, to: 0 },
      x: px + Phaser.Math.Between(-14, 14),
      y: py - Phaser.Math.Between(26, 62),
      scale: puff.scale * Phaser.Math.FloatBetween(1.8, 2.6),
      delay: 80 + i * 35,
      duration: Phaser.Math.Between(850, 1300),
      ease: 'Sine.easeOut',
      onStart: () => puff.setVisible(true),
      onComplete: () => puff.destroy()
    });
  }

  // 8) brasas leves flutuando depois do estouro
  const embers = n(8);
  for (let i = 0; i < embers; i++) {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const d = radius * Phaser.Math.FloatBetween(0.2, 0.9);
    const e = scene.add
      .image(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 'hit_fx')
      .setDepth(DEPTH_SPARK)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom([YELLOW, ORANGE, ORANGE]))
      .setScale(Phaser.Math.FloatBetween(0.1, 0.22))
      .setVisible(false);
    scene.tweens.add({
      targets: e,
      x: e.x + Phaser.Math.Between(-16, 16),
      y: e.y - Phaser.Math.Between(30, 70),
      alpha: 0,
      delay: Phaser.Math.Between(60, 260),
      duration: Phaser.Math.Between(700, 1200),
      ease: 'Sine.easeOut',
      onStart: () => e.setVisible(true),
      onComplete: () => e.destroy()
    });
  }
}
