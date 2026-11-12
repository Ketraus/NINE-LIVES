// Atmosfera "viva" do menu principal (só presentação — não mexe no fundo).
// Tudo por código, sem assets novos. Intensidades nas constantes abaixo
// (RAIN_COUNT = 0 desliga a chuva, DUST_COUNT = 0 desliga a poeira).
//
// Dois espaços de coordenadas:
//  - anchored: "colado" no fundo (origem no centro da imagem, em pixels da
//    imagem) — acompanha zoom/parallax do fundo, então os brilhos nunca
//    escorregam das janelas/letreiros onde foram posicionados;
//  - layer: espaço da tela (chuva, névoa, poeira).
// Nada aqui pisca de forma brusca: só pulsos suaves (sem risco de flash).
//
// Menu CORROMPIDO (depois de terminar o jogo — ver fx/MenuCorruptionFx.js, que
// troca a arte do fundo): `setCorruption(level)` vira a atmosfera pro roxo (névoa, chuva, brilhos) e,
// com level > 0.5, os hovercars ficam estranhos: andam aos solavancos, tremem,
// deixam "fantasma", alguns são puxados pra torre central e absorvidos e
// outros ficam parados no ar, glitchando, até sumirem.

import { mixColor } from './MenuCorruptionFx.js';

const TOWER = { x: 517, y: 470 }; // pra onde os drones "puxados" vão (pixels da imagem)
const MAX_HOVER = 3;

const RAIN_COUNT = 70;
const DUST_COUNT = 26;
const FOG_COUNT = 4;

const rand = (a, b) => Phaser.Math.FloatBetween(a, b);

function ensureTextures(scene) {
  const tx = scene.textures;

  if (!tx.exists('menu_fx_glow')) {
    const t = tx.createCanvas('menu_fx_glow', 64, 64);
    const ctx = t.getContext();
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    t.refresh();
  }

  if (!tx.exists('menu_fx_fog')) {
    const t = tx.createCanvas('menu_fx_fog', 512, 128);
    const ctx = t.getContext();
    ctx.translate(256, 64);
    ctx.scale(1, 0.25);
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(-256, -256, 512, 512);
    t.refresh();
  }

  if (!tx.exists('menu_fx_streak')) {
    const t = tx.createCanvas('menu_fx_streak', 2, 14);
    const ctx = t.getContext();
    const grd = ctx.createLinearGradient(0, 0, 0, 14);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 2, 14);
    t.refresh();
  }

  if (!tx.exists('menu_fx_dot')) {
    const t = tx.createCanvas('menu_fx_dot', 2, 2);
    const ctx = t.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
    t.refresh();
  }
}

// ruído suave e irregular (soma de senos lentos) -> 0..1
function softNoise(t) {
  return 0.5 + 0.5 * (Math.sin(t * 1.7) * 0.5 + Math.sin(t * 2.9 + 1.3) * 0.3 + Math.sin(t * 5.1 + 4) * 0.2);
}

export default class MenuAtmosphereFx {
  constructor(scene, imgW, imgH, width, height) {
    ensureTextures(scene);
    this.scene = scene;
    this.imgW = imgW;
    this.imgH = imgH;
    this.width = width;
    this.height = height;

    this.anchored = scene.add.container(0, 0);
    this.layer = scene.add.container(0, 0);
    this.cars = [];
    this._nextCar = 2500;
    this._collisionSeq = 0;
    this.cor = 0; // 0 = menu normal, 1 = corrompido (ver setCorruption)
    this._corApplied = -1;
    this.onFeed = null; // chamado quando a torre absorve um drone

    this._buildAnchored();
    this._buildFog();
    this._buildRain();
    this._buildDust();
  }

  setAlpha(a) {
    this.anchored.setAlpha(a);
    this.layer.setAlpha(a);
  }

  // posição em pixels da imagem -> espaço do container "anchored"
  _p(ix, iy) {
    return { x: ix - this.imgW / 2, y: iy - this.imgH / 2 };
  }

  _glow(ix, iy, w, h, tint, alpha) {
    const p = this._p(ix, iy);
    const s = this.scene.add
      .image(p.x, p.y, 'menu_fx_glow')
      .setDisplaySize(w, h)
      .setTint(tint)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.anchored.add(s);
    return s;
  }

  _buildAnchored() {
    // posições medidas na arte do fundo (imagem 1024x1024)
    this.carLayer = this.scene.add.container(0, 0);
    this.anchored.add(this.carLayer);
    this.towerGlow = this._glow(435, 685, 110, 190, 0xff3a50, 0.12); // torre vermelha
    this.signGlow = this._glow(368, 675, 46, 120, 0xff8a3c, 0.2); // letreiro laranja
    this.blueGlow = this._glow(590, 738, 180, 34, 0x3a7cff, 0.08); // estrutura azul
    this.beacon = this._glow(522, 266, 26, 26, 0xff3040, 0); // luz de aviso da antena
  }

  // Liga o visual corrompido aos poucos (0..1): troca as cores da atmosfera
  // pro roxo. Barato: só mexe nos objetos quando o nível muda.
  setCorruption(level) {
    if (Math.abs(level - this._corApplied) < 0.002) return;
    this._corApplied = level;
    this.cor = level;
    this.towerGlow.setTint(mixColor(0xff3a50, 0xb04dff, level));
    this.signGlow.setTint(mixColor(0xff8a3c, 0xff4df0, level));
    this.blueGlow.setTint(mixColor(0x3a7cff, 0x8a3cff, level));
    this.beacon.setTint(mixColor(0xff3040, 0xd070ff, level));
    const fogTint = mixColor(0x2a6577, 0x6a2cc0, level);
    this.fog.forEach((s) => s.setTint(fogTint).setAlpha(s.baseAlpha * (1 + level * 1.4)));
    const rainTint = mixColor(0xa8d8ff, 0xc9a2ff, level);
    this.rain.forEach((s) => s.setTint(rainTint));
    const dustTint = mixColor(0x8fd6ff, 0xc27bff, level);
    this.dust.forEach((s) => s.setTint(dustTint));
  }

  _buildFog() {
    this.fog = [];
    for (let i = 0; i < FOG_COUNT; i++) {
      const s = this.scene.add
        .image(rand(0, this.width), this.height * (0.5 + i * 0.1), 'menu_fx_fog')
        .setScale(2.6, 2)
        .setTint(0x2a6577)
        .setAlpha(rand(0.07, 0.12));
      s.speed = rand(4, 9) * (i % 2 ? 1 : -1);
      s.baseAlpha = s.alpha;
      this.layer.add(s);
      this.fog.push(s);
    }
  }

  _buildRain() {
    this.rain = [];
    for (let i = 0; i < RAIN_COUNT; i++) {
      const s = this.scene.add
        .image(rand(-60, this.width + 60), rand(0, this.height), 'menu_fx_streak')
        .setOrigin(0.5, 1)
        .setTint(0xa8d8ff)
        .setAlpha(rand(0.05, 0.16))
        .setRotation(-0.14)
        .setScale(1, rand(0.8, 1.6));
      s.vy = rand(520, 780);
      this.layer.add(s);
      this.rain.push(s);
    }
  }

  _buildDust() {
    this.dust = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      const s = this.scene.add
        .image(rand(0, this.width), rand(0, this.height), 'menu_fx_dot')
        .setTint(0x8fd6ff)
        .setBlendMode(Phaser.BlendModes.ADD);
      s.baseX = s.x;
      s.baseAlpha = rand(0.15, 0.5);
      s.vy = -rand(5, 14);
      s.phase = rand(0, 6.28);
      s.freq = rand(0.4, 1.1);
      this.layer.add(s);
      this.dust.push(s);
    }
  }

  // "hovercar" distante cruzando o céu: ponto quente + lanterna vermelha.
  // Corrompido (cor > 0.5): luz violeta, coroa de energia e um "fantasma" de
  // glitch; o comportamento vem de `kind`:
  //   straight  voo reto normal (e SEMPRE o par da colisão rara — não mexe)
  //   erratic   solavancos, tremida vertical e teletransportes curtos
  //   drawn     curva em espiral até a torre central e é absorvido
  //   hover     aparece parado no ar, glitcha e some
  _spawnCar({ dir = null, y = null, collisionId = null, kind = null } = {}) {
    dir ??= Math.random() < 0.5 ? 1 : -1;
    y ??= rand(300, 470);
    const corrupt = this.cor > 0.5;
    if (!kind) kind = corrupt && collisionId == null ? (Math.random() < 0.22 ? 'drawn' : 'erratic') : 'straight';

    let x = dir > 0 ? -40 : this.imgW + 40;
    if (kind === 'hover') {
      x = rand(160, 900);
      y = rand(320, 520);
    }
    const p = this._p(x, y);
    const c = this.scene.add.container(p.x, p.y);
    const trail = this.scene.add
      .image(-dir * 9, 0, 'menu_fx_glow')
      .setDisplaySize(18, 3)
      .setTint(corrupt ? 0xb56bff : 0xffd9a0)
      .setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const head = this.scene.add
      .image(0, 0, 'menu_fx_dot')
      .setTint(corrupt ? 0xe6b8ff : 0xffe9b0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const tail = this.scene.add
      .image(-dir * 4, 0, 'menu_fx_dot')
      .setTint(corrupt ? 0xff3df0 : 0xff4a4a)
      .setAlpha(0.8);
    // Área maior que a nave para facilitar o clique/toque em movimento.
    const hit = this.scene.add
      .rectangle(0, 0, 34, 18, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      this._explodeCar(c);
    });
    c.add([trail, head, tail, hit]);

    if (corrupt) {
      // coroa de energia + fantasma de glitch (um pixel deslocado)
      const corona = this.scene.add
        .image(0, 0, 'menu_fx_glow')
        .setDisplaySize(28, 14)
        .setTint(0xa63dff)
        .setAlpha(0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      const ghost = this.scene.add
        .image(0, 0, 'menu_fx_dot')
        .setTint(0xff3df0)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      c.addAt(corona, 0);
      c.add(ghost);
      c.corona = corona;
      c.ghost = ghost;
    }
    c.parts = { trail, head, tail };
    c.kind = kind;
    c.dir = dir;
    c.vx = rand(55, 95) * dir;
    c.ix = x;
    c.baseY = p.y;
    c.collisionId = collisionId;
    c.seed = rand(0, 100);
    c.born = this._now ?? this.scene.time.now;
    c.freezeUntil = 0;
    c.nextStutter = c.born + rand(300, 1400);
    c.wobAmp = rand(4, 16);
    c.wobFreq = rand(1.4, 3.2);

    if (kind === 'drawn') {
      c.vel = { x: c.vx * 1.2, y: 0 };
    } else if (kind === 'hover') {
      c.vx = 0;
      c.life = rand(4500, 8500);
      c.setAlpha(0);
    }
    this.carLayer.add(c);
    this.cars.push(c);
    return c;
  }

  _explodeCar(car, absorbed = false) {
    if (!car?.active || car._exploded) return;
    car._exploded = true;

    const index = this.cars.indexOf(car);
    if (index !== -1) this.cars.splice(index, 1);

    // Explosão mínima: só alguns pixels ciano se espalhando, sem asset novo.
    // Corrompido: pixels violeta/magenta (e mais deles se foi absorvido).
    const corrupt = this.cor > 0.5;
    const n = absorbed ? 12 : 7;
    const burst = this.scene.add.container(car.x, car.y);
    const particles = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + rand(-0.2, 0.2);
      const distance = rand(8, absorbed ? 30 : 18);
      const color = corrupt ? (i % 2 ? 0xff4df0 : 0xb04dff) : i % 2 ? 0x8fe9ff : 0x4fd1ff;
      const particle = this.scene.add
        .circle(0, 0, rand(0.8, absorbed ? 2.2 : 1.6), color, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      burst.add(particle);
      particles.push({ particle, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance });
    }
    this.carLayer.add(burst);

    car.destroy();
    particles.forEach(({ particle, x, y }, i) => {
      this.scene.tweens.add({
        targets: particle,
        x,
        y,
        alpha: 0,
        duration: 240 + i * 18,
        ease: 'Cubic.easeOut'
      });
    });
    this.scene.time.delayedCall(absorbed ? 520 : 380, () => burst.destroy());
    if (absorbed) this.onFeed?.();
  }

  // Comportamento de um carro por frame. Retorna false se deve sair de cena.
  _updateCar(c, time, dt, t) {
    const edge = Phaser.Math.Clamp(Math.min(c.ix, this.imgW - c.ix) / 120, 0, 1);

    if (c.kind === 'straight') {
      c.ix += c.vx * dt;
      c.x += c.vx * dt;
      c.setAlpha(edge);
      this._corruptCarVisual(c, time, t, false);
      return !(c.ix < -60 || c.ix > this.imgW + 60);
    }

    if (c.kind === 'erratic') {
      // solavancos: às vezes trava, treme e "teletransporta" um pouco
      if (time >= c.nextStutter) {
        c.freezeUntil = time + rand(90, 260);
        c.nextStutter = c.freezeUntil + rand(500, 1700);
        const jump = rand(8, 22) * Math.sign(c.vx);
        c.ix += jump;
        c.x += jump;
      }
      const frozen = time < c.freezeUntil;
      const speed = frozen ? 0.04 : 0.45 + 1.1 * softNoise(t * 1.3 + c.seed);
      c.ix += c.vx * speed * dt;
      c.x += c.vx * speed * dt;
      c.y = c.baseY + Math.sin(t * c.wobFreq + c.seed) * c.wobAmp + (frozen ? rand(-1.4, 1.4) : 0);
      c.setAlpha(edge);
      this._corruptCarVisual(c, time, t, frozen);
      return !(c.ix < -60 || c.ix > this.imgW + 60);
    }

    if (c.kind === 'drawn') {
      // puxado pela energia da torre: acelera e entra em espiral
      const iy = c.y + this.imgH / 2;
      const dx = TOWER.x - c.ix;
      const dy = TOWER.y - iy;
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < 24) {
        this._explodeCar(c, true);
        return false;
      }
      const speed = 70 + (1 - Math.min(1, dist / 600)) * 170;
      const swirl = 0.45;
      const wantX = (dx / dist) * speed + (-dy / dist) * speed * swirl;
      const wantY = (dy / dist) * speed + (dx / dist) * speed * swirl;
      const k = Math.min(1, 1.8 * dt);
      c.vel.x += (wantX - c.vel.x) * k;
      c.vel.y += (wantY - c.vel.y) * k;
      c.ix += c.vel.x * dt;
      c.x += c.vel.x * dt;
      c.y += c.vel.y * dt;
      const vlen = Math.max(1, Math.hypot(c.vel.x, c.vel.y));
      c.parts.tail.setPosition((-c.vel.x / vlen) * 4, (-c.vel.y / vlen) * 4);
      c.parts.trail.setPosition((-c.vel.x / vlen) * 9, (-c.vel.y / vlen) * 9);
      c.setAlpha(Math.min(edge, 1) * (dist < 70 ? dist / 70 : 1) + 0.0);
      c.setScale(dist < 90 ? 0.55 + (dist / 90) * 0.45 : 1);
      this._corruptCarVisual(c, time, t, false, true);
      return true;
    }

    // hover: surge com glitch, fica parado no ar tremendo e some
    const age = time - c.born;
    if (age > c.life) {
      this._explodeCar(c);
      return false;
    }
    const fadeIn = Phaser.Math.Clamp(age / 700, 0, 1);
    const fadeOut = Phaser.Math.Clamp((c.life - age) / 700, 0, 1);
    const unstable = softNoise(t * 2.2 + c.seed) > 0.72;
    const flick = unstable ? (Math.random() < 0.5 ? 0.25 : 1) : 1;
    c.setAlpha(Math.min(fadeIn, fadeOut) * flick);
    c.y = c.baseY + Math.sin(t * 1.1 + c.seed) * 5 + (unstable ? rand(-2, 2) : 0);
    c.x += unstable ? rand(-1.5, 1.5) : 0;
    this._corruptCarVisual(c, time, t, unstable);
    return true;
  }

  // brilho da coroa e "fantasma" de glitch dos carros corrompidos
  _corruptCarVisual(c, time, t, glitching, bright = false) {
    if (!c.corona) return;
    c.corona.setAlpha((bright ? 0.75 : 0.4) + 0.25 * Math.sin(t * 5 + c.seed));
    if (glitching) {
      c.ghost.setPosition(rand(-7, 7), rand(-3, 3)).setAlpha(0.8);
    } else {
      c.ghost.setAlpha(0);
    }
  }

  update(time, delta, bg, px, py) {
    const dt = delta / 1000;
    const t = time / 1000;
    this._now = time;

    // acompanha o fundo (zoom/parallax)
    this.anchored.setPosition(bg.x, bg.y).setScale(bg.scaleX);
    this.layer.setPosition(px * 1.6, py * 1.6);

    // brilhos da arte: pulsos suaves, nunca estrobo
    // (corrompido: brilhos mais fortes e a antena bate mais rápido, irregular)
    const cor = this.cor;
    const gain = 1 + cor * 0.5;
    this.towerGlow.setAlpha((0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t / 1.7))) * gain);
    this.signGlow.setAlpha((0.1 + 0.18 * softNoise(t * 1.6)) * (1 + cor * 0.3));
    this.blueGlow.setAlpha((0.06 + 0.05 * Math.sin(t / 2.3)) * gain);
    const beatMs = 1800 - cor * 700;
    const beat = (time % beatMs) / beatMs; // luz de aviso da antena: ~0.55 Hz (normal)
    this.beacon.setAlpha(beat < 0.28 ? Math.sin((beat / 0.28) * Math.PI) * 0.85 : 0);

    // Na maior parte do tempo passa uma nave; às vezes vem um pequeno
    // comboio. Em 1% dos spawns, duas entram de lados opostos para uma
    // colisão rara e intencional.
    // Corrompido: mais tráfego (e comboios maiores) e, às vezes, um drone
    // que simplesmente aparece parado no ar. A colisão rara continua 1%.
    if (time > this._nextCar) {
      if (Math.random() < 0.01) {
        const collisionId = ++this._collisionSeq;
        const collisionY = rand(330, 450);
        this._spawnCar({ dir: 1, y: collisionY, collisionId });
        this._spawnCar({ dir: -1, y: collisionY, collisionId });
      } else if (this.cor > 0.5 && Math.random() < 0.16 && this.cars.filter((c) => c.kind === 'hover').length < MAX_HOVER) {
        this._spawnCar({ kind: 'hover' });
      } else {
        const convoySize = Math.random() < 0.28 ? Phaser.Math.Between(2, this.cor > 0.5 ? 4 : 3) : 1;
        for (let i = 0; i < convoySize; i++) this._spawnCar();
      }
      this._nextCar = time + rand(5000, 11000) * (1 - 0.55 * this.cor);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (!c.active || c._exploded) {
        this.cars.splice(i, 1);
        continue;
      }
      if (!this._updateCar(c, time, dt, t)) {
        // _updateCar já destruiu o carro quando ele explodiu/foi absorvido
        if (c.active) c.destroy();
        const at = this.cars.indexOf(c);
        if (at !== -1) this.cars.splice(at, 1);
      }
    }

    // Detecta apenas o par marcado para a colisão rara, sem transformar as
    // naves comuns em obstáculos umas das outras.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      // _explodeCar remove itens do array; a checagem opcional evita ler
      // propriedades de uma posição que deixou de existir nesta iteração.
      if (!car?.active || car.collisionId == null) continue;
      const other = this.cars.find((candidate) => candidate && candidate !== car && candidate.active && candidate.collisionId === car.collisionId);
      // A área de toque da nave tem 34 px de largura; os centros podem ficar
      // até essa distância quando as bordas encostam visualmente.
      if (other && Phaser.Math.Distance.Between(car.x, car.y, other.x, other.y) < 34) {
        this._explodeCar(car);
        this._explodeCar(other);
        break;
      }
    }

    // névoa baixa à deriva
    this.fog.forEach((s) => {
      s.x += s.speed * dt;
      const half = (s.width * s.scaleX) / 2;
      if (s.speed > 0 && s.x > this.width + half) s.x = -half;
      else if (s.speed < 0 && s.x < -half) s.x = this.width + half;
    });

    // chuva fina inclinada
    this.rain.forEach((s) => {
      s.y += s.vy * dt;
      s.x += s.vy * 0.14 * dt;
      if (s.y > this.height + 20) {
        s.y = rand(-80, -10);
        s.x = rand(-60, this.width + 60);
      }
    });

    // poeira/partículas flutuando
    this.dust.forEach((s) => {
      s.y += s.vy * dt * (1 + this.cor * 1.6);
      s.x = s.baseX + Math.sin(t * s.freq + s.phase) * 8;
      s.setAlpha(s.baseAlpha * (1 + this.cor * 0.8) * (0.5 + 0.5 * Math.sin(t * s.freq * 1.7 + s.phase)));
      if (s.y < -10) {
        s.y = this.height + 10;
        s.baseX = rand(0, this.width);
      }
    });
  }
}
