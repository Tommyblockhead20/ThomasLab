export const OLD_MAN_SERVICES=Object.freeze({
  noMusk:{label:'No Muskellunge',price:200,description:'Keep Muskellunge out of this room’s waters for 5 minutes.'},
  smallCommon:{label:'Pocket-sized problem',price:150,description:'Their next 4 qualifying catches: the same tiny Common. Invalid waters leave it queued.'},
  cursedFlute:{label:'Cursed Flute',price:250,description:'Next 4 eligible Cursed-Flute catches. Not available until a canonical song uses it.'}
});
export const eventInProgress=e=>['preparing','countdown','active'].includes(e?.phase);

// Operates on the real, nonzero ecology table, never adds an ineligible species.
// Both the live guide and the actual roll call this same function.
export function applyOldManTable(table,effect={}) {
  if(!table.length)return table;
  if(!effect.noMusk&&!(effect.curse?.remaining>0))return table;
  let pool=effect.noMusk?table.filter(e=>e.fish.id!=='muskellunge'):table;
  if(!pool.length)return [];
  const curse=effect.curse;
  if(curse?.remaining>0) {
    let candidates=pool.filter(e=>e.probability>0&&(curse.kind==='smallCommon'?e.fish.rarity==='Common':/cursed[_ -]?flute/i.test(e.fish.rhythm?.instrument??'')));
    if(curse.speciesId)candidates=candidates.filter(e=>(e.fish.canonicalId??e.fish.id)===curse.speciesId);
    if(candidates.length)pool=curse.kind==='smallCommon'?[...candidates].sort((a,b)=>a.fish.maxLength-b.fish.maxLength||a.fish.id.localeCompare(b.fish.id)).slice(0,1):candidates;
  }
  const total=pool.reduce((n,e)=>n+e.probability,0);
  const rarityTotals={};for(const e of pool)rarityTotals[e.fish.rarity]=(rarityTotals[e.fish.rarity]??0)+e.probability/total;
  return pool.map(e=>({...e,probability:e.probability/total,selectionWeight:e.probability/total,rarityProbability:rarityTotals[e.fish.rarity],withinRarityProbability:e.probability/total/rarityTotals[e.fish.rarity]}));
}
