import HealthSystem from '../../combat/HealthSystem.js';
import EventBus from '../../systems/EventBus.js';
import SettingsManager from '../../systems/SettingsManager.js';
import DamageNumberManager from '../../combat/DamageNumberManager.js';

let nextInstanceId = 1;

// Tint aplicado enquanto o inimigo está paralisado (carta "Overcharge" —
const PARALYZE_TINT = 0x1a1a66;
// Tint aplicado enquanto o inimigo está sangrando (carta "Hemorragia" —
const BLEED_TINT = 0x8a0000;
const NETWORK_STATUS_HOLD_MS = 600; // quanto o tint de status da réplica dura sem novo snapshot do Host

// Constantes compartilhadas por Elite.js e Minotaur.js (mesmo piscar de alarme
// nos telegraphs dos dois).
// Telegraph do Elite "piscando" (ver _drawMissileTelegraph) — alterna
export const MISSILE_BLINK_PERIOD_MS = 260;
export const MISSILE_BLINK_ALPHA_MIN = 0.12;
export const MISSILE_BLINK_ALPHA_MAX = 0.42;

// Fuga em massa (evento do Boss/Minotauro, ver SpawnDirector.
const FLEE_SPEED_MULTIPLIER = 1.8;
const FLEE_DESPAWN_MARGIN = 150;
const FLEE_MAX_DURATION_MS = 15000;
const ABANDONED_DESPAWN_MS = 12000;

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, def) {
    super(scene, x, y, def.sprite);
    this.def = def;
    this.name = def.id;
    // id único por instância — usado como chave de cooldown de dano de
    this.id = `${def.id}_${nextInstanceId++}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // A arte ocupa só parte do frame 64x64. Usar o frame inteiro como corpo
    // fazia o inimigo causar dano antes de tocar visualmente no jogador.
    const hitboxScale = def.hitboxScale ?? 0.32;
    const radius = Math.min(this.width, this.height) * hitboxScale;
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setDepth(9);

    // Variação sutil de tom por instância (evita "impresso igualzinho" —
    // ver conversa sobre "exército de clones"): escurece entre 0% e ~10%
    // em cima da cor de cada tipo definida em enemies.js, sem trocar a cor
    // em si, só a luminosidade. Puramente cosmético, não mexe em nada de
    // mecânica/hitbox.
    const brightness = Phaser.Math.FloatBetween(0.9, 1.0);
    const tintedColor =
      (Math.round(((def.color >> 16) & 0xff) * brightness) << 16) |
      (Math.round(((def.color >> 8) & 0xff) * brightness) << 8) |
      Math.round((def.color & 0xff) * brightness);
    this.setTint(tintedColor);

    // Escala base opcional (def.scale, ex.: Sealer maior pra se destacar
    // + variação sutil (±5%) pela mesma razão do tom acima. Tudo que lê
    // this.baseScale depois (squash de dano, tween de spawn, pulso de
    // carga) puxa esse valor já com a variação, então fica consistente
    // sozinho em qualquer lugar do código sem precisar tocar em mais nada.
    const scaleJitter = Phaser.Math.FloatBetween(0.95, 1.05);
    this.baseScale = (def.scale || 1) * scaleJitter;
    this.setScale(this.baseScale, this.baseScale);

    // Sombra simples embaixo do inimigo: elipse escura, translúcida, sem
    // luz/dinâmica nenhuma — só pra dar noção de "chão" (ver preUpdate
    // logo abaixo, que a mantém colada nos pés a cada frame). Mantida
    // pequena e bem discreta pra não chamar atenção nos inimigos base.
    const shadowWidth = this.displayWidth * 0.42;
    const shadowHeight = shadowWidth * 0.38;
    // Fração vertical do frame até os pés (def.shadowOffsetYFrac, 0.46 é
    // o padrão que serve pra quase todo mundo — só o Exploder, que é bem
    // mais baixinho dentro do próprio frame, precisa de um valor menor).
    this._shadowYFrac = def.shadowOffsetYFrac != null ? def.shadowOffsetYFrac : 0.46;
    this.shadow = scene.add.ellipse(x, y + this.displayHeight * this._shadowYFrac, shadowWidth, shadowHeight, 0x000000, 0.2);
    this.shadow.setDepth(this.depth - 1);
    // Desvio horizontal opcional (def.shadowOffsetX, em pixels "nativos"
    // do PNG, medido nos pés, sem flip) pra corrigir sombra em artes que
    // não são 100% centralizadas no frame — mesma ideia do Player.js.
    this.shadowOffsetX = def.shadowOffsetX || 0;

    // Sprite com animação de verdade (hoje só o Minotauro, ver
    if (def.walkAnim) {
      this.anims.play(def.walkAnim);
      // Dessincroniza a animação entre instâncias: sem isso, todo Grunt
      // (ou qualquer inimigo com sprite animado) que nasce no mesmo
      // instante fica andando em uníssono — dá a sensação de "exército de
      // clones" mesmo a arte sendo boa. Começar em um ponto aleatório do
      // ciclo resolve sem precisar de arte nova nenhuma.
      this.anims.setProgress(Math.random());
    }
    this.walkAnim = def.walkAnim || null;
    // sinal de crowding do SwarmSystem (ver chase()/updateAnimState()),
    // começa em 0 (sozinho) até o 1º chase() calcular o valor real
    this._crowding = 0;
    // intenção de movimento (ver _moveTo/updateAnimState) — começa parado
    // até o 1º chase() decidir uma velocidade de verdade
    this._wantsToMove = false;
    this.idleTexture = def.idleTexture || null;
    this.isIdleVisual = false;

    this.healthSystem = new HealthSystem(def.hp, {
      onDeath: () => this.die(),
      // Reação a mudança de vida: cada tipo decide o que fazer (o Minotauro entra em
      // rage aqui — ver _onHealthChange em Minotaur.js). Base: não faz nada.
      onChange: (current, max) => this._onHealthChange(current, max)
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
    this.abandonedSince = null;

    // sangramento (carta "Hemorragia" — evolução da Sanguessuga, ver
    this.bleedUntil = 0;
    this.bleedTickDamage = 0;
    this.bleedTickIntervalMs = 500;
    this.nextBleedTickAt = 0;

    // cor de tint "de status" (paralisia/sangramento) atualmente aplicada —
    this._currentStatusTint = def.color;

    // Imunidade a status/CC (knockback, paralisia, sangramento, slow-mo e
    // qualquer efeito futuro) — ver canReceiveStatus(). Todo boss é imune
    // por padrão; def.statusImmune (data/enemies.js) sobrescreve pra
    // qualquer tipo de inimigo (true = imune, false = boss vulnerável).
    this.statusImmune = def.statusImmune ?? !!def.boss;
  }

  // Mantém a sombra colada nos pés do inimigo, todo frame (chamado pelo
  // próprio Phaser automaticamente, sem precisar ligar em lugar nenhum).
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.shadow) {
      const offsetX = this.shadowOffsetX * this.scaleX * (this.flipX ? -1 : 1);
      this.shadow.x = this.x + offsetX;
      this.shadow.y = this.y + this.displayHeight * this._shadowYFrac;
    }
  }

  updateAbandonment(player, nowMs, distanceLimit) {
    if (
      !this.active ||
      this.def.elite ||
      this.def.sealer ||
      this.def.boss ||
      this.def.special ||
      this.def.event ||
      this.fleeing
    ) return false;

    const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (distance <= distanceLimit) {
      this.abandonedSince = null;
      return false;
    }

    if (this.abandonedSince == null) {
      this.abandonedSince = nowMs;
      return false;
    }

    if (nowMs - this.abandonedSince < ABANDONED_DESPAWN_MS) return false;
    this._leave();
    return true;
  }

  // Garante que a sombra some junto quando o inimigo é destruído (morte,
  // despawn por fuga, etc.) — sem isso ela ficaria órfã na tela.
  destroy(fromScene) {
    this.shadow?.destroy();
    super.destroy(fromScene);
  }

  // GATEWAY ÚNICO de imunidade a status/CC. Todo efeito que vem de fora e
  // altera o comportamento do inimigo (knockback, paralisia, sangramento,
  // slow...) precisa perguntar isto antes de aplicar — hoje applyKnockback,
  // applyBleed e applyParalyze já perguntam. Efeito novo: crie um
  // applyXxx() no Enemy, comece com `if (!this.canReceiveStatus()) return;`
  // e, se ele deixar estado no inimigo, zere esse estado em
  // _syncStatusImmunity(). Isso NÃO afeta dano direto (applyWeaponHit).
  canReceiveStatus() {
    return !this.statusImmune;
  }

  // Rede de segurança: se algum campo de status sobrou no inimigo imune
  // (ex.: código novo que escreveu direto, sem passar pelo gateway), zera
  // tudo e volta o tint pro normal. Barato: só age se houver resquício.
  _syncStatusImmunity() {
    if (!this.statusImmune) return;
    if (!this.knockbackUntil && !this.paralyzedUntil && !this.bleedUntil) return;
    this.knockbackUntil = 0;
    this.paralyzedUntil = 0;
    this.bleedUntil = 0;
    this.bleedTickDamage = 0;
    this._currentStatusTint = null; // força o setTint em _refreshStatusTint
    this._refreshStatusTint(this.scene.time.now);
  }

  // Decide e aplica o tint "de status" certo pro instante atual, com
  _refreshStatusTint(nowMs) {
    let desired = this.def.color;
    // imune: nunca pinta tint de status, mesmo que algum campo tenha sobrado
    if (!this.statusImmune) {
      if (nowMs < this.paralyzedUntil) desired = PARALYZE_TINT;
      else if (nowMs < this.bleedUntil) desired = BLEED_TINT;
    }
    if (desired !== this._currentStatusTint) {
      this._currentStatusTint = desired;
      this.setTint(desired);
    }
  }

  // Move o inimigo por um frame. IA "principal" continua sendo perseguir
  // Wrapper de setVelocity: guarda a INTENÇÃO de movimento (_wantsToMove)
  // no exato instante em que decidimos a velocidade, em vez de inferir se
  // o inimigo "está andando" relendo this.body.velocity depois. Ler a
  // velocity de volta ficava pouco confiável logo após pausar/retomar o
  // jogo (physics.pause()/resume()) — o valor podia não refletir mais a
  // intenção real, e updateAnimState() acabava travando no idle enquanto
  // o inimigo continuava se deslocando (bug do "deslizando parado").
  _moveTo(vx, vy) {
    this.setVelocity(vx, vy);
    this._wantsToMove = vx !== 0 || vy !== 0;
  }

  // Ajusta flipX pra virar o sprite conforme a direção horizontal do
  updateFacing() {
    if (!this.active || !this.body) return; // pode já ter morrido dentro do próprio chase() (ex.: Exploder)
    const vx = this.body.velocity.x;
    // Exploder (def.invertFacing): arte já vem "de frente" com a cabeça
    // do lado oposto ao das outras sprites, então o flip precisa ser
    // invertido pra cabeça acompanhar a direção do movimento certinho.
    const flipWhenRight = !this.def.invertFacing;
    if (vx > 5) this.setFlipX(flipWhenRight);
    else if (vx < -5) this.setFlipX(!flipWhenRight);
  }

  // Troca entre a animação de andar e a textura parada (idle) conforme a
  updateAnimState() {
    if (!this.active || !this.body || !this.idleTexture) return;
    if (!this._wantsToMove) {
      if (!this.isIdleVisual) {
        this.anims.stop();
        this.setTexture(this.idleTexture);
        this.isIdleVisual = true;
      }
      return;
    }
    if (this.isIdleVisual) {
      if (this.walkAnim) {
        this.anims.play(this.walkAnim);
        this.anims.setProgress(Math.random());
      }
      this.isIdleVisual = false;
    }
    // Ritmo da animação ligado direto no crowding calculado pelo
    // SwarmSystem (0 = sozinho, 1 = bem espremido) — não em velocity nem
    // em deslocamento real: o vetor de movimento do chase() é SEMPRE
    // normalizado pra magnitude 1 ali dentro (SwarmSystem.computeMoveDir),
    // então tanto body.velocity quanto o deslocamento real ficam ~cheios
    // o tempo todo mesmo quando o inimigo tá visualmente "preso" no meio
    // de outros — as duas primeiras tentativas mediam algo que nunca
    // baixava de verdade. Este número (this._crowding, setado no chase())
    // é o sinal direto de "quantos vizinhos colados", então funciona de
    // verdade: quanto mais lotado, mais devagar a animação.
    this.anims.timeScale = Phaser.Math.Clamp(1 - (this._crowding || 0) * 0.75, 0.25, 1);
  }

  pauseVisual() {
    if (!this.active || !this.idleTexture) return;
    this.anims.stop();
    this.setTexture(this.idleTexture);
    this.isIdleVisual = true;
  }

  resumeVisual() {
    if (!this.active || !this.body || !this.idleTexture) return;
    // NÃO zera isIdleVisual aqui antes de chamar updateAnimState(): ele
    // precisa continuar true (do pauseVisual()) pra updateAnimState()
    // reconhecer a transição idle->andando e chamar anims.play() de novo.
    // Zerar aqui ANTES fazia o guard "if (this.isIdleVisual)" lá dentro
    // já dar falso, então o anims.play(walkAnim) nunca era chamado — o
    // sprite ficava preso na textura idle (parado) pro resto da run,
    // mesmo com o inimigo se movendo normalmente por baixo (_wantsToMove).
    this.updateAnimState();
  }

  // ---------- Ganchos das subclasses (Exploder/Sealer/Elite/Minotaur) ----------
  // Na base não fazem nada: cada tipo de inimigo sobrescreve só o que precisa.

  // Chamado em todo chase(), ANTES da checagem de fuga. Devolve o multiplicador
  // de velocidade final (subclasse pode rodar efeitos paralelos e alterá-lo).
  _adjustChaseSpeed(target, nowMs, speedMultiplier) {
    return speedMultiplier;
  }

  // Chamado em todo chase(), DEPOIS da checagem de fuga. Devolve true quando o
  // tipo assumiu o movimento deste frame (o chase() padrão então não roda).
  _specialChase(target, nowMs, speedMultiplier) {
    return false;
  }

  // Chamado por flee(): cancela o ataque/estado especial em andamento.
  _cancelActionsForFlee() {}

  // Chamado por die() e _leave(): destrói o que o tipo criou fora do sprite.
  _cleanupSpecial() {}

  // Chamado por die() logo antes de emitir 'enemy-died' e destruir o sprite.
  _onDie() {}

  // Chamado pelo HealthSystem toda vez que a vida muda.
  _onHealthChange(current, max) {}

  chase(target, nowMs = 0, speedMultiplier = 1, moveDir = null) {
    if (!this.active || this.healthSystem.isDead()) return;

    // Imune a status/CC: o slow-mo global (SlowmoSystem) é um slow como
    // outro qualquer, então também é ignorado — e qualquer resquício de
    // efeito que tenha entrado por fora do gateway é limpo aqui.
    this._syncStatusImmunity();
    if (this.statusImmune) speedMultiplier = 1;

    // Cada tipo pode ajustar a velocidade e rodar efeitos paralelos antes da
    // perseguição (ver _adjustChaseSpeed — hoje só o Minotauro usa).
    speedMultiplier = this._adjustChaseSpeed(target, nowMs, speedMultiplier);

    // Fuga em massa (evento do Boss/Minotauro): assume o movimento por
    if (this.fleeing) { this._updateFlee(nowMs); return; }

    // Habilidades próprias de cada tipo (Exploder, Sealer, Elite, Minotauro) — ver
    // _specialChase em cada subclasse. true = o tipo assumiu o movimento deste frame.
    if (this._specialChase(target, nowMs, speedMultiplier)) return;

    const isParalyzed = nowMs < this.paralyzedUntil;
    this._refreshStatusTint(nowMs);

    if (nowMs < this.knockbackUntil) return; // ainda sendo empurrado, não sobrescreve a velocity
    if (isParalyzed) {
      this._moveTo(0, 0); // paralisado: para no lugar, não persegue
      return;
    }

    const speed = this.def.speed * speedMultiplier;

    if (moveDir) {
      this._moveTo(moveDir.x * speed, moveDir.y * speed);
      // Sinal de "quão lotado" (0..1, ver SwarmSystem.computeMoveDir) — a
      // velocidade acima é SEMPRE cheia (o vetor é normalizado ali dentro),
      // então é esse número, não a velocity, que updateAnimState() usa
      // pra saber se deve desacelerar a animação.
      this._crowding = moveDir.crowding || 0;
      return;
    }
    this._crowding = 0;

    // fallback: seek puro direto pro alvo (sem enxame) — mesmo comportament…
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq === 0) return;
    const dist = Math.sqrt(distSq);
    this._moveTo((dx / dist) * speed, (dy / dist) * speed);
  }

  // Aplica (ou reaplica) Sangramento — carta "Hemorragia", evolução da
  applyBleed(tickDamage, nowMs, durationMs, tickIntervalMs) {
    if (!this.active || this.healthSystem.isDead()) return;
    if (this.networkReplica) return; // réplica não simula status: vem do Host (syncNetworkStatus)
    if (!this.canReceiveStatus()) return;
    this.bleedTickDamage = tickDamage;
    this.bleedTickIntervalMs = tickIntervalMs;
    this.bleedUntil = nowMs + durationMs;
    this.nextBleedTickAt = nowMs + tickIntervalMs;
  }

  // Aplica (ou reaplica) Paralisia — carta "Overcharge". Único caminho
  // pra paralisar (DamageSystem._applyParalyze chama isto em vez de
  // escrever paralyzedUntil direto), pra imunidade valer sempre.
  applyParalyze(nowMs, durationMs) {
    if (!this.active || this.healthSystem.isDead()) return;
    if (this.networkReplica) return; // réplica não simula status: vem do Host (syncNetworkStatus)
    if (!this.canReceiveStatus()) return;
    this.paralyzedUntil = nowMs + durationMs;
  }

  // Host -> snapshot: bit 1 = sangrando, bit 2 = paralisado.
  getNetworkStatusFlags(nowMs) {
    if (!this.canReceiveStatus()) return 0;
    return (nowMs < this.bleedUntil ? 1 : 0) | (nowMs < this.paralyzedUntil ? 2 : 0);
  }

  // Cliente: o estado de status da réplica é SEMPRE o do último snapshot do
  // Host (só visual — tint). Nunca tica dano nem conta tempo por conta própria.
  syncNetworkStatus(flags, nowMs) {
    if (!this.networkReplica || !this.active) return;
    const allowed = this.canReceiveStatus();
    this.bleedUntil = allowed && (flags & 1) ? nowMs + NETWORK_STATUS_HOLD_MS : 0;
    this.paralyzedUntil = allowed && (flags & 2) ? nowMs + NETWORK_STATUS_HOLD_MS : 0;
    this._refreshStatusTint(nowMs);
  }

  // Chamado todo frame pelo EnemySpawner.updateAll (junto de chase()).
  updateBleed(nowMs) {
    if (!this.active || this.healthSystem.isDead()) return;
    this._syncStatusImmunity();
    this._refreshStatusTint(nowMs);
    if (nowMs >= this.bleedUntil) return;
    if (nowMs < this.nextBleedTickAt) return;
    this.nextBleedTickAt += this.bleedTickIntervalMs;
    const hitX = this.x;
    const hitY = this.y;
    const appliedDamage = this.healthSystem.takeDamage(this.bleedTickDamage);
    if (appliedDamage > 0) {
      DamageNumberManager.show(this.scene, hitX, hitY, appliedDamage, this, { kind: 'bleed' });
    }
  }

  // Empurra o inimigo na direção (dirX, dirY) — vetor já normalizado —
  applyKnockback(dirX, dirY, force, nowMs, durationMs = 130) {
    if (!this.active || this.healthSystem.isDead()) return;
    if (!this.canReceiveStatus()) return; // imune: não empurra NEM trava a velocity
    const resistance = this.def.knockbackResistance ?? 1;
    this._moveTo(dirX * force * resistance, dirY * force * resistance);
    this.knockbackUntil = nowMs + durationMs;
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

  // Toca um sfx (opcionalmente mais rápido, ver `rate`) e devolve a
  // duração pra cronometrar coisas (ver chamadas abaixo). Usa
  // sound.add()+play() (precisa da instância pro 'complete'/duration),
  // então passa direto por baixo do patch de SettingsManager.js — que só
  // intercepta o atalho sound.play(key, cfg) do manager. Sem multiplicar
  // aqui manualmente, este som ignorava o slider de SFX (só obedecia o
  // Master, que é nativo do Phaser e pega tudo).
  _playTimedSfx(key, volume, rate = 1) {
    const sfx = this.scene.sound.add(key);
    sfx.play({ volume: volume * SettingsManager.getSfx(), rate });
    sfx.once('complete', () => sfx.destroy());
    return (sfx.duration / rate) * 1000;
  }

  // Dispara a fuga (evento do Boss/Minotauro, ver SpawnDirector.
  flee(target) {

    if (!this.active || this.fleeing) return;
    this.fleeing = true;
    this.fleeMaxUntil = this.scene.time.now + FLEE_MAX_DURATION_MS;

    // Cada tipo cancela o que estiver no meio (ver _cancelActionsForFlee nas subclasses).
    this._cancelActionsForFlee();

    const angle = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
    this.fleeDirX = Math.cos(angle);
    this.fleeDirY = Math.sin(angle);
  }

  // Corre reto na direção sorteada em flee(), mais rápido que o normal
  _updateFlee(nowMs) {
    const speed = this.def.speed * FLEE_SPEED_MULTIPLIER;
    this._moveTo(this.fleeDirX * speed, this.fleeDirY * speed);
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
    this._cleanupSpecial(); // Graphics/timers/sons próprios de cada tipo (ver subclasses)
    this.destroy();
  }

  die() {
    if (!this.active) return;
    this.scene.tweens.killTweensOf(this);
    // Limpa o que cada tipo criou fora do sprite (Graphics, timers, sons em loop...)
    // — ver _cleanupSpecial nas subclasses.
    this._cleanupSpecial();
    // Efeito extra de morte de cada tipo (ex.: som do Elite) — ver _onDie.
    this._onDie();
    // `color` vai junto só pra quem quiser desenhar algo na cor do
    EventBus.emit('enemy-died', {
      enemyId: this.def.id,
      networkId: this.networkId,
      killerPlayerId: this.killerPlayerId || null,
      x: this.x,
      y: this.y,
      xpReward: this.def.xpReward,
      color: this.def.color
    });
    this.destroy();
  }
}