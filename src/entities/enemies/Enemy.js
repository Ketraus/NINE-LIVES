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

// Visual do míssil de verdade do Elite (ver _launchMissiles/
// _updateMissileLaunch) — uma bola avermelhada que sobe num arco e desce
// em cada área marcada, mesma técnica da granada do Cyberus (ver
// AllyDogAbility._launchGrenade/_advanceGrenadesInFlight), só que aqui
// saem MÚLTIPLAS de uma vez (uma por área) do topo do próprio Elite.
const MISSILE_COLOR = 0xff6633;
const MISSILE_RADIUS = 7;
const MISSILE_ARC_HEIGHT = 60;
// Toca o som de lançamento mais rápido que o normal (Sound.rate do
// Phaser) — o áudio original é mais lento que o voo da bola; acelerando
// os dois pelo MESMO fator (ver _launchMissiles/_playTimedSfx) eles ficam
// sincronizados de novo, só que num ritmo mais "correndo pro impacto".
const MISSILE_LAUNCH_SFX_RATE = 2.2;

// Telegraph do Elite "piscando" (ver _drawMissileTelegraph) — alterna
// entre esses dois níveis de alpha num ciclo de MISSILE_BLINK_PERIOD_MS,
// em vez de ficar com opacidade fixa. Mais rápido/contrastado que um
// "respirar" suave de propósito, pra passar alarme, não calma.
const MISSILE_BLINK_PERIOD_MS = 260;
const MISSILE_BLINK_ALPHA_MIN = 0.12;
const MISSILE_BLINK_ALPHA_MAX = 0.42;

// Tremida de câmera do ataque de mísseis — leve no lançamento (dá peso ao
// disparo, ver _launchMissiles), bem mais forte na explosão (dá peso ao
// impacto de 5 áreas de uma vez, ver _detonateMissiles); mesma escala de
// SlamAbility (0.004 leve / 0.008 forte), um pouco acima por ser um Elite.
const MISSILE_LAUNCH_SHAKE_MS = 100;
const MISSILE_LAUNCH_SHAKE_INTENSITY = 0.006;
const MISSILE_EXPLOSION_SHAKE_MS = 260;
const MISSILE_EXPLOSION_SHAKE_INTENSITY = 0.012;

// Tremida do golpe corpo a corpo do Elite — mesmo espírito do lançamento
// de míssil, só que ainda mais forte (é um soco de um bicho pesado bem
// colado no jogador, precisa pesar tanto quanto ou mais que a explosão).
const MELEE_SHAKE_MS = 220;
const MELEE_SHAKE_INTENSITY = 0.012;

// Investida do Minotauro (def.boss, ver _updateBossAbility e afins) — uma
// das duas habilidades dele, sorteada 50/50 com o Machado Arremessado
// (ver bloco AXE_* abaixo) toda vez que o cooldown compartilhado libera.
// Linha de aviso reaproveita o mesmo piscar do Elite (MISSILE_BLINK_*,
// ver _drawChargeTelegraph), só que reta em vez de área. Tremida de saída
// é leve (dá peso ao arranque); a do impacto de verdade é a mais forte do
// jogo até aqui (é o golpe do Boss).
const CHARGE_LINE_LENGTH = 1400;
const CHARGE_LAUNCH_SHAKE_MS = 120;
const CHARGE_LAUNCH_SHAKE_INTENSITY = 0.006;
const CHARGE_IMPACT_SHAKE_MS = 260;
const CHARGE_IMPACT_SHAKE_INTENSITY = 0.018;
// tint "atordoado" durante a janela vulnerável pós-investida (ver
// _endCharge) — vermelho claro, bem diferente do PARALYZE_TINT/BLEED_TINT
// de cima e da cor normal do Minotauro
const CHARGE_VULNERABLE_TINT = 0xffaaaa;
// Corte (evolução da Investida — ver _startSwing/_resolveSwing): o golpe
// de machado que sai IMEDIATAMENTE ao fim da investida, antes da janela
// vulnerável. Cor laranja no aviso (em vez do vermelho da linha reta) pra
// não confundir os dois avisos visualmente; tremida ainda mais forte que
// o impacto da própria investida — é o "castigo" de quem tentou ficar
// colado nele assim que a investida acabou.
const CHARGE_SWING_COLOR = 0xff8800;
const CHARGE_SWING_SHAKE_MS = 280;
const CHARGE_SWING_SHAKE_INTENSITY = 0.02;

// Machado Arremessado (2ª habilidade do Minotauro, sorteada 50/50 com a
// Investida — ver _updateBossAbility): para, prepara, arremessa o machado
// até a posição do jogador travada no fim do preparo (ele viaja girando),
// CRAVA no chão (impacto na hora), espera um instante, EXPLODE, levanta a
// mão e só então é puxado de volta (dano também na volta). Visual do
// machado é um simples emoji rotacionando (this.axeSprite,
// this.scene.add.text) — sem precisar de um asset novo pra isto. Mais
// lento e "de leitura" que a Investida de propósito: é o ataque à
// distância dele, ela é o corpo a corpo.
const AXE_SPIN_DEG_PER_MS = 0.9;
const AXE_THROW_SHAKE_MS = 90;
const AXE_THROW_SHAKE_INTENSITY = 0.004;
const AXE_IMPACT_SHAKE_MS = 160;
const AXE_IMPACT_SHAKE_INTENSITY = 0.01;
const AXE_EXPLOSION_SHAKE_MS = 240;
const AXE_EXPLOSION_SHAKE_INTENSITY = 0.016;
// amarelo (impacto) e laranja-avermelhado (explosão) — bem diferentes do
// vermelho da Investida e do laranja do Corte, pra não confundir os avisos
const AXE_TELEGRAPH_COLOR = 0xffcc00;
const AXE_EXPLOSION_COLOR = 0xff4400;

// Corte Destrutivo (3ª habilidade do Minotauro, sorteada 1/3 com a
// Investida e o Machado — ver _updateBossAbility): "carrega -> apita ->
// XABLAU". A ideia inteira dela é o OPOSTO de pegar o jogador de
// surpresa — telegraph BEM mais longo e visível que as outras duas
// (CLEAVE_TELEGRAPH_ALPHA_* mais forte desde o início, nada de começar
// quase invisível), com um apito (reaproveita sfx_elite_warning, sem
// asset novo) que sobe de volume e de tom (Sound.rate) conforme carrega
// — o "aviso ficando mais agudo" que o pedido descreve. Cone longo e
// estreito (CLEAVE_HALF_ANGLE_DEG pequeno) na direção travada no início
// do carregamento, igual a Investida trava a direção. Dano altíssimo,
// alcance grande, mas o shake do golpe em si é PEQUENO de propósito
// (contraste: o aviso é o evento grande, não o impacto).
const CLEAVE_COLOR = 0xff1133;
const CLEAVE_WHISTLE_VOLUME_START = 0.05;
const CLEAVE_WHISTLE_VOLUME_END = 0.8;
const CLEAVE_WHISTLE_RATE_START = 0.7;
const CLEAVE_WHISTLE_RATE_END = 1.8;
const CLEAVE_TELEGRAPH_ALPHA_START = 0.22;
const CLEAVE_TELEGRAPH_ALPHA_END = 0.6;
const CLEAVE_SHAKE_MS = 150;
const CLEAVE_SHAKE_INTENSITY = 0.008;

// Fuga em massa (evento do Boss/Minotauro, ver SpawnDirector.
// _checkBossSchedule/EnemySpawner.fleeAll): todo inimigo vivo na tela sai
// correndo pra longe do jogador e só some de vez quando realmente sair da
// visão da câmera (+ FLEE_DESPAWN_MARGIN, ver _isOutsideCameraView) — não
// um tempo fixo (era o bug: um tempo fixo curto sumia com quem começou
// mais perto da borda da câmera, ou era mais lento, ANTES de sair da
// visão de verdade). FLEE_MAX_DURATION_MS é só uma rede de segurança
// (nunca deveria ser atingida no jogo normal, sem obstáculo pra fuga)
// pra garantir que ninguém fique fugindo pra sempre num caso extremo.
const FLEE_SPEED_MULTIPLIER = 1.8;
const FLEE_DESPAWN_MARGIN = 150;
const FLEE_MAX_DURATION_MS = 15000;

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

    // Sprite com animação de verdade (hoje só o Minotauro, ver
    // data/enemies.js "walkAnim") — toca em loop, independente do resto
    // da IA; inimigos sem walkAnim continuam com a textura estática de
    // sempre.
    if (def.walkAnim) {
      this.anims.play(def.walkAnim);
    }
    this.walkAnim = def.walkAnim || null;
    this.idleTexture = def.idleTexture || null;
    this.isIdleVisual = false;

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

    // Fuga em massa (evento do Boss, ver flee()/FLEE_* acima): true a
    // partir do momento em que este inimigo recebe flee() — chase() passa
    // a só correr pra longe (ver _updateFlee), ignorando qualquer outro
    // estado (elite/sealer/explode).
    this.fleeing = false;
    this.fleeMaxUntil = 0;
    this.fleeDirX = 0;
    this.fleeDirY = 0;

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

    // Elite (def.elite = true, ver data/enemies.js): no "estado normal"
    // não tem nada de especial — anda na horda normal via flocking, igual
    // a qualquer outro inimigo (ver chase() abaixo, o guard só assume o
    // movimento durante o telegraph/ataque). eliteState controla a
    // máquina de estados própria: 'chasing' -> 'missile_telegraph' (3
    // áreas vermelhas aparecendo em sequência + aviso, ver
    // _startEliteMissiles/_updateMissileTelegraph) -> 'missile_launch'
    // (mísseis lançados de verdade, viajando pelo tempo do próprio som de
    // lançamento, ver _launchMissiles/_updateMissileLaunch) -> detona -> ou
    // 'melee_telegraph' (golpe corpo a corpo se o jogador estiver perto
    // demais quando a janela de ataque abrir, ver _startEliteMelee) ->
    // volta pra 'chasing' com um cooldown até o próximo ataque.
    // eliteNextAttackAt começa com um atraso curto e aleatório pra vários
    // Elites na mesma run não atacarem todos sincronizados.
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
    // habilidades sorteadas 1/3 cada sempre que bossChargeReadyAt libera
    // (ver _updateBossAbility) — dividem o mesmo cooldown/estado
    // (bossState), nunca acontecem ao mesmo tempo:
    // 1) Investida → Corte (mesmo espírito do golpe corpo a corpo do
    // Elite: parado -> telegraph -> ataque -> cooldown), só que em vez de
    // dano na área ao redor dele desde o início, ele primeiro DISPARA em
    // linha reta na direção travada, e SÓ ENTÃO golpeia a área ao redor.
    // bossState: 'chasing' -> 'charge_telegraph' (parado, linha vermelha
    // mostrando a rota, ver _startCharge/_updateChargeTelegraph) ->
    // 'charge_dash' (dispara de verdade, ver _launchCharge/
    // _updateChargeDash) -> 'charge_swing_telegraph' (corte de machado
    // IMEDIATO ao fim da investida, área laranja ao redor dele, ver
    // _startSwing/_resolveSwing) -> 'charge_vulnerable' (parado, tint
    // diferente, recebe mais dano — ver vulnerableDamageMultiplier em
    // DamageSystem.applyWeaponHit — é a janela pro jogador revidar) ->
    // volta pra 'chasing'.
    // 2) Machado Arremessado (ver AXE_* acima e _startAxeThrow e
    // afins): ataque à distância, "de leitura" — para, prepara
    // ('axe_telegraph'), arremessa até o jogador travado ('axe_outbound'),
    // crava e causa o primeiro impacto ('axe_stuck'), explode
    // (_explodeAxe), levanta a mão ('axe_raise') e puxa de volta
    // ('axe_return', dano de novo) -> volta pra 'chasing'.
    // 3) Corte Destrutivo (ver CLEAVE_* acima e _startCleave e afins):
    // "carrega -> apita -> XABLAU" — telegraph BEM mais longo e visível
    // que os outros dois de propósito (é o "eu avisei" da habilidade),
    // cone estreito e longo na direção travada, apito subindo de volume/
    // tom conforme carrega. 'cleave_telegraph' (carregando, cone +
    // apito) -> 'cleave_pause' (pequena pausa final, apito já mudo) ->
    // corte de verdade (_executeCleave, dano altíssimo, shake pequeno de
    // propósito) -> 'cleave_recover' (recupera) -> volta pra 'chasing'.
    // bossChargeReadyAt começa com um atraso curto (o Minotauro não usa
    // nenhuma habilidade no instante em que nasce).
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
      // ícone (emoji) do machado voando/cravado — null enquanto não foi
      // usado ainda nesta vida do Minotauro.
      this.axeSprite = null;
      this.axeTargetX = 0;
      this.axeTargetY = 0;
      // Corte Destrutivo: ver _startCleave e afins. cleaveWhistle é a
      // instância de som do apito (criada/destruída a cada uso, ver
      // _startCleave/_stopCleaveWhistle) — null enquanto não tá tocando.
      this.cleaveWhistle = null;
      this.cleaveAngle = 0;
      // multiplicador de dano recebido durante a janela vulnerável (ver
      // DamageSystem.applyWeaponHit) — 1 = normal, fora da janela
      this.vulnerableDamageMultiplier = 1;
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
  /**
   * Ajusta flipX pra virar o sprite conforme a direção horizontal do
   * movimento — necessário pra sprites com arte real e lado definido
   * (hoje só o Minotauro, ver data/enemies.js "walkAnim"); no placeholder
   * genérico (quadrado colorido, sem "lado") isto não muda nada visível,
   * então roda pra todos por simplicidade. Chamado todo frame pelo
   * EnemySpawner.updateAll, depois de chase().
   * A arte original (walkmino_png.png) olha pra ESQUERDA por padrão —
   * flipX=true espelha pra ele olhar/andar pra DIREITA.
   */
  updateFacing() {
    if (!this.active || !this.body) return; // pode já ter morrido dentro do próprio chase() (ex.: Exploder)
    const vx = this.body.velocity.x;
    if (vx > 5) this.setFlipX(true);
    else if (vx < -5) this.setFlipX(false);
  }

  /**
   * Troca entre a animação de andar e a textura parada (idle) conforme a
   * velocidade atual — só afeta inimigos com "idleTexture" definido em
   * data/enemies.js (hoje só o Minotauro). Sem isso ele ficava "andando
   * parado" (tocando a anim de caminhada mesmo com velocidade zero).
   * Chamado todo frame pelo EnemySpawner.updateAll, junto com updateFacing().
   */
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
    // cima de qualquer outro estado (elite/sealer/explode já foram
    // resetados em flee() abaixo) até FLEE_DURATION_MS acabar, quando o
    // inimigo simplesmente some (ver _updateFlee/_leave).
    if (this.fleeing) { this._updateFlee(nowMs); return; }

    // Exploder: enquanto preparando/explodindo, a máquina de estados
    // própria assume o movimento (fica parado) e chase() normal não roda.
    if (this.def.explodes && this._updateExplosive(target, nowMs)) return;

    // Sealer: nunca persegue o jogador — foge dele (mantendo-se mais pro
    // meio da arena, ver _computeSealerMovement). Só cuida disso +
    // desenhar/fechar a arena.
    if (this.def.sealer) { this._updateArena(target, nowMs, speedMultiplier); return; }

    // Elite: só assume o movimento (parado) durante o telegraph/ataque
    // (missile_telegraph ou melee_telegraph); em 'chasing' e fora da
    // janela de ataque, retorna false e cai no flocking normal abaixo —
    // é assim que ele "não precisa ser um evento que interrompe o jogo",
    // continuando na horda normalmente entre um ataque e outro.
    if (this.def.elite && this._updateElite(target, nowMs)) return;

    // Boss/Minotauro: mesma lógica do Elite acima — só assume o
    // movimento durante telegraph/investida/machado/vulnerável; em
    // 'chasing' e fora do cooldown, cai no flocking normal abaixo.
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
   * `def.knockbackResistance` (0..1, default 1 = sem resistência) reduz a
   * força final — usado pelo Elite (ver data/enemies.js) pra ele "pesar":
   * sente o empurrão, mas bem menos que um inimigo comum.
   * @param {number} dirX
   * @param {number} dirY
   * @param {number} force - "velocidade" do empurrão em px/s
   * @param {number} nowMs - scene.time.now
   * @param {number} [durationMs]
   */
  applyKnockback(dirX, dirY, force, nowMs, durationMs = 130) {
    if (!this.active || this.healthSystem.isDead()) return;
    const resistance = this.def.knockbackResistance ?? 1;
    this.setVelocity(dirX * force * resistance, dirY * force * resistance);
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

  /**
   * Estado do Elite (só roda quando def.elite = true). Retorna true quando
   * assumiu o movimento deste frame (telegraph/ataque em andamento),
   * indicando pra chase() não rodar o flocking normal por cima; false
   * quando ainda está em 'chasing' fora da janela de ataque (flocking
   * normal cuida do movimento, fora daqui).
   */
  _updateElite(target, nowMs) {
    if (this.eliteState === 'missile_telegraph') { this._updateMissileTelegraph(target, nowMs); return true; }
    if (this.eliteState === 'missile_launch') { this._updateMissileLaunch(target, nowMs); return true; }
    if (this.eliteState === 'melee_telegraph') { this._updateMeleeTelegraph(target, nowMs); return true; }
    if (this.eliteState === 'melee_swing') { this._updateMeleeSwing(target, nowMs); return true; }

    if (nowMs < this.eliteNextAttackAt) return false; // ainda na horda, flocking normal

    // Janela de ataque aberta: se o jogador estiver muito perto, golpe
    // corpo a corpo (evita o absurdo de disparar mísseis colado nele);
    // senão, ataque de mísseis à distância.
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.eliteMeleeRange) this._startEliteMelee(target, nowMs);
    else this._startEliteMissiles(target, nowMs);
    return true;
  }

  /** Início do ataque de mísseis: escolhe a posição do jogador AGORA (não
   * fica reajustando durante o telegraph) e sorteia mais def.eliteMissileCount-1
   * pontos espalhados ao redor dela — 3 áreas no total, obrigando o
   * jogador a se reposicionar em vez de só sair andando de um ponto fixo. */
  _startEliteMissiles(target, nowMs) {
    this.eliteState = 'missile_telegraph';
    this.setVelocity(0, 0);
    if (!this.eliteTelegraphGraphics) this.eliteTelegraphGraphics = this.scene.add.graphics().setDepth(4);

    // Lock: o Elite "trava a mira" no jogador — toca assim que o
    // telegraph começa, antes de qualquer área vermelha aparecer
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

  /** Revela uma área vermelha por vez (a cada eliteMissileStepGapMs) —
   * "3 áreas aparecendo em sequência", dando tempo do jogador perceber
   * cada uma. Depois que a última aparece, toca o aviso (Warning) e espera
   * eliteMissileWarnAfterMs antes de passar pro lançamento de verdade
   * (ver _launchMissiles). */
  _updateMissileTelegraph(target, nowMs) {
    this.setVelocity(0, 0);
    if (this.eliteMissileRevealed < this.eliteMissilePoints.length && nowMs >= this.eliteMissileNextStepAt) {
      this.eliteMissileRevealed += 1;
      this.eliteMissileNextStepAt = nowMs + this.def.eliteMissileStepGapMs;
      if (this.eliteMissileRevealed === this.eliteMissilePoints.length) {
        this.eliteMissileDetonateAt = nowMs + this.def.eliteMissileWarnAfterMs;
        // Warning: toca assim que a última área é revelada, cobrindo a
        // espera antes do lançamento de verdade
        this.scene.sound.play('sfx_elite_warning', { volume: 0.6 });
      }
    }
    this._drawMissileTelegraph(nowMs);
    if (this.eliteMissileDetonateAt != null && nowMs >= this.eliteMissileDetonateAt) {
      this._launchMissiles(nowMs);
    }
  }

  /** Áreas vermelhas piscando (não opacidade fixa) — alterna entre
   * MISSILE_BLINK_ALPHA_MIN/MAX num ciclo curto (ver MISSILE_BLINK_PERIOD_MS),
   * o contorno pisca junto (mais forte que o preenchimento, sempre bem
   * visível mesmo no vale do preenchimento) pra dar aquele "alarme"
   * de perigo em vez de uma marcação parada no chão. */
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

  /** Fim do aviso: o míssil sai de verdade. Toca o som de lançamento e usa
   * a DURAÇÃO REAL dele (já decodificado no preload, ver PreloadScene) pra
   * cronometrar tanto o voo visual quanto a detonação — ou seja, a bola
   * sobe do Elite e desce bem em cima de cada área exatamente quando o som
   * de lançamento termina, em vez de um tempo fixo digitado à mão. Sai uma
   * bola por área (ver eliteMissilePoints), todas do mesmo ponto (o
   * próprio Elite) e ao mesmo tempo. */
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

  /** Toca um sfx (opcionalmente mais rápido, ver `rate`) e devolve a
   * duração JÁ CONSIDERANDO essa velocidade, em ms — dobrar o rate corta
   * a duração pela metade, então quem cronometra a partir disto (ver
   * _launchMissiles) acompanha o áudio de verdade, não o tempo do arquivo
   * original. A instância é descartada sozinha ao terminar, pra não
   * acumular Sound objects a cada Elite. */
  _playTimedSfx(key, volume, rate = 1) {
    const sfx = this.scene.sound.add(key);
    sfx.play({ volume, rate });
    sfx.once('complete', () => sfx.destroy());
    return (sfx.duration / rate) * 1000;
  }

  /** Mísseis voando de verdade: interpola cada bola do Elite até a área
   * correspondente (com um arco pra "ler" como lançamento, mesma técnica
   * da granada do Cyberus) enquanto o som de lançamento toca — as áreas
   * no chão continuam marcadas o tempo todo, ver _drawMissileTelegraph.
   * Quando o tempo do som (eliteLaunchDetonateAt) acaba, destrói as bolas
   * e detona. */
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

  /** Passos 5-6: dano alto em área em cada um dos 3 pontos, só se o
   * jogador ainda estiver dentro do raio de impacto quando a bomba cai
   * (dá pra escapar dos 3 se reposicionar durante o telegraph/lançamento).
   * Volta pra 'chasing' com o cooldown do ataque de mísseis. */
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

  /** Início do golpe corpo a corpo: aviso em vermelho ao redor do próprio
   * Elite (sem sistema complexo de hitbox — é o mesmo raio usado pra
   * decidir se ataca corpo a corpo em vez de míssil). */
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

  /** Fim do aviso: o soco sai de verdade. Toca sfx_elite_punch e agenda o
   * dano pro instante em que o IMPACTO do soco acontece dentro do áudio
   * (def.eliteMeleePunchImpactMs, ver data/enemies.js) — não pela duração
   * total do arquivo, que tem cauda/reverb bem mais longa que o baque em
   * si (analisado no áudio: pico de amplitude por volta de 0.7s de um
   * clipe de 2.25s). O círculo de aviso continua piscando até lá. */
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

  /** Mesmo piscar (alarme) do telegraph de mísseis, ver
   * _drawMissileTelegraph/MISSILE_BLINK_* — reaproveitado aqui pro círculo
   * de aviso do corpo a corpo, em vez de opacidade fixa. */
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

  /** Dano alto corpo a corpo (só se o jogador ainda estiver no alcance —
   * pode ter saído durante o aviso) + cooldown próprio antes do próximo
   * ataque (def.eliteMeleeCooldownMs, independente do de mísseis). */
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

  /**
   * Estado das TRÊS habilidades do Minotauro (só roda quando def.boss =
   * true): Investida (charge_*), Machado Arremessado (axe_*) e Corte
   * Destrutivo (cleave_*), sorteadas 1/3 cada sempre que
   * bossChargeReadyAt libera. Retorna true nos estados que assumem o
   * movimento (todo o resto exceto 'chasing'); em 'chasing' fora do
   * cooldown, retorna false e cai no flocking normal (ver chase() acima)
   * — mesmo contrato do _updateElite.
   */
  _updateBossAbility(target, nowMs) {
    if (this.bossState === 'charge_telegraph') { this._updateChargeTelegraph(nowMs); return true; }
    if (this.bossState === 'charge_dash') { this._updateChargeDash(target, nowMs); return true; }
    if (this.bossState === 'charge_swing_telegraph') { this._updateChargeSwingTelegraph(target, nowMs); return true; }
    if (this.bossState === 'charge_vulnerable') { this._updateChargeVulnerable(nowMs); return true; }
    if (this.bossState === 'axe_telegraph') { this._updateAxeTelegraph(nowMs); return true; }
    if (this.bossState === 'axe_outbound') { this._updateAxeOutbound(target, nowMs); return true; }
    if (this.bossState === 'axe_stuck') { this._updateAxeStuck(target, nowMs); return true; }
    if (this.bossState === 'axe_raise') { this._updateAxeRaise(nowMs); return true; }
    if (this.bossState === 'axe_return') { this._updateAxeReturn(target, nowMs); return true; }
    if (this.bossState === 'cleave_telegraph') { this._updateCleaveTelegraph(nowMs); return true; }
    if (this.bossState === 'cleave_pause') { this._updateCleavePause(target, nowMs); return true; }
    if (this.bossState === 'cleave_recover') { this._updateCleaveRecover(nowMs); return true; }
    if (nowMs < this.bossChargeReadyAt) return false; // ainda na horda, flocking normal
    const roll = Math.random();
    if (roll < 1 / 3) this._startCharge(target, nowMs);
    else if (roll < 2 / 3) this._startAxeThrow(target, nowMs);
    else this._startCleave(target, nowMs);
    return true;
  }

  /** Para, trava a direção da investida NO INSTANTE ATUAL do jogador (o
   * Minotauro não reajusta depois disto — é o que torna o telegraph um
   * aviso de verdade, dá pro jogador desviar saindo da linha) e desenha o
   * aviso. Reaproveita sfx_elite_lock (mesma sensação de "travar mira"). */
  _startCharge(target, nowMs) {
    this.bossState = 'charge_telegraph';
    this.setVelocity(0, 0);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    this.bossChargeDir = { x: dx / len, y: dy / len };
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    // telegraph + pequena pausa contam juntos aqui: a linha fica visível
    // o tempo todo, incluindo a pausa "segurando o fôlego" antes de sair
    this.bossChargeTelegraphUntil = nowMs + this.def.chargeTelegraphMs + this.def.chargePauseMs;
    this.scene.sound.play('sfx_elite_lock', { volume: 0.6 });
  }

  _updateChargeTelegraph(nowMs) {
    this.setVelocity(0, 0);
    this._drawChargeTelegraph(nowMs);
    if (nowMs >= this.bossChargeTelegraphUntil) this._launchCharge(nowMs);
  }

  /** Fim do aviso: dispara de verdade na direção travada em _startCharge,
   * por def.chargeDurationMs (ver _updateChargeDash). */
  _launchCharge(nowMs) {
    this.bossState = 'charge_dash';
    this.bossTelegraphGraphics.clear();
    this.bossChargeHasHit = false;
    this.bossChargeDashUntil = nowMs + this.def.chargeDurationMs;
    this.setVelocity(this.bossChargeDir.x * this.def.chargeSpeed, this.bossChargeDir.y * this.def.chargeSpeed);
    this.scene.cameras.main.shake(CHARGE_LAUNCH_SHAKE_MS, CHARGE_LAUNCH_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_elite_punch', { volume: 0.8 });
  }

  /** Mantém a velocidade reta em linha (chase() normal não roda neste
   * estado, então nada mais mexe na velocity) e checa o acerto no
   * jogador UMA vez por investida (bossChargeHasHit) — sem isto, ele
   * causaria dano a cada frame enquanto o jogador estivesse na frente. */
  _updateChargeDash(target, nowMs) {
    this.setVelocity(this.bossChargeDir.x * this.def.chargeSpeed, this.bossChargeDir.y * this.def.chargeSpeed);
    if (!this.bossChargeHasHit) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (dist <= this.def.chargeHitRadius && target.active && !target.healthSystem?.isDead()) {
        this.bossChargeHasHit = true;
        DamageSystem.applyWeaponHit(target, this.def.chargeDamage, this, nowMs);
        this.scene.cameras.main.shake(CHARGE_IMPACT_SHAKE_MS, CHARGE_IMPACT_SHAKE_INTENSITY);
      }
    }
    if (nowMs >= this.bossChargeDashUntil) this._startSwing(nowMs);
  }

  /** Corte (evolução da Investida): IMEDIATAMENTE ao fim da investida,
   * antes de qualquer outra coisa, um golpe de machado em área ao redor
   * do próprio Minotauro — pega quem tentou ficar colado nele assim que
   * a corrida acabou, em vez de só quem estava no caminho dela. Telegraph
   * bem curto de propósito (def.chargeSwingTelegraphMs) — é o "castigo",
   * não dá tempo de reagir depois de já ter decidido ficar perto. */
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

  /** Dano em área (def.chargeSwingRadius/chargeSwingDamage) + a tremida
   * mais forte do jogo até aqui, e SÓ DEPOIS entra na janela vulnerável
   * (ver _endCharge) — o corte acontece antes dela, não durante. */
  _resolveSwing(target, nowMs) {
    this.bossTelegraphGraphics.clear();
    this.scene.cameras.main.shake(CHARGE_SWING_SHAKE_MS, CHARGE_SWING_SHAKE_INTENSITY);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist <= this.def.chargeSwingRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this.def.chargeSwingDamage, this, nowMs);
    }
    this._endCharge(nowMs);
  }

  /** Fim da investida+corte: para, fica "atordoado" (tint +
   * vulnerableDamageMultiplier, ver DamageSystem.applyWeaponHit) pela
   * janela pedida — é a abertura pro jogador revidar. */
  _endCharge(nowMs) {
    this.bossState = 'charge_vulnerable';
    this.setVelocity(0, 0);
    this.setTint(CHARGE_VULNERABLE_TINT);
    // mantém _currentStatusTint em sincronia (ver _refreshStatusTint) —
    // sem isto, ele "esqueceria" que o tint atual não é mais def.color e
    // deixaria de restaurar a cor normal quando a janela acabar
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
      this.bossChargeReadyAt = nowMs + this.def.chargeCooldownMs;
    }
  }

  /** Linha reta piscando (mesmo piscar do Elite, ver MISSILE_BLINK_*) na
   * direção travada — fixa do começo ao fim do telegraph, já que o
   * Minotauro fica parado durante toda essa janela (nada recalcula). */
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

  /** Área do Corte (laranja, pra não confundir com a linha vermelha da
   * Investida) ao redor do próprio Minotauro — mesmo círculo cheio+borda
   * do aviso corpo a corpo do Elite (_drawMeleeTelegraph), cor diferente. */
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

  /**
   * Passos 1-3: para, trava o ALVO (posição do jogador AGORA, igual à
   * Investida trava a DIREÇÃO) e mostra a linha+área de aviso amarela até
   * lá enquanto prepara (def.axeThrowTelegraphMs).
   */
  _startAxeThrow(target, nowMs) {
    this.bossState = 'axe_telegraph';
    this.setVelocity(0, 0);
    this.axeTargetX = target.x;
    this.axeTargetY = target.y;
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.axeTelegraphUntil = nowMs + this.def.axeThrowTelegraphMs;
    this.scene.sound.play('sfx_elite_lock', { volume: 0.6 });
  }

  _updateAxeTelegraph(nowMs) {
    this.setVelocity(0, 0);
    this._drawAxeTelegraph(nowMs);
    if (nowMs >= this.axeTelegraphUntil) this._launchAxe(nowMs);
  }

  /** Mesmo piscar (alarme) das outras marcações — linha até o ponto
   * travado + a área de impacto já visível desde o preparo, pra dar
   * tempo do jogador reagir antes do machado sair. */
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

  /**
   * Passo 4: fim do preparo — o machado sai de verdade do Minotauro até o
   * ponto travado, girando (def.axeThrowFlightMs de voo). Visual é um
   * simples emoji rotacionando (criado uma única vez e reaproveitado nas
   * próximas vezes, ver axeSprite no constructor) — sem precisar de um
   * asset novo pra isto.
   */
  _launchAxe(nowMs) {
    this.bossState = 'axe_outbound';
    this.bossTelegraphGraphics.clear();
    this.axeOriginX = this.x;
    this.axeOriginY = this.y;
    this.axeFlightStartMs = nowMs;
    this.axeFlightEndAt = nowMs + this.def.axeThrowFlightMs;
    if (!this.axeSprite) {
      this.axeSprite = this.scene.add.text(this.x, this.y, '🪓', { fontSize: '28px' }).setOrigin(0.5).setDepth(15);
    }
    this.axeSprite.setPosition(this.x, this.y).setRotation(0).setVisible(true);
    this.scene.cameras.main.shake(AXE_THROW_SHAKE_MS, AXE_THROW_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_elite_punch', { volume: 0.6 });
  }

  _updateAxeOutbound(target, nowMs) {
    this.setVelocity(0, 0);
    const progress = Math.min((nowMs - this.axeFlightStartMs) / this.def.axeThrowFlightMs, 1);
    this.axeSprite.x = Phaser.Math.Linear(this.axeOriginX, this.axeTargetX, progress);
    this.axeSprite.y = Phaser.Math.Linear(this.axeOriginY, this.axeTargetY, progress);
    this.axeSprite.setRotation(Phaser.Math.DegToRad((nowMs - this.axeFlightStartMs) * AXE_SPIN_DEG_PER_MS));
    if (nowMs >= this.axeFlightEndAt) this._stickAxe(target, nowMs);
  }

  /**
   * Passos 5-6: CRAVA no chão exatamente no ponto travado (para de girar)
   * e já causa o primeiro impacto ali (def.axeThrowImpactRadius/Damage,
   * avaliado contra a posição ATUAL do jogador — ele pode ter saído do
   * raio durante o voo). Só depois espera o intervalo antes de explodir
   * (ver _updateAxeStuck/_explodeAxe).
   */
  _stickAxe(target, nowMs) {
    this.bossState = 'axe_stuck';
    this.axeSprite.setPosition(this.axeTargetX, this.axeTargetY).setRotation(0);
    this.scene.cameras.main.shake(AXE_IMPACT_SHAKE_MS, AXE_IMPACT_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_elite_punch', { volume: 0.7 });
    this._flashCircle(this.axeTargetX, this.axeTargetY, this.def.axeThrowImpactRadius, AXE_TELEGRAPH_COLOR);
    const dist = Phaser.Math.Distance.Between(this.axeTargetX, this.axeTargetY, target.x, target.y);
    if (dist <= this.def.axeThrowImpactRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this.def.axeThrowImpactDamage, this, nowMs);
    }
    this.axeStuckUntil = nowMs + this.def.axeThrowStuckMs;
  }

  _updateAxeStuck(target, nowMs) {
    this.setVelocity(0, 0);
    if (nowMs >= this.axeStuckUntil) this._explodeAxe(target, nowMs);
  }

  /** Passo 8: 💥 explosão de verdade — raio maior e mais dano que o
   * impacto inicial, tremida mais forte, avaliada de novo contra a
   * posição ATUAL do jogador (pode ter saído durante a espera). Emenda
   * direto pro passo 9 (levantar a mão, ver _startAxeRaise). */
  _explodeAxe(target, nowMs) {
    this.scene.cameras.main.shake(AXE_EXPLOSION_SHAKE_MS, AXE_EXPLOSION_SHAKE_INTENSITY);
    this.scene.sound.play('sfx_elite_explosion', { volume: 0.6 });
    this._flashCircle(this.axeTargetX, this.axeTargetY, this.def.axeThrowExplosionRadius, AXE_EXPLOSION_COLOR);
    const dist = Phaser.Math.Distance.Between(this.axeTargetX, this.axeTargetY, target.x, target.y);
    if (dist <= this.def.axeThrowExplosionRadius && target.active && !target.healthSystem?.isDead()) {
      DamageSystem.applyWeaponHit(target, this.def.axeThrowExplosionDamage, this, nowMs);
    }
    this._startAxeRaise(nowMs);
  }

  /** Passo 9: Minotauro "levanta a mão" — um pulo curto de escala nele
   * mesmo (sem precisar de um frame de sprite novo) avisando que o
   * machado tá voltando, antes do retorno de verdade (ver
   * _startAxePullback). */
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
    this.setVelocity(0, 0);
    if (nowMs >= this.axeRaiseUntil) this._startAxePullback(nowMs);
  }

  /**
   * Passos 10-11: puxa o machado de volta do ponto cravado até a posição
   * ATUAL do Minotauro (ele fica parado a habilidade inteira, então é a
   * mesma de sempre), girando de novo, com verificação de acerto único
   * (axeReturnHasHit) — mesma técnica de bossChargeHasHit na Investida,
   * senão causaria dano a cada frame com o jogador em cima da linha de
   * volta.
   */
  _startAxePullback(nowMs) {
    this.bossState = 'axe_return';
    this.axeReturnStartMs = nowMs;
    this.axeReturnEndAt = nowMs + this.def.axeThrowReturnFlightMs;
    this.axeReturnHasHit = false;
    this.axeReturnFromX = this.axeTargetX;
    this.axeReturnFromY = this.axeTargetY;
  }

  _updateAxeReturn(target, nowMs) {
    this.setVelocity(0, 0);
    const progress = Math.min((nowMs - this.axeReturnStartMs) / this.def.axeThrowReturnFlightMs, 1);
    this.axeSprite.x = Phaser.Math.Linear(this.axeReturnFromX, this.x, progress);
    this.axeSprite.y = Phaser.Math.Linear(this.axeReturnFromY, this.y, progress);
    this.axeSprite.setRotation(Phaser.Math.DegToRad((nowMs - this.axeReturnStartMs) * AXE_SPIN_DEG_PER_MS));
    if (!this.axeReturnHasHit) {
      const dist = Phaser.Math.Distance.Between(this.axeSprite.x, this.axeSprite.y, target.x, target.y);
      if (dist <= this.def.axeThrowReturnRadius && target.active && !target.healthSystem?.isDead()) {
        this.axeReturnHasHit = true;
        DamageSystem.applyWeaponHit(target, this.def.axeThrowReturnDamage, this, nowMs);
      }
    }
    if (nowMs >= this.axeReturnEndAt) this._endAxeThrow(nowMs);
  }

  /** Passo 12: some o machado e volta a perseguir normalmente, com o
   * cooldown compartilhado (bossChargeReadyAt) até a próxima habilidade
   * (Investida OU Machado de novo, sorteado igual de novo). */
  _endAxeThrow(nowMs) {
    this.axeSprite?.setVisible(false);
    this.bossState = 'chasing';
    this.bossChargeReadyAt = nowMs + this.def.axeThrowCooldownMs;
  }

  /** Flash curto (círculo que nasce pequeno/opaco e cresce até sumir)
   * usado tanto no impacto (passo 6) quanto na explosão (passo 8) do
   * Machado — efeito pontual, não fica de graphics persistente pra
   * limpar depois. */
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

  /**
   * Passos 1-4: para, trava a DIREÇÃO no instante atual (igual a
   * Investida) e começa o carregamento — cone de perigo longo/estreito
   * já bem visível desde o início (CLEAVE_TELEGRAPH_ALPHA_START, nada de
   * "quase invisível no começo") + apito (reaproveita sfx_elite_warning
   * em loop, sem asset novo) que sobe de volume/tom a cada frame em
   * _updateCleaveTelegraph. def.cleaveTelegraphMs é de propósito bem mais
   * longo que o das outras habilidades — é a habilidade "eu avisei".
   */
  _startCleave(target, nowMs) {
    this.bossState = 'cleave_telegraph';
    this.setVelocity(0, 0);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    this.cleaveAngle = Math.atan2(dy, dx);
    if (!this.bossTelegraphGraphics) this.bossTelegraphGraphics = this.scene.add.graphics().setDepth(4);
    this.cleaveTelegraphStartMs = nowMs;
    this.cleaveTelegraphEndAt = nowMs + this.def.cleaveTelegraphMs;
    this.cleaveWhistle = this.scene.sound.add('sfx_elite_warning', { loop: true });
    this.cleaveWhistle.play({ volume: CLEAVE_WHISTLE_VOLUME_START, rate: CLEAVE_WHISTLE_RATE_START });
  }

  _updateCleaveTelegraph(nowMs) {
    this.setVelocity(0, 0);
    const progress = Math.min((nowMs - this.cleaveTelegraphStartMs) / this.def.cleaveTelegraphMs, 1);
    if (this.cleaveWhistle) {
      this.cleaveWhistle.setVolume(Phaser.Math.Linear(CLEAVE_WHISTLE_VOLUME_START, CLEAVE_WHISTLE_VOLUME_END, progress));
      this.cleaveWhistle.setRate(Phaser.Math.Linear(CLEAVE_WHISTLE_RATE_START, CLEAVE_WHISTLE_RATE_END, progress));
    }
    this._drawCleaveTelegraph(progress);
    if (nowMs >= this.cleaveTelegraphEndAt) this._startCleavePause(nowMs);
  }

  /** Cone de perigo (Graphics.slice = pizza/leque, mais simples que
   * desenhar o triângulo na mão) na direção travada em _startCleave —
   * alpha sobe linearmente com o progresso do carregamento (mesma leitura
   * do apito ficando mais intenso), já começando bem visível. */
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

  /** Passo 5: apito já mudo, cone parado no máximo, pequena pausa final
   * antes do golpe de verdade sair (def.cleavePauseMs) — o "respirar
   * fundo antes do XABLAU". */
  _startCleavePause(nowMs) {
    this.bossState = 'cleave_pause';
    this._stopCleaveWhistle();
    this.cleavePauseEndAt = nowMs + this.def.cleavePauseMs;
  }

  _updateCleavePause(target, nowMs) {
    this.setVelocity(0, 0);
    this._drawCleaveTelegraph(1); // mantém o cone no máximo durante a pausa
    if (nowMs >= this.cleavePauseEndAt) this._executeCleave(target, nowMs);
  }

  /**
   * Passos 6-9: CORTE de verdade — dano altíssimo em todo mundo dentro do
   * cone (mesma direção/ângulo/alcance travados no início), shake
   * PEQUENO de propósito (def diferente de CHARGE_SWING/AXE_EXPLOSION —
   * aqui o evento grande já foi o aviso, não o impacto) e um flash rápido
   * do próprio cone pra marcar visualmente o golpe.
   */
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
        DamageSystem.applyWeaponHit(target, this.def.cleaveDamage, this, nowMs);
      }
    }
    this._startCleaveRecover(nowMs);
  }

  /** Flash do cone (mesma técnica do _flashCircle, mas com o formato de
   * leque em vez de círculo) — nasce no branco/cor cheia e some rápido,
   * marcando o instante exato do golpe. */
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

  /** Passo 10: pequena recuperação parado (def.cleaveRecoverMs) antes de
   * voltar a perseguir — sem isto ele sairia andando/investindo de novo
   * no MESMO frame do corte, o que não combina com "recupera". */
  _startCleaveRecover(nowMs) {
    this.bossState = 'cleave_recover';
    this.cleaveRecoverEndAt = nowMs + this.def.cleaveRecoverMs;
  }

  _updateCleaveRecover(nowMs) {
    this.setVelocity(0, 0);
    if (nowMs >= this.cleaveRecoverEndAt) {
      this.bossState = 'chasing';
      this.bossChargeReadyAt = nowMs + this.def.cleaveCooldownMs;
    }
  }

  /** Para o apito (fade curto em vez de corte seco) e limpa a referência
   * — chamado ao fim do carregamento (_startCleavePause) e também na
   * fuga/morte (flee()/die()/_leave()), senão ele ficaria tocando pra
   * sempre se o Minotauro for interrompido no meio do carregamento. */
  _stopCleaveWhistle() {
    if (!this.cleaveWhistle) return;
    this.cleaveWhistle.stop();
    this.cleaveWhistle.destroy();
    this.cleaveWhistle = null;
  }

  /** Dispara a fuga (evento do Boss/Minotauro, ver SpawnDirector.
   * _checkBossSchedule/EnemySpawner.fleeAll): cancela qualquer estado
   * especial em andamento (elite parado telegrafando, sealer imóvel) pra
   * ele realmente conseguir correr, e sorteia a direção pra longe do
   * jogador. Chamado uma vez por inimigo; depois disso é chase() (via
   * this.fleeing) quem cuida do resto a cada frame.
   * @param {Phaser.GameObjects.GameObject} target - o jogador, só pra
   *   calcular de que lado fugir (sentido oposto a ele)
   */
  flee(target) {

    if (!this.active || this.fleeing) return;
    this.fleeing = true;
    this.fleeMaxUntil = this.scene.time.now + FLEE_MAX_DURATION_MS;

    // Sealer é imóvel de propósito (ver constructor) — sem isto ele
    // ficaria travado no lugar mesmo com fleeing=true.
    this.body.setImmovable(false);

    // Elite no meio de um ataque: cancela o telegraph/míssil em voo e
    // limpa o aviso visual, senão ficaria "congelado" atacando o ar pra
    // sempre em vez de fugir.
    if (this.eliteState && this.eliteState !== 'chasing') {
      this.eliteTelegraphGraphics?.clear();
      this.eliteMissileProjectiles?.forEach((m) => m.fx.destroy());
      this.eliteMissileProjectiles = [];
      this.eliteState = 'chasing';
    }

    // Boss/Minotauro no meio de uma habilidade (Investida, Machado ou
    // Corte Destrutivo): mesma ideia — cancela o telegraph, o machado em
    // voo/cravado e o apito do Corte, senão ficaria com efeitos "presos"
    // no mapa/tocando pra sempre em vez de fugir junto com o Minotauro.
    if (this.bossState && this.bossState !== 'chasing') {
      this.bossTelegraphGraphics?.clear();
      this.axeSprite?.setVisible(false);
      this._stopCleaveWhistle();
      this.bossState = 'chasing';
    }

    const angle = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
    this.fleeDirX = Math.cos(angle);
    this.fleeDirY = Math.sin(angle);
  }

  /** Corre reto na direção sorteada em flee(), mais rápido que o normal
   * (FLEE_SPEED_MULTIPLIER), até realmente sair da visão da câmera (+
   * margem, ver _isOutsideCameraView) — só aí some (ver _leave), sem virar
   * cadáver/XP/kill, ele só foi embora. FLEE_MAX_DURATION_MS é só rede de
   * segurança pro caso (não esperado) de nunca sair da visão. */
  _updateFlee(nowMs) {
    const speed = this.def.speed * FLEE_SPEED_MULTIPLIER;
    this.setVelocity(this.fleeDirX * speed, this.fleeDirY * speed);
    if (this._isOutsideCameraView(FLEE_DESPAWN_MARGIN) || nowMs >= this.fleeMaxUntil) this._leave();
  }

  /** true se este inimigo está fora do retângulo visível da câmera agora,
   * expandido por `margin` — calculado na mão a partir de scrollX/scrollY/
   * zoom (mesma técnica de EnemySpawner._currentCameraView, ver lá o
   * porquê de não usar camera.worldView direto). Usado só por _updateFlee
   * por enquanto. */
  _isOutsideCameraView(margin) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    const left = cam.scrollX - margin;
    const top = cam.scrollY - margin;
    const right = cam.scrollX + cam.width / zoom + margin;
    const bottom = cam.scrollY + cam.height / zoom + margin;
    return this.x < left || this.x > right || this.y < top || this.y > bottom;
  }

  /** Fim da fuga: mesma limpeza de extras visuais do die() (ver ali),
   * mas SEM emitir 'enemy-died' — não conta kill, não dropa XP, não toca
   * som/FX de morte. Ele só saiu de cena. */
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
    // parte, ver _updateArena), então precisa ser destruído na mão, senão
    // fica na tela pra sempre depois do Sealer morrer.
    this.arenaGraphics?.destroy();
    // Elite: mesma lógica — o Graphics do telegraph (mísseis/melee) não é
    // filho do sprite, precisa morrer junto na mão.
    this.eliteTelegraphGraphics?.destroy();
    // Elite: bolas de míssil em voo também não são filhas do sprite —
    // sem isto, ficariam "congeladas" no ar pra sempre se o Elite morrer
    // no meio do lançamento (ver _launchMissiles).
    this.eliteMissileProjectiles?.forEach((m) => m.fx.destroy());
    // Boss: mesma lógica — a linha de aviso da investida também não é
    // filha do sprite (ver _startCharge).
    this.bossTelegraphGraphics?.destroy();
    // Boss: o ícone do Machado Arremessado (voando ou já cravado) também
    // não é filho do sprite (ver _launchAxe) — sem isto ficaria
    // flutuando/cravado no mapa pra sempre se o Minotauro morrer no meio
    // do arremesso.
    this.axeSprite?.destroy();
    // Boss: o apito do Corte Destrutivo também precisa ser parado na mão
    // (Phaser Sound não é filho do sprite) — sem isto ficaria tocando pra
    // sempre se o Minotauro morrer no meio do carregamento.
    this._stopCleaveWhistle();
    // Elite: som de morte próprio em vez de nenhum som (os inimigos
    // normais não têm sfx de morte hoje) — toca antes do destroy(), que
    // não afeta o áudio (Phaser Sound não é filho do sprite).
    if (this.def.elite) this.scene.sound.play('sfx_elite_death', { volume: 0.6 });
    // `color` vai junto só pra quem quiser desenhar algo na cor do
    // inimigo (ver GameScene._spawnDeathFx) — o Enemy já não existe mais
    // no momento em que quem escuta o evento for usar isso.
    EventBus.emit('enemy-died', { x: this.x, y: this.y, xpReward: this.def.xpReward, color: this.def.color });
    this.destroy();
  }
}