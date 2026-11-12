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

let memory = { leviathanAwakened: false };

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Boolean(JSON.parse(raw).leviathanAwakened);
  } catch (e) {
    /* sem localStorage: usa a memória da sessão */
  }
  return memory.leviathanAwakened;
}

function writeStored(value) {
  memory.leviathanAwakened = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ leviathanAwakened: value }));
  } catch (e) {
    /* idem */
  }
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
    return override === null ? readStored() : override;
  },

  // o jogador realmente terminou o jogo alguma vez? (ignora o override da URL)
  hasCompletedGame() {
    return readStored();
  },

  markGameCompleted() {
    writeStored(true);
  },

  reset() {
    writeStored(false);
  }
};

if (typeof window !== 'undefined') {
  window.nineLivesProgress = {
    preview() {
      writeStored(true);
      window.__nineLivesGame?.scene.start('MainMenuScene', { corruptionReveal: true });
    },
    reset() {
      writeStored(false);
    },
    mark() {
      writeStored(true);
    }
  };
}

export default GameProgress;
