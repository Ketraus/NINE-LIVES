// Arena instável do Minotauro (fase 2 / fúria): rachaduras temporárias surgem
// sozinhas perto dele, soltando feixes e pulsos de energia aqua. Nos ataques o
// ritmo, o tamanho e o brilho sobem. Só visual: sem dano, sem colisão, sem som.
//
// Reaproveita a linguagem da cena de aparição (MinotaurTremorFx): feixe de luz
// ('tremor_beam'), brilho ('tremor_glow') e faíscas ('tremor_spark') são as MESMAS
// texturas; as rachaduras são o mesmo desenho (caminhada aleatória com ramos,
// núcleo escuro + fio de energia), só que pré-assado UMA vez em pixel art
// (6 variações, filtro NEAREST) — em jogo cada rachadura é só um par de imagens.
//
// Performance (mobile em primeiro lugar):
//   - tudo em pools de tamanho fixo (cria sob demanda até o teto, nunca destrói/recria
//     durante a luta); nenhum tween, nenhum Graphics e nenhuma alocação por frame —
//     um único update, dirigido pelo preUpdate do boss
//   - tetos simultâneos: 3 rachaduras / 3 feixes / 3 pulsos / 6 faíscas no mobile
//     (6 / 6 / 6 / 14 no desktop); feixes, pulsos e faíscas ainda passam pelo
//     orçamento compartilhado (FxBudget.reserveFx)
//   - qualidade adaptativa: se o frame time piora, os tetos caem pela metade e,
//     se piora muito, nada novo nasce (o que já existe só termina de sumir)
//   - descarte fora da câmera: nada nasce fora da tela e o que sai dela é solto na hora
//   - congela junto da pausa/level-up (scene.isPaused, timeScale 0) e some ao morrer/fim de jogo
//
// Para NÃO confundir com os avisos (telegraphs):
//   - tudo fica ABAIXO da profundidade dos avisos (depth 4) e do boss/jogador (9/10)
//   - só linhas finas irregulares, feixes verticais finos, brilhos macios e faíscas:
//     nada de área preenchida, cone, círculo ou anel (o vocabulário dos avisos)
//   - nada nasce dentro de um aviso ativo (investida, giro, machado, corte, pisão,
//     salto e círculos de meteoro); se um aviso abrir por cima de uma rachadura que
//     já existe, ela escurece enquanto durar
//   - enquanto o boss está num aviso, a arena "segura o fôlego": sem feixes, pulsos
//     nem faíscas, rachaduras raras e mais fracas; a energia estoura quando o golpe sai
//
// Uso (ver Minotaur.js): new MinotaurArenaFx(scene, boss) no construtor,
// update(time, delta) no preUpdate e destroy() no destroy do boss.

import SettingsManager from '../systems/SettingsManager.js';
import { reserveFx } from './FxBudget.js';
import { ensureTremorTextures } from './MinotaurTremorFx.js';

const ADD = Phaser.BlendModes.ADD;
const TAU = Math.PI * 2;

// texturas da cena de aparição (ensureTremorTextures garante que existem)
const BEAM_KEY = 'tremor_beam'; // 48x256, origem na base
const GLOW_KEY = 'tremor_glow'; // 128x128, brilho radial macio
const SPARK_KEY = 'tremor_spark'; // 16x16, ponto de luz

// rachaduras pré-assadas em pixel art
const CRACK_VARIANTS = 6;
const CRACK_SIZE = 64; // px da textura; em jogo vira escala inteira (2 a 4) = pixel grosso
const CRACK_SQUASH = 0.72; // achatamento do chão (mesma perspectiva dos FX do boss)
const CORE_KEYS = Array.from({ length: CRACK_VARIANTS }, (_, i) => `arena_crack_core_${i}`);
const GLOW_KEYS = Array.from({ length: CRACK_VARIANTS }, (_, i) => `arena_crack_glow_${i}`);

// paleta aqua da fase 2 (a mesma dos FX do meteoro/pisão)
const AQUA = 0x32e9d6;
const AQUA_MID = 0x29cbbd;
const AQUA_LIGHT = 0xbafff1;
const AQUA_PALE = 0xd9fff9;
const AQUA_DARK = 0x0d5860;

// profundidades: tudo abaixo dos avisos (4), do boss (9) e do jogador (10)
const D_CRACK = 2.3;
const D_CRACK_GLOW = 2.4;
const D_PULSE = 2.45;
const D_BEAM = 3.4;
const D_SPARK = 3.6;

const OPEN_MS = 190; // rachadura abrindo
const FADE_MS = 620; // rachadura se fechando
const FADE_FAST_MS = 320; // quando o boss morre / o jogo acaba

// estados de aviso (o boss parado preparando um golpe)
const TELEGRAPH_STATES = new Set([
  'charge_telegraph', 'charge_swing_telegraph', 'axe_telegraph',
  'cleave_telegraph', 'cleave_pause', 'stomp_raise', 'leap_crouch'
]);
// força do estouro quando o golpe SAI (aviso -> ataque)
const STRIKE_BURST = {
  charge_telegraph: 0.85,
  charge_swing_telegraph: 0.8,
  axe_telegraph: 0.75,
  cleave_telegraph: 0.8,
  cleave_pause: 1,
  stomp_raise: 1,
  leap_crouch: 0.55
};

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------- texturas

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bresenham(x0, y0, x1, y1, plot) {
  let dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const css = (hex, a) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

// Uma rachadura em estrela (centro da textura), 4 a 6 braços com ramos, em pixel de 1px:
//   core -> fenda escura com borda (2px de espessura)
//   glow -> fio de energia aqua com halo de 1px e pontos quentes (usado em ADD, sem tint)
function bakeCrackVariant(scene, v) {
  if (scene.textures.exists(CORE_KEYS[v])) return;
  const rng = mulberry32(0x9e3779b1 ^ (v * 7919 + 17));
  const mid = CRACK_SIZE / 2;
  const pixels = new Map(); // y * SIZE + x -> ordem de inserção
  const add = (x, y) => {
    if (x < 1 || y < 1 || x > CRACK_SIZE - 3 || y > CRACK_SIZE - 3) return;
    const k = y * CRACK_SIZE + x;
    if (!pixels.has(k)) pixels.set(k, pixels.size);
  };
  const walk = (x, y, ang, len, wander, seg0, seg1) => {
    const pts = [[x, y]];
    let acc = 0;
    while (acc < len) {
      ang += (rng() - 0.5) * 2 * wander;
      const seg = seg0 + rng() * (seg1 - seg0);
      x += Math.cos(ang) * seg;
      y += Math.sin(ang) * seg * CRACK_SQUASH;
      pts.push([x, y]);
      acc += seg;
    }
    return pts;
  };
  const trace = (pts) => {
    for (let i = 1; i < pts.length; i += 1) {
      bresenham(Math.round(pts[i - 1][0]), Math.round(pts[i - 1][1]),
        Math.round(pts[i][0]), Math.round(pts[i][1]), add);
    }
  };

  const arms = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < arms; i += 1) {
    const ang = (TAU * i) / arms + (rng() - 0.5) * 0.7;
    const len = 13 + rng() * 17;
    const pts = walk(mid, mid, ang, len, 0.5, 2, 4);
    trace(pts);
    [0.4, 0.7].forEach((frac) => {
      if (rng() < 0.45) return;
      const from = pts[Math.floor((pts.length - 1) * frac)];
      const sign = rng() < 0.5 ? -1 : 1;
      trace(walk(from[0], from[1], ang + (0.6 + rng() * 0.5) * sign, 5 + rng() * 7, 0.55, 2, 3.5));
    });
  }
  for (let y = mid - 1; y <= mid; y += 1) for (let x = mid - 2; x <= mid + 1; x += 1) add(x, y); // miolo

  const list = Array.from(pixels.entries()); // [chave, ordem]
  const at = (key) => [key % CRACK_SIZE, Math.floor(key / CRACK_SIZE)];

  const core = scene.textures.createCanvas(CORE_KEYS[v], CRACK_SIZE, CRACK_SIZE);
  const cctx = core.getContext();
  list.forEach(([key]) => {
    const [x, y] = at(key);
    cctx.fillStyle = css(0x061014, 0.95);
    cctx.fillRect(x, y, 1, 1);
    cctx.fillStyle = css(0x0a181e, 0.8);
    cctx.fillRect(x, y + 1, 1, 1);
    cctx.fillStyle = css(0x0a181e, 0.55);
    cctx.fillRect(x + 1, y, 1, 1);
  });
  core.refresh();
  core.setFilter(Phaser.Textures.FilterMode.NEAREST);

  const glow = scene.textures.createCanvas(GLOW_KEYS[v], CRACK_SIZE, CRACK_SIZE);
  const gctx = glow.getContext();
  gctx.fillStyle = css(AQUA_DARK, 0.32); // halo de 1px em volta do fio
  list.forEach(([key]) => {
    const [x, y] = at(key);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
      if (!pixels.has((y + oy) * CRACK_SIZE + x + ox)) gctx.fillRect(x + ox, y + oy, 1, 1);
    });
  });
  list.forEach(([key, order]) => {
    const [x, y] = at(key);
    gctx.fillStyle = css(AQUA_MID, 0.95);
    gctx.fillRect(x, y, 1, 1);
    if (order % 3 === 0) {
      gctx.fillStyle = css(AQUA_LIGHT, 1); // pontos quentes
      gctx.fillRect(x, y, 1, 1);
    }
  });
  glow.refresh();
  glow.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// ---------------------------------------------------------------- geometria dos avisos

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / len2);
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------- controlador

export default class MinotaurArenaFx {
  constructor(scene, boss) {
    this.scene = scene;
    this.boss = boss;
    this.mobile = !!scene.sys.game.device.input.touch;
    this.cap = this.mobile
      ? { cracks: 3, beams: 3, pulses: 3, sparks: 6 }
      : { cracks: 6, beams: 6, pulses: 6, sparks: 14 };
    this.cracks = [];
    this.beams = [];
    this.pulses = [];
    this.sparks = [];
    this.live = 0; // objetos vivos (todas as pools)
    this.liveCracks = 0;
    this.liveBeams = 0;
    this.livePulses = 0;
    this.liveSparks = 0;

    this.clock = 0; // relógio próprio (ms): congela na pausa
    this.quality = 1; // 1 normal, 0.5 reduzido, 0 nada novo
    this.dtEma = 1000 / 60;
    this.nextQualityAt = 0;
    this.reducedFlashes = false;
    this.reducedMotion = false;
    this.level = 0; // intensidade suavizada 0..1 (ataque = alto)
    this.boost = 0; // estouro do golpe, decai rápido
    this.nextCrackAt = 0;
    this.nextBeamAt = 0;
    this.nextPulseAt = 0;
    this.nextSparkAt = 0;

    this.st = this._state();
    this.prevState = this.st;
    this.wasEnraged = boss.isEnraged === true;
    this.warm = 0; // 0 = nada assado; 1..CRACK_VARIANTS = quantas variações já foram
    this.destroyed = false;
    this._pt = { x: 0, y: 0 };
  }

  // ---------------------------------------------------------------- ciclo

  update(time, delta) {
    if (this.destroyed) return;
    const scene = this.scene;
    const boss = this.boss;

    // Assa as texturas em segundo plano (1 por frame) durante a fase 1: nada de pico na fúria.
    if (this.warm <= CRACK_VARIANTS) this._warmStep(boss.isEnraged === true);

    const ts = scene.time.timeScale;
    if (scene.isPaused || ts === 0) return; // pausa, level-up, console: tudo congelado
    const enraged = boss.isEnraged === true;
    if (!enraged && this.live === 0) return; // fase 1: custo zero

    const dt = Math.min(delta, 50) * ts;
    this.clock += dt;
    this.dtEma += (Math.min(delta, 100) - this.dtEma) * 0.08;
    if (this.clock >= this.nextQualityAt) this._refreshQualityAndFlags();

    this.st = this._state();
    const retiring = !boss.active || boss._deathSequenceStarted === true
      || scene.isGameOver === true || this.st === 'dead';

    // Transformação em andamento: a arena só "acorda" na explosão (ver transformBurst)
    const holding = boss.transformFx?.active === true && !boss.transformFx.blasted;
    if (enraged && !retiring && !holding) {
      if (!this.wasEnraged) {
        this.wasEnraged = true;
        this.prevState = this.st;
        this.nextCrackAt = this.clock + 350;
        this.nextBeamAt = this.clock + 600;
        this.nextPulseAt = this.clock + 800;
        this.nextSparkAt = this.clock + 500;
        this._warmStep(true);
        this.burst(0.8); // a arena "acorda" junto com a fúria
      }
      this._detectStrike(this.st);
      this._updateLevel(dt);
      this._schedule();
    }

    this._tickAll(dt, TELEGRAPH_STATES.has(this.st), retiring);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    [this.cracks, this.beams, this.pulses, this.sparks].forEach((pool) => {
      pool.forEach((slot) => {
        Object.values(slot).forEach((obj) => {
          if (obj && typeof obj.destroy === 'function' && obj.scene) obj.destroy();
        });
      });
      pool.length = 0;
    });
    this.live = 0;
    this.liveCracks = 0;
    this.liveBeams = 0;
    this.livePulses = 0;
    this.liveSparks = 0;
  }

  // ---------------------------------------------------------------- estado do boss

  // Na réplica (multiplayer) o estado vem do Host e fica em _netPrevBossState.
  _state() {
    const b = this.boss;
    return (b.networkReplica ? b._netPrevBossState : b.bossState) || 'chasing';
  }

  _warmStep(all) {
    if (this.warm === 0) {
      ensureTremorTextures(this.scene);
      this.warm = 1;
      if (!all) return;
    }
    while (this.warm <= CRACK_VARIANTS) {
      bakeCrackVariant(this.scene, this.warm - 1);
      this.warm += 1;
      if (!all) return;
    }
  }

  _refreshQualityAndFlags() {
    this.nextQualityAt = this.clock + 300;
    const target = this.scene.game.loop?.targetFps || 60;
    const ratio = (1000 / target) / Math.max(1, this.dtEma); // 1 = no alvo; 0.5 = metade do FPS
    if (ratio < 0.6) this.quality = 0;
    else if (ratio < 0.82) this.quality = 0.5;
    else if (ratio >= 0.92) this.quality = 1; // entre 0.82 e 0.92: mantém (histerese)
    this.reducedFlashes = SettingsManager.getReducedFlashes();
    this.reducedMotion = SettingsManager.getReducedMotion();
  }

  // pode nascer coisa nova agora?
  _canSpawn() {
    const b = this.boss;
    if (this.quality <= 0 || this.warm <= CRACK_VARIANTS) return false; // texturas ainda não assadas
    if (!b.active || !b.visible || b.untargetable) return false;
    if (this.st === 'leap_rise' || this.st === 'leap_air' || this.st === 'dead') return false;
    return this._inView(b.x, b.y, 320);
  }

  _levelTarget() {
    switch (this.st) {
      case 'charge_dash': return 1;
      case 'cleave_recover':
      case 'leap_recover': return 0.9;
      case 'charge_vulnerable': return 0.5;
      case 'leap_rise':
      case 'leap_air': return 0;
      default:
        if (TELEGRAPH_STATES.has(this.st)) return 0.25;
        return this.boss.axePhase ? 0.7 : 0.3; // machado fora da mão = ataque em andamento
    }
  }

  _updateLevel(dt) {
    const target = this._levelTarget();
    const k = target > this.level ? dt / 120 : dt / 700; // sobe rápido, desce devagar
    this.level += (target - this.level) * (k > 1 ? 1 : k);
    this.boost = Math.max(0, this.boost - dt / 450);
  }

  // aviso -> ataque: o golpe saiu, a arena estoura
  _detectStrike(st) {
    const prev = this.prevState;
    if (prev === st) return;
    this.prevState = st;
    if (TELEGRAPH_STATES.has(prev) && !TELEGRAPH_STATES.has(st) && st !== 'dead') {
      this.burst(STRIKE_BURST[prev] ?? 0.8);
    } else if (prev === 'leap_air' && st === 'leap_recover') {
      this.burst(1); // pouso do salto
    }
  }

  // ---------------------------------------------------------------- geração

  _schedule() {
    if (!this._canSpawn()) return;
    const quiet = TELEGRAPH_STATES.has(this.st);
    const lvl = this.level + this.boost * 0.5;
    const slow = (this.mobile ? 1.5 : 1) * (this.quality < 1 ? 1.6 : 1);
    const jitter = () => rand(0.75, 1.25);

    if (this.clock >= this.nextCrackAt) {
      this._spawnCrack(lvl, false);
      this.nextCrackAt = this.clock + lerp(1500, 460, clamp01(lvl)) * slow * (quiet ? 1.7 : 1) * jitter();
    }
    if (quiet || lvl < 0.2) return; // segurando o fôlego (aviso) ou arena calma demais

    if (this.clock >= this.nextBeamAt) {
      this._spawnBeam(lvl, false);
      this.nextBeamAt = this.clock + lerp(1500, 320, clamp01(lvl)) * slow * jitter();
    }
    if (this.clock >= this.nextPulseAt) {
      this._spawnPulse(lvl);
      this.nextPulseAt = this.clock + lerp(1200, 280, clamp01(lvl)) * slow * jitter();
    }
    if (!this.reducedMotion && this.clock >= this.nextSparkAt) {
      const c = this._randomCrack();
      if (c) this._spawnSpark(c.x + rand(-0.5, 0.5) * c.radius, c.y + rand(-0.3, 0.3) * c.radius, lvl > 0.6);
      this.nextSparkAt = this.clock + lerp(420, 130, clamp01(lvl)) * slow * jitter();
    }
  }

  // Estouro (golpe saindo, pouso, fúria): rachaduras grandes, feixes e pulsos de uma vez.
  burst(strength) {
    if (this.destroyed || !this._canSpawn()) return;
    const q = this.quality;
    this.boost = Math.max(this.boost, strength);
    const half = q < 1 ? 0.5 : 1;
    const nCracks = Math.max(1, Math.round((1 + 2 * strength) * half));
    const nBeams = Math.round((1 + 3 * strength) * half);
    const nPulses = Math.round((1 + 2 * strength) * half);
    for (let i = 0; i < nCracks; i += 1) this._spawnCrack(Math.max(0.6, strength), true);
    this.cracks.forEach((c) => { if (c.alive) c.spike = Math.max(c.spike, 0.6 * strength); });
    for (let i = 0; i < nBeams; i += 1) this._spawnBeam(strength, true);
    for (let i = 0; i < nPulses; i += 1) this._spawnPulse(strength, true);
  }

  // Transformação (fase 1 -> 2, ver MinotaurTransformFx): estouro RADIAL de rachaduras energizadas
  // em volta do boss, com feixes e pulsos saindo delas. Só visual; respeita os mesmos tetos e a
  // mesma qualidade adaptativa das outras rachaduras.
  transformBurst(strength = 1) {
    const b = this.boss;
    if (this.destroyed || this.quality <= 0 || this.warm <= CRACK_VARIANTS || !b.active) return;
    this.boost = Math.max(this.boost, strength);
    if (!this.wasEnraged) {
      // a explosão É o despertar da arena: nada de segundo estouro "de acordar" logo depois
      this.wasEnraged = true;
      this.prevState = this.st;
      this.nextCrackAt = this.clock + 700;
      this.nextBeamAt = this.clock + 900;
      this.nextPulseAt = this.clock + 1000;
      this.nextSparkAt = this.clock + 800;
    }
    const half = this.quality < 1 ? 0.5 : 1;
    const count = Math.max(3, Math.round(this.cap.cracks * half));
    const fx = b.x;
    const fy = b.y + b.displayHeight * (b._shadowYFrac ?? 0.46);
    const start = Math.random() * TAU;
    for (let i = 0; i < count; i += 1) {
      const a = start + (i * TAU) / count + rand(-0.22, 0.22);
      const r = rand(95, 200);
      const x = fx + Math.cos(a) * r;
      const y = fy + Math.sin(a) * r * CRACK_SQUASH;
      if (!this._inView(x, y, -16)) continue;
      this._spawnCrack(1, true, { x: Math.round(x), y: Math.round(y) });
    }
    this.cracks.forEach((c) => { if (c.alive) c.spike = Math.max(c.spike, strength); });
    for (let i = 0; i < Math.round(5 * half); i += 1) this._spawnBeam(1, true);
    for (let i = 0; i < Math.round(4 * half); i += 1) this._spawnPulse(1, true);
  }

  _spawnCrack(strength, forced, at = null) {
    const slot = this._crackSlot(forced);
    if (!slot) return null;
    // escala inteira = pixel crisp; o mobile não passa de 3
    const roll = Math.random();
    const scale = strength >= 0.5
      ? (this.mobile || roll < 0.6 ? 3 : 4)
      : (roll < 0.7 ? 2 : 3);
    const radius = scale * 30;
    const pad = scale * 22; // o centro precisa ficar longe o bastante pra nenhum braço invadir um aviso
    if (at) {
      this._pt.x = at.x;
      this._pt.y = at.y;
    } else if (!this._pickPoint(this._pt, 70, 230, pad, 90)) return null;

    const v = Math.floor(Math.random() * CRACK_VARIANTS);
    const flipX = Math.random() < 0.5;
    const flipY = Math.random() < 0.5;
    slot.core.setTexture(CORE_KEYS[v]).setFlip(flipX, flipY).setPosition(this._pt.x, this._pt.y)
      .setScale(scale * 0.55).setAlpha(0).setActive(true).setVisible(true);
    slot.glow.setTexture(GLOW_KEYS[v]).setFlip(flipX, flipY).setPosition(this._pt.x, this._pt.y)
      .setScale(scale * 0.55).setAlpha(0).setActive(true).setVisible(true);
    slot.alive = true;
    slot.fading = false;
    slot.x = this._pt.x;
    slot.y = this._pt.y;
    slot.scale = scale;
    slot.radius = radius;
    slot.age = 0;
    slot.life = (this.mobile ? rand(1300, 2000) : rand(1600, 2600)) + strength * 700;
    slot.spike = 0.8; // clarão de nascimento
    slot.dim = 1;
    slot.dimTarget = 1;
    slot.nextCheck = this.clock + 100;
    slot.phase = Math.random() * TAU;
    this.liveCracks += 1;
    this.live += 1;
    return slot;
  }

  _crackSlot(forced) {
    const cap = Math.max(1, Math.floor(this.cap.cracks * this.quality));
    for (let i = 0; i < this.cracks.length; i += 1) {
      if (!this.cracks[i].alive && this.liveCracks < cap) return this.cracks[i];
    }
    if (this.liveCracks < cap && this.cracks.length < this.cap.cracks) {
      const slot = {
        core: this.scene.add.image(0, 0, CORE_KEYS[0]).setDepth(D_CRACK).setActive(false).setVisible(false),
        glow: this.scene.add.image(0, 0, GLOW_KEYS[0]).setDepth(D_CRACK_GLOW).setBlendMode(ADD)
          .setActive(false).setVisible(false),
        alive: false, fading: false, x: 0, y: 0, scale: 2, radius: 60, age: 0, life: 1,
        spike: 0, dim: 1, dimTarget: 1, nextCheck: 0, phase: 0
      };
      this.cracks.push(slot);
      return slot;
    }
    if (forced) {
      // cheio: só reaproveita uma que já está quase sumindo (nada de "pop" visível)
      let best = null;
      for (let i = 0; i < this.cracks.length; i += 1) {
        const c = this.cracks[i];
        if (c.alive && c.life - c.age < 650 && (!best || c.life - c.age < best.life - best.age)) best = c;
      }
      if (best) {
        this._release(best);
        return best;
      }
    }
    return null;
  }

  // `young`: no estouro vale até rachadura recém-nascida (o feixe sai junto com ela abrindo)
  _randomCrack(young = false) {
    const n = this.cracks.length;
    if (!n) return null;
    const start = Math.floor(Math.random() * n);
    for (let i = 0; i < n; i += 1) {
      const c = this.cracks[(start + i) % n];
      if (c.alive && !c.fading && (young || c.age > OPEN_MS * 0.5) && c.dim > 0.5) return c;
    }
    return null;
  }

  _spawnBeam(strength, forced) {
    const cap = Math.floor(this.cap.beams * this.quality);
    if (this.liveBeams >= cap) return;
    const c = this._randomCrack(forced);
    if (!c) return;
    if (!forced && TELEGRAPH_STATES.has(this.st)) return;
    const x = c.x + rand(-0.45, 0.45) * c.radius;
    const y = c.y + rand(-0.3, 0.3) * c.radius * CRACK_SQUASH;
    if (this._zoneHit(x, y, 20)) return;
    if (reserveFx(this.scene, 2) < 2) return;

    let slot = null;
    for (let i = 0; i < this.beams.length; i += 1) if (!this.beams[i].alive) { slot = this.beams[i]; break; }
    if (!slot) {
      slot = {
        core: this.scene.add.image(0, 0, BEAM_KEY).setOrigin(0.5, 1).setDepth(D_BEAM).setBlendMode(ADD)
          .setTint(AQUA_PALE).setActive(false).setVisible(false),
        halo: this.scene.add.image(0, 0, BEAM_KEY).setOrigin(0.5, 1).setDepth(D_BEAM - 0.01).setBlendMode(ADD)
          .setTint(AQUA).setActive(false).setVisible(false),
        alive: false, x: 0, y: 0, h: 80, w: 8, age: 0, life: 500, a: 0.5, phase: 0
      };
      this.beams.push(slot);
    }
    const tilt = rand(-0.12, 0.12);
    slot.x = Math.round(x);
    slot.y = Math.round(y);
    slot.h = rand(60, 120) * (0.8 + 0.6 * clamp01(strength)) * (this.reducedMotion ? 0.6 : 1);
    slot.w = rand(6, 10);
    slot.age = 0;
    slot.life = rand(380, 640) + strength * 120;
    slot.a = this.reducedFlashes ? 0.3 : 0.5;
    slot.phase = Math.random() * TAU;
    slot.core.setPosition(slot.x, slot.y).setRotation(tilt).setScale(0.01).setAlpha(0).setActive(true).setVisible(true);
    slot.halo.setPosition(slot.x, slot.y).setRotation(tilt).setScale(0.01).setAlpha(0).setActive(true).setVisible(true);
    slot.alive = true;
    this.liveBeams += 1;
    this.live += 1;
    c.spike = Math.max(c.spike, 0.5); // a fenda acende quando o feixe sai dela
  }

  _spawnPulse(strength, young = false) {
    const cap = Math.floor(this.cap.pulses * this.quality);
    if (this.livePulses >= cap) return;
    const c = this._randomCrack(young);
    if (!c) return;
    if (reserveFx(this.scene, 2) < 2) return;

    let slot = null;
    for (let i = 0; i < this.pulses.length; i += 1) if (!this.pulses[i].alive) { slot = this.pulses[i]; break; }
    if (!slot) {
      slot = {
        img: this.scene.add.image(0, 0, GLOW_KEY).setDepth(D_PULSE).setBlendMode(ADD).setTint(AQUA)
          .setActive(false).setVisible(false),
        alive: false, x: 0, y: 0, s: 0.6, age: 0, life: 360, a: 0.5
      };
      this.pulses.push(slot);
    }
    const s = clamp01(strength);
    slot.x = Math.round(c.x + rand(-0.3, 0.3) * c.radius);
    slot.y = Math.round(c.y + rand(-0.2, 0.2) * c.radius * CRACK_SQUASH);
    slot.s = (0.55 + 0.45 * s) * (c.scale / 3 + 0.4);
    slot.age = 0;
    slot.life = rand(300, 420);
    slot.a = (0.38 + 0.25 * s) * (this.reducedFlashes ? 0.5 : 1);
    slot.img.setPosition(slot.x, slot.y).setScale(slot.s * 0.5, slot.s * 0.5 * CRACK_SQUASH).setAlpha(0)
      .setActive(true).setVisible(true);
    slot.alive = true;
    this.livePulses += 1;
    this.live += 1;
    c.spike = Math.max(c.spike, 0.7);
    if (!this.reducedMotion) {
      const n = s > 0.6 ? 3 : 2;
      for (let i = 0; i < n; i += 1) this._spawnSpark(slot.x + rand(-14, 14), slot.y + rand(-8, 8), s > 0.6);
    }
  }

  _spawnSpark(x, y, strong) {
    const cap = Math.floor(this.cap.sparks * this.quality);
    if (this.liveSparks >= cap) return;
    if (reserveFx(this.scene, 1) < 1) return;
    let slot = null;
    for (let i = 0; i < this.sparks.length; i += 1) if (!this.sparks[i].alive) { slot = this.sparks[i]; break; }
    if (!slot) {
      slot = {
        img: this.scene.add.image(0, 0, SPARK_KEY).setDepth(D_SPARK).setBlendMode(ADD).setActive(false).setVisible(false),
        alive: false, x: 0, y: 0, vx: 0, vy: 0, s: 0.8, age: 0, life: 700, a: 0.6
      };
      this.sparks.push(slot);
    }
    slot.x = x;
    slot.y = y;
    slot.vx = rand(-10, 10);
    slot.vy = -rand(strong ? 30 : 16, strong ? 70 : 42); // sobe devagar, "vazando" da fenda
    slot.s = rand(0.5, strong ? 1.0 : 0.8);
    slot.age = 0;
    slot.life = rand(500, strong ? 950 : 800);
    slot.a = this.reducedFlashes ? 0.35 : 0.6;
    slot.img.setPosition(x, y).setTint(Math.random() < 0.5 ? AQUA_LIGHT : AQUA).setScale(slot.s).setAlpha(slot.a)
      .setActive(true).setVisible(true);
    slot.alive = true;
    this.liveSparks += 1;
    this.live += 1;
  }

  // ---------------------------------------------------------------- posição / avisos / câmera

  _inView(x, y, margin) {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }

  // Ponto no chão perto do boss, dentro da câmera, fora de qualquer aviso e longe das outras rachaduras.
  _pickPoint(out, rMin, rMax, pad, separation) {
    const b = this.boss;
    const fx = b.x;
    const fy = b.y + b.displayHeight * (b._shadowYFrac ?? 0.46);
    const sep2 = separation * separation;
    for (let i = 0; i < 5; i += 1) {
      const a = Math.random() * TAU;
      const r = rand(rMin, rMax);
      const x = fx + Math.cos(a) * r;
      const y = fy + Math.sin(a) * r * CRACK_SQUASH;
      if (!this._inView(x, y, -16)) continue;
      if (this._zoneHit(x, y, pad)) continue;
      let ok = true;
      for (let k = 0; k < this.cracks.length; k += 1) {
        const c = this.cracks[k];
        if (!c.alive) continue;
        const dx = x - c.x;
        const dy = y - c.y;
        if (dx * dx + dy * dy < sep2) { ok = false; break; }
      }
      if (!ok) continue;
      out.x = Math.round(x);
      out.y = Math.round(y);
      return true;
    }
    return false;
  }

  // (x, y) cai dentro de algum aviso ativo (com folga `pad`)? Mesma geometria dos telegraphs do Minotaur.js.
  _zoneHit(x, y, pad) {
    const b = this.boss;
    const def = b.def || {};

    // círculos de aviso dos meteoros: valem em qualquer estado da fase 2
    const mr = (def.meteorImpactRadius || 75) + pad;
    const mr2 = mr * mr;
    const ms = b.meteors;
    if (ms) {
      for (let i = 0; i < ms.length; i += 1) {
        const dx = x - ms[i].x;
        const dy = y - ms[i].y;
        if (dx * dx + dy * dy < mr2) return true;
      }
    }
    const nm = b._netMeteors; // réplica: posições vindas do Host
    if (nm) {
      for (let i = 0; i < nm.length; i += 1) {
        const dx = x - nm[i][0];
        const dy = y - nm[i][1];
        if (dx * dx + dy * dy < mr2) return true;
      }
    }

    const dx = x - b.x;
    const dy = y - b.y;
    switch (this.st) {
      case 'charge_telegraph': {
        const d = b.bossChargeDir;
        if (!d) return false;
        return distToSegment(x, y, b.x, b.y, b.x + d.x * 1400, b.y + d.y * 1400) < (def.chargeHitRadius || 46) + pad;
      }
      case 'charge_swing_telegraph': {
        const r = (def.chargeSwingRadius || 150) * 1.3 + pad;
        return dx * dx + dy * dy < r * r;
      }
      case 'axe_telegraph': {
        const near = distToSegment(x, y, b.x, b.y, b.axeTargetX, b.axeTargetY) < 40 + pad;
        const tx = x - b.axeTargetX;
        const ty = y - b.axeTargetY;
        const tr = 120 + pad;
        return near || tx * tx + ty * ty < tr * tr;
      }
      case 'cleave_telegraph':
      case 'cleave_pause': {
        const range = (def.cleaveRange || 260) + pad;
        if (dx * dx + dy * dy >= range * range) return false;
        const half = Phaser.Math.DegToRad(def.cleaveHalfAngleDeg || 40) + 0.35;
        return Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - b.cleaveAngle)) < half;
      }
      case 'stomp_raise': {
        const r = (def.stompImpactRadius || 200) + pad;
        return dx * dx + dy * dy < r * r;
      }
      case 'leap_crouch': {
        const r = 240 + pad;
        return dx * dx + dy * dy < r * r;
      }
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------- atualização das pools

  _release(slot) {
    if (!slot.alive) return;
    slot.alive = false;
    if (slot.core) {
      slot.core.setActive(false).setVisible(false);
      slot.glow.setActive(false).setVisible(false);
      this.liveCracks -= 1;
    }
    this.live -= 1;
  }

  _tickAll(dt, quiet, retiring) {
    const flick = this.reducedFlashes ? 0.08 : 0.22;
    const hot = 0.5 + 0.25 * clamp01(this.level + this.boost * 0.5);

    for (let i = 0; i < this.cracks.length; i += 1) {
      const c = this.cracks[i];
      if (!c.alive) continue;
      c.age += dt;
      if (retiring && !c.fading) {
        c.fading = true;
        c.life = Math.min(c.life, c.age + FADE_FAST_MS);
      }
      if (c.age >= c.life || !this._inView(c.x, c.y, c.radius + 40)) {
        this._release(c);
        continue;
      }
      if (this.clock >= c.nextCheck) {
        c.nextCheck = this.clock + 100;
        c.dimTarget = this._zoneHit(c.x, c.y, c.radius * 0.7) ? 0.18 : (quiet ? 0.6 : 1);
      }
      c.dim += (c.dimTarget - c.dim) * Math.min(1, dt / 120);
      c.spike = Math.max(0, c.spike - dt / 260);

      const openK = Math.min(1, c.age / OPEN_MS);
      const e = 1 - (1 - openK) * (1 - openK) * (1 - openK);
      const fadeK = clamp01((c.life - c.age) / (c.fading ? FADE_FAST_MS : FADE_MS));
      const scale = c.scale * (0.55 + 0.45 * e);
      const flicker = 1 - flick + flick * (0.5 + 0.5 * Math.sin(this.clock / 85 + c.phase));
      const glowA = Math.min(0.85, hot * flicker + c.spike * 0.5 + (1 - openK) * 0.4);

      c.core.setScale(scale).setAlpha(0.92 * e * fadeK * (0.4 + 0.6 * c.dim));
      c.glow.setScale(scale).setAlpha(glowA * e * Math.min(1, fadeK * 1.4) * c.dim);
    }

    for (let i = 0; i < this.beams.length; i += 1) {
      const b = this.beams[i];
      if (!b.alive) continue;
      b.age += dt;
      if (b.age >= b.life || !this._inView(b.x, b.y - b.h * 0.5, b.h * 0.5 + 60)) {
        b.core.setActive(false).setVisible(false);
        b.halo.setActive(false).setVisible(false);
        b.alive = false;
        this.liveBeams -= 1;
        this.live -= 1;
        continue;
      }
      const g = Math.min(1, b.age / 90); // nasce rápido
      const holdEnd = b.life * 0.35;
      const k = b.age > holdEnd ? 1 - (b.age - holdEnd) / (b.life - holdEnd) : 1;
      const f = 1 - flick + flick * (0.5 + 0.5 * Math.sin(this.clock / 60 + b.phase));
      const sx = (b.w / 48) * (0.4 + 0.6 * g) * (0.5 + 0.5 * k);
      const sy = (b.h / 256) * g;
      b.core.setScale(sx, sy).setAlpha(Math.min(1, b.a * k * f * (quiet ? 0.5 : 1)));
      b.halo.setScale(sx * 3.4, sy).setAlpha(Math.min(1, b.a * 0.3 * k * f * (quiet ? 0.5 : 1)));
    }

    for (let i = 0; i < this.pulses.length; i += 1) {
      const p = this.pulses[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life || !this._inView(p.x, p.y, 80)) {
        p.img.setActive(false).setVisible(false);
        p.alive = false;
        this.livePulses -= 1;
        this.live -= 1;
        continue;
      }
      const t = p.age / p.life;
      const open = Math.min(1, t * 4);
      const scale = p.s * (0.5 + 0.9 * t);
      p.img.setScale(scale, scale * CRACK_SQUASH).setAlpha(p.a * open * (1 - t) * (1 - t));
    }

    for (let i = 0; i < this.sparks.length; i += 1) {
      const s = this.sparks[i];
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life || !this._inView(s.x, s.y, 60)) {
        s.img.setActive(false).setVisible(false);
        s.alive = false;
        this.liveSparks -= 1;
        this.live -= 1;
        continue;
      }
      const t = s.age / s.life;
      s.x += (s.vx * dt) / 1000;
      s.y += (s.vy * dt) / 1000;
      s.img.setPosition(s.x, s.y).setScale(s.s * (1 - 0.8 * t)).setAlpha(s.a * (1 - t));
    }
  }
}
