const fragShader = `
#define SHADER_NAME SCANLINES_FS
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uResolutionY; // altura do canvas em pixels
uniform float uLineHeight;  // espessura de cada linha, em pixels
uniform float uDarkAmount;  // 0..1 — quanto a linha escura escurece

varying vec2 outTexCoord;

void main() {
  vec4 cur = texture2D(uMainSampler, outTexCoord);

  float y = outTexCoord.y * uResolutionY;
  float lineIndex = floor(y / uLineHeight);
  float isDarkLine = mod(lineIndex, 2.0); // alterna 0/1 a cada linha

  float darken = 1.0 - (isDarkLine * uDarkAmount);
  gl_FragColor = vec4(cur.rgb * darken, cur.a);
}
`;

// Post FX Pipeline: scanlines horizontais finíssimas (linhas escuras
// alternando com linhas normais), tipo textura de tela CRT. Passe único,
// sem buffer/RenderTarget próprio — só lê o pixel atual e escurece por
// linha, então não tem risco de framebuffer quebrado como o GhostTrail.
// Uso: cam.setPostPipeline('Scanlines'); ajustar com
// setLineHeight/setDarkAmount (ver MainMenuScene._setupRetroFx).
export default class ScanlinesPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });

    // defaults sutis: linha de 2px, escurecendo bem pouco — textura, não
    // "tela quebrada".
    this.lineHeight = 2;
    this.darkAmount = 0.12;
  }

  onPreRender() {
    this.set1f('uResolutionY', this.renderer.height || 1);
    this.set1f('uLineHeight', this.lineHeight);
    this.set1f('uDarkAmount', this.darkAmount);
  }

  setLineHeight(v) {
    this.lineHeight = v;
    return this;
  }

  setDarkAmount(v) {
    this.darkAmount = v;
    return this;
  }
}
