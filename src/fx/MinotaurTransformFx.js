// Transformação do Minotauro (fase 1 -> fase 2), ~2s, SEM pausar o jogo e sem tirar o
// controle de ninguém. Só visual/áudio: invulnerabilidade, estados e cooldowns ficam no
// Minotaur.js (ver _beginTransformation/_endTransformation).
//
// Linha do tempo (ms desde o início; o relógio é PRÓPRIO e congela junto da pausa/level-up):
//     0  congela (para tudo, inspira, "baque" seco)
//   140  começa a tremer, a energia roxa é sugada pra dentro dele (cresce até a explosão)
//   420  o rugido começa a subir
//   700  pose de rugido (cabeça pra trás, corpo se estica), tremor mais forte
//  1080  energia roxa -> aqua: clarão branco no corpo, sprite da fase 2 (onSwap), cor das luzes vira aqua
//  1300  EXPLOSÃO visual: clarão, onda de choque (lente + anéis no chão), rachaduras
//        energizadas, coluna de luz, poeira/detritos/faíscas (só visual, NÃO causa dano)
//  1900  libera o boss (onRelease) — a luta segue normal na fase 2
//  3000  últimos anéis e brilhos terminam e tudo é destruído
//
// Reaproveita o que já existe: o Pisão aqua (MinotaurStompFx, sem cratera) para a explosão, as
// rachaduras/feixes/pulsos da arena instável (MinotaurArenaFx.transformBurst), as texturas da
// cena de aparição (feixe, brilho, faísca), o shader de lente da entrada (BossEntrancePipeline:
// ondas de choque + aberração) e os sons já carregados.
//
// Performance (mobile em primeiro lugar): nenhum tween, nenhum Graphics e nenhuma alocação por
// frame — tudo é um punhado de imagens criadas UMA vez e movidas por um único update(); faíscas
// em pool fixo (14 no desktop / 7 no mobile) e ainda pelo orçamento compartilhado (FxBudget).
// Se o frame time piora, as faíscas param de nascer. Sem WebGL o shader é só pulado.
//
// Multiplayer: Host e réplicas tocam esta MESMA classe localmente (o Host dispara pelo estado
// 'transform'; a réplica, ao ver bossState === 'transform' no snapshot).

import SettingsManager from '../systems/SettingsManager.js';
import MinotaurAudio from '../systems/MinotaurAudio.js';
import { reserveFx } from './FxBudget.js';
import { ensureTremorTextures } from './MinotaurTremorFx.js';
import { acquirePipe, releasePipe } from './MinotaurEntranceFx.js';
import { playMinotaurStomp, setMinotaurStompFxRage } from './MinotaurStompFx.js';

export const TRANSFORM_SHAKE_AT_MS = 140;
export const TRANSFORM_ROAR_AT_MS = 700;
export const TRANSFORM_SWAP_AT_MS = 1080;
export const TRANSFORM_BLAST_AT_MS = 1300;
export const TRANSFORM_RELEASE_AT_MS = 1900;
export const TRANSFORM_END_MS = 3000;

const T_ROAR_SFX = 420;
const T_SHAKE = TRANSFORM_SHAKE_AT_MS;
const T_ROAR = TRANSFORM_ROAR_AT_MS;
const T_SWAP = TRANSFORM_SWAP_AT_MS;
const T_BLAST = TRANSFORM_BLAST_AT_MS;
const T_RELEASE = TRANSFORM_RELEASE_AT_MS;
const T_END = TRANSFORM_END_MS;

const GLOW_KEY = 'tremor_glow'; // 128x128, brilho radial macio
const SPARK_KEY = 'tremor_spark'; // 16x16, ponto de luz
const BEAM_KEY = 'tremor_beam'; // 48x256, origem na base
const RING_KEY = 'mtf_ring'; // 256x256, anel fino com halo (pico em ~120px de raio)
const RING_PEAK = 120;
const GROUND_SQUASH = 0.72; // mesma perspectiva dos outros FX do chão do boss

const PURPLE = 0xb56bff;
const PURPLE_LIGHT = 0xe0c4ff;
const AQUA = 0x32e9d6;
const AQUA_LIGHT = 0xbafff1;
const WHITE = 0xffffff;

const BLAST_RADIUS = 300; // só o tamanho VISUAL da explosão (não existe dano)
const MAX_SPARKS_DESKTOP = 14;
const MAX_SPARKS_MOBILE = 7;

const ADD = Phaser.BlendModes.ADD;
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInQuad = (t) => t * t;
const rand = (a, b) => a + Math.random() * (b - a);

function mixColor(a, b, t) {
  const ar = (a >> 16) & 255; const ag = (a >> 8) & 255; const ab = a & 255;
  const br = (b >> 16) & 255; const bg = (b >> 8) & 255; const bb = b & 255;
  return ((Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t)));
}

function ensureRingTexture(scene) {
  if (scene.textures.exists(RING_KEY)) return;
  const size = 256;
  const tex = scene.textures.createCanvas(RING_KEY, size, size);
  const ctx = tex.getContext();
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.66, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.94, 'rgba(255,255,255,1)'); // crista fina
  grad.addColorStop(0.975, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

export default class MinotaurTransformFx {
  // hooks: onSwap() no instante da troca roxo -> aqua; onRelease() quando o boss volta a lutar.
  constructor(scene, boss, hooks = {}) {
    this.scene = scene;
    this.boss = boss;
    this.hooks = hooks;
    this.t = 0;
    this.done = false;
    this.swapped = false;
    this.released = false;
    this.blasted = false;
    this.nextEvent = 0;

    this.lite = !!scene.sys.game.device.input.touch || SettingsManager.getReducedTerrainFx();
    this.reducedFlashes = SettingsManager.getReducedFlashes();
    this.reducedMotion = SettingsManager.getReducedMotion();
    this.flashK = this.reducedFlashes ? 0.35 : 1;
    this.moveK = this.reducedMotion ? 0.3 : 1;
    this.dtEma = 1000 / 60;

    this.offX = 0;
    this.offY = 0;
    this.whiteUntil = 0;
    this.tinted = false;
    this.sparkAcc = 0;
    this.ringPhase = [0, 0.5];

    ensureTremorTextures(scene);
    ensureRingTexture(scene);
    this.pipe = acquirePipe(scene); // null sem WebGL
    this.lensRings = []; // { ring, t0, dur, to, a0 } — ondas do shader da lente

    const depth = boss.depth;
    this.images = [];
    const mk = (key, d, blend = true) => {
      const img = scene.add.image(0, 0, key).setDepth(d).setVisible(false);
      if (blend) img.setBlendMode(ADD);
      for (const cam of scene.cameras.cameras) if (cam !== scene.cameras.main) cam.ignore(img);
      this.images.push(img);
      return img;
    };
    // chão: abaixo de inimigos/jogador (aviso = 4, boss = 9) mas acima do piso e das rachaduras
    this.gatherRings = [mk(RING_KEY, 2.5), mk(RING_KEY, 2.5)];
    this.blastRings = [mk(RING_KEY, 2.5), mk(RING_KEY, 2.5), mk(RING_KEY, 2.5)];
    this.blastRingCfg = [
      { at: 0, dur: 680, R: BLAST_RADIUS * 1.18, a: 0.95, tint: AQUA_LIGHT },
      { at: 120, dur: 600, R: BLAST_RADIUS * 0.86, a: 0.75, tint: AQUA },
      { at: 250, dur: 520, R: BLAST_RADIUS * 0.58, a: 0.6, tint: WHITE }
    ];
    this.beam = mk(BEAM_KEY, depth + 0.3);
    this.beam.setOrigin(0.5, 1);
    this.aura = mk(GLOW_KEY, depth - 0.04);
    this.core = mk(GLOW_KEY, depth + 0.25);
    this.flare = mk(GLOW_KEY, depth + 0.3);
    this.sparks = [];
    const maxSparks = this.lite ? MAX_SPARKS_MOBILE : MAX_SPARKS_DESKTOP;
    for (let i = 0; i < maxSparks; i += 1) {
      this.sparks.push({
        img: mk(SPARK_KEY, depth + 0.2), alive: false, age: 0, life: 1,
        sx: 0, sy: 0, tx: 0, ty: 0, s: 1
      });
    }

    this.events = [
      { at: 0, fn: () => this._onFreeze() },
      { at: T_SHAKE, fn: () => this._onShakeStart() },
      { at: T_ROAR_SFX, fn: () => this._playSfx('sfx_minotaur_cleave_roar', 1, 0.92) },
      { at: T_ROAR, fn: () => this._onRoar() },
      { at: T_SWAP, fn: () => this._onSwap() },
      { at: T_BLAST, fn: () => this._onBlast() },
      { at: T_RELEASE, fn: () => this._onRelease() }
    ];
  }

  get active() {
    return !this.done;
  }

  // ---------------------------------------------------------------- ciclo

  update(delta) {
    if (this.done) return;
    const boss = this.boss;
    if (!boss.active) {
      this.destroy();
      return;
    }
    const scene = this.scene;
    const ts = scene.time.timeScale;
    if (scene.isPaused || ts === 0) return; // pausa/level-up: tudo congelado (o relógio também)

    this.dtEma += (Math.min(delta, 100) - this.dtEma) * 0.08;
    const dt = Math.min(delta, 50) * ts;
    this.t += dt;

    while (this.nextEvent < this.events.length && this.t >= this.events[this.nextEvent].at) {
      this.events[this.nextEvent].fn();
      this.nextEvent += 1;
      if (this.done) return;
    }

    this._tickBody(dt);
    this._tickGround(dt);
    this._tickLight();
    this._tickSparks(dt);
    this._tickLens();

    if (this.t >= T_END) this.finish();
  }

  // Termina normalmente (ou cancelado): devolve posição/escala/tint do boss e solta o shader.
  finish() {
    if (this.done) return;
    this.done = true;
    const boss = this.boss;
    if (boss?.active) {
      boss.x -= this.offX;
      boss.y -= this.offY;
      boss.setScale(boss.baseScale, boss.baseScale);
      this._clearWhite();
    }
    if (boss) boss._tfGlow = 0;
    this.offX = 0;
    this.offY = 0;
    if (this.pipe) {
      const f = this.pipe.fx;
      this.lensRings.forEach((entry) => {
        const at = f.rings.indexOf(entry.ring);
        if (at >= 0) f.rings.splice(at, 1);
      });
      this.lensRings.length = 0;
      f.aberr = 0;
      f.flashA = 0;
      releasePipe(this.scene, this.pipe);
      this.pipe = null;
    }
    this.images.forEach((img) => img.destroy());
    this.images.length = 0;
    this.sparks.length = 0;
  }

  destroy() {
    this.finish();
  }

  // ---------------------------------------------------------------- eventos

  _playSfx(key, volume, rate = 1) {
    if (this.scene.cache.audio.exists(key)) this.scene.sound.play(key, { volume, rate });
  }

  _onFreeze() {
    this._playSfx('sfx_minotaur_breath', 0.75, 1.1);
    MinotaurAudio.impact(this.scene, 0.4);
    this.scene.cameras.main.shake(150, 0.004, true);
  }

  _onShakeStart() {
    this.scene.cameras.main.shake(T_ROAR - T_SHAKE + 40, 0.0028, true);
  }

  _onRoar() {
    this.scene.cameras.main.shake(T_BLAST - T_ROAR, 0.0065, true);
    this._addLensRing(0.55, 520, 0.4);
  }

  // roxo -> aqua: clarão no corpo, sprite da fase 2 e brilho/cores mudam juntos
  _onSwap() {
    this.swapped = true;
    this.whiteUntil = this.t + 95;
    this.hooks.onSwap?.();
    this._playSfx('sfx_cyberus_wakeup', 0.55, 1.05);
    this._addLensRing(0.7, 640, 0.5);
    if (this.pipe && !this.reducedFlashes) {
      this.pipe.fx.flashColor = [0.6, 1, 0.96];
      this.swapFlash = 0.22;
    }
  }

  // a explosão: só visual (nada aqui causa dano)
  _onBlast() {
    this.blasted = true;
    const boss = this.boss;
    const scene = this.scene;
    const gx = boss.x - this.offX;
    const gy = boss.y - this.offY + boss.displayHeight * (boss._shadowYFrac ?? 0.46);
    this.whiteUntil = this.t + 80;

    this._playSfx('sfx_cyberus_explosion', 0.8, 0.75);
    this._playSfx('sfx_minotaur_stomp', 0.7, 0.85);
    MinotaurAudio.impact(scene, 1.1);

    const cam = scene.cameras.main;
    cam.shake(420, 0.028, true);
    cam.flash(130, 170, 255, 245);

    // explosão + onda de choque + poeira/detritos/faíscas do Pisão aqua, SEM a cratera
    setMinotaurStompFxRage(true);
    playMinotaurStomp(scene, gx, gy, BLAST_RADIUS, { q: this.lite ? 0.5 : 0.85, shake: 0, groundMark: false });

    // rachaduras energizadas (as da arena instável, em estouro radial) + feixes + pulsos
    boss.arenaFx?.transformBurst?.(1);

    this._addLensRing(1.25, 950, 0.95);
    this._addLensRing(0.9, 800, 0.55, 140);
    if (this.pipe) {
      this.pipe.fx.flashColor = [0.55, 0.98, 0.93];
      this.blastFlash = 0.5 * this.flashK;
    }
  }

  _onRelease() {
    this.released = true;
    this.hooks.onRelease?.();
  }

  // onda de choque do shader da lente (nada acontece sem WebGL)
  _addLensRing(to, dur, a0, delay = 0) {
    if (!this.pipe) return;
    const boss = this.boss;
    const ring = {
      wx: boss.x - this.offX,
      wy: boss.y - this.offY + boss.displayHeight * 0.1,
      r: 0.02,
      a: 0
    };
    this.lensRings.push({ ring, t0: this.t + delay, dur, to, a0: a0 * this.flashK, added: false });
  }

  // ---------------------------------------------------------------- corpo

  _clearWhite() {
    if (!this.tinted) return;
    this.tinted = false;
    const boss = this.boss;
    boss.clearTint();
    boss._currentStatusTint = null; // força o tint de status normal em _refreshStatusTint
    boss._refreshStatusTint?.(this.scene.time.now);
  }

  // Treme (parado no lugar), estica no rugido, recua com o impacto da explosão.
  _tickBody(dt) {
    const boss = this.boss;
    const t = this.t;

    // o deslocamento do frame anterior sai ANTES de qualquer cálculo (o Host/réplica move o boss
    // por fora; aqui só somamos uma vibração de poucos pixels por cima)
    boss.x -= this.offX;
    boss.y -= this.offY;

    const charge = clamp01((t - T_SHAKE) / (T_BLAST - T_SHAKE));
    const roar = t >= T_ROAR && t < T_BLAST ? easeOutCubic(clamp01((t - T_ROAR) / 160)) : 0;
    const since = t - T_BLAST;
    const recoil = since >= 0 ? Math.exp(-since / 110) * Math.cos(since / 45) : 0;
    const recoilAmp = since >= 0 ? clamp01(1 - since / 280) : 0;

    let amp = 0;
    if (t >= T_SHAKE && t < T_BLAST) amp = (0.5 + 3 * charge ** 1.5) * (roar > 0 ? 1.25 : 1);
    else if (since >= 0) amp = 3.5 * recoilAmp;
    amp *= this.moveK;
    this.offX = amp > 0 ? rand(-amp, amp) : 0;
    this.offY = amp > 0 ? rand(-amp, amp) * 0.55 : 0;
    boss.x += this.offX;
    boss.y += this.offY;

    const base = boss.baseScale;
    let sx = base;
    let sy = base;
    if (t >= T_SHAKE && t < T_BLAST) {
      const tense = 0.012 * charge * Math.sin(t / 55) * this.moveK;
      sx = base * (1 + tense - 0.05 * roar * this.moveK);
      sy = base * (1 - tense + 0.085 * roar * this.moveK);
    } else if (since >= 0 && since < 600) {
      sx = base * (1 + 0.09 * recoil * this.moveK);
      sy = base * (1 - 0.09 * recoil * this.moveK);
    }
    boss.setScale(sx, sy);

    if (t < this.whiteUntil) {
      boss.setTintFill(WHITE);
      this.tinted = true;
    } else if (this.tinted) {
      this._clearWhite();
    }

    // quanto o brilho do corpo (MinotaurGlowFx) é empurrado pra cima
    let glow = t < T_SHAKE ? 0.2 : 0.35 + 0.65 * charge;
    if (since >= 0) glow = 1.6 * (1 - clamp01(since / 900));
    boss._tfGlow = glow;
  }

  // ---------------------------------------------------------------- chão (anéis)

  _tickGround(dt) {
    const boss = this.boss;
    const t = this.t;
    const gx = boss.x - this.offX;
    const gy = boss.y - this.offY + boss.displayHeight * (boss._shadowYFrac ?? 0.46);
    const conv = this.swapped ? clamp01((t - T_SWAP) / 220) : 0;
    const colorMain = mixColor(PURPLE, AQUA, conv);

    // anéis de energia fechando em cima dele enquanto carrega
    const charge = clamp01((t - T_SHAKE) / (T_BLAST - T_SHAKE));
    const gathering = t >= T_SHAKE && t < T_BLAST + 60;
    const period = lerp(640, 330, charge);
    for (let i = 0; i < 2; i += 1) {
      const img = this.gatherRings[i];
      if (!gathering) {
        img.setVisible(false);
        continue;
      }
      this.ringPhase[i] = (this.ringPhase[i] + dt / period) % 1;
      const p = this.ringPhase[i];
      const radius = lerp(230, 45, easeInQuad(p));
      const alpha = Math.sin(Math.PI * p) ** 0.8 * (0.25 + 0.55 * charge) * 0.9;
      img.setPosition(gx, gy).setScale(radius / RING_PEAK, (radius / RING_PEAK) * GROUND_SQUASH)
        .setTint(colorMain).setAlpha(alpha).setVisible(alpha > 0.01);
    }

    // anéis da explosão correndo pelo chão
    for (let i = 0; i < 3; i += 1) {
      const cfg = this.blastRingCfg[i];
      const img = this.blastRings[i];
      const u = this.blasted ? (t - T_BLAST - cfg.at) / cfg.dur : -1;
      if (u < 0 || u >= 1) {
        img.setVisible(false);
        continue;
      }
      const radius = lerp(24, cfg.R, easeOutCubic(u));
      const alpha = cfg.a * (1 - u) ** 1.4;
      img.setPosition(gx, gy).setScale(radius / RING_PEAK, (radius / RING_PEAK) * GROUND_SQUASH)
        .setTint(cfg.tint).setAlpha(alpha).setVisible(true);
    }

    // coluna de luz da explosão
    const bu = this.blasted ? (t - T_BLAST) / 520 : -1;
    if (bu >= 0 && bu < 1) {
      const w = boss.displayWidth / 180;
      this.beam.setPosition(gx, gy).setTint(AQUA_LIGHT)
        .setScale(lerp(3.4, 1.1, bu) * w, lerp(2.2, 3.6, easeOutCubic(bu)))
        .setAlpha((1 - bu) ** 2 * this.flashK).setVisible(true);
    } else {
      this.beam.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- luz (aura / núcleo / clarão)

  _tickLight() {
    const boss = this.boss;
    const t = this.t;
    const bx = boss.x - this.offX;
    const by = boss.y - this.offY - boss.displayHeight * 0.05;
    const W = boss.displayWidth;
    const conv = this.swapped ? clamp01((t - T_SWAP) / 220) : 0;
    const color = mixColor(PURPLE, AQUA, conv);
    const charge = clamp01((t - T_SHAKE) / (T_BLAST - T_SHAKE));
    const since = t - T_BLAST;
    const fade = since >= 0 ? 1 - clamp01(since / 900) : 1;

    // aura grande e macia atrás do corpo
    const auraOn = t >= T_SHAKE;
    if (auraOn) {
      const pulse = 0.85 + 0.15 * Math.sin(t / 50);
      const alpha = (0.18 + 0.5 * charge) * pulse * fade * (0.6 + 0.4 * this.flashK);
      const size = W * (1.6 + 1.4 * charge + (since >= 0 ? 1.2 * easeOutCubic(clamp01(since / 500)) : 0));
      this.aura.setPosition(bx, by).setScale(size / 128).setTint(color).setAlpha(alpha).setVisible(alpha > 0.01);
    } else {
      this.aura.setVisible(false);
    }

    // núcleo de energia comprimida no peito: cresce, branqueia na troca e estoura
    if (t >= T_SHAKE && since < 320) {
      let size = W * (0.2 + 0.9 * charge * charge);
      let alpha = 0.5 * charge;
      if (this.swapped) {
        const s = clamp01((t - T_SWAP) / 160);
        size += W * 0.45 * s;
        alpha = Math.min(1, alpha + 0.4 * s);
      }
      if (since >= 0) {
        const u = since / 320;
        size = W * lerp(1.5, 2.8, easeOutCubic(u));
        alpha = (1 - u) * this.flashK + (1 - u) * 0.15;
      }
      this.core.setPosition(bx, by).setScale(size / 128).setTint(mixColor(color, WHITE, 0.55)).setAlpha(alpha).setVisible(alpha > 0.01);
    } else {
      this.core.setVisible(false);
    }

    // clarão largo da explosão (some em ~300ms)
    if (since >= 0 && since < 300) {
      const u = since / 300;
      this.flare.setPosition(bx, by).setScale((W * lerp(4, 9, easeOutCubic(u))) / 128)
        .setTint(AQUA_LIGHT).setAlpha(0.9 * (1 - u) * this.flashK).setVisible(true);
    } else {
      this.flare.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- faíscas sugadas pra dentro

  _tickSparks(dt) {
    const boss = this.boss;
    const t = this.t;
    const bx = boss.x - this.offX;
    const by = boss.y - this.offY - boss.displayHeight * 0.05;
    const conv = this.swapped ? clamp01((t - T_SWAP) / 220) : 0;
    const charge = clamp01((t - T_SHAKE) / (T_BLAST - T_SHAKE));

    // FPS caiu: não nasce mais nada (o que já existe só termina)
    const healthy = this.dtEma < 28;
    if (healthy && t >= T_SHAKE + 60 && t < T_BLAST + 80) {
      this.sparkAcc += dt * (this.lite ? 14 : 30) * (0.25 + 0.75 * charge) / 1000;
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        this._spawnSpark(bx, by);
      }
    }

    for (let i = 0; i < this.sparks.length; i += 1) {
      const sp = this.sparks[i];
      if (!sp.alive) continue;
      sp.age += dt;
      const u = sp.age / sp.life;
      if (u >= 1) {
        sp.alive = false;
        sp.img.setVisible(false);
        continue;
      }
      const k = easeInQuad(u); // acelera ao chegar no corpo
      const x = lerp(sp.sx, sp.tx, k);
      const y = lerp(sp.sy, sp.ty, k);
      const alpha = Math.min(1, u / 0.15) * (1 - u ** 3) * 0.9;
      sp.img.setPosition(x, y).setScale(sp.s * (1 - 0.55 * u)).setAlpha(alpha)
        .setTint(mixColor(Math.random() < 0.5 ? PURPLE_LIGHT : PURPLE, Math.random() < 0.5 ? AQUA_LIGHT : AQUA, conv));
    }
  }

  _spawnSpark(cx, cy) {
    let sp = null;
    for (let i = 0; i < this.sparks.length; i += 1) {
      if (!this.sparks[i].alive) { sp = this.sparks[i]; break; }
    }
    if (!sp) return;
    if (reserveFx(this.scene, 1) < 1) return;
    const a = rand(0, TAU);
    const r = rand(110, 230);
    sp.alive = true;
    sp.age = 0;
    sp.life = rand(340, 560);
    sp.sx = cx + Math.cos(a) * r;
    sp.sy = cy + Math.sin(a) * r * 0.8;
    sp.tx = cx + rand(-12, 12);
    sp.ty = cy + rand(-14, 14);
    sp.s = rand(0.6, 1.1);
    sp.img.setPosition(sp.sx, sp.sy).setScale(sp.s).setAlpha(0).setVisible(true);
  }

  // ---------------------------------------------------------------- lente (shader da entrada do boss)

  _tickLens() {
    const pipe = this.pipe;
    if (!pipe) return;
    const f = pipe.fx;
    const boss = this.boss;
    const t = this.t;
    f.focusX = boss.x - this.offX;
    f.focusY = boss.y - this.offY;

    // ondas: nascem no instante programado e abrem até `to` (em alturas de tela)
    for (let i = this.lensRings.length - 1; i >= 0; i -= 1) {
      const entry = this.lensRings[i];
      const u = (t - entry.t0) / entry.dur;
      if (u < 0) continue;
      if (!entry.added) {
        entry.added = true;
        f.rings.push(entry.ring);
      }
      if (u >= 1) {
        const at = f.rings.indexOf(entry.ring);
        if (at >= 0) f.rings.splice(at, 1);
        this.lensRings.splice(i, 1);
        continue;
      }
      entry.ring.r = lerp(0.02, entry.to, easeOutCubic(u));
      entry.ring.a = entry.a0 * (1 - u);
    }

    // aberração: leve tensão crescendo enquanto carrega + estalo na explosão
    const charge = clamp01((t - T_SHAKE) / (T_BLAST - T_SHAKE));
    let aberr = t >= T_SHAKE && t < T_BLAST ? 0.35 * charge * this.flashK : 0;
    const since = t - T_BLAST;
    if (since >= 0) aberr = 1.8 * this.flashK * (1 - clamp01(since / 500)) ** 2;
    f.aberr = aberr;

    // clarões (na troca de cor e na explosão), curtos
    let flash = 0;
    if (this.swapFlash && t >= T_SWAP) flash = Math.max(flash, this.swapFlash * (1 - clamp01((t - T_SWAP) / 140)));
    if (this.blastFlash && since >= 0) flash = Math.max(flash, this.blastFlash * (1 - clamp01(since / 220)) ** 1.5);
    f.flashA = flash;
  }
}
