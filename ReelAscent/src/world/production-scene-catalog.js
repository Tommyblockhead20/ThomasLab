import * as pc from 'playcanvas';
import { WORLD_LOCATIONS } from './world-locations.js';

const xyz = v => ({ x: v.x, y: v.y, z: v.z });
const hash = text => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
export function indexProductionEntities(world) {
  const byId = new Map();
  const waterMaterials=new Set(['water','shallowWater','deepWater','mangroveWater','frostWater'].map(k=>world.materials?.[k]).filter(Boolean));
  const walk = (entity, path, locationId) => {
    if (entity === world.courseRoot) return;
    const nextPath = `${path}/${entity.name}`, location = entity.locationId ?? locationId;
    if (entity.render?.meshInstances?.length) {
      const id = entity.productionAuthoringId || entity.rockId || `PRODUCTION-${hash(nextPath)}`;
      if (byId.has(id) && byId.get(id).entity !== entity) throw new Error(`Duplicate production scene identity: ${nextPath}`);
      entity.productionReferenceId = id; byId.set(id, { entity, locationId: location || 'main-mountain', path: nextPath });
      const water=world.mountainWaters?.find(w=>w.entity===entity);
      if(water?.zoneId) entity.productionFishingZoneId=water.zoneId;
      else if(entity.render.meshInstances.some(mi=>waterMaterials.has(mi.material))) {
        const p=entity.render.meshInstances[0].aabb.center;
        entity.productionFishingZoneId=world.fishingZones?.find(z=>Math.hypot(z.center.x-p.x,z.center.z-p.z)<1 && Math.abs(z.surfaceY-p.y)<.3)?.id;
      }
      if (/bench.*seat$/.test(entity.name.toLowerCase())) {
        const p=entity.getPosition();
        entity.productionInteraction=(world.homeInteractions??[]).find(i=>['rest','bench'].includes(i.action)
          && Math.hypot(i.position.x-p.x,i.position.y-p.y,i.position.z-p.z)<1.5);
      }
    }
    const counts = new Map();
    for (const child of entity.children ?? []) {
      const ordinal = counts.get(child.name) ?? 0; counts.set(child.name, ordinal + 1);
      walk(child, `${nextPath}${ordinal ? `[${ordinal}]` : ''}`, location);
    }
  };
  walk(world.root, '', 'main-mountain'); world.productionEntities = byId; return byId;
}

export function captureProductionCatalog(world) {
  const byId = indexProductionEntities(world), references = new Map(), records = new Map(),waterReferences=new Map();
  const terrain = new Set([...world.islandEntities.values(), world.mapEditorBakedTerrain, world.authoredSummitInfillEntity]);
  const waters = new Set((world.mountainWaters ?? []).map(w=>w.entity));
  for (const [id, item] of byId) {
    const { entity, locationId } = item;
    if(entity.productionFishingZoneId) {
      const ref={entity,meshInstances:entity.render.meshInstances};waterReferences.set(entity.productionFishingZoneId,ref);
      references.set(`WATER:${entity.productionFishingZoneId}`,ref);
    }
    // These exact terrain owners are already rendered from the shared editable mesh.
    if (terrain.has(entity) || waters.has(entity) || entity._transientWorldEffect || entity.productionFishingZoneId || /^(Continuous irregular mountain body|Global ocean|Ocean floor|Stoneveil Peak summit crown)/.test(entity.name)
      || entity.name.endsWith(' text') || /^(Map Editor baked|Authoritative summit)/.test(entity.name)) continue;
    if (locationId === 'main-mountain' && /^(Ocean|Sea floor)/.test(entity.name)) continue;
    const location = WORLD_LOCATIONS.find(l => l.id === locationId), origin = locationId === 'main-mountain' ? { x:0,y:0,z:0 } : location?.worldPosition ?? {x:0,y:0,z:0};
    const p = entity.getPosition(), r = entity.getEulerAngles(), s = entity.getWorldTransform().getScale();
    let visible=entity.render.enabled!==false,cursor=entity;
    // Loading groups and the hidden reference root are visibility optimizations, not
    // authored visibility. Preserve intentional disabled trophies/tank slots below them.
    while(cursor && cursor!==world.root && !cursor.locationId) { visible &&= cursor._enabled !== false; cursor=cursor.parent; }
    const position = { x:p.x-origin.x,y:p.y,z:p.z-origin.z };
    const record = { id, name: entity.name, type: entity.render.type === 'asset' ? 'box' : entity.render.type,
      category: entity.rockId ? 'Climbing rocks' : /bench|seat|backrest/.test(entity.name.toLowerCase()) ? 'Benches' : /clerk|buyer/.test(entity.name) ? 'NPCs' : 'Game objects',
      transform: { position, rotation: xyz(r), scale:{x:1,y:1,z:1} }, size:xyz(s), collision:Boolean(entity.physicsCollider), visible,
      metadata: { productionReference:true, productionMeshRef:entity.productionMeshSourceId||id, productionPath:item.path, source:'MountainWorld current builders',
        benchId: entity.productionBenchGroupId || (String(entity.mapDebugId??'').startsWith('BENCH-') ? entity.mapDebugId : entity.name.toLowerCase().includes('bench') ? entity.name.replace(/ (seat|back|backrest|leg|left leg|right leg|support).*$/i,'') : undefined),
        npcId: entity.productionNpcGroupId || /^(Outfitter clerk|Fish Market buyer)/.exec(entity.name)?.[1],
        productionSourceVisible:visible,
        sourceTransform:{ position:{...position}, rotation:xyz(r), size:xyz(s) }, signText:entity._productionSignText,
        editableSign: Boolean(entity._productionSignText), physicsShape:entity.physicsCollider?.shape?.type } };
    references.set(id, { entity, meshInstances:entity.render.meshInstances });
    const group = records.get(locationId) ?? []; group.push(record); records.set(locationId,group);
  }
  return { world, references, records,waterReferences };
}

export function createProductionReferenceEntity(app, record, catalog) {
  const reference = catalog?.references.get(record.metadata?.productionMeshRef); if (!reference) return null;
  const entity = new pc.Entity(record.name, app);
  const instances = reference.meshInstances.map(mi => {
    const instance = new pc.MeshInstance(mi.mesh, mi.material, entity); instance._editorBaseMaterial=mi.material; return instance;
  });
  entity.addComponent('render',{meshInstances:instances,castShadows:reference.entity.render.castShadows,receiveShadows:reference.entity.render.receiveShadows});
  entity.setLocalPosition(record.transform.position.x,record.transform.position.y,record.transform.position.z);
  entity.setLocalEulerAngles(record.transform.rotation.x,record.transform.rotation.y,record.transform.rotation.z);
  entity.setLocalScale(record.size.x,record.size.y,record.size.z);
  return entity;
}

export function mergeProductionCatalog(level, catalog, locationId, legacyBaseline=null) {
  const generated = catalog.records.get(locationId) ?? [], previous = level.objects ?? [];
  const previousIds=new Set(previous.map(r=>r.id)),generatedIds=new Set(generated.map(r=>r.id));
  const deleted=new Set((level.metadata?.productionReferenceIds??[]).filter(id=>!previousIds.has(id)));
  const edited = new Map(previous.map(r => [r.id,r]));
  const byName = new Map(previous.filter(r=>r.metadata?.productionReference).map(r=>[r.name,r]));
  const baselineByName=new Map((legacyBaseline?.objects??[]).map(r=>[r.name,r]));
  const objects = generated.filter(source=>!deleted.has(source.id)).map(source => {
    const old = edited.get(source.id) ?? byName.get(source.name);
    if (!old) return structuredClone(source);
    // Captured-source records retain authored transforms. Old approximate adapters are
    // upgraded to the actual source; only their demonstrably moved records are retained.
    if (old.metadata?.productionMeshRef) return {...structuredClone(source), transform:structuredClone(old.transform),size:structuredClone(old.size),visible:old.metadata.productionSourceVisible===undefined?source.visible:old.visible,
      metadata:{...source.metadata,...old.metadata,productionMeshRef:source.metadata.productionMeshRef}};
    const result=structuredClone(source),baseline=baselineByName.get(old.name);
    if(baseline) {
      for(const axis of ['x','y','z']) {
        for(const kind of ['position','rotation']) {
          const delta=(old.transform?.[kind]?.[axis]??0)-(baseline.transform?.[kind]?.[axis]??0);
          if(Math.abs(delta)>1e-5)result.transform[kind][axis]+=delta;
        }
        const ratio=old.size?.[axis]/baseline.size?.[axis];if(Number.isFinite(ratio)&&Math.abs(ratio-1)>1e-5)result.size[axis]*=ratio;
      }
      if(old.visible!==baseline.visible)result.visible=old.visible;
      if(old.metadata?.signText!==baseline.metadata?.signText&&old.metadata?.signText)result.metadata.signText=old.metadata.signText;
    }
    return result;
  });
  level.objects = [...objects,...previous.filter(r=>!r.metadata?.productionReference ||
    (r.metadata.productionMeshRef && r.id!==r.metadata.productionMeshRef && !generatedIds.has(r.id)))];
  const location=WORLD_LOCATIONS.find(l=>l.id===locationId),origin=location?.worldPosition??{x:0,z:0};
  level.waters=(level.waters??[]).map(water=>{
    if(water.metadata?.productionSourceWater)return water;
    const zone=catalog.world.fishingZones?.find(z=>z.id===(water.identity||water.id));if(!zone)return water;
    const source={position:{x:zone.center.x-origin.x,y:zone.surfaceY,z:zone.center.z-origin.z},radii:{...zone.radii},depthMeters:zone.surfaceY-zone.floorY,color:water.color};
    return {...water,...source,metadata:{...water.metadata,productionSourceWater:source}};
  });
  level.metadata = {...level.metadata,productionCatalog:true,productionReferenceIds:generated.map(r=>r.id)};
  return level;
}

export function productionTerrainForLocation(catalog,locationId) {
  const source=catalog.world.islandTerrainSurfaces.get(locationId),location=WORLD_LOCATIONS.find(l=>l.id===locationId);
  if(!source||!location)return null;
  const positions=source.vertices.flatMap(([x,y,z])=>[x-location.worldPosition.x,y,z-location.worldPosition.z]);
  return {mode:'production-island-terrain',format:'triangle-mesh-v1',coordinateSpace:'island-local',positions,indices:source.triangles.flat(),
    parts:[{name:'Current game terrain',firstVertex:0,vertexCount:source.vertices.length,firstTriangle:0,triangleCount:source.triangles.length}],
    metadata:{source:'MountainWorld current terrain output',productionAuthoritative:true}};
}
