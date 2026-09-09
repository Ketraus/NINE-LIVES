import SettingsManager from './SettingsManager.js';

// Volume da música de fundo (0 a 1) e duração do fade ao trocar de faix…
const MUSIC_VOLUME = 0.4;
const FADE_MS = 600;
// fade ao PARAR de vez (ex.: menu -> início da run, sem música de
const STOP_FADE_MS = 3000;
// volume da trilha da tela de cartas (level-up/evolução) — mais baixa e
const CARD_MUSIC_VOLUME = 0.22;
// volume do tema do Minotauro (Boss) — ver playBoss/stopBoss
const BOSS_MUSIC_VOLUME = 0.42;

// Toca a música de fundo do jogo (menu e run) com fade entre as trocas…
class MusicManager {
  constructor() {
    this.currentKey = null;
    this.currentSound = null;
    // trilha da tela de cartas tocando por cima da música de jogo
    this.duckedSound = null;
    // tema do Minotauro (Boss) tocando por cima da música de jogo (que
    // fica em silêncio, ver duckForBoss) — ver playBoss/stopBoss
    this.bossSound = null;
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
    // troca de cena/faixa assume o controle total: corta qualquer overlay
    // que tenha ficado tocando (tema de Boss se o jogador morreu no meio
    // da luta, trilha da tela de cartas) — nunca duas músicas ao mesmo tempo
    this._cutOverlay(scene, this.bossSound);
    this.bossSound = null;
    this._bossDucked = false;
    this._cutOverlay(scene, this.duckedSound);
    this.duckedSound = null;

    const sound = scene.sound.add(key, { loop: true, volume: 0 });
    sound.play();
    scene.tweens.add({ targets: sound, volume: MUSIC_VOLUME * SettingsManager.getMusic(), duration: FADE_MS });

    this.currentKey = key;
    this.currentSound = sound;
  }

  // Fade out curto + stop/destroy de uma faixa "extra" (Boss ou cartas)
  // que porventura tenha ficado tocando na troca de cena — ver play()
  _cutOverlay(scene, sound) {
    if (!sound) return;
    scene.tweens.add({ targets: sound, volume: 0, duration: FADE_MS, onComplete: () => sound.destroy() });
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

  // Tela de cartas (level-up/evolução) abriu: o que estiver tocando —
  // tema do Boss se ele estiver na tela, senão a música de jogo — dá
  // fade e a trilha da tela de cartas sobe por cima (nunca as duas juntas)
  duckForCards(scene) {
    if (this.duckedSound) return; // já ducked (chamada repetida do mesmo open)
    const active = this.bossSound || this.currentSound;
    if (!active) return; // nada tocando, nada a abaixar
    if (!scene.cache.audio.exists('music_card_select')) return; // faixa ainda não adicionada

    scene.tweens.add({ targets: active, volume: 0, duration: FADE_MS });

    const overlay = scene.sound.add('music_card_select', { loop: true, volume: 0 });
    overlay.play();
    scene.tweens.add({ targets: overlay, volume: CARD_MUSIC_VOLUME * SettingsManager.getMusic(), duration: FADE_MS });
    this.duckedSound = overlay;
  }

  // Tela de cartas fechou: a trilha dela dá fade out (e para/destrói) e a
  // que estava tocando antes (Boss ou jogo) volta ao volume normal
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

    const active = this.bossSound || this.currentSound;
    if (active) {
      const targetVolume = (this.bossSound ? BOSS_MUSIC_VOLUME : MUSIC_VOLUME) * SettingsManager.getMusic();
      scene.tweens.add({ targets: active, volume: targetVolume, duration: FADE_MS });
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
    scene.tweens.add({ targets: this.currentSound, volume: MUSIC_VOLUME * SettingsManager.getMusic(), duration: durationMs });
  }

  // Boss (Minotauro) nasceu de verdade (ver SpawnDirector._triggerBossEntrance,
  // logo após o spawnByDefId): a música de jogo já está em silêncio
  // (duckForBoss) — sobe o tema dele com fade in por cima
  playBoss(scene, key = 'music_minotaur') {
    if (this.bossSound) return; // já tocando (chamada repetida)
    if (!scene.cache.audio.exists(key)) return; // faixa ainda não adicionada

    const sound = scene.sound.add(key, { loop: true, volume: 0 });
    sound.play();
    scene.tweens.add({ targets: sound, volume: BOSS_MUSIC_VOLUME * SettingsManager.getMusic(), duration: FADE_MS });
    this.bossSound = sound;
  }

  // Boss morreu/sumiu (ver SpawnDirector._checkBossMusicRestore): o tema
  // dele dá fade out e SÓ DEPOIS que termina de sumir é que a música de
  // jogo volta (via restoreFromBoss) — nunca as duas tocando ao mesmo tempo
  stopBoss(scene, fadeMs = FADE_MS) {
    if (!this.bossSound) {
      this.restoreFromBoss(scene); // sem tema de boss tocando, só restaura a de jogo mesmo
      return;
    }
    const old = this.bossSound;
    this.bossSound = null;
    scene.tweens.add({
      targets: old,
      volume: 0,
      duration: fadeMs,
      onComplete: () => {
        old.stop();
        old.destroy();
        this.restoreFromBoss(scene);
      }
    });
  }

  // Chamado pela SettingsScene ao arrastar o slider de música — ajusta na
  // hora a faixa que estiver tocando de verdade (a ducked, se a tela de
  // cartas estiver aberta; senão a principal), sem esperar o próximo fade.
  applyLiveMusicVolume() {
    if (this.duckedSound) {
      this.duckedSound.volume = CARD_MUSIC_VOLUME * SettingsManager.getMusic();
    } else if (this.bossSound) {
      this.bossSound.volume = BOSS_MUSIC_VOLUME * SettingsManager.getMusic();
    } else if (this.currentSound) {
      this.currentSound.volume = MUSIC_VOLUME * SettingsManager.getMusic();
    }
  }
}

export default new MusicManager();
