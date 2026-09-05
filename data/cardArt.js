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
  'fists_slam', 'fists_shockwave', 'katana_double', 'pistol_drone', 'pistol_fragmentation'
];
