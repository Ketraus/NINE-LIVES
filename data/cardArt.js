// Ids (de data/upgrades.js) que já têm arte própria pronta em
// assets/ui/cards/<id>.png — LevelUpUI usa esta lista pra saber quais
// cartas desenhar com a imagem em vez do espaço de ícone vazio (ver
// LevelUpUI._buildCard/_buildEvolutionCard). Cartas cujo id não está
// aqui continuam exatamente como hoje (sem ícone), sem quebrar nada.
//
// Pra adicionar uma carta nova conforme a Ketlin for terminando: salvar
// o PNG em assets/ui/cards/ com o nome exato do id (ex.: dmg_up.png,
// hp_up_evo_colosso.png) e incluir o id na lista abaixo. Não precisa
// mexer em mais nada.
export default [
  // ex.: 'dmg_up', 'hp_up', 'hp_up_evo_colosso'
];
