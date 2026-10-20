import MqttClient from './MqttClient.js';
import { LOBBY_TOPIC_PREFIX, ROOM_ADVERT_TTL_MS, MAX_ROOM_PLAYERS, getBrokerUrl } from './roomConfig.js';

// Lista de salas abertas (tela "ENTRAR EM SALA"). Só escuta os batimentos que
// o Host de cada sala publica; não guarda nada no broker.
export default class RoomDirectory {
  constructor(onChange) {
    this.onChange = onChange;
    this.rooms = new Map();
    this.status = 'connecting'; // 'connecting' | 'online' | 'error'
    this._signature = '';
    this.mqtt = null;
    this.sweepTimer = null;
  }

  start() {
    try {
      this.mqtt = new MqttClient(getBrokerUrl(), {
        clientId: `nldir${Math.random().toString(36).slice(2, 10)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2000
      });
    } catch (error) {
      console.error('[Salas]', error.message);
      this.status = 'error';
      this._emit();
      return;
    }

    this.onConnect = () => {
      this.status = 'online';
      this.mqtt.subscribe(`${LOBBY_TOPIC_PREFIX}/+`).catch((error) => {
        console.error('[Salas] Falha ao assinar a lista de salas:', error);
        this.status = 'error';
        this._emit();
      });
      this._emit();
    };
    this.onOffline = () => {
      if (this.status === 'online') this.status = 'connecting';
      this._emit();
    };
    this.onError = (error) => {
      console.error('[Salas] Erro MQTT:', error?.message);
      if (!this.mqtt?.connected) this.status = 'error';
      this._emit();
    };
    this.onMessage = (topic, payload) => this._onMessage(topic, payload);
    this.mqtt.on('connect', this.onConnect);
    this.mqtt.on('close', this.onOffline);
    this.mqtt.on('offline', this.onOffline);
    this.mqtt.on('error', this.onError);
    this.mqtt.on('message', this.onMessage);
    this.sweepTimer = setInterval(() => this._sweep(), 1000);
  }

  stop() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    if (this.mqtt) {
      this.mqtt.off('connect', this.onConnect);
      this.mqtt.off('close', this.onOffline);
      this.mqtt.off('offline', this.onOffline);
      this.mqtt.off('error', this.onError);
      this.mqtt.off('message', this.onMessage);
      this.mqtt.end();
      this.mqtt = null;
    }
    this.onChange = null;
  }

  // salas com vaga primeiro, depois por código
  getRooms() {
    return [...this.rooms.values()].sort((a, b) => {
      const fullA = a.players >= a.max ? 1 : 0;
      const fullB = b.players >= b.max ? 1 : 0;
      return fullA - fullB || a.room.localeCompare(b.room);
    });
  }

  _onMessage(topic, payload) {
    if (!topic.startsWith(`${LOBBY_TOPIC_PREFIX}/`)) return;
    const topicRoom = decodeURIComponent(topic.slice(LOBBY_TOPIC_PREFIX.length + 1));
    try {
      const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const message = JSON.parse(text);
      if (!message || message.room !== topicRoom || typeof message.room !== 'string' ||
        message.room.length === 0 || message.room.length > 16) return;
      if (message.closed === true) {
        this.rooms.delete(topicRoom);
        this._emit();
        return;
      }
      const max = Number.isInteger(message.max) ? Math.min(MAX_ROOM_PLAYERS, Math.max(1, message.max)) : MAX_ROOM_PLAYERS;
      const players = Number.isInteger(message.players) ? Math.min(max, Math.max(0, message.players)) : 0;
      this.rooms.set(topicRoom, {
        room: topicRoom,
        priv: message.priv === true,
        pw: typeof message.pw === 'string' ? message.pw.slice(0, 24) : null,
        players,
        max,
        phase: message.phase === 'playing' ? 'playing' : 'waiting',
        lastSeenAt: Date.now()
      });
      this._emit();
    } catch (error) {
      /* mensagem inválida: ignora */
    }
  }

  _sweep() {
    const now = Date.now();
    let changed = false;
    this.rooms.forEach((room, id) => {
      if (now - room.lastSeenAt > ROOM_ADVERT_TTL_MS) {
        this.rooms.delete(id);
        changed = true;
      }
    });
    if (changed) this._emit();
  }

  // só avisa a UI quando algo visível mudou (batimentos iguais não redesenham)
  _emit() {
    if (!this.onChange) return;
    const signature = `${this.status}|${this.getRooms()
      .map((r) => `${r.room}:${r.players}/${r.max}:${r.phase}:${r.priv ? 1 : 0}`).join(',')}`;
    if (signature === this._signature) return;
    this._signature = signature;
    this.onChange();
  }
}
