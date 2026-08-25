# NINE LIVES

## Como rodar (o básico)

1. Abre a pasta no VS Code.
2. Clica com o botão direito no `index.html` e escolhe **"Open with Live Server"** (ou clica em "Go Live" no canto inferior direito).
3. O jogo abre no navegador. Pronto.

Não precisa instalar nada, nem rodar terminal, nem `npm`. O Phaser vem de um link externo (`index.html`) e o resto é JavaScript puro que o navegador já entende.

**Só funciona com internet** por causa do Phaser. Se não tiver internet:
- Baixa o `phaser.min.js` aqui: https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js
- Coloca dentro de `assets/` e troca o link no `index.html` pelo caminho `assets/phaser.min.js`.

**Importante:** quando atualizar o projeto, **substitua a pasta `proto` inteira** (apaga a antiga e coloca a nova). Extrair por cima mistura arquivos velhos com novos e pode quebrar coisa (já aconteceu).

---

## Controles

- **WASD / Setas**: andar
- **Espaço / clique**: atacar (na direção que você tá olhando)
- **R**: reiniciar depois de morrer

---

## O que já tá funcionando

Menu → escolha de arma (Punhos / Espada / Pistola) → mapa (Tiled) → inimigos perseguem → ataque → dano → morte → reiniciar (mantém a arma escolhida).

Inimigos dropam XP; ao subir de nível, o jogo pausa e mostra 3 cartas de upgrade (`data/upgrades.js`).

---

## Escolha de arma

`WeaponSelectScene` mostra as armas de `data/weapons.js` como cartas clicáveis. Quando você escolhe uma, o jogo guarda e começa a run. Se morrer e apertar `R`, você volta com a mesma arma (não precisa escolher de novo).

---

## Pastas de assets

Já estão organizadas pra receber os arquivos de verdade (sprites, sons, mapas, etc.). Cada pasta abaixo já existe no projeto:

- `assets/maps/` — mapas do Tiled e tilesets
- `assets/sprites/` — sprites de personagens, inimigos, itens
- `assets/fx/` — efeitos visuais (partículas, flashes)
- `assets/sfx/` — sons
- `assets/music/` — música
- `assets/ui/` — ícones, fontes, painéis

Se quiser adicionar uma imagem nova, é só colocar o arquivo na pasta certa e carregar no `PreloadScene.js` (igual já tem pra `player.png`, `enemy.png`, etc.).

---

## Editando o mapa no Tiled

O mapa atual (`assets/maps/map.json`) foi feito no Tiled. Você pode abrir ele, editar as camadas `Ground` (chão) e `Walls` (paredes), e o ponto `PlayerSpawn` na camada `Objects`. Depois é só salvar e exportar como JSON.

Se for criar um mapa do zero:

1. **Novo mapa** → Orientação Orthogonal, tile size 32x32.
2. **Tileset** → adicionar uma imagem (ex: `tileset.png`). No campo **Name**, coloca `tileset` (é o nome que o código procura).
3. **Camadas de tile** → cria duas: `Ground` e `Walls`. A `Walls` gera colisão; qualquer tile pintado ali vira parede.
4. **Camada de objetos** → cria uma chamada `Objects`. Dentro dela, coloca um **Point** com nome `PlayerSpawn` — é onde o jogador nasce.
5. **Exporta** como `map.json` pra dentro de `assets/maps/`.

Se os nomes não baterem, o jogo avisa no console o que tá errado.

---

## Cartas e evoluções

As cartas estão em `data/upgrades.js`. Tem dois tipos principais:

### Evoluções (`category: "evolution"`)
- Uma carta base pode ter um campo `evolvesInto` apontando pra uma carta de evolução.
- Exemplo: `hp_up` (Nove Vidas) evolui pra `hp_up_evo_colosso` (COLOSSO) depois de pegar **5 cópias** da carta base.
- Quando a evolução é ativada, a carta base some do pool de ofertas.

### Habilidades exclusivas (`type: "unlockAbility"`)
- São cartas que só aparecem se você escolheu uma arma específica.
- Exemplo: `fists_slam` (Pancada Sísmica) só aparece pra quem tá de Punhos.
- São únicas — depois de pegar, não aparece de novo.

---

## Balanceamento e ajustes

- `data/enemies.js` — define os inimigos (HP, velocidade, dano, XP, etc.)
- `data/weapons.js` — define as armas (dano, alcance, cooldown, etc.)
- `data/upgrades.js` — define as cartas e evoluções

Você pode editar esses números sem mexer no código do jogo.

---

## Próximos passos (ideias)

- Mais tipos de inimigo (já tem suporte em `enemies.js`)
- Mais armas (basta adicionar em `weapons.js`)
- Mais evoluções (basta adicionar em `upgrades.js`)
- Mapas maiores ou mais salas (o `MapManager` já é genérico)

---
