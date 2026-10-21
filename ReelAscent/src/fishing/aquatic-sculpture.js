import * as pc from 'playcanvas';
import { modelMesh } from './fish-sculpture.js';
export const AQUATIC_SCULPTURES = new Set(['frog','crab','lobster','crayfish','octopus','lusca','jellyfish','turtle','salamander','ray','skate','serpent','dragon','plesiosaur','waterhorse','wisp']);

// Anatomical attachment points, rather than independent floating decorative pieces.
export function buildAquaticSculpture(root,{archetype,speciesId,name,art,primitive,base,accent,dark,materials}) {
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
  }else if(archetype==='octopus'){
    ball('mantle',[.16,.2,0],[.62,.65,.58]);ball('arm crown',[.04,-.05,0],[.5,.28,.49]);
    for(let i=0;i<8;i++){
      if(root._app?.graphicsDevice)modelMesh(root,`${name} tapered curling arm ${i}`,createArmTubeData(i),i%2?accent:base);
      else {const a=i/8*Math.PI*2;segment(`arm ${i}`,[Math.cos(a)*.13,-.1,Math.sin(a)*.16],[Math.cos(a)*.72,-.27,Math.sin(a)*.68],.065);}
    }
    for(const side of [-1,1])eye(`eye ${side}`,[.38,.16,side*.21],.085);
  }else if(archetype==='lusca'){
    // Restore the original corrupted-octopus idea: a forward, fish-like skull and
    // sweeping rear arm fan, not the ordinary octopus's upright mantle and radial arms.
    ball('corrupted dorsal mantle',[-.08,.13,0],[.82,.67,.67],base);
    ball('forward monstrous head',[.32,-.02,0],[.61,.43,.59],accent);
    ball('beaked lower jaw',[.59,-.17,0],[.34,.14,.38],base);
    ball('arm skirt',[-.3,-.16,0],[.53,.2,.56],accent);
    for(const side of [-1,1]){
      eye(`sunken eye ${side}`,[.49,.07,side*.245],.095);
      add(`horn ${side}`,'cone',[.16,.43,side*.22],[.15,.49,.14],dark,{z:side*15});
      for(let band=0;band<4;band++){
        const z=side*(.09+band*.115),y=-.24-band*.025;
        segment(`corrupted arm ${side}:${band} root`,[-.3,y,z],[-.62-band*.055,y-.04,z+side*.04],.072-(band*.006),accent);
        segment(`corrupted arm ${side}:${band} sweep`,[-.62-band*.055,y-.04,z+side*.04],[-1.05-band*.075,y-.1+band*.075,z+side*(.09+band*.03)],.045-(band*.003),band%2?base:accent);
      }
    }
    for(let row=0;row<4;row++)add(`mantle thorn ${row}`,'cone',[-.29+row*.16,.45-row*.015,0],[.11,.26,.11],dark,{z:-18});
  }else if(archetype==='serpent' || archetype==='dragon' || archetype==='plesiosaur'){
    const crocodilian=archetype==='serpent' && /alligator|crocodile/i.test(speciesId || name);
    const leafy=speciesId==='leafy_seadragon';
    const longNeck=archetype==='plesiosaur';
    const hydra=speciesId==='lernaean_hydra';
    const bodyCount=crocodilian?6:longNeck?5:8;
    for(let i=0;i<bodyCount;i++){
      const t=i/(bodyCount-1),x=.34-i*(crocodilian?.24:.265);
      const y=crocodilian?-.045:Math.sin(t*Math.PI*2.1)*.13;
      const z=crocodilian?0:Math.sin(t*Math.PI*1.65)*.12;
      ball(`sinuous armored segment ${i+1}`,[x,y,z],[.4-i*.021,crocodilian?.32:.34-i*.013,crocodilian?.34:.31-i*.01],i%3===0?accent:base);
      if(i>0 && i<bodyCount-1 && !leafy)add(`dorsal crest ${i}`,'cone',[x,y+.18,z],[.12,.24-i*.008,.1],accent,{z:12});
    }
    if(longNeck){
      segment('rising neck root',[.38,.02,0],[.61,.4,0],.11,base);
      segment('arched neck',[.61,.4,0],[.87,.6,0],.085,base);
      ball('watchful small head',[.96,.6,0],[.3,.19,.22],accent);
      for(const side of [-1,1]){
        eye(`eye ${side}`,[1.02,.65,side*.1],.043);
        for(const x of [-.56,.2])ball(`paddle ${x}:${side}`,[x,-.14,side*.38],[.36,.07,.42],accent);
      }
    }else if(crocodilian){
      ball('broad crocodilian skull',[.55,.01,0],[.49,.26,.4],base);
      ball('long armored snout',[.83,-.055,0],[.49,.16,.3],accent);
      for(const side of [-1,1]){
        eye(`high eye ${side}`,[.58,.15,side*.16],.057);
        for(const x of [-.62,.13]){segment(`splayed leg ${x}:${side}`,[x,-.12,side*.14],[x+.05,-.33,side*.39],.065,base);ball(`webbed foot ${x}:${side}`,[x+.09,-.34,side*.42],[.21,.075,.16],accent);}
      }
    }else if(leafy){
      ball('seahorse muzzle',[.61,.13,0],[.34,.17,.17],accent);
      for(let i=0;i<7;i++)for(const side of [-1,1])add(`leafy camouflage ${i}:${side}`,'cone',[.35-i*.23,.13+Math.sin(i)*.08,side*.18],[.1,.3+(i%3)*.08,.07],accent,{x:side*55,z:(i%2?1:-1)*25});
      for(const side of [-1,1])eye(`eye ${side}`,[.57,.2,side*.09],.036);
    }else{
      const headCount=hydra?3:1;
      for(let h=0;h<headCount;h++){
        const offset=h-(headCount-1)/2,headZ=offset*.33,headY=.19+(h===1?.2:0);
        segment(`neck ${h}`,[.34,.06,offset*.09],[.59,headY,headZ],.09,base);
        ball(`dragon head ${h}`,[.72,headY,headZ],[.37,.27,.28],base);
        ball(`toothed snout ${h}`,[.9,headY-.08,headZ],[.28,.14,.22],accent);
        for(const side of [-1,1]){
          eye(`dragon eye ${h}:${side}`,[.77,headY+.065,headZ+side*.125],.047);
          add(`swept horn ${h}:${side}`,'cone',[.56,headY+.19,headZ+side*.13],[.08,.28,.08],accent,{z:-24,x:side*16});
        }
      }
      for(const side of [-1,1]){
        ball(`webbed shoulder fin ${side}`,[.09,.02,side*.31],[.47,.075,.35],accent,{y:side*25});
        ball(`webbed hind fin ${side}`,[-.72,-.06,side*.22],[.39,.07,.3],accent,{y:side*30});
      }
    }
    tail=segment('tapering tail',[-1.28,-.03,0],[-1.8,-.09,.09],.07,accent);
  }else if(archetype==='waterhorse'){
    const spirit=speciesId==='umibozu';
    ball(spirit?'shadowy sea spirit torso':'arched waterhorse torso',[-.13,.03,0],[.93,.54,.47],base);
    segment('rising neck',[.24,.08,0],[.53,.56,0],.18,base);
    ball('horse head',[.65,.58,0],[.38,.29,.28],accent);
    ball('long muzzle',[.84,.46,0],[.28,.16,.23],base);
    for(const side of [-1,1]){
      eye(`eye ${side}`,[.7,.64,side*.135],.05);
      add(`pointed ear ${side}`,'cone',[.57,.77,side*.11],[.08,.24,.08],base,{z:-12});
      for(const x of [-.46,.15]){
        segment(`fore or hind leg ${x}:${side}`,[x,-.16,side*.17],[x+.03,-.53,side*.21],.07,base);
        ball(`water hoof ${x}:${side}`,[x+.09,-.56,side*.21],[.19,.09,.14],accent);
      }
    }
    for(let i=0;i<5;i++)add(`wave mane ${i}`,'cone',[.43-i*.1,.63-i*.08,0],[.1,.24,.14],accent,{z:-26});
    tail=segment('streaming tail',[-.55,.03,0],[-1.07,.22,.08],.07,accent);
    if(spirit)for(let i=0;i<4;i++)ball(`spectral spray ${i}`,[-.68-i*.1,-.03+(i%2)*.13,(i%2?1:-1)*.22],[.12,.12,.12],accent);
  }else if(archetype==='wisp'){
    ball('luminous heart',[.1,.05,0],[.47,.44,.44],base);
    for(let i=0;i<7;i++){
      const a=i/7*Math.PI*2;
      segment(`radiant streamer ${i}`,[.05,.03,0],[-.18-Math.cos(a)*.3,.04+Math.sin(a)*.3,Math.cos(a*1.3)*.26],.045,accent);
    }
    ball('trailing ember',[-.55,-.05,0],[.22,.2,.19],accent);
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
