// FX da Pancada Sísmica (carta rara dos Punhos): soco no chão, limpo e brutal.
// Sem terra, sem cratera, sem rachadura — só o que o jogador precisa ler:
//   clarão       -> flash curto no ponto de contato
//   deformação   -> o chão cede LEVEMENTE: disco macio e escuro cobrindo toda
//                   a área do dano (borda suave, sem parede/anéis), afunda em
//                   ~90ms e some rápido
//   onda         -> anel de ar/poeira que corre até o raio real do dano
//   poeira       -> nuvenzinhas claras empurradas pra fora na frente da onda
//   partículas   -> fagulhas pálidas disparadas pra fora, somem logo
//   câmera       -> tremor curto e seco
// Só visual — não mexe em dano, raio, cooldown nem knockback. `radius` é o
// raio real do dano: deformação e onda terminam exatamente nele.

const DENT_KEY = 'slam_dent';
const DUST_KEY = 'slam_dust';
const DENT_SIZE = 128;

// o chão fica abaixo de tudo (XP 4-5, sombras 8, inimigos 9, gato 10);
// poeira logo acima dos personagens; partículas e clarão por cima
const DEPTH_DENT = 2;
const DEPTH_DUST = 11;
const DEPTH_SPARK = 20;
const DEPTH_FLASH = 21;

const DENT_HOLD_MS = 260;
const DENT_FADE_MS = 520;

// poeira neutra e clara (nada de marrom/terra)
const DUST = [0xd9d4ca, 0xc4bfb4, 0xaaa59b];
const SPARK = [0xffffff, 0xece8de, 0xd2cdc2];

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// sem arte externa: tudo é gerado por código (mantido pra não mexer no Preload)
export function loadSlamFx() {}

// chamado no create() da PreloadScene
export function createSlamFx(scene) {
  ensureDentTexture(scene);
  ensureDustTexture(scene);
}

export function hasSlamFx(scene) {
  return scene.textures.exists(DENT_KEY) && scene.textures.exists(DUST_KEY);
}

// ----------------------------------------------------------- texturas
// Deformação: disco macio, mais escuro no meio e sumindo na borda, com uma
// leve sombra no lado de cima/esquerda e um toque de luz embaixo/direita pra
// ler como depressão rasa. Sem degraus, sem ruído, sem contorno.
function ensureDentTexture(scene) {
  if (scene.textures.exists(DENT_KEY)) return;
  const size = DENT_SIZE;
  const tex = scene.textures.createCanvas(DENT_KEY, size, size);
  const ctx = tex.getContext();
  const c = size / 2;

  const base = ctx.createRadialGradient(c, c, 0, c, c, c);
  base.addColorStop(0, 'rgba(8,6,4,0.55)');
  base.addColorStop(0.6, 'rgba(8,6,4,0.34)');
  base.addColorStop(0.92, 'rgba(8,6,4,0.1)');
  base.addColorStop(1, 'rgba(8,6,4,0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // sombra leve do lado da luz (cima/esquerda) e brilho baixo (baixo/direita)
  const shade = ctx.createRadialGradient(c - 14, c - 14, c * 0.35, c, c, c);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.8, 'rgba(0,0,0,0.12)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  const light = ctx.createRadialGradient(c + 14, c + 14, c * 0.4, c, c, c);
  light.addColorStop(0, 'rgba(255,255,255,0)');
  light.addColorStop(0.82, 'rgba(255,255,255,0.07)');
  light.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);

  tex.refresh();
}

// nuvem de poeira: disco macio (branco, é tingido na hora)
function ensureDustTexture(scene) {
  if (scene.textures.exists(DUST_KEY)) return;
  const size = 64;
  const tex = scene.textures.createCanvas(DUST_KEY, size, size);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

// ------------------------------------------------------------ componentes
function playFlash(scene, x, y, radius) {
  const scale = (radius * 1.1) / 64;
  const flash = scene.add
    .image(x, y, DUST_KEY)
    .setDepth(DEPTH_FLASH)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xfff6e6)
    .setScale(scale * 0.5)
    .setAlpha(0.85);
  scene.tweens.add({
    targets: flash,
    scale,
    alpha: 0,
    duration: 110,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });
}

// o chão cede de leve: nasce um pouco maior e "assenta" no raio do dano
function playDent(scene, x, y, radius) {
  const finalScale = (radius * 2) / DENT_SIZE;
  const dent = scene.add
    .image(x, y, DENT_KEY)
    .setDepth(DEPTH_DENT)
    .setScale(finalScale * 1.12)
    .setAlpha(0);
  scene.tweens.add({
    targets: dent,
    scale: finalScale,
    alpha: 1,
    duration: 90,
    ease: 'Cubic.easeIn'
  });
  scene.tweens.add({
    targets: dent,
    alpha: 0,
    delay: DENT_HOLD_MS,
    duration: DENT_FADE_MS,
    ease: 'Quad.easeIn',
    onComplete: () => dent.destroy()
  });
}

// anel de ar/poeira que corre até o raio do dano + poeira empurrada na frente
function playGroundWave(scene, x, y, radius, q = 1) {
  const ring = scene.add.graphics().setDepth(DEPTH_DUST);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 320,
    ease: 'Cubic.easeOut',
    onUpdate: (tw) => {
      const t = tw.getValue();
      const r = radius * (0.2 + 0.8 * t);
      const fade = Math.pow(1 - t, 1.3);
      ring.clear();
      ring.lineStyle(8 * (1 - t) + 2, 0xc4bfb4, 0.3 * fade); // poeira
      ring.strokeCircle(x, y, r);
      ring.lineStyle(2, 0xffffff, 0.6 * fade); // frente de pressão
      ring.strokeCircle(x, y, r);
    },
    onComplete: () => ring.destroy()
  });

  const puffs = Math.max(1, Math.round(Phaser.Math.Between(18, 22) * q));
  const puffScale = radius / 110;
  for (let i = 0; i < puffs; i++) {
    const a = (Math.PI * 2 * i) / puffs + rand(-0.15, 0.15);
    const start = radius * rand(0.2, 0.35);
    const end = radius * rand(0.85, 1.05);
    const puff = scene.add
      .image(x + Math.cos(a) * start, y + Math.sin(a) * start, DUST_KEY)
      .setDepth(DEPTH_DUST)
      .setTint(pick(DUST))
      .setScale(rand(0.28, 0.4) * puffScale)
      .setAlpha(0.5);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(a) * end,
      y: y + Math.sin(a) * end,
      scale: rand(0.6, 0.9) * puffScale,
      duration: Phaser.Math.Between(320, 420),
      ease: 'Cubic.easeOut'
    });
    scene.tweens.add({
      targets: puff,
      alpha: 0,
      delay: 120,
      duration: Phaser.Math.Between(260, 360),
      ease: 'Quad.easeIn',
      onComplete: () => puff.destroy()
    });
  }
}

// fagulhas pálidas disparadas pra fora: rápidas, pequenas, somem sem pousar
function playSparks(scene, x, y, radius, q = 1) {
  const count = Math.max(1, Math.round(26 * q));
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + rand(-0.2, 0.2);
    const start = radius * rand(0.1, 0.3);
    const end = radius * rand(0.7, 1.15);
    const size = Phaser.Math.Between(2, 4);
    const p = scene.add
      .rectangle(x + Math.cos(a) * start, y + Math.sin(a) * start, size, size, pick(SPARK))
      .setDepth(DEPTH_SPARK)
      .setAlpha(0.9);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * end,
      y: y + Math.sin(a) * end - rand(2, 8),
      alpha: 0,
      scale: 0.4,
      duration: Phaser.Math.Between(260, 420),
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy()
    });
  }
}

// ---------------------------------------------------------------- público
// Toca a Pancada Sísmica inteira em (x, y). `radius` = raio real do dano.
// `opts` (multiplayer): q = fator de partículas, shake = fator do tremor.
export function playSlamFx(scene, x, y, radius, { q = 1, shake = 1 } = {}) {
  playFlash(scene, x, y, radius);
  playDent(scene, x, y, radius);
  playGroundWave(scene, x, y, radius, q);
  playSparks(scene, x, y, radius, q);
  if (shake > 0) scene.cameras.main.shake(130, 0.0065 * shake);
}
