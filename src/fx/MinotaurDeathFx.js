// Morte de encontro, não de fim de jogo. Um relógio próprio respeita pausa/level-up.
// Nenhuma física, hitbox, dano ou pausa global. Partículas em pool; nenhum tween.
import SettingsManager from '../systems/SettingsManager.js';
import MusicManager from '../systems/MusicManager.js';
import BossCinematicCamera from '../systems/BossCinematicCamera.js';
import { ensureTremorTextures } from './MinotaurTremorFx.js';
import { acquirePipe, releasePipe } from './MinotaurEntranceFx.js';
import { reserveFx } from './FxBudget.js';

const ROAR = 2050;
const SILENCE = 3180;
const BLAST = 3770;
const LAND = 4870;
export const MINOTAUR_DEATH_END_MS = 6900;
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
    this.nextEvent = 0;
    this.nextLeak = this.t;
    this.dtEma = 16;
    ensureTextures(scene);
    this.scar = this.image('minotaur_death_scar', 1.8, false).setPosition(this.x, this.footY);
    this.cracks = this.image('minotaur_death_cracks', 2.1).setPosition(this.x, this.footY);
    this.aura = this.image('tremor_glow', 8.5).setTint(AQUA);
    this.core = this.image('tremor_glow', 10.5).setTint(WHITE);
    this.beam = this.image('tremor_beam', 8.8).setOrigin(0.5, 1).setTint(AQUA);
    this.rings = Array.from({ length: 5 }, () => this.image('minotaur_death_ring', 2.4));
    this.axe = this.image('minotaur_axe_thrown_rage', 15, false)
      .setOrigin(23 / 64, 40 / 64).setScale(2.8);
    this.mound = this.image('tremor_pebble_b', 8.2, false).setTint(0x364448)
      .setPosition(this.landX, this.landY + 3).setScale(4.4, 1.25);
    this.pool = Array.from({ length: this.lite ? 48 : 96 }, () => ({
      image: this.image('tremor_spark', 14), live: false, age: 0, life: 1,
      x: 0, y: 0, vx: 0, vy: 0, gravity: 0, spin: 0, scale: 1, alpha: 1, dust: false
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
      [0, stale => { if (!stale) { this.sound('sfx_minotaur_heavy_axe_impact', 0.9, 0.72); this.shake(210, 0.021); } }],
      [480, stale => this.pulse(stale, 0.5)],
      [980, stale => this.pulse(stale, 0.75)],
      [1570, stale => this.pulse(stale, 1)],
      [ROAR, stale => { if (!stale) { this.sound('sfx_minotaur_cleave_roar', 0.95, 0.78); this.shake(430, 0.011); } }],
      [SILENCE, () => this.stopSounds()],
      [BLAST, stale => this.blast(stale)],
      [LAND, stale => this.land(stale)]
    ];
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

  burst(x, y, count, kind, speed) {
    let remaining = reserveFx(this.scene, count);
    for (const p of this.pool) {
      if (!remaining) break;
      if (p.live) continue;
      remaining--;
      const a = rand(0, TAU), v = speed * rand(0.45, 1.1);
      p.live = true; p.age = 0; p.x = x; p.y = y;
      p.dust = kind === 'dust';
      p.life = p.dust ? rand(1500, 2400) : rand(650, 1350);
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v * 0.5 - (p.dust ? 8 : rand(40, 130));
      p.gravity = p.dust ? 0 : 280;
      p.spin = p.dust ? 0 : rand(-5, 5);
      p.scale = p.dust ? rand(1.2, 2.3) : kind === 'debris' ? rand(0.7, 1.6) : rand(0.25, 0.65);
      p.alpha = p.dust ? 0.38 : 0.95;
      p.image.setTexture(p.dust ? 'tremor_dust' : kind === 'debris' ? 'tremor_shard_a' : 'tremor_spark')
        .setBlendMode(kind === 'spark' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setTint(p.dust ? 0x42565a : kind === 'debris' ? 0x527172 : AQUA)
        .setPosition(x, y).setRotation(a).setVisible(true);
    }
  }

  blast(stale) {
    this.boss.setVisible(false);
    this.boss.shadow?.setVisible(false);
    if (stale) return;
    this.shake(650, 0.035);
    this.scene.cameras.main.flash(85, 215, 255, 245, true);
    this.sound('sfx_blastwave', 0.95, 0.82);
    this.sound('sfx_cyberus_explosion', 0.7, 0.7);
    this.burst(this.x, this.y, this.lite ? 13 : 28, 'debris', 255);
    this.burst(this.x, this.footY, this.lite ? 8 : 14, 'dust', 155);
    this.burst(this.x, this.y, this.lite ? 12 : 25, 'spark', 350);
  }

  land(stale) {
    if (stale) return;
    this.sound('sfx_minotaur_heavy_axe_impact', 0.7, 0.92);
    this.sound('sfx_axe_dirt', 0.6, 0.85);
    this.shake(200, 0.012);
    this.burst(this.landX, this.landY, this.lite ? 5 : 9, 'dust', 60);
    this.burst(this.landX, this.landY, this.lite ? 4 : 7, 'debris', 90);
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
    this.body();
    this.light();
    this.weapon();
    const debrisAge = (this.t - BLAST) / 1000;
    for (const piece of this.fragments) {
      piece.image.setVisible(debrisAge >= 0 && debrisAge < 1.15);
      if (debrisAge < 0 || debrisAge >= 1.15) continue;
      piece.image.setPosition(this.x + piece.vx * debrisAge,
        this.y + piece.vy * debrisAge + 100 * debrisAge * debrisAge)
        .setRotation(piece.spin * debrisAge).setAlpha(1 - smooth(debrisAge / 1.15));
    }
    if (this.t > 550 && this.t < SILENCE && this.t >= this.nextLeak && this.dtEma < 35) {
      this.nextLeak = this.t + (this.lite ? 170 : 100);
      this.burst(this.x + rand(-20, 20), this.y + rand(-25, 18), 2, 'spark', 75);
    }
    for (const p of this.pool) {
      if (!p.live) continue;
      p.age += dt;
      const u = clamp(p.age / p.life), seconds = dt / 1000;
      if (u === 1) { p.live = false; p.image.setVisible(false); continue; }
      p.vy += p.gravity * seconds; p.x += p.vx * seconds; p.y += p.vy * seconds;
      p.image.setPosition(p.x, p.y).setRotation(p.image.rotation + p.spin * seconds)
        .setScale(p.scale * (p.dust ? 1 + u * 2 : 1 - u * 0.35))
        .setAlpha(p.alpha * (1 - smooth(u)));
    }
    if (this.music && !this.music.pendingRemove && MusicManager.bossSound === this.music) {
      this.music.setVolume(this.musicVolume * (1 - smooth((this.t - 350) / (SILENCE - 350))));
    }
    if (this.t >= MINOTAUR_DEATH_END_MS) {
      const callback = this.onComplete;
      this.destroy(true);
      callback?.();
    }
  }

  body() {
    if (this.t >= BLAST) return;
    const b = this.boss, t = this.t;
    const kneel = smooth((t - 100) / 500);
    const rise = smooth((t - (ROAR - 300)) / 450);
    const strain = clamp((t - 600) / 2000);
    const silence = t >= SILENCE;
    const tremble = silence ? 0 : strain * this.motionK;
    const sx = lerp(1, 1.09, kneel) - rise * 0.13;
    const sy = lerp(1, 0.69, kneel) + rise * 0.43;
    b.setScale(this.scale * sx, this.scale * sy);
    b.setPosition(this.x + Math.sin(t * 0.071) * tremble * 3,
      this.footY - this.height * sy * b._shadowYFrac + Math.sin(t * 0.091) * tremble);
    b.setRotation((kneel * 0.08 - rise * 0.13) * this.side * this.motionK);
    b.setAlpha(1);
    if (t < 95 && this.flashK > 0.5) b.setTintFill(WHITE);
    else if (silence) b.setTint(0x457773);
    else b.clearTint();
    b._tfGlow = silence ? 0 : strain * 1.3;
    if (b.shadow?.active) b.shadow.setPosition(this.x, this.footY).setScale(1 + kneel * 0.12, 1);
  }

  light() {
    const t = this.t, age = t - BLAST;
    const tension = clamp((t - 450) / (SILENCE - 450));
    const silent = t >= SILENCE && t < BLAST;
    const shock = age >= 0 ? 1 - clamp(age / 600) : 0;
    const aura = t < BLAST ? (silent ? 0.04 : tension * (0.25 + 0.12 * Math.sin(t * 0.025))) : shock * 0.8;
    this.aura.setVisible(true).setPosition(this.x, this.y).setScale(t < BLAST ? 1.2 + tension : 2 + out(age / 500) * 4)
      .setAlpha(aura * this.flashK);
    this.core.setVisible(true).setPosition(this.x, this.y - 8)
      .setScale(age < 0 ? (silent ? 0.18 : 0.3 + tension * 0.35) : 0.3 + out(age / 220) * 3.8)
      .setAlpha((age < 0 ? (silent ? 0.4 : tension * 0.65) : 1 - clamp(age / 240)) * this.flashK);
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
      f.pinch = t < SILENCE ? tension * 0.018 * this.motionK : 0;
      f.aberr = shock * 1.8 * this.flashK;
      f.flashA = 0; // flash único da câmera, já respeita a opção de acessibilidade.
      this.lens.r = 0.015 + out(age / 850) * 0.85;
      this.lens.a = age >= 0 && age < 850 ? (1 - age / 850) * 0.045 * this.motionK : 0;
    }
  }

  weapon() {
    const t = this.t;
    if (t < BLAST) return;
    this.axe.setVisible(true);
    if (t < LAND) {
      const u = clamp((t - BLAST) / (LAND - BLAST));
      this.axe.setPosition(lerp(this.x, this.landX, u),
        lerp(this.y - 20, this.landY, u) - Math.sin(Math.PI * u) * 155)
        .setRotation(lerp(-TAU - 1.35, -1.35, smooth(u)));
    } else {
      const age = (t - LAND) / 1000;
      this.axe.setDepth(8.1).setPosition(this.landX, this.landY)
        .setRotation(-1.35 + Math.sin(age * 29) * Math.exp(-age * 6) * 0.16 * this.motionK);
      this.mound.setVisible(true);
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
