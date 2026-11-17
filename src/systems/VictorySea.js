import VictoryAudio from './VictoryAudio.js';

// CENA 05 do roteiro — "O MAR" (a câmera chega ao norte). O Leviatã nunca
// aparece; a cena existe pra o jogador ter CERTEZA de que ele vai.
//
// Princípio de direção: depois de ~60 s de tremor crescente, a chegada tem que
// ser um ALÍVIO falso. Contraste faz o impacto, não volume. Cada momento tem UMA
// ideia, e cada ideia substitui a anterior:
//
//   1 CHEGADA     o tremor, o drone e a textura CORTAM. A câmera para. O mar fica
//                 vidrado (as ondas quase param) e clareia. Silêncio com só um
//                 sopro de ar. A primeira linha volta.
//   2 O SINAL     uma bolha. Sobe, estoura, o anel corre no mar parado. Silêncio.
//                 Outra. Outra. Algo respira lá embaixo.
//   3 O BATIMENTO um som grave começa a subir e entram batimentos que ACELERAM.
//                 A cada batimento: tranco leve, uma onda CONTRAI pro centro (a
//                 água sendo sugada) e a sombra incha. A câmera se aproxima bem
//                 devagar. A água escurece em faixas, cada vez maior que a tela.
//   4 O FÔLEGO    o último batimento. TUDO para: som, bolhas, ondas, câmera, mar
//                 (de novo vidrado). A sombra está maior que a tela e imóvel. É
//                 aqui que a criatura emergiria. (VictoryFinale._onHeld decide o que
//                 vem: a quebra, ou o preto na versão SNCT.)
//   5 A QUEBRA    (breach, chamada pelo VictoryFinale) o mar é empurrado de baixo:
//                 ondas gigantes varrem a tela e a câmera recua com o choque. A
//                 sombra AFUNDA devagar — o que quer que fosse, ficou lá embaixo.
//
// Os tempos abaixo são ms a partir da chegada da câmera.

// ---- 1 chegada
const RELEASE_MS = 450; // drone/textura caem nesse tempo
const VEIL_CALM = 0.1; // o véu escuro clareia: o mundo respira
const VEIL_CALM_MS = 1600;
const STILL_AT = 300; // o mar vai ficando vidrado
const STILL_MS = 2000;
const AIR_AT = 800; // o sopro de ar do mar parado
const AIR_FADE_MS = 2800;
const LINE_AT = 3200; // "PARABÉNS, VOCÊ VENCEU O JOGO." volta
const LINE_FADE_MS = 2200;
const CLEAR_FX_MS = 1400; // partículas e fissuras se apagam

// ---- 2 o sinal: bolhas isoladas (dx/dy × largura da tela a partir do epicentro)
const LONE_BUBBLES = [
  { at: 2600, dx: -0.02, dy: 0.01, size: 1, vol: 0.5, pitch: 1 },
  { at: 4400, dx: 0.05, dy: -0.015, size: 1.1, vol: 0.55, pitch: 0.9 },
  { at: 5600, dx: -0.04, dy: 0.02, size: 0.95, vol: 0.6, pitch: 0.8 }
];

// ---- 3 o batimento
const BREATH_AT = 6000; // o som começa a subir; câmera, sombra e véu começam a crescer
const PULSE_FIRST_AT = 7000;
const PULSE_GAP_START_MS = 2300; // entre batimentos: acelera até o gap final
const PULSE_GAP_END_MS = 800;
const PULSE_STOP_BEFORE_HELD_MS = 600; // o último batimento vem um respiro antes do fôlego
const PULSE_SHAKE_MIN = 0.0015;
const PULSE_SHAKE_MAX = 0.0065;
const PULSE_SHAKE_MS = 260;
const SWARM_AT = 8000;
const SWARM_RATE_START = 0.6; // bolhas por segundo
const SWARM_RATE_END = 12;
const SWARM_FIELD_START = 0.04; // raio do campo × largura da tela
const SWARM_FIELD_END = 0.2;
const DARK_END_AMOUNT = 0.9;
const DARK_END_RADIUS = 1.15; // × largura da tela: maior que o quadro
const VEIL_BUILD_END = 0.32;
const ZOOM_CREEP = 1.06; // a aproximação até o fôlego
const TREMOR_AT = 11000; // o chão volta a tremer (muito de leve), só agora
const TREMOR_MIN = 0.0005;
const TREMOR_MAX = 0.0035;
const TREMOR_REFRESH_MS = 100;
const SEA_WAKE_AT = 10500; // a superfície destrava e começa a tremer
const SEA_WAKE_MS = 2500;
const SEA_AGITATION_END = 0.7;

// ---- 4 o fôlego
const HELD_AT = 15500;
const HELD_VEIL = 0.42;
const HELD_FREEZE_MS = 300;

// ---- 5 a quebra
const RECOIL_ZOOM = 0.955; // a câmera recua com o choque...
const RECOIL_MS = 110;
const SETTLE_ZOOM = 0.985; // ...e volta devagar
const SETTLE_MS = 3600;
const SINK_MS = 4200; // a sombra afunda
const WAKE_AGITATION_MS = 3500; // o mar se acalma depois da quebra
const AFTER_VEIL = 0.16;

export default class VictorySea {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    this._pulseShakeUntil = 0;
    this._zoomHeld = null;
  }

  // target: ponto do mar onde a câmera chegou. onHeld: chamada no instante do fôlego.
  play(target, onHeld) {
    if (this.started) return;
    this.started = true;
    const scene = this.scene;
    const cam = scene.cameras.main;
    const lev = scene.victoryLeviathan;
    const sea = scene.seaFx;
    const hud = scene.hud;
    const aborted = () => !scene.sys?.isActive() || scene.isGameOver;
    const at = (ms, fn) => scene.time.delayedCall(ms, () => { if (!aborted()) fn(); });
    const tween = (targets, props, duration, ease = 'Sine.easeInOut') => {
      if (targets) scene.tweens.add({ targets, ...props, duration, ease });
    };
    this._aborted = aborted;

    lev?.start(target);

    // ---------------------------------------------------------------- 1 chegada
    scene.victoryTremor?.stop(); // o tremor e a vibração residual CORTAM
    VictoryAudio.stopDrone(RELEASE_MS);
    VictoryAudio.stopTexture(RELEASE_MS);
    scene.victoryParticles?.fadeOut(CLEAR_FX_MS);
    scene.victoryCracks?.fadeOut(CLEAR_FX_MS);
    at(200, () => cam.resetFX()); // o último pulso de vibração já acabou
    hud?.tweenVictoryDark(VEIL_CALM, VEIL_CALM_MS);
    at(STILL_AT, () => tween(sea, { stillness: 1 }, STILL_MS));
    at(AIR_AT, () => VictoryAudio.startSeaAir(scene, AIR_FADE_MS));
    at(LINE_AT, () => hud?.fadeInVictoryLine(LINE_FADE_MS));

    // ---------------------------------------------------------------- 2 o sinal
    LONE_BUBBLES.forEach((b) => at(b.at, () => lev?.bubble({
      dx: b.dx,
      dy: b.dy,
      size: b.size,
      onPop: () => { if (!aborted()) VictoryAudio.playBubble(scene, b.vol, b.pitch); }
    })));

    // ---------------------------------------------------------------- 3 o batimento
    const built = HELD_AT - BREATH_AT;
    at(BREATH_AT, () => {
      VictoryAudio.startSeaBreath(scene, built);
      if (lev) tween(lev.dark, { amount: DARK_END_AMOUNT, radius: DARK_END_RADIUS }, built, 'Quad.easeIn');
      hud?.tweenVictoryDark(VEIL_BUILD_END, built, 'Sine.easeIn');
      cam.zoomTo(cam.zoom * ZOOM_CREEP, built, 'Sine.easeIn', true);
    });

    // batimentos: o intervalo encolhe, a força cresce — o último vem logo antes do fôlego
    const lastPulseAt = HELD_AT - PULSE_STOP_BEFORE_HELD_MS;
    for (let t = PULSE_FIRST_AT; t <= lastPulseAt;) {
      const k = (t - PULSE_FIRST_AT) / (lastPulseAt - PULSE_FIRST_AT);
      this._pulseAt(t, 0.25 + 0.75 * k, at);
      t += Phaser.Math.Linear(PULSE_GAP_START_MS, PULSE_GAP_END_MS, k);
    }

    // enxame de bolhas: cada vez mais, mais perto
    at(SWARM_AT, () => {
      if (!lev) return;
      lev.onSwarmPop = (s) => VictoryAudio.playBubble(scene, 0.1 + 0.18 * Math.min(1, s), 0.85 + Math.random() * 0.5);
      const swarm = { rate: SWARM_RATE_START, field: SWARM_FIELD_START };
      scene.tweens.add({
        targets: swarm,
        rate: SWARM_RATE_END,
        field: SWARM_FIELD_END,
        duration: HELD_AT - SWARM_AT,
        ease: 'Quad.easeIn',
        onUpdate: () => lev.setSwarm(swarm.rate, swarm.field)
      });
    });

    // a superfície destrava e treme; o chão volta a tremer — só agora, e de leve
    at(SEA_WAKE_AT, () => {
      tween(sea, { stillness: 0 }, SEA_WAKE_MS);
      tween(sea, { agitation: SEA_AGITATION_END }, HELD_AT - SEA_WAKE_AT, 'Quad.easeIn');
    });
    at(TREMOR_AT, () => this._startTremor(HELD_AT - TREMOR_AT));

    // ---------------------------------------------------------------- 4 o fôlego
    at(HELD_AT, () => {
      this._stopTremor();
      VictoryAudio.cutSeaBreath(60);
      VictoryAudio.stopSeaAir(60);
      lev?.freeze();
      cam.resetFX();
      this._zoomHeld = cam.zoom;
      tween(sea, { stillness: 1, agitation: 0 }, HELD_FREEZE_MS);
      hud?.tweenVictoryDark(HELD_VEIL, 700);
      onHeld?.();
    });
  }

  // A QUEBRA (VictoryFinale chama junto do impacto sonoro e do texto): o mar é
  // empurrado de baixo, a câmera recua com o choque e a sombra afunda.
  breach() {
    const scene = this.scene;
    const cam = scene.cameras.main;
    const lev = scene.victoryLeviathan;
    const sea = scene.seaFx;
    const base = this._zoomHeld ?? cam.zoom;

    lev?.breach();
    VictoryAudio.playSeaWash(scene);

    if (sea) {
      scene.tweens.killTweensOf(sea);
      sea.stillness = 0;
      sea.agitation = 1; // o mar dispara...
      scene.tweens.add({ targets: sea, agitation: 0, duration: WAKE_AGITATION_MS, ease: 'Sine.easeOut' }); // ...e se acalma
    }
    if (lev) {
      scene.tweens.add({ targets: lev.dark, amount: 0, radius: 0.55, duration: SINK_MS, ease: 'Sine.easeInOut' }); // afunda
    }
    scene.hud?.tweenVictoryDark(AFTER_VEIL, SINK_MS);

    cam.zoomTo(base * RECOIL_ZOOM, RECOIL_MS, 'Cubic.easeOut', true);
    scene.time.delayedCall(RECOIL_MS + 40, () => {
      if (this._aborted?.()) return;
      cam.zoomTo(base * SETTLE_ZOOM, SETTLE_MS, 'Sine.easeOut', true);
    });
  }

  // um batimento: som, tranco, onda que contrai, sombra que incha
  _pulseAt(ms, strength, at) {
    const scene = this.scene;
    at(ms, () => {
      scene.victoryLeviathan?.pulse(strength);
      VictoryAudio.playSeaPulse(scene, strength);
      const shake = Phaser.Math.Linear(PULSE_SHAKE_MIN, PULSE_SHAKE_MAX, strength);
      this._pulseShakeUntil = scene.time.now + PULSE_SHAKE_MS;
      scene.cameras.main.shake(PULSE_SHAKE_MS, shake, true);
    });
  }

  // o chão volta a tremer bem de leve, crescendo (pulsos curtos, como no VictoryTremor)
  _startTremor(durationMs) {
    const scene = this.scene;
    let elapsed = 0;
    this._tremorTimer = scene.time.addEvent({
      delay: TREMOR_REFRESH_MS,
      loop: true,
      callback: () => {
        if (this._aborted?.()) {
          this._stopTremor();
          return;
        }
        elapsed += TREMOR_REFRESH_MS;
        if (scene.time.now < this._pulseShakeUntil) return; // não corta o tranco do batimento
        const p = Math.min(1, elapsed / durationMs);
        scene.cameras.main.shake(TREMOR_REFRESH_MS + 40, Phaser.Math.Linear(TREMOR_MIN, TREMOR_MAX, p * p), true);
      }
    });
  }

  _stopTremor() {
    this._tremorTimer?.remove(false);
    this._tremorTimer = null;
  }
}
