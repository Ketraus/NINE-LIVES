import Enemy, { MISSILE_BLINK_PERIOD_MS, MISSILE_BLINK_ALPHA_MIN, MISSILE_BLINK_ALPHA_MAX } from './Enemy.js';
import DamageSystem from '../../combat/DamageSystem.js';
import SettingsManager from '../../systems/SettingsManager.js';

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
// passos tocam em loop durante o dash (curto e rápido — chargeDurationMs)
// acelerados pra soarem como uma corrida forte, não uma caminhada
const CHARGE_FOOTSTEPS_RATE = 1.6;

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
// Chuva de Meteoros (habilidade do rage, ver _updateMeteorRain e afins)
const METEOR_WARN_COLOR = 0xff2200;
const METEOR_ROCK_COLOR = 0xff6a00;
const METEOR_CORE_COLOR = 0xffe08a;
const METEOR_FALL_OFFSET_X = -220; // de onde o meteoro "nasce" em relação ao ponto de impacto
const METEOR_FALL_OFFSET_Y = -720;
const METEOR_SHAKE_MS = 140;
const METEOR_SHAKE_INTENSITY = 0.008;
// Salto de Perseguição (ver _shouldLeap e afins)
const LEAP_COLOR = 0xff2200;
const LEAP_RISE_HEIGHT = 900; // quanto ele sobe (px) até sair da câmera
const LEAP_FALL_HEIGHT = 900; // de que altura ele despenca no pouso
const LEAP_LANDING_SHAKE_MS = 420;
const LEAP_LANDING_SHAKE_INTENSITY = 0.035;
const LEAP_TAKEOFF_SHAKE_MS = 200;
const LEAP_TAKEOFF_SHAKE_INTENSITY = 0.015;
const LEAP_AGGRO_AURA_RADIUS = 95;
const AXE_EXPLOSION_COLOR = 0xff4400;

// Corte Destrutivo (3ª habilidade do Minotauro, sorteada 1/3 com a
const CLEAVE_COLOR = 0xff1133;
const CLEAVE_TELEGRAPH_ALPHA_START = 0.22;
const CLEAVE_TELEGRAPH_ALPHA_END = 0.6;
// golpe mais destrutivo do Minotauro (cleaveDamage é o maior de todos) —
// feedback tem que ser o mais forte do kit dele também (ver _executeCleave)
const CLEAVE_SHAKE_MS = 480;
const CLEAVE_SHAKE_INTENSITY = 0.036;
const CLEAVE_FLASH_MS = 200;
const CLEAVE_SHARD_COUNT = 20;

// Pisão (4ª habilidade do Minotauro, "SAI DE PERTO" — ver
const STOMP_TELEGRAPH_COLOR = 0xffffff;
const STOMP_IMPACT_COLOR = 0xdddddd;
const STOMP_SHAKE_MS = 140;
const STOMP_SHAKE_INTENSITY = 0.01;


// Minotauro (def.boss = true, ver data/enemies.js): o boss — Investida, Machado
// Arremessado, Corte, Pisão, Chuva de Meteoros (rage) e Salto de Perseguição.
export default class Minotaur extends Enemy {
  constructor(scene, x, y, def) {
    super(scene, x, y, def);
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

    // Boss/Minotauro (def.boss = true, ver data/enemies.js): TRÊS
    this.bossState = 'chasing';
    this.bossChargeReadyAt = scene.time.now + Phaser.Math.Between(1500, 2500);
    this.bossChargeDir = { x: 0, y: 0 };
    this.bossChargeTelegraphUntil = 0;
    this.bossChargeDashUntil = 0;
    this.bossChargeHasHit = false;
    this.bossSwingUntil = 0;
    this.bossVulnerableUntil = 0;
    this.bossTelegraphGraphics = null;
    // Investida: passos em loop durante o dash — ver _launchCharge/
    // _stopChargeFootsteps
    this.chargeFootsteps = null;
    // Machado Arremessado: ver _startAxeThrow e afins. axeSprite é o
    this.axeSprite = null;
    // Trilha do machado (outbound/stuck/raise/return, ou null) — roda EM
    // PARALELO ao bossState (corpo), ver _updateAxeTrack.
    this.axePhase = null;
    this.axeTargetX = 0;
    this.axeTargetY = 0;
    // Corte Destrutivo: ver _startCleave e afins.
    this.cleaveAngle = 0;
    // multiplicador de dano recebido durante a janela vulnerável (ver
    this.vulnerableDamageMultiplier = 1;
    // Pisão: cooldown PRÓPRIO, separado de bossChargeReadyAt — pode
    this.stompReadyAt = scene.time.now + Phaser.Math.Between(1500, 2500);
    this.stompRaiseUntil = 0;
    // Chuva de Meteoros: liga em _triggerRage e roda até o boss morrer
    // (ver _updateMeteorRain). meteors = meteoros em andamento.
    this.meteorRainActive = false;
    this.meteorNextAt = 0;
    this.meteors = [];
    // Salto de Perseguição: quando o jogador foge longe demais por tempo
    // demais, ele some da câmera, cai NA FRENTE do jogador e fica agressivo
    // por um curto período (ver _shouldLeap/_startLeap e afins).
    this.leapFleeSince = null; // desde quando o jogador está além de leapTriggerDistance
    this.leapReadyAt = 0;
    this.leapAggroUntil = 0; // até aqui: mais rápido e com cooldowns menores
    this.leapPhaseUntil = 0;
    this.leapGroundX = 0;
    this.leapGroundY = 0;
    this.leapTargetX = 0;
    this.leapTargetY = 0;
    this.leapAirStartAt = 0;
    this.leapAirUntil = 0;
    this.leapLocked = false;
    this.leapAura = null;
    // true enquanto está no ar: ninguém consegue acertar (ver DamageSystem)
    this.untargetable = false;
  }

  // Rage: entra em fúria quando a vida cai abaixo de def.rageHpThreshold (ver _triggerRage).
  _onHealthChange(current, max) {
    if (!this.isEnraged && this.rageHpThreshold > 0 && current <= max * this.rageHpThreshold) {
      this._triggerRage();
    }
  }

  // Garante que meteoros e aura do salto somem junto quando o boss é destruído.
  destroy(fromScene) {
    this._clearMeteors();
    this._clearLeap();
    super.destroy(fromScene);
  }

  // Chuva de Meteoros roda EM PARALELO a qualquer estado do corpo
  _adjustChaseSpeed(target, nowMs, speedMultiplier) {
    this._updateMeteorRain(target, nowMs);
    this._updateLeapAggroFx(nowMs);
    // agressividade pós-salto: só um multiplicador temporário, nada é
    // alterado de forma permanente — passou leapAggroUntil, volta ao normal
    if (this._isLeapAggro()) speedMultiplier *= this.def.leapAggroSpeedMultiplier;
    // jogador fora de alcance (longe ou fugindo): avança mais rápido pra não ser abandonado
    if (this._isTargetOutOfReach(target)) speedMultiplier *= this.def.pursuitSpeedMultiplier;
    return speedMultiplier;
  }

  _specialChase(target, nowMs) {
    // Boss/Minotauro: mesma lógica do Elite acima — só assume o
    return this._updateBossAbility(target, nowMs);
  }

  _cancelActionsForFlee() {
    // Boss/Minotauro no meio de uma habilidade (Investida, Machado ou
    if ((this.bossState && this.bossState !== 'chasing') || this.axePhase) {
      this.bossTelegraphGraphics?.clear();
      this.axeSprite?.setVisible(false);
      this._setDisarmed(false); // interrompeu no meio do arremesso — não pode fugir sem o machado
      this.axePhase = null;
      this.bossState = 'chasing';
    }
  }

  _cleanupSpecial() {
    // Boss: mesma lógica — a linha de aviso da investida também não é
    this.bossTelegraphGraphics?.destroy();
    // Boss: o ícone do Machado Arremessado (voando ou já cravado) também
    this.axeSprite?.destroy();
    // Boss: os passos em loop da Investida também, senão ficam tocando
    this._stopChargeFootsteps();
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
    // Chuva de Meteoros: começa junto com a fúria e não para mais
    this.meteorRainActive = true;
    this.meteorNextAt = this.scene.time.now + this.def.meteorFirstDelayMs;
  }

  // "Minotauro puto" (ver _triggerRage acima): a partir do rage, todo
  _bossCooldown(baseMs) {
    let ms = baseMs;
    if (this.isEnraged && this.def.rageCooldownMultiplier) ms *= this.def.rageCooldownMultiplier;
    // agressividade pós-salto: cooldowns menores só enquanto durar
    if (this._isLeapAggro()) ms *= this.def.leapAggroCooldownMultiplier;
    return ms;
  }

  _isLeapAggro() {
    return this.scene.time.now < this.leapAggroUntil;
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

  // Estado das TRÊS habilidades do Minotauro (só roda quando def.boss =
  _updateBossAbility(target, nowMs) {
    // Machado fora da mão: a trilha dele (voo, cravado, explosão, volta)
    // avança em paralelo e NÃO prende o corpo — enquanto ela roda, o
    // Minotauro segue livre pra aproximar, pisar ou investir.
    if (this.axePhase) this._updateAxeTrack(target, nowMs);

    if (this.bossState === 'charge_telegraph') { this._updateChargeTelegraph(nowMs); return true; }
    if (this.bossState === 'charge_dash') { this._updateChargeDash(target, nowMs); return true; }
    if (this.bossState === 'charge_swing_telegraph') { this._updateChargeSwingTelegraph(target, nowMs); return true; }
    if (this.bossState === 'charge_vulnerable') { this._updateChargeVulnerable(nowMs); return true; }
    if (this.bossState === 'axe_telegraph') { this._updateAxeTelegraph(nowMs); return true; }
    if (this.bossState === 'cleave_telegraph') { this._updateCleaveTelegraph(nowMs); return true; }
    if (this.bossState === 'cleave_pause') { this._updateCleavePause(target, nowMs); return true; }
    if (this.bossState === 'cleave_recover') { this._updateCleaveRecover(nowMs); return true; }
    if (this.bossState === 'stomp_raise') { this._updateStompRaise(target, nowMs); return true; }
    if (this.bossState === 'leap_crouch') { this._updateLeapCrouch(nowMs); return true; }
    if (this.bossState === 'leap_rise') { this._updateLeapRise(nowMs); return true; }
    if (this.bossState === 'leap_air') { this._updateLeapAir(target, nowMs); return true; }
    if (this.bossState === 'leap_recover') { this._updateLeapRecover(nowMs); return true; }
    // Salto de Perseguição: jogador fugindo longe demais por tempo demais
    if (this._shouldLeap(target, nowMs)) { this._startLeap(nowMs); return true; }
    // Pisão: checado ANTES do cooldown compartilhado — é reativo (dispara
    // sozinho quando o jogador chega perto) e agora também vale com o
    // machado fora da mão.
    if (nowMs >= this.stompReadyAt) {
      const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (distToTarget <= this.def.stompTriggerRadius) {
        this._startStomp(nowMs);
        return true;
      }
    }
    // Jogador longe ou fugindo: NÃO inicia ataque novo (nem Investida, nem Machado,
    // nem Corte) — só avança (chase). Ataques já em andamento terminam normalmente
    // (os estados acima) e aí ele reavalia a distância. Não mexe nos cooldowns:
    // quando o jogador volta pro alcance, o que estiver pronto sai.
    if (this._isTargetOutOfReach(target)) return false;
    if (nowMs < this.bossChargeReadyAt) return false; // ainda na horda, flocking normal
    if (this.axePhase) return this._rollOverlapAttack(target, nowMs);
    // Sorteio 1/3 cada fora do rage. Em rage, os pesos viram
    const chargeWeight = this.isEnraged ? this.def.rageChargeWeight ?? 1 / 3 : 1 / 3;
    const axeWeight = this.isEnraged ? this.def.rageAxeWeight ?? 1 / 3 : 1 / 3;
    const roll = Math.random();
    if (roll < chargeWeight) this._startCharge(target, nowMs);
    else if (roll < chargeWeight + axeWeight) this._startAxeThrow(target, nowMs);
    else this._startCleave(target, nowMs);
    return true;
  }

  // Avança a trilha do machado (uma fase por frame, igual antes) — ver
  // axePhase. Roda a partir de _updateBossAbility, sem mexer no bossState.
  _updateAxeTrack(target, nowMs) {
    if (this.axePhase === 'outbound') this._updateAxeOutbound(target, nowMs);
    else if (this.axePhase === 'stuck') this._updateAxeStuck(target, nowMs);
    else if (this.axePhase === 'raise') this._updateAxeRaise(nowMs);
    else if (this.axePhase === 'return') this._updateAxeReturn(target, nowMs);
  }

  // Sorteio de ataque COM o machado fora da mão. Corte e novo arremesso
  // dependem do machado, então o único ataque compatível é a Investida
  // (o Pisão já é reativo, ver _updateBossAbility). Se não sair, tenta de
  // novo daqui a def.axeOverlapRetryMs — enquanto isso ele só aproxima.
  _rollOverlapAttack(target, nowMs) {
    if (Math.random() < this.def.axeOverlapChargeChance) {
      this._startCharge(target, nowMs);
      return true;
    }
    this.bossChargeReadyAt = nowMs + this._bossCooldown(this.def.axeOverlapRetryMs);
    return false;
  }

  // Para, trava a direção da investida NO INSTANTE ATUAL do jogador (o
  _startCharge(target, nowMs) {
    this.bossState = 'charge_telegraph';
    this._moveTo(0, 0);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    this.bossChargeDir = { x: dx / len, y: dy / len };
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    // telegraph + pequena pausa contam juntos aqui: a linha fica visível
    this.bossChargeTelegraphUntil = nowMs + this._bossTelegraph(this.def.chargeTelegraphMs + this.def.chargePauseMs);
    this.scene.sound.play('sfx_minotaur_charge', { volume: 0.75 });
  }

  _updateChargeTelegraph(nowMs) {
    this._moveTo(0, 0);
    this._drawChargeTelegraph(nowMs);
    if (nowMs >= this.bossChargeTelegraphUntil) this._launchCharge(nowMs);
  }

  // Fim do aviso: dispara de verdade na direção travada em _startCharge,
  _launchCharge(nowMs) {
    this.bossState = 'charge_dash';
    this.bossTelegraphGraphics.clear();
    this.bossChargeHasHit = false;
    this.bossChargeDashUntil = nowMs + this.def.chargeDurationMs;
    this._moveTo(this.bossChargeDir.x * this.def.chargeSpeed, this.bossChargeDir.y * this.def.chargeSpeed);
    this.scene.cameras.main.shake(CHARGE_LAUNCH_SHAKE_MS, CHARGE_LAUNCH_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_minotaur_charge_impact', { volume: 0.8 });
    // passos em loop acompanhando o dash — acelerados (CHARGE_FOOTSTEPS_RATE)
    // pra soarem como a corrida rápida que é, mesmo sendo bem curta
    this._stopChargeFootsteps();
    this.chargeFootsteps = this.scene.sound.add('sfx_minotaur_footsteps', { loop: true });
    // mesmo motivo do _playTimedSfx acima: instância própria (precisa do
    // loop) passa direto por baixo do patch de SettingsManager.js
    this.chargeFootsteps.play({ volume: 0.55 * SettingsManager.getSfx(), rate: CHARGE_FOOTSTEPS_RATE });
  }

  // Mantém a velocidade reta em linha (chase() normal não roda neste
  _updateChargeDash(target, nowMs) {
    this._moveTo(this.bossChargeDir.x * this.def.chargeSpeed, this.bossChargeDir.y * this.def.chargeSpeed);
    if (!this.bossChargeHasHit) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (dist <= this.def.chargeHitRadius && target.active && !target.healthSystem?.isDead()) {
        this.bossChargeHasHit = true;
        DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.chargeDamage), this, nowMs);
        this.scene.cameras.main.shake(CHARGE_IMPACT_SHAKE_MS, CHARGE_IMPACT_SHAKE_INTENSITY);
      }
    }
    if (nowMs >= this.bossChargeDashUntil) {
      // Sem machado na mão não há Corte pra dar ao fim da investida (a menos
      // que def.axeOverlapChargeSwing ligue isso) — vai direto pro cansaço.
      if (this.axePhase && !this.def.axeOverlapChargeSwing) {
        this._stopChargeFootsteps();
        this._endCharge(nowMs);
      } else {
        this._startSwing(nowMs);
      }
    }
  }

  // Corte (evolução da Investida): IMEDIATAMENTE ao fim da investida,
  _startSwing(nowMs) {
    this.bossState = 'charge_swing_telegraph';
    this._moveTo(0, 0);
    this.bossSwingUntil = nowMs + this.def.chargeSwingTelegraphMs;
    this._stopChargeFootsteps(); // parou de correr, para os passos
    this.scene.sound.play('sfx_minotaur_swing_attack', { volume: 0.8 });
  }

  _updateChargeSwingTelegraph(target, nowMs) {
    this._moveTo(0, 0);
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
    this._moveTo(0, 0);
    this.setTint(CHARGE_VULNERABLE_TINT);
    // mantém _currentStatusTint em sincronia (ver _refreshStatusTint) —
    this._currentStatusTint = CHARGE_VULNERABLE_TINT;
    this.vulnerableDamageMultiplier = this.def.chargeVulnerableDamageMultiplier;
    this.bossVulnerableUntil = nowMs + this.def.chargeVulnerableMs;
    this.scene.sound.play('sfx_minotaur_breath', { volume: 0.7 }); // ofegante, "cansei" — janela vulnerável
  }

  _updateChargeVulnerable(nowMs) {
    this._moveTo(0, 0);
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
    this._moveTo(0, 0);
    this.axeTargetX = target.x;
    this.axeTargetY = target.y;
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.axeTelegraphUntil = nowMs + this._bossTelegraph(this.def.axeThrowTelegraphMs);
    this.scene.sound.play('sfx_elite_lock', { volume: 0.6 });
  }

  _updateAxeTelegraph(nowMs) {
    this._moveTo(0, 0);
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
    // corpo liberado: o machado segue na trilha própria (axePhase) e o
    // Minotauro volta a agir — o primeiro ataque extra só libera depois de
    // def.axeOverlapDelayMs, pra não emendar no instante do arremesso
    this.bossState = 'chasing';
    this.axePhase = 'outbound';
    this.bossChargeReadyAt = nowMs + this._bossCooldown(this.def.axeOverlapDelayMs);
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
    this.axePhase = 'stuck';
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
    this.axePhase = 'raise';
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
    this.axePhase = 'return';
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
    // NÃO mexe no bossState: o corpo pode estar no meio de uma investida ou
    // pisão (ver _updateAxeTrack). Só fecha a trilha e segura o cooldown.
    this.axePhase = null;
    this.bossChargeReadyAt = Math.max(this.bossChargeReadyAt, nowMs + this._bossCooldown(this.def.axeThrowCooldownMs));
  }

  // Chuva de Meteoros (rage): a cada meteorIntervalMs (com variação) sorteia
  // um ponto de impacto, marca no chão (aviso vermelho pulsando) e faz uma
  // pedra cair até lá. Ao chegar, dá dano em área. Não prende o corpo do
  // boss nem mexe no bossState — roda em paralelo a tudo (ver chase()).
  _updateMeteorRain(target, nowMs) {
    if (!this.meteorRainActive) return;

    if (nowMs >= this.meteorNextAt && target.active && !target.healthSystem?.isDead()) {
      this._spawnMeteor(target, nowMs);
      const jitter = Phaser.Math.Between(-this.def.meteorIntervalJitterMs, this.def.meteorIntervalJitterMs);
      this.meteorNextAt = nowMs + this.def.meteorIntervalMs + jitter;
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      const t = Phaser.Math.Clamp((nowMs - m.startAt) / (m.impactAt - m.startAt), 0, 1);

      // aviso: cresce até o raio final e pisca
      const blink = 0.5 + 0.5 * Math.sin(nowMs / 60);
      m.warn.setScale(Phaser.Math.Linear(0.35, 1, t));
      m.warn.setAlpha(Phaser.Math.Linear(0.25, 0.6, blink));

      // pedra: cai em diagonal (ease-in, acelera perto do chão)
      const fall = t * t;
      m.rock.setPosition(
        m.x + METEOR_FALL_OFFSET_X * (1 - fall),
        m.y + METEOR_FALL_OFFSET_Y * (1 - fall)
      );

      if (nowMs >= m.impactAt) {
        this._impactMeteor(m, target, nowMs);
        this.meteors.splice(i, 1);
      }
    }
  }

  _spawnMeteor(target, nowMs) {
    // ~65% caem em cima do jogador (com um desvio, pra dar pra correr);
    // o resto cai mais longe, pra cobrir a arena e forçar movimento
    const nearPlayer = Math.random() < 0.65;
    const spread = nearPlayer ? 90 : 420;
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist = Phaser.Math.FloatBetween(nearPlayer ? 0 : 120, spread);
    let x = target.x + Math.cos(angle) * dist;
    let y = target.y + Math.sin(angle) * dist;
    const bounds = this.scene.physics.world.bounds;
    x = Phaser.Math.Clamp(x, bounds.x + 20, bounds.right - 20);
    y = Phaser.Math.Clamp(y, bounds.y + 20, bounds.bottom - 20);

    const radius = this.def.meteorImpactRadius;
    const warn = this.scene.add
      .circle(x, y, radius, METEOR_WARN_COLOR, 0.35)
      .setStrokeStyle(3, METEOR_WARN_COLOR, 0.9)
      .setDepth(4)
      .setScale(0.35);
    const rock = this.scene.add.container(0, 0, [
      this.scene.add.circle(0, 0, 16, METEOR_ROCK_COLOR, 1),
      this.scene.add.circle(0, 0, 8, METEOR_CORE_COLOR, 1)
    ]).setDepth(15);
    rock.setPosition(x + METEOR_FALL_OFFSET_X, y + METEOR_FALL_OFFSET_Y);

    this.meteors.push({ x, y, warn, rock, startAt: nowMs, impactAt: nowMs + this.def.meteorFallMs });
  }

  _impactMeteor(m, target, nowMs) {
    m.warn.destroy();
    m.rock.destroy();
    this.scene.cameras.main.shake(METEOR_SHAKE_MS, METEOR_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_axe_explosion', { volume: 0.35 });
    this._flashCircle(m.x, m.y, this.def.meteorImpactRadius, METEOR_ROCK_COLOR);
    const dist = Phaser.Math.Distance.Between(m.x, m.y, target.x, target.y);
    if (dist <= this.def.meteorImpactRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.meteorDamage), this, nowMs);
    }
  }

  // Apaga meteoros ainda no ar (morte/fuga do boss — ver destroy()).
  _clearMeteors() {
    this.meteors?.forEach((m) => { m.warn.destroy(); m.rock.destroy(); });
    if (this.meteors) this.meteors.length = 0;
    this.meteorRainActive = false;
  }

  // ---------- Perseguição (jogador fugindo) ----------
  // Velocidade (px/s) do jogador NA direção contrária ao boss: positivo = se
  // afastando, negativo = vindo pra cima.
  _targetRadialSpeed(target) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const v = target.body?.velocity;
    return v ? (v.x * dx + v.y * dy) / len : 0;
  }

  // true se o PRÓPRIO Minotauro está fora do retângulo visível da câmera (+ margem).
  // A câmera segue o jogador, então "o jogador saiu da câmera" na prática é "o
  // boss ficou pra trás e sumiu da tela".
  _isSelfOffscreen(margin = 0) {
    const view = this.scene.cameras.main.worldView;
    return (
      this.x < view.x - margin ||
      this.x > view.x + view.width + margin ||
      this.y < view.y - margin ||
      this.y > view.y + view.height + margin
    );
  }

  // "Fora de alcance": além de attackEffectiveRange, ou além de attackFleeingRange
  // enquanto se afasta. Nesse caso o boss só persegue (ver _updateBossAbility).
  _isTargetOutOfReach(target) {
    if (!target.active) return false;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist > this.def.attackEffectiveRange) return true;
    return dist > this.def.attackFleeingRange && this._targetRadialSpeed(target) > this.def.fleeingSpeedThreshold;
  }

  // ---------- Salto de Perseguição ----------
  // Se o jogador foge além da tela (boss fora da câmera, ou passa de leapTriggerDistance) e segue fugindo
  // por leapFleeTimeMs seguidos, o boss agacha (aviso), salta pra fora da câmera, e cai NA
  // FRENTE do jogador (na direção em que ele corre) com um pouso pesado.
  // Depois fica agressivo por leapAggroMs (mais rápido, cooldowns menores)
  // e volta ao normal sozinho — só existem timestamps, nada permanente.
  _shouldLeap(target, nowMs) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    // Gatilho: o boss saiu da câmera (jogador fugiu além da tela) ou o jogador
    // passou de leapTriggerDistance (rede de segurança pra câmera muito aberta) E
    // ele continua fugindo — se está voltando pra cima do boss, a contagem zera.
    const outOfView = this._isSelfOffscreen(this.def.leapOffscreenMargin);
    const returning = this._targetRadialSpeed(target) < -this.def.fleeingSpeedThreshold;
    if ((!outOfView && dist < this.def.leapTriggerDistance) || returning) {
      this.leapFleeSince = null; // jogador voltou pra perto: zera a contagem
      return false;
    }
    if (this.leapFleeSince == null) this.leapFleeSince = nowMs;
    if (nowMs - this.leapFleeSince < this.def.leapFleeTimeMs) return false;
    if (nowMs < this.leapReadyAt) return false;
    if (this.axePhase) return false; // machado fora da mão: espera ele voltar
    if (!target.active || target.healthSystem?.isDead()) return false;
    return true;
  }

  // Passo 1: agacha e ruge (jogador vê que vem coisa)
  _startLeap(nowMs) {
    this.bossState = 'leap_crouch';
    this._moveTo(0, 0);
    this.leapFleeSince = null;
    this.leapPhaseUntil = nowMs + this.def.leapWindupMs;
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.scene.sound.play('sfx_minotaur_charge', { volume: 0.8 });
  }

  _updateLeapCrouch(nowMs) {
    this._moveTo(0, 0);
    const p = Phaser.Math.Clamp(1 - (this.leapPhaseUntil - nowMs) / this.def.leapWindupMs, 0, 1);
    this.setScale(this.baseScale * (1 + 0.15 * p), this.baseScale * (1 - 0.2 * p));
    // anel vermelho se fechando em volta dele (carregando o salto)
    const g = this.bossTelegraphGraphics;
    g.clear();
    g.lineStyle(4, LEAP_COLOR, 0.35 + 0.5 * p);
    g.strokeCircle(this.x, this.y, Phaser.Math.Linear(230, 70, p));
    if (nowMs >= this.leapPhaseUntil) this._startLeapRise(nowMs);
  }

  // Passo 2: decola — sobe esticando até sair da câmera
  _startLeapRise(nowMs) {
    this.bossState = 'leap_rise';
    this.bossTelegraphGraphics.clear();
    this.leapGroundX = this.x;
    this.leapGroundY = this.y;
    this.leapPhaseUntil = nowMs + this.def.leapRiseMs;
    this._moveTo(0, 0);
    this.body.enable = false; // sem colisão/overlap enquanto está no ar
    this.shadow?.setVisible(false);
    this.scene.cameras.main.shake(LEAP_TAKEOFF_SHAKE_MS, LEAP_TAKEOFF_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_minotaur_charge_impact', { volume: 0.8 });
    this._flashCircle(this.leapGroundX, this.leapGroundY, 100, LEAP_COLOR);
  }

  _updateLeapRise(nowMs) {
    const t = Phaser.Math.Clamp(1 - (this.leapPhaseUntil - nowMs) / this.def.leapRiseMs, 0, 1);
    this.setPosition(this.leapGroundX, this.leapGroundY - LEAP_RISE_HEIGHT * t * t);
    this.setScale(this.baseScale * (1 - 0.15 * t), this.baseScale * (1 + 0.25 * t));
    if (t >= 1) this._startLeapAir(nowMs);
  }

  // Passo 3: fora da câmera. O ponto de pouso acompanha o jogador (sempre
  // na frente dele) e TRAVA nos últimos leapLockMs, pra dar tempo de desviar.
  _startLeapAir(nowMs) {
    this.bossState = 'leap_air';
    this.setVisible(false);
    this.untargetable = true;
    this.setScale(this.baseScale, this.baseScale);
    this.leapAirStartAt = nowMs;
    this.leapAirUntil = nowMs + this.def.leapAirMs;
    this.leapLocked = false;
    this._computeLeapLanding(this.scene.player ?? { x: this.x, y: this.y });
  }

  // Ponto de pouso: à frente do jogador, na direção em que ele está
  // correndo (parado: na direção pra onde está virado).
  _computeLeapLanding(target) {
    let dx = target.body?.velocity?.x || 0;
    let dy = target.body?.velocity?.y || 0;
    let len = Math.hypot(dx, dy);
    if (len < 10) {
      const aim = target.getAimDirection?.();
      dx = aim?.x || 0;
      dy = aim?.y || 1;
      len = Math.hypot(dx, dy) || 1;
    }
    const bounds = this.scene.physics.world.bounds;
    // Surpresa: o pouso tem que ficar FORA da câmera, à frente da fuga —
    // distância mínima = meia diagonal da tela + raio do impacto + folga
    // (sem chegar no ponto exato que o jogador consegue prever).
    const view = this.scene.cameras.main.worldView;
    const offscreen = Math.hypot(view.width, view.height) / 2 + this.def.leapImpactRadius + 60;
    const lead = Math.max(this.def.leapLeadDistance, offscreen);
    this.leapTargetX = Phaser.Math.Clamp(target.x + (dx / len) * lead, bounds.x + 40, bounds.right - 40);
    this.leapTargetY = Phaser.Math.Clamp(target.y + (dy / len) * lead, bounds.y + 40, bounds.bottom - 40);
  }

  _updateLeapAir(target, nowMs) {
    const remaining = this.leapAirUntil - nowMs;
    if (!this.leapLocked) {
      if (remaining > this.def.leapLockMs) this._computeLeapLanding(target);
      else this.leapLocked = true;
    }

    // SEM aviso no chão de propósito: o jogador não sabe onde ele cai.
    // (nada de telegraph — só o som/tremor do pouso avisam, tarde demais)

    // últimos leapFallMs: reaparece em cima e despenca até o ponto de pouso
    if (remaining <= this.def.leapFallMs) {
      const f = Phaser.Math.Clamp(1 - remaining / this.def.leapFallMs, 0, 1);
      if (!this.visible) this.setVisible(true);
      this.setPosition(this.leapTargetX, this.leapTargetY - LEAP_FALL_HEIGHT * (1 - f * f));
      this.setScale(this.baseScale * (1 - 0.1 * f), this.baseScale * (1 + 0.2 * f));
    } else {
      this.setPosition(this.leapTargetX, this.leapTargetY - LEAP_FALL_HEIGHT);
    }

    if (remaining <= 0) this._landLeap(target, nowMs);
  }

  // Passo 4: POUSO — tremida forte, flash, onda de choque, dano em área e
  // empurrão forte no jogador se ele estiver dentro do raio.
  _landLeap(target, nowMs) {
    const lx = this.leapTargetX;
    const ly = this.leapTargetY;
    this.setPosition(lx, ly);
    this.body.reset(lx, ly);
    this.body.enable = true;
    this.setVisible(true);
    this.setScale(this.baseScale * 1.15, this.baseScale * 0.85); // amassado no impacto
    this.shadow?.setVisible(true);
    this.untargetable = false;
    this.bossTelegraphGraphics.clear();

    const radius = this.def.leapImpactRadius;
    const cam = this.scene.cameras.main;
    cam.shake(LEAP_LANDING_SHAKE_MS, LEAP_LANDING_SHAKE_INTENSITY);
    cam.flash(160, 255, 140, 60);
    this.scene.sound.play('sfx_minotaur_heavy_axe_impact', { volume: 0.95 });
    this.scene.sound.play('sfx_minotaur_stomp', { volume: 0.9 });
    this._flashCircle(lx, ly, radius, LEAP_COLOR);
    this._showAxeExplosionFx(lx, ly, radius);
    const ring = this.scene.add
      .circle(lx, ly, radius, 0xffffff, 0)
      .setStrokeStyle(6, 0xffddaa, 0.9)
      .setDepth(20)
      .setScale(0.2);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.6,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    const dx = target.x - lx;
    const dy = target.y - ly;
    const dist = Math.hypot(dx, dy);
    if (dist <= radius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this._bossDamage(this.def.leapDamage), this, nowMs);
      const len = dist || 1;
      const dirX = dist ? dx / len : 0;
      const dirY = dist ? dy / len : 1;
      target.applyKnockback?.(dirX, dirY, this.def.leapKnockbackForce, nowMs, this.def.leapKnockbackDurationMs);
    }

    // "Ele ficou puto porque eu fugi": ruge e entra em agressividade
    this.scene.sound.play('sfx_minotaur_cleave_roar', { volume: 0.9 });
    this.leapAggroUntil = nowMs + this.def.leapAggroMs;
    this.leapReadyAt = nowMs + this.def.leapCooldownMs;
    this.leapPhaseUntil = nowMs + this.def.leapRecoverMs;
    this.bossState = 'leap_recover';
    this._moveTo(0, 0);
  }

  _updateLeapRecover(nowMs) {
    this._moveTo(0, 0);
    const t = Phaser.Math.Clamp(1 - (this.leapPhaseUntil - nowMs) / this.def.leapRecoverMs, 0, 1);
    this.setScale(
      this.baseScale * Phaser.Math.Linear(1.15, 1, t),
      this.baseScale * Phaser.Math.Linear(0.85, 1, t)
    );
    if (nowMs >= this.leapPhaseUntil) {
      this.setScale(this.baseScale, this.baseScale);
      this.bossState = 'chasing';
      // primeiro ataque logo em seguida (a agressividade também encurta os
      // cooldowns via _bossCooldown enquanto durar)
      this.bossChargeReadyAt = nowMs + this._bossCooldown(this.def.leapAggroFirstAttackMs);
      this.stompReadyAt = Math.min(this.stompReadyAt, nowMs);
    }
  }

  // Aura vermelha pulsando em volta dele enquanto está agressivo — é o
  // sinal visual de "está puto". Some sozinha quando a agressividade acaba.
  _updateLeapAggroFx(nowMs) {
    if (!this._isLeapAggro()) {
      if (this.leapAura) { this.leapAura.destroy(); this.leapAura = null; }
      return;
    }
    if (!this.leapAura) {
      this.leapAura = this.scene.add
        .circle(this.x, this.y, LEAP_AGGRO_AURA_RADIUS, LEAP_COLOR, 0.2)
        .setStrokeStyle(3, LEAP_COLOR, 0.8)
        .setDepth(8);
    }
    this.leapAura.setPosition(this.x, this.y);
    this.leapAura.setVisible(this.visible);
    this.leapAura.setAlpha(0.55 + 0.35 * Math.sin(nowMs / 70));
  }

  // Limpa o que o salto criou fora do sprite (morte/fuga do boss — ver destroy()).
  _clearLeap() {
    this.leapAura?.destroy();
    this.leapAura = null;
    this.untargetable = false;
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
    this._moveTo(0, 0);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    this.cleaveAngle = Math.atan2(dy, dx);
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.cleaveTelegraphStartMs = nowMs;
    this.cleaveTelegraphDurationMs = this._bossTelegraph(this.def.cleaveTelegraphMs);
    this.cleaveTelegraphEndAt = nowMs + this.cleaveTelegraphDurationMs;
    this.scene.sound.play('sfx_minotaur_cleave_roar', { volume: 0.85 }); // grito de abertura do golpe mais forte dele
  }

  _updateCleaveTelegraph(nowMs) {
    this._moveTo(0, 0);
    const progress = Math.min((nowMs - this.cleaveTelegraphStartMs) / this.cleaveTelegraphDurationMs, 1);
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

  // Passo 5: cone parado no máximo, pequena pausa final antes do golpe sair
  _startCleavePause(nowMs) {
    this.bossState = 'cleave_pause';
    this.cleavePauseEndAt = nowMs + this._bossTelegraph(this.def.cleavePauseMs);
  }

  _updateCleavePause(target, nowMs) {
    this._moveTo(0, 0);
    this._drawCleaveTelegraph(1); // mantém o cone no máximo durante a pausa
    if (nowMs >= this.cleavePauseEndAt) this._executeCleave(target, nowMs);
  }

  // Passos 6-9: CORTE de verdade — dano altíssimo em todo mundo dentro do
  _executeCleave(target, nowMs) {
    this.bossTelegraphGraphics.clear();
    // whoosh do machado cortando o ar + impacto pesado juntos — é o golpe
    // mais forte do Minotauro, o feedback tem que condizer
    this.scene.sound.play('sfx_minotaur_axe_whoosh', { volume: 0.8 });
    this.scene.sound.play('sfx_minotaur_heavy_axe_impact', { volume: 0.95 });
    this.scene.cameras.main.shake(CLEAVE_SHAKE_MS, CLEAVE_SHAKE_INTENSITY);
    this.scene.cameras.main.flash(CLEAVE_FLASH_MS, 255, 30, 30);
    this._showCleaveExecuteFx();
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

  // Feedback do golpe mais destrutivo do Minotauro: clarão branco-quente
  // preenchendo o cone inteiro (ADD) + rastro vermelho-sangue mais lento
  // por baixo + 2 riscos brancos tipo "rasgo" cruzando o cone + estilhaços
  // voando espalhados dentro do ângulo do corte. Bem mais chamativo que o
  // flash simples de antes (ver _executeAxe/_showAxeExplosionFx pro
  // mesmo espírito aplicado à explosão do machado).
  _showCleaveExecuteFx() {
    const half = Phaser.Math.DegToRad(this.def.cleaveHalfAngleDeg);

    const flash = this.scene.add.graphics().setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
    flash.fillStyle(0xffffff, 0.95);
    flash.slice(this.x, this.y, this.def.cleaveRange, this.cleaveAngle - half, this.cleaveAngle + half, false);
    flash.fillPath();
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 170,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    const afterglow = this.scene.add.graphics().setDepth(19);
    afterglow.fillStyle(CLEAVE_COLOR, 0.5);
    afterglow.slice(this.x, this.y, this.def.cleaveRange * 1.05, this.cleaveAngle - half, this.cleaveAngle + half, false);
    afterglow.fillPath();
    this.scene.tweens.add({
      targets: afterglow,
      alpha: 0,
      duration: 540,
      ease: 'Cubic.easeOut',
      onComplete: () => afterglow.destroy()
    });

    for (let i = 0; i < 2; i++) {
      const angle = this.cleaveAngle + Phaser.Math.FloatBetween(-half * 0.6, half * 0.6);
      const line = this.scene.add.graphics().setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
      line.lineStyle(6, 0xffffff, 0.9);
      line.beginPath();
      line.moveTo(this.x, this.y);
      line.lineTo(this.x + Math.cos(angle) * this.def.cleaveRange, this.y + Math.sin(angle) * this.def.cleaveRange);
      line.strokePath();
      this.scene.tweens.add({
        targets: line,
        alpha: 0,
        duration: 220,
        delay: i * 40,
        ease: 'Cubic.easeOut',
        onComplete: () => line.destroy()
      });
    }

    this._spawnCleaveShards(half);
  }

  // Estilhaços dentro do ângulo do corte (mesma técnica das outras
  // habilidades, ver _spawnAxeExplosionShards)
  _spawnCleaveShards(half) {
    for (let i = 0; i < CLEAVE_SHARD_COUNT; i++) {
      const angle = this.cleaveAngle + Phaser.Math.FloatBetween(-half, half);
      const dist = this.def.cleaveRange * Phaser.Math.FloatBetween(0.55, 1.05);
      const tint = i % 2 === 0 ? CLEAVE_COLOR : 0xffffff;
      const shard = this.scene.add
        .image(this.x, this.y, 'hit_fx')
        .setDepth(20)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tint)
        .setScale(Phaser.Math.FloatBetween(0.4, 0.75))
        .setRotation(angle);
      this.scene.tweens.add({
        targets: shard,
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.1,
        duration: Phaser.Math.Between(280, 420),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  // Passo 10: pequena recuperação parado (def.cleaveRecoverMs) antes de
  _startCleaveRecover(nowMs) {
    this.bossState = 'cleave_recover';
    this.cleaveRecoverEndAt = nowMs + this.def.cleaveRecoverMs;
  }

  _updateCleaveRecover(nowMs) {
    this._moveTo(0, 0);
    if (nowMs >= this.cleaveRecoverEndAt) {
      this.bossState = 'chasing';
      this.bossChargeReadyAt = nowMs + this._bossCooldown(this.def.cleaveCooldownMs);
    }
  }

  // Para os passos da Investida (mesmo padrão de limpeza) — chamado quando
  // o dash termina e também na limpeza de die()/_leave()
  _stopChargeFootsteps() {
    if (!this.chargeFootsteps) return;
    this.chargeFootsteps.stop();
    this.chargeFootsteps.destroy();
    this.chargeFootsteps = null;
  }

  // Passo 1: jogador detectado muito perto (ver _updateBossAbility) —
  _startStomp(nowMs) {
    this.bossState = 'stomp_raise';
    this._moveTo(0, 0);
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.stompRaiseDurationMs = this._bossTelegraph(this.def.stompRaiseMs + this.def.stompPauseMs);
    this.stompRaiseUntil = nowMs + this.stompRaiseDurationMs;
    this.scene.sound.play('sfx_elite_lock', { volume: 0.5 });
  }

  _updateStompRaise(target, nowMs) {
    this._moveTo(0, 0);
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
    this.scene.sound.play('sfx_minotaur_stomp', { volume: 0.7 });
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
}
