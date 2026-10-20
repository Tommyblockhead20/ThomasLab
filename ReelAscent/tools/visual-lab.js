import * as pc from 'playcanvas';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { createSpecimenModel, destroySpecimenModel } from '../src/fishing/specimen-model.js';
import { createCharacterModel } from '../src/player/character-model.js';
import { COSMETIC_CATALOG as COSMETICS, cosmeticVisualRedesignPending } from '../src/progression/cosmetics.js';
import { solidPartsOverlap } from '../src/fishing/solid-attachments.js';
const $ = id => document.getElementById(id);
const app = new pc.Application($('canvas'), { graphicsDeviceOptions: { antialias: true, preserveDrawingBuffer: true } });
app.graphicsDevice.maxPixelRatio = 1;
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.resizeCanvas(innerWidth,650);
app.scene.ambientLight = new pc.Color(.55,.62,.64);
const camera = new pc.Entity('Review camera', app);
camera.addComponent('camera',{projection:pc.PROJECTION_ORTHOGRAPHIC,orthoHeight:4.35,nearClip:.1,farClip:60,clearColor:new pc.Color(.055,.12,.14)});
camera.setPosition(0,0,20);camera.lookAt(0,0,0);app.root.addChild(camera);
for(const [name,color,rotation,intensity] of [['Key',[1,.91,.74],[35,-35,0],1.5],['Fill',[.44,.72,.9],[5,135,0],.8]]){
 const light=new pc.Entity(name,app);light.addComponent('light',{type:'directional',color:new pc.Color(...color),intensity});light.setEulerAngles(...rotation);app.root.addChild(light);
}
let entries=[],page=0,models=[],characters=[];
const mode=()=> $('mode').value;
function filterOptions(){
 const values=mode()==='creatures'?[...new Set(FISH_SPECIES.map(s=>s.visual.archetype))].sort():['headwear','eyewear','faceAccessory','backAccessory'];
 $('filter').replaceChildren(...['all',...values].map(value=>{const o=document.createElement('option');o.value=value;o.textContent=value==='all'?'All models':value;return o}));page=0;render();
}
function bounds(root){
 root.getWorldTransform();let aabb=null;
 for(const component of root.findComponents('render'))for(const instance of component.meshInstances??[]){if(!aabb)aabb=instance.aabb.clone();else aabb.add(instance.aabb)}
 return aabb;
}
function render(){
 models.forEach(destroySpecimenModel);characters.forEach(c=>c.destroy());models=[];characters=[];$('labels').replaceChildren();
 const filter=$('filter').value;
 entries=(mode()==='creatures'?FISH_SPECIES:COSMETICS.filter(c=>!cosmeticVisualRedesignPending(c.id))).filter(s=>filter==='all'||(mode()==='creatures'?s.visual.archetype:s.slot)===filter);
 page=Math.min(Math.max(0,page),Math.max(0,Math.ceil(entries.length/12)-1));
 const angle=$('angle').value;
 for(const [index,entry] of entries.slice(page*12,page*12+12).entries()){
  let root,report='';
  if(mode()==='creatures'){
   const specimen=createSpecimenModel({speciesId:entry.id,length:24,shiny:$('shiny').checked},{app,name:entry.name});models.push(specimen);root=specimen.root;report=`${entry.visual.archetype} · ${specimen.attachmentValidation.correctionCount} attachment repairs`;
  }else{
   root=new pc.Entity(entry.label,app);const c=createCharacterModel(root);characters.push({destroy(){Object.values(c.materials).forEach(m=>m.destroy());root.destroy()}});c.setAppearance({avatarType:$('shiny').checked?'blob':'human',[entry.slot]:entry.id});report=`${entry.slot} · ${entry.visual}`;
  }
  app.root.addChild(root);root.setLocalScale(1,1,1);
  root.setLocalEulerAngles(angle==='top'?70:0,(mode()==='cosmetics'&&angle!=='back'?155:0)+(angle==='quarter'?-32:0),0);
  const box=bounds(root);const size=Math.max(box?.halfExtents.x*2||1,box?.halfExtents.y*2||1);
  const factor=(mode()==='creatures'?2.4:1.95)/size;
  const center=box?.center??pc.Vec3.ZERO;
  root.setLocalScale(factor,factor,factor);
  const x=(index%4-1.5)*4.05,y=(1-Math.floor(index/4))*2.85+.22;
  root.setLocalPosition(x-center.x*factor,y-center.y*factor,0-center.z*factor);
  const label=document.createElement('div');label.textContent=entry.name??entry.label;const small=document.createElement('small');small.textContent=report;label.append(small);$('labels').append(label);
 }
 $('page').textContent=`${page+1} / ${Math.max(1,Math.ceil(entries.length/12))}`;
 $('previous').disabled=page===0;$('next').disabled=(page+1)*12>=entries.length;
 $('status').textContent=`${entries.length} models · Actual runtime factories · No save data is read or changed`;
}
$('mode').onchange=filterOptions;$('filter').onchange=()=>{page=0;render()};$('angle').onchange=render;$('shiny').onchange=render;
$('next').onclick=()=>{page++;render()};$('previous').onclick=()=>{page--;render()};
addEventListener('resize',()=>app.resizeCanvas(innerWidth,650));filterOptions();app.start();
$('audit').onclick=async()=>{
 $('audit').disabled=true;const problems=[];let totalParts=0;
 for(let i=0;i<FISH_SPECIES.length;i++){
  const species=FISH_SPECIES[i],model=createSpecimenModel({speciesId:species.id,length:24},{app,name:species.name});app.root.addChild(model.root);
  const parts=model.root.children.map(c=>c._creatureAttachmentPart).filter(Boolean);totalParts+=parts.length;
  for(const child of model.root.children){
   const part=child._creatureAttachmentPart;if(!part||!child.render)continue;
   const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],transform=child.getLocalTransform();
   for(const instance of child.render.meshInstances){const positions=[];instance.mesh.getPositions(positions);for(let v=0;v<positions.length;v+=3){const point=transform.transformPoint(new pc.Vec3(...positions.slice(v,v+3)));[point.x,point.y,point.z].forEach((n,a)=>{lo[a]=Math.min(lo[a],n);hi[a]=Math.max(hi[a],n)})}}
   if(['x','y','z'].some((key,a)=>Math.abs((lo[a]+hi[a])/2-part.position[key])>1e-4))problems.push(`${species.id}: rendered ${part.name} does not match its audited position`);
  }

  {
   const connected=new Set([0]);let changed=true;
   while(changed){changed=false;for(let p=0;p<parts.length;p++)if(!connected.has(p)&&[...connected].some(c=>solidPartsOverlap(parts[p],parts[c]))){connected.add(p);changed=true}}
   if(connected.size!==parts.length)problems.push(`${species.id}: ${parts.length-connected.size} disconnected parts`);
  }
  for(const component of model.root.findComponents('render'))for(const instance of component.meshInstances??[]){
   const vertices=[];instance.mesh.getPositions(vertices);if(vertices.some(v=>!Number.isFinite(v)))problems.push(`${species.id}: invalid vertex`);
  }
  destroySpecimenModel(model);
  $('auditResult').textContent=`Checked ${i+1} / ${FISH_SPECIES.length} creatures…`;
  if(i%12===0)await new Promise(requestAnimationFrame);
 }
 $('auditResult').textContent=`AUDIT COMPLETE\n${FISH_SPECIES.length} creatures · ${totalParts} rendered parts · ${problems.length} problems\n${problems.join('\n')}`;
 $('audit').disabled=false;
};
