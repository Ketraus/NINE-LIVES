import HealthSystem from '../../combat/HealthSystem.js';
import EventBus from '../../systems/EventBus.js';
import DamageSystem from '../../combat/DamageSystem.js';

let nextInstanceId = 1;

// Tint aplicado enquanto o inimigo está paralisado (carta "Overcharge" —
const PARALYZE_TINT = 0x1a1a66;
// Tint aplicado enquanto o inimigo está sangrando (carta "Hemorragia" —
const BLEED_TINT = 0x8a0000;

// Visual do míssil de verdade do Elite (ver _launchMissiles/
const MISSILE_COLOR = 0xff6633;
const MISSILE_RADIUS = 7;
const MISSILE_ARC_HEIGHT = 60;
// Toca o som de lançamento mais rápido que o normal (Sound.rate do
const MISSILE_LAUNCH_SFX_RATE = 2.2;

// Telegraph do Elite "piscando" (ver _drawMissileTelegraph) — alterna
const MISSILE_BLINK_PERIOD_MS = 260;
const MISSILE_BLINK_ALPHA_MIN = 0.12;
const MISSILE_BLINK_ALPHA_MAX = 0.42;

// Tremida de câmera do ataque de mísseis — leve no lançamento (dá peso…
const MISSILE_LAUNCH_SHAKE_MS = 100;
const MISSILE_LAUNCH_SHAKE_INTENSITY = 0.006;
const MISSILE_EXPLOSION_SHAKE_MS = 260;
const MISSILE_EXPLOSION_SHAKE_INTENSITY = 0.012;

// Tremida do golpe corpo a corpo do Elite — mesmo espírito do lançamento
const MELEE_SHAKE_MS = 220;
const MELEE_SHAKE_INTENSITY = 0.012;

// Investida do Minotauro (def.boss, ver _updateBossAbility e afins) — u…
const CHARGE_LINE_LENGTH = 1400;
const CHARGE_LAUNCH_SHAKE_MS = 120;
const CHARGE_LAUNCH_SHAKE_INTENSITY = 0.006;
const CHARGE_IMPACT_SHAKE_MS = 260;
const CHARGE_IMPACT_SHAKE_INTENSITY = 0.018;
// tint "atordoado" durante a janela vulnerável pós-investida (ver
const CHARGE_VULNERABLE_TINT = 0xffaaaa;
// Corte (evolução da Investida — ver _startSwing/_resolveSwing): o golpe
const CHARGE_SWING_COLOR = 0xff8800;
const CHARGE_SWING_SHAKE_MS = 280;
const CHARGE_SWING_SHAKE_INTENSITY = 0.02;

// Machado Arremessado (2ª habilidade do Minotauro, sorteada 50/50 com a
const AXE_SPIN_DEG_PER_MS = 0.9;
const AXE_SPRITE_SCALE = 2.2; // arte ocupa só um canto do canvas 64x64 — aumenta o tamanho visual do machado arremessado
const AXE_THROW_SHAKE_MS = 90;
const AXE_THROW_SHAKE_INTENSITY = 0.004;
const AXE_IMPACT_SHAKE_MS = 160;
const AXE_IMPACT_SHAKE_INTENSITY = 0.01;
// explosão bem mais dramática — o jogador teve charging + beep inteiros
// pra ver que vinha, então o pay-off precisa ser grande (ver _explodeAxe)
const AXE_EXPLOSION_SHAKE_MS = 420;
const AXE_EXPLOSION_SHAKE_INTENSITY = 0.03;
const AXE_EXPLOSION_FLASH_MS = 180;
const AXE_EXPLOSION_SHARD_COUNT = 18;
// aviso do machado cravado (pisca branco + pulsa de tamanho) enquanto
// carrega — fica mais rápido/urgente assim que o beep final começa
const AXE_STUCK_PULSE_PERIOD_MS = 340;
const AXE_STUCK_PULSE_PERIOD_URGENT_MS = 130;
const AXE_STUCK_PULSE_SCALE = 0.16;
const AXE_STUCK_PULSE_SCALE_URGENT = 0.3;
// amarelo (impacto) e laranja-avermelhado (explosão) — bem diferentes do
const AXE_TELEGRAPH_COLOR = 0xffcc00;
const AXE_EXPLOSION_COLOR = 0xff4400;

// Corte Destrutivo (3ª habilidade do Minotauro, sorteada 1/3 com a
const CLEAVE_COLOR = 0xff1133;
const CLEAVE_WHISTLE_VOLUME_START = 0.05;
const CLEAVE_WHISTLE_VOLUME_END = 0.8;
const CLEAVE_WHISTLE_RATE_START = 0.7;
const CLEAVE_WHISTLE_RATE_END = 1.8;
const CLEAVE_TELEGRAPH_ALPHA_START = 0.22;
const CLEAVE_TELEGRAPH_ALPHA_END = 0.6;
const CLEAVE_SHAKE_MS = 150;
const CLEAVE_SHAKE_INTENSITY = 0.008;

// Pisão (4ª habilidade do Minotauro, "SAI DE PERTO" — ver
const STOMP_TELEGRAPH_COLOR = 0xffffff;
const STOMP_IMPACT_COLOR = 0xdddddd;
const STOMP_SHAKE_MS = 140;
const STOMP_SHAKE_INTENSITY = 0.01;

// Fuga em massa (evento do Boss/Minotauro, ver SpawnDirector.
const FLEE_SPEED_MULTIPLIER = 1.8;
const FLEE_DESPAWN_MARGIN = 150;
const FLEE_MAX_DURATION_MS = 15000;

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, def) {
    super(scene, x, y, def.sprite);
    this.def = def;
    this.name = def.id;
    // id único por instância — usado como chave de cooldown de dano de
    this.id = `${def.id}_${nextInstanceId++}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const radius = this.width / 2 - 2;
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setDepth(9);
    this.setTint(def.color);

    // Escala base opcional (def.scale, ex.: Sealer maior pra se destacar
    this.baseScale = def.scale || 1;
    this.setScale(this.baseScale, this.baseScale);

    // Sprite com animação de verdade (hoje só o Minotauro, ver
    if (def.walkAnim) {
      this.anims.play(def.walkAnim);
    }
    this.walkAnim = def.walkAnim || null;
    this.idleTexture = def.idleTexture || null;
    this.isIdleVisual = false;
    // Versões SEM machado (Machado Arremessado, ver _launchAxe/
    this.walkAnimNormal = this.walkAnim;
    this.idleTextureNormal = this.idleTexture;
    this.walkAnimDisarmed = def.walkAnimNoAxe || this.walkAnim;
    this.idleTextureDisarmed = def.idleTextureNoAxe || this.idleTexture;
    this.walkAnimRage = def.walkAnimRage || this.walkAnim;
    this.idleTextureRage = def.idleTextureRage || this.idleTexture;
    // Rage + desarmado ao mesmo tempo (ver _refreshBossVisual) — cai pra
    this.walkAnimRageDisarmed = def.walkAnimRageNoAxe || this.walkAnimRage;
    this.idleTextureRageDisarmed = def.idleTextureRageNoAxe || this.idleTextureRage;
    this.isDisarmed = false;
    this.isEnraged = false;
    this.rageHpThreshold = def.rageHpThreshold || 0;

    this.healthSystem = new HealthSystem(def.hp, {
      onDeath: () => this.die(),
      // Rage (só dispara se def.rageHpThreshold existir, ou seja, só no
      onChange: (current, max) => {
        if (!this.isEnraged && this.rageHpThreshold > 0 && current <= max * this.rageHpThreshold) {
          this._triggerRage();
        }
      }
    });

    // até este timestamp (scene.time.now), chase() não sobrescreve a
    this.knockbackUntil = 0;

    // até este timestamp (scene.time.now), o inimigo está paralisado (carta
    this.paralyzedUntil = 0;

    // Fuga em massa (evento do Boss, ver flee()/FLEE_* acima): true a
    this.fleeing = false;
    this.fleeMaxUntil = 0;
    this.fleeDirX = 0;
    this.fleeDirY = 0;

    // sangramento (carta "Hemorragia" — evolução da Sanguessuga, ver
    this.bleedUntil = 0;
    this.bleedTickDamage = 0;
    this.bleedTickIntervalMs = 500;
    this.nextBleedTickAt = 0;

    // cor de tint "de status" (paralisia/sangramento) atualmente aplicada —
    this._currentStatusTint = def.color;

    // Exploder (def.explodes = true, ver data/enemies.js): máquina de
    this.explodeState = 'chasing';
    this.explodePrepUntil = 0;

    // Sealer (def.sealer = true, ver data/enemies.js): não persegue, fica
    if (def.sealer) {
      this.body.setImmovable(true);
      this.arenaCenter = null;
      this.arenaBirthMs = null;
      this.arenaGraphics = null;
      this.arenaNextCrushTickAt = 0;
      // Movimento em "rajadas" (ver _updateSealerMovement/_decideSealerMoveDi…
      this.sealerMoveDir = { x: 0, y: 0 };
      this.sealerNextDecisionAt = 0;
    }

    // Elite (def.elite = true, ver data/enemies.js): no "estado normal"
    if (def.elite) {
      this.eliteState = 'chasing';
      this.eliteNextAttackAt = scene.time.now + Phaser.Math.Between(800, 1800);
      this.eliteTelegraphGraphics = null;
      this.eliteMissilePoints = [];
      this.eliteMissileRevealed = 0;
      this.eliteMissileNextStepAt = 0;
      this.eliteMissileDetonateAt = null;
      this.eliteLaunchDetonateAt = null;
      this.eliteLaunchStartMs = null;
      this.eliteMissileProjectiles = []; // bolas visuais em voo, ver _launchMissiles
      this.eliteMeleeTelegraphUntil = 0;
    }

    // Boss/Minotauro (def.boss = true, ver data/enemies.js): TRÊS
    if (def.boss) {
      this.bossState = 'chasing';
      this.bossChargeReadyAt = scene.time.now + Phaser.Math.Between(1500, 2500);
      this.bossChargeDir = { x: 0, y: 0 };
      this.bossChargeTelegraphUntil = 0;
      this.bossChargeDashUntil = 0;
      this.bossChargeHasHit = false;
      this.bossSwingUntil = 0;
      this.bossVulnerableUntil = 0;
      this.bossTelegraphGraphics = null;
      // Machado Arremessado: ver _startAxeThrow e afins. axeSprite é o
      this.axeSprite = null;
      this.axeTargetX = 0;
      this.axeTargetY = 0;
      // Corte Destrutivo: ver _startCleave e afins. cleaveWhistle é a
      this.cleaveWhistle = null;
      this.cleaveAngle = 0;
      // multiplicador de dano recebido durante a janela vulnerável (ver
      this.vulnerableDamageMultiplier = 1;
      // Pisão: cooldown PRÓPRIO, separado de bossChargeReadyAt — pode
      this.stompReadyAt = scene.time.now + Phaser.Math.Between(1500, 2500);
      this.stompRaiseUntil = 0;
    }
  }

  // Decide e aplica o tint "de status" certo pro instante atual, com
  _refreshStatusTint(nowMs) {
    const desired = nowMs < this.paralyzedUntil
      ? PARALYZE_TINT
      : nowMs < this.bleedUntil
        ? BLEED_TINT
        : this.def.color;
    if (desired !== this._currentStatusTint) {
      this._currentStatusTint = desired;
      this.setTint(desired);
    }
  }

  // Move o inimigo por um frame. IA "principal" continua sendo perseguir
  // Ajusta flipX pra virar o sprite conforme a direção horizontal do
  updateFacing() {
    if (!this.active || !this.body) return; // pode já ter morrido dentro do próprio chase() (ex.: Exploder)
    const vx = this.body.velocity.x;
    if (vx > 5) this.setFlipX(true);
    else if (vx < -5) this.setFlipX(false);
  }

  // Recalcula qual walkAnim/idleTexture usar AGORA, dado o estado atual
  _refreshBossVisual() {
    if (this.isDisarmed && this.isEnraged) {
      this.walkAnim = this.walkAnimRageDisarmed;
      this.idleTexture = this.idleTextureRageDisarmed;
    } else if (this.isDisarmed) {
      this.walkAnim = this.walkAnimDisarmed;
      this.idleTexture = this.idleTextureDisarmed;
    } else if (this.isEnraged) {
      this.walkAnim = this.walkAnimRage;
      this.idleTexture = this.idleTextureRage;
    } else {
      this.walkAnim = this.walkAnimNormal;
      this.idleTexture = this.idleTextureNormal;
    }
    if (this.isIdleVisual) {
      if (this.idleTexture) this.setTexture(this.idleTexture);
    } else if (this.walkAnim) {
      this.anims.play(this.walkAnim);
    }
  }

  // Troca pra versão sem/com machado — ver _refreshBossVisual. Chamado
  _setDisarmed(disarmed) {
    this.isDisarmed = disarmed;
    this._refreshBossVisual();
  }

  // Entra em fúria pro resto da luta (ver rageHpThreshold em
  _triggerRage() {
    this.isEnraged = true;
    this._refreshBossVisual();
    this.scene.cameras.main.shake(250, 0.015);
    this.scene.sound.play('sfx_cyberus_wakeup', { volume: 0.5 });
  }

  // "Minotauro puto" (ver _triggerRage acima): a partir do rage, todo
  _bossCooldown(baseMs) {
    if (this.isEnraged && this.def.rageCooldownMultiplier) {
      return baseMs * this.def.rageCooldownMultiplier;
    }
    return baseMs;
  }

  // Mesma ideia acima, mas pro dano dos ataques (def.rageDamageMultiplier)
  _bossDamage(baseDamage) {
    if (this.isEnraged && this.def.rageDamageMultiplier) {
      return baseDamage * this.def.rageDamageMultiplier;
    }
    return baseDamage;
  }

  // Mesma ideia, mas pro tempo que ele fica PARADO preparando um golpe
  _bossTelegraph(baseMs) {
    if (this.isEnraged && this.def.rageTelegraphMultiplier) {
      return baseMs * this.def.rageTelegraphMultiplier;
    }
    return baseMs;
  }

  // Troca entre a animação de andar e a textura parada (idle) conforme a
  updateAnimState() {
    if (!this.active || !this.body || !this.idleTexture) return;
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    if (speed < 5) {
      if (!this.isIdleVisual) {
        this.anims.stop();
        this.setTexture(this.idleTexture);
        this.isIdleVisual = true;
      }
    } else if (this.isIdleVisual) {
      if (this.walkAnim) this.anims.play(this.walkAnim);
      this.isIdleVisual = false;
    }
  }

  chase(target, nowMs = 0, speedMultiplier = 1, moveDir = null) {
    if (!this.active || this.healthSystem.isDead()) return;

    // Fuga em massa (evento do Boss/Minotauro): assume o movimento por
    if (this.fleeing) { this._updateFlee(nowMs); return; }

    // Exploder: enquanto preparando/explodindo, a máquina de estados
    if (this.def.explodes && this._updateExplosive(target, nowMs)) return;

    // Sealer: nunca persegue o jogador — foge dele (mantendo-se mais pro
    if (this.def.sealer) { this._updateArena(target, nowMs, speedMultiplier); return; }

    // Elite: só assume o movimento (parado) durante o telegraph/ataque
    if (this.def.elite && this._updateElite(target, nowMs)) return;

    // Boss/Minotauro: mesma lógica do Elite acima — só assume o
    if (this.def.boss && this._updateBossAbility(target, nowMs)) return;

    const isParalyzed = nowMs < this.paralyzedUntil;
    this._refreshStatusTint(nowMs);

    if (nowMs < this.knockbackUntil) return; // ainda sendo empurrado, não sobrescreve a velocity
    if (isParalyzed) {
      this.setVelocity(0, 0); // paralisado: para no lugar, não persegue
      return;
    }

    const speed = this.def.speed * speedMultiplier;

    if (moveDir) {
      this.setVelocity(moveDir.x * speed, moveDir.y * speed);
      return;
    }

    // fallback: seek puro direto pro alvo (sem enxame) — mesmo comportament…
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq === 0) return;
    const dist = Math.sqrt(distSq);
    this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  // Aplica (ou reaplica) Sangramento — carta "Hemorragia", evolução da
  applyBleed(tickDamage, nowMs, durationMs, tickIntervalMs) {
    if (!this.active || this.healthSystem.isDead()) return;
    this.bleedTickDamage = tickDamage;
    this.bleedTickIntervalMs = tickIntervalMs;
    this.bleedUntil = nowMs + durationMs;
    this.nextBleedTickAt = nowMs + tickIntervalMs;
  }

  // Chamado todo frame pelo EnemySpawner.updateAll (junto de chase()).
  updateBleed(nowMs) {
    if (!this.active || this.healthSystem.isDead()) return;
    this._refreshStatusTint(nowMs);
    if (nowMs >= this.bleedUntil) return;
    if (nowMs < this.nextBleedTickAt) return;
    this.nextBleedTickAt += this.bleedTickIntervalMs;
    this.healthSystem.takeDamage(this.bleedTickDamage);
  }

  // Empurra o inimigo na direção (dirX, dirY) — vetor já normalizado —
  applyKnockback(dirX, dirY, force, nowMs, durationMs = 130) {
    if (!this.active || this.healthSystem.isDead()) return;
    const resistance = this.def.knockbackResistance ?? 1;
    this.setVelocity(dirX * force * resistance, dirY * force * resistance);
    this.knockbackUntil = nowMs + durationMs;
  }

  // Sealer (def.sealer = true): forma uma arena circular fixa no mundo,
  _updateArena(target, nowMs, speedMultiplier = 1) {
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
    this._drawArena(radius, t);

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
    this.setVelocity(this.sealerMoveDir.x * speed, this.sealerMoveDir.y * speed);
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
    const dx = body.x - this.arenaCenter.x;
    const dy = body.y - this.arenaCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= radius || dist === 0) return;
    const scale = radius / dist;
    body.setPosition(this.arenaCenter.x + dx * scale, this.arenaCenter.y + dy * scale);
  }

  // Desenha o anel da arena — vai de um roxo frio (recém-aberta) pra um
  _drawArena(radius, t) {
    const g = this.arenaGraphics;
    g.clear();
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      new Phaser.Display.Color(0x9b, 0x30, 0xff),
      new Phaser.Display.Color(0xff, 0x1a, 0x1a),
      100, Math.floor(t * 100)
    );
    const stroke = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    g.lineStyle(6, stroke, 0.85);
    g.strokeCircle(this.arenaCenter.x, this.arenaCenter.y, radius);
  }

   // por DamageSystem.applyWeaponHit/applyContactDamage sempre que o alvo é
  playHitReaction() {
    if (!this.active) return;

    // flash branco rápido (volta pro tint de status certo — normal,
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return;
      const nowMs = this.scene.time.now;
      this._currentStatusTint = null; // força setTint mesmo se o resultado "bater" com o que já estava antes…
      this._refreshStatusTint(nowMs);
    });

    // "pop" de impacto: estica/encolhe rápido e volta ao normal — sensação
    this.scene.tweens.killTweensOf(this);
    this.setScale(this.baseScale, this.baseScale);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.22 * this.baseScale,
      scaleY: 0.8 * this.baseScale,
      duration: 55,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => { if (this.active) this.setScale(this.baseScale, this.baseScale); }
    });
  }

  // Estado do Exploder (só roda quando def.explodes = true). Retorna
  _updateExplosive(target, nowMs) {
    if (this.explodeState === 'preparing') {
      this.setVelocity(0, 0);
      if (nowMs >= this.explodePrepUntil) this._explode(target, nowMs);
      return true;
    }
    if (this.explodeState === 'exploding') return true; // já explodindo, die() está a caminho

    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

    if (this.explodeState === 'charging') {
      if (dist <= this.def.explodeTriggerRadius) {
        this._startPreparing(nowMs);
        return true;
      }
      this._seekAt(target, this.def.speed * this.def.explodeChargeSpeedMultiplier);
      return true;
    }

    // 'chasing': ainda no ritmo normal (SwarmSystem/chase() cuida do
    if (dist <= this.def.explodeTriggerRadius) {
      this._startPreparing(nowMs);
      return true;
    }
    if (dist <= this.def.explodeChargeRadius) {
      this._startCharging();
      this._seekAt(target, this.def.speed * this.def.explodeChargeSpeedMultiplier);
      return true;
    }
    return false; // ainda longe: segue perseguição normal (fora daqui)
  }

  // Seek em linha reta pro alvo numa velocidade dada — usado pela
  _seekAt(target, speed) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) { this.setVelocity(0, 0); return; }
    this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  // Início da arrancada ("XANBLAU"): flash branco + esticada rápida,
  _startCharging() {
    this.explodeState = 'charging';
    this.scene.tweens.killTweensOf(this);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (!this.active) return;
      // Do fim do flash branco até bater no alvo (ou virar 'preparing'),
      this._currentStatusTint = null;
      this.scene.tweens.add({
        targets: this,
        alpha: { from: 1, to: 0.5 },
        duration: 80,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => { if (this.active && this.explodeState === 'charging') this.setTintFill(0xff1a1a); }
      });
    });
    this.setScale(1, 1);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.5,
      scaleY: 0.65,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => { if (this.active) this.setScale(1, 1); }
    });
  }

  // Início da preparação: para no lugar e pisca em laranja de aviso.
  _startPreparing(nowMs) {
    this.explodeState = 'preparing';
    this.explodePrepUntil = nowMs + this.def.explodePrepMs;
    this.setVelocity(0, 0);
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      alpha: { from: 1, to: 0.35 },
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 110,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // Fim da preparação: dano em área (via DamageSystem) e morte.
  _explode(target, nowMs) {
    this.explodeState = 'exploding';
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.explodeRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this.def.explodeDamage, this, nowMs);
    }
    this.die();
  }

  // Estado do Elite (só roda quando def.elite = true). Retorna true quando
  _updateElite(target, nowMs) {
    if (this.eliteState === 'missile_telegraph') { this._updateMissileTelegraph(target, nowMs); return true; }
    if (this.eliteState === 'missile_launch') { this._updateMissileLaunch(target, nowMs); return true; }
    if (this.eliteState === 'melee_telegraph') { this._updateMeleeTelegraph(target, nowMs); return true; }
    if (this.eliteState === 'melee_swing') { this._updateMeleeSwing(target, nowMs); return true; }

    if (nowMs < this.eliteNextAttackAt) return false; // ainda na horda, flocking normal

    // Janela de ataque aberta: se o jogador estiver muito perto, golpe
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.eliteMeleeRange) this._startEliteMelee(target, nowMs);
    else this._startEliteMissiles(target, nowMs);
    return true;
  }

  // Início do ataque de mísseis: escolhe a posição do jogador AGORA (não
  _startEliteMissiles(target, nowMs) {
    this.eliteState = 'missile_telegraph';
    this.setVelocity(0, 0);
    if (!this.eliteTelegraphGraphics) this.eliteTelegraphGraphics = this.scene.add.graphics().setDepth(4);

    // Lock: o Elite "trava a mira" no jogador — toca assim que o
    this.scene.sound.play('sfx_elite_lock', { volume: 0.6 });

    const count = this.def.eliteMissileCount;
    this.eliteMissilePoints = [{ x: target.x, y: target.y }];
    for (let i = 1; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.FloatBetween(this.def.eliteMissileSpreadRadius * 0.5, this.def.eliteMissileSpreadRadius);
      this.eliteMissilePoints.push({ x: target.x + Math.cos(angle) * dist, y: target.y + Math.sin(angle) * dist });
    }
    this.eliteMissileRevealed = 0;
    this.eliteMissileNextStepAt = nowMs; // revela a 1ª área já neste frame
    this.eliteMissileDetonateAt = null; // só definido depois que a última área aparecer
  }

  // Revela uma área vermelha por vez (a cada eliteMissileStepGapMs) —
  _updateMissileTelegraph(target, nowMs) {
    this.setVelocity(0, 0);
    if (this.eliteMissileRevealed < this.eliteMissilePoints.length && nowMs >= this.eliteMissileNextStepAt) {
      this.eliteMissileRevealed += 1;
      this.eliteMissileNextStepAt = nowMs + this.def.eliteMissileStepGapMs;
      if (this.eliteMissileRevealed === this.eliteMissilePoints.length) {
        this.eliteMissileDetonateAt = nowMs + this.def.eliteMissileWarnAfterMs;
        // Warning: toca assim que a última área é revelada, cobrindo a
        this.scene.sound.play('sfx_elite_warning', { volume: 0.6 });
      }
    }
    this._drawMissileTelegraph(nowMs);
    if (this.eliteMissileDetonateAt != null && nowMs >= this.eliteMissileDetonateAt) {
      this._launchMissiles(nowMs);
    }
  }

  // Áreas vermelhas piscando (não opacidade fixa) — alterna entre
  _drawMissileTelegraph(nowMs) {
    const g = this.eliteTelegraphGraphics;
    g.clear();

    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const fillAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN, MISSILE_BLINK_ALPHA_MAX, blinkT);
    const strokeAlpha = Phaser.Math.Linear(0.55, 1, blinkT);

    for (let i = 0; i < this.eliteMissileRevealed; i++) {
      const p = this.eliteMissilePoints[i];
      g.fillStyle(0xff2222, fillAlpha);
      g.fillCircle(p.x, p.y, this.def.eliteMissileRadius);
      g.lineStyle(3, 0xff4444, strokeAlpha);
      g.strokeCircle(p.x, p.y, this.def.eliteMissileRadius);
    }
  }

  // Fim do aviso: o míssil sai de verdade. Toca o som de lançamento e usa
  _launchMissiles(nowMs) {
    this.eliteState = 'missile_launch';
    const travelMs = this._playTimedSfx('sfx_elite_launch', 0.6, MISSILE_LAUNCH_SFX_RATE);
    this.scene.cameras.main.shake(MISSILE_LAUNCH_SHAKE_MS, MISSILE_LAUNCH_SHAKE_INTENSITY);
    this.eliteLaunchStartMs = nowMs;
    this.eliteLaunchDetonateAt = nowMs + travelMs;

    this.eliteMissileProjectiles = this.eliteMissilePoints.map((p) => ({
      fx: this.scene.add
        .circle(this.x, this.y, MISSILE_RADIUS, MISSILE_COLOR, 0.95)
        .setStrokeStyle(2, 0xffffff, 0.8)
        .setDepth(15), // acima do chão/telegraph (4), abaixo de UI
      startX: this.x,
      startY: this.y,
      targetX: p.x,
      targetY: p.y
    }));
  }

  // Toca um sfx (opcionalmente mais rápido, ver `rate`) e devolve a
  _playTimedSfx(key, volume, rate = 1) {
    const sfx = this.scene.sound.add(key);
    sfx.play({ volume, rate });
    sfx.once('complete', () => sfx.destroy());
    return (sfx.duration / rate) * 1000;
  }

  // Mísseis voando de verdade: interpola cada bola do Elite até a área
  _updateMissileLaunch(target, nowMs) {
    this.setVelocity(0, 0);
    this._drawMissileTelegraph(nowMs);

    const progress = Math.min(
      (nowMs - this.eliteLaunchStartMs) / (this.eliteLaunchDetonateAt - this.eliteLaunchStartMs),
      1
    );
    this.eliteMissileProjectiles.forEach((m) => {
      m.fx.x = Phaser.Math.Linear(m.startX, m.targetX, progress);
      m.fx.y = Phaser.Math.Linear(m.startY, m.targetY, progress) - Math.sin(progress * Math.PI) * MISSILE_ARC_HEIGHT;
    });

    if (nowMs >= this.eliteLaunchDetonateAt) {
      this.eliteMissileProjectiles.forEach((m) => m.fx.destroy());
      this.eliteMissileProjectiles = [];
      this._detonateMissiles(target, nowMs);
    }
  }

  // Passos 5-6: dano alto em área em cada um dos 3 pontos, só se o
  _detonateMissiles(target, nowMs) {
    this.scene.sound.play('sfx_elite_explosion', { volume: 0.6 });
    this.scene.cameras.main.shake(MISSILE_EXPLOSION_SHAKE_MS, MISSILE_EXPLOSION_SHAKE_INTENSITY);

    this.eliteMissilePoints.forEach((p) => {
      if (target.active && !target.healthSystem?.isDead()) {
        const dist = Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y);
        if (dist <= this.def.eliteMissileRadius) {
          DamageSystem.applyWeaponHit(target, this.def.eliteMissileDamage, this, nowMs);
        }
      }
    });
    this.eliteTelegraphGraphics.clear();
    this.eliteState = 'chasing';
    this.eliteNextAttackAt = nowMs + this.def.eliteAttackIntervalMs;
  }

  // Início do golpe corpo a corpo: aviso em vermelho ao redor do próprio
  _startEliteMelee(target, nowMs) {
    this.eliteState = 'melee_telegraph';
    this.setVelocity(0, 0);
    if (!this.eliteTelegraphGraphics) this.eliteTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.eliteMeleeTelegraphUntil = nowMs + this.def.eliteMeleeTelegraphMs;
  }

  _updateMeleeTelegraph(target, nowMs) {
    this.setVelocity(0, 0);
    this._drawMeleeTelegraph(nowMs);
    if (nowMs >= this.eliteMeleeTelegraphUntil) this._startEliteMeleeSwing(nowMs);
  }

  // Fim do aviso: o soco sai de verdade. Toca sfx_elite_punch e agenda o
  _startEliteMeleeSwing(nowMs) {
    this.eliteState = 'melee_swing';
    this.scene.sound.play('sfx_elite_punch', { volume: 0.7 });
    this.eliteMeleeSwingDetonateAt = nowMs + this.def.eliteMeleePunchImpactMs;
  }

  _updateMeleeSwing(target, nowMs) {
    this.setVelocity(0, 0);
    this._drawMeleeTelegraph(nowMs);
    if (nowMs >= this.eliteMeleeSwingDetonateAt) this._resolveMelee(target, nowMs);
  }

  // Mesmo piscar (alarme) do telegraph de mísseis, ver
  _drawMeleeTelegraph(nowMs) {
    const g = this.eliteTelegraphGraphics;
    g.clear();

    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const fillAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN, MISSILE_BLINK_ALPHA_MAX, blinkT);
    const strokeAlpha = Phaser.Math.Linear(0.55, 1, blinkT);

    g.fillStyle(0xff2222, fillAlpha);
    g.fillCircle(this.x, this.y, this.def.eliteMeleeRange);
    g.lineStyle(3, 0xff4444, strokeAlpha);
    g.strokeCircle(this.x, this.y, this.def.eliteMeleeRange);
  }

  // Dano alto corpo a corpo (só se o jogador ainda estiver no alcance —
  _resolveMelee(target, nowMs) {
    this.eliteTelegraphGraphics.clear();
    this.scene.cameras.main.shake(MELEE_SHAKE_MS, MELEE_SHAKE_INTENSITY);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.eliteMeleeRange && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this.def.eliteMeleeDamage, this, nowMs);
    }
    this.eliteState = 'chasing';
    this.eliteNextAttackAt = nowMs + this.def.eliteMeleeCooldownMs;
  }

  // Estado das TRÊS habilidades do Minotauro (só roda quando def.boss =
  _updateBossAbility(target, nowMs) {
    if (this.bossState === 'charge_telegraph') { this._updateChargeTelegraph(nowMs); return true; }
    if (this.bossState === 'charge_dash') { this._updateChargeDash(target, nowMs); return true; }
    if (this.bossState === 'charge_swing_telegraph') { this._updateChargeSwingTelegraph(target, nowMs); return true; }
    if (this.bossState === 'charge_vulnerable') { this._updateChargeVulnerable(nowMs); return true; }
    if (this.bossState === 'axe_telegraph') { this._updateAxeTelegraph(nowMs); return true; }
    // A partir daqui (machado já fora da mão, ver _launchAxe/_setDisarmed)
    if (this.bossState === 'axe_outbound') { this._updateAxeOutbound(target, nowMs); return false; }
    if (this.bossState === 'axe_stuck') { this._updateAxeStuck(target, nowMs); return false; }
    if (this.bossState === 'axe_raise') { this._updateAxeRaise(nowMs); return false; }
    if (this.bossState === 'axe_return') { this._updateAxeReturn(target, nowMs); return false; }
    if (this.bossState === 'cleave_telegraph') { this._updateCleaveTelegraph(nowMs); return true; }
    if (this.bossState === 'cleave_pause') { this._updateCleavePause(target, nowMs); return true; }
    if (this.bossState === 'cleave_recover') { this._updateCleaveRecover(nowMs); return true; }
    if (this.bossState === 'stomp_raise') { this._updateStompRaise(target, nowMs); return true; }
    // Pisão: checado ANTES do cooldown compartilhado — é reativo (dispara
    if (nowMs >= this.stompReadyAt) {
      const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (distToTarget <= this.def.stompTriggerRadius) {
        this._startStomp(nowMs);
        return true;
      }
    }
    if (nowMs < this.bossChargeReadyAt) return false; // ainda na horda, flocking normal
    // Sorteio 1/3 cada fora do rage. Em rage, os pesos viram
    const chargeWeight = this.isEnraged ? this.def.rageChargeWeight ?? 1 / 3 : 1 / 3;
    const axeWeight = this.isEnraged ? this.def.rageAxeWeight ?? 1 / 3 : 1 / 3;
    const roll = Math.random();
    if (roll < chargeWeight) this._startCharge(target, nowMs);
    else if (roll < chargeWeight + axeWeight) this._startAxeThrow(target, nowMs);
    else this._startCleave(target, nowMs);
    return true;
  }

  // Para, trava a direção da investida NO INSTANTE ATUAL do jogador (o
  _startCharge(target, nowMs) {
    this.bossState = 'charge_telegraph';
    this.setVelocity(0, 0);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    this.bossChargeDir = { x: dx / len, y: dy / len };
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    // telegraph + pequena pausa contam juntos aqui: a linha fica visível
    this.bossChargeTelegraphUntil = nowMs + this._bossTelegraph(this.def.chargeTelegraphMs + this.def.chargePauseMs);
    this.scene.sound.play('sfx_elite_lock', { volume: 0.6 });
  }

  _updateChargeTelegraph(nowMs) {
    this.setVelocity(0, 0);
    this._drawChargeTelegraph(nowMs);
    if (nowMs >= this.bossChargeTelegraphUntil) this._launchCharge(nowMs);
  }

  // Fim do aviso: dispara de verdade na direção travada em _startCharge,
  _launchCharge(nowMs) {
    this.bossState = 'charge_dash';
    this.bossTelegraphGraphics.clear();
    this.bossChargeHasHit = false;
    this.bossChargeDashUntil = nowMs + this.def.chargeDurationMs;
    this.setVelocity(this.bossChargeDir.x * this.def.chargeSpeed, this.bossChargeDir.y * this.def.chargeSpeed);
    this.scene.cameras.main.shake(CHARGE_LAUNCH_SHAKE_MS, CHARGE_LAUNCH_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_elite_punch', { volume: 0.8 });
  }

  // Mantém a velocidade reta em linha (chase() normal não roda neste
  _updateChargeDash(target, nowMs) {
    this.setVelocity(this.bossChargeDir.x * this.def.chargeSpeed, this.bossChargeDir.y * this.def.chargeSpeed);
    if (!this.bossChargeHasHit) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (dist <= this.def.chargeHitRadius && target.active && !target.healthSystem?.isDead()) {
        this.bossChargeHasHit = true;
        DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.chargeDamage), this, nowMs);
        this.scene.cameras.main.shake(CHARGE_IMPACT_SHAKE_MS, CHARGE_IMPACT_SHAKE_INTENSITY);
      }
    }
    if (nowMs >= this.bossChargeDashUntil) this._startSwing(nowMs);
  }

  // Corte (evolução da Investida): IMEDIATAMENTE ao fim da investida,
  _startSwing(nowMs) {
    this.bossState = 'charge_swing_telegraph';
    this.setVelocity(0, 0);
    this.bossSwingUntil = nowMs + this.def.chargeSwingTelegraphMs;
    this.scene.sound.play('sfx_cyberus_slash', { volume: 0.8 });
  }

  _updateChargeSwingTelegraph(target, nowMs) {
    this.setVelocity(0, 0);
    this._drawSwingTelegraph(nowMs);
    if (nowMs >= this.bossSwingUntil) this._resolveSwing(target, nowMs);
  }

  // Dano em área (def.chargeSwingRadius/chargeSwingDamage) + a tremida
  _resolveSwing(target, nowMs) {
    this.bossTelegraphGraphics.clear();
    this.scene.cameras.main.shake(CHARGE_SWING_SHAKE_MS, CHARGE_SWING_SHAKE_INTENSITY);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.chargeSwingRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.chargeSwingDamage), this, nowMs);
    }
    this._endCharge(nowMs);
  }

  // Fim da investida+corte: para, fica "atordoado" (tint +
  _endCharge(nowMs) {
    this.bossState = 'charge_vulnerable';
    this.setVelocity(0, 0);
    this.setTint(CHARGE_VULNERABLE_TINT);
    // mantém _currentStatusTint em sincronia (ver _refreshStatusTint) —
    this._currentStatusTint = CHARGE_VULNERABLE_TINT;
    this.vulnerableDamageMultiplier = this.def.chargeVulnerableDamageMultiplier;
    this.bossVulnerableUntil = nowMs + this.def.chargeVulnerableMs;
  }

  _updateChargeVulnerable(nowMs) {
    this.setVelocity(0, 0);
    if (nowMs >= this.bossVulnerableUntil) {
      this._refreshStatusTint(nowMs); // volta pro tint normal (ou de status, se houver)
      this.vulnerableDamageMultiplier = 1;
      this.bossState = 'chasing';
      this.bossChargeReadyAt = nowMs + this._bossCooldown(this.def.chargeCooldownMs);
    }
  }

  // Linha reta piscando (mesmo piscar do Elite, ver MISSILE_BLINK_*) na
  _drawChargeTelegraph(nowMs) {
    const g = this.bossTelegraphGraphics;
    g.clear();
    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const alpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN + 0.3, MISSILE_BLINK_ALPHA_MAX + 0.3, blinkT);
    g.lineStyle(5, 0xff2222, alpha);
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.lineTo(this.x + this.bossChargeDir.x * CHARGE_LINE_LENGTH, this.y + this.bossChargeDir.y * CHARGE_LINE_LENGTH);
    g.strokePath();
  }

  // Área do Corte (laranja, pra não confundir com a linha vermelha da
  _drawSwingTelegraph(nowMs) {
    const g = this.bossTelegraphGraphics;
    g.clear();
    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const fillAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN + 0.15, MISSILE_BLINK_ALPHA_MAX + 0.15, blinkT);
    const strokeAlpha = Phaser.Math.Linear(0.55, 1, blinkT);
    g.fillStyle(CHARGE_SWING_COLOR, fillAlpha);
    g.fillCircle(this.x, this.y, this.def.chargeSwingRadius);
    g.lineStyle(3, CHARGE_SWING_COLOR, strokeAlpha);
    g.strokeCircle(this.x, this.y, this.def.chargeSwingRadius);
  }

  // Passos 1-3: para, trava o ALVO (posição do jogador AGORA, igual à
  _startAxeThrow(target, nowMs) {
    this.bossState = 'axe_telegraph';
    this.setVelocity(0, 0);
    this.axeTargetX = target.x;
    this.axeTargetY = target.y;
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.axeTelegraphUntil = nowMs + this._bossTelegraph(this.def.axeThrowTelegraphMs);
    this.scene.sound.play('sfx_elite_lock', { volume: 0.6 });
  }

  _updateAxeTelegraph(nowMs) {
    this.setVelocity(0, 0);
    this._drawAxeTelegraph(nowMs);
    if (nowMs >= this.axeTelegraphUntil) this._launchAxe(nowMs);
  }

  // Mesmo piscar (alarme) das outras marcações — linha até o ponto
  _drawAxeTelegraph(nowMs) {
    const g = this.bossTelegraphGraphics;
    g.clear();
    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const lineAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN + 0.3, MISSILE_BLINK_ALPHA_MAX + 0.3, blinkT);
    const areaAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN, MISSILE_BLINK_ALPHA_MAX, blinkT);
    g.lineStyle(4, AXE_TELEGRAPH_COLOR, lineAlpha);
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.lineTo(this.axeTargetX, this.axeTargetY);
    g.strokePath();
    g.fillStyle(AXE_TELEGRAPH_COLOR, areaAlpha);
    g.fillCircle(this.axeTargetX, this.axeTargetY, this.def.axeThrowImpactRadius);
    g.lineStyle(2, AXE_TELEGRAPH_COLOR, Phaser.Math.Linear(0.55, 1, blinkT));
    g.strokeCircle(this.axeTargetX, this.axeTargetY, this.def.axeThrowImpactRadius);
  }

  // Passo 4: fim do preparo — o machado sai de verdade do Minotauro até o
  // ponto travado, girando. Sprite trocada por textura normal/rage (ver
  // axeSprite acima) conforme isEnraged, a cada arremesso.
  _launchAxe(nowMs) {
    this.bossState = 'axe_outbound';
    this.bossTelegraphGraphics.clear();
    this.axeOriginX = this.x;
    this.axeOriginY = this.y;
    this.axeFlightStartMs = nowMs;
    this.axeFlightEndAt = nowMs + this.def.axeThrowFlightMs;
    const axeTexture = this.isEnraged ? 'minotaur_axe_thrown_rage' : 'minotaur_axe_thrown';
    if (!this.axeSprite) {
      this.axeSprite = this.scene.add.image(this.x, this.y, axeTexture).setOrigin(0.5).setDepth(15).setScale(AXE_SPRITE_SCALE);
    } else {
      this.axeSprite.setTexture(axeTexture);
    }
    this.axeSprite.setPosition(this.x, this.y).setRotation(0).setScale(AXE_SPRITE_SCALE).clearTint().setVisible(true);
    this._setDisarmed(true); // machado saiu da mão — troca pra sprite sem ele
    this.scene.cameras.main.shake(AXE_THROW_SHAKE_MS, AXE_THROW_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_axe_throw', { volume: 0.7 });
  }

  _updateAxeOutbound(target, nowMs) {
    const progress = Math.min((nowMs - this.axeFlightStartMs) / this.def.axeThrowFlightMs, 1);
    this.axeSprite.x = Phaser.Math.Linear(this.axeOriginX, this.axeTargetX, progress);
    this.axeSprite.y = Phaser.Math.Linear(this.axeOriginY, this.axeTargetY, progress);
    this.axeSprite.setRotation(Phaser.Math.DegToRad((nowMs - this.axeFlightStartMs) * AXE_SPIN_DEG_PER_MS));
    if (nowMs >= this.axeFlightEndAt) this._stickAxe(target, nowMs);
  }

  // Passos 5-6: CRAVA no chão exatamente no ponto travado (para de girar)
  _stickAxe(target, nowMs) {
    this.bossState = 'axe_stuck';
    this.axeSprite.setPosition(this.axeTargetX, this.axeTargetY).setRotation(0);
    this.scene.cameras.main.shake(AXE_IMPACT_SHAKE_MS, AXE_IMPACT_SHAKE_INTENSITY);
    // terra + impacto tocam juntos no instante em que crava (impacto mais alto que a terra)
    this.scene.sound.play('sfx_axe_dirt', { volume: 0.5 });
    this.scene.sound.play('sfx_axe_impact', { volume: 0.85 });
    this._flashCircle(this.axeTargetX, this.axeTargetY, this.def.axeThrowImpactRadius, AXE_TELEGRAPH_COLOR);
    const dist = Phaser.Math.Distance.Between(this.axeTargetX, this.axeTargetY, target.x, target.y);
    if (dist <= this.def.axeThrowImpactRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.axeThrowImpactDamage), this, nowMs);
    }
    // machado cravado começa a "carregar" pra explosão — a duração dessa
    // carga segue exatamente a duração real do som (ver _playTimedSfx),
    // então se o mp3 mudar o tempo do ataque acompanha automaticamente
    this.axeChargeEndAt = nowMs + this._playTimedSfx('sfx_axe_charging', 0.55);
    this.axeBeepPlayed = false;
  }

  _updateAxeStuck(target, nowMs) {
    this._updateAxeStuckWarningFx(nowMs);
    if (!this.axeBeepPlayed && nowMs >= this.axeChargeEndAt) {
      // carga terminou: apita e só explode quando o beep também acabar
      this.axeBeepPlayed = true;
      this.axeStuckUntil = nowMs + this._playTimedSfx('sfx_axe_beep', 0.7);
    }
    if (this.axeBeepPlayed && nowMs >= this.axeStuckUntil) this._explodeAxe(target, nowMs);
  }

  // Machado cravado pisca branco (setTintFill) e pulsa de tamanho igual a
  // um aviso de "vai explodir" — fica mais rápido/exagerado assim que o
  // beep final começa (axeBeepPlayed), pra ficar óbvio que a explosão tá
  // prestes a acontecer de verdade.
  _updateAxeStuckWarningFx(nowMs) {
    const urgent = this.axeBeepPlayed;
    const periodMs = urgent ? AXE_STUCK_PULSE_PERIOD_URGENT_MS : AXE_STUCK_PULSE_PERIOD_MS;
    const pulseAmount = urgent ? AXE_STUCK_PULSE_SCALE_URGENT : AXE_STUCK_PULSE_SCALE;
    const t = (Math.sin((nowMs / periodMs) * Math.PI * 2) + 1) / 2; // 0..1
    this.axeSprite.setScale(AXE_SPRITE_SCALE * (1 + pulseAmount * t));
    if (t > 0.5) this.axeSprite.setTintFill(0xffffff);
    else this.axeSprite.clearTint();
  }

  // Passo 8: 💥 explosão de verdade — raio maior e mais dano que o
  _explodeAxe(target, nowMs) {
    this.axeSprite.setScale(AXE_SPRITE_SCALE).clearTint(); // corta o pisca-pisca de aviso
    this.scene.cameras.main.shake(AXE_EXPLOSION_SHAKE_MS, AXE_EXPLOSION_SHAKE_INTENSITY);
    this.scene.cameras.main.flash(AXE_EXPLOSION_FLASH_MS, 255, 150, 40);
    this.scene.sound.play('sfx_axe_explosion', { volume: 0.7 });
    this._showAxeExplosionFx(this.axeTargetX, this.axeTargetY, this.def.axeThrowExplosionRadius);
    const dist = Phaser.Math.Distance.Between(this.axeTargetX, this.axeTargetY, target.x, target.y);
    if (dist <= this.def.axeThrowExplosionRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.axeThrowExplosionDamage), this, nowMs);
    }
    this._startAxeRaise(nowMs);
  }

  // Feedback BEM mais forte que o _flashCircle simples usado no resto do
  // jogo: núcleo branco-quente (ADD) + anel de fogo até o raio real de
  // dano + anel de fumaça escura passando do raio + estilhaços voando
  // radialmente, além do camera.flash/shake maiores lá em _explodeAxe.
  // Justificativa: agora o jogador viu o charging + beep inteiros antes
  // de explodir, então o pay-off visual precisa condizer com a espera.
  _showAxeExplosionFx(x, y, radius) {
    const core = this.scene.add
      .circle(x, y, radius * 0.5, 0xffffff, 0.9)
      .setDepth(21)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.25);
    this.scene.tweens.add({
      targets: core,
      scale: 1,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy()
    });

    const fireRing = this.scene.add
      .circle(x, y, radius, AXE_EXPLOSION_COLOR, 0.55)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.15);
    this.scene.tweens.add({
      targets: fireRing,
      scale: 1,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => fireRing.destroy()
    });

    const smokeRing = this.scene.add
      .circle(x, y, radius * 1.4, 0x331100, 0.4)
      .setDepth(19)
      .setScale(0.2);
    this.scene.tweens.add({
      targets: smokeRing,
      scale: 1,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => smokeRing.destroy()
    });

    this._spawnAxeExplosionShards(x, y, radius);
  }

  // Estilhaços voando radialmente pra fora (mesma técnica do Terremoto, ver
  // SlamAbility._spawnShockwaveShards), mas mais deles porque a área agora
  // é bem maior.
  _spawnAxeExplosionShards(x, y, radius) {
    for (let i = 0; i < AXE_EXPLOSION_SHARD_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / AXE_EXPLOSION_SHARD_COUNT + Phaser.Math.FloatBetween(-0.15, 0.15);
      const dist = radius * Phaser.Math.FloatBetween(0.7, 1.15);
      const tint = i % 2 === 0 ? AXE_EXPLOSION_COLOR : 0xffdd66;
      const shard = this.scene.add
        .image(x, y, 'hit_fx')
        .setDepth(20)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tint)
        .setScale(Phaser.Math.FloatBetween(0.4, 0.7))
        .setRotation(angle);
      this.scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.1,
        duration: Phaser.Math.Between(320, 480),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  // Passo 9: Minotauro "levanta a mão" — um pulo curto de escala nele
  _startAxeRaise(nowMs) {
    this.bossState = 'axe_raise';
    this.axeRaiseUntil = nowMs + this.def.axeThrowRaiseMs;
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScale * 1.12,
      scaleY: this.baseScale * 1.12,
      duration: this.def.axeThrowRaiseMs / 2,
      yoyo: true,
      ease: 'Sine.easeInOut'
    });
  }

  _updateAxeRaise(nowMs) {
    if (nowMs >= this.axeRaiseUntil) this._startAxePullback(nowMs);
  }

  // Passos 10-11: puxa o machado de volta do ponto cravado até a posição
  _startAxePullback(nowMs) {
    this.bossState = 'axe_return';
    this.axeReturnStartMs = nowMs;
    this.axeReturnEndAt = nowMs + this.def.axeThrowReturnFlightMs;
    this.axeReturnHasHit = false;
    this.axeReturnFromX = this.axeTargetX;
    this.axeReturnFromY = this.axeTargetY;
  }

  _updateAxeReturn(target, nowMs) {
    const progress = Math.min((nowMs - this.axeReturnStartMs) / this.def.axeThrowReturnFlightMs, 1);
    this.axeSprite.x = Phaser.Math.Linear(this.axeReturnFromX, this.x, progress);
    this.axeSprite.y = Phaser.Math.Linear(this.axeReturnFromY, this.y, progress);
    this.axeSprite.setRotation(Phaser.Math.DegToRad((nowMs - this.axeReturnStartMs) * AXE_SPIN_DEG_PER_MS));
    if (!this.axeReturnHasHit) {
      const dist = Phaser.Math.Distance.Between(this.axeSprite.x, this.axeSprite.y, target.x, target.y);
      if (dist <= this.def.axeThrowReturnRadius && target.active && !target.healthSystem?.isDead()) {
        this.axeReturnHasHit = true;
        DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.axeThrowReturnDamage), this, nowMs);
      }
    }
    if (nowMs >= this.axeReturnEndAt) this._endAxeThrow(nowMs);
  }

  // Passo 12: some o machado e volta a perseguir normalmente, com o
  _endAxeThrow(nowMs) {
    this.axeSprite?.setVisible(false);
    this._setDisarmed(false); // pegou o machado de volta — volta pro sprite com ele
    this.bossState = 'chasing';
    this.bossChargeReadyAt = nowMs + this._bossCooldown(this.def.axeThrowCooldownMs);
  }

  // Flash curto (círculo que nasce pequeno/opaco e cresce até sumir)
  _flashCircle(x, y, radius, color) {
    const c = this.scene.add.circle(x, y, radius, color, 0.5).setDepth(14).setScale(0.3);
    this.scene.tweens.add({
      targets: c,
      scale: 1,
      alpha: 0,
      duration: 220,
      onComplete: () => c.destroy()
    });
  }

  // Passos 1-4: para, trava a DIREÇÃO no instante atual (igual a
  _startCleave(target, nowMs) {
    this.bossState = 'cleave_telegraph';
    this.setVelocity(0, 0);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    this.cleaveAngle = Math.atan2(dy, dx);
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.cleaveTelegraphStartMs = nowMs;
    this.cleaveTelegraphDurationMs = this._bossTelegraph(this.def.cleaveTelegraphMs);
    this.cleaveTelegraphEndAt = nowMs + this.cleaveTelegraphDurationMs;
    this.cleaveWhistle = this.scene.sound.add('sfx_elite_warning', { loop: true });
    this.cleaveWhistle.play({ volume: CLEAVE_WHISTLE_VOLUME_START, rate: CLEAVE_WHISTLE_RATE_START });
  }

  _updateCleaveTelegraph(nowMs) {
    this.setVelocity(0, 0);
    const progress = Math.min((nowMs - this.cleaveTelegraphStartMs) / this.cleaveTelegraphDurationMs, 1);
    if (this.cleaveWhistle) {
      this.cleaveWhistle.setVolume(Phaser.Math.Linear(CLEAVE_WHISTLE_VOLUME_START, CLEAVE_WHISTLE_VOLUME_END, progress));
      this.cleaveWhistle.setRate(Phaser.Math.Linear(CLEAVE_WHISTLE_RATE_START, CLEAVE_WHISTLE_RATE_END, progress));
    }
    this._drawCleaveTelegraph(progress);
    if (nowMs >= this.cleaveTelegraphEndAt) this._startCleavePause(nowMs);
  }

  // Cone de perigo (Graphics.slice = pizza/leque, mais simples que
  _drawCleaveTelegraph(progress) {
    const g = this.bossTelegraphGraphics;
    g.clear();
    const alpha = Phaser.Math.Linear(CLEAVE_TELEGRAPH_ALPHA_START, CLEAVE_TELEGRAPH_ALPHA_END, progress);
    const half = Phaser.Math.DegToRad(this.def.cleaveHalfAngleDeg);
    g.fillStyle(CLEAVE_COLOR, alpha);
    g.slice(this.x, this.y, this.def.cleaveRange, this.cleaveAngle - half, this.cleaveAngle + half, false);
    g.fillPath();
    g.lineStyle(3, CLEAVE_COLOR, Math.min(alpha + 0.35, 1));
    g.slice(this.x, this.y, this.def.cleaveRange, this.cleaveAngle - half, this.cleaveAngle + half, false);
    g.strokePath();
  }

  // Passo 5: apito já mudo, cone parado no máximo, pequena pausa final
  _startCleavePause(nowMs) {
    this.bossState = 'cleave_pause';
    this._stopCleaveWhistle();
    this.cleavePauseEndAt = nowMs + this._bossTelegraph(this.def.cleavePauseMs);
  }

  _updateCleavePause(target, nowMs) {
    this.setVelocity(0, 0);
    this._drawCleaveTelegraph(1); // mantém o cone no máximo durante a pausa
    if (nowMs >= this.cleavePauseEndAt) this._executeCleave(target, nowMs);
  }

  // Passos 6-9: CORTE de verdade — dano altíssimo em todo mundo dentro do
  _executeCleave(target, nowMs) {
    this.bossTelegraphGraphics.clear();
    this.scene.sound.play('sfx_cyberus_slash', { volume: 0.9 });
    this.scene.cameras.main.shake(CLEAVE_SHAKE_MS, CLEAVE_SHAKE_INTENSITY);
    this._flashCleaveCone();
    if (target.active && !target.healthSystem?.isDead()) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      const angleTo = Math.atan2(target.y - this.y, target.x - this.x);
      const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(angleTo - this.cleaveAngle));
      if (dist <= this.def.cleaveRange && angleDiff <= Phaser.Math.DegToRad(this.def.cleaveHalfAngleDeg)) {
        DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.cleaveDamage), this, nowMs);
      }
    }
    this._startCleaveRecover(nowMs);
  }

  // Flash do cone (mesma técnica do _flashCircle, mas com o formato de
  _flashCleaveCone() {
    const half = Phaser.Math.DegToRad(this.def.cleaveHalfAngleDeg);
    const g = this.scene.add.graphics().setDepth(14);
    g.fillStyle(0xffffff, 0.85);
    g.slice(this.x, this.y, this.def.cleaveRange, this.cleaveAngle - half, this.cleaveAngle + half, false);
    g.fillPath();
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 180,
      onComplete: () => g.destroy()
    });
  }

  // Passo 10: pequena recuperação parado (def.cleaveRecoverMs) antes de
  _startCleaveRecover(nowMs) {
    this.bossState = 'cleave_recover';
    this.cleaveRecoverEndAt = nowMs + this.def.cleaveRecoverMs;
  }

  _updateCleaveRecover(nowMs) {
    this.setVelocity(0, 0);
    if (nowMs >= this.cleaveRecoverEndAt) {
      this.bossState = 'chasing';
      this.bossChargeReadyAt = nowMs + this._bossCooldown(this.def.cleaveCooldownMs);
    }
  }

  // Para o apito (fade curto em vez de corte seco) e limpa a referência
  _stopCleaveWhistle() {
    if (!this.cleaveWhistle) return;
    this.cleaveWhistle.stop();
    this.cleaveWhistle.destroy();
    this.cleaveWhistle = null;
  }

  // Passo 1: jogador detectado muito perto (ver _updateBossAbility) —
  _startStomp(nowMs) {
    this.bossState = 'stomp_raise';
    this.setVelocity(0, 0);
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.stompRaiseDurationMs = this._bossTelegraph(this.def.stompRaiseMs + this.def.stompPauseMs);
    this.stompRaiseUntil = nowMs + this.stompRaiseDurationMs;
    this.scene.sound.play('sfx_elite_lock', { volume: 0.5 });
  }

  _updateStompRaise(target, nowMs) {
    this.setVelocity(0, 0);
    this._drawStompTelegraph(nowMs);
    if (nowMs >= this.stompRaiseUntil) this._resolveStomp(target, nowMs);
  }

  // Círculo de aviso (área de impacto) no próprio Minotauro, crescendo
  _drawStompTelegraph(nowMs) {
    const g = this.bossTelegraphGraphics;
    g.clear();
    const progress = Phaser.Math.Clamp(
      1 - (this.stompRaiseUntil - nowMs) / this.stompRaiseDurationMs, 0, 1
    );
    const blinkT = (Math.sin((nowMs / MISSILE_BLINK_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const fillAlpha = Phaser.Math.Linear(MISSILE_BLINK_ALPHA_MIN + 0.1, MISSILE_BLINK_ALPHA_MAX + 0.1, blinkT);
    const radius = Phaser.Math.Linear(this.def.stompImpactRadius * 0.3, this.def.stompImpactRadius, progress);
    g.fillStyle(STOMP_TELEGRAPH_COLOR, fillAlpha);
    g.fillCircle(this.x, this.y, radius);
    g.lineStyle(3, STOMP_TELEGRAPH_COLOR, Math.min(fillAlpha + 0.4, 1));
    g.strokeCircle(this.x, this.y, radius);
  }

  // PISA: dano baixo em área pequena ao redor dele + knockback MUITO
  _resolveStomp(target, nowMs) {
    this.bossTelegraphGraphics.clear();
    this.scene.cameras.main.shake(STOMP_SHAKE_MS, STOMP_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_elite_punch', { volume: 0.7 });
    this._flashCircle(this.x, this.y, this.def.stompImpactRadius, STOMP_IMPACT_COLOR);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.stompImpactRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.stompDamage), this, nowMs);
      const dx = (target.x - this.x) || 0.01;
      const dy = (target.y - this.y) || 0;
      const len = Math.hypot(dx, dy) || 1;
      target.applyKnockback?.(dx / len, dy / len, this.def.stompKnockbackForce, nowMs, this.def.stompKnockbackDurationMs);
    }
    this.bossState = 'chasing';
    this.stompReadyAt = nowMs + this._bossCooldown(this.def.stompCooldownMs);
  }

  // Dispara a fuga (evento do Boss/Minotauro, ver SpawnDirector.
  flee(target) {

    if (!this.active || this.fleeing) return;
    this.fleeing = true;
    this.fleeMaxUntil = this.scene.time.now + FLEE_MAX_DURATION_MS;

    // Sealer é imóvel de propósito (ver constructor) — sem isto ele
    this.body.setImmovable(false);

    // Elite no meio de um ataque: cancela o telegraph/míssil em voo e
    if (this.eliteState && this.eliteState !== 'chasing') {
      this.eliteTelegraphGraphics?.clear();
      this.eliteMissileProjectiles?.forEach((m) => m.fx.destroy());
      this.eliteMissileProjectiles = [];
      this.eliteState = 'chasing';
    }

    // Boss/Minotauro no meio de uma habilidade (Investida, Machado ou
    if (this.bossState && this.bossState !== 'chasing') {
      this.bossTelegraphGraphics?.clear();
      this.axeSprite?.setVisible(false);
      this._setDisarmed(false); // interrompeu no meio do arremesso — não pode fugir sem o machado
      this._stopCleaveWhistle();
      this.bossState = 'chasing';
    }

    const angle = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
    this.fleeDirX = Math.cos(angle);
    this.fleeDirY = Math.sin(angle);
  }

  // Corre reto na direção sorteada em flee(), mais rápido que o normal
  _updateFlee(nowMs) {
    const speed = this.def.speed * FLEE_SPEED_MULTIPLIER;
    this.setVelocity(this.fleeDirX * speed, this.fleeDirY * speed);
    if (this._isOutsideCameraView(FLEE_DESPAWN_MARGIN) || nowMs >= this.fleeMaxUntil) this._leave();
  }

  // true se este inimigo está fora do retângulo visível da câmera agora,
  _isOutsideCameraView(margin) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    const left = cam.scrollX - margin;
    const top = cam.scrollY - margin;
    const right = cam.scrollX + cam.width / zoom + margin;
    const bottom = cam.scrollY + cam.height / zoom + margin;
    return this.x < left || this.x > right || this.y < top || this.y > bottom;
  }

  // Fim da fuga: mesma limpeza de extras visuais do die() (ver ali),
  _leave() {
    if (!this.active) return;
    this.scene.tweens.killTweensOf(this);
    this.arenaGraphics?.destroy();
    this.eliteTelegraphGraphics?.destroy();
    this.eliteMissileProjectiles?.forEach((m) => m.fx.destroy());
    this.bossTelegraphGraphics?.destroy();
    this.axeSprite?.destroy();
    this._stopCleaveWhistle();
    this.destroy();
  }

  die() {
    if (!this.active) return;
    this.scene.tweens.killTweensOf(this);
    // Sealer: o anel da arena não é filho do sprite (é um Graphics à
    this.arenaGraphics?.destroy();
    // Elite: mesma lógica — o Graphics do telegraph (mísseis/melee) não é
    this.eliteTelegraphGraphics?.destroy();
    // Elite: bolas de míssil em voo também não são filhas do sprite —
    this.eliteMissileProjectiles?.forEach((m) => m.fx.destroy());
    // Boss: mesma lógica — a linha de aviso da investida também não é
    this.bossTelegraphGraphics?.destroy();
    // Boss: o ícone do Machado Arremessado (voando ou já cravado) também
    this.axeSprite?.destroy();
    // Boss: o apito do Corte Destrutivo também precisa ser parado na mão
    this._stopCleaveWhistle();
    // Elite: som de morte próprio em vez de nenhum som (os inimigos
    if (this.def.elite) this.scene.sound.play('sfx_elite_death', { volume: 0.6 });
    // `color` vai junto só pra quem quiser desenhar algo na cor do
    EventBus.emit('enemy-died', { x: this.x, y: this.y, xpReward: this.def.xpReward, color: this.def.color });
    this.destroy();
  }
}