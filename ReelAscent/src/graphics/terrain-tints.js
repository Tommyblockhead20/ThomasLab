export const CORE_TINTS=Object.freeze({standable:[.61,.72,.48],walkable:[.44,.57,.34],slide:[.56,.58,.55]});
export function terrainSupportTint(up,standY,slideY) {
  const mix=(a,b,t)=>a.map((v,i)=>Math.round((v+(b[i]-v)*t)*255));
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  // Shared vertex normals make adjacent faces meet at the same tint. The narrow
  // transition is visual only and never alters the triangle support thresholds.
  if(up>=(standY+slideY)/2)return [...mix(CORE_TINTS.walkable,CORE_TINTS.standable,smooth(standY-.055,standY+.055,up)),255];
  return [...mix(CORE_TINTS.slide,CORE_TINTS.walkable,smooth(slideY-.055,slideY+.055,up)),255];
}
