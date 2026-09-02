// Volume da música de fundo (0 a 1) e duração do fade ao trocar de faixa.
const MUSIC_VOLUME = 0.4;
const FADE_MS = 600;

/**
 * Toca a música de fundo do jogo (menu e run) com fade entre as trocas de
 * cena. Singleton (mesmo padrão do EventBus.js) porque precisa lembrar
 * qual faixa está tocando MESMO quando a cena muda (MainMenuScene ->
 * WeaponSelectScene -> GameScene) — o som do Phaser já é global por
 * padrão (this.sys.game.sound), então isto é só um controle fino em cima
 * disso: não reinicia a mesma faixa do zero, e cross-fada ao trocar.
 *
 * Chaves esperadas (ver PreloadScene): 'music_menu', 'music_game'. Os
 * .mp3 ainda não foram adicionados pela Ketlin — até lá, play() não faz
 * nada (silencioso, sem quebrar o jogo). Basta salvar os arquivos em
 * assets/music/ com o nome certo e descomentar as duas linhas em
 * PreloadScene.preload(); nenhum outro lugar do código precisa mudar.
 */
class MusicManager {
  constructor() {
    this.currentKey = null;
    this.currentSound = null;
  }

  /**
   * @param {Phaser.Scene} scene - cena atual (só usada pra ter acesso a
   *   scene.sound/scene.tweens/scene.cache; a faixa em si sobrevive à
   *   troca de cena)
   * @param {string} key - 'music_menu' ou 'music_game'
   */
  play(scene, key) {
    if (this.currentKey === key) return; // já é a faixa tocando, não reinicia
    if (!scene.cache.audio.exists(key)) return; // arquivo ainda não carregado — no-op

    if (this.currentSound) {
      const old = this.currentSound;
      scene.tweens.add({
        targets: old,
        volume: 0,
        duration: FADE_MS,
        onComplete: () => old.stop()
      });
    }

    const sound = scene.sound.add(key, { loop: true, volume: 0 });
    sound.play();
    scene.tweens.add({ targets: sound, volume: MUSIC_VOLUME, duration: FADE_MS });

    this.currentKey = key;
    this.currentSound = sound;
  }

  /** Para a música atual sem tocar outra (ex.: tela de vitória, se quiser silêncio). */
  stop() {
    if (this.currentSound) this.currentSound.stop();
    this.currentKey = null;
    this.currentSound = null;
  }
}

export default new MusicManager();
