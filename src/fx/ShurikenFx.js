// "Suco" da Shuriken (aço, branco-azulado) e da NeoShuriken (roxo cyber).
// Tudo é só visual — não mexe em dano, velocidade, alcance nem hitbox.
// Mesmo vocabulário do ShotFx/SlashFx: clarão aditivo + faíscas + rastro.

const STEEL = 0xcfe8ff;
const WHITE = 0xffffff;

// ---------------------------------------------------------------- textura
// Shuriken de 4 pontas finas e afiadas, com fio claro e furo escuro no meio.
// Desenhada uma vez (Graphics + generateTexture), 32x32.
export const SHURIKEN_TEX_KEY = 'fx_shuriken_hd';
export const SHURIKEN_TEX_SIZE = 32;
export const SHURIKEN_DISPLAY_SCALE = 0.85;

export function ensureShurikenTexture(scene) {
  if (scene.textures.exists(SHURIKEN_TEX_KEY)) return SHURIKEN_TEX_KEY;

  const s = SHURIKEN_TEX_SIZE;
  const c = s / 2;
  const g = scene.add.graphics();
  const tip = s * 0.5;
  const wing = s * 0.2;
  const back = s * 0.1;

  // contorno escuro (silhueta) — mantém a forma legível mesmo com brilho por trás
  g.fillStyle(0x0b0b12, 1);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const px = (x, y) => c + x * cos - y * sin;
    const py = (x, y) => c + x * sin + y * cos;
    const t = tip + 1.5;
    const w = wing + 1.8;
    g.fillTriangle(px(t, 0), py(t, 0), px(back - 1.5, -w), py(back - 1.5, -w), px(back - 1.5, w), py(back - 1.5, w));
  }
  g.fillCircle(c, c, s * 0.24);

  // pontas em losango curvado (base larga lateral + ponta fina)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const px = (x, y) => c + x * cos - y * sin;
    const py = (x, y) => c + x * sin + y * cos;

    // corpo da lâmina (cinza-azulado)
    g.fillStyle(0x9fb4c8, 1);
    g.fillTriangle(px(tip, 0), py(tip, 0), px(back, -wing), py(back, -wing), px(back, wing), py(back, wing));
    // metade iluminada (fio de corte)
    g.fillStyle(0xf2faff, 1);
    g.fillTriangle(px(tip, 0), py(tip, 0), px(back, -wing), py(back, -wing), px(back + 2, 0), py(back + 2, 0));
  }

  // miolo + furo
  g.fillStyle(0xdbe8f5, 1);
  g.fillCircle(c, c, s * 0.2);
  g.fillStyle(0x12121a, 1);
  g.fillCircle(c, c, s * 0.1);

  g.generateTexture(SHURIKEN_TEX_KEY, s, s);
  g.destroy();
  return SHURIKEN_TEX_KEY;
}

// ----------------------------------------------------------- utilitários
function additive(img, depth, tint, scale, alpha) {
  img.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(alpha);
  if (tint !== null && tint !== undefined) img.setTint(tint);
  return img;
}

function burst(scene, x, y, { color, count, minDist, maxDist, angle = null, spread = Math.PI * 2, depth = 20, life = [140, 230] }) {
  for (let i = 0; i < count; i++) {
    const a = (angle ?? Phaser.Math.FloatBetween(0, Math.PI * 2)) + Phaser.Math.FloatBetween(-spread / 2, spread / 2);
    const dist = Phaser.Math.Between(minDist, maxDist);
    const shard = additive(
      scene.add.image(x, y, 'hit_fx'),
      depth,
      i % 3 === 0 ? WHITE : color,
      Phaser.Math.FloatBetween(0.14, 0.26),
      1
    ).setRotation(a);
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      scale: shard.scale * 0.3,
      duration: Phaser.Math.Between(life[0], life[1]),
      ease: 'Cubic.easeOut',
      onComplete: () => shard.destroy()
    });
  }
}

function ring(scene, x, y, color, from, to, ms, alpha = 0.75, depth = 19) {
  const r = additive(scene.add.image(x, y, 'hit_fx'), depth, color, from, alpha);
  scene.tweens.add({
    targets: r,
    scale: to,
    alpha: 0,
    duration: ms,
    ease: 'Cubic.easeOut',
    onComplete: () => r.destroy()
  });
}

// ------------------------------------------------------------ lançamento
// Clarão + anel de "whoosh" + faíscas pra frente na direção do arremesso.
export function launchShurikenFx(scene, x, y, angle, color, evolved = false) {
  const k = evolved ? 1.35 : 1;

  const flash = additive(scene.add.image(x, y, 'hit_fx'), 17, evolved ? WHITE : STEEL, 0.4 * k, 0.95).setRotation(angle);
  scene.tweens.add({
    targets: flash,
    scale: 1.2 * k,
    alpha: 0,
    duration: 120,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  ring(scene, x, y, color, 0.25 * k, 1.0 * k, 160, 0.6, 16);

  burst(scene, x, y, {
    color,
    count: Math.round(4 * k),
    minDist: 12,
    maxDist: 26,
    angle,
    spread: 0.8,
    depth: 17,
    life: [90, 160]
  });
}

// ---------------------------------------------------------------- voo
// Aplica brilho e liga o rastro. Retorna nada; o rastro se encerra sozinho
// quando a shuriken é destruída.
export function attachShurikenFlight(scene, bullet, color, evolved = false) {
  const tint = evolved ? color : STEEL;

  // base: aço puro (sem tint, mantém o detalhe); evoluída: tint roxo + brilho discreto
  if (evolved) {
    bullet.setTint(tint);
    if (bullet.preFX) bullet.preFX.addGlow(color, 2, 0, false, 0.1, 6);
  }

  // halo pulsante colado na shuriken (segue a posição a cada frame)
  const halo = additive(
    scene.add.image(bullet.x, bullet.y, 'hit_fx'),
    13,
    tint,
    evolved ? 0.55 : 0.35,
    evolved ? 0.22 : 0.1
  );
  const pulse = scene.tweens.add({
    targets: halo,
    scale: halo.scale * 1.25,
    alpha: halo.alpha * 0.6,
    duration: 130,
    yoyo: true,
    repeat: -1
  });

  const follow = () => {
    if (!bullet.active) {
      scene.events.off('update', follow);
      pulse.stop();
      scene.tweens.add({
        targets: halo,
        alpha: 0,
        scale: 0.1,
        duration: 120,
        onComplete: () => halo.destroy()
      });
      return;
    }
    halo.setPosition(bullet.x, bullet.y);
  };
  scene.events.on('update', follow);

  // rastro: fantasmas da própria shuriken (giram junto) + risco de luz
  const interval = evolved ? 28 : 38;
  const ev = scene.time.addEvent({
    delay: interval,
    loop: true,
    callback: () => {
      if (!bullet.active) {
        ev.remove(false);
        return;
      }
      const ghost = additive(
        scene.add.image(bullet.x, bullet.y, bullet.texture.key),
        14,
        tint,
        bullet.scaleX * 0.95,
        evolved ? 0.3 : 0.2
      ).setRotation(bullet.rotation);
      scene.tweens.add({
        targets: ghost,
        alpha: 0,
        scale: bullet.scaleX * 0.45,
        duration: evolved ? 230 : 180,
        onComplete: () => ghost.destroy()
      });

      // risco de luz alinhado com a direção do voo
      const vx = bullet.body?.velocity.x ?? 0;
      const vy = bullet.body?.velocity.y ?? 0;
      const flightAngle = Math.atan2(vy, vx);
      const streak = additive(
        scene.add.image(bullet.x, bullet.y, 'hit_fx'),
        13,
        tint,
        0.3,
        evolved ? 0.35 : 0.2
      ).setRotation(flightAngle);
      streak.scaleX = evolved ? 1.6 : 1.2;
      scene.tweens.add({
        targets: streak,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.08,
        duration: 170,
        onComplete: () => streak.destroy()
      });

      // NeoShuriken solta fagulhas roxas soltas pelo caminho
      if (evolved && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const spark = additive(
          scene.add.image(bullet.x, bullet.y, 'hit_fx'),
          14,
          Math.random() < 0.4 ? WHITE : color,
          Phaser.Math.FloatBetween(0.1, 0.18),
          0.9
        ).setRotation(a);
        scene.tweens.add({
          targets: spark,
          x: bullet.x + Math.cos(a) * 14,
          y: bullet.y + Math.sin(a) * 14,
          alpha: 0,
          scale: 0.03,
          duration: 200,
          onComplete: () => spark.destroy()
        });
      }
    }
  });
}

// ------------------------------------------------------------- impacto
// Corte em "X" (duas lâminas de luz cruzadas) + clarão + anel + faíscas.
export function spawnShurikenHitFx(scene, x, y, color, angle, evolved = false) {
  const k = evolved ? 1.3 : 1;

  const flash = additive(scene.add.image(x, y, 'hit_fx'), 21, WHITE, 0.4 * k, 1);
  scene.tweens.add({
    targets: flash,
    scale: 1.0 * k,
    alpha: 0,
    duration: 130,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy()
  });

  // X cortante: duas barras finas giradas ±45° em relação ao voo
  [Math.PI / 4, -Math.PI / 4].forEach((off, i) => {
    const blade = additive(
      scene.add.image(x, y, 'hit_fx'),
      22,
      i === 0 ? WHITE : color,
      0.25,
      1
    ).setRotation(angle + off);
    blade.scaleX = 0.4 * k;
    blade.scaleY = 0.12;
    scene.tweens.add({
      targets: blade,
      scaleX: 2.4 * k,
      scaleY: 0.03,
      alpha: 0,
      duration: 190,
      ease: 'Cubic.easeOut',
      onComplete: () => blade.destroy()
    });
  });

  ring(scene, x, y, color, 0.3 * k, 1.35 * k, 190, 0.7, 20);

  burst(scene, x, y, {
    color,
    count: Math.round(6 * k),
    minDist: 14,
    maxDist: 34,
    angle: angle + Math.PI,
    spread: 1.8
  });

  if (evolved) scene.cameras.main.shake(60, 0.0016);
}

// ------------------------------------------------- salto da NeoShuriken
// Raio zigue-zague entre o inimigo atingido e o próximo alvo + pulso na
// shuriken. Desenhado com Graphics e some em ~160ms.
export function spawnChainLightningFx(scene, from, to, color) {
  const g = scene.add.graphics().setDepth(19).setBlendMode(Phaser.BlendModes.ADD);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const segs = Math.max(4, Math.round(len / 18));

  const pts = [{ x: from.x, y: from.y }];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jitter = Phaser.Math.FloatBetween(-9, 9);
    pts.push({ x: from.x + dx * t + nx * jitter, y: from.y + dy * t + ny * jitter });
  }
  pts.push({ x: to.x, y: to.y });

  const stroke = (width, c, a) => {
    g.lineStyle(width, c, a);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
  };
  stroke(7, color, 0.35); // aura
  stroke(3, color, 0.9); // corpo
  stroke(1.2, WHITE, 1); // núcleo

  scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: 170,
    ease: 'Cubic.easeIn',
    onComplete: () => g.destroy()
  });

  ring(scene, from.x, from.y, color, 0.3, 1.5, 200, 0.8, 20);
  ring(scene, to.x, to.y, color, 0.2, 0.9, 200, 0.6, 20);
  burst(scene, from.x, from.y, { color, count: 7, minDist: 14, maxDist: 32 });
}

// -------------------------------------------------------------- sumiço
// Fim de vida (parede ou tempo): estilhaço curto em vez de sumir seco.
export function spawnShurikenFadeFx(scene, x, y, color) {
  ring(scene, x, y, color, 0.2, 0.7, 150, 0.5, 18);
  burst(scene, x, y, { color, count: 4, minDist: 8, maxDist: 20, life: [110, 180] });
}
