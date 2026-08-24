/**
 * Componente de escudo recarregável — carta "Escudo Energético" (evolução
 * de Blindagem, ver data/upgrades.js). Mesma ideia de composição que
 * HealthSystem: quem tem a habilidade instancia isto, ninguém herda dele.
 *
 * Fluxo: absorve dano ANTES da vida (ver DamageSystem._applyShield). Depois
 * de `rechargeDelayMs` sem tomar nenhum dano, recarrega sozinho a
 * `rechargeRatePerSec` pontos por segundo até o máximo.
 */
export default class ShieldSystem {
  /**
   * @param {number} maxShield
   * @param {object} [opts]
   * @param {number} [opts.rechargeDelayMs] - tempo sem dano até começar a recarregar
   * @param {number} [opts.rechargeRatePerSec] - pontos de escudo por segundo, uma vez recarregando
   * @param {(current:number, max:number) => void} [opts.onChange] - disparado sempre que `current` muda (dano ou recarga)
   * @param {() => void} [opts.onHit] - disparado só quando o escudo de fato absorve algum dano (não na recarga)
   */
  constructor(maxShield, { rechargeDelayMs = 4000, rechargeRatePerSec = 12, onChange, onHit } = {}) {
    this.maxShield = maxShield;
    // nasce cheio: "recarregável" pressupõe já estar carregado quando a
    // carta é obtida, não subindo do zero na primeira vez
    this.current = maxShield;
    this.rechargeDelayMs = rechargeDelayMs;
    this.rechargeRatePerSec = rechargeRatePerSec;
    this.onChange = onChange || (() => {});
    this.onHit = onHit || (() => {});

    this.lastDamageMs = -Infinity; // -Infinity: já pode começar a recarregar desde o início, se algum dia nascer sem estar cheio
    this._lastUpdateMs = null;

    // desconta da recarga qualquer tempo com a tela de cartas aberta —
    // mesmo padrão que SpawnDirector.pause()/resume()/getElapsedMs() já usa
    // pro relógio da run: scene.time.now continua correndo em tempo real
    // mesmo com timeScale=0 (ver LevelUpUI/DevConsole), então sem isto o
    // escudo recarregaria (ou até enchia de um pulo) só de o jogador
    // demorar pra escolher uma carta — abre brecha pra ficar parado na tela
    // de cartas de propósito só pra "trapacear" a recarga
    this.pausedMs = 0;
    this.pauseStartedAt = null;
  }

  /** Chamado quando a tela de escolha de carta abre (ver Player). */
  pause(nowMs) {
    if (this.pauseStartedAt != null) return; // já pausado
    this.pauseStartedAt = nowMs;
  }

  /** Chamado quando a tela de escolha de carta fecha. */
  resume(nowMs) {
    if (this.pauseStartedAt == null) return;
    this.pausedMs += nowMs - this.pauseStartedAt;
    this.pauseStartedAt = null;
  }

  /** @returns {number} carimbo de tempo "ativo" (descontando pausas), a partir de um scene.time.now cru */
  _activeNow(rawNowMs) {
    const currentPauseMs = this.pauseStartedAt != null ? rawNowMs - this.pauseStartedAt : 0;
    return rawNowMs - this.pausedMs - currentPauseMs;
  }

  /**
   * Consome `damage` do escudo (o quanto ele aguentar) e devolve o
   * restante, que quem chamou deve aplicar na vida de verdade — mesmo
   * padrão de "resto" que DamageSystem._applyDamageReduction já usa.
   * @param {number} damage
   * @param {number} nowMs - carimbo de tempo da cena (scene.time.now), usado
   *   pra pausar a recarga por `rechargeDelayMs` a partir deste hit
   * @returns {number} dano que não coube no escudo (0 se absorveu tudo)
   */
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

  /** Chamado todo frame (ver Player._updateShield) — só faz algo quando há recarga pendente. */
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

  /** @returns {boolean} true nos frames em que a recarga está de fato em andamento (usado só pro piscar visual) */
  isRegenerating(rawNowMs) {
    const nowMs = this._activeNow(rawNowMs);
    return this.current < this.maxShield && nowMs - this.lastDamageMs >= this.rechargeDelayMs;
  }
}
