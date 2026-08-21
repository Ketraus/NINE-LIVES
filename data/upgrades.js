export default [
  // ---------- cartas base: qualquer classe pode receber ----------
  {
    "id": "dmg_up",
    "name": "Overclock",
    "description": "+20% de dano de ataque",
    "category": "base",
    "type": "damageMultiplier",
    "value": 0.2
  },
  {
    "id": "speed_up",
    "name": "Patas Turbo",
    "description": "+15% de velocidade de movimento",
    "category": "base",
    "type": "speedMultiplier",
    "value": 0.15
  },
  {
    "id": "hp_up",
    "name": "Nove Vidas",
    "description": "+20% de vida máxima (e cura)",
    "category": "base",
    "type": "maxHpPercentBonus",
    "value": 0.2,
    "evolvesInto": "hp_up_evo_colosso"
  },
  {
    "id": "cooldown_down",
    "name": "Reflexo Felino",
    "description": "-15% no tempo de recarga do ataque",
    "category": "base",
    "type": "cooldownMultiplier",
    "value": 0.15
  },
  {
    "id": "range_up",
    "name": "Visão Aguçada",
    "description": "+20% no alcance do ataque",
    "category": "base",
    "type": "rangeMultiplier",
    "value": 0.2
  },
  {
    "id": "thorns_up",
    "name": "Pelo Condutor",
    "description": "+4 de dano de contra-ataque ao ser atingido",
    "category": "base",
    "type": "thornsDamage",
    "value": 4
  },

  // ---------- cartas exclusivas: só aparecem pra quem escolheu a arma ----------
  // Todas usam type "unlockAbility": RunState.applyUpgrade só registra o
  // abilityId; quem dá vida à habilidade é AbilityManager (soco/drone) ou,
  // no caso da katana, um flag lido direto por Weapon.js. Cada uma só pode
  // ser oferecida uma vez (RunManager filtra pelas já desbloqueadas).
  {
    "id": "fists_slam",
    "name": "Pancada Sísmica",
    "description": "A cada poucos segundos, um golpe forte em área ao seu redor.",
    "category": "exclusive",
    "weaponId": "fists",
    "type": "unlockAbility",
    "abilityId": "slam",
    "cooldownMs": 3000,
    "damage": 26,
    "radius": 90
  },
  {
    "id": "katana_double",
    "name": "Corte Duplo",
    "description": "Seus ataques de katana golpeiam para os dois lados de uma vez.",
    "category": "exclusive",
    "weaponId": "katana",
    "type": "unlockAbility",
    "abilityId": "doubleStrike"
  },
  {
    "id": "pistol_drone",
    "name": "GatoDrone",
    "description": "Um drone acompanha você e dispara sozinho nos inimigos (ataque mais lento).",
    "category": "exclusive",
    "weaponId": "pistol",
    "type": "unlockAbility",
    "abilityId": "drone",
    "cooldownMs": 900,
    "damage": 4,
    "range": 200,
    "projectileSpeed": 320
  },

  // ---------- evoluções: nunca aparecem entre as 3 opções normais, só ----------
  // sozinhas via evento 'evolution-ready' quando a carta base (`evolvesFrom`)
  // completa 3 cópias (ver RunManager). `effects` é uma lista porque uma
  // evolução costuma dar mais de um bônus de uma vez.
  {
    "id": "hp_up_evo_colosso",
    "name": "COLOSSO",
    "description": "+150% de vida máxima, -50% de velocidade de movimento, +100% de tamanho do corpo.",
    "category": "evolution",
    "evolvesFrom": "hp_up",
    "type": "evolution",
    "effects": [
      { "type": "maxHpPercentBonus", "value": 1.5 },
      { "type": "sizeMultiplier", "value": 1.0 },
      { "type": "speedMultiplier", "value": -0.5 }
    ]
  }
]
;
