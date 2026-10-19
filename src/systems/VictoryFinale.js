import EventBus from './EventBus.js';
import VictoryAudio from './VictoryAudio.js';
import gameVersion from '../../data/gameVersion.js';

// Final da cinemática de vitória. Começa no pico do tremor (VictoryTremor) e
// encadeia:
//
//   1) A CÂMERA ABANDONA O JOGADOR — para de seguir o gato e desliza devagar
//      até o ponto FinalCameraTarget do Tiled (mar ao norte; cai em
//      NorthCoastCenter se faltar). A mensagem some, entra o drone grave e o
//      tremor passa do pico ("overdrive").
//   2) O DESPERTAR — GANCHO VAZIO (_playAwakening): o Leviatã vai aqui. Hoje
//      só segura o olhar no oceano por AWAKENING_PLACEHOLDER_HOLD_MS.
//   3) A VERDADEIRA MENSAGEM — o mundo corta pro silêncio, a primeira linha
//      volta sozinha e, SÓ NA VERSÃO 'feira' (data/gameVersion.js), uma pausa
//      e "MAS NÃO A GUERRA." chega com impacto. Na 'snct' ela fica sozinha.
//   4) CORTE PRA PRETO -> silêncio -> CreditsScene (créditos na 'feira';
//      cartões de encerramento na 'snct'; volta pro menu no fim).

const PAN_SPEED_PX_PER_S = 380;
const PAN_MIN_MS = 12000;
const PAN_MAX_MS = 30000;
const PAN_EASE = 'Sine.easeInOut';
const MESSAGE_FADE_OUT_MS = 3000;
const DRONE_FADE_IN_MS = 5000;

const AWAKENING_PLACEHOLDER_HOLD_MS = 3500; // trocar pela cena do Leviatã
const SILENCE_BEFORE_IMPACT_MS = 1500; // tudo cala; só a primeira linha na tela
const SNCT_HOLD_ON_MESSAGE_MS = 4000; // 'snct': a frase fica sozinha no silêncio antes do preto
const IMPACT_SHAKE_MS = 1000;
const IMPACT_SHAKE_INTENSITY = 0.05;
const HOLD_AFTER_IMPACT_MS = 4500;
const BLACK_SILENCE_MS = 3000;

export default class VictoryFinale {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    this._arrived = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const scene = this.scene;
    const cam = scene.cameras.main;

    cam.stopFollow();
    scene.hud?.fadeOutVictoryMessage(MESSAGE_FADE_OUT_MS);
    VictoryAudio.startDrone(scene, DRONE_FADE_IN_MS);

    const target = this._resolveTarget();
    const dist = Phaser.Math.Distance.Between(cam.midPoint.x, cam.midPoint.y, target.x, target.y);
    const duration = Phaser.Math.Clamp((dist / PAN_SPEED_PX_PER_S) * 1000, PAN_MIN_MS, PAN_MAX_MS);

    cam.pan(target.x, target.y, duration, PAN_EASE, true, (camera, progress) => {
      scene.victoryTremor?.setOverdrive(progress);
      if (progress >= 1 && !this._arrived) {
        this._arrived = true;
        this._onArrive();
      }
    });
  }

  _resolveTarget() {
    const map = this.scene.mapManager;
    const point = map?.getFinalCameraTarget?.() || map?.getNorthCoastCenter?.();
    if (point) return point;
    // sem o objeto no Tiled: sobe até perto da borda norte, na mesma coluna do gato
    console.warn('[VictoryFinale] FinalCameraTarget/NorthCoastCenter não encontrados no mapa — usando a borda norte.');
    return { x: this.scene.player.x, y: this.scene.mapManager.getWorldBounds().height * 0.06 };
  }

  _onArrive() {
    if (this._aborted()) return;
    this._playAwakening(() => this._playClosing());
  }

  // GANCHO: aqui entra o despertar do Leviatã (mapManager.getLeviathanSpawn()
  // dá o ponto de nascimento). Chame done() quando a criatura terminar de
  // emergir. Por enquanto a câmera só segura o olhar no oceano tremendo.
  _playAwakening(done) {
    EventBus.emit('victory-awakening');
    this.scene.time.delayedCall(AWAKENING_PLACEHOLDER_HOLD_MS, done);
  }

  _playClosing() {
    if (this._aborted()) return;
    const scene = this.scene;
    const hud = scene.hud;

    // corte seco: tremor, drone e baques param — e a primeira linha volta
    scene.victoryTremor?.stop();
    VictoryAudio.stopDrone(80);
    scene.cameras.main.resetFX();
    hud?.showVictoryLineInstant();

    // SNCT: sem Leviatã e sem "MAS NÃO A GUERRA." — só a frase, o silêncio e o preto
    if (gameVersion.version !== 'feira') {
      scene.time.delayedCall(SNCT_HOLD_ON_MESSAGE_MS, () => this._cutToBlackThenCredits());
      return;
    }

    scene.time.delayedCall(SILENCE_BEFORE_IMPACT_MS, () => {
      if (this._aborted()) return;
      VictoryAudio.playImpact(scene);
      scene.cameras.main.shake(IMPACT_SHAKE_MS, IMPACT_SHAKE_INTENSITY, true);
      hud?.playVictoryContinuation();

      scene.time.delayedCall(HOLD_AFTER_IMPACT_MS, () => this._cutToBlackThenCredits());
    });
  }

  // Corte seco pra preto, silêncio e CreditsScene (que escolhe créditos ou
  // cartões da SNCT conforme data/gameVersion.js).
  _cutToBlackThenCredits() {
    if (this._aborted()) return;
    const scene = this.scene;
    scene.hud?.cutToBlack();
    scene.cameras.main.resetFX();
    VictoryAudio.silenceAll(scene);
    scene.time.delayedCall(BLACK_SILENCE_MS, () => {
      if (this._aborted()) return;
      scene.scene.start('CreditsScene');
    });
  }

  // jogador morto/cena trocada no meio: a cinemática se cala
  _aborted() {
    return !this.scene.sys?.isActive() || this.scene.isGameOver;
  }
}
