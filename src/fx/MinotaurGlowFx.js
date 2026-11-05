// Presença visual do Minotauro: luzes nos mecanismos, energia pulsante e brilho de contorno.
// Só visual, por cima do sprite ORIGINAL (nada do PNG é trocado). Sem shader e sem asset novo:
// na 1ª vez que cada textura do boss aparece, geramos por código (uma vez só) camadas
// pequenas a partir dos próprios pixels dela:
//   emC / emW -> pixels "emissivos" (LEDs, circuitos, energia) frios / quentes, nas cores originais
//   axe       -> os emissivos do machado (lado esquerdo do quadro), com cintilar próprio
//   bloom     -> os mesmos pontos suavizados, cada halo na cor da própria luz (lima, ciano, vermelho...)
//   rim       -> só a borda da silhueta (luz de contorno)
//   eyes / eyeGlow -> olhos da fase 2 (pixels mais quentes) + halo próprio, bem mais forte
// Em jogo: 6 imagens ADD seguindo o boss, com alpha pulsando (batimento). Fase 1 = roxo/rosa,
// fase 2 (rage) = aqua, as mesmas cores dos FX do boss (MinotaurStompFx).
import SettingsManager from '../systems/SettingsManager.js';

const LAYERS = ['emC', 'emW', 'axe', 'bloom', 'rim', 'eyes', 'eyeGlow'];
const EYE_MAX_Y = 28; // emissivos amarelos/âmbar na cabeça = olhos da fase 2
const eyeKeys = new Set(); // texturas que têm olhos (só a versão rage)
const AXE_MAX_X = 20; // emissivos à esquerda disso (e abaixo de AXE_MIN_Y) são do machado
const AXE_MIN_Y = 26;
const SWEEP_MS = 1800; // faixa de energia que sobe pelo corpo
const SWEEP_H = 12;
const PHASE1 = { rim: 0xb56bff, sweep: 0xf0c8ff, period: 1500, gain: 1 };
const PHASE2 = { rim: 0x32e9d6, sweep: 0xbafff1, period: 1000, gain: 1.2 };
const failed = new Set();

const layerKey = (key, layer) => `${key}__glow_${layer}`;

function isEmissive(r, g, b, a) {
  if (a < 200) return false;
  const max = Math.max(r, g, b);
  return max >= 140 && max - Math.min(r, g, b) >= 0.45 * max;
}

function ensureLayers(scene, key) {
  if (scene.textures.exists(layerKey(key, 'rim'))) return true;
  if (failed.has(key) || !scene.textures.exists(key)) return false;
  try {
    const tex = scene.textures.get(key);
    const img = tex.getSourceImage();
    const W = img.width, H = img.height;
    const scratch = document.createElement('canvas');
    scratch.width = W; scratch.height = H;
    const sctx = scratch.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    const src = sctx.getImageData(0, 0, W, H).data;

    const names = tex.getFrameNames();
    const frames = (names.length ? names : ['__BASE']).map((name) => {
      const f = tex.get(name);
      return { name, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
    });

    const canvases = {}, datas = {};
    for (const layer of LAYERS) {
      canvases[layer] = scene.textures.createCanvas(layerKey(key, layer), W, H);
      datas[layer] = canvases[layer].getContext().createImageData(W, H);
    }
    const put = (layer, px, py, r, g, b, a) => {
      const i = (py * W + px) * 4, d = datas[layer].data;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    };

    for (const f of frames) {
      const solid = (lx, ly) => lx >= 0 && ly >= 0 && lx < f.w && ly < f.h &&
        src[((f.y + ly) * W + f.x + lx) * 4 + 3] >= 128;
      // halo na cor de cada luz: soma ponderada das cores dos emissivos vizinhos
      const halo = new Float32Array(f.w * f.h), hr = new Float32Array(f.w * f.h),
        hg = new Float32Array(f.w * f.h), hb = new Float32Array(f.w * f.h);
      const eg = new Float32Array(f.w * f.h);
      for (let ly = 0; ly < f.h; ly++) for (let lx = 0; lx < f.w; lx++) {
        const px = f.x + lx, py = f.y + ly, i = (py * W + px) * 4;
        const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];
        if (a >= 128 && (!solid(lx - 1, ly) || !solid(lx + 1, ly) || !solid(lx, ly - 1) || !solid(lx, ly + 1))) {
          put('rim', px, py, 255, 255, 255, 255);
        }
        if (!isEmissive(r, g, b, a)) continue;
        const warm = r === Math.max(r, g, b) && b <= g + 0.3 * r;
        if (warm && ly <= EYE_MAX_Y && g >= 0.6 * r) {
          // olho: núcleo puxado pro branco-quente + halo largo na cor do olho
          put('eyes', px, py, r + (255 - r) * 0.35, g + (255 - g) * 0.35, b + (255 - b) * 0.35, 255);
          eyeKeys.add(key);
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const x = lx + dx, y = ly + dy;
            if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
            eg[y * f.w + x] += Math.max(0, 1 - Math.hypot(dx, dy) / 3.6);
          }
          continue;
        }
        put(lx <= AXE_MAX_X && ly >= AXE_MIN_Y ? 'axe' : warm ? 'emW' : 'emC', px, py, r, g, b, 255);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = lx + dx, y = ly + dy;
          if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
          const w = Math.max(0, 1 - Math.hypot(dx, dy) / 2.6), j = y * f.w + x;
          halo[j] += w; hr[j] += r * w; hg[j] += g * w; hb[j] += b * w;
        }
      }
      for (let ly = 0; ly < f.h; ly++) for (let lx = 0; lx < f.w; lx++) {
        const eh = eg[ly * f.w + lx];
        if (eh > 0) put('eyeGlow', f.x + lx, f.y + ly, 255, 205, 40, Math.min(255, eh * 110));
        const h = halo[ly * f.w + lx];
        if (h > 0) {
          const j = ly * f.w + lx;
          put('bloom', f.x + lx, f.y + ly, hr[j] / h, hg[j] / h, hb[j] / h, Math.min(255, h * 120));
        }
      }
    }

    for (const layer of LAYERS) {
      const ct = canvases[layer];
      ct.getContext().putImageData(datas[layer], 0, 0);
      if (names.length) frames.forEach((f) => ct.add(f.name, 0, f.x, f.y, f.w, f.h));
      ct.refresh();
      ct.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    return true;
  } catch (error) {
    failed.add(key);
    console.warn('[MinotaurGlowFx] Brilho indisponível para', key, error);
    return false;
  }
}

const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

export default class MinotaurGlowFx {
  constructor(scene, boss) {
    this.scene = scene;
    this.boss = boss;
    this.key = null;
    this.frame = null;
    this.shown = false;
    this.atk = 0;
    this.lite = !!scene.sys.game.device.input.touch || SettingsManager.getReducedTerrainFx();
    this.layers = {};
    this.images = LAYERS.concat('sweep').map((layer) => {
      const image = scene.add.image(0, 0, '__DEFAULT').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      for (const camera of scene.cameras.cameras) if (camera !== scene.cameras.main) camera.ignore(image);
      this.layers[layer] = image;
      return image;
    });
  }

  _hide() {
    if (!this.shown) return;
    this.shown = false;
    for (const image of this.images) image.setVisible(false);
  }

  update(time) {
    const boss = this.boss;
    if (!boss.active || !boss.visible || boss.alpha <= 0.02 || !boss.texture || this.scene.isPaused) return this._hide();
    const key = boss.texture.key, frame = boss.frame.name;
    if (!ensureLayers(this.scene, key)) return this._hide();
    if (key !== this.key || frame !== this.frame) {
      this.key = key; this.frame = frame;
      for (const layer of LAYERS) this.layers[layer].setTexture(layerKey(key, layer), frame);
      this.layers.sweep.setTexture(layerKey(key, 'rim'), frame);
    }

    const pal = boss.isEnraged ? PHASE2 : PHASE1;
    const calm = SettingsManager.getReducedFlashes() ? 0.4 : 1;
    // Ataque em andamento (aviso, golpe, machado fora da mão): é só aí que o contorno e a
    // faixa de energia aparecem; entram e saem suavemente. A janela vulnerável pós-Investida
    // fica de fora de propósito (é a hora de punir, não de ameaçar).
    const attacking = (!!boss.bossState && boss.bossState !== 'chasing' && boss.bossState !== 'charge_vulnerable') || !!boss.axePhase;
    const dt = Math.min(100, time - (this.lastTime ?? time));
    this.lastTime = time;
    this.atk += ((attacking ? 1 : 0) - this.atk) * Math.min(1, dt / (attacking ? 110 : 260));
    const atk = this.atk < 0.02 ? 0 : this.atk;

    // transformação da fase 2 (ver MinotaurTransformFx): luzes, contorno e olhos sobem junto da energia
    const tf = Math.min(1.6, boss._tfGlow || 0);
    const gain = pal.gain * (1 + 0.3 * atk) * (1 + 0.9 * tf) * calm;
    const period = pal.period * (1 - 0.4 * atk);
    const ph = (time % period) / period;
    const beat = Math.min(1, bump(ph, 0.1, 0.06) + 0.6 * bump(ph, 0.3, 0.07)); // "tum-tum"
    const flicker = this.lite ? 0.8 : Phaser.Math.Clamp(0.6 + 0.25 * Math.sin(time / 70) + 0.15 * Math.sin(time / 31 + 1.3), 0.35, 1);
    // LEDs quentes piscam de forma irregular (falha rápida de vez em quando), como máquina viva
    const slot = Math.floor(time / 350);
    const glitch = this.lite ? 1 : (Math.abs(Math.sin(slot * 12.9898) * 43758.5453) % 1) > 0.9 ? 0.25 : 1;
    const L = this.layers;
    const base = boss.alpha;

    // detalhes do corpo: sempre presentes e bem legíveis; no ataque acendem mais
    L.emC.setAlpha(Math.min(1, base * (0.65 + 0.35 * beat) * gain));
    L.emW.setAlpha(Math.min(1, base * (0.6 + 0.35 * (0.5 + 0.5 * Math.sin(time / 260))) * glitch * gain));
    L.axe.setAlpha(Math.min(1, base * (0.6 + 0.4 * beat) * flicker * gain));
    L.bloom.setAlpha(base * (0.16 + 0.26 * beat + 0.2 * atk) * gain);
    const hasEyes = eyeKeys.has(key);
    if (hasEyes) {
      // olhos da fase 2: acesos o tempo todo, mais fortes no batimento e nos ataques
      const stare = 0.88 + 0.12 * Math.sin(time / 45);
      L.eyes.setAlpha(Math.min(1, base * (0.9 + 0.1 * beat)));
      L.eyeGlow.setAlpha(Math.min(1, base * (0.55 + 0.3 * beat + 0.25 * atk + 0.5 * tf) * stare));
    }
    const lift = Math.max(atk, Math.min(1, tf)); // a transformação acende o contorno como um ataque
    const rimOn = lift > 0.02;
    if (rimOn) L.rim.setTint(pal.rim).setAlpha(base * lift * (0.16 + 0.16 * beat) * gain);

    let sweep = false;
    if (rimOn && !this.lite && !SettingsManager.getReducedMotion()) {
      const t = (time % SWEEP_MS) / SWEEP_MS;
      const top = 64 - t * (64 + SWEEP_H);
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(64, Math.floor(top + SWEEP_H));
      if (y1 > y0) {
        L.sweep.setCrop(0, y0, 64, y1 - y0).setTint(pal.sweep).setAlpha(base * 0.5 * lift * Math.sin(t * Math.PI) * calm);
        sweep = true;
      }
    }

    this.shown = true;
    for (const image of this.images) {
      image.setPosition(boss.x, boss.y).setScale(boss.scaleX, boss.scaleY).setFlipX(boss.flipX)
        .setDepth(boss.depth + 0.05).setVisible(image === L.sweep ? sweep : image === L.rim ? rimOn : image === L.eyes || image === L.eyeGlow ? hasEyes : true);
    }
  }

  destroy() {
    for (const image of this.images) image.destroy();
    this.images = [];
    this.layers = {};
  }
}
