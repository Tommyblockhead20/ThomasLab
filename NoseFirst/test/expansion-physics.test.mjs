import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepRollingProp} from '../ball-physics.js';
import {normalizeGardenProgress} from '../garden-expansion.js';
const ball=(y=1,v={})=>({position:{x:0,y,z:0},rotation:{x:0,z:0},userData:{velocity:{x:0,y:0,z:0,...v}}});
const floor={radius:.2,canMove:()=>true,supportHeight:()=>0};

test('dropped toys fall through the air, bounce with lower energy, and settle on the surface',()=>{
  const object=ball(2);stepRollingProp(object,1/60,floor);
  assert.ok(object.position.y>1.9&&object.position.y<2,'no snapping to ground');
  let bounced=false,peak=0;
  for(let i=0;i<600;i++){
    const before=object.userData.velocity.y;stepRollingProp(object,1/60,floor);
    if(before<0&&object.userData.velocity.y>0)bounced=true;
    if(bounced)peak=Math.max(peak,object.position.y);
    assert.ok(object.position.y>=.2-1e-9);
  }
  assert.ok(bounced);assert.ok(peak<.6);assert.equal(object.position.y,.2);assert.equal(object.userData.velocity.y,0);
});
test('fast rolling cannot tunnel through a thin wall and loses energy on impact',()=>{
  const object=ball(.2,{x:80});let furthest=0;
  stepRollingProp(object,.05,{...floor,canMove:x=>{furthest=Math.max(furthest,x);return x<.5}});
  assert.ok(object.position.x<.5);assert.ok(object.userData.velocity.x<0);assert.ok(Math.abs(object.userData.velocity.x)<80);
  assert.ok(furthest<.56,'collision is sampled every .05 world units');
});
test('toys leaving raised surfaces fall instead of hovering or teleporting upward',()=>{
  const object=ball(1.2,{x:2});
  for(let i=0;i<70;i++)stepRollingProp(object,1/60,{...floor,supportHeight:(x,_z,ceiling)=>x<.15&&ceiling>=1?1:0});
  assert.ok(object.position.x>.15);assert.ok(object.position.y<.3);
});
test('new garden progress defaults safely and retains earned completions across reload',()=>{
  const empty=normalizeGardenProgress(undefined);assert.ok(Object.values(empty).every(v=>v===false));
  const old=normalizeGardenProgress({seedReturned:true,cardReturned:true,watered:true,unknown:'keep elsewhere'});
  assert.equal(old.metGardener,true);assert.equal(old.shedOpen,true);assert.equal(old.cardBlown,true);assert.equal(old.watered,true);
  assert.deepEqual(normalizeGardenProgress(JSON.parse(JSON.stringify(old))),old);
  assert.equal(normalizeGardenProgress({seedReturned:'false'}).seedReturned,false);
});
