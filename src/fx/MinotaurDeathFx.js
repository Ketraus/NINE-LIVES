// Morte de encontro, não de fim de jogo. Um relógio próprio respeita pausa/level-up.
// Nenhuma física, hitbox, dano ou pausa global. Partículas em pool; nenhum tween.
import SettingsManager from '../systems/SettingsManager.js';
import MusicManager from '../systems/MusicManager.js';
import BossCinematicCamera from '../systems/BossCinematicCamera.js';
import { ensureTremorTextures } from './MinotaurTremorFx.js';
import { acquirePipe, releasePipe } from './MinotaurEntranceFx.js';
import { reserveFx } from './FxBudget.js';
import MinotaurDeathIntro, { MINOTAUR_DEATH_INTRO_MS } from './MinotaurDeathIntro.js';

const ROAR = 2050;
const SILENCE = 3180;
const BLAST = 3770;
const LAND = 4870;
const FINALE = 6150;
const LEGACY_DEATH_END_MS = 6900;
export const MINOTAUR_DEATH_END_MS = MINOTAUR_DEATH_INTRO_MS + LEGACY_DEATH_END_MS;
const AQUA = 0x32e9d6;
const WHITE = 0xdffff7;
const TAU = Math.PI * 2;
const clamp = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const out = t => 1 - (1 - clamp(t)) ** 3;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

function ensureTextures(scene) {
  ensureTremorTextures(scene);
  if (scene.textures.exists('minotaur_death_ring')) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.lineStyle(9, AQUA, 0.12).strokeCircle(128, 128, 116);
  g.lineStyle(4, AQUA, 0.65).strokeCircle(128, 128, 116);
  g.lineStyle(1.5, WHITE, 1).strokeCircle(128, 128, 116);
  g.generateTexture('minotaur_death_ring', 256, 256);
  g.clear();
  g.fillStyle(0x0b171a, 0.6).fillEllipse(192, 192, 224, 139);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU;
    const r = rand(95, 172);
    const bend = a + rand(-0.18, 0.18);
    g.lineStyle(6, 0x091315, 0.8);
    g.beginPath().moveTo(192, 192);
    g.lineTo(192 + Math.cos(bend) * r * 0.48, 192 + Math.sin(bend) * r * 0.33);
    g.lineTo(192 + Math.cos(a) * r, 192 + Math.sin(a) * r * 0.68).strokePath();
  }
  g.generateTexture('minotaur_death_scar', 384, 384);
  g.clear();
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * TAU;
    const r = rand(65, 148);
    g.lineStyle(2, AQUA, 0.7);
    g.beginPath().moveTo(192 + Math.cos(a) * 17, 192 + Math.sin(a) * 12);
    g.lineTo(192 + Math.cos(a + 0.16) * r * 0.5, 192 + Math.sin(a + 0.16) * r * 0.34);
    g.lineTo(192 + Math.cos(a) * r, 192 + Math.sin(a) * r * 0.68).strokePath();
  }
  g.generateTexture('minotaur_death_cracks', 384, 384);
  g.destroy();
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
    this.finalPulse = 0;
    this.emberAcc = 0;
    this.nextEvent = 0;
    this.nextLeak = Math.max(0, this.t - MINOTAUR_DEATH_INTRO_MS);
    this.dtEma = 16;
    ensureTextures(scene);
    this.scar = this.image('minotaur_death_scar', 1.8, false).setPosition(this.x, this.footY);
    this.cracks = this.image('minotaur_death_cracks', 2.1).setPosition(this.x, this.footY);
    this.aura = this.image('tremor_glow', 8.5).setTint(AQUA);
    this.core = this.image('tremor_glow', 10.5).setTint(WHITE);
    this.singularityHalo = this.image('tremor_glow', 9.9).setTint(AQUA);
    this.singularity = this.image('tremor_glow', 11.1).setTint(WHITE);
    this.beam = this.image('tremor_beam', 8.8).setOrigin(0.5, 1).setTint(AQUA);
    this.rings = Array.from({ length: 5 }, () => this.image('minotaur_death_ring', 2.4));
    this.axe = this.image('minotaur_axe_thrown_rage', 15, false)
      .setOrigin(23 / 64, 40 / 64).setScale(2.8);
    this.mound = this.image('tremor_pebble_b', 8.2, false).setTint(0x364448)
      .setPosition(this.landX, this.landY + 3).setScale(4.4, 1.25);
    this.axeGlow = this.image('tremor_glow', 8.0).setTint(AQUA);
    this.axeRing = this.image('minotaur_death_ring', 7.9).setTint(AQUA);
    this.finalFlareH = this.image('tremor_glow', 14).setTint(WHITE);
    this.finalFlareV = this.image('tremor_glow', 14).setTint(WHITE);
    this.pool = Array.from({ length: this.lite ? 48 : 96 }, () => ({
      image: this.image('tremor_spark', 14), live: false, age: 0, life: 1,
      x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 0, spin: 0, scale: 1, alpha: 1, dust: false
    }));
    // Fragmentos reais da silhueta, sem repetir o machado embutido na arte.
    const bodyKey = boss.isEnraged ? boss.idleTextureRageDisarmed : boss.idleTextureDisarmed;
    this.fragments = [];
    if (bodyKey && scene.textures.exists(bodyKey)) {
      const frame = scene.textures.getFrame(bodyKey);
      const cols = this.lite ? 3 : 4, rows = 3;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const image = this.image(bodyKey, 13, false).setOrigin(boss.originX, boss.originY)
          .setFlipX(boss.flipX).setScale(this.scale)
          .setCrop(col * frame.width / cols, row * frame.height / rows, frame.width / cols, frame.height / rows);
        const angle = Math.atan2(row - 1, (col - (cols - 1) / 2) * (boss.flipX ? -1 : 1));
        this.fragments.push({ image, vx: Math.cos(angle) * rand(90, 190), vy: Math.sin(angle) * 90 - 85,
          spin: rand(-0.5, 0.5) });
      }
    }
    this.camera = new BossCinematicCamera(scene);
    this.camera.focus({ x: this.x, y: this.y });
    this.pipe = acquirePipe(scene);
    if (this.pipe) {
      this.lens = { wx: this.x, wy: this.footY, r: 0, a: 0 };
      this.pipe.fx.rings.push(this.lens);
      this.savedFlashColor = this.pipe.fx.flashColor;
      this.pipe.fx.flashColor = [0.78, 1, 0.94];
    }
    this.music = MusicManager.bossSound;
    this.musicVolume = this.music?.volume ?? 0;
    if (this.music) scene.tweens.killTweensOf(this.music);
    this.events = [
      [MINOTAUR_DEATH_INTRO_MS, stale => { if (!stale) { this.sound('sfx_minotaur_heavy_axe_impact', 0.9, 0.72); this.shake(210, 0.021); } }],
      [MINOTAUR_DEATH_INTRO_MS + 480, stale => this.pulse(stale, 0.5)],
      [MINOTAUR_DEATH_INTRO_MS + 980, stale => this.pulse(stale, 0.75)],
      [MINOTAUR_DEATH_INTRO_MS + 1570, stale => this.pulse(stale, 1)],
      [MINOTAUR_DEATH_INTRO_MS + ROAR, stale => { if (!stale) { this.sound('sfx_minotaur_cleave_roar', 0.95, 0.78); this.shake(430, 0.011); } }],
      [MINOTAUR_DEATH_INTRO_MS + SILENCE, () => this.stopSounds()],
      [MINOTAUR_DEATH_INTRO_MS + BLAST, stale => this.blast(stale)],
      [MINOTAUR_DEATH_INTRO_MS + LAND, stale => this.land(stale)],
      [MINOTAUR_DEATH_INTRO_MS + FINALE, stale => this.finale(stale)]
    ];
    this.intro = new MinotaurDeathIntro(this);
    this.tick = (_time, delta) => this.update(delta);
    this.shutdown = () => this.destroy();
    scene.events.on('update', this.tick);
    scene.events.once('shutdown', this.shutdown);
  }

  image(key, depth, additive = true) {
    const image = this.scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
    if (additive) image.setBlendMode(Phaser.BlendModes.ADD);
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

  pulse(stale, power) {
    if (stale) return;
    this.sound('sfx_minotaur_stomp', power * 0.27, 0.68);
    this.shake(140, power * 0.008);
    this.burst(this.x, this.y, this.lite ? 5 : 9, 'spark', 120 * power);
  }

  take() {
    const particle = this.pool.find((entry) => !entry.live);
    if (!particle) return null;
    particle.live = true;
    particle.age = 0;
    return particle;
  }

  spawn(particle, x, y, options = {}) {
    if (!particle) return null;
    const pick = (value, fallback) => {
      if (Array.isArray(value)) return rand(value[0], value[1]);
      return Number.isFinite(value) ? value : fallback;
    };
    const texture = options.texture || 'tremor_spark';
    const additive = options.add !== false;
    particle.live = true;
    particle.age = 0;
    particle.x = x;
    particle.y = y;
    particle.dust = options.dust === true;
    particle.life = Math.max(1, pick(options.life, 1000));
    particle.vx = pick(options.vx, 0);
    particle.vy = pick(options.vy, 0);
    particle.gravity = pick(options.gravity, 0);
    particle.drag = Math.max(0, pick(options.drag, 0));
    particle.spin = pick(options.spin, 0);
    particle.scale = pick(options.scale, 1);
    particle.alpha = pick(options.alpha, 1);
    particle.image.setTexture(texture)
      .setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setTint(options.tint ?? AQUA)
      .setPosition(x, y)
      .setRotation(pick(options.rotation, 0))
      .setScale(particle.scale)
      .setAlpha(particle.alpha)
      .setVisible(true);
    return particle;
  }

  burst(x, y, count, kind, speed, options = {}) {
    let remaining = reserveFx(this.scene, count);
    while (remaining-- > 0) {
      const particle = this.take();
      if (!particle) break;
      const angle = rand(0, TAU);
      const velocity = speed * rand(0.45, 1.1);
      const dust = kind === 'dust';
      this.spawn(particle, x, y, {
        texture: options.texture || (dust ? 'tremor_dust' : kind === 'debris' ? 'tremor_shard_a' : 'tremor_spark'),
        add: options.add ?? (kind === 'spark'),
        tint: options.tint ?? (dust ? 0x42565a : kind === 'debris' ? 0x527172 : AQUA),
        life: options.life ?? (dust ? [1500, 2400] : [650, 1350]),
        vx: options.vx ?? Math.cos(angle) * velocity,
        vy: options.vy ?? Math.sin(angle) * velocity * 0.5 - (dust ? 8 : rand(40, 130)),
        gravity: options.gravity ?? (dust ? 0 : 280),
        drag: options.drag ?? 0,
        spin: options.spin ?? (dust ? 0 : rand(-5, 5)),
        scale: options.scale ?? (dust ? [1.2, 2.3] : kind === 'debris' ? [0.7, 1.6] : [0.25, 0.65]),
        alpha: options.alpha ?? (dust ? 0.38 : 0.95),
        rotation: options.rotation ?? angle,
        dust
      });
    }
  }

  blast(stale) {
    this.boss.setVisible(false);
    this.boss.shadow?.setVisible(false);
    if (stale) return;
    this.finalPulse = 0;
    this.shake(650, 0.035);
    this.scene.cameras.main.flash(85, 215, 255, 245, true);
    this.sound('sfx_blastwave', 0.95, 0.82);
    this.sound('sfx_cyberus_explosion', 0.7, 0.7);
    this.burst(this.x, this.y, this.lite ? 13 : 28, 'debris', 255,
      { drag: 1.6, gravity: 70, life: [1100, 2200], scale: [0.7, 1.6] });
    this.burst(this.x, this.footY, this.lite ? 8 : 14, 'dust', 155,
      { drag: 0.8, gravity: -12, life: [1700, 2600], scale: [1.2, 2.4] });
    this.burst(this.x, this.y, this.lite ? 12 : 25, 'spark', 350,
      { drag: 1.2, gravity: -35, life: [1000, 1900], scale: [0.25, 0.75] });
    this.burst(this.x, this.y, this.lite ? 5 : 11, 'spark', 150,
      { drag: 0.4, gravity: -90, life: [1500, 2400], scale: [0.2, 0.5], tint: WHITE });
  }

  land(stale) {
    if (stale) return;
    this.sound('sfx_minotaur_heavy_axe_impact', 0.7, 0.92);
    this.sound('sfx_axe_dirt', 0.6, 0.85);
    this.shake(280, 0.016);
    this.burst(this.landX, this.landY, this.lite ? 5 : 9, 'dust', 60,
      { drag: 0.6, gravity: -18, life: [1500, 2300], scale: [1.2, 2.6] });
    this.burst(this.landX, this.landY, this.lite ? 4 : 7, 'debris', 90,
      { drag: 1.1, gravity: 45, life: [900, 1600], scale: [0.5, 1.2] });
    this.burst(this.landX, this.landY, this.lite ? 4 : 8, 'spark', 130,
      { drag: 0.5, gravity: -45, life: [1100, 1900], scale: [0.2, 0.5], tint: WHITE });
  }

  finale(stale) {
    if (stale) return;
    this.finalPulse = 1;
    this.shake(360, 0.016);
    this.scene.cameras.main.flash(75, 190, 245, 220, true);
    this.sound('sfx_minotaur_heavy_axe_impact', 0.42, 0.56);
    this.burst(this.landX, this.landY, this.lite ? 5 : 10, 'spark', 170,
      { drag: 0.6, gravity: -70, life: [900, 1500], scale: [0.2, 0.55], tint: WHITE });
    this.burst(this.landX, this.landY, this.lite ? 3 : 6, 'dust', 45,
      { drag: 0.4, gravity: -8, life: [1100, 1800], scale: [1, 1.8] });
  }

  emitAfterglow(t, dt) {
    if (t < BLAST || t > FINALE + 360 || this.dtEma >= 35) return;
    this.emberAcc += dt;
    const every = this.lite ? 150 : 78;
    while (this.emberAcc >= every) {
      this.emberAcc -= every;
      if (!reserveFx(this.scene, 1)) return;
      const particle = this.take();
      if (!particle) return;
      const age = clamp((t - BLAST) / 1800);
      const angle = rand(0, TAU);
      const radius = rand(20, 125) * (0.85 + age * 0.35);
      const sx = this.x + Math.cos(angle) * radius;
      const sy = this.y + Math.sin(angle) * radius * 0.64;
      this.spawn(particle, sx, sy, {
        texture: 'tremor_spark',
        add: true,
        tint: Math.random() < 0.28 ? WHITE : AQUA,
        life: [700, 1350],
        scale: [0.18, 0.48],
        alpha: 0.72,
        vx: Math.cos(angle) * rand(18, 58) - Math.sin(angle) * rand(8, 22),
        vy: -rand(28, 95) + Math.sin(angle) * 16,
        gravity: -22,
        drag: 0.5,
        spin: rand(-2, 2),
        rotation: angle
      });
    }
  }

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
    const phaseT = this.t - MINOTAUR_DEATH_INTRO_MS;
    if (phaseT < 0) {
      this.intro.body(this.t);
    } else {
      this.body(phaseT);
      this.light(phaseT);
      this.weapon(phaseT);
    }
    this.intro.update(this.t, dt);
    this.finalPulse = Math.max(0, this.finalPulse - dt / 900);
    this.emitAfterglow(phaseT, dt);
    const debrisAge = (phaseT - BLAST) / 1000;
    for (const piece of this.fragments) {
      piece.image.setVisible(debrisAge >= 0 && debrisAge < 1.15);
      if (debrisAge < 0 || debrisAge >= 1.15) continue;
      piece.image.setPosition(this.x + piece.vx * debrisAge,
        this.y + piece.vy * debrisAge + 100 * debrisAge * debrisAge)
        .setRotation(piece.spin * debrisAge).setAlpha(1 - smooth(debrisAge / 1.15));
    }
    if (phaseT > 550 && phaseT < SILENCE && phaseT >= this.nextLeak && this.dtEma < 35) {
      this.nextLeak = phaseT + (this.lite ? 170 : 100);
      this.burst(this.x + rand(-20, 20), this.y + rand(-25, 18), 2, 'spark', 75);
    }
    for (const p of this.pool) {
      if (!p.live) continue;
      p.age += dt;
      const u = clamp(p.age / p.life), seconds = dt / 1000;
      if (u === 1) { p.live = false; p.image.setVisible(false); continue; }
      const drag = Math.max(0, 1 - p.drag * seconds);
      p.vx *= drag;
      p.vy *= drag;
      p.vy += p.gravity * seconds;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.image.setPosition(p.x, p.y).setRotation(p.image.rotation + p.spin * seconds)
        .setScale(p.scale * (p.dust ? 1 + u * 2 : 1 - u * 0.35))
        .setAlpha(p.alpha * (1 - smooth(u)));
    }
    if (this.music && !this.music.pendingRemove && MusicManager.bossSound === this.music) {
      const musicT = this.t < MINOTAUR_DEATH_INTRO_MS ? this.t : SILENCE + phaseT;
      this.music.setVolume(this.musicVolume * (1 - smooth((musicT - 350) / (SILENCE - 350))));
    }
    if (this.t >= MINOTAUR_DEATH_END_MS) {
      const callback = this.onComplete;
      this.destroy(true);
      callback?.();
    }
  }

  body(t) {
    if (t >= BLAST) return;
    const b = this.boss;
    const carry = 1 - smooth(t / 520);
    const kneel = smooth((t - 120) / 620);
    const rise = smooth((t - (ROAR - 300)) / 450);
    const strain = clamp((t - 520) / 2300);
    const silence = t >= SILENCE;
    const tremble = silence
      ? 0
      : (3 * carry + (0.4 + 2.6 * smooth((t - 700) / 2300)) * (1 - carry)) * this.motionK;
    // Começa exatamente na pose em que a introdução termina e só depois
    // deixa o peso do colosso desabar, evitando um corte visível entre fases.
    const sx = lerp(0.982, 1, 1 - carry) * (1 + 0.09 * kneel) - rise * 0.13;
    const sy = lerp(1.055, 1, 1 - carry) * (1 - 0.31 * kneel) + rise * 0.43;
    const settleX = lerp(-this.side * 30, 0, 1 - carry);
    b.setScale(this.scale * sx, this.scale * sy);
    b.setPosition(this.x + settleX + Math.sin(t * 0.071) * tremble * 3,
      this.footY - this.height * sy * b._shadowYFrac + Math.sin(t * 0.091) * tremble);
    b.setRotation((-this.side * 0.105 * carry + kneel * 0.08 - rise * 0.13) * this.motionK);
    b.setAlpha(1);
    if (t < 95 && this.flashK > 0.5) b.setTintFill(WHITE);
    else if (silence) b.setTint(0x457773);
    else b.clearTint();
    b._tfGlow = silence ? 0 : strain * 1.3 + smooth((t - 1700) / 1000) * 0.35;
    if (b.shadow?.active) {
      b.shadow.setPosition(this.x + settleX, this.footY)
        .setScale(1 + kneel * 0.12 + smooth((t - 1800) / 700) * 0.12, 1);
    }
  }

  light(t) {
    const age = t - BLAST;
    const tension = clamp((t - 450) / (SILENCE - 450));
    const silent = t >= SILENCE && t < BLAST;
    const shock = age >= 0 ? 1 - clamp(age / 600) : 0;
    const aura = t < BLAST ? (silent ? 0.04 : tension * (0.25 + 0.12 * Math.sin(t * 0.025))) : shock * 0.8;
    this.aura.setVisible(true).setPosition(this.x, this.y).setScale(t < BLAST ? 1.2 + tension : 2 + out(age / 500) * 4)
      .setAlpha(aura * this.flashK);
    this.core.setVisible(true).setPosition(this.x, this.y - 8)
      .setScale(age < 0 ? (silent ? 0.18 : 0.3 + tension * 0.35) : 0.3 + out(age / 220) * 3.8)
      .setAlpha((age < 0 ? (silent ? 0.4 : tension * 0.65) : 1 - clamp(age / 240)) * this.flashK);
    const pressure = smooth((t - 1250) / 1850);
    const implosion = smooth((t - (SILENCE - 720)) / 720);
    const collapseA = t < BLAST
      ? 0.08 + pressure * 0.24 + implosion * 0.34
      : shock * 0.78 + this.finalPulse * 0.42;
    const collapseScale = t < BLAST
      ? 0.7 + pressure * 0.85 - implosion * 0.45
      : 0.22 + out(age / 260) * 2.7;
    this.singularityHalo.setVisible(collapseA > 0.004).setPosition(this.x, this.y - 8)
      .setScale(collapseScale * 1.9, collapseScale * 1.25)
      .setAlpha(Math.min(0.8, collapseA * 0.7) * this.flashK);
    this.singularity.setVisible(collapseA > 0.004).setPosition(this.x, this.y - 8)
      .setScale(collapseScale * (0.55 + 0.12 * Math.sin(t * 0.035)), collapseScale)
      .setAlpha(Math.min(1, collapseA * 1.25) * this.flashK);
    this.beam.setVisible(age >= 0 && age < 750).setPosition(this.x, this.footY)
      .setScale((0.6 + shock * 2) * this.flashK, 2.2).setAlpha(shock * 0.65 * this.flashK);
    this.scar.setVisible(age >= 0).setAlpha(0.85);
    this.cracks.setVisible(t > 900).setAlpha((age < 0 ? (silent ? 0.03 : tension * 0.6) : (1 - clamp(age / 1900))) * this.flashK);
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const at = i < 3 ? BLAST + i * 115 : i === 3 ? ROAR : LAND;
      const duration = i < 3 ? 820 : 600;
      const u = (t - at) / duration;
      ring.setVisible(u >= 0 && u < 1);
      if (u < 0 || u >= 1) continue;
      const radius = (i < 3 ? 310 - i * 50 : i === 3 ? 110 : 65) * out(u);
      ring.setPosition(i === 4 ? this.landX : this.x, i === 4 ? this.landY : this.footY)
        .setScale(radius / 116, radius / 116 * 0.68).setAlpha((1 - u) * this.flashK);
    }
    if (this.pipe) {
      const f = this.pipe.fx;
      f.focusX = this.x; f.focusY = this.y;
      f.pinch = t < SILENCE ? tension * 0.018 * this.motionK : -this.finalPulse * 0.012 * this.motionK;
      f.aberr = Math.max(shock * 1.8, this.finalPulse * 1.35) * this.flashK;
      f.flashA = 0; // flash único da câmera, já respeita a opção de acessibilidade.
      this.lens.r = 0.015 + out(age / 850) * 0.85 + this.finalPulse * 0.18;
      this.lens.a = age >= 0 && age < 850 ? (1 - age / 850) * 0.045 * this.motionK : 0;
      this.lens.a += this.finalPulse * 0.05 * this.motionK;
    }
  }

  weapon(t) {
    if (t < BLAST) {
      this.axeGlow.setVisible(false);
      this.axeRing.setVisible(false);
      this.finalFlareH.setVisible(false);
      this.finalFlareV.setVisible(false);
      return;
    }
    this.axe.setVisible(true);
    if (t < LAND) {
      const u = clamp((t - BLAST) / (LAND - BLAST));
      this.axe.setPosition(lerp(this.x, this.landX, u),
        lerp(this.y - 20, this.landY, u) - Math.sin(Math.PI * u) * 155)
        .setRotation(lerp(-TAU - 1.35, -1.35, smooth(u)));
      this.axeGlow.setVisible(true).setPosition(this.axe.x, this.axe.y)
        .setScale(0.5 + (1 - u) * 0.65).setAlpha((0.18 + (1 - u) * 0.28) * this.flashK);
      this.axeRing.setVisible(false);
    } else {
      const age = (t - LAND) / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(age * 10.5);
      this.axe.setDepth(8.1).setPosition(this.landX, this.landY)
        .setRotation(-1.35 + Math.sin(age * 29) * Math.exp(-age * 6) * 0.16 * this.motionK);
      this.mound.setVisible(true);
      this.axeGlow.setVisible(true).setPosition(this.landX, this.landY - 4)
        .setScale(0.72 + pulse * 0.15 + this.finalPulse * 0.5, 0.52 + pulse * 0.1)
        .setAlpha((0.16 + pulse * 0.08 + this.finalPulse * 0.3) * this.flashK);
      this.axeRing.setVisible(true).setPosition(this.landX, this.landY)
        .setScale(0.38 + pulse * 0.07 + this.finalPulse * 0.28,
          (0.38 + pulse * 0.07 + this.finalPulse * 0.28) * 0.68)
        .setAlpha((0.14 + pulse * 0.06 + this.finalPulse * 0.34) * this.flashK);
    }
    const flareAge = t - FINALE;
    const flareOn = flareAge >= 0 && flareAge < 360;
    const flareU = clamp(flareAge / 360);
    const flareA = (1 - flareU) ** 2 * this.finalPulse * this.flashK;
    this.finalFlareH.setVisible(flareOn).setPosition(this.landX, this.landY - 8)
      .setScale(2.5 + 8 * out(flareU), 0.02 + 0.18 * (1 - flareU)).setAlpha(flareA);
    this.finalFlareV.setVisible(flareOn).setPosition(this.landX, this.landY - 8)
      .setScale(0.02 + 0.16 * (1 - flareU), 1.8 + 4.5 * out(flareU)).setAlpha(flareA * 0.85);
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
      const f = this.pipe.fx, at = f.rings.indexOf(this.lens);
      if (at >= 0) f.rings.splice(at, 1);
      f.pinch = 0; f.aberr = 0; f.flashA = 0;
      f.flashColor = this.savedFlashColor;
      releasePipe(this.scene, this.pipe);
      this.pipe = null;
    }
    for (const image of this.images) {
      if (keepRelic && (image === this.axe || image === this.mound || image === this.scar)) continue;
      image.destroy();
    }
    this.images.length = 0;
    this.pool.length = 0;
    if (!keepRelic && this.music && !this.music.pendingRemove && MusicManager.bossSound === this.music) {
      MusicManager.applyLiveMusicVolume();
    }
  }
}
