import Weapon from './Weapon.js';
import RangedWeapon from './RangedWeapon.js';

// Dono do cooldown e dos stat mods (dano/alcance/cooldown) que vêm do
// "Fragmentação" (pistol_fragmentation): cadência de tiro mais lenta em
const FRAGMENTATION_COOLDOWN_MULTIPLIER = 2.4;

export default class WeaponManager {
  // para a primeira do array se não vier (ex.: ao pular a tela de escolha)
  constructor(scene, enemyGroup, weaponDefs, runState, weaponId) {
    this.scene = scene;
    this.enemyGroup = enemyGroup;
    this.runState = runState;
    const def = weaponDefs.find((w) => w.id === weaponId) || weaponDefs[0];
    this.currentWeapon = def.type === 'ranged' ? new RangedWeapon(def) : new Weapon(def);
    this.lastAttackMs = 0;
  }

  // Chamado todo frame por Player.update() — o cooldown interno decide se…
  tryAttack(player) {
    const now = this.scene.time.now;
    // quantidade de cópias já pegas da carta exclusiva "pistol_fragmentatio…
    const fragmentationStacks = this.runState.upgradeCounts.pistol_fragmentation || 0;
    let cooldown = this.currentWeapon.def.cooldownMs * (1 - this.runState.cooldownMultiplier);
    // tiro fica mais lento em troca do leque de projéteis (ver
    if (fragmentationStacks > 0) cooldown *= FRAGMENTATION_COOLDOWN_MULTIPLIER;

    if (now - this.lastAttackMs < cooldown) return;

    const fired = this.currentWeapon.fire(this.scene, player, this.enemyGroup, {
      damageMultiplier: this.runState.damageMultiplier,
      rangeMultiplier: this.runState.rangeMultiplier,
      // quantidade de cópias já pegas da carta exclusiva "katana_double"
      doubleStrikeStacks: this.runState.upgradeCounts.katana_double || 0,
      // true só depois da evolução "Dança de Cortes" (katana_double, 4
      danceOfCuts: this.runState.unlockedAbilities.has('danceOfCuts'),
      // true só depois da evolução "Instinto Caçador" (Visão Aguçada,
      chainShot: this.runState.unlockedAbilities.has('chainShot'),
      // config da "Fragmentação" (pistol_fragmentation) ou null se não
      fragmentation: fragmentationStacks > 0 ? { pelletCount: fragmentationStacks + 2 } : null,
      // true só depois da evolução "SMARTSHOT" (Fragmentação, pistola);
      smartShot: this.runState.unlockedAbilities.has('smartShot'),
      // config da evolução "Corte Fantasma" (Visão Aguçada, katana) ou null
      strayHits: this.runState.strayHitsMaxTargets > 0
        ? {
            chance: this.runState.strayHitsChance,
            radius: this.runState.strayHitsRadius,
            maxTargets: this.runState.strayHitsMaxTargets
          }
        : null,
      // config da evolução "Reflexos de Predador" (Visão Aguçada, punhos)
      bulletTime: this.runState.bulletTimeChance > 0
        ? { chance: this.runState.bulletTimeChance, durationMs: this.runState.bulletTimeDurationMs }
        : null
    });

    // armas melee sempre "golpeiam" (fire() não retorna nada -> truthy);
    if (fired !== false) this.lastAttackMs = now;
  }
}
