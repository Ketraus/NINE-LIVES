import config from '../../data/seaFx.js';
import SettingsManager from '../systems/SettingsManager.js';

const MASK_KEY = 'sea_mask';
const SHADER_KEY = 'sea_water_shader';
const NOISE_PERIOD = 688128; // MMC das escalas de ruído (512*64, 192*64, 56*64...); 16384 quebrava a água/costa após x=16384
const SHORE_CAP_TILES = 8;

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
uniform float uSeaHeight;
uniform float uQuality;
uniform float uPx;
uniform float uFoamAmount;
uniform float uSparkleAmount;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uShallow;
uniform vec3 uFoam;
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

void main () {
  vec2 q = (floor(vLocal / uPx) + 0.5) * uPx;
  vec2 w = uWorldOffset + q;
  vec4 m = texture2D(iChannel0, uMaskOrigin + q * uMaskScale);

  float t = uTime;
  float dpx = max(0.0, (m.g * ${SHORE_CAP_TILES}.0 - 0.5) * 64.0);
  // distância EXATA até as células de terra vizinhas (3x3). A máscara bilinear
  // formava diagonais nos cantos e a espuma virava triângulos claros.
  vec2 mp = (uMaskOrigin + q * uMaskScale) * uMaskSize;
  vec2 cellI = floor(mp);
  vec2 fpT = mp - cellI;
  float dref = 1.0e4;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) continue;
      vec2 nc = vec2(float(i), float(j));
      float nr = texture2D(iChannel0, (cellI + nc + 0.5) / uMaskSize).r;
      if (nr < 0.5) {
        vec2 dv = max(vec2(0.0), max(nc - fpT, fpT - (nc + 1.0)));
        dref = min(dref, length(dv) * 64.0);
      }
    }
  }
  dpx = min(dref, max(dpx, 64.0));
  float yN = clamp(w.y / uSeaHeight, 0.0, 1.0);

  // ondulação larga (bandas de cor, estilo pixel art)
  float sw = vnoise(vec2(w.x / 256.0 + t * 0.020, w.y / 128.0 - t * 0.012));
  float sw2 = vnoise(vec2(w.x / 128.0 - t * 0.035, w.y / 64.0 + t * 0.020) + 17.3);
  float h = sw * 0.6 + sw2 * 0.4;
  float band = floor(h * 4.0) / 3.0;
  vec3 col = mix(uDeep, uMid, clamp(band * 0.55 + 0.45, 0.0, 1.0));
  col = mix(col, uLight, step(0.99, band) * 0.22);

  // cristas finas que correm pela superfície
  vec2 cp = vec2(w.x / 192.0 - t * 0.07 + sin(w.y / 64.0 + t * 0.5) * 0.12, w.y / 12.0 + sw * 0.9);
  float cn = vnoise(cp);
  float crest = (step(0.60, cn) - step(0.66, cn)) * step(0.40, sw2);
  if (uQuality > 0.5) {
    vec2 cp2 = vec2(w.x / 128.0 + t * 0.05, w.y / 10.0 - sw2 * 0.8) + 31.7;
    float cn2 = vnoise(cp2);
    crest += (step(0.64, cn2) - step(0.69, cn2)) * step(0.50, sw) * 0.7;
  }
  col = mix(col, uLight * 1.3, clamp(crest, 0.0, 1.0) * 0.55);

  // águas rasas perto da costa: tom turquesa + rede de luz (caustics)
  float sh = 1.0 - smoothstep(0.0, 300.0, dpx);
  col = mix(col, uShallow, sh * 0.6);
  if (uQuality > 0.5) {
    vec2 cq = w / 32.0;
    float c1 = abs(sin(cq.x * 1.7 + t * 0.9 + sin(cq.y * 1.3 - t * 0.7) * 1.6));
    float c2 = abs(sin(cq.y * 1.9 - t * 0.8 + sin(cq.x * 1.1 + t * 0.6) * 1.6));
    float caus = pow(1.0 - c1, 6.0) + pow(1.0 - c2, 6.0);
    col += uFoam * 0.11 * step(0.85, caus) * sh;
  }

  // mais fundo = mais escuro; sombras de nuvem passando devagar
  col *= mix(0.88, 1.0, smoothstep(0.0, 1.0, yN));
  col *= 1.0 - 0.14 * smoothstep(150.0, 512.0, dpx);
  float cs = vnoise(vec2(w.x / 256.0 - t * 0.012, w.y / 256.0 + t * 0.008) + 41.0);
  col *= 0.88 + 0.14 * smoothstep(0.35, 0.65, cs);

  // espuma: ondas que chegam na costa e espuma colada na borda
  float nz = vnoise(w / 64.0 + vec2(t * 0.05, 0.0));
  float foam = 0.0;
  float segPh = vnoise(vec2(w.x / 512.0, 3.0)) * 0.35;
  for (int k = 0; k < 2; k++) {
    float ph = fract(t * 0.14 + float(k) * 0.5 + segPh);
    float pos = (1.0 - ph) * 140.0;
    float d = abs(dpx + (nz - 0.5) * 22.0 - pos);
    float brk = step(0.30, vnoise(vec2(w.x / 56.0 - t * 0.12, w.y / 56.0) + float(k) * 9.0));
    float ln = step(d, 2.0 + 3.0 * (1.0 - ph)) * brk;
    foam += ln * sin(ph * 3.14159);
  }
  float eb = vnoise(w / 16.0 + vec2(t * 0.2, 0.0));
  float edge = (1.0 - step(12.0 + eb * 12.0, dpx + (nz - 0.5) * 12.0)) * step(0.32, eb);
  foam = clamp(foam + edge * 0.9, 0.0, 1.0) * uFoamAmount;
  col = mix(col, uFoam, foam * 0.75);

  // brilhos pontuais
  vec2 cell = floor(w / 32.0);
  float r = hash(cell);
  float ph2 = fract(t * (0.25 + r * 0.3) + r * 13.0);
  vec2 pp = floor(vec2(hash(cell + 3.3), hash(cell + 9.1)) * 7.0) * uPx + uPx * 0.5;
  vec2 dd = abs(mod(w, 32.0) - pp);
  float on = step(0.93, r) * step(ph2, 0.12);
  float core = step(max(dd.x, dd.y), uPx * 0.55);
  float arms = (step(dd.x, uPx * 0.55) * step(dd.y, uPx * 1.6) + step(dd.y, uPx * 0.55) * step(dd.x, uPx * 1.6)) * step(ph2, 0.06);
  col += vec3(0.72, 0.92, 1.0) * on * clamp(core + arms, 0.0, 1.0) * 0.9 * uSparkleAmount;

  // célula de água inteira (sem interpolar): a máscara bilinear cortava os cantos
  // diagonais e deixava o tile azul cru da layer Mar aparecendo (triângulos)
  float wcell = texture2D(iChannel0, (floor(mp) + 0.5) / uMaskSize).r;
  float a = step(0.5, wcell);
  gl_FragColor = vec4(col * a, a);
}
`;

function vec3(v) {
  return { x: v[0], y: v[1], z: v[2] };
}

// Mar animado por shader. Um único quad do tamanho do que a câmera vê da
// faixa de mar (nada é desenhado fora dela), ancorado no mundo, com a
// forma da costa vinda da layer do Tiled via uma textura-máscara de 1px por
// tile. Fora da tela ele some (setVisible(false)): custo zero longe do mar.
export default class SeaFx {
  static create(scene, mapManager) {
    if (!config.enabled) return null;
    if (scene.renderer.type !== Phaser.WEBGL) return null;
    try {
      const fx = new SeaFx(scene, mapManager);
      return fx.ok ? fx : null;
    } catch (e) {
      console.warn('[SeaFx] desativado:', e);
      return null;
    }
  }

  constructor(scene, mapManager) {
    this.scene = scene;
    this.ok = false;
    this.shader = null;

    const map = mapManager.map;
    const layerData = map.getLayer(config.waterLayer)?.data;
    if (!layerData) return;

    const tw = map.tileWidth;
    const th = map.tileHeight;
    const cols = map.width;

    // quais linhas têm água
    let lastRow = -1;
    for (let y = 0; y < map.height; y++) {
      if (layerData[y].some((tile) => tile && tile.index > 0)) lastRow = y;
    }
    if (lastRow < 0) return;
    const rows = Math.min(map.height, lastRow + 2);

    this.rect = { x: 0, y: 0, w: cols * tw, h: rows * th };
    this._buildMask(layerData, cols, rows);

    const quality = scene.sys.game.device.input.touch ? config.quality.touch : config.quality.desktop;
    const c = config.colors;
    const uniforms = {
      uTime: { type: '1f', value: 0 },
      uWorldOffset: { type: '2f', value: { x: 0, y: 0 } },
      uMaskOrigin: { type: '2f', value: { x: 0, y: 0 } },
      uMaskScale: { type: '2f', value: { x: 1 / this.rect.w, y: 1 / this.rect.h } },
      uMaskSize: { type: '2f', value: { x: cols, y: rows } },
      uSeaHeight: { type: '1f', value: this.rect.h - th },
      uQuality: { type: '1f', value: quality },
      uPx: { type: '1f', value: config.pixelSize },
      uFoamAmount: { type: '1f', value: config.foamAmount },
      uSparkleAmount: { type: '1f', value: config.sparkleAmount },
      uDeep: { type: '3f', value: vec3(c.deep) },
      uMid: { type: '3f', value: vec3(c.mid) },
      uLight: { type: '3f', value: vec3(c.light) },
      uShallow: { type: '3f', value: vec3(c.shallow) },
      uFoam: { type: '3f', value: vec3(c.foam) }
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

  // R = é água (0/255), G = distância até a costa em tiles (cap 8)
  _buildMask(layerData, cols, rows) {
    const water = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = layerData[y]?.[x];
        water[y * cols + x] = tile && tile.index > 0 ? 1 : 0;
      }
    }

    // distância chamfer até a célula não-água mais próxima (fora do mapa = água)
    const INF = 1e3;
    const dist = new Float32Array(cols * rows);
    for (let i = 0; i < dist.length; i++) dist[i] = water[i] ? INF : 0;
    const get = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? INF : dist[y * cols + x]);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!water[i]) continue;
        dist[i] = Math.min(dist[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + 1.414, get(x + 1, y - 1) + 1.414);
      }
    }
    for (let y = rows - 1; y >= 0; y--) {
      for (let x = cols - 1; x >= 0; x--) {
        const i = y * cols + x;
        if (!water[i]) continue;
        dist[i] = Math.min(dist[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + 1.414, get(x - 1, y + 1) + 1.414);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) {
      img.data[i * 4] = water[i] ? 255 : 0;
      img.data[i * 4 + 1] = Math.round((Math.min(dist[i], SHORE_CAP_TILES) / SHORE_CAP_TILES) * 255);
      img.data[i * 4 + 2] = 0;
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
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const r = this.rect;
    const pad = 64;

    // interseção da vista da câmera (+margem, alinhada em 64px) com a faixa de mar
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
    const speed = config.motion * (reduced ? config.reducedMotionFactor : 1);
    // relógio real: o mar continua vivo mesmo com o jogo pausado
    this._clock = (this._clock || 0) + (this.scene.game.loop.delta / 1000) * speed;

    const u = sh.uniforms;
    u.uTime.value = this._clock;
    u.uWorldOffset.value.x = x0 % NOISE_PERIOD;
    u.uWorldOffset.value.y = y0;
    u.uMaskOrigin.value.x = (x0 - r.x) / r.w;
    u.uMaskOrigin.value.y = (y0 - r.y) / r.h;
    u.uSparkleAmount.value = reduced ? 0 : config.sparkleAmount;
  }

  destroy() {
    this.shader?.destroy();
    this.shader = null;
    if (this.scene.textures?.exists(MASK_KEY)) this.scene.textures.remove(MASK_KEY);
  }
}
