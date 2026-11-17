import SettingsManager from './SettingsManager.js';

// O MAR DO LEVIATÃ — camada visual da Cena 05 (a direção, o "quando", vive em
// VictorySea.js). O Leviatã NÃO aparece: aqui só existem os sinais de algo que
// está embaixo da água. Cada sinal é um verbo que a direção chama:
//
//   bubble()    uma bolha isolada sobe e estoura, e o anel dela corre no mar parado
//   setSwarm()  o enxame de bolhas (cada vez mais, cada vez mais perto)
//   pulse()     um batimento: a sombra incha por um instante e uma onda CONTRAI
//               até o epicentro (a água sendo sugada pra algo que sobe)
//   dark        a sombra sob a água (amount 0..1, radius × largura da tela)
//   freeze()    segura o fôlego: nada novo nasce e o que existe some rápido
//   breach()    a quebra: ondas gigantes saem do epicentro
//
// A sombra e as ondas são desenhadas pelo PRÓPRIO shader do mar (fx/SeaFx.js:
// seaFx.dark / seaFx.rings), então só existem sobre água de verdade, na grade do
// pixel art, e nunca passam da praia. Só as bolhas são sprites (poucos, sempre
// perto do epicentro, dentro d'água).
//
// Sem o shader do mar (WebGL fora / sem camada de água) nada disto aparece e o
// resto da cinemática (câmera, som, texto) segue igual.

const DEPTH_BUBBLE = 1.67; // shader do mar = 1.5, layer Costa = 2
const WATER_MARGIN_PX = 56; // nada nasce na praia
const RING_SLOTS = 6; // o shader desenha até 6 ondas ao mesmo tempo
const BUBBLE_CAP = 70;
const BUBBLE_SIZE_MIN = 0.009; // × largura da tela
const BUBBLE_SIZE_MAX = 0.026;
const BUBBLE_SIZE_LONE = 0.03;
const BUBBLE_LIFE_MIN_MS = 900;
const BUBBLE_LIFE_MAX_MS = 1700;
const BUBBLE_LIFE_LONE_MIN_MS = 1250;
const BUBBLE_LIFE_LONE_MAX_MS = 1550;
const FREEZE_FADE_MS = 600; // ao segurar o fôlego, o que existe some nesse tempo
const BUMP_DECAY_MS = 520; // o "inspirar" de cada batimento
const BUMP_RADIUS = 0.045;
const BUMP_DARK = 0.1;
const DRIFT_VIEW = 0.012; // deriva lateral da sombra
const POP_SFX_GAP_MS = 150; // bolhas do enxame: no máximo um som por esse intervalo

const KEY_BUBBLE = 'vlv_bubble';
const BUBBLE_TEX = 64;

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);
const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 2.2);

export default class VictoryLeviathan {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    // pilotada pela direção (VictorySea) via tween: sombra sob a água
    this.dark = { amount: 0, radius: 0.1 };
    // chamada quando uma bolha DO ENXAME estoura (a direção liga o som aqui)
    this.onSwarmPop = null;
    this._rings = [];
    this._bubbles = [];
    this._pool = [];
    this._bump = 0;
    this._t = 0;
    this._swarmRate = 0;
    this._swarmField = 0.05;
    this._swarmDebt = 0;
    this._frozen = false;
    this._frozenMs = 0;
    this._calm = 1; // 1 -> 0 no freeze()
    this._popSfxAt = 0;
    scene.events.once('shutdown', () => this.destroy());
  }

  // target: ponto do mar onde a câmera chegou (FinalCameraTarget)
  start(target) {
    if (this.started) return;
    const scene = this.scene;
    const view = scene.cameras.main.worldView;
    this._reduced = !!SettingsManager.getReducedFlashes?.();
    this._U = view.width;
    this._ensureTextures();

    // epicentro: na metade de cima da tela (a água fica ao norte), nunca na praia
    this._waterLimit = this._findWaterBottom(target.x, this._U) - WATER_MARGIN_PX;
    const spawn = scene.mapManager?.getLeviathanSpawn?.();
    const y = Phaser.Math.Clamp(spawn?.y ?? view.y + view.height * 0.3, view.y + view.height * 0.2, view.y + view.height * 0.4);
    this._ex = target.x;
    this._ey = Math.min(y, this._waterLimit - this._U * 0.1);
    this.started = true;
  }

  // ---------------------------------------------------------------- verbos da direção

  // uma bolha isolada: dx/dy (× largura da tela) a partir do epicentro
  bubble({ dx = 0, dy = 0, size = 1, onPop = null } = {}) {
    if (!this.started) return;
    const U = this._U;
    const x = this._ex + dx * U;
    const y = Math.min(this._ey + dy * U, this._waterLimit);
    this._addBubble(x, y, U * BUBBLE_SIZE_LONE * size, rand(BUBBLE_LIFE_LONE_MIN_MS, BUBBLE_LIFE_LONE_MAX_MS), onPop);
  }

  // enxame: `rate` bolhas por segundo dentro de um campo de raio `field` (× largura da tela)
  setSwarm(rate, field = 0.05) {
    this._swarmRate = Math.max(0, rate);
    this._swarmField = field;
  }

  // onda que CONTRAI até o epicentro: a água sendo puxada pra baixo
  converge(strength = 0.5) {
    if (!this.started || this._frozen) return;
    const U = this._U;
    this._pushRing({
      x: this._ex,
      y: this._ey,
      r0: U * (0.3 + 0.12 * strength),
      r1: U * 0.025,
      life: 1700 - 500 * strength,
      a0: 0.4 + 0.45 * strength,
      inward: true
    }, true);
  }

  // um batimento: a sombra incha, uma onda converge
  pulse(strength = 0.5) {
    if (!this.started || this._frozen) return;
    this._bump = 1;
    this.converge(strength);
  }

  // segura o fôlego: nada novo nasce; ondas e bolhas que existem se apagam
  freeze() {
    if (!this.started || this._frozen) return;
    this._frozen = true;
    this._frozenMs = 0;
    this._swarmRate = 0;
    this._bump = 0;
  }

  // A QUEBRA: a água é empurrada de baixo, em ondas que saem do epicentro e
  // varrem a tela. A criatura não vem: quem some é a sombra (a direção afunda
  // dark.amount) — o que quer que fosse, ficou embaixo.
  breach() {
    if (!this.started) return;
    this._frozen = false;
    this._calm = 1;
    this._swarmRate = 0;
    const U = this._U;
    const waves = [
      { at: 0, r1: 1.4, life: 3600, a0: 1 },
      { at: 260, r1: 0.85, life: 2800, a0: 0.8 },
      { at: 700, r1: 0.5, life: 2200, a0: 0.65 }
    ];
    waves.forEach((w) => {
      this.scene.time.delayedCall(w.at, () => {
        if (!this.started) return;
        this._pushRing({ x: this._ex, y: this._ey, r0: U * 0.03, r1: U * w.r1, life: w.life, a0: w.a0 }, true);
      });
    });
  }

  // ---------------------------------------------------------------- por frame

  update(delta) {
    if (!this.started) return;
    const dt = Math.min(delta, 100);
    this._t += dt;
    const sea = this.scene.seaFx;
    const U = this._U;

    if (this._frozen) {
      this._frozenMs += dt;
      this._calm = 1 - smooth(this._frozenMs / FREEZE_FADE_MS);
    }
    this._bump = Math.max(0, this._bump - dt / BUMP_DECAY_MS);

    // enxame: bolhas por segundo dentro do campo
    if (this._swarmRate > 0 && !this._frozen) {
      this._swarmDebt += this._swarmRate * (this._reduced ? 0.6 : 1) * (dt / 1000);
      while (this._swarmDebt >= 1) {
        this._swarmDebt -= 1;
        this._spawnSwarmBubble();
      }
    }

    this._stepBubbles(dt);
    const rings = this._stepRings(dt);

    if (sea) {
      const drift = Math.sin(this._t / 2600) * U * DRIFT_VIEW;
      sea.dark.amount = this.dark.amount * (1 + BUMP_DARK * this._bump);
      sea.dark.radius = this.dark.radius * U * (1 + BUMP_RADIUS * this._bump);
      sea.dark.x = this._ex + drift;
      sea.dark.y = this._ey;
      sea.rings = rings;
    }
  }

  // ---------------------------------------------------------------- ondas

  // prioridade alta (batimento/quebra) rouba o lugar da mais velha; as pequenas esperam vaga
  _pushRing(cfg, priority = false) {
    if (this._rings.length >= RING_SLOTS) {
      if (!priority) return;
      let oldest = 0;
      this._rings.forEach((r, i) => {
        if (r.age / r.life > this._rings[oldest].age / this._rings[oldest].life) oldest = i;
      });
      this._rings.splice(oldest, 1);
    }
    this._rings.push({ ...cfg, age: 0 });
  }

  _stepRings(dt) {
    const out = [];
    const soft = this._reduced ? 0.6 : 1;
    for (let i = this._rings.length - 1; i >= 0; i--) {
      const r = this._rings[i];
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        this._rings.splice(i, 1);
        continue;
      }
      let radius;
      let alpha;
      if (r.inward) {
        radius = r.r0 + (r.r1 - r.r0) * k * k; // acelera pra dentro (sucção)
        alpha = smooth(k / 0.25) * (1 - smooth((k - 0.8) / 0.2));
      } else {
        radius = r.r0 + (r.r1 - r.r0) * easeOut(k);
        alpha = smooth(k / 0.1) * Math.pow(1 - k, 1.5);
      }
      out.push({ x: r.x, y: r.y, r: radius, a: r.a0 * alpha * this._calm * soft });
    }
    return out;
  }

  // ---------------------------------------------------------------- bolhas

  _spawnSwarmBubble() {
    const U = this._U;
    const r = U * this._swarmField * Math.sqrt(Math.random());
    const a = rand(0, Math.PI * 2);
    const x = this._ex + Math.cos(a) * r * 1.3;
    const y = Math.min(this._ey + Math.sin(a) * r * 0.7, this._waterLimit);
    const grow = 1 + 0.5 * Math.min(1, this._swarmField / 0.2);
    this._addBubble(x, y, U * rand(BUBBLE_SIZE_MIN, BUBBLE_SIZE_MAX) * grow, rand(BUBBLE_LIFE_MIN_MS, BUBBLE_LIFE_MAX_MS), null, true);
  }

  _addBubble(x, y, size, life, onPop, swarm = false) {
    if (this._bubbles.length >= BUBBLE_CAP) return;
    const img = this._pool.pop() || this.scene.add.image(0, 0, KEY_BUBBLE).setDepth(DEPTH_BUBBLE);
    img.setPosition(x, y).setVisible(true).setAlpha(0).setScale(0.01);
    this._bubbles.push({ img, x, y, age: 0, life, size, ph: rand(0, Math.PI * 2), onPop, swarm });
  }

  _stepBubbles(dt) {
    for (let i = this._bubbles.length - 1; i >= 0; i--) {
      const b = this._bubbles[i];
      b.age += dt;
      const k = b.age / b.life;
      if (k >= 1) {
        if (!this._frozen) {
          // estoura: um anel na superfície (o da bolha isolada é bem maior)
          const U = this._U;
          if (b.swarm) this._pushRing({ x: b.x, y: b.y, r0: b.size * 0.5, r1: b.size * 2.8, life: 560, a0: 0.4 });
          else this._pushRing({ x: b.x, y: b.y, r0: b.size * 0.4, r1: U * 0.085, life: 2600, a0: 0.75 }, true);
          this._popSound(b);
        }
        b.img.setVisible(false);
        this._pool.push(b.img);
        this._bubbles.splice(i, 1);
        continue;
      }
      const grow = k < 0.35 ? easeOut(k / 0.35) : 1 + 0.06 * Math.sin(b.age / 140 + b.ph); // incha e fica trêmula
      const a = smooth(k / 0.1) * (k > 0.9 ? 1 - (k - 0.9) / 0.1 : 1) * 0.92 * this._calm;
      b.img
        .setPosition(b.x + Math.sin(b.age / 260 + b.ph) * 2, b.y - b.age * 0.004)
        .setScale((b.size * grow) / BUBBLE_TEX)
        .setAlpha(a);
    }
  }

  _popSound(b) {
    if (b.onPop) {
      b.onPop();
      return;
    }
    if (b.swarm && this.onSwarmPop && this._t - this._popSfxAt >= POP_SFX_GAP_MS) {
      this._popSfxAt = this._t;
      this.onSwarmPop(b.size / (this._U * BUBBLE_SIZE_MAX));
    }
  }

  // ---------------------------------------------------------------- mapa

  // primeira linha (em px) abaixo da água, olhando algumas colunas em volta
  _findWaterBottom(x, span) {
    const map = this.scene.mapManager?.map;
    const layer = map?.getLayer?.('Mar');
    if (!layer) return Infinity;
    const tw = map.tileWidth;
    const th = map.tileHeight;
    let bottom = Infinity;
    for (let k = -2; k <= 2; k++) {
      const col = Math.floor((x + (k * span) / 4) / tw);
      let row = 0;
      while (row < map.height && layer.data[row]?.[col]?.index > 0) row++;
      bottom = Math.min(bottom, row * th);
    }
    return bottom < 256 ? Infinity : bottom;
  }

  // ---------------------------------------------------------------- texturas

  _ensureTextures() {
    if (!this.scene.textures.exists(KEY_BUBBLE)) this._makeBubble();
  }

  // bolha vista de cima: aro claro, miolo translúcido e um brilho no canto
  _makeBubble() {
    const c = this.scene.textures.createCanvas(KEY_BUBBLE, BUBBLE_TEX, BUBBLE_TEX);
    const ctx = c.getContext();
    const m = BUBBLE_TEX / 2;
    const body = ctx.createRadialGradient(m, m, 0, m, m, m);
    body.addColorStop(0, 'rgba(205,232,246,0.08)');
    body.addColorStop(0.72, 'rgba(205,232,246,0.2)');
    body.addColorStop(0.86, 'rgba(235,248,255,0.85)');
    body.addColorStop(0.95, 'rgba(235,248,255,0.4)');
    body.addColorStop(1, 'rgba(235,248,255,0)');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, BUBBLE_TEX, BUBBLE_TEX);
    const hx = m * 0.66;
    const hy = m * 0.6;
    const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, m * 0.26);
    hl.addColorStop(0, 'rgba(255,255,255,0.95)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(hx, hy, m * 0.26, 0, Math.PI * 2);
    ctx.fill();
    c.refresh();
  }

  // ---------------------------------------------------------------- fim

  destroy() {
    const sea = this.scene?.seaFx;
    if (sea) {
      sea.agitation = 0;
      sea.stillness = 0;
      sea.dark.amount = 0;
      sea.rings = [];
    }
    this._bubbles.forEach((b) => b.img?.destroy());
    this._pool.forEach((i) => i?.destroy());
    this._bubbles = [];
    this._pool = [];
    this._rings = [];
    this.started = false;
  }
}
