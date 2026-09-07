// Volume da música de fundo (0 a 1) e duração do fade ao trocar de faix…
const MUSIC_VOLUME = 0.4;
const FADE_MS = 600;
// fade ao PARAR de vez (ex.: menu -> início da run, sem música de
const STOP_FADE_MS = 3000;
// volume da trilha da tela de cartas (level-up/evolução) — mais baixa e
const CARD_MUSIC_VOLUME = 0.22;

// Toca a música de fundo do jogo (menu e run) com fade entre as trocas…
class MusicManager {
  constructor() {
    this.currentKey = null;
    this.currentSound = null;
    // trilha da tela de cartas tocando por cima da música de jogo
    this.duckedSound = null;
    // guarda de idempotência da entrada do Boss (ver duckForBoss/
    this._bossDucked = false;
  }

  // scene.sound/scene.tweens/scene.cache; a faixa em si sobrevive à
  play(scene, key) {
    if (this.currentKey === key) return; // já é a faixa tocando, não reinicia

    if (!scene.cache.audio.exists(key)) {
      // faixa ainda não adicionada (ver PreloadScene) — não fica tocando
      this.stop(scene, STOP_FADE_MS);
      return;
    }

    if (scene.sound.locked) {
      // navegador bloqueia autoplay de áudio até o primeiro clique/toque
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

  // Some com a música atual (fade) sem tocar outra no lugar. Usada
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

  // Tela de cartas (level-up/evolução) abriu: a música de jogo dá fade
  duckForCards(scene) {
    if (this.duckedSound) return; // já ducked (chamada repetida do mesmo open)
    if (!this.currentSound) return; // sem música de jogo tocando, nada a abaixar
    if (!scene.cache.audio.exists('music_card_select')) return; // faixa ainda não adicionada

    scene.tweens.add({ targets: this.currentSound, volume: 0, duration: FADE_MS });

    const overlay = scene.sound.add('music_card_select', { loop: true, volume: 0 });
    overlay.play();
    scene.tweens.add({ targets: overlay, volume: CARD_MUSIC_VOLUME, duration: FADE_MS });
    this.duckedSound = overlay;
  }

  // Tela de cartas fechou: a trilha dela dá fade out (e para/destrói) e a
  restoreFromCards(scene) {
    if (!this.duckedSound) return;
    const overlay = this.duckedSound;
    this.duckedSound = null;

    scene.tweens.add({
      targets: overlay,
      volume: 0,
      duration: FADE_MS,
      onComplete: () => overlay.stop()
    });

    if (this.currentSound) {
      scene.tweens.add({ targets: this.currentSound, volume: MUSIC_VOLUME, duration: FADE_MS });
    }
  }

  // Entrada do Boss (ver SpawnDirector._startBossTensionBuildup): a
  duckForBoss(scene, durationMs) {
    if (this._bossDucked) return;
    if (!this.currentSound) return;
    this._bossDucked = true;
    scene.tweens.add({ targets: this.currentSound, volume: 0, duration: durationMs, ease: 'Sine.easeIn' });
  }

  // Fim da entrada do Boss (ver SpawnDirector._triggerBossEntrance): a
  restoreFromBoss(scene, durationMs = FADE_MS) {
    if (!this._bossDucked) return;
    this._bossDucked = false;
    if (!this.currentSound) return;
    scene.tweens.add({ targets: this.currentSound, volume: MUSIC_VOLUME, duration: durationMs });
  }
}

export default new MusicManager();
