// Morte do Minotauro (cutscene local, ~9 s). Encontro de boss, não fim de jogo: um relógio
// próprio respeita pausa/level-up. Nenhuma física, hitbox, dano ou pausa global; só visual/áudio.
// Nenhum tween, nenhum Graphics por frame: imagens criadas UMA vez e movidas por um único update(),
// partículas em pool fixo e ainda pelo orçamento compartilhado (FxBudget).
//
// Linha do tempo (ms desde o início; tudo é função do relógio, então a réplica que entra no meio
// da sequência — ageMs — cai no ponto certo e os eventos já vencidos são "stale"):
//      0  GOLPE FINAL: freeze-frame branco, estrondo, letterbox desce, a câmera dá um soco de zoom
//    140  ele cai de joelhos; a energia aqua começa a vazar pelo corpo
//    800  BATIMENTOS (6, cada vez mais rápidos e fortes): anel no chão + lente + rachaduras crescendo
//   3000  RUGIDO: corpo se estica, raios de luz, pedras levitam, partículas são sugadas pra dentro
//   4100  SILÊNCIO: som cortado, mundo vira aqua escuro e o tempo das partículas quase PARA
//   4750  DESINTEGRAÇÃO: clarão branco, câmera lenta, corpo vira 30 estilhaços, coluna de luz,
//         ondas de choque (lente + chão), o machado é lançado ao céu girando
//   6300  O machado despenca e crava no chão (impacto, poeira, relíquia que fica no mapa)
//   6300+ almas aqua sobem devagar; letterbox, zoom e vinheta voltam ao normal até 9000
import SettingsManager from '../systems/SettingsManager.js';
import MusicManager from '../systems/MusicManager.js';
import MinotaurAudio from '../systems/MinotaurAudio.js';
import BossCinematicCamera from '../systems/BossCinematicCamera.js';
import { ensureTremorTextures } from './MinotaurTremorFx.js';
import { acquirePipe, releasePipe } from './MinotaurEntranceFx.js';
import { reserveFx } from './FxBudget.js';

const HEARTBEATS = [800, 1320, 1800, 2240, 2600, 2900];
const ROAR = 3000;
const SILENCE = 4100;
const BLAST = 4750;
const LAND = 6300;
export const MINOTAUR_DEATH_END_MS = 9000;
const AQUA = 0x32e9d6;
const ICE = 0x9ff7ee;
const WHITE = 0xdffff7;
const TAU = Math.PI * 2;
const ADD = () => Phaser.BlendModes.ADD;
const clamp = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const out = t => 1 - (1 - clamp(t)) ** 3;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

// Rachaduras ramificadas (mesma geometria nas versões escura e brilhante).
function crackPaths() {
  const paths = [];
  const grow = (x, y, a, len, w, depth) => {
    const pts = [[x, y]];
    let walked = 0;
    while (walked < len) {
      a += rand(-0.38, 0.38);
      const seg = rand(12, 26);
      x += Math.cos(a) * seg; y += Math.sin(a) * seg; walked += seg;
      pts.push([x, y]);
      if (depth < 2 && walked > 40 && Math.random() < 0.22) {
        grow(x, y, a + (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1), len * rand(0.25, 0.45), w * 0.6, depth + 1);
      }
    }
    paths.push({ pts, w });
  };
  const arms = 11;
  for (let i = 0; i < arms; i++) grow(256, 256, i / arms * TAU + rand(-0.2, 0.2), rand(150, 235), 1, 0);
  return paths;
}

function ensureTextures(scene) {
  ensureTremorTextures(scene);
  if (!scene.textures.exists('minotaur_death_ring')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(9, AQUA, 0.12).strokeCircle(128, 128, 116);
    g.lineStyle(4, AQUA, 0.65).strokeCircle(128, 128, 116);
    g.lineStyle(1.5, WHITE, 1).strokeCircle(128, 128, 116);
    g.generateTexture('minotaur_death_ring', 256, 256);
    g.destroy();
  }
  if (!scene.textures.exists('minotaur_death_fissure')) {
    const paths = crackPaths();
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const stroke = (width, color, alpha) => {
      for (const { pts, w } of paths) {
        for (let i = 1; i < pts.length; i++) {
          const taper = 1 - i / pts.length * 0.6;
          g.lineStyle(Math.max(0.8, width * w * taper), color, alpha)
            .beginPath().moveTo(pts[i - 1][0], pts[i - 1][1]).lineTo(pts[i][0], pts[i][1]).strokePath();
        }
      }
    };
    stroke(9, 0x050b0c, 0.5); stroke(4.4, 0x020506, 0.95);
    g.generateTexture('minotaur_death_fissure', 512, 512);
    g.clear();
    stroke(10, AQUA, 0.14); stroke(4, AQUA, 0.6); stroke(1.6, WHITE, 1);
    g.generateTexture('minotaur_death_fissure_glow', 512, 512);
    g.destroy();
  }
  if (!scene.textures.exists('minotaur_death_scar2')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    for (let i = 0; i < 7; i++) g.fillStyle(0x070f11, 0.16).fillEllipse(192, 192, 340 - i * 36, 210 - i * 22);
    g.generateTexture('minotaur_death_scar2', 384, 384);
    g.destroy();
  }
}

export default class MinotaurDeathFx {
  constructor(scene, boss, onComplete, ageMs = 0, origin = null) {
    this.scene = scene;
    this.boss = boss;
    this.onComplete = onComplete;
    this.t = Number.isFinite(ageMs) ? Math.max(0, Math.min(ageMs, MINOTAUR_DEATH_END_MS - 1)) : 0;
    this.x = origin?.x ?? boss.x;
    this.y = origin?.y ?? boss.y;
    this.scale = boss.baseScale;
    this.height = boss.height * this.scale;
    this.footY = this.y + this.height * boss._shadowYFrac;
    this.side = boss.flipX ? -1 : 1;
    this.landX = this.x + this.side * 44;
    this.landY = this.footY + 5;
    this.lite = !!scene.sys.game.device.input.touch;
    this.flashK = SettingsManager.getReducedFlashes() ? 0.2 : 1;
    this.motionK = SettingsManager.getReducedMotion() ? 0.18 : 1;
    this.images = [];
    this.sounds = new Set();
    this.pausedSounds = new Set();
    this.done = false;
    this.nextEvent = 0;
    this.dtEma = 16;
    this.tintState = '';
    ensureTextures(scene);

    // chão
    this.scar = this.image('minotaur_death_scar2', 1.8, false).setPosition(this.x, this.footY).setScale(1.9, 1.5);
    this.fissure = this.image('minotaur_death_fissure', 2.1, false).setPosition(this.x, this.footY);
    this.fissureGlow = this.image('minotaur_death_fissure_glow', 2.2).setPosition(this.x, this.footY);
    this.pool = this.image('tremor_glow', 2.3).setTint(AQUA).setPosition(this.x, this.footY);
    this.rings = [
      ...HEARTBEATS.map((at, i) => ({ at, dur: 760, r: 78 + i * 16, a: 0.4 + i * 0.07, tint: AQUA })),
      { at: BLAST, dur: 1000, r: 540, a: 1, tint: WHITE },
      { at: BLAST + 130, dur: 1000, r: 410, a: 0.8, tint: AQUA },
      { at: BLAST + 300, dur: 1100, r: 300, a: 0.7, tint: AQUA },
      { at: BLAST + 520, dur: 1300, r: 660, a: 0.5, tint: WHITE },
      { at: LAND, dur: 700, r: 120, a: 0.9, tint: WHITE, land: true },
      { at: LAND + 140, dur: 850, r: 210, a: 0.6, tint: AQUA, land: true }
    ].map(def => ({ ...def, image: this.image('minotaur_death_ring', 2.4).setTint(def.tint) }));

    // luz
    this.aura = this.image('tremor_glow', 8.5).setTint(AQUA);
    this.core = this.image('tremor_glow', 10.5).setTint(WHITE);
    this.bodyKey = boss.isEnraged ? boss.idleTextureRageDisarmed : boss.idleTextureDisarmed;
    const hasBody = this.bodyKey && scene.textures.exists(this.bodyKey);
    this.bodyGlow = hasBody ? this.image(this.bodyKey, 8.7).setOrigin(boss.originX, boss.originY)
      .setFlipX(boss.flipX).setTintFill(AQUA) : null;
    this.beam = this.image('tremor_beam', 8.8).setOrigin(0.5, 1).setTint(AQUA);
    this.beamCore = this.image('tremor_beam', 8.9).setOrigin(0.5, 1).setTint(WHITE);
    const rayCount = this.lite ? 5 : 8;
    this.rays = Array.from({ length: rayCount }, (_, i) => ({
      base: i / rayCount * TAU + rand(-0.15, 0.15), len: rand(2.4, 4), image: this.image('tremor_beam', 8.4).setOrigin(0.5, 1).setTint(ICE)
    }));

    // arma
    this.axe = this.image('minotaur_axe_thrown_rage', 15, false).setOrigin(23 / 64, 40 / 64).setScale(2.8);
    this.axeGlow = this.image('tremor_glow', 14.8).setTint(AQUA);
    this.mound = this.image('tremor_pebble_b', 8.2, false).setTint(0x364448)
      .setPosition(this.landX, this.landY + 3).setScale(4.4, 1.25);

    // partículas
    this.pool_ = Array.from({ length: this.lite ? 64 : 140 }, () => ({
      image: this.image('tremor_spark', 14), live: false, age: 0, life: 1, kind: '', lift: false,
      x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 0, spin: 0, scale: 1, alpha: 1, phase: 0, tx: 0, ty: 0
    }));

    // estilhaços da silhueta (cada um gira em torno do próprio centro)
    this.fragments = [];
    if (hasBody) {
      const frame = scene.textures.getFrame(this.bodyKey);
      const cols = this.lite ? 4 : 6, rows = this.lite ? 4 : 5;
      const flip = boss.flipX ? -1 : 1;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const tx = (col + 0.5) / cols, ty = (row + 0.5) / rows;
        const image = this.image(this.bodyKey, 13, false).setOrigin(tx, ty).setFlipX(boss.flipX)
          .setCrop(col * frame.width / cols, row * frame.height / rows, frame.width / cols, frame.height / rows);
        this.fragments.push({
          image,
          ox: (tx - boss.originX) * frame.width * flip, oy: (ty - boss.originY) * frame.height,
          vx: 0, vy: 0, spin: 0, x0: 0, y0: 0, rot0: 0, sx: 1, sy: 1, state: -1
        });
      }
    }
    this.launched = false;

    this.camera = new BossCinematicCamera(scene);
    this.camera.focus({ x: this.x, y: this.y - 24 });
    this.pipe = acquirePipe(scene);
    if (this.pipe) {
      const f = this.pipe.fx;
      this.lens = [0, 1, 2].map(() => ({ wx: this.x, wy: this.footY, r: 0, a: 0 }));
      this.lens.forEach(l => f.rings.push(l));
      this.saved = { flash: f.flashColor, edge: f.edgeColor, grade: f.gradeColor, barSize: f.barSize };
      f.flashColor = [0.78, 1, 0.94];
      f.edgeColor = [0.45, 1, 0.9];
      f.gradeColor = [0.3, 0.95, 0.85];
      f.barSize = 0.085;
    }
    this.music = MusicManager.bossSound;
    this.musicVolume = this.music?.volume ?? 0;
    if (this.music) scene.tweens.killTweensOf(this.music);

    this.nextLeak = this.nextPull = this.nextLift = this.nextTrail = this.nextSoul = this.t;
    const beats = HEARTBEATS.map((at, i) => [at, stale => this.pulse(stale, i)]);
    this.events = [
      [0, stale => this.hit(stale)],
      [140, stale => { if (!stale) { this.burst(this.x, this.footY, this.lite ? 5 : 9, 'dust', 120); this.sound('sfx_minotaur_stomp', 0.4, 0.6); } }],
      ...beats,
      [ROAR, stale => { if (!stale) { this.sound('sfx_minotaur_cleave_roar', 1, 0.74); this.shake(560, 0.014); } }],
      [SILENCE, () => this.stopSounds()],
      [BLAST, stale => this.blast(stale)],
      [BLAST + 70, stale => { if (!stale) this.burst(this.x, this.y, this.lite ? 6 : 16, 'spark', 420); }],
      [BLAST + 150, stale => { if (!stale) { this.sound('sfx_minotaur_charge_impact', 0.6, 0.6); this.burst(this.x, this.footY, this.lite ? 6 : 12, 'dust', 200); } }],
      [BLAST + 300, stale => { if (!stale) { this.shake(420, 0.02); this.burst(this.x, this.y, this.lite ? 6 : 14, 'debris', 300); } }],
      [LAND, stale => this.land(stale)]
    ].sort((a, b) => a[0] - b[0]);
    this.tick = (_time, delta) => this.update(delta);
    this.shutdown = () => this.destroy();
    scene.events.on('update', this.tick);
    scene.events.once('shutdown', this.shutdown);
  }

  image(key, depth, additive = true) {
    const image = this.scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
    if (additive) image.setBlendMode(ADD());
    for (const cam of this.scene.cameras.cameras) if (cam !== this.scene.cameras.main) cam.ignore(image);
    this.images.push(image);
    return image;
  }

  sound(key, volume, rate = 1) {
    if (!this.scene.cache.audio.exists(key)) return;
    const sound = this.scene.sound.add(key, { volume: volume * SettingsManager.getSfx(), rate });
    this.sounds.add(sound);
    sound.once('complete', () => { this.sounds.delete(sound); this.pausedSounds.delete(sound); sound.destroy(); });
    sound.play();
  }

  stopSounds() {
    for (const sound of this.sounds) { sound.stop(); sound.destroy(); }
    this.sounds.clear();
    this.pausedSounds.clear();
  }

  shake(ms, intensity) { this.scene.cameras.main.shake(ms, intensity, true); }

  // ---------- eventos ----------
  hit(stale) {
    if (stale) return;
    this.sound('sfx_minotaur_heavy_axe_impact', 1, 0.68);
    this.sound('sfx_minotaur_hit3', 0.8, 0.8);
    this.shake(260, 0.026);
    this.burst(this.x, this.y, this.lite ? 6 : 12, 'spark', 260);
  }

  pulse(stale, i) {
    if (stale) return;
    const power = 0.45 + i * 0.11;
    this.sound('sfx_minotaur_stomp', 0.2 + i * 0.06, 0.62 + i * 0.015);
    this.shake(130, 0.005 + i * 0.0022);
    this.burst(this.x, this.y, this.lite ? 4 : 8, 'spark', 130 * power);
    this.burst(this.x, this.footY, this.lite ? 2 : 4, 'dust', 70);
  }

  blast(stale) {
    this.boss.setVisible(false);
    this.boss.shadow?.setVisible(false);
    this.launchFragments();
    for (const p of this.pool_) if (p.live && p.lift) { p.lift = false; p.gravity = 420; p.vy -= 90; }
    if (stale) return;
    this.shake(900, 0.045);
    if (!this.pipe) this.scene.cameras.main.flash(120, 215, 255, 245, true);
    this.sound('sfx_blastwave', 0.85, 0.8);
    this.sound('sfx_cyberus_explosion', 0.7, 0.65);
    this.sound('sfx_elite_explosion', 0.5, 0.7);
    this.sound('sfx_axe_explosion', 0.4, 0.6);
    try { MinotaurAudio.impact(this.scene, 1.4); } catch (e) { /* sem WebAudio: só as camadas de arquivo */ }
    this.burst(this.x, this.y, this.lite ? 12 : 26, 'debris', 270);
    this.burst(this.x, this.footY, this.lite ? 8 : 16, 'dust', 170);
    this.burst(this.x, this.y, this.lite ? 12 : 26, 'spark', 380);
  }

  land(stale) {
    if (stale) return;
    this.sound('sfx_minotaur_heavy_axe_impact', 0.8, 0.9);
    this.sound('sfx_axe_dirt', 0.65, 0.85);
    this.shake(320, 0.022);
    this.burst(this.landX, this.landY, this.lite ? 6 : 12, 'dust', 90);
    this.burst(this.landX, this.landY, this.lite ? 5 : 10, 'debris', 130);
    this.burst(this.landX, this.landY, this.lite ? 4 : 8, 'spark', 160);
  }

  // Pose do corpo em qualquer instante (usada pelo body() e como ponto de partida dos estilhaços).
  pose(t) {
    const hit = t < 140;
    const kneel = smooth((t - 140) / 520);
    const rise = smooth((t - (ROAR - 380)) / 520);
    const strain = clamp((t - 650) / (SILENCE - 650));
    const swell = smooth((t - (BLAST - 260)) / 260);
    const tremble = t >= SILENCE ? 0.25 : strain * this.motionK;
    const sx = hit ? 1.06 : lerp(1, 1.1, kneel) - rise * 0.14 + swell * 0.08;
    const sy = hit ? 0.95 : lerp(1, 0.7, kneel) + rise * 0.46 + swell * 0.06;
    return {
      sx: this.scale * sx, sy: this.scale * sy,
      x: this.x - this.side * 14 * kneel * (1 - rise) + Math.sin(t * 0.071) * tremble * 3.4,
      y: this.footY - this.height * sy * this.boss._shadowYFrac + Math.sin(t * 0.091) * tremble * 1.2 - rise * 8,
      rot: (kneel * 0.09 - rise * 0.17) * this.side * this.motionK
    };
  }

  // ---------- partículas ----------
  burst(x, y, count, kind, speed) {
    let remaining = reserveFx(this.scene, count);
    for (const p of this.pool_) {
      if (!remaining) break;
      if (p.live) continue;
      remaining--;
      this.spawn(p, x, y, kind, speed);
    }
  }

  spawn(p, x, y, kind, speed) {
    const a = rand(0, TAU), v = speed * rand(0.45, 1.1);
    p.live = true; p.age = 0; p.x = x; p.y = y; p.kind = kind; p.lift = false; p.drag = 0; p.phase = rand(0, TAU);
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v * 0.5 - rand(40, 130);
    p.gravity = 280; p.spin = rand(-5, 5); p.alpha = 0.95;
    let key = 'tremor_spark', tint = AQUA, add = true;
    if (kind === 'dust') {
      key = 'tremor_dust'; tint = 0x42565a; add = false; p.alpha = 0.38; p.gravity = 0; p.spin = 0;
      p.life = rand(1500, 2400); p.scale = rand(1.2, 2.3); p.vy = Math.sin(a) * v * 0.3 - 8;
    } else if (kind === 'debris' || kind === 'rock') {
      key = 'tremor_shard_a'; tint = 0x527172; add = false; p.life = rand(900, 1500); p.scale = rand(0.7, 1.6);
      p.gravity = 380;
      if (kind === 'rock') { p.lift = true; p.gravity = 40; p.vx *= 0.1; p.vy = -rand(40, 110); p.life = rand(2600, 3400); p.spin = rand(-1.5, 1.5); }
    } else if (kind === 'soul') {
      tint = Math.random() < 0.5 ? WHITE : ICE; p.life = rand(2600, 4400); p.scale = rand(0.5, 1.1);
      p.vx = rand(-8, 8); p.vy = -rand(35, 90); p.gravity = 0; p.spin = 0; p.alpha = 0.9;
    } else if (kind === 'pull') {
      tint = ICE; p.life = rand(520, 820); p.scale = rand(0.3, 0.7); p.vx = p.vy = 0; p.gravity = 0; p.spin = 0;
      const r = rand(150, 240), b = rand(0, TAU);
      p.x = x + Math.cos(b) * r; p.y = y + Math.sin(b) * r * 0.7; p.tx = x; p.ty = y;
    } else if (kind === 'trail') {
      p.life = rand(380, 620); p.scale = rand(0.35, 0.8); p.vx *= 0.15; p.vy *= 0.15; p.gravity = 0; p.spin = 0; tint = ICE;
    } else {
      p.life = rand(650, 1350); p.scale = rand(0.25, 0.65);
    }
    p.image.setTexture(key).setBlendMode(add ? ADD() : Phaser.BlendModes.NORMAL).setTint(tint)
      .setPosition(p.x, p.y).setRotation(a).setVisible(true);
  }

  partScale() {
    const t = this.t;
    if (t >= SILENCE && t < BLAST) return 0.06;
    if (t >= BLAST && t < BLAST + 1100) return lerp(0.3, 1, smooth((t - BLAST) / 1100));
    return 1;
  }

  // integral analítica de partScale() depois do BLAST (ms) — os estilhaços são função pura do tempo
  fragClock(age) {
    if (age <= 0) return 0;
    if (age < 1100) { const u = age / 1100; return 1100 * (0.3 * u + 0.7 * (u ** 3 - u ** 4 / 2)); }
    return 715 + (age - 1100);
  }

  emitters(dt) {
    const t = this.t, ok = this.dtEma < 35;
    if (!ok) return;
    if (t > 650 && t < SILENCE && t >= this.nextLeak) {
      this.nextLeak = t + (this.lite ? 170 : 100);
      this.burst(this.x + rand(-20, 20), this.y + rand(-25, 18), 2, 'spark', 75);
    }
    if (t > ROAR && t < SILENCE - 120 && t >= this.nextPull) {
      this.nextPull = t + (this.lite ? 110 : 55);
      this.burst(this.x, this.y - 10, 2, 'pull', 0);
    }
    if (t > HEARTBEATS[2] && t < SILENCE && t >= this.nextLift) {
      this.nextLift = t + (this.lite ? 380 : 220);
      this.burst(this.x + rand(-130, 130), this.footY + rand(-14, 14), 1, 'rock', 0);
    }
    if (t > BLAST + 60 && t < LAND && t >= this.nextTrail) {
      this.nextTrail = t + 45;
      this.burst(this.axe.x, this.axe.y, 1, 'trail', 20);
    }
    if (t > BLAST + 500 && t < LAND + 1800 && t >= this.nextSoul) {
      this.nextSoul = t + (this.lite ? 150 : 90);
      this.burst(this.x + rand(-90, 90), this.footY + rand(-25, 10), this.lite ? 1 : 2, 'soul', 0);
    }
  }

  stepParticles(dt) {
    const k = this.partScale();
    for (const p of this.pool_) {
      if (!p.live) continue;
      const step = dt * k;
      p.age += step;
      const u = clamp(p.age / p.life), s = step / 1000;
      if (u === 1) { p.live = false; p.image.setVisible(false); continue; }
      let alpha = p.alpha * (1 - smooth(u)), scale = p.scale * (1 - u * 0.35);
      if (p.kind === 'pull') {
        const f = Math.min(1, s * (2 + u * 14));
        p.x += (p.tx - p.x) * f; p.y += (p.ty - p.y) * f;
        alpha = p.alpha * (0.25 + 0.75 * u) * (1 - smooth((u - 0.88) / 0.12)); scale = p.scale * (1.2 - u * 0.6);
      } else {
        if (p.drag) { const d = Math.exp(-p.drag * s); p.vx *= d; p.vy *= d; }
        p.vy += p.gravity * s; p.x += p.vx * s; p.y += p.vy * s;
        if (p.kind === 'soul') {
          p.x += Math.sin(p.age * 0.003 + p.phase) * 14 * s;
          alpha = p.alpha * Math.min(1, u / 0.15) * (1 - smooth((u - 0.5) / 0.5));
          scale = p.scale * (0.8 + 0.4 * Math.sin(p.age * 0.006 + p.phase) * 0.5 + 0.2);
        } else if (p.kind === 'dust') scale = p.scale * (1 + u * 2);
      }
      p.image.setPosition(p.x, p.y).setRotation(p.image.rotation + p.spin * s).setScale(scale).setAlpha(alpha);
    }
  }

  // ---------- quadro ----------
  update(delta) {
    if (this.done) return;
    if (!this.boss.active) { this.destroy(); return; }
    const paused = this.scene.isPaused || this.scene.time.timeScale === 0;
    if (paused) {
      for (const sound of this.sounds) if (sound.isPlaying) { sound.pause(); this.pausedSounds.add(sound); }
      return;
    }
    for (const sound of this.pausedSounds) if (this.sounds.has(sound) && sound.isPaused) sound.resume();
    this.pausedSounds.clear();
    this.dtEma += (Math.min(delta, 100) - this.dtEma) * 0.08;
    const dt = Math.min(delta, 80) * this.scene.time.timeScale;
    this.t += dt;
    while (this.nextEvent < this.events.length && this.t >= this.events[this.nextEvent][0]) {
      const [at, fn] = this.events[this.nextEvent++];
      fn(this.t - at > 220);
    }
    this.body();
    this.light();
    this.shards();
    this.weapon();
    this.emitters(dt);
    this.stepParticles(dt);
    this.camera_();
    if (this.music && !this.music.pendingRemove && MusicManager.bossSound === this.music) {
      this.music.setVolume(this.musicVolume * (1 - smooth((this.t - 250) / (SILENCE - 250))));
    }
    if (this.t >= MINOTAUR_DEATH_END_MS) {
      const callback = this.onComplete;
      this.destroy(true);
      callback?.();
    }
  }

  setBodyTint(state) {
    if (state === this.tintState) return;
    this.tintState = state;
    const b = this.boss;
    if (state === 'white') b.setTintFill(WHITE);
    else if (state === 'aqua') b.setTintFill(AQUA);
    else if (state === 'dark') b.setTint(0x457773);
    else b.clearTint();
  }

  body() {
    const t = this.t, b = this.boss;
    if (t >= BLAST) { if (b.visible) { b.setVisible(false); b.shadow?.setVisible(false); } return; }
    const p = this.pose(t);
    const kneel = smooth((t - 140) / 520);
    const strain = clamp((t - 650) / (SILENCE - 650));
    b.setScale(p.sx, p.sy).setPosition(p.x, p.y).setRotation(p.rot).setAlpha(1);
    if (t < 140 && this.flashK > 0.5) this.setBodyTint('white');
    else if (t >= SILENCE) this.setBodyTint('dark');
    else if (this.flashK > 0.5 && strain > 0.25 && t < BLAST - 260 && Math.floor(t / lerp(260, 130, strain)) % 2 === 0) this.setBodyTint('aqua');
    else this.setBodyTint('');
    b._tfGlow = t >= SILENCE ? 0 : strain * 1.3;
    if (b.shadow?.active) b.shadow.setPosition(this.x, this.footY).setScale(1 + kneel * 0.12, 1);
    if (this.bodyGlow) {
      const pre = smooth((t - (BLAST - 260)) / 260);
      const energy = t >= SILENCE ? 0 : strain * (0.22 + 0.2 * Math.sin(t * 0.02));
      this.bodyGlow.setVisible(t >= 300 && (energy > 0.01 || pre > 0)).setPosition(p.x, p.y).setScale(p.sx, p.sy).setRotation(p.rot)
        .setAlpha(Math.max(energy, pre) * this.flashK);
      if (pre > 0) this.bodyGlow.setTintFill(WHITE);
    }
  }

  heartbeat() {
    let best = null;
    for (const at of HEARTBEATS) if (this.t >= at && this.t - at < 700) best = { age: this.t - at, power: 0.45 + HEARTBEATS.indexOf(at) * 0.11 };
    if (this.t >= LAND && this.t - LAND < 700) best = { age: this.t - LAND, power: 0.9 };
    return best;
  }

  light() {
    const t = this.t, age = t - BLAST;
    const tension = clamp((t - 450) / (SILENCE - 450));
    const silent = t >= SILENCE && t < BLAST;
    const shock = age >= 0 ? 1 - clamp(age / 700) : 0;
    const k = this.flashK;
    const beat = this.heartbeat();
    const spike = beat && t < SILENCE ? Math.exp(-beat.age / 140) : 0;

    const aura = t < BLAST ? (silent ? 0.03 : tension * (0.22 + 0.1 * Math.sin(t * 0.025)) + spike * 0.25) : shock * 0.85;
    this.aura.setVisible(true).setPosition(this.x, this.y).setScale(t < BLAST ? 1.2 + tension + spike * 0.8 : 2 + out(age / 500) * 5).setAlpha(aura * k);
    this.core.setVisible(true).setPosition(this.x, this.y - 8)
      .setScale(age < 0 ? (silent ? 0.16 : 0.3 + tension * 0.35 + spike * 0.4) : 0.3 + out(age / 220) * 4.2)
      .setAlpha((age < 0 ? (silent ? 0.35 : tension * 0.6 + spike * 0.3) : 1 - clamp(age / 260)) * k);

    // poça de energia sob ele, cresce com a tensão e vira a cicatriz
    const poolA = t < SILENCE ? tension * 0.5 + spike * 0.3 : t < BLAST ? 0.05 : Math.max(0, 1 - age / 2600) * 0.7;
    this.pool.setVisible(poolA > 0.01 && t > 300).setPosition(this.x, this.footY + 4).setScale(6.5 + tension * 2 + Math.max(0, age) / 900, 2.2).setAlpha(poolA * k);

    // coluna de luz
    let pw = 0, pa = 0;
    if (t >= ROAR && t < SILENCE) { const u = (t - ROAR) / (SILENCE - ROAR); pw = 0.5 + 0.9 * u; pa = 0.45 * u; }
    else if (t >= SILENCE && t < BLAST) { pw = 0.3; pa = 0.05; }
    else if (age >= 0) { const u = clamp(age / 2600); pw = 3.4 * (1 - out(u) * 0.85); pa = (1 - u) ** 1.5; }
    this.beam.setVisible(pa > 0.01).setPosition(this.x, this.footY).setScale(pw * k + pw * (1 - k) * 0.4, 9).setAlpha(pa * 0.75 * k);
    this.beamCore.setVisible(pa > 0.01).setPosition(this.x, this.footY).setScale(pw * 0.38, 9).setAlpha(pa * k);

    // raios radiais
    const rayA = age >= 0 ? Math.max(0, 1 - age / 1200) ** 2 * 0.65 : t >= ROAR && !silent ? tension * 0.14 + spike * 0.1 : 0;
    for (const ray of this.rays) {
      ray.image.setVisible(rayA > 0.01).setPosition(this.x, this.y - 6)
        .setRotation(ray.base + t * 0.00022).setScale(0.7 + (age >= 0 ? out(age / 500) * 0.8 : 0), ray.len * (age >= 0 ? 1 + out(age / 600) * 0.6 : 1))
        .setAlpha(rayA * k);
    }

    // rachaduras: crescem pelo chão a cada batimento e explodem no BLAST
    const grow = out((t - 700) / (BLAST - 700));
    const crackVis = t > 700;
    const fs = lerp(0.35, 1.9, grow);
    this.fissure.setVisible(crackVis).setScale(fs, fs * 0.62);
    this.fissure.setAlpha(t < BLAST ? 0.85 * clamp((t - 700) / 400) : 0.9);
    const glowA = t < SILENCE ? tension * 0.6 + spike * 0.4 : t < BLAST ? 0.03 : Math.max(0, 1 - (t - BLAST) / 3400) * 0.95;
    const gs = fs * (age > 0 ? 1 + out(age / 600) * 0.12 : 1);
    this.fissureGlow.setVisible(crackVis && glowA > 0.01).setScale(gs, gs * 0.62).setAlpha(glowA * k);
    this.scar.setVisible(t > 500).setAlpha(t < BLAST ? clamp((t - 500) / 900) * 0.7 : 0.95);

    // anéis no chão
    for (const ring of this.rings) {
      const u = (t - ring.at) / ring.dur;
      ring.image.setVisible(u >= 0 && u < 1);
      if (u < 0 || u >= 1) continue;
      const radius = ring.r * out(u);
      ring.image.setPosition(ring.land ? this.landX : this.x, ring.land ? this.landY : this.footY)
        .setScale(radius / 116, radius / 116 * 0.64).setAlpha((1 - u) ** 1.3 * ring.a * k);
    }
  }

  launchFragments() {
    if (this.launched || !this.fragments.length) return;
    this.launched = true;
    const p = this.pose(BLAST - 1);
    const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
    for (const f of this.fragments) {
      const lx = f.ox * p.sx, ly = f.oy * p.sy;
      f.x0 = p.x + (lx * cos - ly * sin);
      f.y0 = p.y + (lx * sin + ly * cos);
      f.sx = p.sx; f.sy = p.sy; f.rot0 = p.rot;
      const dx = f.x0 - p.x, dy = f.y0 - (p.y - this.height * 0.1);
      const len = Math.hypot(dx, dy) || 1;
      f.vx = dx / len * rand(110, 330) + rand(-40, 40);
      f.vy = dy / len * rand(80, 220) - rand(120, 260);
      f.spin = rand(-4, 4);
      f.image.setPosition(f.x0, f.y0).setScale(f.sx, f.sy).setRotation(f.rot0);
    }
  }

  shards() {
    if (this.t < BLAST) return;
    const age = this.t - BLAST;
    const F = this.fragClock(age) / 1000;
    for (const f of this.fragments) {
      const gone = F >= 1.7;
      f.image.setVisible(!gone);
      if (gone) continue;
      const state = F < 0.12 ? 0 : F < 0.45 ? 1 : 2;
      if (state !== f.state) {
        f.state = state;
        if (state === 0) f.image.setTintFill(WHITE); else if (state === 1) f.image.setTint(ICE); else f.image.clearTint();
      }
      const life = smooth(F / 1.7);
      f.image.setPosition(f.x0 + f.vx * F, f.y0 + f.vy * F + 0.5 * 260 * F * F)
        .setRotation(f.rot0 + f.spin * F * this.motionK)
        .setScale(f.sx * (1 - 0.25 * life), f.sy * (1 - 0.25 * life))
        .setAlpha(1 - smooth((F - 0.9) / 0.8));
    }
  }

  weapon() {
    const t = this.t;
    if (t < BLAST) return;
    this.axe.setVisible(true);
    if (t < LAND) {
      const u = clamp((t - BLAST) / (LAND - BLAST));
      this.axe.setPosition(lerp(this.x, this.landX, u), lerp(this.y - 20, this.landY, u) - Math.sin(Math.PI * u) * 270)
        .setRotation(lerp(-TAU * 2 - 1.35, -1.35, smooth(u)));
      this.axeGlow.setVisible(true).setPosition(this.axe.x, this.axe.y).setScale(1.3 + Math.sin(Math.PI * u) * 0.8).setAlpha(0.55 * this.flashK);
    } else {
      const age = (t - LAND) / 1000;
      this.axe.setDepth(8.1).setPosition(this.landX, this.landY)
        .setRotation(-1.35 + Math.sin(age * 29) * Math.exp(-age * 6) * 0.16 * this.motionK);
      this.mound.setVisible(true);
      const fade = 1 - smooth((t - LAND) / 2400);
      this.axeGlow.setVisible(fade > 0.01).setPosition(this.landX, this.landY - 20)
        .setScale(1.6 + Math.sin(t * 0.004) * 0.15).setAlpha(fade * 0.6 * this.flashK);
    }
  }

  // câmera de cinema: letterbox, zoom, vinheta, lente, clarão
  camera_() {
    if (!this.pipe) return;
    const f = this.pipe.fx, t = this.t, age = t - BLAST;
    const end = MINOTAUR_DEATH_END_MS;
    const tension = clamp((t - 450) / (SILENCE - 450));
    const shock = age >= 0 ? 1 - clamp(age / 900) : 0;
    const beat = this.heartbeat();
    const bars = smooth(t / 700) * (1 - smooth((t - (end - 1100)) / 1000));
    let zoom;
    if (t < BLAST) {
      zoom = 1 + 0.16 * smooth(t / SILENCE) + 0.08 * smooth((t - SILENCE) / (BLAST - SILENCE)) + 0.09 * Math.exp(-t / 160);
    } else {
      zoom = 1 + (1.10 + 0.14 * Math.exp(-age / 280) - 1) * (1 - smooth((t - LAND - 400) / (end - 600 - LAND - 400)));
    }
    const vig = t < BLAST ? 0.75 * smooth((t - 300) / (SILENCE - 300)) : 0.75 * (1 - smooth((t - BLAST) / (end - BLAST)));
    f.focusX = this.x; f.focusY = this.y;
    f.bars = bars;
    f.zoom = zoom;
    f.vignette = vig;
    f.gradeA = t < BLAST ? 0.42 * smooth((t - (ROAR - 200)) / 600) : 0.42 * (1 - smooth(age / 300));
    f.pinch = (t < SILENCE ? tension * 0.02 : t < BLAST ? 0.03 : -0.05 * shock) * this.motionK;
    f.blur = shock * 0.9 * this.motionK;
    f.aberr = (shock * 2.6 + (beat && t < SILENCE ? Math.exp(-beat.age / 160) * 0.8 : 0)) * this.flashK;
    f.splitX = shock * 0.006 * this.flashK;
    // clarão: sobe nos 90 ms antes do BLAST, estoura e decai; o pipeline já limita com "reduzir flashes"
    f.flashA = t < 140 ? 0.3 * (1 - t / 140) : age >= 0 ? (1 - clamp(age / 700)) ** 2 : smooth((t - (BLAST - 90)) / 90);
    const l = this.lens;
    const pa = beat ? beat.age / 700 : 1;
    l[0].wx = beat && t >= LAND ? this.landX : this.x; l[0].wy = beat && t >= LAND ? this.landY : this.footY;
    l[0].r = pa < 1 ? 0.02 + out(pa) * 0.4 : 0;
    l[0].a = pa < 1 ? (1 - pa) * 0.03 * (beat?.power ?? 0) * this.motionK : 0;
    for (let i = 1; i <= 2; i++) {
      const a = age - (i - 1) * 160;
      l[i].wx = this.x; l[i].wy = this.footY;
      l[i].r = a >= 0 ? 0.02 + out(a / 1100) * 1.0 : 0;
      l[i].a = a >= 0 && a < 1100 ? (1 - a / 1100) * (i === 1 ? 0.07 : 0.05) * this.motionK : 0;
    }
  }

  destroy(keepRelic = false) {
    if (this.done) return;
    this.done = true;
    this.scene.events.off('update', this.tick);
    this.scene.events.off('shutdown', this.shutdown);
    this.stopSounds();
    this.camera.release(!keepRelic);
    this.boss._tfGlow = 0;
    if (this.pipe) {
      const f = this.pipe.fx;
      for (const l of this.lens) { const at = f.rings.indexOf(l); if (at >= 0) f.rings.splice(at, 1); }
      f.zoom = 1; f.pinch = 0; f.blur = 0; f.aberr = 0; f.splitX = 0; f.flashA = 0;
      f.vignette = 0; f.gradeA = 0; f.bars = 0;
      f.flashColor = this.saved.flash; f.edgeColor = this.saved.edge;
      f.gradeColor = this.saved.grade; f.barSize = this.saved.barSize;
      releasePipe(this.scene, this.pipe);
      this.pipe = null;
    }
    for (const image of this.images) {
      if (keepRelic && (image === this.axe || image === this.mound || image === this.scar || image === this.fissure)) continue;
      image.destroy();
    }
    this.images.length = 0;
    this.pool_.length = 0;
    if (!keepRelic && this.music && !this.music.pendingRemove && MusicManager.bossSound === this.music) {
      MusicManager.applyLiveMusicVolume();
    }
  }
}
