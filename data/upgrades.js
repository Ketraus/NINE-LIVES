export default [
  // ---------- cartas base: qualquer classe pode receber ----------
  {
    "id": "dmg_up",
    "name": "Overclock",
    "description": "+20% de dano de ataque",
    "category": "base",
    "rarity": "common",
    "type": "damageMultiplier",
    "value": 0.2,
    "evolvesInto": "dmg_up_evo_overcharge"
  },
  {
    "id": "speed_up",
    "name": "Patas Turbo",
    "description": "+15% de velocidade de movimento",
    "category": "base",
    "rarity": "common",
    "type": "speedMultiplier",
    "value": 0.15,
    "evolvesInto": "speed_up_evo_tornado"
  },
  {
    "id": "hp_up",
    "name": "Nove Vidas",
    "description": "+20% de vida máxima (e cura)",
    "category": "base",
    "rarity": "common",
    "type": "maxHpPercentBonus",
    "value": 0.2,
    "evolvesInto": "hp_up_evo_colosso"
  },
  {
    "id": "cooldown_down",
    "name": "Reflexo Felino",
    "description": "-15% no tempo de recarga do ataque",
    "category": "base",
    "rarity": "common",
    "type": "cooldownMultiplier",
    "value": 0.15,
    "evolvesInto": "cooldown_down_evo_sixth_sense"
  },
  {
    "id": "range_up",
    "name": "Visão Aguçada",
    "description": "+20% no alcance do ataque",
    "category": "base",
    "rarity": "common",
    "type": "rangeMultiplier",
    "value": 0.2,
    "evolvesInto": "range_up_evo_hunter_instinct"
  },
  {
    "id": "thorns_up",
    "name": "Pelo Condutor",
    "description": "+4 de dano de contra-ataque ao ser atingido",
    "category": "base",
    "rarity": "common",
    "type": "thornsDamage",
    "value": 4,
    "evolvesInto": "thorns_up_evo_sobrecarga"
  },
  {
    "id": "armor_up",
    "name": "Blindagem",
    "description": "-10% de dano recebido por cópia",
    "category": "base",
    "rarity": "common",
    "type": "damageReductionFraction",
    "value": 0.1,
    "evolvesInto": "armor_up_evo_shield"
  },

  // ---------- cartas base épicas: raras de aparecer, qualquer classe pode
  // receber (ver RunManager._pickWeightedUpgrades pro peso de sorteio) ----------
  {
    "id": "arsenal_expandido",
    "name": "Arsenal Expandido",
    "description": "+1 ao limite máximo de cartas por cópia (máx. 3 cópias).",
    "category": "base",
    "rarity": "epic",
    "maxStacks": 3,
    "type": "maxCardSlotsBonus",
    "value": 1
  },
  {
    "id": "lifesteal_up",
    "name": "Sanguessuga",
    "description": "5% do dano causado pelo jogador é convertido em HP (máx. 3 cópias).",
    "category": "base",
    "rarity": "epic",
    "maxStacks": 3,
    "type": "lifestealFraction",
    "value": 0.05
  },
  {
    "id": "dog_purify",
    "name": "Purificação",
    "description": "Ao ser obtida, um cachorro infectado é purificado e se torna seu aliado: segue você e ataca outros inimigos. Cada cópia soma +1 cachorro aliado (máx. 3).",
    "category": "base",
    "rarity": "epic",
    "maxStacks": 3,
    "type": "unlockAbility",
    "abilityId": "allyDog",
    "speed": 150,
    "engageRadius": 260,
    "contactRange": 28,
    "damage": 6,
    "cooldownMs": 700
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
    "rarity": "rare",
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
    "rarity": "rare",
    "weaponId": "katana",
    "type": "unlockAbility",
    "abilityId": "doubleStrike"
  },
  {
    "id": "pistol_drone",
    "name": "GatoDrone",
    "description": "Um drone acompanha você e dispara sozinho nos inimigos (ataque mais lento). Cada cópia soma +1 drone (máx. 3).",
    "category": "exclusive",
    "rarity": "rare",
    "weaponId": "pistol",
    "maxStacks": 3,
    "type": "unlockAbility",
    "abilityId": "drone",
    "cooldownMs": 900,
    "damage": 4,
    "range": 200,
    "projectileSpeed": 320
  },

  // ---------- evoluções: nunca aparecem entre as 3 opções normais, só ----------
  // sozinhas via evento 'evolution-ready' quando a carta base (`evolvesFrom`)
  // completa EVOLUTION_STACK_THRESHOLD cópias (ver RunManager). `effects` é
  // uma lista porque uma evolução costuma dar mais de um bônus de uma vez.
  {
    "id": "hp_up_evo_colosso",
    "name": "COLOSSO",
    "description": "+150% de vida máxima, -50% de velocidade de movimento, +100% de tamanho do corpo.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "hp_up",
    "type": "evolution",
    "effects": [
      { "type": "maxHpPercentBonus", "value": 1.5 },
      { "type": "sizeMultiplier", "value": 1.0 },
      { "type": "speedMultiplier", "value": -0.5 }
    ]
  },
  {
    "id": "dmg_up_evo_overcharge",
    "name": "Overcharge",
    "description": "20% de chance de paralisar o inimigo por 800ms ao acertar.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "dmg_up",
    "type": "evolution",
    // mesmo id/efeito pra qualquer arma — só o nome muda conforme a arma
    // escolhida na run (ver RunManager._resolveEvolutionName). Sem entrada
    // pra uma arma nova aqui, cai no `name` acima ("Overcharge") como
    // fallback.
    "namesByWeapon": {
      "fists": "Impacto Paralisante",
      "katana": "Corte Neural",
      "pistol": "Munição EM"
    },
    "effects": [
      { "type": "paralyzeOnHit", "chance": 0.2, "durationMs": 800 }
    ]
  },
  {
    "id": "speed_up_evo_tornado",
    "name": "Vórtice Turbo",
    "description": "Ao andar, você gera tornados fixos que causam dano em área a cada 2,5s de caminhada (duram 1,5s e acertam vários inimigos ao mesmo tempo).",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "speed_up",
    "type": "evolution",
    "effects": [
      {
        "type": "unlockAbility",
        "abilityId": "tornadoWalk",
        // intervalo de tempo ANDANDO (não tempo real) pra gerar 1 tornado —
        // ver TornadoAbility._advanceWalkTimer
        "cooldownMs": 2500,
        "durationMs": 1500,
        "damage": 3,
        "tickIntervalMs": 400,
        "radius": 34
      }
    ]
  },
  {
    "id": "thorns_up_evo_sobrecarga",
    "name": "Sobrecarga",
    "description": "Uma aura de choque envolve você: qualquer inimigo dentro dela toma 4 de dano a cada 200ms, além do dano de contato e dos espinhos normais.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "thorns_up",
    "type": "evolution",
    "effects": [
      {
        "type": "unlockAbility",
        "abilityId": "auraShock",
        "tickIntervalMs": 200,
        "damage": 4,
        // "bem pequena": pouco maior que o raio de contato do jogador
        // (sprite de 28px), só pra pegar quem já está grudado nele
        "radius": 22
      }
    ]
  },
  {
    "id": "armor_up_evo_shield",
    "name": "Escudo Energético",
    "description": "Um escudo recarregável envolve você e absorve dano antes da sua vida. Depois de alguns segundos sem ser atingido, ele recarrega sozinho.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "armor_up",
    "type": "evolution",
    "effects": [
      {
        "type": "unlockAbility",
        "abilityId": "energyShield",
        // pontos de escudo, absorvidos antes da vida (ver ShieldSystem)
        "maxShield": 25,
        // tempo sem tomar dano até começar a recarregar (ver ShieldSystem.update)
        "rechargeDelayMs": 4000,
        // pontos de escudo recuperados por segundo, uma vez que a recarga começa
        "rechargeRatePerSec": 12
      }
    ]
  },
  {
    "id": "range_up_evo_hunter_instinct",
    "name": "Instinto Caçador",
    "description": "O tiro perfura o primeiro inimigo atingido e salta para o inimigo mais próximo dele.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "range_up",
    "type": "evolution",
    // por enquanto só faz sentido pra pistola (o efeito mexe direto no
    // projétil, ver RangedWeapon._ensureBulletGroup) — katana e punhos
    // ainda não têm ideia decidida pra evolução de Visão Aguçada. Com
    // `weaponId` aqui, RunManager._findPendingEvolution não oferece esta
    // evolução pra quem não é pistola: a carta base continua empilhando
    // normalmente (+20% de alcance por cópia) até uma evolução própria
    // ser criada pra elas.
    "weaponId": "pistol",
    "effects": [
      { "type": "unlockAbility", "abilityId": "chainShot" }
    ]
  },
  {
    "id": "cooldown_down_evo_sixth_sense",
    "name": "Sexto Sentido",
    "description": "20% de chance de desviar completamente de um ataque — ao desviar, você fica momentaneamente transparente.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "cooldown_down",
    "type": "evolution",
    "effects": [
      { "type": "dodgeChance", "value": 0.2 }
    ]
  }
]
;
