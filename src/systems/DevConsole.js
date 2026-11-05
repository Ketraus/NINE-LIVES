import EventBus from './EventBus.js';
import promptText from '../ui/TextPrompt.js';
import { fxBudgetStats } from '../fx/FxBudget.js';
import { COMMAND_NAMES, HOST_COMMANDS, runDevCommand } from './DevCommands.js';
import { runMinotaurCommand, minotaurCompletions } from './MinotaurDevCommands.js';

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
    this._history = [];
    this._historyIndex = 0;
    this._historyDraft = '';

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
    this._historyIndex = this._history.length;
    this._historyDraft = '';

    this.scene.physics.pause();
    this.scene.time.timeScale = 0;
    this.scene.input.keyboard.enabled = false;
    EventBus.emit('levelup-opened');

    if (!this._greeted) {
      this._log(`Classe atual: ${this.runManager.runState.weaponId}.`);
      this._log('Digite "help" pra ver os comandos.');
      this._log('Teste do Minotauro: helpmino (ataques, fases, repetição e modo manual).');
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
    this._stopPerf();
    window.removeEventListener('keydown', this._onKeydown);
    this.input.removeEventListener('keydown', this._onInputKeydown);
    if (this.isOpen) this.close();
    this.output.innerHTML = '';
    this.root.classList.add('hidden');
  }

  _onInputKeydown(e) {
    // impede que o EventBus/Phaser vejam essas teclas (ex.: barra de
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'F9') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (this._historyIndex === this._history.length) this._historyDraft = this.input.value;
      this._historyIndex = Math.max(0, Math.min(this._history.length,
        this._historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      this.input.value = this._history[this._historyIndex] ?? this._historyDraft;
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (/^mino\s/i.test(this.input.value)) {
        const suggestions = minotaurCompletions(this.input.value);
        if (suggestions.length === 1) this.input.value = suggestions[0] + ' ';
        else if (suggestions.length) this._log(suggestions.join(' | '));
        return;
      }
      const prefix = this.input.value.trim().toLowerCase();
      if (!prefix || /\s/.test(prefix)) return;
      const matches = [...new Set(COMMAND_NAMES)].filter(name => name.startsWith(prefix)).sort();
      if (matches.length === 1) this.input.value = matches[0] + ' ';
      else if (matches.length) this._log(matches.join(' | '));
      return;
    }
    if (e.key !== 'Enter') return;

    const raw = this.input.value.trim();
    this.input.value = '';
    if (!raw) return;
    if (this._history[this._history.length - 1] !== raw) this._history.push(raw);
    if (this._history.length > 100) this._history.shift();
    this._historyIndex = this._history.length;
    this._historyDraft = '';
    this._log(`> ${raw}`);
    try {
      this._run(raw);
    } catch (error) {
      this._log(`Erro no comando: ${error.message}`);
      console.error('[DevConsole]', error);
    }
  }

  _run(raw) {
    const [cmd, ...args] = raw.split(/\s+/);
    const command = cmd.toLowerCase();
    // Preserve the legacy `mino <seconds>` scenario; the bare namespace now
    // opens the dedicated guide. Mutations have their own host guard.
    if (['helpmino', 'fase1', 'fase2'].includes(command) ||
        (command === 'mino' && (!args.length || !Number.isFinite(Number(args[0]))))) {
      runMinotaurCommand(this, command, args);
      return;
    }
    if (HOST_COMMANDS.has(command) && this.scene.multiplayer?.isMultiplayer &&
        !this.scene.multiplayer.isRoomHost) {
      this._log('Este comando altera a arena compartilhada. Execute no console do host.');
      return;
    }
    if (runDevCommand(this, command, args)) return;

    switch (cmd.toLowerCase()) {
      case 'perf': {
        if (args[0] === 'start') {
          this._stopPerf();
          this._perf = { samples: new Float64Array(1800), count: 0, previous: 0,
            skipped: fxBudgetStats(this.scene).skipped };
          this._perfTick = () => {
            const capture = this._perf;
            if (this.isOpen || document.hidden || this.scene.time.timeScale === 0) {
              capture.previous = 0;
              return;
            }
            const now = performance.now();
            if (capture.previous) capture.samples[capture.count++ % capture.samples.length] = now - capture.previous;
            capture.previous = now;
          };
          this.scene.events.on('preupdate', this._perfTick);
          this._log('Captura iniciada. Feche o console, jogue e use perf stop.');
        } else if (args[0] === 'stop' && this._perf) {
          const capture = this._perf;
          this._stopPerf();
          const samples = Array.from(capture.samples.subarray(0, Math.min(capture.count, capture.samples.length)));
          if (!samples.length) { this._log('Nenhum frame de combate capturado.'); break; }
          samples.sort((a, b) => a - b);
          const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
          const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
          this._log(`${samples.length} frames: média ${avg.toFixed(1)} ms (~${(1000 / avg).toFixed(0)} FPS), p95 ${p95.toFixed(1)} ms, pior ${samples[samples.length - 1].toFixed(1)} ms; ${samples.filter((value) => value > 33.3).length} acima de 33,3 ms.`);
          this._log(`Detalhes secundários poupados pelo orçamento desde o início: ${fxBudgetStats(this.scene).skipped - capture.skipped}.`);
        } else this._log('Uso: perf start | stop');
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

      case 'fase2': {
        const boss = this.scene.enemySpawner.group.getChildren().find((e) => e.active && e.def?.boss);
        if (!boss) { this._log('Nenhum Minotauro vivo. Use "spawn minotaur" primeiro.'); break; }
        if (boss.isEnraged || boss.transformFx || boss._tfPending) { this._log('O Minotauro já está na fase 2 (ou se transformando).'); break; }
        const limit = boss.healthSystem.maxHp * boss.rageHpThreshold;
        boss.healthSystem.takeDamage(Math.max(1, boss.healthSystem.current - limit + 1));
        this._log('Minotauro empurrado pro limiar da fase 2.');
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

  _stopPerf() {
    if (this._perfTick) this.scene.events.off('preupdate', this._perfTick);
    this._perfTick = null;
    this._perf = null;
  }

  _log(text) {
    const line = document.createElement('div');
    line.textContent = text;
    this.output.appendChild(line);
    while (this.output.childElementCount > 500) this.output.firstElementChild.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }
}
