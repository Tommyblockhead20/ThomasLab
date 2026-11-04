import { resolveCreaturePresentation } from '../fishing/creature-presentation.js';
import { sweptTube, sculptedPanel } from '../graphics/sculpted-geometry.js';
import { modelMesh } from '../fishing/fish-sculpture.js';
import * as pc from 'playcanvas';

export function speciesRewardDesign(speciesId) {
  const {species,archetype}=resolveCreaturePresentation({speciesId},{context:'cosmetic reward'});
  let hash=2166136261;for(const c of speciesId) hash=Math.imul(hash^c.charCodeAt(0),16777619);
  const seed=(hash>>>0)/4294967295;
  const family=/crocodile|alligator|olm|salamander|newt/.test(speciesId)?'scaled'
    : ['crab','lobster','crayfish','shrimp'].includes(archetype)?'crustacean'
    : ['mammal','cetacean','bird'].includes(archetype)?'animal'
      : ['dragon','serpent','plesiosaur','waterhorse','wisp'].includes(archetype)?'mythic'
    : ['octopus','squid','lusca','jellyfish','softbody'].includes(archetype)?'flowing'
      : ['crab','lobster','crayfish','horseshoe','bivalve','snail','urchin','starfish'].includes(archetype)?'shell'
        : ['turtle','alligator','crocodile','amphibian','frog','newt','axolotl'].includes(archetype)?'scaled':'fin';
  return {speciesId,speciesName:species.name,archetype,family,seed,points:5+(hash>>>0)%4,
    height:.22+seed*.13,sweep:.12+seed*.14};
}
// Each reward follows its creature's anatomy: fitted crest, open lens frame, carved
// pendant, or shaped mantle. Geometry is shared across wardrobe/local/remote avatars.
export function buildSpeciesReward(root,cosmetic,materials,{blob,headY,add}) {
  if(!cosmetic.visual.startsWith('species-') || !root._app?.graphicsDevice) return false;
  const d=speciesRewardDesign(cosmetic.source.speciesId),scale=blob?1.16:1;
  const trim=new pc.StandardMaterial();trim.diffuse=new pc.Color(...(/frost|ice|glass/.test(d.speciesId)?[.47,.78,.87]:d.family==='flowing'?[.46,.3,.53]:d.family==='scaled'?[.3,.53,.41]:d.family==='crustacean'?[.67,.39,.28]:[.72,.78,.72]));trim.gloss=.42;trim.update();
  root.once('destroy',()=>trim.destroy());
  const mesh=(name,data,material=materials.accessory)=>{data.positions=data.positions.map((v,i)=>i%3===1?v:v*scale);return modelMesh(root,`${d.speciesName} ${name}`,data,material);};
  const tube=(name,points,material=materials.accessory,sides=9)=>mesh(name,sweptTube(points,sides),material);
  const panel=(name,points,material=materials.accessory)=>mesh(name,sculptedPanel(points,.022),material);
  const ring=(name,rx,rz,y,z=0,r=.018,material=materials.accessoryMetal)=>tube(name,Array.from({length:41},(_,i)=>{const a=i/40*Math.PI*2;return [Math.cos(a)*rx,y,z+Math.sin(a)*rz,r];}),material);
  const emblem=(x,y,z,s=1)=>{
    const front=cosmetic.slot==='backAccessory'?1:-1;
    if(d.family==='crustacean') {
      add('segmented crustacean carapace','sphere',{x,y,z},{x:.13*s,y:.24*s,z:.07*s},trim);
      for(const side of [-1,1]) {
        tube('crustacean raised claw',[[x+side*.05*s,y+.02*s,z,.019*s],[x+side*.14*s,y+.12*s,z,.023*s],[x+side*.17*s,y+.17*s,z,.01*s]],materials.accessoryMetal,7);
        for(const branch of [-1,1])tube('crustacean pincer',[[x+side*.14*s,y+.11*s,z,.017*s],[x+(side*.17+branch*.03)*s,y+.2*s,z,.003]],materials.accessoryMetal,7);
        for(let leg=0;leg<3;leg++)tube('carved walking leg',[[x+side*.05*s,y-leg*.04*s,z,.008],[x+side*.12*s,y-.04*s-leg*.04*s,z,.003]],materials.silver,6);
      }
      for(let ridge=0;ridge<3;ridge++)tube('carapace rib',[[x-.045*s,y+(.04-ridge*.055)*s,z+front*.035*s,.007],[x+.045*s,y+(.04-ridge*.055)*s,z+front*.035*s,.007]],materials.silver,6);
    } else if(d.family==='flowing') {
      add('carved mantle','sphere',{x,y:y+.04*s,z},{x:.18*s,y:.2*s,z:.06*s},materials.accessoryMetal);
      for(let i=0;i<5;i++) tube('curling emblem arm',Array.from({length:12},(_,j)=>{const t=j/11;return[x+(i-2)*.035*s+t*(i-2)*.04*s,y+.02*s-t*.2*s+Math.sin(t*4)*.025*s,z,.018*s*(1-t)+.003];}),materials.accessoryMetal,7);
    } else if(d.family==='mythic') {
      tube('coiled dragon relief',Array.from({length:27},(_,i)=>{const t=i/26,a=t*Math.PI*2.4;return[x+Math.cos(a)*.12*s*(1-t*.55),y+Math.sin(a)*.13*s,z,.023*s*(1-t*.5)];}),materials.accessoryMetal);
      for(const side of [-1,1]) panel('emblem wing',[[x,y+.06*s,z],[x+side*.19*s,y+.16*s,z],[x+side*.13*s,y-.06*s,z]],materials.silver);
    } else if(d.family==='animal') {
      if(d.archetype==='cetacean') {
        panel('carved whale silhouette',[[x-.2*s,y,z],[x-.08*s,y+.09*s,z],[x+.14*s,y+.085*s,z],[x+.2*s,y+.02*s,z],[x+.1*s,y-.065*s,z],[x-.12*s,y-.045*s,z]],materials.accessoryMetal);
        for(const side of [-1,1])panel('whale fluke',[[x-.16*s,y,z],[x-.28*s,y+side*.11*s,z],[x-.24*s,y,z]],materials.silver);
      } else {
        add('carved animal mask','sphere',{x,y,z},{x:.23*s,y:.23*s,z:.055*s},materials.accessoryMetal);
        for(const side of [-1,1]){add('rounded mask ear','sphere',{x:x+side*.105*s,y:y+.095*s,z},{x:.08*s,y:.08*s,z:.045*s},trim);add('mask eye','sphere',{x:x+side*.05*s,y:y+.025*s,z:z+front*.032*s},{x:.025*s,y:.025*s,z:.016*s},materials.dark);}
        add('broad animal muzzle','sphere',{x,y:y-.04*s,z:z+front*.03*s},{x:.15*s,y:.09*s,z:.06*s},trim);
      }
    } else if(d.family==='shell') {
      const outline=Array.from({length:d.points*2},(_,i)=>{const a=i/(d.points*2)*Math.PI*2,r=i%2?.105:.16;return[x+Math.cos(a)*r*s,y+Math.sin(a)*r*s,z];});
      panel('sculpted shell rosette',outline,materials.accessoryMetal);
      for(let i=0;i<d.points;i++){const a=i/d.points*Math.PI*2;tube('shell engraved rib',[[x,y,z+.018,.008],[x+Math.cos(a)*.14*s,y+Math.sin(a)*.14*s,z+.018,.003]],materials.silver,6);}
    } else {
      panel('carved fish body',[[x-.15*s,y,z],[x-.04*s,y+.075*s,z],[x+.12*s,y+.04*s,z],[x+.16*s,y,z],[x+.08*s,y-.065*s,z],[x-.1*s,y-.05*s,z]],materials.accessoryMetal);
      panel('forked tail relief',[[x-.13*s,y,z],[x-.24*s,y+.11*s,z],[x-.2*s,y,z],[x-.24*s,y-.1*s,z]],materials.silver);
      panel('dorsal relief',[[x-.05*s,y+.04*s,z],[x+.015*s,y+.15*s,z],[x+.075*s,y+.045*s,z]],materials.accessory);
    }
  };
  if(cosmetic.slot==='headwear') {
    ring('fitted crest band',.25,.245,headY,0,.025);
    if(d.archetype==='turtle') {
      add('fitted turtle-shell dome','sphere',{x:0,y:headY+.085,z:.015},{x:.51,y:.23,z:.48},trim);
      for(const [cx,cz] of [[0,0],[-.14,-.07],[.14,-.07],[0,.15]])tube('crown hexagonal scute',Array.from({length:7},(_,i)=>{const a=i/6*Math.PI*2;return[cx+Math.cos(a)*.085,headY+.2-(cx*cx+cz*cz)*1.2,cz+Math.sin(a)*.085,.01];}),materials.accessoryMetal,6);
    } else if(d.family==='crustacean')for(const side of [-1,1]) {
      tube('lobster swept antenna',[[side*.15,headY,-.05,.022],[side*.28,headY+.25,-.12,.013],[side*.4,headY+.38,-.04,.002]],trim);
      panel('lobster shell crest',[[side*.13,headY,.03],[side*.28,headY+.17,.1],[side*.22,headY+.28,.08],[side*.1,headY+.12,.03]],trim);
    } else if(d.family==='mythic') for(const side of [-1,1]) {
      tube('swept crown antler',[[side*.19,headY,0,.045],[side*.32,headY+.15,.06,.035],[side*.28,headY+d.height+.12,.19,.003]],materials.accessory);
      tube('antler branch',[[side*.28,headY+.12,.06,.023],[side*.43,headY+d.height*.8,.03,.003]],trim);
    } else if(d.family==='flowing') {
      for(let i=0;i<6;i++){const a=i/6*Math.PI*2;tube('flowing crest tendril',Array.from({length:15},(_,j)=>{const t=j/14,r=.19+.13*t;return[Math.cos(a+t*d.sweep)*r,headY+.035+Math.sin(t*Math.PI)*d.height,Math.sin(a+t*d.sweep)*r,.029*(1-t)+.004];}));}
    } else for(let i=0;i<d.points;i++) {
      const a=(i/(d.points-1)-.5)*Math.PI*1.5,x=Math.sin(a)*.24,z=Math.cos(a)*.24;
      panel('scalloped crest vane',[[x*.8,headY,z*.8],[x*1.22,headY+d.height*(.65+.35*Math.cos(a)),z*1.22],[x*.55,headY+.055,z*.55]],i%2?materials.silver:materials.accessory);
    }
    emblem(0,headY+.035,-.255,.55);
  } else if(cosmetic.slot==='eyewear') {
    const y=blob?.85:.73,z=blob?-.48:-.28;
    for(const side of [-1,1]) {
      const cx=side*.13;
      tube('sculpted open lens frame',Array.from({length:33},(_,i)=>{const a=i/32*Math.PI*2,r=1+Math.cos(a*3+d.seed)*.07;return[cx+Math.cos(a)*.097*r,y+Math.sin(a)*.072*r,z,.012];}),materials.accessoryMetal,8);
      add('tinted fitted lens','sphere',{x:cx,y,z:z+.01},{x:.168,y:.12,z:.015},materials.glass);
      tube('temple support',[[side*.22,y+.025,z,.013],[side*.25,y+.025,.06,.013],[side*.23,y-.015,.13,.006]],materials.accessoryMetal);
      if(d.family==='flowing') for(let arm=0;arm<3;arm++)tube('curling octopus temple arm',Array.from({length:17},(_,j)=>{const t=j/16,a=t*Math.PI*1.6;return[side*(.2+.045*arm+Math.sin(a)*.055),y+.025-Math.sin(t*Math.PI)*(.09+arm*.025),z+.02+Math.cos(a)*.02,.018*(1-t)+.004];}),arm%2?trim:materials.accessory);
      else if(d.family==='mythic') {tube('dragon swept temple horn',[[side*.2,y+.035,z,.025],[side*.29,y+.19,z+.05,.02],[side*.27,y+.27,z+.16,.002]],trim);panel('dragon brow scale',[[side*.035,y+.08,z-.01],[side*.16,y+.13,z],[side*.25,y+.06,z],[side*.16,y+.06,z]],materials.accessoryMetal);}
      else if(d.archetype==='cetacean') {panel('orca temple dorsal fin',[[side*.2,y-.03,z],[side*.3,y+.19,z+.06],[side*.35,y+.03,z+.06]],materials.dark);add('orca white eye patch','sphere',{x:side*.24,y:y+.025,z:z-.005},{x:.09,y:.055,z:.018},trim);}
      else panel('temple fin crest',[[side*.21,y+.03,z],[side*(.32+d.seed*.035),y+.16,z+.03],[side*.27,y-.04,z+.02]],trim);
    }
    tube('arched bridge',[[-.04,y+.02,z,.011],[0,y+.045,z-.012,.011],[.04,y+.02,z,.011]],materials.silver,8);
  } else if(cosmetic.slot==='faceAccessory') {
    const y=blob?.44:.45,r=blob?.34:.245,z=blob?-.5:-.285;
    ring('fine pendant chain',r,r,y,0,.012,materials.silver);
    tube('pendant suspension',[[0,y,-r,.01],[0,y-.19,z,.009]],materials.silver);
    emblem(0,y-.28,z-.02,.78+d.seed*.12);
  } else {
    const y=blob?.04:-.03,z=blob?.55:.39;
    for(const side of [-1,1])tube('fitted mantle harness',[[side*.14,y+.3,z-.035,.035],[side*.18,y-.2,z,.025]],materials.pack);
    if(d.archetype==='horseshoe') {
      const points=Array.from({length:13},(_,i)=>{const a=i/12*Math.PI;return[Math.cos(a)*.37,y+.03+Math.sin(a)*.39,z+.05];});
      points.push([-.22,y-.23,z+.08],[.22,y-.23,z+.08]);panel('arched horseshoe carapace',points,trim);
      tube('horseshoe raised shield rim',points.map(p=>[...p,.022]),materials.accessoryMetal);
      for(let i=0;i<4;i++)tube('segmented horseshoe abdomen',[[-.22+i*.025,y-.08-i*.075,z+.1,.013],[.22-i*.025,y-.08-i*.075,z+.1,.013]],materials.accessoryMetal);
      tube('tapered horseshoe telson',[[0,y-.26,z+.09,.035],[0,y-.69,z+.13,.002]],materials.accessoryMetal);
    } else if(d.archetype==='mammal') {
      panel('rounded pelt mantle',[[-.2,y+.32,z],[.2,y+.32,z],[.34,y+.1,z+.05],[.3,y-.38,z+.09],[.16,y-.48,z+.11],[0,y-.44,z+.1],[-.16,y-.48,z+.11],[-.3,y-.38,z+.09],[-.34,y+.1,z+.05]],trim);
      for(const side of [-1,1])for(let i=0;i<4;i++)tube('layered fur trim',[[side*(.22+i*.025),y+.19-i*.13,z+.09,.025],[side*(.3+i*.01),y+.1-i*.13,z+.12,.003]],materials.accessory);
    } else if(d.family==='mythic'||d.family==='fin') for(const side of [-1,1]) {
      const tips=[[side*.12,y+.28,z],[side*(.65+d.seed*.1),y+.42,z+.08],[side*.87,y+.02,z+.15],[side*.53,y-.22,z+.13],[side*.25,y-.5,z+.1],[side*.12,y-.23,z]];
      panel('swept fin mantle',tips);for(const tip of tips.slice(1,5))tube('mantle membrane rib',[[side*.12,y+.23,z+.01,.022],[...tip,.005]],materials.silver,7);
    } else if(d.family==='flowing')for(let i=0;i<7;i++)tube('trailing mantle ribbon',Array.from({length:18},(_,j)=>{const t=j/17;return[(i-3)*.08+Math.sin(t*(3+d.seed)+i*.5)*.07,y+.27-t*(.72+d.seed*.14+(i%3)*.05),z+.045+Math.sin(t*Math.PI)*.08,.048*(1-t)+.005];}));
    else {
      const outline=[[-.24,y+.32,z],[-.34,y+.14,z+.06],[-.28,y-.36,z+.07],[0,y-.52,z+.08],[.28,y-.36,z+.07],[.34,y+.14,z+.06],[.24,y+.32,z]];
      panel('scalloped protective mantle',outline,materials.pack);
      for(let row=0;row<3;row++)for(let col=-1;col<=1;col++)panel('overlapping mantle scale',[[col*.16-.085,y+.23-row*.2,z+.09],[col*.16+.085,y+.23-row*.2,z+.09],[col*.16+.07,y+.1-row*.2,z+.12],[col*.16,y+.04-row*.2,z+.13],[col*.16-.07,y+.1-row*.2,z+.12]],(row+col)%2?materials.accessory:materials.silver);
    }
    emblem(0,y+.03,z+.17,.9);
  }
  root._speciesRewardDesign=d;return true;
}
