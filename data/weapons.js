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
    "description": "Corte reto e largo na direção que você está olhando, atravessando vários inimigos alinhados de uma vez. Recarga lenta, mas dano e alcance altos.",
    "type": "melee",
    "shape": "line",
    "damage": 24,
    "range": 100,
    "lineWidth": 46,
    "cooldownMs": 650,
    "fxTint": 0xcfe8ff,
    "fxDurationMs": 240,
    "knockback": 240
  },
  {
    "id": "pistol",
    "name": "Pistola",
    "description": "Dispara em inimigos próximos. Menos dano, mas alcance bem maior.",
    "type": "ranged",
    "damage": 5,
    "range": 220,
    "cooldownMs": 480,
    "projectileSpeed": 380,
    "projectileTint": 0xfff07a,
    "knockback": 110
  }
]
;
