// Mar vivo (shader). Tudo que dá pra calibrar fica aqui.
// O efeito lê as camadas do Tiled em tempo de execução: onde a layer
// `waterLayer` tem tile = água. Se você trocar tilesets/gids no Tiled, nada
// aqui precisa mudar — só os NOMES das layers, se você renomear.
export default {
  enabled: true,
  waterLayer: 'Mar', // tile não-vazio = água
  depth: 1.5, // entre a layer Mar (1) e a Costa (2)

  // cores (RGB 0..1) — parte do azul-marinho que o mar já tinha
  colors: {
    deep: [0.07, 0.13, 0.26],
    mid: [0.106, 0.185, 0.32],
    light: [0.18, 0.31, 0.49],
    shallow: [0.13, 0.37, 0.5],
    foam: [0.82, 0.93, 0.99]
  },

  pixelSize: 4, // "pixel" do mar em px de mundo (4 = mesma grade do tile art)
  motion: 1, // velocidade geral das ondas (1 = normal)
  reducedMotionFactor: 0.3, // multiplicador quando "Reduzir tremor" está ligado
  quality: { desktop: 1, touch: 0 }, // 1 = completo, 0 = sem caustics/2ª camada de ondas
  foamAmount: 1, // 0 desliga espuma da costa
  sparkleAmount: 1 // 0 desliga brilhos
};
