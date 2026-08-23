## RESOLVIDO

**Bug (evolução de cartas não aplicava / vida ficava travada em 140):**
causa raiz era `LevelUpUI._choose()` — ao escolher a 3ª cópia de
"Vitalidade", `RunManager.chooseUpgrade()` emitia `'evolution-ready'` de
forma síncrona, o que já reconstruía o overlay com a carta "COLOSSO" em
destaque, mas logo em seguida `_choose()` chamava `this._close()`
incondicionalmente — fechando/destruindo a carta um instante depois dela
aparecer. O jogador nunca via nem clicava nela, então `confirmEvolution()`
nunca era chamado e o efeito da evolução nunca entrava. Corrigido em
`src/ui/LevelUpUI.js` (só fecha o overlay se `chooseUpgrade()` não
disparou uma evolução) e `src/roguelike/RunManager.js` (`chooseUpgrade`
agora retorna `true`/`false` avisando se há evolução pendente).

**Stacking das cópias antes da evolução:** também corrigido — antes, a
3ª cópia da carta base tinha o efeito propositalmente pulado (só
registrava a cópia, sem aplicar). Agora `chooseUpgrade()` sempre aplica
o efeito da carta normalmente, para toda cópia, e só *depois* verifica
se completou o número de cópias pra oferecer a evolução. Ou seja: as 3
cópias de Vitalidade (+20% cada = +60%) somam normalmente, e COLOSSO
soma seus próprios +150% em cima — nada é apagado.

**Valores do COLOSSO:** ajustados para bater com o pedido — +150% de
vida máxima, -50% de velocidade de movimento, +100% de tamanho do
personagem (`data/upgrades.js`).

**Cartas únicas (Drone, Impacto, Corte Duplo):** já estavam corretas,
nenhuma mudança necessária. Ver seção "Cartas: evolução vs. habilidade
exclusiva" no `README.md` para a explicação de como cada sistema
funciona e como estender os dois.

**Pastas repetidas (`src` dentro de `src`):** removida. Era uma cópia
antiga e desatualizada (faltavam `abilities/` e `weapons/RangedWeapon.js`
que só existem na cópia usada de verdade). `index.html` só carrega
`./src/main.js`, então a pasta aninhada `src/src` não era usada pelo
jogo — só ocupava espaço e podia confundir edições futuras.

---

## RESOLVIDO (2ª rodada — colisão travando/dano de longe no modo Colosso)

Causa: `Player.applySize()` chamava `body.setCircle(raio * scale, offsetX *
scale, offsetY * scale)` — ou seja, já mandava o raio/offset **pré-
multiplicados** pela escala. Só que o Arcade Physics do Phaser trata o
raio/offset passados pra `setCircle()` como valores "de origem" (sem
escala) e aplica a escala atual do sprite **automaticamente** por conta
própria a cada frame. Resultado: a escala era aplicada duas vezes — o
raio de colisão real acabava crescendo com o quadrado do fator de escala
(ex.: sprite 2x maior → hitbox ~4x maior), bem maior que o sprite visível.
Por isso o Colosso "travava" em paredes que visualmente ainda não tinha
tocado e tomava/dava dano com inimigos ainda longe.

Corrigido em `src/entities/Player.js`: `applySize()` agora chama
`setCircle()` sempre com os valores base (sem multiplicar por `scale`) —
o `setScale(scale)` já é suficiente pra crescer a colisão junto com o
sprite, do jeito que o Phaser espera.

---

## IMPLEMENTADO — Evolução da carta Overclock (Overcharge)

**Pedido:** evolução da carta base `dmg_up` (Overclock) após 5 cópias,
com 20% de chance de paralisar o inimigo por 300ms ao acertar, e nome
variando conforme a arma (Punhos: "Impacto Paralisante", Katana: "Corte
Neural", Pistola: "Munição EM").

**`EVOLUTION_STACK_THRESHOLD`:** alterado de 3 para 5 em
`src/roguelike/RunManager.js`. Como é uma constante global (não por
carta), isso também aumenta pra 5 o limiar da evolução já existente
(COLOSSO, evolução de `hp_up`) — não dava pra mudar só a da Overclock
sem transformar o limiar num campo por carta, o que seria mais mudança
de sistema do que o pedido. Mensagens que citavam "3x" no `cheatGiveCard`
e nos comentários foram atualizadas pra usar a constante.

**Nome por arma sem duplicar a carta:** `data/upgrades.js` ganhou uma
única entrada `dmg_up_evo_overcharge` com um novo campo `namesByWeapon`
(mapa `weaponId -> nome`). `RunManager._resolveEvolutionName()` troca o
`name` exibido pela `LevelUpUI` de acordo com `runState.weaponId` no
momento em que a evolução fica pendente — mesmo `id`/`effects` sempre,
só o texto muda. Nenhuma mudança em `LevelUpUI.js` foi necessária.

**Paralisia:** implementada de forma centralizada em
`DamageSystem.applyWeaponHit` (novo 4º parâmetro opcional `nowMs`) em vez
de duplicada em cada arma — `Weapon.js` e `RangedWeapon.js` (as três
armas base: soco, katana, pistola) passam `scene.time.now`; as demais
chamadas de `applyWeaponHit` (contra-ataque de espinhos em
`GameScene.js`, Pancada Sísmica, GatoDrone) não foram tocadas e por isso
não rolam paralisia — só o dano direto das 3 armas evolui com a
Overclock, como pedido. `Enemy.js` ganhou `this.paralyzedUntil = 0` no
construtor e uma checagem no início de `chase()`: enquanto paralisado, o
inimigo zera a velocity e não persegue (mas continua tomando dano/
knockback normalmente).
