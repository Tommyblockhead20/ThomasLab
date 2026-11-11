import * as pc from 'playcanvas';
import { attachSignText } from './sign-text-renderer.js';

// Built once by MountainWorld; the editor captures these same meshes/materials.
export function buildRascalsRest(world,location) {
  const floor=location.elevation+.18;
  const root=world.createStructureRoot("Rascal's Rest pavilion",location.angle,location.radius,floor,location.id);
  const m=world.materials,box=(name,p,s,mat=m.wood,r={},solid=true)=>world.addStructureBox(root,name,p,s,mat,r,solid);
  box('Old Man pavilion deck',{x:0,y:.02,z:0},{x:8,y:.18,z:6},m.woodLight);
  for(const x of [-3.6,3.6])for(const z of [-2.6,2.6])box('Old Man awning post',{x,y:1.8,z},{x:.16,y:3.6,z:.16});
  for(const side of [-1,1])box('Old Man canvas roof',{x:side*2,y:3.85,z:0},{x:4.2,y:.12,z:6.6},m.cabinFabric,{z:side*-12},false);
  const sign=box("Rascal's Rest sign",{x:0,y:2.9,z:2.85},{x:5.4,y:.65,z:.14},m.woodLight,{},false);
  attachSignText(world.app.graphicsDevice,sign,"RASCAL'S REST");
  box('Old Man event desk',{x:0,y:.72,z:1},{x:3,y:1.25,z:.8});
  const npc=new pc.Entity('Old Man Fisher',world.app);root.addChild(npc);npc.setLocalPosition(0,.14,-.4);
  const part=(name,p,s,mat,type='box',r={})=>{
    const e=world.addStructureBox(npc,`Old Man Fisher ${name}`,p,s,mat,r,false);
    e.productionNpcGroupId='old-man-fisher';if(type!=='box')e.render.type=type;return e;
  };
  for(const side of [-1,1]) {
    part('boot',{x:side*.22,y:.14,z:.08},{x:.3,y:.28,z:.46},m.deepRock);
    part('trouser',{x:side*.2,y:.55,z:0},{x:.3,y:.65,z:.32},m.deepRock);
    part('coat sleeve',{x:side*.48,y:1.15,z:0},{x:.24,y:.8,z:.3},m.cabinTrim,'box',{z:side*8});
    part('hand',{x:side*.5,y:.75,z:.02},{x:.19,y:.22,z:.2},m.cabinWarm,'sphere');
    part('eye',{x:side*.11,y:1.97,z:.27},{x:.045,y:.05,z:.03},m.deepRock,'sphere');
  }
  part('weathered coat',{x:0,y:1.16,z:0},{x:.8,y:.94,z:.46},m.cabinTrim);
  part('face',{x:0,y:1.88,z:0},{x:.51,y:.59,z:.48},m.cabinWarm,'sphere');
  part('nose',{x:0,y:1.9,z:.28},{x:.11,y:.14,z:.13},m.cabinWarm,'sphere');
  part('white beard',{x:0,y:1.63,z:.21},{x:.43,y:.46,z:.21},m.snow,'sphere');
  part('hat brim',{x:0,y:2.16,z:0},{x:.79,y:.08,z:.68},m.woodLight,'cylinder');
  part('hat crown',{x:0,y:2.3,z:0},{x:.49,y:.29,z:.46},m.woodLight,'cylinder');
  part('fishing rod',{x:.75,y:1.55,z:.1},{x:.045,y:2.3,z:.045},m.wood,'box',{z:-17});
  part('satchel',{x:-.47,y:.93,z:-.04},{x:.26,y:.46,z:.31},m.woodLight);
  for(const side of [-1,1])box('Old Man prize trophy',{x:side*1.05,y:1.52,z:1},{x:.22,y:.32,z:.22},m.decoBrass,{},false);
  for(const side of [-1,1]) {
    const trunk=box('Rascal pine trunk',{x:side*10,y:1.15,z:-3},{x:.32,y:2.6,z:.32});trunk.render.type='cylinder';
    world.registerClimbSurface(trunk,trunk.physicsCollider,'rough','Rascal pine trunk');
    for(let layer=0;layer<3;layer++) {const crown=box('Rascal pine needles',{x:side*10,y:2.1+layer*.55,z:-3},{x:2.4-layer*.55,y:1.8,z:2.4-layer*.55},m.shrubLight,{},false);crown.render.type='cone';}
    const stone=box('Rascal shore stone',{x:side*7,y:.22,z:4.5},{x:1.2,y:.6,z:.85},m.islandRock,{y:side*24},false);stone.render.type='sphere';
  }
  const p=root.getPosition(),q=root.getRotation(),v=q.transformVector(new pc.Vec3(0,0,2.5));
  world.homeInteractions.push({id:'old-man-services',label:'TALK TO THE OLD MAN • EVENTS & MISCHIEF',action:'old-man',position:{x:p.x+v.x,y:floor+.15,z:p.z+v.z},range:2.8});
  world.buildAuthoredIslandBench(location,{radial:13,tangent:5,towardCenter:false});
  return root;
}
