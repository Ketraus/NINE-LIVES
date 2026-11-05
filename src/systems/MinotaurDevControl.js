// Controls are opt-in per boss. Normal combat does not allocate timers/listeners.
export const MINO_ATTACKS = ['investida', 'giro', 'machado', 'corte', 'pisao', 'salto', 'meteoro'];

export function stopMinotaur(boss) {
  const airborne = ['leap_rise', 'leap_air'].includes(boss.bossState);
  boss.transformFx?.destroy();
  boss.transformFx = null;
  boss.scene.tweens.killTweensOf(boss);
  boss._devRevision = (boss._devRevision || 0) + 1;
  boss._cancelActionsForFlee();
  boss._clearMeteors();
  boss._clearLeap();
  boss._stopChargeFootsteps();
  if (airborne) boss.body.reset(boss.leapGroundX, boss.leapGroundY);
  boss.body.enable = true;
  boss.setVisible(true).setScale(boss.baseScale, boss.baseScale).clearTint();
  boss.shadow?.setVisible(true);
  boss._currentStatusTint = null;
  boss._tfPending = false;
  boss.invulnerable = !!boss._devInvulnerable;
  boss.untargetable = false;
  boss.fleeing = false;
  boss.leapAggroUntil = 0;
  boss.leapFleeSince = null;
  boss.vulnerableDamageMultiplier = 1;
  boss.bossVulnerableUntil = 0;
  boss.bossState = 'chasing';
  boss.meteorRainActive = false;
  boss._devManual = true;
  boss._devQueue = null;
  boss._devRepeat = null;
  boss._moveTo(0, 0);
  boss._freezeVisual();
}

export function setMinotaurPhase(boss, phase) {
  stopMinotaur(boss);
  boss.isEnraged = phase === 2;
  boss.healthSystem.current = phase === 2
    ? Math.max(1, Math.floor(boss.healthSystem.maxHp * boss.rageHpThreshold))
    : boss.healthSystem.maxHp;
  boss._refreshBossVisual();
  // Each attack selects its own palette; no shared definition is changed.
}

export function queueMinotaurAttack(boss, attack, intervalMs = 0) {
  stopMinotaur(boss);
  boss._devQueue = attack;
  if (intervalMs) boss._devRepeat = { attack, intervalMs, nextAt: Infinity };
}

export function startMinotaurAttack(boss, attack, target, now) {
  boss.entranceIdleUntil = 0;
  if (attack === 'transformar') {
    boss.invulnerable = true; // normal combat sets this in _triggerRage first
    boss._beginTransformation();
    return;
  }
  if (attack === 'investida') boss._startCharge(target, now);
  else if (attack === 'machado') boss._startAxeThrow(target, now);
  else if (attack === 'corte') boss._startCleave(target, now);
  else if (attack === 'pisao') boss._startStomp(now);
  else if (attack === 'salto') boss._startLeap(now);
  else if (attack === 'meteoro') boss._spawnMeteor(target, now);
  else if (attack === 'giro') {
    const dx = target.x - boss.x, dy = target.y - boss.y;
    const length = Math.hypot(dx, dy) || 1;
    boss.bossChargeDir = { x: dx / length, y: dy / length };
    boss._startSwing(now);
  }
}

// Runs only on the authoritative simulation, after closing the dev console.
export function updateMinotaurDevControl(boss, target, now) {
  if (boss.networkReplica || boss.scene.devConsole?.isOpen || boss.scene.isPaused) return;
  if (boss._devQueue) {
    const command = boss._devQueue;
    boss._devQueue = null;
    startMinotaurAttack(boss, command, target, now);
  }
  const repeat = boss._devRepeat;
  if (!repeat) return;
  const idle = boss.bossState === 'chasing' && !boss.axePhase && !boss.meteors.length && !boss.transformFx;
  if (!idle) { repeat.nextAt = Infinity; return; }
  if (repeat.nextAt === Infinity) repeat.nextAt = now + repeat.intervalMs;
  if (now < repeat.nextAt) return;
  repeat.nextAt = Infinity;
  startMinotaurAttack(boss, repeat.attack, target, now);
}
