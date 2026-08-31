import Weapon from './Weapon.js';
import RangedWeapon from './RangedWeapon.js';

/**
 * Dono do cooldown e dos stat mods (dano/alcance/cooldown) que vêm do
 * RunState. Player só chama tryAttack() automaticamente todo frame (o
 * ataque é 100% automático — o jogador só controla o movimento); toda a
 * matemática de upgrade e o disparo em si ficam isolados aqui.
 *
 * Ponto de extensão pra novas armas: cada `def.type` em data/weapons.js
 * mapeia pra uma classe que implementa fire(scene, player, enemyGroup,
 * statMods). Hoje só existem "melee" (Weapon) e "ranged" (RangedWeapon);
 * uma arma nova só precisa de uma entrada em data/weapons.js e, se o
 * `type` já existir, nem precisa de código novo aqui.
 */
// "Fragmentação" (pistol_fragmentation): cadência de tiro mais lenta em
// troca do leque de projéteis (ver RangedWeapon._fireFragmentationVolley)
// — cooldown do tiro mais que dobra enquanto a carta estiver ativa.
const FRAGMENTATION_COOLDOWN_MULTIPLIER = 2.4;

export default class WeaponManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.Physics.Arcade.Group} enemyGroup
   * @param {Array} weaponDefs - data/weapons.js
   * @param {import('../roguelike/RunState.js').default} runState
   * @param {string} [weaponId] - arma escolhida na WeaponSelectScene; cai
   *   para a primeira do array se não vier (ex.: ao pular a tela de escolha)
   */
  constructor(scene, enemyGroup, weaponDefs, runState, weaponId) {
    this.scene = scene;
    this.enemyGroup = enemyGroup;
    this.runState = runState;
    const def = weaponDefs.find((w) => w.id === weaponId) || weaponDefs[0];
    this.currentWeapon = def.type === 'ranged' ? new RangedWeapon(def) : new Weapon(def);
    this.lastAttackMs = 0;
  }

  /** Chamado todo frame por Player.update() — o cooldown interno decide se ataca de fato. */
  tryAttack(player) {
    const now = this.scene.time.now;
    // quantidade de cópias já pegas da carta exclusiva "pistol_fragmentation"
    // — 0 se não obtida (RangedWeapon.js ignora se a arma não for a pistola)
    const fragmentationStacks = this.runState.upgradeCounts.pistol_fragmentation || 0;
    let cooldown = this.currentWeapon.def.cooldownMs * (1 - this.runState.cooldownMultiplier);
    // tiro fica mais lento em troca do leque de projéteis (ver
    // RangedWeapon._fireFragmentationVolley) — aplicado por cima do
    // cooldown normal, não substitui os outros multiplicadores
    if (fragmentationStacks > 0) cooldown *= FRAGMENTATION_COOLDOWN_MULTIPLIER;

    if (now - this.lastAttackMs < cooldown) return;

    const fired = this.currentWeapon.fire(this.scene, player, this.enemyGroup, {
      damageMultiplier: this.runState.damageMultiplier,
      rangeMultiplier: this.runState.rangeMultiplier,
      // quantidade de cópias já pegas da carta exclusiva "katana_double"
      // (unlockAbility: doubleStrike), até 4 — Weapon.js usa isso pra saber
      // quantos cortes totais dar no golpe (2 por cópia: 1 cópia = 2 cortes,
      // igual sempre foi; 4 cópias = 8, quase uma estrela/lótus ao redor do
      // jogador). Ignorado se a arma não for a katana.
      doubleStrikeStacks: this.runState.upgradeCounts.katana_double || 0,
      // true só depois da evolução "Dança de Cortes" (katana_double, 4
      // cópias) — Weapon.js ignora se a arma não for a katana; estiliza
      // os 4 cortes rápidos do combo em vermelho e amplia o 5º golpe
      // (ver Weapon._swingStyle)
      danceOfCuts: this.runState.unlockedAbilities.has('danceOfCuts'),
      // true só depois da evolução "Instinto Caçador" (Visão Aguçada,
      // pistola); RangedWeapon.js ignora este campo se a arma não for a
      // pistola (só ela usa RangedWeapon pra começo de conversa)
      chainShot: this.runState.unlockedAbilities.has('chainShot'),
      // config da "Fragmentação" (pistol_fragmentation) ou null se não
      // obtida; RangedWeapon.js ignora se a arma não for a pistola. 1
      // cópia = 3 projéteis no leque, cada cópia extra soma +1 (máx. 4
      // cópias = 6, ver data/upgrades.js maxStacks)
      fragmentation: fragmentationStacks > 0 ? { pelletCount: fragmentationStacks + 2 } : null,
      // true só depois da evolução "SMARTSHOT" (Fragmentação, pistola);
      // RangedWeapon.js ignora se a arma não for a pistola
      smartShot: this.runState.unlockedAbilities.has('smartShot'),
      // config da evolução "Corte Fantasma" (Visão Aguçada, katana) ou null
      // se não obtida; Weapon.js ignora se a arma não for a katana (shape
      // "line", só ela chama _fireLine/_applyStrayHits)
      strayHits: this.runState.strayHitsMaxTargets > 0
        ? {
            chance: this.runState.strayHitsChance,
            radius: this.runState.strayHitsRadius,
            maxTargets: this.runState.strayHitsMaxTargets
          }
        : null,
      // config da evolução "Reflexos de Predador" (Visão Aguçada, punhos)
      // ou null se não obtida; Weapon.js ignora se a arma não for os
      // punhos (shape "arc", só ela chama _fireArc)
      bulletTime: this.runState.bulletTimeChance > 0
        ? { chance: this.runState.bulletTimeChance, durationMs: this.runState.bulletTimeDurationMs }
        : null
    });

    // armas melee sempre "golpeiam" (fire() não retorna nada -> truthy);
    // armas à distância podem devolver false quando não há alvo no
    // alcance, e nesse caso não queremos gastar o cooldown à toa.
    if (fired !== false) this.lastAttackMs = now;
  }
}
