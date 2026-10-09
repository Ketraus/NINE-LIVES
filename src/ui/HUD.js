import EventBus from '../systems/EventBus.js';
import MusicManager from '../systems/MusicManager.js';

const SHIELD_BAR_COLOR = 0xffd166; // dourado — precisa contrastar com o gradiente ciano->vermelho da vida,…
const SHIELD_FILL_ALPHA = 0.95; // escudo cobre a barra de vida por cima, então precisa ser bem mais opa…
const HP_BREAK_FLASH_COLOR = 0xffffff;
const HP_BREAK_FLASH_MS = 220; // pisca branco rápido quando o escudo estoura, some sozinho

// barra de vida "terminal": painel de cantos cortados (mesmo estilo do
const HP_PANEL_W = 150;
const HP_PANEL_H = 26;
const HP_CHAMFER = 5;
const HP_BORDER_COLOR = 0x4fd1ff;
const HP_BORDER_ALPHA = 0.7;
const HP_PANEL_FILL = 0x081217;
const HP_PANEL_FILL_ALPHA = 0.35;
const HP_PAD_X = 8;
const HP_TRACK_Y = 18; // distância do topo do painel até a linha da seta
const HP_TRACK_HEIGHT = 2;
const HP_TRACK_COLOR = 0x2a3a40; // trilho fixo, discreto
const HP_TRACK_ALPHA = 0.7;
const HP_FILL_HEIGHT = 7;
const HP_FILL_ALPHA = 0.85;
const HP_ARROW_HEAD_LEN = 8;
const HP_COLOR_HEALTHY = 0x4fd1ff;
const HP_COLOR_DANGER = 0xe33e3e;

// barra de xp: mesmo desenho da barra de vida (painel de cantos cortado…
const XP_PANEL_W = HP_PANEL_W;
const XP_PANEL_H = 16;
const XP_CHAMFER = 4;
const XP_PAD_X = 6;
const XP_TRACK_Y = 11;
const XP_TRACK_HEIGHT = 2;
const XP_FILL_HEIGHT = 5;
const XP_ARROW_HEAD_LEN = 6;
const XP_BORDER_COLOR = 0x6b7f8c;
const XP_BORDER_ALPHA = 0.5;
const XP_PANEL_FILL = 0x0c1216;
const XP_PANEL_FILL_ALPHA = 0.3;
const XP_TRACK_COLOR = 0x2a323a;
const XP_TRACK_ALPHA = 0.6;
const XP_FILL_COLOR = 0x8fa3af;
const XP_FILL_ALPHA = 0.85;

// barra do Boss: mesma linguagem terminal da HUD, mas maior e centralizada
// para funcionar como um elemento de encontro, nÃ£o como mais uma estatÃ­stica.
const BOSS_PANEL_H = 34;
const BOSS_PANEL_Y = 10;
const BOSS_PANEL_CHAMFER = 7;
const BOSS_PANEL_FILL = 0x050b12;
const BOSS_PANEL_FILL_ALPHA = 0.88;
const BOSS_PANEL_BORDER = 0x8fd6ff;
const BOSS_PANEL_BORDER_RAGE = 0x32e9d6;
const BOSS_TRACK_COLOR = 0x1d2632;
const BOSS_TRACK_ALPHA = 0.9;
const BOSS_FILL_NORMAL = 0xb26bff;
const BOSS_FILL_RAGE = 0x32e9d6;
const BOSS_FILL_SHADOW = 0x5f2a85;
const BOSS_FILL_HEIGHT = 8;
const BOSS_TRACK_HEIGHT = 4;
const BOSS_PAD_X = 13;
const BOSS_TRACK_Y = 22;
const BOSS_ARROW_HEAD_LEN = 8;
const BOSS_FADE_MS = 320;
const BOSS_SCAN_INTERVAL_MS = 120;

// tamanho da "achatada" na ponta das setas (vida e xp): sem isso a pont…
const SHARP_TIP_FLAT = 2;

// vinheta de vida baixa: bordas da tela escurecem/avermelham progressiv…
const LOW_HP_THRESHOLD = 0.6; // começa a nascer (bem suave) abaixo de 60% de vida
const LOW_HP_MAX_ALPHA = 0.85; // opacidade da vinheta com vida quase zerada
const LOW_HP_CURVE_POWER = 2; // ease-in: quase 0 logo abaixo do threshold, sobe rápido só perto de 0 hp
const LOW_HP_FADE_MS = 300; // suaviza entrada/saída ao cruzar o threshold
const LOW_HP_PULSE_MAX_AMP = 0.15; // variação de opacidade do pulso
const LOW_HP_PULSE_MS_FAR = 900; // duração do pulso logo abaixo do threshold
const LOW_HP_PULSE_MS_NEAR = 420; // duração do pulso com vida quase zerada (mais urgente)

// sequência de morte: vinheta preta "engolindo" a tela (casada com a
// duração de sfx_death_shutdown, ~2.8s) -> silêncio total -> "Você Morreu"
const DEATH_SOUND_MS = 2800; // duração de sfx_death_shutdown
const DEATH_SILENCE_MS = 500; // silêncio total depois que o som acaba, antes do texto
const DEATH_MUSIC_FADE_MS = 250; // música corta quase junto (tela já apagou)

// colapso estilo monitor CRT desligando: cortinas pretas fecham na vertical
// até sobrar só uma linha fina brilhante, que então encolhe na horizontal
// até virar um ponto e sumir — tudo isso acontece bem no início do som
const DEATH_COLLAPSE_V_MS = 300; // cortinas fechando (vertical)
const DEATH_COLLAPSE_H_MS = 220; // linha encolhendo até um ponto (horizontal)
const DEATH_LINE_HEIGHT = 4; // espessura da linha brilhante
const DEATH_LINE_COLOR = 0x4fd1ff; // mesmo ciano usado na barra de vida/HUD

// vida crítica (<=15%): "chiado" de sinal fraco entra em cena por cima da
// vinheta vermelha — ruído de estática + leve ondulação de CRT + flicker +
// uma pontinha de aberração cromática, pulsando (mesmo esquema de entrada
// suave + pulso acelerado da vinheta, ver _updateLowHpVignette) cada vez
// mais rápido e mais forte quanto mais perto de 0 hp. Mexe só na câmera
// principal (ver _setupCameraFx) — desligado o resto do tempo.
const CRITICAL_HP_THRESHOLD = 0.15;
const CRITICAL_STATIC_MAX = 0.32; // intensidade do chiado com vida quase zerada
const CRITICAL_WAVE_AMP_MAX = 0.0055; // ondulação nitidamente mais forte que a do menu
const CRITICAL_FLICKER_AMOUNT_MAX = 0.14;
const CRITICAL_CHROMATIC_SHIFT_MAX = 3.5;
const CRITICAL_PULSE_MS_FAR = 750; // pulso logo abaixo do limiar
const CRITICAL_PULSE_MS_NEAR = 260; // pulso com vida quase zerada (mais urgente)
const CRITICAL_FADE_MS = 300; // suaviza entrada/saída ao cruzar o limiar

// arremate do "monitor desligando" na morte: um estouro de chiado +
// aberração cromática + ondulação instável (o "estalo" elétrico do
// desligar), sincronizado com as cortinas fechando e depois zerado junto
// com o preto sólido — ver _burstDeathFx/_resetCameraFx.
const DEATH_STATIC_PEAK = 0.75;
const DEATH_STATIC_ATTACK_MS = 70; // sobe bem rápido, quase instantâneo
const DEATH_CHROMATIC_PEAK = 7;
const DEATH_WAVE_AMP_PEAK = 0.02;
const DEATH_WAVE_FREQ_PEAK = 22;
const DEATH_FLICKER_AMOUNT_PEAK = 0.5;
const DEATH_FX_DECAY_MS = DEATH_COLLAPSE_V_MS; // cai junto com as cortinas fechando
const DEATH_SHAKE_MS = 90;
const DEATH_SHAKE_INTENSITY = 0.006;

// pulso de espessura na linha brilhante bem antes dela encolher até virar
// um ponto — surto do feixe de elétrons descarregando, sutil mas dá peso.
const DEATH_LINE_BOUNCE_SCALE_Y = 1.6;
const DEATH_LINE_BOUNCE_MS = 70;

// "ponto de fósforo": brilho residual (gradiente radial, textura gerada 1x)
// que acende bem no centro quando a linha termina de encolher e apaga logo
// em seguida — o toque final clássico de tubo CRT descarregando.
const DEATH_AFTERGLOW_SIZE = 140;
const DEATH_AFTERGLOW_FADE_MS = 320;

// tela de "Você Morreu": os mesmos filtros retrô do menu principal (ver
// MainMenuScene._setupRetroFx) voltam bem devagar, tipo o sistema CRT
// sendo religado depois do apagão — nada de aparecer tudo de uma vez
// junto com o texto (ver _startGameOverFx/_applyGameOverFx). Um ruído
// branco bem baixinho entra no mesmo ritmo, como o chiado residual de um
// tubo ligado de novo (ver _playDeathNoise). Valores "ligado" = mesmos
// defaults usados no menu.
const GAMEOVER_FX_RAMP_MS = 2600;

// "VOCÊ MORREU"/vitória: uma informação de cada vez, nunca duas ao mesmo
// tempo na tela (ver _playBigMessage) — entra sozinha com presença, existe
// sozinha, sai por completo, só então o relatório (ResultUI) começa a
// entrar. A dica de reiniciar/escolher arma só aparece no fim de tudo,
// depois que o placar final do ResultUI termina (ver 'result-complete').
const BIG_MESSAGE_FADE_IN_MS = 650;
const BIG_MESSAGE_START_SCALE = 0.85;
const BIG_MESSAGE_HOLD_MS = 1500;
const BIG_MESSAGE_FADE_OUT_MS = 350;
const BIG_MESSAGE_EXIT_SCALE = 0.92;
// impacto do "VOCÊ MORREU": entra grande e despenca no lugar (slam), tela
// treme + clarão + estrondo, cópias RGB convergem, fica pulsando com glitch
// e sai colapsando como monitor desligando (mesmo motivo da sequência de morte)
const DEATH_SLAM_START_SCALE = 2.8;
const DEATH_SLAM_MS = 150;
const DEATH_SHAKE_IMPACT_MS = 380;
const DEATH_SHAKE_IMPACT_INTENSITY = 0.018;
const DEATH_HOLD_MS = 2200;
const DEATH_GHOST_START_OFFSET = 46;
const DEATH_GHOST_OFFSET = 4;
const DEATH_WASH_ALPHA = 0.32;
const DEATH_TITLE_COLOR = '#ffffff';
const DEATH_GHOST_RED = '#ff2a45';
const DEATH_GHOST_CYAN = '#4fd1ff';
const GAMEOVER_BLOOM_THRESHOLD = 0.72;
const GAMEOVER_BLOOM_RADIUS = 1.6;
const GAMEOVER_BLOOM_INTENSITY = 0.18;
const GAMEOVER_WAVE_AMPLITUDE = 0.0012;
const GAMEOVER_WAVE_FREQUENCY = 9;
const GAMEOVER_WAVE_SPEED = 0.9;
const GAMEOVER_GHOST_DECAY = 0.55;
// threshold "desligado" fica logo abaixo de 1 (nunca em 1.0 exato — o
// shader do GhostTrail faz smoothstep(threshold, 1.0, lum), e com os dois
// limites iguais isso vira divisão por zero/NaN)
const GAMEOVER_GHOST_THRESHOLD_OFF = 0.98;
const GAMEOVER_GHOST_THRESHOLD_ON = 0.6;
const GAMEOVER_SCANLINES_DARK = 0.12;
const GAMEOVER_CHROMATIC_SHIFT = 1.5;
const GAMEOVER_FLICKER_RATE = 4;
const GAMEOVER_FLICKER_AMOUNT = 0.05;
const GAMEOVER_NOISE_VOLUME = 0.008; // bem bem baixo — só uma ambientação atrás do texto

// "sistema acabando": quanto mais perto da morte, mais baixa a música —
// bem sutil logo abaixo do limiar (quase imperceptível), caindo rápido só
// perto de 0 hp, até praticamente sumir por volta de ~10% de vida (ver
// HUD._musicDuckFactor/MusicManager.setHpDuckFactor). Limiar propositalmente
// mais alto que o da vinheta/chiado — o ouvido percebe volume bem antes do
// olho perceber uma vinheta, então a curva precisa começar mais cedo e ser
// bem mais gradual pra não soar como um corte.
const MUSIC_DUCK_THRESHOLD = 0.5;
const MUSIC_DUCK_CURVE_POWER = 1.5;
const MUSIC_DUCK_TWEEN_MS = 450; // suaviza cada ajuste (tomou dano -> nova vida -> novo alvo)

// layout vertical do resto da HUD. Escudo não tem mais linha própria —
const XP_Y = 16 + HP_PANEL_H + 6;

// UI puramente reativa: só escuta EventBus e desenha. Não tem
export default class HUD {
  constructor(scene) {
    this.scene = scene;

    // Container único pra todo o HUD "fixo na tela" — ver _applyZoomCompens…
    // Fica acima do gameplay e dos FX, mas abaixo das telas modais.
    this.uiContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(150);

    this._buildHealthBar();
    this._buildXpBar();
    this._buildKillCounter();
    this._buildRunTimer();
    this._buildBossBar();
    this._buildGameOverText();
    this._buildWinText();
    this._buildLowHpVignette();
    this._setupCameraFx();
    // ducking de música pela vida (ver _updateMusicDuck) — independe de
    // WebGL, então nasce fora do _setupCameraFx
    this._musicDuckProxy = { value: 1 };

    // gameOverGroup/winGroup/deathOverlayGroup são containers à parte (ver
    // _buildGameOverText/_buildDeathOverlay), cada um com sua própria depth
    this._applyZoomCompensation(this.uiContainer);
    this._applyZoomCompensation(this.gameOverGroup);
    this._applyZoomCompensation(this.winGroup);
    this._applyZoomCompensation(this.deathOverlayGroup);

    this._bindEvents();
  }

  // BUG (zoom no celular): GameScene dá setZoom(1.4) na câmera em telas
  _applyZoomCompensation(container) {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    if (zoom === 1) return;
    const inv = 1 / zoom;
    container.setScale(inv);
    container.setPosition(cam.centerX * (1 - inv), cam.centerY * (1 - inv));
  }

  _buildHealthBar() {
    const x = 16;
    const y = 16;

    // painel (borda + fundo), desenhado uma vez só
    this.hpPanel = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    HUD._drawChamferedRect(
      this.hpPanel,
      x,
      y,
      HP_PANEL_W,
      HP_PANEL_H,
      HP_CHAMFER,
      HP_PANEL_FILL,
      HP_PANEL_FILL_ALPHA,
      HP_BORDER_COLOR,
      HP_BORDER_ALPHA
    );

    // trilho fixo (linha fina até a borda direita, com seta na ponta) —
    const trackMaxW = HP_PANEL_W - HP_PAD_X * 2;
    HUD._drawArrowShape(
      this.hpPanel,
      x + HP_PAD_X,
      y + HP_TRACK_Y,
      trackMaxW,
      HP_TRACK_HEIGHT,
      HP_ARROW_HEAD_LEN,
      HP_TRACK_COLOR,
      HP_TRACK_ALPHA
    );

    // seta grossa: vida atual, redesenhada a cada 'player-health-changed'
    this.hpFill = this.scene.add.graphics().setScrollFactor(0).setDepth(101);
    this._hpOrigin = { x: x + HP_PAD_X, y: y + HP_TRACK_Y };
    this._hpMaxW = trackMaxW;

    // overlay do escudo (carta "Escudo Energético"): mesma seta, por cima da
    this.shieldFill = this.scene.add.graphics().setScrollFactor(0).setDepth(102);
    this._hadShield = false; // pra detectar a transição "tinha escudo -> estourou" e disparar o flash

    // flash branco rápido sobre o painel inteiro, usado só no momento em
    this.hpBreakFlash = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(103)
      .setAlpha(0);
    HUD._drawChamferedRect(
      this.hpBreakFlash,
      x,
      y,
      HP_PANEL_W,
      HP_PANEL_H,
      HP_CHAMFER,
      HP_BREAK_FLASH_COLOR,
      1,
      HP_BREAK_FLASH_COLOR,
      0
    );

    this.hpText = this.scene.add
      .text(x + HP_PANEL_W + 8, y + HP_TRACK_Y - 6, '', { fontSize: '11px', color: '#cfeaff' })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);

    this.uiContainer.add([this.hpPanel, this.hpFill, this.shieldFill, this.hpBreakFlash, this.hpText]);
  }

  // Redesenha só a seta de vida atual (o painel e o trilho são estáticos).
  _drawHpFill(ratio) {
    this.hpFill.clear();
    const fillW = this._hpMaxW * ratio;
    const color = HUD._hpColor(ratio);
    HUD._drawArrowShape(
      this.hpFill,
      this._hpOrigin.x,
      this._hpOrigin.y,
      fillW,
      HP_FILL_HEIGHT,
      HP_ARROW_HEAD_LEN,
      color,
      HP_FILL_ALPHA
    );
  }

  // Redesenha o overlay de escudo por cima da barra de vida.
  _drawShieldFill(ratio) {
    this.shieldFill.clear();
    if (ratio <= 0) return;
    HUD._drawArrowShape(
      this.shieldFill,
      this._hpOrigin.x,
      this._hpOrigin.y,
      this._hpMaxW * ratio,
      HP_FILL_HEIGHT,
      HP_ARROW_HEAD_LEN,
      SHIELD_BAR_COLOR,
      SHIELD_FILL_ALPHA
    );
  }

  // Feedback rápido de "escudo quebrou": pisca branco e some, a barra vol…
  _flashShieldBreak() {
    this.hpBreakFlash.setAlpha(0.6);
    this.scene.tweens.add({
      targets: this.hpBreakFlash,
      alpha: 0,
      duration: HP_BREAK_FLASH_MS,
      ease: 'Cubic.easeOut'
    });
  }

  // Gradiente radial (canvas texture, gerado 1x) cobrindo a tela toda,
  // transparente no centro e vermelho escuro nas bordas. Fica dentro do
  // uiContainer pra herdar a mesma compensação de zoom do resto da HUD.
  _buildLowHpVignette() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const key = 'hud_low_hp_vignette';

    if (!this.scene.textures.exists(key)) {
      const canvasTexture = this.scene.textures.createCanvas(key, w, h);
      const ctx = canvasTexture.getContext();
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy);
      const grad = ctx.createRadialGradient(cx, cy, maxR * 0.45, cx, cy, maxR);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      canvasTexture.refresh();
    }

    this.lowHpVignette = this.scene.add
      .image(w / 2, h / 2, key)
      .setScrollFactor(0)
      .setDepth(130)
      .setAlpha(0);
    this._lowHpActive = false;
    this.uiContainer.add(this.lowHpVignette);

    this._buildDeathOverlay(w, h);
  }

  // Retângulo preto cobrindo a tela toda (fallback/base), mais duas
  // "cortinas" pretas e uma linha fina brilhante que fazem o efeito de
  // monitor CRT desligando (ver player-died). Container próprio (não dentro
  // de uiContainer, que tem depth 0 — jogador/inimigos têm depth maior que
  // isso e apareceriam por cima do preto) com depth alta o suficiente pra
  // ficar acima de tudo do gameplay, mas abaixo do texto "Você Morreu"
  // (gameOverGroup, depth 200).
  _buildDeathOverlay(w, h) {
    this.deathOverlayGroup = this.scene.add.container(0, 0).setDepth(195);
    this.deathOverlay = this.scene.add
      .rectangle(w / 2, h / 2, w, h, 0x000000, 1)
      .setScrollFactor(0)
      .setAlpha(0);

    const halfCurtainH = h / 2 - DEATH_LINE_HEIGHT / 2;
    this.deathCurtainTop = this.scene.add
      .rectangle(0, 0, w, halfCurtainH, 0x000000, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setScale(1, 0);
    this.deathCurtainBottom = this.scene.add
      .rectangle(0, h, w, halfCurtainH, 0x000000, 1)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setScale(1, 0);
    this.deathCollapseLine = this.scene.add
      .rectangle(w / 2, h / 2, w, DEATH_LINE_HEIGHT, DEATH_LINE_COLOR, 1)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    // ponto de fósforo residual (ver constantes DEATH_AFTERGLOW_*) — nasce
    // junto com o resto da sequência pra já entrar na primeira varredura
    // de refreshIgnoreList() da pauseCam (ver PauseUI), igual às outras peças.
    const glowKey = 'hud_death_afterglow';
    if (!this.scene.textures.exists(glowKey)) {
      const size = DEATH_AFTERGLOW_SIZE;
      const canvasTexture = this.scene.textures.createCanvas(glowKey, size, size);
      const ctx = canvasTexture.getContext();
      const r = size / 2;
      const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.35, 'rgba(150,230,255,0.55)');
      grad.addColorStop(1, 'rgba(79,209,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvasTexture.refresh();
    }
    this.deathAfterglow = this.scene.add
      .image(w / 2, h / 2, glowKey)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    this.deathOverlayGroup.add([
      this.deathOverlay,
      this.deathCurtainTop,
      this.deathCurtainBottom,
      this.deathCollapseLine,
      this.deathAfterglow
    ]);
  }

  // Efeitos de câmera pilotados pela vida crítica (_updateCriticalFx), pelo
  // estouro da morte (_burstDeathFx) e pela recuperação progressiva do
  // "Você Morreu" (_startGameOverFx): a mesma pilha de filtros do menu
  // principal (ver MainMenuScene._setupRetroFx) + o chiado de estática
  // (StaticNoise, só nosso). Tudo nasce "desligado" — gameplay normal fica
  // limpa, só a HUD liga isso, então fica tudo num lugar só. Bloom e
  // GhostTrail (os dois pesados — GhostTrail usa render targets próprios)
  // ficam com active=false até a tela de morte, pra não pagar esse custo
  // nos ~10 minutos de gameplay; os outros são passe único e baratos o
  // bastante pra ficar sempre ligados (a 0, então imperceptíveis).
  // Precisa de WebGL; em Canvas o jogo roda igual, só sem esses efeitos
  // extras (mesma guarda usada no menu/pausa).
  _setupCameraFx() {
    this._criticalFxProxy = { value: 0 };
    this._gameOverFxProxy = { value: 0 };
    if (this.scene.renderer.type !== Phaser.WEBGL) return;

    const cam = this.scene.cameras.main;
    cam.setPostPipeline(['Bloom', 'CrtWave', 'GhostTrail', 'Scanlines', 'ChromaticAberration', 'Flicker', 'StaticNoise']);

    this._bloomFx = cam.getPostPipeline('Bloom');
    this._bloomFx.setThreshold(GAMEOVER_BLOOM_THRESHOLD).setRadius(GAMEOVER_BLOOM_RADIUS).setIntensity(0);
    this._bloomFx.active = false;

    this._crtWaveFx = cam.getPostPipeline('CrtWave');
    this._crtWaveFx.setAmplitude(0).setFrequency(9).setSpeed(0.9);

    this._ghostTrailFx = cam.getPostPipeline('GhostTrail');
    this._ghostTrailFx.setDecay(GAMEOVER_GHOST_DECAY).setThreshold(GAMEOVER_GHOST_THRESHOLD_OFF);
    this._ghostTrailFx.active = false;

    this._scanlinesFx = cam.getPostPipeline('Scanlines');
    this._scanlinesFx.setLineHeight(2).setDarkAmount(0);

    this._chromaticFx = cam.getPostPipeline('ChromaticAberration');
    this._chromaticFx.setMaxShift(0);

    this._flickerFx = cam.getPostPipeline('Flicker');
    this._flickerFx.setRate(GAMEOVER_FLICKER_RATE).setAmount(0);

    this._staticFx = cam.getPostPipeline('StaticNoise');
    this._staticFx.setIntensity(0);

    this.scene.events.once('shutdown', () => {
      cam.resetPostPipeline();
      this._stopDeathNoise();
    });
  }

  // ratio = vida atual/máxima (0..1). Mesmo esquema de entrada suave +
  // pulso acelerado da vinheta (_updateLowHpVignette), só que abaixo de um
  // limiar mais apertado e pilotando os pipelines de câmera em vez de uma
  // imagem — "sinal enfraquecendo" em vez de "vinheta vermelha".
  _updateCriticalFx(ratio) {
    if (!this._staticFx) return; // sem WebGL, esses pipelines nem existem

    this.scene.tweens.killTweensOf(this._criticalFxProxy);
    const belowThreshold = ratio > 0 && ratio <= CRITICAL_HP_THRESHOLD;

    if (!belowThreshold) {
      this.scene.tweens.add({
        targets: this._criticalFxProxy,
        value: 0,
        duration: CRITICAL_FADE_MS,
        ease: 'Cubic.easeOut',
        onUpdate: () => this._applyCriticalFx(this._criticalFxProxy.value)
      });
      return;
    }

    // s = 0 no limiar (entrando), s = 1 quase morto — mesma ideia da
    // vinheta: elevar s (não ratio/limiar direto) garante começo suave.
    const s = 1 - ratio / CRITICAL_HP_THRESHOLD;
    const intensity = Math.pow(s, 2);
    const pulseAmp = intensity * 0.4;
    const pulseMs = Phaser.Math.Linear(CRITICAL_PULSE_MS_FAR, CRITICAL_PULSE_MS_NEAR, intensity);

    this._criticalFxProxy.value = intensity;
    this._applyCriticalFx(intensity);
    this.scene.tweens.add({
      targets: this._criticalFxProxy,
      value: Math.min(intensity + pulseAmp, 1),
      duration: pulseMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => this._applyCriticalFx(this._criticalFxProxy.value)
    });
  }

  // Espalha um valor 0..1 pelos uniforms dos pipelines de vida crítica —
  // chiado, ondulação, flicker e aberração cromática sobem juntos,
  // proporcionalmente ao mesmo valor.
  _applyCriticalFx(v) {
    this._staticFx.setIntensity(v * CRITICAL_STATIC_MAX);
    this._crtWaveFx.setAmplitude(v * CRITICAL_WAVE_AMP_MAX);
    this._flickerFx.setAmount(v * CRITICAL_FLICKER_AMOUNT_MAX);
    this._chromaticFx.setMaxShift(v * CRITICAL_CHROMATIC_SHIFT_MAX);
  }

  // Estouro de chiado + aberração cromática + ondulação instável + flicker
  // no instante da morte (o "estalo" elétrico do desligar) — sobe quase
  // instantâneo e decai junto com as cortinas fechando (DEATH_FX_DECAY_MS).
  _burstDeathFx() {
    if (!this._staticFx) return; // sem WebGL

    this._staticFx.setIntensity(DEATH_STATIC_PEAK);
    this._chromaticFx.setMaxShift(DEATH_CHROMATIC_PEAK);
    this._crtWaveFx.setAmplitude(DEATH_WAVE_AMP_PEAK).setFrequency(DEATH_WAVE_FREQ_PEAK);
    this._flickerFx.setAmount(DEATH_FLICKER_AMOUNT_PEAK);

    const proxy = { value: 1 };
    this.scene.tweens.add({
      targets: proxy,
      value: 0,
      delay: DEATH_STATIC_ATTACK_MS,
      duration: Math.max(DEATH_FX_DECAY_MS - DEATH_STATIC_ATTACK_MS, 1),
      ease: 'Cubic.easeIn',
      onUpdate: () => {
        this._staticFx.setIntensity(DEATH_STATIC_PEAK * proxy.value);
        this._chromaticFx.setMaxShift(DEATH_CHROMATIC_PEAK * proxy.value);
        this._crtWaveFx.setAmplitude(DEATH_WAVE_AMP_PEAK * proxy.value);
        this._flickerFx.setAmount(DEATH_FLICKER_AMOUNT_PEAK * proxy.value);
      }
    });
  }

  // Zera todos os efeitos de câmera (crítico + morte + recuperação do game
  // over) de volta pro estado "desligado" de gameplay normal — chamado
  // quando a tela já está preta sólida (some o estouro da morte por baixo
  // do "Você Morreu") e também no restart, pra não vazar nada pra próxima run.
  _resetCameraFx() {
    if (!this._staticFx) return; // sem WebGL, esses pipelines nem existem
    this._bloomFx.setIntensity(0);
    this._bloomFx.active = false;
    this._crtWaveFx.setAmplitude(0).setFrequency(9).setSpeed(0.9);
    this._ghostTrailFx.setThreshold(GAMEOVER_GHOST_THRESHOLD_OFF);
    this._ghostTrailFx.active = false;
    this._scanlinesFx.setDarkAmount(0);
    this._chromaticFx.setMaxShift(0);
    this._flickerFx.setAmount(0);
    this._staticFx.setIntensity(0);
  }

  // Espalha 0..1 pelos mesmos filtros "retrô" do menu principal — chamado
  // bem devagar (GAMEOVER_FX_RAMP_MS) depois que o "Você Morreu" aparece,
  // pra dar a sensação de sistema CRT sendo religado aos poucos, nunca um
  // flash junto com o texto.
  _applyGameOverFx(v) {
    this._bloomFx.setIntensity(v * GAMEOVER_BLOOM_INTENSITY);
    this._crtWaveFx
      .setAmplitude(v * GAMEOVER_WAVE_AMPLITUDE)
      .setFrequency(GAMEOVER_WAVE_FREQUENCY)
      .setSpeed(GAMEOVER_WAVE_SPEED);
    this._ghostTrailFx.setThreshold(Phaser.Math.Linear(GAMEOVER_GHOST_THRESHOLD_OFF, GAMEOVER_GHOST_THRESHOLD_ON, v));
    this._scanlinesFx.setDarkAmount(v * GAMEOVER_SCANLINES_DARK);
    this._chromaticFx.setMaxShift(v * GAMEOVER_CHROMATIC_SHIFT);
    this._flickerFx.setAmount(v * GAMEOVER_FLICKER_AMOUNT);
  }

  // Liga a recuperação progressiva dos filtros retrô (Bloom/GhostTrail só
  // voltam a ficar active aqui — ver _setupCameraFx) + o ruído branco
  // baixinho por trás do "Você Morreu". Chamado uma vez, quando o texto
  // começa a aparecer.
  _startGameOverFx() {
    if (this._staticFx) {
      this._bloomFx.active = true;
      this._ghostTrailFx.active = true;
      this._gameOverFxProxy.value = 0;
      this.scene.tweens.add({
        targets: this._gameOverFxProxy,
        value: 1,
        duration: GAMEOVER_FX_RAMP_MS,
        ease: 'Sine.easeInOut',
        onUpdate: () => this._applyGameOverFx(this._gameOverFxProxy.value)
      });
    }

    // this._playDeathNoise(); // Ruído removido da tela de pontuação
  }

  // Ruído branco gerado na hora via Web Audio (sem asset): um
  // AudioBufferSourceNode em loop, com o ganho subindo devagar junto com
  // os filtros (mesmo GAMEOVER_FX_RAMP_MS) até um volume bem baixinho —
  // só uma ambientação atrás do texto, o chiado residual de um tubo ligado
  // de novo. Só funciona com WebAudioSoundManager (this.scene.sound.context
  // existe); no fallback HTML5Audio (raro) simplesmente não toca nada.
  _playDeathNoise() {
    const ctx = this.scene.sound.context;
    if (!ctx) return;

    const bufferSeconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * bufferSeconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(gain).connect(ctx.destination);
    source.start();
    gain.gain.linearRampToValueAtTime(GAMEOVER_NOISE_VOLUME, ctx.currentTime + GAMEOVER_FX_RAMP_MS / 1000);

    this._deathNoise = { source, gain };
  }

  // Corta o ruído branco (restart ou saída da cena) com uma rampa curtinha
  // de 150ms pra não estalar.
  _stopDeathNoise() {
    if (!this._deathNoise) return;
    const { source, gain } = this._deathNoise;
    const ctx = this.scene.sound.context;
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      source.stop(now + 0.16);
    } catch (e) {
      // já parado/desconectado — sem problema
    }
    this._deathNoise = null;
  }

  // ratio = vida atual/máxima (0..1). Some suavemente acima do threshold;
  // abaixo dele, entra num pulso lento que acelera conforme a vida cai.
  _updateLowHpVignette(ratio) {
    const belowThreshold = ratio <= LOW_HP_THRESHOLD;
    this.scene.tweens.killTweensOf(this.lowHpVignette);

    if (!belowThreshold) {
      this._lowHpActive = false;
      this.scene.tweens.add({
        targets: this.lowHpVignette,
        alpha: 0,
        duration: LOW_HP_FADE_MS,
        ease: 'Cubic.easeOut'
      });
      return;
    }

    this._lowHpActive = true;
    // s = 0 no threshold (entrando), s = 1 morrendo. Elevar s (não ratio/threshold
    // direto) é o que garante o começo bem suave — elevar a proporção restante
    // rampa rápido logo na entrada, que era o problema da versão anterior.
    const s = 1 - ratio / LOW_HP_THRESHOLD;
    const intensity = Math.pow(s, LOW_HP_CURVE_POWER);
    const baseAlpha = intensity * LOW_HP_MAX_ALPHA;
    const pulseAmp = intensity * LOW_HP_PULSE_MAX_AMP;
    const pulseMs = Phaser.Math.Linear(LOW_HP_PULSE_MS_FAR, LOW_HP_PULSE_MS_NEAR, intensity);

    this.lowHpVignette.setAlpha(baseAlpha);
    this.scene.tweens.add({
      targets: this.lowHpVignette,
      alpha: baseAlpha + pulseAmp,
      duration: pulseMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // "Sistema acabando": quanto mais perto da morte, mais baixa a música
  // (ver MUSIC_DUCK_*) — MusicManager cuida de aplicar o fator em cima de
  // qualquer faixa que esteja tocando agora (jogo, Boss ou cartas), sem
  // mexer nos fades de troca de cena. Tween curtinho a cada mudança de
  // vida pra suavizar (tomou dano -> novo alvo), não pra pulsar.
  _updateMusicDuck(ratio) {
    this.scene.tweens.killTweensOf(this._musicDuckProxy);
    this.scene.tweens.add({
      targets: this._musicDuckProxy,
      value: HUD._musicDuckFactor(ratio),
      duration: MUSIC_DUCK_TWEEN_MS,
      ease: 'Sine.easeInOut',
      onUpdate: () => MusicManager.setHpDuckFactor(this._musicDuckProxy.value)
    });
  }

  // 1 (volume cheio) acima do limiar; abaixo dele, cai bem devagar no
  // início (quase imperceptível) e rápido só perto de 0 hp — por volta de
  // ~10% de vida já está bem baixinho, quase sem música.
  static _musicDuckFactor(ratio) {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    if (r >= MUSIC_DUCK_THRESHOLD) return 1;
    const s = 1 - r / MUSIC_DUCK_THRESHOLD; // 0 no limiar, 1 com 0 de vida
    return Math.pow(1 - s, MUSIC_DUCK_CURVE_POWER);
  }

  _buildXpBar() {
    const x = 16;
    const y = XP_Y;

    // mesmo desenho da barra de vida (painel de cantos cortados + seta,
    this.xpPanel = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    HUD._drawChamferedRect(
      this.xpPanel,
      x,
      y,
      XP_PANEL_W,
      XP_PANEL_H,
      XP_CHAMFER,
      XP_PANEL_FILL,
      XP_PANEL_FILL_ALPHA,
      XP_BORDER_COLOR,
      XP_BORDER_ALPHA
    );

    const trackMaxW = XP_PANEL_W - XP_PAD_X * 2;
    HUD._drawArrowShape(
      this.xpPanel,
      x + XP_PAD_X,
      y + XP_TRACK_Y,
      trackMaxW,
      XP_TRACK_HEIGHT,
      XP_ARROW_HEAD_LEN,
      XP_TRACK_COLOR,
      XP_TRACK_ALPHA
    );

    this.xpFill = this.scene.add.graphics().setScrollFactor(0).setDepth(101);
    this._xpOrigin = { x: x + XP_PAD_X, y: y + XP_TRACK_Y };
    this._xpMaxW = trackMaxW;

    // nível ao lado do painel (não embaixo, pra não empilhar altura),
    this.levelText = this.scene.add
      .text(x + XP_PANEL_W + 8, y + XP_PANEL_H / 2, 'Nível 1', { fontSize: '11px', color: '#cfeaff' })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(101);
    this.uiContainer.add([this.xpPanel, this.xpFill, this.levelText]);
  }

  // Redesenha só a seta de xp atual (o painel e o trilho são estáticos).
  _drawXpFill(ratio) {
    this.xpFill.clear();
    HUD._drawArrowShape(
      this.xpFill,
      this._xpOrigin.x,
      this._xpOrigin.y,
      this._xpMaxW * ratio,
      XP_FILL_HEIGHT,
      XP_ARROW_HEAD_LEN,
      XP_FILL_COLOR,
      XP_FILL_ALPHA
    );
  }

  _buildKillCounter() {
    this.killText = this.scene.add
      .text(this.scene.scale.width - 16, 16, 'Abates: 0', { fontSize: '12px', color: '#ffffff' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.uiContainer.add(this.killText);
  }

  _buildRunTimer() {
    this.timeText = this.scene.add
      .text(this.scene.scale.width - 16, 34, '00:00', { fontSize: '11px', color: '#ffffff' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.uiContainer.add(this.timeText);
  }

  _buildBossBar() {
    const W = this.scene.scale.width;
    // Deixa o canto superior esquerdo livre para vida/XP e mantém o encontro
    // visível no centro mesmo em telas menores.
    this.bossPanelW = Math.min(420, Math.max(240, W - 320));
    this.bossPanelX = (W - this.bossPanelW) / 2;
    this.bossPanelY = BOSS_PANEL_Y;
    this.bossTrackW = this.bossPanelW - BOSS_PAD_X * 2;
    this.bossTrackX = this.bossPanelX + BOSS_PAD_X;

    this.bossGroup = this.scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(120)
      .setVisible(false)
      .setAlpha(0);

    this.bossPanel = this.scene.add.graphics();
    this.bossTrack = this.scene.add.graphics();
    this.bossLagFill = this.scene.add.graphics();
    this.bossFill = this.scene.add.graphics();

    this.bossTitle = this.scene.add.text(
      this.bossPanelX + BOSS_PAD_X,
      this.bossPanelY + 8,
      'MINOTAURO // BOSS',
      { fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#e8f6ff' }
    ).setOrigin(0, 0.5);

    this.bossStatusText = this.scene.add.text(
      this.bossPanelX + this.bossPanelW - BOSS_PAD_X,
      this.bossPanelY + 8,
      'HOSTILE // ACTIVE',
      { fontFamily: '"Press Start 2P", monospace', fontSize: '7px', color: '#8fb3bf' }
    ).setOrigin(1, 0.5);

    this.bossHpText = this.scene.add.text(
      this.bossPanelX + this.bossPanelW - BOSS_PAD_X,
      this.bossPanelY + BOSS_TRACK_Y - 1,
      '0 / 0',
      { fontFamily: '"Press Start 2P", monospace', fontSize: '7px', color: '#cfeaff' }
    ).setOrigin(1, 0.5);

    this.bossGroup.add([
      this.bossPanel,
      this.bossTrack,
      this.bossLagFill,
      this.bossFill,
      this.bossTitle,
      this.bossStatusText,
      this.bossHpText
    ]);
    this.uiContainer.add(this.bossGroup);

    this._bossHudBoss = null;
    this._bossHudRage = false;
    this._bossTargetRatio = 1;
    this._bossDisplayRatio = 1;
    this._bossLagRatio = 1;
    this._bossHudVisible = false;
    this._bossHudNextScanAt = 0;
    this._bossHudDrawnDisplayRatio = 1;
    this._bossHudDrawnLagRatio = 1;
    this._drawBossFrame(false);
    this._drawBossFill(1, 1, false);
  }

  _drawBossFrame(isRage) {
    const border = isRage ? BOSS_PANEL_BORDER_RAGE : BOSS_PANEL_BORDER;
    this.bossPanel.clear();
    HUD._drawChamferedRect(
      this.bossPanel,
      this.bossPanelX,
      this.bossPanelY,
      this.bossPanelW,
      BOSS_PANEL_H,
      BOSS_PANEL_CHAMFER,
      BOSS_PANEL_FILL,
      BOSS_PANEL_FILL_ALPHA,
      border,
      0.9
    );

    this.bossTrack.clear();
    HUD._drawArrowShape(
      this.bossTrack,
      this.bossTrackX,
      this.bossPanelY + BOSS_TRACK_Y,
      this.bossTrackW,
      BOSS_TRACK_HEIGHT,
      BOSS_ARROW_HEAD_LEN,
      BOSS_TRACK_COLOR,
      BOSS_TRACK_ALPHA
    );
  }

  _drawBossFill(displayRatio, lagRatio, isRage) {
    const color = isRage ? BOSS_FILL_RAGE : BOSS_FILL_NORMAL;
    this.bossLagFill.clear();
    if (lagRatio > displayRatio) {
      HUD._drawArrowShape(
        this.bossLagFill,
        this.bossTrackX,
        this.bossPanelY + BOSS_TRACK_Y,
        this.bossTrackW * lagRatio,
        BOSS_FILL_HEIGHT,
        BOSS_ARROW_HEAD_LEN,
        BOSS_FILL_SHADOW,
        0.72
      );
    }

    this.bossFill.clear();
    HUD._drawArrowShape(
      this.bossFill,
      this.bossTrackX,
      this.bossPanelY + BOSS_TRACK_Y,
      this.bossTrackW * displayRatio,
      BOSS_FILL_HEIGHT,
      BOSS_ARROW_HEAD_LEN,
      color,
      0.95
    );
  }

  update(_time, delta) {
    let boss = this._bossHudBoss?.active && this._bossHudBoss.def?.boss
      ? this._bossHudBoss
      : null;
    if (!boss && _time >= this._bossHudNextScanAt) {
      this._bossHudNextScanAt = _time + BOSS_SCAN_INTERVAL_MS;
      boss = this.scene.enemySpawner?.group?.getChildren?.().find((enemy) =>
        enemy?.active && enemy.def?.boss
      );
    }

    if (!boss) {
      if (this._bossHudVisible) {
      this._bossHudVisible = false;
      this._bossHudBoss = null;
        this.scene.tweens.killTweensOf(this.bossGroup);
        this.scene.tweens.add({
          targets: this.bossGroup,
          alpha: 0,
          duration: BOSS_FADE_MS,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            if (!this._bossHudVisible) this.bossGroup.setVisible(false);
          }
        });
      }
      return;
    }

    if (this._bossHudBoss !== boss) {
      this._bossHudBoss = boss;
      this._bossHudVisible = true;
      this._bossTargetRatio = 1;
      this._bossDisplayRatio = 1;
      this._bossLagRatio = 1;
      this.bossGroup.setVisible(true).setAlpha(0);
      this.scene.tweens.killTweensOf(this.bossGroup);
      this.scene.tweens.add({
        targets: this.bossGroup,
        alpha: 1,
        duration: BOSS_FADE_MS,
        ease: 'Cubic.easeOut'
      });
    }

    const current = boss.healthSystem?.current ?? 0;
    const max = boss.healthSystem?.maxHp ?? 1;
    const ratio = Phaser.Math.Clamp(current / max, 0, 1);
    const isRage = boss.isEnraged === true;
    const isDefeated = boss.healthSystem?.isDead?.() === true;
    const follow = 1 - Math.exp(-Math.max(0, delta) / 105);
    const lagFollow = 1 - Math.exp(-Math.max(0, delta) / 360);

    this._bossTargetRatio = ratio;
    this._bossDisplayRatio = Phaser.Math.Linear(this._bossDisplayRatio, this._bossTargetRatio, follow);
    this._bossLagRatio = Phaser.Math.Linear(this._bossLagRatio, this._bossTargetRatio, lagFollow);

    const rageChanged = isRage !== this._bossHudRage;
    if (rageChanged) {
      this._bossHudRage = isRage;
      this._drawBossFrame(isRage);
    }
    if (
      Math.abs(this._bossDisplayRatio - this._bossHudDrawnDisplayRatio) > 0.001 ||
      Math.abs(this._bossLagRatio - this._bossHudDrawnLagRatio) > 0.001 ||
      rageChanged
    ) {
      this._drawBossFill(this._bossDisplayRatio, this._bossLagRatio, isRage);
      this._bossHudDrawnDisplayRatio = this._bossDisplayRatio;
      this._bossHudDrawnLagRatio = this._bossLagRatio;
    }
    this.bossStatusText.setText(isDefeated ? 'DEFEATED' : isRage ? 'RAGE // ACTIVE' : 'HOSTILE // ACTIVE');
    this.bossStatusText.setColor(isDefeated ? '#ffd166' : isRage ? '#32e9d6' : '#8fb3bf');
    this.bossHpText.setText(`${Math.ceil(current)} / ${Math.ceil(max)}`);
  }

  // Só o título — nada de estatísticas, nada de dica ainda (ver
  // _playBigMessage: essa mensagem entra, existe sozinha e sai por
  // completo antes de qualquer outra coisa aparecer). A dica de reiniciar
  // (a dica de reiniciar agora mora no ResultUI, junto dos botões).
  // Só a mensagem, em branco, no meio da tela — sem painel/borda/moldura
  // (pediu explicitamente pra tirar a "interface no tema do jogo"; ver
  // _playBigMessage pra entrada/saída). Dica de reiniciar mora à parte
  // ResultUI (botões + dica de R).
  _buildGameOverText() {
    this.gameOverGroup = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const cx = W / 2;
    const cy = H / 2;
    const size = Math.min(56, Math.floor((W * 0.82) / 11));
    const style = (color) => ({ fontFamily: '"Press Start 2P", monospace', fontSize: `${size}px`, color });

    // lavagem vermelho-escuro bem discreta atrás do texto (sem moldura/painel)
    this.deathWash = this.scene.add.rectangle(cx, cy, W, H, 0x2a0208, 1).setScrollFactor(0).setAlpha(0);

    // as duas cópias RGB (somadas) dão o "rasgo" de cor nas bordas do texto
    this.deathGhostRed = this.scene.add.text(0, 0, 'VOCÊ MORREU', style(DEATH_GHOST_RED))
      .setOrigin(0.5).setScrollFactor(0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setLetterSpacing(2);
    this.deathGhostCyan = this.scene.add.text(0, 0, 'VOCÊ MORREU', style(DEATH_GHOST_CYAN))
      .setOrigin(0.5).setScrollFactor(0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setLetterSpacing(2);
    this.deathTitle = this.scene.add.text(0, 0, 'VOCÊ MORREU', style(DEATH_TITLE_COLOR))
      .setOrigin(0.5).setScrollFactor(0).setAlpha(0).setLetterSpacing(2)
      .setShadow(0, 0, '#ff1e3c', 22, false, true);

    // container centralizado no meio da tela: escala/colapso acontecem em
    // volta do centro do texto (antes ele "escorregava" pro canto)
    this.gameOverMessage = this.scene.add.container(cx, cy).setScrollFactor(0).setAlpha(0);
    this.gameOverMessage.add([this.deathGhostRed, this.deathGhostCyan, this.deathTitle]);
    this.gameOverGroup.add([this.deathWash, this.gameOverMessage]);
  }

  // Vitória: mesma sequência do _playBigMessage, agora centralizada no
  // próprio container (escala em volta do centro do texto).
  _buildWinText() {
    this.winGroup = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    const title = this.scene.add
      .text(0, 0, 'PARABÉNS, VOCÊ VENCEU O JOGO!', {
        fontSize: '20px',
        color: '#7CFC9C',
        align: 'center',
        wordWrap: { width: 300 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.winMessage = this.scene.add.container(cx, cy).setScrollFactor(0).setAlpha(0);
    this.winMessage.add([title]);
    this.winGroup.add(this.winMessage);
  }

  // Uma "mensagem grande" (Você Morreu / vitória): fade+scale in devagar
  // (com presença) -> fica sozinha na tela -> fade+scale out por completo
  // -> só então onDone() roda (é o que dispara o ResultUI). Nunca convive
  // na tela com o relatório que vem a seguir. `group` só controla
  // depth/visibilidade/zoom; a animação roda em `message` (container
  // interno), pra não sobrescrever a escala de compensação de zoom do
  // celular que já mora em `group` (ver _buildGameOverText).
  _playBigMessage(group, message, onDone) {
    this.scene.tweens.killTweensOf(message);
    group.setVisible(true);
    message.setAlpha(0).setScale(BIG_MESSAGE_START_SCALE);
    this.scene.tweens.add({
      targets: message,
      alpha: 1,
      scale: 1,
      duration: BIG_MESSAGE_FADE_IN_MS,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.time.delayedCall(BIG_MESSAGE_HOLD_MS, () => {
          this.scene.tweens.add({
            targets: message,
            alpha: 0,
            scale: BIG_MESSAGE_EXIT_SCALE,
            duration: BIG_MESSAGE_FADE_OUT_MS,
            ease: 'Cubic.easeIn',
            onComplete: () => {
              group.setVisible(false);
              onDone();
            }
          });
        });
      }
    });
  }

  // "VOCÊ MORREU" com impacto: slam -> estrondo/tremor/clarão -> pulsa com
  // glitch -> colapsa. onDone() só roda quando some por completo (é o que
  // libera o ResultUI, ver 'gameover-shown').
  _playDeathMessage(onDone) {
    const scene = this.scene;
    const cam = scene.cameras.main;
    const { gameOverGroup: group, gameOverMessage: message, deathTitle: title, deathGhostRed: red, deathGhostCyan: cyan, deathWash: wash } = this;
    const layers = [title, red, cyan];

    this._resetDeathMessage();
    group.setVisible(true);
    message.setAlpha(1).setScale(1);
    layers.forEach((l) => l.setScale(DEATH_SLAM_START_SCALE).setAlpha(0));
    red.setX(-DEATH_GHOST_START_OFFSET);
    cyan.setX(DEATH_GHOST_START_OFFSET);

    // 1) despenca: cresce de fora pra dentro, acelerando até bater
    scene.tweens.add({ targets: layers, scale: 1, duration: DEATH_SLAM_MS, ease: 'Expo.easeIn' });
    scene.tweens.add({ targets: title, alpha: 1, duration: 70 });
    scene.tweens.add({ targets: [red, cyan], alpha: 0.85, duration: 70 });

    // 2) impacto
    scene.time.delayedCall(DEATH_SLAM_MS, () => {
      cam.shake(DEATH_SHAKE_IMPACT_MS, DEATH_SHAKE_IMPACT_INTENSITY);
      cam.flash(150, 255, 255, 255);
      if (scene.cache.audio.exists('sfx_elite_explosion')) scene.sound.play('sfx_elite_explosion', { volume: 0.8 });

      scene.tweens.add({ targets: red, x: -DEATH_GHOST_OFFSET, duration: 280, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: cyan, x: DEATH_GHOST_OFFSET, duration: 280, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: wash, alpha: DEATH_WASH_ALPHA, duration: 500, ease: 'Sine.easeOut' });

      // respiração lenta (texto + cópias juntos) e pulso da lavagem
      scene.tweens.add({ targets: layers, scale: 1.035, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      scene.tweens.add({ targets: wash, alpha: DEATH_WASH_ALPHA * 0.6, delay: 500, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

      // glitch: de vez em quando o texto "pula" de lado e as cópias abrem
      this._deathJitter = scene.time.addEvent({
        delay: 120,
        loop: true,
        callback: () => {
          if (Math.random() > 0.35) return;
          const dx = Phaser.Math.Between(-7, 7);
          title.setX(dx);
          red.setX(-DEATH_GHOST_OFFSET + dx - Phaser.Math.Between(6, 16));
          cyan.setX(DEATH_GHOST_OFFSET + dx + Phaser.Math.Between(6, 16));
          scene.time.delayedCall(55, () => {
            title.setX(0);
            red.setX(-DEATH_GHOST_OFFSET);
            cyan.setX(DEATH_GHOST_OFFSET);
          });
        }
      });

      // 3) sai: pisca 3x e colapsa na horizontal, igual monitor desligando
      scene.time.delayedCall(DEATH_HOLD_MS, () => {
        this._stopDeathJitter();
        scene.tweens.killTweensOf([title, red, cyan, wash]);
        layers.forEach((l) => l.setX(0).setScale(1));
        scene.tweens.add({
          targets: message,
          alpha: 0.12,
          duration: 45,
          yoyo: true,
          repeat: 2,
          onComplete: () => {
            scene.tweens.add({
              targets: message,
              scaleX: 1.6,
              scaleY: 0.02,
              alpha: 0,
              duration: 240,
              ease: 'Expo.easeIn',
              onComplete: () => {
                group.setVisible(false);
                message.setAlpha(0).setScale(1);
                onDone();
              }
            });
          }
        });
        scene.tweens.add({ targets: wash, alpha: 0, duration: 320 });
      });
    });
  }

  _stopDeathJitter() {
    if (this._deathJitter) {
      this._deathJitter.remove();
      this._deathJitter = null;
    }
  }

  _resetDeathMessage() {
    this._stopDeathJitter();
    const parts = [this.deathTitle, this.deathGhostRed, this.deathGhostCyan, this.deathWash, this.gameOverMessage];
    this.scene.tweens.killTweensOf(parts);
    this.deathTitle.setPosition(0, 0).setScale(1).setAlpha(0);
    this.deathGhostRed.setPosition(0, 0).setScale(1).setAlpha(0);
    this.deathGhostCyan.setPosition(0, 0).setScale(1).setAlpha(0);
    this.deathWash.setAlpha(0);
  }

  _bindEvents() {
    EventBus.on('player-health-changed', ({ current, max }) => {
      const ratio = Phaser.Math.Clamp(current / max, 0, 1);
      this._drawHpFill(ratio);
      this.hpText.setText(`${Math.ceil(current)} / ${max}`);
      this._updateLowHpVignette(ratio);
      this._updateCriticalFx(ratio);
      this._updateMusicDuck(ratio);
    });

    // só existe pra quem pegou "Escudo Energético" — o overlay fica com
    EventBus.on('player-shield-changed', ({ current, max }) => {
      const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
      this._drawShieldFill(ratio);
      // "tinha escudo e zerou" -> flash; recarregar do zero não conta
      if (this._hadShield && ratio <= 0) this._flashShieldBreak();
      this._hadShield = ratio > 0;
    });

    EventBus.on('xp-changed', ({ xp, xpToNext, level }) => {
      const ratio = Phaser.Math.Clamp(xp / xpToNext, 0, 1);
      this._drawXpFill(ratio);
      this.levelText.setText(`Nível ${level}`);
    });

    EventBus.on('enemy-died', () => {
      this._kills = (this._kills || 0) + 1;
      this.killText.setText(`Abates: ${this._kills}`);
    });

    EventBus.on('run-time-changed', ({ seconds }) => {
      this.timeText.setText(HUD._formatTime(seconds));
    });

    EventBus.on('player-died', () => {
      // congela o pulso de vida baixa exatamente como estava — sem resetar
      // alpha, então o corte pro preto não dá aquele "flash" de volta ao normal
      this.scene.tweens.killTweensOf(this.lowHpVignette);
      this._lowHpActive = false;
      this.scene.tweens.killTweensOf(this._criticalFxProxy);
      this.scene.tweens.killTweensOf(this._musicDuckProxy);

      this.scene.sound.play('sfx_death_shutdown', { volume: 0.9 });
      MusicManager.stop(this.scene, DEATH_MUSIC_FADE_MS);
      this.scene.cameras.main.shake(DEATH_SHAKE_MS, DEATH_SHAKE_INTENSITY);

      // monitor CRT desligando: cortinas fecham na vertical até sobrar só
      // a linha fina brilhante, que aí encolhe até um ponto — por cima
      // disso, um estouro de chiado/aberração/ondulação (o "estalo"
      // elétrico do desligar) que decai junto com as cortinas fechando.
      this.deathOverlay.setAlpha(0);
      this.deathCurtainTop.setScale(1, 0);
      this.deathCurtainBottom.setScale(1, 0);
      this.deathCollapseLine.setScale(1, 1).setAlpha(0);
      this.deathAfterglow.setScale(1).setAlpha(0);

      this._burstDeathFx();

      this.scene.tweens.add({
        targets: [this.deathCurtainTop, this.deathCurtainBottom],
        scaleY: 1,
        duration: DEATH_COLLAPSE_V_MS,
        ease: 'Cubic.easeIn'
      });
      this.scene.tweens.add({
        targets: this.deathCollapseLine,
        alpha: 1,
        duration: DEATH_COLLAPSE_V_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          // linha fina formada -> pulso rápido de espessura (surto do
          // feixe de elétrons descarregando) antes de encolher até um ponto
          this.scene.tweens.add({
            targets: this.deathCollapseLine,
            scaleY: DEATH_LINE_BOUNCE_SCALE_Y,
            duration: DEATH_LINE_BOUNCE_MS,
            yoyo: true,
            ease: 'Cubic.easeOut',
            onComplete: () => {
              this.scene.tweens.add({
                targets: this.deathCollapseLine,
                scaleX: 0,
                alpha: 0,
                duration: DEATH_COLLAPSE_H_MS,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                  this.deathOverlay.setAlpha(1); // trava preto sólido (segurança)
                  this._resetCameraFx();

                  // ponto de fósforo residual: acende e apaga rápido por
                  // cima do preto — o toque final do tubo descarregando
                  this.deathAfterglow.setScale(1).setAlpha(0.9);
                  this.scene.tweens.add({
                    targets: this.deathAfterglow,
                    alpha: 0,
                    scale: 1.8,
                    duration: DEATH_AFTERGLOW_FADE_MS,
                    ease: 'Cubic.easeOut'
                  });
                }
              });
            }
          });
        }
      });

      // em paralelo: som toca até o fim, silêncio, só então o texto —
      // junto com ele, a recuperação progressiva dos filtros + o chiado
      // baixinho (ver _startGameOverFx). "VOCÊ MORREU" entra, existe
      // sozinho, sai por completo — só então o relatório (ResultUI) começa
      // a entrar (ver _playBigMessage/'gameover-shown').
      this.scene.time.delayedCall(DEATH_SOUND_MS, () => {
        this.scene.time.delayedCall(DEATH_SILENCE_MS, () => {
          this._startGameOverFx();
          this._playDeathMessage(() => EventBus.emit('gameover-shown'));
        });
      });
    });

    EventBus.on('player-won', () => {
      // "PARABÉNS..." entra, existe sozinha, sai por completo — só então o
      // relatório (ResultUI) começa a entrar (mesmo princípio do game over)
      this._playBigMessage(this.winGroup, this.winMessage, () => EventBus.emit('win-shown'));
    });

    EventBus.on('run-restart', () => {
      this.scene.tweens.killTweensOf(this.gameOverMessage);
      this.scene.tweens.killTweensOf(this.winMessage);
      this.gameOverGroup.setVisible(false);
      this.winGroup.setVisible(false);
      this.gameOverMessage.setAlpha(0).setScale(1);
      this.winMessage.setAlpha(0).setScale(BIG_MESSAGE_START_SCALE);
      this._resetDeathMessage();
      this._kills = 0;
      this.killText.setText('Abates: 0');
      this.timeText.setText('00:00');
      this.scene.tweens.killTweensOf(this.bossGroup);
      this.bossGroup.setVisible(false).setAlpha(0);
      this._bossHudBoss = null;
      this._bossHudVisible = false;
      this._bossHudRage = false;
      this._bossTargetRatio = 1;
      this._bossDisplayRatio = 1;
      this._bossLagRatio = 1;
      this._drawBossFrame(false);
      this._drawBossFill(1, 1, false);
      // a nova run pode não ter (ou ainda não ter pego) o Escudo Energético
      this._drawShieldFill(0);
      this._hadShield = false;
      this.scene.tweens.killTweensOf(this.lowHpVignette);
      this.lowHpVignette.setAlpha(0);
      this._lowHpActive = false;
      this.scene.tweens.killTweensOf(this.deathOverlay);
      this.deathOverlay.setAlpha(0);
      this.scene.tweens.killTweensOf([this.deathCurtainTop, this.deathCurtainBottom, this.deathCollapseLine]);
      this.deathCurtainTop.setScale(1, 0);
      this.deathCurtainBottom.setScale(1, 0);
      this.deathCollapseLine.setScale(1, 1).setAlpha(0);
      this.scene.tweens.killTweensOf(this.deathAfterglow);
      this.deathAfterglow.setScale(1).setAlpha(0);
      this.scene.tweens.killTweensOf(this._criticalFxProxy);
      this.scene.tweens.killTweensOf(this._gameOverFxProxy);
      this._resetCameraFx();
      this._stopDeathNoise();
      this.scene.tweens.killTweensOf(this._musicDuckProxy);
      this._musicDuckProxy.value = 1;
      MusicManager.setHpDuckFactor(1);
    });
  }

  static _formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Painel de cantos cortados (mesmo visual das placas do menu principal),
  static _drawChamferedRect(g, x, y, w, h, chamfer, fillColor, fillAlpha, borderColor, borderAlpha = 1) {
    const c = chamfer;
    const points = [
      { x: x + c, y },
      { x: x + w - c, y },
      { x: x + w, y: y + c },
      { x: x + w, y: y + h - c },
      { x: x + w - c, y: y + h },
      { x: x + c, y: y + h },
      { x, y: y + h - c },
      { x, y: y + c }
    ];
    g.fillStyle(fillColor, fillAlpha);
    g.fillPoints(points, true);
    g.lineStyle(1, borderColor, borderAlpha);
    g.strokePoints(points, true);
  }

  // Seta: corpo retangular que termina numa pontinha achatada em (x + wid…
  static _drawArrowShape(g, x, y, width, height, headLen, color, alpha = 1) {
    if (width <= 0) return;
    g.fillStyle(color, alpha);
    const tip = Math.min(SHARP_TIP_FLAT, width, height / 2);

    if (width <= headLen) {
      g.fillPoints(
        [
          { x, y: y - height / 2 },
          { x: x + width - tip, y: y - tip },
          { x: x + width, y },
          { x: x + width - tip, y: y + tip },
          { x, y: y + height / 2 }
        ],
        true
      );
      return;
    }

    const bodyW = width - headLen;
    g.fillPoints(
      [
        { x, y: y - height / 2 },
        { x: x + bodyW, y: y - height / 2 },
        { x: x + width - tip, y: y - tip },
        { x: x + width, y },
        { x: x + width - tip, y: y + tip },
        { x: x + bodyW, y: y + height / 2 },
        { x, y: y + height / 2 }
      ],
      true
    );
  }

  // Ciano (saudável) -> vermelho (crítico), interpolado pela vida restant…
  static _hpColor(ratio) {
    const danger = Phaser.Display.Color.ValueToColor(HP_COLOR_DANGER);
    const healthy = Phaser.Display.Color.ValueToColor(HP_COLOR_HEALTHY);
    const t = Phaser.Math.Clamp(ratio, 0, 1) * 100;
    const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(danger, healthy, 100, t);
    return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
  }

  // Sem destroy() aqui de propósito: nada chamava esse método (ele nunca
}
