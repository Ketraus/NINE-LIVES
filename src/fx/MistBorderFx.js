import config from '../../data/mistBorder.js';

const MASK_KEY = 'mistborder_mask';
const SHADER_KEY = 'mistborder_blend_shader';
// MMC das escalas de ruído (40*64, 12*64, 4*64...) com folga acima do mapa.
const NOISE_PERIOD = 21504 * 4;
const SD_RANGE_TILES = 4;
const BLOCK = 8; // tiles por bloco no teste de visibilidade
const MARGIN_TILES = 3;

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
uniform vec2 uWorldOffset;
uniform vec2 uMaskOrigin;
uniform vec2 uMaskScale;
uniform vec2 uMaskSize;
uniform float uPx;
uniform float uDarken;
uniform float uInvade;
uniform float uWarp;
uniform float uStrength;
uniform vec3 uDark;
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uGrassC;
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

void main () {
  vec2 q = (floor(vLocal / uPx) + 0.5) * uPx;
  vec2 w = uWorldOffset + q;
  vec2 mu = uMaskOrigin + q * uMaskScale;
  vec4 m = texture2D(iChannel0, mu);

  // distância assinada até a borda (px): + = dentro da zona escura, - = grama
  float sd = (m.r - 0.5) * 2.0 * ${SD_RANGE_TILES}.0 * 64.0;
  float margin = uWarp * 0.7 + 12.0;
  if (sd < -(uDarken + margin) || sd > uInvade + margin) { gl_FragColor = vec4(0.0); return; }

  // classe exata do tile (sem interpolar): água não recebe nada
  vec2 mp = mu * uMaskSize;
  vec4 cell = texture2D(iChannel0, (floor(mp) + 0.5) / uMaskSize);
  if (cell.b > 0.5) { gl_FragColor = vec4(0.0); return; }
  bool tileIsDark = cell.r > 0.5;

  vec2 pc = floor(w / uPx);
  float n1 = vnoise(w / 40.0);
  float n2 = vnoise(w / 12.0 + 7.0);
  float g = sd + (n1 - 0.5) * uWarp + (n2 - 0.5) * (uWarp * 0.3);

  // fração "escura" em pixel dither: 0 na grama, 1 dentro da zona escura
  float t = smoothstep(-uDarken, uInvade, g);
  t = pow(t, 1.15) * uStrength + (1.0 - uStrength) * (tileIsDark ? 1.0 : 0.0);
  bool wantDark = t > bayer4(pc);

  if (!tileIsDark && wantDark) {
    gl_FragColor = vec4(uDark, 1.0);
  } else if (tileIsDark && !wantDark) {
    float r = hash(pc + 5.0);
    vec3 gc = r < 0.62 ? uGrassA : (r < 0.90 ? uGrassB : uGrassC);
    gl_FragColor = vec4(gc, 1.0);
  } else {
    gl_FragColor = vec4(0.0);
  }
}
`;

function v3(a) {
  return { x: a[0], y: a[1], z: a[2] };
}

// Transição visual da borda da névoa: ver data/mistBorder.js. Um quad só do
// tamanho da vista da câmera; só aparece quando há borda perto da tela.
export default class MistBorderFx {
  static create(scene, mapManager) {
    if (!config.enabled) return null;
    if (scene.renderer.type !== Phaser.WEBGL) return null;
    try {
      const fx = new MistBorderFx(scene, mapManager);
      return fx.ok ? fx : null;
    } catch (e) {
      console.warn('[MistBorderFx] desativado:', e);
      return null;
    }
  }

  constructor(scene, mapManager) {
    this.scene = scene;
    this.ok = false;
    this.shader = null;

    const map = mapManager.map;
    const fog = map.getLayer(config.fogLayer)?.data;
    const water = map.getLayer(config.waterLayer)?.data;
    if (!fog) return;

    const cols = map.width;
    const rows = map.height;
    this.tile = map.tileWidth;
    this.cols = cols;
    this.rows = rows;
    this.rect = { x: 0, y: 0, w: cols * this.tile, h: rows * this.tile };
    if (!this._buildMask(fog, water, cols, rows)) return;

    const c = config.colors;
    const uniforms = {
      uWorldOffset: { type: '2f', value: { x: 0, y: 0 } },
      uMaskOrigin: { type: '2f', value: { x: 0, y: 0 } },
      uMaskScale: { type: '2f', value: { x: 1 / this.rect.w, y: 1 / this.rect.h } },
      uMaskSize: { type: '2f', value: { x: cols, y: rows } },
      uPx: { type: '1f', value: config.pixelSize },
      uDarken: { type: '1f', value: config.darkenPx },
      uInvade: { type: '1f', value: config.invadePx },
      uWarp: { type: '1f', value: config.warpPx },
      uStrength: { type: '1f', value: config.strength },
      uDark: { type: '3f', value: v3(c.dark) },
      uGrassA: { type: '3f', value: v3(c.grassA) },
      uGrassB: { type: '3f', value: v3(c.grassB) },
      uGrassC: { type: '3f', value: v3(c.grassC) }
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

  // R: distância assinada até a borda (em tiles, ±4; + = zona escura)
  // B: 255 se é água. Também monta os blocos que têm borda (pra ligar/desligar).
  _buildMask(fogData, waterData, cols, rows) {
    const isFog = new Uint8Array(cols * rows);
    const isWater = new Uint8Array(cols * rows);
    let fogCount = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const f = fogData[y]?.[x];
        const wv = waterData?.[y]?.[x];
        const i = y * cols + x;
        isWater[i] = wv && wv.index > 0 ? 1 : 0;
        isFog[i] = !isWater[i] && f && f.index > 0 ? 1 : 0;
        fogCount += isFog[i];
      }
    }
    if (!fogCount) return false;

    const INF = 1e3;
    const distTo = (target) => {
      const d = new Float32Array(cols * rows);
      for (let i = 0; i < d.length; i++) d[i] = target(i) ? 0 : INF;
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
    const toFog = distTo((i) => isFog[i]);
    const toOpen = distTo((i) => !isFog[i]);

    const enc = (sd) => {
      const v = Math.max(-SD_RANGE_TILES, Math.min(SD_RANGE_TILES, sd));
      return Math.round((v / SD_RANGE_TILES * 0.5 + 0.5) * 255);
    };

    const bw = Math.ceil(cols / BLOCK);
    const bh = Math.ceil(rows / BLOCK);
    this.blocks = new Uint8Array(bw * bh);
    this.bw = bw;
    this.bh = bh;
    const fringeTiles = (config.darkenPx + config.warpPx) / this.tile + 1;

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const sd = isFog[i] ? toOpen[i] - 0.5 : -(toFog[i] - 0.5);
        img.data[i * 4] = enc(sd);
        img.data[i * 4 + 1] = 0;
        img.data[i * 4 + 2] = isWater[i] ? 255 : 0;
        img.data[i * 4 + 3] = 255;
        if (!isWater[i] && Math.abs(sd) <= fringeTiles) this.blocks[((y / BLOCK) | 0) * bw + ((x / BLOCK) | 0)] = 1;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.maskCanvas = canvas;

    const textures = this.scene.textures;
    if (textures.exists(MASK_KEY)) textures.remove(MASK_KEY);
    textures.addCanvas(MASK_KEY, canvas);
    return true;
  }

  _edgeInView(view) {
    const t = this.tile;
    const bx0 = Math.max(0, Math.floor(view.x / t / BLOCK) - 1);
    const by0 = Math.max(0, Math.floor(view.y / t / BLOCK) - 1);
    const bx1 = Math.min(this.bw - 1, Math.floor(view.right / t / BLOCK) + 1);
    const by1 = Math.min(this.bh - 1, Math.floor(view.bottom / t / BLOCK) + 1);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) if (this.blocks[by * this.bw + bx]) return true;
    }
    return false;
  }

  update() {
    if (!this.shader) return;
    const view = this.scene.cameras.main.worldView;
    const r = this.rect;
    const pad = 64;
    if (!this._edgeInView(view)) {
      this.shader.setVisible(false);
      return;
    }
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

    const u = sh.uniforms;
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
