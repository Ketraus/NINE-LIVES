// Progresso "do mundo" do jogo (não confundir com SettingsManager, que guarda
// só opções). Por enquanto guarda uma coisa: se o jogador já TERMINOU o jogo —
// depois disso a energia do Leviatã chegou até o fundo do menu principal
// (ver fx/MenuCorruptionFx.js). Fica no localStorage; sem localStorage (modo
// privado) dura só a sessão.
//
// Testes rápidos (console do navegador):
//   nineLivesProgress.preview()   -> marca e reinicia o menu COM a transição
//   nineLivesProgress.reset()     -> volta o menu ao normal (recarregue a página)
//   URL com ?corrupted=1 / ?corrupted=0 força ligado/desligado (sem salvar)

const STORAGE_KEY = 'nineLivesProgress';

// theme: 'corrupted' (Theme 2) ou 'normal' (Theme 1). Depois de terminar o jogo
// o menu começa no Theme 2, e o jogador pode alternar (botão escondido no menu).
let memory = { leviathanAwakened: false, theme: 'corrupted' };

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { leviathanAwakened: Boolean(d.leviathanAwakened), theme: d.theme === 'normal' ? 'normal' : 'corrupted' };
    }
  } catch (e) {
    /* sem localStorage: usa a memória da sessão */
  }
  return { ...memory };
}

function writeAll(next) {
  memory = { ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    /* idem */
  }
}

function readStored() {
  return readAll().leviathanAwakened;
}

function writeStored(value) {
  writeAll({ ...readAll(), leviathanAwakened: value });
}

// ?corrupted=1|true|(vazio) -> true; ?corrupted=0|false -> false; ausente -> null
function readUrlOverride() {
  try {
    const v = new URLSearchParams(window.location.search).get('corrupted');
    if (v === null) return null;
    return !(v === '0' || v === 'false');
  } catch (e) {
    return null;
  }
}

const GameProgress = {
  // o menu deve aparecer corrompido? (URL manda; senão vale o que foi salvo)
  isCorrupted() {
    const override = readUrlOverride();
    if (override !== null) return override;
    const d = readAll();
    return d.leviathanAwakened && d.theme === 'corrupted';
  },

  // tema escolhido pelo jogador ('corrupted' | 'normal'); só vale depois de zerar
  getTheme() {
    return readAll().theme;
  },

  setTheme(theme) {
    writeAll({ ...readAll(), theme: theme === 'normal' ? 'normal' : 'corrupted' });
  },

  // o jogador realmente terminou o jogo alguma vez? (ignora o override da URL)
  hasCompletedGame() {
    return readStored();
  },

  markGameCompleted() {
    writeStored(true);
  },

  reset() {
    writeAll({ leviathanAwakened: false, theme: 'corrupted' });
  }
};

if (typeof window !== 'undefined') {
  window.nineLivesProgress = {
    preview() {
      writeAll({ leviathanAwakened: true, theme: 'corrupted' });
      window.__nineLivesGame?.scene.start('MainMenuScene', { corruptionReveal: true });
    },
    reset() {
      writeAll({ leviathanAwakened: false, theme: 'corrupted' });
    },
    mark() {
      writeStored(true);
    }
  };
}

export default GameProgress;
