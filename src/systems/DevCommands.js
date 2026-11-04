// Console metadata and tools kept separate from the DOM/password lifecycle.
export const COMMAND_HELP = {
  navegacao: [
    'tp praia | fim do mundo | centro | spawn — destino livre no mapa',
    'tp <x> <y> — coordenadas do mundo; recusa água, paredes e limites',
    'tp back — volta ao ponto anterior; tp <nome> — ponto salvo',
    'mark <nome> | unmark <nome> | marks — gerencia pontos desta run',
    'pos — posição atual; destinos — lista os destinos de teleporte'
  ],
  jogador: [
    'status — vida, nível, XP, abates e classe',
    'stats — bônus atuais; hp <valor> — ajusta vida atual (1 até máxima)',
    'damage <valor> — dano direto de teste, ignora god/escudo/redução',
    'heal — cura total; god [on|off] — invencibilidade; kill — mata o jogador'
  ],
  cartas: [
    'list [filtro] — cartas disponíveis da classe; cards — cartas possuídas',
    'give <cartaId> [quantidade] | remove <cartaId> [quantidade]',
    'resetcards — limpa upgrades; xp <quantidade> | levelup [quantidade]'
  ],
  inimigos: [
    'listenemies — definições; enemies — contagem dos inimigos vivos por tipo',
    'spawn <inimigoId> [quantidade] | killall — elimina inimigos',
    'freeze — alterna congelamento; autospawn — alterna levas automáticas'
  ],
  partida: [
    'settime <segundos> — ajusta tempo da run',
    'fim [segundos=595] — prepara teste de vitória',
    'mino [segundos=350] — prepara teste do Minotauro'
  ],
  diagnostico: [
    'mapinfo — dimensões, camadas e texturas; net — estado da conexão e jogadores',
    'perf start | stop — captura desempenho (feche o console durante a captura)',
    'help [categoria|comando] — ajuda; clear — limpa saída; history — histórico',
    '↑/↓ — navega no histórico; Tab — completa comando; close — fecha console'
  ]
};
export const COMMAND_NAMES = [
  'help', 'tp', 'mark', 'unmark', 'marks', 'destinos', 'pos', 'status', 'stats',
  'hp', 'damage', 'heal', 'god', 'kill', 'list', 'cards', 'give', 'remove',
  'resetcards', 'xp', 'levelup', 'listenemies', 'enemies', 'spawn', 'killall',
  'freeze', 'autospawn', 'settime', 'fim', 'mino', 'mapinfo', 'net', 'perf',
  'clear', 'history', 'close'
];
export const HOST_COMMANDS = new Set(['spawn', 'killall', 'freeze', 'autospawn', 'settime', 'fim', 'mino']);

export function showHelp(console, query = '') {
  const term = query.toLowerCase();
  let found = false;
  for (const [category, entries] of Object.entries(COMMAND_HELP)) {
    const lines = !term || category === term ? entries : entries.filter(line =>
      line.split(/[^a-z]+/i).includes(term));
    if (!lines.length) continue;
    found = true;
    console._log(`[${category.toUpperCase()}]`);
    lines.forEach(line => console._log(line));
  }
  if (!found) console._log(`Ajuda não encontrada. Categorias: ${Object.keys(COMMAND_HELP).join(', ')}.`);
}

export function isTeleportPositionFree(scene, x, y) {
  const manager = scene.mapManager;
  const { width, height } = manager.getWorldBounds();
  const body = scene.player.body;
  // Body position can be offset from the sprite origin (feet of the cat).
  const left = (body?.x ?? scene.player.x) - scene.player.x;
  const top = (body?.y ?? scene.player.y) - scene.player.y;
  const right = left + (body?.width ?? 16);
  const bottom = top + (body?.height ?? 16);
  if (![x, y].every(Number.isFinite) || x + left < 0 || y + top < 0 ||
      x + right >= width || y + bottom >= height) return false;
  const step = Math.max(1, Math.min(manager.map.tileWidth, manager.map.tileHeight) / 2);
  for (let dx = left; dx < right + step; dx += step) {
    for (let dy = top; dy < bottom + step; dy += step) {
      const px = x + Math.min(dx, right);
      const py = y + Math.min(dy, bottom);
      if (manager.hasBlockingTileAtWorldXY(px, py) ||
          manager.map.getLayer('Mar')?.tilemapLayer?.hasTileAtWorldXY(px, py)) return false;
    }
  }
  return true;
}

export function teleport(console, args) {
  const scene = console.scene;
  const player = scene.player;
  if (!player?.active || player.isDead || scene.victorySequenceStarted) {
    console._log('Teleporte disponível apenas com jogador vivo, antes da sequência de vitória.');
    return;
  }
  const manager = scene.mapManager;
  const map = manager.map;
  const name = args.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let point;
  let layerName;
  let nearby = false;
  if (args.length === 2 && args.every(value => Number.isFinite(Number(value)))) {
    point = { x: Number(args[0]), y: Number(args[1]) };
  } else if (name === 'back') point = console._previousPosition;
  else if (console._marks?.has(name)) point = console._marks.get(name);
  else if (name === 'spawn') { point = manager.getPlayerSpawn(); nearby = true; }
  else if (name === 'centro') {
    point = { x: map.widthInPixels / 2, y: map.heightInPixels / 2 }; nearby = true;
  } else if (name === 'praia') {
    point = manager.getNorthCoastCenter() || { x: player.x, y: player.y };
    layerName = 'Costa'; nearby = true;
  } else if (['fim', 'fim do mundo', 'fimdomundo'].includes(name)) {
    point = { x: player.x, y: player.y }; layerName = 'FimDoMapa'; nearby = true;
  }
  if (!point) { console._log('Destino não encontrado. Use destinos, marks ou tp <x> <y>.'); return; }
  if (nearby) {
    const data = map.getLayer(layerName || 'chao')?.data;
    let best = null;
    let bestDistance = Infinity;
    // Named destinations use actual occupied tiles, not guessed coordinates.
    for (const row of data || []) for (const tile of row) {
      if (!tile || tile.index < 0) continue;
      const x = (tile.x + 0.5) * map.tileWidth;
      const y = (tile.y + 0.5) * map.tileHeight;
      const distance = (x - point.x) ** 2 + (y - point.y) ** 2;
      if (distance >= bestDistance || !isTeleportPositionFree(scene, x, y)) continue;
      best = { x, y }; bestDistance = distance;
    }
    point = best;
  }
  if (!point || !isTeleportPositionFree(scene, point.x, point.y)) {
    console._log('Destino bloqueado ou fora do mapa. Nenhum teleporte realizado.'); return;
  }
  console._previousPosition = { x: player.x, y: player.y };
  player.body.reset(point.x, point.y);
  player.setVelocity(0, 0);
  player.knockbackUntil = 0;
  console._log(`Teleporte: ${Math.round(point.x)}, ${Math.round(point.y)}.`);
  if (layerName === 'FimDoMapa') console._log('Zona de dano ambiental. Use god on se quiser explorar sem morrer.');
}

export function runDevCommand(console, cmd, args) {
  const scene = console.scene;
  const player = scene.player;
  const state = console.runManager?.runState;
  const log = text => console._log(text);
  switch (cmd) {
    case 'help': showHelp(console, args.join(' ')); break;
    case 'close': console.close(); break;
    case 'clear': console.output.replaceChildren(); break;
    case 'history': (console._history || []).forEach((line, i) => log(`${i + 1}. ${line}`)); break;
    case 'destinos': log('tp praia | fim do mundo | centro | spawn | back | <x> <y> | <ponto salvo>'); break;
    case 'tp': teleport(console, args); break;
    case 'pos': log(`Posição: ${player.x.toFixed(1)}, ${player.y.toFixed(1)} (pixels do mundo).`); break;
    case 'mark': case 'unmark': {
      const name = args[0]?.toLowerCase();
      if (args.length !== 1 || !/^[a-z][a-z0-9_-]{0,31}$/.test(name || '') ||
          ['praia', 'centro', 'spawn', 'fim', 'fimdomundo', 'back'].includes(name)) {
        log('Use um nome sem espaços/acentos (até 32 caracteres), diferente dos destinos padrão.'); break;
      }
      console._marks ??= new Map();
      if (cmd === 'unmark') log(console._marks.delete(name) ? 'Ponto removido.' : 'Ponto não encontrado.');
      else {
        console._marks.set(name, { x: player.x, y: player.y });
        log(`Ponto ${name} salvo. Use tp ${name}.`);
      }
      break;
    }
    case 'marks':
      if (!console._marks?.size) log('Nenhum ponto salvo nesta run. Use mark <nome>.');
      console._marks?.forEach((p, name) => log(`${name}: ${Math.round(p.x)}, ${Math.round(p.y)}`)); break;
    case 'status':
      log(`Classe ${state.weaponId} | nível ${state.level} | XP ${state.xp}/${state.xpToNext} | abates ${state.kills}`);
      log(`HP ${player.healthSystem.current}/${player.healthSystem.maxHp} | god ${player.godMode ? 'on' : 'off'} | ${player.isDead ? 'morto' : 'vivo'}`); break;
    case 'stats':
      ['damageMultiplier', 'speedMultiplier', 'cooldownMultiplier', 'rangeMultiplier',
        'criticalChance', 'criticalDamageMultiplier', 'damageReductionFraction', 'dodgeChance',
        'lifestealFraction', 'sizeMultiplier'].forEach(key => log(`${key}: ${state[key]}`)); break;
    case 'cards': {
      const entries = Object.entries(state.upgradeCounts || {});
      if (!entries.length) log('Nenhuma carta base adquirida.');
      entries.forEach(([id, count]) => log(`${id}: ${count}`));
      log(`IDs adquiridos/evoluções: ${[...(state.ownedUpgradeIds || [])].join(', ') || 'nenhum'}`); break;
    }
    case 'list':
      console.runManager.cheatListCards().filter(line => line.toLowerCase().includes(args.join(' ').toLowerCase()))
        .forEach(log); break;
    case 'hp': case 'damage': {
      const amount = Number(args[0]);
      const hp = player.healthSystem;
      if (args.length !== 1 || !Number.isFinite(amount) || amount <= 0 ||
          (cmd === 'hp' && amount > hp.maxHp)) { log(`Uso: ${cmd} <valor positivo${cmd === 'hp' ? ' até ' + hp.maxHp : ''}>`); break; }
      if (hp.isDead()) { log('Jogador morto; reinicie a run.'); break; }
      if (cmd === 'damage') hp.takeDamage(amount);
      else if (amount > hp.current) hp.heal(amount - hp.current);
      else hp.takeDamage(hp.current - amount);
      log(`HP: ${hp.current}/${hp.maxHp}`); break;
    }
    case 'god':
      if (!args.length) log(console.runManager.cheatToggleGodMode().message);
      else if (args.length === 1 && ['on', 'off'].includes(args[0].toLowerCase())) {
        player.godMode = args[0].toLowerCase() === 'on'; log(`God ${player.godMode ? 'on' : 'off'}.`);
      } else log('Uso: god [on|off]'); break;
    case 'enemies': {
      const counts = new Map();
      for (const enemy of scene.enemySpawner.group.getChildren()) {
        if (enemy.active && !enemy.healthSystem?.isDead()) counts.set(enemy.def.id, (counts.get(enemy.def.id) || 0) + 1);
      }
      if (!counts.size) log('Nenhum inimigo vivo.');
      counts.forEach((count, id) => log(`${id}: ${count}`)); break;
    }
    case 'mapinfo': {
      const map = scene.mapManager.map;
      log(`Mapa: ${map.width}×${map.height} tiles, ${map.widthInPixels}×${map.heightInPixels} pixels.`);
      log(`Camadas: ${map.layers.map(layer => layer.name).join(', ')}`);
      for (const tileset of map.tilesets) log(`${tileset.name}: ${tileset.image?.source?.[0]?.width ?? '?'}×${tileset.image?.source?.[0]?.height ?? '?'}`);
      const gl = scene.game?.renderer?.gl;
      log(`GPU: limite de textura ${gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 'Canvas / indisponível'}`); break;
    }
    case 'net': {
      const mp = scene.multiplayer;
      if (!mp?.isMultiplayer) { log('Modo singleplayer.'); break; }
      log(`${mp.isRoomHost ? 'Host' : 'Cliente'} | MQTT ${mp.mqtt?.connected ? 'conectado' : 'desconectado'} | estado ${mp.matchState}`);
      log(`Jogadores: ${mp.getRoster().join(', ')}`); break;
    }
    default: return false;
  }
  return true;
}
