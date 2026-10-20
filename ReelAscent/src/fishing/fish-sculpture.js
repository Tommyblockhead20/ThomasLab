import * as pc from 'playcanvas';

export const SCULPTED_FISH_ARCHETYPES = new Set(['panfish','slender','bass','carp','catfish','trout','sculpin','shark','dogfish','flatfish','eel']);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const profiles = {
  panfish: [1,.33,.15], slender:[1.23,.14,.105], bass:[1.1,.25,.17], carp:[1.06,.29,.19],
  catfish:[1.2,.22,.21], trout:[1.22,.205,.14], sculpin:[.99,.23,.23], shark:[1.35,.22,.19],
  dogfish:[1.35,.22,.19], flatfish:[1.12,.075,.39], eel:[1.6,.105,.11]
};

export function fishShape(archetype, visual = {}) {
  const p = profiles[archetype] ?? profiles.panfish;
  return { length:p[0], height:p[1]*clamp(visual.depth??1,.7,1.3), width:p[2]*clamp(visual.width??1,.7,1.3) };
}
function envelope(t, archetype) {
  // One closed surface from caudal peduncle through shoulders to the mouth.
  const stations = archetype === 'eel' ? [[0,.13],[.12,.5],[.35,.82],[.65,1],[.86,.87],[.96,.52],[1,.025]]
    : [[0,.13],[.12,.32],[.26,.7],[.43,.97],[.61,1],[.77,.87],[.9,.61],[.97,.35],[1,.025]];
  for(let i=1;i<stations.length;i++)if(t<=stations[i][0]){
    const [a,b]=[stations[i-1],stations[i]],f=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*f;
  }
  return .025;
}
export function fishCrossSection(x, archetype, shape) {
  const t=clamp((x/shape.length+.6)/1.35,0,1), e=envelope(t,archetype);
  return { y:shape.height*e,z:shape.width*e,centerY:archetype==='eel'?Math.sin(t*Math.PI*1.5)*.075:0 };
}

export function createFishBodyData(archetype, visual, art) {
  const shape=fishShape(archetype,visual),positions=[],colors=[],uvs=[],indices=[];
  const rings=28,sides=20;
  for(let r=0;r<=rings;r++){
    const t=r/rings,x=(-.6+1.35*t)*shape.length,e=envelope(t,archetype);
    for(let s=0;s<=sides;s++){
      const angle=s/sides*Math.PI*2,ny=Math.cos(angle),nz=Math.sin(angle);
      const bend=archetype==='eel'?Math.sin(t*Math.PI*1.5)*.075:0;
      positions.push(x,ny*shape.height*e+bend,nz*shape.width*e);
      const upper=clamp((ny+.12)/1.1,0,1),lower=clamp((-ny-.05)/.9,0,1);
      let color=mix(mix(art.flank,art.back,upper*.9),art.belly,lower*.9);
      const lateral=Math.abs(ny)<.33;
      if(art.pattern==='stripe'&&Math.abs(ny)<.14&&t>.12&&t<.83)color=mix(color,art.back,.7);
      if(art.pattern==='rainbow'&&lateral)color=mix(color,[.68,.36,.39],.6);
      if(['bars','white-bars'].includes(art.pattern)&&Math.sin(t*Math.PI*14)>.58&&t<.86)color=mix(color,art.pattern==='white-bars'?art.belly:art.back,.58);
      if(['spots','light-spots','rainbow'].includes(art.pattern)){
        const spot=Math.sin(t*183+s*47.13)*Math.sin(t*91+s*28.71);
        if(spot>.67&&ny>-.5&&t>.16&&t<.83)color=mix(color,art.pattern==='light-spots'?art.belly:art.back,.85);
      }
      const glint=1+.035*Math.cos(t*Math.PI*2+s*.8);
      colors.push(...color.map(v=>Math.round(clamp(v*glint,0,1)**2.2*255)),255);uvs.push(t,s/sides);
    }
  }
  for(let r=0;r<rings;r++)for(let s=0;s<sides;s++){
    const a=r*(sides+1)+s,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);
  }
  for(const [ring,flip] of [[0,true],[rings,false]]){
    const center=positions.length/3,t=ring/rings;positions.push((-.6+1.35*t)*shape.length,archetype==='eel'?Math.sin(t*Math.PI*1.5)*.075:0,0);colors.push(...art.flank.map(v=>Math.round(v**2.2*255)),255);uvs.push(t,.5);
    for(let s=0;s<sides;s++){const a=ring*(sides+1)+s;indices.push(center,flip?a+1:a,flip?a:a+1)}
  }
  return {positions,colors,uvs,indices,shape};
}

export function modelMesh(root,name,data,material,origin=[0,0,0]) {
  const geometry=new pc.Geometry();geometry.positions=data.positions.map((v,i)=>v-origin[i%3]);geometry.indices=data.indices;geometry.uvs=data.uvs;if(data.colors)geometry.colors=new Uint8Array(data.colors);geometry.calculateNormals();
  const mesh=pc.Mesh.fromGeometry(root._app.graphicsDevice,geometry);
  const entity=new pc.Entity(name,root._app);entity.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,material,entity)],castShadows:true,receiveShadows:true});root.addChild(entity);
  entity.setLocalPosition(...origin);
  const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.positions.length;i+=3)for(let axis=0;axis<3;axis++){minimum[axis]=Math.min(minimum[axis],data.positions[i+axis]);maximum[axis]=Math.max(maximum[axis],data.positions[i+axis])}
  entity._creatureAttachmentPart={name,type:'mesh',position:Object.fromEntries(['x','y','z'].map((key,i)=>[key,(minimum[i]+maximum[i])/2])),scale:Object.fromEntries(['x','y','z'].map((key,i)=>[key,maximum[i]-minimum[i]]))};
  entity._creatureAttachmentPart.vertices=data.positions.map((v,i)=>v-(minimum[i%3]+maximum[i%3])/2);
  return entity;
}

function blade(root,name,points,material,thickness=.014,origin=[0,0,0],thicknessAxis=2) {
  const positions=[],indices=[],uvs=[];
  for(const offset of [-thickness/2,thickness/2])for(const p of points){positions.push(...p.map((v,i)=>v+(i===thicknessAxis?offset:0)));uvs.push(p[0]*2,p[thicknessAxis===1?2:1]*2)}
  const n=points.length;
  for(let i=1;i<n-1;i++)indices.push(0,i+1,i,n,n+i,n+i+1);
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+i,j,n+j,n+i)}
  return modelMesh(root,name,{positions,indices,uvs},material,origin);
}

export function buildFishSculpture(root,{archetype,visual,art,name,primitive,base,accent,dark,materials}) {
  if(!root._app?.graphicsDevice)return null;
  const data=createFishBodyData(archetype,visual,art),shape=data.shape,L=shape.length,H=shape.height,W=shape.width;
  base.diffuse.set(1,1,1);base.diffuseVertexColor=true;base.update();
  accent.cull=pc.CULLFACE_NONE;accent.twoSidedLighting=true;accent.update();
  modelMesh(root,`${name} continuous body`,data,base);
  const shark=['shark','dogfish'].includes(archetype),eel=archetype==='eel';
  const yAt=x=>{const section=fishCrossSection(x,archetype,shape);return section.y+section.centerY;};
  let tail;
  if(eel){
    blade(root,`${name} continuous ribbon fin`,[[-.6*L,0,0],[-.6*L,.12,0],[.1*L,H+.08,0],[.28*L,H*.85,0],[-.35*L,yAt(-.35*L)*.7,0]],accent);
  }else if(archetype==='flatfish'){
    const rootX=-.58*L;
    tail=blade(root,`${name} horizontal caudal fin`,[[rootX,0,W*.13],[-1.0*L,0,W*.7],[-.88*L,0,0],[-1*L,0,-W*.7],[rootX,0,-W*.13]],accent,.012,[rootX,0,0],1);
    for(const side of [-1,1])blade(root,`${name} disc rim ${side}`,[[-.4*L,0,side*fishCrossSection(-.4*L,archetype,shape).z*.85],[0,0,side*W*1.23],[.46*L,0,side*fishCrossSection(.46*L,archetype,shape).z*.85]],accent,.009,[0,0,0],1);
  }else{
    const rootX=-.58*L,tipX=-1.02*L,notchX=-.85*L,spread=H*(shark?1.55:1.12);
    const tailPoints=/betta/i.test(name)?[[rootX,H*.13,0],...Array.from({length:13},(_,i)=>{const a=Math.PI/2-i/12*Math.PI;return [rootX-.1*L-Math.cos(a)*.39*L,Math.sin(a)*H*2.1,0]}),[rootX,-H*.13,0]]:[[rootX,H*.13,0],[tipX,spread,0],[notchX,0,0],[tipX,-spread*(shark?.64:1),0],[rootX,-H*.13,0]];
    tail=blade(root,`${name} forked caudal fin`,tailPoints,accent,.02,[rootX,0,0]);
    const dorsalBack=-.34*L,dorsalFront=.24*L;
    const tall=/betta|angelfish/i.test(name)?1.5:shark?1.5:.8;
    blade(root,`${name} attached dorsal fin`,[[dorsalBack,yAt(dorsalBack)*.83,0],[-.16*L,H+H*tall,0],[dorsalFront,yAt(dorsalFront)*.82,0]],accent);
    blade(root,`${name} attached anal fin`,[[-.38*L,-yAt(-.38*L)*.8,0],[-.37*L,-H*1.45,0],[.03*L,-yAt(.03*L)*.8,0]],accent);
  }
  if(archetype!=='flatfish')for(const side of [-1,1]){
    const x=.31*L,z=fishCrossSection(x,archetype,shape).z*side;
    blade(root,`${name} pectoral fin ${side}`,[[x,-H*.16,z*.82],[-.04*L,-H*.75,side*W*(shark?2.6:1.85)],[.12*L,-H*.58,z*.8]],accent,.012);
  }
  const eyeX=.52*L,section=fishCrossSection(eyeX,archetype,shape),eyeY=section.centerY+H*.29;
  const eyeZ=section.z*Math.sqrt(Math.max(.05,1-((eyeY-section.centerY)/section.y)**2));
  const eyeSize=archetype==='slender'?.042:.055;
  for(const side of [-1,1]){
    const flat=archetype==='flatfish',z=flat?side*section.z*.3:side*(eyeZ+.008),y=flat?section.y*Math.sqrt(.91)+.008:eyeY;
    primitive(root,`${name} seated eye ${side}`,'sphere',{x:eyeX,y,z},{x:eyeSize,y:flat?.026:eyeSize,z:flat?eyeSize:.026},dark);
    primitive(root,`${name} eye catchlight ${side}`,'sphere',{x:eyeX+.009,y:y+(flat?.015:.01),z:z+(flat?0:side*.011)},{x:.013,y:.013,z:.008},materials[3]);
  }
  // Fine gill creases sit in the skin instead of hovering as colored blocks.
  const gillX=.33*L,gillZ=fishCrossSection(gillX,archetype,shape).z;
  for(const side of [-1,1])primitive(root,`${name} gill crease ${side}`,'sphere',{x:gillX,y:.01,z:side*gillZ*.97},{x:.018,y:H*.8,z:.013},dark,{z:-12});
  if(['catfish','carp'].includes(archetype))for(const side of [-1,1]){
    const start=new pc.Vec3(.64*L,-H*.1,side*fishCrossSection(.64*L,archetype,shape).z*.65),end=new pc.Vec3(.84*L,-H*.45,side*(archetype==='carp'?.16:.27)),delta=end.clone().sub(start);
    const q=new pc.Quat().setFromDirections(pc.Vec3.UP,delta.clone().normalize()).getEulerAngles();
    primitive(root,`${name} whisker ${side}`,'cylinder',{x:(start.x+end.x)/2,y:(start.y+end.y)/2,z:(start.z+end.z)/2},{x:.012,y:delta.length(),z:.012},accent,{x:q.x,y:q.y,z:q.z});
  }
  root._continuousCreature={bodyRings:29,bodySides:20,archetype};
  return {tail,shape};
}
