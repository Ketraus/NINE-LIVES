// Transição da costa (praia) com a grama e com a água. NÃO muda a cor dos
// tiles da costa: só desenha, por cima, uma borda orgânica em pixel dither
// (grama invadindo a praia, pedrinhas na grama, areia molhada perto d'água).
// Lê as layers do Tiled em tempo de execução (nomes abaixo).
export default {
  enabled: true,
  coastLayer: 'Costa',
  waterLayer: 'Mar',
  depth: 2.5, // acima da Costa (2), abaixo de FimDoMapa (3) e Decoracao (4)
  pixelSize: 4,

  grassFringePx: 120, // largura da grama invadindo a praia (px de mundo)
  grassFringeStrength: 1, // 0 desliga
  pebbleReachPx: 100, // até onde as pedrinhas aparecem na grama
  pebbleAmount: 1, // 0 desliga
  wetBandPx: 80, // faixa de areia molhada na beira d'água
  wetStrength: 1, // 0 desliga
  tide: 1, // vai-e-vem da maré (0 = parada)
  reducedMotionFactor: 0.2,

  colors: {
    grassA: [0.012, 0.024, 0.024],
    grassB: [0.032, 0.056, 0.056],
    grassC: [0.056, 0.096, 0.088],
    sandLight: [0.55, 0.67, 0.75],
    sandMid: [0.31, 0.41, 0.49],
    wet: [0.04, 0.09, 0.15],
    wetSand: [0.13, 0.21, 0.29]
  }
};
