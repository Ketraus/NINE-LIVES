import MqttClient from './MqttClient.js';
import { BASE_VISUAL_SCALE } from '../entities/Player.js';
import { ensureBulletTexture } from '../weapons/RangedWeapon.js';

const POSITION_INTERVAL_MS = 100;
const ATTACK_MIN_INTERVAL_MS = 60;
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
  constructor(scene, player, roomId = null, isRoomHost = false) {
    this.scene = scene;
    this.player = player;
    this.remotePlayers = new Map();
    this.lastSentAt = 0;
    this.lastAttackSentAt = -Infinity;
    this.attackSequence = 0;
    this.isRoomHost = Boolean(isRoomHost);
    this.hostPlayerId = null;
    this.hostRunTimeMs = null;
    this.hostRunTimeReceivedAt = 0;
    this.hostRunPaused = false;
    this.pauseRequested = false;
    this.pauseApplied = false;
    this.levelUpQueue = [];
    this.levelUpActive = false;
    this.levelUpRound = 0;
    this.levelUpPhase = 'idle';
    this.levelUpTurnPlayerId = null;
    this.levelUpTurnOrder = [];
    this.levelUpTurnIndex = 0;
    this.levelUpChoices = [];
    this.levelUpChoiceRound = 0;
    this.levelUpChoiceId = null;

    const params = new URLSearchParams(window.location.search);
    const room = roomId || params.get('room');
    this.isMultiplayer = Boolean(room);
    const brokerUrl = params.get('mqttUrl') || (room ? DEFAULT_BROKER_URL : null);
    if (!brokerUrl) return;

    this.playerId = createPlayerId();
    if (this.isRoomHost) this.hostPlayerId = this.playerId;
    this.room = encodeURIComponent(room || 'test');
    this.topicPrefix = `nine-lives/${this.room}/players`;
    this.positionTopic = `${this.topicPrefix}/${this.playerId}/position`;
    this.attackTopic = `${this.topicPrefix}/${this.playerId}/attack`;

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
      Promise.all([
        this.mqtt.subscribe(`${this.topicPrefix}/+/position`),
        this.mqtt.subscribe(`${this.topicPrefix}/+/attack`)
      ]).catch((error) => {
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
    const now = Date.now();
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
        level: this.player.runState.level,
        pauseRequested: this.pauseRequested,
        isHost: this.isRoomHost,
        runTimeMs: this.isRoomHost ? (this.scene.spawnDirector?.getElapsedMs() ?? 0) : undefined,
        runPaused: this.isRoomHost && this.scene.isPaused,
        levelUpPendingCount: this._getLocalLevelUpCount(),
        levelUpRound: this.isRoomHost ? this.levelUpRound : undefined,
        levelUpPhase: this.isRoomHost ? this.levelUpPhase : undefined,
        levelUpTurnPlayerId: this.isRoomHost ? this.levelUpTurnPlayerId : undefined,
        levelUpChoices: this.isRoomHost ? this.levelUpChoices : undefined,
        levelUpChoiceRound: this.levelUpChoiceRound,
        levelUpChoiceId: this.levelUpChoiceId
      });
    }

    this.remotePlayers.forEach((remote, id) => {
      if (now - remote.lastSeenAt > PLAYER_TIMEOUT_MS) {
        this._destroyRemote(remote);
        this.remotePlayers.delete(id);
        return;
      }
      const blend = Math.min(1, delta / POSITION_INTERVAL_MS);
      remote.sprite.x = Phaser.Math.Linear(remote.sprite.x, remote.targetX, blend);
      remote.sprite.y = Phaser.Math.Linear(remote.sprite.y, remote.targetY, blend);
      this._drawRemoteStatus(remote);
    });
    this._syncPauseVote();
    this._syncLevelUp();
  }

  queueLevelUp(options) {
    if (!this.isMultiplayer || !this.mqtt) return false;
    this.levelUpQueue.push(options);
    this._syncLevelUp();
    return true;
  }

  getSelectedUpgradeIds() {
    return this.levelUpChoices.map((choice) => choice.upgradeId);
  }

  completeLevelUpChoice(upgradeId) {
    if (!this.isMultiplayer || !this.mqtt) return false;
    if (this.levelUpPhase !== 'selecting' || this.levelUpTurnPlayerId !== this.playerId) return true;

    this.levelUpActive = false;
    this.levelUpChoiceRound = this.levelUpRound;
    this.levelUpChoiceId = upgradeId;
    if (this.isRoomHost) {
      this.levelUpChoices.push({ playerId: this.playerId, upgradeId });
      this._advanceLevelUpTurn();
      this._syncLevelUp();
    } else {
      this.scene.levelUpUI?.showWaiting();
    }
    return true;
  }

  _getLocalLevelUpCount() {
    return this.levelUpQueue.length + (this.levelUpActive ? 1 : 0) +
      (this.scene.runManager?.getPendingLevelUpCount() || 0);
  }

  _showNextLevelUp() {
    if (this.levelUpActive || this.levelUpQueue.length === 0) return;
    this.levelUpActive = true;
    this.scene.multiplayerWaitingForLevelUp = false;
    this.scene.levelUpUI?.show(this.levelUpQueue.shift());
  }

  _advanceLevelUpTurn() {
    this.levelUpTurnIndex += 1;
    if (this.levelUpTurnIndex >= this.levelUpTurnOrder.length) {
      this.levelUpPhase = 'idle';
      this.levelUpTurnPlayerId = null;
      return;
    }
    this.levelUpTurnPlayerId = this.levelUpTurnOrder[this.levelUpTurnIndex];
  }

  _syncLevelUp() {
    if (!this.isMultiplayer || !this.mqtt) return;
    if (!this.isRoomHost) {
      if (this.levelUpPhase === 'selecting') {
        if (this.levelUpTurnPlayerId === this.playerId &&
          this.levelUpChoiceRound !== this.levelUpRound) {
          this._showNextLevelUp();
        } else if (!this.levelUpActive && !this.scene.multiplayerWaitingForLevelUp) {
          this.scene.levelUpUI?.showWaiting();
        }
      } else if (this.scene.multiplayerWaitingForLevelUp) {
        this.scene.levelUpUI?.finishMultiplayerRound();
      }
      return;
    }

    if (this.levelUpPhase === 'selecting' && this.levelUpTurnPlayerId !== this.playerId) {
      const remote = this.remotePlayers.get(this.levelUpTurnPlayerId);
      if (remote?.levelUpChoiceRound === this.levelUpRound && remote.levelUpChoiceId) {
        this.levelUpChoices.push({ playerId: this.levelUpTurnPlayerId, upgradeId: remote.levelUpChoiceId });
        this._advanceLevelUpTurn();
      }
    }

    const activeRemotes = [...this.remotePlayers.entries()].filter(
      ([, remote]) => Date.now() - remote.lastSeenAt <= PLAYER_TIMEOUT_MS
    );
    if (this.levelUpPhase === 'idle') {
      const nextRound = this.levelUpRound + 1;
      const everyoneReady = this.player.runState.level > nextRound &&
        this._getLocalLevelUpCount() > 0 && activeRemotes.length > 0 &&
        activeRemotes.every(([, remote]) => remote.level > nextRound && remote.levelUpPendingCount > 0);
      if (everyoneReady) {
        this.levelUpRound = nextRound;
        this.levelUpPhase = 'selecting';
        this.levelUpTurnOrder = [this.playerId, ...activeRemotes.map(([id]) => id).sort()];
        this.levelUpTurnIndex = 0;
        this.levelUpTurnPlayerId = this.levelUpTurnOrder[0];
        this.levelUpChoices = [];
      } else if (this.scene.multiplayerWaitingForLevelUp) {
        this.scene.levelUpUI?.finishMultiplayerRound();
      }
    }

    if (this.levelUpPhase === 'selecting') {
      if (this.levelUpTurnPlayerId === this.playerId) this._showNextLevelUp();
      else if (this.levelUpTurnPlayerId && !this.scene.multiplayerWaitingForLevelUp) {
        this.scene.levelUpUI?.showWaiting();
      }
    }
  }

  sendAttack(attack) {
    if (!this.mqtt?.connected) return;
    const now = Date.now();
    if (now - this.lastAttackSentAt < ATTACK_MIN_INTERVAL_MS) return;
    this.lastAttackSentAt = now;
    this.attackSequence += 1;
    this.mqtt.publish(this.attackTopic, {
      id: this.playerId,
      seq: this.attackSequence,
      ...attack
    });
  }

  togglePauseVote() {
    if (!this.mqtt || this.scene.isGameOver || this.scene.hasWon ||
      this.scene.levelUpUI?.container.visible) return false;
    this.pauseRequested = this.pauseApplied ? false : !this.pauseRequested;
    this._syncPauseVote();
    return true;
  }

  attachRunClock(spawnDirector) {
    if (this.isRoomHost) return;
    spawnDirector.setElapsedTimeSource(() => this.getSharedRunTimeMs());
  }

  getSharedRunTimeMs() {
    if (this.isRoomHost) return this.scene.spawnDirector?.getElapsedMs() ?? null;
    if (this.hostRunTimeMs == null) return null;
    const age = Math.min(PLAYER_TIMEOUT_MS, Math.max(0, Date.now() - this.hostRunTimeReceivedAt));
    return this.hostRunTimeMs + (this.hostRunPaused ? 0 : age);
  }

  _syncPauseVote() {
    const now = Date.now();
    const activeRemotes = [...this.remotePlayers.values()].filter(
      (remote) => now - remote.lastSeenAt <= PLAYER_TIMEOUT_MS
    );
    const allVoted = activeRemotes.length > 0 && this.pauseRequested &&
      activeRemotes.every((remote) => remote.pauseRequested);

    if (allVoted && !this.pauseApplied) {
      this.scene.pauseUI?.open();
      this.pauseApplied = this.scene.pauseUI?.isOpen === true;
    } else if (!allVoted && this.pauseApplied) {
      this.pauseApplied = false;
      this.pauseRequested = false;
      this.scene.pauseUI?.close();
    }

    this.scene.pauseUI?.setWaitingForPlayer(this.pauseRequested && !this.pauseApplied);
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
    if (!topic.startsWith(`${this.topicPrefix}/`)) return;
    const [playerId, messageType] = topic.slice(`${this.topicPrefix}/`.length).split('/');
    if (messageType !== 'position' && messageType !== 'attack') return;
    if (!playerId || playerId === this.playerId) return;

    try {
      const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const state = JSON.parse(text);
      if (messageType === 'attack') {
        this._onAttack(playerId, state);
        return;
      }
      if (state.id !== playerId || !Number.isFinite(state.x) || !Number.isFinite(state.y)) return;
      if (!this.isRoomHost && state.isHost === true &&
        (!this.hostPlayerId || this.hostPlayerId === playerId)) {
        this.hostPlayerId = playerId;
        if (Number.isFinite(state.runTimeMs)) {
          this.hostRunTimeMs = Math.max(0, state.runTimeMs);
          this.hostRunTimeReceivedAt = Date.now();
          this.hostRunPaused = state.runPaused === true;
        }
        this.levelUpRound = Number.isFinite(state.levelUpRound) ? state.levelUpRound : 0;
        this.levelUpPhase = state.levelUpPhase === 'selecting' ? 'selecting' : 'idle';
        this.levelUpTurnPlayerId = typeof state.levelUpTurnPlayerId === 'string'
          ? state.levelUpTurnPlayerId : null;
        this.levelUpChoices = Array.isArray(state.levelUpChoices)
          ? state.levelUpChoices.filter((choice) => typeof choice?.upgradeId === 'string') : [];
      }
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
          levelUpChoiceRound: 0,
          levelUpChoiceId: null,
          levelUpPendingCount: 0,
          pauseRequested: false,
          isHost: state.isHost === true,
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
      remote.levelUpChoiceRound = Number.isFinite(state.levelUpChoiceRound)
        ? state.levelUpChoiceRound : 0;
      remote.levelUpChoiceId = typeof state.levelUpChoiceId === 'string'
        ? state.levelUpChoiceId : null;
      remote.levelUpPendingCount = Number.isFinite(state.levelUpPendingCount)
        ? Math.max(0, Math.floor(state.levelUpPendingCount)) : 0;
      remote.pauseRequested = state.pauseRequested === true;
      remote.isHost = state.isHost === true;
      remote.lastSeenAt = Date.now();
      remote.sprite.setFlipX(Boolean(state.flipX));
      const animation = state.moving ? remote.spriteSet.walk : remote.spriteSet.idle;
      if (remote.sprite.anims.currentAnim?.key !== animation) remote.sprite.play(animation);
      this._syncPauseVote();
      this._syncLevelUp();
    } catch (error) {
      console.warn('[Multiplayer] Mensagem inválida ignorada:', error.message);
    }
  }

  _onAttack(playerId, attack) {
    if (attack.id !== playerId || !Number.isInteger(attack.seq)) return;
    if (!['arc', 'sword', 'shot'].includes(attack.kind)) return;
    if (![attack.x, attack.y].every(Number.isFinite)) return;

    const remote = this.remotePlayers.get(playerId);
    if (!remote || attack.seq <= (remote.lastAttackSequence || 0)) return;
    remote.lastAttackSequence = attack.seq;

    const tint = Number.isInteger(attack.tint) && attack.tint >= 0 && attack.tint <= 0xffffff
      ? attack.tint
      : 0xffffff;
    if (attack.kind === 'shot') {
      this._playRemoteShot(attack, tint);
      return;
    }

    if (!Number.isFinite(attack.dx) || !Number.isFinite(attack.dy)) return;
    const range = Number.isFinite(attack.range) ? Phaser.Math.Clamp(attack.range, 20, 260) : 100;
    const angle = Math.atan2(attack.dy, attack.dx);
    const duration = Number.isFinite(attack.durationMs)
      ? Phaser.Math.Clamp(attack.durationMs, 60, 400)
      : 150;

    if (attack.kind === 'arc') {
      const fx = this.scene.add.image(
        attack.x + attack.dx * range * 0.5,
        attack.y + attack.dy * range * 0.5,
        'hit_fx'
      )
        .setDepth(20)
        .setScale(range / 40)
        .setRotation(angle)
        .setTint(tint);
      this.scene.tweens.add({
        targets: fx,
        alpha: 0,
        scale: fx.scale * 1.4,
        duration,
        onComplete: () => fx.destroy()
      });
      return;
    }

    const halfArc = Phaser.Math.DegToRad(
      Number.isFinite(attack.arcDegrees) ? Phaser.Math.Clamp(attack.arcDegrees, 10, 180) : 100
    ) / 2;
    const finisher = attack.finisher === true;
    const swing = this.scene.add.graphics({ x: attack.x, y: attack.y }).setDepth(20);
    swing.fillStyle(tint, finisher ? 0.65 : 0.5);
    swing.slice(0, 0, range, angle - halfArc, angle + halfArc, false);
    swing.fillPath();
    swing.lineStyle(finisher ? 9 : 5, tint, 0.95);
    swing.beginPath();
    swing.arc(0, 0, range, angle - halfArc, angle + halfArc, false);
    swing.strokePath();
    this.scene.tweens.add({
      targets: swing,
      alpha: 0,
      scaleX: finisher ? 1.3 : 1.15,
      scaleY: finisher ? 1.3 : 1.15,
      duration: duration * (finisher ? 1.6 : 1),
      ease: 'Cubic.easeOut',
      onComplete: () => swing.destroy()
    });
  }

  _playRemoteShot(attack, tint) {
    if (!Number.isFinite(attack.targetX) || !Number.isFinite(attack.targetY)) return;
    const dx = attack.targetX - attack.x;
    const dy = attack.targetY - attack.y;
    const distance = Math.min(900, Math.hypot(dx, dy));
    if (distance === 0) return;

    const angle = Math.atan2(dy, dx);
    const count = Number.isFinite(attack.count)
      ? Phaser.Math.Clamp(Math.floor(attack.count), 1, 8)
      : 1;
    const spread = Phaser.Math.DegToRad(
      Number.isFinite(attack.spreadDeg) ? Phaser.Math.Clamp(attack.spreadDeg, 0, 20) : 0
    );
    const speed = Number.isFinite(attack.speed) ? Phaser.Math.Clamp(attack.speed, 100, 1200) : 380;
    const duration = Phaser.Math.Clamp(distance / speed * 1000, 60, 1200);
    const scale = Number.isFinite(attack.scale) ? Phaser.Math.Clamp(attack.scale, 0.5, 1.5) : 1;
    const texture = ensureBulletTexture(this.scene, tint);

    for (let i = 0; i < count; i++) {
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      const offset = spread * side * Math.ceil(i / 2);
      const pelletAngle = angle + offset;
      const bolt = this.scene.add.image(attack.x, attack.y, texture)
        .setDepth(15)
        .setScale(scale)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(pelletAngle);
      if (bolt.preFX) bolt.preFX.addGlow(tint, 0, 1.5, false, 0.2, 6);
      this.scene.tweens.add({
        targets: bolt,
        x: attack.x + Math.cos(pelletAngle) * distance,
        y: attack.y + Math.sin(pelletAngle) * distance,
        duration,
        ease: 'Linear',
        onComplete: () => bolt.destroy()
      });
    }
  }

  _destroyRemote(remote) {
    remote.sprite.destroy();
    remote.healthBar.destroy();
    remote.levelLabel.destroy();
  }

  destroy() {
    if (this.mqtt) {
      this.mqtt.off('connect', this.onConnect);
      this.mqtt.off('message', this.onMessage);
      this.mqtt.off('error', this.onError);
      this.mqtt.end();
    }
    this.remotePlayers.forEach((remote) => this._destroyRemote(remote));
    this.remotePlayers.clear();
  }
}