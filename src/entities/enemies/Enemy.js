import HealthSystem from '../../combat/HealthSystem.js';
import EventBus from '../../systems/EventBus.js';
import DamageSystem from '../../combat/DamageSystem.js';

let nextInstanceId = 1;

// Tint aplicado enquanto o inimigo está paralisado (carta "Overcharge" —
// evolução do Overclock). Azul escuro pra ficar claramente diferente do
// flash branco de "levei dano" e da cor normal de cada inimigo.
const PARALYZE_TINT = 0x1a1a66;
// Tint aplicado enquanto o inimigo está sangrando (carta "Hemorragia" —
// evolução da Sanguessuga). Vermelho escuro, visualmente distinto do azul
// da paralisia e do flash branco de dano.
const BLEED_TINT = 0x8a0000;

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} def - entrada de data/enemies.json
   */
  constructor(scene, x, y, def) {
    super(scene, x, y, def.sprite);
    this.def = def;
    this.name = def.id;
    // id único por instância — usado como chave de cooldown de dano de
    // contato (se usássemos def.id, todo "grunt" compartilharia o mesmo
    // cooldown no alvo, o que deixaria o dano de contato incorreto)
    this.id = `${def.id}_${nextInstanceId++}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const radius = this.width / 2 - 2;
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setDepth(9);
    this.setTint(def.color);

    // Escala base opcional (def.scale, ex.: Sealer maior pra se destacar
    // do resto da horda). 1 = tamanho normal. Guardada à parte porque as
    // animações de "pop" (hit/explode abaixo) resetam pra este valor em
    // vez de sempre (1,1), senão elas atropelariam o tamanho do Sealer.
    this.baseScale = def.scale || 1;
    this.setScale(this.baseScale, this.baseScale);

    this.healthSystem = new HealthSystem(def.hp, {
      onDeath: () => this.die()
    });

    // até este timestamp (scene.time.now), chase() não sobrescreve a
    // velocity — é o que deixa o empurrão de knockback (ver applyKnockback)
    // realmente visível em vez de ser cancelado no frame seguinte
    this.knockbackUntil = 0;

    // até este timestamp (scene.time.now), o inimigo está paralisado (carta
    // "Overcharge" — evolução do Overclock, ver DamageSystem._applyParalyze)
    // e chase() não o move. 0 = nunca paralisado.
    this.paralyzedUntil = 0;

    // sangramento (carta "Hemorragia" — evolução da Sanguessuga, ver
    // DamageSystem._applyBleed / applyBleed abaixo). Até bleedUntil o
    // inimigo toma bleedTickDamage a cada bleedTickIntervalMs; 0 = sem
    // sangramento ativo. Não empilha: aplicar de novo só reinicia estes
    // três campos (ver applyBleed).
    this.bleedUntil = 0;
    this.bleedTickDamage = 0;
    this.bleedTickIntervalMs = 500;
    this.nextBleedTickAt = 0;

    // cor de tint "de status" (paralisia/sangramento) atualmente aplicada —
    // usado só pra não chamar setTint todo frame à toa quando nada mudou
    // (ver _refreshStatusTint). Começa igual à cor normal porque o
    // construtor já chamou setTint(def.color) acima.
    this._currentStatusTint = def.color;

    // Exploder (def.explodes = true, ver data/enemies.js): máquina de
    // estados própria só deste tipo — 'chasing' (comportamento normal,
    // ver chase()) -> 'preparing' (parado, piscando, ver _startPreparing)
    // -> _explode() aplica dano em área via DamageSystem e chama die().
    // Nenhum outro inimigo é afetado por isto (guard `def.explodes` em
    // chase() abaixo).
    this.explodeState = 'chasing';
    this.explodePrepUntil = 0;

    // Sealer (def.sealer = true, ver data/enemies.js): não persegue, fica
    // parado e imóvel (senão outros inimigos colidindo com ele o empurram
    // pra longe do centro da arena que ele mesmo está formando — ver
    // _updateArena abaixo). arenaGraphics/arenaBirthMs só existem pra este
    // tipo, criados sob demanda na primeira vez que _updateArena roda.
    if (def.sealer) {
      this.body.setImmovable(true);
      this.arenaCenter = null;
      this.arenaBirthMs = null;
      this.arenaGraphics = null;
      this.arenaNextCrushTickAt = 0;
      // Movimento em "rajadas" (ver _updateSealerMovement/_decideSealerMoveDir):
      // recalcular a direção TODO frame com base na posição exata do
      // jogador dava um círculo perfeito (a IA clássica de "fuja na
      // direção oposta" vira órbita estável quando o perseguidor segue
      // colado). Trocando por decisões a cada poucos décimos de segundo,
      // com um pouco de ruído no ângulo, o movimento fica em zigues
      // curtos em vez de uma curva contínua.
      this.sealerMoveDir = { x: 0, y: 0 };
      this.sealerNextDecisionAt = 0;
    }
  }

  /**
   * Decide e aplica o tint "de status" certo pro instante atual, com
   * prioridade paralisia > sangramento > cor normal (as duas primeiras não
   * podem ficar mascaradas uma pela outra — ver bug que isto substitui,
   * onde chase() e o antigo update de sangramento brigavam pelo mesmo
   * setTint). Só chama setTint quando o resultado realmente muda de um
   * frame pro outro.
   */
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

  /**
   * Move o inimigo por um frame. IA "principal" continua sendo perseguir
   * o alvo (o jogador) — mas quando `moveDir` é passado (SwarmSystem, ver
   * EnemySpawner.updateAll), ele já vem combinando Perseguição + Coesão +
   * Separação + Densidade com os pesos do tipo deste inimigo
   * (def.flocking), e chase() só aplica essa direção final na velocity,
   * sem recalcular nada de enxame aqui — este método continua sendo só o
   * dono de paralisia/knockback/tint, não da IA de movimento em si.
   * Matemática feita na mão (em vez de Phaser.Math.Vector2) pra não
   * alocar um objeto novo por inimigo a cada frame — com poucos
   * inimigos isso não importa nada, mas em enxames grandes (dezenas+) esse
   * lixo extra de memória é o tipo de coisa que pesa mais em celular do
   * que no PC, por causa da garbage collection.
   * @param {Player} target
   * @param {number} [nowMs] - scene.time.now; usado pra saber se ainda está
   *   "voando" de um knockback recente (ver applyKnockback) ou paralisado
   *   (ver `paralyzedUntil` e DamageSystem._applyParalyze)
   * @param {number} [speedMultiplier] - vem de scene.slowmoSystem (evolução
   *   "Reflexos de Predador", punhos, ver EnemySpawner.updateAll e
   *   src/systems/SlowmoSystem.js); 1 = velocidade normal. Só afeta a
   *   perseguição normal — knockback e paralisia (abaixo) já ignoram
   *   `def.speed` de qualquer forma, então não precisam disto.
   * @param {{x: number, y: number}} [moveDir] - direção já normalizada
   *   vinda de SwarmSystem.computeMoveDir(). Se omitido, cai no seek puro
   *   de sempre (compat: cheat "spawn" antes do 1º frame, testes, etc.).
   */
  chase(target, nowMs = 0, speedMultiplier = 1, moveDir = null) {
    if (!this.active || this.healthSystem.isDead()) return;

    // Exploder: enquanto preparando/explodindo, a máquina de estados
    // própria assume o movimento (fica parado) e chase() normal não roda.
    if (this.def.explodes && this._updateExplosive(target, nowMs)) return;

    // Sealer: nunca persegue o jogador — foge dele (mantendo-se mais pro
    // meio da arena, ver _computeSealerMovement). Só cuida disso +
    // desenhar/fechar a arena.
    if (this.def.sealer) { this._updateArena(target, nowMs, speedMultiplier); return; }

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

    // fallback: seek puro direto pro alvo (sem enxame) — mesmo comportamento de antes do SwarmSystem
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq === 0) return;
    const dist = Math.sqrt(distSq);
    this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  /**
   * Aplica (ou reaplica) Sangramento — carta "Hemorragia", evolução da
   * Sanguessuga. Chamado por DamageSystem._applyBleed a cada ataque do
   * jogador que causa Sangramento. Não empilha: uma nova aplicação apenas
   * SOBRESCREVE o dano por tick e REINICIA a duração — nunca soma um
   * segundo sangramento por cima do primeiro (regra pedida).
   * @param {number} tickDamage - dano de cada tick (já calculado como
   *   fração do dano do ataque que aplicou — ver DamageSystem._applyBleed)
   * @param {number} nowMs - scene.time.now
   * @param {number} durationMs
   * @param {number} tickIntervalMs
   */
  applyBleed(tickDamage, nowMs, durationMs, tickIntervalMs) {
    if (!this.active || this.healthSystem.isDead()) return;
    this.bleedTickDamage = tickDamage;
    this.bleedTickIntervalMs = tickIntervalMs;
    this.bleedUntil = nowMs + durationMs;
    this.nextBleedTickAt = nowMs + tickIntervalMs;
  }

  /**
   * Chamado todo frame pelo EnemySpawner.updateAll (junto de chase()).
   * Aplica o dano de cada tick de Sangramento que já venceu e atualiza o
   * tint de status. O dano vai DIRETO pra healthSystem.takeDamage — não
   * passa por DamageSystem.applyWeaponHit — de propósito: não deve gerar
   * cura da Sanguessuga, nem rolar paralisia/esquiva de novo (regra pedida:
   * "o Sangramento causa dano adicional, mas não gera cura pela
   * Sanguessuga").
   */
  updateBleed(nowMs) {
    if (!this.active || this.healthSystem.isDead()) return;
    this._refreshStatusTint(nowMs);
    if (nowMs >= this.bleedUntil) return;
    if (nowMs < this.nextBleedTickAt) return;
    this.nextBleedTickAt += this.bleedTickIntervalMs;
    this.healthSystem.takeDamage(this.bleedTickDamage);
  }

  /**
   * Empurra o inimigo na direção (dirX, dirY) — vetor já normalizado —
   * por `durationMs`. Usado pelas armas (ver Weapon.js/RangedWeapon.js,
   * campo `knockback` em data/weapons.js) pra dar sensação de impacto:
   * punhos empurram forte, katana médio, pistola pouco.
   * @param {number} dirX
   * @param {number} dirY
   * @param {number} force - "velocidade" do empurrão em px/s
   * @param {number} nowMs - scene.time.now
   * @param {number} [durationMs]
   */
  applyKnockback(dirX, dirY, force, nowMs, durationMs = 130) {
    if (!this.active || this.healthSystem.isDead()) return;
    this.setVelocity(dirX * force, dirY * force);
    this.knockbackUntil = nowMs + durationMs;
  }

  /**
   * Sealer (def.sealer = true): forma uma arena circular fixa no mundo,
   * centrada onde o jogador estava no instante em que o Sealer nasceu, que
   * vai encolhendo de def.arenaStartRadius até def.arenaMinRadius ao longo
   * de def.arenaShrinkDurationMs. Todo frame, empurra jogador e QUALQUER
   * inimigo (menos ele mesmo) que esteja fora do raio atual de volta pra
   * dentro — é isso que "prende" quem estiver por perto quando ela nasce
   * (e também quem entrar depois, vindo de fora) sem precisar guardar uma
   * lista fixa de "quem foi pego". Regra pedida: "MATA ESSA DESGRAÇA ANTES
   * QUE FECHE" — ao chegar no raio mínimo, passa a causar
   * def.arenaCrushDamagePerSecond no jogador (a horda, já toda empurrada
   * pra cima dele pelo próprio fechamento, faz o resto via dano de
   * contato normal). Some junto com o Sealer ao morrer (ver die()).
   */
  _updateArena(target, nowMs, speedMultiplier = 1) {
    if (!this.arenaCenter) {
      // nasce agora: centro fixo = onde o jogador estava neste instante
      // (não o próprio Sealer, que pode ter spawnado fora da tela) —
      // "envolvendo o jogador e todos os inimigos próximos" (pedido).
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
    // de encurralar): se ainda estiver "voando" de um knockback recente
    // (ver applyKnockback), não sobrescreve a velocity este frame, igual
    // ao resto dos inimigos.
    if (nowMs >= this.knockbackUntil) {
      this._updateSealerMovement(target, radius, nowMs, speedMultiplier);
    }

    this._containWithinArena(target, radius);
    // o próprio Sealer também é contido — sem isto, se ele nascer perto da
    // borda do raio inicial, o fechamento progressivo o deixaria PRA FORA
    // da própria arena depois de alguns segundos (regra: nunca pode ficar
    // fora da área que ele mesmo criou).
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

  /**
   * Só redecide a direção do Sealer a cada ~0,5–0,9s (não todo frame — ver
   * comentário no constructor sobre por que isso mata o efeito "andando em
   * círculo perfeito"). Entre uma decisão e outra, ele segue reto na
   * última direção escolhida, o que já parece mais "de propósito" do que
   * uma curva suave e contínua.
   */
  _updateSealerMovement(target, radius, nowMs, speedMultiplier) {
    if (nowMs >= this.sealerNextDecisionAt) {
      this.sealerNextDecisionAt = nowMs + Phaser.Math.Between(500, 900);
      this.sealerMoveDir = this._decideSealerMoveDir(target, radius);
    }
    const speed = this.def.speed * speedMultiplier;
    this.setVelocity(this.sealerMoveDir.x * speed, this.sealerMoveDir.y * speed);
  }

  /**
   * Uma "decisão" do Sealer: se o jogador estiver longe, na maior parte
   * das vezes ele só fica parado (só um tanto das vezes dá um passeio
   * curto e aleatório) — nada de ficar orbitando à toa sem motivo. Se o
   * jogador estiver perto, foge na direção oposta, mas com um ÂNGULO
   * ALEATÓRIO por cima (jitter) em vez da direção "matematicamente
   * perfeita" pra longe — é o ruído que quebra a sensação de robô. Perto
   * da borda da arena, mistura um pouco de "puxada pro centro" (mesma
   * ideia de antes), só que agora também com jitter.
   */
  _decideSealerMoveDir(target, radius) {
    const FLEE_TRIGGER_RANGE = 340;
    const dpx = this.x - target.x;
    const dpy = this.y - target.y;
    const distFromPlayer = Math.sqrt(dpx * dpx + dpy * dpy);

    // vetor radial (do centro da arena pro Sealer) — usado tanto pro
    // passeio ocioso quanto pro desvio de parede abaixo
    const dcx = this.x - this.arenaCenter.x;
    const dcy = this.y - this.arenaCenter.y;
    const distFromCenter = Math.sqrt(dcx * dcx + dcy * dcy);
    const edgeFactor = Phaser.Math.Clamp(distFromCenter / radius, 0, 1); // 0 centro, 1 borda
    const nx = distFromCenter > 0 ? dcx / distFromCenter : 1;
    const ny = distFromCenter > 0 ? dcy / distFromCenter : 0;

    if (distFromPlayer >= FLEE_TRIGGER_RANGE) {
      // jogador longe: maioria das vezes parado; quando anda, é sempre
      // pra dentro (rumo ao centro, com ruído) — nunca reto pra parede
      // à toa, senão ficaria se enfiando no canto mesmo sem motivo.
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
    // escalar positivo com a normal radial), troca por uma corrida
    // TANGENTE — desliza pela borda em vez de empurrar contra ela. Isso é
    // o que elimina o efeito "bobão preso no canto": em vez de vibrar
    // parado contra o limite (a fuga pede pra sair, a contenção da arena
    // empurra de volta, todo frame), ele passa a contornar a parede,
    // ainda se afastando do jogador, só que pelo lado.
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

  /** Empurra `body` (jogador ou outro inimigo) de volta pra dentro do
   * raio atual da arena, se estiver fora — clamp simples na borda do
   * círculo, sem se importar com paredes do mapa (a arena é pensada pra
   * abrir em área aberta). */
  _containWithinArena(body, radius) {
    const dx = body.x - this.arenaCenter.x;
    const dy = body.y - this.arenaCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= radius || dist === 0) return;
    const scale = radius / dist;
    body.setPosition(this.arenaCenter.x + dx * scale, this.arenaCenter.y + dy * scale);
  }

  /** Desenha o anel da arena — vai de um roxo frio (recém-aberta) pra um
   * vermelho de alerta conforme `t` (progresso do fechamento) avança, pra
   * ficar óbvio o quão perto do esmagamento total a horda está. */
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


   /* por DamageSystem.applyWeaponHit/applyContactDamage sempre que o alvo é
   * um Enemy (ver lá), então soco, katana, pistola, drone, pancada sísmica,
   * contra-ataque de espinhos e cachorro aliado têm todos o MESMO feedback,
   * sem cada arma/habilidade reimplementar a própria versão.
   * Se o hit matou o inimigo, die()/destroy() já rodou antes disto ser
   * chamado (HealthSystem.onDeath dispara na hora, dentro de takeDamage) —
   * por isso o guard de `active` logo no início.
   */
  playHitReaction() {
    if (!this.active) return;

    // flash branco rápido (volta pro tint de status certo — normal,
    // paralisado ou sangrando, conforme o que ainda estiver ativo quando
    // o timer disparar — ver _refreshStatusTint)
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return;
      const nowMs = this.scene.time.now;
      this._currentStatusTint = null; // força setTint mesmo se o resultado "bater" com o que já estava antes do flash
      this._refreshStatusTint(nowMs);
    });

    // "pop" de impacto: estica/encolhe rápido e volta ao normal — sensação
    // de peso no golpe sem interferir na escala normal do sprite. Mata
    // qualquer tween de pop anterior antes de começar um novo, senão hits
    // muito rápidos (ex.: pistola automática) deixam o sprite "tremendo"
    // ao empilhar tweens concorrentes na mesma propriedade.
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

  /**
   * Estado do Exploder (só roda quando def.explodes = true). Retorna
   * true quando assumiu o movimento deste frame (charging/preparing/
   * exploding), indicando pra chase() não rodar a perseguição normal
   * por cima.
   * - 'chasing': deixa chase() perseguir devagar/normal (SwarmSystem);
   *   passa a 'charging' ao entrar em def.explodeChargeRadius.
   * - 'charging': a "XANBLAU" — larga o enxame e arranca em linha reta
   *   pro alvo bem mais rápido (def.speed * explodeChargeSpeedMultiplier)
   *   até entrar em def.explodeTriggerRadius, aí vira 'preparing'.
   * - 'preparing': para no lugar, piscando (sinal visual), até
   *   explodePrepUntil vencer -> _explode().
   */
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
    // movimento, ver chamador). Só decide QUANDO trocar de estado.
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

  /** Seek em linha reta pro alvo numa velocidade dada — usado pela
   * arrancada da 'charging' (ignora flocking/SwarmSystem de propósito,
   * é um bote direto, não um enxame). */
  _seekAt(target, speed) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) { this.setVelocity(0, 0); return; }
    this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  /** Início da arrancada ("XANBLAU"): flash branco + esticada rápida,
   * só pra marcar visualmente o instante em que ele "desiste" de vir
   * devagar e parte pra cima do jogador. */
  _startCharging() {
    this.explodeState = 'charging';
    this.scene.tweens.killTweensOf(this);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (!this.active) return;
      // Do fim do flash branco até bater no alvo (ou virar 'preparing'),
      // o Exploder fica com tint vermelho pulsante — sinal visual claro
      // de que ele está correndo pra cima do jogador pra se explodir.
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

  /** Início da preparação: para no lugar e pisca em laranja de aviso. */
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

  /** Fim da preparação: dano em área (via DamageSystem) e morte. */
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

  die() {
    if (!this.active) return;
    this.scene.tweens.killTweensOf(this);
    // Sealer: o anel da arena não é filho do sprite (é um Graphics à
    // parte, ver _updateArena), então precisa ser destruído na mão, senão
    // fica na tela pra sempre depois do Sealer morrer.
    this.arenaGraphics?.destroy();
    // `color` vai junto só pra quem quiser desenhar algo na cor do
    // inimigo (ver GameScene._spawnDeathFx) — o Enemy já não existe mais
    // no momento em que quem escuta o evento for usar isso.
    EventBus.emit('enemy-died', { x: this.x, y: this.y, xpReward: this.def.xpReward, color: this.def.color });
    this.destroy();
  }
}
