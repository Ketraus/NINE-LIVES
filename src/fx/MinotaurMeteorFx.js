// Compact meteor impact: persistent branching ground cracks, minimal screen obstruction.
export function playMeteorImpact(scene, x, y, radius) {
  if (!scene?.sys?.isActive()) return;
  const cyan = 0x29cbbd, pale = 0xa8fff0, dark = 0x09272f;
  const crater = scene.add.graphics().setDepth(2);
  const rng = (a,b) => Phaser.Math.FloatBetween(a,b);
  crater.fillStyle(dark, 0.45).fillEllipse(x,y,radius*1.4,radius*0.85);
  crater.lineStyle(3, 0x061820, 0.75).strokeEllipse(x,y,radius*1.4,radius*0.85);
  // Jagged cracks branch out from impact, with dark gouge and narrow teal hot core.
  for(let i=0;i<9;i++) {
    const a=i*Math.PI*2/9+rng(-0.17,0.17), length=radius*rng(0.75,1.22);
    const pts=[[x+Math.cos(a)*radius*0.12,y+Math.sin(a)*radius*0.10]];
    for(let j=1;j<=4;j++) {
      const r=length*j/4, wobble=rng(-0.11,0.11);
      pts.push([x+Math.cos(a+wobble)*r,y+Math.sin(a+wobble)*r*0.78]);
    }
    for(const [width,color,alpha] of [[5,dark,0.95],[2,cyan,0.72]]) {
      crater.lineStyle(width,color,alpha);crater.beginPath();
      pts.forEach(([px,py],j)=>j?crater.lineTo(px,py):crater.moveTo(px,py));crater.strokePath();
    }
    if(i%2===0) {
      const [bx,by]=pts[2], b=a+(i%4===0?0.75:-0.7);
      crater.lineStyle(2,0x0a3942,0.85);crater.beginPath();crater.moveTo(bx,by);
      crater.lineTo(bx+Math.cos(b)*length*0.27,by+Math.sin(b)*length*0.2);crater.strokePath();
    }
  }
  scene.tweens.add({targets:crater,alpha:0,delay:1800,duration:1300,onComplete:()=>crater.destroy()});
  const flash=scene.add.circle(x,y,Math.max(8,radius*0.2),pale,0.7).setDepth(17);
  scene.tweens.add({targets:flash,alpha:0,scale:1.6,duration:110,onComplete:()=>flash.destroy()});
  const ring=scene.add.circle(x,y,7,cyan,0).setStrokeStyle(2,cyan,0.7).setDepth(14);
  scene.tweens.add({targets:ring,scaleX:radius/7,scaleY:radius/9,alpha:0,duration:270,onComplete:()=>ring.destroy()});
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5+rng(-0.3,0.3),d=radius*rng(0.3,0.65);
    const chip=scene.add.rectangle(x,y,3,3,i%2?cyan:pale,0.85).setDepth(15);
    scene.tweens.add({targets:chip,x:x+Math.cos(a)*d,y:y+Math.sin(a)*d*0.7,alpha:0,duration:260,onComplete:()=>chip.destroy()});
  }
}
