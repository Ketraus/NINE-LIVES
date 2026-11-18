// Configuração da integração com a Feira de Jogos (https://feira-de-jogos.dev.br).
// Nada aqui é segredo: o client_id do Google é público por natureza.
export const FEIRA_CONFIG = {
  // PREENCHER com o client_id fornecido pela plataforma. Vazio = integração desligada.
  GOOGLE_CLIENT_ID: '',
  PRODUCT_ID: 88,
  CREDIT_URL: 'https://feira-de-jogos.dev.br/api/v2/credit',
  REQUEST_TIMEOUT_MS: 10000,
  // Recompensas por marco, em tijolinhos. null = NÃO concede (valores ainda não definidos).
  // Defina um inteiro positivo para ativar cada marco.
  REWARDS: {
    boss_reached: 500,
    boss_defeated: 550,
    game_completed: 600
  }
};
