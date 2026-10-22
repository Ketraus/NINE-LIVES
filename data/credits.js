// Créditos finais do NINE LIVES (CreditsScene, depois da cinemática de vitória).
// Edite à vontade — cada seção vira um bloco rolando de baixo pra cima:
//   { heading: 'CARGO / ÁREA', lines: ['Nome', 'Nome'] }
// Seções vazias ou sem `lines` são ignoradas. Com `sections: []` só aparecem
// o título e o agradecimento.
export default {
  title: 'NINE LIVES',
  subtitle: '',
  sections: [
    // exemplo:
    // { heading: 'GAME DESIGN & PROGRAMAÇÃO', lines: ['Seu Nome'] },
    // { heading: 'ARTE E MÚSICA', lines: ['Nome'] }
  ],
  closing: 'OBRIGADO POR JOGAR.',

  // Encerramento da versão SNCT (data/gameVersion.js): cartões sobre preto,
  // um de cada vez (fade in -> fica -> fade out). Cada cartão: `title`
  // (opcional, maior) e `lines`. Depois do último volta pro menu.
  // Mensagem do final da versão beta da SNCT (run que acaba antes do
  // Minotauro, ver systems/SnctEnding.js): um cartão só, as duas linhas juntas.
  snctBetaEnding: [
    { lines: ['Obrigado por jogar a versão beta da SNCT.', 'A versão completa estará disponível na Feira de Jogos.'] }
  ],

  snctEpilogue: [
    { title: 'NINE LIVES', lines: ['Você presenciou apenas uma versão beta.'] },
    { lines: ['Esta é uma versão experimental.', 'Descubra o que desperta nas profundezas', 'na Feira de Jogos.'] },
    { lines: ['Obrigado por jogar.'] }
  ]
};
