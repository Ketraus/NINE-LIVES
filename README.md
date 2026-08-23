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

## Estrutura de assets
Pastas prontas pra ir recebendo os assets reais do NINE LIVES — sem
nenhum sistema novo, só organização. Cada pasta abaixo já existe no
projeto (as vazias têm um `.gitkeep` só pra não sumirem do zip/git,
pode apagar o `.gitkeep` assim que colocar o primeiro arquivo de
verdade ali dentro):

- **`assets/maps/`** — tilesets e mapas exportados do Tiled (`.png` dos
  tilesets + `.json` do mapa). Já em uso (`map.json`, `tileset.png`) —
  ver seção "Editando o mapa no Tiled" logo abaixo.
- **`assets/sprites/`** — sprites individuais e spritesheets de
  personagens/inimigos/itens (`player.png`, `enemy.png`, `xp_orb.png`
  etc.). Já em uso.
- **`assets/fx/`** *(nova)* — efeitos visuais: partículas, flashes de
  impacto, rastros de projétil, explosões etc. Hoje só existe um efeito
  (`hit_fx.png`) e ele ainda está em `assets/sprites/` por não ter tido
  onde ir antes — pode ficar onde está (não precisa migrar) ou mudar
  pra cá quando integrar os efeitos de verdade; se mudar, lembre de
  atualizar o caminho em `PreloadScene.js`.
- **`assets/sfx/`** *(nova)* — efeitos sonoros (som de tiro, corte,
  passos, dano, morte, coleta de XP etc.).
- **`assets/music/`** *(nova)* — músicas/trilha sonora (menu, gameplay,
  etc.).
- **`assets/ui/`** *(nova)* — fontes customizadas e assets de interface
  (ícones, painéis, molduras de carta, botões). Hoje toda a UI usa a
  fonte padrão do navegador via `fontSize`/`color` direto no código
  (`HUD.js`, `LevelUpUI.js`, `WeaponSelectScene.js`, `MainMenuScene.js`)
  — sem fonte customizada carregada ainda.
- **`data/animations.js`** *(novo)* — mesmo padrão de `data/weapons.js`
  e `data/enemies.js`: um array vazio, comentado, pronto pra receber as
  definições de animação (`this.anims.create`) quando os spritesheets
  animados chegarem. Ainda não é importado por nada.

**Como referenciar um asset novo depois de colocá-lo na pasta certa**
(sem mudar nada agora — só o fluxo de sempre do projeto):
- Imagens, spritesheets, tilesets e áudio: adicionam uma linha em
  `src/scenes/PreloadScene.js` (`this.load.image(...)`,
  `this.load.spritesheet(...)`, `this.load.audio(...)`), do mesmo jeito
  que `player`/`enemy`/`tileset` já são carregados ali.
- Fonte customizada: também entra no `PreloadScene.js`
  (`this.load.font(...)` ou `this.load.bitmapFont(...)`, dependendo do
  formato da fonte).
- Animações: depois de carregar o spritesheet no `PreloadScene.js`,
  preenche uma entrada em `data/animations.js` e chama
  `this.anims.create(...)` em algum lugar que rode uma vez só (ex.: no
  `create()` do `PreloadScene` ou do `BootScene`) — ainda não existe
  esse ponto no código, é o próximo passo natural quando os
  spritesheets animados chegarem.
- Mapas/tilesets novos: já documentado abaixo, em "Usando mais de um
  tileset".

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

### Usando mais de um tileset
O código já suporta N tilesets na mesma Tile Layer (`Ground` ou
`Walls` podem misturar tiles de tilesets diferentes — o Phaser resolve
sozinho qual tileset cada tile pertence). Pra adicionar um novo:

1. **No Tiled**: Map → New Tileset, aponte pra imagem nova (ex.:
   `props.png`), e em Name coloque algo único (ex.: `props`) —
   diferente do nome de qualquer outro tileset já usado no mapa. Depois
   é só pintar tiles dele normalmente nas layers `Ground`/`Walls`.
2. **Em `src/scenes/PreloadScene.js`**: adicione uma linha carregando a
   imagem, com uma chave única:
   ```js
   this.load.image('props', 'assets/maps/props.png');
   ```
3. **Em `src/maps/MapManager.js`**: acrescente uma entrada na lista
   `TILESETS` no topo do arquivo:
   ```js
   const TILESETS = [
     { imageKey: 'tileset', nameInTiled: 'tileset' },
     { imageKey: 'props', nameInTiled: 'props' }
   ];
   ```
4. Exporte o mapa de novo (File → Export As → `assets/maps/map.json`)
   por cima do antigo.

Se o `nameInTiled` não bater exatamente com o Name configurado no
Tiled (passo 1), o jogo já avisa no console qual tileset não foi
encontrado — não precisa ficar adivinhando.

## Cartas: evolução vs. habilidade exclusiva
Duas mecânicas diferentes convivem em `data/upgrades.js`, ambas
disparadas por `RunManager` e mostradas por `LevelUpUI`:

### Cartas de evolução (`category: "evolution"`)
Uma carta "base" (ex.: `hp_up` / Vitalidade) pode ter um campo
`evolvesInto` apontando pro `id` de uma carta com `category: "evolution"`
(ex.: `hp_up_evo_colosso` / COLOSSO). Fluxo:
1. Cada vez que o jogador escolhe a carta base, `RunManager.chooseUpgrade()`
   aplica o efeito dela **normalmente** (o estado das cópias anteriores
   nunca é apagado — os bônus acumulam).
2. Quando a contagem de cópias bate `EVOLUTION_STACK_THRESHOLD` (hoje 5,
   constante no topo de `RunManager.js`), a evolução é emitida via evento
   `'evolution-ready'` e a `LevelUpUI` mostra **só ela**, em destaque
   dourado, nunca misturada com as 3 opções normais de level-up.
3. A evolução só entra em vigor quando o jogador clica pra confirmar
   (`confirmEvolution()`) — ela tem sua própria lista de `effects`
   (pode dar vários bônus de uma vez: vida, tamanho, velocidade etc.) que
   somam em cima do que a carta base já deu.
4. Depois de confirmada, a carta base some do pool de ofertas (ver
   `RunManager._getAvailableUpgrades()` — checa `ownedUpgradeIds`).

Pra criar uma evolução nova: adicione `evolvesInto` na carta base e uma
entrada nova com `category: "evolution"` + `effects: [...]`. Se algum
efeito precisar mexer direto no Player/scene (não só um número em
`RunState`), adicione um `case` em `RunManager._applyRuntimeEffect()`.

Uma evolução também pode ter `namesByWeapon` (mapa `weaponId -> nome`)
quando ela vale pra qualquer arma mas deve se chamar diferente conforme a
arma da run — mesmo `id`/`effects` o tempo todo, só o texto mostrado na
carta muda (`RunManager._resolveEvolutionName`). Exemplo: `dmg_up_evo_
overcharge` (evolução do Overclock) aparece como "Impacto Paralisante"
com Punhos, "Corte Neural" com Katana e "Munição EM" com Pistola.

### Overcharge (evolução do Overclock — paralisia ao acertar)
`dmg_up` (Overclock) evolui, após 5 cópias, pra `dmg_up_evo_overcharge`:
20% de chance de paralisar o inimigo por 300ms a cada acerto de arma
(soco, corte de katana ou tiro — não conta contra-ataque de espinhos,
Pancada Sísmica nem GatoDrone, ver abaixo). Fluxo:
- `RunState.paralyzeOnHitChance`/`paralyzeOnHitDurationMs` guardam o
  bônus (efeito `paralyzeOnHit` em `RunState._applyEffect`).
- `DamageSystem.applyWeaponHit(target, damage, source, nowMs)` ganhou um
  4º parâmetro opcional `nowMs` — quando presente, `_applyParalyze` rola
  a chance de `source.runState.paralyzeOnHitChance` e, se acertar, seta
  `target.paralyzedUntil = nowMs + duração`. Só `Weapon.js` (soco/katana)
  e `RangedWeapon.js` (pistola) passam `nowMs`; as outras chamadas de
  `applyWeaponHit` (espinhos em `GameScene.js`, `SlamAbility.js`,
  `DroneAbility.js`) continuam sem passar, então nunca procam paralisia —
  de propósito, é só o dano das 3 armas base que ganha o efeito.
- `Enemy.paralyzedUntil` (0 = nunca paralisado) é checado em `chase()`:
  enquanto `nowMs < paralyzedUntil`, o inimigo zera a velocity e não
  persegue (continua tomando dano normalmente).

### Cartas exclusivas / habilidade desbloqueável (`type: "unlockAbility"`)
Cartas como `fists_slam` (Impacto), `katana_double` (Corte Duplo) e
`pistol_drone` (Drone) têm `weaponId` (só aparecem pra quem escolheu
aquela arma na `WeaponSelectScene`) e `type: "unlockAbility"`. Ao serem
escolhidas, `RunState` só registra o `abilityId` em `unlockedAbilities`
e `RunManager` emite `'ability-unlocked'`; quem dá vida à habilidade de
fato é o `AbilityManager` (soco/drone) ouvindo esse evento, ou — no caso
específico da katana — `Weapon.js` lendo `runState.unlockedAbilities`
direto. Diferente das cartas de evolução, cada uma só pode ser tirada
uma vez (`RunManager._getAvailableUpgrades()` filtra as já
desbloqueadas) e não têm cópias/stacks.

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
  entre spawns), `SPAWN_MARGIN_BEYOND_VIEW` (quanto além da borda da
  câmera um inimigo precisa nascer pra garantir que nasce fora da visão)
  e `MAX_ALIVE` (teto de inimigos vivos ao mesmo tempo — sem isso o mapa
  enche e vira enxame incontrolável).
  **O spawn é relativo à câmera, não ao mapa inteiro**: todo inimigo
  nasce num ângulo aleatório ao redor do jogador, fora da área que a
  câmera está mostrando no momento (`_findSpawnPosition()`). Isso é o
  que permite deixar o mapa absurdamente maior sem precisar mexer em
  nada aqui — não importa o tamanho do mapa, os inimigos sempre nascem
  "logo fora da tela", nunca a quilômetros de distância do jogador (o
  que aconteceria se o spawn sorteasse qualquer ponto do mapa inteiro,
  como era antes). Se o mapa ficar muito maior, o que pode valer a pena
  ajustar é `MAX_ALIVE` pra cima (mapa grande com poucos inimigos
  simultâneos pode parecer vazio ao correr por ele).
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

  https://opengameart.org/content/dungeon-crawl-32x32-tiles

  
