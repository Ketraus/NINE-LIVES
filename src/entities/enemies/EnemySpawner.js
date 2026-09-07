import Enemy from './Enemy.js';
import SwarmSystem from './SwarmSystem.js';

const DEFAULT_MAX_ALIVE = 14; // trava inicial da quantidade simultânea, até o SpawnDirector assumir o…
// Quanto além da borda da câmera o inimigo precisa nascer pra garantir…
const SPAWN_MARGIN_BEYOND_VIEW = 80;

// "Vibrada" na tela quando o Elite nasce — feedback bem besta de propós…
const ELITE_SPAWN_SHAKE_MS = 300;
const ELITE_SPAWN_SHAKE_INTENSITY = 0.015;

// Entrada do Boss (ver _playBossEntranceFx): nasce pequeno e "estoura"…
const BOSS_ENTRANCE_SCALE_START_FACTOR = 0.25; // fração do tamanho final em que ele nasce
const BOSS_ENTRANCE_SCALE_DURATION_MS = 420;
const BOSS_ENTRANCE_RING_MAX_RADIUS = 260;
const BOSS_ENTRANCE_RING_DURATION_MS = 500;

// Fatias de 360° ao redor do jogador usadas pra decidir "de que lado" c…
const SPAWN_SECTOR_COUNT = 8;
// Quanto espalhar o ângulo de cada inimigo DENTRO do grupo (pra não nas…
const GROUP_SPREAD_DEG = 18;
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
    this.swarmSystem = new SwarmSystem(flockingConfig);

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
    const pos = def.sealer ? this._findSealerSpawnPosition(def) : this._findSpawnPosition(baseAngle);
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
  _createAt(def, pos) {
    const enemy = new Enemy(this.scene, pos.x, pos.y, def);
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
      this._createAt(def, def.sealer ? this._findSealerSpawnPosition(def) : this._findSpawnPosition());
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
    // metade da diagonal da câmera + margem: distância mínima do jogador
    const minDist = Math.hypot(view.width, view.height) / 2 + SPAWN_MARGIN_BEYOND_VIEW;
    const spreadRad = Phaser.Math.DegToRad(GROUP_SPREAD_DEG);

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = baseAngle == null
        ? Phaser.Math.FloatBetween(0, Math.PI * 2)
        : baseAngle + Phaser.Math.FloatBetween(-spreadRad, spreadRad);
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * minDist, margin, bounds.width - margin);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * minDist, margin, bounds.height - margin);

      // se o mapa for pequeno (ou o jogador estiver perto da borda), o
      if (!view.contains(x, y)) {
        return { x, y };
      }
    }

    // fallback: mapa pequeno demais pra caber um ponto fora da visão em
    const fallbackDist = Math.min(minDist, Math.hypot(bounds.width, bounds.height) / 2);
    const angle = baseAngle == null ? Phaser.Math.FloatBetween(0, Math.PI * 2) : baseAngle;
    return {
      x: Phaser.Math.Clamp(this.player.x + Math.cos(angle) * fallbackDist, margin, bounds.width - margin),
      y: Phaser.Math.Clamp(this.player.y + Math.sin(angle) * fallbackDist, margin, bounds.height - margin)
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
    const active = this.group.getChildren().filter((e) => e.active);
    this.swarmSystem.rebuild(active);

    active.forEach((enemy) => {
      if (this.frozen) {
        enemy.setVelocity(0, 0);
      } else {
        const moveDir = this.swarmSystem.computeMoveDir(enemy, this.player);
        enemy.chase(this.player, nowMs, speedMultiplier, moveDir);
        enemy.updateFacing();
        enemy.updateAnimState();
      }
      enemy.updateBleed(nowMs);
    });
  }

  // Cheat (DevConsole "freeze"): liga/desliga o congelamento de todos os…
  toggleFrozen() {
    this.frozen = !this.frozen;
    return this.frozen;
  }
}
