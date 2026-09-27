import EventBus from '../systems/EventBus.js';
import scoreValuesData from '../../data/scoreValues.js';

// Mesma paleta/fonte "placa de terminal" do menu principal e das outras
// telas de UI (ver MainMenuScene/LevelUpUI/HUD) — só a fonte/cor do texto,
// sem painel/borda em volta (pediu pra tirar a "moldura" e deixar só a
// mensagem sobre o fundo escuro).
const PIXEL_FONT = '"Press Start 2P", monospace';
const TEXT_DIM = '#6b8894';
const TEXT_MAIN = '#e8f6ff';
const TEXT_ACCENT = '#7CFC9C';

// não é mais um painel com borda — só define a largura de referência pro
// wordWrap e o espaçamento vertical entre seção/item/total
const PANEL_W = 320;
const PANEL_H = 200;

const PANEL_FADE_IN_MS = 400;
// pausa depois que cada etapa termina de contar, antes da próxima começar
const STEP_PAUSE_MS = 550;
const ITEM_FADE_MS = 200;
const KILL_COUNT_MS = 650; // contagem de pontos por tipo de inimigo abatido
const MULT_COUNT_MS = 900; // contagem do multiplicador de sobrevivência
const BONUS_COUNT_MS = 700; // contagem de bônus fixos (ex.: conclusão)
const FINAL_COUNT_MS = 1200; // contagem final grande até a pontuação total
const FINAL_PUNCH_SCALE = 1.15;
const FINAL_PUNCH_MS = 220;

// Tela de resultado pós-partida (morte ou vitória, 10:00 completos).
// Reaproveita os dados já registrados pelo ScoreManager (ver
// GameScene/ScoreManager) e revela a pontuação em etapas — inimigos
// derrotados um por vez, depois bônus de sobrevivência, depois bônus de
// conclusão (só se venceu) e por fim a pontuação final — sempre com o
// mesmo painel minimalista, sem virar uma tabela cheia de números.
//
// Só começa depois que a tela de "Você Morreu"/vitória (HUD) já terminou
// de aparecer (ver eventos 'gameover-shown'/'win-shown' emitidos por lá).
export default class ResultUI {
  constructor(scene) {
    this.scene = scene;
    this._started = false;
    this._buildPanel();
    this._bindEvents();
  }

  // Sem painel/borda — só o dim atrás pra dar contraste, e os textos
  // soltos por cima (mesmo princípio pedido pro "Você Morreu": nada de
  // "interface", só a informação).
  _buildPanel() {
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    this.container = this.scene.add.container(0, 0).setDepth(300).setVisible(false).setAlpha(0);

    const dim = this.scene.add
      .rectangle(cx, cy, this.scene.scale.width, this.scene.scale.height, 0x000000, 0.35)
      .setScrollFactor(0);

    // seção atual (ex.: "INIMIGOS DERROTADOS") — dim, no topo do painel
    this.sectionText = this.scene.add
      .text(cx, cy - PANEL_H / 2 + 24, '', { fontFamily: PIXEL_FONT, fontSize: '10px', color: TEXT_DIM })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // item atual da seção (nome+qtd do inimigo, multiplicador, bônus…)
    this.itemText = this.scene.add
      .text(cx, cy - 16, '', {
        fontFamily: PIXEL_FONT,
        fontSize: '13px',
        color: TEXT_MAIN,
        align: 'center',
        wordWrap: { width: PANEL_W - 50 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // total corrente — sempre visível, sobe ao longo de todas as etapas
    this.totalLabelText = this.scene.add
      .text(cx, cy + 36, 'PONTUAÇÃO', { fontFamily: PIXEL_FONT, fontSize: '9px', color: TEXT_DIM })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.totalText = this.scene.add
      .text(cx, cy + 60, '0', { fontFamily: PIXEL_FONT, fontSize: '24px', color: TEXT_ACCENT })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.container.add([dim, this.sectionText, this.itemText, this.totalLabelText, this.totalText]);
  }

  _bindEvents() {
    EventBus.on('gameover-shown', () => this._start());
    EventBus.on('win-shown', () => this._start());
    EventBus.on('run-restart', () => this._reset());
  }

  _reset() {
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.killTweensOf(this.totalText);
    this.container.setVisible(false).setAlpha(0);
    this.sectionText.setText('');
    this.itemText.setText('').setAlpha(1);
    this.totalLabelText.setText('PONTUAÇÃO');
    this.totalText.setText('0').setScale(1);
    this._started = false;
  }

  // Dispara uma única vez por run (morte e vitória nunca acontecem juntas,
  // mas a guarda evita reprocessar se o evento chegar mais de uma vez).
  _start() {
    if (this._started) return;
    const result = this.scene.scoreManager?.result;
    if (!result) return;

    this._started = true;
    this._result = result;
    this._runningTotal = 0;

    this.container.setVisible(true);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: PANEL_FADE_IN_MS,
      onComplete: () => this._runSteps()
    });
  }

  _runSteps() {
    const steps = this._buildKillSteps();
    steps.push((next) => this._playSurvivalBonus(next));
    if (this._result.completed) steps.push((next) => this._playCompletionBonus(next));
    steps.push((next) => this._playFinalReveal(next));
    this._runQueue(steps);
  }

  // Roda uma lista de passos (cada um recebe `next` e o chama quando
  // termina) com uma pausa fixa entre eles. Ao fim da fila (placar final já
  // revelado e parado sozinho na tela), emite 'result-complete' — é o sinal
  // pra próxima e última informação (dica de reiniciar/escolher arma, ver
  // HUD) entrar, sem disputar espaço com nada que ainda esteja em cena.
  _runQueue(fns) {
    const run = (i) => {
      if (i >= fns.length) {
        this.scene.time.delayedCall(STEP_PAUSE_MS, () => EventBus.emit('result-complete'));
        return;
      }
      fns[i](() => this.scene.time.delayedCall(STEP_PAUSE_MS, () => run(i + 1)));
    };
    run(0);
  }

  // Um passo por tipo de inimigo abatido, na ordem de data/scoreValues.js
  // (crescente por valor, terminando no boss) — tipos com 0 abates não
  // entram (ver pedido: só mostra o que de fato aconteceu na run).
  _buildKillSteps() {
    const kills = this._result.killsByType;
    const steps = [];
    Object.keys(scoreValuesData).forEach((id) => {
      const count = kills[id] || 0;
      if (count <= 0) return;
      const def = scoreValuesData[id];
      const points = count * def.points;
      steps.push((next) => this._playKillStep(def.label, count, points, next));
    });
    return steps;
  }

  _playKillStep(label, count, points, next) {
    this._setSection('INIMIGOS DERROTADOS');
    this._setItem(`${label}  x${count}`, () => {
      const from = this._runningTotal;
      const to = from + points;
      this._countTotal(from, to, KILL_COUNT_MS, () => {
        this._runningTotal = to;
        next();
      });
    });
  }

  _playSurvivalBonus(next) {
    this._setSection('BÔNUS DE SOBREVIVÊNCIA');
    const mult = this._result.survivalMultiplier;
    const from = this._runningTotal;
    const to = Math.round(from * mult);

    this._setItem('×1.00', () => {
      const multProxy = { value: 1 };
      this.scene.tweens.add({
        targets: multProxy,
        value: mult,
        duration: MULT_COUNT_MS,
        ease: 'Cubic.easeOut',
        onUpdate: () => this.itemText.setText(`×${multProxy.value.toFixed(2)}`)
      });
      this._countTotal(from, to, MULT_COUNT_MS, () => {
        this._runningTotal = to;
        next();
      });
    });
  }

  _playCompletionBonus(next) {
    this._setSection('BÔNUS DE CONCLUSÃO');
    const bonus = this._result.completionBonus;
    const from = this._runningTotal;
    const to = from + bonus;

    this._setItem(`+${bonus}`, () => {
      this._countTotal(from, to, BONUS_COUNT_MS, () => {
        this._runningTotal = to;
        next();
      });
    });
  }

  _playFinalReveal(next) {
    this._setSection('PONTUAÇÃO FINAL');
    this._setItem('', () => {
      this.totalLabelText.setText('TOTAL');
      this._countTotal(0, this._result.finalScore, FINAL_COUNT_MS, () => {
        this.scene.tweens.add({
          targets: this.totalText,
          scale: FINAL_PUNCH_SCALE,
          duration: FINAL_PUNCH_MS,
          yoyo: true,
          ease: 'Sine.easeOut'
        });
        next();
      });
    });
  }

  // Troca o texto da seção com um crossfade curto — só reanima se o texto
  // realmente mudou (senão fica piscando à toa entre itens da mesma seção).
  _setSection(label) {
    if (this.sectionText.text === label) return;
    this.sectionText.setText(label).setAlpha(0);
    this.scene.tweens.add({ targets: this.sectionText, alpha: 1, duration: ITEM_FADE_MS });
  }

  // Crossfade do item central: some o texto anterior, troca e reaparece,
  // só então chama onShown (que dispara a contagem daquele passo).
  _setItem(label, onShown) {
    this.scene.tweens.add({
      targets: this.itemText,
      alpha: 0,
      duration: ITEM_FADE_MS,
      onComplete: () => {
        this.itemText.setText(label);
        this.scene.tweens.add({
          targets: this.itemText,
          alpha: 1,
          duration: ITEM_FADE_MS,
          onComplete: onShown
        });
      }
    });
  }

  // Conta o número exibido no total de `from` até `to` (inteiros).
  _countTotal(from, to, duration, onComplete) {
    const proxy = { value: from };
    this.scene.tweens.add({
      targets: proxy,
      value: to,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.totalText.setText(String(Math.round(proxy.value))),
      onComplete
    });
  }
}
