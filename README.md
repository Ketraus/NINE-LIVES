# NINE LIVES

## Como rodar (o básico)

1. Abre a pasta no VS Code.
2. Clica com o botão direito no `index.html` e escolhe **"Open with Live Server"** (ou clica em "Go Live" no canto inferior direito).
3. O jogo abre no navegador. Pronto.

---

## Controles

- **WASD / Setas**: andar
- **R ou Pressionar na Tela**: reiniciar depois de morrer

---

## Escolha de arma

`WeaponSelectScene` mostra as armas de `data/weapons.js` como cartas clicáveis. Quando você escolhe uma, o jogo guarda e começa a run. Se morrer, você volta com a mesma arma (não precisa escolher de novo).

---

## Pastas de assets

Já estão organizadas pra receber os arquivos de verdade (sprites, sons, mapas, etc.). Cada pasta abaixo já existe no projeto:

- `assets/maps/` — mapas do Tiled e tilesets
- `assets/sprites/` — sprites de personagens, inimigos, itens
- `assets/fx/` — efeitos visuais (partículas, flashes)
- `assets/sfx/` — sons
- `assets/music/` — música
- `assets/ui/` — ícones, fontes, painéis

Para colocar uma imagem nova, é só colocar o arquivo na pasta certa e carregar no `PreloadScene.js` (igual já tem pra `player.png`, `enemy.png`, etc.).

---

## Editando o mapa no Tiled

O mapa atual (`assets/maps/map.json`) foi feito no Tiled. Você pode abrir ele, editar as camadas `Ground` (chão) e `Walls` (paredes), e o ponto `PlayerSpawn` na camada `Objects`. Depois é só salvar e exportar como JSON.

Se for criar um mapa do zero:

1. **Novo mapa** → Orientação Orthogonal, tile size 32x32.
2. **Tileset** → adicionar uma imagem (ex: `tileset.png`). No campo **Name**, coloca `tileset` (é o nome que o código procura).
3. **Camadas de tile** → cria duas: `Ground` e `Walls`. A `Walls` gera colisão; qualquer tile pintado ali vira parede.
4. **Camada de objetos** → cria uma chamada `Objects`. Dentro dela, coloca um **Point** com nome `PlayerSpawn` — é onde o jogador nasce.
5. **Exporta** como `map.json` pra dentro de `assets/maps/`.

   Se der ruim o console avisa.

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

---

## Balanceamento e ajustes

- `data/enemies.js` — define os inimigos (HP, velocidade, dano, XP, etc.)
- `data/weapons.js` — define as armas (dano, alcance, cooldown, etc.)
- `data/upgrades.js` — define as cartas e evoluções

Muito suave mexer.

---

## Próximos passos (ideias)

- Mais tipos de inimigo (já tem suporte em `enemies.js`)
- Mais armas (basta adicionar em `weapons.js`)
- Mais evoluções (basta adicionar em `upgrades.js`)
- Mapas maiores ou mais salas (o `MapManager` já é genérico)

Tá tudo bem organizado, bem bonitinho.

---
