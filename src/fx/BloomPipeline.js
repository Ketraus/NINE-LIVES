const fragShader = `
#define SHADER_NAME BLOOM_FX
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTexelX; // 1px em UV, no eixo X (resolução real do canvas)
uniform float uTexelY; // 1px em UV, no eixo Y
uniform float uThreshold; // luminância mínima pra "vazar" luz
uniform float uRadius;    // raio da amostragem, em px
uniform float uIntensity; // 0..1 — força do brilho somado

varying vec2 outTexCoord;

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 cur = texture2D(uMainSampler, outTexCoord);

  // anel de 8 amostras ao redor do pixel atual (barato, sem 2º passe/
  // buffer próprio) — só a parte de cada amostra acima do threshold
  // "vaza" como luz, então áreas escuras do menu não recebem nada.
  vec2 texel = vec2(uTexelX, uTexelY) * uRadius;
  vec3 bleed = vec3(0.0);

  vec2 offsets[8];
  offsets[0] = vec2(1.0, 0.0);
  offsets[1] = vec2(-1.0, 0.0);
  offsets[2] = vec2(0.0, 1.0);
  offsets[3] = vec2(0.0, -1.0);
  offsets[4] = vec2(0.707, 0.707);
  offsets[5] = vec2(-0.707, 0.707);
  offsets[6] = vec2(0.707, -0.707);
  offsets[7] = vec2(-0.707, -0.707);

  for (int i = 0; i < 8; i++) {
    vec3 s = texture2D(uMainSampler, outTexCoord + offsets[i] * texel).rgb;
    float excess = max(luminance(s) - uThreshold, 0.0);
    bleed += s * excess;
  }
  bleed /= 8.0;

  vec3 outColor = cur.rgb + bleed * uIntensity;
  gl_FragColor = vec4(outColor, cur.a);
}
`;

// Post FX Pipeline: bloom/bleeding bem sutil — só as áreas claras (texto,
// bordas do terminal, título) espalham um pouco de luz nos pixels vizinhos.
// Passe único (anel de 8 amostras), sem buffer/RenderTarget próprio, no
// mesmo espírito do Scanlines/Flicker: menos risco de framebuffer quebrado.
// Propositalmente discreto — intensidade baixa e threshold alto, pra dar
// só uma sensação de "vidro"/fósforo, sem virar glow neon nem borrar a
// imagem inteira.
// Uso: cam.setPostPipeline('Bloom'); ajustar com
// setThreshold/setRadius/setIntensity (ver MainMenuScene._setupRetroFx).
export default class BloomPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });

    // defaults sutis: só o que já é bem claro (texto/borda com hover,
    // título) passa do threshold, e a força somada é baixa.
    this.threshold = 0.72;
    this.radius = 1.6;
    this.intensity = 0.18;
  }

  onPreRender() {
    this.set1f('uTexelX', 1 / (this.renderer.width || 1));
    this.set1f('uTexelY', 1 / (this.renderer.height || 1));
    this.set1f('uThreshold', this.threshold);
    this.set1f('uRadius', this.radius);
    this.set1f('uIntensity', this.intensity);
  }

  setThreshold(v) {
    this.threshold = v;
    return this;
  }

  setRadius(v) {
    this.radius = v;
    return this;
  }

  setIntensity(v) {
    this.intensity = v;
    return this;
  }
}
