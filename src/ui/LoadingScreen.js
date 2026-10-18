// Fluxo de abertura do NINE LIVES (usado pela PreloadScene):
//   0) BOOT do sistema (BIOS de uma corporação retrô-futurista dos anos 90)
//   1) AVISO DE FOTOSSENSIBILIDADE (enquanto os assets carregam por trás)
//   2) TELA DE CARREGAMENTO (título + barra de 9 vidas + dicas)
//   3) "TOQUE PARA INICIAR" (também libera o áudio do navegador)
//   4) fade pra preto -> MainMenuScene (que já faz fadeIn)
//
// Tudo desenhado por código (sem assets). A animação roda em setInterval e
// os inputs em listeners do window, porque durante o preload a cena ainda
// não está "rodando" (update/input do Phaser não são confiáveis nessa fase).

const PIXEL_FONT = '"Press Start 2P", monospace';

const COLOR_BG = 0x03070a;
const COLOR_PANEL = 0x061014;
const COLOR_BORDER = 0x3d5a66;
const COLOR_FILL = 0x8fd6ff;
const COLOR_HOT = 0xe8f6ff;
const COLOR_AMBER = 0xffc857;
const HEX_AMBER = '#ffc857';

const CELLS = 9; // uma por vida do gato
const CELL_W = 30;
const CELL_H = 16;
const CELL_GAP = 6;
const CHAMFER = 4;

const BOOT_MS = 4300; // duração do boot (pulável depois de BOOT_SKIP_MS)
const BOOT_SKIP_MS = 800;
const CORP_NAME = 'NINE LIVES CORP.'; // nome da "corporação" exibido no boot
const WARNING_MIN_MS = 1500; // antes disso não dá pra pular
const WARNING_MAX_MS = 6500; // avança sozinho
const LOADING_MIN_MS = 1400; // a tela de loading nunca "pisca"
const CROSSFADE_MS = 450;
const EXIT_MS = 550;

const TIPS = [
  'SEU ATAQUE É AUTOMÁTICO. FOQUE EM SE MOVER.',
  'TRÊS CÓPIAS DE UMA CARTA ÉPICA A EVOLUEM.',
  'ORBS DE XP MUDAM DE COR CONFORME O VALOR.',
  'COM O TEMPO, INIMIGOS MAIS PERIGOSOS ENTRAM NA ARENA.'
];

function chamferPoints(x, y, w, h, c) {
  return [
    { x: x + c, y },
    { x: x + w - c, y },
    { x: x + w, y: y + c },
    { x: x + w, y: y + h - c },
    { x: x + w - c, y: y + h },
    { x: x + c, y: y + h },
    { x, y: y + h - c },
    { x, y: y + c }
  ];
}

export function buildLoadingScreen(scene) {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const cy = height / 2;
  const D = 1000;

  const objs = [];
  const add = (o) => {
    objs.push(o);
    return o;
  };

  add(scene.add.rectangle(cx, cy, width, height, COLOR_BG).setDepth(D));

  // ------------------------------------------------------------------
  // 0) BOOT DO SISTEMA (BIOS de terminal, bem simples)
  // ------------------------------------------------------------------
  const boot = add(scene.add.container(0, 0).setDepth(D + 2));
  const bx = Math.max(48, cx - 330);
  const by = cy - 150;
  const pad = (label) => `${label} `.padEnd(32, '.') + ' ';
  const bootStyle = { fontFamily: PIXEL_FONT, fontSize: '9px' };
  const bootDefs = [
    { at: 0, y: 0, text: 'NL-OS BIOS v2.04', color: '#cfefff' },
    { at: 150, y: 20, text: `(C) ${CORP_NAME} TODOS OS DIREITOS RESERVADOS`, color: '#5f808c' },
    { at: 700, y: 62, label: pad('TESTE DE MEMÓRIA'), mem: true },
    { at: 1900, y: 86, label: pad('ADAPTADOR DE VÍDEO') },
    { at: 2250, y: 110, label: pad('CONTROLADOR DE ÁUDIO') },
    { at: 2600, y: 134, label: pad('DISPOSITIVOS DE ENTRADA') },
    { at: 2950, y: 158, label: pad('KERNEL NL-OS') },
    { at: 3400, y: 202, text: '> INICIALIZANDO SISTEMA', color: '#e8f6ff', final: true }
  ];
  const bootLines = bootDefs.map((d) => {
    const obj = scene.add
      .text(bx, by + d.y, '', { ...bootStyle, color: d.color || '#8fb3bf' })
      .setVisible(false);
    boot.add(obj);
    return { ...d, obj };
  });

  const updateBoot = (elapsed) => {
    bootLines.forEach((l) => {
      if (elapsed < l.at) return;
      l.obj.setVisible(true);
      let str;
      if (l.mem) {
        const v = Math.min(640, Math.floor(((elapsed - l.at) / 1000) * 640));
        str = `${l.label}${String(v).padStart(3, ' ')}K${v >= 640 ? ' OK' : ''}`;
      } else if (l.label) {
        str = l.label + (elapsed >= l.at + 250 ? 'OK' : '');
      } else if (l.final) {
        str = l.text + '.'.repeat(1 + (Math.floor((elapsed - l.at) / 250) % 3)) + (Math.floor(elapsed / 300) % 2 ? '_' : ' ');
      } else {
        str = l.text;
      }
      l.obj.setText(str);
    });
  };

  // ------------------------------------------------------------------
  // 1) AVISO DE FOTOSSENSIBILIDADE
  // ------------------------------------------------------------------
  const warn = add(scene.add.container(0, 0).setDepth(D + 2).setAlpha(0));
  const pw = Math.min(680, width - 80);
  const ph = 270;
  const px = cx - pw / 2;
  const py = cy - ph / 2 - 20;

  const panel = scene.add.graphics();
  const panelPts = chamferPoints(px, py, pw, ph, 12);
  panel.fillStyle(COLOR_PANEL, 0.75);
  panel.fillPoints(panelPts, true);
  panel.lineStyle(1, COLOR_BORDER, 1);
  panel.strokePoints(panelPts, true);
  panel.lineStyle(2, COLOR_AMBER, 1); // filete âmbar no topo
  panel.lineBetween(px + 12, py, px + pw - 12, py);
  warn.add(panel);

  const iconY = py + 56;
  const icon = scene.add.graphics();
  icon.lineStyle(3, COLOR_AMBER, 1);
  icon.strokePoints(
    [
      { x: cx, y: iconY - 26 },
      { x: cx + 30, y: iconY + 22 },
      { x: cx - 30, y: iconY + 22 }
    ],
    true
  );
  const iconMark = scene.add
    .text(cx, iconY + 4, '!', { fontFamily: PIXEL_FONT, fontSize: '22px', color: HEX_AMBER })
    .setOrigin(0.5);
  warn.add([icon, iconMark]);

  const warnTitle = scene.add
    .text(cx, py + 112, 'AVISO DE FOTOSSENSIBILIDADE', { fontFamily: PIXEL_FONT, fontSize: '14px', color: HEX_AMBER })
    .setOrigin(0.5);
  const warnBody = scene.add
    .text(
      cx,
      py + 142,
      'ESTE JOGO CONTÉM LUZES PISCANTES, FLASHES INTENSOS E EFEITOS DE TELA QUE PODEM DESENCADEAR CRISES EM PESSOAS COM EPILEPSIA FOTOSSENSÍVEL.\n\nSE SENTIR TONTURA, ALTERAÇÃO NA VISÃO OU CONTRAÇÕES, PARE DE JOGAR E PROCURE UM MÉDICO.',
      {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: '#c4dbe3',
        align: 'center',
        lineSpacing: 7,
        wordWrap: { width: pw - 80 }
      }
    )
    .setOrigin(0.5, 0);
  warn.add([warnTitle, warnBody]);

  // linha de progresso do aviso + dica de pular
  const warnBar = scene.add.graphics();
  const warnHint = scene.add
    .text(cx, py + ph + 44, 'TOQUE OU PRESSIONE QUALQUER TECLA', { fontFamily: PIXEL_FONT, fontSize: '9px', color: '#8fb3bf' })
    .setOrigin(0.5)
    .setAlpha(0);
  warn.add([warnBar, warnHint]);

  // ------------------------------------------------------------------
  // 2) CARREGAMENTO
  // ------------------------------------------------------------------
  const load = add(scene.add.container(0, 0).setDepth(D + 2).setAlpha(0));

  const titleStyle = { fontFamily: PIXEL_FONT, fontSize: '30px' };
  const ghostA = scene.add.text(cx - 2, cy - 70, 'NINE LIVES', { ...titleStyle, color: '#00e5ff' }).setOrigin(0.5).setAlpha(0.55);
  const ghostB = scene.add.text(cx + 2, cy - 70, 'NINE LIVES', { ...titleStyle, color: '#ff2d95' }).setOrigin(0.5).setAlpha(0.45);
  const title = scene.add.text(cx, cy - 70, 'NINE LIVES', { ...titleStyle, color: '#cfefff' }).setOrigin(0.5);

  const totalW = CELLS * CELL_W + (CELLS - 1) * CELL_GAP;
  const startX = cx - totalW / 2;
  const barY = cy - CELL_H / 2 + 6;
  const g = scene.add.graphics();

  const status = scene.add.text(startX, barY + CELL_H + 18, '> CARREGANDO', { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#8fb3bf' });
  const percent = scene.add
    .text(startX + totalW, barY + CELL_H + 18, '0%', { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#e8f6ff' })
    .setOrigin(1, 0);
  const prompt = scene.add
    .text(cx, barY + CELL_H + 66, 'TOQUE PARA INICIAR', { fontFamily: PIXEL_FONT, fontSize: '12px', color: '#e8f6ff' })
    .setOrigin(0.5)
    .setAlpha(0);
  const tip = scene.add
    .text(cx, height - 56, '', { fontFamily: PIXEL_FONT, fontSize: '8px', color: '#5f808c' })
    .setOrigin(0.5);
  load.add([ghostA, ghostB, title, g, status, percent, prompt, tip]);

  // ------------------------------------------------------------------
  // acabamento CRT por cima de tudo + cortina de saída
  // ------------------------------------------------------------------
  const scan = add(scene.add.graphics().setDepth(D + 5));
  scan.fillStyle(0x000000, 0.18);
  for (let y = 0; y < height; y += 3) scan.fillRect(0, y, width, 1);

  const vig = add(scene.add.graphics().setDepth(D + 4));
  for (let i = 0; i < 6; i++) {
    vig.lineStyle(26, 0x000000, 0.12);
    vig.strokeRect(-i * 10 + 13, -i * 10 + 13, width + i * 20 - 26, height + i * 20 - 26);
  }

  const curtain = add(scene.add.rectangle(cx, cy, width, height, 0x000000, 1).setDepth(D + 10).setAlpha(0));

  // ------------------------------------------------------------------
  // máquina de estados
  // ------------------------------------------------------------------
  let phase = 'boot'; // boot -> cross -> warning -> cross -> loading -> ready -> exit
  let phaseStart = performance.now();
  let progress = 0;
  let shown = 0;
  let loadDone = false;
  let finishCalled = false;
  let pressed = false;
  let skipWarning = false;
  let skipBoot = false;
  let crossFrom = null;
  let crossTo = null;
  let crossNext = '';
  let tick = 0;
  let tipIndex = Math.floor(Math.random() * TIPS.length);
  let resolveFinish = null;
  const finishPromise = new Promise((res) => {
    resolveFinish = res;
  });

  tip.setText(`DICA: ${TIPS[tipIndex]}`);

  const setPhase = (p) => {
    phase = p;
    phaseStart = performance.now();
  };

  const startCross = (from, to, next) => {
    crossFrom = from;
    crossTo = to;
    crossNext = next;
    setPhase('cross');
  };

  const drawCells = () => {
    g.clear();
    const filled = shown * CELLS;
    const ready = phase === 'ready' || phase === 'exit';
    const pulse = ready ? 0.5 + 0.5 * Math.sin(tick * 0.18) : 0;
    for (let i = 0; i < CELLS; i++) {
      const x = startX + i * (CELL_W + CELL_GAP);
      const fill = Math.max(0, Math.min(1, filled - i));
      const pts = chamferPoints(x, barY, CELL_W, CELL_H, CHAMFER);

      g.fillStyle(COLOR_PANEL, 1);
      g.fillPoints(pts, true);

      if (fill > 0) {
        const active = fill < 1;
        const blink = active ? 0.65 + 0.35 * Math.sin(tick * 0.5) : 1;
        g.fillStyle(COLOR_FILL, (0.14 + pulse * 0.12) * blink);
        g.fillRect(x - 3, barY - 3, CELL_W + 6, CELL_H + 6);
        g.fillStyle(active ? COLOR_HOT : COLOR_FILL, blink);
        g.fillRect(x + 2, barY + 2, (CELL_W - 4) * fill, CELL_H - 4);
        g.fillStyle(0xffffff, 0.35 * blink);
        g.fillRect(x + 2, barY + 2, (CELL_W - 4) * fill, 2);
      }

      g.lineStyle(1, fill >= 1 ? COLOR_FILL : COLOR_BORDER, 1);
      g.strokePoints(pts, true);
    }
  };

  const startExit = () => {
    try {
      scene.sound.play('sfx_ui_click', { volume: 0.6 });
    } catch (e) {
      /* áudio ainda não disponível: segue sem som */
    }
    setPhase('exit');
  };

  const onInput = () => {
    const elapsed = performance.now() - phaseStart;
    if (phase === 'boot' && elapsed >= BOOT_SKIP_MS) skipBoot = true;
    else if (phase === 'warning' && elapsed >= WARNING_MIN_MS) skipWarning = true;
    else if (phase === 'ready') pressed = true;
  };
  window.addEventListener('keydown', onInput);
  window.addEventListener('pointerdown', onInput);

  const timer = setInterval(() => {
    const now = performance.now();
    const elapsed = now - phaseStart;
    tick++;

    // barra: suaviza o progresso real
    shown += (progress - shown) * 0.2;
    if (Math.abs(progress - shown) < 0.002) shown = progress;

    if (phase === 'boot') {
      updateBoot(elapsed);
      if (elapsed >= BOOT_MS || skipBoot) startCross(boot, warn, 'warning');
    } else if (phase === 'warning') {
      iconMark.setAlpha(0.65 + 0.35 * Math.sin(tick * 0.2));
      warnBar.clear();
      const t = Math.min(1, elapsed / WARNING_MAX_MS);
      warnBar.fillStyle(COLOR_BORDER, 0.5);
      warnBar.fillRect(px + 12, py + ph + 18, pw - 24, 2);
      warnBar.fillStyle(COLOR_AMBER, 0.9);
      warnBar.fillRect(px + 12, py + ph + 18, (pw - 24) * t, 2);
      if (elapsed >= WARNING_MIN_MS) warnHint.setAlpha(0.55 + 0.45 * Math.sin(tick * 0.25));
      if (elapsed >= WARNING_MAX_MS || skipWarning) startCross(warn, load, 'loading');
    } else if (phase === 'cross') {
      const t = Math.min(1, elapsed / CROSSFADE_MS);
      crossFrom.setAlpha(1 - t);
      crossTo.setAlpha(t);
      if (t >= 1) {
        crossFrom.setAlpha(0);
        setPhase(crossNext);
      }
    } else if (phase === 'loading') {
      if (loadDone && elapsed >= LOADING_MIN_MS) {
        status.setText('> SISTEMA PRONTO').setColor('#e8f6ff');
        setPhase('ready');
      }
    } else if (phase === 'ready') {
      prompt.setAlpha(0.45 + 0.55 * Math.abs(Math.sin(tick * 0.12)));
      if (pressed && finishCalled) startExit();
    } else if (phase === 'exit') {
      const t = Math.min(1, elapsed / EXIT_MS);
      curtain.setAlpha(t);
      if (t >= 1) {
        cleanup();
        resolveFinish();
        return;
      }
    }

    // textos da tela de loading
    if (phase === 'loading' || phase === 'cross') {
      const dots = '.'.repeat(1 + (Math.floor(tick / 8) % 3));
      status.setText(`> CARREGANDO${dots}${tick % 10 < 5 ? '_' : ' '}`);
    }
    percent.setText(`${Math.round(shown * 100)}%`);
    if (tick % 70 === 0) {
      tipIndex = (tipIndex + 1) % TIPS.length;
      tip.setText(`DICA: ${TIPS[tipIndex]}`);
    }

    // glitch curto e irregular no título
    if (Math.random() < 0.05) {
      const dx = Phaser.Math.Between(2, 6);
      ghostA.x = cx - dx;
      ghostB.x = cx + dx;
      title.x = cx + Phaser.Math.Between(-2, 2);
    } else if (Math.random() < 0.4) {
      ghostA.x = cx - 2;
      ghostB.x = cx + 2;
      title.x = cx;
    }

    drawCells();
  }, 50);

  function cleanup() {
    clearInterval(timer);
    window.removeEventListener('keydown', onInput);
    window.removeEventListener('pointerdown', onInput);
    objs.forEach((o) => o.destroy());
    objs.length = 0;
  }

  scene.load.on('progress', (v) => {
    progress = v;
  });
  scene.load.once('complete', () => {
    progress = 1;
    loadDone = true;
  });
  scene.events.once('shutdown', cleanup);

  return {
    // chamado pela PreloadScene.create(): resolve só quando o jogador
    // iniciou e a cortina preta fechou (aí é seguro trocar de cena)
    finish() {
      finishCalled = true;
      return finishPromise;
    }
  };
}
