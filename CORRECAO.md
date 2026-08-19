/** Problema encontrado na evolução de cartas, assim que o jogador pega 3 cartas do mesmo tipo "Vitalidade" deveria estar vindo a evolução "Colosso", mas ele fica com o estado anterior salvo, ou seja, limite de vida de 140 como se só houvessem 2 cartas de vitalidade escolhidas, é necessário correção na próxima atualização. 
Detalhe: Assim que o jogador pega 3 cartas do mesmo tipo, como por exemplo "Vitalidade" deve vir a cartas "Colosso" ela NÃO APAGA o estado das outras cartas, então o jogador vai possuir os 60% a mais de vida das outras 3 cartas e +150% da vida total do Colosso. 
O Evolução "Colosso" deve ter um aumento de 150% de vida, -50% de Velocidade de Movimento +100% o tamanho do personagem. 
Cartas Únicas estão respondendo corretamente, Drone, Impacto e Corte Duplo estão funcionando Corretamente. 
Adicionar explicação do uso e implementação de ambas nas próximas versões de NINE LIVES*//

