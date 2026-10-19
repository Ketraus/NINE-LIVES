// CENA 02 do roteiro — partículas azuis que SOBEM. Começam no silêncio depois
// da pancada (VictoryImpact chama start() no corte sonoro) e seguem até a cena
// acabar:
//
//   "Uma. Duas. Dezenas. Centenas." — a densidade nasce quase imperceptível e
//   cresce até o ambiente inteiro ter o fenômeno (curva em RAMP_MS).
//   Não caem como poeira: sobem devagar, acelerando de leve ao longo da vida,
//   como se algo puxasse a essência do mundo pra cima.
//   Tons de azul profundo com ciano discreto, pontos minúsculos e levemente
//   luminosos (aditivo). Sem brilho de magia: nada de estrela, rotação ou
//   cintilação.
//
// Vivem no MUNDO (não na tela), então a câmera deslizando até o mar passa por
// cima delas. Pra a densidade na tela não cair quando a câmera anda rápido, as
// faixas que a câmera acabou de descobrir são preenchidas na hora (ver
// _fillSweptStrips).
//
// Ganchos pras cenas seguintes (mais numerosas, rastros, aceleram a subida):
//   scene.victoryParticles.densityMultiplier  (1 = normal)
//   scene.victoryParticles.speedMultiplier    (1 = normal)

const TEXTURE_KEY = 'victory_blue_dot';
const DEPTH = 110; // acima do véu escuro (depth 99): as partículas continuam luminosas

const RAMP_MS = 30000; // do primeiro ponto até a densidade cheia
const RAMP_EXPONENT = 1.5; // curva: lenta no começo, forte no fim
const MIN_ON_SCREEN = 2; // "uma. duas."
const MAX_ON_SCREEN = 340; // "centenas" na densidade cheia
const HARD_CAP = 560; // teto de segurança (multiplicadores incluídos)

const LIFE_MIN_MS = 5000;
const LIFE_MAX_MS = 9000;
const RISE_MIN = 0.035; // fração da altura da câmera por segundo
const RISE_MAX = 0.1;
const RISE_ACCEL = 1.2; // a subida ganha até +120% de velocidade no fim da vida
const SWAY_PX = 3; // balanço lateral mínimo (corpo físico, não fumaça)
const SPAWN_PAD_X = 30;
const SPAWN_RISE_EXT = 0.24; // fração da altura da câmera abaixo da tela onde também nascem (sobem pra dentro)

const FADE_IN = 0.2; // fração inicial da vida
const FADE_OUT_FROM = 0.7;
const ALPHA_MIN = 0.55;
const ALPHA_MAX = 0.95;
const SCALE_MIN = 0.7;
const SCALE_MAX = 1.5;

// azul profundo (maioria) -> ciano discreto (raro)
const TINTS = [0x2d6bff, 0x2d6bff, 0x3a82ff, 0x3a82ff, 0x3f96ff, 0x56c8ff, 0x8fe6ff];

const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export default class VictoryParticles {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.elapsedMs = 0;
    this.intensity = 0; // 0..1, só leitura
    this.densityMultiplier = 1;
    this.speedMultiplier = 1;
    this.trailChance = 0; // 0..1: fração das novas partículas que deixam rastro (Cena 04, a travessia)
    this._live = [];
    this._pool = [];
    this._spawnDebt = 0;
    this._stripDebt = 0;
    this._lastViewX = 0;
    this._lastViewY = 0;
    scene.events.once('shutdown', () => this.destroy());
  }

  start() {
    if (this.active) return;
    this._ensureTexture();
    this.active = true;
    this.elapsedMs = 0;
    const view = this.scene.cameras.main.worldView;
    this._lastViewX = view.x;
    this._lastViewY = view.y;
    // "Uma." — o primeiro ponto aparece já, em algum lugar da tela
    this._spawn(
      Phaser.Math.Between(view.x + view.width * 0.2, view.right - view.width * 0.2),
      Phaser.Math.Between(view.y + view.height * 0.35, view.bottom - view.height * 0.1),
      0
    );
  }

  // chamado todo frame pela GameScene (não roda com o jogo pausado)
  update(delta) {
    if (!this.active) return;
    const dt = Math.min(delta, 100);
    this.elapsedMs += dt;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;

    const t = Phaser.Math.Clamp(this.elapsedMs / RAMP_MS, 0, 1);
    this.intensity = Math.pow(t, RAMP_EXPONENT);

    const viewArea = view.width * view.height;
    const onScreen = Math.min(
      HARD_CAP,
      (MIN_ON_SCREEN + (MAX_ON_SCREEN - MIN_ON_SCREEN) * this.intensity) * this.densityMultiplier
    );
    const density = onScreen / viewArea; // partículas por px² na tela
    const avgLifeS = (LIFE_MIN_MS + LIFE_MAX_MS) / 2000;

    // zona de nascimento: a tela + margem lateral + faixa abaixo (de onde elas sobem pra dentro)
    const zx = view.x - SPAWN_PAD_X;
    const zy = view.y;
    const zw = view.width + SPAWN_PAD_X * 2;
    const zh = view.height * (1 + SPAWN_RISE_EXT);

    // regime permanente: nascem na taxa que mantém a densidade alvo
    this._spawnDebt += (density * zw * zh / avgLifeS) * (dt / 1000);
    while (this._spawnDebt >= 1 && this._live.length < HARD_CAP) {
      this._spawnDebt -= 1;
      this._spawn(zx + Math.random() * zw, zy + Math.random() * zh, 0);
    }

    this._fillSweptStrips(view, density, zx, zy, zw, zh);
    this._lastViewX = view.x;
    this._lastViewY = view.y;

    this._step(dt, view);
  }

  // A câmera andou: a faixa que ela acabou de descobrir não tem partículas
  // (elas nasceram onde a câmera estava). Preenche já, com idades aleatórias,
  // pra densidade na tela ficar constante durante o pan até o mar.
  _fillSweptStrips(view, density, zx, zy, zw, zh) {
    const dx = view.x - this._lastViewX;
    const dy = view.y - this._lastViewY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    this._stripDebt += density * (Math.abs(dx) * zh + Math.abs(dy) * zw);
    while (this._stripDebt >= 1 && this._live.length < HARD_CAP) {
      this._stripDebt -= 1;
      const pickX = Math.random() * (Math.abs(dx) + Math.abs(dy)) < Math.abs(dx);
      let x;
      let y;
      if (pickX) {
        x = dx > 0 ? view.right + SPAWN_PAD_X - Math.random() * dx : view.x - SPAWN_PAD_X + Math.random() * -dx;
        y = zy + Math.random() * zh;
      } else {
        x = zx + Math.random() * zw;
        y = dy > 0 ? zy + zh - Math.random() * dy : zy + Math.random() * -dy;
      }
      this._spawn(x, y, 0.15 + Math.random() * 0.7); // já em plena vida: sem fade-in no meio da tela
    }
  }

  _spawn(x, y, ageFrac) {
    const view = this.scene.cameras.main.worldView;
    const life = Phaser.Math.Between(LIFE_MIN_MS, LIFE_MAX_MS);
    let p = this._pool.pop();
    if (!p) {
      const img = this.scene.add.image(0, 0, TEXTURE_KEY).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
      p = { img };
    }
    p.x = x;
    p.y = y;
    p.life = life;
    p.age = life * ageFrac;
    p.v0 = view.height * Phaser.Math.FloatBetween(RISE_MIN, RISE_MAX);
    p.swayAmp = Phaser.Math.FloatBetween(SWAY_PX * 0.3, SWAY_PX);
    p.swayPhase = Math.random() * Math.PI * 2;
    p.peak = Phaser.Math.FloatBetween(ALPHA_MIN, ALPHA_MAX);
    // rastro: a partícula vira um risco vertical com a cabeça no alto (ela sobe, o rastro fica pra trás)
    const trail = Math.random() < this.trailChance;
    const scale = Phaser.Math.FloatBetween(SCALE_MIN, SCALE_MAX);
    p.img.setOrigin(0.5, trail ? 0.35 : 0.5);
    p.img.setTint(Phaser.Utils.Array.GetRandom(TINTS)).setScale(scale, trail ? scale * Phaser.Math.FloatBetween(4, 7) : scale);
    p.img.setPosition(x, y).setAlpha(0).setVisible(true);
    this._live.push(p);
  }

  _step(dt, view) {
    const live = this._live;
    const dtS = dt / 1000;
    const margin = 80;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this._release(i);
        continue;
      }
      // sobe, acelerando de leve: algo está puxando
      p.y -= p.v0 * (1 + RISE_ACCEL * k) * this.speedMultiplier * dtS;
      const sway = Math.sin(p.swayPhase + p.age * 0.0011) * p.swayAmp;
      // saiu da área visível (com folga): some sem esperar o fim da vida
      if (p.y < view.y - margin || p.x < view.x - margin * 2 || p.x > view.right + margin * 2 || p.y > view.bottom + view.height) {
        this._release(i);
        continue;
      }
      const a = smooth(k / FADE_IN) * (1 - smooth((k - FADE_OUT_FROM) / (1 - FADE_OUT_FROM)));
      p.img.setPosition(p.x + sway, p.y).setAlpha(p.peak * a);
    }
  }

  _release(i) {
    const p = this._live[i];
    p.img.setVisible(false);
    this._pool.push(p);
    const last = this._live.pop();
    if (last !== p) this._live[i] = last;
  }

  // ponto minúsculo: miolo branco pequeno + halo curto (o tint dá a cor)
  _ensureTexture() {
    const scene = this.scene;
    if (scene.textures.exists(TEXTURE_KEY)) return;
    const size = 16;
    const tex = scene.textures.createCanvas(TEXTURE_KEY, size, size);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  // "agora em maior quantidade" (Cena 03): sobe o multiplicador de densidade suavemente
  surgeDensity(multiplier, ms) {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, densityMultiplier: multiplier, duration: ms, ease: 'Sine.easeInOut' });
  }

  stop() {
    this.active = false;
  }

  destroy() {
    this.active = false;
    this._live.forEach((p) => p.img?.destroy());
    this._pool.forEach((p) => p.img?.destroy());
    this._live = [];
    this._pool = [];
  }
}
