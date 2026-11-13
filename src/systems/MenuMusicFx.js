// Música do menu no Theme 2 (corrompido): a MESMA faixa (music_menu), só que
// tratada ao vivo — nenhum arquivo de áudio novo:
//   - mais profunda: um pouquinho mais grave e lenta (detune), reforço de graves
//     e um eco escuro e baixo ao fundo (dá espaço, sem encher);
//   - glitches raros: tape-slip (a faixa "escorrega" de tom e volta), stutter
//     (picotada rápida) e smear (queda + eco borrado).
//
// Os efeitos são ligados/desligados com transição suave (ao trocar de tema a
// música também vai ficando mais profunda / volta ao normal). Tudo se solta
// sozinho quando a faixa do menu para (ex.: início da run).
//
// Uso: MenuMusicFx.set(true|false, { rampMs }) na criação do menu/settings.
// `onGlitch` (opcional) é chamado a cada glitch pra o visual acompanhar.
//
// Só funciona com WebAudio (volumeNode); sem isso fica tudo como está.

import MusicManager from './MusicManager.js';

const MENU_KEY = 'music_menu';
const DEEP_DETUNE = -90; // cents: ~1 semitom mais grave (e ~5% mais lenta)
const ECHO_TIME = 0.42;
const ECHO_FEEDBACK = 0.36;
const ECHO_WET = 0.2;
const BASS_GAIN = 0.3;
const TICK_MS = 400;
const GLITCH_MIN_MS = 7000;
const GLITCH_MAX_MS = 15000;
const GLITCH_FIRST_DELAY_MS = 5000;

const rand = (a, b) => a + Math.random() * (b - a);

class MenuMusicFx {
  constructor() {
    this.want = false;
    this.sound = null; // faixa com o tratamento ligado
    this.nodes = null;
    this.onGlitch = null;
    this._timer = null;
    this._nextGlitchAt = 0;
    this._glitching = false;
    this._detune = 0;
    this._rampTimer = null;
    this._timeouts = [];
  }

  set(want, { rampMs = 1500 } = {}) {
    this.want = Boolean(want);
    this._rampMs = rampMs;
    this._ensureTimer();
    this._tick();
  }

  // ---------------------------------------------------------------
  _ensureTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _tick() {
    const cur = MusicManager.currentKey === MENU_KEY ? MusicManager.currentSound : null;

    // a faixa tratada não é mais a do menu (trocou/parou): solta tudo
    if (this.sound && this.sound !== cur) this._release(true);

    // outra música assumiu (ex.: jogo): não é mais assunto daqui
    if (!cur && MusicManager.currentKey && MusicManager.currentKey !== MENU_KEY) {
      this.want = false;
    }

    if (this.want && cur && !this.sound) this._attach(cur);

    if (!this.want && this.sound && !this._leaving) this._leave();

    if (this.want && this.sound && !this._glitching && Date.now() >= this._nextGlitchAt) {
      this._glitch();
      this._nextGlitchAt = Date.now() + rand(GLITCH_MIN_MS, GLITCH_MAX_MS);
    }

    if (!this.want && !this.sound) this._stopTimer();
  }

  // ---------------------------------------------------------------
  _attach(sound) {
    const ctx = sound.manager?.context;
    const dest = sound.manager?.destination;
    if (!ctx || !dest || !sound.volumeNode) return; // sem WebAudio: fica normal

    try {
      const now = ctx.currentTime;
      const ramp = Math.max(0.05, this._rampMs / 1000);

      // eco escuro (em paralelo: não mexe na ligação original da faixa)
      const delay = ctx.createDelay(1);
      delay.delayTime.value = ECHO_TIME;
      const fb = ctx.createGain();
      fb.gain.value = ECHO_FEEDBACK;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      const wet = ctx.createGain();
      wet.gain.setValueAtTime(0, now);
      wet.gain.linearRampToValueAtTime(ECHO_WET, now + ramp);
      sound.volumeNode.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(wet);
      wet.connect(dest);

      // reforço de graves (em paralelo)
      const bassLp = ctx.createBiquadFilter();
      bassLp.type = 'lowpass';
      bassLp.frequency.value = 170;
      const bass = ctx.createGain();
      bass.gain.setValueAtTime(0, now);
      bass.gain.linearRampToValueAtTime(BASS_GAIN, now + ramp);
      sound.volumeNode.connect(bassLp);
      bassLp.connect(bass);
      bass.connect(dest);

      this.nodes = { delay, fb, lp, wet, bassLp, bass, ctx };
      this.sound = sound;
      this._leaving = false;
      this._nextGlitchAt = Date.now() + GLITCH_FIRST_DELAY_MS + rand(0, 4000);
      this._rampDetune(DEEP_DETUNE, this._rampMs);
    } catch (e) {
      this._release(false);
    }
  }

  // tema voltou ao normal: tudo some devagar e depois solta os nós
  _leave() {
    this._leaving = true;
    const n = this.nodes;
    const sound = this.sound;
    if (!n || !sound) return;
    try {
      const now = n.ctx.currentTime;
      const ramp = Math.max(0.05, this._rampMs / 1000);
      n.wet.gain.cancelScheduledValues(now);
      n.wet.gain.setValueAtTime(n.wet.gain.value, now);
      n.wet.gain.linearRampToValueAtTime(0, now + ramp);
      n.bass.gain.cancelScheduledValues(now);
      n.bass.gain.setValueAtTime(n.bass.gain.value, now);
      n.bass.gain.linearRampToValueAtTime(0, now + ramp);
    } catch (e) {
      /* segue */
    }
    this._rampDetune(0, this._rampMs, () => {
      if (this.sound === sound && !this.want) this._release(false);
    });
  }

  _release(soundGone) {
    this._clearTimeouts();
    if (this._rampTimer) clearInterval(this._rampTimer);
    this._rampTimer = null;
    const n = this.nodes;
    if (n) {
      const nodes = [n.delay, n.fb, n.lp, n.wet, n.bassLp, n.bass];
      const drop = () => nodes.forEach((x) => { try { x.disconnect(); } catch (e) { /* ok */ } });
      // se a faixa ainda toca (fade de saída), deixa a cauda do eco sumir
      if (soundGone) setTimeout(drop, 900);
      else drop();
    }
    try {
      if (this.sound && !soundGone) this.sound.setDetune(0);
    } catch (e) {
      /* ok */
    }
    this.nodes = null;
    this.sound = null;
    this._leaving = false;
    this._glitching = false;
    this._detune = 0;
  }

  _clearTimeouts() {
    this._timeouts.forEach((t) => clearTimeout(t));
    this._timeouts = [];
  }

  _later(ms, fn) {
    const t = setTimeout(() => {
      this._timeouts = this._timeouts.filter((x) => x !== t);
      fn();
    }, ms);
    this._timeouts.push(t);
  }

  // ---------------------------------------------------------------
  _setDetune(v) {
    this._detune = v;
    try {
      this.sound?.setDetune(v);
    } catch (e) {
      /* ok */
    }
  }

  _rampDetune(to, ms, done) {
    if (this._rampTimer) clearInterval(this._rampTimer);
    const from = this._detune;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    this._rampTimer = setInterval(() => {
      i++;
      const k = Math.min(1, i / steps);
      this._setDetune(from + (to - from) * (k * k * (3 - 2 * k)));
      if (k >= 1) {
        clearInterval(this._rampTimer);
        this._rampTimer = null;
        done?.();
      }
    }, 50);
  }

  // ---------------------------------------------------------------
  // glitches
  // ---------------------------------------------------------------
  _glitch() {
    const sound = this.sound;
    if (!sound || this._leaving || this._rampTimer) return; // não briga com a entrada do efeito
    this._glitching = true;
    this.onGlitch?.();
    const r = Math.random();
    if (r < 0.4) this._tapeSlip();
    else if (r < 0.75) this._stutter();
    else this._smear();
  }

  _end() {
    this._glitching = false;
  }

  // a faixa escorrega de tom (fita arrastando) e volta
  _tapeSlip() {
    const base = DEEP_DETUNE;
    const dip = base - rand(450, 800);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      this._later(i * 14, () => this._setDetune(base + (dip - base) * (i / steps)));
    }
    this._later(steps * 14 + 60, () => {
      for (let i = 1; i <= 10; i++) {
        this._later(i * 16, () => {
          this._setDetune(dip + (base - dip) * (i / 10));
          if (i === 10) this._end();
        });
      }
    });
  }

  // picotada: o volume liga/desliga muito rápido
  _stutter() {
    const sound = this.sound;
    const v0 = sound.volume;
    const pulses = Math.round(rand(3, 5));
    let t = 0;
    for (let i = 0; i < pulses; i++) {
      this._later(t, () => { sound.volume = v0 * 0.04; });
      t += rand(24, 34);
      this._later(t, () => { sound.volume = v0; });
      t += rand(36, 52);
    }
    this._later(t + 10, () => {
      sound.volume = v0;
      this._end();
    });
  }

  // queda de volume com o eco "estourando" e voltando
  _smear() {
    const sound = this.sound;
    const n = this.nodes;
    const v0 = sound.volume;
    sound.volume = v0 * 0.25;
    this._setDetune(DEEP_DETUNE - 180);
    try {
      const now = n.ctx.currentTime;
      n.wet.gain.cancelScheduledValues(now);
      n.wet.gain.setValueAtTime(n.wet.gain.value, now);
      n.wet.gain.linearRampToValueAtTime(0.75, now + 0.05);
      n.wet.gain.linearRampToValueAtTime(ECHO_WET, now + 0.7);
    } catch (e) {
      /* ok */
    }
    this._later(110, () => {
      sound.volume = v0;
      this._setDetune(DEEP_DETUNE);
    });
    this._later(700, () => this._end());
  }
}

export default new MenuMusicFx();
