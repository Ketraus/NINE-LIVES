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
    "evolvesAtStacks": 3,
    "evolvesInto": "arsenal_expandido_evo_override",
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
    "evolvesAtStacks": 3,
    "evolvesInto": "lifesteal_up_evo_hemorrhage",
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
    // teto de cópias (3) É o próprio limiar de evolução — diferente de
    // GatoDrone/Pancada Sísmica (evoluem na 4ª, maxStacks 4), Purificação
    // evolui exatamente ao completar as 3 cópias pedidas
    "evolvesAtStacks": 3,
    "evolvesInto": "dog_purify_evo_cyberus",
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
    "description": "A cada poucos segundos, um golpe forte em área ao seu redor. Cada cópia deixa o golpe mais frequente (máx. 4).",
    "category": "exclusive",
    "rarity": "rare",
    "weaponId": "fists",
    // teto igual ao das outras raras (GatoDrone): 4 cópias — evolução em
    // Terremoto (ver fists_slam_evo_terremoto) na 4ª, igual GatoDrone/CatForce
    "maxStacks": 4,
    "evolvesAtStacks": 4,
    "evolvesInto": "fists_slam_evo_terremoto",
    "type": "unlockAbility",
    "abilityId": "slam",
    "cooldownMs": 3000,
    "damage": 20,
    "radius": 90
  },
  {
    "id": "fists_shockwave",
    "name": "Shockwave",
    "description": "A cada 3s, seus punhos disparam sozinhos uma onda de choque na direção que você está olhando, causando pouco dano aos inimigos atingidos (área pequena). Cada cópia soma mais uma onda disparada junto, um pouco mais aberta que a anterior (máx. 4).",
    "category": "exclusive",
    "rarity": "rare",
    "weaponId": "fists",
    "maxStacks": 4,
    // evolução na 4ª cópia (mesmo padrão de GatoDrone/Pancada Sísmica)
    "evolvesAtStacks": 4,
    "evolvesInto": "fists_shockwave_evo_blastix",
    "type": "unlockAbility",
    "abilityId": "shockwave",
    "cooldownMs": 3000,
    "damage": 10,
    "width": 56,
    "distance": 280,
    "speed": 560
  },
  {
    "id": "katana_double",
    "name": "Corte Duplo",
    "description": "Sua katana passa a golpear em uma sequência de cortes, alternando os lados. Cada cópia soma mais um golpe ao combo (máx. 4).",
    "category": "exclusive",
    "rarity": "rare",
    "weaponId": "katana",
    "maxStacks": 4,
    "evolvesAtStacks": 4,
    "evolvesInto": "katana_double_evo_danca_cortes",
    "type": "unlockAbility",
    "abilityId": "doubleStrike"
  },
  {
    "id": "katana_shuriken",
    "name": "Shuriken",
    "description": "Arremessa uma shuriken a cada 3s contra um inimigo próximo. Cada cópia soma mais uma shuriken na rajada, cada uma mirando um alvo diferente (máx. 4).",
    "category": "exclusive",
    "rarity": "rare",
    "weaponId": "katana",
    "maxStacks": 4,
    "evolvesAtStacks": 4,
    "evolvesInto": "katana_shuriken_evo_shurivex",
    "type": "unlockAbility",
    "abilityId": "shuriken",
    "cooldownMs": 3000,
    "damage": 10,
    "range": 260,
    "projectileSpeed": 380
  },
  {
    "id": "pistol_drone",
    "name": "GatoDrone",
    "description": "Um drone acompanha você e dispara sozinho nos inimigos (ataque mais lento). Cada cópia soma +1 drone (máx. 4).",
    "category": "exclusive",
    "rarity": "rare",
    "weaponId": "pistol",
    "maxStacks": 4,
    // teto de cópias precisou subir pra 4: evolução de carta rara/exclusiva
    // dispara na 4ª cópia (evolvesAtStacks), não na 3ª — com maxStacks
    // menor que o limiar a carta sumiria do pool antes de chegar lá (ver
    // RunManager._getAvailableUpgrades)
    "evolvesAtStacks": 4,
    "evolvesInto": "pistol_drone_evo_catforce",
    "type": "unlockAbility",
    "abilityId": "drone",
    "cooldownMs": 900,
    "damage": 4,
    "range": 200,
    "projectileSpeed": 320
  },
  {
    "id": "pistol_fragmentation",
    "name": "Fragmentação",
    "description": "Sua pistola vira uma escopeta: dispara 3 projéteis ao mesmo tempo, cada um numa direção levemente diferente. Cada projétil causa menos dano e tem alcance reduzido, mas acertar mais de um no mesmo inimigo soma o dano total — em troca, o disparo fica mais lento. Cada cópia soma mais um projétil ao leque (máx. 4).",
    "category": "exclusive",
    "rarity": "rare",
    "weaponId": "pistol",
    // última carta exclusiva do jogo: não evolui (sem evolvesAtStacks/
    // evolvesInto) — o comportamento em si já é lido por stacks direto em
    // WeaponManager/RangedWeapon.js, mesmo padrão de katana_double
    // (doubleStrike), então não passa pelo AbilityManager
    "maxStacks": 4,
    "type": "unlockAbility",
    "abilityId": "fragmentation"
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
    "id": "arsenal_expandido_evo_override",
    "name": "ARSENAL OVERRIDE",
    "description": "Uma carta \"Restock\" passa a aparecer ao lado do baralho de opções: use-a pra sortear novamente as cartas oferecidas no level-up.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "arsenal_expandido",
    "type": "evolution",
    "effects": [
      { "type": "unlockRestock" }
    ]
  },
  {
    "id": "lifesteal_up_evo_hemorrhage",
    "name": "Hemorragia",
    "description": "Seus ataques causam Sangramento: o alvo sofre 25% do dano do ataque a cada 0,5s, durante 3s. Não gera cura da Sanguessuga; reaplicar reinicia a duração (não acumula).",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "lifesteal_up",
    "type": "evolution",
    "effects": [
      {
        "type": "unlockBleed",
        "fraction": 0.25,
        "tickIntervalMs": 500,
        "durationMs": 3000
      }
    ]
  },
  {
    "id": "katana_shuriken_evo_shurivex",
    "name": "Shurivex",
    "description": "Suas shurikens convergem no primeiro inimigo próximo e, ao acertar, cada uma salta pra um segundo alvo em vez de sumir. Rastro cyber roxo.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "katana_shuriken",
    "type": "evolution",
    "effects": [
      {
        "type": "upgradeAbility",
        "abilityId": "shuriken",
        "chainColor": 0xb26bff
      }
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
    "id": "range_up_evo_katana_stray",
    "name": "Corte Fantasma",
    "description": "Seus cortes ganham a chance de também acertar até 3 inimigos fora da faixa da espada, dentro de uma área ao seu redor.",
    "category": "evolution",
    "rarity": "epic",
    // segunda evolução possível de Visão Aguçada (ver range_up acima) — só
    // pra katana. RunManager._findEvolutionFor escolhe esta em vez de
    // "Instinto Caçador" (que tem weaponId "pistol") quando a arma da run
    // é katana; o campo `evolvesInto` de range_up continua apontando só
    // pra "Instinto Caçador" por documentação, mas não é mais o que decide
    // isso — quem decide é o `evolvesFrom`+`weaponId` daqui.
    "evolvesFrom": "range_up",
    "weaponId": "katana",
    "type": "evolution",
    "effects": [
      // chance rolada por inimigo próximo (fora da faixa do corte) a cada
      // golpe; radius é a partir do jogador, não infinito; maxTargets trava
      // em no máximo 3 acertos "avulsos" por golpe (ver Weapon._applyStrayHits)
      { "type": "strayHits", "chance": 0.35, "radius": 220, "maxTargets": 3 }
    ]
  },
  {
    "id": "range_up_evo_fists_bullet_time",
    "name": "Reflexos de Predador",
    "description": "7% de chance a cada soco de deixar os inimigos em câmera lenta por 1s — você continua se movendo normalmente.",
    "category": "evolution",
    "rarity": "epic",
    // terceira evolução possível de Visão Aguçada — só pra punhos (ver
    // comentário em range_up_evo_katana_stray acima sobre como a escolha
    // entre as três evoluções funciona)
    "evolvesFrom": "range_up",
    "weaponId": "fists",
    "type": "evolution",
    "effects": [
      // rolado a cada soco (ver Weapon._fireArc); SlowmoSystem só afeta a
      // velocidade dos inimigos (ver Enemy.chase) — o jogador nunca é tocado
      { "type": "bulletTimeOnAttack", "chance": 0.07, "durationMs": 1000 }
    ]
  },
  {
    "id": "pistol_drone_evo_catforce",
    "name": "CatForce 2.0",
    "description": "Os 4 drones passam a disparar lasers roxos que atravessam todos os inimigos no caminho. Dano e cadência de tiro continuam os mesmos.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "pistol_drone",
    "weaponId": "pistol",
    "type": "evolution",
    "effects": [
      // NÃO é unlockAbility: já existem até 4 drones ativos (GatoDrone
      // maxStacks: 4) — isto atualiza os que já existem em vez de somar um
      // 5º (ver RunManager._applyRuntimeEffect/_applyUpgrade e
      // AbilityManager._upgrade). Dano/cooldown/range/velocidade do
      // projétil ficam os mesmos de GatoDrone, só o visual e o perfuro
      // mudam (ver DroneAbility.upgrade)
      { "type": "upgradeAbility", "abilityId": "drone", "pierce": true, "laserColor": 0xb26bff }
    ]
  },
  {
    "id": "fists_shockwave_evo_blastix",
    "name": "Blastix",
    "description": "As ondas de choque agora explodem ao atingir um inimigo, causando dano aos inimigos próximos ao ponto de impacto.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "fists_shockwave",
    "weaponId": "fists",
    "type": "evolution",
    "effects": [
      // não é unlockAbility: já existe uma ÚNICA ShockwaveAbility ativa
      // (restack até 4 cópias) — isto melhora ela em vez de somar mais uma
      // (mesmo padrão de CatForce 2.0/Terremoto). Dano/cooldown/alcance da
      // onda em si continuam os mesmos; a explosão é só no IMPACTO (não
      // fica de área), com raio pequeno e fração do dano da onda.
      {
        "type": "upgradeAbility",
        "abilityId": "shockwave",
        "explosionRadius": 70,
        "explosionDamageFraction": 0.5
      }
    ]
  },
  {
    "id": "fists_slam_evo_terremoto",
    "name": "Terremoto",
    "description": "A Pancada Sísmica vira um tremor: área de impacto maior e, logo em seguida, uma onda de choque que arremessa os inimigos pra longe, causando dano em área.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "fists_slam",
    "weaponId": "fists",
    "type": "evolution",
    "effects": [
      // não é unlockAbility: já existe uma ÚNICA SlamAbility ativa
      // (restack até 4 cópias, ver AbilityManager._unlock) — isto melhora
      // ela em vez de somar mais uma (mesmo padrão de CatForce 2.0 no
      // drone, ver SlamAbility.upgrade). Dano e cooldown do impacto
      // principal continuam os mesmos de Pancada Sísmica; só a área do
      // impacto e a onda de choque secundária (nova) mudam. Balanceamento:
      // radiusMultiplier deixa a área ~40% maior; a onda de choque em si
      // cobre uma área bem maior ainda (2.2x o raio base), mas causa só
      // 45% do dano do impacto principal — ela empurra mais do que fere.
      {
        "type": "upgradeAbility",
        "abilityId": "slam",
        "radiusMultiplier": 1.4,
        "shockwaveRadiusMultiplier": 2.2,
        "shockwaveDamageFraction": 0.45,
        "shockwaveKnockback": 380,
        "shockwaveDelayMs": 160
      }
    ]
  },
  {
    "id": "katana_double_evo_danca_cortes",
    "name": "Dança de Cortes",
    "description": "Os cortes do combo ficam vermelho vivo, e o último golpe da sequência vem maior, mais forte e com um impacto avassalador.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "katana_double",
    "weaponId": "katana",
    "type": "evolution",
    "effects": [
      // não é unlockAbility de habilidade autônoma: doubleStrikeStacks já
      // é lido direto pelo WeaponManager (ver runState.upgradeCounts) —
      // isto só liga a flag que faz Weapon._fireSword estilizar o combo
      // (4 cortes vermelhos + 5º golpe ampliado, ver Weapon._swingStyle)
      { "type": "unlockAbility", "abilityId": "danceOfCuts" }
    ]
  },
  {
    "id": "dog_purify_evo_cyberus",
    "name": "Cyberus",
    "description": "Os 3 cachorros se fundem em Cyberus, um cão de 3 cabeças. A 1ª cabeça arremessa uma granada que deixa uma poça de chamas azuis com dano contínuo; a 2ª desfere um corte de espada em arco, num azul bem mais escuro; a 3ª dispara um laser roxo finíssimo e devastador, longo o bastante pra atravessar boa parte da tela.",
    "category": "evolution",
    "rarity": "epic",
    "evolvesFrom": "dog_purify",
    "type": "evolution",
    "effects": [
      // não é unlockAbility: já existem até 3 AllyDogAbility ativas
      // (dog_purify maxStacks: 3) — isto funde as 3 numa só (1 cachorro
      // maior e cinza) e liga as cabeças já prontas (granada + espada)
      // nela, ver AllyDogAbility.mergeOnUpgrade/upgrade/_updateSword.
      // Cabeça 3 fica pra depois.
      {
        "type": "upgradeAbility",
        "abilityId": "allyDog",
        "grenadeCooldownMs": 3500,
        "grenadeRange": 260,
        "grenadeDamage": 5,
        "grenadeTickIntervalMs": 500,
        "grenadeDurationMs": 4000,
        "grenadeRadius": 46,
        // 2ª cabeça: golpe de espada em arco (mesmo teste geométrico da
        // katana do jogador, ver Weapon._fireArc), só que num azul bem
        // mais escuro — cor de identidade desta cabeça
        "swordDamage": 14,
        "swordRange": 70,
        "swordArcDegrees": 100,
        "swordCooldownMs": 1100,
        "swordTint": 0x1b2a6b,
        "swordFxDurationMs": 200,
        // velocidade do Cyberus fundido — mais rápido que o cachorro normal
        // (speed: 150 em dog_purify, acima)
        "cyberusSpeed": 220,
        // 3ª cabeça: laser fino e muito longo, roxo escuro com núcleo mais
        // claro (ver CANNON_COLOR_OUTER/CORE em AllyDogAbility.js) — dura
        // pouco (cannonFxDurationMs) pra ler como descarga, não raio
        // contínuo, e atravessa/dana TODOS os inimigos na linha do feixe
        "cannonDamage": 40,
        "cannonCooldownMs": 4000,
        "cannonRange": 320,
        "cannonLength": 1400,
        "cannonWidth": 9,
        "cannonFxDurationMs": 150,
        "cannonShakeDurationMs": 90,
        "cannonShakeIntensity": 0.007
      }
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
