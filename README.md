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

**Importante ao atualizar o projeto**: quando receber uma versão nova,
**substitua a pasta `proto` inteira** (apague a antiga e extraia a
nova) em vez de extrair uma sobre a outra. Extrair por cima deixa
arquivos velhos misturados com os novos — foi exatamente isso que fez
a tela de escolha de arma "sumir" numa versão anterior: sobrou um
`gameConfig.js` antigo do lado do novo, e o `index.html` carregava o
antigo.

## Controles
- **WASD / Setas**: mover
- **Espaço / clique**: atacar (arco melee na direção que você está olhando)
- **R**: reiniciar depois de morrer

## Ciclo implementado
Menu → **Escolha de arma** (Punhos / Espada / Pistola) → Mapa (Tiled) →
Inimigo persegue → Ataque → Dano → Morte → Reiniciar (mantém a arma
escolhida).

Bônus: inimigos derrotados dropam XP → ao subir de nível o jogo pausa e
oferece 3 cartas de upgrade (`data/upgrades.js`).

## Tela de escolha de arma
`WeaponSelectScene` mostra as armas de `data/weapons.js` como cartas
clicáveis e manda pra `GameScene` já com a escolha:
`this.scene.start('GameScene', { weaponId })`. `GameScene` guarda
`this.weaponId` e repassa no restart (tecla R), então morrer não troca
sua arma sem avisar.

A arma escolhida fica em `runState.weaponId` (não é resetada por
`RunState.reset()` de propósito — só o progresso da run zera).
`RunManager._getAvailableUpgrades()` já existe como ponto de extensão
pra filtrar upgrades por arma no futuro; hoje devolve o pool inteiro
sem filtrar nada.

## Editando o mapa no Tiled
`assets/maps/map.json` é um mapa Tiled válido (formato JSON, tileset
embutido em `assets/maps/tileset.png`, 32x32 por tile). Pode abrir
direto no Tiled Map Editor, editar as layers `Ground`/`Walls` e o
objeto de ponto `PlayerSpawn` na layer `Objects`, e salvar de volta —
o Phaser vai ler as mesmas layers automaticamente
(`src/maps/TiledLoader.js`).

### Como montar o mapa no Tiled do zero
Os nomes abaixo precisam bater **exatamente** com o que está em
`src/maps/MapManager.js` (constantes no topo do arquivo — mude lá se
quiser nomes diferentes):

1. **New Map** → orientação Orthogonal, tile size 32x32.
2. **Tileset**: Map > New Tileset, baseado numa imagem (`tileset.png`).
   No campo **Name** do tileset, digite `tileset` (é esse nome que o
   código procura — `TILESET_NAME_IN_TILED` no MapManager).
3. **Tile Layers**: crie duas, nessa ordem, nomeadas exatamente
   `Ground` e `Walls`. `Walls` é a que gera colisão — qualquer tile
   pintado nela vira parede; deixe vazio (gid 0) onde o jogador deve
   andar livre.
4. **Object Layer**: crie uma chamada `Objects`. Dentro dela, insira
   um **Point** e dê o nome `PlayerSpawn` — é onde o jogador nasce.
5. **Export**: File > Export As > `map.json`, salvando em
   `assets/maps/`. Se o nome do tileset-imagem mudar, atualize também
   o `this.load.image('tileset', ...)` em `PreloadScene.js`.

Se algum nome estiver errado, o jogo não falha silenciosamente: o
`TiledLoader` lança um erro explicando exatamente o que renomear (veja
o console do navegador), e o `MapManager` avisa no console (sem
travar o jogo) se não achar o `PlayerSpawn`, nascendo no centro do
mapa como fallback.

### Adicionando outros pontos no mapa (baús, portas, spawns futuros)
`MapManager.getObjectPoint(layerName, objectName)` é genérico — não
precisa de um método novo pra cada tipo de objeto. Basta criar o Point
no Tiled (em qualquer Object Layer) e chamar
`mapManager.getObjectPoint('Objects', 'NomeDoObjeto')` de onde for
usar.

## Balanceamento
`data/enemies.js`, `data/weapons.js` e `data/upgrades.js` são módulos
JS que só exportam um objeto (`export default {...}`) — edite os
números ali sem tocar no resto do código. Viraram `.js` em vez de
`.json` porque o navegador, sem um bundler, não importa `.json`
direto de forma confiável — mas o formato do objeto é idêntico.

**Adicionar uma 4ª arma**: só adicionar uma entrada nova em
`data/weapons.js` (com `id` único) — ela aparece sozinha na tela de
escolha, porque `WeaponSelectScene` itera o array inteiro. Nenhum outro
arquivo precisa mudar.

### Dificuldade / combate
- `src/entities/enemies/EnemySpawner.js`: `SPAWN_INTERVAL_MS` (intervalo
  entre spawns), `MIN_DIST_FROM_PLAYER` (distância mínima de spawn) e
  `MAX_ALIVE` (teto de inimigos vivos ao mesmo tempo — sem isso o mapa
  enche e vira enxame incontrolável).
- `src/entities/Player.js`: `INVULNERABLE_MS` — janela de
  invulnerabilidade (i-frames) depois de tomar qualquer dano de
  contato. Sem i-frame, ficar cercado por vários inimigos ao mesmo
  tempo tira vida de todos simultaneamente, o que deixa o jogo
  injustamente punitivo. O sprite pisca enquanto está invulnerável.
- **Contra-ataque (espinhos)**: `runState.thornsDamage` (base 2,
  definido em `RunState.reset()`) é aplicado de volta no inimigo toda
  vez que ele te acerta de fato (não durante i-frame). Já existe uma
  carta de upgrade "Espinhos" em `data/upgrades.js` que aumenta esse
  valor — é só a base do que você pediu, ainda dá pra crescer
  (ex.: escalar com dano recebido em vez de valor fixo).

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
