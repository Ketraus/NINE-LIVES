import EventBus from './EventBus.js';
import promptText from '../ui/TextPrompt.js';

// Trava casual contra curioso (F9 pede senha). Guardamos só o hash, não o texto.
// Não é segurança de verdade: o código do jogo roda no navegador do jogador.
const DEV_PASSWORD_HASH = 'efllywlgjk';
let devUnlocked = false; // vale pela sessão da página (sobrevive a reinícios de cena)

function hashDevPassword(password) {
  const text = `nl-dev:${password}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Console de debug/hack: F9 abre uma caixa de texto (elemento HTML de
export default class DevConsole {
  constructor(scene, runManager) {
    this.scene = scene;
    this.runManager = runManager;
    this.isOpen = false;

    this.root = document.getElementById('dev-console');
    this.output = document.getElementById('dev-console-output');
    this.input = document.getElementById('dev-console-input');

    this._onKeydown = this._onKeydown.bind(this);
    this._onInputKeydown = this._onInputKeydown.bind(this);
    window.addEventListener('keydown', this._onKeydown);
    this.input.addEventListener('keydown', this._onInputKeydown);

    scene.events.once('shutdown', () => this.destroy());
  }

  _onKeydown(e) {
    if (e.key === 'F9') {
      e.preventDefault();
      if (this.isOpen) this.close();
      else this._requestOpen();
    } else if (e.key === 'Escape' && this.isOpen) {
      this.close();
    }
  }

  // F9: pede a senha na primeira vez; depois de destravado abre direto.
  async _requestOpen() {
    if (this._asking || this.isOpen) return;
    if (this.scene.levelUpUI?.container?.visible) return;
    if (devUnlocked) {
      this.open();
      return;
    }
    this._asking = true;
    const keyboard = this.scene.input?.keyboard;
    const wasEnabled = keyboard?.enabled;
    if (keyboard) {
      keyboard.resetKeys?.();
      keyboard.enabled = false; // o que digitar na senha não pode mover o gato
    }
    let value = null;
    try {
      value = await promptText({
        title: 'HACK CONSOLE',
        hint: 'ACESSO RESTRITO. DIGITE A SENHA.',
        password: true,
        maxLength: 32,
        confirmLabel: 'ENTRAR'
      });
    } finally {
      this._asking = false;
      if (keyboard && wasEnabled !== false && !this.isOpen) keyboard.enabled = true;
    }
    if (value == null || this.destroyed) return;
    if (hashDevPassword(value.trim()) !== DEV_PASSWORD_HASH) return;
    devUnlocked = true;
    this.open();
  }

  open() {
    // não abre em cima da tela de escolha de carta do level-up — os dois
    if (this.scene.levelUpUI?.container?.visible) return;
    if (this.isOpen) return;

    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.input.value = '';
    this.input.focus();

    this.scene.physics.pause();
    this.scene.time.timeScale = 0;
    this.scene.input.keyboard.enabled = false;
    EventBus.emit('levelup-opened');

    if (!this._greeted) {
      this._log(`Classe atual: ${this.runManager.runState.weaponId}.`);
      this._log('Digite "help" pra ver os comandos.');
      this._greeted = true;
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.input.blur();

    this.scene.physics.resume();
    this.scene.time.timeScale = 1;
    this.scene.input.keyboard.enabled = true;
    EventBus.emit('levelup-closed');
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener('keydown', this._onKeydown);
    this.input.removeEventListener('keydown', this._onInputKeydown);
    if (this.isOpen) this.close();
    this.output.innerHTML = '';
    this.root.classList.add('hidden');
  }

  _onInputKeydown(e) {
    // impede que o EventBus/Phaser vejam essas teclas (ex.: barra de
    e.stopPropagation();
    if (e.key !== 'Enter') return;

    const raw = this.input.value.trim();
    this.input.value = '';
    if (!raw) return;
    this._log(`> ${raw}`);
    this._run(raw);
  }

  _run(raw) {
    const [cmd, ...args] = raw.split(/\s+/);

    switch (cmd.toLowerCase()) {
      case 'help':
        this._log('give <cartaId> [quantidade] — dá N cópias de uma carta (padrão: 1)');
        this._log('remove <cartaId> [quantidade] — remove N cópias de uma carta (padrão: 1)');
        this._log('resetcards — limpa todas as cartas/upgrades da run atual');
        this._log('list — lista as cartas disponíveis pra sua classe atual');
        this._log('xp <quantidade> — ganha XP de verdade (pode subir de nível)');
        this._log('levelup [quantidade] — sobe N níveis na hora (padrão: 1)');
        this._log('heal — cura o jogador pra vida máxima');
        this._log('god — liga/desliga invencibilidade');
        this._log('kill — mata o jogador na hora');
        this._log('spawn <inimigoId> [quantidade] — spawna N inimigos específicos');
        this._log('killall — elimina todos os inimigos da arena');
        this._log('listenemies — lista os tipos de inimigo disponíveis (id, hp, velocidade, dano)');
        this._log('freeze — liga/desliga o congelamento de todos os inimigos');
        this._log('autospawn — liga/desliga as levas automáticas (spawn manual continua funcionando)');
        this._log('settime <segundos> — ajusta o tempo decorrido da run (afeta dificuldade e vitória aos 10:00)');
        this._log('fim [segundos] — simula o fim: limpa a arena, só horda base (sem Minotauro/eventos) e pula pro tempo (padrão 595 = 9:55)');
        this._log('mino [segundos] — pula pro pré-Minotauro (padrão 350 = 5:50): limpa a arena, marca Sealer/Elite anteriores como já ocorridos, spawna horda base e deixa o Minotauro nascer às 6:00');
        break;

      case 'list': {
        const lines = this.runManager.cheatListCards();
        lines.forEach((line) => this._log(line));
        break;
      }

      case 'give': {
        const [cardId, qtyRaw] = args;
        if (!cardId) {
          this._log('Uso: give <cartaId> [quantidade]');
          break;
        }
        const qty = qtyRaw === undefined ? 1 : Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) {
          this._log('Quantidade inválida.');
          break;
        }
        const result = this.runManager.cheatGiveCard(cardId, qty);
        this._log(result.message);
        break;
      }

      case 'remove': {
        const [cardId, qtyRaw] = args;
        if (!cardId) {
          this._log('Uso: remove <cartaId> [quantidade]');
          break;
        }
        const qty = qtyRaw === undefined ? 1 : Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) {
          this._log('Quantidade inválida.');
          break;
        }
        const result = this.runManager.cheatRemoveCard(cardId, qty);
        this._log(result.message);
        break;
      }

      case 'resetcards':
        this._log(this.runManager.cheatResetCards().message);
        break;

      case 'xp': {
        const [amountRaw] = args;
        const amount = Number(amountRaw);
        if (!Number.isFinite(amount) || amount <= 0) {
          this._log('Uso: xp <quantidade>');
          break;
        }
        this._log(this.runManager.cheatAddXp(amount).message);
        break;
      }

      case 'levelup': {
        const [countRaw] = args;
        const count = countRaw === undefined ? 1 : Number(countRaw);
        if (!Number.isFinite(count) || count <= 0) {
          this._log('Quantidade inválida.');
          break;
        }
        this._log(this.runManager.cheatLevelUp(count).message);
        break;
      }

      case 'heal':
        this._log(this.runManager.cheatHeal().message);
        break;

      case 'god':
        this._log(this.runManager.cheatToggleGodMode().message);
        break;

      case 'kill':
        this._log(this.runManager.cheatKillPlayer().message);
        break;

      case 'spawn': {
        const [enemyId, qtyRaw] = args;
        if (!enemyId) {
          this._log('Uso: spawn <inimigoId> [quantidade]. Ids: ' + this.scene.enemySpawner.enemyDefs.map((d) => d.id).join(', '));
          break;
        }
        const qty = qtyRaw === undefined ? 1 : Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) {
          this._log('Quantidade inválida.');
          break;
        }
        const spawned = this.scene.enemySpawner.spawnByDefId(enemyId, qty);
        if (spawned === 0) {
          this._log(`Inimigo "${enemyId}" não existe. Ids: ` + this.scene.enemySpawner.enemyDefs.map((d) => d.id).join(', '));
        } else {
          this._log(`${spawned}x "${enemyId}" spawnado(s).`);
        }
        break;
      }

      case 'killall': {
        const killed = this.scene.enemySpawner.killAll();
        this._log(`${killed} inimigo(s) eliminado(s).`);
        break;
      }

      case 'listenemies': {
        this.scene.enemySpawner.enemyDefs.forEach((d) => {
          this._log(`${d.id} — ${d.name} (hp ${d.hp}, vel ${d.speed}, dano ${d.contactDamage})`);
        });
        break;
      }

      case 'freeze': {
        const frozen = this.scene.enemySpawner.toggleFrozen();
        this._log(`Freeze ${frozen ? 'ATIVADO' : 'desativado'} — inimigos ${frozen ? 'parados' : 'liberados'}.`);
        break;
      }

      case 'autospawn': {
        const enabled = this.scene.spawnDirector.toggleAutoSpawn();
        this._log(`Spawn automático ${enabled ? 'ATIVADO' : 'DESATIVADO'} — use "spawn <id>" pra inimigos manuais.`);
        break;
      }

      case 'settime': {
        const [secRaw] = args;
        const sec = Number(secRaw);
        if (!Number.isFinite(sec) || sec < 0) {
          this._log('Uso: settime <segundos>');
          break;
        }
        this.scene.spawnDirector.setElapsedMs(sec * 1000);
        this._log(`Tempo de run ajustado pra ${sec}s.`);
        break;
      }

      case 'fim': {
        const scene = this.scene;
        if (scene.victorySequenceStarted) {
          this._log('A sequência de vitória já começou — reinicie a run (R) pra testar de novo.');
          break;
        }
        const sec = args[0] === undefined ? 595 : Number(args[0]);
        if (!Number.isFinite(sec) || sec < 0) {
          this._log('Uso: fim [segundos] (padrão 595)');
          break;
        }
        scene.enemySpawner.killAll();
        scene.spawnDirector.skipAllEvents();
        scene._magnetHasAppeared = true; // sem ímã garantido do boss
        scene.spawnDirector.setElapsedMs(sec * 1000);
        scene.enemySpawner.spawnByDefId('grunt', 14);
        scene.enemySpawner.spawnByDefId('cyber_hound', 6);
        scene.enemySpawner.spawnByDefId('cyber_brute', 3);
        this._log(`Fim simulado: tempo em ${sec}s, 23 inimigos base, sem Minotauro/Elite/Sealer. Vitória em ${Math.max(0, 600 - sec).toFixed(0)}s.`);
        break;
      }

      case 'mino': {
        const scene = this.scene;
        if (scene.victorySequenceStarted) {
          this._log('A sequência de vitória já começou — reinicie a run (R) pra testar de novo.');
          break;
        }
        const sec = args[0] === undefined ? 350 : Number(args[0]);
        if (!Number.isFinite(sec) || sec < 0) {
          this._log('Uso: mino [segundos] (padrão 350 = 5:50)');
          break;
        }
        scene.enemySpawner.killAll();
        scene.spawnDirector.skipEventsBefore(sec * 1000); // Sealer/Elite passados = já ocorridos; Boss continua pendente
        scene._magnetHasAppeared = false; // o ímã garantido do boss continua valendo
        scene.spawnDirector.setElapsedMs(sec * 1000);
        scene.enemySpawner.spawnByDefId('grunt', 14);
        scene.enemySpawner.spawnByDefId('cyber_hound', 6);
        scene.enemySpawner.spawnByDefId('cyber_brute', 3);
        this._log(`Pré-Minotauro: tempo em ${sec}s, 23 inimigos base, Sealer/Elite anteriores pulados. Minotauro em ${Math.max(0, 360 - sec).toFixed(0)}s.`);
        break;
      }

      default:
        this._log(`Comando desconhecido: "${cmd}". Digite "help".`);
    }
  }

  _log(text) {
    const line = document.createElement('div');
    line.textContent = text;
    this.output.appendChild(line);
    this.output.scrollTop = this.output.scrollHeight;
  }
}
