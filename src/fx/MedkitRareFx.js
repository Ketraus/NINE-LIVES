const ARROW_TEXTURE_KEY = '__medkit_rare_arrow';

const OUTLINE_OFFSETS = [
  [-2.4, 0], [2.4, 0], [0, -2.4], [0, 2.4],
  [-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]
];

function hsvToColor(h, s = 0.9, v = 1) {
  const hue = ((h % 1) + 1) % 1;
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r;
  let g;
  let b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }

  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

function ensureArrowTexture(scene) {
  if (scene.textures.exists(ARROW_TEXTURE_KEY)) return;

  // Seta pixelada feita em runtime: sem asset novo e sem interpolação borrada.
  // A textura nasce apontando para BAIXO; o indicador de borda só a rotaciona.
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(7, 1, 8, 11);
  g.fillRect(3, 9, 16, 6);
  g.fillRect(5, 15, 12, 3);
  g.fillRect(7, 18, 8, 3);
  g.fillRect(9, 21, 4, 2);
  g.generateTexture(ARROW_TEXTURE_KEY, 22, 24);
  g.destroy();

  const source = scene.textures.get(ARROW_TEXTURE_KEY)?.source?.[0];
  source?.setFilter?.(Phaser.Textures.FilterMode.NEAREST);
}

// Visual "item raro" do medkit. Tudo é puramente gráfico: não altera drop,
// cura, física ou autoridade de multiplayer.
export default class MedkitRareFx {
  constructor(scene, medkit, textureKey = 'medkit') {
    this.scene = scene;
    this.medkit = medkit;
    this.textureKey = textureKey;
    this.destroyed = false;

    ensureArrowTexture(scene);

    this.outline = OUTLINE_OFFSETS.map(([ox, oy], index) => {
      const sprite = scene.add.image(medkit.x + ox, medkit.y + oy, this.textureKey)
        .setDepth(4.72)
        .setScale(medkit.scaleX * 1.02)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.22);
      return { sprite, ox, oy, phase: index / OUTLINE_OFFSETS.length };
    });

    // Halo duplo: uma cópia mais fechada para engrossar o contorno e outra
    // maior/mais fraca para o brilho respirar sem apagar o pixel art.
    this.innerHalo = scene.add.image(medkit.x, medkit.y, this.textureKey)
      .setDepth(4.68)
      .setScale(medkit.scaleX * 1.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.16);
    this.outerHalo = scene.add.image(medkit.x, medkit.y, this.textureKey)
      .setDepth(4.64)
      .setScale(medkit.scaleX * 1.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.08);

    // Pequenos pixels orbitando dão a leitura de drop especial mesmo quando
    // há muita coisa acontecendo na tela.
    this.sparkles = Array.from({ length: 4 }, (_, index) => scene.add.rectangle(
      medkit.x,
      medkit.y,
      index % 2 === 0 ? 3 : 2,
      index % 2 === 0 ? 3 : 2,
      0xffffff,
      0.9
    ).setDepth(6.1));

    this.worldArrow = this._makeArrow(7.2);
    this.edgeArrow = this._makeArrow(190);
    this.edgeArrow.setVisible(false);

    this._isolateFromAuxiliaryCameras([
      ...this.outline.map((entry) => entry.sprite),
      this.innerHalo,
      this.outerHalo,
      ...this.sparkles,
      this.worldArrow,
      this.edgeArrow
    ]);
  }

  _makeArrow(depth) {
    const shadow = this.scene.add.image(1.5, 2, ARROW_TEXTURE_KEY)
      .setTint(0x020713)
      .setAlpha(0.9);
    const glow = this.scene.add.image(0, 0, ARROW_TEXTURE_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.28)
      .setScale(1.5);
    const core = this.scene.add.image(0, 0, ARROW_TEXTURE_KEY)
      .setAlpha(1);
    const shine = this.scene.add.image(0, -1, ARROW_TEXTURE_KEY)
      .setTint(0xffffff)
      .setAlpha(0.25)
      .setScale(0.72);

    const container = this.scene.add.container(0, 0, [shadow, glow, core, shine])
      .setDepth(depth);
    container._rareGlow = glow;
    container._rareCore = core;
    container._rareShine = shine;
    return container;
  }

  _isolateFromAuxiliaryCameras(objects) {
    this.scene.cameras.cameras.forEach((camera) => {
      if (camera !== this.scene.cameras.main) camera.ignore(objects);
    });
  }

  update(time) {
    if (this.destroyed || !this.medkit?.active) return;

    const t = time * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.6);
    const hue = (t * 0.18) % 1;
    const baseColor = hsvToColor(hue, 0.88, 1);

    // Contorno arco-íris real: cada lado do contorno recebe uma fase diferente,
    // então a cor "corre" em volta do sprite em vez de só trocar tudo junto.
    this.outline.forEach((entry) => {
      entry.sprite.setPosition(this.medkit.x + entry.ox, this.medkit.y + entry.oy);
      entry.sprite.setScale(this.medkit.scaleX * (1.015 + pulse * 0.025));
      entry.sprite.setTint(hsvToColor(hue + entry.phase * 0.42, 0.92, 1));
      entry.sprite.setAlpha(0.17 + pulse * 0.12);
    });

    this.innerHalo
      .setPosition(this.medkit.x, this.medkit.y)
      .setScale(this.medkit.scaleX * (1.14 + pulse * 0.12))
      .setTint(baseColor)
      .setAlpha(0.11 + pulse * 0.10);
    this.outerHalo
      .setPosition(this.medkit.x, this.medkit.y)
      .setScale(this.medkit.scaleX * (1.38 + pulse * 0.20))
      .setTint(hsvToColor(hue + 0.12, 0.85, 1))
      .setAlpha(0.045 + pulse * 0.055);

    this.sparkles.forEach((sparkle, index) => {
      const a = t * (1.5 + index * 0.08) + index * (Math.PI * 0.5);
      const rx = 18 + index * 1.5;
      const ry = 11 + (index % 2) * 2;
      sparkle.setPosition(
        this.medkit.x + Math.cos(a) * rx,
        this.medkit.y + Math.sin(a) * ry
      );
      sparkle.setFillStyle(hsvToColor(hue + index * 0.2, 0.78, 1), 1);
      sparkle.setAlpha(0.35 + (0.5 + 0.5 * Math.sin(t * 7 + index)) * 0.55);
      sparkle.setScale(0.8 + pulse * 0.45);
    });

    this._updateWorldArrow(t, hue, pulse);
    this._updateEdgeArrow(t, hue, pulse);
  }

  _updateWorldArrow(t, hue, pulse) {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const visible = Phaser.Geom.Rectangle.Contains(view, this.medkit.x, this.medkit.y);
    this.worldArrow.setVisible(visible);
    if (!visible) return;

    // Sempre nasce em cima e aponta diretamente para o item.
    const bob = Math.sin(t * 5.2) * 3.2;
    const yOffset = 31 + bob;
    this.worldArrow.setPosition(this.medkit.x, this.medkit.y - yOffset);
    this.worldArrow.setRotation(0);
    this.worldArrow.setScale(1.08 + pulse * 0.12);
    this._colorArrow(this.worldArrow, hue, pulse);
  }

  _updateEdgeArrow(t, hue, pulse) {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const targetVisible = Phaser.Geom.Rectangle.Contains(view, this.medkit.x, this.medkit.y);
    this.edgeArrow.setVisible(!targetVisible);
    if (targetVisible) return;

    const cx = view.centerX;
    const cy = view.centerY;
    const dx = this.medkit.x - cx;
    const dy = this.medkit.y - cy;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

    // Margem em pixels de TELA convertida para unidades do mundo, para o
    // indicador ficar na mesma distância da borda em PC e celular.
    const margin = 34 / Math.max(cam.zoom, 0.01);
    const halfW = Math.max(1, view.width * 0.5 - margin);
    const halfH = Math.max(1, view.height * 0.5 - margin);
    const tx = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
    const factor = Math.min(tx, ty);

    this.edgeArrow.setPosition(cx + dx * factor, cy + dy * factor);
    this.edgeArrow.setRotation(Math.atan2(dy, dx) - Math.PI * 0.5);

    // O inverso do zoom mantém a seta aproximadamente do mesmo tamanho visual
    // independentemente do zoom usado em desktop/mobile.
    const screenStableScale = 1 / Math.max(cam.zoom, 0.01);
    this.edgeArrow.setScale(screenStableScale * (0.92 + pulse * 0.08));
    this._colorArrow(this.edgeArrow, hue + 0.04, pulse);

    // Pulsinho extra quando está fora da tela: raro sem virar uma sirene gigante.
    this.edgeArrow._rareGlow.setAlpha(0.34 + pulse * 0.18);
    this.edgeArrow._rareGlow.setScale(1.55 + pulse * 0.16);
  }

  _colorArrow(container, hue, pulse) {
    const color = hsvToColor(hue, 0.82, 1);
    container._rareCore.setTint(color);
    container._rareGlow.setTint(hsvToColor(hue + 0.08, 0.9, 1));
    container._rareGlow.setAlpha(0.22 + pulse * 0.16);
    container._rareShine.setAlpha(0.16 + pulse * 0.16);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.outline.forEach((entry) => entry.sprite.destroy());
    this.innerHalo.destroy();
    this.outerHalo.destroy();
    this.sparkles.forEach((sparkle) => sparkle.destroy());
    this.worldArrow.destroy(true);
    this.edgeArrow.destroy(true);
  }
}
