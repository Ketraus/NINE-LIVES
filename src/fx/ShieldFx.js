// Visual da Barreira (energyShield, evolução de Blindagem): bolha de vidro
// ciano ao redor do gato, com cara de escudo futurista.
//   base    -> bolha (assets/fx/shield_bubble.png) tingida de ciano + cópia
//              aditiva que respira (efeito vidro/fresnel) + halo externo
//   hex     -> duas grades hexagonais giram em sentidos opostos e cintilam
//   borda   -> anel fino brilhante + varredura de luz correndo pela borda
//   faíscas -> pontinhos de luz que sobem da borda de vez em quando
// Ao tomar dano: flash branco, onda no ponto de impacto e anel que se expande.
// Ao esgotar: estilhaço (anel grande + grade acesa).
// Alpha geral (recarga piscando etc.) continua sendo controlado pelo Player
// via setAlpha no container. Tudo em unidades locais (radius); o Player cuida
// de posição e escala.

const KEY_BUBBLE = 'shield_bubble';
const TEX_HEX = 'sfx_hex';
const TEX_GLOW = 'sfx_glow';
const TEX_RING = 'sfx_ring';
const TEX_SPARK = 'sfx_spark';

const CYAN = 0x2fd0ff;
const CYAN_LIGHT = 0x9ff3ff;
const CYAN_HOT = 0xe4fcff;
const BUBBLE_FRAME = 48;
const BUBBLE_DIAMETER = 42; // diâmetro visível dentro dos 48px

export function loadShieldAssets(scene) {
  scene.load.image(KEY_BUBBLE, 'assets/fx/shield_bubble.png');
}

export function createShieldTextures(scene) {
  if (!scene.textures.exists(KEY_BUBBLE)) return;
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

  // grade hexagonal recortada em círculo (some suave perto da borda)
  if (!tm.exists(TEX_HEX)) {
    const size = 128;
    const tex = tm.createCanvas(TEX_HEX, size, size);
    const ctx = tex.getContext();
    const hexR = 11;
    const w = Math.sqrt(3) * hexR;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    for (let row = -1; row < size / (hexR * 1.5) + 1; row++) {
      for (let col = -1; col < size / w + 1; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0);
        const cy = row * hexR * 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          const px = cx + Math.cos(a) * hexR;
          const py = cy + Math.sin(a) * hexR;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
    m.addColorStop(0, 'rgba(255,255,255,0.35)');
    m.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    m.addColorStop(0.94, 'rgba(255,255,255,1)');
    m.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  // anel fino (ondas de impacto / estilhaço)
  if (!tm.exists(TEX_RING)) {
    const size = 128;
    const tex = tm.createCanvas(TEX_RING, size, size);
    const ctx = tex.getContext();
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, c * 0.7, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.3)');
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

export function hasShieldFx(scene) {
  return scene.textures.exists(KEY_BUBBLE) && scene.textures.exists(TEX_HEX);
}

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);

export function createShieldFx(scene, radius) {
  const bubbleScale = (radius * 2) / BUBBLE_DIAMETER;
  const size = radius * 2;

  const halo = scene.add.image(0, 0, TEX_GLOW)
    .setTint(CYAN).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3)
    .setDisplaySize(radius * 3.2, radius * 3.2);

  const bubble = scene.add.image(0, 0, KEY_BUBBLE)
    .setTint(CYAN).setScale(bubbleScale).setAlpha(0.75);
  const sheen = scene.add.image(0, 0, KEY_BUBBLE)
    .setTint(CYAN_LIGHT).setBlendMode(Phaser.BlendModes.ADD)
    .setScale(bubbleScale * 1.02).setAlpha(0.35);

  const hexA = scene.add.image(0, 0, TEX_HEX)
    .setTint(CYAN_LIGHT).setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(size * 0.98, size * 0.98).setAlpha(0.28);
  const hexB = scene.add.image(0, 0, TEX_HEX)
    .setTint(CYAN).setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(size * 0.88, size * 0.88).setAlpha(0.18).setAngle(30);

  // máscara geométrica: mantém a grade dentro do círculo da bolha
  const rim = scene.add.circle(0, 0, radius * 0.98).setStrokeStyle(1.4, CYAN_LIGHT, 0.85);
  rim.setFillStyle(0x000000, 0).setBlendMode(Phaser.BlendModes.ADD);

  const sweep = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

  const sparks = [];
  for (let i = 0; i < 6; i++) {
    const img = scene.add.image(0, 0, TEX_SPARK).setTint(CYAN_HOT)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    sparks.push({ img, life: 0, maxLife: 1, x: 0, y: 0, vx: 0, vy: 0 });
  }

  const container = scene.add
    .container(0, 0, [halo, bubble, sheen, hexA, hexB, rim, sweep, ...sparks.map((s) => s.img)])
    .setDepth(11);

  container.setData({
    radius, bubble, sheen, halo, hexA, hexB, rim, sweep, sparks,
    bubbleScale, flash: 0, sweepAngle: rand(0, Math.PI * 2), shimmer: 0
  });
  // destruir o container (reset/morte) mata as ondas em andamento
  container.once('destroy', () => scene.tweens?.killTweensOf(container.list.slice()));

  // entrada: clarão + anel (a escala do container é do Player, não dá pra tweenar)
  container.setData('flash', 1);
  ripple(scene, container, radius, 0.8, 420, CYAN_LIGHT);
  return container;
}

// Todo frame. O Player seta posição/escala/alpha do container; aqui só o interior.
export function updateShieldFx(fx, time, dt) {
  if (!fx?.scene || !fx.active) return;
  const radius = fx.getData('radius');
  if (radius === undefined) return;
  const sec = Math.min(dt, 50) / 1000;

  let flash = Math.max(0, fx.getData('flash') - 5 * sec);
  fx.setData('flash', flash);

  const breathe = 0.5 + 0.5 * Math.sin(time * 0.004);
  const bubble = fx.getData('bubble');
  const sheen = fx.getData('sheen');
  const bubbleScale = fx.getData('bubbleScale');

  bubble.setScale(bubbleScale * (1 + 0.012 * Math.sin(time * 0.006)));
  if (flash > 0) bubble.setTint(Phaser.Display.Color.GetColor(
    Math.round(47 + 208 * flash), Math.round(208 + 47 * flash), 255));
  else bubble.setTint(CYAN);
  sheen.setAlpha(0.25 + 0.2 * breathe + 0.5 * flash);
  sheen.setScale(bubbleScale * (1.02 + 0.03 * breathe + 0.06 * flash));
  fx.getData('halo').setAlpha(0.22 + 0.12 * breathe + 0.5 * flash);

  // grades contrárias + cintilação (as duas somam em moiré)
  const hexA = fx.getData('hexA');
  const hexB = fx.getData('hexB');
  hexA.angle += 9 * sec;
  hexB.angle -= 14 * sec;
  const shimmer = 0.5 + 0.5 * Math.sin(time * 0.009) * Math.sin(time * 0.0031 + 2);
  hexA.setAlpha(0.2 + 0.16 * shimmer + 0.5 * flash);
  hexB.setAlpha(0.12 + 0.12 * (1 - shimmer) + 0.4 * flash);

  fx.getData('rim').setStrokeStyle(1.4, flash > 0.1 ? CYAN_HOT : CYAN_LIGHT, 0.7 + 0.2 * breathe + 0.3 * flash);

  // varredura de luz correndo pela borda (cabeça brilhante + cauda)
  const sweep = fx.getData('sweep');
  let a = fx.getData('sweepAngle') + 2.3 * sec;
  fx.setData('sweepAngle', a);
  sweep.clear();
  const tail = 1.1;
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const a0 = a - tail * (1 - t);
    const a1 = a - tail * (1 - (t + 1 / steps));
    sweep.lineStyle(1.8, CYAN_HOT, 0.05 + 0.55 * t * t);
    sweep.beginPath();
    sweep.arc(0, 0, radius * 0.99, a0, a1);
    sweep.strokePath();
  }

  // faíscas esporádicas subindo da borda
  const sparks = fx.getData('sparks');
  if (Math.random() < 0.05) emitSpark(sparks, radius);
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    if (s.life <= 0) continue;
    s.life -= sec;
    if (s.life <= 0) { s.img.setVisible(false); continue; }
    s.x += s.vx * sec;
    s.y += s.vy * sec;
    const k = s.life / s.maxLife;
    s.img.setPosition(s.x, s.y).setAlpha(k).setScale(0.6 + k);
  }
}

function emitSpark(sparks, radius) {
  const s = sparks.find((p) => p.life <= 0);
  if (!s) return;
  const a = rand(0, Math.PI * 2);
  s.x = Math.cos(a) * radius * 0.95;
  s.y = Math.sin(a) * radius * 0.95;
  s.vx = Math.cos(a) * radius * 0.5;
  s.vy = Math.sin(a) * radius * 0.5 - radius * 0.7; // tende a subir
  s.maxLife = s.life = rand(0.35, 0.7);
  s.img.setVisible(true).setPosition(s.x, s.y);
}

// anel que cresce a partir do centro e some (filho do container)
function ripple(scene, container, radius, alpha, duration, color) {
  const r = scene.add.image(0, 0, TEX_RING).setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha)
    .setDisplaySize(radius * 1.8, radius * 1.8);
  container.add(r);
  scene.tweens.add({
    targets: r,
    scaleX: r.scaleX * 1.55,
    scaleY: r.scaleY * 1.55,
    alpha: 0,
    duration,
    ease: 'Cubic.easeOut',
    onComplete: () => r.destroy()
  });
}

// Dano absorvido: flash + clarão num ponto aleatório da borda + onda.
export function hitShieldFx(fx) {
  const scene = fx?.scene;
  if (!scene || fx.getData('radius') === undefined) return;
  const radius = fx.getData('radius');
  fx.setData('flash', 1);

  const a = rand(0, Math.PI * 2);
  const spot = scene.add.image(Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92, TEX_GLOW)
    .setTint(CYAN_HOT).setBlendMode(Phaser.BlendModes.ADD).setAlpha(1)
    .setDisplaySize(radius * 1.1, radius * 1.1);
  fx.add(spot);
  scene.tweens.add({
    targets: spot,
    scaleX: spot.scaleX * 1.9,
    scaleY: spot.scaleY * 1.9,
    alpha: 0,
    duration: 220,
    ease: 'Cubic.easeOut',
    onComplete: () => spot.destroy()
  });
  ripple(scene, fx, radius, 0.7, 260, CYAN_LIGHT);
  for (let i = 0; i < 3; i++) emitSpark(fx.getData('sparks'), radius);
}

// Escudo zerou: estouro maior.
export function breakShieldFx(fx) {
  const scene = fx?.scene;
  if (!scene || fx.getData('radius') === undefined) return;
  const radius = fx.getData('radius');
  fx.setData('flash', 1);
  ripple(scene, fx, radius, 1, 480, CYAN_HOT);
  ripple(scene, fx, radius, 0.6, 620, CYAN);
  const sparks = fx.getData('sparks');
  for (let i = 0; i < sparks.length; i++) emitSpark(sparks, radius);
}
