import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import { createHeadlessWorld } from '../tools/visual-review/headless-world.mjs';
import { captureProductionCatalog,mergeProductionCatalog } from '../src/world/production-scene-catalog.js';
import { applyProductionLevelEdits } from '../src/world/production-level-edits.js';
import { makeProductionIslandEditorLevel } from '../tools/map-editor/production-island-adapter.js';
import { createCharacterModel } from '../src/player/character-model.js';
import { COSMETIC_CATALOG, PENDING_COSMETIC_VISUAL_REDESIGN_IDS } from '../src/progression/cosmetics.js';
import { DEFAULT_APPEARANCE } from '../src/player/appearance.js';
import { GenericWorldScene } from '../tools/map-editor/generic-scene.js';
import { getWorldEditorWorld } from '../tools/map-editor/world-registry.js';

test('real production world, editor references, saved object edits and all cosmetic factories work in the engine',async()=>{
  const runtime=await createHeadlessWorld();
  try {
    const {app,world}=runtime,catalog=captureProductionCatalog(world);
    assert.ok(catalog.records.get('main-mountain').filter(r=>r.category==='Climbing rocks').length>6000);
    const editor=new GenericWorldScene(app,app.root);editor.productionCatalog=catalog;
    for(const id of ['home-island','shop-island','aquarium-island','normal-fishing-island','cold-island','cave-fishing-island']) {
      assert.ok(catalog.records.get(id)?.length>8,`${id} has real game detail`);
      const level=makeProductionIslandEditorLevel(id);mergeProductionCatalog(level,catalog,id);
      editor.setWorld(getWorldEditorWorld(id),level);editor.setEnabled(true);
      assert.ok(editor.entities.size>5,`${id} renders and registers selectable game objects`);
      for(const water of level.waters??[]) if(water.metadata?.productionSourceWater)assert.ok(catalog.waterReferences.has(water.identity||water.id),`${id} has the actual game water mesh`);
    }
    const level=makeProductionIslandEditorLevel('shop-island');mergeProductionCatalog(level,catalog,'shop-island');
    const seat=level.objects.find(r=>/shore rest bench seat/.test(r.name));assert.ok(seat);
    const entity=world.productionEntities.get(seat.id).entity,old=entity.getPosition().clone();
    seat.transform.position.x+=3;seat.transform.rotation.y+=180;seat.transform.scale={x:1.1,y:1,z:1};
    applyProductionLevelEdits(world,level);assert.ok(Math.abs(entity.getPosition().x-old.x-3)<.001);
    assert.ok(Math.abs(entity.physicsCollider.translation().x-entity.getPosition().x)<.001);
    const copy=structuredClone(seat);copy.id='authored-copy';copy.transform.position.x+=5;
    const onlyCopy={...level,objects:[copy],metadata:{...level.metadata,productionReferenceIds:[]}};
    applyProductionLevelEdits(world,onlyCopy);assert.ok(world.productionEntities.get('authored-copy').entity.render.meshInstances.length>0);
    const avatar=new pc.Entity('All cosmetic review',app);app.root.addChild(avatar);const model=createCharacterModel(avatar);
    assert.equal(PENDING_COSMETIC_VISUAL_REDESIGN_IDS.length,0);
    for(const cosmetic of COSMETIC_CATALOG) for(const avatarType of ['human','blob']) {
      model.setAppearance({...DEFAULT_APPEARANCE,avatarType,headwear:'none',eyewear:'none',faceAccessory:'none',backAccessory:'none',[cosmetic.slot]:cosmetic.id});
      assert.equal(model.getCosmeticDiagnostic().missingModelIds.length,0,`${cosmetic.id} ${avatarType}`);
      for(const render of avatar.findComponents('render').filter(c=>c.entity.enabled&&c.enabled)) for(const mi of render.meshInstances) {
        const positions=[];mi.mesh.getPositions(positions);assert.ok(positions.length>0&&positions.every(Number.isFinite),`${cosmetic.id} has finite rendered geometry`);
        const bounds=mi.aabb;assert.ok([bounds.center.x,bounds.center.y,bounds.center.z,bounds.halfExtents.x,bounds.halfExtents.y,bounds.halfExtents.z].every(v=>Number.isFinite(v)&&Math.abs(v)<5),`${cosmetic.id} stays fitted to the avatar`);
      }
    }
    avatar.destroy();
  }finally{runtime.dispose();}
});
