import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomCompetition } from '../server/src/competition.js';
import { DERBY_MODES } from '../src/multiplayer/competition-rules.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { CompetitionController } from '../src/ui/competition.js';

function setup(kind = 'derby', mode = 'count', allowEquipment = false) {
  let now = 100_000; const players = ['a','b'].map(playerId => ({ playerId, displayName: playerId, connected: true,
    lastSnapshot: { position: { x: 464, y: 2, z: -28 }, locationId: 'main-mountain', teleportRevision: 1 } }));
  const room = { hostId: 'a', players: new Map(players.map(p=>[p.playerId,p])), broadcastState() {} };
  const competition = new RoomCompetition(room, { clock: () => now, schedule: false });
  assert.equal(competition.action(players[0], { action:'create', kind, mode, allowEquipment, saveId:'save-a' }), null);
  assert.equal(competition.action(players[1], { action:'join', saveId:'save-b' }), null);
  const advance = ms => { now += ms; competition.tick(); };
  const start = () => { assert.equal(competition.action(players[0], { action:'start' }), null);
    players.forEach(p => competition.action(p, { action:'ready', saveId:`save-${p.playerId}` })); advance(5001); assert.equal(competition.event.phase,'active'); };
  const catchFish = (who, id, length, value, extra = {}) => competition.catch(players[who], { eventId: competition.event.id,
    saveId: `save-${players[who].playerId}`, specimenId:id, speciesId:'bluegill', length, value, legitimate:true, ...extra });
  return { competition, players, advance, start, catchFish };
}
test('all four derby scoring modes produce the correct winner without consuming catches', () => {
  for (const mode of Object.keys(DERBY_MODES)) {
    const s=setup('derby',mode); assert.equal(s.competition.event.allowEquipment,false); s.start();
    s.catchFish(0,'one',20,100); s.catchFish(1,'two',10,200); s.advance(2000); s.catchFish(0,'three',5,150);
    s.advance(300_000); const e=s.competition.state();
    assert.deepEqual(e.winnerIds,[mode === 'bestValue' ? 'b' : 'a']); assert.equal(e.awards[0].amount,150);
    assert.equal(e.participants[0].count,2); assert.equal(e.participants[1].count,1);
  }
});
test('derby ignores duplicate, old-event, debug and mismatched-save catches; tied prize is shared', () => {
  const s=setup(); s.start(); s.catchFish(0,'one',10,50); s.advance(2000);
  s.catchFish(0,'one',10,50); s.catchFish(0,'wrong-save',10,50,{saveId:'other'});
  s.catchFish(0,'debug',10,50,{legitimate:false}); s.catchFish(0,'old',10,50,{eventId:'old'});
  s.catchFish(1,'two',10,50); s.advance(300_000);
  assert.equal(s.competition.event.participants[0].count,1); assert.deepEqual(s.competition.event.awards.map(a=>a.amount),[75,75]);
});
test('race uses ordered server-observed checkpoints and rejects teleport shortcuts', () => {
  const s=setup('race'); s.start();
  const snap = (y, teleportRevision=1) => ({ position:{x:260,y,z:0}, locationId:'main-mountain',teleportRevision });
  s.competition.snapshot(s.players[0],snap(305)); assert.equal(s.competition.event.phase,'active');
  for (const y of [61,121,181,241,296,305]) { s.advance(20_000); s.competition.snapshot(s.players[0],snap(y)); }
  assert.equal(s.competition.event.phase,'finished'); assert.deepEqual(s.competition.event.winnerIds,['a']); assert.equal(s.competition.event.awards[0].amount,200);
  const shortcut=setup('race'); shortcut.start(); shortcut.competition.snapshot(shortcut.players[0],snap(305,2));
  assert.ok(shortcut.competition.event.participants[0].disqualified); assert.equal(shortcut.competition.event.phase,'cancelled'); assert.equal(shortcut.competition.event.awards.length,0);
});
test('host-only start, opt-in enrollment, preparation timeout and equipment option', () => {
  const s=setup('derby','haul',true); assert.equal(s.competition.event.allowEquipment,true);
  assert.match(s.competition.action(s.players[1],{action:'start'}),/host/);
  s.competition.action(s.players[0],{action:'start'}); s.advance(15001); assert.equal(s.competition.event.phase,'cancelled');
});
test('basic event equipment leaves saved loadout intact and prize receipts survive reload', () => {
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const saves=new SaveSystem(storage), progression=new ProgressionSystem(saves);
  progression.state.ownedEquipment.push('shock-absorb-line'); progression.equip('shock-absorb-line');
  const equipped=structuredClone(progression.state.equipped); progression.equipment.basicOnly=true;
  assert.equal(progression.getModifier('mistakeAllowanceMultiplier'),1); assert.equal(progression.getEquippedItem('line').id,'standard-line');
  assert.equal(progression.equip('standard-line').ok,false); assert.deepEqual(progression.state.equipped,equipped);
  progression.equipment.basicOnly=false; assert.equal(progression.getModifier('mistakeAllowanceMultiplier'),1.5);
  const award={eventId:'round-1',playerId:'a',saveId:saves.data.saveId,amount:150,kind:'derby'};
  const money=progression.state.money; assert.equal(progression.claimCompetitionReward(award,'a'),true);
  const restored=new ProgressionSystem(new SaveSystem(storage)); assert.equal(restored.state.money,money+150);
  assert.equal(restored.claimCompetitionReward(award,'a'),false); assert.equal(restored.claimCompetitionReward({...award,eventId:'round-2',saveId:'other'},'a'),false);
});

test('game event transitions use the player fishing exit, freeze countdowns, and restore equipment',()=>{
  const actions=[],values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const saves=new SaveSystem(storage),progression=new ProgressionSystem(saves);
  let exits=0,starts=0;
  const client={state:'in_room',playerId:'a',competition:null,competitionAction:(...args)=>actions.push(args)};
  const game={multiplayer:client,saveSystem:saves,progression,sessionStats:{},player:{stamina:{unlimited:false},exitFishing(){exits++;},clearBenchSeat(){},setUnlimitedStamina(v){this.stamina.unlimited=v;},showHeldEquipment(){}},
    runManager:{startRun(){starts++;}},multiplayerMenu:{close(){}},setLocalPause(){},hud:{showToast(){}}};
  const controller=Object.assign(Object.create(CompetitionController.prototype),{game,client,lastRender:Date.now(),render(){}});
  controller.update();assert.equal(exits,0,'solo/idle startup does not call a nonexistent fishing-controller method');
  client.competition={id:'round',kind:'race',phase:'preparing',allowEquipment:false,participants:[{playerId:'a',saveId:saves.data.saveId}],awards:[]};
  controller.update();assert.equal(starts,1);assert.equal(controller.frozen,true);assert.equal(progression.equipment.basicOnly,true);assert.ok(actions.some(a=>a[0]==='ready'));
  controller.update();assert.equal(starts,1,'network refreshes never teleport the racer twice');
  client.competition.phase='active';assert.equal(controller.frozen,false);
  client.competition.phase='finished';controller.update();assert.equal(progression.equipment.basicOnly,false);
});
