const fragShader = `
#define SHADER_NAME GHOST_TRAIL_FS
precision mediump float;

uniform sampler2D uMainSampler;   // frame atual
uniform sampler2D uTrailSampler;  // rastro acumulado do(s) frame(s) anterior(es)
uniform float uDecay;             // 0..1 — quanto do rastro anterior sobra por frame
uniform float uThreshold;         // luminância mínima pra "carregar" rastro

varying vec2 outTexCoord;

void main() {
  vec4 cur = texture2D(uMainSampler, outTexCoord);
  vec3 prevTrail = texture2D(uTrailSampler, outTexCoord).rgb;

  // só pixels claros (texto, bordas, ícones) alimentam o rastro — áreas
  // escuras do menu não acumulam nada, então não vira uma imagem borrada
  float lum = dot(cur.rgb, vec3(0.299, 0.587, 0.114));
  float spark = smoothstep(uThreshold, 1.0, lum);

  vec3 trail = max(cur.rgb * spark, prevTrail * uDecay);

  // o frame atual continua nítido; o rastro só aparece por cima onde o
  // "fantasma" decaído ainda é mais claro que o pixel atual naquele ponto
  vec3 outColor = max(cur.rgb, trail);

  gl_FragColor = vec4(outColor, cur.a);
}
`;

// Post FX Pipeline: ghosting/persistência sutil tipo fósforo de CRT — só
// nas áreas claras do menu.
//
// Usa fullFrame1/fullFrame2 (buffers da Utility Pipeline, já geridos pelo
// próprio Phaser — resize automático, sempre válidos) em vez de criar um
// RenderTarget manual: a 1ª tentativa criava/destruía um buffer próprio
// numa hora ruim do ciclo de boot e quebrava o framebuffer. Só funciona
// bem porque nenhum outro efeito nesta cena usa esses dois buffers.
//
// Uso: cam.setPostPipeline('GhostTrail'); depois ajustar com
// setDecay/setThreshold (ver MainMenuScene._setupRetroFx).
export default class GhostTrailPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, renderTarget: true, fragShader });

    // defaults sutis: decay alto = rastro some rápido; threshold alto =
    // só acende em áreas bem claras.
    this.decay = 0.55;
    this.threshold = 0.6;
  }

  onPreRender() {
    this.set1f('uDecay', this.decay);
    this.set1f('uThreshold', this.threshold);
  }

  onDraw(renderTarget) {
    const trail = this.fullFrame2;   // guarda o rastro entre frames
    const scratch = this.fullFrame1; // resultado combinado deste frame

    this.bindTexture(trail.texture, 1);
    this.set1i('uTrailSampler', 1);

    // combina frame atual + rastro decaído no scratch
    this.bindAndDraw(renderTarget, scratch);

    // guarda o resultado como rastro pro próximo frame
    this.copyFrame(scratch, trail);

    // entrega o resultado final pra tela/próximo pipeline da fila
    this.bindAndDraw(scratch);
  }

  setDecay(v) {
    this.decay = v;
    return this;
  }

  setThreshold(v) {
    this.threshold = v;
    return this;
  }
}
