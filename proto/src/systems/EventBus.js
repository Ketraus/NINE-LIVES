
/**
 * Barramento de eventos global e único para toda a partida.
 * Evita que Player, Enemy, HUD e RunManager precisem se conhecer
 * diretamente. Ex: Enemy.die() emite 'enemy-died'; quem quiser reagir
 * (HUD, RunManager) apenas escuta.
 *
 * Eventos usados neste protótipo:
 *  - 'player-health-changed'  ({ current, max })
 *  - 'player-died'            ()
 *  - 'enemy-died'             ({ x, y, xpReward })
 *  - 'xp-changed'             ({ xp, xpToNext, level })
 *  - 'level-up'               ({ options: Upgrade[] })
 *  - 'run-restart'            ()
 */
class EventBus extends Phaser.Events.EventEmitter {}

export default new EventBus();
