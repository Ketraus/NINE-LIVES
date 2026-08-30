import DamageSystem from '../combat/DamageSystem.js';

const BULLET_LIFETIME_MS = 1500;
const DEFAULT_PROJECTILE_SPEED = 380;
// intervalo entre cada shuriken dentro da MESMA rajada (ver _fireVolley) —
// "uma atrás da outra, só que rápido": não é o mesmo frame, mas também não
// espera o cooldown inteiro de novo entre elas.
const VOLLEY_STAGGER_MS = 120;
// giro contínuo do shuriken no ar (puramente visual, não mexe na
// velocity/hitbox) — duração de uma volta completa
const SPIN_DURATION_MS = 260;

const SHURIKEN_COLOR = 0xd9d9e6;
const SHURIKEN_TEX_SIZE = 16;

/**
 * Habilidade exclusiva da Katana (carta "katana_shuriken"): a cada
 * this.def.cooldownMs, arremessa `this.volleyCount` shurikens contra
 * inimigos próximos DIFERENTES (um por alvo), um logo atrás do outro
 * (VOLLEY_STAGGER_MS de intervalo), não todos no mesmo frame. Cada cópia
 * extra da carta soma +1 shuriken por rajada (ver restack) em vez de somar
 * mais uma instância rodando em paralelo — mesmo padrão de SlamAbility.
 *
 * Mesma interface que as outras habilidades (update(time, player,
 * enemyGroup, scene)).
 */
export default class ShurikenAbility {
  /** @param {object} def - entrada de data/upgrades.js (type: "unlockAbility") */
  constructor(def) {
    this.def = def;
    this.lastMs = 0;
    this.volleyCount = 1;
    this.bulletGroup = null;
    this.scene = null;
  }

  /**
   * Chamado a cada cópia extra da carta (até 4, ver data/upgrades.js
   * maxStacks) — em vez de outra instância arremessando em paralelo no
   * mesmo cooldown, a MESMA habilidade passa a jogar mais um shuriken por
   * rajada, cada um mirando um inimigo próximo diferente.
   */
  restack() {
    this.volleyCount += 1;
  }

  update(time, player, enemyGroup, scene) {
    if (!this.bulletGroup) this._create(scene, player, enemyGroup);

    if (time - this.lastMs < this.def.cooldownMs) return;
    const targets = this._findNearbyTargets(player, enemyGroup, this.volleyCount);
    if (targets.length === 0) return; // sem alvo à vista: não gasta cooldown (igual à pistola/GatoDrone)

    this.lastMs = time;
    this._fireVolley(scene, player, targets);
  }

  _create(scene, player, enemyGroup) {
    this.scene = scene;
    this.bulletGroup = scene.physics.add.group();
    scene.physics.add.overlap(this.bulletGroup, enemyGroup, (bullet, enemy) => {
      DamageSystem.applyWeaponHit(enemy, bullet.getData('damage'), player, scene.time.now);
      bullet.destroy();
    });
    scene.mapManager?.addCollider(this.bulletGroup, (bullet) => bullet.destroy());
  }

  /**
   * Até `count` inimigos DIFERENTES dentro de def.range, mais próximos
   * primeiro — cada shuriken da rajada mira um alvo distinto (nunca dois
   * shurikens no mesmo inimigo na mesma rajada, a menos que haja menos
   * alvos vivos do que shurikens).
   */
  _findNearbyTargets(player, enemyGroup, count) {
    const candidates = [];
    enemyGroup.children.iterate((enemy) => {
      if (!enemy?.active) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (dist <= this.def.range) candidates.push({ enemy, dist });
    });
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, count).map((c) => c.enemy);
  }

  /** Arremessa um shuriken por alvo, espaçados por VOLLEY_STAGGER_MS —
   * "um atrás do outro, rápido" em vez de uma saraivada no mesmo instante. */
  _fireVolley(scene, player, targets) {
    targets.forEach((target, i) => {
      scene.time.delayedCall(i * VOLLEY_STAGGER_MS, () => {
        if (!player.active || !target.active) return; // alvo morreu enquanto a rajada ainda disparava
        this._throw(scene, player, target);
      });
    });
  }

  _throw(scene, player, target) {
    const dir = new Phaser.Math.Vector2(target.x - player.x, target.y - player.y).normalize();
    const speed = this.def.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;

    const bullet = this.bulletGroup.create(player.x, player.y, this._ensureTexture(scene));
    bullet.setDepth(15);
    bullet.body.setAllowGravity(false);
    bullet.body.setSize(6, 6, true);
    bullet.setVelocity(dir.x * speed, dir.y * speed);
    bullet.setData('damage', this.def.damage);

    // giro contínuo no ar — puro visual (rotation), não mexe na velocity
    scene.tweens.add({
      targets: bullet,
      rotation: Math.PI * 2,
      duration: SPIN_DURATION_MS,
      repeat: -1,
      ease: 'Linear'
    });

    scene.time.delayedCall(BULLET_LIFETIME_MS, () => bullet.destroy());
  }

  /**
   * Desenha (uma única vez, com Graphics + generateTexture) a textura do
   * shuriken: 4 pontas partindo de um núcleo — silhueta reconhecível de
   * "estrela ninja" mesmo pequena e girando rápido. Cacheada em
   * scene.textures, gerada só no primeiro arremesso da run.
   */
  _ensureTexture(scene) {
    const key = 'fx_shuriken';
    if (scene.textures.exists(key)) return key;

    const s = SHURIKEN_TEX_SIZE;
    const c = s / 2;
    const g = scene.add.graphics();

    g.fillStyle(SHURIKEN_COLOR, 1);
    // 4 pontas (losangos) em cruz, cada uma desenhada como um triângulo
    // saindo do centro até a borda, alternando entre eixo X e Y
    const tip = s * 0.5;
    const wing = s * 0.16;
    [
      [c, c - tip, c - wing, c - wing, c + wing, c - wing], // ponta de cima
      [c, c + tip, c - wing, c + wing, c + wing, c + wing], // ponta de baixo
      [c - tip, c, c - wing, c - wing, c - wing, c + wing], // ponta da esquerda
      [c + tip, c, c + wing, c - wing, c + wing, c + wing] // ponta da direita
    ].forEach(([x1, y1, x2, y2, x3, y3]) => g.fillTriangle(x1, y1, x2, y2, x3, y3));

    g.fillStyle(0x1a1a22, 1);
    g.fillCircle(c, c, s * 0.14);

    g.generateTexture(key, s, s);
    g.destroy();
    return key;
  }
}
