// Cortes procedurais (sem PNG): em vez de tocar uma folha de frames, cada
// corte é DESENHADO a cada quadro por código — uma lâmina de luz que varre o
// arco (cabeça afiada na frente, cauda que some atrás), deixa uma fenda
// brilhante no ar e solta partículas enquanto passa.
//
//  • 'red'  → Dança de Cortes: lâmina carmesim/branca, fenda que "abre",
//             pétalas/brasas, golpe final com linha de iaido + onda de choque.
//  • 'blue' → Cyberus: arco de ELETRICIDADE (serrilhado, treme a cada quadro),
//             aberração cromática, ramificações de raio, pixels digitais e
//             glitch de faixas horizontais.
//
// As funções de acerto (spawnDanceHitFx / spawnCyberHitFx) desenham o corte
// ATRAVESSANDO o inimigo, pra o golpe parecer que realmente fatiou.

const ADD = () => Phaser.BlendModes.ADD;

// limite de efeitos de acerto simultâneos (combos em hordas não pesam)
let activeHitFx = 0;
const MAX_HIT_FX = 36;

// ───────────────────────── helpers de desenho ─────────────────────────

// Crescente (lâmina) preenchido em tiras de triângulos, de f0 a f1 do
// arco a0→a1. Perfil: ponta fina na cauda, parte mais grossa perto da
// cabeça e ponta afiada na cabeça.
function fillCrescent(g, color, alpha, a0, a1, f0, f1, R, thick, steps = 18) {
  if (f1 - f0 < 0.008 || alpha <= 0.01 || thick <= 0.1) return;
  g.fillStyle(color, alpha);
  let po = null;
  let pi = null;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = a0 + (a1 - a0) * (f0 + (f1 - f0) * u);
    const w = thick * Math.sin(Math.PI * Math.pow(u, 1.7));
    const ro = R + w * 0.4;
    const ri = R - w * 0.6;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const o = { x: cos * ro, y: sin * ro };
    const n = { x: cos * ri, y: sin * ri };
    if (po) {
      g.fillTriangle(po.x, po.y, o.x, o.y, pi.x, pi.y);
      g.fillTriangle(pi.x, pi.y, o.x, o.y, n.x, n.y);
    }
    po = o;
    pi = n;
  }
}


// Lua crescente de katana: a borda EXTERNA fica no círculo de raio R (o fio
// da lâmina, nítido) e a borda INTERNA recua pelo perfil de espessura, que é
// fixo no arco inteiro (gordo no meio, pontas finas) — o que muda é só o
// trecho visível [f0,f1], então o corte "revela" a lua em vez de arrastar
// uma faixa de largura constante. `thick` em px; `edge` afina as pontas da
// janela visível (cabeça afiada, cauda fina).
function fillMoon(g, color, alpha, a0, a1, f0, f1, R, thick, steps = 28) {
  if (f1 - f0 < 0.01 || alpha <= 0.01 || thick <= 0.1) return;
  g.fillStyle(color, alpha);
  let po = null;
  let pi = null;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps; // posição dentro da janela visível
    const f = f0 + (f1 - f0) * u; // posição no arco inteiro
    const a = a0 + (a1 - a0) * f;
    const body = Math.pow(Math.sin(Math.PI * f), 0.85); // gordo no meio
    const head = Math.min(1, (1 - u) / 0.14); // ponta afiada na cabeça
    const tail = Math.min(1, u / 0.3); // cauda fina
    const w = thick * body * Math.max(0, Math.min(head, 1)) * Math.pow(tail, 0.8);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const o = { x: cos * R, y: sin * R };
    const n = { x: cos * (R - w), y: sin * (R - w) };
    if (po) {
      g.fillTriangle(po.x, po.y, o.x, o.y, pi.x, pi.y);
      g.fillTriangle(pi.x, pi.y, o.x, o.y, n.x, n.y);
    }
    po = o;
    pi = n;
  }
}

function strokeArc(g, color, alpha, width, a0, a1, f0, f1, r, steps = 16) {
  if (f1 - f0 < 0.008 || alpha <= 0.01 || width <= 0.1) return;
  g.lineStyle(width, color, alpha);
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (f0 + (f1 - f0) * (i / steps));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
}

// Faixa reta com as duas pontas afiadas (linha de corte / fenda).
function fillBlade(g, color, alpha, x1, y1, x2, y2, halfWidth) {
  if (alpha <= 0.01 || halfWidth <= 0.05) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * halfWidth;
  const ny = (dx / len) * halfWidth;
  const mx = x1 + dx * 0.5;
  const my = y1 + dy * 0.5;
  g.fillStyle(color, alpha);
  g.fillTriangle(x1, y1, mx + nx, my + ny, x2, y2);
  g.fillTriangle(x1, y1, mx - nx, my - ny, x2, y2);
}

function polyline(g, pts, color, alpha, width, ox = 0, oy = 0) {
  if (pts.length < 2 || alpha <= 0.01) return;
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x + ox, pts[0].y + oy);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + ox, pts[i].y + oy);
  g.strokePath();
}

// raio serrilhado de (x,y) na direção `angle`
function jaggedBolt(x, y, angle, length, segments, jitter) {
  const pts = [{ x, y }];
  const px = -Math.sin(angle);
  const py = Math.cos(angle);
  for (let i = 1; i <= segments; i++) {
    const d = (length * i) / segments;
    const j = i === segments ? 0 : Phaser.Math.FloatBetween(-jitter, jitter);
    pts.push({ x: x + Math.cos(angle) * d + px * j, y: y + Math.sin(angle) * d + py * j });
  }
  return pts;
}

const rnd = (a, b) => Phaser.Math.FloatBetween(a, b);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ═══════════════════════════ DANÇA DE CORTES ═══════════════════════════

// Plano visual de cada corte do combo: cada golpe tem a PRÓPRIA direção
// (psi, em graus, relativo à mira base), comprimento e espessura — assim os
// cortes se cruzam em ângulos diferentes e leem como vários golpes
// distintos, não um único arco mudando de posição.
const DANCE_PLAN = [
  { psi: -30, len: 1.0, th: 1.0 },
  { psi: 36, len: 1.1, th: 0.9 },
  { psi: 4, len: 0.95, th: 1.1 },
  { psi: -38, len: 1.05, th: 0.95 },
  { psi: 26, len: 1.0, th: 1.0 },
  { psi: -6, len: 1.12, th: 0.9 }
];

export function danceCutPlan(index = 0) {
  return DANCE_PLAN[Math.abs(Math.floor(index)) % DANCE_PLAN.length];
}

export function playDanceCut(scene, opts) {
  if (opts.finisher) return playDanceFinisher(scene, opts);
  return playDanceSlash(scene, opts);
}

// Corte comum da Dança: um talho reto/levemente curvo e AFIADO que atravessa
// a frente do jogador num ângulo próprio, estala, e deixa uma fenda de luz
// no ar que demora a fechar — enquanto os cortes seguintes a cruzam.
function playDanceSlash(scene, { x, y, angle, baseAngle, swingIndex = 0, range, durationMs = 200, flip = false, depth = 20 }) {
  const Ease = Phaser.Math.Easing;
  const plan = danceCutPlan(swingIndex);
  const dir = flip ? -1 : 1;
  const psi = (baseAngle ?? angle) + Phaser.Math.DegToRad(plan.psi);

  // arco achatado (raio grande): lê como talho de lâmina, não como meia-lua
  const Rc = range * 1.8;
  const mid = range * 0.66;
  const cx = x + Math.cos(psi) * (mid - Rc);
  const cy = y + Math.sin(psi) * (mid - Rc);
  // meia-corda ~0.78*range*len → ângulo que cobre isso nesse raio grande
  const half = Math.asin(Math.min(0.95, (0.78 * range * plan.len) / Rc));
  const a0 = psi - dir * half;
  const a1 = psi + dir * half;
  const thick = range * 0.2 * plan.th;

  const g = scene.add.graphics({ x: cx, y: cy }).setDepth(depth).setBlendMode(ADD());

  // pontos do talho (pra faíscas, clarão central e pontas)
  const at = (f, r = Rc) => {
    const a = a0 + (a1 - a0) * f;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, a };
  };
  const startPt = at(0);
  const midPt = at(0.5);
  const endPt = at(1);

  // clarão no ponto onde o corte nasce
  const flash = scene.add.circle(cx + startPt.x, cy + startPt.y, range * 0.06, 0xffffff, 0.95).setDepth(depth + 1).setBlendMode(ADD());
  scene.tweens.add({ targets: flash, scale: 2.4, alpha: 0, duration: 110, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });

  const total = durationMs * 1.75; // a fenda dura mais que o corte
  const sparkColors = [0xff2b4a, 0xffffff, 0xff7a90];
  let lastH = 0;
  let popped = false;

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: total,
    onUpdate: (tween) => {
      const p = tween.getValue();
      const h = Ease.Cubic.Out(clamp01(p / 0.2)); // talho muito rápido
      const t = Math.min(h, Math.pow(clamp01((p - 0.1) / 0.45), 1.3)); // cauda apaga logo
      const bladeFade = clamp01(1 - Math.pow(clamp01((p - 0.22) / 0.4), 1.4));
      g.clear();

      // lâmina: lua fina e afiada, ancorada no fio
      if (bladeFade > 0.02) {
        fillMoon(g, 0x7a0014, 0.5 * bladeFade, a0, a1, t, h, Rc * 1.03, thick * 1.15, 22);
        fillMoon(g, 0xff1f3d, 0.95 * bladeFade, a0, a1, t, h, Rc, thick, 22);
        fillMoon(g, 0xff8fa3, 1.0 * bladeFade, a0, a1, t, h, Rc, thick * 0.5, 22);
        fillMoon(g, 0xffffff, 1.0 * bladeFade, a0, a1, t, h, Rc, thick * 0.16, 22);
      }

      // fenda de luz que fica no ar: o que já foi cortado brilha e vai fechando
      const life = Math.pow(1 - p, 1.15);
      const flicker = 0.85 + Math.random() * 0.15;
      strokeArc(g, 0xff1f3d, 0.5 * life * flicker, 5.5 * life + 1, a0, a1, 0, h, Rc, 20);
      strokeArc(g, 0xff9aab, 0.9 * life * flicker, 2.4 * life + 0.6, a0, a1, 0, h, Rc, 20);
      strokeArc(g, 0xffffff, 1.0 * life * flicker, 1.1, a0, a1, 0, h, Rc, 20);

      // estalo: cruz fina de brilho no meio da fenda quando o corte "pega"
      if (!popped && h > 0.5) popped = true;
      if (popped && p < 0.42) {
        const q = clamp01((p - 0.1) / 0.32);
        const k = (1 - q) * (1 - q);
        const len = range * 0.55 * Ease.Cubic.Out(clamp01(q * 2.2));
        const tx = -Math.sin(psi);
        const ty = Math.cos(psi);
        fillBlade(g, 0xffffff, 0.9 * k, midPt.x - tx * len, midPt.y - ty * len, midPt.x + tx * len, midPt.y + ty * len, 1.6 * k + 0.2);
        fillBlade(g, 0xff7a90, 0.7 * k, midPt.x - Math.cos(psi) * len * 0.3, midPt.y - Math.sin(psi) * len * 0.3, midPt.x + Math.cos(psi) * len * 0.3, midPt.y + Math.sin(psi) * len * 0.3, 1.2 * k + 0.2);
      }

      // pontas da fenda: pequenos riscos que "racham" pra fora
      if (p > 0.15 && p < 0.7) {
        const k = 1 - clamp01((p - 0.15) / 0.55);
        for (const e of [startPt, endPt]) {
          const ea = e.a + (e === startPt ? -dir : dir) * 0.12;
          fillBlade(g, 0xff9aab, 0.7 * k, e.x, e.y, e.x + Math.cos(ea) * 12 * k, e.y + Math.sin(ea) * 12 * k, 1.2);
        }
      }

      // faíscas de aço saindo da cabeça
      const dh = h - lastH;
      lastH = h;
      const emit = Math.round(dh * 9 + Math.random() * 0.3);
      for (let i = 0; i < emit; i++) {
        const f = Phaser.Math.FloatBetween(Math.max(0, h - 0.12), h);
        const pt = at(f);
        const px = cx + pt.x;
        const py = cy + pt.y;
        const tang = pt.a + (Math.PI / 2) * dir;
        const va = tang + rnd(-0.5, 0.5);
        const dist = rnd(12, 34);
        const sp = scene.add
          .image(px, py, 'hit_fx')
          .setDepth(depth + 2)
          .setBlendMode(ADD())
          .setTint(sparkColors[i % 3])
          .setScale(rnd(0.05, 0.11), rnd(0.02, 0.04))
          .setRotation(va);
        scene.tweens.add({
          targets: sp,
          x: px + Math.cos(va) * dist,
          y: py + Math.sin(va) * dist,
          alpha: 0,
          duration: Phaser.Math.Between(140, 260),
          ease: 'Cubic.easeOut',
          onComplete: () => sp.destroy()
        });
      }
    },
    onComplete: () => g.destroy()
  });

  return g;
}

function playDanceFinisher(scene, { x, y, angle, range, durationMs = 200, flip = false, depth = 20, finisher = false, arcDegrees }) {
  const Ease = Phaser.Math.Easing;
  // corte de katana: arco largo (a lua cobre bem mais que o leque de dano)
  const half = Phaser.Math.DegToRad(Math.max(arcDegrees ?? 110, 120) + (finisher ? 40 : 30)) / 2;
  const dir = flip ? -1 : 1;
  const a0 = angle - dir * half; // o corte começa deste lado…
  const a1 = angle + dir * half; // …e termina neste

  const R = range * 0.96; // fio da lâmina
  const thick = range * (finisher ? 0.62 : 0.5); // quanto a lua "morde" pra dentro
  const lunge = range * (finisher ? 0.16 : 0.1);
  const fwdX = Math.cos(angle);
  const fwdY = Math.sin(angle);

  const g = scene.add.graphics({ x, y }).setDepth(depth).setBlendMode(ADD());

  // clarão curto onde o corte nasce
  const sx = x + Math.cos(a0) * R * 0.9;
  const sy = y + Math.sin(a0) * R * 0.9;
  const flash = scene.add.circle(sx, sy, range * 0.07, 0xffffff, 0.9).setDepth(depth + 1).setBlendMode(ADD());
  scene.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: durationMs * 0.4, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });

  let lastH = 0;
  let ringDone = false;
  const total = durationMs * (finisher ? 1.05 : 1.2);
  const sparkColors = [0xff2b4a, 0xffffff, 0xff7a90];

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: total,
    onUpdate: (tween) => {
      const p = tween.getValue();
      // a lâmina passa RÁPIDO (primeiros ~28%) e a lua fica um instante
      // antes da cauda alcançar a cabeça e apagar
      const h = Ease.Cubic.Out(clamp01(p / 0.28));
      const t = Math.min(h - 0.0, Math.pow(clamp01((p - 0.22) / 0.78), 1.35));
      const fade = p < 0.4 ? 1 : 1 - Math.pow((p - 0.4) / 0.6, 1.5);

      const lg = lunge * Ease.Cubic.Out(clamp01(p / 0.5));
      g.setPosition(x + fwdX * lg, y + fwdY * lg);
      g.clear();

      // rastro de movimento: lua maior, escura, um pouco atrás da cabeça
      fillMoon(g, 0x7a0014, 0.35 * fade, a0, a1, Math.max(0, t - 0.04), Math.max(0, h - 0.06), R * 1.045, thick * 1.1);

      // lua em camadas ancoradas no fio: vinho → vermelho → rosa → branco
      fillMoon(g, 0xb30a22, 0.85 * fade, a0, a1, t, h, R, thick);
      fillMoon(g, 0xff1f3d, 0.95 * fade, a0, a1, t, h, R, thick * 0.72);
      fillMoon(g, 0xff7a90, 1.0 * fade, a0, a1, t, h, R, thick * 0.4);
      fillMoon(g, 0xffffff, 1.0 * fade, a0, a1, t, h, R, thick * 0.14);

      // fio branco da lâmina (linha fina na borda externa)
      strokeArc(g, 0xffffff, 0.95 * fade, 1.6, a0, a1, t + (h - t) * 0.1, h, R, 24);

      // riscos de velocidade finos, paralelos ao fio (dão sensação de aço cortando)
      if (p < 0.6) {
        strokeArc(g, 0xffd0d8, 0.55 * fade, 1, a0, a1, Math.max(0, h - 0.34), h, R * 1.1, 14);
        strokeArc(g, 0xff4d6a, 0.4 * fade, 1, a0, a1, Math.max(0, h - 0.22), h - 0.02, R * 1.17, 12);
      }

      // brilho na ponta (só um ponto, sem cruz girando)
      if (p < 0.5) {
        const ha = a0 + (a1 - a0) * h;
        g.fillStyle(0xffffff, 0.95 * fade);
        g.fillCircle(Math.cos(ha) * R, Math.sin(ha) * R, Math.max(1.2, range * 0.035 * (1 - p)));
      }

      // golpe final: linha reta de iaido atravessando o arco, fina e nítida
      if (finisher && p > 0.1 && p < 0.65) {
        const q = (p - 0.1) / 0.55;
        const ext = Ease.Cubic.Out(clamp01(q * 2.6));
        const wq = Math.sin(Math.PI * clamp01(q * 1.1)) * (1 - q * 0.5);
        const bx1 = -fwdX * range * 0.3 - fwdX * lg;
        const by1 = -fwdY * range * 0.3 - fwdY * lg;
        const bx2 = fwdX * range * 1.6 * ext - fwdX * lg;
        const by2 = fwdY * range * 1.6 * ext - fwdY * lg;
        fillBlade(g, 0xff1f3d, 0.55 * (1 - q), bx1, by1, bx2, by2, 7 * wq);
        fillBlade(g, 0xff9aab, 0.95 * (1 - q), bx1, by1, bx2, by2, 3.2 * wq);
        fillBlade(g, 0xffffff, 1 * (1 - q), bx1, by1, bx2, by2, 1.4 * wq);
      }

      if (finisher && !ringDone && p > 0.28) {
        ringDone = true;
        const ring = scene.add.circle(x + fwdX * lunge, y + fwdY * lunge, range * 0.3).setDepth(depth - 1).setBlendMode(ADD());
        ring.setStrokeStyle(3, 0xff3355, 0.85);
        scene.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 340, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      }

      // faíscas de aço: poucas e rápidas, saindo do fio (tangente)
      const dh = h - lastH;
      lastH = h;
      const emit = Math.round(dh * (finisher ? 16 : 9) + Math.random() * 0.4);
      for (let i = 0; i < emit; i++) {
        const f = Phaser.Math.FloatBetween(Math.max(0, h - 0.1), h);
        const a = a0 + (a1 - a0) * f;
        const px = x + fwdX * lg + Math.cos(a) * R;
        const py = y + fwdY * lg + Math.sin(a) * R;
        const tang = a + (Math.PI / 2) * dir;
        const va = tang + rnd(-0.45, 0.45);
        const dist = rnd(14, finisher ? 48 : 34);
        const sp = scene.add
          .image(px, py, 'hit_fx')
          .setDepth(depth + 2)
          .setBlendMode(ADD())
          .setTint(sparkColors[i % 3])
          .setScale(rnd(0.05, 0.12), rnd(0.02, 0.04))
          .setRotation(va);
        scene.tweens.add({
          targets: sp,
          x: px + Math.cos(va) * dist,
          y: py + Math.sin(va) * dist,
          alpha: 0,
          duration: Phaser.Math.Between(150, 280),
          ease: 'Cubic.easeOut',
          onComplete: () => sp.destroy()
        });
      }
    },
    onComplete: () => g.destroy()
  });

  return g;
}

// Acerto da Dança de Cortes: o inimigo é ATRAVESSADO por um risco que se
// abre (duas metades se afastando), com clarão e gotas/brasas carmesim.
export function spawnDanceHitFx(scene, x, y, angle, finisher = false) {
  if (activeHitFx >= MAX_HIT_FX) return;
  activeHitFx += 1;

  // o risco acompanha a tangente do corte, levemente torto (nunca igual)
  const cut = angle + Math.PI / 2 + rnd(-0.2, 0.2);
  const len = (finisher ? 46 : 32) + rnd(-4, 6);
  const cx = Math.cos(cut);
  const cy = Math.sin(cut);
  const nx = -cy;
  const ny = cx;

  const g = scene.add.graphics({ x, y }).setDepth(23).setBlendMode(ADD());
  const dur = finisher ? 360 : 280;

  const flash = scene.add.circle(x, y, finisher ? 11 : 8, 0xffffff, 0.95).setDepth(24).setBlendMode(ADD());
  scene.tweens.add({
    targets: flash,
    scale: finisher ? 3.4 : 2.4,
    alpha: 0,
    duration: 170,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: dur,
    onUpdate: (tween) => {
      const p = tween.getValue();
      const open = Phaser.Math.Easing.Cubic.Out(p) * (finisher ? 7 : 5); // fenda se abrindo
      const a = Math.pow(1 - p, 1.3);
      const w = (finisher ? 5 : 3.6) * (1 - p * 0.6);
      const ext = len * (0.55 + 0.45 * Phaser.Math.Easing.Cubic.Out(clamp01(p * 3)));
      g.clear();
      for (const side of [-1, 1]) {
        const ox = nx * open * side;
        const oy = ny * open * side;
        fillBlade(g, 0xff1f3d, 0.55 * a, ox - cx * ext, oy - cy * ext, ox + cx * ext, oy + cy * ext, w * 1.8);
        fillBlade(g, 0xffffff, 0.95 * a, ox - cx * ext, oy - cy * ext, ox + cx * ext, oy + cy * ext, w * 0.7);
      }
      // brilho vermelho vazando de dentro da fenda
      fillBlade(g, 0xff2b4a, 0.8 * a, -cx * ext, -cy * ext, cx * ext, cy * ext, open * 0.9 + 0.5);
    },
    onComplete: () => {
      g.destroy();
      activeHitFx -= 1;
    }
  });

  // gotas/brasas escorrendo pelos dois lados do risco
  const count = finisher ? 12 : 7;
  for (let i = 0; i < count; i++) {
    const sign = i % 2 ? 1 : -1;
    const along = rnd(-len * 0.8, len * 0.8);
    const sx = x + cx * along;
    const sy = y + cy * along;
    const va = Math.atan2(ny * sign, nx * sign) + rnd(-0.7, 0.7);
    const dist = rnd(14, finisher ? 52 : 36);
    const bit = scene.add
      .image(sx, sy, 'hit_fx')
      .setDepth(23)
      .setBlendMode(ADD())
      .setTint(i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xff2b4a : 0xff7a90)
      .setScale(rnd(0.09, finisher ? 0.26 : 0.19))
      .setRotation(va);
    scene.tweens.add({
      targets: bit,
      x: sx + Math.cos(va) * dist,
      y: sy + Math.sin(va) * dist + rnd(0, 10), // cai um pouco
      alpha: 0,
      scale: bit.scale * 0.25,
      duration: Phaser.Math.Between(240, 420),
      ease: 'Cubic.easeOut',
      onComplete: () => bit.destroy()
    });
  }
}

// ═══════════════════════════════ CYBERUS ═══════════════════════════════

export function playCyberCut(scene, { x, y, angle, range, durationMs = 200, flip = false, depth = 20, arcDegrees }) {
  const Ease = Phaser.Math.Easing;
  const half = Phaser.Math.DegToRad(Math.max(arcDegrees ?? 105, 100) + 30) / 2; // arco largo, de corte de verdade
  const dir = flip ? -1 : 1;
  const a0 = angle - dir * half;
  const a1 = angle + dir * half;

  const R = range * 0.8;
  const s = Math.max(0.75, range / 90); // escala de espessura
  const amp = range * 0.06; // quanto o raio "treme" (menos que antes: o arco continua legível como corte)
  const fwdX = Math.cos(angle);
  const fwdY = Math.sin(angle);
  const lunge = range * 0.1;

  const g = scene.add.graphics({ x, y }).setDepth(depth).setBlendMode(ADD());

  // anel de choque elétrico no atacante
  const ring = scene.add.circle(x, y, range * 0.22).setDepth(depth - 1).setBlendMode(ADD());
  ring.setStrokeStyle(2, 0x2ee6ff, 0.9);
  scene.tweens.add({
    targets: ring,
    scale: 2.8,
    alpha: 0,
    duration: 230,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy()
  });

  // estado que "treme": recalculado a cada 2 quadros pra parecer faísca,
  // não ruído suave
  let frame = 0;
  let jag = []; // pontos da fileira serrilhada (fração f, desvio radial)
  let forks = [];
  let pixels = [];
  let slices = [];
  const JAG_N = 24;

  const reroll = (h, t) => {
    jag = [];
    for (let i = 0; i <= JAG_N; i++) {
      const u = i / JAG_N;
      const edge = i === 0 || i === JAG_N ? 0 : 1;
      jag.push({ u, off: edge * rnd(-amp, amp) * (0.5 + Math.sin(Math.PI * u)) });
    }
    forks = [];
    const nForks = Phaser.Math.Between(2, 4);
    for (let i = 0; i < nForks; i++) {
      forks.push({
        u: rnd(0.15, 0.95),
        spread: rnd(-0.9, 0.9),
        len: rnd(10, 26) * s,
        side: Math.random() < 0.7 ? 1 : -1
      });
    }
    pixels = [];
    const nPix = Phaser.Math.Between(5, 9);
    for (let i = 0; i < nPix; i++) {
      pixels.push({
        u: rnd(0, 1),
        out: rnd(2, 26) * s,
        size: Phaser.Math.Between(2, 5),
        color: [0x2ee6ff, 0xffffff, 0x7a5cff, 0x2ee6ff][i % 4]
      });
    }
    slices = [];
    const nSl = Phaser.Math.Between(1, 3);
    for (let i = 0; i < nSl; i++) {
      slices.push({
        u: rnd(0.1, 1),
        dx: rnd(-14, 14),
        dy: rnd(-12, 12),
        w: rnd(16, 44) * s,
        color: Math.random() < 0.5 ? 0xff2bd6 : 0x2ee6ff
      });
    }
  };

  const total = durationMs * 1.3;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: total,
    onUpdate: (tween) => {
      const p = tween.getValue();
      const h = Ease.Quadratic.Out(clamp01(p / 0.32)); // varre rápido, estalado
      const tp = clamp01((p - 0.08) / 0.92);
      const t = Math.min(h, Math.pow(tp, 1.25));
      // pisca: alpha oscila (flicker de energia instável)
      const flick = 0.8 + Math.random() * 0.2;
      const fade = (p < 0.5 ? 1 : 1 - Math.pow((p - 0.5) / 0.5, 1.6)) * flick;

      if (frame % 2 === 0) reroll(h, t);
      frame += 1;

      const lg = lunge * Ease.Cubic.Out(clamp01(p / 0.45));
      g.setPosition(x + fwdX * lg, y + fwdY * lg);
      g.clear();

      // pontos do raio ao longo do trecho visível [t, h]
      const pts = jag.map((j) => {
        const f = t + (h - t) * j.u;
        const a = a0 + (a1 - a0) * f;
        const r = R + j.off;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, a, r };
      });

      // massa escura/azul atrás (dá corpo ao raio)
      fillCrescent(g, 0x0a2cff, 0.28 * fade, a0, a1, t, h, R, range * 0.3);
      fillCrescent(g, 0x2ee6ff, 0.16 * fade, a0, a1, t, h, R, range * 0.18);

      // aberração cromática: fantasmas magenta / ciano deslocados
      const gl = (1 - p) * 3.2 * s;
      polyline(g, pts, 0xff2bd6, 0.55 * fade, 3 * s, gl, -gl * 0.4);
      polyline(g, pts, 0x00ffa8, 0.45 * fade, 3 * s, -gl, gl * 0.5);

      // o raio em si: brilho azul → ciano → núcleo branco
      polyline(g, pts, 0x1546ff, 0.45 * fade, 13 * s);
      polyline(g, pts, 0x2ee6ff, 0.95 * fade, 5 * s);
      polyline(g, pts, 0xffffff, 1.0 * fade, 2 * s);

      // ramificações de raio saindo do arco
      for (const f of forks) {
        const idx = Math.min(pts.length - 1, Math.floor(f.u * (pts.length - 1)));
        const base = pts[idx];
        const fa = base.a + f.spread * 0.35 + (f.side > 0 ? 0 : Math.PI * 0.0);
        const out = jaggedBolt(base.x, base.y, fa, f.len, 3, 5 * s);
        // inverte pro lado de fora do arco na maioria
        if (f.side < 0) {
          for (const pt of out) {
            pt.x = base.x + (base.x - pt.x);
            pt.y = base.y + (base.y - pt.y);
          }
        }
        polyline(g, out, 0x2ee6ff, 0.85 * fade, 2 * s);
        polyline(g, out, 0xffffff, 0.8 * fade, 1);
      }

      // pixels digitais (quadrados que "encaixam" na grade de 2px)
      for (const px of pixels) {
        const idx = Math.min(pts.length - 1, Math.floor(px.u * (pts.length - 1)));
        const base = pts[idx];
        const qx = Math.round((base.x + Math.cos(base.a) * px.out) / 2) * 2;
        const qy = Math.round((base.y + Math.sin(base.a) * px.out) / 2) * 2;
        g.fillStyle(px.color, (0.6 + Math.random() * 0.4) * fade);
        g.fillRect(qx - px.size / 2, qy - px.size / 2, px.size, px.size);
      }

      // glitch: faixas horizontais que pulam (datamosh)
      if (p < 0.7) {
        for (const sl of slices) {
          const idx = Math.min(pts.length - 1, Math.floor(sl.u * (pts.length - 1)));
          const base = pts[idx];
          g.fillStyle(sl.color, 0.75 * fade);
          g.fillRect(base.x + sl.dx - sl.w / 2, base.y + sl.dy, sl.w, 2);
        }
      }

      // centelha na ponta do raio
      if (p < 0.6) {
        const tipPt = pts[pts.length - 1];
        g.fillStyle(0xffffff, fade);
        g.fillRect(tipPt.x - 3, tipPt.y - 3, 6, 6);
        g.fillStyle(0x2ee6ff, 0.5 * fade);
        g.fillRect(tipPt.x - 6, tipPt.y - 1, 12, 2);
        g.fillRect(tipPt.x - 1, tipPt.y - 6, 2, 12);
      }
    },
    onComplete: () => g.destroy()
  });

  return g;
}

// Acerto do corte do Cyberus: descarga elétrica no alvo — raios radiais
// que piscam, clarão quadrado e pixels que voam em passos (estilo digital).
export function spawnCyberHitFx(scene, x, y, angle) {
  if (activeHitFx >= MAX_HIT_FX) return;
  activeHitFx += 1;

  const g = scene.add.graphics({ x, y }).setDepth(24).setBlendMode(ADD());
  const bolts = Phaser.Math.Between(5, 7);
  const baseA = rnd(0, Math.PI * 2);
  const specs = [];
  for (let i = 0; i < bolts; i++) {
    specs.push({
      a: baseA + (i / bolts) * Math.PI * 2 + rnd(-0.3, 0.3),
      len: rnd(18, 40),
      forward: i === 0
    });
  }
  // um raio sempre segue a direção do corte
  specs[0].a = angle;
  specs[0].len = rnd(34, 52);

  const draw = (alpha) => {
    g.clear();
    for (const b of specs) {
      const pts = jaggedBolt(0, 0, b.a, b.len, 4, 6);
      polyline(g, pts, 0x1546ff, 0.5 * alpha, 7);
      polyline(g, pts, 0x2ee6ff, 0.95 * alpha, 3);
      polyline(g, pts, 0xffffff, alpha, 1.2);
    }
  };

  // clarão quadrado (digital) + círculo de choque
  const sq = scene.add.rectangle(x, y, 14, 14, 0xffffff, 0.95).setDepth(25).setBlendMode(ADD()).setRotation(Math.PI / 4);
  scene.tweens.add({
    targets: sq,
    scale: 2.4,
    alpha: 0,
    duration: 190,
    ease: 'Cubic.easeOut',
    onComplete: () => sq.destroy()
  });
  const ringHit = scene.add.circle(x, y, 8).setDepth(24).setBlendMode(ADD());
  ringHit.setStrokeStyle(2, 0x2ee6ff, 0.9);
  scene.tweens.add({
    targets: ringHit,
    scale: 3.6,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => ringHit.destroy()
  });

  // os raios re-sorteiam o formato ~3 vezes (tremida) e somem
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 240,
    onUpdate: (tween) => {
      const p = tween.getValue();
      if (Math.random() < 0.6) draw(1 - p * p);
    },
    onComplete: () => {
      g.destroy();
      activeHitFx -= 1;
    }
  });
  draw(1);

  // pixels voando em passos
  for (let i = 0; i < 9; i++) {
    const a = rnd(0, Math.PI * 2);
    const dist = rnd(16, 48);
    const size = Phaser.Math.Between(2, 5);
    const bit = scene.add
      .rectangle(x, y, size, size, [0x2ee6ff, 0xffffff, 0x7a5cff][i % 3], 1)
      .setDepth(24)
      .setBlendMode(ADD());
    scene.tweens.add({
      targets: bit,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      duration: Phaser.Math.Between(220, 360),
      ease: 'Stepped',
      easeParams: [5],
      onComplete: () => bit.destroy()
    });
  }
}
