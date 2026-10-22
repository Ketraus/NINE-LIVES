import SettingsManager from './SettingsManager.js';

// Áudio sintetizado (WebAudio) do tremor de entrada do Minotauro — sem
// arquivos novos. O objetivo é som SUBTERRÂNEO de verdade: sub-grave que
// cai de frequência (o "chão afundando"), com harmônicos por saturação pra
// ser audível até em alto-falante pequeno, mais ruído grave de pedra
// rangendo. Tudo passa pelo masterVolumeNode (slider MASTER) e pelo slider
// SFX. Sem WebAudio (fallback HTML5) os métodos viram no-op; as camadas de
// arquivo de quem chama continuam tocando.
//
//   impact(scene, strength)  estrondo único (strength ~0.6 médio, 1+ forte)
//   startRumble/setRumbleLevel/stopRumble  ronco contínuo (nível 0..1.5)

let rumble = null;
const activeBuses = new Set(); // tudo que a cinemática toca, cortável de uma vez (silenceAll)

function track(bus, lifetimeS) {
  activeBuses.add(bus);
  setTimeout(() => activeBuses.delete(bus), (lifetimeS + 0.5) * 1000);
  return bus;
}

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

function saturationCurve(amount = 3) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

const MinotaurAudio = {
  impact(scene, strength = 1) {
    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t = ctx.currentTime;
    const vol = SettingsManager.getSfx();
    const decay = 1.1 + strength * 1.1;

    const bus = ctx.createGain();
    bus.gain.value = Math.min(0.95, 0.55 + strength * 0.3) * vol;
    bus.connect(sm.masterVolumeNode);
    track(bus, decay + 0.3);

    // sub-grave: o chão "afundando" (queda de frequência) + saturação pra
    // gerar harmônicos audíveis em caixinha
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(2.5 + strength);
    shaper.connect(bus);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(1, t + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    subGain.connect(shaper);
    [[64, 24], [128, 46]].forEach(([from, to], i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + 0.55);
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0.45;
      osc.connect(g);
      g.connect(subGain);
      osc.start(t);
      osc.stop(t + decay + 0.1);
    });

    // pedra rangendo: ruído grave que fecha (lowpass descendo)
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, decay + 0.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420 + strength * 260, t);
    lp.frequency.exponentialRampToValueAtTime(55, t + decay);
    lp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    noise.connect(lp);
    lp.connect(ng);
    ng.connect(bus);
    noise.start(t);
    noise.stop(t + decay + 0.2);

    // estalo seco no ataque (rocha quebrando)
    const crack = ctx.createBufferSource();
    crack.buffer = noiseBuffer(ctx, 0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.5 * Math.min(strength, 1.2), t + 0.005);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    crack.connect(bp);
    bp.connect(cg);
    cg.connect(bus);
    crack.start(t);
    crack.stop(t + 0.25);
  },

  // Respiração profunda, metálica e animalesca: inspira (ruído grave subindo)
  // e solta o ar rouco (mais forte, com ressonância metálica e um rosnado
  // grave por baixo). strength ~0.7 (1ª) a 1.1 (2ª); cycleS = duração total.
  breath(scene, strength = 1, cycleS = 2.8) {
    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t = ctx.currentTime;
    const vol = SettingsManager.getSfx();
    const inhaleEnd = cycleS * 0.4;
    const exhaleStart = cycleS * 0.5;

    const bus = ctx.createGain();
    bus.gain.value = Math.min(0.95, 0.7 * strength) * vol;
    bus.connect(sm.masterVolumeNode);
    track(bus, cycleS + 0.3);

    // envelope compartilhado: inspira baixo, solta alto
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.45, t + inhaleEnd);
    env.gain.exponentialRampToValueAtTime(0.12, t + exhaleStart);
    env.gain.exponentialRampToValueAtTime(1, t + exhaleStart + cycleS * 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + cycleS);
    // aspereza (rouquidão): modulação rápida de amplitude
    const rasp = ctx.createGain();
    rasp.gain.value = 0.78;
    const raspLfo = ctx.createOscillator();
    raspLfo.frequency.value = 27;
    const raspDepth = ctx.createGain();
    raspDepth.gain.value = 0.22;
    raspLfo.connect(raspDepth);
    raspDepth.connect(rasp.gain);
    raspLfo.start(t);
    raspLfo.stop(t + cycleS + 0.1);
    env.connect(rasp);
    rasp.connect(bus);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, cycleS + 0.2);

    // corpo do ar (grave, abafado, filtro sobe na inspiração e cai no soltar)
    const body = ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.Q.value = 1.6;
    body.frequency.setValueAtTime(180, t);
    body.frequency.exponentialRampToValueAtTime(520, t + inhaleEnd);
    body.frequency.exponentialRampToValueAtTime(260, t + exhaleStart + cycleS * 0.12);
    body.frequency.exponentialRampToValueAtTime(120, t + cycleS);
    noise.connect(body);
    body.connect(env);

    // metálico: ressonâncias estreitas, como respirar dentro de uma armadura
    [[1250, 0.16], [2350, 0.08]].forEach(([freq, amount]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 18;
      const g = ctx.createGain();
      g.gain.value = amount;
      noise.connect(bp);
      bp.connect(g);
      g.connect(env);
    });
    noise.start(t);
    noise.stop(t + cycleS + 0.2);

    // rosnado animal bem grave por baixo, com vibrato
    const growl = ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.setValueAtTime(48, t);
    growl.frequency.linearRampToValueAtTime(40, t + cycleS);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 4;
    vib.connect(vibDepth);
    vibDepth.connect(growl.frequency);
    const glp = ctx.createBiquadFilter();
    glp.type = 'lowpass';
    glp.frequency.value = 170;
    const gg = ctx.createGain();
    gg.gain.value = 0.5;
    growl.connect(glp);
    glp.connect(gg);
    gg.connect(env);
    growl.start(t);
    vib.start(t);
    growl.stop(t + cycleS + 0.1);
    vib.stop(t + cycleS + 0.1);
  },

  // Rugido brutal: três serras desafinadas descendo de agudo pra grave, com
  // vibrato e rosnado (AM rápido), saturadas, mais sopro de ar e um impacto
  // sub-grave por baixo. Dura ~durationS e é cortável por silenceAll.
  roar(scene, durationS = 1.8) {
    const sm = manager(scene);
    if (!sm) return;
    const ctx = sm.context;
    const t = ctx.currentTime;
    const vol = SettingsManager.getSfx();

    const bus = ctx.createGain();
    bus.gain.value = 0.9 * vol;
    bus.connect(sm.masterVolumeNode);
    track(bus, durationS + 0.3);

    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(7);
    shaper.connect(bus);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
    env.gain.setValueAtTime(0.9, t + durationS * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + durationS);
    const growlAm = ctx.createGain();
    growlAm.gain.value = 0.75;
    const am = ctx.createOscillator();
    am.frequency.value = 31;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.25;
    am.connect(amDepth);
    amDepth.connect(growlAm.gain);
    am.start(t);
    am.stop(t + durationS + 0.1);
    env.connect(growlAm);
    growlAm.connect(shaper);

    // "formante": filtro que abre no ataque (boca aberta) e fecha no fim
    const formant = ctx.createBiquadFilter();
    formant.type = 'lowpass';
    formant.Q.value = 3;
    formant.frequency.setValueAtTime(500, t);
    formant.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
    formant.frequency.exponentialRampToValueAtTime(900, t + durationS);
    formant.connect(env);

    const vib = ctx.createOscillator();
    vib.frequency.value = 11;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 7;
    vib.connect(vibDepth);
    vib.start(t);
    vib.stop(t + durationS + 0.1);
    [1, 1.018, 0.982].forEach((detune, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(95 * detune, t);
      osc.frequency.exponentialRampToValueAtTime(190 * detune, t + 0.18);
      osc.frequency.exponentialRampToValueAtTime(58 * detune, t + durationS);
      vibDepth.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.6 : 0.3;
      osc.connect(g);
      g.connect(formant);
      osc.start(t);
      osc.stop(t + durationS + 0.1);
    });

    // sopro de ar rouco por cima
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, durationS + 0.2);
    const nbp = ctx.createBiquadFilter();
    nbp.type = 'bandpass';
    nbp.frequency.value = 800;
    nbp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    noise.connect(nbp);
    nbp.connect(ng);
    ng.connect(env);
    noise.start(t);
    noise.stop(t + durationS + 0.2);

    this.impact(scene, 1.4);
  },

  // CORTE SECO: derruba em ~20 ms tudo que a cinemática sintetizou
  silenceAll(scene) {
    const sm = manager(scene);
    rumble = null;
    if (!sm) return;
    const t = sm.context.currentTime;
    activeBuses.forEach((bus) => {
      try {
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(0, t);
        setTimeout(() => { try { bus.disconnect(); } catch (e) { /* já solto */ } }, 120);
      } catch (e) { /* nó já descartado */ }
    });
    activeBuses.clear();
  },

  startRumble(scene, fadeInMs = 800) {
    const sm = manager(scene);
    if (!sm || rumble) return;
    const ctx = sm.context;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(sm.masterVolumeNode);
    activeBuses.add(out);

    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(2);
    shaper.connect(out);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 110;
    lp.Q.value = 2;
    lp.connect(shaper);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 3);
    noise.loop = true;
    noise.connect(lp);
    noise.start(t);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 38;
    const og = ctx.createGain();
    og.gain.value = 0.35;
    osc.connect(og);
    og.connect(lp);
    osc.start(t);

    // tremor lento no volume (o chão "respirando")
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(out.gain);
    lfo.start(t);

    rumble = { ctx, out, lp, nodes: [noise, osc, lfo], level: 0 };
    this.setRumbleLevel(0.3, fadeInMs);
  },

  setRumbleLevel(level, rampMs = 300) {
    if (!rumble) return;
    const { ctx, out, lp } = rumble;
    const t = ctx.currentTime;
    const l = Math.max(0, level);
    rumble.level = l;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(Math.min(0.9, 0.25 * l) * SettingsManager.getSfx(), t, Math.max(0.02, rampMs / 3000));
    lp.frequency.setTargetAtTime(80 + 90 * Math.min(l, 1.5), t, 0.2);
  },

  stopRumble(fadeMs = 600) {
    if (!rumble) return;
    const { ctx, out, nodes } = rumble;
    rumble = null;
    activeBuses.delete(out);
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(0, t, Math.max(0.02, fadeMs / 3000));
    setTimeout(() => {
      nodes.forEach((n) => { try { n.stop(); } catch (e) { /* já parado */ } });
      try { out.disconnect(); } catch (e) { /* já solto */ }
    }, fadeMs + 400);
  }
};

export default MinotaurAudio;
