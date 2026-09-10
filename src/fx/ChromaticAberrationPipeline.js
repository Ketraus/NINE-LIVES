const fragShader = `
#define SHADER_NAME CHROMATIC_ABERRATION_FX
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTexelX; // 1px em UV, no eixo X
uniform float uTexelY; // 1px em UV, no eixo Y
uniform float uMaxShift; // deslocamento máximo, em px, nas bordas da tela

varying vec2 outTexCoord;

void main() {
  vec2 center = vec2(0.5, 0.5);
  vec2 dir = outTexCoord - center;

  // separação cresce com a distância do centro (0 no meio da tela, máxima
  // nas bordas) — é o padrão de aberração de lente/CRT, não uma cor fixa
  // espalhada por cima de tudo. dist já é 0..~0.707 (canto da tela).
  float dist = length(dir);
  vec2 dirN = dist > 0.0001 ? dir / dist : vec2(0.0);

  vec2 shift = dirN * dist * uMaxShift * vec2(uTexelX, uTexelY);

  // canal verde fica no lugar (referência), vermelho e azul deslocam pra
  // lados opostos ao longo da direção radial — só isso, sem blur extra.
  float r = texture2D(uMainSampler, outTexCoord + shift).r;
  float g = texture2D(uMainSampler, outTexCoord).g;
  float b = texture2D(uMainSampler, outTexCoord - shift).b;
  float a = texture2D(uMainSampler, outTexCoord).a;

  gl_FragColor = vec4(r, g, b, a);
}
`;

// Post FX Pipeline: aberração cromática RGB bem sutil — separa R/G/B na
// direção radial (a partir do centro da tela), crescendo perto das bordas,
// quase nula no centro. Passe único, sem buffer/RenderTarget próprio.
// uMaxShift é o deslocamento (em px) já no canto da tela — propositalmente
// baixo (1-2px) pra não deixar a imagem "colorida", só uma franja fina.
// Uso: cam.setPostPipeline('ChromaticAberration'); ajustar com
// setMaxShift (ver MainMenuScene._setupRetroFx).
export default class ChromaticAberrationPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });

    // default sutil: ~1.5px de separação máxima, só nos cantos da tela.
    this.maxShift = 1.5;
  }

  onPreRender() {
    this.set1f('uTexelX', 1 / (this.renderer.width || 1));
    this.set1f('uTexelY', 1 / (this.renderer.height || 1));
    this.set1f('uMaxShift', this.maxShift);
  }

  setMaxShift(v) {
    this.maxShift = v;
    return this;
  }
}
