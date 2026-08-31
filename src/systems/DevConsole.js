import EventBus from './EventBus.js';

/**
 * Console de debug/hack: F9 abre uma caixa de texto (elemento HTML de
 * verdade sobre o canvas — não dá pra digitar texto direto no Phaser sem
 * reimplementar um teclado inteiro) onde dá pra digitar comandos.
 *
 * Toda a validação de regras (carta existe? é da classe certa? já foi
 * pega?) mora em RunManager.cheatGiveCard/cheatListCards — este arquivo só
 * lê o comando, chama o método certo e mostra o resultado. Isso garante
 * que uma carta exclusiva de outra arma continua impossível de pegar,
 * porque é a MESMA checagem que o level-up normal usa.
 *
 * Existe só pra testes/demonstração — nunca é chamado pelo fluxo normal
 * do jogo, e cada instância é presa à GameScene que a criou (destruída no
 * shutdown dela, ver construtor) pra não acumular listeners de partidas
 * anteriores quando o jogador reinicia com R.
 */
export default class DevConsole {
  /**
   * @param {Phaser.Scene} scene - GameScene atual
   * @param {import('../roguelike/RunManager.js').default} runManager
   */
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
      this.isOpen ? this.close() : this.open();
    } else if (e.key === 'Escape' && this.isOpen) {
      this.close();
    }
  }

  open() {
    // não abre em cima da tela de escolha de carta do level-up — os dois
    // usam o mesmo pause (physics.pause/timeScale/'levelup-opened') e
    // fechar um por cima do outro deixaria o jogo destravado errado
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
    window.removeEventListener('keydown', this._onKeydown);
    this.input.removeEventListener('keydown', this._onInputKeydown);
    if (this.isOpen) this.close();
    this.output.innerHTML = '';
    this.root.classList.add('hidden');
  }

  _onInputKeydown(e) {
    // impede que o EventBus/Phaser vejam essas teclas (ex.: barra de
    // espaço não deve disparar ataque enquanto o jogador digita)
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
