import visualAssets from '../../data/visualAssets.js';

export default class AssetManager {
  static preload(scene) {
    visualAssets.forEach((asset) => {
      if (asset.type === 'spritesheet') {
        scene.load.spritesheet(asset.key, asset.path, {
          frameWidth: asset.frameWidth,
          frameHeight: asset.frameHeight
        });
      } else {
        scene.load.image(asset.key, asset.path);
      }
    });
  }

  static createAnimations(scene) {
    visualAssets.forEach((asset) => {
      (asset.animations || []).forEach((anim) => {
        if (scene.anims.exists(anim.key)) return;
        scene.anims.create({
          key: anim.key,
          frames: scene.anims.generateFrameNumbers(asset.key, anim.frames),
          frameRate: anim.frameRate,
          repeat: anim.repeat ?? -1
        });
      });
    });
  }

  static getKey(id) {
    const asset = visualAssets.find((a) => a.id === id);
    return asset ? asset.key : null;
  }
}
