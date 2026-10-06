import MqttClient from './MqttClient.js';
import { BASE_VISUAL_SCALE } from '../entities/Player.js';
import { ensureBulletTexture } from '../weapons/RangedWeapon.js';
import { hasSlashFx, playSlashFx } from '../fx/SlashFx.js';
import { hasPunchFx, playPunchSmear, WHIFF_POINT } from '../fx/PunchFx.js';
import DamageNumberManager from '../combat/DamageNumberManager.js';
import EventBus from './EventBus.js';
import { hasTornadoFx, createTornadoFx, pulseTornadoFx, updateTornadoFx } from '../fx/TornadoFx.js';
import { hasAuraShockFx, createAuraShockFx, updateAuraShockFx, zapAuraShockFx } from '../fx/AuraShockFx.js';
import {
  hasShieldFx,
  createShieldFx,
  updateShieldFx,
  hitShieldFx,
  breakShieldFx
} from '../fx/ShieldFx.js';

const POSITION_INTERVAL_MS = 100;
const ENEMY_SNAPSHOT_INTERVAL_MS = 200;
const ENEMY_HIT_INTERVAL_MS = 100;
const MAX_SYNCED_ENEMIES = 150;
const MAX_DAMAGE_PER_MESSAGE = 5000;
const ATTACK_MIN_INTERVAL_MS = 60;
const PLAYER_TIMEOUT_MS = 5000;
const HOST_ELECTION_GRACE_MS = 1000;
const DEFAULT_BROKER_URL = 'wss://ninelives.feira-de-jogos.dev.br/mqtt';
// Mortes e coletas recém-ocorridas são reenviadas dentro dos próximos snapshots
// (QoS 0 pode perder o pacote avulso). Tudo é idempotente no cliente.
const REPLAY_SNAPSHOTS = 5;
const REPLAY_MAX_AGE_MS = 5000;
const REPLAY_MAX_ENTRIES = 80;
const MAX_PICKUP_STATUS_MS = 10000;
const PICKUP_KINDS = new Set(['xp', 'medkit', 'gone']);
// Partidas (runEpoch do Host) que este cliente já viu terminar: se ele reinicia
// enquanto o Host ainda anuncia "fim", o estado velho não pode encerrar a run nova.
const staleMatchEpochs = new Set();
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
    this.lastEnemySnapshotAt = 0;
    this.lastEnemySnapshotSequence = 0;
    this.hostEnemySnapshotSequence = 0;
    this.remoteEnemies = new Map();
    this.pendingEnemyDamage = new Map();
    this.lastEnemyHitSequence = 0;
    this.lastEnemyHitSentAt = 0;
    this.lastPlayerDamageSequence = 0;
    this.lastReceivedPlayerDamageSequence = 0;
    this.lastEnemyDeathSequence = 0;
    this.receivedEnemyDeaths = new Set();
    this.lastAttackSentAt = -Infinity;
    this.attackSequence = 0;
    this.isRoomHost = Boolean(isRoomHost);
    this.matchState = 'running'; // 'running' | 'won' | 'lost' — definido SÓ pelo Host
    this.recentDeaths = [];
    this.recentPickupRemovals = [];
    this.appliedPickupRemovals = new Set();
    this.hostPlayerId = null;
    this.hostTerm = 0;
    this.hostMissingSince = null;
    this.hostRunTimeMs = null;
    this.hostRunTimeReceivedAt = 0;
    this.hostRunPaused = false;
    this.hostSpawnDirectorState = null;
    this.pauseRequested = false;
    this.pauseApplied = false;
    this.levelUpQueue = [];
    this.levelUpActive = false;
    this.levelUpRound = 0;
    this.levelUpPhase = 'idle';
    this.levelUpChoices = [];
    this.levelUpChoiceRound = 0;
    this.levelUpChoiceIds = [];

    const params = new URLSearchParams(window.location.search);
    const room = roomId || params.get('room');
    this.isMultiplayer = Boolean(room);
    const brokerUrl = params.get('mqttUrl') || (room ? DEFAULT_BROKER_URL : null);
    if (!brokerUrl) return;

    this.playerId = createPlayerId();
    if (this.isRoomHost) {
      this.hostPlayerId = this.playerId;
      this.hostTerm = 1;
      this.runEpoch = createPlayerId();
    }
    this.room = encodeURIComponent(room || 'test');
    this.topicPrefix = `nine-lives/${this.room}/players`;
    this.positionTopic = `${this.topicPrefix}/${this.playerId}/position`;
    this.attackTopic = `${this.topicPrefix}/${this.playerId}/attack`;
    this.enemyStateTopic = `nine-lives/${this.room}/enemies/state`;
    this.enemyDeathTopic = `nine-lives/${this.room}/enemies/death`;
    this.enemyHitPrefix = `nine-lives/${this.room}/enemy-hits`;
    this.enemyHitTopic = `${this.enemyHitPrefix}/${this.playerId}`;
    this.playerDamageTopic = `${this.topicPrefix}/${this.playerId}/damage`;
    this.pickupClaimPrefix = `nine-lives/${this.room}/pickup-claims`;
    this.pickupClaimTopic = `${this.pickupClaimPrefix}/${this.playerId}`;
    this.pickupRemovedTopic = `nine-lives/${this.room}/pickups/removed`;

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
        this.mqtt.subscribe(`${this.topicPrefix}/+/attack`),
        this.mqtt.subscribe(`${this.topicPrefix}/+/damage`),
        this.mqtt.subscribe(`${this.enemyHitPrefix}/+`),
        this.mqtt.subscribe(`${this.pickupClaimPrefix}/+`),
        this.mqtt.subscribe(this.enemyStateTopic),
        this.mqtt.subscribe(this.enemyDeathTopic),
        this.mqtt.subscribe(this.playerDamageTopic),
        this.mqtt.subscribe(this.pickupRemovedTopic)
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
    this._checkHostMigration(now);
    if (this.isRoomHost && this.mqtt?.connected && now - this.lastEnemySnapshotAt >= ENEMY_SNAPSHOT_INTERVAL_MS) {
      this.lastEnemySnapshotAt = now;
      this._publishEnemySnapshot();
    }
    if (!this.isRoomHost && this.mqtt?.connected && this.pendingEnemyDamage.size > 0 &&
      now - this.lastEnemyHitSentAt >= ENEMY_HIT_INTERVAL_MS) {
      this._flushEnemyDamage(now);
    }
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
        vx: this.player.body.velocity.x,
        vy: this.player.body.velocity.y,
        dodgeChance: this.player.runState.dodgeChance || 0,
        damageReductionFraction: this.player.runState.damageReductionFraction || 0,
        shieldCurrent: this.player.shieldSystem?.current || 0,
        shieldMax: this.player.shieldSystem?.maxShield || 0,
        shieldVisual: this.player.shieldSystem ? {
          current: this.player.shieldSystem.current,
          max: this.player.shieldSystem.maxShield,
          radius: this.player.shieldFx?.getData?.('radius') ?? 38,
          scale: this.player.scale,
          regenerating: this.player.shieldSystem.isRegenerating(this.scene.time.now)
        } : null,
        aimX: this.player.getAimDirection().x,
        aimY: this.player.getAimDirection().y,
        cameraViewWidth: this.scene.cameras.main.width / (this.scene.cameras.main.zoom || 1),
        cameraViewHeight: this.scene.cameras.main.height / (this.scene.cameras.main.zoom || 1),
        level: this.player.runState.level,
        pauseRequested: this.pauseRequested,
        isHost: this.isRoomHost,
        hostTerm: this.isRoomHost ? this.hostTerm : undefined,
        runEpoch: this.isRoomHost ? this.runEpoch : undefined,
        enemySnapshotSeq: this.isRoomHost ? this.lastEnemySnapshotSequence : undefined,
        runTimeMs: this.isRoomHost ? (this.scene.spawnDirector?.getElapsedMs() ?? 0) : undefined,
        runPaused: this.isRoomHost && this.scene.isPaused,
        matchState: this.isRoomHost ? this.matchState : undefined,
        spawnDirectorState: this.isRoomHost
          ? this.scene.spawnDirector?.getAuthorityState?.() ?? null
          : undefined,
        levelUpPendingCount: this._getLocalLevelUpCount(),
        levelUpRound: this.isRoomHost ? this.levelUpRound : undefined,
        levelUpPhase: this.isRoomHost ? this.levelUpPhase : undefined,
        levelUpChoices: this.isRoomHost ? this.levelUpChoices : undefined,
        levelUpChoiceRound: this.levelUpChoiceRound,
        levelUpChoiceIds: this.levelUpChoiceIds,
        abilityVisuals: typeof this.scene.abilityManager?.getNetworkVisualState === 'function'
          ? this.scene.abilityManager.getNetworkVisualState(this.scene.time.now)
          : null
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
      this._updateRemoteAbilityEffects(remote, this.scene.time.now, delta);
    });
    this.remoteEnemies.forEach((enemy) => {
      if (!enemy.active || !Number.isFinite(enemy.targetX)) return;
      const blend = Math.min(1, delta / ENEMY_SNAPSHOT_INTERVAL_MS);
      enemy.setPosition(
        Phaser.Math.Linear(enemy.x, enemy.targetX, blend),
        Phaser.Math.Linear(enemy.y, enemy.targetY, blend)
      );
    });
    this._evaluateMatchEnd();
    this._syncPauseVote();
    this._syncLevelUp();
    this._syncHostPause();
  }

  _checkHostMigration(now) {
    if (!this.isMultiplayer || this.isRoomHost || !this.mqtt?.connected ||
      !this.hostPlayerId || this.matchState !== 'running') {
      this.hostMissingSince = null;
      return;
    }

    const host = this.remotePlayers.get(this.hostPlayerId);
    if (host && now - host.lastSeenAt <= PLAYER_TIMEOUT_MS) {
      this.hostMissingSince = null;
      return;
    }

    if (this.hostMissingSince == null) {
      this.hostMissingSince = now;
      return;
    }
    if (now - this.hostMissingSince < HOST_ELECTION_GRACE_MS) return;

    const candidates = [...this.remotePlayers.entries()]
      .filter(([id, remote]) => id !== this.hostPlayerId &&
        now - remote.lastSeenAt <= PLAYER_TIMEOUT_MS)
      .map(([id]) => id);
    candidates.push(this.playerId);
    candidates.sort();
    if (candidates[0] === this.playerId) this._promoteToHost();
  }

  _promoteToHost() {
    if (this.isRoomHost || !this.mqtt?.connected || !this.runEpoch) return;

    const elapsedMs = this.getSharedRunTimeMs();
    this.hostTerm += 1;
    this.hostPlayerId = this.playerId;
    this.hostMissingSince = null;
    this.hostRunTimeMs = Number.isFinite(elapsedMs) ? elapsedMs : 0;
    this.hostRunTimeReceivedAt = Date.now();
    this.isRoomHost = true;
    this.scene.isRoomHost = true;
    this.lastEnemySnapshotSequence = Math.max(
      this.lastEnemySnapshotSequence,
      this.hostEnemySnapshotSequence
    );

    this.scene.enemySpawner?.promoteReplicas();
    const enemyIds = [
      ...this.remoteEnemies.keys(),
      ...this.receivedEnemyDeaths
    ].filter(Number.isInteger);
    if (this.scene.enemySpawner && enemyIds.length > 0) {
      this.scene.enemySpawner.nextNetworkId = Math.max(
        this.scene.enemySpawner.nextNetworkId,
        ...enemyIds.map((id) => id + 1)
      );
    }
    if (this.pendingEnemyDamage.size > 0) {
      const pendingHits = [...this.pendingEnemyDamage.entries()].map(([networkId, entry]) => [
        networkId,
        Math.round(entry.damage * 10) / 10,
        ...(entry.bleed ? entry.bleed.map((value) => Math.round(value * 10) / 10) : [0, 0, 0]),
        entry.paralyzeMs || 0
      ]);
      this.pendingEnemyDamage.clear();
      this._applyEnemyHitRecords(this.playerId, pendingHits);
    }
    const pickupIds = [
      ...(this.scene.pickupsById?.keys?.() ?? []),
      ...this.appliedPickupRemovals
    ].filter(Number.isInteger);
    this.scene.nextPickupId = Math.max(this.scene.nextPickupId || 1, ...pickupIds.map((id) => id + 1));
    this.scene.spawnDirector?.assumeAuthority(
      this.hostRunTimeMs,
      this.hostSpawnDirectorState
    );
    this.lastEnemySnapshotAt = 0;
    this.lastSentAt = 0;
    console.info(`[Multiplayer] Host migrado para ${this.playerId} (termo ${this.hostTerm}).`);
  }

  _demoteFromHost() {
    if (!this.isRoomHost) return;
    this.isRoomHost = false;
    this.scene.isRoomHost = false;
    this.scene.spawnDirector?.stop();
    this.scene.multiplayer?.attachRunClock(this.scene.spawnDirector);
  }

  _acceptHostAnnouncement(playerId, state) {
    if (state.isHost !== true || !Number.isInteger(state.hostTerm) || state.hostTerm < 1) return false;
    if (typeof state.runEpoch !== 'string' || state.runEpoch.length > 32) return false;

    const term = state.hostTerm;
    if (term < this.hostTerm) return false;
    if (term === this.hostTerm && this.hostPlayerId && this.hostPlayerId !== playerId &&
      playerId >= this.hostPlayerId) return false;

    const authorityChanged = this.hostPlayerId !== playerId || this.hostTerm !== term;
    if (authorityChanged) {
      this._demoteFromHost();
      this.hostPlayerId = playerId;
      this.hostTerm = term;
      this.lastReceivedPlayerDamageSequence = 0;
    }
    this.hostMissingSince = null;
    this._syncRunEpoch(state.runEpoch);
    this._applyHostMatchState(state.matchState, state.runEpoch);
    if (Number.isInteger(state.enemySnapshotSeq)) {
      this.hostEnemySnapshotSequence = Math.max(
        this.hostEnemySnapshotSequence,
        state.enemySnapshotSeq
      );
    }
    if (Number.isFinite(state.runTimeMs)) {
      this.hostRunTimeMs = Math.max(0, state.runTimeMs);
      this.hostRunTimeReceivedAt = Date.now();
      this.hostRunPaused = state.runPaused === true;
    }
    if (state.spawnDirectorState && typeof state.spawnDirectorState === 'object') {
      this.hostSpawnDirectorState = state.spawnDirectorState;
    }
    const hostLevelUpRound = Number.isFinite(state.levelUpRound) ? state.levelUpRound : 0;
    if (hostLevelUpRound !== this.levelUpRound) {
      this.levelUpChoiceIds = [];
      this.levelUpChoiceRound = hostLevelUpRound;
    }
    this.levelUpRound = hostLevelUpRound;
    this.levelUpPhase = state.levelUpPhase === 'selecting' ? 'selecting' : 'idle';
    this.levelUpChoices = Array.isArray(state.levelUpChoices)
      ? state.levelUpChoices.filter((choice) => typeof choice?.upgradeId === 'string') : [];
    return true;
  }

  _isCurrentAuthorityMessage(message) {
    return message?.hostId === this.hostPlayerId &&
      message?.hostTerm === this.hostTerm &&
      typeof this.hostPlayerId === 'string';
  }

  // ---------- fim da partida (estado do GRUPO, definido pelo Host) ----------

  getAliveRemoteCount() {
    return [...this.remotePlayers.values()].filter((remote) => remote.combatant?.active).length;
  }

  // Derrota do grupo: o Host morreu e não sobrou nenhum jogador remoto vivo.
  _evaluateMatchEnd() {
    if (!this.isRoomHost || !this.mqtt || this.matchState !== 'running') return;
    if (this.player.isDead && this.getAliveRemoteCount() === 0) this._setHostMatchState('lost');
  }

  // Vitória do grupo: chamada pela GameScene quando o relógio do Host chega ao fim.
  declareMatchWon() {
    if (!this.isRoomHost || !this.mqtt || this.matchState !== 'running') return;
    this._setHostMatchState('won');
  }

  _setHostMatchState(state) {
    this.matchState = state; // vai pra todos no heartbeat (reenviado a cada 100ms)
    this.scene.applyGroupMatchState?.(state);
  }

  _applyHostMatchState(state, epoch) {
    if (this.isRoomHost || (state !== 'won' && state !== 'lost') || this.matchState === state) return;
    if (typeof epoch === 'string' && staleMatchEpochs.has(epoch)) return;
    this.matchState = state;
    this.scene.applyGroupMatchState?.(state);
  }

  queueLevelUp(options) {
    if (!this.isMultiplayer || !this.mqtt || this.scene.isGameOver || this.scene.hasWon) return false;
    this.levelUpQueue.push(options);
    this._syncLevelUp();
    return true;
  }

  cancelPendingLevelUps() {
    this.levelUpQueue.length = 0;
    this.levelUpActive = false;
    this.levelUpChoiceIds = [];
    this.levelUpChoiceRound = this.levelUpRound;
    this.scene.multiplayerWaitingForLevelUp = false;
  }

  getSelectedUpgradeIds() {
    return [...new Set([
      ...this.levelUpChoices.map((choice) => choice.upgradeId),
      ...this.levelUpChoiceIds
    ])];
  }

  completeLevelUpChoice(upgradeId) {
    if (!this.isMultiplayer || !this.mqtt) return false;
    if (this.levelUpPhase !== 'selecting') return true;

    this.levelUpActive = false;
    this.levelUpChoiceRound = this.levelUpRound;
    if (typeof upgradeId === 'string') {
      this.levelUpChoiceIds.push(upgradeId);
    }
    if (this.isRoomHost && typeof upgradeId === 'string') {
      this.levelUpChoices.push({ playerId: this.playerId, upgradeId });
    }
    this._syncLevelUp();
    return true;
  }

  _getLocalLevelUpCount() {
    return this.levelUpQueue.length + (this.levelUpActive ? 1 : 0) +
      (this.scene.runManager?.getPendingLevelUpCount() || 0);
  }

  _showNextLevelUp() {
    if (this.scene.isGameOver || this.scene.hasWon || this.levelUpActive || this.levelUpQueue.length === 0) return;
    this.levelUpActive = true;
    this.scene.multiplayerWaitingForLevelUp = false;
    this.scene.levelUpUI?.show(this.levelUpQueue.shift());
  }

  _syncLevelUp() {
    if (!this.isMultiplayer || !this.mqtt || this.scene.hasWon ||
      (this.scene.isGameOver && !this.isRoomHost)) return;
    if (!this.isRoomHost) {
      if (this.levelUpPhase === 'selecting') {
        if (this.levelUpQueue.length > 0) {
          this._showNextLevelUp();
        } else if (!this.levelUpActive && !this.scene.multiplayerWaitingForLevelUp) {
          this.scene.levelUpUI?.showWaiting();
        }
      } else if (this.scene.multiplayerWaitingForLevelUp) {
        this.scene.levelUpUI?.finishMultiplayerRound();
      }
      return;
    }

    const activeRemotes = [...this.remotePlayers.entries()].filter(
      ([, remote]) => remote.combatant?.active &&
        Date.now() - remote.lastSeenAt <= PLAYER_TIMEOUT_MS
    );
    const localEligible = !this.player.isDead;
    const localPendingCount = localEligible ? this._getLocalLevelUpCount() : 0;
    if (this.levelUpPhase === 'idle') {
      const eligiblePlayers = [
        ...(localEligible ? [localPendingCount] : []),
        ...activeRemotes.map(([, remote]) => remote.levelUpPendingCount)
      ];
      const everyoneReady = eligiblePlayers.length > 0 &&
        eligiblePlayers.every((pendingCount) => pendingCount > 0);
      if (everyoneReady) {
        this.levelUpRound += 1;
        this.levelUpPhase = 'selecting';
        this.levelUpChoices = [];
        this.levelUpChoiceIds = [];
        this.levelUpChoiceRound = this.levelUpRound;
      } else if (!this.scene.isGameOver && this.scene.multiplayerWaitingForLevelUp) {
        this.scene.levelUpUI?.finishMultiplayerRound();
      }
    }

    if (this.levelUpPhase === 'selecting') {
      activeRemotes.forEach(([playerId, remote]) => {
        if (remote.levelUpChoiceRound !== this.levelUpRound) return;
        remote.levelUpChoiceIds?.forEach((upgradeId) => {
          if (!this.levelUpChoices.some((choice) =>
            choice.playerId === playerId && choice.upgradeId === upgradeId)) {
            this.levelUpChoices.push({ playerId, upgradeId });
          }
        });
      });

      const everyoneFinished = localPendingCount === 0 &&
        activeRemotes.every(([, remote]) => remote.levelUpPendingCount === 0);
      if (everyoneFinished) {
        this.levelUpPhase = 'idle';
        if (!this.scene.isGameOver) this.scene.levelUpUI?.finishMultiplayerRound();
        return;
      }

      if (!this.scene.isGameOver && this.levelUpQueue.length > 0) this._showNextLevelUp();
      else if (!this.scene.isGameOver && !this.levelUpActive &&
        !this.scene.multiplayerWaitingForLevelUp) {
        this.scene.levelUpUI?.showWaiting();
      }
    }
  }

  queueEnemyDamage(networkId, damage, status = null) {
    if (this.isRoomHost || !this.mqtt?.connected || !Number.isInteger(networkId) ||
      !Number.isFinite(damage) || damage <= 0) return;
    const entry = this.pendingEnemyDamage.get(networkId) || { damage: 0, bleed: null, paralyzeMs: 0 };
    entry.damage = Math.min(MAX_DAMAGE_PER_MESSAGE, entry.damage + damage);
    if (Array.isArray(status?.bleed)) entry.bleed = status.bleed;
    if (Number.isFinite(status?.paralyzeMs)) entry.paralyzeMs = Math.max(entry.paralyzeMs, status.paralyzeMs);
    this.pendingEnemyDamage.set(networkId, entry);
  }

  _flushEnemyDamage(now) {
    // [networkId, dano, bleedTick, bleedDuração, bleedIntervalo, paralisiaMs]
    const hits = [...this.pendingEnemyDamage.entries()]
      .slice(0, MAX_SYNCED_ENEMIES)
      .map(([networkId, entry]) => [
        networkId,
        Math.round(entry.damage * 10) / 10,
        ...(entry.bleed ? entry.bleed.map((value) => Math.round(value * 10) / 10) : [0, 0, 0]),
        entry.paralyzeMs || 0
      ]);
    this.pendingEnemyDamage.clear();
    this.lastEnemyHitSentAt = now;
    this.mqtt.publish(this.enemyHitTopic, {
      id: this.playerId,
      seq: ++this.lastEnemyHitSequence,
      hits
    });
  }

  _onEnemyHits(playerId, message) {
    if (!this.isRoomHost || message.id !== playerId || !Number.isInteger(message.seq) ||
      !Array.isArray(message.hits)) return;
    const remote = this.remotePlayers.get(playerId);
    if (!remote || message.seq <= (remote.lastEnemyHitSequence || 0)) return;
    remote.lastEnemyHitSequence = message.seq;

    this._applyEnemyHitRecords(playerId, message.hits);
  }

  _applyEnemyHitRecords(playerId, hits) {
    hits.slice(0, MAX_SYNCED_ENEMIES).forEach((hit) => {
      if (!Array.isArray(hit) || !Number.isInteger(hit[0]) || !Number.isFinite(hit[1])) return;
      const enemy = this.scene.enemySpawner?.group.getChildren()
        .find((candidate) => candidate.active && candidate.networkId === hit[0]);
      const damage = Phaser.Math.Clamp(hit[1], 0, MAX_DAMAGE_PER_MESSAGE);
      if (!enemy || damage <= 0) return;
      enemy.killerPlayerId = playerId;
      const hitX = enemy.x;
      const hitY = enemy.y;
      const appliedDamage = enemy.healthSystem.takeDamage(damage);
      if (appliedDamage <= 0) return;
      DamageNumberManager.show(this.scene, hitX, hitY, appliedDamage, enemy);
      enemy.playHitReaction();
      this.scene.sound.play(this._hitSfxKey(enemy), { volume: 0.5 });
      this._applyReplicatedStatus(enemy, hit);
    });
  }

  // Host: o status (sangramento/paralisia) que o cliente rolou passa a existir
  // só aqui — é o Host que aplica e tica; o cliente só vê o resultado no snapshot.
  _applyReplicatedStatus(enemy, hit) {
    const [, , bleedTick, bleedDuration, bleedInterval, paralyzeMs] = hit;
    const now = this.scene.time.now;
    if (Number.isFinite(bleedTick) && bleedTick > 0 && Number.isFinite(bleedDuration) &&
      Number.isFinite(bleedInterval)) {
      enemy.applyBleed(
        Math.min(bleedTick, MAX_DAMAGE_PER_MESSAGE),
        now,
        Phaser.Math.Clamp(bleedDuration, 0, MAX_PICKUP_STATUS_MS),
        Phaser.Math.Clamp(bleedInterval, 100, 5000)
      );
    }
    if (Number.isFinite(paralyzeMs) && paralyzeMs > 0) {
      enemy.applyParalyze(now, Phaser.Math.Clamp(paralyzeMs, 0, 5000));
    }
  }

  _hitSfxKey(enemy) {
    if (enemy.def?.boss) {
      const keys = ['sfx_minotaur_hit1', 'sfx_minotaur_hit2', 'sfx_minotaur_hit3'];
      return keys[Math.floor(Math.random() * keys.length)];
    }
    return enemy.def?.elite ? 'sfx_elite_hit' : 'sfx_hit';
  }

  _sendPlayerDamage(playerId, amount, shieldCurrent = null) {
    if (!this.isRoomHost || !this.mqtt?.connected || !Number.isFinite(amount) || amount < 0 ||
      (amount === 0 && !Number.isFinite(shieldCurrent))) return;
    this.mqtt.publish(`${this.topicPrefix}/${playerId}/damage`, {
      seq: ++this.lastPlayerDamageSequence,
      hostId: this.playerId,
      hostTerm: this.hostTerm,
      amount: Math.min(MAX_DAMAGE_PER_MESSAGE, amount),
      shieldCurrent: Number.isFinite(shieldCurrent) ? Math.max(0, shieldCurrent) : undefined
    });
  }

  // `death` já traz o resultado completo decidido pelo Host (XP + drops com id).
  // Morte, recompensa e drop viajam no MESMO pacote e são reenviados nos
  // próximos snapshots, então um pacote perdido não some com a recompensa.
  broadcastEnemyDeath(death) {
    if (!this.isRoomHost || !this.mqtt?.connected || !Number.isInteger(death.networkId)) return;
    const packet = {
      ...death,
      x: Math.round(death.x),
      y: Math.round(death.y),
      hostId: this.playerId,
      hostTerm: this.hostTerm,
      epoch: this.runEpoch,
      seq: ++this.lastEnemyDeathSequence,
    };
    this.recentDeaths.push({ at: Date.now(), sends: 0, packet });
    this.mqtt.publish(this.enemyDeathTopic, packet);
  }

  _takeReplay(list) {
    const now = Date.now();
    const alive = list.filter((entry) => entry.sends < REPLAY_SNAPSHOTS && now - entry.at <= REPLAY_MAX_AGE_MS);
    alive.splice(0, Math.max(0, alive.length - REPLAY_MAX_ENTRIES));
    alive.forEach((entry) => { entry.sends += 1; });
    list.length = 0;
    list.push(...alive);
    return alive;
  }

  _applyEnemyDeath(death) {
    if (!death || !Number.isInteger(death.networkId) || !Number.isFinite(death.x) ||
      !Number.isFinite(death.y) || !Number.isFinite(death.xpReward) ||
      this.receivedEnemyDeaths.has(death.networkId)) return;
    this.receivedEnemyDeaths.add(death.networkId);
    const enemy = this.remoteEnemies.get(death.networkId);
    enemy?._leave();
    this.remoteEnemies.delete(death.networkId);
    EventBus.emit('network-enemy-died', death);
  }

  // ---------- coleta de orbs/medkits (Host é a autoridade) ----------

  // Cliente pede ao Host para coletar. Só pede: o item continua no mundo até o
  // Host confirmar (e a mensagem de confirmação é a mesma que remove pra todos).
  claimPickup(pickupId) {
    if (this.isRoomHost || !this.mqtt?.connected || !Number.isInteger(pickupId)) return false;
    this.mqtt.publish(this.pickupClaimTopic, { id: this.playerId, pickupId });
    return true;
  }

  _onPickupClaim(playerId, message) {
    if (!this.isRoomHost || message?.id !== playerId || !Number.isInteger(message.pickupId)) return;
    if (!this.scene.hostCollectPickup(message.pickupId, playerId)) {
      // já foi coletado (ou nunca existiu): manda o cliente limpar o fantasma, sem recompensa
      this._publishPickupRemovals([[message.pickupId, null, 'gone', 0]]);
    }
  }

  // Host: anuncia que o item sumiu pra todos e quem ficou com ele.
  broadcastPickupRemoval(pickupId, byPlayerId, kind, value) {
    if (!this.isRoomHost) return;
    const record = [pickupId, byPlayerId, kind, value];
    this.recentPickupRemovals.push({ at: Date.now(), sends: 0, record });
    this._publishPickupRemovals([record]);
  }

  _publishPickupRemovals(records) {
    if (!this.mqtt?.connected) return;
    this.mqtt.publish(this.pickupRemovedTopic, {
      hostId: this.playerId,
      hostTerm: this.hostTerm,
      epoch: this.runEpoch,
      removed: records
    });
  }

  _applyPickupRemovals(records) {
    if (this.isRoomHost || !Array.isArray(records)) return;
    records.slice(0, REPLAY_MAX_ENTRIES).forEach((record) => {
      if (!Array.isArray(record) || !Number.isInteger(record[0]) || !PICKUP_KINDS.has(record[2])) return;
      const [pickupId, byPlayerId, kind, value] = record;
      if (kind === 'gone') {
        // só limpa o fantasma; não marca como aplicado pra não engolir a
        // confirmação real (com recompensa) se ela ainda estiver a caminho
        this.scene.removeNetworkPickup?.(pickupId);
        return;
      }
      if (this.appliedPickupRemovals.has(pickupId)) return;
      this.appliedPickupRemovals.add(pickupId);
      this.scene.removeNetworkPickup?.(pickupId);
      if (byPlayerId === this.playerId && Number.isFinite(value)) {
        this.scene.grantPickupReward?.(kind, value);
      }
    });
  }

  _syncRemoteTornadoes(remote, states) {
    if (!remote.tornadoEffects) remote.tornadoEffects = new Map();
    const seen = new Set();

    (Array.isArray(states) ? states.slice(0, 8) : []).forEach((state) => {
      if (typeof state.id !== 'string' || ![state.x, state.y, state.radius, state.remainingMs].every(Number.isFinite) ||
        state.remainingMs <= 0) return;
      seen.add(state.id);
      let effect = remote.tornadoEffects.get(state.id);
      if (!effect) {
        const fx = hasTornadoFx(this.scene)
          ? createTornadoFx(this.scene, state.x, state.y, state.radius, { remote: true })
          : this.scene.add.circle(state.x, state.y, state.radius, 0x90ee90, 0.22)
            .setStrokeStyle(2, 0x90ee90, 0.55).setDepth(8);
        effect = {
          id: state.id,
          fx,
          hitSequence: Number.isFinite(state.hitSequence) ? state.hitSequence : 0
        };
        remote.tornadoEffects.set(state.id, effect);
      } else if (Number.isFinite(state.hitSequence) && state.hitSequence > effect.hitSequence) {
        if (hasTornadoFx(this.scene)) pulseTornadoFx(effect.fx);
        effect.hitSequence = state.hitSequence;
      }
      effect.x = state.x;
      effect.y = state.y;
      effect.alpha = Number.isFinite(state.alpha) ? Phaser.Math.Clamp(state.alpha, 0, 1) : 1;
      effect.expiresAt = this.scene.time.now + Phaser.Math.Clamp(state.remainingMs, 0, 10000);
    });

    remote.tornadoEffects.forEach((effect, id) => {
      if (seen.has(id)) return;
      effect.fx.destroy();
      remote.tornadoEffects.delete(id);
    });
  }

  _syncRemoteAuras(remote, states) {
    if (!remote.auraEffects) remote.auraEffects = new Map();
    const seen = new Set();

    (Array.isArray(states) ? states.slice(0, 4) : []).forEach((state) => {
      if (typeof state.id !== 'string' || !Number.isFinite(state.radius)) return;
      seen.add(state.id);
      let effect = remote.auraEffects.get(state.id);
      if (!effect) {
        const fx = hasAuraShockFx(this.scene)
          ? createAuraShockFx(this.scene, state.radius)
          : this.scene.add.circle(0, 0, state.radius, 0x66e6ff, 0.1)
            .setStrokeStyle(2, 0x66e6ff, 0.65).setDepth(7);
        effect = { fx, hitSequence: 0, lastUpdateAt: this.scene.time.now };
        remote.auraEffects.set(state.id, effect);
      }
      effect.fx.setPosition(remote.targetX, remote.targetY);
      effect.scale = Number.isFinite(state.scale) ? Phaser.Math.Clamp(state.scale, 0.5, 3) : 1;
      effect.alpha = Number.isFinite(state.alpha) ? Phaser.Math.Clamp(state.alpha, 0, 1) : 1;
      if (Number.isInteger(state.hitSequence) && state.hitSequence > effect.hitSequence) {
        const targets = Array.isArray(state.hitTargets)
          ? state.hitTargets
            .filter((target) => Number.isFinite(target?.x) && Number.isFinite(target?.y))
            .slice(0, 3)
            .map(({ x, y }) => ({ active: true, x, y }))
          : [];
        if (hasAuraShockFx(this.scene)) zapAuraShockFx(effect.fx, targets);
        effect.hitSequence = state.hitSequence;
      }
    });

    remote.auraEffects.forEach((effect, id) => {
      if (seen.has(id)) return;
      effect.fx.destroy();
      remote.auraEffects.delete(id);
    });
  }

  _syncRemoteShield(remote, state) {
    if (!state || !Number.isFinite(state.max) || state.max <= 0) {
      if (remote.shieldFx) {
        remote.shieldFx.destroy();
        remote.shieldFx = null;
      }
      remote.shieldCurrent = 0;
      remote.shieldMax = 0;
      return;
    }

    const current = Number.isFinite(state.current) ? Phaser.Math.Clamp(state.current, 0, state.max) : state.max;
    if (!remote.shieldFx) {
      remote.shieldFx = hasShieldFx(this.scene)
        ? createShieldFx(this.scene, Phaser.Math.Clamp(state.radius || 38, 20, 100))
        : this.scene.add.circle(0, 0, Phaser.Math.Clamp(state.radius || 38, 20, 100), 0x3aa8ff, 0.18)
          .setStrokeStyle(2, 0x3aa8ff, 0.8).setDepth(9);
      remote.shieldCurrent = current;
    } else if (current < remote.shieldCurrent && hasShieldFx(this.scene)) {
      hitShieldFx(remote.shieldFx);
      if (current <= 0) breakShieldFx(remote.shieldFx);
      remote.shieldCurrent = current;
    } else {
      remote.shieldCurrent = current;
    }
    remote.shieldMax = state.max;
    remote.shieldScale = Number.isFinite(state.scale) ? Phaser.Math.Clamp(state.scale, 0.5, 3) : 1;
    remote.shieldRegenerating = state.regenerating === true;
  }

  _updateRemoteAbilityEffects(remote, time, delta) {
    remote.tornadoEffects?.forEach((effect, id) => {
      if (time >= effect.expiresAt) {
        effect.fx.destroy();
        remote.tornadoEffects.delete(id);
        return;
      }
      effect.fx.setPosition(effect.x, effect.y).setAlpha(effect.alpha);
      if (hasTornadoFx(this.scene)) updateTornadoFx(effect.fx, time, delta);
    });

    remote.auraEffects?.forEach((effect) => {
      effect.fx.setPosition(remote.sprite.x, remote.sprite.y)
        .setScale(effect.scale)
        .setAlpha(effect.alpha)
        .setVisible(remote.hp > 0);
      if (hasAuraShockFx(this.scene)) {
        updateAuraShockFx(effect.fx, time, Math.min(50, Math.max(0, time - effect.lastUpdateAt)));
      }
      effect.lastUpdateAt = time;
    });

    if (remote.shieldFx) {
      remote.shieldFx.setPosition(remote.sprite.x, remote.sprite.y)
        .setScale(remote.shieldScale)
        .setVisible(remote.hp > 0);
      if (hasShieldFx(this.scene)) {
        const dt = remote.shieldFxLastUpdateAt == null
          ? 16 : Math.min(50, Math.max(0, time - remote.shieldFxLastUpdateAt));
        updateShieldFx(remote.shieldFx, time, dt);
      }
      const ratio = remote.shieldMax > 0 ? remote.shieldCurrent / remote.shieldMax : 0;
      const alpha = remote.shieldRegenerating
        ? (Math.floor(time / 80) % 2 === 0 ? 0.9 : 0.25)
        : 0.25 + Phaser.Math.Clamp(ratio, 0, 1) * 0.6;
      remote.shieldFx.setAlpha(alpha);
      remote.shieldFxLastUpdateAt = time;
    }
  }

  _syncRunEpoch(epoch) {
    if (typeof epoch !== 'string' || epoch.length > 32 || epoch === this.runEpoch) return;
    this.runEpoch = epoch;
    this.lastEnemySnapshotSequence = 0;
    this.hostEnemySnapshotSequence = 0;
    this.lastReceivedPlayerDamageSequence = 0;
    this.receivedEnemyDeaths.clear();
    this.appliedPickupRemovals.clear();
    this.scene.clearNetworkPickups?.();
    this.remoteEnemies.forEach((enemy) => enemy._leave());
    this.remoteEnemies.clear();
  }

  getEnemyTargets() {
    const now = Date.now();
    return [this.player, ...[...this.remotePlayers.values()]
      .filter((remote) => remote.combatant?.active && now - remote.lastSeenAt <= PLAYER_TIMEOUT_MS)
      .map((remote) => remote.combatant)];
  }

  _createRemoteCombatant(remote, playerId) {
    const manager = this;
    const healthSystem = {
      get current() { return remote.hp; },
      get maxHp() { return remote.maxHp; },
      isDead() { return remote.hp <= 0; },
      takeDamage(amount) {
        if (!Number.isFinite(amount) || amount <= 0 || remote.hp <= 0) return 0;
        const appliedDamage = Math.min(remote.hp, amount);
        remote.hp -= appliedDamage;
        remote.invulnerableUntil = manager.scene.time.now + 350;
        manager._sendPlayerDamage(playerId, appliedDamage, remote.shieldCurrent);
        return appliedDamage;
      }
    };
    const shieldSystem = {
      absorb(damage) {
        const absorbed = Math.min(remote.shieldCurrent || 0, Math.max(0, damage));
        remote.shieldCurrent = Math.max(0, (remote.shieldCurrent || 0) - absorbed);
        const remainingDamage = damage - absorbed;
        if (absorbed > 0 && remainingDamage <= 0) {
          manager._sendPlayerDamage(playerId, 0, remote.shieldCurrent);
        }
        return remainingDamage;
      }
    };

    return {
      playerId,
      get x() { return remote.targetX; },
      get y() { return remote.targetY; },
      get cameraViewWidth() { return remote.cameraViewWidth; },
      get cameraViewHeight() { return remote.cameraViewHeight; },
      get active() { return remote.hp > 0 && Date.now() - remote.lastSeenAt <= PLAYER_TIMEOUT_MS; },
      get invulnerableUntil() { return remote.invulnerableUntil || 0; },
      set invulnerableUntil(value) { remote.invulnerableUntil = value; },
      invulnerableMs: 350,
      body: {
        radius: 30,
        get velocity() { return { x: remote.vx || 0, y: remote.vy || 0 }; }
      },
      scene: manager.scene,
      healthSystem,
      shieldSystem,
      runState: { dodgeChance: 0, damageReductionFraction: 0 },
      getAimDirection() { return { x: remote.aimX || 0, y: remote.aimY || 1 }; },
      applyKnockback() {}
    };
  }

  _syncRemoteAbilityVisuals(remote, visuals) {
    if (!visuals || typeof visuals !== 'object') visuals = {};
    if (!remote.abilityGraphics) remote.abilityGraphics = this.scene.add.graphics().setDepth(18);
    if (!remote.abilitySprites) remote.abilitySprites = new Map();

    const graphics = remote.abilityGraphics;
    graphics.clear();
    (Array.isArray(visuals.circles) ? visuals.circles : []).forEach((circle) => {
      if (![circle.x, circle.y, circle.radius, circle.color].every(Number.isFinite)) return;
      const scale = Number.isFinite(circle.scale) ? Math.max(0, circle.scale) : 1;
      graphics.fillStyle(circle.color, Phaser.Math.Clamp(circle.alpha ?? 0.3, 0, 1));
      graphics.fillCircle(circle.x, circle.y, circle.radius * scale);
      if (Number.isFinite(circle.strokeWidth) && circle.strokeWidth > 0) {
        graphics.lineStyle(circle.strokeWidth, circle.color, Phaser.Math.Clamp(circle.strokeAlpha ?? 0.7, 0, 1));
        graphics.strokeCircle(circle.x, circle.y, circle.radius * scale);
      }
    });

    (Array.isArray(visuals.lines) ? visuals.lines : []).forEach((line) => {
      if (![line.x1, line.y1, line.x2, line.y2, line.color, line.width].every(Number.isFinite)) return;
      graphics.lineStyle(Math.max(1, line.width), line.color, Phaser.Math.Clamp(line.alpha ?? 1, 0, 1));
      graphics.beginPath();
      graphics.moveTo(line.x1, line.y1);
      graphics.lineTo(line.x2, line.y2);
      graphics.strokePath();
    });

    (Array.isArray(visuals.sectors) ? visuals.sectors : []).forEach((sector) => {
      if (![sector.x, sector.y, sector.radius, sector.angle, sector.halfAngle, sector.color]
        .every(Number.isFinite)) return;
      graphics.fillStyle(sector.color, Phaser.Math.Clamp(sector.alpha ?? 0.5, 0, 1));
      graphics.slice(sector.x, sector.y, sector.radius,
        sector.angle - sector.halfAngle, sector.angle + sector.halfAngle, false);
      graphics.fillPath();
    });

    const spriteStates = Array.isArray(visuals.sprites) ? visuals.sprites : [];
    const projectileStates = Array.isArray(visuals.projectiles) ? visuals.projectiles : [];
    const liveSpriteIds = new Set([
      ...spriteStates.map((sprite) => sprite.id),
      ...projectileStates.filter((projectile) => projectile.kind === 'wave').map((projectile) => projectile.id)
    ]);
    spriteStates.forEach((spriteState) => {
      if (typeof spriteState.id !== 'string' || typeof spriteState.texture !== 'string' ||
        !this.scene.textures.exists(spriteState.texture) ||
        ![spriteState.x, spriteState.y].every(Number.isFinite)) return;
      liveSpriteIds.add(spriteState.id);
      let sprite = remote.abilitySprites.get(spriteState.id);
      if (!sprite) {
        sprite = this.scene.add.sprite(spriteState.x, spriteState.y, spriteState.texture).setDepth(17);
        remote.abilitySprites.set(spriteState.id, sprite);
      }
      sprite.setTexture(spriteState.texture).setPosition(spriteState.x, spriteState.y)
        .setRotation(Number.isFinite(spriteState.rotation) ? spriteState.rotation : 0)
        .setScale(
          Number.isFinite(spriteState.scaleX) ? spriteState.scaleX : 1,
          Number.isFinite(spriteState.scaleY) ? spriteState.scaleY : 1
        )
        .setFlipX(spriteState.flipX === true)
        .setAlpha(Phaser.Math.Clamp(spriteState.alpha ?? 1, 0, 1));
      if (Number.isInteger(spriteState.tint)) sprite.setTint(spriteState.tint);
      else sprite.clearTint();
      if (typeof sprite.play === 'function' && typeof spriteState.animation === 'string' &&
        sprite.anims?.currentAnim?.key !== spriteState.animation &&
        this.scene.anims.exists(spriteState.animation)) {
        sprite.play(spriteState.animation);
      }
    });
    remote.abilitySprites.forEach((sprite, id) => {
      if (liveSpriteIds.has(id)) return;
      sprite.destroy();
      remote.abilitySprites.delete(id);
    });

    projectileStates.forEach((projectileState) => {
      if (typeof projectileState.id !== 'string' ||
        ![projectileState.x, projectileState.y].every(Number.isFinite)) return;
      if (projectileState.kind === 'wave' && this.scene.textures.exists('shockwave_wave')) {
        // onda branca em pixel art (mesma arte do jogador local)
        let projectile = remote.abilitySprites.get(projectileState.id);
        if (!projectile) {
          projectile = this.scene.add.image(projectileState.x, projectileState.y, 'shockwave_wave', 0)
            .setDepth(16)
            .setOrigin(0.65, 0.5);
          remote.abilitySprites.set(projectileState.id, projectile);
        }
        projectile.setFrame(Math.floor(this.scene.time.now / 55) % 4)
          .setPosition(projectileState.x, projectileState.y)
          .setRotation(Number.isFinite(projectileState.rotation) ? projectileState.rotation : 0)
          .setScale(projectileState.scaleX || 1, projectileState.scaleY || 1)
          .setAlpha(Phaser.Math.Clamp(projectileState.alpha ?? 1, 0, 1));
        return;
      }
      if (projectileState.kind === 'wave' && this.scene.textures.exists('hit_fx')) {
        let projectile = remote.abilitySprites.get(projectileState.id);
        if (!projectile) {
          projectile = this.scene.add.image(projectileState.x, projectileState.y, 'hit_fx').setDepth(16);
          remote.abilitySprites.set(projectileState.id, projectile);
        }
        projectile.setPosition(projectileState.x, projectileState.y)
          .setRotation(Number.isFinite(projectileState.rotation) ? projectileState.rotation : 0)
          .setScale(projectileState.scaleX || 1, projectileState.scaleY || 1)
          .setAlpha(Phaser.Math.Clamp(projectileState.alpha ?? 0.85, 0, 1))
          .setTint(Number.isInteger(projectileState.color) ? projectileState.color : 0xffb199);
        return;
      }
      if (projectileState.kind === 'shuriken') {
        const radius = projectileState.radius || 9;
        const angle = projectileState.rotation || 0;
        const tint = projectileState.color;
        const points = [0, 1, 2, 3].map((index) => {
          const a = angle + index * Math.PI / 2;
          return { x: projectileState.x + Math.cos(a) * radius, y: projectileState.y + Math.sin(a) * radius };
        });
        graphics.fillStyle(tint, Phaser.Math.Clamp(projectileState.alpha ?? 1, 0, 1));
        graphics.fillTriangle(points[0].x, points[0].y, projectileState.x, projectileState.y - 2,
          projectileState.x + 2, projectileState.y);
        graphics.fillTriangle(points[1].x, points[1].y, projectileState.x + 2, projectileState.y,
          projectileState.x, projectileState.y + 2);
        graphics.fillTriangle(points[2].x, points[2].y, projectileState.x, projectileState.y + 2,
          projectileState.x - 2, projectileState.y);
        graphics.fillTriangle(points[3].x, points[3].y, projectileState.x - 2, projectileState.y,
          projectileState.x, projectileState.y - 2);
        return;
      }
      const radius = Number.isFinite(projectileState.radius) ? projectileState.radius : 5;
      graphics.fillStyle(projectileState.color, Phaser.Math.Clamp(projectileState.alpha ?? 0.9, 0, 1));
      graphics.fillCircle(projectileState.x, projectileState.y, radius);
      if (projectileState.kind === 'bolt') {
        const length = Math.max(8, radius * 2.5);
        graphics.lineStyle(Math.max(2, radius * 0.55), projectileState.color, 0.9);
        graphics.beginPath();
        graphics.moveTo(projectileState.x, projectileState.y);
        graphics.lineTo(projectileState.x - Math.cos(projectileState.rotation || 0) * length,
          projectileState.y - Math.sin(projectileState.rotation || 0) * length);
        graphics.strokePath();
      }
    });
    remote.abilitySprites.forEach((sprite, id) => {
      if (liveSpriteIds.has(id)) return;
      sprite.destroy();
      remote.abilitySprites.delete(id);
    });

    this._syncRemoteTornadoes(remote, visuals.tornadoes);
    this._syncRemoteAuras(remote, visuals.auras);
  }

  _publishEnemySnapshot() {
    const spawner = this.scene.enemySpawner;
    if (!spawner) return;
    const defs = spawner.enemyDefs;
    const enemies = spawner.group.getChildren()
      .filter((enemy) => enemy.active && Number.isInteger(enemy.networkId))
      .sort((a, b) => Number(Boolean(b.def.boss)) - Number(Boolean(a.def.boss)) ||
        Number(Boolean(b.def.elite)) - Number(Boolean(a.def.elite)) ||
        Number(Boolean(b.def.sealer)) - Number(Boolean(a.def.sealer)))
      .slice(0, MAX_SYNCED_ENEMIES)
      .map((enemy) => [
        enemy.networkId,
        defs.findIndex((def) => def.id === enemy.def.id),
        Math.round(enemy.x),
        Math.round(enemy.y),
        Math.round(enemy.healthSystem.current * 10),
        enemy.flipX ? 1 : 0,
        enemy.body?.velocity.lengthSq() > 0 ? 1 : 0,
        enemy.def.sealer ? enemy.arenaCenter?.x ?? null : null,
        enemy.def.sealer ? enemy.arenaCenter?.y ?? null : null,
        enemy.def.sealer ? enemy.arenaRadius ?? null : null,
        enemy.def.sealer ? enemy.arenaProgress ?? null : null,
        enemy.def.sealer ? enemy.arenaTargetPlayerId ?? null : null,
        enemy.getNetworkVisualState?.(this.scene.time.now) ?? null,
        enemy.getNetworkStatusFlags?.(this.scene.time.now) ?? 0
      ]);
    this.mqtt.publish(this.enemyStateTopic, {
      seq: ++this.lastEnemySnapshotSequence,
      hostId: this.playerId,
      hostTerm: this.hostTerm,
      epoch: this.runEpoch,
      enemies,
      deaths: this._takeReplay(this.recentDeaths).map((entry) => entry.packet),
      removed: this._takeReplay(this.recentPickupRemovals).map((entry) => entry.record)
    });
  }

  _applyEnemySnapshot(snapshot) {
    if (!this.scene.enemySpawner || !Array.isArray(snapshot.enemies)) return;
    const defs = this.scene.enemySpawner.enemyDefs;
    const seen = new Set();

    snapshot.enemies.slice(0, MAX_SYNCED_ENEMIES).forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 7) return;
      const [networkId, defIndex, x, y, hpTenths, flipX, moving,
        arenaCenterX, arenaCenterY, arenaRadius, arenaProgress, arenaTargetPlayerId,
        networkVisualState, statusFlags] = entry;
      if (!Number.isInteger(networkId) || networkId <= 0 ||
        !Number.isInteger(defIndex) || !defs[defIndex] ||
        ![x, y, hpTenths].every(Number.isFinite)) return;
      if (this.receivedEnemyDeaths.has(networkId)) return;

      seen.add(networkId);
      let enemy = this.remoteEnemies.get(networkId);
      if (!enemy?.active) {
        enemy = this.scene.enemySpawner.spawnReplicated(defs[defIndex].id, networkId, x, y);
        if (!enemy) return;
        this.remoteEnemies.set(networkId, enemy);
        enemy.targetX = x;
        enemy.targetY = y;
      }
      enemy.targetX = x;
      enemy.targetY = y;
      enemy.healthSystem.current = Phaser.Math.Clamp(hpTenths / 10, 0, enemy.healthSystem.maxHp);
      enemy.healthSystem.dead = false;
      enemy.setFlipX(flipX === 1);
      enemy._wantsToMove = moving === 1;
      enemy.updateAnimState();
      if (enemy.def.sealer) {
        enemy.syncArenaVisual?.(
          arenaCenterX,
          arenaCenterY,
          arenaRadius,
          arenaProgress,
          arenaTargetPlayerId
        );
      }
      enemy.syncNetworkVisualState?.(networkVisualState, this.scene.time.now);
      enemy.syncNetworkStatus?.(Number.isInteger(statusFlags) ? statusFlags : 0, this.scene.time.now);
    });

    this.remoteEnemies.forEach((enemy, networkId) => {
      if (seen.has(networkId)) return;
      enemy._leave();
      this.remoteEnemies.delete(networkId);
    });
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
    if (this.isRoomHost && this.visibilityPauseApplied) {
      this.visibilityPauseApplied = false;
      this.scene.pauseUI?.close();
      return true;
    }
    this.pauseRequested = this.pauseApplied ? false : !this.pauseRequested;
    this._syncPauseVote();
    return true;
  }

  pauseForHiddenHost() {
    if (!this.isRoomHost || this.scene.isGameOver || this.scene.hasWon) return;
    this.visibilityPauseApplied = true;
    this.scene.pauseUI?.open();
  }

  attachRunClock(spawnDirector) {
    if (this.isRoomHost) return;
    spawnDirector.setElapsedTimeSource(() => this.getSharedRunTimeMs());
  }

  getSharedRunTimeMs() {
    if (this.isRoomHost) return this.scene.spawnDirector?.getElapsedMs() ?? null;
    if (this.hostRunTimeMs == null) return null;
    const age = Math.min(
      PLAYER_TIMEOUT_MS + HOST_ELECTION_GRACE_MS,
      Math.max(0, Date.now() - this.hostRunTimeReceivedAt)
    );
    return this.hostRunTimeMs + (this.hostRunPaused ? 0 : age);
  }

  _syncPauseVote() {
    const now = Date.now();
    const activeRemotes = [...this.remotePlayers.values()].filter(
      (remote) => now - remote.lastSeenAt <= PLAYER_TIMEOUT_MS
    );
    const hasRemotePlayers = activeRemotes.length > 0;
    const allVoted = hasRemotePlayers && this.pauseRequested &&
      activeRemotes.every((remote) => remote.pauseRequested);

    if (!hasRemotePlayers && this.pauseRequested) {
      if (!this.pauseApplied) {
        this.scene.pauseUI?.open();
        this.pauseApplied = this.scene.pauseUI?.isOpen === true;
      }
    } else if (allVoted && !this.pauseApplied) {
      this.scene.pauseUI?.open();
      this.pauseApplied = this.scene.pauseUI?.isOpen === true;
    } else if (!allVoted && this.pauseApplied) {
      this.pauseApplied = false;
      this.pauseRequested = false;
      this.scene.pauseUI?.close();
    }

    this.scene.pauseUI?.setWaitingForPlayer(
      hasRemotePlayers && this.pauseRequested && !this.pauseApplied
    );
  }

  _syncHostPause() {
    if (this.isRoomHost || !this.scene.pauseUI) return;
    if (this.hostRunPaused && !this.hostPauseApplied) {
      this.scene.pauseUI.open();
      this.hostPauseApplied = this.scene.pauseUI.isOpen === true;
    } else if (!this.hostRunPaused && this.hostPauseApplied) {
      this.hostPauseApplied = false;
      this.scene.pauseUI.close();
    }
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
    if (this.isRoomHost && topic.startsWith(`${this.pickupClaimPrefix}/`)) {
      const playerId = topic.slice(`${this.pickupClaimPrefix}/`.length);
      try {
        const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
        this._onPickupClaim(playerId, JSON.parse(text));
      } catch (error) {
        console.warn('[Multiplayer] Pedido de coleta inválido:', error.message);
      }
      return;
    }
    if (!this.isRoomHost && topic === this.pickupRemovedTopic) {
      try {
        const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
        const message = JSON.parse(text);
        if (!this._isCurrentAuthorityMessage(message)) return;
        this._syncRunEpoch(message.epoch);
        this._applyPickupRemovals(message.removed);
      } catch (error) {
        console.warn('[Multiplayer] Coleta inválida:', error.message);
      }
      return;
    }
    if (this.isRoomHost && topic.startsWith(`${this.enemyHitPrefix}/`)) {
      const playerId = topic.slice(`${this.enemyHitPrefix}/`.length);
      try {
        const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
        this._onEnemyHits(playerId, JSON.parse(text));
      } catch (error) {
        console.warn('[Multiplayer] Lote de dano inválido:', error.message);
      }
      return;
    }
    if (topic === this.enemyStateTopic && !this.isRoomHost) {
      try {
        const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
        const snapshot = JSON.parse(text);
        if (!this._isCurrentAuthorityMessage(snapshot)) return;
        this._syncRunEpoch(snapshot.epoch);
        if (!Number.isInteger(snapshot.seq) || snapshot.seq <= this.lastEnemySnapshotSequence) return;
        this.lastEnemySnapshotSequence = snapshot.seq;
        // mortes/coletas reenviadas primeiro (idempotentes), depois o estado dos inimigos
        if (Array.isArray(snapshot.deaths)) {
          snapshot.deaths.slice(0, REPLAY_MAX_ENTRIES).forEach((death) => this._applyEnemyDeath(death));
        }
        this._applyPickupRemovals(snapshot.removed);
        this._applyEnemySnapshot(snapshot);
      } catch (error) {
        console.warn('[Multiplayer] Snapshot de inimigos inválido:', error.message);
      }
      return;
    }
    if (topic === this.enemyDeathTopic && !this.isRoomHost) {
      try {
        const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
        const death = JSON.parse(text);
        if (!this._isCurrentAuthorityMessage(death)) return;
        this._syncRunEpoch(death.epoch);
        if (!Number.isInteger(death.seq)) return;
        this._applyEnemyDeath(death);
      } catch (error) {
        console.warn('[Multiplayer] Morte de inimigo inválida:', error.message);
      }
      return;
    }
    if (!topic.startsWith(`${this.topicPrefix}/`)) return;
    const [playerId, messageType] = topic.slice(`${this.topicPrefix}/`.length).split('/');
    if (!playerId) return;

    try {
      const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const state = JSON.parse(text);
      if (messageType === 'damage' && playerId === this.playerId && !this.isRoomHost) {
        if (!this._isCurrentAuthorityMessage(state) ||
          !Number.isInteger(state.seq) || state.seq <= this.lastReceivedPlayerDamageSequence ||
          !Number.isFinite(state.amount)) return;
        this.lastReceivedPlayerDamageSequence = state.seq;
        this.player.applyNetworkDamage(
          Phaser.Math.Clamp(state.amount, 0, MAX_DAMAGE_PER_MESSAGE),
          state.shieldCurrent
        );
        return;
      }
      if (playerId === this.playerId) return;
      if (messageType === 'attack') {
        this._onAttack(playerId, state);
        return;
      }
      if (messageType !== 'position' || state.id !== playerId ||
        !Number.isFinite(state.x) || !Number.isFinite(state.y)) return;
      const acceptedHost = state.isHost === true && this._acceptHostAnnouncement(playerId, state);
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
          cameraViewWidth: null,
          cameraViewHeight: null,
          abilityGraphics: null,
          abilitySprites: new Map(),
          tornadoEffects: new Map(),
          auraEffects: new Map(),
          shieldFx: null,
          abilityVisuals: null,
          levelUpChoiceRound: 0,
          levelUpChoiceIds: [],
          levelUpPendingCount: 0,
          pauseRequested: false,
          isHost: acceptedHost,
          healthBar,
          levelLabel,
          lastSeenAt: Date.now()
        };
        this.remotePlayers.set(playerId, remote);
        remote.combatant = this._createRemoteCombatant(remote, playerId);
      }

      remote.targetX = state.x;
      remote.targetY = state.y;
      remote.hp = hp;
      remote.maxHp = maxHp;
      remote.vx = Number.isFinite(state.vx) ? state.vx : 0;
      remote.vy = Number.isFinite(state.vy) ? state.vy : 0;
      remote.aimX = Number.isFinite(state.aimX) ? state.aimX : 0;
      remote.aimY = Number.isFinite(state.aimY) ? state.aimY : 1;
      remote.cameraViewWidth = Number.isFinite(state.cameraViewWidth) && state.cameraViewWidth > 0
        ? state.cameraViewWidth : null;
      remote.cameraViewHeight = Number.isFinite(state.cameraViewHeight) && state.cameraViewHeight > 0
        ? state.cameraViewHeight : null;
      if (state.shieldVisual && typeof state.shieldVisual === 'object') {
        this._syncRemoteShield(remote, state.shieldVisual);
      } else {
        remote.shieldCurrent = Number.isFinite(state.shieldCurrent) ? Math.max(0, state.shieldCurrent) : 0;
        remote.shieldMax = Number.isFinite(state.shieldMax) ? Math.max(0, state.shieldMax) : 0;
      }
      remote.combatant.runState.dodgeChance = Number.isFinite(state.dodgeChance) ? state.dodgeChance : 0;
      remote.combatant.runState.damageReductionFraction = Number.isFinite(state.damageReductionFraction)
        ? Phaser.Math.Clamp(state.damageReductionFraction, 0, 0.95)
        : 0;
      remote.level = level;
      remote.levelUpChoiceRound = Number.isFinite(state.levelUpChoiceRound)
        ? state.levelUpChoiceRound : 0;
      remote.levelUpChoiceIds = Array.isArray(state.levelUpChoiceIds)
        ? state.levelUpChoiceIds.filter((upgradeId) => typeof upgradeId === 'string') : [];
      remote.levelUpPendingCount = Number.isFinite(state.levelUpPendingCount)
        ? Math.max(0, Math.floor(state.levelUpPendingCount)) : 0;
      remote.pauseRequested = state.pauseRequested === true;
      remote.isHost = acceptedHost;
      remote.abilityVisuals = state.abilityVisuals;
      remote.lastSeenAt = Date.now();
      remote.sprite.setFlipX(Boolean(state.flipX));
      const animation = state.moving ? remote.spriteSet.walk : remote.spriteSet.idle;
      if (remote.sprite.anims.currentAnim?.key !== animation) remote.sprite.play(animation);
      this._syncRemoteAbilityVisuals(remote, remote.abilityVisuals);
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
      if (hasPunchFx(this.scene)) {
        // jogador remoto: só o vulto (o impacto depende de quem foi atingido)
        playPunchSmear(this.scene, { x: attack.x, y: attack.y, angle, reach: range * WHIFF_POINT, durationMs: duration, tint });
        return;
      }
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
    if (hasSlashFx(this.scene, attack.variant)) {
      playSlashFx(this.scene, {
        x: attack.x,
        y: attack.y,
        angle,
        range,
        variant: attack.variant,
        durationMs: duration * (finisher ? 1.6 : 1),
        flip: attack.flip === true,
        juice: attack.variant === 'white',
        finisher,
        arcDegrees: Number.isFinite(attack.arcDegrees) ? Phaser.Math.Clamp(attack.arcDegrees, 10, 180) : undefined,
        swingIndex: Number.isInteger(attack.swingIndex) ? Phaser.Math.Clamp(attack.swingIndex, 0, 15) : (attack.flip === true ? 1 : 0),
        baseAngle: Number.isFinite(attack.baseAngle) ? attack.baseAngle : undefined
      });
      return;
    }
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
    remote.abilityGraphics?.destroy();
    remote.abilitySprites?.forEach((sprite) => sprite.destroy());
    remote.tornadoEffects?.forEach((effect) => effect.fx.destroy());
    remote.auraEffects?.forEach((effect) => effect.fx.destroy());
    remote.shieldFx?.destroy();
  }

  destroy() {
    if (this.matchState !== 'running' && typeof this.runEpoch === 'string') {
      staleMatchEpochs.add(this.runEpoch);
    }
    if (this.mqtt) {
      this.mqtt.off('connect', this.onConnect);
      this.mqtt.off('message', this.onMessage);
      this.mqtt.off('error', this.onError);
      this.mqtt.end();
    }
    this.remotePlayers.forEach((remote) => this._destroyRemote(remote));
    this.remotePlayers.clear();
    this.remoteEnemies.forEach((enemy) => enemy._leave());
    this.remoteEnemies.clear();
  }
}