// Feedback visual do status Sangramento (evolução Hemorragia).
//
// O efeito usa uma textura compartilhada e um sprite por inimigo. A versão
// anterior reconstruía um Phaser.Graphics inteiro a cada 33 ms para cada
// inimigo sangrando; em uma horda isso virava centenas de clear()/draw por
// segundo e derrubava os frames justamente quando os VFX apareciam.

const BLEED_TEXTURE_KEY = '__nine_lives_bleed_fx';
const BLEED_TEXTURE_W = 64;
const BLEED_TEXTURE_H = 64;
const BLEED_DARK = '#26083d';
const BLEED_MAIN = '#8f39c7';
const BLEED_BRIGHT = '#e0a0ff';
const UPDATE_INTERVAL_MS = 33;

function ensureBleedTexture(scene) {
  if (scene.textures.exists(BLEED_TEXTURE_KEY)) return;

  const texture = scene.textures.createCanvas(BLEED_TEXTURE_KEY, BLEED_TEXTURE_W, BLEED_TEXTURE_H);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, BLEED_TEXTURE_W, BLEED_TEXTURE_H);

  // Halo escuro e três gotas: desenhado uma única vez, compartilhado por toda
  // a horda. A rotação do sprite mantém a sensação de movimento sem retriangular.
  ctx.strokeStyle = BLEED_DARK;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(32, 39, 25, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  const drops = [
    { x: 12, y: 24, radius: 3.2, color: BLEED_BRIGHT },
    { x: 35, y: 18, radius: 3.7, color: BLEED_MAIN },
    { x: 53, y: 29, radius: 2.6, color: BLEED_BRIGHT }
  ];
  drops.forEach(({ x, y, radius, color }) => {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y + radius * 2.4);
    ctx.lineTo(x - radius * 0.72, y + radius * 0.3);
    ctx.lineTo(x + radius * 0.72, y + radius * 0.3);
    ctx.closePath();
    ctx.fill();
  });

  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function createBleedFx(scene, enemy) {
  ensureBleedTexture(scene);
  const sprite = scene.add
    .image(enemy.x, enemy.y, BLEED_TEXTURE_KEY)
    .setDepth(Math.max(enemy.depth + 2, 12))
    .setOrigin(0.5, 0.5)
    .setVisible(false);

  return {
    sprite,
    seed: Math.random() * Math.PI * 2,
    nextUpdateAt: 0,
    pulseUntil: 0,
    visible: false,
    width: 0,
    height: 0
  };
}

export function triggerBleedTickFx(state, nowMs) {
  if (!state) return;
  state.pulseUntil = Math.max(state.pulseUntil, nowMs + 130);
  state.nextUpdateAt = 0;
}

export function updateBleedFx(state, enemy, nowMs, bleeding) {
  if (!state?.sprite) return;

  if (!bleeding || !enemy.active) {
    if (state.visible) {
      state.visible = false;
      state.sprite.setVisible(false);
    }
    return;
  }

  if (nowMs < state.nextUpdateAt) return;
  state.nextUpdateAt = nowMs + UPDATE_INTERVAL_MS;

  const pulse = nowMs < state.pulseUntil
    ? (state.pulseUntil - nowMs) / 130
    : 0;
  const t = nowMs * 0.006 + state.seed;
  const width = Math.max(22, enemy.displayWidth * 0.42);
  const height = Math.max(22, enemy.displayHeight * 0.42);

  state.visible = true;
  state.sprite.setVisible(true);
  state.sprite.setPosition(enemy.x, enemy.y - enemy.displayHeight * 0.12 + Math.sin(t * 1.7) * 2);
  state.sprite.setRotation(t);
  state.sprite.setAlpha(0.82 + pulse * 0.18);

  // A escala só muda quando o corpo muda de tamanho; não há desenho novo por
  // frame. O pulso do dano usa transformações baratas do sprite.
  if (Math.abs(width - state.width) > 0.5 || Math.abs(height - state.height) > 0.5) {
    state.width = width;
    state.height = height;
  }
  const pulseScale = 1 + pulse * 0.1;
  state.sprite.setScale(
    ((state.width * 1.55) / 50) * pulseScale,
    ((state.height * 0.62) / 16) * pulseScale
  );
}

export function destroyBleedFx(state) {
  state?.sprite?.destroy();
}
