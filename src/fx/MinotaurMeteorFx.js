// Meteor impact is purely cosmetic. The boss owns hit detection and timing.
const CYAN = 0x32e9d6;
const ICE = 0xbafff1;
const DEEP = 0x07535e;
export function playMeteorImpact(scene, x, y, radius) {
  if (!scene?.sys?.isActive()) return;
  const g = scene.add.graphics().setDepth(13);
  const shards = [];
  const rand = (a,b) => Phaser.Math.FloatBetween(a,b);
  // Dark crater remains briefly, then evaporates.
  const crater = scene.add.graphics().setDepth(3);
  crater.fillStyle(0x031c27, .7); crater.fillEllipse(x,y,radius*1.65,radius*.92);
  crater.lineStyle(3,DEEP,.85); crater.strokeEllipse(x,y,radius*1.7,radius);
  for(let i=0;i<11;i++) {
    const a=i*Math.PI*2/11+rand(-.18,.18), r=radius*rand(.48,.92);
    crater.lineStyle(rand(1,3),i%3?CYAN:ICE,.7);
    crater.beginPath(); crater.moveTo(x+Math.cos(a)*radius*.25,y+Math.sin(a)*radius*.17);
    crater.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r*.62);
    crater.lineTo(x+Math.cos(a+.22)*r*1.2,y+Math.sin(a+.22)*r*.78);crater.strokePath();
  }
  scene.tweens.add({targets:crater,alpha:0,delay:1100,duration:850,onComplete:()=>crater.destroy()});
  const ring=scene.add.circle(x,y,12,CYAN,0).setStrokeStyle(6,ICE,1).setDepth(14);
  scene.tweens.add({targets:ring,scaleX:radius/6,scaleY:radius/9,alpha:0,duration:420,ease:'Cubic.Out',onComplete:()=>ring.destroy()});
  const flash=scene.add.circle(x,y,radius*.64,ICE,.8).setDepth(16);
  scene.tweens.add({targets:flash,scale:1.65,alpha:0,duration:210,onComplete:()=>flash.destroy()});
  for(let i=0;i<24;i++) {
    const a=i*Math.PI*2/24+rand(-.16,.16), d=rand(radius*.65,radius*1.55);
    const p=scene.add.rectangle(x,y,rand(3,8),rand(4,11),i%4===0?ICE:i%3===0?DEEP:CYAN,1).setDepth(17).setRotation(a);
    shards.push(p);
    scene.tweens.add({targets:p,x:x+Math.cos(a)*d,y:y+Math.sin(a)*d*.65,angle:rand(-180,180),alpha:0,scale:.3,duration:rand(340,650),ease:'Cubic.Out',onComplete:()=>p.destroy()});
  }
  for(let i=0;i<3;i++) {
    const r=scene.add.circle(x,y,4,CYAN,0).setStrokeStyle(2,i===1?ICE:CYAN,.8).setDepth(15);
    scene.tweens.add({targets:r,scale:radius/(3+i),alpha:0,delay:i*75,duration:360+i*100,onComplete:()=>r.destroy()});
  }
}
