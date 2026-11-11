import { DERBY_MODES, EVENT_ISLAND_ID, EVENT_DESTINATIONS, competitionPrizes, raceStartOffset, competitionParticipant, isCompetitionPlaying, derbyScore } from '../multiplayer/competition-rules.js';
import { START_LOCATIONS } from '../world/mountain-v2.js';
import { WORLD_LOCATIONS } from '../world/world-locations.js';
import { getDestinationAccess } from '../progression/destination-progression.js';

const node = (tag, text, className = '') => { const e = document.createElement(tag); e.textContent = text; e.className = className; return e; };
const time = ms => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;
export class CompetitionController {
  constructor(game) {
    this.game = game; this.client = game.multiplayer; this.boundSaveId = null; this.preparedId = null; this.lastRender = 0;
    this.panel = document.createElement('section'); this.panel.className = 'competition-panel';
    this.panel.innerHTML = `<h3>Room events</h3><p class="competition-summary"></p>
      <div class="competition-setup"><label>EVENT<select data-setting="kind"><option value="derby">Fishing derby</option><option value="race">Summit race</option></select></label>
      <label data-derby>SCORING<select data-setting="mode">${Object.entries(DERBY_MODES).map(([id, label]) => `<option value="${id}" ${id === 'count' ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label data-derby>DURATION<select data-setting="minutes"><option>3</option><option selected>5</option><option>10</option></select> minutes</label>
      <label class="competition-equipment"><input data-setting="allowEquipment" type="checkbox"> Allow equipment upgrades</label>
      <label data-race><input data-setting="spacedStart" type="checkbox"> Space racers apart at the start</label>
      <label data-race><input data-setting="racersVisible" type="checkbox" checked> Show other racers</label>
      <label data-derby>FISHING ISLANDS<select data-setting="islandRule"><option value="all">All islands (your own unlocks apply)</option><option value="shared">Only islands everyone has unlocked</option><option value="custom">Choose islands</option></select></label>
      <fieldset class="competition-islands" hidden><legend>Allowed islands</legend>${EVENT_DESTINATIONS.map(id=>`<label><input type="checkbox" data-island="${id}" ${id==='main-mountain'?'checked':''}>${WORLD_LOCATIONS.find(l=>l.id===id)?.displayName??id}</label>`).join('')}</fieldset>
      <button type="button" data-event-action="create">CREATE EVENT</button></div>
      <ol class="competition-standings"></ol><div class="competition-actions">
      <button type="button" data-event-action="join">JOIN EVENT</button><button type="button" data-event-action="leave">WITHDRAW</button>
      <button type="button" data-event-action="start">START EVENT</button><button type="button" data-event-action="cancel">CANCEL EVENT</button></div>
      <p class="competition-note">Prizes grow with the field: top 2 paid from 4 entrants, top 3 from 7, top 4 at 10. Everyone keeps their fish.</p>`;
    document.querySelector('#multiplayer-roster')?.after(this.panel);
    this.banner = node('button', '', 'competition-banner'); this.banner.type = 'button'; this.banner.hidden = true;
    document.body.append(this.banner);
    this.onBanner = () => game.multiplayerMenu.open(); this.banner.addEventListener('click', this.onBanner);
    this.onAction = event => {
      const action = event.target.closest('[data-event-action]')?.dataset.eventAction; if (!action) return;
      const setting = key => this.panel.querySelector(`[data-setting="${key}"]`);
      this.client.competitionAction(action, { saveId: game.saveSystem.data.saveId,
        unlockedIslands:EVENT_DESTINATIONS.filter(id=>getDestinationAccess(game.saveSystem.data,id).playable),
        kind: setting('kind').value, mode: setting('mode').value, minutes: Number(setting('minutes').value), allowEquipment: setting('allowEquipment').checked,...this.settings() });
    };
    this.panel.addEventListener('click', this.onAction);
    this.onError = event => game.hud.showToast?.(event.detail, 4);
    this.client.addEventListener('competitionerror', this.onError);
    this.onChange = () => this.render(); this.panel.addEventListener('change', this.onChange); this.render();
  }
  settings() {const setting=k=>this.panel.querySelector(`[data-setting="${k}"]`);return {spacedStart:setting('spacedStart').checked,racersVisible:setting('racersVisible').checked,islandRule:setting('islandRule').value,selectedIslands:[...this.panel.querySelectorAll('[data-island]:checked')].map(e=>e.dataset.island)};}
  event() { return this.client.state === 'in_room' ? this.client.competition : null; }
  get frozen() {
    const e = this.event(); return isCompetitionPlaying(e, this.client.playerId) && ['preparing', 'countdown'].includes(e.phase);
  }
  withdraw() {
    const e = this.event(); if (isCompetitionPlaying(e, this.client.playerId)) this.client.competitionAction('withdraw');
  }
  catchMetadata(catchData, legitimate) {
    const e = this.event(), p = competitionParticipant(e, this.client.playerId);
    return e?.phase === 'active' && e.kind === 'derby' && p && !p.disqualified
      ? { eventId: e.id, saveId: p.saveId, legitimate } : {};
  }
  destinationAccess(id,access) {
    const e=this.event();
    return e?.kind==='derby'&&isCompetitionPlaying(e,this.client.playerId)&&e.allowedIslands?.length&&!e.allowedIslands.includes(id)
      ? {...access,playable:false,reason:'This island is outside the derby rules.'}:access;
  }
  async prepare(e,p) {
    const {game,client}=this;
    const arrive=()=>{
      if(this.event()?.id!==e.id||this.event()?.phase!=='preparing'||game.saveSystem.data.saveId!==p.saveId)return;
      const index=e.participants.findIndex(item=>item.playerId===client.playerId),base=START_LOCATIONS[0];
      const a=base.angle*Math.PI/180,offset=raceStartOffset(index,e.participants.length,e.spacedStart);
      game.runManager.startRun({...base,position:{...base.position,x:base.position.x-Math.sin(a)*offset,z:base.position.z+Math.cos(a)*offset}});
      game.sessionStats.ascentCheatContaminated=false;
    };
    if(e.kind==='race') {
      if(game.boatTravel?.runTransition)await game.boatTravel.runTransition('Sailing to the race start…',arrive);
      else arrive();
    }
    if(this.event()?.id===e.id&&this.event()?.phase==='preparing'&&game.saveSystem.data.saveId===p.saveId)client.competitionAction('ready',{saveId:p.saveId});
  }
  update() {
    const { game, client } = this, e = this.event(), p = competitionParticipant(e, client.playerId);
    if(client.state==='in_room'&&Date.now()-(this.lastProfileCheck??0)>1000) {
      this.lastProfileCheck=Date.now();
      const profile={saveId:game.saveSystem.data.saveId,unlockedIslands:EVENT_DESTINATIONS.filter(id=>getDestinationAccess(game.saveSystem.data,id).playable)};
      const key=JSON.stringify([client.room?.roomCode,profile]);if(key!==this.profileKey){this.profileKey=key;client.competitionAction('profile',profile);}
    }else if(client.state!=='in_room')this.profileKey=null;
    const hiddenRace=e?.kind==='race'&&e.racersVisible===false&&['preparing','countdown','active'].includes(e.phase);
    for(const [id,remote] of client.room?.members??[]) {remote.eventHidden=Boolean(hiddenRace&&competitionParticipant(e,id));remote.syncVisibility?.();}
    if (p && ['preparing', 'countdown', 'active'].includes(e.phase) && !p.disqualified) {
      if (!this.boundSaveId) this.boundSaveId = p.saveId;
      if (game.saveSystem.data.saveId !== p.saveId) this.withdraw();
      if (e.phase === 'preparing' && this.preparedId !== e.id && game.saveSystem.data.saveId === p.saveId) {
        this.preparedId = e.id; game.player.exitFishing({ releasePointerLock: true }); game.player.clearBenchSeat?.();
        game.player.setUnlimitedStamina(false);
        game.multiplayerMenu.close(); game.pauseMenu?.close?.(); game.setLocalPause(false);
        game.oldManMenu?.close();
        void this.prepare(e,p).catch(()=>{this.withdraw();game.hud.showToast?.('Could not reach the shared start. Please rejoin the next race.');});
      }
    } else { this.boundSaveId = null; }
    if (isCompetitionPlaying(e, client.playerId) && game.player.stamina.unlimited) this.withdraw();
    const basicOnly = isCompetitionPlaying(e, client.playerId) && !e.allowEquipment && game.saveSystem.data.saveId === p?.saveId;
    if (Boolean(game.progression.equipment.basicOnly) !== basicOnly) {
      game.player.exitFishing({ releasePointerLock: false });
      game.progression.equipment.basicOnly = basicOnly; game.progression.revision++;
      game.player.showHeldEquipment(game.progression.getHeldEquipmentItem());
    }
    for (const award of e?.awards ?? []) if (game.progression.claimCompetitionReward(award, client.playerId)) game.hud.showToast?.(`${award.place===1?'Event won!':`Event place #${award.place}`} +$${award.amount}`, 5);
    if(e?.phase==='finished'&&p&&e.kind==='race'&&p.finishAt&&!p.disqualified)game.progression.recordRaceResult?.(e,p);
    if (Date.now() - this.lastRender > 250) { this.lastRender = Date.now(); this.render(); }
  }
  render() {
    const state = this.client.getState(), e = this.event(), p = competitionParticipant(e, this.client.playerId), host = state.hostId === this.client.playerId;
    this.panel.hidden = state.state !== 'in_room';
    const atOldMan=this.game.currentLocationId===EVENT_ISLAND_ID&&this.game.oldManMenu?.isOpen;
    this.panel.querySelector('.competition-setup').hidden = !host || !atOldMan || !state.competitionSupported || Boolean(e && !['finished', 'cancelled'].includes(e.phase));
    const now = this.client.room.getSharedTimeSeconds() * 1000;
    const label = e ? e.kind === 'race' ? 'Summit race' : `Fishing derby · ${DERBY_MODES[e.mode]}` : '';
    const status = e ? `${label} · ${e.phase === 'active' ? time(e.deadline - now) : e.phase === 'countdown' ? `Starts in ${Math.max(0, Math.ceil((e.deadline - now) / 1000))}` : e.message} · ${e.allowEquipment ? 'Equipment allowed' : 'Basic equipment only'}`
      : !state.competitionSupported ? 'Events require the updated multiplayer server.' : host ? atOldMan?'Choose an event. Players join before you start.':"Visit the Old Man at Rascal's Rest to host an event.":'The room host can create a derby or race with the Old Man.';
    this.panel.querySelector('.competition-summary').textContent = status;
    for (const label of this.panel.querySelectorAll('[data-derby]')) label.hidden = this.panel.querySelector('[data-setting="kind"]').value === 'race';
    for(const label of this.panel.querySelectorAll('[data-race]'))label.hidden=this.panel.querySelector('[data-setting="kind"]').value!=='race';
    this.panel.querySelector('.competition-islands').hidden=this.panel.querySelector('[data-setting="kind"]').value==='race'||this.panel.querySelector('[data-setting="islandRule"]').value!=='custom';
    const prizes=e?.prizes?.length?e.prizes:competitionPrizes(Math.max(2,e?.participants.length??2));
    this.panel.querySelector('.competition-note').textContent=`${prizes.map((v,i)=>`${i+1}${['st','nd','rd','th'][i]}: $${v}`).join(' · ')} · ${e?.fieldSize||e?.participants.length||2} entrants. Ties share the occupied prizes. You keep every fish.${e?.kind==='derby'?' Sail to fishing spots yourself.':''}`;
    for (const button of this.panel.querySelectorAll('.competition-actions button')) {
      const action = button.dataset.eventAction;
      button.hidden = action === 'join' ? !e || e.phase !== 'lobby' || Boolean(p)
        : action === 'leave' ? !p || p.disqualified || ['finished', 'cancelled'].includes(e.phase)
          : !host || !e || (action === 'start' ? e.phase !== 'lobby' : ['finished', 'cancelled'].includes(e.phase));
      if (action === 'start') {button.disabled = (e?.participants.length ?? 0) < 2||!atOldMan;button.title=atOldMan?'':"Start with the Old Man at Rascal's Rest.";}
    }
    const entries = [...(e?.participants ?? [])].sort((a, b) => e.kind === 'derby' ? derbyScore(b, e.mode) - derbyScore(a, e.mode) : (a.finishAt ?? Infinity) - (b.finishAt ?? Infinity));
    this.panel.querySelector('.competition-standings').replaceChildren(...entries.map(entry => {
      const score = e.kind === 'race' ? entry.finishAt ? time(entry.finishAt - e.startedAt) : `${entry.checkpoints.length}/5 checkpoints`
        : e.mode === 'count' ? `${entry.count} fish` : e.mode === 'biggest' ? `${entry.biggest.toFixed(1)} in` : `$${derbyScore(entry, e.mode)}`;
      return node('li', `${entry.name}${entry.playerId === this.client.playerId ? ' (you)' : ''} · ${entry.disqualified ?? score}${e.winnerIds.includes(entry.playerId) ? ' · WINNER' : ''}`);
    }));
    this.banner.hidden = !p || !e || ['lobby', 'cancelled'].includes(e.phase) || (e.phase === 'finished' && now - e.finishedAt > 15_000);
    this.banner.textContent = p?.disqualified ? `Event: ${p.disqualified} · View results` : e?.phase === 'finished' ? e.message : status;
  }
  destroy() {
    this.game.progression.equipment.basicOnly = false;
    this.panel.removeEventListener('click', this.onAction); this.panel.removeEventListener('change', this.onChange);
    this.client.removeEventListener('competitionerror', this.onError); this.banner.removeEventListener('click', this.onBanner);
    this.panel.remove(); this.banner.remove();
  }
}
