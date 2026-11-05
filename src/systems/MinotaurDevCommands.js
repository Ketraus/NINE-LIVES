import { MINO_ATTACKS, stopMinotaur, setMinotaurPhase, queueMinotaurAttack } from './MinotaurDevControl.js';

export const MINO_HELP = [
  '[MINOTAURO — GUIA DE TESTES]',
  '1. mino spawn — cria e seleciona um Minotauro em modo manual (ou seleciona o vivo mais próximo).',
  '2. god on — protege o JOGADOR; mino invencivel on — protege o CHEFE.',
  '3. mino fase 1 | 2 — troca instantaneamente; fase 1 cura 100%, fase 2 ajusta ao limiar de fúria.',
  '4. mino investida — prepara o ataque. Feche o console com F9/Esc para assistir.',
  '5. mino repetir investida 2 — repete com 2s de descanso APÓS terminar cada sequência.',
  '',
  '[ATAQUES — mino <nome> ou mino ataque <nome>]',
  'investida — preparação, corrida, corte final e recuperação (sequência completa).',
  'giro — apenas o corte final da investida, com seu aviso.',
  'machado — arremesso, cravada, carga, explosão e retorno.',
  'corte — corte destrutivo em cone; pisao — impacto ao redor do chefe.',
  'salto — salto de perseguição ORIGINAL: pousa fora da câmera, à frente da fuga.',
  'meteoro — um meteoro; funciona nas duas fases sem ativar chuva contínua.',
  'mino repetir <ataque> [segundos=2] — intervalo de 0.5 a 30; mino parar — cancela tudo.',
  '',
  '[FASES E COMPORTAMENTO]',
  'mino transformar — toca a transformação original para fase 2, sem causar dano.',
  'fase1 — atalho de mino fase 1; fase2 — atalho de mino transformar.',
  'mino manual — cancela ataques/chuva e aguarda comandos; mino auto — devolve IA e chuva da fase 2.',
  'mino meteoros on|off — liga/desliga chuva contínua (exige fase 2 para ligar).',
  'mino invencivel on|off — imunidade do chefe a ataques; não impede comandos de vida.',
  'mino vida <valor|percentual%> — de 1 até HP máximo; pode disparar a transformação normal.',
  'mino curar — cura o chefe sem trocar fase; mino reset — fase 1, vida cheia, manual, sem imunidade.',
  '',
  '[SELEÇÃO E DIAGNÓSTICO]',
  'mino listar — IDs/posição/fase de todos os Minotauros vivos.',
  'mino selecionar <ID> — usa o ID exibido na lista; mino status — estado, vida, fila e repetição.',
  'mino spawn — reutiliza um chefe vivo; spawn minotaur — comando geral para criar outro.',
  'mino trazer — reposiciona o selecionado perto do jogador, em um ponto livre, e fica manual.',
  'mino 350 — mantém o teste antigo de pré-boss aos 350s; helpmino — este guia.',
  'Tab completa comandos mino e nomes de ataques. Em multiplayer, alterações são feitas pelo HOST.',
  'Ataques manuais interrompem o anterior e desativam a chuva para isolar o teste.',
  'O freeze global precisa estar desligado. O jogador precisa estar vivo e a partida em andamento.',
  'Para medir: perf start → feche F9 → observe repetições → F9 → perf stop.'
];

const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SUBCOMMANDS = ['spawn', 'listar', 'selecionar', 'status', 'ataque', ...MINO_ATTACKS,
  'fase', 'transformar', 'manual', 'auto', 'repetir', 'parar', 'meteoros', 'invencivel', 'vida', 'curar', 'reset', 'trazer', 'help'];

export function minotaurCompletions(input) {
  const parts = normalize(input).trimStart().split(/\s+/);
  if (parts[0] !== 'mino') return [];
  const choices = parts.length === 2 ? SUBCOMMANDS
    : parts.length === 3 && ['ataque', 'repetir'].includes(parts[1]) ? MINO_ATTACKS
      : parts.length === 3 && parts[1] === 'fase' ? ['1', '2']
        : parts.length === 3 && ['invencivel', 'meteoros'].includes(parts[1]) ? ['on', 'off'] : [];
  const prefix = parts.pop();
  return choices.filter(s => s.startsWith(prefix)).map(s => [...parts, s].join(' '));
}

function liveBosses(scene) {
  return (scene.enemySpawner?.group?.getChildren() || []).filter(b => b.active &&
    b.def?.id === 'minotaur' && !b._deathSequenceStarted && !b.healthSystem.isDead());
}

export function runMinotaurCommand(console, command, rawArgs) {
  const args = rawArgs.map(normalize), scene = console.scene, log = s => console._log(s);
  if (command === 'helpmino' || (command === 'mino' && (!args.length || ['help', 'ajuda'].includes(args[0])))) {
    MINO_HELP.forEach(log); return;
  }
  if (scene.multiplayer?.isMultiplayer && !scene.multiplayer.isRoomHost) {
    log('Execute os comandos do Minotauro no console do host. helpmino mostra o guia.'); return;
  }
  let sub = command === 'fase1' ? 'fase' : command === 'fase2' ? 'transformar' : args.shift();
  if (command === 'fase1') args.splice(0, args.length, '1');
  if (!SUBCOMMANDS.includes(sub)) { log('Comando do Minotauro desconhecido. Use helpmino.'); return; }
  let bosses = liveBosses(scene);
  if (sub === 'listar') {
    if (!bosses.length) log('Nenhum Minotauro vivo. Use mino spawn.');
    bosses.forEach(b => log(`${b.id} | fase ${b.isEnraged ? 2 : 1} | HP ${Math.ceil(b.healthSystem.current)}/${b.healthSystem.maxHp} | ${Math.round(b.x)}, ${Math.round(b.y)}${console._minoSelectedId === b.id ? ' [selecionado]' : ''}`));
    return;
  }
  if (sub === 'selecionar') {
    const selected = bosses.find(b => b.id === args[0]);
    if (args.length !== 1 || !selected) { log('ID inválido. Use mino listar e mino selecionar <ID>.'); return; }
    console._minoSelectedId = selected.id; log(`Minotauro selecionado: ${selected.id}.`); return;
  }
  if (!scene.player?.active || scene.player.isDead || scene.isGameOver || scene.victorySequenceStarted) {
    log('Teste disponível com jogador vivo e partida em andamento.'); return;
  }
  if (sub === 'spawn' && args.length) { log('Uso: mino spawn'); return; }
  if (sub === 'spawn' && !bosses.length) {
    scene.enemySpawner.spawnByDefId('minotaur', 1);
    bosses = liveBosses(scene);
  }
  let boss = bosses.find(b => b.id === console._minoSelectedId);
  if (!boss && console._minoSelectedId && sub !== 'spawn') {
    log('O Minotauro selecionado morreu/saiu. Use mino spawn ou mino selecionar <ID>.'); return;
  }
  boss ||= bosses.sort((a, b) => Math.hypot(a.x - scene.player.x, a.y - scene.player.y) -
    Math.hypot(b.x - scene.player.x, b.y - scene.player.y))[0];
  if (!boss) { log('Nenhum Minotauro vivo. Use mino spawn.'); return; }
  console._minoSelectedId = boss.id;
  const usage = text => log(`Uso: mino ${text}`);
  if (sub === 'status') {
    log(`${boss.id} | fase ${boss.isEnraged ? 2 : 1} | ${boss.bossState} | HP ${Math.ceil(boss.healthSystem.current)}/${boss.healthSystem.maxHp}`);
    log(`Modo ${boss._devManual ? 'manual' : 'automático'} | imunidade dev ${boss._devInvulnerable ? 'on' : 'off'} | chuva ${boss.meteorRainActive ? 'on' : 'off'}`);
    log(`Fila: ${boss._devQueue || 'vazia'} | repetir: ${boss._devRepeat ? boss._devRepeat.attack + ' / ' + boss._devRepeat.intervalMs / 1000 + 's após terminar' : 'off'} | freeze global ${scene.enemySpawner.frozen ? 'ON' : 'off'}`);
    return;
  }
  if (MINO_ATTACKS.includes(sub) || ['ataque', 'repetir'].includes(sub)) {
    const attack = MINO_ATTACKS.includes(sub) ? sub : args[0];
    const seconds = sub === 'repetir' ? Number(args[1] ?? 2) : 0;
    const validLength = MINO_ATTACKS.includes(sub) ? args.length === 0
      : sub === 'ataque' ? args.length === 1 : args.length >= 1 && args.length <= 2;
    if (!validLength || !MINO_ATTACKS.includes(attack) || !Number.isFinite(seconds) ||
        (sub === 'repetir' && (seconds < 0.5 || seconds > 30))) {
      usage('ataque <' + MINO_ATTACKS.join('|') + '> ou mino repetir <ataque> [0.5..30 segundos]'); return;
    }
    if (scene.enemySpawner.frozen || scene.enemySpawner.halted) { log('Inimigos congelados/em encerramento. Desative freeze ou reinicie a run.'); return; }
    queueMinotaurAttack(boss, attack, seconds * 1000);
    log(`${attack} preparado${seconds ? `, repetindo com ${seconds}s de descanso` : ''}. Feche F9/Esc. Depois ele aguarda em modo manual.`); return;
  }
  if (['fase', 'vida', 'meteoros', 'invencivel'].includes(sub)) {
    if (args.length !== 1) { usage(`${sub} ${sub === 'fase' ? '1|2' : sub === 'vida' ? '<valor|percentual%>' : 'on|off'}`); return; }
  } else if (args.length) { usage(sub); return; }
  switch (sub) {
    case 'trazer': {
      const point = scene.enemySpawner._findBossSpawnPosition();
      stopMinotaur(boss);
      boss.body.reset(point.x, point.y);
      log(`Minotauro em ${Math.round(point.x)}, ${Math.round(point.y)}. Modo manual.`); break;
    }
    case 'spawn': case 'manual': case 'parar':
      stopMinotaur(boss); log(`${boss.id}: modo manual, ataques/chuva cancelados. Use mino investida e feche F9.`); break;
    case 'reset':
      boss._devInvulnerable = false; setMinotaurPhase(boss, 1); log('Reset: fase 1, HP cheio, manual e imunidade dev desligada.'); break;
    case 'fase':
      if (!['1', '2'].includes(args[0])) { usage('fase 1|2'); break; }
      setMinotaurPhase(boss, Number(args[0])); log(`Fase ${args[0]} aplicada, HP ajustado; modo manual, chuva off.`); break;
    case 'transformar':
      if (boss.isEnraged || boss.transformFx || boss._tfPending) { log('Já está na fase 2/em transformação. Use mino fase 1 primeiro.'); break; }
      queueMinotaurAttack(boss, 'transformar'); log('Transformação preparada. Feche F9; depois ele aguarda em modo manual.'); break;
    case 'auto':
      stopMinotaur(boss); boss._devManual = false;
      boss.meteorRainActive = boss.isEnraged;
      boss.meteorNextAt = scene.time.now + boss.def.meteorFirstDelayMs;
      boss.bossChargeReadyAt = boss.stompReadyAt = boss.leapReadyAt = scene.time.now + 800;
      log('IA normal restaurada; chuva acompanha a fase. Imunidade dev preservada.'); break;
    case 'meteoros':
      if (!['on', 'off'].includes(args[0])) { usage('meteoros on|off'); break; }
      if (args[0] === 'on' && !boss.isEnraged) { log('Chuva exige fase 2. Use mino fase 2 ou mino meteoro para uma queda isolada.'); break; }
      boss.meteorRainActive = args[0] === 'on';
      boss.meteorNextAt = scene.time.now + 500;
      if (!boss.meteorRainActive) boss._clearMeteors();
      log(`Chuva ${args[0]}.`); break;
    case 'invencivel':
      if (!['on', 'off'].includes(args[0])) { usage('invencivel on|off'); break; }
      boss._devInvulnerable = args[0] === 'on';
      boss.invulnerable = boss._devInvulnerable || boss.bossState === 'transform' || !!boss._tfPending;
      log(`Imunidade dev do Minotauro ${args[0]}.`); break;
    case 'vida': case 'curar': {
      const hp = boss.healthSystem;
      const amount = sub === 'curar' ? hp.maxHp : args[0].endsWith('%')
        ? Number(args[0].slice(0, -1)) * hp.maxHp / 100 : Number(args[0]);
      if (!Number.isFinite(amount) || amount < 1 || amount > hp.maxHp) { usage(`vida <1..${hp.maxHp}|percentual%>`); break; }
      hp.current = amount;
      boss._onHealthChange(hp.current, hp.maxHp);
      log(`HP ${Math.ceil(hp.current)}/${hp.maxHp}.${boss._tfPending ? ' Transformação normal será iniciada ao fechar F9.' : ''}`); break;
    }
  }
}
