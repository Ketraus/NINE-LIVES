import VictoryAudio from './VictoryAudio.js';

// CENA 03 do roteiro — "A SEGUNDA PANCADA" (~10:10). Começa a contar quando o
// silêncio pós-pancada se instala (VictoryImpact chama start() junto com as
// partículas azuis) e, ~5 s depois, play():
//
//   SOM      "VOOOOOOM... KRRRUUUUM" (VictoryAudio.playSecondQuake): mais longa
//            e mais grave que a primeira, sem corte seco; por baixo entra o
//            drone grave e quase orgânico (VictoryAudio.startDrone) — "algo
//            gigantesco se movendo muito longe".
//   CÂMERA   tranco forte + segundo golpe 1,05 s depois, decaindo — mas o
//            tremor NÃO volta a zero: sobra uma vibração quase imperceptível
//            (RESIDUAL_SHAKE). O nível vira scene.victoryShakeFloor, que o
//            VictoryTremor respeita como piso quando assume a câmera.
//   LUZ      o mundo esfria aos poucos (HUD.setColdGrade: azul profundo, sombras
//            escuras) e oscila no instante de cada golpe; reflexos ciano
//            atravessam o terreno.
//   CORRUPÇÃO a energia violeta dos inimigos pulsa em intervalos irregulares e
//            algumas máquinas dão falhas luminosas (às vezes várias juntas, como
//            se respondessem a um sinal que ninguém ouve) — reação involuntária,
//            nada de reverência: eles continuam parados.
//   PARTÍCULAS as azuis seguem subindo, agora em maior quantidade
//            (VictoryParticles.surgeDensity).
//
// stop() (chamado pelo VictoryTremor.stop no instante de silêncio antes do
// impacto final) corta vibração e efeitos nos inimigos; a luz fria fica.

const THUMP_DELAY_MS = 5000; // contado do corte sonoro da 1ª pancada (~10:05) -> ~10:10

// tremor da câmera: envelope contínuo (intensidade como fração da tela)
const RESIDUAL_SHAKE = 0.0012; // a vibração "quase imperceptível" que permanece
const BASE_SHAKE = 0.011;
const BASE_TAU_MS = 2200;
const HIT1 = { at: 0, peak: 0.05, tau: 480, kick: 1 }; // VOOOOM
const HIT2 = { at: 1050, peak: 0.042, tau: 650, kick: 1 }; // KRRRUUUM
// A 3ª e a 4ª pancadas (Cena 04) entram como golpes extras via addHit()
const KICK_TAU_MS = 420;
const SHAKE_REFRESH_MS = 90;
const SHAKE_PULSE_MS = 140;
const FEAR = 0.2; // estremecer de fundo dos corpos parados (era 0,12 após a 1ª pancada)

// luz
const COLD_RAMP_MS = 9000; // "adquire gradualmente um aspecto mais frio"
const COLD_MAX_START = 0.75; // sobe na travessia (as sombras se aprofundam) e deixa folga pra luz oscilar nos golpes
const DEPARTURE_DELAY_MS = 7000; // ~10:10 -> ~10:17: a câmera começa a se modificar (VictoryDeparture)
const COLD_KICK = 0.35; // a luz oscila (escurece e esfria mais) a cada golpe

// partículas: "agora em maior quantidade"
const PARTICLE_SURGE_MULT = 2;
const PARTICLE_SURGE_MS = 6000;

// corrupção violeta (pulsos globais, cada inimigo reage com atraso próprio)
const PULSE_START_MS = 700;
const PULSE_MIN_MS = 700;
const PULSE_MAX_MS = 2300;
const PULSE_CHANCE = 0.6; // fração dos inimigos visíveis que reage a cada pulso
const PULSE_SPREAD_MS = 240; // atraso aleatório por inimigo (onda irregular)
const PULSE_STEPS = [
  { color: 0xd2a8ff, ms: 90 },
  { color: 0xa24dff, ms: 150 }
];
// "pulsos cada vez mais intensos" (travessia): mais fortes, mais longos, mais frequentes
const PULSE_STEPS_STRONG = [
  { color: 0xe6ccff, ms: 70 },
  { color: 0x8a2dff, ms: 210 },
  { color: 0xc59bff, ms: 90 }
];

// falhas luminosas das máquinas
const GLITCH_START_MS = 1300;
const GLITCH_MIN_MS = 350;
const GLITCH_MAX_MS = 1400;
const GLITCH_GROUP_CHANCE = 0.25; // às vezes vários juntos ("respondem a um sinal")
const GLITCH_STEPS = [
  { color: 0xd6f6ff, fill: true, ms: 55 },
  { color: null, ms: 45 },
  { color: 0x7fe0ff, fill: true, ms: 50 }
];

// reflexos ciano no terreno
const GLINT_KEY = 'victory_glint';
const GLINT_START_MS = 1800;
const GLINT_MIN_MS = 900;
const GLINT_MAX_MS = 2600;
const GLINT_MAX_ALIVE = 3;
const GLINT_DEPTH = 9; // acima das camadas do mapa (depth = índice), logo abaixo do jogador (10)
const GLINT_TINTS = [0x4fd0ff, 0x7fe6ff, 0x3aa8ff];

const VIEW_PAD = 40;

export default class VictorySecondThump {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    this.played = false;
    this.stopped = false;
    this.t = 0; // ms desde a pancada
    this.kick = 0; // 1 -> 0 depois de cada golpe
    this._hits = [{ ...HIT1 }, { ...HIT2 }];
    this.coldMax = COLD_MAX_START; // 0..1, VictoryDeparture sobe durante a travessia
    this.corruptionBoost = 0; // 0..1, VictoryDeparture sobe durante a travessia
    this.shakeLevel = 0;
    this._nextShakeAt = 0;
    this._nextPulseAt = PULSE_START_MS;
    this._nextGlitchAt = GLITCH_START_MS;
    this._nextGlintAt = GLINT_START_MS;
    this._glints = 0;
  }

  // agenda a pancada (uma vez só)
  start() {
    if (this.started) return;
    this.started = true;
    this.scene.time.delayedCall(THUMP_DELAY_MS, () => this.play());
  }

  play() {
    const scene = this.scene;
    if (this.played || scene.isGameOver) return;
    this.played = true;
    this.t = 0;
    this._ensureGlintTexture();

    VictoryAudio.playSecondQuake(scene);
    VictoryAudio.startDrone(scene, 7000); // o ruído grave que passa a preencher o ambiente
    scene.victoryResidualFear = FEAR;
    scene.victoryParticles?.surgeDensity(PARTICLE_SURGE_MULT, PARTICLE_SURGE_MS);
    scene.time.delayedCall(DEPARTURE_DELAY_MS, () => scene.victoryDeparture?.start()); // CENA 04
  }

  // golpe extra (3ª e 4ª pancadas): tranco da câmera, luz que oscila e corpos estremecendo
  addHit({ peak, tau, kick = 1 }) {
    if (!this.played || this.stopped) return;
    this._hits.push({ at: this.t, peak, tau, kick });
  }

  // vibração e efeitos nos inimigos param (a luz fria fica)
  stop() {
    this.stopped = true;
    this.scene.victoryShakeFloor = 0;
  }

  // chamado todo frame pela GameScene (não roda com o jogo pausado)
  update(delta) {
    if (!this.played) return;
    const scene = this.scene;
    this.t += Math.min(delta, 100);
    const t = this.t;

    let kick = 0;
    this._hits.forEach((h) => {
      if (t >= h.at) kick = Math.max(kick, h.kick * Math.exp(-(t - h.at) / KICK_TAU_MS));
    });
    this.kick = kick;

    // luz fria: sobe devagar e oscila nos golpes
    const ramp = Phaser.Math.Clamp(t / COLD_RAMP_MS, 0, 1);
    const cold = ramp * ramp * (3 - 2 * ramp) * this.coldMax;
    scene.hud?.setColdGrade(Math.min(1, cold + this.kick * COLD_KICK));

    if (this.stopped) return;

    this._updateShake(t);
    this._updateFear();

    const boost = this.corruptionBoost;
    if (t >= this._nextPulseAt) {
      this._nextPulseAt = t + Phaser.Math.Between(PULSE_MIN_MS, PULSE_MAX_MS) * Phaser.Math.Linear(1, 0.45, boost);
      this._corruptionPulse();
    }
    if (t >= this._nextGlitchAt) {
      this._nextGlitchAt = t + Phaser.Math.Between(GLITCH_MIN_MS, GLITCH_MAX_MS) * Phaser.Math.Linear(1, 0.4, boost);
      this._glitch();
    }
    if (t >= this._nextGlintAt) {
      this._nextGlintAt = t + Phaser.Math.Between(GLINT_MIN_MS, GLINT_MAX_MS);
      this._spawnGlint();
    }
  }

  // envelope: dois golpes + base que decai até a vibração residual (que fica)
  _updateShake(t) {
    const scene = this.scene;
    let level = RESIDUAL_SHAKE + BASE_SHAKE * Math.exp(-t / BASE_TAU_MS);
    this._hits.forEach((h) => {
      if (t >= h.at) level += h.peak * Math.exp(-(t - h.at) / h.tau);
    });
    this.shakeLevel = level;
    scene.victoryShakeFloor = level; // o VictoryTremor usa como piso quando assume

    // enquanto o VictoryTremor não está balançando a câmera, quem pulsa é esta classe
    if (!scene.victoryTremor?.shaking && t >= this._nextShakeAt) {
      this._nextShakeAt = t + SHAKE_REFRESH_MS;
      scene.cameras.main.shake(SHAKE_PULSE_MS, level, true);
    }
  }

  // os corpos parados estremecem junto com cada golpe
  _updateFear() {
    const scene = this.scene;
    const tremor = scene.victoryTremor;
    if (tremor?.active) {
      tremor.kick = Math.max(tremor.kick, this.kick);
    } else {
      scene.victoryTremorKick = this.kick;
      scene.victoryTremorLevel = Math.max(scene.victoryTremorLevel || 0, FEAR);
    }
  }

  // ---------- corrupção violeta e falhas ----------

  _visibleEnemies() {
    const view = this.scene.cameras.main.worldView;
    return this.scene.enemySpawner.group.getChildren().filter((e) => (
      e.active
      && !e.def?.boss // o Minotauro é imune a qualquer efeito visual de status
      && e.x > view.x - VIEW_PAD && e.x < view.right + VIEW_PAD
      && e.y > view.y - VIEW_PAD && e.y < view.bottom + VIEW_PAD
    ));
  }

  _corruptionPulse() {
    const chance = Phaser.Math.Linear(PULSE_CHANCE, 0.95, this.corruptionBoost);
    const steps = this.corruptionBoost > 0.4 ? PULSE_STEPS_STRONG : PULSE_STEPS;
    this._visibleEnemies().forEach((enemy) => {
      if (Math.random() > chance) return;
      this.scene.time.delayedCall(Phaser.Math.Between(0, PULSE_SPREAD_MS), () => {
        if (!this.stopped) this._tintSequence(enemy, steps);
      });
    });
  }

  _glitch() {
    const list = this._visibleEnemies();
    if (!list.length) return;
    const count = Math.random() < Phaser.Math.Linear(GLITCH_GROUP_CHANCE, 0.5, this.corruptionBoost)
      ? Phaser.Math.Between(4, 7)
      : Phaser.Math.Between(1, 3);
    Phaser.Utils.Array.Shuffle(list).slice(0, count).forEach((enemy) => this._tintSequence(enemy, GLITCH_STEPS));
  }

  // aplica uma sequência de tints e devolve o tint normal do inimigo no fim
  _tintSequence(enemy, steps) {
    if (!enemy.active || enemy._victoryFxBusy) return;
    enemy._victoryFxBusy = true;
    let i = 0;
    const run = () => {
      if (!enemy.active) {
        enemy._victoryFxBusy = false;
        return;
      }
      if (i >= steps.length) {
        this._restoreTint(enemy);
        enemy._victoryFxBusy = false;
        return;
      }
      const step = steps[i++];
      if (step.color === null) this._restoreTint(enemy);
      else if (step.fill) enemy.setTintFill(step.color);
      else enemy.setTint(step.color);
      this.scene.time.delayedCall(step.ms, run);
    };
    run();
  }

  _restoreTint(enemy) {
    enemy.clearTint();
    enemy._currentStatusTint = null; // força o tint de status/cor do tipo a voltar
    enemy._refreshStatusTint?.(this.scene.time.now);
  }

  // ---------- reflexos ciano no terreno ----------

  _spawnGlint() {
    if (this._glints >= GLINT_MAX_ALIVE) return;
    const scene = this.scene;
    const view = scene.cameras.main.worldView;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = view.y + view.height * Phaser.Math.FloatBetween(0.1, 0.95);
    const x0 = dir > 0
      ? view.x + view.width * Phaser.Math.FloatBetween(0, 0.4)
      : view.right - view.width * Phaser.Math.FloatBetween(0, 0.4);
    const travel = view.width * Phaser.Math.FloatBetween(0.45, 0.8);
    const duration = Phaser.Math.Between(1400, 2300);

    const img = scene.add.image(x0, y, GLINT_KEY)
      .setDepth(GLINT_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom(GLINT_TINTS))
      .setAlpha(0)
      .setScale(Phaser.Math.FloatBetween(1.4, 2.8), Phaser.Math.FloatBetween(0.5, 1))
      .setRotation(Phaser.Math.FloatBetween(-0.12, 0.12));
    this._glints++;
    scene.tweens.add({ targets: img, x: x0 + dir * travel, duration, ease: 'Sine.easeInOut' });
    scene.tweens.add({
      targets: img,
      alpha: Phaser.Math.FloatBetween(0.3, 0.55),
      duration: duration / 2,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        img.destroy();
        this._glints--;
      }
    });
  }

  // risco horizontal fino, com as pontas dissolvendo
  _ensureGlintTexture() {
    const scene = this.scene;
    if (scene.textures.exists(GLINT_KEY)) return;
    const w = 96;
    const h = 8;
    const tex = scene.textures.createCanvas(GLINT_KEY, w, h);
    const ctx = tex.getContext();
    const horizontal = ctx.createLinearGradient(0, 0, w, 0);
    horizontal.addColorStop(0, 'rgba(255,255,255,0)');
    horizontal.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    horizontal.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const vertical = ctx.createLinearGradient(0, 0, 0, h);
    vertical.addColorStop(0, 'rgba(255,255,255,0)');
    vertical.addColorStop(0.5, 'rgba(255,255,255,1)');
    vertical.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }
}
