// Curva de dificuldade progressiva ao longo dos 10 minutos de run: em vez
// de degraus discretos, três curvas contínuas (teto de vivos, intervalo
// entre levas e tamanho da leva) definidas por pontos-chave em minutos e
// interpoladas linearmente entre eles (ver SpawnDirector._lerpCurve) —
// suave entre um ponto e outro, mas com liberdade pra ficar bem mais
// íngreme perto do fim só ajustando os pontos, sem mudar a lógica.
//
// Depois do último ponto (10:00) de cada curva, ela fica travada no valor
// final — a run não continua ficando mais difícil pra sempre.
export default {
  // Limite rígido, nunca ultrapassado em hipótese alguma — segunda trava
  // além do próprio último ponto de capCurve já ser 150 (ver
  // SpawnDirector._currentMaxAlive).
  absoluteMaxAlive: 150,

  // Teto de inimigos vivos ao mesmo tempo, por tempo de run (ms -> cap).
  // Valores pedidos explicitamente: começa tranquilo (10), cresce de forma
  // constante até os 8:00 (120) e então acelera nos últimos 2 minutos,
  // fechando em 150 exatamente aos 10:00.
  capCurve: [
    { t: 0, v: 10 }, // 0:00
    { t: 60000, v: 20 }, // 1:00
    { t: 120000, v: 32 }, // 2:00
    { t: 180000, v: 45 }, // 3:00
    { t: 240000, v: 60 }, // 4:00
    { t: 300000, v: 75 }, // 5:00
    { t: 360000, v: 90 }, // 6:00
    { t: 420000, v: 105 }, // 7:00
    { t: 480000, v: 120 }, // 8:00
    { t: 540000, v: 138 }, // 9:00
    { t: 570000, v: 145 }, // 9:30
    { t: 600000, v: 150 } // 10:00
  ],

  // Intervalo entre levas de spawn, por tempo de run (ms -> delay em ms).
  // Acompanha o mesmo espírito da curva de teto (calmo no início, acelera
  // bastante nos últimos 2 minutos), mas separado dela porque é ele quem dá
  // a sensação de "frequência" — sem isso, o jogo só reporia os inimigos
  // mortos devagar mesmo com um teto alto.
  intervalCurve: [
    { t: 0, v: 3500 }, // 0:00 — bem espaçado, início tranquilo
    { t: 60000, v: 2600 }, // 1:00
    { t: 120000, v: 2000 }, // 2:00
    { t: 180000, v: 1600 }, // 3:00
    { t: 240000, v: 1300 }, // 4:00
    { t: 300000, v: 1050 }, // 5:00
    { t: 360000, v: 850 }, // 6:00
    { t: 420000, v: 650 }, // 7:00
    { t: 480000, v: 480 }, // 8:00
    { t: 540000, v: 320 }, // 9:00
    { t: 570000, v: 220 }, // 9:30
    { t: 600000, v: 150 } // 10:00 — quase uma leva a cada 1/7 de segundo: caos
  ],

  // Quantos inimigos cada leva tenta criar, por tempo de run (ms -> qtd).
  // Cresce bem mais devagar que o teto/intervalo — ela só evita que o
  // "déficit" (ver SpawnDirector._spawnBatch) precise fazer todo o trabalho
  // sozinho a cada leva; o grosso da sensação de intensidade vem do
  // intervalo menor.
  batchCurve: [
    { t: 0, v: 2 }, // 0:00
    { t: 120000, v: 3 }, // 2:00
    { t: 300000, v: 4 }, // 5:00
    { t: 480000, v: 5 }, // 8:00
    { t: 540000, v: 6 }, // 9:00
    { t: 600000, v: 8 } // 10:00
  ]
};
