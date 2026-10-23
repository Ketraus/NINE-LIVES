import SettingsManager from '../systems/SettingsManager.js';

// Shader de câmera da entrada do Minotauro (usado por fx/MinotaurEntranceFx.js).
// Um passe só, tudo guiado por `pipe.fx` (objeto simples que os tweens mexem):
//   zoom/pinch/blur  lente: aproxima, suga o mundo pro foco, borrão radial
//   rings[]          ondas de choque que deformam a imagem (até 4 ao mesmo tempo)
//   aberr/split      aberração cromática radial e separação RGB fixa
//   glitch/pixel     faixas deslocadas e pixelização em blocos
//   invert/flash     inversão e clarão de cor
//   grade/vignette   viragem violeta e bordas escuras
//   bars             letterbox de cinema
//   amb (pipe.amb)   filtro AMBIENTE da luta contra o boss: viragem de cor suave +
//                    vinheta colorida, independente de fx (ver startBossFightGrade)
// Com tudo em zero o shader devolve a imagem original (isIdle()).

const MAX_RINGS = 4;

const fragShader = `
#define SHADER_NAME BOSS_ENTRANCE_FX
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uAspect;
uniform float uZoom;
uniform float uPinch;
uniform float uBlur;
uniform float uAberr;
uniform float uGlitch;
uniform float uPixel;
uniform float uInvert;
uniform float uFlashA;
uniform float uGradeA;
uniform float uVignette;
uniform float uBars;
uniform float uBarSize;
uniform vec2 uFocus;
uniform vec2 uSplit;
uniform vec2 uRes;
uniform vec3 uFlashColor;
uniform vec3 uGradeColor;
uniform vec3 uEdgeColor;
uniform float uAmbA;
uniform float uAmbVig;
uniform vec3 uAmbColor;
uniform vec3 uAmbEdge;
uniform vec4 uRing0;
uniform vec4 uRing1;
uniform vec4 uRing2;
uniform vec4 uRing3;

varying vec2 outTexCoord;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// ring = (centro.x, centro.y, raio em alturas de tela, intensidade)
vec2 ringWarp(vec4 ring, vec2 uv, vec2 asp, inout float k) {
  if (ring.w <= 0.001) return uv;
  vec2 p = (uv - ring.xy) * asp;
  float d = length(p);
  float w = 0.05 + 0.05 * ring.z;
  float x = (d - ring.z) / w;
  float band = exp(-x * x) * ring.w;
  k += band;
  vec2 dir = p / max(d, 0.0001);
  // empurra a imagem pra fora na frente da onda e puxa atrás dela
  return uv - (dir / asp) * band * 0.05 * (0.6 + x * 0.4);
}

void main() {
  vec2 uv = outTexCoord;
  vec2 asp = vec2(uAspect, 1.0);

  // lente: zoom e "sucção" em volta do foco
  vec2 d = uv - uFocus;
  float r = length(d * asp);
  d /= uZoom;
  d *= 1.0 - uPinch * (0.25 + r * 1.2);
  uv = uFocus + d;

  // ondas de choque
  float rk = 0.0;
  uv = ringWarp(uRing0, uv, asp, rk);
  uv = ringWarp(uRing1, uv, asp, rk);
  uv = ringWarp(uRing2, uv, asp, rk);
  uv = ringWarp(uRing3, uv, asp, rk);

  // pixelização em blocos
  if (uPixel > 0.001) {
    vec2 g = uRes / mix(1.0, 56.0, uPixel);
    uv = (floor(uv * g) + 0.5) / g;
  }

  // glitch: faixas horizontais deslocadas, trocando ~24x por segundo
  float gl = 0.0;
  if (uGlitch > 0.001) {
    float t = floor(uTime * 24.0);
    float rows = mix(14.0, 64.0, hash21(vec2(t, 1.0)));
    float row = floor(uv.y * rows);
    float on = step(1.0 - uGlitch * 0.5, hash21(vec2(row, t)));
    float shift = (hash21(vec2(row, t + 7.0)) - 0.5) * 0.4 * uGlitch;
    uv.x += on * shift;
    gl = on;
  }

  uv = clamp(uv, 0.0008, 0.9992);

  // aberração radial (cresce com a distância ao foco e dentro das ondas)
  vec2 toFocus = uFocus - uv;
  vec2 cdir = normalize(uv - uFocus + vec2(0.00001));
  float ab = uAberr * 0.012 * (0.35 + length((uv - uFocus) * asp)) + rk * 0.02 + gl * 0.01 * uGlitch;
  vec2 off = cdir * ab / asp + uSplit;

  vec3 col;
  if (uBlur > 0.001) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float f = float(i) / 5.0;
      vec2 p = uv + toFocus * uBlur * 0.12 * f;
      acc.r += texture2D(uMainSampler, clamp(p + off, 0.0008, 0.9992)).r;
      acc.g += texture2D(uMainSampler, p).g;
      acc.b += texture2D(uMainSampler, clamp(p - off, 0.0008, 0.9992)).b;
    }
    col = acc / 6.0;
  } else {
    col.r = texture2D(uMainSampler, clamp(uv + off, 0.0008, 0.9992)).r;
    col.g = texture2D(uMainSampler, uv).g;
    col.b = texture2D(uMainSampler, clamp(uv - off, 0.0008, 0.9992)).b;
  }

  // viragem violeta: mapeia a luminância pra cor da grade
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 graded = uGradeColor * (0.28 + lum * 1.15) + col * 0.18;
  col = mix(col, graded, uGradeA);

  col = mix(col, 1.0 - col, uInvert);

  // vinheta com borda colorida
  float vr = length((outTexCoord - 0.5) * asp);
  float vig = smoothstep(0.22, 0.95, vr) * uVignette;
  col = mix(col, col * 0.18 + uEdgeColor * 0.10 * vig, vig);

  // filtro ambiente da luta: viragem suave + vinheta colorida
  float ambLum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 ambGraded = uAmbColor * (0.28 + ambLum * 1.15) + col * 0.18;
  col = mix(col, ambGraded, uAmbA);
  float ambV = smoothstep(0.25, 1.0, vr) * uAmbVig;
  col = mix(col, col * 0.4 + uAmbEdge * 0.16 * ambV, ambV);

  // brilho na crista das ondas e clarão
  col += uFlashColor * rk * 0.34;
  col = mix(col, uFlashColor, uFlashA);

  // letterbox
  float bar = uBars * uBarSize;
  float edge = min(outTexCoord.y, 1.0 - outTexCoord.y);
  float barMask = bar > 0.0001 ? smoothstep(bar - 0.002, bar + 0.002, edge) : 1.0;
  col *= barMask;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const defaultFx = () => ({
  zoom: 1,
  focusX: 0,
  focusY: 0,
  blur: 0,
  pinch: 0,
  aberr: 0,
  splitX: 0,
  splitY: 0,
  glitch: 0,
  pixel: 0,
  invert: 0,
  flashA: 0,
  flashColor: [0.82, 0.45, 1],
  gradeA: 0,
  gradeColor: [0.62, 0.36, 1],
  edgeColor: [0.9, 0.7, 1],
  vignette: 0,
  bars: 0,
  barSize: 0.06,
  rings: []
});

const EPS = 0.001;

export default class BossEntrancePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });
    this.fx = defaultFx();
    // filtro ambiente da luta contra o boss (não é zerado pelo hardReset do fx)
    this.amb = { a: 0, vig: 0, color: [0.62, 0.36, 1], edge: [0.9, 0.7, 1] };
    // quantas cinemáticas estão usando este pipeline agora (ver acquirePipe)
    this.pins = 0;
    this.impactActive = false;
  }

  // true quando o shader não muda nada na imagem (aí o pipeline pode ser removido)
  isIdle() {
    const f = this.fx;
    if (this.amb.a > EPS || this.amb.vig > EPS) return false;
    if (Math.abs(f.zoom - 1) > EPS) return false;
    if (Math.abs(f.pinch) > EPS || f.blur > EPS || Math.abs(f.aberr) > EPS) return false;
    if (Math.abs(f.splitX) > EPS || Math.abs(f.splitY) > EPS) return false;
    if (f.glitch > EPS || f.pixel > EPS || f.invert > EPS || f.flashA > EPS) return false;
    if (f.gradeA > EPS || f.vignette > EPS || f.bars > EPS) return false;
    return !f.rings.some((ring) => ring.a > EPS);
  }

  // mundo -> UV da tela (y do shader cresce pra cima)
  _focusUv(cam) {
    if (!cam) return [0.5, 0.5];
    const view = cam.worldView;
    const z = cam.zoom || 1;
    const sx = ((this.fx.focusX - view.x) * z) / cam.width;
    const sy = ((this.fx.focusY - view.y) * z) / cam.height;
    return [sx, 1 - sy];
  }

  onPreRender() {
    const f = this.fx;
    const cam = this.gameObject;
    const reducedMotion = SettingsManager.getReducedMotion();
    const reducedFlashes = SettingsManager.getReducedFlashes();
    const motion = reducedMotion ? 0.3 : 1;

    const [fu, fv] = this._focusUv(cam);
    const aspect = cam ? cam.width / cam.height : this.renderer.width / this.renderer.height;

    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uAspect', aspect);
    this.set1f('uZoom', 1 + (f.zoom - 1) * motion);
    this.set1f('uPinch', f.pinch * motion);
    this.set1f('uBlur', f.blur * motion);
    this.set1f('uAberr', f.aberr * (reducedMotion ? 0.5 : 1));
    this.set1f('uGlitch', f.glitch * (reducedMotion ? 0.35 : 1) * (reducedFlashes ? 0.5 : 1));
    this.set1f('uPixel', reducedFlashes ? 0 : f.pixel);
    this.set1f('uInvert', reducedFlashes ? 0 : f.invert);
    this.set1f('uFlashA', reducedFlashes ? Math.min(f.flashA, 0.15) : f.flashA);
    this.set1f('uGradeA', f.gradeA);
    this.set1f('uVignette', f.vignette);
    this.set1f('uBars', f.bars);
    this.set1f('uBarSize', f.barSize);
    this.set2f('uFocus', fu, fv);
    this.set2f('uSplit', f.splitX * motion, f.splitY * motion);
    this.set2f('uRes', this.renderer.width || 1024, this.renderer.height || 576);
    this.set3f('uFlashColor', f.flashColor[0], f.flashColor[1], f.flashColor[2]);
    this.set3f('uGradeColor', f.gradeColor[0], f.gradeColor[1], f.gradeColor[2]);
    this.set3f('uEdgeColor', f.edgeColor[0], f.edgeColor[1], f.edgeColor[2]);
    const amb = this.amb;
    this.set1f('uAmbA', amb.a);
    this.set1f('uAmbVig', amb.vig);
    this.set3f('uAmbColor', amb.color[0], amb.color[1], amb.color[2]);
    this.set3f('uAmbEdge', amb.edge[0], amb.edge[1], amb.edge[2]);

    // as 4 ondas mais novas; centro de cada uma convertido pra UV da tela
    const rings = f.rings.slice(-MAX_RINGS);
    for (let i = 0; i < MAX_RINGS; i += 1) {
      const ring = rings[i];
      let x = 0;
      let y = 0;
      let rad = 0;
      let a = 0;
      if (ring && cam) {
        const view = cam.worldView;
        const z = cam.zoom || 1;
        x = ((ring.wx - view.x) * z) / cam.width;
        y = 1 - ((ring.wy - view.y) * z) / cam.height;
        rad = ring.r;
        a = ring.a * (reducedMotion ? 0.5 : 1);
      }
      this.set4f(`uRing${i}`, x, y, rad, a);
    }
  }
}
