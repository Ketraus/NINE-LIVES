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
    "sprite": "minotaur_walk",
    "walkAnim": "minotaur-walk",
    // textura estática mostrada quando ele não tá se movendo (ver
    // Enemy.js updateAnimState) — "animação besta" pedida pelo usuário,
    // é só uma troca de imagem, não uma spritesheet
    "idleTexture": "minotaur_idle",
    // versões sem machado (ver PreloadScene.js minotaur_*_noaxe e Enemy.js
    // _launchAxe/_endAxeThrow -> _setDisarmed): usadas só durante a
    // habilidade Machado Arremessado, enquanto o machado está fora da mão
    "walkAnimNoAxe": "minotaur-walk-noaxe",
    "idleTextureNoAxe": "minotaur_idle_noaxe",
    // Rage (ver Enemy.js _triggerRage/_refreshBossVisual): a partir do
    // momento em que a vida cair pra esta fração da vida total (0.45 =
    // 45%), troca pra sprite rage e fica assim pro resto da luta.
    "rageHpThreshold": 0.45,
    "walkAnimRage": "minotaur-walk-rage",
    "idleTextureRage": "minotaur_idle_rage",
    // Rage + sem machado (ver Enemy.js _refreshBossVisual): usada quando
    // ele já está em rage E nesse momento também está desarmado
    // (arremesso do machado em andamento durante a fúria).
    "walkAnimRageNoAxe": "minotaur-walk-rage-noaxe",
    "idleTextureRageNoAxe": "minotaur_idle_rage_noaxe",
    // "Minotauro puto" (ver Enemy.js _triggerRage/_bossCooldown/
    // _bossDamage): a partir do rage, SEM habilidade nova nenhuma —
    // só aperta o que já existe. Cooldowns de Investida/Machado/Corte/
    // Pisão saem multiplicados por rageCooldownMultiplier (0.7 = 30%
    // mais rápido). O sorteio 1/3-1/3-1/3 de Investida/Machado/Corte
    // vira os pesos abaixo (Investida e Machado saem mais, Corte sobra
    // menos). Todo dano de ataque do boss sai multiplicado por
    // rageDamageMultiplier (mais pressão, não mais dano absurdo).
    "rageCooldownMultiplier": 0.7,
    "rageChargeWeight": 0.4,
    "rageAxeWeight": 0.4,
    "rageDamageMultiplier": 1.15,
    "hp": 3000,
    "speed": 65,
    "contactDamage": 40,
    "contactCooldownMs": 800,
    "xpReward": 500,
    // sem tint (sprite real, não mais o placeholder cinza) — branco = cor
    // original do PNG passa direto (ver Enemy.js setTint(def.color))
    "color": 16777215,
    // frame real é 64x64 (grade 2x2, ver PreloadScene.js). Aumentado de
    // 1.3 (~83px, ficou pequeno demais pra um boss) pra 2.2 (~140px) —
    // ajuste este número de novo se ainda não estiver do tamanho certo
    "scale": 2.2,
    "flocking": { "seek": 1.0, "cohesion": 0, "separation": 0.3, "density": 0 },
    "boss": true,
    // Boss é bem mais pesado que o Elite (knockbackResistance 0.15) —
    // quase não sente empurrão nenhum.
    "knockbackResistance": 0.05,
    // Investida (1ª das duas habilidades, sorteada 50/50 com o Machado
    // Arremessado abaixo — ver Enemy._updateBossAbility):
    // para, mostra a linha de aviso por chargeTelegraphMs + chargePauseMs
    // (parado o tempo todo), dispara a chargeSpeed por chargeDurationMs, e
    // fica vulnerável (recebe chargeVulnerableDamageMultiplier de dano) por
    // chargeVulnerableMs antes de poder investir de novo.
    "chargeCooldownMs": 6000,
    "chargeTelegraphMs": 900,
    "chargePauseMs": 400,
    "chargeSpeed": 620,
    "chargeDurationMs": 550,
    "chargeDamage": 55,
    "chargeHitRadius": 46,
    // Corte (evolução da Investida, ver Enemy._startSwing/_resolveSwing):
    // dispara IMEDIATAMENTE ao fim do dash, antes da janela vulnerável —
    // telegraph bem curto de propósito (é o "castigo" de ficar colado
    // nele assim que a investida termina).
    "chargeSwingTelegraphMs": 200,
    "chargeSwingRadius": 100,
    "chargeSwingDamage": 45,
    "chargeVulnerableMs": 2000,
    "chargeVulnerableDamageMultiplier": 1.5,
    // Machado Arremessado (2ª habilidade, sorteada 50/50 com a Investida
    // sempre que o cooldown libera — ver Enemy._updateBossAbility): para,
    // prepara por axeThrowTelegraphMs, arremessa até a posição do jogador
    // travada nesse instante (axeThrowFlightMs de voo girando), CRAVA no
    // chão e causa axeThrowImpactDamage na hora (raio
    // axeThrowImpactRadius), espera axeThrowStuckMs, EXPLODE causando
    // axeThrowExplosionDamage (raio axeThrowExplosionRadius), levanta a
    // mão por axeThrowRaiseMs e puxa o machado de volta
    // (axeThrowReturnFlightMs de voo), causando axeThrowReturnDamage em
    // quem tocar nele na volta (raio axeThrowReturnRadius). Ataque à
    // distância "de leitura", mais lento que a Investida de propósito.
    "axeThrowTelegraphMs": 700,
    "axeThrowFlightMs": 500,
    "axeThrowImpactDamage": 35,
    "axeThrowImpactRadius": 70,
    "axeThrowStuckMs": 2000,
    "axeThrowExplosionDamage": 60,
    "axeThrowExplosionRadius": 110,
    "axeThrowRaiseMs": 350,
    "axeThrowReturnFlightMs": 450,
    "axeThrowReturnDamage": 35,
    "axeThrowReturnRadius": 60,
    "axeThrowCooldownMs": 6000,
    // Corte Destrutivo (3ª habilidade, sorteada 1/3 com a Investida e o
    // Machado — ver Enemy._updateBossAbility): "carrega -> apita ->
    // XABLAU". cleaveTelegraphMs é de propósito BEM mais longo que os
    // telegraphs das outras duas — é a habilidade "eu avisei que você
    // deveria sair daí", não uma pegadinha. Cone longo (cleaveRange) e
    // estreito (cleaveHalfAngleDeg pequeno) na direção travada no início
    // do carregamento. cleavePauseMs é a pausa final antes do golpe sair
    // de verdade. cleaveDamage é o mais alto do Minotauro; em
    // contraste, o shake do impacto é pequeno (o aviso já foi o evento
    // grande). cleaveRecoverMs é a pequena recuperação antes de voltar a
    // perseguir.
    "cleaveTelegraphMs": 2000,
    "cleavePauseMs": 350,
    // Área bem maior que a primeira versão (320 alcance / 18° meio-ângulo)
    // — pra justificar os ~2.35s de aviso todo (telegraph + pausa): um
    // cone pequeno com um aviso tão longo não fazia sentido, dava tempo
    // demais pra sair de uma área pequena. Ainda um cone (não círculo),
    // só que cobrindo boa parte da tela na direção travada.
    "cleaveRange": 650,
    "cleaveHalfAngleDeg": 26,
    "cleaveDamage": 110,
    "cleaveRecoverMs": 400,
    "cleaveCooldownMs": 9000,
    // Pisão (4ª habilidade, "SAI DE PERTO" — ver Enemy._updateBossStomp e
    // afins): diferente das outras três, NÃO entra no sorteio 1/3 e não
    // usa o cooldown compartilhado (bossChargeReadyAt) — é puramente
    // reativa, dispara sozinha sempre que o jogador fica a menos de
    // stompTriggerRadius dele (e o cooldown PRÓPRIO abaixo já liberou).
    // Levanta o pé (stompRaiseMs) -> pequena pausa (stompPauseMs) -> pisa:
    // área pequena (stompImpactRadius), dano baixo, knockback MUITO forte
    // no jogador, shake curto -> volta a perseguir normalmente (sem
    // janela vulnerável, ao contrário da Investida+Corte).
    "stompTriggerRadius": 90,
    "stompCooldownMs": 4000,
    "stompRaiseMs": 350,
    "stompPauseMs": 200,
    "stompImpactRadius": 110,
    "stompDamage": 15,
    "stompKnockbackForce": 900,
    "stompKnockbackDurationMs": 260
  }
]
;