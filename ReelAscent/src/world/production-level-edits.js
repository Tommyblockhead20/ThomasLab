import * as pc from 'playcanvas';
import HOME from './world-editor-levels/home-island.json' with {type:'json'};
import SHOP from './world-editor-levels/shop-island.json' with {type:'json'};
import AQUARIUM from './world-editor-levels/aquarium-island.json' with {type:'json'};
import MANGROVE from './world-editor-levels/normal-fishing-island.json' with {type:'json'};
import FROST from './world-editor-levels/cold-island.json' with {type:'json'};
import CAVE from './world-editor-levels/cave-fishing-island.json' with {type:'json'};
import { WORLD_LOCATIONS } from './world-locations.js';
import { attachWorldEditorLevelToStructure } from './world-editor-v2-runtime.js';
import { addSurfaceUvs } from '../graphics/surface-detail.js';
import { attachSignText } from './sign-text-renderer.js';

export const PRODUCTION_LEVELS = Object.freeze([HOME,SHOP,AQUARIUM,MANGROVE,FROST,CAVE]);
export function terrainSignature(terrain) {
  let h=2166136261;
  for (const value of [...terrain?.positions??[],...terrain?.indices??[]]) {
    const rounded=Math.round(value*100000); h=Math.imul(h ^ rounded,16777619);
  }
  return `${terrain?.positions?.length??0}:${terrain?.indices?.length??0}:${h>>>0}`;
}
export function rescaleCollider(world, collider, ratio) {
  if (!collider || ['x','y','z'].every(k=>Math.abs(ratio[k]-1)<1e-6)) return;
  const R=world.RAPIER, s=collider.shape, type=R.ShapeType;
  let shape;
  const vertices = data => new Float32Array(Array.from(data,(v,i)=>v*ratio[['x','y','z'][i%3]]));
  if (s.type===type.Cuboid) shape=new R.Cuboid(s.halfExtents.x*ratio.x,s.halfExtents.y*ratio.y,s.halfExtents.z*ratio.z);
  else if (s.type===type.RoundCuboid) shape=new R.RoundCuboid(s.halfExtents.x*ratio.x,s.halfExtents.y*ratio.y,s.halfExtents.z*ratio.z,s.borderRadius*Math.min(ratio.x,ratio.y,ratio.z));
  else if (s.type===type.Cylinder) shape=new R.Cylinder(s.halfHeight*ratio.y,s.radius*Math.max(ratio.x,ratio.z));
  else if (s.type===type.Ball) shape=new R.Ball(s.radius*Math.max(ratio.x,ratio.y,ratio.z));
  else if (s.type===type.ConvexPolyhedron) shape=new R.ConvexPolyhedron(vertices(s.vertices),s.indices??null);
  else if (s.type===type.TriMesh) shape=new R.TriMesh(vertices(s.vertices),s.indices);
  else throw new Error(`Unsupported editable collider shape ${s.type}`);
  collider.setShape(shape);
}
export function applyProductionObjectTransform(world, entity, item, origin={x:0,z:0}) {
  const p=item.transform.position,r=item.transform.rotation,scale=item.size?Object.fromEntries(['x','y','z'].map(k=>[k,item.size[k]*(item.transform.scale?.[k]??1)])):null;
  const old=entity.getWorldTransform().getScale();
  const oldPosition=entity.getPosition().clone(),oldRotation=entity.getRotation().clone();
  const parentScale=entity.parent?.getWorldTransform().getScale()??{x:1,y:1,z:1};
  if (scale) rescaleCollider(world,entity.physicsCollider,{x:scale.x/old.x,y:scale.y/old.y,z:scale.z/old.z});
  entity.setPosition(p.x+(origin.x??0),p.y,p.z+(origin.z??0)); entity.setEulerAngles(r.x,r.y,r.z);
  if (scale) entity.setLocalScale(scale.x/parentScale.x,scale.y/parentScale.y,scale.z/parentScale.z);
  if(entity.productionInteraction) {
    const interaction=entity.productionInteraction,delta=new pc.Quat().mul2(entity.getRotation(),oldRotation.invert());
    for(const key of ['position','seatPosition','exitPosition']) if(interaction[key]) {
      const v=new pc.Vec3(interaction[key].x-oldPosition.x,interaction[key].y-oldPosition.y,interaction[key].z-oldPosition.z);
      delta.transformVector(v,v); const next=entity.getPosition();interaction[key]={x:next.x+v.x,y:next.y+v.y,z:next.z+v.z};
    }
    const forward=delta.transformVector(new pc.Vec3(0,0,1));
    interaction.facingYaw+=Math.atan2(forward.x,forward.z)*180/Math.PI;
  }
  if (entity.physicsCollider) {
    const q=entity.getRotation(),position=entity.getPosition();
    entity.physicsCollider.setTranslation({x:position.x,y:position.y,z:position.z});
    entity.physicsCollider.setRotation({x:q.x,y:q.y,z:q.z,w:q.w});
  }
}
export function applyProductionLevelEdits(world, level) {
  if (!level?.metadata?.productionCatalog) return;
  const location=WORLD_LOCATIONS.find(l=>l.id===level.runtimeLocationId); if (!location) return;
  const ids=new Set((level.objects??[]).map(r=>r.id));
  for (const id of level.metadata.productionReferenceIds??[]) if (!ids.has(id)) {
    const entity=world.productionEntities.get(id)?.entity; if (entity) {entity.enabled=false;entity.physicsCollider?.setEnabled(false);}
  }
  for (const item of level.objects??[]) {
    if (!item.metadata?.productionMeshRef) continue;
    let entity=world.productionEntities.get(item.metadata.productionMeshRef)?.entity; if (!entity) continue;
    if(item.id!==item.metadata.productionMeshRef) {
      const source=entity;entity=new pc.Entity(item.name,world.app);
      const meshes=source.render.meshInstances.map(mi=>new pc.MeshInstance(mi.mesh,mi.material,entity));
      entity.addComponent('render',{meshInstances:meshes,castShadows:source.render.castShadows});
      (world.locationLoadGroups.get(location.id)??world.root).addChild(entity);
      entity.setPosition(source.getPosition());entity.setRotation(source.getRotation());entity.setLocalScale(source.getWorldTransform().getScale());
      entity.productionAuthoringId=item.id;entity.productionMeshSourceId=item.metadata.productionMeshRef;
      entity.productionBenchGroupId=item.metadata.benchId;entity.productionNpcGroupId=item.metadata.npcId;
      if(source.physicsCollider) {
        entity.physicsCollider=world.physicsWorld.createCollider(new world.RAPIER.ColliderDesc(source.physicsCollider.shape).setFriction(source.physicsCollider.friction()));
        const climb=world.climbSurfaces.get(source.physicsCollider.handle);
        if(climb)world.registerClimbSurface(entity,entity.physicsCollider,climb.type,item.name);
      }
      if(source.productionInteraction) {
        entity.productionInteraction=structuredClone(source.productionInteraction);entity.productionInteraction.id=`authored-${item.metadata.benchId||item.id}`;
        world.homeInteractions.push(entity.productionInteraction);
      }
      world.productionEntities.set(item.id,{entity,locationId:location.id});
    }
    entity.enabled=item.visible!==false; entity.physicsCollider?.setEnabled(item.visible!==false);
    const base=item.metadata.sourceTransform;
    if (item.id!==item.metadata.productionMeshRef || !base || ['x','y','z'].some(k=>(item.transform.scale?.[k]??1)!==1)
      || JSON.stringify([base.position,base.rotation,base.size])!==JSON.stringify([item.transform.position,item.transform.rotation,item.size])) applyProductionObjectTransform(world,entity,item,location.worldPosition);
    if (item.metadata.signText && item.metadata.signText!==entity._productionSignText) {
      for(const child of [...entity.children]) if(child.name.endsWith(' text')) child.destroy();
      attachSignText(world.app.graphicsDevice,entity,item.metadata.signText);
    }
  }
  if (level.terrain?.positions?.length && level.metadata.productionTerrainBaseline
    && terrainSignature(level.terrain)!==level.metadata.productionTerrainBaseline) {
    const entity=world.islandEntities.get(location.id);
    if(entity) {
      const positions=level.terrain.positions.map((v,i)=>v+(i%3===0?location.worldPosition.x:i%3===2?location.worldPosition.z:0));
      const geometry=new pc.Geometry();geometry.positions=positions;geometry.indices=level.terrain.indices;geometry.calculateNormals();
      const mesh=pc.Mesh.fromGeometry(world.app.graphicsDevice,addSurfaceUvs(geometry)),material=entity.render.meshInstances[0].material;
      entity.render.meshInstances=[new pc.MeshInstance(mesh,material,entity)];
      entity.physicsCollider.setShape(new world.RAPIER.TriMesh(new Float32Array(positions),new Uint32Array(level.terrain.indices)));
      const vertices=Array.from({length:positions.length/3},(_,i)=>positions.slice(i*3,i*3+3));
      const triangles=Array.from({length:level.terrain.indices.length/3},(_,i)=>level.terrain.indices.slice(i*3,i*3+3));
      world.islandTerrainSurfaces.set(location.id,{vertices,triangles});
    }
  }
  const root=new pc.Entity(`${location.displayName} authored additions`,world.app);root.setPosition(location.worldPosition.x,0,location.worldPosition.z);
  (world.locationLoadGroups.get(location.id)??world.root).addChild(root);
  attachWorldEditorLevelToStructure(world,root,{...level,terrain:undefined,objects:(level.objects??[]).filter(r=>!r.metadata?.productionMeshRef),waters:[]});
  for(const water of level.waters??[]) {
    const baseline=water.metadata?.productionSourceWater,zone=world.fishingZones.find(z=>z.id===(water.identity||water.id));
    if(!baseline||!zone||JSON.stringify(baseline)===JSON.stringify({position:water.position,radii:water.radii,depthMeters:water.depthMeters,color:water.color}))continue;
    const center={x:water.position.x+location.worldPosition.x,y:water.position.y,z:water.position.z+location.worldPosition.z};
    let sourceMaterial=world.materials.shallowWater;
    for(const {entity} of world.productionEntities.values()) if(entity.productionFishingZoneId===zone.id) {sourceMaterial=entity.render.meshInstances[0]?.material??sourceMaterial;entity.enabled=false;}
    const material=sourceMaterial.clone();if(/^#[0-9a-f]{6}$/i.test(water.color??''))material.diffuse.fromString(water.color);material.update();
    const previousTarget=world.buildTarget;world.buildTarget=world.locationLoadGroups.get(location.id)??world.root;
    world.addFishingWaterSurface(`${water.name} authored water`,center,water.radii,material);world.buildTarget=previousTarget;
    zone.center={x:center.x,z:center.z};zone.surfaceY=center.y;zone.radii={...water.radii};zone.floorY=center.y-Math.max(.1,water.depthMeters??1);
    zone.containsRenderedWater=null;zone.distanceToRenderedWater=null;
  }
}
