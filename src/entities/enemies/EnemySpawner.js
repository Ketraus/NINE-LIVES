import Enemy from './Enemy.js';
import Grunt from './Grunt.js';
import Runner from './Runner.js';
import Brute from './Brute.js';
import Exploder from './Exploder.js';
import Elite from './Elite.js';
import Sealer from './Sealer.js';
import Minotaur from './Minotaur.js';
import SwarmSystem from './SwarmSystem.js';
import DamageSystem from '../../combat/DamageSystem.js';

// Escolhe a classe do inimigo pelo def (data/enemies.js). As habilidades especiais
// seguem as mesmas flags de antes (boss/elite/sealer/explodes); os inimigos comuns
// caem pelo id. Qualquer def desconhecido cai no Enemy base (comportamento padrão).
function pickEnemyClass(def) {
  if (def.boss) return Minotaur;
  if (def.elite) return Elite;
  if (def.sealer) return Sealer;
  if (def.explodes) return Exploder;
  switch (def.id) {
    case 'grunt': return Grunt;
    case 'cyber_hound': return Runner;
    case 'cyber_brute': return Brute;
    default: return Enemy;
  }
}

const DEFAULT_MAX_ALIVE = 14; // trava inicial da quantidade simultânea, até o SpawnDirector assumir o…
// Quanto além da borda da câmera o inimigo precisa nascer pra garantir…
const SPAWN_MARGIN_BEYOND_VIEW = 80;
const ABANDONED_DISTANCE_MARGIN = 240;
const COLLISION_LIMIT = 64;
// Hordas grandes compartilham o orçamento de IA; inimigos especiais seguem por frame.
const AI_STRIDE_MEDIUM = 2;
const AI_STRIDE_HIGH = 3;
const AI_STRIDE_EXTREME = 4;

// "Vibrada" na tela quando o Elite nasce — feedback bem besta de propós…
const ELITE_SPAWN_SHAKE_MS = 300;
const ELITE_SPAWN_SHAKE_INTENSITY = 0.015;

// Entrada do Boss (ver _playBossEntranceFx): nasce pequeno e "estoura"…
const BOSS_ENTRANCE_SCALE_START_FACTOR = 0.25; // fração do tamanho final em que ele nasce
const BOSS_ENTRANCE_SCALE_DURATION_MS = 420;
const BOSS_ENTRANCE_RING_MAX_RADIUS = 260;
const BOSS_ENTRANCE_RING_DURATION_MS = 500;
// Onde o Boss nasce (ver _findBossSpawnPosition): NA FRENTE do jogador, dentro da câmera.
const BOSS_SPAWN_MIN_DISTANCE = 220; // nunca mais perto que isso do jogador (o boss é grande)
const BOSS_SPAWN_VIEW_FRACTION = 0.6; // fração do caminho até a borda da câmera
const BOSS_SPAWN_CLEARANCE = 70; // raio livre de parede ao redor do ponto
const BOSS_SPAWN_ANGLE_OFFSETS_DEG = [0, 30, -30, 60, -60, 90, -90, 135, -135, 180]; // tentativas

// Fatias de 360° ao redor do jogador usadas pra decidir "de que lado" c…
const SPAWN_SECTOR_COUNT = 8;
// Quanto espalhar o ângulo de cada inimigo DENTRO do grupo (pra não nas…
const GROUP_SPREAD_DEG = 22;
const SPAWN_RADIAL_JITTER = 140;
const SPAWN_TANGENT_JITTER = 70;
// Tamanhos possíveis de um grupo de spawn e o peso relativo de cada um…
const GROUP_SIZE_WEIGHTS = [
  { size: 1, weight: 5 },
  { size: 3, weight: 3 },
  { size: 6, weight: 1 }
];

// Responsável só por CRIAR inimigos: escolhe o tipo, acha uma posição f…
export default class EnemySpawner {
  // repassado pro SwarmSystem (comportamento de enxame, ver updateAll)
  constructor(scene, mapManager, player, enemyDefs, flockingConfig) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.player = player;
    this.enemyDefs = enemyDefs;
    this.maxAlive = DEFAULT_MAX_ALIVE;
    this.nextNetworkId = 1;
    this.swarmSystem = new SwarmSystem(flockingConfig);
    this.activeEnemies = [];
    this.updateFrame = 0;
    this.denseBattle = false;

    this.group = scene.physics.add.group({ runChildUpdate: false });

    // Freeze (cheat "freeze" do DevConsole, F9): true = inimigos param no
    this.frozen = false;
  }

  // Muda o teto de inimigos vivos simultaneamente. Chamado pelo SpawnDire…
  setMaxAlive(value) {
    this.maxAlive = value;
  }

  getAliveCount() {
    return this.group.countActive(true);
  }

  // Cria um inimigo agora, se houver espaço (respeita maxAlive), num ângu…
  spawnOne(nowMs = 0, weights = null) {
    return this._spawnOneAt(nowMs, weights, null);
  }

  // Spawna até `amount` inimigos de uma leva, divididos em pequenos GRUPOS
  spawnBatch(amount, nowMs = 0, weights = null) {
    let spawned = 0;
    while (spawned < amount) {
      const groupSize = Math.min(this._pickGroupSize(), amount - spawned);
      const sectorAngle = this._sectorCenterAngle(this._pickSector());

      for (let i = 0; i < groupSize; i++) {
        const enemy = this._spawnOneAt(nowMs, weights, sectorAngle);
        if (!enemy) return spawned; // maxAlive atingido (ou nenhum def disponível) — leva encerra aqui
        spawned += 1;
      }
    }
    return spawned;
  }

  // Núcleo compartilhado por spawnOne/spawnBatch: escolhe o tipo, acha
  _spawnOneAt(nowMs, weights, baseAngle) {
    if (this.group.countActive(true) >= this.maxAlive) return null;

    const def = weights ? this._pickWeighted(weights) : this._pickUniform(nowMs);
    if (!def) return null;
    const pos = def.sealer ? this._findSealerSpawnPosition(def)
      : def.boss ? this._findBossSpawnPosition()
      : this._findSpawnPosition(baseAngle);
    return this._createAt(def, pos);
  }

  // Tamanho de grupo sorteado a partir de GROUP_SIZE_WEIGHTS (roleta pond…
  _pickGroupSize() {
    const total = GROUP_SIZE_WEIGHTS.reduce((sum, g) => sum + g.weight, 0);
    let roll = Phaser.Math.FloatBetween(0, total);
    for (const g of GROUP_SIZE_WEIGHTS) {
      if (roll < g.weight) return g.size;
      roll -= g.weight;
    }
    return GROUP_SIZE_WEIGHTS[GROUP_SIZE_WEIGHTS.length - 1].size; // sobra de arredondamento
  }

  // Conta quantos inimigos vivos existem em cada setor angular ao redor do
  _sectorOccupancy() {
    const counts = new Array(SPAWN_SECTOR_COUNT).fill(0);
    const sectorSize = (Math.PI * 2) / SPAWN_SECTOR_COUNT;
    this.group.getChildren().forEach((enemy) => {
      if (!enemy.active) return;
      const angle = Phaser.Math.Angle.Normalize(
        Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y)
      );
      const sector = Math.min(SPAWN_SECTOR_COUNT - 1, Math.floor(angle / sectorSize));
      counts[sector] += 1;
    });
    return counts;
  }

  // Sorteia o setor onde o próximo grupo nasce, enviesado pros menos
  _pickSector() {
    const counts = this._sectorOccupancy();
    const maxCount = Math.max(...counts, 0);
    const weights = counts.map((count) => 1 + (maxCount - count));

    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Phaser.Math.FloatBetween(0, total);
    for (let i = 0; i < weights.length; i++) {
      if (roll < weights[i]) return i;
      roll -= weights[i];
    }
    return weights.length - 1; // sobra de arredondamento
  }

  // Ângulo (radianos) do meio do setor `sector` — usado como `baseAngle`
  _sectorCenterAngle(sector) {
    const sectorSize = (Math.PI * 2) / SPAWN_SECTOR_COUNT;
    return sector * sectorSize + sectorSize / 2;
  }

  // Sorteio ponderado: cada id em `weights` com peso > 0 entra na roleta
  _pickWeighted(weights) {
    const entries = this.enemyDefs
      .map((def) => ({ def, weight: weights[def.id] ?? 0 }))
      .filter((e) => e.weight > 0)
      // Sealer é único: se já existe um vivo, ele nem entra no sorteio
      .filter((e) => !e.def.sealer || !this.hasActiveSealer());
    if (entries.length === 0) return null;

    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let roll = Phaser.Math.FloatBetween(0, total);
    for (const entry of entries) {
      if (roll < entry.weight) return entry.def;
      roll -= entry.weight;
    }
    return entries[entries.length - 1].def; // sobra de arredondamento de ponto flutuante
  }

  // Sorteio antigo (uniforme, filtrado por minSpawnTimeMs) — só usado qua…
  _pickUniform(nowMs) {
    const availableDefs = this.enemyDefs.filter((def) =>
      (!def.minSpawnTimeMs || nowMs >= def.minSpawnTimeMs) &&
      (!def.sealer || !this.hasActiveSealer())
    );
    return Phaser.Utils.Array.GetRandom(availableDefs.length > 0 ? availableDefs : this.enemyDefs);
  }

  // true se já existe um Sealer vivo agora. Usado por _pickWeighted/
  hasActiveSealer() {
    return this.group.getChildren().some((e) => e.active && e.def.sealer);
  }

  // true se já existe um Boss (Minotauro) vivo agora. Usado pelo
  hasActiveBoss() {
    return this.group.getChildren().some((e) => e.active && e.def.boss);
  }

  // true se existe QUALQUER inimigo vivo agora (de qualquer tipo) — usado
  hasAnyAlive() {
    return this.group.getChildren().some((e) => e.active);
  }

  // Cria de fato um Enemy num ponto e registra ele no grupo/colisor —
  _createAt(def, pos, networkId = null, networkReplica = false) {
    const EnemyClass = pickEnemyClass(def);
    const enemy = new EnemyClass(this.scene, pos.x, pos.y, def);
    const isSpecial = def.elite || def.sealer || def.boss || def.special || def.event;
    enemy.shadow?.setVisible(!this.denseBattle || isSpecial);
    enemy.networkId = networkId ?? this.nextNetworkId++;
    enemy.networkReplica = networkReplica;
    this.nextNetworkId = Math.max(this.nextNetworkId, enemy.networkId + 1);
    this.group.add(enemy);
    this.mapManager.addCollider(enemy);
    // Elite: som + vibrada de entrada, tocam no instante em que ele nasce
    if (def.elite) {
      this.scene.sound.play('sfx_elite_spawn', { volume: 0.6 });
      this.scene.cameras.main.shake(ELITE_SPAWN_SHAKE_MS, ELITE_SPAWN_SHAKE_INTENSITY);
    }
    // Boss: pop de escala + onda de choque (ver _playBossEntranceFx) — o
    if (def.boss) this._playBossEntranceFx(enemy);
    return enemy;
  }

  spawnReplicated(defId, networkId, x, y) {
    const def = this.enemyDefs.find((entry) => entry.id === defId);
    if (!def || !Number.isInteger(networkId) || networkId <= 0) return null;
    return this._createAt(def, { x, y }, networkId, true);
  }

  promoteReplicas() {
    this.group.getChildren().forEach((enemy) => {
      if (!enemy.active || !enemy.networkReplica) return;
      enemy.networkReplica = false;
      enemy.bleedUntil = 0;
      enemy.paralyzedUntil = 0;
      enemy.healthSystem.onChange(enemy.healthSystem.current, enemy.healthSystem.maxHp);
    });
  }

  // Pop de escala (nasce pequeno, estoura pro tamanho final) + anel de
  _playBossEntranceFx(enemy) {
    const targetScale = enemy.baseScale;
    enemy.setScale(targetScale * BOSS_ENTRANCE_SCALE_START_FACTOR);
    this.scene.tweens.add({
      targets: enemy,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: BOSS_ENTRANCE_SCALE_DURATION_MS,
      ease: 'Cubic.easeOut'
    });

    const ring = this.scene.add.graphics().setDepth(20);
    const ringState = { radius: 10, alpha: 1 };
    this.scene.tweens.add({
      targets: ringState,
      radius: BOSS_ENTRANCE_RING_MAX_RADIUS,
      alpha: 0,
      duration: BOSS_ENTRANCE_RING_DURATION_MS,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        if (!enemy.active) return;
        ring.clear();
        ring.lineStyle(6, 0xffffff, ringState.alpha);
        ring.strokeCircle(enemy.x, enemy.y, ringState.radius);
      },
      onComplete: () => ring.destroy()
    });
  }

  // Cheat (DevConsole "spawn <inimigoId> [quantidade]"): cria `count`
  spawnByDefId(defId, count = 1) {
    const def = this.enemyDefs.find((d) => d.id === defId);
    if (!def) return 0;
    if (def.sealer && this.hasActiveSealer()) return 0; // já tem um vivo — cheat também respeita a regra
    const n = Math.max(1, Math.floor(count));
    for (let i = 0; i < n; i++) {
      this._createAt(def, def.sealer ? this._findSealerSpawnPosition(def)
        : def.boss ? this._findBossSpawnPosition()
        : this._findSpawnPosition());
    }
    return n;
  }

  // Posição de spawn exclusiva do Sealer: diferente de todo mundo (que
  _findSealerSpawnPosition(def) {
    const bounds = this.mapManager.getWorldBounds();
    const margin = 64;
    // entre 55% e 85% do raio inicial — visível, mas nunca na borda exata
    const safeDist = def.arenaStartRadius * Phaser.Math.FloatBetween(0.55, 0.85);
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    return {
      x: Phaser.Math.Clamp(this.player.x + Math.cos(angle) * safeDist, margin, bounds.width - margin),
      y: Phaser.Math.Clamp(this.player.y + Math.sin(angle) * safeDist, margin, bounds.height - margin)
    };
  }

  // Posição de spawn exclusiva do Boss: NA FRENTE do jogador (direção em que ele anda)
  // e DENTRO da câmera, onde o flash de entrada aparece. Se a frente estiver bloqueada
  // (borda do mapa ou parede), tenta ângulos ao redor até achar um ponto livre.
  _findBossSpawnPosition() {
    const bounds = this.mapManager.getWorldBounds();
    const margin = 96;
    const view = this._currentCameraView();
    const aim = this.player.getAimDirection?.() ?? { x: 0, y: 1 };
    const baseAngle = Math.atan2(aim.y, aim.x);
    const px = this.player.x;
    const py = this.player.y;

    let fallback = null;
    for (const offsetDeg of BOSS_SPAWN_ANGLE_OFFSETS_DEG) {
      const angle = baseAngle + Phaser.Math.DegToRad(offsetDeg);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      // distância do jogador até a borda da câmera nessa direção
      const tx = dx > 1e-4 ? (view.right - px) / dx : dx < -1e-4 ? (px - view.x) / -dx : Infinity;
      const ty = dy > 1e-4 ? (view.bottom - py) / dy : dy < -1e-4 ? (py - view.y) / -dy : Infinity;
      const edge = Math.max(0, Math.min(tx, ty));
      const maxDist = Math.max(edge * 0.85, BOSS_SPAWN_MIN_DISTANCE);
      const dist = Phaser.Math.Clamp(edge * BOSS_SPAWN_VIEW_FRACTION, BOSS_SPAWN_MIN_DISTANCE, maxDist);
      const x = px + dx * dist;
      const y = py + dy * dist;

      const insideMap = x >= margin && x <= bounds.width - margin && y >= margin && y <= bounds.height - margin;
      if (insideMap && !this._isBlockedByWall(x, y, BOSS_SPAWN_CLEARANCE)) return { x, y };
      if (!fallback && insideMap) fallback = { x, y };
    }
    if (fallback) return fallback;
    return this._findSpawnPosition(); // mapa minúsculo: cai no spawn normal
  }

  // true se há tile de parede no ponto ou a `radius` px dele (4 direções)
  _isBlockedByWall(x, y, radius) {
    const layer = this.mapManager.wallsLayer;
    if (!layer) return false;
    return [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].some(([ox, oy]) => {
      const tile = layer.getTileAtWorldXY(x + ox, y + oy);
      return tile != null && tile.index > 0;
    });
  }

  // Evento do Boss (ver SpawnDirector._checkBossSchedule): manda todo
  fleeAll() {
    const alive = this.group.getChildren().filter((e) => e.active);
    alive.forEach((enemy) => enemy.flee(this.player));
    return alive.length;
  }

  // Cheat (DevConsole "killall"): mata todos os inimigos vivos AGORA,
  killAll() {
    const alive = this.group.getChildren().filter((e) => e.active);
    alive.forEach((enemy) => enemy.die());
    return alive.length;
  }

  // Escolhe um ponto fora da área visível da câmera, ao redor do jogador.
  _findSpawnPosition(baseAngle = null) {
    const bounds = this.mapManager.getWorldBounds();
    const margin = 64; // nunca nasce colado na borda do mapa
    const view = this._currentCameraView();
    const viewMargin = SPAWN_MARGIN_BEYOND_VIEW;
    const activeTargets = (this.scene.multiplayer?.getEnemyTargets() ?? [this.player])
      .filter((target) => target.active && !target.healthSystem?.isDead());
    const spawnOrigins = activeTargets.map((target) => {
      if (target === this.player) {
        return {
          x: target.x,
          y: target.y,
          width: view.width,
          height: view.height
        };
      }
      return {
        x: target.x,
        y: target.y,
        width: target.cameraViewWidth || view.width,
        height: target.cameraViewHeight || view.height
      };
    });
    if (spawnOrigins.length === 0) {
      spawnOrigins.push({ x: this.player.x, y: this.player.y, width: view.width, height: view.height });
    }
    const views = spawnOrigins.map(({ x, y, width, height }) => new Phaser.Geom.Rectangle(
      x - width / 2 - viewMargin,
      y - height / 2 - viewMargin,
      width + viewMargin * 2,
      height + viewMargin * 2
    ));
    // metade da diagonal da câmera + margem: distância mínima do jogador
    const spreadRad = Phaser.Math.DegToRad(GROUP_SPREAD_DEG);

    for (let attempt = 0; attempt < 32; attempt++) {
      const origin = spawnOrigins[attempt % spawnOrigins.length];
      const minDist = Math.hypot(origin.width, origin.height) / 2 + SPAWN_MARGIN_BEYOND_VIEW;
      const angle = baseAngle == null
        ? Phaser.Math.FloatBetween(0, Math.PI * 2)
        : baseAngle + Phaser.Math.FloatBetween(-spreadRad, spreadRad);

      // Não spawna todo o grupo no mesmo arco perfeito. Distância radial +
      // deslocamento tangencial evitam principalmente a "linha no teto" quando
      // muitos inimigos vêm de cima e a posição seria clampada na borda do mapa.
      const spawnDist = minDist + Phaser.Math.FloatBetween(0, SPAWN_RADIAL_JITTER);
      const tangent = Phaser.Math.FloatBetween(-SPAWN_TANGENT_JITTER, SPAWN_TANGENT_JITTER);
      const rawX = origin.x + Math.cos(angle) * spawnDist - Math.sin(angle) * tangent;
      const rawY = origin.y + Math.sin(angle) * spawnDist + Math.cos(angle) * tangent;
      const x = Phaser.Math.Clamp(rawX, margin, bounds.width - margin);
      const y = Phaser.Math.Clamp(rawY, margin, bounds.height - margin);

      if (!views.some((playerView) => playerView.contains(x, y))) {
        return { x, y };
      }
    }

    // fallback: mapa pequeno demais pra caber um ponto fora da visão em
    const fallbackOrigin = spawnOrigins[0];
    const fallbackMinDist = Math.hypot(fallbackOrigin.width, fallbackOrigin.height) / 2 +
      SPAWN_MARGIN_BEYOND_VIEW;
    const fallbackDist = Math.min(fallbackMinDist, Math.hypot(bounds.width, bounds.height) / 2);
    const angle = baseAngle == null ? Phaser.Math.FloatBetween(0, Math.PI * 2) : baseAngle;
    return {
      x: Phaser.Math.Clamp(fallbackOrigin.x + Math.cos(angle) * fallbackDist, margin, bounds.width - margin),
      y: Phaser.Math.Clamp(fallbackOrigin.y + Math.sin(angle) * fallbackDist, margin, bounds.height - margin)
    };
  }

  // Retângulo da área visível da câmera agora, calculado na mão a partir
  _currentCameraView() {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    return new Phaser.Geom.Rectangle(cam.scrollX, cam.scrollY, cam.width / zoom, cam.height / zoom);
  }

  // Chamado no update da GameScene: faz todos perseguirem o jogador com
  updateAll(nowMs) {
    const speedMultiplier = this.scene.slowmoSystem?.getEnemySpeedMultiplier(nowMs) ?? 1;
    const children = this.group.getChildren();
    const active = this.activeEnemies;
    active.length = 0;
    for (const enemy of children) {
      if (enemy.active) active.push(enemy);
    }
    const activeCount = active.length;
    const targets = (this.scene.multiplayer?.getEnemyTargets() ?? [this.player])
      .filter((target) => target.active && !target.healthSystem?.isDead());
    const stride = activeCount > 600 ? AI_STRIDE_EXTREME
      : activeCount > 300 ? AI_STRIDE_HIGH
      : activeCount > COLLISION_LIMIT ? AI_STRIDE_MEDIUM
      : 1;
    const denseBattle = activeCount > COLLISION_LIMIT;
    if (denseBattle !== this.denseBattle) {
      for (const enemy of active) {
        const isSpecial = enemy.def.elite || enemy.def.sealer || enemy.def.boss || enemy.def.special || enemy.def.event;
        enemy.shadow?.setVisible(!denseBattle || isSpecial);
      }
      this.denseBattle = denseBattle;
    }
    // A separação do enxame substitui as colisões físicas quando a horda fica grande.
    // O collider Arcade entre centenas de corpos fica caro; acima de 64 usamos
    // apenas o grid espacial + correção local do SwarmSystem.
    if (this.enemyCollisionCollider) this.enemyCollisionCollider.active = activeCount <= COLLISION_LIMIT;
    this.updateFrame += 1;
    this.swarmSystem.rebuild(active);
    const view = this._currentCameraView();
    const abandonmentDistance = Math.hypot(view.width, view.height) / 2 + SPAWN_MARGIN_BEYOND_VIEW + ABANDONED_DISTANCE_MARGIN;

    for (const enemy of active) {
      if (targets.length === 0) continue;
      let target = targets[0];
      let nearestDistanceSq = (enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2;
      for (let i = 1; i < targets.length; i++) {
        const candidate = targets[i];
        const dx = enemy.x - candidate.x;
        const dy = enemy.y - candidate.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < nearestDistanceSq) {
          nearestDistanceSq = distanceSq;
          target = candidate;
        }
      }
      if (this.frozen) {
        enemy.setVelocity(0, 0);
      } else if (
        stride === 1 ||
        enemy.def.elite ||
        enemy.def.sealer ||
        enemy.def.boss ||
        enemy.def.special ||
        enemy.def.event ||
        this.updateFrame % stride === enemy.aiUpdatePhase % stride
      ) {
        const moveDir = this.swarmSystem.computeMoveDir(enemy, target);
        enemy.chase(target, nowMs, speedMultiplier, moveDir);
        enemy.updateFacing(nowMs);
        enemy.updateAnimState();
        if (enemy.updateAbandonment(target, nowMs, abandonmentDistance)) continue;
      }
      if (target !== this.player) {
        const contactRange = (enemy.body?.radius || 20) + (target.body?.radius || 30);
        if (Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y) <= contactRange) {
          DamageSystem.applyContactDamage(
            enemy,
            target,
            enemy.def.contactDamage,
            enemy.def.contactCooldownMs,
            nowMs
          );
        }
      }
      enemy.updateBleed(nowMs);
    }

    // Resolve sobreposições DEPOIS de todos definirem a velocity. O método usa
    // o mesmo spatial hash reconstruído acima, processa apenas vizinhos locais
    // e cada par só uma vez. Mantém a horda encorpada sem virar uma pilha.
    if (!this.frozen && active.length > 1) this.swarmSystem.resolveOverlaps(active);
  }

  // Cheat (DevConsole "freeze"): liga/desliga o congelamento de todos os…
  toggleFrozen() {
    this.frozen = !this.frozen;
    return this.frozen;
  }
}
