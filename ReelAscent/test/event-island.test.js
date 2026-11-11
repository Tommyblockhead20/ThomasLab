import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomCompetition } from '../server/src/competition.js';
import { RoomOldMan } from '../server/src/old-man.js';
import { competitionPrizes,eventAllowedIslands,raceStartOffset } from '../src/multiplayer/competition-rules.js';
import { getWeightedSpeciesTable,rollFish,FISH_SPECIES } from '../src/fishing/fish-data.js';
import { applyOldManTable } from '../src/multiplayer/old-man-rules.js';
import { OldManMenu } from '../src/ui/old-man.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { TrailBadgeSystem } from '../src/progression/trail-badges.js';
import { partitionTerrainBySupport } from '../src/world/map-editor-runtime.js';
import { terrainSupportTint } from '../src/graphics/terrain-tints.js';
import { shorelineSegments } from '../src/graphics/shore-waves.js';
import { WORLD_LOCATIONS } from '../src/world/world-locations.js';
import { RemotePlayer } from '../src/multiplayer/remote-player.js';

function field(count,kind='derby',settings={}) {
  let now=100_000;
  const spot=WORLD_LOCATIONS.find(l=>l.id==='jester-island');
  const players=Array.from({length:count},(_,i)=>({playerId:`p${i}`,displayName:`Player ${i}`,connected:true,
    lastSnapshot:{position:{x:spot.worldPosition.x,y:2,z:spot.worldPosition.z},locationId:'jester-island',teleportRevision:1}}));
  const room={hostId:'p0',players:new Map(players.map(p=>[p.playerId,p])),broadcastState(){}};
  const c=new RoomCompetition(room,{clock:()=>now,schedule:false});room.competition=c;
  players.forEach(p=>c.action(p,{action:'profile',saveId:p.playerId,unlockedIslands:settings.profiles?.[p.playerId]??['main-mountain','jester-island']}));
  assert.equal(c.action(players[0],{action:'create',kind,mode:'count',saveId:'p0',...settings}),null);
  for(const p of players.slice(1))assert.equal(c.action(p,{action:'join',saveId:p.playerId}),null);
  const advance=ms=>{now+=ms;c.tick();};
  const start=()=>{assert.equal(c.action(players[0],{action:'start'}),null);for(const p of players){p.lastSnapshot={position:{x:464,y:2,z:-28},locationId:'main-mountain',teleportRevision:1};c.action(p,{action:'ready',saveId:p.playerId});}advance(5001);assert.equal(c.event.phase,'active');};
  return {c,room,players,start,advance,now:()=>now};
}
test('field-size podiums pay 1/2/3/4 places and tie pools cannot inflate the prize',()=>{
  for(const n of [2,3,4,5,6,7,8,9,10]) {
    const s=field(n);s.start();s.c.event.participants.forEach((p,i)=>p.count=n-i);s.advance(300_001);
    assert.deepEqual(s.c.event.awards.map(a=>a.amount),competitionPrizes(n));
    assert.equal(s.c.event.awards.at(-1).place,competitionPrizes(n).length);
  }
  const s=field(7);s.start();s.c.event.participants.forEach((p,i)=>p.count=i<2?10:7-i);s.advance(300_001);
  assert.deepEqual(s.c.event.awards.map(a=>a.amount),[175,175,50]);assert.deepEqual(s.c.event.awards.map(a=>a.place),[1,1,3]);
});
test('old-man hosting, shared unlock intersection, custom exclusions and race settings are enforced',()=>{
  const s=field(2,'derby',{islandRule:'shared',profiles:{p0:['main-mountain','cold-island'],p1:['main-mountain']}});
  s.start();assert.deepEqual(s.c.event.allowedIslands,['main-mountain']);
  s.players[0].lastSnapshot.locationId='cold-island';s.c.catch(s.players[0],{eventId:s.c.event.id,saveId:'p0',specimenId:'wrong-water',speciesId:'bluegill',length:10,value:100,legitimate:true});
  assert.equal(s.c.event.participants[0].count,0);
  assert.deepEqual(eventAllowedIslands({kind:'derby',islandRule:'custom',selectedIslands:['cold-island','fake']}),['cold-island']);
  const race=field(2,'race',{spacedStart:true,racersVisible:false,allowEquipment:true});
  assert.equal(race.c.state().racersVisible,false);assert.equal(race.c.state().spacedStart,true);assert.equal(race.c.state().allowEquipment,true);
  assert.equal(raceStartOffset(0,10),0);assert.ok(Math.abs(raceStartOffset(0,10,true)+5.4)<1e-8);
  race.players[0].lastSnapshot.locationId='main-mountain';assert.match(race.c.action(race.players[0],{action:'start'}),/Old Man/);
});
test('four-person races retain second place and finish times instead of stopping at the first summit',()=>{
  const s=field(4,'race');s.start();
  const finish=(index)=>{for(const y of [61,121,181,241,296,305]){s.advance(2000);s.c.snapshot(s.players[index],{position:{x:260,y,z:0},locationId:'main-mountain',teleportRevision:1});}};
  finish(0);assert.equal(s.c.event.phase,'active');finish(1);assert.equal(s.c.event.phase,'finished');
  assert.deepEqual(s.c.event.awards.map(a=>[a.playerId,a.amount,a.place]),[['p0',150,1],['p1',50,2]]);
});
test('first-place achievements, race timing and local receipts survive reload without duplication',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},save=new SaveSystem(storage),p=new ProgressionSystem(save);
  for(const kind of ['derby','race'])assert.equal(p.claimCompetitionReward({eventId:kind,playerId:'me',saveId:save.data.saveId,kind,amount:350,place:1},'me'),true);
  const event={id:'timing',phase:'finished',startedAt:1000},participant={saveId:save.data.saveId,finishAt:12000};
  assert.equal(p.recordRaceResult(event,participant),true);assert.equal(p.recordRaceResult(event,participant),false);
  const restored=new SaveSystem(storage),progress=new ProgressionSystem(restored),badges=new TrailBadgeSystem(restored,progress);
  assert.ok(restored.data.trailBadges.unlocked.includes('derby-champion'));assert.ok(restored.data.trailBadges.unlocked.includes('race-champion'));
  assert.equal(progress.state.raceResults[0].seconds,11);assert.equal(progress.state.competitionWins.derby,1);assert.ok(badges);
});
test('Old Man pranks are temporary, nonstacking, event-protected and charge only accepted purchases',()=>{
  const s=field(2),old=new RoomOldMan(s.room,{clock:s.now});s.room.oldMan=old;
  const buy={id:'prank',service:'smallCommon',targetId:'p1',saveId:'p0',budget:500};
  assert.equal(old.action(s.players[0],buy),null);assert.equal(old.action(s.players[0],buy),null);assert.equal(old.receipts.length,1);
  assert.match(old.action(s.players[0],{...buy,id:'duplicate'}),/already/);
  s.start();assert.match(old.action(s.players[0],{...buy,id:'blocked'}),/pavilion|paused/);
  old.catch(s.players[1],{specimenId:'during-event',speciesId:'bluegill',sizeCategory:'Tiny',legitimate:true});assert.equal(old.curses.get('p1').remaining,4);
  s.c.cancel('done');
  for(let i=0;i<4;i++)old.catch(s.players[1],{specimenId:`legit-${i}`,speciesId:'bluegill',sizeCategory:'Tiny',legitimate:true});
  assert.equal(old.curses.has('p1'),false);old.remove('p1');
});
test('prank ecology never adds an invalid species, shrinks only qualifying Commons, and updates live odds',()=>{
  const base=getWeightedSpeciesTable(['bluegill','yellow-perch','muskellunge'],{disablePoolEnrichment:true});
  const suppressed=applyOldManTable(base,{noMusk:true});assert.ok(suppressed.every(e=>e.fish.id!=='muskellunge'));assert.ok(Math.abs(suppressed.reduce((n,e)=>n+e.probability,0)-1)<1e-10);
  const curse={kind:'smallCommon',remaining:4,speciesId:'bluegill'};
  const forced=getWeightedSpeciesTable(['bluegill','muskellunge'],{oldManEffect:{curse},disablePoolEnrichment:true});assert.deepEqual(forced.map(e=>[e.fish.id,e.probability]),[['bluegill',1]]);
  const invalid=applyOldManTable(getWeightedSpeciesTable(['muskellunge'],{}),{curse});assert.equal(invalid[0].fish.id,'muskellunge');
  const fish=rollFish(['bluegill','muskellunge'],{oldManEffect:{curse},disablePoolEnrichment:true},()=>.5);assert.equal(fish.sizeCategory,'Tiny');assert.equal(fish.speciesId,'bluegill');
  assert.equal(FISH_SPECIES.some(f=>/cursed[_ -]?flute/i.test(f.rhythm.instrument)),false);
});
test('accepted Old Man payments persist once, stay with their save and ignore unknown receipts',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},saves=new SaveSystem(storage),progression=new ProgressionSystem(saves);
  progression.state.money=500;progression.commit();
  const receipt={id:'paid-once',service:'noMusk',price:200,playerId:'me',saveId:saves.data.saveId};
  const client={state:'in_room',playerId:'me',oldMan:{receipts:[receipt]},room:{getSharedTimeSeconds:()=>0}};
  const controller=Object.assign(Object.create(OldManMenu.prototype),{game:{multiplayer:client,saveSystem:saves,progression,hud:{showToast(){}}},effect:()=>({}),isOpen:false});
  controller.update();controller.update();assert.equal(progression.state.money,300);
  controller.game.progression=new ProgressionSystem(new SaveSystem(storage));controller.update();assert.equal(controller.game.progression.state.money,300);
  client.oldMan.receipts.push({...receipt,id:'other-save',saveId:'different'},{...receipt,id:'wrong-cost',price:1});controller.update();assert.equal(controller.game.progression.state.money,300);
});
test('incline tint is distinct, shared render vertices blend, and shoreline waves use real water intersections',()=>{
  const a=terrainSupportTint(1,.82,.5),b=terrainSupportTint(.67,.82,.5),c=terrainSupportTint(.1,.82,.5);assert.notDeepEqual(a,b);assert.notDeepEqual(b,c);
  const groups=partitionTerrainBySupport([0,0,0,0,0,1,1,0,0],[0,1,2]);assert.equal(groups.standable.colors.length,12);
  const lines=shorelineSegments([[0,-1,0],[0,1,2],[2,1,0]],[[0,1,2]],0);assert.deepEqual(lines,[[[0,1],[1,0]]]);
});
test('hidden race participants and nameplates reappear normally after the event',()=>{
  let visible=false;const remote=new RemotePlayer('r',{setRemoteVisible:v=>visible=v});
  remote.consumeSnapshot({playerId:'r',sequence:1,position:{x:0,y:2,z:0},serverTime:1000,locationId:'main-mountain'});assert.equal(visible,true);
  remote.eventHidden=true;remote.syncVisibility();assert.equal(visible,false);
  remote.eventHidden=false;remote.syncVisibility();assert.equal(visible,true);
  remote.setLocalLocationId('home-island');assert.equal(visible,false);
});
