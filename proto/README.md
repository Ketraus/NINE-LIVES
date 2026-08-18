# Protótipo Roguelike (Phaser 3)

## Como rodar (sem instalar nada)

1. Abra a pasta `proto` no VS Code.
2. Clique com o botão direito em `index.html` → **"Open with Live Server"**
   (ou clique em "Go Live" no canto inferior direito).
3. O navegador abre sozinho o jogo. Pronto.

Não precisa de `npm install`, `npm run dev` nem terminal. O Phaser é
carregado direto de um CDN (`index.html`), e o resto do código é
JavaScript puro (ES Modules) que o navegador entende sozinho.

**Só funciona com internet na hora de abrir** (por causa do CDN do
Phaser). Se a escola não tiver internet:
1. Baixe https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js
2. Salve como `assets/phaser.min.js` dentro da pasta `proto`.
3. No `index.html`, troque a linha do `<script src="https://cdn...">`
   por `<script src="assets/phaser.min.js"></script>`.

## Controles
- **WASD / Setas**: mover
- **Espaço / clique**: atacar (arco melee na direção que você está olhando)
- **R**: reiniciar depois de morrer

## Ciclo implementado
Movimento → Mapa (Tiled) → Inimigo persegue → Ataque → Dano → Morte → Reiniciar.

Bônus: inimigos derrotados dropam XP → ao subir de nível o jogo pausa e
oferece 3 cartas de upgrade (`data/upgrades.js`).

## Editando o mapa no Tiled
`assets/maps/map.json` é um mapa Tiled válido (formato JSON, tileset
embutido em `assets/maps/tileset.png`, 32x32 por tile). Pode abrir
direto no Tiled Map Editor, editar as layers `Ground`/`Walls` e o
objeto de ponto `PlayerSpawn` na layer `Objects`, e salvar de volta —
o Phaser vai ler as mesmas layers automaticamente
(`src/maps/TiledLoader.js`).

## Balanceamento
`data/enemies.js`, `data/weapons.js` e `data/upgrades.js` são módulos
JS que só exportam um objeto (`export default {...}`) — edite os
números ali sem tocar no resto do código. Viraram `.js` em vez de
`.json` porque o navegador, sem um bundler, não importa `.json`
direto de forma confiável — mas o formato do objeto é idêntico.

## Onde crescer cada sistema depois
- **XP/level/waves**: `roguelike/RunState.js` e `RunManager.js` já
  guardam `wave`, multiplicadores etc. — hoje só uma fração é usada.
- **Múltiplas armas**: `WeaponManager` já recebe a lista toda de
  `weapons.js`, só usa a primeira — trocar de arma é questão de
  gerenciar qual `Weapon` está ativo.
- **Vários tipos de inimigo/bosses**: `EnemySpawner` já sorteia entre
  todas as entradas de `enemies.js`; hoje só existe uma ("grunt").
- **Salas/progressão**: `MapManager` é a fachada única de mapa — trocar
  de mapa por sala é só chamar `.build()` de novo com outra key.

## O que mudou em relação à versão com Vite
Este projeto foi convertido para rodar sem build (sem Vite/npm):
- Removido `import Phaser from 'phaser'` de todos os arquivos —
  o Phaser agora é carregado como script global no `index.html`
  (variável `Phaser` fica disponível para todo o código).
- `data/*.json` → `data/*.js` (import de JSON puro não é confiável
  sem bundler no navegador).
- Caminhos de assets em `PreloadScene.js` passaram a incluir o
  prefixo `assets/` (antes o Vite fazia esse remapeamento sozinho
  via `publicDir`).
- `vite.config.js` e `package.json` foram removidos por não serem
  mais necessários.
