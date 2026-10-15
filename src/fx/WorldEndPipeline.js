const fragShader = `
#define SHADER_NAME WORLD_END_FX
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uIntensity;
uniform float uPulse;
uniform float uMotion;

varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec2 c = uv - 0.5;
  float r = length(c);
  float k = uIntensity;
  float edge = smoothstep(0.08, 0.75, r);

  // a tela "respira": puxa as bordas pra dentro num ritmo lento e dá um
  // tranco extra a cada batida
  float breathe = sin(uTime * 0.9) * 0.5 + 0.5;
  float pinch = ((0.010 + 0.020 * breathe) * k + 0.035 * uPulse * k) * uMotion;
  uv = 0.5 + c * (1.0 - pinch * (0.35 + r * 1.8));

  // ondulação de calor/miragem, mais forte nas bordas
  float w1 = sin(uv.y * 17.0 + uTime * 1.7) * 0.0034 * k * (0.35 + edge);
  float w2 = sin(uv.x * 12.0 - uTime * 1.2 + uv.y * 6.0) * 0.0026 * k * (0.35 + edge);
  uv += vec2(w1, w2) * uMotion;

  // aberração cromática radial
  vec2 dir = normalize(c + vec2(0.00001));
  float ca = ((0.0014 + 0.0075 * edge) * k + 0.0045 * uPulse * k) * uMotion;
  float rr = texture2D(uMainSampler, uv + dir * ca).r;
  vec4 mid = texture2D(uMainSampler, uv);
  float bb = texture2D(uMainSampler, uv - dir * ca).b;
  gl_FragColor = vec4(rr, mid.g, bb, mid.a);
}
`;

// Post FX: oscilação + aberração do fim do mundo. Tudo escala com
// uIntensity (0..1); com 0 o pipeline é desligado (active=false).
export default class WorldEndPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });
    this.time = 0;
    this.intensity = 0;
    this.pulse = 0;
    this.motion = 1; // 0..1, reduzido pela opção de acessibilidade "movimento reduzido"
  }

  onPreRender() {
    this.set1f('uTime', this.time);
    this.set1f('uIntensity', this.intensity);
    this.set1f('uPulse', this.pulse);
    this.set1f('uMotion', this.motion);
  }
}
