import SettingsManager from './SettingsManager.js';

// CENA 04/05 — O CHÃO SE ABRE. Enquanto a câmera atravessa o mapa até o mar, o
// chão à frente dela racha e CRATERAS surgem, uma a uma, conforme entram na
// tela. Cada cratera estoura (clarão, onda de choque, poeira, pedras e faíscas
// voando) e depois fica jorrando energia roxa até o fim da cena: coluna de luz
// subindo, fumaça de energia, fagulhas e pontinhos luminosos. De cada cratera
// partem rachaduras que também vazam energia, e algumas fendas soltas se abrem
// no caminho (como antes, saltando antes da hora na 4ª pancada: ver surge()).
//
// Pra parecer parte do CENÁRIO e não um efeito jogado por cima:
//   - o corpo de tudo (terra chamuscada, borda de pedra, abismo, entulho, a
//     cratera em si) fica na camada do chão, ABAIXO dos personagens e do véu
//     escuro, então escurece junto com o mundo e objetos altos passam por cima
//   - bordas irregulares (cada lado da fenda tem a própria largura), lábio de
//     pedra claro no lado da luz (cima/esquerda) e escuro no outro, pedrinhas
//     soltas ao redor, trechos de rocha que interrompem o brilho
//   - a luz roxa nasce DENTRO da fenda/poço e vaza pro chão em volta (brilho
//     aditivo largo e fraco na camada do chão)
//   - só o miolo da energia que sobe (coluna, fumaça, fagulhas) fica acima do
//     véu, pra continuar luminosa na escuridão
//
// Cratera e fendas ficam até o fim da cena (nada se desfaz).
// As fendas principais atravessam o enquadramento por inteiro: suas pontas
// ficam fora do mundo visível, como rachaduras de algo enorme sob o chão.
//
// Ganchos: begin(start, target) [VictoryFinale.start], surge() [4ª pancada],
// clear() [corte pro silêncio], update(delta) [GameScene].

// ---------------------------------------------------------------- camadas
// o mapa usa depth = índice da camada; o chão fica ~2 (como o Pisão do Minotauro)
const DEPTH_SCORCH = 2.05;
const DEPTH_CRATER = 2.1;
const DEPTH_LIP = 2.15;
const DEPTH_CHASM = 2.2;
const DEPTH_SPILL = 2.25; // luz roxa vazando pro chão em volta (ADD)
const DEPTH_INNER = 2.3; // luz dentro da fenda (ADD)
const DEPTH_CRATER_GLOW = 2.32;
const DEPTH_RUBBLE = 2.4;
const DEPTH_DUST = 11.5;
const DEPTH_RING = 11.6;
const DEPTH_CHIP = 12;
const DEPTH_BLOOM = 109; // abaixo das partículas azuis (110), acima do véu escuro (99)
const DEPTH_COLUMN = 109.5;
const DEPTH_ENERGY = 111;
const DEPTH_FLASH = 112;

// ---------------------------------------------------------------- fendas
const MAIN_COUNT = 4; // fendas soltas ao longo do trajeto (além das que saem das crateras)
const SEGMENTS_MAIN = 30;
const BRANCHES_PER_MAIN_MIN = 0;
const BRANCHES_PER_MAIN_MAX = 1;
const LENGTH_MIN = 2.8; // × largura da tela (mundo), antes dividido ao redor da raiz
const LENGTH_MAX = 3.8;
const WIDTH_MIN = 0.022; // × largura da tela
const WIDTH_MAX = 0.042;
const WIDTH_NEAR_TARGET_BOOST = 0.7;
const LATERAL_SPREAD = 0.55;
const ANGLE_SPREAD = 0.6;
const LEAD_DISTANCE = 0.9; // fenda solta dispara quando a câmera chega a essa distância da raiz
const GROW_MIN_MS = 1100;
const GROW_MAX_MS = 1900;
const SURGE_STARTS = 2;
const VENTS_MIN = 1; // pontos onde a fenda "respira" energia mais forte
const VENTS_MAX = 2;

// ---------------------------------------------------------------- crateras
const CRATER_VARIANTS = 3;
const CRATER_TEX = 192;
const CRATER_INTRO_MS = 520;
const CRATER_RADIUS_MIN = 0.085; // × largura da tela
const CRATER_RADIUS_MAX = 0.13;
const CRATER_FISSURES_MIN = 1;
const CRATER_FISSURES_MAX = 2;
const CRATER_HIT = { peak: 0.024, tau: 560, kick: 0.6 };

// ---------------------------------------------------------------- energia
const CAP_DESKTOP = 260;
const CAP_TOUCH = 160;

// ---------------------------------------------------------------- cores
const PURPLE_DEEP = 0x3a0c6e;
const PURPLE = 0x8a2be2;
const PURPLE_BRIGHT = 0xb56bff;
const PURPLE_PALE = 0xe9c6ff;
const WHITE = 0xffffff;
const COLOR_SCORCH = 0x0a0610;
const COLOR_CHASM = 0x05020a;
const ROCK_LIGHT = 0x7d6a86;
const ROCK_MID = 0x5a4860;
const ROCK_DARK = 0x1c1424;
const SOIL_TINTS = [0x3b2c3a, 0x4a3949, 0x66526b, 0x2b2233];
const DUST_TINTS = [0x2e2236, 0x3a2e4a, 0x4a3a5c];
const LIGHT = { x: -0.7071, y: -0.7071 }; // luz vem de cima/esquerda (igual à cratera do Minotauro)

const GLOW_KEY = 'vcr_glow';
const RING_KEY = 'vcr_ring';
const COLUMN_KEY = 'vcr_column';
const CHIP_KEY = 'vcr_chip';
const craterKey = (i) => `vcr_crater_${i}`;
const craterGlowKey = (i) => `vcr_crater_glow_${i}`;

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

export default class VictoryCracks {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.fissures = [];
    this.craters = [];
    this.gfxScorch = null;
    this.gfxLip = null;
    this.gfxChasm = null;
    this.gfxSpill = null;
    this.gfxInner = null;
    this.gfxRubble = null;
    this.gfxBloom = null;
    this._start = null;
    this._u = null;
    this._n = null;
    this._pathLen = 1;
    this._unit = 1;
    this._clock = 0;
    this._live = [];
    this._pool = [];
    const touch = !!scene.sys?.game?.device?.input?.touch;
    this._cap = touch ? CAP_TOUCH : CAP_DESKTOP;
    this._density = touch ? 0.6 : 1;
    this._reduced = false;
    this._ensureTextures();
    scene.events.once('shutdown', () => this.destroy());
  }

  // start/target: pontos do mundo. Gera tudo (nada aparece ainda).
  begin(start, target) {
    if (this.active) return;
    const scene = this.scene;
    const view = scene.cameras.main.worldView;
    this._reduced = !!SettingsManager.getReducedFlashes?.();
    this._unit = view.width;
    this._start = { x: start.x, y: start.y };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    this._pathLen = Math.max(1, Math.hypot(dx, dy));
    this._u = { x: dx / this._pathLen, y: dy / this._pathLen };
    this._n = { x: -this._u.y, y: this._u.x };

    const add = Phaser.BlendModes.ADD;
    this.gfxScorch = scene.add.graphics().setDepth(DEPTH_SCORCH);
    this.gfxLip = scene.add.graphics().setDepth(DEPTH_LIP);
    this.gfxChasm = scene.add.graphics().setDepth(DEPTH_CHASM);
    this.gfxSpill = scene.add.graphics().setDepth(DEPTH_SPILL).setBlendMode(add);
    this.gfxInner = scene.add.graphics().setDepth(DEPTH_INNER).setBlendMode(add);
    this.gfxRubble = scene.add.graphics().setDepth(DEPTH_RUBBLE);
    this.gfxBloom = scene.add.graphics().setDepth(DEPTH_BLOOM).setBlendMode(add);

    this._build(target);
    this.active = true;
    this._clock = 0;
  }

  // 4ª pancada: as próximas fendas soltas (e uma cratera já à vista) saltam antes da hora
  surge() {
    if (!this.active) return;
    let n = 0;
    for (const f of this.fissures) {
      if (f.startedAt == null && !f.branchOf && !f.crater && n < SURGE_STARTS) {
        this._launch(f);
        n++;
      }
    }
    const v = this.scene.cameras.main.worldView;
    for (const c of this.craters) {
      if (c.startedAt != null) continue;
      const inside = c.x > v.x - v.width * 0.2 && c.x < v.right + v.width * 0.2 && c.y > v.y - v.height * 0.2 && c.y < v.bottom + v.height * 0.2;
      if (inside) {
        this._launchCrater(c);
        break;
      }
    }
  }

  update(delta) {
    if (!this.active) return;
    const dt = Math.min(delta, 100);
    const dtS = dt / 1000;
    this._clock += dt;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const mid = cam.midPoint;
    const travelled = (mid.x - this._start.x) * this._u.x + (mid.y - this._start.y) * this._u.y;
    const kick = this.scene.victoryTremorKick || 0;

    // crateras: nascem quando entram na tela
    for (const c of this.craters) {
      if (c.startedAt == null && this._craterInView(c, view)) this._launchCrater(c);
      if (c.startedAt != null) this._updateCrater(c, dt, view, kick);
    }

    // fendas
    for (const f of this.fissures) {
      if (f.startedAt == null) {
        if (f.crater) {
          if (f.crater.startedAt != null && this._clock >= f.crater.startedAt + f.delay) this._launch(f);
        } else if (f.branchOf) {
          const parent = f.branchOf;
          if (parent.startedAt != null && parent.shown / parent.segments >= f.branchAt) this._launch(f);
        } else if (travelled >= f.rootDist - LEAD_DISTANCE * this._unit) {
          this._launch(f);
        }
      }
      if (f.startedAt != null && !f.done) this._grow(f);
      if (f.startedAt != null) this._emitFissure(f, dtS, view, kick);
    }

    this._stepParticles(dt, view);

    // a luz do abismo acompanha o peso do tremor
    const soft = this._reduced ? 0.5 : 1;
    const flicker = Math.sin(this._clock / 260) * 0.06 * soft;
    this.gfxInner.setAlpha(Phaser.Math.Clamp(0.85 + kick * 0.3 * soft + flicker, 0, 1));
    this.gfxSpill.setAlpha(Phaser.Math.Clamp(0.8 + kick * 0.4 * soft + flicker, 0, 1));
    this.gfxBloom.setAlpha(Phaser.Math.Clamp(0.7 + kick * 0.5 * soft + flicker, 0, 1));
  }

  clear() {
    this.active = false;
    this.fissures = [];
    this._destroyCraters();
    this._live.forEach((p) => p.img.setVisible(false));
    this._pool.push(...this._live);
    this._live = [];
    [this.gfxScorch, this.gfxLip, this.gfxChasm, this.gfxSpill, this.gfxInner, this.gfxRubble, this.gfxBloom].forEach((g) => g?.clear());
  }

  destroy() {
    this.active = false;
    this.fissures = [];
    this._destroyCraters();
    [this.gfxScorch, this.gfxLip, this.gfxChasm, this.gfxSpill, this.gfxInner, this.gfxRubble, this.gfxBloom].forEach((g) => g?.destroy());
    this.gfxScorch = this.gfxLip = this.gfxChasm = this.gfxSpill = this.gfxInner = this.gfxRubble = this.gfxBloom = null;
    this._live.forEach((p) => p.img?.destroy());
    this._pool.forEach((p) => p.img?.destroy());
    this._live = [];
    this._pool = [];
  }

  _destroyCraters() {
    this.craters.forEach((c) => {
      [c.img, c.glow, c.spill, c.colWide, c.colCore].forEach((o) => o?.destroy());
      c.img = c.glow = c.spill = c.colWide = c.colCore = null;
    });
    this.craters = [];
  }

  // ---------------------------------------------------------------- geração

  _build(target) {
    const U = this._unit;
    const bounds = this.scene.mapManager?.getWorldBounds?.();

    this._buildCraters(bounds);

    // de cada cratera partem rachaduras (mais voltadas pra câmera, uma solta pra qualquer lado)
    const toward = Math.atan2(-this._u.y, -this._u.x);
    for (const c of this.craters) {
      const count = Phaser.Math.Between(CRATER_FISSURES_MIN, CRATER_FISSURES_MAX);
      for (let j = 0; j < count; j++) {
        const angle = j === count - 1 ? rand(0, Math.PI * 2) : toward + rand(-1.3, 1.3);
        const root = { x: c.x + Math.cos(angle) * c.R * 0.75, y: c.y + Math.sin(angle) * c.R * 0.75 };
        const length = rand(0.45, 1.1) * U;
        const width = rand(WIDTH_MIN, WIDTH_MAX) * U * (1 + c.f * WIDTH_NEAR_TARGET_BOOST);
        const main = this._makeFissure(root, angle, length, width, SEGMENTS_MAIN, bounds);
        main.crater = c;
        main.delay = rand(60, 260);
        this.fissures.push(main);
        this._addVents(main);
        this._addBranches(main, length, bounds);
      }
    }

    // fendas soltas ao longo do trajeto, disparando em direção à câmera
    for (let k = 0; k < MAIN_COUNT; k++) {
      const f = k / (MAIN_COUNT - 1);
      const along = Phaser.Math.Linear(0.1, 1, f) * this._pathLen + rand(-0.04, 0.04) * this._pathLen;
      const lateral = rand(-LATERAL_SPREAD, LATERAL_SPREAD) * U * (1 - f * 0.4);
      const root = {
        x: this._start.x + this._u.x * along + this._n.x * lateral,
        y: this._start.y + this._u.y * along + this._n.y * lateral
      };
      const baseAngle = toward + rand(-ANGLE_SPREAD, ANGLE_SPREAD);
      const length = rand(LENGTH_MIN, LENGTH_MAX) * U * Phaser.Math.Linear(1, 1.25, f);
      const width = rand(WIDTH_MIN, WIDTH_MAX) * U * (1 + f * WIDTH_NEAR_TARGET_BOOST);
      const start = {
        x: root.x - Math.cos(baseAngle) * length * 0.5,
        y: root.y - Math.sin(baseAngle) * length * 0.5
      };
      const segments = Math.ceil(SEGMENTS_MAIN * length / (U * 2.4));
      const main = this._makeFissure(start, baseAngle, length, width, segments, null);
      main.rootDist = along;
      this.fissures.push(main);
      this._addVents(main);
      this._addBranches(main, length, bounds);
    }
  }

  _buildCraters(bounds) {
    const U = this._unit;
    const player = this.scene.player;
    const count = Phaser.Math.Clamp(Math.round(this._pathLen / (U * 0.85)), 3, 6);
    for (let k = 0; k < count; k++) {
      const f = count > 1 ? k / (count - 1) : 1;
      for (let attempt = 0; attempt < 10; attempt++) {
        const along = (Phaser.Math.Linear(0.16, 0.97, f) + rand(-0.025, 0.025)) * this._pathLen;
        const lateral = rand(-0.3, 0.3) * U * (1 - f * 0.35);
        const x = this._start.x + this._u.x * along + this._n.x * lateral;
        const y = this._start.y + this._u.y * along + this._n.y * lateral;
        const R = rand(CRATER_RADIUS_MIN, CRATER_RADIUS_MAX) * U * Phaser.Math.Linear(1, 1.4, f);
        if (bounds && (x < R * 1.4 || y < R * 1.4 || x > bounds.width - R * 1.4 || y > bounds.height - R * 1.4)) continue;
        if (player && Math.hypot(x - player.x, y - player.y) < U * 0.45 + R) continue; // longe do gato
        if (this.craters.some((o) => Math.hypot(o.x - x, o.y - y) < (o.R + R) * 1.5)) continue;
        this.craters.push({
          x,
          y,
          R,
          f,
          variant: Phaser.Math.Between(0, CRATER_VARIANTS - 1),
          scale: R / (24 * (CRATER_TEX / 72)), // o poço da textura tem raio 24 (em 72px)
          rootDist: along,
          phase: rand(0, Math.PI * 2),
          startedAt: null,
          age: 0,
          dPlume: 0,
          dMote: 0,
          dSpark: 0,
          img: null,
          glow: null,
          spill: null,
          colWide: null,
          colCore: null
        });
        break;
      }
    }
  }

  _addBranches(main, length, bounds) {
    const branches = Phaser.Math.Between(BRANCHES_PER_MAIN_MIN, BRANCHES_PER_MAIN_MAX);
    for (let b = 0; b < branches; b++) {
      const at = rand(0.3, 0.7);
      const idx = Math.floor(at * main.segments);
      const p = main.pts[idx];
      const side = Math.random() < 0.5 ? -1 : 1;
      const angle = main.angles[idx] + side * rand(0.45, 0.95);
      const br = this._makeFissure({ x: p.x, y: p.y }, angle, length * rand(0.3, 0.5), (p.wl + p.wr) * 0.55, Math.round(SEGMENTS_MAIN * 0.55), bounds);
      br.branchOf = main;
      br.branchAt = at;
      this.fissures.push(br);
    }
  }

  _addVents(main) {
    const n = Phaser.Math.Between(VENTS_MIN, VENTS_MAX);
    for (let i = 0; i < n; i++) {
      const idx = Phaser.Math.Between(Math.floor(main.segments * 0.18), Math.floor(main.segments * 0.85));
      const p = main.pts[idx];
      main.vents.push({ idx, x: p.x, y: p.y, w: p.wl + p.wr, drawn: false, dPlume: 0, dSpark: 0, dMote: 0 });
    }
  }

  // linha irregular da raiz até a ponta: passeio aleatório lateral + quinas bruscas.
  // Cada ponto guarda a meia-largura de CADA lado (bordas irregulares, estreitando
  // e alargando), quanto a luz aparece ali (hot: trechos de rocha interrompem o
  // brilho) e a normal suavizada (fita contínua).
  _makeFissure(root, angle, length, width, segments, bounds) {
    const step = length / segments;
    const pts = [];
    const angles = [];
    let x = root.x;
    let y = root.y;
    let a = angle;
    let hot = rand(0.4, 1);
    const phase = rand(0, Math.PI * 2);
    let x0 = x;
    let x1 = x;
    let y0 = y;
    let y1 = y;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const base = Math.max(2.4, width * Math.pow(1 - t, 0.7));
      const pinch = Phaser.Math.Clamp(0.68 + 0.32 * Math.sin(i * 0.55 + phase) + rand(-0.12, 0.12), 0.35, 1.25);
      hot = Phaser.Math.Clamp(hot + rand(-0.35, 0.35), 0, 1);
      pts.push({
        x,
        y,
        wl: Math.max(1.2, base * 0.5 * pinch * rand(0.75, 1.25)),
        wr: Math.max(1.2, base * 0.5 * pinch * rand(0.75, 1.25)),
        hot
      });
      angles.push(a);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      // desvio suave + quina ocasional
      a += rand(-0.16, 0.16);
      if (Math.random() < 0.12) a += rand(-0.7, 0.7);
      a = Phaser.Math.Clamp(a, angle - 0.9, angle + 0.9);
      x += Math.cos(a) * step * rand(0.8, 1.25);
      y += Math.sin(a) * step * rand(0.8, 1.25);
      if (bounds) {
        x = Phaser.Math.Clamp(x, 8, bounds.width - 8);
        y = Phaser.Math.Clamp(y, 8, bounds.height - 8);
      }
    }
    // normais suavizadas por vértice
    for (let i = 0; i <= segments; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[Math.min(segments, i + 1)];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      pts[i].nx = -dy / len;
      pts[i].ny = dx / len;
    }
    return {
      pts,
      angles,
      segments,
      bb: { x0, x1, y0, y1 },
      shown: 0,
      growMs: rand(GROW_MIN_MS, GROW_MAX_MS),
      startedAt: null,
      done: false,
      rootDist: 0,
      branchOf: null,
      branchAt: 0,
      crater: null,
      delay: 0,
      vents: [],
      dMote: 0
    };
  }

  // ------------------------------------------------------------ crescimento das fendas

  _launch(f) {
    if (f.startedAt != null) return;
    f.startedAt = this._clock;
    if (!f.branchOf && !f.crater) {
      // cada fenda solta que se abre é uma pancada que o jogador sente
      // (as das crateras já vêm junto da pancada da própria cratera)
      this.scene.victorySecondThump?.addHit({ peak: 0.018, tau: 520, kick: 0.55 });
    }
  }

  _grow(f) {
    const t = Phaser.Math.Clamp((this._clock - f.startedAt) / f.growMs, 0, 1);
    const target = Math.min(f.segments, Math.floor(expoOut(t) * f.segments));
    while (f.shown < target) {
      this._drawSegment(f, f.shown);
      f.shown++;
    }
    // respiradouros: um clarão de energia no ponto onde a fenda passa
    for (const v of f.vents) {
      if (!v.drawn && f.shown > v.idx) {
        v.drawn = true;
        this.gfxInner.fillStyle(PURPLE, 0.55).fillCircle(v.x, v.y, v.w * 0.9 + 3);
        this.gfxInner.fillStyle(PURPLE_PALE, 0.7).fillCircle(v.x, v.y, v.w * 0.4 + 1.5);
        this.gfxSpill.fillStyle(PURPLE, 0.1).fillCircle(v.x, v.y, v.w * 3 + 14);
        this.gfxBloom.fillStyle(PURPLE_BRIGHT, 0.08).fillCircle(v.x, v.y, v.w * 2.6 + 12);
      }
    }
    if (t >= 1 && f.shown >= f.segments) f.done = true;
  }

  // fita entre dois pontos; k escala a largura de cada lado e add soma pixels fixos
  _ribbon(g, a, b, k, add = 0) {
    const la = a.wl * k + add;
    const ra = a.wr * k + add;
    const lb = b.wl * k + add;
    const rb = b.wr * k + add;
    g.fillPoints(
      [
        { x: a.x + a.nx * la, y: a.y + a.ny * la },
        { x: b.x + b.nx * lb, y: b.y + b.ny * lb },
        { x: b.x - b.nx * rb, y: b.y - b.ny * rb },
        { x: a.x - a.nx * ra, y: a.y - a.ny * ra }
      ],
      true
    );
  }

  // faixa só de um lado da fenda (s = +1 esquerda, -1 direita), de off0 a off1 px além da borda
  _side(g, a, b, s, off0, off1) {
    const wa = s > 0 ? a.wl : a.wr;
    const wb = s > 0 ? b.wl : b.wr;
    g.fillPoints(
      [
        { x: a.x + a.nx * s * (wa + off0), y: a.y + a.ny * s * (wa + off0) },
        { x: b.x + b.nx * s * (wb + off0), y: b.y + b.ny * s * (wb + off0) },
        { x: b.x + b.nx * s * (wb + off1), y: b.y + b.ny * s * (wb + off1) },
        { x: a.x + a.nx * s * (wa + off1), y: a.y + a.ny * s * (wa + off1) }
      ],
      true
    );
  }

  _drawSegment(f, i) {
    const a = f.pts[i];
    const b = f.pts[i + 1];
    const hot = (a.hot + b.hot) / 2;

    // terra chamuscada/estressada em volta: assenta a fenda no chão
    this.gfxScorch.fillStyle(COLOR_SCORCH, 0.14);
    this._ribbon(this.gfxScorch, a, b, 3, 10);
    this.gfxScorch.fillStyle(COLOR_SCORCH, 0.22);
    this._ribbon(this.gfxScorch, a, b, 1.8, 5);

    // borda de pedra: escura dos dois lados, clara no lado voltado pra luz
    this.gfxLip.fillStyle(ROCK_DARK, 0.95);
    this._ribbon(this.gfxLip, a, b, 1, 3.5);
    const lit = (a.nx + b.nx) * LIGHT.x + (a.ny + b.ny) * LIGHT.y >= 0 ? 1 : -1;
    this.gfxLip.fillStyle(ROCK_LIGHT, 0.9);
    this._side(this.gfxLip, a, b, lit, 0.5, 3.2);

    // abismo
    this.gfxChasm.fillStyle(COLOR_CHASM, 1);
    this._ribbon(this.gfxChasm, a, b, 1, 0);

    // luz roxa vindo de dentro: escura nas paredes, viva no meio, em trechos
    // (hot) — onde a rocha atravessa, o brilho some e a fenda fica só escura
    this.gfxInner.fillStyle(PURPLE_DEEP, 0.9);
    this._ribbon(this.gfxInner, a, b, 0.92, 0);
    this.gfxInner.fillStyle(PURPLE, 0.7);
    this._ribbon(this.gfxInner, a, b, 0.58 * (0.6 + 0.4 * hot), 0);
    if (hot > 0.3) {
      this.gfxInner.fillStyle(PURPLE_PALE, 0.5 + 0.4 * hot);
      this._ribbon(this.gfxInner, a, b, 0.26 * hot, 0);
    }
    if (hot > 0.7) {
      this.gfxInner.fillStyle(WHITE, 0.8);
      this._ribbon(this.gfxInner, a, b, 0.09, 0);
    }

    // a luz vaza pro chão em volta (fraca e larga) e um brilho suave por cima do véu
    this.gfxSpill.fillStyle(PURPLE, 0.05);
    this._ribbon(this.gfxSpill, a, b, 2.4, 10);
    this.gfxSpill.fillStyle(PURPLE, 0.07);
    this._ribbon(this.gfxSpill, a, b, 1.5, 4);
    this.gfxBloom.fillStyle(PURPLE, 0.07 * (0.5 + hot));
    this._ribbon(this.gfxBloom, a, b, 2.2, 8);

    // pedrinhas soltas na borda
    if (Math.random() < 0.5) {
      const s = Math.random() < 0.5 ? -1 : 1;
      const d = (s > 0 ? a.wl : a.wr) + rand(3, 12);
      const x = a.x + a.nx * s * d + rand(-4, 4);
      const y = a.y + a.ny * s * d + rand(-4, 4);
      const sz = rand(1.6, 4.2);
      this.gfxRubble.fillStyle(pick([ROCK_LIGHT, ROCK_MID, ROCK_DARK]), 0.95);
      this.gfxRubble.fillTriangle(x, y, x + sz * rand(0.6, 1.3), y + sz * rand(-0.3, 0.5), x + sz * rand(-0.2, 0.8), y + sz * rand(0.6, 1.4));
      if (Math.random() < 0.3) this.gfxRubble.fillStyle(PURPLE_BRIGHT, 0.9).fillRect(x, y, 1.2, 1.2);
    }
  }

  // ------------------------------------------------------------ crateras

  // a cratera nasce quando o centro dela entra na tela (ou a câmera já passou dela)
  _craterInView(c, v) {
    const inside = c.x > v.x + v.width * 0.04 && c.x < v.right - v.width * 0.04 && c.y > v.y + v.height * 0.08 && c.y < v.bottom - v.height * 0.04;
    if (inside) return true;
    const cam = this.scene.cameras.main.midPoint;
    const travelled = (cam.x - this._start.x) * this._u.x + (cam.y - this._start.y) * this._u.y;
    return travelled >= c.rootDist + this._unit * 0.15;
  }

  _launchCrater(c) {
    if (c.startedAt != null) return;
    const scene = this.scene;
    c.startedAt = this._clock;
    c.age = 0;
    const add = Phaser.BlendModes.ADD;
    const view = scene.cameras.main.worldView;
    c.img = scene.add.image(c.x, c.y, craterKey(c.variant)).setDepth(DEPTH_CRATER).setScale(c.scale * 0.6).setAlpha(0);
    c.glow = scene.add.image(c.x, c.y, craterGlowKey(c.variant)).setDepth(DEPTH_CRATER_GLOW).setBlendMode(add).setScale(c.scale * 0.6).setAlpha(0);
    c.spill = scene.add.image(c.x, c.y, GLOW_KEY).setDepth(DEPTH_SPILL).setBlendMode(add).setTint(PURPLE).setScale((c.R * 6.5) / 64).setAlpha(0);
    c.colH = view.height * rand(0.7, 0.95);
    c.colWide = scene.add.image(c.x, c.y - c.R * 0.15, COLUMN_KEY).setOrigin(0.5, 1).setDepth(DEPTH_COLUMN).setBlendMode(add).setTint(PURPLE).setAlpha(0);
    c.colCore = scene.add.image(c.x, c.y - c.R * 0.15, COLUMN_KEY).setOrigin(0.5, 1).setDepth(DEPTH_COLUMN + 0.01).setBlendMode(add).setTint(PURPLE_PALE).setAlpha(0);

    scene.victorySecondThump?.addHit(CRATER_HIT);
    this._burst(c);
  }

  // estouro de quando a cratera se abre
  _burst(c) {
    const U = this._unit;
    const R = c.R;
    const reduce = this._reduced ? 0.55 : 1;

    // clarão e onda de choque
    this._spawn({ key: GLOW_KEY, base: 64, x: c.x, y: c.y, life: 420, s0: R * 1.2, s1: R * 4.4, a0: reduce, fi: 0, fo: 0.2, c0: WHITE, c1: PURPLE_BRIGHT, depth: DEPTH_FLASH }, true);
    this._spawn({ key: GLOW_KEY, base: 64, x: c.x, y: c.y, life: 240, s0: R * 0.6, s1: R * 2, a0: reduce, fi: 0, fo: 0.2, c0: WHITE, c1: PURPLE_PALE, depth: DEPTH_FLASH + 0.01 }, true);
    this._spawn({ key: RING_KEY, base: 128, x: c.x, y: c.y, life: 700, s0: R * 0.8, s1: R * 5.2, a0: 0.9 * reduce, fi: 0, fo: 0.3, c0: PURPLE_PALE, c1: PURPLE, depth: DEPTH_RING }, true);

    // poeira escura empurrada pra fora
    for (let i = 0; i < 10; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = U * rand(0.05, 0.22);
      const tint = pick(DUST_TINTS);
      this._spawn({ key: GLOW_KEY, base: 64, add: false, x: c.x + Math.cos(ang) * R * 0.5, y: c.y + Math.sin(ang) * R * 0.4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6 - U * 0.03, drag: 2.2, life: rand(1300, 2400), s0: R * rand(0.4, 0.7), s1: R * rand(1.3, 2.2), a0: rand(0.35, 0.55), fi: 0.12, fo: 0.35, c0: tint, c1: tint, depth: DEPTH_DUST }, true);
    }
    // pedaços de chão arremessados
    for (let i = 0; i < 14; i++) this._chip(c.x + rand(-0.4, 0.4) * R, c.y + rand(-0.3, 0.3) * R);
    // faíscas
    for (let i = 0; i < 30; i++) this._spark(c.x + rand(-0.5, 0.5) * R, c.y + rand(-0.3, 0.3) * R, 1.3, true);
    // primeira lufada de energia subindo
    for (let i = 0; i < 10; i++) this._plume(c.x + rand(-0.6, 0.6) * R, c.y + rand(-0.3, 0.3) * R * 0.8, R, 1.2, true);
  }

  _updateCrater(c, dt, view, kick) {
    c.age += dt;
    const dtS = dt / 1000;
    const soft = this._reduced ? 0.5 : 1;
    const e = expoOut(Math.min(1, c.age / CRATER_INTRO_MS));
    const fadeIn = Math.min(1, c.age / 180);
    const flick = Math.sin(this._clock / 230 + c.phase) * 0.5 + Math.sin(this._clock / 97 + c.phase * 2.3) * 0.5; // -1..1
    const power = 0.55 + 0.45 * Math.exp(-c.age / 6000); // jorra mais forte no começo e segue forte depois

    // o chão cede: a cratera cresce e a luz acende dentro dela
    const sc = c.scale * Phaser.Math.Linear(0.6, 1, e);
    c.img.setScale(sc).setAlpha(fadeIn);
    c.glow.setScale(sc).setAlpha(Phaser.Math.Clamp((0.62 + 0.14 * flick * soft + kick * 0.3 * soft) * fadeIn, 0, 1));
    c.spill.setAlpha(Phaser.Math.Clamp((0.3 * power + 0.08 * flick * soft + kick * 0.2 * soft) * fadeIn, 0, 1));

    // coluna de energia
    const h = c.colH * e * (1 + 0.05 * flick * soft);
    c.colWide.setScale((c.R * 1.7) / 64, h / 256).setAlpha(Phaser.Math.Clamp((0.28 * power + kick * 0.12 * soft) * fadeIn, 0, 1));
    c.colCore.setScale((c.R * 0.7) / 64, (h * 1.05) / 256).setAlpha(Phaser.Math.Clamp((0.5 * power + 0.08 * flick * soft + kick * 0.15 * soft) * fadeIn, 0, 1));

    // só emite o que está perto da tela (a energia sobe, então vale a cratera logo abaixo)
    const near = c.x > view.x - c.R * 2 && c.x < view.right + c.R * 2 && c.y > view.y - c.R && c.y < view.bottom + view.height * 0.7;
    if (!near) return;
    const burst = c.age < 1500 ? 1 + 1.6 * (1 - c.age / 1500) : 1;
    const k = power * burst * (1 + kick * 0.6) * dtS * this._density;
    c.dPlume += 7 * k;
    c.dMote += 36 * k;
    c.dSpark += 9 * k;
    let guard = 0;
    while (c.dPlume >= 1 && guard++ < 20) {
      c.dPlume--;
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * c.R * 0.7;
      this._plume(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.8, c.R, 1);
    }
    while (c.dMote >= 1 && guard++ < 80) {
      c.dMote--;
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * c.R * 0.85;
      this._mote(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.8);
    }
    while (c.dSpark >= 1 && guard++ < 100) {
      c.dSpark--;
      const a = rand(0, Math.PI * 2);
      this._spark(c.x + Math.cos(a) * c.R * 0.6, c.y + Math.sin(a) * c.R * 0.45, 1);
    }
  }

  // ------------------------------------------------------------ energia saindo das fendas

  _emitFissure(f, dtS, view, kick) {
    if (f.shown < 2) return;
    const bb = f.bb;
    const pad = 140;
    if (bb.x1 < view.x - pad || bb.x0 > view.right + pad || bb.y1 < view.y - pad || bb.y0 > view.bottom + view.height * 0.7) return;
    const k = (1 + kick * 0.8) * this._density * dtS;

    // pontinhos luminosos soltos ao longo de toda a fenda aberta
    f.dMote += f.shown * 0.2 * k;
    let guard = 0;
    while (f.dMote >= 1 && guard++ < 30) {
      f.dMote--;
      const p = f.pts[Phaser.Math.Between(0, f.shown - 1)];
      if (p.x < view.x - 20 || p.x > view.right + 20 || p.y < view.y - 20 || p.y > view.bottom + view.height * 0.5) continue;
      this._mote(p.x + rand(-3, 3), p.y + rand(-3, 3));
    }

    // respiradouros: fumaça de energia, faíscas e pontos mais fortes
    for (const v of f.vents) {
      if (!v.drawn) continue;
      if (v.x < view.x - pad || v.x > view.right + pad || v.y < view.y - pad || v.y > view.bottom + view.height * 0.6) continue;
      v.dPlume += 1.1 * k;
      v.dSpark += 2.5 * k;
      v.dMote += 7 * k;
      while (v.dPlume >= 1) {
        v.dPlume--;
        this._plume(v.x + rand(-4, 4), v.y + rand(-4, 4), Math.max(18, v.w * 1.6), 0.55);
      }
      while (v.dSpark >= 1) {
        v.dSpark--;
        this._spark(v.x, v.y, 0.7);
      }
      while (v.dMote >= 1) {
        v.dMote--;
        this._mote(v.x + rand(-6, 6), v.y + rand(-4, 4));
      }
    }
  }

  // ------------------------------------------------------------ partículas de energia
  // Uma fila só pra tudo (clarão, onda, poeira, pedras, faíscas, fumaça de energia,
  // pontinhos). Vivem no MUNDO, então a câmera passa por cima delas.

  // coluna de energia: nuvem macia que sobe, cresce e esfria (pálido -> roxo fundo)
  _plume(x, y, size, power, force = false) {
    const view = this.scene.cameras.main.worldView;
    const U = this._unit;
    this._spawn(
      {
        key: GLOW_KEY,
        base: 64,
        x,
        y,
        vx: rand(-0.03, 0.03) * U,
        vy: -view.height * rand(0.2, 0.4) * power,
        ay: -view.height * 0.12,
        drag: 0.35,
        life: rand(1500, 2600),
        s0: size * rand(0.5, 0.8) * (0.6 + 0.4 * power),
        s1: size * rand(1.5, 2.3) * (0.6 + 0.4 * power),
        a0: rand(0.3, 0.5),
        fi: 0.12,
        fo: 0.45,
        c0: 0xd9b3ff,
        c1: 0x5a14a8,
        depth: DEPTH_ENERGY
      },
      force
    );
  }

  // pontinho luminoso que sobe balançando (primo roxo das partículas azuis)
  _mote(x, y) {
    const view = this.scene.cameras.main.worldView;
    const U = this._unit;
    this._spawn({
      key: GLOW_KEY,
      base: 64,
      x,
      y,
      vx: rand(-0.015, 0.015) * U,
      vy: -view.height * rand(0.07, 0.22),
      life: rand(1100, 2600),
      s0: rand(3, 7),
      s1: rand(1.5, 3),
      a0: rand(0.6, 0.95),
      fi: 0.1,
      fo: 0.55,
      sa: rand(2, 9),
      sf: rand(0.0012, 0.003),
      sp: rand(0, Math.PI * 2),
      c0: pick([PURPLE_PALE, PURPLE_BRIGHT, PURPLE_BRIGHT]),
      c1: PURPLE,
      depth: DEPTH_ENERGY
    });
  }

  // faísca em arco: sobe, abre e cai
  _spark(x, y, power, force = false) {
    const U = this._unit;
    const ang = -Math.PI / 2 + rand(-1.1, 1.1);
    const sp = U * rand(0.2, 0.55) * power;
    this._spawn(
      {
        key: GLOW_KEY,
        base: 64,
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        ay: U * 1.1,
        drag: 0.6,
        life: rand(450, 1000),
        s0: rand(2.5, 5.5),
        s1: 1,
        a0: 1,
        fi: 0,
        fo: 0.4,
        c0: WHITE,
        c1: PURPLE,
        depth: DEPTH_ENERGY
      },
      force
    );
  }

  // pedaço de chão arremessado (terra escura, gira e cai)
  _chip(x, y) {
    const U = this._unit;
    const ang = -Math.PI / 2 + rand(-1.4, 1.4);
    const sp = U * rand(0.25, 0.6);
    const size = rand(5, 10);
    const tint = pick(SOIL_TINTS);
    this._spawn(
      {
        key: CHIP_KEY,
        base: 12,
        add: false,
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        ay: U * 1.5,
        life: rand(700, 1300),
        s0: size,
        s1: size,
        a0: 1,
        fi: 0,
        fo: 0.7,
        rot: rand(0, Math.PI * 2),
        vr: rand(-9, 9),
        c0: tint,
        c1: tint,
        depth: DEPTH_CHIP
      },
      true
    );
  }

  _spawn(o, force = false) {
    if (this._live.length >= this._cap + (force ? 120 : 0)) return;
    const view = this.scene.cameras.main.worldView;
    const m = 120;
    // fora da área onde faz sentido existir: nem nasce
    if (o.x < view.x - m * 2 || o.x > view.right + m * 2 || o.y < view.y - m || o.y > view.bottom + view.height * 1.2) return;

    let p = this._pool.pop();
    if (!p) p = { img: this.scene.add.image(0, 0, GLOW_KEY) };
    p.img
      .setTexture(o.key)
      .setBlendMode(o.add === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setDepth(o.depth)
      .setRotation(o.rot || 0)
      .setPosition(o.x, o.y)
      .setAlpha(0)
      .setVisible(true);
    p.base = o.base;
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.ay = o.ay || 0;
    p.drag = o.drag || 0;
    p.vr = o.vr || 0;
    p.age = 0;
    p.life = o.life;
    p.s0 = o.s0;
    p.s1 = o.s1;
    p.a0 = o.a0;
    p.fi = o.fi;
    p.fo = o.fo;
    p.sa = o.sa || 0;
    p.sf = o.sf || 0;
    p.sp = o.sp || 0;
    p.c0 = rgb(o.c0);
    p.c1 = rgb(o.c1);
    this._live.push(p);
  }

  _stepParticles(dt, view) {
    const live = this._live;
    const dtS = dt / 1000;
    const m = 240;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this._release(i);
        continue;
      }
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dtS);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.ay * dtS;
      p.x += p.vx * dtS;
      p.y += p.vy * dtS;
      if (p.y < view.y - m || p.y > view.bottom + view.height * 1.2 || p.x < view.x - m * 2 || p.x > view.right + m * 2) {
        this._release(i);
        continue;
      }
      const sway = p.sa ? Math.sin(p.sp + p.age * p.sf) * p.sa : 0;
      const size = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      const fadeIn = p.fi > 0 ? smooth(k / p.fi) : 1;
      const fadeOut = 1 - smooth((k - p.fo) / (1 - p.fo));
      const r = Math.round(p.c0[0] + (p.c1[0] - p.c0[0]) * k);
      const g = Math.round(p.c0[1] + (p.c1[1] - p.c0[1]) * k);
      const b = Math.round(p.c0[2] + (p.c1[2] - p.c0[2]) * k);
      p.img.setPosition(p.x + sway, p.y).setScale(size / p.base).setAlpha(p.a0 * fadeIn * fadeOut).setTint((r << 16) | (g << 8) | b);
      if (p.vr) p.img.rotation += p.vr * dtS;
    }
  }

  _release(i) {
    const p = this._live[i];
    p.img.setVisible(false);
    this._pool.push(p);
    const last = this._live.pop();
    if (last !== p) this._live[i] = last;
  }

  // ------------------------------------------------------------ texturas (geradas por código)

  _ensureTextures() {
    const scene = this.scene;

    if (!scene.textures.exists(GLOW_KEY)) {
      const size = 64;
      const tex = scene.textures.createCanvas(GLOW_KEY, size, size);
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }

    // anel da onda de choque
    if (!scene.textures.exists(RING_KEY)) {
      const size = 128;
      const tex = scene.textures.createCanvas(RING_KEY, size, size);
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0)');
      g.addColorStop(0.84, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.92, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }

    // coluna de luz: macia dos lados, forte embaixo e some no alto
    if (!scene.textures.exists(COLUMN_KEY)) {
      const w = 64;
      const h = 256;
      const tex = scene.textures.createCanvas(COLUMN_KEY, w, h);
      const ctx = tex.getContext();
      const gx = ctx.createLinearGradient(0, 0, w, 0);
      gx.addColorStop(0, 'rgba(255,255,255,0)');
      gx.addColorStop(0.25, 'rgba(255,255,255,0.35)');
      gx.addColorStop(0.5, 'rgba(255,255,255,1)');
      gx.addColorStop(0.75, 'rgba(255,255,255,0.35)');
      gx.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gx;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-in';
      const gy = ctx.createLinearGradient(0, 0, 0, h);
      gy.addColorStop(0, 'rgba(0,0,0,0)');
      gy.addColorStop(0.55, 'rgba(0,0,0,0.5)');
      gy.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = gy;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      tex.refresh();
    }

    // pedacinho irregular de chão (cinza claro: é tingido na hora)
    if (!scene.textures.exists(CHIP_KEY)) {
      const size = 12;
      const tex = scene.textures.createCanvas(CHIP_KEY, size, size);
      const ctx = tex.getContext();
      const c = size / 2;
      const n = 6;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
        const r = rand(2.4, 5);
        const px = c + Math.cos(a) * r;
        const py = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#d0d0d0';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      tex.refresh();
    }

    for (let i = 0; i < CRATER_VARIANTS; i++) ensureCraterTextures(scene, craterKey(i), craterGlowKey(i), 4000 + i * 7919);
  }
}

// =====================================================================
// Cratera em pixel art (vista de cima, luz de cima/esquerda), no mesmo estilo
// do Pisão do Minotauro: contorno torto, poço escuro, parede interna com 4
// tons, borda de terra levantada e esfarelada, halo de terra amassada,
// rachaduras de 1px e pedras soltas. Aqui o fundo do poço e as frestas têm
// LUZ ROXA (textura de brilho separada, desenhada em ADD por cima).
// =====================================================================

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// terra escura puxada pro roxo (o brilho é que vem da textura de luz)
const SOIL = {
  rimLight: 0x7d6a86,
  rimMid: 0x5a4860,
  rimDark: 0x3a2c42,
  wallLight: 0x4a3a55,
  wallMid: 0x3a2c44,
  wallDark: 0x2a1e33,
  floor: 0x160d1f,
  floorDeep: 0x0c0612,
  crack: 0x0e0816,
  crackEdge: 0x5a4866
};

function pixelBuffer(w, h) {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

function setPx(b, x, y, hex, a = 255) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  b.data[i] = (hex >> 16) & 255;
  b.data[i + 1] = (hex >> 8) & 255;
  b.data[i + 2] = hex & 255;
  b.data[i + 3] = a;
}

function alphaAt(b, x, y) {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.data[(y * b.w + x) * 4 + 3];
}

function flushBuffer(scene, key, b) {
  const tex = scene.textures.createCanvas(key, b.w, b.h);
  const small = document.createElement('canvas');
  small.width = b.w;
  small.height = b.h;
  small.getContext('2d').putImageData(new ImageData(b.data, b.w, b.h), 0, 0);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR); // filtro suave: some o aspecto 'pixelão' quando estica
}

// gerador pseudo-aleatório com semente (a textura sai igual em toda partida)
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// linha de Bresenham: devolve os pixels do caminho
function linePixels(x0, y0, x1, y1, out) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// rachaduras irregulares saindo da borda: a cratera e o brilho usam os MESMOS caminhos
function pixelCracks(rng, c, rimR, K) {
  const cracks = [];
  const count = 9;
  const maxR = c - 1.5 * K;
  for (let i = 0; i < count; i++) {
    let a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    let r = rimR * (0.55 + rng() * 0.25);
    const end = Math.min(maxR, rimR + (8 + rng() * 12) * K);
    const pts = [];
    while (r < end) {
      pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
      r += (2 + rng() * 3) * K;
      a += (rng() - 0.5) * 0.5;
    }
    cracks.push(pts);
    if (rng() < 0.55 && pts.length > 3) {
      const [bx, by] = pts[Math.floor(pts.length / 2)];
      let ba = Math.atan2(by - c, bx - c) + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.4);
      const branch = [[bx, by]];
      let px = bx;
      let py = by;
      const steps = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < steps; s++) {
        ba += (rng() - 0.5) * 0.5;
        px += Math.cos(ba) * (2 + rng() * 2.5) * K;
        py += Math.sin(ba) * (2 + rng() * 2.5) * K;
        branch.push([px, py]);
      }
      cracks.push(branch);
    }
  }
  return cracks;
}

function ensureCraterTextures(scene, baseKey, glowKey, seed) {
  if (scene.textures.exists(baseKey) && scene.textures.exists(glowKey)) return;
  const rng = makeRng(seed);
  const size = CRATER_TEX;
  const c = size / 2;
  const K = size / 72; // as medidas abaixo foram pensadas em 72px
  const Rp = 24 * K; // raio médio do poço
  const base = pixelBuffer(size, size);
  const glow = pixelBuffer(size, size);

  // contorno irregular: lóbulos + ruído suave
  const lobes = [[2, 0.06], [3, 0.05], [5, 0.035]].map(([k, amp]) => [k, amp, rng() * 6.28]);
  const N = 24;
  const noise = Array.from({ length: N }, () => rng() * 2 - 1);
  const radiusAt = (ang) => {
    let r = 1;
    lobes.forEach(([k, amp, ph]) => {
      r += Math.sin(ang * k + ph) * amp;
    });
    const t = ((ang + Math.PI) / (Math.PI * 2)) * N;
    r += Phaser.Math.Linear(noise[Math.floor(t) % N], noise[Math.ceil(t) % N], t % 1) * 0.05;
    return r;
  };

  const pitPx = []; // pixels do fundo do poço (pra luz)
  const wallPx = []; // pixels da parede interna (a luz sobe por ela)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const edge = Rp * radiusAt(ang);
      const u = dist / edge;
      const facing = dist > 0 ? (-dx - dy) / (dist * Math.SQRT2) : 0; // + = lado da luz (cima/esquerda)
      const bz = bayer(x, y);

      if (u < 0.62) {
        setPx(base, x, y, bz < 0.35 + u * 0.4 ? SOIL.floor : SOIL.floorDeep);
        pitPx.push([x, y, u]);
      } else if (u < 1) {
        // parede interna: o lado da luz fica na sombra (a parede vira as costas), o oposto pega luz
        const t = (u - 0.62) / 0.38;
        const v = 0.2 + t * 0.3 - facing * 0.38 * t + (bz - 0.5) * 0.22;
        const col = v < 0.2 ? SOIL.floor : v < 0.36 ? SOIL.wallDark : v < 0.52 ? SOIL.wallMid : SOIL.wallLight;
        setPx(base, x, y, col);
        wallPx.push([x, y, u]);
      } else {
        const out = dist - edge; // px além do poço
        if (out < 4.6 * K) {
          // borda levantada: clara no lado da luz, escura no oposto, esfarelando por fora
          if (out > 3 * K && bz > 1 - ((4.6 * K - out) / (1.6 * K)) * 0.9) continue;
          const v = 0.5 + facing * 0.5 + (bz - 0.5) * 0.3 - (out / (4.6 * K)) * 0.1;
          setPx(base, x, y, v > 0.62 ? SOIL.rimLight : v > 0.34 ? SOIL.rimMid : SOIL.rimDark);
        } else if (out < 10 * K) {
          // terra amassada: sombra tracejada, mais forte no lado oposto à luz
          const k = (1 - (out - 4.6 * K) / (5.4 * K)) * (0.35 + 0.35 * (1 - facing));
          if (bz < k) setPx(base, x, y, SOIL.floorDeep, 90);
        }
      }
    }
  }

  // rachaduras: escuras no chão (com fio claro no lado da luz), roxas no brilho
  const cracks = pixelCracks(rng, c, Rp, K);
  const crackSet = new Set();
  cracks.forEach((pts) => {
    const px = [];
    for (let i = 1; i < pts.length; i++) linePixels(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], px);
    px.forEach(([x, y]) => crackSet.add(`${x},${y}`));
  });
  Array.from(crackSet).forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    crackSet.add(`${x + 1},${y}`);
  });
  const isCrack = (x, y) => crackSet.has(`${x},${y}`);
  crackSet.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    [[-1, 0], [0, -1], [-1, -1]].forEach(([ox, oy]) => {
      const nx = x + ox;
      const ny = y + oy;
      if (!isCrack(nx, ny) && alphaAt(base, nx, ny) > 0) setPx(base, nx, ny, SOIL.crackEdge, 200);
    });
  });
  crackSet.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    setPx(base, x, y, SOIL.crack);
    setPx(glow, x, y, PURPLE_PALE);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
      if (!isCrack(x + ox, y + oy)) setPx(glow, x + ox, y + oy, PURPLE, 150);
    });
  });
  crackSet.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]].forEach(([ox, oy]) => {
      if (alphaAt(glow, x + ox, y + oy) === 0 && rng() < 0.55) setPx(glow, x + ox, y + oy, PURPLE_DEEP, 120);
    });
  });

  // luz roxa no fundo do poço: densa no centro, rala perto da parede
  pitPx.forEach(([x, y, u]) => {
    const p = (0.62 - u) / 0.62;
    if (rng() < 0.2 + p * 0.7) {
      const col = p > 0.65 ? (bayer(x, y) < 0.5 ? PURPLE_PALE : PURPLE_BRIGHT) : p > 0.3 ? (bayer(x, y) < 0.5 ? PURPLE_BRIGHT : PURPLE) : PURPLE;
      setPx(glow, x, y, col, Math.round(150 + p * 90));
    }
  });
  // a luz sobe um pouco pela parede interna
  wallPx.forEach(([x, y, u]) => {
    const p = (0.82 - u) / 0.2;
    if (p > 0 && rng() < p * 0.35) setPx(glow, x, y, PURPLE, 120);
  });

  // pedras soltas ao redor da borda
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2;
    const r = Rp * radiusAt(a) + (5 + rng() * 9) * K;
    const px = Math.round(c + Math.cos(a) * r);
    const py = Math.round(c + Math.sin(a) * r);
    const w = K * (1 + Math.floor(rng() * 2));
    const h = K * (1 + Math.floor(rng() * 2));
    if (px < 2 || py < 2 || px > size - 3 - w || py > size - 3 - h) continue;
    for (let yy = 0; yy <= h; yy++) {
      for (let xx = 0; xx <= w; xx++) {
        const col = xx === 0 || yy === 0 ? SOIL.rimLight : xx === w || yy === h ? SOIL.rimDark : SOIL.rimMid;
        setPx(base, px + xx, py + yy, col);
      }
    }
    if (rng() < 0.3) setPx(base, px, py, PURPLE_BRIGHT);
  }

  flushBuffer(scene, baseKey, base);
  flushBuffer(scene, glowKey, glow);
}
