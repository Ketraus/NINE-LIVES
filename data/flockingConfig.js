// Constantes compartilhadas do SwarmSystem (src/entities/enemies/SwarmSystem.js)
// — os PESOS de cada força variam por tipo de inimigo (ver campo
// "flocking" em cada entrada de data/enemies.js); isto aqui é só a
// geometria comum a todos: até que distância um vizinho conta pra
// coesão/densidade, até que distância conta pra separação, e a partir de
// quantos vizinhos uma região é considerada "lotada".
export default {
  // Tamanho da célula do grid espacial usado pra achar vizinhos sem
  // comparar todo inimigo com todo inimigo (O(vizinhos) em vez de O(n²)).
  // Deve ficar perto de neighborRadius pra não sobrar nem faltar células
  // na varredura ao redor de cada inimigo.
  cellSize: 100,

  // Raio (px) até onde um vizinho conta pra Coesão (força 2, "manter o
  // efeito de horda") e pra Densidade (força 4, "evitar áreas
  // congestionadas"). Região "local" de cada inimigo.
  neighborRadius: 130,

  // Raio (px) até onde um vizinho conta pra Separação (força 3, "impede
  // sobreposição excessiva") — bem menor que neighborRadius de propósito:
  // só quem está quase colado empurra pra longe.
  separationRadius: 34,

  // A partir de quantos vizinhos dentro de neighborRadius uma região conta
  // como "lotada" pra Densidade — abaixo disso, densityForce fica em 0
  // (nenhum desvio lateral extra).
  densityThreshold: 4,

  // Quantos vizinhos ACIMA de densityThreshold já bastam pra Densidade
  // valer força máxima (100%) — cresce linearmente de 0 a 1 nesse
  // intervalo (ver SwarmSystem.computeMoveDir).
  densitySaturation: 6
};
