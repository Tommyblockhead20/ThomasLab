import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { createRayDiscData, createArmTubeData } from '../src/fishing/aquatic-sculpture.js';
import { creatureArt } from '../src/fishing/creature-art.js';
import { createFishBodyData, SCULPTED_FISH_ARCHETYPES } from '../src/fishing/fish-sculpture.js';
import { repairSolidAttachments, solidPartsOverlap } from '../src/fishing/solid-attachments.js';
import { createSurfacePixels, addSurfaceUvs } from '../src/graphics/surface-detail.js';

test('rebuilt fish, ray wings and curled arms are finite, closed and consistently wound after welding their UV seams', () => {
  const examples=FISH_SPECIES.filter(s=>SCULPTED_FISH_ARCHETYPES.has(s.visual.archetype)).map(species=>({id:species.id,data:createFishBodyData(species.visual.archetype,species.visual,creatureArt(species,species.visual.archetype))}));
  for(const manta of [true,false])examples.push({id:`ray-${manta}`,data:createRayDiscData(manta,creatureArt({},'ray'))});
  for(let i=0;i<8;i++)examples.push({id:`arm-${i}`,data:createArmTubeData(i)});
  for (const {id,data} of examples) {
    const species={id};
    assert.ok(data.positions.every(Number.isFinite),species.id);
    assert.equal(data.uvs.length,data.positions.length/3*2);
    if(data.colors)assert.equal(data.colors.length,data.positions.length/3*4);
    const keys=[];
    for(let i=0;i<data.positions.length;i+=3)keys.push(data.positions.slice(i,i+3).map(v=>v.toFixed(7).replace('-0.0000000','0.0000000')).join(','));
    const edges=new Map();let volume=0;
    for(let i=0;i<data.indices.length;i+=3){
      const ids=data.indices.slice(i,i+3),[a,b,c]=ids.map(n=>data.positions.slice(n*3,n*3+3));
      volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
      for(let j=0;j<3;j++){const edge=[keys[ids[j]],keys[ids[(j+1)%3]]].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
    }
    assert.ok([...edges.values()].every(count=>count===2),`${species.id}: open/nonmanifold edge`);
    assert.ok(volume>0,`${species.id}: inward or empty body`);
  }
});

const octahedron = (name,x,y,z) => ({name,position:{x,y,z},scale:{x:2,y:2,z:2},vertices:[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1]});
test('the attachment check rejects overlapping bounds whose rendered solids are separated', () => {
  const a=octahedron('body',0,0,0),b=octahedron('head',1.5,1.5,0);
  assert.equal(solidPartsOverlap(a,b),false);
  assert.equal(solidPartsOverlap(a,octahedron('overlap',.6,.6,0)),true);
  const repaired=repairSolidAttachments([a,b]);
  assert.equal(repaired.corrections.length,1);
  assert.equal(solidPartsOverlap(...repaired.parts),true);
  assert.deepEqual(b.position,{x:1.5,y:1.5,z:0},'caller data is not mutated');
});

test('all 300 species have valid art palettes and distinct bounded shiny treatment', () => {
  for(const species of FISH_SPECIES){
    const ordinary=creatureArt(species,species.visual.archetype),shiny=creatureArt(species,species.visual.archetype,true);
    for(const art of [ordinary,shiny])for(const key of ['back','flank','belly','fin'])assert.ok(art[key].every(v=>Number.isFinite(v)&&v>=0&&v<=1),species.id);
    assert.notDeepEqual(ordinary.flank,shiny.flank,species.id);
  }
});

test('material tiles are deterministic and valid, and adding UVs preserves mesh/collision coordinates', () => {
  for(const kind of ['wood','fabric','roof','sand','grass','scales','stone']){
    const a=createSurfacePixels(kind,32),b=createSurfacePixels(kind,32);
    assert.deepEqual(a,b,kind);assert.equal(a.color.length,4096);assert.equal(a.normal.length,4096);
    for(let i=3;i<a.color.length;i+=4){assert.equal(a.color[i],255);assert.equal(a.normal[i],255);}
  }
  const geometry={positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1]},before=structuredClone(geometry);
  addSurfaceUvs(geometry);
  assert.deepEqual(geometry.positions,before.positions);assert.deepEqual(geometry.normals,before.normals);assert.equal(geometry.uvs.length,6);
});
