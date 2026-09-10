// Ids (de data/upgrades.js) que já têm arte própria pronta em
// assets/ui/cards/<id>.png — LevelUpUI usa esta lista pra saber quais
// cartas desenhar com a imagem em vez do espaço de ícone vazio (ver
// LevelUpUI._buildCard/_buildEvolutionCard). Cartas cujo id não está
// aqui continuam exattamente como hoje (sem ícone), sem quebrar nada.
//
//  salvar o PNG em assets/ui/cards/ com o nome exato do id (ex.: dmg_up.png,
// hp_up_evo_colosso.png) e incluir o id na lista abaixo. Não precisa
// mexer em mais nada.
export default [
  'dmg_up', 'speed_up', 'hp_up', 'cooldown_down', 'range_up', 'thorns_up', 'armor_up',
  'arsenal_expandido', 'lifesteal_up', 'dog_purify',
  'fists_slam', 'fists_shockwave', 'katana_double', 'katana_shuriken', 'pistol_drone', 'pistol_fragmentation',

  // evoluções com arte pronta. `dmg_up_evo_overcharge` é usada por 3 armas
  // com nomes diferentes (ver namesByWeapon em data/upgrades.js) — como o
  // id da carta é o mesmo pras 3, a arte não pode viver em
  // dmg_up_evo_overcharge.png sozinha; RunManager._resolveEvolutionName
  // monta um `artId` só pra esse caso (dmg_up_evo_overcharge_<arma>), então
  // os 3 PNGs abaixo usam esse artId como nome de arquivo em vez do id da
  // carta (ver LevelUpUI._buildEvolutionCard).
  'armor_up_evo_shield', 'thorns_up_evo_sobrecarga', 'range_up_evo_katana_stray',
  'speed_up_evo_tornado', 'range_up_evo_hunter_instinct',
  'dmg_up_evo_overcharge_fists', 'dmg_up_evo_overcharge_katana', 'dmg_up_evo_overcharge_pistol'
];
