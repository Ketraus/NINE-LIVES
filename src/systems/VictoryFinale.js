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
//   2) O DESPERTAR (_playAwakening) — o Leviatã NÃO aparece: o mar se agita e
//      uma silhueta colossal sobe sob a água (VictoryLeviathan) por
//      AWAKENING_HOLD_MS, com a câmera tremendo sobre o oceano.
//   3) A VERDADEIRA MENSAGEM — o mundo corta pro silêncio, a primeira linha
//      volta sozinha e, SÓ NA VERSÃO 'feira' (data/gameVersion.js), uma pausa
//      e "MAS NÃO A GUERRA." chega com impacto. Na 'snct' ela fica sozinha.
//   4) CORTE PRA PRETO -> silêncio -> CreditsScene (créditos na 'feira';
//      cartões de encerramento na 'snct'; volta pro menu no fim).

// A travessia dura SEMPRE o mesmo (roteiro, Cena 04: duração cinematográfica
// consistente, não importa onde o gato esteja no mapa): a velocidade da câmera
// é que se adapta à distância até o mar. Começa devagar e termina devagar.
const TRAVEL_MS = 13000;
const PAN_EASE = 'Sine.easeInOut';
const MESSAGE_FADE_OUT_MS = 3000;
const DRONE_FADE_IN_MS = 5000;

const AWAKENING_HOLD_MS = 7500; // o mar agita e a silhueta do Leviatã sobe sob a água (VictoryLeviathan)
const DISSOLVE_MS = 2600; // chegada ao mar: explosões, energia, partículas e tremor se dissolvem (nada some de repente)
const DISSOLVE_SHAKE_PEAK = 0.03; // tremor da câmera no instante do silêncio; míngua até zero junto com o resto
const SHAKE_PULSE_MS = 140;
const SHAKE_REFRESH_MS = 90;
const CALM_BEFORE_BUBBLES_MS = 1200; // depois da dissolução: mar parado, silêncio limpo; só a primeira linha na tela
const BUBBLES_MS = 5200; // bolhas e espuma crescendo no mar calmo (VictoryLeviathan.beginBubbles) até o impacto final
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
    this._target = target;
    scene.victoryCracks?.begin(cam.midPoint, target); // fissuras do Leviatã ao longo do trajeto

    cam.pan(target.x, target.y, TRAVEL_MS, PAN_EASE, true, (camera, progress) => {
      scene.victoryTremor?.setOverdrive(progress);
      scene.victoryDeparture?.onPanProgress(progress); // intensifica efeitos e dispara a 4ª pancada
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

  // O DESPERTAR: o Leviatã não aparece. A câmera segura o olhar no oceano
  // tremendo enquanto o mar se agita e uma silhueta colossal sobe sob a água
  // (VictoryLeviathan) — o que causava os tremores estava aqui o tempo todo.
  _playAwakening(done) {
    EventBus.emit('victory-awakening');
    this.scene.victoryLeviathan?.start(this._target || this._resolveTarget());
    this.scene.time.delayedCall(AWAKENING_HOLD_MS, done);
  }

  _playClosing() {
    if (this._aborted()) return;
    const scene = this.scene;
    const hud = scene.hud;

    // silêncio: tremor, drone e baques param e a primeira linha volta — mas o
    // que está visível (crateras, colunas de energia, fagulhas, partículas
    // azuis, vibração da câmera) se DISSOLVE em vez de sumir de uma vez
    scene.victoryTremor?.stop();
    VictoryAudio.stopDrone(80);
    scene.victoryCracks?.fadeOut(DISSOLVE_MS);
    scene.victoryLeviathan?.fadeOut(DISSOLVE_MS); // a silhueta e as ondas somem e o mar volta a acalmar (bolhas só depois)
    scene.victoryParticles?.fadeOut(DISSOLVE_MS);
    this._taperShake(DISSOLVE_MS);
    hud?.showVictoryLineInstant();

    // SNCT: sem Leviatã e sem "MAS NÃO A GUERRA." — só a frase, o silêncio e o preto
    if (gameVersion.version !== 'feira') {
      scene.time.delayedCall(SNCT_HOLD_ON_MESSAGE_MS, () => this._cutToBlackThenCredits());
      return;
    }

    // mar calmo e em silêncio -> começam a surgir bolhas, como se algo fosse emergir
    scene.time.delayedCall(DISSOLVE_MS + CALM_BEFORE_BUBBLES_MS, () => {
      if (this._aborted()) return;
      scene.victoryLeviathan?.beginBubbles(BUBBLES_MS);
    });

    // o impacto corta no auge das bolhas: a criatura nunca chega a emergir
    scene.time.delayedCall(DISSOLVE_MS + CALM_BEFORE_BUBBLES_MS + BUBBLES_MS, () => {
      if (this._aborted()) return;
      VictoryAudio.playImpact(scene);
      scene.cameras.main.shake(IMPACT_SHAKE_MS, IMPACT_SHAKE_INTENSITY, true);
      hud?.playVictoryContinuation();

      scene.time.delayedCall(HOLD_AFTER_IMPACT_MS, () => this._cutToBlackThenCredits());
    });
  }

  // A vibração da câmera míngua até zero em `ms` (curva quadrática: cai rápido no
  // começo e se arrasta no fim) e só então o FX da câmera é resetado.
  _taperShake(ms) {
    const scene = this.scene;
    let elapsed = 0;
    const timer = scene.time.addEvent({
      delay: SHAKE_REFRESH_MS,
      loop: true,
      callback: () => {
        if (this._aborted()) {
          timer.remove(false);
          return;
        }
        elapsed += SHAKE_REFRESH_MS;
        const p = Math.min(1, elapsed / ms);
        if (p >= 1) {
          timer.remove(false);
          scene.cameras.main.resetFX();
          return;
        }
        const k = 1 - p;
        scene.cameras.main.shake(SHAKE_PULSE_MS, DISSOLVE_SHAKE_PEAK * k * k, true);
      }
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
