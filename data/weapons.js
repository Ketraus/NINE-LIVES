export default [
  {
    "id": "fists",
    "name": "Punhos",
    "description": "Corpo a corpo puro: curto alcance, mas dano alto e impacto forte.",
    "type": "melee",
    "shape": "arc",
    "damage": 8,
    "range": 44,
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
    "description": "Golpes em arco na direção que você está olhando, cortando vários inimigos ao seu redor. Recarga lenta, mas dano e alcance altos.",
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
    "comboDelayMs": 90
  },
  {
    "id": "pistol",
    "name": "Pistola",
    "description": "Dispara em inimigos próximos. Menos dano, mas alcance bem maior.",
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
