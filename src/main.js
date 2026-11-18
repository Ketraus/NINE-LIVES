import { gameConfig, useMobileViewport } from './config/gameConfig.js';
import { installViewportSizing } from './systems/ViewportSizing.js';
import FeiraCredits from './systems/FeiraCredits.js';

installViewportSizing(useMobileViewport);
window.__nineLivesGame = new Phaser.Game(gameConfig);
FeiraCredits.init();
