const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/abilities/DroneAbility.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default class', 'class');
const DroneAbility = vm.runInNewContext(`${source}\nDroneAbility;`, {
  Phaser: {
    BlendModes: { ADD: 1 },
    Math: {
      FloatBetween: (min, max) => (min + max) / 2,
      Between: (min, max) => Math.floor((min + max) / 2)
    }
  }
});

function makeScene(touch) {
  const scene = {
    images: [],
    timers: [],
    tweenCalls: [],
    sys: { game: { device: { input: { touch } } } },
    time: { addEvent(event) { scene.timers.push(event); } },
    add: {
      image() {
        const image = {
          setDepth() { return this; },
          setBlendMode() { return this; },
          setScale(value) { this.scale = value; return this; },
          setRotation() { return this; },
          setTint() { return this; }
        };
        scene.images.push(image);
        return image;
      }
    },
    tweens: { add(tween) { scene.tweenCalls.push(tween); } }
  };
  return scene;
}

const drone = new DroneAbility({});
assert.equal(drone._shotFxIntensity(makeScene(true)), 1, 'mobile base drone uses reduced FX');
assert.equal(drone._shotFxIntensity(makeScene(false)), 2, 'desktop base drone keeps existing FX');
drone.laser = true;
assert.equal(drone._shotFxIntensity(makeScene(true)), 1, 'mobile CatForce uses reduced FX');
assert.equal(drone._shotFxIntensity(makeScene(false)), 2.4, 'desktop CatForce keeps existing FX');

const mobileLaser = makeScene(true);
drone._attachLaserTrail(mobileLaser, {}, 0xb26bff);
assert.equal(mobileLaser.timers.length, 0, 'mobile laser reuses shared trail only');
const desktopLaser = makeScene(false);
drone._attachLaserTrail(desktopLaser, {}, 0xb26bff);
assert.equal(desktopLaser.timers.length, 1, 'desktop keeps extra laser trail');

const mobileHit = makeScene(true);
drone._spawnHitSpark(mobileHit, 0, 0, 0xb26bff);
assert.equal(mobileHit.images.length, 2, 'mobile CatForce uses two impact sparks');
const desktopHit = makeScene(false);
drone._spawnHitSpark(desktopHit, 0, 0, 0xb26bff);
assert.equal(desktopHit.images.length, 4, 'desktop CatForce keeps four impact sparks');

console.log('Drone mobile FX safeguards and desktop visuals passed.');
