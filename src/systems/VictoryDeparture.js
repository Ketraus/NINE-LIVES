import VictoryAudio from './VictoryAudio.js';

// CENA 04 do roteiro — "O MUNDO DEIXA O PROTAGONISTA PARA TRÁS" (~10:17) e A
// TRAVESSIA. VictorySecondThump agenda start() ~7 s depois da segunda pancada.
//
//   0 s      A câmera se abre: zoom-out discreto, ainda seguindo o gato. Ele
//            fica menor, cercado por criaturas imóveis (partículas, pulsos de
//            corrupção e tremores continuam).
//   ~4 s     TERCEIRA pancada (BOOOOOOM): tranco, luz oscila, corpos estremecem.
//   ~5,3 s   A câmera deixa o gato: VictoryFinale.start() pára o follow e desliza
//            até o mar em TRAVEL_MS fixos (a velocidade se adapta à distância).
//   travessia (progress 0..1, ver onPanProgress) tudo se intensifica:
//            partículas mais numerosas, algumas com rastro, sombras mais fundas,
//            falhas/pulsos da corrupção mais fortes, ruído subterrâneo crescendo;
//            em ~45% vem a QUARTA pancada (VRRRRRRMMMM), que rola e muda a
//            natureza do som (camada de textura permanente).
//
// A chegada ao mar (Cena 05) ainda cai no fluxo provisório do VictoryFinale.

const ZOOM_OUT_FACTOR = 0.82; // "afasta-se discretamente"
const ZOOM_OUT_MS = 3500;
const THUMP3_AT_MS = ZOOM_OUT_MS + 500; // respiro depois do enquadramento abrir
const THUMP3 = { peak: 0.042, tau: 600, kick: 1 };
const LEAVE_AFTER_THUMP_MS = 1300; // a câmera começa a abandonar o gato

// travessia
const THUMP4_AT_PROGRESS = 0.45;
const THUMP4 = { peak: 0.03, tau: 1500, kick: 0.8 }; // pancada que ROLA: decai devagar
const PARTICLE_DENSITY_START = 2; // multiplicador deixado pelo surge da Cena 03
const PARTICLE_DENSITY_END = 3.4;
const PARTICLE_SPEED_END = 1.6;
const PARTICLE_TRAIL_END = 0.35;
const COLD_MAX_END = 0.92; // sombras se aprofundando
const TEXTURE_FADE_IN_MS = 3000;

export default class VictoryDeparture {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    this.traveling = false;
    this._thump4Played = false;
    this._lastZoom = null;
  }

  start() {
    const scene = this.scene;
    if (this.started || scene.isGameOver) return;
    this.started = true;
    const cam = scene.cameras.main;
    this._lastZoom = cam.zoom;

    // o enquadramento se abre
    cam.zoomTo(cam.zoom * ZOOM_OUT_FACTOR, ZOOM_OUT_MS, 'Sine.easeInOut', true);

    scene.time.delayedCall(THUMP3_AT_MS, () => this._thump3());
    scene.time.delayedCall(THUMP3_AT_MS + LEAVE_AFTER_THUMP_MS, () => this._leave());
  }

  // chamado todo frame pela GameScene: com o zoom mudando, os overlays de
  // tela cheia (HUD) precisam ser reancorados, senão encolhem e deixam bordas
  update() {
    if (!this.started) return;
    const scene = this.scene;
    const zoom = scene.cameras.main.zoom;
    if (zoom === this._lastZoom) return;
    this._lastZoom = zoom;
    scene.hud?.refreshZoomCompensation();
    const joystick = scene.touchJoystick;
    joystick?._applyZoomCompensation?.(joystick.uiContainer);
  }

  _thump3() {
    const scene = this.scene;
    if (scene.isGameOver) return;
    VictoryAudio.playThirdQuake(scene);
    scene.victorySecondThump?.addHit(THUMP3);
  }

  _leave() {
    const scene = this.scene;
    if (scene.isGameOver) return;
    this.traveling = true;
    scene.victoryFinale?.start(); // para o follow e inicia o pan de duração fixa
  }

  // chamado todo frame durante o pan (VictoryFinale), progress 0..1
  onPanProgress(progress) {
    const scene = this.scene;
    const p = Phaser.Math.Clamp(progress, 0, 1);

    const particles = scene.victoryParticles;
    if (particles) {
      particles.densityMultiplier = Phaser.Math.Linear(PARTICLE_DENSITY_START, PARTICLE_DENSITY_END, p);
      particles.speedMultiplier = Phaser.Math.Linear(1, PARTICLE_SPEED_END, p);
      particles.trailChance = Phaser.Math.Linear(0, PARTICLE_TRAIL_END, p);
    }

    const thump = scene.victorySecondThump;
    if (thump) {
      if (this._coldStart == null) this._coldStart = thump.coldMax;
      thump.coldMax = Phaser.Math.Linear(this._coldStart, COLD_MAX_END, p); // sombras se aprofundando
      thump.corruptionBoost = p;
    }

    if (!this._thump4Played && p >= THUMP4_AT_PROGRESS) {
      this._thump4Played = true;
      VictoryAudio.playRollingQuake(scene);
      VictoryAudio.startTexture(scene, TEXTURE_FADE_IN_MS); // o som passa a ter outra natureza
      thump?.addHit(THUMP4);
    }
    if (this._thump4Played) VictoryAudio.setTextureLevel(0.2 + 0.9 * p);
  }
}
