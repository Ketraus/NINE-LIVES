import EventBus from '../systems/EventBus.js';
import SlamAbility from './SlamAbility.js';
import DroneAbility from './DroneAbility.js';
import AllyDogAbility from './AllyDogAbility.js';
import TornadoAbility from './TornadoAbility.js';
import AuraShockAbility from './AuraShockAbility.js';
import ShurikenAbility from './ShurikenAbility.js';
import ShockwaveAbility from './ShockwaveAbility.js';

// Ponto de extensão central pras habilidades exclusivas de arma (as car…
const ABILITY_CLASSES = {
  slam: SlamAbility,
  drone: DroneAbility,
  allyDog: AllyDogAbility,
  tornadoWalk: TornadoAbility,
  auraShock: AuraShockAbility,
  shuriken: ShurikenAbility,
  shockwave: ShockwaveAbility
};

// por quanto tempo um evento de FX continua sendo reenviado (≈ 6 pacotes)
const NETWORK_FX_TTL_MS = 600;
const NETWORK_FX_MAX = 12;

export default class AbilityManager {
  constructor(scene, player, enemyGroup) {
    this.scene = scene;
    this.player = player;
    this.enemyGroup = enemyGroup;
    this.active = [];
    // eventos de FX pontuais pro multiplayer (ver emitNetworkFx)
    this.networkFx = [];
    this.networkFxSeq = Date.now();

    EventBus.on('ability-unlocked', ({ abilityId, def }) => this._unlock(abilityId, def));
    EventBus.on('ability-upgraded', ({ abilityId, def }) => this._upgrade(abilityId, def));
    // cheat "resetcards" do DevConsole (F9, ver RunManager.cheatResetCards):
    EventBus.on('ability-reset', () => this.reset());
  }

  // Desmonta todas as habilidades ativas — melhor esforço genérico (cada
  reset() {
    this.active.forEach((ability) => {
      try {
        ability.dog?.destroy();
        ability.sprite?.destroy();
        ability.fx?.destroy?.();
        ability.bulletGroup?.clear(true, true);
        ability.group?.clear(true, true);
        ability.tornadoes?.forEach((t) => t.fx?.destroy?.());
      } catch (e) {
        // melhor esforço — uma habilidade que falhar ao limpar não deve
      }
    });
    this.active = [];
  }

  _unlock(abilityId, def) {
    const AbilityClass = ABILITY_CLASSES[abilityId];
    if (!AbilityClass) return; // ex.: doubleStrike, tratado direto em Weapon.js

    // Algumas habilidades (ex.: Pancada Sísmica, até 4 cópias) não fazem
    const existing = this.active.find((a) => a instanceof AbilityClass);
    if (existing && typeof existing.restack === 'function') {
      existing.restack(def);
      return;
    }

    // índice de quantas instâncias desta MESMA habilidade já existem —
    const formationIndex = this.active.filter((a) => a instanceof AbilityClass).length;
    this.active.push(new AbilityClass(def, formationIndex));

    // Ponto de extensão opcional: classes que precisam recalcular a
    if (typeof AbilityClass.onFormationChanged === 'function') {
      AbilityClass.onFormationChanged(this.active.filter((a) => a instanceof AbilityClass));
    }
  }

  // Aplica uma melhoria a TODAS as instâncias já ativas de uma habilidade
  _upgrade(abilityId, def) {
    const AbilityClass = ABILITY_CLASSES[abilityId];
    if (!AbilityClass) return;
    const instances = this.active.filter((a) => a instanceof AbilityClass);
    if (instances.length === 0) return;

    // Ponto de extensão opcional (mesmo padrão de restack/
    if (typeof AbilityClass.mergeOnUpgrade === 'function') {
      const survivors = AbilityClass.mergeOnUpgrade(instances, def);
      this.active = this.active.filter((a) => !(a instanceof AbilityClass)).concat(survivors);
      return;
    }

    instances.forEach((a) => a.upgrade?.(def));
  }

  // Chamado todo frame pela GameScene, junto com player.update().
  update(time) {
    this.active.forEach((ability) => ability.update(time, this.player, this.enemyGroup, this.scene));
  }

  // Registra um FX pontual (impacto, explosão, laser...) pro multiplayer.
  // Em vez de transmitir o efeito quadro a quadro, só vai uma linha curta
  // (tipo + posição + parâmetros): o outro cliente toca o FX completo
  // localmente. Cada evento é reenviado por NETWORK_FX_TTL_MS (QoS 0 pode
  // perder pacotes); o `s` (sequência, crescente mesmo após reiniciar a run)
  // faz o receptor tocar cada um uma vez só.
  emitNetworkFx(type, data) {
    this.networkFxSeq = Math.max(this.networkFxSeq + 1, Date.now());
    this.networkFx.push({ s: this.networkFxSeq, k: type, at: this.scene.time.now, ...data });
    if (this.networkFx.length > NETWORK_FX_MAX) this.networkFx.shift();
  }

  getNetworkVisualState(time) {
    this.networkFx = this.networkFx.filter((ev) => time - ev.at < NETWORK_FX_TTL_MS);
    const visuals = {
      sprites: [],
      circles: [],
      lines: [],
      sectors: [],
      projectiles: [],
      tornadoes: [],
      auras: []
    };
    const addSprite = (id, sprite) => {
      if (!sprite?.active || !sprite.visible) return;
      visuals.sprites.push({
        id,
        texture: sprite.texture?.key,
        x: sprite.x,
        y: sprite.y,
        rotation: sprite.rotation,
        scaleX: sprite.scaleX,
        scaleY: sprite.scaleY,
        flipX: sprite.flipX,
        alpha: sprite.alpha,
        animation: sprite.anims?.currentAnim?.key
      });
    };
    const addProjectiles = (id, group, kind, fallbackColor) => {
      group?.getChildren().forEach((projectile, index) => {
        if (!projectile.active || !projectile.visible) return;
        visuals.projectiles.push({
          id: `${id}-${index}`,
          kind,
          x: projectile.x,
          y: projectile.y,
          rotation: projectile.rotation,
          scaleX: projectile.scaleX,
          scaleY: projectile.scaleY,
          radius: kind === 'shuriken' ? 9 : kind === 'wave' ? 5 : 4,
          color: projectile.getData?.('color') || fallbackColor,
          alpha: projectile.alpha
        });
      });
    };

    this.active.forEach((ability, index) => {
      const id = `${ability.constructor.name}-${index}`;
      addSprite(`${id}-companion`, ability.dog || ability.sprite);

      const projectileKind = ability.constructor.name === 'ShurikenAbility' ? 'shuriken'
        : ability.constructor.name === 'ShockwaveAbility' ? 'wave' : 'bolt';
      const projectileColor = ability.constructor.name === 'DroneAbility'
        ? (ability.laser ? ability.laserColor : 0x53ff9c)
        : ability.constructor.name === 'ShurikenAbility'
          ? (ability.evolved ? ability.chainColor : 0xd9d9e6)
          : 0xffb199;
      addProjectiles(`${id}-shot`, ability.bulletGroup || ability.group, projectileKind, projectileColor);

      ability.tornadoes?.forEach((tornado) => {
        visuals.tornadoes.push({
          id: `${id}-tornado-${tornado.networkId}`,
          x: tornado.x,
          y: tornado.y,
          radius: ability.def.radius,
          alpha: tornado.fx?.alpha ?? 1,
          hitSequence: tornado.hitSequence,
          remainingMs: Math.max(0, ability.def.durationMs - (time - tornado.spawnMs))
        });
      });

      if (ability.fx && ability.constructor.name === 'AuraShockAbility') {
        visuals.auras.push({
          id: `${id}-aura`,
          radius: ability.def.radius,
          scale: ability.fx.scaleX,
          alpha: ability.fx.alpha,
          hitSequence: ability.networkHitSequence,
          hitTargets: ability.networkHitTargets
        });
      }

      ability.flameZones?.forEach((zone, zoneIndex) => {
        visuals.circles.push({ id: `${id}-flame-${zoneIndex}`, x: zone.x, y: zone.y,
          radius: ability.evoDef.grenadeRadius, color: 0x33bbff,
          alpha: zone.fx?.alpha ?? 1, strokeWidth: 2 });
      });
      ability.grenadesInFlight?.forEach((grenade, grenadeIndex) => {
        visuals.projectiles.push({ id: `${id}-grenade-${grenadeIndex}`, kind: 'bolt',
          x: grenade.fx.x, y: grenade.fx.y, radius: 7, color: 0x33bbff, alpha: grenade.fx.alpha });
      });

      ability.networkBursts = (ability.networkBursts || []).filter((burst) => time < burst.endAt);
      ability.networkBursts.forEach((burst, burstIndex) => {
        const progress = Phaser.Math.Clamp((time - burst.startAt) / (burst.endAt - burst.startAt), 0, 1);
        if (burst.kind === 'circle') {
          visuals.circles.push({ id: `${id}-burst-${burstIndex}`, x: burst.x, y: burst.y,
            radius: burst.radius, color: burst.color, alpha: burst.alpha * (1 - progress),
            scale: Phaser.Math.Linear(burst.scaleFrom, burst.scaleTo, progress) });
        } else if (burst.kind === 'line') {
          visuals.lines.push({ id: `${id}-burst-${burstIndex}`, x1: burst.x1, y1: burst.y1,
            x2: burst.x2, y2: burst.y2, color: burst.color, width: burst.width,
            alpha: 1 - progress });
        } else if (burst.kind === 'sector') {
          visuals.sectors.push({ id: `${id}-burst-${burstIndex}`, x: burst.x, y: burst.y,
            radius: burst.radius, angle: burst.angle, halfAngle: burst.halfAngle,
            color: burst.color, alpha: burst.alpha * (1 - progress) });
        }
      });
    });

    if (this.networkFx.length > 0) {
      visuals.fx = this.networkFx.map(({ at, ...ev }) => ev);
    }

    return visuals;
  }

  pauseVisuals() {
    this.active.forEach((ability) => {
      ability.dog?.pauseVisual?.();
      ability.sprite?.anims?.pause?.();
      ability.tornadoes?.forEach((tornado) => tornado.fx?.list?.forEach((child) => child.anims?.pause?.()));
    });
  }

  resumeVisuals() {
    this.active.forEach((ability) => {
      ability.dog?.resumeVisual?.();
      ability.tornadoes?.forEach((tornado) => tornado.fx?.list?.forEach((child) => child.anims?.resume?.()));
    });
  }
}
