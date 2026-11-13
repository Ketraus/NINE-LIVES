// Paletas do menu (MainMenuScene e SettingsScene). Theme 1 = menu normal
// (azul terminal); Theme 2 = menu corrompido (violeta), liberado depois de
// terminar o jogo — ver systems/GameProgress.js.
//
// No tema corrompido o painel é um pouco mais escuro e o texto mais claro pra
// botões e sliders continuarem legíveis contra o brilho roxo do fundo; o glow
// do título é contido de propósito.

export const THEME_NORMAL = {
  panelFill: 0x061014,
  panelAlpha: 0.55,
  borderIdle: 0x3d5a66,
  borderHover: 0x8fd6ff,
  textIdle: '#8fb3bf',
  textHover: '#e8f6ff',
  title: '#cfefff',
  titleGlow: '#2a8fc0',
  ghostA: '#00e5ff',
  ghostB: '#ff2d95',
  dim: '#5f808c',
  clock: '#8fb3bf',
  dot: 0x8fd6ff,
  track: 0x1c2a2f,
  handle: 0xe8f6ff,
  veil: 0x05080a
};

export const THEME_CORRUPT = {
  panelFill: 0x0a0514,
  panelAlpha: 0.7,
  borderIdle: 0x5d3f8a,
  borderHover: 0xc59bff,
  textIdle: '#c4aee6',
  textHover: '#f6eeff',
  title: '#efe4ff',
  titleGlow: '#7a35d8',
  ghostA: '#8f5cff',
  ghostB: '#ff3fb4',
  dim: '#8a72b0',
  clock: '#ad96d2',
  dot: 0xc59bff,
  track: 0x2a1c3a,
  handle: 0xf6eeff,
  veil: 0x07030f
};

export function getMenuTheme(corrupted) {
  return corrupted ? THEME_CORRUPT : THEME_NORMAL;
}
