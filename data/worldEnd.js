// Fim do mundo: tudo que fica fora da layer AreaJogavel (e que não é mar)
// é "zona proibida". Distâncias em TILES, contadas a partir da borda da
// área jogável. Mexa só aqui pra calibrar.
export default {
  playableLayer: 'AreaJogavel',
  extraPlayableLayers: ['Costa'], // a praia é andável: conta como área jogável
  seaLayer: 'BloqueioMar', // mar não conta como fim do mundo (já tem barreira própria; é refeita a partir da layer Mar, ver MapManager)

  warnTiles: 5, // a névoa começa a aparecer essa distância ANTES da borda
  maxDepthTiles: 7, // profundidade em que tudo chega no máximo (parede do mundo ~8)

  // dano ambiental: ignora escudo e desvio, respeita God Mode
  damage: {
    intervalMs: 450,
    graceMs: 300, // tolerância ao pisar pra dentro (primeiro aviso antes do 1º dano)
    minPercentMaxHp: 0.015, // por tick, na borda
    maxPercentMaxHp: 0.06, // por tick, no fundo
    minFlat: 2
  },

  // batimento do "coração" do mundo: acelera quanto mais fundo
  heartbeat: { slowSeconds: 1.4, fastSeconds: 0.5 },

  // visual
  fogColorEdge: 0x9db8c9,
  fogColorDeep: 0x3a1d5c,
  darkColor: 0x04020a,
  pulseColor: 0x8a1c4a,
  puffsDesktop: 40,
  puffsTouch: 24,

  // áudio sintetizado (sem arquivo)
  droneVolume: 0.32,
  thumpVolume: 0.55
};
