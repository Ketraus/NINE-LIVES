import { gameConfig } from './config/gameConfig.js';
import { installViewportSizing } from './systems/ViewportSizing.js';

installViewportSizing();
window.__nineLivesGame = new Phaser.Game(gameConfig);
