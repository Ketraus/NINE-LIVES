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
let secondQuakeBus = null;
let extraBuses = []; // pancadas da Cena 04 (cortáveis de uma vez em silenceAll)
let texture = null;

const TEXTURE_BASE_GAIN = 0.4;
const TEXTURE_FREQ_CARRIER = 58;
const TEXTURE_FREQ_MOD = 87.3; // razão ~1,505: inarmônico, soa metálico
const TEXTURE_FREQ_VOICE = 41;

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

  // A SEGUNDA pancada (Cena 03): "VOOOOOOM... KRRRUUUUM". Mais longa e mais
  // grave que a primeira, e sem corte seco — a cauda vai morrendo sozinha e o
  // drone de fundo (startDrone) assume. Duas partes: um inchaço sub-grave que
  // desce (VOOOM) e, ~1,1 s depois, um rosnado áspero com novo golpe (KRRRUM).
  playSecondQuake(scene) {
    scene.sound.play('sfx_minotaur_stomp', { volume: 1, rate: 0.2 });
    scene.sound.play('sfx_slam_impact', { volume: 0.9, rate: 0.26 });

    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t0 = ctx.currentTime;
    const t1 = t0 + 1.1; // o "KRRRUUUUM"

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 10;
    const bus = ctx.createGain();
    bus.gain.value = 1.3 * SettingsManager.getSfx();
    compressor.connect(bus);
    bus.connect(sm.masterVolumeNode);
    secondQuakeBus = bus;

    // VOOOOOOM: sub-grave que incha devagar (250 ms) e despenca de 46 Hz pra 16 Hz
    const swell = ctx.createOscillator();
    swell.type = 'sine';
    swell.frequency.setValueAtTime(46, t0);
    swell.frequency.exponentialRampToValueAtTime(16, t0 + 4.2);
    const swellGain = ctx.createGain();
    swellGain.gain.setValueAtTime(0.0001, t0);
    swellGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.25);
    swellGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.6);
    swell.connect(swellGain);
    swellGain.connect(compressor);
    swell.start(t0);
    swell.stop(t0 + 4.7);

    // KRRRUUUUM: golpe sub-grave (ataque de 20 ms) + rosnado de dente-de-serra
    const hit = ctx.createOscillator();
    hit.type = 'sine';
    hit.frequency.setValueAtTime(38, t1);
    hit.frequency.exponentialRampToValueAtTime(15, t1 + 3.2);
    const hitGain = ctx.createGain();
    hitGain.gain.setValueAtTime(0.0001, t1);
    hitGain.gain.exponentialRampToValueAtTime(0.95, t1 + 0.02);
    hitGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 3.4);
    hit.connect(hitGain);
    hitGain.connect(compressor);
    hit.start(t1);
    hit.stop(t1 + 3.5);

    const growl = ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.setValueAtTime(34, t1);
    growl.frequency.exponentialRampToValueAtTime(19, t1 + 3.0);
    const growlRough = ctx.createGain(); // aspereza: modulação rápida de volume
    growlRough.gain.value = 0.65;
    const roughLfo = ctx.createOscillator();
    roughLfo.frequency.value = 13;
    const roughDepth = ctx.createGain();
    roughDepth.gain.value = 0.35;
    roughLfo.connect(roughDepth);
    roughDepth.connect(growlRough.gain);
    const growlFilter = ctx.createBiquadFilter();
    growlFilter.type = 'lowpass';
    growlFilter.frequency.setValueAtTime(150, t1);
    growlFilter.frequency.exponentialRampToValueAtTime(48, t1 + 3.0);
    const growlGain = ctx.createGain();
    growlGain.gain.setValueAtTime(0.0001, t1);
    growlGain.gain.exponentialRampToValueAtTime(0.6, t1 + 0.12);
    growlGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 3.2);
    growl.connect(growlFilter);
    growlFilter.connect(growlRough);
    growlRough.connect(growlGain);
    growlGain.connect(compressor);
    growl.start(t1);
    roughLfo.start(t1);
    growl.stop(t1 + 3.3);
    roughLfo.stop(t1 + 3.3);

    // massa de ruído grave por baixo de tudo, fechando devagar
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 5);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(210, t0);
    rumbleFilter.frequency.exponentialRampToValueAtTime(55, t0 + 4.6);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, t0);
    rumbleGain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.3);
    rumbleGain.gain.setValueAtTime(0.55, t1);
    rumbleGain.gain.exponentialRampToValueAtTime(0.85, t1 + 0.1);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.8);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(compressor);
    rumble.start(t0);
  },

  // ---------- CENA 04 ----------

  // barramento + compressor de uma pancada da Cena 04; devolve o nó de entrada
  _quakeInput(sm, gain) {
    const ctx = sm.context;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 10;
    const bus = ctx.createGain();
    bus.gain.value = gain * SettingsManager.getSfx();
    compressor.connect(bus);
    bus.connect(sm.masterVolumeNode);
    extraBuses.push(bus);
    return compressor;
  },

  // A TERCEIRA pancada: "BOOOOOOM". Um golpe só, o mais fundo até aqui: sub
  // despencando de 52 Hz pra 15 Hz, corpo de dente-de-serra fechando e uma
  // massa de ruído grave. Sem corte seco: a cauda morre sozinha.
  playThirdQuake(scene) {
    scene.sound.play('sfx_minotaur_stomp', { volume: 1, rate: 0.18 });
    scene.sound.play('sfx_slam_impact', { volume: 1, rate: 0.22 });

    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t0 = ctx.currentTime;
    const out = this._quakeInput(sm, 1.35);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(52, t0);
    sub.frequency.exponentialRampToValueAtTime(15, t0 + 3.6);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0);
    subGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.2);
    sub.connect(subGain);
    subGain.connect(out);
    sub.start(t0);
    sub.stop(t0 + 4.3);

    const body = ctx.createOscillator();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime(40, t0);
    body.frequency.exponentialRampToValueAtTime(20, t0 + 2.4);
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(160, t0);
    bodyFilter.frequency.exponentialRampToValueAtTime(45, t0 + 2.4);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t0);
    bodyGain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(out);
    body.start(t0);
    body.stop(t0 + 2.9);

    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 3.6);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(230, t0);
    rumbleFilter.frequency.exponentialRampToValueAtTime(60, t0 + 3.4);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, t0);
    rumbleGain.gain.exponentialRampToValueAtTime(0.8, t0 + 0.04);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(out);
    rumble.start(t0);
  },

  // A QUARTA pancada, no meio da travessia: "VRRRRRRRRRRMMMM...". Não é um
  // golpe, é uma pancada que ROLA (~7,5 s) e muda de natureza no caminho: um
  // zumbido áspero que chacoalha (VRRR), um hum fechado que entra depois (MMMM),
  // uma camada metálica FM (mecânica) e rocha moendo por baixo (geológica).
  // Orgânico, mecânico ou geológico? O ouvido não decide.
  playRollingQuake(scene) {
    scene.sound.play('sfx_minotaur_stomp', { volume: 0.7, rate: 0.16 });

    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t0 = ctx.currentTime;
    const D = 7.5;
    const out = this._quakeInput(sm, 1.25);
    const swell = (gain, peak, tUp, tHold) => {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + tUp);
      gain.gain.setValueAtTime(peak, t0 + tHold);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + D);
    };

    // VRRRR: dente-de-serra grave com volume chacoalhando rápido
    const grind = ctx.createOscillator();
    grind.type = 'sawtooth';
    grind.frequency.setValueAtTime(42, t0);
    grind.frequency.linearRampToValueAtTime(34, t0 + D);
    const grindAm = ctx.createGain();
    grindAm.gain.value = 0.6;
    const grindLfo = ctx.createOscillator();
    grindLfo.frequency.value = 24;
    const grindDepth = ctx.createGain();
    grindDepth.gain.value = 0.4;
    grindLfo.connect(grindDepth);
    grindDepth.connect(grindAm.gain);
    const grindFilter = ctx.createBiquadFilter();
    grindFilter.type = 'lowpass';
    grindFilter.frequency.setValueAtTime(280, t0);
    grindFilter.frequency.exponentialRampToValueAtTime(110, t0 + D);
    const grindGain = ctx.createGain();
    swell(grindGain, 0.8, 1.2, 3.2);
    grind.connect(grindFilter);
    grindFilter.connect(grindAm);
    grindAm.connect(grindGain);
    grindGain.connect(out);
    grind.start(t0);
    grindLfo.start(t0);
    grind.stop(t0 + D + 0.1);
    grindLfo.stop(t0 + D + 0.1);

    // MMMM: hum fechado que entra depois e fica
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(58, t0);
    hum.frequency.linearRampToValueAtTime(47, t0 + D);
    const humGain = ctx.createGain();
    swell(humGain, 0.7, 2.8, 4.5);
    hum.connect(humGain);
    humGain.connect(out);
    hum.start(t0);
    hum.stop(t0 + D + 0.1);

    // mecânico: portadora FM inarmônica (clangor surdo)
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 71;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = 113;
    const modDepth = ctx.createGain();
    modDepth.gain.setValueAtTime(10, t0);
    modDepth.gain.linearRampToValueAtTime(70, t0 + 4);
    mod.connect(modDepth);
    modDepth.connect(carrier.frequency);
    const fmGain = ctx.createGain();
    swell(fmGain, 0.28, 2.0, 4.5);
    carrier.connect(fmGain);
    fmGain.connect(out);
    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t0 + D + 0.1);
    mod.stop(t0 + D + 0.1);

    // geológico: rocha moendo, com ondas lentas de volume
    const rock = ctx.createBufferSource();
    rock.buffer = noiseBuffer(ctx, D + 0.2);
    const rockFilter = ctx.createBiquadFilter();
    rockFilter.type = 'lowpass';
    rockFilter.frequency.value = 130;
    const rockAm = ctx.createGain();
    rockAm.gain.value = 0.6;
    const rockLfo = ctx.createOscillator();
    rockLfo.frequency.value = 2.7;
    const rockDepth = ctx.createGain();
    rockDepth.gain.value = 0.35;
    rockLfo.connect(rockDepth);
    rockDepth.connect(rockAm.gain);
    const rockGain = ctx.createGain();
    swell(rockGain, 0.7, 0.5, 4);
    rock.connect(rockFilter);
    rockFilter.connect(rockAm);
    rockAm.connect(rockGain);
    rockGain.connect(out);
    rock.start(t0);
    rockLfo.start(t0);
    rockLfo.stop(t0 + D + 0.1);
  },

  // Camada permanente que entra com a 4ª pancada e muda a natureza do ruído de
  // fundo: metal FM (mecânico), rocha moendo (geológico) e uma voz grave com
  // formante que passeia (orgânico). level 0..~1,4 sobe com a travessia.
  startTexture(scene, fadeInMs = 3000) {
    const sm = manager(scene);
    if (!sm || texture) return;
    const ctx = sm.context;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(sm.masterVolumeNode);

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = TEXTURE_FREQ_CARRIER;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = TEXTURE_FREQ_MOD;
    const modGain = ctx.createGain();
    modGain.gain.value = 10;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    const carrierGain = ctx.createGain();
    carrierGain.gain.value = 0.5;
    carrier.connect(carrierGain);
    carrierGain.connect(out);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 3);
    noise.loop = true;
    const grindFilter = ctx.createBiquadFilter();
    grindFilter.type = 'bandpass';
    grindFilter.frequency.value = 150;
    grindFilter.Q.value = 4;
    const grindAm = ctx.createGain();
    grindAm.gain.value = 0.5;
    const grindLfoA = ctx.createOscillator();
    grindLfoA.frequency.value = 0.23;
    const grindLfoB = ctx.createOscillator();
    grindLfoB.frequency.value = 5.3;
    const grindDepthA = ctx.createGain();
    grindDepthA.gain.value = 0.3;
    const grindDepthB = ctx.createGain();
    grindDepthB.gain.value = 0.15;
    grindLfoA.connect(grindDepthA);
    grindLfoB.connect(grindDepthB);
    grindDepthA.connect(grindAm.gain);
    grindDepthB.connect(grindAm.gain);
    const grindGain = ctx.createGain();
    grindGain.gain.value = 0.7;
    noise.connect(grindFilter);
    grindFilter.connect(grindAm);
    grindAm.connect(grindGain);
    grindGain.connect(out);

    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.value = TEXTURE_FREQ_VOICE;
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 320;
    formant.Q.value = 5;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.11;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 90;
    sweep.connect(sweepDepth);
    sweepDepth.connect(formant.frequency);
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.45;
    voice.connect(formant);
    formant.connect(voiceGain);
    voiceGain.connect(out);

    const nodes = [carrier, mod, noise, grindLfoA, grindLfoB, voice, sweep];
    nodes.forEach((n) => n.start());
    texture = { ctx, out, modGain, grindFilter, nodes, startedAt: ctx.currentTime, fadeInSec: Math.max(0.1, fadeInMs / 1000) };
    this.setTextureLevel(0.2);
  },

  setTextureLevel(level, timeConstant = 0.3) {
    if (!texture) return;
    const { ctx, out, modGain, grindFilter } = texture;
    const t = ctx.currentTime;
    const l = Math.min(Math.max(0, level), 1.4);
    const fade = Math.min(1, (t - texture.startedAt) / texture.fadeInSec);
    const fadeCurve = fade * fade * (3 - 2 * fade);
    out.gain.setTargetAtTime(TEXTURE_BASE_GAIN * (0.15 + 0.85 * l) * SettingsManager.getSfx() * fadeCurve, t, timeConstant);
    modGain.gain.setTargetAtTime(10 + 34 * l, t, 0.5);
    grindFilter.frequency.setTargetAtTime(120 + 120 * l, t, 0.5);
  },

  stopTexture(fadeMs = 60) {
    if (!texture) return;
    const d = texture;
    texture = null;
    const t = d.ctx.currentTime;
    d.out.gain.cancelScheduledValues(t);
    d.out.gain.setTargetAtTime(0, t, Math.max(0.01, fadeMs / 3000));
    setTimeout(() => {
      d.nodes.forEach((o) => { try { o.stop(); } catch (e) { /* já parado */ } });
      try { d.out.disconnect(); } catch (e) { /* já solto */ }
    }, fadeMs + 250);
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
    this.stopTexture(50);
    this.cutQuake();
    extraBuses.forEach((bus) => {
      bus.gain.cancelScheduledValues(bus.context.currentTime);
      bus.gain.setTargetAtTime(0, bus.context.currentTime, 0.015);
    });
    extraBuses = [];
    if (secondQuakeBus) {
      const bus = secondQuakeBus;
      secondQuakeBus = null;
      bus.gain.cancelScheduledValues(bus.context.currentTime);
      bus.gain.setTargetAtTime(0, bus.context.currentTime, 0.015);
    }
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
