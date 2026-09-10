const fragShader = `
#define SHADER_NAME CRT_WAVE_FX
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;

varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  // desloca cada "linha" horizontalmente, seguindo um seno — só isso,
  // nenhum ruído/cor. É o "sinal CRT instável" pedido, bem sutil.
  float wave = sin(uv.y * uFrequency + uTime * uSpeed) * uAmplitude;
  uv.x += wave;
  gl_FragColor = texture2D(uMainSampler, uv);
}
`;

// Post FX Pipeline: ondulação horizontal sutil tipo sinal de CRT instável.
// Uso: cam.setPostPipeline('CrtWave'); depois ajustar com
// setAmplitude/setFrequency/setSpeed (ver MainMenuScene._setupCrtWave).
export default class CrtWavePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, fragShader });

    // defaults sutis — ajustar aqui (ou via setters) até ficar bonito,
    // não "defeituoso". amplitude em UV (0..1), frequency = nº de ondas
    // na altura da tela, speed = velocidade da ondulação.
    // (reduzido — "intenso demais" no primeiro teste)
    this.amplitude = 0.0012;
    this.frequency = 9;
    this.speed = 0.9;
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uAmplitude', this.amplitude);
    this.set1f('uFrequency', this.frequency);
    this.set1f('uSpeed', this.speed);
  }

  setAmplitude(v) {
    this.amplitude = v;
    return this;
  }

  setFrequency(v) {
    this.frequency = v;
    return this;
  }

  setSpeed(v) {
    this.speed = v;
    return this;
  }
}
