
const fragShader = `
#define SHADER_NAME STATIC_NOISE_FX
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uIntensity; // 0..1 — força geral do chiado (0 = desligado)

varying vec2 outTexCoord;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = outTexCoord;

  // "tracking" instável: poucas faixas horizontais que escorregam um
  // pouquinho pro lado, trocando de banda a cada instante — sinal de TV
  // perdendo o sincronismo, não um glitch constante.
  float band = floor(uv.y * 30.0);
  float bandSeed = floor(uTime * 8.0);
  float bandNoise = hash12(vec2(band, bandSeed));
  float glitchLine = step(0.93, bandNoise) * uIntensity;
  uv.x += (hash12(vec2(band, bandSeed + 7.0)) - 0.5) * glitchLine * 0.05;

  vec4 cur = texture2D(uMainSampler, uv);

  // grão fino tipo chiado de sinal fraco, trocando a cada frame
  float grain = hash12(uv * vec2(900.0, 700.0) + fract(uTime) * 120.0);
  vec3 noiseColor = vec3(grain);

  // só mistura ruído proporcional à intensidade — em 0 fica bit-a-bit
  // igual à imagem original (sem custo visual quando "desligado")
  vec3 outColor = mix(cur.rgb, noiseColor, uIntensity * 0.45 * grain);
  // sinal fraco também perde um pouco de brilho geral
  outColor *= (1.0 - uIntensity * 0.1);

  gl_FragColor = vec4(outColor, cur.a);
}
`;

// Post FX Pipeline: "chiado" de sinal fraco/morrendo — grão fino + faixas
// de tracking instáveis, tipo TV/monitor CRT perdendo o sinal. Passe único,
// sem buffer/RenderTarget próprio (mesmo espírito do Flicker/Scanlines).
// uIntensity começa em 0 (imperceptível) e é o único uniform pilotado de
// fora — ver HUD._applyCriticalFx (vida crítica) e HUD player-died (morte).
// Uso: cam.setPostPipeline('StaticNoise'); ajustar com setIntensity.
export default class StaticNoisePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });

    this.intensity = 0; // desligado por padrão — só liga em vida crítica/morte
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uIntensity', this.intensity);
  }

  setIntensity(v) {
    this.intensity = v;
    return this;
  }
}
