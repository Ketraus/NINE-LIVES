export default [
  {
    "id": "fists",
    "name": "Paws",
    "description": "Corpo a corpo puro, curto alcance, dano alto e impacto forte.",
    "type": "melee",
    "shape": "arc",
    "damage": 8,
    "range": 65,
    "arcDegrees": 140,
    "cooldownMs": 200,
    "fxTint": 0xffb199,
    "fxDurationMs": 100,
    "cameraShake": 0.0025,
    "knockback": 420
  },
  {
    "id": "katana",
    "name": "Katana",
    "description": "Golpes em arco, corte vários inimigos ao seu redor.",
    "type": "melee",
    "shape": "sword",
    "damage": 24,
    "range": 80,
    "arcDegrees": 100,
    "cooldownMs": 950,
    "fxTint": 0xcfe8ff,
    "fxDurationMs": 200,
    "cameraShake": 0.0018,
    "knockback": 240,
    // Corte Duplo (katana_double): desvio angular e atraso entre os
    // golpes sequenciais do combo — ver Weapon._fireSword
    "comboOffsetDeg": 24,
    "comboDelayMs": 90,
    // Dança de Cortes (evolução de Corte Duplo): cor dos 4 cortes rápidos
    // do combo + como o 5º golpe (o "finalizador") se destaca deles —
    // ver Weapon._swingStyle
    "danceCutTint": 0xff2b2b,
    "danceFinisher": {
      "rangeMultiplier": 1.35,
      "arcDegreesBonus": 30,
      "fxDurationMultiplier": 1.6,
      "knockbackMultiplier": 1.8,
      "cameraShakeMultiplier": 3
    }
  },
  {
    "id": "pistol",
    "name": "Laser Gun",
    "description": "Dispara em inimigos próximos.",
    "type": "ranged",
    "damage": 5,
    "range": 220,
    "cooldownMs": 480,
    "projectileSpeed": 640,
    "projectileTint": 0x4fd1ff,
    "knockback": 110
  }
]
;
