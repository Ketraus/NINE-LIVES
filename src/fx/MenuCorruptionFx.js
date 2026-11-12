// Menu principal CORROMPIDO — só aparece depois que o jogador terminou o jogo
// (ver systems/GameProgress.js). A energia do Leviatã chegou até o fundo.
//
// O fundo corrompido é ARTE (assets/ui/menu_bg_corrupted.jpg): a mesma cidade,
// a mesma composição e o mesmo pixel art escuro do fundo normal, só que
// tomada por energia roxa — feixes saindo de trás dos prédios, manchas de
// corrupção nas fachadas, janelas infectadas, névoa violeta no horizonte.
// Nada de efeito desenhado por cima da arte.
//
// A única parte animada é uma segunda imagem (menu_bg_corrupted_glow.png) com
// SÓ as partes que brilham (feixes, manchas, janelas), somada por cima com
// opacidade que respira devagar — a energia pulsa sem mudar o desenho.
// `level` (0..1) é o quanto do fundo corrompido aparece: a transição "a
// energia chegou" (reveal()) faz a arte nova surgir sobre a original.

import SettingsManager from '../systems/SettingsManager.js';

const clamp01 = (v) => Phaser.Math.Clamp(v, 0, 1);

// ruído suave e irregular (soma de senos lentos) -> 0..1
export function softNoise(t) {
  return 0.5 + 0.5 * (Math.sin(t * 1.7) * 0.5 + Math.sin(t * 2.9 + 1.3) * 0.3 + Math.sin(t * 5.1 + 4) * 0.2);
}

export function mixColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export default class MenuCorruptionFx {
  // `bg` = a imagem do fundo normal (a arte nova copia posição/escala dela)
  constructor(scene, bg, { level = 1 } = {}) {
    this.scene = scene;
    this.level = level;
    this._surge = 0; // brilho extra (reveal / drone absorvido)
    this._calm = SettingsManager.getReducedMotion();
    this._lowFlashes = SettingsManager.getReducedFlashes();

    this.art = scene.add
      .image(bg.x, bg.y, 'menu_bg_corrupted')
      .setScale(bg.scaleX)
      .setAlpha(level);
    this.glow = scene.add
      .image(bg.x, bg.y, 'menu_bg_corrupted_glow')
      .setScale(bg.scaleX)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.layers = [this.art, this.glow]; // pra MainMenuScene inserir na ordem
  }

  // Transição "a energia chegou até aqui": o menu começa normal, a câmera
  // sente um golpe grave e a arte corrompida toma o fundo aos poucos.
  reveal() {
    this.level = 0;
    this.art.setAlpha(0);
    const scene = this.scene;
    scene.time.delayedCall(1500, () => {
      if (!scene.sys?.isActive()) return;
      this._surge = 1.3;
      scene.cameras.main.shake(1100, 0.0035, true);
      try {
        if (scene.cache.audio.exists('sfx_cyberus_explosion')) {
          scene.sound.play('sfx_cyberus_explosion', { volume: 0.45, rate: 0.35 });
        }
      } catch (e) {
        /* sem áudio: segue sem som */
      }
      scene.tweens.add({ targets: this, level: 1, duration: 5200, ease: 'Sine.easeInOut' });
    });
  }

  // um drone foi absorvido pela torre: a energia dá um pulso
  feed() {
    this._surge = Math.min(1.4, this._surge + 0.4);
  }

  update(time, delta, bg) {
    const L = clamp01(this.level);
    const dt = Math.min(delta, 50) / 1000;
    this._surge = Math.max(0, this._surge - dt / 2.2);

    // acompanham zoom/parallax do fundo
    for (const img of this.layers) img.setPosition(bg.x, bg.y).setScale(bg.scaleX);
    this.art.setAlpha(L);

    // a energia respira devagar (sem estrobo)
    const t = time / 1000;
    const calm = this._calm ? 0.5 : 1;
    const pulse = 0.14 + 0.2 * softNoise(t * 0.8) * calm + 0.35 * this._surge * (this._lowFlashes ? 0.4 : 1);
    this.glow.setAlpha(L * L * pulse);
  }
}
