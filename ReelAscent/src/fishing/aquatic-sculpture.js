import * as pc from 'playcanvas';
import { modelMesh } from './fish-sculpture.js';
export const AQUATIC_SCULPTURES = new Set(['frog','crab','lobster','crayfish','octopus','lusca','jellyfish','turtle','salamander','ray','skate']);

// Anatomical attachment points, rather than independent floating decorative pieces.
export function buildAquaticSculpture(root,{archetype,name,art,primitive,base,accent,dark,materials}) {
  const add=(label,type,p,s,m=base,r={})=>primitive(root,`${name} ${label}`,type,{x:p[0],y:p[1],z:p[2]},{x:s[0],y:s[1],z:s[2]},m,r);
  const ball=(label,p,s,m=base)=>add(label,'sphere',p,s,m);
  const segment=(label,a,b,r,m=base)=>{
    const direction=new pc.Vec3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const angles=new pc.Quat().setFromDirections(pc.Vec3.UP,direction.clone().normalize()).getEulerAngles();
    return add(label,'cylinder',a.map((v,i)=>(v+b[i])/2),[r*2,direction.length()+r*.6,r*2],m,{x:angles.x,y:angles.y,z:angles.z});
  };
  const eye=(label,p,size=.055)=>{
    ball(label,p,[size,size,size],dark);
    ball(`${label} glint`,[p[0]+.009,p[1]+.012,p[2]+(p[2]<0?-.015:.015)],[.013,.013,.009],materials[3]);
  };
  let tail=null;
  if(archetype==='frog'){
    ball('rounded torso',[-.12,0,0],[.72,.43,.55]);ball('broad head',[.29,.09,0],[.48,.32,.54]);
    for(const side of [-1,1]){
      ball(`eye ridge ${side}`,[.35,.25,side*.17],[.14,.13,.14],accent);eye(`eye ${side}`,[.41,.27,side*.185],.07);
      ball(`hind haunch ${side}`,[-.34,-.08,side*.26],[.34,.27,.28],accent);
      segment(`folded hind shin ${side}`,[-.4,-.11,side*.3],[-.53,-.24,side*.43],.055,accent);
      segment(`hind foot ${side}`,[-.53,-.24,side*.43],[-.1,-.28,side*.48],.043,accent);
      segment(`foreleg ${side}`,[.2,.01,side*.21],[.32,-.25,side*.34],.045);
      ball(`forefoot ${side}`,[.38,-.26,side*.35],[.2,.055,.12],accent);
    }
  }else if(['crab','lobster','crayfish'].includes(archetype)){
    const crab=archetype==='crab';ball('carapace',[crab?0:.23,0,0],[crab?.9:.62,.32,crab?.64:.39]);
    if(!crab)for(let i=0;i<5;i++)tail=ball(`overlapping abdomen ${i}`,[-.08-i*.18,-.015,0],[.25,.23,.32-i*.035],i%2?accent:base);
    for(const side of [-1,1]){
      for(let i=0;i<4;i++){
        const x=(crab?-.3:.28)+i*(crab?.18:-.18),z=side*(crab?.26:.14);
        const knee=[x-.1,-.09,side*(crab?.58:.4)],foot=[x-.24,-.27,side*(crab?.76:.53)];
        segment(`leg ${side} ${i} upper`,[x,0,z],knee,.026,accent);segment(`leg ${side} ${i} lower`,knee,foot,.019,accent);
      }
      const claw=[.7,.02,side*(crab?.5:.35)];segment(`claw arm ${side}`,[.23,0,side*.2],[.46,-.04,claw[2]],.065,accent);segment(`claw wrist ${side}`,[.46,-.04,claw[2]],claw,.06,accent);
      ball(`claw palm ${side}`,claw,[.3,.17,.2],accent);
      ball(`pincer upper ${side}`,[.88,.07,claw[2]-.018],[.22,.075,.09],accent);
      ball(`pincer lower ${side}`,[.88,-.04,claw[2]+.025],[.22,.06,.09],accent);
      segment(`eye stalk ${side}`,[.28,.09,side*.15],[.34,.23,side*.19],.023);eye(`eye ${side}`,[.35,.24,side*.19]);
      if(!crab)segment(`antenna ${side}`,[.38,.11,side*.11],[.9,.2,side*.24],.012,accent);
    }
  }else if(['octopus','lusca'].includes(archetype)){
    ball('mantle',[.16,.2,0],[.62,.65,.58]);ball('arm crown',[.04,-.05,0],[.5,.28,.49]);
    for(let i=0;i<8;i++){
      if(root._app?.graphicsDevice)modelMesh(root,`${name} tapered curling arm ${i}`,createArmTubeData(i),i%2?accent:base);
      else {const a=i/8*Math.PI*2;segment(`arm ${i}`,[Math.cos(a)*.13,-.1,Math.sin(a)*.16],[Math.cos(a)*.72,-.27,Math.sin(a)*.68],.065);}
    }
    for(const side of [-1,1])eye(`eye ${side}`,[.38,.16,side*.21],.085);
  }else if(archetype==='jellyfish'){
    ball('bell',[0,.2,0],[.72,.41,.72]);ball('bell skirt',[0,.07,0],[.76,.14,.76],accent);
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2,start=[Math.cos(a)*.22,.07,Math.sin(a)*.22],middle=[start[0]+Math.sin(i)*.06,-.28,start[2]],end=[middle[0]-.06,-.56-(i%3)*.07,middle[2]];
      segment(`tentacle ${i} upper`,start,middle,.016,accent);tail=segment(`tentacle ${i} lower`,middle,end,.012,accent);
    }
  }else if(archetype==='turtle'){
    ball('shell',[0,.07,0],[.94,.4,.73]);ball('plastron',[0,-.06,0],[.88,.2,.68],accent);
    ball('neck',[.43,.01,0],[.28,.18,.2],accent);ball('head',[.6,.025,0],[.28,.24,.25],accent);
    for(const side of [-1,1]){
      eye(`eye ${side}`,[.67,.08,side*.092],.047);
      for(const x of [-.28,.27]){
        const start=[x,-.04,side*.25],end=[x+.12,-.14,side*.51];segment(`flipper ${x} ${side}`,start,end,.075,accent);
        ball(`flipper paddle ${x} ${side}`,end,[.24,.065,.18],accent);
      }
    }
    tail=segment('tail',[-.38,-.01,0],[-.63,-.05,0],.035,accent);
  }else if(archetype==='salamander'){
    ball('torso',[-.08,0,0],[.82,.23,.29]);ball('neck',[.32,.01,0],[.29,.2,.24]);ball('head',[.49,.035,0],[.34,.25,.32],accent);
    tail=segment('tapered tail',[-.39,0,0],[-.98,-.035,0],.07);
    for(const side of [-1,1]){
      eye(`eye ${side}`,[.56,.1,side*.13],.042);
      for(const x of [-.3,.25]){segment(`leg ${x} ${side}`,[x,-.03,side*.1],[x-.08,-.14,side*.3],.033);ball(`foot ${x} ${side}`,[x-.02,-.15,side*.31],[.16,.04,.11],accent);}
    }
  }else if(['ray','skate'].includes(archetype)){
    if(root._app?.graphicsDevice){
      const skin=base.clone();skin.diffuse.set(1,1,1);skin.diffuseVertexColor=true;skin.update();materials.push(skin);
      modelMesh(root,`${name} swept wing disc`,createRayDiscData(/manta/i.test(name),art),skin);
    }else ball('central disc',[.08,0,0],[1.05,.15,1.5]);
    for(const side of [-1,1])eye(`dorsal eye ${side}`,[.4,.051,side*.14],.05);
    segment('tail base',[-.49,0,0],[-.88,-.015,0],.026,accent);
    tail=segment('tail tip',[-.86,-.015,0],[-1.4,-.035,.05],.013,accent);

  }
  root._anatomicalEyes=true;return {tail:null};
}

// Closed, smooth surfaces keep broad wings and narrowing arms readable at any angle.
export function createRayDiscData(manta,art){
  const stations=manta?[[0,.015],[.1,.24],[.28,.65],[.43,1.08],[.6,.83],[.77,.38],[.92,.16],[1,.012]]:[[0,.015],[.1,.22],[.28,.57],[.43,.86],[.6,.64],[.77,.38],[.92,.16],[1,.012]];
  const positions=[],indices=[],uvs=[],colors=[],rings=32,sides=24;
  for(let r=0;r<=rings;r++){
    const t=r/rings,x=-.55+1.17*t;let width=.012;
    for(let i=1;i<stations.length;i++)if(t<=stations[i][0]){const a=stations[i-1],b=stations[i];width=a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);break;}
    const h=.009+Math.sin(t*Math.PI)*.087;
    for(let j=0;j<=sides;j++){
      const angle=j/sides*Math.PI*2,c=Math.cos(angle),z=Math.sin(angle)*width;
      positions.push(x,h*c,z);uvs.push(t,j/sides);
      const color=c>0?art.flank.map((v,i)=>v*.7+art.back[i]*.3):art.belly;
      colors.push(...color.map(v=>Math.round(v**2.2*255)),255);
    }
  }
  closeSurface(positions,indices,uvs,colors,rings,sides,art.flank);
  return {positions,indices,uvs,colors};
}
export function createArmTubeData(index){
  const positions=[],indices=[],uvs=[],rings=18,sides=10,a=index/8*Math.PI*2;
  for(let r=0;r<=rings;r++){
    const t=r/rings,angle=a+Math.sin(t*Math.PI*.8)*.22+(index%2?1:-1)*t*t*.3;
    const radial=.13+.7*t-.12*t*t*t,center=[.04+Math.cos(angle)*radial,-.1-.27*Math.sin(t*Math.PI*.7)+.12*t*t*t,Math.sin(angle)*radial];
    const radius=.076*Math.pow(1-t,.9)+.006;
    for(let j=0;j<=sides;j++){const b=j/sides*Math.PI*2;positions.push(center[0]-Math.sin(angle)*Math.sin(b)*radius,center[1]+Math.cos(b)*radius,center[2]+Math.cos(angle)*Math.sin(b)*radius);uvs.push(t,j/sides);}
  }
  closeSurface(positions,indices,uvs,null,rings,sides);
  return {positions,indices,uvs};
}
function closeSurface(positions,indices,uvs,colors,rings,sides,color=[1,1,1]){
  for(let r=0;r<rings;r++)for(let s=0;s<sides;s++){const a=r*(sides+1)+s,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);}
  for(const [ring,flip] of [[0,true],[rings,false]]){
    const center=positions.length/3,offset=ring*(sides+1)*3,point=[0,0,0];
    for(let s=0;s<sides;s++)for(let i=0;i<3;i++)point[i]+=positions[offset+s*3+i]/sides;
    positions.push(...point);uvs.push(ring/rings,.5);if(colors)colors.push(...color.map(v=>Math.round(v**2.2*255)),255);
    for(let s=0;s<sides;s++){const a=ring*(sides+1)+s;indices.push(center,flip?a+1:a,flip?a:a+1);}
  }
}
