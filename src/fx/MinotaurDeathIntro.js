// MORTE DO MINOTAURO — FASE 1: INTRODUÇÃO ("O Último Golpe")
//
// Roteiro (tempos em ms desde o início da morte):
//     0 –  240  HIT-STOP   clarão branco, corpo congelado tremendo, cortes de luz em cruz,
//                          faíscas e estilhaços que ficam PENDURADOS no ar (arrasto alto)
//   120 – 1000  RECUO      o colosso cambaleia pra trás, câmera começa a empurrar, letterbox desce,
//                          o mundo esfria (viragem fria + vinheta), música despenca
//  1150 – 4080  CORAÇÃO    7 batimentos acelerando (lub-dub). Cada um: onda no chão, tranco de lente,
//                          luz vazando pelo corpo (silhueta aditiva), almas subindo. Coluna de luz
//                          sobe do chão e engrossa. Ferida de luz cortada no peito.
//  3000 – 4340  INSPIRAR   o ar/energia do mundo é SUGADO pra dentro dele (implosão de partículas),
//                          peito infla
//  4340 – 4600  SEGURAR    silêncio total, sem batimento. A respiração presa antes do estouro.
//
// Quem chama: MinotaurDeathFx.js (orquestrador). Esta classe só desenha/toca — não decide quando
// a morte termina. O corpo do boss é movido por body(t) enquanto t < INTRO; depois disso a
// sequência provisória do orquestrador assume (ver PRÓXIMAS FASES lá).

import { reserveFx } from './FxBudget.js';

export const MINOTAUR_DEATH_INTRO_MS = 4600;

const INTRO = MINOTAUR_DEATH_INTRO_MS;
const AQUA = 0x32e9d6;
const WHITE = 0xdffff7;
const ICE = 0x9ffcf0;
const TAU = Math.PI * 2;

const BEAT_TIMES = [1150, 1850, 2450, 2950, 3380, 3760, 4080]; // acelera, depois o silêncio
const DUB_DELAY = 170;      // o "dub" do lub-dub
const HIT_FREEZE = 240;
const INHALE_AT = 3000;
const BREATH_HELD_AT = INTRO - 260;

const clamp = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const out = t => 1 - (1 - clamp(t)) ** 3;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

export default class MinotaurDeathIntro {
  // fx = MinotaurDeathFx (empresta image/sound/shake/burst/spawn/take e o estado x, y, footY...)
  // opts.ghostFadeFrom / ghostUntil: até quando a luz vaza pelo corpo na sequência provisória.
  constructor(fx, opts = {}) {
    this.fx = fx;
    this.ghostFadeFrom = opts.ghostFadeFrom ?? INTRO + 1800;
    this.ghostUntil = opts.ghostUntil ?? INTRO + 3180;
    this.done = false;
    this.next = 0;
    this.nextSoul = 0;
    this.suckAcc = 0;

    const bodyKey = fx.boss.texture.key;
    this.ghost = fx.image(bodyKey, 9.1).setTintFill(AQUA);   // luz vazando pela silhueta
    this.halo = fx.image(bodyKey, 8.9).setTintFill(AQUA);    // bloom ao redor da silhueta
    this.pillar = fx.image('tremor_beam', 8.6).setOrigin(0.5, 1).setTint(AQUA);
    this.floor = fx.image('tremor_glow', 2.55).setTint(AQUA);
    this.flareH = fx.image('tremor_glow', 14).setTint(WHITE);
    this.flareV = fx.image('tremor_glow', 14).setTint(WHITE);
    this.wound = fx.image('tremor_glow', 9.3).setTint(ICE);
    this.rings = Array.from({ length: 4 }, () => ({
      image: fx.image('minotaur_death_ring', 2.45), at: -99999, power: 0
    }));
    this.ringCursor = 0;

    this.beats = BEAT_TIMES.map((at, i) => ({ at, power: 0.35 + 0.65 * i / (BEAT_TIMES.length - 1) }));
    this.events = [[0, stale => this.hit(stale)]];
    for (const b of this.beats) {
      this.events.push([b.at, stale => this.beat(stale, b.power, false)]);
      this.events.push([b.at + DUB_DELAY, stale => this.beat(stale, b.power * 0.55, true)]);
    }
    this.events.push([BREATH_HELD_AT, stale => { if (!stale) fx.stopSounds(); }]);
    this.events.sort((a, b) => a[0] - b[0]);
  }

  // ---------------------------------------------------------------- eventos

  hit(stale) {
    if (stale) return;
    const fx = this.fx;
    fx.sound('sfx_minotaur_hit3', 0.95, 0.7);
    fx.sound('sfx_blastwave', 0.6, 0.5);
    fx.sound('sfx_minotaur_heavy_axe_impact', 0.8, 0.55);
    fx.shake(300, 0.032);
    if (fx.flashK > 0.5) fx.scene.cameras.main.flash(70, 235, 255, 250, true);
    this.ring(1.15);
    // "tempo parado": sai rápido e perde a velocidade quase toda, ficando suspenso
    fx.burst(fx.x, fx.y - 10, fx.lite ? 12 : 22, 'spark', 430,
      { drag: 3.4, gravity: -25, life: [2200, 3400], scale: [0.35, 0.9] });
    fx.burst(fx.x, fx.y - 10, fx.lite ? 6 : 11, 'debris', 300,
      { drag: 2.8, gravity: 10, life: [2600, 3600], scale: [0.7, 1.5] });
  }

  beat(stale, power, dub) {
    if (stale) return;
    const fx = this.fx;
    fx.sound('sfx_minotaur_stomp', (dub ? 0.14 : 0.24) + power * (dub ? 0.12 : 0.26), dub ? 0.5 : 0.56);
    if (dub) return;
    fx.shake(120, 0.003 + power * 0.009);
    this.ring(power);
    fx.burst(fx.x + rand(-34, 34), fx.y + rand(-50, 24), fx.lite ? 3 : 6, 'spark', 70,
      { gravity: -80, drag: 0.7, life: [1500, 2600], scale: [0.3, 0.8] });
  }

  ring(power) {
    const r = this.rings[this.ringCursor++ % this.rings.length];
    r.at = this.fx.t;
    r.power = power;
  }

  // ---------------------------------------------------------------- curvas

  // 0..1: pico no instante da batida, cai rápido. Soma lub + dub de todas as batidas.
  beatEnv(t) {
    let e = 0;
    for (const b of this.beats) {
      for (let d = 0; d < 2; d++) {
        const u = (t - (b.at + d * DUB_DELAY)) / 360;
        if (u < 0 || u >= 1) continue;
        e = Math.max(e, b.power * (d ? 0.55 : 1) * (1 - u) ** 2);
      }
    }
    return e;
  }

  // Lente do shader durante a introdução (o orquestrador soma letterbox/viragem/vinheta).
  lens(t) {
    const fx = this.fx, beat = this.beatEnv(t);
    const hit = Math.exp(-t / 160);
    const grow = smooth((t - 900) / 3500);
    return {
      zoom: 1 + 0.30 * smooth(t / (INTRO - 200)) + 0.06 * hit + 0.012 * beat,
      pinch: (0.045 * grow + 0.022 * beat + 0.06 * hit) * fx.motionK,
      aberr: (2.2 * hit + 0.9 * beat + 0.5 * grow) * fx.flashK
    };
  }

  // Movimento do corpo do boss durante a introdução (t < INTRO).
  body(t) {
    const fx = this.fx, b = fx.boss, side = fx.side, mk = fx.motionK;
    const beat = this.beatEnv(t);
    const sq = 0.08 * (1 - smooth(t / 280));            // squash do impacto
    const recoil = out((t - 120) / 900);                // cambaleia pra trás
    const inhale = smooth((t - INHALE_AT) / 1500);      // peito infla
    const sy = 1 - sq + 0.055 * inhale + 0.02 * beat;
    const sx = 1 + sq * 0.7 - 0.018 * inhale + 0.012 * beat;
    const amp = (0.4 + 2.6 * smooth((t - 900) / 3200)) * mk;
    const freeze = (1 - clamp(t / 180)) * 5 * mk;       // vibra no hit-stop
    const dx = -side * 30 * recoil + Math.sin(t * 0.083) * amp * 1.1 + Math.sin(t * 0.9) * freeze;
    const dy = Math.sin(t * 0.117) * amp * 0.6;

    b.setScale(fx.scale * sx, fx.scale * sy);
    b.setPosition(fx.x + dx, fx.footY - fx.height * sy * b._shadowYFrac + dy);
    b.setRotation((-side * 0.075 * recoil - side * 0.03 * inhale) * mk);
    b.setAlpha(1);
    if (t < 110 && fx.flashK > 0.5) b.setTintFill(WHITE); else b.clearTint();
    if (b.shadow?.active) {
      b.shadow.setPosition(fx.x + dx, fx.footY).setScale(1 + sq * 0.6 + 0.03 * inhale, 1);
    }
  }

  // ---------------------------------------------------------------- por quadro

  update(t, dt) {
    if (this.done) return;
    const fx = this.fx, k = fx.flashK;
    if (t >= this.ghostUntil) { this.finish(); return; }

    while (this.next < this.events.length && t >= this.events[this.next][0]) {
      const [at, fn] = this.events[this.next++];
      fn(t - at > 220);
    }

    const b = fx.boss;
    const lt = t - INTRO;                       // > 0 depois da introdução
    const beat = this.beatEnv(t);
    const grow = smooth((t - 1000) / 3300);
    const after = lt > 0 ? 1 - smooth(lt / 900) : 1;   // tudo some no pós-estouro

    // coluna de luz: sobe do chão e engrossa; no estouro dá um último clarão e some
    const pillarA = lt < 0 ? (0.12 + 0.5 * grow) * (1 + 0.5 * beat) : 0.85 * after;
    this.pillar.setVisible(pillarA > 0.004).setPosition(fx.x, fx.footY)
      .setScale(lt < 0 ? 0.5 + 2.2 * grow + 0.5 * beat : 2.7 + 2 * smooth(lt / 900), 6)
      .setAlpha(Math.min(1, pillarA) * k);

    // brilho no chão
    const floorS = 1.7 + 2.3 * grow + 0.25 * beat;
    const floorA = (0.10 + 0.4 * grow + 0.35 * beat) * after;
    this.floor.setVisible(floorA > 0.004).setPosition(fx.x, fx.footY)
      .setScale(floorS, floorS * 0.36).setAlpha(Math.min(1, floorA) * k);

    // cruz de luz do golpe
    const fu = t / 480;
    const flareOn = fu >= 0 && fu < 1;
    const fa = (1 - fu) ** 2;
    this.flareH.setVisible(flareOn).setPosition(fx.x, fx.y - fx.height * 0.1)
      .setScale(3 + 7 * out(fu), 0.02 + 0.16 * (1 - fu)).setAlpha(fa * k);
    this.flareV.setVisible(flareOn).setPosition(fx.x, fx.y - fx.height * 0.1)
      .setScale(0.02 + 0.14 * (1 - fu), 2.2 + 3 * out(fu)).setAlpha(fa * 0.8 * k);

    // ferida de luz: corte diagonal no peito, pulsa com o coração
    const woundIn = out((t - 60) / 300);
    const woundA = (0.5 + 0.5 * beat) * (0.85 + 0.15 * Math.sin(t * 0.09)) * (lt < 0 ? 1 : 1 - smooth(lt / 400));
    this.wound.setVisible(woundIn > 0 && woundA > 0.004 && b.visible)
      .setPosition(b.x + fx.side * 8, b.y - fx.height * 0.08).setRotation(-0.6 * fx.side)
      .setScale(3.1 * woundIn, 0.075 + 0.05 * beat).setAlpha(Math.min(1, woundA) * k);

    // ondas no chão (uma por batida)
    for (const r of this.rings) {
      const u = (t - r.at) / 900;
      r.image.setVisible(u >= 0 && u < 1);
      if (u < 0 || u >= 1) continue;
      const radius = (90 + 170 * r.power) * out(u);
      r.image.setPosition(fx.x, fx.footY).setScale(radius / 116, radius / 116 * 0.68)
        .setAlpha((1 - u) * 0.9 * Math.min(1, r.power) * k);
    }

    // luz vazando pelo corpo (também na sequência provisória, até o silêncio)
    let glow;
    if (t < INTRO) glow = t < 160 ? 0 : 0.05 + 0.30 * grow + 0.6 * beat;
    else glow = 0.45 * (1 - smooth((t - this.ghostFadeFrom) / (this.ghostUntil - this.ghostFadeFrom)));
    this.syncGhost(Math.min(0.95, glow) * k);

    // almas subindo, entre as batidas
    if (t > 1000 && t < INTRO - 200 && t >= this.nextSoul && fx.dtEma < 34) {
      this.nextSoul = t + (fx.lite ? 260 : 140);
      fx.burst(fx.x + rand(-45, 45), fx.y + rand(-40, 35), 1, 'spark', 28,
        { gravity: -60, drag: 0.5, life: [1800, 2800], scale: [0.25, 0.6] });
    }

    // inspirar: o mundo é sugado pra dentro dele
    if (t >= INHALE_AT && t < INTRO - 140 && fx.dtEma < 34) {
      this.suckAcc += dt;
      const every = fx.lite ? 120 : 60;
      while (this.suckAcc >= every) {
        this.suckAcc -= every;
        this.suck(fx.lite ? 2 : 4, smooth((t - INHALE_AT) / 1400));
      }
    }
  }

  suck(count, progress) {
    const fx = this.fx;
    let n = reserveFx(fx.scene, count);
    const cx = fx.x, cy = fx.y - 10;
    while (n-- > 0) {
      const p = fx.take();
      if (!p) return;
      const a = rand(0, TAU);
      const radius = rand(150, 300) * (1.15 - 0.25 * progress);
      const life = rand(700, 1100);
      const sx = cx + Math.cos(a) * radius, sy = cy + Math.sin(a) * radius * 0.62;
      fx.spawn(p, sx, sy, {
        texture: 'tremor_spark', add: true, tint: Math.random() < 0.35 ? WHITE : AQUA,
        life, scale: rand(0.25, 0.6), alpha: 0.95,
        vx: (cx - sx) / (life / 1000), vy: (cy - sy) / (life / 1000), rotation: a
      });
    }
  }

  syncGhost(alpha) {
    const b = this.fx.boss;
    const on = alpha > 0.01 && b.visible;
    for (const [img, k, a] of [[this.ghost, 1, alpha], [this.halo, 1.09, alpha * 0.4]]) {
      img.setVisible(on);
      if (!on) continue;
      if (img.texture.key !== b.texture.key || img.frame.name !== b.frame.name) {
        img.setTexture(b.texture.key, b.frame.name).setTintFill(AQUA);
      }
      img.setOrigin(b.originX, b.originY).setFlipX(b.flipX).setPosition(b.x, b.y)
        .setScale(b.scaleX * k, b.scaleY * k).setRotation(b.rotation).setAlpha(a);
    }
  }

  finish() {
    this.done = true;
    for (const img of [this.ghost, this.halo, this.pillar, this.floor, this.flareH, this.flareV, this.wound]) {
      img.setVisible(false);
    }
    for (const r of this.rings) r.image.setVisible(false);
  }
}
