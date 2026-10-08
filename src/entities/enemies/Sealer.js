import Enemy from './Enemy.js';
import DamageSystem from '../../combat/DamageSystem.js';

// Fechador de Arena (def.sealer = true, ver data/enemies.js): fica na dele e fecha
// uma arena circular em volta do jogador.
export default class Sealer extends Enemy {
  constructor(scene, x, y, def) {
    super(scene, x, y, def);
    // Sealer (def.sealer = true, ver data/enemies.js): não persegue, fica
    this.body.setImmovable(true);
    this.arenaCenter = null;
    this.arenaBirthMs = null;
    this.arenaTargetPlayerId = null;
    this.arenaRadius = null;
    this.arenaProgress = 0;
    this.arenaGraphics = null;
    this.arenaNextVisualUpdateAt = 0;
    this.arenaNextCrushTickAt = 0;
    // Movimento em "rajadas" (ver _updateSealerMovement/_decideSealerMoveDi…
    this.sealerMoveDir = { x: 0, y: 0 };
    this.sealerNextDecisionAt = 0;
  }

  _specialChase(target, nowMs, speedMultiplier) {
    // Sealer: nunca persegue o jogador — foge dele (mantendo-se mais pro
    this._updateArena(target, nowMs, speedMultiplier);
    return true;
  }

  _cancelActionsForFlee() {
    // Sealer é imóvel de propósito (ver constructor) — sem isto ele
    this.body.setImmovable(false);
  }

  _cleanupSpecial() {
    // Sealer: o anel da arena não é filho do sprite (é um Graphics à
    this.arenaGraphics?.destroy();
  }

  // Sealer (def.sealer = true): forma uma arena circular fixa no mundo,
  _updateArena(target, nowMs, speedMultiplier = 1) {
    this.arenaTargetPlayerId = target === this.scene.player
      ? this.scene.multiplayer?.playerId ?? null
      : target.playerId ?? null;
    if (!this.arenaCenter) {
      // nasce agora: centro fixo = onde o jogador estava neste instante
      this.arenaCenter = { x: target.x, y: target.y };
      this.arenaBirthMs = nowMs;
      this.arenaGraphics = this.scene.add.graphics().setDepth(4);
    }

    const t = Phaser.Math.Clamp(
      (nowMs - this.arenaBirthMs) / this.def.arenaShrinkDurationMs, 0, 1
    );
    const radius = Phaser.Math.Linear(this.def.arenaStartRadius, this.def.arenaMinRadius, t);
    this.arenaRadius = radius;
    this.arenaProgress = t;
    this._drawArena(radius, t, nowMs);

    // Foge da horda (nunca do jogador — é assim que ele fica mais fácil
    if (nowMs >= this.knockbackUntil) {
      this._updateSealerMovement(target, radius, nowMs, speedMultiplier);
    }

    this._containWithinArena(target, radius);
    // o próprio Sealer também é contido — sem isto, se ele nascer perto da
    this._containWithinArena(this, radius);
    this.scene.enemySpawner?.group.getChildren().forEach((enemy) => {
      if (enemy !== this && enemy.active) this._containWithinArena(enemy, radius);
    });

    if (t >= 1) {
      if (nowMs >= this.arenaNextCrushTickAt) {
        this.arenaNextCrushTickAt = nowMs + 500;
        if (target.active && !target.healthSystem?.isDead()) {
          DamageSystem.applyWeaponHit(target, this.def.arenaCrushDamagePerSecond * 0.5, this, nowMs);
        }
      }
    }
  }

  // Só redecide a direção do Sealer a cada ~0,5–0,9s (não todo frame — ver
  _updateSealerMovement(target, radius, nowMs, speedMultiplier) {
    if (nowMs >= this.sealerNextDecisionAt) {
      this.sealerNextDecisionAt = nowMs + Phaser.Math.Between(500, 900);
      this.sealerMoveDir = this._decideSealerMoveDir(target, radius);
    }
    const speed = this.def.speed * speedMultiplier;
    this._moveTo(this.sealerMoveDir.x * speed, this.sealerMoveDir.y * speed);
  }

  // Uma "decisão" do Sealer: se o jogador estiver longe, na maior parte
  _decideSealerMoveDir(target, radius) {
    const FLEE_TRIGGER_RANGE = 340;
    const dpx = this.x - target.x;
    const dpy = this.y - target.y;
    const distFromPlayer = Math.sqrt(dpx * dpx + dpy * dpy);

    // vetor radial (do centro da arena pro Sealer) — usado tanto pro
    const dcx = this.x - this.arenaCenter.x;
    const dcy = this.y - this.arenaCenter.y;
    const distFromCenter = Math.sqrt(dcx * dcx + dcy * dcy);
    const edgeFactor = Phaser.Math.Clamp(distFromCenter / radius, 0, 1); // 0 centro, 1 borda
    const nx = distFromCenter > 0 ? dcx / distFromCenter : 1;
    const ny = distFromCenter > 0 ? dcy / distFromCenter : 0;

    if (distFromPlayer >= FLEE_TRIGGER_RANGE) {
      // jogador longe: maioria das vezes parado; quando anda, é sempre
      if (Math.random() < 0.55) return { x: 0, y: 0 };
      const angle = Math.atan2(-ny, -nx) + Phaser.Math.FloatBetween(-0.9, 0.9);
      return { x: Math.cos(angle), y: Math.sin(angle) };
    }

    // direção "ingênua" de fuga: pra longe do jogador
    const fx0 = dpx / (distFromPlayer || 1);
    const fy0 = dpy / (distFromPlayer || 1);

    let fx = fx0;
    let fy = fy0;

    // Perto da borda, se essa fuga aponta CONTRA a parede (produto
    if (edgeFactor > 0.5) {
      const outward = fx0 * nx + fy0 * ny;
      if (outward > 0) {
        const tx = -ny;
        const ty = nx;
        const side = (fx0 * tx + fy0 * ty) >= 0 ? 1 : -1;
        fx = tx * side;
        fy = ty * side;
      }
    }

    const angle = Math.atan2(fy, fx) + Phaser.Math.FloatBetween(-0.25, 0.25);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  // Empurra `body` (jogador ou outro inimigo) de volta pra dentro do
  _containWithinArena(body, radius) {
    if (typeof body.setPosition !== 'function') return;
    const dx = body.x - this.arenaCenter.x;
    const dy = body.y - this.arenaCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= radius || dist === 0) return;
    const scale = radius / dist;
    body.setPosition(this.arenaCenter.x + dx * scale, this.arenaCenter.y + dy * scale);
  }

  syncArenaVisual(centerX, centerY, radius, progress, targetPlayerId) {
    if (![centerX, centerY, radius, progress].every(Number.isFinite)) return;
    this.arenaCenter = { x: centerX, y: centerY };
    this.arenaTargetPlayerId = typeof targetPlayerId === 'string' ? targetPlayerId : null;
    this.arenaRadius = radius;
    this.arenaProgress = Phaser.Math.Clamp(progress, 0, 1);
    if (!this.arenaGraphics) this.arenaGraphics = this.scene.add.graphics().setDepth(4);
    this._drawArena(this.arenaRadius, this.arenaProgress, this.scene.time.now, true);
    if (this.arenaTargetPlayerId === this.scene.multiplayer?.playerId) {
      this._containWithinArena(this.scene.player, this.arenaRadius);
    }
  }

  // Desenha o anel da arena — vai de um roxo frio (recém-aberta) pra um
  _drawArena(radius, t, nowMs = this.scene.time.now, force = false) {
    const g = this.arenaGraphics;
    if (!g || !this.arenaCenter) return;
    // O anel encolhe por vários segundos; reconstruir o Graphics a cada frame
    // não muda a leitura e custa caro. 30 FPS visuais são mais que suficientes.
    if (!force && nowMs < this.arenaNextVisualUpdateAt) return;
    this.arenaNextVisualUpdateAt = nowMs + 33;

    g.clear();
    // Interpolação manual evita criar dois Phaser.Display.Color + resultado
    // em toda atualização visual.
    const p = Phaser.Math.Clamp(t, 0, 1);
    const r = Math.round(0x9b + (0xff - 0x9b) * p);
    const gr = Math.round(0x30 + (0x1a - 0x30) * p);
    const b = Math.round(0xff + (0x1a - 0xff) * p);
    const stroke = (r << 16) | (gr << 8) | b;
    g.lineStyle(6, stroke, 0.85);
    g.strokeCircle(this.arenaCenter.x, this.arenaCenter.y, radius);
  }
}
