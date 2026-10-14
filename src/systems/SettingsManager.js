const STORAGE_KEY = 'nineLivesSettings';
const DEFAULTS = {
  master: 1,
  music: 1,
  sfx: 1,
  playerSfx: 1,
  reducedMotion: false,
  reducedFlashes: false,
  largeHud: false
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      master: typeof parsed.master === 'number' ? clamp01(parsed.master) : DEFAULTS.master,
      music: typeof parsed.music === 'number' ? clamp01(parsed.music) : DEFAULTS.music,
      sfx: typeof parsed.sfx === 'number' ? clamp01(parsed.sfx) : DEFAULTS.sfx,
      playerSfx: typeof parsed.playerSfx === 'number' ? clamp01(parsed.playerSfx) : DEFAULTS.playerSfx,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : DEFAULTS.reducedMotion,
      reducedFlashes: typeof parsed.reducedFlashes === 'boolean' ? parsed.reducedFlashes : DEFAULTS.reducedFlashes,
      largeHud: typeof parsed.largeHud === 'boolean' ? parsed.largeHud : DEFAULTS.largeHud
    };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

// Volumes de master/música/sfx/player-sfx (0 a 1), salvos no localStorage e
// lidos ao vivo por quem toca som (MusicManager e o patch de sound.play
// abaixo) — não precisa "empurrar" o valor novo pra cada lugar, só mudar
// aqui. sfx é o volume GLOBAL de efeitos (multiplica tudo); playerSfx é só
// os ataques/habilidades do jogador, e é multiplicado POR CIMA do sfx
// global (ver patch abaixo) — sfx=0 sempre silencia tudo, playerSfx só
// reduz a fatia do jogador.
class SettingsManager {
  constructor() {
    this.values = load();
  }

  getMaster() { return this.values.master; }
  getMusic() { return this.values.music; }
  getSfx() { return this.values.sfx; }
  getPlayerSfx() { return this.values.playerSfx; }
  getReducedMotion() { return this.values.reducedMotion; }
  getReducedFlashes() { return this.values.reducedFlashes; }
  getLargeHud() { return this.values.largeHud; }

  setMaster(v) { this.values.master = clamp01(v); this._save(); }
  setMusic(v) { this.values.music = clamp01(v); this._save(); }
  setSfx(v) { this.values.sfx = clamp01(v); this._save(); }
  setPlayerSfx(v) { this.values.playerSfx = clamp01(v); this._save(); }
  setReducedMotion(v) { this.values.reducedMotion = Boolean(v); this._save(); }
  setReducedFlashes(v) { this.values.reducedFlashes = Boolean(v); this._save(); }
  setLargeHud(v) { this.values.largeHud = Boolean(v); this._save(); }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (e) {
      // localStorage indisponível (ex.: modo privado) — settings só duram a sessão
    }
  }
}

const instance = new SettingsManager();

// Um ponto central para as opções que afetam efeitos disparados por várias
// partes do jogo. Assim, a acessibilidade cobre armas, inimigos, boss e telas
// de resultado sem precisar duplicar a mesma condição em cada chamada.
const Camera = Phaser?.Cameras?.Scene2D?.Camera;
if (Camera?.prototype && !Camera.prototype.__nineLivesAccessibilityPatched) {
  const originalShake = Camera.prototype.shake;
  const originalFlash = Camera.prototype.flash;

  Camera.prototype.shake = function shakeWithAccessibility(duration, intensity, force, callback, context) {
    const adjustedIntensity = instance.getReducedMotion() ? intensity * 0.2 : intensity;
    return originalShake.call(this, duration, adjustedIntensity, force, callback, context);
  };

  Camera.prototype.flash = function flashWithAccessibility(duration, red, green, blue, force, callback, context) {
    if (instance.getReducedFlashes()) return this;
    return originalFlash.call(this, duration, red, green, blue, force, callback, context);
  };

  Camera.prototype.__nineLivesAccessibilityPatched = true;
}

// Patch único do sound.play() do Phaser: todo som tocado via
// scene.sound.play(key, {volume}) (SFX de UI, armas, hits etc.) tem seu
// volume multiplicado pelo slider de SFX Global. Chamadas marcadas com
// `player: true` no config (armas e habilidades do jogador — ver
// Weapon.js/RangedWeapon.js/src/abilities/*) levam também o slider de
// Player SFX, multiplicado por cima do global. A música NÃO passa por
// aqui — MusicManager usa sound.add()+play() direto e lê getMusic() por
// conta própria (ver MusicManager.js). Precisa rodar antes do 1º play,
// por isso este módulo é importado logo no início do main.js.
const originalPlay = Phaser.Sound.BaseSoundManager.prototype.play;
Phaser.Sound.BaseSoundManager.prototype.play = function (key, config) {
  const cfg = config || {};
  const playerMultiplier = cfg.player ? instance.getPlayerSfx() : 1;
  const scaled = { ...cfg, volume: (cfg.volume ?? 1) * instance.getSfx() * playerMultiplier };
  delete scaled.player;
  return originalPlay.call(this, key, scaled);
};

export default instance;
