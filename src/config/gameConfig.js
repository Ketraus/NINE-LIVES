import BootScene from '../scenes/BootScene.js';
import PreloadScene from '../scenes/PreloadScene.js';
import MainMenuScene from '../scenes/MainMenuScene.js';
import SettingsScene from '../scenes/SettingsScene.js';
import WeaponSelectScene from '../scenes/WeaponSelectScene.js';
import GameScene from '../scenes/GameScene.js';
import CrtWavePipeline from '../fx/CrtWavePipeline.js';
import GhostTrailPipeline from '../fx/GhostTrailPipeline.js';
import ScanlinesPipeline from '../fx/ScanlinesPipeline.js';
import FlickerPipeline from '../fx/FlickerPipeline.js';
import BloomPipeline from '../fx/BloomPipeline.js';
import ChromaticAberrationPipeline from '../fx/ChromaticAberrationPipeline.js';

const BASE_WIDTH = 704;
const BASE_HEIGHT = 512; // altura de referência: HUD e telas de carta são pensados pra caber nela

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Celular: em vez de cortar a tela (ENVELOP cortava vida/XP/escudo e o
let width = BASE_WIDTH;
if (isTouch) {
  const landscapeAspect = Math.max(window.innerWidth, window.innerHeight) / Math.min(window.innerWidth, window.innerHeight);
  width = Math.round(BASE_HEIGHT * Math.max(landscapeAspect, BASE_WIDTH / BASE_HEIGHT));
}

export const gameConfig = {
  type: Phaser.AUTO,
  parent
  : 'game-container',
  width,
  height: BASE_HEIGHT,
  backgroundColor: '#111318',
  pixelArt: true,
  // registra os pipelines custom (efeitos "retrô" do menu — ver src/fx/)
  pipeline: {
    CrtWave: CrtWavePipeline,
    GhostTrail: GhostTrailPipeline,
    Scanlines: ScanlinesPipeline,
    Flicker: FlickerPipeline,
    Bloom: BloomPipeline,
    ChromaticAberration: ChromaticAberrationPipeline
  },
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
  scene: [BootScene, PreloadScene, MainMenuScene, SettingsScene, WeaponSelectScene, GameScene]
};
