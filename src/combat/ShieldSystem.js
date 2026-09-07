// Componente de escudo recarregável — carta "Escudo Energético" (evoluç…
export default class ShieldSystem {
  constructor(maxShield, { rechargeDelayMs = 4000, rechargeRatePerSec = 12, onChange, onHit } = {}) {
    this.maxShield = maxShield;
    // nasce cheio: "recarregável" pressupõe já estar carregado quando a
    this.current = maxShield;
    this.rechargeDelayMs = rechargeDelayMs;
    this.rechargeRatePerSec = rechargeRatePerSec;
    this.onChange = onChange || (() => {});
    this.onHit = onHit || (() => {});

    this.lastDamageMs = -Infinity; // -Infinity: já pode começar a recarregar desde o início, se algum dia…
    this._lastUpdateMs = null;

    // desconta da recarga qualquer tempo com a tela de cartas aberta —
    this.pausedMs = 0;
    this.pauseStartedAt = null;
  }

  // Chamado quando a tela de escolha de carta abre (ver Player).
  pause(nowMs) {
    if (this.pauseStartedAt != null) return; // já pausado
    this.pauseStartedAt = nowMs;
  }

  // Chamado quando a tela de escolha de carta fecha.
  resume(nowMs) {
    if (this.pauseStartedAt == null) return;
    this.pausedMs += nowMs - this.pauseStartedAt;
    this.pauseStartedAt = null;
  }

  _activeNow(rawNowMs) {
    const currentPauseMs = this.pauseStartedAt != null ? rawNowMs - this.pauseStartedAt : 0;
    return rawNowMs - this.pausedMs - currentPauseMs;
  }

  // Consome `damage` do escudo (o quanto ele aguentar) e devolve o
  absorb(damage, nowMs) {
    if (damage <= 0) return damage;
    this.lastDamageMs = this._activeNow(nowMs);
    if (this.current <= 0) return damage;

    const absorbed = Math.min(this.current, damage);
    this.current -= absorbed;
    this.onChange(this.current, this.maxShield);
    this.onHit();
    return damage - absorbed;
  }

  // Chamado todo frame (ver Player._updateShield) — só faz algo quando há…
  update(rawNowMs) {
    const nowMs = this._activeNow(rawNowMs);
    const delta = this._lastUpdateMs === null ? 0 : nowMs - this._lastUpdateMs;
    this._lastUpdateMs = nowMs;

    if (this.current >= this.maxShield) return;
    if (nowMs - this.lastDamageMs < this.rechargeDelayMs) return;
    if (delta <= 0) return;

    const before = this.current;
    this.current = Math.min(this.maxShield, this.current + (this.rechargeRatePerSec * delta) / 1000);
    if (this.current !== before) this.onChange(this.current, this.maxShield);
  }

  isRegenerating(rawNowMs) {
    const nowMs = this._activeNow(rawNowMs);
    return this.current < this.maxShield && nowMs - this.lastDamageMs >= this.rechargeDelayMs;
  }
}
