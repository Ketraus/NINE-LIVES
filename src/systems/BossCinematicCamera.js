// Owns only the camera; players and network authority remain unchanged.
export const BOSS_CAMERA_TRAVEL_MS = 600;

export default class BossCinematicCamera {
  constructor(scene) {
    this.scene = scene;
    scene.events.once('shutdown', () => this.release(true));
  }

  focus(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const cam = this.scene.cameras.main;
    if (!this.saved) {
      this.saved = this.returning || {
        target: cam._follow, roundPixels: cam.roundPixels,
        lerpX: cam.lerp.x, lerpY: cam.lerp.y,
        offsetX: cam.followOffset.x, offsetY: cam.followOffset.y,
        x: cam.midPoint.x, y: cam.midPoint.y
      };
    }
    this.returning = null;
    cam.stopFollow();
    cam.pan(point.x, point.y, BOSS_CAMERA_TRAVEL_MS, 'Cubic.easeInOut', true);
    this.watchdog?.remove(false);
    // Recovery if a disconnect or a failed spawn prevents the final cue.
    this.watchdog = this.scene.time.delayedCall(25000, () => this.release());
  }

  release(immediate = false) {
    this.watchdog?.remove(false);
    this.watchdog = null;
    const saved = this.saved || this.returning;
    if (!saved) return;
    this.saved = null;
    this.returning = null;
    const cam = this.scene.cameras.main;
    cam.panEffect.reset();
    const restore = () => {
      if (saved.target?.active) {
        cam.startFollow(saved.target, saved.roundPixels, saved.lerpX, saved.lerpY,
          saved.offsetX, saved.offsetY);
      }
    };
    if (immediate) { restore(); return; }
    this.returning = saved;
    const target = saved.target?.active ? saved.target : saved;
    cam.pan(target.x, target.y, BOSS_CAMERA_TRAVEL_MS, 'Cubic.easeInOut', true,
      (_camera, progress) => {
        if (progress === 1 && !this.saved && this.returning === saved) {
          this.returning = null;
          restore();
        }
      });
  }
}
