// Resolução lógica do jogo. A antiga base 704x512 era estreita e quase 4:3;
// a nova base 1024x576 é 16:9, mas mantém a escala de design verticalizada
// para que os elementos desenhados na interface não mudem de tamanho físico
// sem necessidade.
export const DESIGN_WIDTH = 704;
export const DESIGN_HEIGHT = 512;
export const BASE_WIDTH = 1024;
export const BASE_HEIGHT = 576;

// Fator usado por HUDs e overlays que ainda foram desenhados na linguagem da
// base antiga. A lógica do mundo continua em pixels próprios do mapa.
export const UI_SCALE = BASE_HEIGHT / DESIGN_HEIGHT;

// Prende um container de UI (scrollFactor 0) à TELA, desfazendo o zoom da
// câmera principal. Com isso o (0,0) local é o canto superior esquerdo REAL
// da tela e `uiScale` é o fator de ampliação final em pixels de tela:
//   - uiScale = 1        -> coordenadas locais = pixels da tela (overlays/modais)
//   - uiScale = UI_SCALE -> coordenadas locais = "pixels de design"; a tela
//     tem (largura / UI_SCALE) x (altura / UI_SCALE) pixels locais (use
//     getUiSize()), e o canto esquerdo/superior continua colado na borda —
//     por isso nada que fica perto da borda "foge" da tela.
// (A conta antiga escalava em volta do CENTRO da tela, o que empurrava tudo
// que estava perto das bordas pra fora do canvas.)
export function anchorToScreen(container, camera, uiScale = 1) {
  const zoom = camera.zoom || 1;
  container.setScale(uiScale / zoom);
  container.setPosition(camera.centerX * (1 - 1 / zoom), camera.centerY * (1 - 1 / zoom));
}

// Tamanho da tela em pixels locais de um container ancorado com UI_SCALE.
export function getUiSize(scene, uiScale = UI_SCALE) {
  return { w: scene.scale.width / uiScale, h: scene.scale.height / uiScale };
}
