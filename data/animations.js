// Placeholder para as definições de animação (this.anims.create) que vão
// entrar quando os spritesheets reais chegarem. Segue o mesmo padrão dos
// outros arquivos em data/ (weapons.js, enemies.js, upgrades.js): só
// exporta dados, nenhuma lógica de jogo. Ainda não é importado por nada —
// quem vai ler isto (ex.: um método _createAnimations() na PreloadScene,
// ou um AnimationManager novo) ainda não existe.
//
// Formato sugerido pra cada entrada (ajuste como preferir na hora de usar
// de verdade — isto é só um guia, não um contrato):
//   {
//     "key": "player_walk",        // nome que this.anims.play('player_walk') vai usar
//     "spritesheetKey": "player",  // chave carregada em PreloadScene.js (this.load.spritesheet)
//     "frames": { "start": 0, "end": 5 },
//     "frameRate": 10,
//     "repeat": -1                 // -1 = looping
//   }
export default [];
