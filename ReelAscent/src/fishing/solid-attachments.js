const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const neg=a=>a.map(v=>-v),triple=(a,b,c)=>cross(cross(a,b),c);
const center=p=>[p.position.x,p.position.y,p.position.z];
function support(p,d){
  const c=center(p),v=p.vertices;
  if(v?.length){let best=-Infinity,index=0;for(let i=0;i<v.length;i+=3){const n=v[i]*d[0]+v[i+1]*d[1]+v[i+2]*d[2];if(n>best){best=n;index=i}}return c.map((x,i)=>x+v[index+i])}
  return c.map((x,i)=>x+(d[i]>=0?1:-1)*p.scale[['x','y','z'][i]]*.5);
}

// GJK on the actual rendered convex primitive vertices. Rotated cones and curved
// heads cannot pass merely because their rectangular bounding boxes touch.
export function solidPartsOverlap(a,b){
  const point=d=>sub(support(a,d),support(b,neg(d)));
  let d=sub(center(b),center(a));if(dot(d,d)<1e-12)d=[1,0,0];
  const simplex=[point(d)];d=neg(simplex[0]);
  for(let step=0;step<36;step++){
    if(dot(d,d)<1e-16)return true;
    const p=point(d);if(dot(p,d)<-1e-10)return false;simplex.unshift(p);
    const A=simplex[0],AO=neg(A),B=simplex[1],AB=sub(B,A);
    if(simplex.length===2){if(dot(AB,AO)>0)d=triple(AB,AO,AB);else{simplex.splice(1);d=AO}continue}
    const C=simplex[2],AC=sub(C,A),ABC=cross(AB,AC);
    if(simplex.length===3){
      if(dot(cross(ABC,AC),AO)>0){if(dot(AC,AO)>0){simplex.splice(1,1);d=triple(AC,AO,AC)}else{simplex.splice(2,1);d=triple(AB,AO,AB)}}
      else if(dot(cross(AB,ABC),AO)>0){simplex.splice(2,1);d=triple(AB,AO,AB)}
      else if(dot(ABC,AO)>0)d=ABC;else{[simplex[1],simplex[2]]=[simplex[2],simplex[1]];d=neg(ABC)}
      continue;
    }
    const D=simplex[3],AD=sub(D,A);
    const faces=[[B,C,ABC],[C,D,cross(AC,AD)],[D,B,cross(AD,AB)]];
    const face=faces.find(f=>dot(f[2],AO)>1e-10);
    if(!face)return true;
    simplex.splice(1,3,face[0],face[1]);d=face[2];
  }
  return false;
}
function boundGap(a,b){return ['x','y','z'].reduce((n,key)=>n+Math.max(0,Math.abs(a.position[key]-b.position[key])-(a.scale[key]+b.scale[key])*.5)**2,0)}

export function repairSolidAttachments(input,epsilon=.008){
  const parts=input.map(p=>({...p,position:{...p.position},scale:{...p.scale}})),corrections=[];
  if(!parts.length)return {parts,corrections};
  const core=parts.reduce((best,p,i)=>p.scale.x*p.scale.y*p.scale.z>parts[best].scale.x*parts[best].scale.y*parts[best].scale.z?i:best,0);
  const connected=new Set([core]);
  while(connected.size<parts.length){
    const candidates=[];
    for(let child=0;child<parts.length;child++)if(!connected.has(child))for(const parent of connected)candidates.push({child,parent,gap:boundGap(parts[child],parts[parent])});
    candidates.sort((a,b)=>a.gap-b.gap);
    let choice=candidates.find(c=>c.gap<1e-8&&solidPartsOverlap(parts[c.child],parts[c.parent]));
    if(!choice){
      choice=candidates[0];const child=parts[choice.child],parent=parts[choice.parent],before={...child.position};
      const direction=sub(center(parent),center(child)),distance=Math.hypot(...direction);
      let low=0,high=1;
      for(let n=0;n<14;n++){
        const t=(low+high)/2;['x','y','z'].forEach((key,i)=>child.position[key]=before[key]+direction[i]*t);
        if(solidPartsOverlap(child,parent))high=t;else low=t;
      }
      const t=Math.min(1,high+epsilon/Math.max(distance,epsilon));
      ['x','y','z'].forEach((key,i)=>child.position[key]=before[key]+direction[i]*t);
      corrections.push({child:child.name,parent:parent.name,before,after:{...child.position},gap:distance*t});
    }
    connected.add(choice.child);
  }
  return {parts,corrections};
}
