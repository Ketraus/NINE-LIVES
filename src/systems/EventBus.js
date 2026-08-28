
/**
 * Barramento de eventos global e único para toda a partida.
 * Evita que Player, Enemy, HUD e RunManager precisem se conhecer
 * diretamente. Ex: Enemy.die() emite 'enemy-died'; quem quiser reagir
 * (HUD, RunManager) apenas escuta.
 *
 * Eventos usados neste protótipo:
 *  - 'player-health-changed'  ({ current, max })
 *  - 'player-died'            ()
 *  - 'player-won'             () — run sobreviveu até RUN_WIN_SECONDS (10:00, ver GameScene._triggerWin)
 *  - 'enemy-died'             ({ x, y, xpReward })
 *  - 'xp-changed'             ({ xp, xpToNext, level })
 *  - 'run-time-changed'       ({ seconds }) — tempo decorrido da run, emitido a cada segundo (ver GameScene._updateRunTimer)
 *  - 'level-up'               ({ options: Upgrade[] })
 *  - 'evolution-ready'        ({ evolution }) — carta base completou as cópias e evoluiu
 *  - 'ability-unlocked'       ({ abilityId, def }) — carta exclusiva escolhida
 *  - 'run-restart'            ()
 *  - 'pause-opened'           () — menu de pausa aberto (ver src/ui/PauseUI.js)
 *  - 'pause-closed'           () — menu de pausa fechado
 */
class EventBus extends Phaser.Events.EventEmitter {}

export default new EventBus();
