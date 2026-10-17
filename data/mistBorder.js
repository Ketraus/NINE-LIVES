// Borda da névoa (onde a grama encontra os tiles escuros da layer FimDoMapa).
// Só desenha, por cima, uma transição em pixel dither com a borda "mordida" por
// ruído: escuridão entrando na grama e pixels de grama entrando no escuro.
// Lê a layer do Tiled em tempo de execução (nome abaixo).
export default {
  enabled: true,
  fogLayer: 'FimDoMapa', // tile não-vazio = zona escura
  waterLayer: 'Mar', // água é ignorada
  depth: 3.5, // acima de FimDoMapa (3), abaixo de Decoracao (4)
  pixelSize: 4,

  darkenPx: 110, // quanto a escuridão avança sobre a grama (px de mundo)
  invadePx: 44, // quanto a grama avança sobre o escuro
  warpPx: 70, // irregularidade da borda (0 = reta)
  strength: 1, // 0 desliga

  colors: {
    dark: [0.016, 0.031, 0.047], // cor base dos tiles de FimDoMapa
    grassA: [0.016, 0.024, 0.024],
    grassB: [0.035, 0.055, 0.055],
    grassC: [0.051, 0.082, 0.082]
  }
};
