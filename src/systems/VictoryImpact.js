import EventBus from './EventBus.js';
import MusicManager from './MusicManager.js';
import VictoryAudio from './VictoryAudio.js';

// CENA 01 do roteiro — "O ÚLTIMO SEGUNDO". Aos 10:00 o jogo segue normal por
// ~1 s (ver GameScene._beginVictorySequence) e então esta pancada colossal
// atravessa o mundo:
//
//   SOM      massa gigante se deslocando (VictoryAudio.playQuake) e, ~1,3 s
//            depois, o CORTE SONORO seco — silêncio absoluto.
//   MÚSICA   interrompida no mesmo frame.
//   CÂMERA   tranco violento em 3 estágios (forte -> médio -> resíduo).
//   LUZ      clarão + quedas de luz oscilando (HUD.playImpactFlicker).
//   ONDA     anéis de choque saem do gato; cada inimigo clareia no instante
//            em que a onda passa por ele.
//   TERRENO  poeira fria e fragmentos que saltam do chão e caem, mais um fio
//            de detritos descendo logo depois.
//   MUNDO    inimigos, ataques, spawn e o protagonista PARAM; nenhum dano.
//            Um estremecer residual fica nos corpos parados.

// A pancada vem do MAR (norte): a frente de choque nasce fora da câmera, na
// direção do mar, e atravessa a tela até o gato. WAVE_ORIGIN_DIST é a
// distância do centro da onda até o gato; ela chega nele em ~ORIGIN/SPEED ms.
const WAVE_ORIGIN_DIST = 1500;
const WAVE_SPEED = 2.1; // px por ms
const WAVE_TAIL = 1300; // quanto a onda segue depois de passar pelo gato
const WAVE_MAX_RADIUS = WAVE_ORIGIN_DIST + WAVE_TAIL;
const WAVE_MS = WAVE_MAX_RADIUS / WAVE_SPEED;
const ARRIVE_MS = WAVE_ORIGIN_DIST / WAVE_SPEED;
const PRE_TREMOR_MS = 320; // tremorzinho antes da onda chegar
const SOUND_END_AFTER_MS = 3400; // deixa o som da pancada terminar inteiro antes do corte
const SHAKE_STAGES = [
  { at: 0, ms: 420, intensity: 0.065 },
  { at: 420, ms: 560, intensity: 0.03 },
  { at: 980, ms: 900, intensity: 0.011 }
];
const CHIP_COLORS = [0x6b6256, 0x4d4a45, 0x8a8478, 0x3a3a40, 0x9a8f7c];
const CHIP_TEXTURE = 'victory_chip';
const DUST_TEXTURE = 'victory_dust';
const RESIDUAL_FEAR = 0.12;
const FEAR_DECAY_MS = 2200;

export default class VictoryImpact {
  constructor(scene) {
    this.scene = scene;
    this.played = false;
  }

  play() {
    if (this.played) return;
    this.played = true;
    const scene = this.scene;
    const cam = scene.cameras.main;
    const origin = this._waveOrigin();

    // 1) a onda vem do mar, de fora da câmera (a música ainda toca)
    this._shockwave(origin.x, origin.y);
    this._flashEnemiesAsWavePasses(origin.x, origin.y);
    scene.time.delayedCall(Math.max(0, ARRIVE_MS - PRE_TREMOR_MS), () => cam.shake(PRE_TREMOR_MS, 0.004, true));

    // 2) a onda alcança o gato: AÍ é a pancada
    scene.time.delayedCall(ARRIVE_MS, () => this._impact(cam));
  }

  // centro da onda: fora da câmera, na direção do mar (ponto do Tiled) a partir do gato
  _waveOrigin() {
    const scene = this.scene;
    const player = scene.player;
    const map = scene.mapManager;
    const sea = map?.getFinalCameraTarget?.() || map?.getNorthCoastCenter?.();
    let dx = 0;
    let dy = -1;
    if (sea) {
      const len = Math.hypot(sea.x - player.x, sea.y - player.y);
      if (len > 1) {
        dx = (sea.x - player.x) / len;
        dy = (sea.y - player.y) / len;
      }
    }
    return { x: player.x + dx * WAVE_ORIGIN_DIST, y: player.y + dy * WAVE_ORIGIN_DIST };
  }

  _impact(cam) {
    const scene = this.scene;
    if (scene.isGameOver) return;
    this._freezeWorld();
    MusicManager.cutAll(scene);
    VictoryAudio.playQuake(scene);
    this._shake(cam);
    scene.hud?.playImpactFlicker();
    this._flashPlayer();
    this._terrainDebris(cam);
    this._residualFear();

    // CORTE SONORO: só depois que o som da pancada termina por inteiro
    scene.time.delayedCall(SOUND_END_AFTER_MS, () => {
      VictoryAudio.cutQuake();
      scene.sound.stopAll();
    });
  }

  // tudo o que "para" no instante da pancada (era o _beginVictorySequence do passo 1-2)
  _freezeWorld() {
    const scene = this.scene;
    scene.enemiesDisarmed = true; // lido por DamageSystem._isDisarmedEnemyHit
    scene.playerAttacksDisabled = true; // lido por DamageSystem/Weapon/Shuriken
    scene.playerFrozen = true; // lido por Player.update
    scene.weaponManager?.disable();
    scene.abilityManager?.suspendAll();
    scene.enemySpawner.haltAll();
    EventBus.emit('victory-impact');
  }

  _shake(cam) {
    SHAKE_STAGES.forEach(({ at, ms, intensity }) => {
      if (at === 0) cam.shake(ms, intensity, true);
      else this.scene.time.delayedCall(at, () => cam.shake(ms, intensity, true));
    });
  }

  // frentes de choque (aditivas, azul-gelo) saindo do mar: círculos grandes
  // de centro fora da tela, então na câmera aparecem como arcos varrendo o chão
  _shockwave(x, y) {
    const scene = this.scene;
    const ring = (delayMs, color, width, alpha) => {
      const g = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
      const state = { r: 0 };
      scene.tweens.add({
        targets: state,
        r: WAVE_MAX_RADIUS,
        delay: delayMs,
        duration: WAVE_MS,
        ease: 'Linear',
        onUpdate: () => {
          const fade = Math.pow(1 - state.r / WAVE_MAX_RADIUS, 1.2);
          g.clear();
          g.lineStyle(width * 4.5, color, 0.12 * alpha * fade); // halo largo
          g.strokeCircle(x, y, state.r);
          g.lineStyle(width, color, alpha * fade); // núcleo
          g.strokeCircle(x, y, state.r);
        },
        onComplete: () => g.destroy()
      });
    };
    ring(0, 0xbfe6ff, 26, 0.95);
    ring(110, 0xffffff, 10, 0.7);
  }

  // cada inimigo "acende" por ~100 ms quando a onda alcança a posição dele
  _flashEnemiesAsWavePasses(x, y) {
    const scene = this.scene;
    const speed = WAVE_SPEED;
    scene.enemySpawner.group.getChildren().forEach((enemy) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist > WAVE_MAX_RADIUS) return;
      scene.time.delayedCall(dist / speed, () => {
        if (!enemy.active) return;
        enemy.setTintFill(0xffffff);
        scene.time.delayedCall(100, () => {
          if (!enemy.active) return;
          enemy.clearTint();
          enemy._currentStatusTint = null; // força o tint de status/cor do tipo a voltar
          enemy._refreshStatusTint?.(scene.time.now);
        });
      });
    });
  }

  _flashPlayer() {
    const scene = this.scene;
    const player = scene.player;
    player.setTintFill(0xffffff);
    scene.time.delayedCall(110, () => player.active && player.clearTint());
  }

  _ensureTextures() {
    const scene = this.scene;
    if (!scene.textures.exists(CHIP_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
      g.generateTexture(CHIP_TEXTURE, 4, 4);
      g.destroy();
    }
    if (!scene.textures.exists(DUST_TEXTURE)) {
      const tex = scene.textures.createCanvas(DUST_TEXTURE, 64, 64);
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      tex.refresh();
    }
  }

  // poeira fria e pedaços do chão saltando pela área visível, depois um fio
  // de detritos caindo do topo da tela
  _terrainDebris(cam) {
    const scene = this.scene;
    this._ensureTextures();
    const view = cam.worldView;
    const area = new Phaser.Geom.Rectangle(view.x - 60, view.y - 60, view.width + 120, view.height + 120);
    const pickChipColor = () => Phaser.Utils.Array.GetRandom(CHIP_COLORS);
    const killLater = (emitter, ms) => scene.time.delayedCall(ms, () => emitter.destroy());

    const dust = scene.add.particles(0, 0, DUST_TEXTURE, {
      emitZone: { type: 'random', source: area },
      lifespan: { min: 1800, max: 3400 },
      speed: { min: 20, max: 90 },
      angle: { min: 0, max: 360 },
      alpha: { start: 0.5, end: 0 },
      scale: { start: 0.9, end: 2.8 },
      tint: { onEmit: () => (Math.random() < 0.5 ? 0x9aa3b2 : 0x7e8796) },
      emitting: false
    }).setDepth(15);
    dust.explode(75);
    killLater(dust, 3800);

    const chips = scene.add.particles(0, 0, CHIP_TEXTURE, {
      emitZone: { type: 'random', source: area },
      lifespan: { min: 900, max: 1800 },
      speedX: { min: -90, max: 90 },
      speedY: { min: -460, max: -140 },
      gravityY: 950,
      rotate: { start: 0, end: 540 },
      scale: { min: 0.8, max: 2 },
      alpha: { start: 1, end: 0 },
      tint: { onEmit: pickChipColor },
      emitting: false
    }).setDepth(16);
    chips.explode(120);
    killLater(chips, 2200);

    // chuvisco de detritos: cai do topo da tela por ~2,6 s
    const trickle = scene.add.particles(0, 0, CHIP_TEXTURE, {
      emitZone: { type: 'random', source: new Phaser.Geom.Line(view.x, view.y - 24, view.right, view.y - 24) },
      lifespan: 1900,
      speedY: { min: 60, max: 150 },
      speedX: { min: -20, max: 20 },
      gravityY: 220,
      rotate: { start: 0, end: 360 },
      scale: { min: 0.6, max: 1.4 },
      alpha: { start: 0.9, end: 0 },
      tint: { onEmit: pickChipColor },
      frequency: 22,
      quantity: 1,
      duration: 2600
    }).setDepth(16);
    killLater(trickle, 5200);
  }

  // os corpos parados continuam estremecendo (VictoryTremor.update respeita esse piso)
  _residualFear() {
    const scene = this.scene;
    scene.victoryResidualFear = RESIDUAL_FEAR;
    const state = { level: 1, kick: 1 };
    scene.victoryTremorLevel = 1;
    scene.victoryTremorKick = 1;
    scene.tweens.add({
      targets: state,
      level: RESIDUAL_FEAR,
      kick: 0,
      duration: FEAR_DECAY_MS,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        // se o VictoryTremor já assumiu, ele é quem manda
        if (scene.victoryTremor?.active) return;
        scene.victoryTremorLevel = state.level;
        scene.victoryTremorKick = state.kick;
      }
    });
  }
}
