import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import R from '@dimforge/rapier3d-compat';
import { captureProductionCatalog, mergeProductionCatalog } from '../src/world/production-scene-catalog.js';
import { applyProductionObjectTransform } from '../src/world/production-level-edits.js';
import { duplicateObjectRecords } from '../tools/map-editor/selection-tools.js';
import { adaptLibrarySceneToEditor, serializeLibrarySceneFromEditor } from '../tools/map-editor/library-scene-adapter.js';
import SCENE from '../src/world/library-island-v2.scene.json' with {type:'json'};
import { authoredLibraryTerrainData } from '../src/world/library-island-v2.js';
import { WORLD_LOCATIONS } from '../src/world/world-locations.js';

function fixture() {
  const root=new pc.Entity('World'),group=new pc.Entity('Shop'),part=new pc.Entity('Outfitter clerk body');
  group.locationId='shop-island';root.addChild(group);group.addChild(part);part.setLocalScale(1,2,3);
  const origin=WORLD_LOCATIONS.find(l=>l.id==='shop-island').worldPosition;group.setPosition(origin.x,0,origin.z);
  part.render={enabled:true,type:'box',meshInstances:[{mesh:{actual:true},material:{actual:true}}]};
  root.enabled=false;group.enabled=false;
  const world={root,islandEntities:new Map(),mountainWaters:[],materials:{},homeInteractions:[]};
  return {world,part,group};
}
test('production catalog retains actual meshes/materials and authored visibility inside inactive load groups',()=>{
  const {world,part}=fixture(),catalog=captureProductionCatalog(world),record=catalog.records.get('shop-island')[0];
  assert.equal(record.visible,true);assert.equal(record.metadata.npcId,'Outfitter clerk');
  assert.deepEqual(record.size,{x:1,y:2,z:3});assert.equal(catalog.references.get(record.id).meshInstances,part.render.meshInstances);
  const id=record.id;world.root.addChild(new pc.Entity('Unrelated addition'));assert.equal(captureProductionCatalog(world).records.get('shop-island')[0].id,id);
  part.enabled=false;assert.equal(captureProductionCatalog(world).records.get('shop-island')[0].visible,false);
});
test('catalog refresh preserves authored changes, deletions and unpublished copies',()=>{
  const {world}=fixture(),catalog=captureProductionCatalog(world),level={objects:[],metadata:{}};
  mergeProductionCatalog(level,catalog,'shop-island');const original=level.objects[0];original.transform.position.x+=5;
  const copy=duplicateObjectRecords([original],()=> 'copy-1')[0];level.objects.push(copy);
  assert.notEqual(copy.metadata.npcId,original.metadata.npcId);
  mergeProductionCatalog(level,catalog,'shop-island');assert.equal(level.objects.length,2);assert.ok(Math.abs(level.objects[0].transform.position.x-5)<1e-4);
  level.objects=level.objects.filter(r=>r.id==='copy-1');mergeProductionCatalog(level,catalog,'shop-island');
  assert.deepEqual(level.objects.map(r=>r.id),['copy-1']);
});
test('upgrading an approximate adapter preserves a deliberately moved reference',()=>{
  const {world}=fixture(),catalog=captureProductionCatalog(world),source=catalog.records.get('shop-island')[0];
  const old={...structuredClone(source),id:'old-id',metadata:{productionReference:true}};old.transform.position.x=2;
  const baseline={objects:[structuredClone(old)]};old.transform.position.x+=4;
  const level={objects:[old],metadata:{}};mergeProductionCatalog(level,catalog,'shop-island',baseline);
  assert.ok(Math.abs(level.objects[0].transform.position.x-4)<1e-4);
});
test('moving/resizing generated solids also updates real Rapier shapes and bench facing',async()=>{
  await R.init();const physicsWorld=new R.World({x:0,y:0,z:0});
  try {
    for(const desc of [R.ColliderDesc.cuboid(.5,.5,.5),R.ColliderDesc.roundCuboid(.5,.5,.5,.05),R.ColliderDesc.convexHull(new Float32Array([-.5,-.5,-.5,.5,-.5,-.5,0,.5,0,0,-.5,.5]))]) {
      const entity=new pc.Entity('bench seat');entity.physicsCollider=physicsWorld.createCollider(desc);
      entity.productionInteraction={position:{x:0,y:0,z:0},seatPosition:{x:0,y:1,z:0},exitPosition:{x:0,y:0,z:1},facingYaw:0};
      applyProductionObjectTransform({RAPIER:R},entity,{transform:{position:{x:3,y:2,z:1},rotation:{x:0,y:180,z:0},scale:{x:1,y:1,z:1}},size:{x:2,y:3,z:2}});
      const actual=entity.physicsCollider.translation();assert.deepEqual([actual.x,actual.y,actual.z],[3,2,1]);
      assert.ok(Math.abs(Math.abs(entity.productionInteraction.facingYaw)-180)<.01);
      assert.ok(Math.abs(entity.productionInteraction.exitPosition.z)<.01);
      physicsWorld.step();assert.ok(physicsWorld.intersectionWithShape({x:3,y:2,z:1},{x:0,y:0,z:0,w:1},new R.Ball(.01))!==null);
    }
  }finally{physicsWorld.free();}
});
test('Library terrain survives scene export/import and converts back to the game coordinate frame',()=>{
  const level=adaptLibrarySceneToEditor(SCENE);level.terrain.positions[1]+=.5;
  const exported=serializeLibrarySceneFromEditor(level),restored=adaptLibrarySceneToEditor(exported);
  assert.deepEqual(restored.terrain.positions,level.terrain.positions);assert.deepEqual(restored.terrain.indices,level.terrain.indices);
  const location=WORLD_LOCATIONS.find(l=>l.id==='veiled-athenaeum'),data=authoredLibraryTerrainData(location,exported.editorTerrain);
  assert.equal(data.vertices.length,level.terrain.positions.length/3);assert.ok(data.vertices.flat().every(Number.isFinite));
});
