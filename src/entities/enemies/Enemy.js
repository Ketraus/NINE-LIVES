import HealthSystem from '../../combat/HealthSystem.js';
import EventBus from '../../systems/EventBus.js';

let nextInstanceId = 1;

// Tint aplicado enquanto o inimigo está paralisado (carta "Overcharge" —
// evolução do Overclock). Azul escuro pra ficar claramente diferente do
// flash branco de "levei dano" e da cor normal de cada inimigo.
const PARALYZE_TINT = 0x1a1a66;

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
    // espelha se PARALYZE_TINT está aplicado agora — evita ficar chamando
    // setTint todo frame à toa enquanto paralisado (ver chase())
    this._paralyzeTintActive = false;
  }

  /**
   * Persegue o alvo (o jogador) em linha reta. IA simples de propósito — é
   * o protótipo. Matemática feita na mão (em vez de Phaser.Math.Vector2)
   * pra não alocar um objeto novo por inimigo a cada frame — com poucos
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
   */
  chase(target, nowMs = 0, speedMultiplier = 1) {
    if (!this.active || this.healthSystem.isDead()) return;

    // tint de paralisia: liga/desliga independente do knockback, pra ficar
    // visível mesmo nos primeiros instantes em que os dois se sobrepõem
    // (ex.: soco que paralisa também empurra). Só chama setTint na
    // TRANSIÇÃO de estado — não todo frame — pra não brigar com o flash
    // branco de playHitReaction() sem necessidade.
    const isParalyzed = nowMs < this.paralyzedUntil;
    if (isParalyzed !== this._paralyzeTintActive) {
      this._paralyzeTintActive = isParalyzed;
      this.setTint(isParalyzed ? PARALYZE_TINT : this.def.color);
    }

    if (nowMs < this.knockbackUntil) return; // ainda sendo empurrado, não sobrescreve a velocity
    if (isParalyzed) {
      this.setVelocity(0, 0); // paralisado: para no lugar, não persegue
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq === 0) return;
    const dist = Math.sqrt(distSq);
    const speed = this.def.speed * speedMultiplier;
    this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
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
   * Reação visual padrão a QUALQUER dano recebido — chamada centralizada
   * por DamageSystem.applyWeaponHit/applyContactDamage sempre que o alvo é
   * um Enemy (ver lá), então soco, katana, pistola, drone, pancada sísmica,
   * contra-ataque de espinhos e cachorro aliado têm todos o MESMO feedback,
   * sem cada arma/habilidade reimplementar a própria versão.
   * Se o hit matou o inimigo, die()/destroy() já rodou antes disto ser
   * chamado (HealthSystem.onDeath dispara na hora, dentro de takeDamage) —
   * por isso o guard de `active` logo no início.
   */
  playHitReaction() {
    if (!this.active) return;

    // flash branco rápido (volta pra cor normal do inimigo — ou pro tint de
    // paralisia, se ainda estiver paralisado quando o timer disparar, ex.:
    // um segundo golpe que renova a paralisia enquanto ela já estava ativa)
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return;
      const stillParalyzed = this.scene.time.now < this.paralyzedUntil;
      this.setTint(stillParalyzed ? PARALYZE_TINT : this.def.color);
    });

    // "pop" de impacto: estica/encolhe rápido e volta ao normal — sensação
    // de peso no golpe sem interferir na escala normal do sprite. Mata
    // qualquer tween de pop anterior antes de começar um novo, senão hits
    // muito rápidos (ex.: pistola automática) deixam o sprite "tremendo"
    // ao empilhar tweens concorrentes na mesma propriedade.
    this.scene.tweens.killTweensOf(this);
    this.setScale(1, 1);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.22,
      scaleY: 0.8,
      duration: 55,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => { if (this.active) this.setScale(1, 1); }
    });
  }

  die() {
    if (!this.active) return;
    this.scene.tweens.killTweensOf(this);
    // `color` vai junto só pra quem quiser desenhar algo na cor do
    // inimigo (ver GameScene._spawnDeathFx) — o Enemy já não existe mais
    // no momento em que quem escuta o evento for usar isso.
    EventBus.emit('enemy-died', { x: this.x, y: this.y, xpReward: this.def.xpReward, color: this.def.color });
    this.destroy();
  }
}
