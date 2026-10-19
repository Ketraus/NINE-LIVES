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

  _buildFog() {
    this.fog = [];
    for (let i = 0; i < FOG_COUNT; i++) {
      const s = this.scene.add
        .image(rand(0, this.width), this.height * (0.5 + i * 0.1), 'menu_fx_fog')
        .setScale(2.6, 2)
        .setTint(0x2a6577)
        .setAlpha(rand(0.07, 0.12));
      s.speed = rand(4, 9) * (i % 2 ? 1 : -1);
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

  // "hovercar" distante cruzando o céu: ponto quente + lanterna vermelha
  _spawnCar() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = rand(300, 470);
    const x = dir > 0 ? -40 : this.imgW + 40;
    const p = this._p(x, y);
    const c = this.scene.add.container(p.x, p.y);
    const trail = this.scene.add
      .image(-dir * 9, 0, 'menu_fx_glow')
      .setDisplaySize(18, 3)
      .setTint(0xffd9a0)
      .setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const head = this.scene.add.image(0, 0, 'menu_fx_dot').setTint(0xffe9b0).setBlendMode(Phaser.BlendModes.ADD);
    const tail = this.scene.add.image(-dir * 4, 0, 'menu_fx_dot').setTint(0xff4a4a).setAlpha(0.8);
    // Área maior que a nave para facilitar o clique/toque em movimento.
    const hit = this.scene.add
      .rectangle(0, 0, 34, 18, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      this._explodeCar(c);
    });
    c.add([trail, head, tail, hit]);
    c.vx = rand(55, 95) * dir;
    c.ix = x;
    this.carLayer.add(c);
    this.cars.push(c);
  }

  _explodeCar(car) {
    if (!car?.active || car._exploded) return;
    car._exploded = true;

    const index = this.cars.indexOf(car);
    if (index !== -1) this.cars.splice(index, 1);

    // Explosão mínima: só alguns pixels ciano se espalhando, sem asset novo.
    const burst = this.scene.add.container(car.x, car.y);
    const particles = [];
    for (let i = 0; i < 7; i++) {
      const angle = (Math.PI * 2 * i) / 7 + rand(-0.2, 0.2);
      const distance = rand(8, 18);
      const particle = this.scene.add
        .circle(0, 0, rand(0.8, 1.6), i % 2 ? 0x8fe9ff : 0x4fd1ff, 0.9)
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
    this.scene.time.delayedCall(380, () => burst.destroy());
  }

  update(time, delta, bg, px, py) {
    const dt = delta / 1000;
    const t = time / 1000;

    // acompanha o fundo (zoom/parallax)
    this.anchored.setPosition(bg.x, bg.y).setScale(bg.scaleX);
    this.layer.setPosition(px * 1.6, py * 1.6);

    // brilhos da arte: pulsos suaves, nunca estrobo
    this.towerGlow.setAlpha(0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t / 1.7)));
    this.signGlow.setAlpha(0.1 + 0.18 * softNoise(t * 1.6));
    this.blueGlow.setAlpha(0.06 + 0.05 * Math.sin(t / 2.3));
    const beat = (time % 1800) / 1800; // luz de aviso da antena: ~0.55 Hz
    this.beacon.setAlpha(beat < 0.28 ? Math.sin((beat / 0.28) * Math.PI) * 0.85 : 0);

    // Na maior parte do tempo passa uma nave; às vezes vem um pequeno
    // comboio, para o menu parecer um minigame vivo.
    if (time > this._nextCar) {
      const convoySize = Math.random() < 0.28 ? Phaser.Math.Between(2, 3) : 1;
      for (let i = 0; i < convoySize; i++) this._spawnCar();
      this._nextCar = time + rand(5000, 11000);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (!c.active || c._exploded) {
        this.cars.splice(i, 1);
        continue;
      }
      c.ix += c.vx * dt;
      c.x += c.vx * dt;
      c.setAlpha(Phaser.Math.Clamp(Math.min(c.ix, this.imgW - c.ix) / 120, 0, 1));
      if (c.ix < -60 || c.ix > this.imgW + 60) {
        c.destroy();
        this.cars.splice(i, 1);
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
      s.y += s.vy * dt;
      s.x = s.baseX + Math.sin(t * s.freq + s.phase) * 8;
      s.setAlpha(s.baseAlpha * (0.5 + 0.5 * Math.sin(t * s.freq * 1.7 + s.phase)));
      if (s.y < -10) {
        s.y = this.height + 10;
        s.baseX = rand(0, this.width);
      }
    });
  }
}
