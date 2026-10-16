import BootScene from '../scenes/BootScene.js';
import PreloadScene from '../scenes/PreloadScene.js';
import MainMenuScene from '../scenes/MainMenuScene.js';
import SettingsScene from '../scenes/SettingsScene.js';
import WeaponSelectScene from '../scenes/WeaponSelectScene.js';
import GameScene from '../scenes/GameScene.js';
import CrtWavePipeline from '../fx/CrtWavePipeline.js';
import WorldEndPipeline from '../fx/WorldEndPipeline.js';
import GhostTrailPipeline from '../fx/GhostTrailPipeline.js';
import ScanlinesPipeline from '../fx/ScanlinesPipeline.js';
import FlickerPipeline from '../fx/FlickerPipeline.js';
import BloomPipeline from '../fx/BloomPipeline.js';
import ChromaticAberrationPipeline from '../fx/ChromaticAberrationPipeline.js';
import StaticNoisePipeline from '../fx/StaticNoisePipeline.js';
import { BASE_WIDTH, BASE_HEIGHT } from './layout.js';

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
  disableVisibilityChange: true,
  pixelArt: false,
  render: {
    // aproveita telas HiDPI sem aumentar a escala lÃ³gica das cenas;
    // limita em 2x para nÃ£o multiplicar demais o custo das hordas.
    resolution: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
    roundPixels: false
  },
  // registra os pipelines custom (efeitos "retrô" do menu — ver src/fx/)
  pipeline: {
    CrtWave: CrtWavePipeline,
    GhostTrail: GhostTrailPipeline,
    Scanlines: ScanlinesPipeline,
    Flicker: FlickerPipeline,
    Bloom: BloomPipeline,
    ChromaticAberration: ChromaticAberrationPipeline,
    StaticNoise: StaticNoisePipeline,
    WorldEnd: WorldEndPipeline
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
