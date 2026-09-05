export default [
  {
    "id": "grunt",
    "name": "Grunt",
    "sprite": "enemy",
    "hp": 20,
    "speed": 60,
    "contactDamage": 6,
    "contactCooldownMs": 900,
    "xpReward": 8,
    "color": 15680580,
    "flocking": { "seek": 1.0, "cohesion": 0.35, "separation": 0.9, "density": 0.6 }
  },
  {
    "id": "cyber_hound",
    "name": "CyberHound (Runner)",
    "sprite": "enemy",
    "hp": 8,
    "speed": 120,
    "contactDamage": 5,
    "contactCooldownMs": 800,
    "xpReward": 4,
    "color": 11526834,
    "minSpawnTimeMs": 35000,
    "flocking": { "seek": 1.3, "cohesion": 0.1, "separation": 0.6, "density": 1.0 }
  },
  {
    "id": "cyber_brute",
    "name": "CyberBrute (Tank)",
    "sprite": "enemy",
    "hp": 50,
    "speed": 42,
    "contactDamage": 16,
    "contactCooldownMs": 1000,
    "xpReward": 20,
    "color": 6045240,
    "minSpawnTimeMs": 60000,
    "flocking": { "seek": 0.9, "cohesion": 0.5, "separation": 0.4, "density": 0.15 }
  },
  {
    "id": "exploder",
    "name": "Exploder",
    "sprite": "enemy",
    "hp": 14,
    "speed": 45,
    "contactDamage": 5,
    "contactCooldownMs": 900,
    "xpReward": 26,
    "color": 16737792,
    "minSpawnTimeMs": 90000,
    "flocking": { "seek": 1.0, "cohesion": 0.3, "separation": 0.7, "density": 0.5 },
    "explodes": true,
    "explodeChargeRadius": 200,
    "explodeChargeSpeedMultiplier": 4.4,
    "explodeTriggerRadius": 55,
    "explodePrepMs": 400,
    "explodeRadius": 75,
    "explodeDamage": 20
  },
  {
    "id": "elite",
    "name": "Elite",
    "sprite": "enemy",
    "hp": 455,
    "speed": 60,
    "contactDamage": 22,
    "contactCooldownMs": 900,
    "xpReward": 120,
    "color": 16711884,
    "scale": 2.0,
    "flocking": { "seek": 1.0, "cohesion": 0.4, "separation": 0.5, "density": 0.2 },
    "elite": true,
    // 0..1: força final do knockback = force * knockbackResistance (ver
    // Enemy.applyKnockback) — 1 é knockback normal, quanto MENOR, menos
    // ele sente. Elite é pesado, quase não se move com o empurrão.
    "knockbackResistance": 0.15,
    "eliteAttackIntervalMs": 4500,
    "eliteMeleeRange": 90,
    "eliteMeleeTelegraphMs": 500,
    "eliteMeleeDamage": 35,
    "eliteMeleeCooldownMs": 3500,
    // instante (ms) dentro de elitepunchsound.mp3 em que o soco realmente
    // "conecta" (pico de amplitude do áudio, analisado à parte) — é o que
    // cronometra o dano do corpo a corpo, não a duração total do arquivo
    // (ver Enemy._startEliteMeleeSwing)
    "eliteMeleePunchImpactMs": 680,
    "eliteMissileCount": 5,
    "eliteMissileSpreadRadius": 140,
    "eliteMissileRadius": 70,
    "eliteMissileStepGapMs": 350,
    "eliteMissileWarnAfterMs": 550,
    "eliteMissileDamage": 30
  },
  {
    "id": "sealer",
    "name": "Fechador de Arena (Sealer)",
    "sprite": "enemy",
    "hp": 140,
    "speed": 55,
    "contactDamage": 6,
    "contactCooldownMs": 1000,
    "xpReward": 60,
    "color": 10170623,
    "minSpawnTimeMs": 150000,
    "flocking": { "seek": 0, "cohesion": 0, "separation": 0.2, "density": 0 },
    "sealer": true,
    "scale": 1.6,
    "arenaStartRadius": 650,
    "arenaMinRadius": 110,
    "arenaShrinkDurationMs": 60000,
    "arenaCrushDamagePerSecond": 10
  },
  {
    "id": "minotaur",
    "name": "Minotauro",
    "sprite": "enemy",
    "hp": 3000,
    "speed": 65,
    "contactDamage": 40,
    "contactCooldownMs": 800,
    "xpReward": 500,
    "color": 9127187,
    "scale": 3.2,
    "flocking": { "seek": 1.0, "cohesion": 0, "separation": 0.3, "density": 0 },
    "boss": true,
    // Boss é bem mais pesado que o Elite (knockbackResistance 0.15) —
    // quase não sente empurrão nenhum.
    "knockbackResistance": 0.05
  }
]
;