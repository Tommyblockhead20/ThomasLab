import { OLD_MAN_SERVICES,eventInProgress } from '../multiplayer/old-man-rules.js';
import { OLD_MAN_COSMETICS } from '../progression/cosmetics.js';

const element=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
export class OldManMenu {
  constructor(game) {
    this.game=game;this.isOpen=false;
    this.screen=element('section');this.screen.className='old-man-menu';this.screen.hidden=true;this.screen.setAttribute('role','dialog');this.screen.setAttribute('aria-modal','true');this.screen.setAttribute('aria-label',"The Old Man at Rascal's Rest");
    this.screen.innerHTML=`<header><div><span class="eyebrow">RASCAL'S REST</span><h2>The Old Man</h2><p>Friendly competition. Questionable bargains.</p></div><button data-close>CLOSE <kbd>Esc</kbd></button></header><nav aria-label="Old Man services"><button data-tab="events">EVENTS</button><button data-tab="mischief">MISCHIEF</button><button data-tab="bargains">BARGAINS</button></nav><div class="old-man-content"></div><p class="old-man-status" role="status"></p>`;
    document.body.append(this.screen);this.content=this.screen.querySelector('.old-man-content');this.status=this.screen.querySelector('.old-man-status');this.tab='events';
    this.onOpen=()=>this.open();window.addEventListener('reel-ascent:open-old-man',this.onOpen);
    this.onKey=e=>{if(e.code==='Escape'&&this.isOpen){e.preventDefault();e.stopImmediatePropagation();this.close();}};window.addEventListener('keydown',this.onKey,true);
    this.onClick=e=>{if(e.target.closest('[data-close]'))this.close();const tab=e.target.closest('[data-tab]')?.dataset.tab;if(tab){this.tab=tab;this.render();}};this.screen.addEventListener('click',this.onClick);
    this.onError=e=>{this.pendingPurchase=null;if(this.isOpen){this.render();this.status.textContent=e.detail;}};game.multiplayer.addEventListener('competitionerror',this.onError);
    game.fishing.getOldManEffect=()=>this.effect();
  }
  effect() {
    const client=this.game.multiplayer,state=client.state==='in_room'?client.oldMan:null;
    if(!state||eventInProgress(client.competition))return {};
    const now=client.room.getSharedTimeSeconds()*1000;
    return {noMusk:state.noMuskUntil>now,curse:state.curses?.find(c=>c.playerId===client.playerId&&c.expiresAt>now)};
  }
  update() {
    const {game}=this,client=game.multiplayer,state=client.state==='in_room'?client.oldMan:null;
    if(client.state!=='in_room')this.pendingPurchase=null;
    for(const r of state?.receipts??[]) {
      if(r.playerId!==client.playerId||r.saveId!==game.saveSystem.data.saveId)continue;
      if(typeof r.id!=='string'||r.id.length>140||r.price!==OLD_MAN_SERVICES[r.service]?.price)continue;
      const progress=game.progression;progress.state.oldManReceipts??=[];
      if(progress.state.oldManReceipts.includes(r.id))continue;
      if(!progress.spend(r.price))continue;
      progress.state.oldManReceipts=[...progress.state.oldManReceipts,r.id].slice(-256);progress.commit();
      if(this.pendingPurchase===r.id)this.pendingPurchase=null;
      game.hud.showToast?.(`The Old Man: ${OLD_MAN_SERVICES[r.service]?.label??'Mischief'} · $${r.price}`);
    }
    const effect=this.effect(),curseId=effect.curse?.id;
    if(effect.noMusk&&state.noMuskUntil!==this.notifiedNoMusk){this.notifiedNoMusk=state.noMuskUntil;game.hud.showToast?.('The Old Man: no Muskellunge in this room for five minutes. Paused during events.',6);}
    if(curseId&&curseId!==this.notifiedCurse){this.notifiedCurse=curseId;game.hud.showToast?.('The Old Man has meddled with your next four qualifying catches!',6);}
    if(this.isOpen&&(game.currentLocationId!=='jester-island'||game.saveSystem.data.saveId!==this.openSaveId)){this.close();return;}
    const key=JSON.stringify([game.progression.revision,client.state,client.competition?.phase,client.oldMan?.curses,Math.floor(Date.now()/30000)]);
    if(this.isOpen&&key!==this.renderKey){this.renderKey=key;this.render();}
  }
  open() {
    if(this.game.currentLocationId!=='jester-island')return;
    this.game.multiplayerMenu.close();document.exitPointerLock?.();this.openSaveId=this.game.saveSystem.data.saveId;this.isOpen=true;
    this.screen.hidden=false;document.body.classList.add('shop-open');this.render();this.screen.querySelector('[data-close]').focus();
  }
  close() {
    if(!this.isOpen)return;this.isOpen=false;this.screen.hidden=true;document.body.classList.remove('shop-open');
    document.querySelector('#multiplayer-roster')?.after(this.game.competitions.panel);document.querySelector('#game-canvas')?.focus({preventScroll:true});
  }
  render() {
    const {game}=this,progress=game.progression,client=game.multiplayer;
    // Move the existing live event controller, retaining its listeners and settings.
    if(this.content.contains(game.competitions.panel))document.querySelector('#multiplayer-roster')?.after(game.competitions.panel);
    this.content.replaceChildren();for(const b of this.screen.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(b.dataset.tab===this.tab));
    const addCard=(title,copy,label,action,disabled=false)=>{const c=element('article'),h=element('h3',title),p=element('p',copy),b=element('button',label);b.disabled=disabled;b.addEventListener('click',action);c.append(h,p,b);this.content.append(c);return c;};
    this.status.textContent=`$${progress.state.money.toLocaleString()} available`;
    if(this.tab==='events') {
      if(client.state!=='in_room')addCard('Gather your crew','Host or join a multiplayer room, then speak to me to arrange a race or derby.','OPEN MULTIPLAYER',()=>{this.close();game.multiplayerMenu.open();});
      else {this.content.append(game.competitions.panel);game.competitions.render();}
    }else if(this.tab==='mischief') {
      const paused=eventInProgress(client.competition),offline=client.state!=='in_room';
      this.content.append(element('p',paused?'Mischief is paused for the whole room while an event is running.':'Pranks last for this room only. Event catches are protected.'));
      for(const [id,item] of Object.entries(OLD_MAN_SERVICES)) {
        let target=null;
        const c=addCard(item.label,item.description,`BUY · $${item.price}`,()=>{
          if(this.pendingPurchase)return;
          if(!progress.canAfford(item.price)){this.status.textContent=`Need $${item.price}.`;return;}
          const request={id:crypto.randomUUID(),service:id,targetId:target?.value,saveId:game.saveSystem.data.saveId,budget:progress.state.money};
          this.pendingPurchase=request.id;
          if(!client.oldManAction(request)){this.pendingPurchase=null;this.status.textContent='Connect to a room first.';return;}
          this.render();
        },offline||paused||Boolean(this.pendingPurchase)||(id==='cursedFlute'&&!client.oldMan?.fluteAvailable));
        if(id!=='noMusk'){target=element('select');target.setAttribute('aria-label',`${item.label} target`);for(const p of client.room.roster.values())if(p.id!==client.playerId&&p.connected!==false){const o=element('option',p.displayName??'Player');o.value=p.id;target.append(o);}c.insertBefore(target,c.lastChild);if(!target.options.length)c.lastChild.disabled=true;}
      }
    }else {
      const daily=progress.getOldManDailySaleStatus(),owned=[...progress.state.inventory,...progress.state.aquarium].filter(s=>daily.matchingSpecimenIds.includes(s.specimenId));let pick;
      const card=addCard('Today’s request',`${daily.requestedSpeciesName} · one specimen for double its sale value.`,daily.completed?'COME BACK TOMORROW':'SELL FOR 2×',()=>{const r=progress.sellOldManDailySpecimen(pick.value);this.status.textContent=r.ok?`Sold for $${r.amount}.`:r.reason;this.render();},!daily.available||!owned.length);
      pick=element('select');pick.setAttribute('aria-label','Specimen to sell');for(const s of owned){const o=element('option',`${s.name} · ${s.length} in · $${s.value*2}`);o.value=s.specimenId;pick.append(o);}card.insertBefore(pick,card.lastChild);
      for(const c of OLD_MAN_COSMETICS)addCard(c.label,'An Old Man exclusive. Fixed precious finish; pure style.',progress.state.ownedCosmetics.includes(c.id)?'OWNED':`BUY · $${c.source.price}`,()=>{const r=progress.purchaseCosmetic(c.id,'old-man');this.status.textContent=r.ok?'Added to your wardrobe.':r.reason;this.render();},Boolean(this.pendingPurchase)||progress.state.ownedCosmetics.includes(c.id));
    }
  }
  destroy(){this.close();this.game.multiplayer.removeEventListener('competitionerror',this.onError);window.removeEventListener('reel-ascent:open-old-man',this.onOpen);window.removeEventListener('keydown',this.onKey,true);this.screen.removeEventListener('click',this.onClick);delete this.game.fishing.getOldManEffect;this.screen.remove();}
}
