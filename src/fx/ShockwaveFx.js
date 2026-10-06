// FX do Shockwave (carta rara dos Punhos): um soco tão forte que desloca o
// ar de forma brutal. Tudo BRANCO. A onda é a arte em pixel art
// (assets/fx/shockwave_wave.png, 4 frames 32x32, apontando pra DIREITA) com:
// frente de ar comprimido (arco macio) na ponta, fantasmas esticados atrás e
// "tiras" de vento sendo empurradas pros lados; no impacto, clarão + anéis
// de pressão + linhas radiais + o estouro do soco. Só visual — não mexe em
// dano, velocidade, alcance nem hitbox.
//
// EVOLUÇÃO "Blastwave": o ataque continua com a identidade BRANCA (ar
// comprimido, anéis, flash), mas agora a onda é a arte evoluída
// (assets/fx/shockwave_evo_wave.png, 4 frames, ponta branca + corpo ciano
// com arcos elétricos) com uma camada branca superexposta piscando por cima,
// raios estalando ao redor dela em voo e, no impacto, a explosão de ar
// (assets/fx/shockwave_evo_explosion.png: clarão -> mira -> anel -> anel
// dissolvendo) com descargas elétricas geradas pelo choque. O tamanho da
// explosão acompanha o raio real do dano (`radius`).

import { ensureWindTexture, hasPunchFx, playPunchFx } from './PunchFx.js';

export const SHOCKWAVE_KEY = 'shockwave_wave';
const FRAME_SIZE = 32;
const FRAME_COUNT = 4;
// ponto de ancoragem: corpo branco da onda (a "cauda" fica pra trás)
export const SHOCKWAVE_ORIGIN_X = 0.65;
export const SHOCKWAVE_ORIGIN_Y = 0.5;
const RING_KEY = 'fx_air_ring';
// arte da evolução (Blastwave)
export const SHOCKWAVE_EVO_KEY = 'shockwave_evo_wave';
const EVO_EXPLOSION_KEY = 'shockwave_evo_exp';
const EXPLOSION_RING_DIAMETER = 30; // o anel do último frame ocupa ~30 dos 32px
// a explosão VISUAL é proporcional à onda (~47px), não ao raio de dano: ar
// deslocado, não bomba. O dano continua usando o raio real.
const EXPLOSION_VISUAL_FACTOR = 0.5;
const WAVE_VISUAL_SCALE = 1.5; // escala da onda em voo (def.width / 32 * 0.85)
const GLOW_KEY = 'fx_shock_glow';
// paleta elétrica (mesma família da Sobrecarga / corte do Cyberus)
const COLOR_HOT = 0xffffff; // núcleo do raio
const COLOR_MID = 0x4fd8f5;
const COLOR_GLOW = 0x1296ff;
const SPARK_COLORS = [0xffffff, 0xdffcff, 0xa6f1ff, 0x4fd8f5];
// fator de tamanho dos FX em volta da onda (1 = tamanho antigo, grande demais)
const FX_SIZE = 0.6;

export function loadShockwaveSheet(scene) {
  scene.load.spritesheet(SHOCKWAVE_KEY, 'assets/fx/shockwave_wave.png', {
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE
  });
  scene.load.spritesheet(SHOCKWAVE_EVO_KEY, 'assets/fx/shockwave_evo_wave.png', {
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE
  });
  scene.load.spritesheet(EVO_EXPLOSION_KEY, 'assets/fx/shockwave_evo_explosion.png', {
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE
  });
}

// chamado no create() da PreloadScene
export function createShockwaveAnimation(scene) {
  if (scene.textures.exists(SHOCKWAVE_KEY)) {
    scene.textures.get(SHOCKWAVE_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (!scene.anims.exists(SHOCKWAVE_KEY)) {
      scene.anims.create({
        key: SHOCKWAVE_KEY,
        frames: scene.anims.generateFrameNumbers(SHOCKWAVE_KEY, { start: 0, end: FRAME_COUNT - 1 }),
        frameRate: 18,
        repeat: -1
      });
    }
  }
  // evolução: onda com arcos elétricos (a explosão é conduzida por código)
  if (scene.textures.exists(SHOCKWAVE_EVO_KEY)) {
    scene.textures.get(SHOCKWAVE_EVO_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (!scene.anims.exists(SHOCKWAVE_EVO_KEY)) {
      scene.anims.create({
        key: SHOCKWAVE_EVO_KEY,
        frames: scene.anims.generateFrameNumbers(SHOCKWAVE_EVO_KEY, { start: 0, end: FRAME_COUNT - 1 }),
        frameRate: 24,
        repeat: -1
      });
    }
  }
  if (scene.textures.exists(EVO_EXPLOSION_KEY)) {
    scene.textures.get(EVO_EXPLOSION_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

export function hasShockwaveFx(scene) {
  return scene.textures.exists(SHOCKWAVE_KEY) && scene.anims.exists(SHOCKWAVE_KEY);
}

// artes da evolução carregadas? (senão a ability cai no FX do Shockwave normal)
export function hasShockwaveEvoFx(scene) {
  return (
    scene.textures.exists(SHOCKWAVE_EVO_KEY) &&
    scene.textures.exists(EVO_EXPLOSION_KEY) &&
    scene.anims.exists(SHOCKWAVE_EVO_KEY)
  );
}

// anel fino e macio (borda em degradê feita empilhando traços translúcidos)
function ensureRingTexture(scene) {
  if (scene.textures.exists(RING_KEY)) return RING_KEY;
  const g = scene.add.graphics();
  [
    [10, 0.06],
    [7, 0.1],
    [4.5, 0.18],
    [2.2, 0.5]
  ].forEach(([width, alpha]) => {
    g.lineStyle(width, 0xffffff, alpha);
    g.strokeCircle(32, 32, 26);
  });
  g.generateTexture(RING_KEY, 64, 64);
  g.destroy();
  return RING_KEY;
}

function additive(img, depth, scaleX, scaleY, alpha) {
  return img.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setScale(scaleX, scaleY).setAlpha(alpha);
}

// ------------------------------------------------------- eletricidade (evo)
const rand = (a, b) => Phaser.Math.FloatBetween(a, b);

// halo macio (disco com degradê), usado como brilho aditivo
function ensureGlowTexture(scene) {
  if (scene.textures.exists(GLOW_KEY)) return GLOW_KEY;
  const tex = scene.textures.createCanvas(GLOW_KEY, 64, 64);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.refresh();
  return GLOW_KEY;
}

// polilinha "elétrica": desvio lateral aleatório que zera nas pontas
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

// brilho largo + meio + núcleo branco
function strokeBolt(g, pts, unit, strong = 1) {
  strokePath(g, pts, 4.5 * unit, COLOR_GLOW, 0.22 * strong);
  strokePath(g, pts, 2.2 * unit, COLOR_MID, 0.6 * strong);
  strokePath(g, pts, 1 * unit, COLOR_HOT, 0.95 * strong);
}

// raio saindo de (x, y) na direção `angle`, com bifurcação ocasional
function boltFrom(g, x, y, angle, length, segs, jitter, unit = 1, strong = 1, forkChance = 0) {
  const pts = jaggedPath(x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length, segs, jitter);
  strokeBolt(g, pts, unit, strong);
  if (forkChance && Math.random() < forkChance) {
    const m = pts[Math.floor(pts.length / 2)];
    const fa = angle + rand(-0.9, 0.9);
    const fl = length * rand(0.3, 0.5);
    const fork = jaggedPath(m.x, m.y, m.x + Math.cos(fa) * fl, m.y + Math.sin(fa) * fl, 3, jitter * 0.6);
    strokePath(g, fork, 1.6 * unit, COLOR_MID, 0.5 * strong);
    strokePath(g, fork, 0.8 * unit, COLOR_HOT, 0.8 * strong);
  }
  return pts;
}

function boltLayer(scene, depth) {
  return scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
}

function fadeAndDestroy(scene, obj, duration) {
  scene.tweens.add({
    targets: obj,
    alpha: 0,
    duration,
    ease: 'Quad.easeIn',
    onComplete: () => obj.destroy()
  });
}

// faíscas (pixels 2x2) que escapam e somem
function spawnSparks(scene, x, y, count, { angle = 0, spread = Math.PI, dist = [14, 44], life = [180, 360], depth = 24 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = angle + rand(-spread, spread);
    const d = Phaser.Math.Between(dist[0], dist[1]);
    const spark = scene.add
      .rectangle(x, y, 2, 2, Phaser.Utils.Array.GetRandom(SPARK_COLORS))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      duration: Phaser.Math.Between(life[0], life[1]),
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy()
    });
  }
}

// Descarga solta entre dois pontos do mundo (impacto -> inimigo próximo).
export function spawnShockwaveZapFx(scene, x1, y1, x2, y2) {
  const g = boltLayer(scene, 24);
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const segs = Math.max(4, Math.round(dist / 9));
  const jitter = Math.min(9, 3 + dist * 0.08);
  strokeBolt(g, jaggedPath(x1, y1, x2, y2, segs, jitter), 1.1, 1);
  // crepita: redesenha o caminho uma vez antes de sumir
  scene.time.delayedCall(55, () => {
    if (!g.active) return;
    g.clear();
    strokeBolt(g, jaggedPath(x1, y1, x2, y2, segs, jitter), 1, 0.8);
  });
  fadeAndDestroy(scene, g, 160);

  const end = additive(scene.add.image(x2, y2, ensureGlowTexture(scene)), 24, 0.5, 0.5, 0.9).setTint(0x8fe9ff);
  scene.tweens.add({
    targets: end,
    alpha: 0,
    scale: 0.9,
    duration: 190,
    ease: 'Cubic.easeOut',
    onComplete: () => end.destroy()
  });
  spawnSparks(scene, x2, y2, 3, { dist: [8, 22], life: [120, 220] });
}

// Explosão de ar: clarão -> mira -> anel -> anel dissolvendo. O tamanho final
// do anel é o raio real da explosão. Frames trocados por código (o clarão tem
// que "morder" rápido, o anel demora mais).
function playExplosionSprite(scene, x, y, radius) {
  const finalScale = (radius * 2) / EXPLOSION_RING_DIAMETER;
  const sprite = scene.add.sprite(x, y, EVO_EXPLOSION_KEY, 0).setDepth(23).setScale(finalScale * 0.45);
  scene.tweens.add({
    targets: sprite,
    scale: finalScale,
    duration: 340,
    ease: 'Cubic.easeOut',
    onUpdate: (tw) => {
      const p = tw.progress;
      sprite.setFrame(p < 0.12 ? 0 : p < 0.38 ? 1 : p < 0.66 ? 2 : 3);
      sprite.setAlpha(p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
    },
    onComplete: () => sprite.destroy()
  });

  // halo branco-azulado por baixo: o ar estourando
  const glowScale = (radius * 2.2) / 64;
  const glow = additive(scene.add.image(x, y, ensureGlowTexture(scene)), 20, glowScale, glowScale, 0.85).setTint(0xbff4ff);
  scene.tweens.add({
    targets: glow,
    alpha: 0,
    scale: glowScale * 1.3,
    duration: 280,
    ease: 'Cubic.easeOut',
    onComplete: () => glow.destroy()
  });
}

// Eletricidade gerada pelo choque: descargas radiais que estalam em 4
// quadros (cada um com raios novos, cada vez mais fracos) + arcos correndo
// pela borda da explosão.
function playImpactElectricity(scene, x, y, radius, angle = 0) {
  const g = boltLayer(scene, 24);
  const unit = Math.max(0.9, radius / 60);
  const draw = (strong) => {
    g.clear();
    const bolts = Phaser.Math.Between(5, 7);
    for (let i = 0; i < bolts; i++) {
      // o choque continua pra frente: raios espalhados mais pro lado da onda
      const a = angle + rand(-2.4, 2.4);
      const r0 = radius * rand(0.08, 0.2);
      const r1 = radius * rand(0.7, 1.25);
      boltFrom(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, a, r1 - r0, 6, radius * 0.16, unit, strong, 0.5);
    }
    for (let i = 0; i < 2; i++) {
      const a0 = rand(0, Math.PI * 2);
      const span = rand(0.35, 0.9);
      const pts = [];
      for (let k = 0; k <= 7; k++) {
        const a = a0 + (span * k) / 7;
        const r = radius * rand(0.78, 0.95);
        pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
      strokePath(g, pts, 3 * unit, COLOR_GLOW, 0.22 * strong);
      strokePath(g, pts, 1.2 * unit, COLOR_HOT, 0.9 * strong);
    }
  };
  draw(1);
  [0.8, 0.55, 0.35].forEach((strong, i) => {
    scene.time.delayedCall(55 * (i + 1), () => {
      if (g.active) draw(strong);
    });
  });
  fadeAndDestroy(scene, g, 240);
}

// Estalo pequeno (batida na parede / fim do alcance da onda evoluída).
function playSmallElectricity(scene, x, y, angle) {
  const g = boltLayer(scene, 24);
  const n = Phaser.Math.Between(3, 4);
  for (let i = 0; i < n; i++) {
    boltFrom(g, x, y, angle + rand(-1.4, 1.4), rand(14, 28), 4, 4, 1, 1, 0.3);
  }
  fadeAndDestroy(scene, g, 130);
  spawnSparks(scene, x, y, 5, { angle, spread: 1.6, dist: [10, 30], life: [140, 260] });
}

// ------------------------------------------------------------ lançamento
// Soco que deforma o ar: anel de pressão achatado à frente + leque de 5
// arcos de vento saindo do gato. `shake` só na 1ª onda da salva.
export function launchShockwaveFx(scene, x, y, dir, { shake = true, evolved = false } = {}) {
  const angle = dir.angle();
  const ox = x + dir.x * 18;
  const oy = y + dir.y * 18;

  const ring = additive(scene.add.image(ox, oy, ensureRingTexture(scene)), 18, 0.3 * FX_SIZE, 0.8 * FX_SIZE, 0.85).setRotation(angle);
  scene.tweens.add({
    targets: ring,
    scaleX: 0.95 * FX_SIZE,
    scaleY: 2.3 * FX_SIZE,
    alpha: 0,
    duration: 170,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });

  const wind = ensureWindTexture(scene);
  [-40, -20, 0, 20, 40].forEach((deg, i) => {
    const a = angle + Phaser.Math.DegToRad(deg);
    const arc = additive(
      scene.add.image(ox + Math.cos(a) * 10, oy + Math.sin(a) * 10, wind),
      18,
      0.6 * FX_SIZE,
      0.75 * FX_SIZE,
      0
    ).setRotation(a);
    scene.tweens.add({
      targets: arc,
      delay: i * 10,
      x: ox + Math.cos(a) * Phaser.Math.Between(46, 64) * FX_SIZE,
      y: oy + Math.sin(a) * Phaser.Math.Between(46, 64) * FX_SIZE,
      scaleX: 1.25 * FX_SIZE,
      scaleY: 1.2 * FX_SIZE,
      duration: 150,
      ease: 'Cubic.easeOut',
      onStart: () => arc.setAlpha(0.7),
      onUpdate: (t) => arc.setAlpha(0.7 * (1 - t.progress)),
      onComplete: () => arc.destroy()
    });
  });

  if (evolved) {
    // anel de pressão ciano por fora do branco + leque de raios e faíscas
    const ring2 = additive(scene.add.image(ox, oy, ensureRingTexture(scene)), 18, 0.35 * FX_SIZE, 0.9 * FX_SIZE, 0.8)
      .setRotation(angle)
      .setTint(0x8fe9ff);
    scene.tweens.add({
      targets: ring2,
      scaleX: 1.15 * FX_SIZE,
      scaleY: 2.9 * FX_SIZE,
      alpha: 0,
      duration: 210,
      ease: 'Cubic.easeOut',
      onComplete: () => ring2.destroy()
    });
    const g = boltLayer(scene, 19);
    for (let i = 0; i < 4; i++) {
      boltFrom(g, ox, oy, angle + rand(-0.7, 0.7), rand(22, 38), 4, 4, 1, 1, 0.3);
    }
    fadeAndDestroy(scene, g, 120);
    spawnSparks(scene, ox, oy, 7, { angle, spread: 0.9, dist: [20, 52], life: [140, 260], depth: 19 });
  }

  if (shake) scene.cameras.main.shake(90, evolved ? 0.0045 : 0.0035);
}

// ------------------------------------------------------------------ voo
// Frente de ar comprimido (arco macio) à frente da onda, fantasmas esticados
// atrás dela e tiras de vento sendo empurradas pros lados em "V".
export function attachShockwaveFlight(scene, wave, dir, { evolved = false } = {}) {
  const angle = dir.angle();
  const perpX = -dir.y;
  const perpY = dir.x;
  const windKey = ensureWindTexture(scene);
  const texKey = evolved ? SHOCKWAVE_EVO_KEY : SHOCKWAVE_KEY;

  // evolução: cópia BRANCA superexposta por cima da onda, piscando — o corpo
  // ciano fica por baixo, mas o ataque lê como branco incandescente
  const hot = evolved
    ? scene.add
        .image(wave.x, wave.y, SHOCKWAVE_EVO_KEY, wave.frame.name)
        .setOrigin(SHOCKWAVE_ORIGIN_X, SHOCKWAVE_ORIGIN_Y)
        .setScale(wave.scaleX, wave.scaleY)
        .setRotation(angle)
        .setDepth(17)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTintFill(0xffffff)
        .setAlpha(0.3)
    : null;

  // frente de pressão: arco macio que acompanha a ponta da onda
  const front = additive(scene.add.image(wave.x, wave.y, windKey), 15, 1.5 * FX_SIZE, 1.9 * FX_SIZE, 0.5).setRotation(angle);
  const pulse = scene.tweens.add({
    targets: front,
    scaleY: 2.2 * FX_SIZE,
    duration: 90,
    yoyo: true,
    repeat: -1
  });

  const follow = () => {
    if (!wave.active) {
      scene.events.off('update', follow);
      pulse.stop();
      scene.tweens.add({
        targets: front,
        alpha: 0,
        scaleX: front.scaleX * 1.3,
        duration: 120,
        onComplete: () => front.destroy()
      });
      if (hot) {
        scene.tweens.add({ targets: hot, alpha: 0, duration: 100, onComplete: () => hot.destroy() });
      }
      return;
    }
    if (hot) hot.setPosition(wave.x, wave.y).setFrame(wave.frame.name).setAlpha(wave.alpha * rand(0.16, 0.42));
    front.setPosition(wave.x + dir.x * 40 * FX_SIZE, wave.y + dir.y * 40 * FX_SIZE).setAlpha(0.5 * wave.alpha);
  };
  scene.events.on('update', follow);

  const ev = scene.time.addEvent({
    delay: 30,
    loop: true,
    callback: () => {
      if (!wave.active) {
        ev.remove(false);
        return;
      }
      // fantasma esticado (mesmo frame da onda) — sensação de velocidade brutal
      const ghost = additive(
        scene.add.image(wave.x, wave.y, texKey, wave.frame.name),
        14,
        wave.scaleX * 1.1,
        wave.scaleY * 0.95,
        0.35 * wave.alpha
      )
        .setOrigin(SHOCKWAVE_ORIGIN_X, SHOCKWAVE_ORIGIN_Y)
        .setRotation(angle);
      if (evolved) ghost.setTint(0x9eeaff); // rastro ciano atrás da onda
      scene.tweens.add({
        targets: ghost,
        alpha: 0,
        scaleX: wave.scaleX * 1.6,
        scaleY: wave.scaleY * 0.7,
        duration: 150,
        onComplete: () => ghost.destroy()
      });

      // ar sendo empurrado pros lados: 2 tiras brancas em "V" que ficam pra trás
      [-1, 1].forEach((side) => {
        const lx = wave.x - dir.x * 10 * FX_SIZE + perpX * side * 14 * FX_SIZE;
        const ly = wave.y - dir.y * 10 * FX_SIZE + perpY * side * 14 * FX_SIZE;
        const line = additive(scene.add.image(lx, ly, 'hit_fx'), 14, 1.2 * FX_SIZE, 0.07, 0.8 * wave.alpha).setRotation(
          angle + side * 0.42
        );
        scene.tweens.add({
          targets: line,
          x: lx + perpX * side * 26 * FX_SIZE - dir.x * 10 * FX_SIZE,
          y: ly + perpY * side * 26 * FX_SIZE - dir.y * 10 * FX_SIZE,
          alpha: 0,
          scaleX: 1.9 * FX_SIZE,
          duration: 170,
          ease: 'Cubic.easeOut',
          onComplete: () => line.destroy()
        });
      });
    }
  });

  if (!evolved) return;

  // raios estalando ao redor da onda: saem do corpo pros lados, inclinados
  // pra trás (o vento varre), ficam no mundo e somem = rastro elétrico
  const crackle = scene.time.addEvent({
    delay: 42,
    loop: true,
    callback: () => {
      if (!wave.active) {
        crackle.remove(false);
        return;
      }
      const g = boltLayer(scene, 19);
      const n = Phaser.Math.Between(1, 2);
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const along = rand(-18, 10);
        const bx = wave.x + dir.x * along + perpX * side * rand(2, 10);
        const by = wave.y + dir.y * along + perpY * side * rand(2, 10);
        const out = angle + side * Phaser.Math.DegToRad(Phaser.Math.Between(70, 130));
        boltFrom(g, bx, by, out, rand(12, 28), 4, 4, 1, wave.alpha, 0.35);
      }
      // de vez em quando um arco salta à frente da ponta
      if (Math.random() < 0.25) {
        boltFrom(g, wave.x + dir.x * 14, wave.y + dir.y * 14, angle + rand(-0.5, 0.5), rand(14, 26), 4, 3.5, 1, wave.alpha);
      }
      fadeAndDestroy(scene, g, 110);
      if (Math.random() < 0.6) {
        spawnSparks(scene, wave.x + dir.x * rand(-12, 8), wave.y + dir.y * rand(-12, 8), 1, {
          angle: angle + Math.PI,
          spread: 1.4,
          dist: [14, 30],
          life: [160, 280],
          depth: 19
        });
      }
    }
  });
}

// -------------------------------------------------------------- impacto
// Clarão + 2 anéis de pressão + linhas radiais + o estouro do soco por cima.
// `small` = batida na parede / fim do alcance (sem tremor, tudo menor).
export function spawnShockwaveHitFx(scene, x, y, angle, { small = false, evolved = false, radius = 70 } = {}) {
  const k = (small ? 0.55 : 1) * FX_SIZE;
  const ringKey = ensureRingTexture(scene);
  // evolução (explosão cheia): os anéis de ar crescem até perto do raio real
  const evoBlast = evolved && !small;
  const vr = radius * EXPLOSION_VISUAL_FACTOR; // raio visual da explosão
  const ringFinals = evoBlast ? [(vr * 1.35) / 52, (vr * 1.9) / 52] : [2.2 * k, 3.2 * k];

  const flash = additive(scene.add.image(x, y, 'hit_fx'), 22, 1.2 * k, 1.2 * k, 0.95);
  scene.tweens.add({
    targets: flash,
    scale: 2.6 * k,
    alpha: 0,
    duration: 140,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  [0, 60].forEach((delay, i) => {
    const ring = additive(scene.add.image(x, y, ringKey), 21, 0.3 * k, 0.3 * k, 0).setRotation(angle);
    scene.tweens.add({
      targets: ring,
      delay,
      scale: ringFinals[i],
      duration: 230,
      ease: 'Cubic.easeOut',
      onStart: () => ring.setAlpha(i === 0 ? 0.85 : 0.5),
      onUpdate: (t) => ring.setAlpha((i === 0 ? 0.85 : 0.5) * (1 - t.progress)),
      onComplete: () => ring.destroy()
    });
  });

  // linhas radiais de ar deslocado (mais pra frente do que pra trás)
  const lines = small ? 6 : 12;
  for (let i = 0; i < lines; i++) {
    const a = angle + Phaser.Math.FloatBetween(-2.1, 2.1);
    const dist = Phaser.Math.Between(30, 62) * k;
    const line = additive(
      scene.add.image(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 'hit_fx'),
      21,
      Phaser.Math.FloatBetween(0.9, 1.5),
      0.07,
      0.9
    ).setRotation(a);
    scene.tweens.add({
      targets: line,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      scaleX: 0.4,
      duration: Phaser.Math.Between(150, 230),
      ease: 'Cubic.easeOut',
      onComplete: () => line.destroy()
    });
  }

  if (hasPunchFx(scene)) playPunchFx(scene, { x, y, size: 2.4 * k, durationMs: 140, depth: 23 });

  if (evoBlast) {
    // a própria onda estoura: o corpo branco se estica pra frente e some,
    // ligando o voo à explosão (mesma arte, mesmo ângulo, mesma escala)
    const flare = scene.add
      .image(x, y, SHOCKWAVE_EVO_KEY, 0)
      .setOrigin(SHOCKWAVE_ORIGIN_X, SHOCKWAVE_ORIGIN_Y)
      .setRotation(angle)
      .setDepth(22)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTintFill(0xffffff)
      .setScale(WAVE_VISUAL_SCALE, WAVE_VISUAL_SCALE)
      .setAlpha(0.9);
    scene.tweens.add({
      targets: flare,
      scaleX: WAVE_VISUAL_SCALE * 1.7,
      scaleY: WAVE_VISUAL_SCALE * 0.55,
      alpha: 0,
      duration: 130,
      ease: 'Cubic.easeOut',
      onComplete: () => flare.destroy()
    });
    playExplosionSprite(scene, x, y, vr);
    playImpactElectricity(scene, x, y, vr, angle);
    spawnSparks(scene, x, y, 10, { angle, spread: 2.2, dist: [vr * 0.5, vr * 1.3], life: [180, 340] });
    scene.cameras.main.shake(100, 0.005);
    return;
  }
  if (evolved) playSmallElectricity(scene, x, y, angle);
  if (!small) scene.cameras.main.shake(80, 0.004);
}

// fim do alcance: o ar se desfaz em um anel e 3 arcos de vento
export function spawnShockwaveFadeFx(scene, x, y, angle, { evolved = false } = {}) {
  const ring = additive(scene.add.image(x, y, ensureRingTexture(scene)), 18, 0.3 * FX_SIZE, 0.8 * FX_SIZE, 0.6).setRotation(angle);
  scene.tweens.add({
    targets: ring,
    scaleX: 0.8 * FX_SIZE,
    scaleY: 1.8 * FX_SIZE,
    alpha: 0,
    duration: 200,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });
  if (evolved) playSmallElectricity(scene, x, y, angle);
}
