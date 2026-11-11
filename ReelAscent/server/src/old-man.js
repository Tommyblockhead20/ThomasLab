import crypto from 'node:crypto';
import { OLD_MAN_SERVICES,eventInProgress } from '../../src/multiplayer/old-man-rules.js';
import { resolveSpecies,FISH_SPECIES } from '../../src/fishing/fish-data.js';
import { WORLD_LOCATIONS } from '../../src/world/world-locations.js';

export class RoomOldMan {
  constructor(room,{clock=Date.now}={}){this.room=room;this.clock=clock;this.curses=new Map();this.receipts=[];this.noMuskUntil=0;this.seen=new Set();}
  state(){return {noMuskUntil:this.noMuskUntil,curses:[...this.curses].filter(([,c])=>c.expiresAt>this.clock()).map(([playerId,c])=>({playerId,...c})),receipts:this.receipts,fluteAvailable:FISH_SPECIES.some(f=>!f.futureReserved&&/cursed[_ -]?flute/i.test(f.rhythm?.instrument??''))};}
  action(session,p={}) {
    if(this.receipts.some(r=>r.id===p.id&&r.playerId===session.playerId)){this.room.broadcastState();return null;}
    const item=Object.hasOwn(OLD_MAN_SERVICES,p.service)?OLD_MAN_SERVICES[p.service]:null,spot=WORLD_LOCATIONS.find(l=>l.id==='jester-island'),s=session.lastSnapshot;
    if(!item||typeof p.id!=='string'||p.id.length>140||typeof p.saveId!=='string'||!p.saveId||p.saveId.length>140)return 'Invalid Old Man purchase.';
    if(s?.locationId!=='jester-island'||Math.hypot(s.position.x-spot.worldPosition.x,s.position.z-spot.worldPosition.z)>12)return 'Speak to the Old Man at his pavilion.';
    if(eventInProgress(this.room.competition.event))return 'Mischief is paused during events.';
    if(!Number.isFinite(p.budget)||p.budget<item.price)return `Need $${item.price}.`;
    if(p.service==='noMusk') {
      if(this.noMuskUntil>this.clock())return 'No Muskellunge is already active.';
      this.noMuskUntil=this.clock()+300_000;
    }else {
      if(p.service==='cursedFlute'&&!this.state().fluteAvailable)return 'No current canonical song uses Cursed Flute. Nothing charged.';
      const target=this.room.players.get(p.targetId);
      if(!target?.connected||target.playerId===session.playerId)return 'Choose another connected player.';
      if(this.curses.get(target.playerId)?.expiresAt>this.clock())return 'That player already has a fishing prank queued.';
      this.curses.set(target.playerId,{id:crypto.randomUUID(),kind:p.service,remaining:4,speciesId:null,expiresAt:this.clock()+20*60_000});
    }
    this.receipts.push({id:p.id,playerId:session.playerId,saveId:p.saveId,price:item.price,service:p.service});this.receipts=this.receipts.slice(-100);
    this.room.broadcastState();return null;
  }
  catch(session,p={}) {
    if(eventInProgress(this.room.competition.event)||p.legitimate!==true||p.active===false||!p.specimenId||this.seen.has(p.specimenId))return;
    const c=this.curses.get(session.playerId),species=resolveSpecies(p.speciesId);
    if(!c||c.expiresAt<=this.clock()||!species||species.futureReserved)return;
    if(c.kind==='smallCommon'&&(species.rarity!=='Common'||!['Tiny','Small'].includes(p.sizeCategory)))return;
    if(c.kind==='cursedFlute'&&!/cursed[_ -]?flute/i.test(species.rhythm?.instrument??''))return;
    if(c.speciesId&&c.speciesId!==species.canonicalId)return;
    if(c.kind==='smallCommon')c.speciesId=species.canonicalId;
    this.seen.add(p.specimenId);if(this.seen.size>500)this.seen.delete(this.seen.values().next().value);
    if(--c.remaining<=0)this.curses.delete(session.playerId);this.room.broadcastState();
  }
  remove(id){this.curses.delete(id);}
}
