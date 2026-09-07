
// Barramento de eventos global e único para toda a partida.
class EventBus extends Phaser.Events.EventEmitter {}

export default new EventBus();
