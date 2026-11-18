// Configuração da integração com a Feira de Jogos (https://feira-de-jogos.dev.br).
// Nada aqui é segredo: o client_id do Google é público por natureza.
export const FEIRA_CONFIG = {
  // PREENCHER com o client_id fornecido pela plataforma. Vazio = integração desligada.
  GOOGLE_CLIENT_ID: '331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com',
  PRODUCT_ID: 88,
  CREDIT_URL: 'https://feira-de-jogos.dev.br/api/v2/credit',
  REQUEST_TIMEOUT_MS: 10000,
  // TOTAL de tijolinhos por marco (não soma): chegou ao Minotauro = 500, derrotou = 550, zerou = 600.
  // O jogo envia só a diferença do que a conta já recebeu. null = NÃO concede.
  REWARDS: {
    boss_reached: 500,
    boss_defeated: 550,
    game_completed: 600
  }
};
