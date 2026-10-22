import MinotaurAudio from './MinotaurAudio.js';
import MusicManager from './MusicManager.js';
import VictoryAudio from './VictoryAudio.js';
import credits from '../../data/credits.js';

// Final da versão SNCT (data/gameVersion.js = 'snct'): a run acaba ANTES do
// Minotauro nascer. Roda logo depois do tremor (fx/MinotaurTremorFx.js), na
// ordem do roteiro:
//
//   5. PRESENÇA   a tela escurece devagar; entra uma respiração profunda,
//                 metálica e animalesca (duas, a 2ª maior), a câmera sente
//                 cada expiração. Não é evento do cenário: é uma criatura.
//   6. RUGIDO     silêncio curto, então o rugido explode: clarão branco e
//                 tremor violentíssimo de câmera.
//   7. CORTE      CORTE SECO: preto, todo o áudio morre no mesmo instante,
//                 silêncio e a mensagem de encerramento (CreditsScene em
//                 modo cartões, data/credits.js -> snctBetaEnding).

const HUD_FADE_MS = 1200;
const MUSIC_FADE_MS = 900;
const DARK_ALPHA_MAX = 0.62;
const DARK_RAMP_MS = 6000;

const BREATH1_AT_MS = 500;
const BREATH1_S = 2.8;
const BREATH2_AT_MS = 3400;
const BREATH2_S = 3.0;
const SILENCE_AT_MS = 6500; // ronco/tremor do chão morre: respiro de silêncio
const ROAR_AT_MS = 7300;
const ROAR_S = 1.9;
const ROAR_SHAKE = 0.075;
const CUT_AT_MS = ROAR_AT_MS + 1500; // corta NO MEIO do rugido (corte seco)
const BLACK_SILENCE_MS = 1500;

export function playSnctEnding(scene, hooks = {}) {
  if (scene.snctEndingStarted) return;
  scene.snctEndingStarted = true;

  const aborted = () => !scene.sys?.isActive() || scene.isGameOver;
  const after = (ms, fn) => scene.time.delayedCall(ms, () => { if (!aborted()) fn(); });
  const cam = scene.cameras.main;

  // HUD some, pausa travada, música some de vez
  scene.hud?.fadeOutForVictory(HUD_FADE_MS);
  scene.pauseUI?.lockForVictory(HUD_FADE_MS);
  MusicManager.fadeOutAll(scene, MUSIC_FADE_MS);

  // escurecimento lento (vai pulsando junto da respiração)
  const dark = scene.add
    .rectangle(cam.width / 2, cam.height / 2, cam.width * 3, cam.height * 3, 0x000000, 0)
    .setScrollFactor(0)
    .setDepth(1000);
  scene.tweens.add({ targets: dark, fillAlpha: DARK_ALPHA_MAX, duration: DARK_RAMP_MS, ease: 'Sine.easeIn' });

  const breathe = (strength, cycleS) => {
    MinotaurAudio.breath(scene, strength, cycleS);
    if (scene.cache.audio.exists('sfx_minotaur_breath')) {
      scene.sound.play('sfx_minotaur_breath', { volume: 0.7 * strength, rate: 0.7 });
    }
    // expira: o ar "empurra" a câmera e o breu aperta por um instante
    after(cycleS * 1000 * 0.5, () => {
      cam.shake(cycleS * 1000 * 0.4, 0.004 * strength, true);
      scene.tweens.add({
        targets: dark, fillAlpha: Math.min(0.9, dark.fillAlpha + 0.12), duration: 260, yoyo: true, ease: 'Sine.easeOut'
      });
      MinotaurAudio.impact(scene, 0.35 * strength); // baque grave junto do bafo: peso, algo vivo
    });
  };

  after(BREATH1_AT_MS, () => breathe(0.75, BREATH1_S));
  after(BREATH2_AT_MS, () => breathe(1.1, BREATH2_S));

  // silêncio antes do rugido: tudo que ainda rangia (ronco, tremor) para
  after(SILENCE_AT_MS, () => {
    MinotaurAudio.stopRumble(250);
    cam.resetFX();
  });

  // RUGIDO
  after(ROAR_AT_MS, () => {
    scene.physics.world.pause();
    scene.tweens.killTweensOf(dark);
    dark.setFillStyle(0x000000, 0.35);
    cam.flash(160, 255, 255, 255);
    cam.shake(1500, ROAR_SHAKE, true);
    MinotaurAudio.roar(scene, ROAR_S);
    scene.sound.play('sfx_minotaur_cleave_roar', { volume: 1, rate: 0.8 });
    scene.sound.play('sfx_cyberus_explosion', { volume: 0.9, rate: 0.38 });
    // clarões secos durante o rugido
    [350, 750].forEach((ms) => after(ms, () => cam.flash(90, 255, 255, 255)));
  });

  // CORTE SECO
  after(CUT_AT_MS, () => {
    cam.resetFX();
    dark.setFillStyle(0x000000, 1);
    scene.hud?.cutToBlack();
    scene.sound.stopAll();
    MinotaurAudio.silenceAll(scene);
    VictoryAudio.silenceAll(scene);
    try { hooks.onCut?.(); } catch (e) { /* tremor já destruído */ }
    scene.time.delayedCall(BLACK_SILENCE_MS, () => {
      if (!scene.sys?.isActive()) return;
      scene.scene.start('CreditsScene', { cards: credits.snctBetaEnding });
    });
  });
}

export default playSnctEnding;
