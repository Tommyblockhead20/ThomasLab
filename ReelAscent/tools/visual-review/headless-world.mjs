import * as pc from 'playcanvas';
import RAPIER from '@dimforge/rapier3d-compat';
import { MountainWorld } from '../../src/world/mountain-v2.js';

// Runs the real engine builders without a browser/GPU. Text rasterization and the
// separately tested external GLB loader are omitted; scene meshes/materials are real.
export async function createHeadlessWorld() {
  await RAPIER.init();
  const canvas={id:`world-review-${Date.now()}`,width:16,height:16,clientWidth:16,clientHeight:16};
  const device=new pc.NullGraphicsDevice(canvas,{}),app=new pc.AppBase(canvas),options=new pc.AppOptions();
  options.graphicsDevice=device;options.componentSystems=[pc.RenderComponentSystem];options.soundManager={destroy(){}};app.init(options);
  const physicsWorld=new RAPIER.World({x:0,y:-20,z:0});
  const label=MountainWorld.prototype.createAquariumLabelMaterial,glb=MountainWorld.prototype.loadSkyreachVisualShell;
  MountainWorld.prototype.createAquariumLabelMaterial=function(){return this.materials.woodLight;};
  MountainWorld.prototype.loadSkyreachVisualShell=function(){};
  let world;
  try {world=new MountainWorld(app,RAPIER,physicsWorld,{editorReference:true});}
  finally{MountainWorld.prototype.createAquariumLabelMaterial=label;MountainWorld.prototype.loadSkyreachVisualShell=glb;}
  return {app,world,physicsWorld,RAPIER,dispose(){physicsWorld.free();app.destroy();}};
}
