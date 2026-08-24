import BootScene from '../scenes/BootScene.js';
import PreloadScene from '../scenes/PreloadScene.js';
import MainMenuScene from '../scenes/MainMenuScene.js';
import WeaponSelectScene from '../scenes/WeaponSelectScene.js';
import GameScene from '../scenes/GameScene.js';

const BASE_WIDTH = 704;
const BASE_HEIGHT = 512; // altura de referência: HUD e telas de carta são pensados pra caber nela

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Celular: em vez de cortar a tela (ENVELOP cortava vida/XP/escudo e o
// layout de cartas, que ficam perto das bordas), a largura lógica do
// jogo passa a acompanhar a proporção real da tela — mantendo a MESMA
// altura de sempre (512), só fica mais larga. Com isso FIT preenche a
// tela toda sem cortar nada, e HUD.js/LevelUpUI.js (que já leem
// scene.scale.width/height dinamicamente) se ajustam sozinhos, sem
// precisar mexer neles. Math.max(...) só garante que nunca fica MENOR
// que o design original, mesmo se o navegador reportar algo estranho.
// innerWidth/innerHeight podem vir em retrato (antes do jogador girar o
// celular) — Math.max/min abaixo sempre lê a proporção como se already
// fosse paisagem, não importa a orientação atual no load.
let width = BASE_WIDTH;
if (isTouch) {
  const landscapeAspect = Math.max(window.innerWidth, window.innerHeight) / Math.min(window.innerWidth, window.innerHeight);
  width = Math.round(BASE_HEIGHT * Math.max(landscapeAspect, BASE_WIDTH / BASE_HEIGHT));
}

export const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width,
  height: BASE_HEIGHT,
  backgroundColor: '#111318',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, PreloadScene, MainMenuScene, WeaponSelectScene, GameScene]
};
