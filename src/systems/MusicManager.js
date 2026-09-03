// Volume da música de fundo (0 a 1) e duração do fade ao trocar de faixa.
const MUSIC_VOLUME = 0.4;
const FADE_MS = 600;
// fade ao PARAR de vez (ex.: menu -> início da run, sem música de
// gameplay pronta ainda) — mais lento que a troca entre faixas, pedido
// explicitamente em 3s pra não cortar seco.
const STOP_FADE_MS = 3000;

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

    if (!scene.cache.audio.exists(key)) {
      // faixa ainda não adicionada (ver PreloadScene) — não fica tocando
      // a anterior pra sempre, desliga ela com fade de 3s. Assim que o
      // arquivo chegar e for carregado, isto passa a trocar de faixa
      // normalmente sozinho, sem precisar mexer aqui de novo.
      this.stop(scene, STOP_FADE_MS);
      return;
    }

    if (scene.sound.locked) {
      // navegador bloqueia autoplay de áudio até o primeiro clique/toque
      // em QUALQUER lugar da página — sem isso, a música tenta tocar aqui,
      // fica muda, e só "começa" de verdade na cena onde o clique
      // acontece (ex.: o próprio botão de Jogar). Agenda pra tocar assim
      // que destravar, em vez de simplesmente desistir.
      scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.play(scene, key));
      return;
    }

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

  /**
   * Some com a música atual (fade) sem tocar outra no lugar. Usada
   * automaticamente por play() quando a faixa pedida ainda não existe,
   * mas também dá pra chamar direto (ex.: tela de vitória, se quiser
   * silêncio total).
   * @param {Phaser.Scene} scene
   * @param {number} [fadeMs] - duração do fade; padrão 3s
   */
  stop(scene, fadeMs = STOP_FADE_MS) {
    if (!this.currentSound) return;
    const old = this.currentSound;
    scene.tweens.add({
      targets: old,
      volume: 0,
      duration: fadeMs,
      onComplete: () => old.stop()
    });
    this.currentKey = null;
    this.currentSound = null;
  }
}

export default new MusicManager();
