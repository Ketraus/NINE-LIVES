// FÚRIA do Minotauro depois do Salto de Perseguição ("ele ficou puto porque eu fugi").
// Só visual — velocidade, cooldowns e dano continuam no Minotaur.js (leapAggroUntil).
//
// Dois momentos:
//  - RUGIDO (playMinotaurFuryBurst): no pouso. Clarão branco-quente, anel de choque no raio real do
//    impacto, 3 ondas de rugido saindo do peito, riscos de energia pelo chão e uma erupção de
//    chamas em volta dele.
//  - AURA (classe MinotaurFuryFx): enquanto durar a agressividade. Língua de energia subindo do corpo
//    inteiro, faíscas, arcos elétricos estalando em volta, anéis de batimento no chão, halo e poça
//    de luz sob os pés; o contorno/olhos do MinotaurGlowFx também acendem (level -> boss.furyFx.level).
//    Sobe rápido, e nos últimos ~1s vai esfriando até sumir.
//
// Tudo é pooled (objetos criados uma vez, reaproveitados) e escalonado pelo nível da fúria; no
// mobile / efeitos reduzidos os pools são menores. Cores = as do boss (fase 1 roxo, fase 2 aqua).
import SettingsManager from '../systems/SettingsManager.js';

const GLOW = 'mcleave_glow'; // textura criada por MinotaurCleaveFx.createMinotaurCleaveTextures
const FLAME_FRAME = 2; // frame da chama na folha minotaur_cleave (32x72)
const FLAME_H = 72;
const PAL = [
  { deep: 0x3a0c6e, main: 0x8a2be2, bright: 0xb56bff, pale: 0xe9c6ff, flame: 'minotaur_cleave' },
  { deep: 0x07535e, main: 0x16a99f, bright: 0x32e9d6, pale: 0xbafff1, flame: 'minotaur_cleave_rage' }
];
const WHITE = 0xffffff;
const RAISE_MS = 220; // quanto leva pra fúria "acender"
const FALL_MS = 900; // e pra apagar
const TAIL_MS = 1100; // nos últimos ms da agressividade ela já vai esfriando
const BEAT_MS = 430; // batimento (mais rápido que o do brilho normal: está irritado)

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const palFor = (boss) => PAL[boss?.isEnraged ? 1 : 0];
const isLite = (scene) => !!scene.sys.game.device.input.touch || !!SettingsManager.getReducedTerrainFx?.();
const reducedFlash = () => !!SettingsManager.getReducedFlashes?.();
const hasTex = (scene) => scene.textures.exists(GLOW);

function flameKey(scene, pal) {
  return scene.textures.exists(pal.flame) ? pal.flame : null;
}

function strokePts(g, pts, width, color, alpha) {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.strokePath();
}

// ---------------------------------------------------------------------------------------------
// AURA
// ---------------------------------------------------------------------------------------------
export default class MinotaurFuryFx {
  constructor(scene, boss) {
    this.scene = scene;
    this.boss = boss;
    this.level = 0; // 0..1, lido pelo MinotaurGlowFx
    this.live = false;
    this.lite = isLite(scene);
    this.obj = null;
    this.nextArc = 0;
    this.nextRing = 0;
    this.bolts = [];
    this.rings = [];
  }

  // remainingMs = quanto falta de agressividade (0 = fora dela)
  update(time, delta, remainingMs) {
    const target = remainingMs > 0 ? Math.min(1, remainingMs / TAIL_MS) : 0;
    const dt = Math.min(100, delta || 16);
    if (this.level < target) this.level = Math.min(target, this.level + dt / RAISE_MS);
    else this.level = Math.max(target, this.level - dt / FALL_MS);
    if (this.level <= 0.01 && target === 0) {
      this.level = 0;
      if (this.live) this._release();
      return;
    }
    const boss = this.boss;
    if (!boss.active || !boss.visible || boss.alpha <= 0.02 || this.scene.isPaused || !hasTex(this.scene)) {
      this._setVisible(false);
      return;
    }
    if (!this.live) this._build();
    this._setVisible(true);
    this._frame(time, dt);
  }

  // corta tudo na hora (transformação, morte, fuga)
  stop() {
    this.level = 0;
    if (this.live) this._release();
  }

  destroy() { this.stop(); }

  _build() {
    const scene = this.scene;
    const lite = this.lite || !!SettingsManager.getReducedMotion?.();
    const o = (this.obj = {});
    o.floor = scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD);
    o.halo = scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD);
    o.rings = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    o.arcs = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    o.flames = [];
    o.sparks = [];
    const key = flameKey(scene, palFor(this.boss));
    const nFlames = lite ? 6 : 12;
    const nSparks = lite ? 8 : 18;
    for (let i = 0; i < nFlames; i++) {
      const img = key ? scene.add.image(0, 0, key, FLAME_FRAME).setOrigin(0.5, 0.92).setBlendMode(Phaser.BlendModes.ADD).setVisible(false) : null;
      o.flames.push({ img, born: -1e9, life: 1, ox: 0, oy: 0, rise: 0, sx: 1, sy: 1, wob: 0, front: i % 3 === 0 });
    }
    for (let i = 0; i < nSparks; i++) {
      const img = scene.add.rectangle(0, 0, 3, 3, WHITE, 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      o.sparks.push({ img, born: -1e9, life: 1, ox: 0, oy: 0, vx: 0, vy: 0, size: 3 });
    }
    this.nextArc = 0;
    this.nextRing = 0;
    this.bolts = [];
    this.rings = [];
    this.live = true;
  }

  _release() {
    const o = this.obj;
    if (o) {
      o.floor.destroy(); o.halo.destroy(); o.rings.destroy(); o.arcs.destroy();
      o.flames.forEach((f) => f.img?.destroy());
      o.sparks.forEach((s) => s.img.destroy());
    }
    this.obj = null;
    this.live = false;
    this.bolts = [];
    this.rings = [];
  }

  _setVisible(v) {
    const o = this.obj;
    if (!o) return;
    o.floor.setVisible(v); o.halo.setVisible(v); o.rings.setVisible(v); o.arcs.setVisible(v);
    if (!v) {
      o.flames.forEach((f) => f.img?.setVisible(false));
      o.sparks.forEach((s) => s.img.setVisible(false));
    }
  }

  _newBolts(bodyW, bodyH) {
    const n = this.lite ? 2 : 3;
    this.bolts = [];
    for (let b = 0; b < n; b++) {
      const a = rand(0, Math.PI * 2);
      const r0 = bodyW * rand(0.45, 0.9);
      const x0 = Math.cos(a) * r0;
      const y0 = Math.sin(a) * r0 * 0.9 - bodyH * 0.05;
      const len = rand(36, 78);
      const segs = Phaser.Math.Between(3, 4);
      const pts = [{ x: x0, y: y0 }];
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        pts.push({ x: x0 + Math.cos(a) * len * t + rand(-10, 10), y: y0 + Math.sin(a) * len * t + rand(-10, 10) });
      }
      this.bolts.push(pts);
      // galho curto saindo de um ponto do meio
      if (Math.random() < 0.6) {
        const p = pts[Phaser.Math.Between(1, pts.length - 2)] || pts[1];
        const ba = a + rand(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1);
        this.bolts.push([{ x: p.x, y: p.y }, { x: p.x + Math.cos(ba) * rand(14, 26), y: p.y + Math.sin(ba) * rand(14, 26) }]);
      }
    }
  }

  _frame(time, dt) {
    const boss = this.boss;
    const o = this.obj;
    const pal = palFor(boss);
    const L = this.level;
    const fl = reducedFlash() ? 0.55 : 1;
    const H = boss.displayHeight || 80;
    const W = boss.displayWidth || 80;
    const bodyW = W * 0.34;
    const footY = boss.y + H * 0.38;
    const ph = (time % BEAT_MS) / BEAT_MS;
    const beat = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 3); // pulso seco no começo de cada ciclo

    // poça de luz sob os pés + halo atrás do corpo
    o.floor.setTint(pal.bright).setPosition(boss.x, footY).setDepth(boss.depth - 0.4)
      .setScale((W / 128) * (3.1 + 0.5 * beat), (W / 128) * (1.25 + 0.2 * beat)).setAlpha(L * (0.4 + 0.25 * beat) * fl);
    o.halo.setTint(pal.main).setPosition(boss.x, boss.y - H * 0.05).setDepth(boss.depth - 0.3)
      .setScale((H / 128) * (2.4 + 0.45 * beat)).setAlpha(L * (0.22 + 0.22 * beat) * fl);

    // anéis de batimento no chão (no máximo 2 vivos)
    if (time >= this.nextRing && this.rings.length < 2) {
      this.rings.push(time);
      this.nextRing = time + BEAT_MS * 1.5;
    }
    const g = o.rings;
    g.clear().setDepth(boss.depth - 0.35);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const p = (time - this.rings[i]) / 760;
      if (p >= 1) { this.rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - p, 2.2);
      const r = bodyW * 0.8 + W * 1.15 * e;
      g.lineStyle(Math.max(1.5, 6 * (1 - p)), p < 0.25 ? pal.pale : pal.bright, L * (1 - p) * 0.75 * fl);
      g.strokeEllipse(boss.x, footY, r * 2, r * 1.05);
    }

    // línguas de energia subindo pelo corpo (as da frente mais fracas, pra não cobrir o sprite)
    const maxFlames = Math.ceil(o.flames.length * L);
    let alive = 0;
    for (let i = 0; i < o.flames.length; i++) {
      const f = o.flames[i];
      if (!f.img) continue;
      let age = time - f.born;
      if (age >= f.life) {
        if (i < maxFlames && Math.random() < 0.12 + 0.05 * (maxFlames - alive)) {
          f.born = time; age = 0; f.life = rand(520, 920);
          f.ox = rand(-1, 1) * bodyW * 1.05;
          f.oy = rand(0.05, 0.42) * H;
          f.rise = H * rand(0.55, 1.05);
          const s = (H / FLAME_H) * rand(0.5, 0.85);
          f.sx = s * rand(0.7, 1.0); f.sy = s;
          f.wob = rand(0, 6.28);
        } else { f.img.setVisible(false); continue; }
      }
      alive++;
      const p = age / f.life;
      const env = Math.pow(Math.sin(Math.min(1, p) * Math.PI), 0.8);
      f.img.setVisible(true)
        .setPosition(boss.x + f.ox + Math.sin(time / 95 + f.wob) * 5 * p, boss.y + f.oy - f.rise * p)
        .setScale(f.sx * (1 - 0.45 * p), f.sy * (0.55 + 0.7 * Math.sin(Math.min(1, p) * Math.PI * 0.9)))
        .setRotation(Math.sin(time / 120 + f.wob) * 0.12)
        .setDepth(boss.depth + (f.front ? 0.12 : -0.08))
        .setAlpha(L * env * (f.front ? 0.55 : 0.9) * fl);
    }

    // faíscas subindo mais rápido, por cima
    const maxSparks = Math.ceil(o.sparks.length * L);
    for (let i = 0; i < o.sparks.length; i++) {
      const s = o.sparks[i];
      let age = time - s.born;
      if (age >= s.life) {
        if (i < maxSparks && Math.random() < 0.2) {
          s.born = time; age = 0; s.life = rand(380, 760);
          s.ox = rand(-1, 1) * bodyW * 1.3;
          s.oy = rand(-0.15, 0.4) * H;
          s.vx = rand(-18, 18); s.vy = -rand(90, 230);
          s.size = rand(2, 4.2);
          s.img.setFillStyle(Math.random() < 0.5 ? pal.pale : pal.bright, 1).setSize(s.size, s.size);
        } else { s.img.setVisible(false); continue; }
      }
      const t = age / 1000;
      s.img.setVisible(true).setPosition(boss.x + s.ox + s.vx * t, boss.y + s.oy + s.vy * t)
        .setDepth(boss.depth + 0.2).setAlpha(L * (1 - age / s.life) * fl);
    }

    // arcos elétricos estalando em volta (reroteados a cada ~100ms, às vezes apagam: estalo irregular)
    if (time >= this.nextArc) {
      this.nextArc = time + rand(70, 140);
      if (Math.random() < 0.22) this.bolts = [];
      else this._newBolts(bodyW, H);
    }
    const a = o.arcs;
    a.clear().setDepth(boss.depth + 0.15);
    for (const pts of this.bolts) {
      const world = pts.map((q) => ({ x: boss.x + q.x, y: boss.y + q.y }));
      strokePts(a, world, 6, pal.main, 0.5 * L * fl);
      strokePts(a, world, 2.2, pal.pale, 0.95 * L * fl);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// RUGIDO do pouso
// ---------------------------------------------------------------------------------------------
// x,y = ponto do pouso; radius = raio REAL do impacto (def.leapImpactRadius): o anel de choque
// termina exatamente nele, então continua dando pra ler a área do golpe.
export function playMinotaurFuryBurst(scene, boss, x, y, radius) {
  if (!scene?.sys?.isActive() || !hasTex(scene)) return;
  const pal = palFor(boss);
  const lite = isLite(scene);
  const fl = reducedFlash() ? 0.6 : 1;
  const H = boss?.displayHeight || 80;
  const chestY = y - H * 0.12;
  const footY = y + H * 0.38;
  const add = Phaser.BlendModes.ADD;
  const glow = (tint, from, to, dur, alpha, depth, py = y) => {
    const im = scene.add.image(x, py, GLOW).setDepth(depth).setBlendMode(add).setTint(tint).setScale(from).setAlpha(alpha * fl);
    scene.tweens.add({ targets: im, scale: to, alpha: 0, duration: dur, ease: 'Cubic.easeOut', onComplete: () => im.destroy() });
  };

  // clarão: miolo branco seco + halo da cor do boss
  glow(WHITE, 0.8, 6.5, 150, 1, 23, chestY);
  glow(pal.main, 2, 10, 380, 0.65, 20, chestY);

  // anel de choque no chão (círculo de verdade, no raio do impacto) + um segundo mais fino atrás
  [[0, pal.pale, 1], [70, pal.bright, 0.8]].forEach(([delay, color, a], i) => {
    const g = scene.add.graphics().setDepth(19).setBlendMode(add);
    const st = { k: 0 };
    scene.tweens.add({
      targets: st, k: 1, duration: 300 + i * 40, delay, ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(Math.max(2, (i ? 9 : 16) * (1 - st.k)), color, a * (1 - st.k * 0.85) * fl);
        g.strokeCircle(x, y, Math.max(6, radius * (i ? 0.86 : 1) * st.k));
      },
      onComplete: () => g.destroy()
    });
  });

  // 3 ondas de rugido saindo do peito, sincronizadas com o grito
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(22).setBlendMode(add);
    const st = { k: 0 };
    scene.tweens.add({
      targets: st, k: 1, duration: 440, delay: i * 150, ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(Math.max(1.5, 6 * (1 - st.k)), i === 1 ? pal.bright : pal.pale, 0.7 * (1 - st.k) * fl);
        const r = 24 + (150 + i * 28) * st.k;
        g.strokeEllipse(x, chestY, r * 2, r * 1.6);
      },
      onComplete: () => g.destroy()
    });
  }

  // riscos de energia correndo pelo chão, em todas as direções
  const nStreaks = lite ? 8 : 13;
  for (let i = 0; i < nStreaks; i++) {
    const a = (Math.PI * 2 * i) / nStreaks + rand(-0.15, 0.15);
    const st = scene.add.image(x + Math.cos(a) * 30, footY + Math.sin(a) * 18, 'hit_fx')
      .setDepth(18).setBlendMode(add).setTint(i % 2 ? pal.bright : pal.pale).setScale(rand(0.5, 0.9)).setRotation(a);
    const far = radius * rand(0.8, 1.15);
    scene.tweens.add({
      targets: st, x: x + Math.cos(a) * far, y: footY + Math.sin(a) * far * 0.55, alpha: 0, scale: 0.15,
      duration: Phaser.Math.Between(260, 380), ease: 'Cubic.easeOut', onComplete: () => st.destroy()
    });
  }

  // erupção: chamas de energia explodindo pra cima em volta dele
  const key = flameKey(scene, pal);
  if (key) {
    const nFlames = lite ? 5 : 9;
    for (let i = 0; i < nFlames; i++) {
      const a = (Math.PI * 2 * i) / nFlames + rand(-0.25, 0.25);
      const r = rand(0.35, 0.8) * Math.min(radius * 0.7, 120);
      const fx = x + Math.cos(a) * r;
      const fy = footY + Math.sin(a) * r * 0.5;
      const target = (H / FLAME_H) * rand(1.0, 1.7);
      const im = scene.add.image(fx, fy, key, FLAME_FRAME).setOrigin(0.5, 0.92).setDepth(19).setBlendMode(add)
        .setScale(target * 0.7, 0.2).setAlpha(0);
      scene.time.delayedCall(rand(0, 130), () => {
        if (!im.scene) return;
        im.setAlpha(fl);
        scene.tweens.add({
          targets: im, scaleY: target, y: fy - H * 0.25, alpha: 0,
          duration: Phaser.Math.Between(380, 540), ease: 'Cubic.easeOut', onComplete: () => im.destroy()
        });
      });
    }
  }
}
