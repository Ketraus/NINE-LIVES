import EventBus from './EventBus.js';

// Sequência de vitória, etapa dos tremores: depois do "PARABÉNS" a câmera
// começa a vibrar de leve e o tremor cresce até soar como catástrofe. A tela
// escurece junto (HUD.setVictoryAtmosphere) e os inimigos tremem de medo
// (EnemySpawner._windDown lê scene.victoryTremorLevel).
//
// level (0..1) sobe com curva quadrática: quase imperceptível no começo
// (estranheza), explosivo no fim (catástrofe iminente). No pico ele FICA em 1
// e emite 'victory-tremor-peak' pra próxima etapa da cinemática.

const START_DELAY_MS = 2500; // "alguns instantes" depois da mensagem terminar de entrar
const BUILD_MS = 18000; // do primeiro tremor ao pico
const SHAKE_MIN = 0.0005;
const SHAKE_MAX = 0.016;
const SHAKE_REFRESH_MS = 90; // cam.shake é reaplicado em pulsos curtos pra a intensidade acompanhar o level
const SHAKE_PULSE_MS = 140;

// baque grave e distante (reaproveita o pisão do Minotauro, bem mais lento e
// baixo); null desliga. Cadência acelera e o volume cresce com o level.
const RUMBLE_SFX_KEY = 'sfx_minotaur_stomp';
const RUMBLE_INTERVAL_START_MS = 2800;
const RUMBLE_INTERVAL_END_MS = 850;
const RUMBLE_VOLUME_START = 0.04;
const RUMBLE_VOLUME_END = 0.5;
const RUMBLE_RATE_START = 0.42;
const RUMBLE_RATE_END = 0.6;

export default class VictoryTremor {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.elapsedMs = 0;
    this.level = 0;
    this._nextShakeMs = 0;
    this._nextRumbleMs = 0;
    this._peaked = false;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.elapsedMs = 0;
  }

  // chamado todo frame pela GameScene (não roda com o jogo pausado)
  update(delta) {
    if (!this.active) return;
    this.elapsedMs += delta;
    const t = Phaser.Math.Clamp((this.elapsedMs - START_DELAY_MS) / BUILD_MS, 0, 1);
    this.level = t * t;
    this.scene.victoryTremorLevel = this.level;
    if (this.elapsedMs < START_DELAY_MS) return;

    const scene = this.scene;
    const now = this.elapsedMs;
    if (now >= this._nextShakeMs) {
      this._nextShakeMs = now + SHAKE_REFRESH_MS;
      const intensity = Phaser.Math.Linear(SHAKE_MIN, SHAKE_MAX, this.level);
      scene.cameras.main.shake(SHAKE_PULSE_MS, intensity, true);
    }
    if (RUMBLE_SFX_KEY && now >= this._nextRumbleMs) {
      this._nextRumbleMs = now + Phaser.Math.Linear(RUMBLE_INTERVAL_START_MS, RUMBLE_INTERVAL_END_MS, this.level);
      scene.sound.play(RUMBLE_SFX_KEY, {
        volume: Phaser.Math.Linear(RUMBLE_VOLUME_START, RUMBLE_VOLUME_END, this.level),
        rate: Phaser.Math.Linear(RUMBLE_RATE_START, RUMBLE_RATE_END, this.level)
      });
    }
    scene.hud?.setVictoryAtmosphere(this.level, now);

    if (t >= 1 && !this._peaked) {
      this._peaked = true;
      EventBus.emit('victory-tremor-peak');
    }
  }
}
