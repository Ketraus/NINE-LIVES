import SettingsManager from './SettingsManager.js';

// Áudio sintetizado (WebAudio) da cinemática de vitória — sem arquivos novos:
//   startDrone/setDroneLevel/stopDrone: zumbido sub-grave com batimento
//     (duas senoides ~2 Hz afastadas) + tremolo; fica mais grave, mais
//     fechado e mais agitado conforme o nível sobe.
//   playImpact: estrondo final — queda de sub-grave, rajada de ruído filtrado
//     e um estalo seco, mais camadas dos sons de impacto já carregados.
//   silenceAll: corta tudo em ~50 ms (o "silêncio" depois do corte pra preto).
// Tudo passa pelo masterVolumeNode do Phaser (slider MASTER) e pelo slider SFX.
// Sem WebAudio (fallback HTML5) os métodos viram no-op, só as camadas de
// arquivo do impacto tocam.

const DRONE_BASE_GAIN = 0.55;
const DRONE_FREQ_A = 34;
const DRONE_FREQ_B = 36.4;
const DRONE_FREQ_SAW = 68;

let drone = null;
let impactBus = null;
let quakeBus = null;

function manager(scene) {
  const sm = scene?.sound;
  return sm && sm.context && sm.masterVolumeNode ? sm : null;
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

const VictoryAudio = {
  startDrone(scene, fadeInMs = 4000) {
    const sm = manager(scene);
    if (!sm || drone) return;
    const ctx = sm.context;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(sm.masterVolumeNode);

    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.75;
    tremolo.connect(out);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 90;
    lowpass.Q.value = 2.5;
    lowpass.connect(tremolo);

    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = DRONE_FREQ_A;
    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = DRONE_FREQ_B;
    const oscSaw = ctx.createOscillator();
    oscSaw.type = 'sawtooth';
    oscSaw.frequency.value = DRONE_FREQ_SAW;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.1;
    oscA.connect(lowpass);
    oscB.connect(lowpass);
    oscSaw.connect(sawGain);
    sawGain.connect(lowpass);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.35;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.25;
    lfo.connect(lfoDepth);
    lfoDepth.connect(tremolo.gain);

    [oscA, oscB, oscSaw, lfo].forEach((o) => o.start());
    drone = { ctx, out, lowpass, oscA, oscB, oscSaw, lfo, lfoDepth, tremolo, sawGain, level: 0, startedAt: ctx.currentTime, fadeInSec: Math.max(0.1, fadeInMs / 1000) };
    this.setDroneLevel(0.05);
  },

  // level 0..~1.4 (acima de 1 = fase final). timeConstant em segundos.
  setDroneLevel(level, timeConstant = 0.15) {
    if (!drone) return;
    const { ctx, out, lowpass, oscA, oscB, lfo, lfoDepth } = drone;
    const t = ctx.currentTime;
    const l = Math.max(0, level);
    drone.level = l;
    // fade-in próprio (suavizado): o volume sobe do zero durante fadeInSec,
    // não importa o nível que o tremor já esteja pedindo
    const fade = Math.min(1, (t - drone.startedAt) / drone.fadeInSec);
    const fadeCurve = fade * fade * (3 - 2 * fade);
    out.gain.setTargetAtTime(DRONE_BASE_GAIN * (0.2 + 0.8 * Math.min(l, 1.4)) * SettingsManager.getSfx() * fadeCurve, t, timeConstant);
    lowpass.frequency.setTargetAtTime(80 + 150 * Math.min(l, 1.4), t, 0.3);
    oscA.frequency.setTargetAtTime(DRONE_FREQ_A - 6 * Math.min(l, 1.4), t, 0.5);
    oscB.frequency.setTargetAtTime(DRONE_FREQ_B - 6 * Math.min(l, 1.4), t, 0.5);
    lfo.frequency.setTargetAtTime(0.35 + 2.4 * Math.min(l, 1.4), t, 0.4);
    lfoDepth.gain.setTargetAtTime(0.2 + 0.2 * Math.min(l, 1.4), t, 0.4);
  },

  stopDrone(fadeMs = 60) {
    if (!drone) return;
    const d = drone;
    drone = null;
    const t = d.ctx.currentTime;
    d.out.gain.cancelScheduledValues(t);
    d.out.gain.setTargetAtTime(0, t, Math.max(0.01, fadeMs / 3000));
    setTimeout(() => {
      [d.oscA, d.oscB, d.oscSaw, d.lfo].forEach((o) => { try { o.stop(); } catch (e) { /* já parado */ } });
      try { d.out.disconnect(); } catch (e) { /* já solto */ }
    }, fadeMs + 250);
  },

  // Estrondo final da cinemática (o "impacto audiovisual brutal").
  playImpact(scene) {
    // camadas de arquivo (passam pelo slider de SFX via patch do sound.play)
    scene.sound.play('sfx_slam_impact', { volume: 1, rate: 0.45 });
    scene.sound.play('sfx_minotaur_stomp', { volume: 1, rate: 0.3 });

    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t0 = ctx.currentTime;
    const sfx = SettingsManager.getSfx();

    // barramento + compressor: tudo somado sem estourar, e cortável de uma vez
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 12;
    const bus = ctx.createGain();
    bus.gain.value = 1.15 * sfx;
    compressor.connect(bus);
    bus.connect(sm.masterVolumeNode);
    impactBus = bus;

    // 1) sub-grave despencando de 95 Hz até 24 Hz
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(95, t0);
    boom.frequency.exponentialRampToValueAtTime(24, t0 + 1.5);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.0001, t0);
    boomGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.012);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    boom.connect(boomGain);
    boomGain.connect(compressor);
    boom.start(t0);
    boom.stop(t0 + 3);

    // 2) corpo: dente-de-serra grave saturando junto
    const body = ctx.createOscillator();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime(58, t0);
    body.frequency.exponentialRampToValueAtTime(30, t0 + 1.0);
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(420, t0);
    bodyFilter.frequency.exponentialRampToValueAtTime(70, t0 + 1.2);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t0);
    bodyGain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.01);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(compressor);
    body.start(t0);
    body.stop(t0 + 1.8);

    // 3) rajada de ruído que vai fechando (desabamento)
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 2.2);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(5200, t0);
    rumbleFilter.frequency.exponentialRampToValueAtTime(110, t0 + 1.4);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, t0);
    rumbleGain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.008);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.1);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(compressor);
    rumble.start(t0);

    // 4) estalo seco (ataque)
    const crack = ctx.createBufferSource();
    crack.buffer = noiseBuffer(ctx, 0.08);
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(1.0, t0);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    crack.connect(crackGain);
    crackGain.connect(compressor);
    crack.start(t0);
  },

  // A pancada das 10:00 (Cena 01): NÃO é uma explosão — é uma massa gigante se
  // deslocando nas entranhas do planeta. Ataque curto mas sem "clique", sub
  // despencando, um gemido tectônico e um ruído grave áspero. Dura o que o
  // VictoryImpact deixar: depois vem cutQuake() e o silêncio absoluto.
  playQuake(scene) {
    scene.sound.play('sfx_minotaur_stomp', { volume: 1, rate: 0.25 });
    scene.sound.play('sfx_slam_impact', { volume: 1, rate: 0.33 });

    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t0 = ctx.currentTime;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 10;
    const bus = ctx.createGain();
    bus.gain.value = 1.25 * SettingsManager.getSfx();
    compressor.connect(bus);
    bus.connect(sm.masterVolumeNode);
    quakeBus = bus;

    // 1) sub-grave: 62 Hz despencando pra 20 Hz, ataque de 30 ms
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(62, t0);
    sub.frequency.exponentialRampToValueAtTime(20, t0 + 3);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0);
    subGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
    sub.connect(subGain);
    subGain.connect(compressor);
    sub.start(t0);
    sub.stop(t0 + 3.3);

    // 2) gemido tectônico: dente-de-serra grave com vibrato lento, fechando
    const groan = ctx.createOscillator();
    groan.type = 'sawtooth';
    groan.frequency.setValueAtTime(46, t0);
    groan.frequency.exponentialRampToValueAtTime(27, t0 + 2.6);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.5;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 3;
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(groan.frequency);
    const groanFilter = ctx.createBiquadFilter();
    groanFilter.type = 'lowpass';
    groanFilter.frequency.setValueAtTime(190, t0);
    groanFilter.frequency.exponentialRampToValueAtTime(55, t0 + 2.4);
    const groanGain = ctx.createGain();
    groanGain.gain.setValueAtTime(0.0001, t0);
    groanGain.gain.exponentialRampToValueAtTime(0.7, t0 + 0.06);
    groanGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    groan.connect(groanFilter);
    groanFilter.connect(groanGain);
    groanGain.connect(compressor);
    groan.start(t0);
    vibrato.start(t0);
    groan.stop(t0 + 2.9);
    vibrato.stop(t0 + 2.9);

    // 3) ruído grave áspero (a "aspereza" é modulação rápida de volume)
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 3.2);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(240, t0);
    rumbleFilter.frequency.exponentialRampToValueAtTime(70, t0 + 3);
    const am = ctx.createGain();
    am.gain.value = 0.7;
    const amLfo = ctx.createOscillator();
    amLfo.frequency.value = 9;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.3;
    amLfo.connect(amDepth);
    amDepth.connect(am.gain);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, t0);
    rumbleGain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.05);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.1);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(am);
    am.connect(rumbleGain);
    rumbleGain.connect(compressor);
    rumble.start(t0);
    amLfo.start(t0);
    amLfo.stop(t0 + 3.2);

    // 4) baque abafado de ataque (só corpo, sem agudo)
    const thump = ctx.createBufferSource();
    thump.buffer = noiseBuffer(ctx, 0.25);
    const thumpFilter = ctx.createBiquadFilter();
    thumpFilter.type = 'lowpass';
    thumpFilter.frequency.value = 320;
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(1.0, t0);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    thump.connect(thumpFilter);
    thumpFilter.connect(thumpGain);
    thumpGain.connect(compressor);
    thump.start(t0);
  },

  // O CORTE SONORO depois da pancada: tudo some em ~25 ms.
  cutQuake() {
    if (!quakeBus) return;
    const bus = quakeBus;
    quakeBus = null;
    bus.gain.cancelScheduledValues(bus.context.currentTime);
    bus.gain.setTargetAtTime(0, bus.context.currentTime, 0.008);
  },

  // Corta tudo que a cinemática ainda esteja tocando (drone + cauda do impacto).
  silenceAll(scene) {
    this.stopDrone(50);
    this.cutQuake();
    if (impactBus) {
      const bus = impactBus;
      impactBus = null;
      bus.gain.cancelScheduledValues(bus.context.currentTime);
      bus.gain.setTargetAtTime(0, bus.context.currentTime, 0.015);
    }
    scene?.sound?.stopAll();
  }
};

export default VictoryAudio;
