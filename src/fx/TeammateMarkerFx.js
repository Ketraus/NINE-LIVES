// Indicador de borda de tela para companheiros fora da câmera: um quadrado na
// cor do gato de cada vaga (mesma ideia das setas de medkit/ímã, sem a seta).
// Puramente visual: não toca em rede, física ou autoridade de multiplayer.
const SIZE = 14;
const BORDER = 2;
const EDGE_MARGIN_PX = 22;
const DEPTH = 189;

// vaga 0 = Host original (preto), 1 = branco, 2 = laranja, 3 = marrom
const SLOT_STYLES = [
  { fill: 0x000000, outline: 0xffffff },
  { fill: 0xffffff, outline: 0x020713 },
  { fill: 0xff8a1f, outline: 0x020713 },
  { fill: 0x8b5a3c, outline: 0x020713 }
];

export default class TeammateMarkerFx {
  constructor(scene, slot = 0) {
    this.scene = scene;
    this.destroyed = false;
    this.slot = -1;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.setSlot(slot);

    // mesmo isolamento das setas: câmeras auxiliares (pausa etc.) não desenham
    scene.cameras.cameras.forEach((camera) => {
      if (camera !== scene.cameras.main) camera.ignore(this.gfx);
    });
  }

  setSlot(slot) {
    const index = Phaser.Math.Clamp(Math.floor(slot) || 0, 0, SLOT_STYLES.length - 1);
    if (index === this.slot) return;
    this.slot = index;
    const style = SLOT_STYLES[index];
    const half = SIZE / 2;
    const g = this.gfx;
    g.clear();
    g.fillStyle(style.outline, 1);
    g.fillRect(-half - BORDER, -half - BORDER, SIZE + BORDER * 2, SIZE + BORDER * 2);
    if (style.split) {
      g.fillStyle(style.split[0], 1);
      g.fillRect(-half, -half, half, SIZE);
      g.fillStyle(style.split[1], 1);
      g.fillRect(0, -half, half, SIZE);
    } else {
      g.fillStyle(style.fill, 1);
      g.fillRect(-half, -half, SIZE, SIZE);
    }
  }

  // x/y = posição do companheiro no mundo; enabled=false esconde (morto, lobby...)
  update(x, y, enabled, time) {
    if (this.destroyed) return;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const offscreen = !Phaser.Geom.Rectangle.Contains(view, x, y);
    if (!enabled || !offscreen) {
      this.gfx.setVisible(false);
      return;
    }

    const cx = view.centerX;
    const cy = view.centerY;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      this.gfx.setVisible(false);
      return;
    }

    // margem em pixels de TELA convertida pro mundo (igual em PC e celular)
    const zoom = Math.max(cam.zoom, 0.01);
    const margin = EDGE_MARGIN_PX / zoom;
    const halfW = Math.max(1, view.width * 0.5 - margin);
    const halfH = Math.max(1, view.height * 0.5 - margin);
    const tx = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
    const factor = Math.min(tx, ty);

    const pulse = 0.5 + 0.5 * Math.sin(time * 0.006);
    this.gfx
      .setPosition(cx + dx * factor, cy + dy * factor)
      .setScale((1 / zoom) * (0.95 + pulse * 0.1))
      .setVisible(true);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gfx.destroy();
  }
}
