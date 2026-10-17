import config from '../../data/shoreFx.js';
import SettingsManager from '../systems/SettingsManager.js';

const MASK_KEY = 'shore_mask';
const SHADER_KEY = 'shore_blend_shader';
const NOISE_PERIOD = 16384;
const SD_RANGE_TILES = 6;

const VERT = `
precision mediump float;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
attribute vec2 inPosition;
varying vec2 vLocal;
void main () {
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(inPosition, 1.0, 1.0);
  vLocal = inPosition;
}
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D iChannel0;
uniform float uTime;
uniform vec2 uWorldOffset;
uniform vec2 uMaskOrigin;
uniform vec2 uMaskScale;
uniform vec2 uMaskSize;
uniform float uPx;
uniform float uFringe;
uniform float uFringeStrength;
uniform float uPebbleReach;
uniform float uPebbleAmount;
uniform float uWetBand;
uniform float uWetStrength;
uniform float uTide;
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uGrassC;
uniform vec3 uSandLight;
uniform vec3 uSandMid;
uniform vec3 uWet;
uniform vec3 uWetSand;
varying vec2 vLocal;

float hash(vec2 p) {
  p = mod(p, 64.0);
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float bayer2(vec2 a) { return mod(2.0 * a.x + 3.0 * a.y, 4.0); }
float bayer4(vec2 p) {
  vec2 a = mod(p, 2.0);
  vec2 b = mod(floor(p / 2.0), 2.0);
  return (bayer2(a) * 4.0 + bayer2(b) + 0.5) / 16.0;
}

// compõe (premultiplicado) col/a por cima de dst
vec4 over(vec4 dst, vec3 col, float a) {
  return vec4(col * a + dst.rgb * (1.0 - a), a + dst.a * (1.0 - a));
}

void main () {
  vec2 q = (floor(vLocal / uPx) + 0.5) * uPx;
  vec2 w = uWorldOffset + q;
  vec4 m = texture2D(iChannel0, uMaskOrigin + q * uMaskScale);

  float sdG = (m.r - 0.5) * 2.0 * ${SD_RANGE_TILES}.0 * 64.0;  // + = lado da praia, - = lado da grama
  float sdW = (m.g - 0.5) * 2.0 * ${SD_RANGE_TILES}.0 * 64.0;  // + = lado da terra, - = dentro d'água
  // classe exata do tile (leitura no centro do texel, sem interpolar)
  vec2 mp = (uMaskOrigin + q * uMaskScale) * uMaskSize;
  bool onCoast = texture2D(iChannel0, (floor(mp) + 0.5) / uMaskSize).b > 0.5;

  // saída rápida: longe de qualquer borda não há nada a desenhar
  if (abs(sdG) > 240.0 && abs(sdW) > 140.0) { gl_FragColor = vec4(0.0); return; }

  vec2 pc = floor(w / uPx);
  float n1 = vnoise(w / 48.0);
  float n2 = vnoise(w / 14.0 + 7.0);
  float warp = (n1 - 0.5) * 80.0 + (n2 - 0.5) * 24.0;
  float tide = sin(uTime * 0.35 + w.x / 700.0) * 9.0 * uTide;
  float dith = bayer4(pc);
  vec4 o = vec4(0.0);

  // (1) areia molhada: escurece a praia perto da água (translúcido)
  if (onCoast && sdW > 0.0) {
    float d = sdW + (n1 - 0.5) * 44.0 + tide;
    float wet = (1.0 - smoothstep(0.0, uWetBand, d)) * uWetStrength;
    o = over(o, uWet, 0.34 * wet);
    // borda da faixa molhada em dither
    float rim = (1.0 - smoothstep(uWetBand * 0.55, uWetBand * 1.1, d)) * uWetStrength;
    o = over(o, uWet * 0.8, step(dith, rim * 0.35) * 0.22);
  }

  // (2) borda de areia dentro d'água: quebra o degrau do tile
  if (sdW <= 0.0) {
    float lim = 5.0 + n2 * 11.0 + tide * 0.4;
    if (-sdW < lim) {
      vec3 sc = -sdW > lim - 4.0 ? uSandMid : uWetSand;
      o = over(o, sc, 1.0);
    }
  }

  // (3) grama invadindo a praia, em pixel dither
  if (onCoast && sdG > -40.0 && uFringeStrength > 0.0) {
    float g = sdG + warp;
    float cov = pow(1.0 - smoothstep(-10.0, uFringe, g), 1.35) * uFringeStrength;
    float r = hash(pc + 5.0);
    vec3 gc = r < 0.70 ? uGrassA : (r < 0.92 ? uGrassB : uGrassC);
    // véu escuro suave + pixels de grama opacos por dither
    o = over(o, uGrassA, 0.22 * cov * cov);
    float paint = step(dith, cov * 1.05) * step(0.0001, cov);
    o = over(o, gc, paint);
  }

  // (4) pedrinhas/areia espalhadas na grama
  if (!onCoast && sdG < 0.0 && uPebbleAmount > 0.0) {
    float dist = -sdG + warp * 0.4;
    float dens = pow(1.0 - smoothstep(0.0, uPebbleReach, dist), 1.6) * 0.10 * uPebbleAmount;
    dens *= 0.3 + 1.4 * smoothstep(0.45, 0.75, n1);
    float r = hash(pc + 11.0);
    if (r < dens) {
      float k = hash(pc + 3.0);
      vec3 pcol = k > 0.88 ? uSandLight * 0.85 : uSandMid * (0.55 + 0.45 * k);
      o = over(o, pcol, 0.9);
    }
  }

  gl_FragColor = o;
}
`;

function v3(a) {
  return { x: a[0], y: a[1], z: a[2] };
}

// Transição visual da praia: ver data/shoreFx.js. Um quad só do tamanho do
// que a câmera vê da faixa da costa; some quando você está longe dela.
export default class ShoreFx {
  static create(scene, mapManager) {
    if (!config.enabled) return null;
    if (scene.renderer.type !== Phaser.WEBGL) return null;
    try {
      const fx = new ShoreFx(scene, mapManager);
      return fx.ok ? fx : null;
    } catch (e) {
      console.warn('[ShoreFx] desativado:', e);
      return null;
    }
  }

  constructor(scene, mapManager) {
    this.scene = scene;
    this.ok = false;
    this.shader = null;

    const map = mapManager.map;
    const coast = map.getLayer(config.coastLayer)?.data;
    const water = map.getLayer(config.waterLayer)?.data;
    if (!coast) return;

    const cols = map.width;
    const tile = map.tileWidth;
    let minRow = Infinity;
    let maxRow = -1;
    for (let y = 0; y < map.height; y++) {
      if (coast[y].some((t) => t && t.index > 0)) {
        minRow = Math.min(minRow, y);
        maxRow = Math.max(maxRow, y);
      }
    }
    if (maxRow < 0) return;
    const row0 = Math.max(0, minRow - 3);
    const rows = Math.min(map.height, maxRow + 5) - row0;

    this.rect = { x: 0, y: row0 * tile, w: cols * tile, h: rows * tile };
    this._buildMask(coast, water, cols, row0, rows);

    const c = config.colors;
    const uniforms = {
      uTime: { type: '1f', value: 0 },
      uWorldOffset: { type: '2f', value: { x: 0, y: 0 } },
      uMaskOrigin: { type: '2f', value: { x: 0, y: 0 } },
      uMaskScale: { type: '2f', value: { x: 1 / this.rect.w, y: 1 / this.rect.h } },
      uMaskSize: { type: '2f', value: { x: cols, y: rows } },
      uPx: { type: '1f', value: config.pixelSize },
      uFringe: { type: '1f', value: config.grassFringePx },
      uFringeStrength: { type: '1f', value: config.grassFringeStrength },
      uPebbleReach: { type: '1f', value: config.pebbleReachPx },
      uPebbleAmount: { type: '1f', value: config.pebbleAmount },
      uWetBand: { type: '1f', value: config.wetBandPx },
      uWetStrength: { type: '1f', value: config.wetStrength },
      uTide: { type: '1f', value: config.tide },
      uGrassA: { type: '3f', value: v3(c.grassA) },
      uGrassB: { type: '3f', value: v3(c.grassB) },
      uGrassC: { type: '3f', value: v3(c.grassC) },
      uSandLight: { type: '3f', value: v3(c.sandLight) },
      uSandMid: { type: '3f', value: v3(c.sandMid) },
      uWet: { type: '3f', value: v3(c.wet) },
      uWetSand: { type: '3f', value: v3(c.wetSand) }
    };

    const base = new Phaser.Display.BaseShader(SHADER_KEY, FRAG, VERT, uniforms);
    this.shader = scene.add
      .shader(base, 0, 0, 64, 64, [MASK_KEY], {
        source: this.maskCanvas,
        repeat: false,
        wrapS: 'CLAMP_TO_EDGE',
        wrapT: 'CLAMP_TO_EDGE',
        minFilter: 'LINEAR',
        magFilter: 'LINEAR',
        flipY: false
      })
      .setOrigin(0, 0)
      .setDepth(config.depth)
      .setVisible(false);

    scene.events.once('shutdown', () => this.destroy());
    this.ok = true;
  }

  // Três canais, 1px por tile, com distâncias assinadas (em tiles, ±6):
  //  R: borda praia/grama   (+ praia, - grama)
  //  G: borda terra/água    (+ terra,  - água)
  //  B: 255 se é praia
  _buildMask(coastData, waterData, cols, row0, rows) {
    const CLS_WATER = 0;
    const CLS_COAST = 1;
    const CLS_LAND = 2;
    const cls = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const gy = row0 + y;
        const isWater = waterData && waterData[gy]?.[x] && waterData[gy][x].index > 0;
        const isCoast = coastData[gy]?.[x] && coastData[gy][x].index > 0;
        cls[y * cols + x] = isWater ? CLS_WATER : isCoast ? CLS_COAST : CLS_LAND;
      }
    }

    const INF = 1e3;
    const distTo = (target) => {
      const d = new Float32Array(cols * rows);
      for (let i = 0; i < d.length; i++) d[i] = target(cls[i]) ? 0 : INF;
      const get = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? INF : d[y * cols + x]);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          d[i] = Math.min(d[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + 1.414, get(x + 1, y - 1) + 1.414);
        }
      }
      for (let y = rows - 1; y >= 0; y--) {
        for (let x = cols - 1; x >= 0; x--) {
          const i = y * cols + x;
          d[i] = Math.min(d[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + 1.414, get(x - 1, y + 1) + 1.414);
        }
      }
      return d;
    };
    const toLand = distTo((c) => c === CLS_LAND);
    const toCoast = distTo((c) => c === CLS_COAST);
    const toWater = distTo((c) => c === CLS_WATER);
    const toDry = distTo((c) => c !== CLS_WATER);

    const enc = (sdTiles) => {
      const v = Math.max(-SD_RANGE_TILES, Math.min(SD_RANGE_TILES, sdTiles));
      return Math.round((v / SD_RANGE_TILES * 0.5 + 0.5) * 255);
    };

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) {
      const c = cls[i];
      let r;
      let g;
      if (c === CLS_COAST) {
        r = toLand[i] - 0.5;
        g = toWater[i] - 0.5;
      } else if (c === CLS_LAND) {
        r = -(toCoast[i] - 0.5);
        g = toWater[i] >= INF ? SD_RANGE_TILES : toWater[i] - 0.5;
      } else {
        r = SD_RANGE_TILES; // água: nada de grama/praia aqui
        g = -(toDry[i] - 0.5);
      }
      img.data[i * 4] = enc(r);
      img.data[i * 4 + 1] = enc(g);
      img.data[i * 4 + 2] = c === CLS_COAST ? 255 : 0;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.maskCanvas = canvas;

    const textures = this.scene.textures;
    if (textures.exists(MASK_KEY)) textures.remove(MASK_KEY);
    textures.addCanvas(MASK_KEY, canvas);
  }

  update() {
    if (!this.shader) return;
    const view = this.scene.cameras.main.worldView;
    const r = this.rect;
    const pad = 64;
    const x0 = Math.max(r.x, Math.floor((view.x - pad) / 64) * 64);
    const y0 = Math.max(r.y, Math.floor((view.y - pad) / 64) * 64);
    const x1 = Math.min(r.x + r.w, Math.ceil((view.right + pad) / 64) * 64);
    const y1 = Math.min(r.y + r.h, Math.ceil((view.bottom + pad) / 64) * 64);
    if (x1 <= x0 || y1 <= y0) {
      this.shader.setVisible(false);
      return;
    }

    const sh = this.shader;
    sh.setVisible(true);
    sh.setPosition(x0, y0);
    sh.setSize(x1 - x0, y1 - y0);

    const reduced = SettingsManager.getReducedMotion();
    this._clock = (this._clock || 0) + (this.scene.game.loop.delta / 1000) * (reduced ? config.reducedMotionFactor : 1);

    const u = sh.uniforms;
    u.uTime.value = this._clock;
    u.uWorldOffset.value.x = x0 % NOISE_PERIOD;
    u.uWorldOffset.value.y = y0;
    u.uMaskOrigin.value.x = (x0 - r.x) / r.w;
    u.uMaskOrigin.value.y = (y0 - r.y) / r.h;
  }

  destroy() {
    this.shader?.destroy();
    this.shader = null;
    if (this.scene.textures?.exists(MASK_KEY)) this.scene.textures.remove(MASK_KEY);
  }
}
