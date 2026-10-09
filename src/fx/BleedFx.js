// Feedback visual do status Sangramento (evoluÃ§Ã£o Hemorragia).
// O efeito Ã© desenhado em cÃ³digo para nÃ£o exigir spritesheet novo e ficar
// barato mesmo quando vÃ¡rios inimigos recebem o status na mesma run.

// Fluido roxo: mantem a leitura de status sem representar sangue real.
const BLEED_DARK = 0x26083d;
const BLEED_MAIN = 0x8f39c7;
const BLEED_BRIGHT = 0xe0a0ff;
const UPDATE_INTERVAL_MS = 33;

export function createBleedFx(scene, enemy) {
  const graphics = scene.add.graphics()
    .setDepth(Math.max(enemy.depth + 2, 12))
    .setVisible(false);

  return {
    graphics,
    seed: Math.random() * Math.PI * 2,
    nextUpdateAt: 0,
    pulseUntil: 0,
    visible: false
  };
}

export function triggerBleedTickFx(state, nowMs) {
  if (!state) return;
  state.pulseUntil = Math.max(state.pulseUntil, nowMs + 130);
  state.nextUpdateAt = 0;
}

export function updateBleedFx(state, enemy, nowMs, bleeding) {
  if (!state?.graphics) return;

  if (!bleeding || !enemy.active) {
    if (state.visible) {
      state.visible = false;
      state.graphics.setVisible(false);
      state.graphics.clear();
    }
    return;
  }

  if (nowMs < state.nextUpdateAt) return;
  state.nextUpdateAt = nowMs + UPDATE_INTERVAL_MS;

  const g = state.graphics;
  const pulse = nowMs < state.pulseUntil
    ? (state.pulseUntil - nowMs) / 130
    : 0;
  const t = nowMs * 0.006 + state.seed;
  const width = Math.max(22, enemy.displayWidth * 0.42);
  const height = Math.max(22, enemy.displayHeight * 0.42);
  const centerX = enemy.x;
  const centerY = enemy.y - enemy.displayHeight * 0.12;

  state.visible = true;
  g.setVisible(true);
  g.clear();

  // Halo curto e discreto: reforÃ§a o status sem virar um segundo telegraph.
  g.lineStyle(2.5 + pulse * 2, BLEED_DARK, 0.5 + pulse * 0.25);
  g.strokeEllipse(centerX, centerY + height * 0.18, width * 1.55, height * 0.62);

  const drops = [
    { a: t, radius: 2.4, color: BLEED_BRIGHT },
    { a: t + 2.1, radius: 2.8, color: BLEED_MAIN },
    { a: t + 4.2, radius: 1.9, color: BLEED_BRIGHT }
  ];

  drops.forEach((drop, index) => {
    const orbit = 0.78 + index * 0.12;
    const x = centerX + Math.cos(drop.a) * width * orbit;
    const y = centerY + Math.sin(drop.a * 1.17) * height * 0.46;
    const fall = (Math.sin(t * 1.7 + index * 2.4) + 1) * 0.5;
    const radius = drop.radius * (1 + pulse * 0.35);

    g.fillStyle(drop.color, 0.78 + pulse * 0.18);
    g.fillCircle(x, y + fall * 5, radius);
    g.fillTriangle(
      x,
      y + radius * 2.4 + fall * 5,
      x - radius * 0.72,
      y + radius * 0.3 + fall * 5,
      x + radius * 0.72,
      y + radius * 0.3 + fall * 5
    );
  });

  if (pulse > 0) {
    g.lineStyle(2, BLEED_BRIGHT, pulse * 0.8);
    g.strokeCircle(centerX, centerY, Math.max(8, width * 0.34) * (1.2 - pulse * 0.2));
  }
}

export function destroyBleedFx(state) {
  state?.graphics?.destroy();
}
