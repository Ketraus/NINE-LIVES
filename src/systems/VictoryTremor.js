import EventBus from './EventBus.js';
import MusicManager from './MusicManager.js';
import VictoryAudio from './VictoryAudio.js';

// Sequência de vitória, etapa dos tremores: depois do "PARABÉNS" a câmera
// começa a vibrar de leve e o tremor cresce até soar como catástrofe. A tela
// escurece junto (HUD.setVictoryAtmosphere) e os inimigos tremem de medo
// (EnemySpawner._windDown lê scene.victoryTremorLevel).
//
// level (0..1) sobe com curva quadrática: quase imperceptível no começo
// (estranheza), explosivo no fim (catástrofe iminente). No pico ele FICA em 1
// e emite 'victory-tremor-peak' pra próxima etapa da cinemática.

// Linha do tempo (a partir do fim da entrada da mensagem): a música começa
// a sumir primeiro, o silêncio se instala, e SÓ ENTÃO o chão começa a tremer.
const MUSIC_FADE_DELAY_MS = 1500;
const MUSIC_FADE_MS = 8000;
const START_DELAY_MS = 4500; // primeiro tremor (música já quase no fim)
const BUILD_MS = 13000; // do primeiro tremor ao pico
const SHAKE_MIN = 0.0005;
const SHAKE_MAX = 0.016;
// "Overdrive" (VictoryFinale): enquanto a câmera abandona o jogador o tremor
// passa do pico — mais forte, baques mais rápidos e altos, escuridão maior.
const SHAKE_PEAK = 0.032;
const RUMBLE_INTERVAL_PEAK_MS = 450;
const OVERDRIVE_ATMOSPHERE_BOOST = 0.4;
const OVERDRIVE_DRONE_BOOST = 0.5;
const SHAKE_REFRESH_MS = 90; // cam.shake é reaplicado em pulsos curtos pra a intensidade acompanhar o level
const SHAKE_PULSE_MS = 140;
// Peso: cada baque grave (rumble) é um "soco" — a intensidade do tremor
// multiplica por (1 + kick * KICK_SHAKE_BOOST) e decai em KICK_DECAY_MS;
// o mesmo kick escurece a tela e faz os inimigos estremecerem (ver
// HUD.setVictoryAtmosphere e EnemySpawner._windDown).
const KICK_SHAKE_BOOST = 2.2;
const KICK_DECAY_MS = 420;

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
    this._musicFaded = false;
    this.kick = 0;
    this.overdrive = 0; // 0..1, ver setOverdrive
    this.shaking = false; // true depois do START_DELAY: a partir daí o tremor é quem balança a câmera (ver VictorySecondThump)
  }

  // 0..1 — pilotado pela câmera deixando o jogador (VictoryFinale).
  setOverdrive(value) {
    this.overdrive = Phaser.Math.Clamp(value, 0, 1);
  }

  // Corta tudo de uma vez (o instante de silêncio antes do impacto final).
  stop() {
    this.active = false;
    this.shaking = false;
    this.scene.victorySecondThump?.stop(); // silêncio antes do impacto final: some a vibração residual da 2ª pancada
    this.level = 0;
    this.kick = 0;
    this.scene.victoryTremorLevel = 0;
    this.scene.victoryTremorKick = 0;
    this.scene.victoryResidualFear = 0;
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
    if (!this._musicFaded && this.elapsedMs >= MUSIC_FADE_DELAY_MS) {
      this._musicFaded = true;
      MusicManager.fadeOutAll(this.scene, MUSIC_FADE_MS);
    }
    this.kick = Math.max(0, this.kick - delta / KICK_DECAY_MS);
    this.scene.victoryTremorKick = this.kick;
    const t = Phaser.Math.Clamp((this.elapsedMs - START_DELAY_MS) / BUILD_MS, 0, 1);
    this.level = t * t;
    // não derruba o estremecer residual deixado pela pancada (VictoryImpact)
    this.scene.victoryTremorLevel = Math.max(this.level, this.scene.victoryResidualFear || 0);
    if (this.elapsedMs < START_DELAY_MS) return;
    this.shaking = true;

    const scene = this.scene;
    const now = this.elapsedMs;
    if (now >= this._nextShakeMs) {
      this._nextShakeMs = now + SHAKE_REFRESH_MS;
      const peak = Phaser.Math.Linear(SHAKE_MAX, SHAKE_PEAK, this.overdrive);
      const base = Phaser.Math.Linear(SHAKE_MIN, peak, this.level) * (1 + this.kick * KICK_SHAKE_BOOST);
      // a vibração que a 2ª pancada deixou (VictorySecondThump) é o piso: o tremor nunca cai abaixo dela
      const intensity = Math.max(base, scene.victoryShakeFloor || 0);
      scene.cameras.main.shake(SHAKE_PULSE_MS, intensity, true);
      VictoryAudio.setDroneLevel(this.level + this.overdrive * OVERDRIVE_DRONE_BOOST);
    }
    if (now >= this._nextRumbleMs) {
      const baseInterval = Phaser.Math.Linear(RUMBLE_INTERVAL_START_MS, RUMBLE_INTERVAL_END_MS, this.level);
      this._nextRumbleMs = now + Phaser.Math.Linear(baseInterval, RUMBLE_INTERVAL_PEAK_MS, this.overdrive);
      this.kick = 1;
      if (RUMBLE_SFX_KEY) {
        scene.sound.play(RUMBLE_SFX_KEY, {
          volume: Math.min(1, Phaser.Math.Linear(RUMBLE_VOLUME_START, RUMBLE_VOLUME_END, this.level) * (1 + this.overdrive * 0.8)),
          rate: Phaser.Math.Linear(RUMBLE_RATE_START, RUMBLE_RATE_END, this.level)
        });
      }
    }
    scene.hud?.setVictoryAtmosphere(this.level + this.overdrive * OVERDRIVE_ATMOSPHERE_BOOST, now, this.kick);

    if (t >= 1 && !this._peaked) {
      this._peaked = true;
      EventBus.emit('victory-tremor-peak');
    }
  }
}
