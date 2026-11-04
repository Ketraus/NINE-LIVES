const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/systems/DevCommands.js', 'utf8').replace(/export /g, '');
const { runDevCommand, isTeleportPositionFree, HOST_COMMANDS, COMMAND_NAMES } = vm.runInNewContext(
  source + '\n({runDevCommand,isTeleportPositionFree,HOST_COMMANDS,COMMAND_NAMES});');
// Use the shipped map: destinations must be reachable actual tiles.
const raw = JSON.parse(fs.readFileSync('assets/maps/map.json', 'utf8'));
const layers = new Map(raw.layers.filter(l => l.type === 'tilelayer').map(l => [l.name, l]));
const layerCache = new Map();
function occupied(name, x, y) {
  const l = layers.get(name);
  return !!l?.data[Math.floor(y / raw.tileheight) * raw.width + Math.floor(x / raw.tilewidth)];
}
const map = { width: raw.width, height: raw.height, tileWidth: raw.tilewidth, tileHeight: raw.tileheight,
  widthInPixels: raw.width * raw.tilewidth, heightInPixels: raw.height * raw.tileheight,
  getLayer(name) {
    if (layerCache.has(name)) return layerCache.get(name);
    const layer = layers.get(name);
    if (!layer) return null;
    const result = { tilemapLayer: { hasTileAtWorldXY: (x, y) => occupied(name, x, y) },
      data: Array.from({ length: raw.height }, (_, y) => Array.from({ length: raw.width }, (_, x) =>
        ({ x, y, index: layer.data[y * raw.width + x] ? layer.data[y * raw.width + x] - 1 : -1 }))) };
    layerCache.set(name, result);
    return result;
  }
};
const point = name => raw.layers.find(l => l.type === 'objectgroup').objects.find(o => o.name === name);
const player = { x: point('PlayerSpawn').x, y: point('PlayerSpawn').y, active: true,
  setVelocity(x, y) { this.velocity = [x, y]; },
  healthSystem: { current: 50, maxHp: 100, isDead: () => false,
    heal(n) { this.current += n; }, takeDamage(n) { this.current -= n; } } };
player.body = { x: player.x - 8, y: player.y - 8, width: 16, height: 16,
  reset(x, y) { player.x = x; player.y = y; this.x = x - 8; this.y = y - 8; } };
const scene = { player, mapManager: { map,
  getWorldBounds: () => ({ width: map.widthInPixels, height: map.heightInPixels }),
  getPlayerSpawn: () => point('PlayerSpawn'), getNorthCoastCenter: () => point('NorthCoastCenter'),
  hasBlockingTileAtWorldXY: (x, y) => ['ColisaoJogador', 'Mar', 'LimiteAbsoluto'].some(name => occupied(name, x, y))
} };
const logs = [];
const consoleMock = { scene, _log: line => logs.push(line), runManager: { runState: {} } };
const run = (cmd, ...args) => runDevCommand(consoleMock, cmd, args);
for (const destination of ['praia', 'fim do mundo', 'centro', 'spawn']) {
  run('tp', ...destination.split(' '));
  assert.match(logs.at(destination === 'fim do mundo' ? -2 : -1), /^Teleporte:/, destination);
  assert.ok(isTeleportPositionFree(scene, player.x, player.y));
  if (destination === 'praia') assert.ok(occupied('Costa', player.x, player.y));
  if (destination === 'fim do mundo') assert.ok(occupied('FimDoMapa', player.x, player.y));
}
run('mark', 'base');
const base = { x: player.x, y: player.y };
run('tp', 'praia');
run('tp', 'back');
assert.equal(player.x, base.x); assert.equal(player.y, base.y);
run('tp', '-1', 'NaN');
run('tp', '-100', '100');
assert.equal(player.x, base.x); assert.equal(player.y, base.y);
run('tp', 'base'); run('unmark', 'base'); assert.equal(consoleMock._marks.size, 0);
run('hp', '80'); assert.equal(player.healthSystem.current, 80);
run('hp', '101'); run('damage', 'Infinity'); assert.equal(player.healthSystem.current, 80);
run('damage', '10'); assert.equal(player.healthSystem.current, 70);
run('god', 'on'); assert.equal(player.godMode, true);
run('god', 'off'); assert.equal(player.godMode, false);
run('help', 'navegacao'); assert.ok(logs.some(line => line.includes('tp praia')));
assert.equal(run('unknown'), false);
const consoleSource = fs.readFileSync('src/systems/DevConsole.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default class', 'class');
const DevConsole = vm.runInNewContext(consoleSource + '\nDevConsole;', { HOST_COMMANDS, COMMAND_NAMES, runDevCommand });
const controller = Object.create(DevConsole.prototype);
controller.scene = { multiplayer: { isMultiplayer: true, isRoomHost: false } };
controller._log = line => logs.push(line);
controller._run('spawn grunt 1'); assert.match(logs.at(-1), /host/);
controller.input = { value: 'draft' }; controller._history = ['status', 'tp praia']; controller._historyIndex = 2;
const key = key => controller._onInputKeydown({ key, stopPropagation() {}, preventDefault() {} });
key('ArrowUp'); assert.equal(controller.input.value, 'tp praia');
key('ArrowDown'); assert.equal(controller.input.value, 'draft');
controller.input.value = 'dest'; key('Tab'); assert.equal(controller.input.value, 'destinos ');
console.log('Dev console: real-map destinations, collision, back, marks, input, health and host guard passed.');
