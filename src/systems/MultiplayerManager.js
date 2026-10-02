import MqttClient from './MqttClient.js';
import { BASE_VISUAL_SCALE } from '../entities/Player.js';

const POSITION_INTERVAL_MS = 100;
const PLAYER_TIMEOUT_MS = 5000;
const DEFAULT_BROKER_URL = 'wss://ninelives.feira-de-jogos.dev.br/mqtt';
const SPRITE_ANIMATIONS = {
  katana: { idle: 'player-katana-idle', walk: 'player-katana-walk' },
  fists: { idle: 'player-paws-idle', walk: 'player-paws-walk' },
  default: { idle: 'player-idle', walk: 'player-walk' }
};

function createPlayerId() {
  return `nl${Math.random().toString(36).slice(2, 12)}`;
}

export default class MultiplayerManager {
  constructor(scene, player, roomId = null) {
    this.scene = scene;
    this.player = player;
    this.remotePlayers = new Map();
    this.lastSentAt = 0;

    const params = new URLSearchParams(window.location.search);
    const room = roomId || params.get('room');
    const brokerUrl = params.get('mqttUrl') || (room ? DEFAULT_BROKER_URL : null);
    if (!brokerUrl) return;

    this.playerId = createPlayerId();
    this.room = encodeURIComponent(room || 'test');
    this.topicPrefix = `nine-lives/${this.room}/players`;
    this.positionTopic = `${this.topicPrefix}/${this.playerId}/position`;

    try {
      this.mqtt = new MqttClient(brokerUrl, {
        clientId: this.playerId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 1000
      });
    } catch (error) {
      console.error('[Multiplayer]', error.message);
      return;
    }

    this.onConnect = () => {
      this.mqtt.subscribe(`${this.topicPrefix}/+/position`).catch((error) => {
        console.error('[Multiplayer] Falha ao assinar tópico:', error);
      });
    };
    this.onMessage = (topic, payload) => this._onMessage(topic, payload);
    this.onError = (error) => console.error('[Multiplayer] Erro MQTT:', error.message);
    this.mqtt.on('connect', this.onConnect);
    this.mqtt.on('message', this.onMessage);
    this.mqtt.on('error', this.onError);
  }

  update(_time, delta) {
    const now = this.scene.time.now;
    if (this.mqtt?.connected && now - this.lastSentAt >= POSITION_INTERVAL_MS) {
      this.lastSentAt = now;
      this.mqtt.publish(this.positionTopic, {
        id: this.playerId,
        x: this.player.x,
        y: this.player.y,
        flipX: this.player.flipX,
        moving: !this.scene.isPaused && !this.scene.isGameOver &&
          this.player.body.velocity.lengthSq() > 0,
        weaponId: this.player.runState.weaponId,
        hp: this.player.healthSystem.current,
        maxHp: this.player.healthSystem.maxHp,
        level: this.player.runState.level
      });
    }

    this.remotePlayers.forEach((remote, id) => {
      if (now - remote.lastSeenAt > PLAYER_TIMEOUT_MS) {
        remote.sprite.destroy();
        this.remotePlayers.delete(id);
        return;
      }
      const blend = Math.min(1, delta / POSITION_INTERVAL_MS);
      remote.sprite.x = Phaser.Math.Linear(remote.sprite.x, remote.targetX, blend);
      remote.sprite.y = Phaser.Math.Linear(remote.sprite.y, remote.targetY, blend);
      this._drawRemoteStatus(remote);
    });
  }

  _drawRemoteStatus(remote) {
    const { sprite, healthBar, levelLabel, hp, maxHp, level } = remote;
    const barWidth = 38;
    const barHeight = 4;
    const barY = sprite.y - sprite.displayHeight / 2 - 8;
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);

    levelLabel.setPosition(sprite.x, barY - 5);
    const levelText = `LV ${level}`;
    if (levelLabel.text !== levelText) levelLabel.setText(levelText);
    healthBar.setPosition(sprite.x, barY);
    if (remote.displayedHp === hp && remote.displayedMaxHp === maxHp) return;

    healthBar.clear();
    healthBar.fillStyle(0x101418, 0.9).fillRect(-barWidth / 2, 0, barWidth, barHeight);
    healthBar.fillStyle(ratio > 0.3 ? 0x80e35d : 0xf05b62, 1)
      .fillRect(-barWidth / 2, 0, barWidth * ratio, barHeight);
    remote.displayedHp = hp;
    remote.displayedMaxHp = maxHp;
  }

  _onMessage(topic, payload) {
    if (!topic.startsWith(`${this.topicPrefix}/`) || !topic.endsWith('/position')) return;
    const playerId = topic.slice(`${this.topicPrefix}/`.length).split('/')[0];
    if (!playerId || playerId === this.playerId) return;

    try {
      const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const state = JSON.parse(text);
      if (state.id !== playerId || !Number.isFinite(state.x) || !Number.isFinite(state.y)) return;
      const maxHp = Number.isFinite(state.maxHp) && state.maxHp > 0 ? state.maxHp : 100;
      const hp = Number.isFinite(state.hp) ? Phaser.Math.Clamp(state.hp, 0, maxHp) : maxHp;
      const level = Number.isFinite(state.level) ? Math.max(1, Math.floor(state.level)) : 1;

      let remote = this.remotePlayers.get(playerId);
      if (!remote) {
        const spriteSet = SPRITE_ANIMATIONS[state.weaponId] || SPRITE_ANIMATIONS.default;
        const sprite = this.scene.add.sprite(state.x, state.y, 'player_idle')
          .setScale(BASE_VISUAL_SCALE)
          .setDepth(10);
        const healthBar = this.scene.add.graphics().setDepth(11);
        const levelLabel = this.scene.add.text(state.x, state.y, '', {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '6px',
          color: '#e8f6ff',
          stroke: '#101418',
          strokeThickness: 2
        }).setOrigin(0.5).setDepth(11);
        remote = {
          sprite,
          spriteSet,
          targetX: state.x,
          targetY: state.y,
          hp,
          maxHp,
          level,
          healthBar,
          levelLabel,
          lastSeenAt: this.scene.time.now
        };
        this.remotePlayers.set(playerId, remote);
      }

      remote.targetX = state.x;
      remote.targetY = state.y;
      remote.hp = hp;
      remote.maxHp = maxHp;
      remote.level = level;
      remote.lastSeenAt = this.scene.time.now;
      remote.sprite.setFlipX(Boolean(state.flipX));
      const animation = state.moving ? remote.spriteSet.walk : remote.spriteSet.idle;
      if (remote.sprite.anims.currentAnim?.key !== animation) remote.sprite.play(animation);
    } catch (error) {
      console.warn('[Multiplayer] Mensagem inválida ignorada:', error.message);
    }
  }

  destroy() {
    if (this.mqtt) {
      this.mqtt.off('connect', this.onConnect);
      this.mqtt.off('message', this.onMessage);
      this.mqtt.off('error', this.onError);
      this.mqtt.end();
    }
    this.remotePlayers.forEach(({ sprite }) => sprite.destroy());
    this.remotePlayers.forEach(({ healthBar, levelLabel }) => {
      healthBar.destroy();
      levelLabel.destroy();
    });
    this.remotePlayers.clear();
  }
}