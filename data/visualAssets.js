export default [
  {
    id: 'purification-idle',
    type: 'image',
    key: 'asset_purification_idle',
    path: 'assets/sprites/purification_idle.png'
  },
  {
    // Este spritesheet é o walk da carta base "Purificação". O arquivo
    // foi adicionado com o nome antigo, mas não é o visual do Cyberus.
    id: 'purification-walk',
    type: 'spritesheet',
    key: 'asset_purification_walk',
    path: 'assets/sprites/purification_walk.png',
    frameWidth: 64,
    frameHeight: 64,
    animations: [
      {
        key: 'purification-walk',
        frames: { start: 0, end: 5 },
        frameRate: 12,
        repeat: -1
      }
    ]
  },
  {
    id: 'cyberus',
    type: 'image',
    key: 'asset_cyberus',
    path: 'assets/sprites/cyberus.png'
  },
  {
    id: 'cyberus-idle',
    type: 'spritesheet',
    key: 'asset_cyberus_idle',
    path: 'assets/sprites/cyberus_idle.png',
    frameWidth: 128,
    frameHeight: 128,
    animations: [
      {
        key: 'cyberus-idle',
        frames: { start: 0, end: 5 },
        frameRate: 8,
        repeat: -1
      }
    ]
  },
  {
    id: 'cyberus-walk',
    type: 'spritesheet',
    key: 'asset_cyberus_walk',
    path: 'assets/sprites/cyberus_walk.png',
    frameWidth: 128,
    frameHeight: 128,
    animations: [
      {
        key: 'cyberus-walk',
        frames: { start: 0, end: 5 },
        frameRate: 12,
        repeat: -1
      }
    ]
  }
];
