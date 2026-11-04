import { gameConfig, useMobileViewport } from './config/gameConfig.js';
import { installViewportSizing } from './systems/ViewportSizing.js';

installViewportSizing(useMobileViewport);
window.__nineLivesGame = new Phaser.Game(gameConfig);
