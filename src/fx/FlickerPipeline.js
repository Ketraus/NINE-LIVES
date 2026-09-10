const fragShader = `
#define SHADER_NAME FLICKER_FS
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uRate;   // quantos "pontos" de ruído por segundo (irregularidade)
uniform float uAmount; // 0..1 — quanto o brilho pode cair no pico do flicker

varying vec2 outTexCoord;

// hash 1D bem barato — só precisa parecer aleatório, não ser criptográfico
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  vec4 cur = texture2D(uMainSampler, outTexCoord);

  // "value noise" 1D no tempo: interpola entre valores aleatórios em vez
  // de usar um seno — fica irregular/imprevisível em vez de uma
  // animação "respirando" de forma óbvia.
  float t = uTime * uRate;
  float i = floor(t);
  float f = fract(t);
  float a = hash11(i);
  float b = hash11(i + 1.0);
  float n = mix(a, b, smoothstep(0.0, 1.0, f));

  // eleva a uma potência: a maior parte do tempo quase não desvia,
  // e de vez em quando dá uma leve queda — perto de uma imperfeição
  // física, não de uma pulsação constante.
  float dip = pow(n, 4.0) * uAmount;
  float brightness = 1.0 - dip;

  gl_FragColor = vec4(cur.rgb * brightness, cur.a);
}
`;

// Post FX Pipeline: flicker sutil e irregular de brilho na imagem inteira,
// tipo instabilidade de CRT antigo. Passe único, sem buffer/RenderTarget
// próprio (mesmo motivo do Scanlines: menos risco de framebuffer quebrado).
// Uso: cam.setPostPipeline('Flicker'); ajustar com
// setRate/setAmount (ver MainMenuScene._setupRetroFx).
export default class FlickerPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });

    // defaults sutis: poucos "pontos" de ruído por segundo (irregular,
    // não trepidante) e queda de brilho bem pequena no pico.
    this.rate = 4;
    this.amount = 0.05;
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uRate', this.rate);
    this.set1f('uAmount', this.amount);
  }

  setRate(v) {
    this.rate = v;
    return this;
  }

  setAmount(v) {
    this.amount = v;
    return this;
  }
}
