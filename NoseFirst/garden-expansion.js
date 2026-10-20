export const GARDEN_DEFAULTS = Object.freeze({ metGardener:false, bedClue:false, shedOpen:false, seedReturned:false, cardBlown:false, cardReturned:false, watered:false, chimeHeard:false, canReturned:false });
export function normalizeGardenProgress(value) {
  const out=Object.fromEntries(Object.keys(GARDEN_DEFAULTS).map(key=>[key,value?.[key]===true]));
  if(out.seedReturned)out.metGardener=out.shedOpen=true;
  if(out.cardReturned)out.cardBlown=true;
  return out;
}

export function installGardenExpansion(api) {
  const {THREE,scene,C,state,player,box,sphere,cyl,solidBox,solidCylinder,addSolid,addLocalSolid,register,genericCarry,markMovable,makeHuman,makeTree,makeBench,trees,worldActors,discover,achievement,speak,saveGame,pickup,dropCarried,getCarried,makeScentTrail,sniffing,openPause,closePause}=api;
  const progress=state.garden;
  let waterOn=false,waterTime=0,windTime=0,windActive=false,birdTime=0,lastClock=0;
  const movingBirds=[],flowers=[];
  const setShadow=o=>o.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true}});
  function sign(text,x,z,width=3.4) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ede2bd';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#7b8057';ctx.lineWidth=5;ctx.strokeRect(8,8,496,112);ctx.fillStyle='#3c5748';ctx.font='bold 32px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65,470);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const board=solidBox(width,.72,.11,C.wood,[x,1.45,z],scene,{id:'gardenSignBoard'});
    const face=new THREE.Mesh(new THREE.PlaneGeometry(width-.08,.64),new THREE.MeshStandardMaterial({map:texture,roughness:.95}));face.position.set(x,1.45,z+.061);scene.add(face);
    for(const side of [-1,1])solidCylinder(.065,1.6,C.darkwood,[x+side*(width/2-.2),.8,z],scene,{id:'gardenSignPost'});
    return board;
  }
  // A northward extension connects the old neighborhood through a visible entrance.
  solidBox(1.65,.08,26,C.walk,[18.8,.04,-55],scene,{id:'northSidewalk',walkable:true});
  solidBox(1.65,.08,26,C.walk,[10.2,.04,-55],scene,{id:'northSidewalkWest',walkable:true});
  box(7,.05,26,C.road,[14.5,.01,-55]);
  for(let z=-45;z>-67;z-=4.4)box(.12,.025,2.15,C.white,[14.5,.045,z]);
  solidBox(39,.065,1.7,C.walk,[39,.04,-38],scene,{id:'gardenApproach',walkable:true});
  solidBox(1.7,.065,21,C.walk,[59,.04,-46.5],scene,{id:'gardenPath',walkable:true});
  solidBox(31,.065,1.7,C.walk,[73.5,.04,-49],scene,{id:'gardenCrossPath',walkable:true});
  solidBox(1.7,.065,14,C.walk,[81,.04,-55],scene,{id:'gardenLoopPath',walkable:true});
  box(30,.035,22,C.grass2,[74,.025,-54]);
  sign('WILLOW GARDEN',59,-42,4.5);
  sign('NORTH LANE',23,-45,3);
  const home=api.makeHouseExterior(26,-55,0xc6c9ae,1);
  for(const [x,z,s] of [[22,-63,.85],[40,-60,1.1],[48,-55,.9],[55,-64,1.05],[66,-65,.85],[91,-65,1.1],[96,-50,.9],[92,-42,.8]])trees.push(makeTree(x,z,s));
  for(const x of [39,56,74,92])solidBox(17,.6,.55,C.hedge,[x,.3,-69],scene,{id:'northBoundary'});
  solidBox(.55,1.2,27,C.hedge,[101.2,.6,-55.5],scene,{id:'northEastBoundary'});
  solidBox(.55,1.2,27,C.hedge,[-17.7,.6,-55.5],scene,{id:'northWestBoundary'});
  for(const x of [-10,5,24])solidBox(15,1.15,.55,C.hedge,[x,.575,-69],scene,{id:'northBoundaryWest'});
  const gardenBeds=[];
  const grassGeo=new THREE.ConeGeometry(.035,.24,4),grassMat=new THREE.MeshStandardMaterial({color:C.leaf2,roughness:1});
  const grass=new THREE.InstancedMesh(grassGeo,grassMat,180),grassMatrix=new THREE.Object3D();
  for(let i=0;i<180;i++){
    const x=55+(i*7.137)%40,z=-67+(i*3.719)%23;
    grassMatrix.position.set(x,.08,z);grassMatrix.rotation.set((i%3-1)*.2,i*.7,(i%5-2)*.13);grassMatrix.scale.set(1,.65+(i%7)*.1,1);grassMatrix.updateMatrix();grass.setMatrixAt(i,grassMatrix.matrix);
  }
  grass.receiveShadow=true;scene.add(grass);
  for(const [index,x,z] of [[0,66,-53],[1,75,-53],[2,66,-60],[3,75,-60]]){
    const group=new THREE.Group();group.position.set(x,0,z);scene.add(group);gardenBeds.push(group);
    solidBox(5,.36,2.4,C.darkwood,[0,.18,0],group,{id:'raisedGardenBed',walkable:true});box(4.7,.035,2.1,C.dirt,[0,.375,0],group);
    for(let i=0;i<8;i++){
      const px=-1.9+(i%4)*1.25,pz=-.63+Math.floor(i/4)*1.2;
      cyl(.018,.025,.34,C.leaf,[px,.54,pz],group,5);
      for(const side of [-1,1]){const leaf=sphere(.13,index===1?C.leaf2:C.leaf,[px+side*.1,.54,pz],group,6);leaf.scale.set(1,.4,.65);}
      const flower=sphere(.08,[C.yellow,C.flower,C.blue,C.white][index],[px,.76,pz],group,7);flowers.push(flower);flower.scale.setScalar(progress.watered?1:.55);
    }
  }
  // Small greenhouse: solid lower frames, open entry, translucent glazing above dog height.
  const greenhouse=new THREE.Group();greenhouse.position.set(70,0,-65);scene.add(greenhouse);
  for(const side of [-1,1]){
    solidBox(.12,.15,5.5,C.white,[side*2.6,.075,0],greenhouse,{id:'greenhouseSill'});
    solidBox(.12,.12,5.5,C.white,[side*2.6,2.65,0],greenhouse,{id:'greenhouseEave'});
    for(const z of [-2.65,0,2.65])solidBox(.10,2.7,.1,C.white,[side*2.6,1.35,z],greenhouse,{id:'greenhouseFrame'});
    const pane=new THREE.Mesh(new THREE.BoxGeometry(.025,1.8,5.2),new THREE.MeshStandardMaterial({color:0xacc8bd,transparent:true,opacity:.15,roughness:.3,depthWrite:false}));pane.position.set(side*2.58,1.5,0);greenhouse.add(pane);
    addLocalSolid(greenhouse,side*2.6,0,.12,5.5,0,2.7,{id:'greenhouseWall'});
  }
  solidBox(5.3,.1,.12,C.white,[0,2.65,2.65],greenhouse,{id:'greenhouseLintel'});
  solidBox(5.3,.12,.1,C.white,[0,.06,-2.7],greenhouse,{id:'greenhouseBackSill'});
  solidBox(5.3,.12,.1,C.white,[0,2.65,-2.7],greenhouse,{id:'greenhouseBackEave'});
  addLocalSolid(greenhouse,0,-2.7,5.3,.12,0,2.7,{id:'greenhouseBackGlass'});
  const backPane=new THREE.Mesh(new THREE.BoxGeometry(5.15,2.45,.025),new THREE.MeshStandardMaterial({color:0xacc8bd,transparent:true,opacity:.15,roughness:.3,depthWrite:false}));backPane.position.set(0,1.35,-2.69);greenhouse.add(backPane);
  const greenhouseRoof=new THREE.Mesh(new THREE.BoxGeometry(5.3,.07,5.6),new THREE.MeshStandardMaterial({color:0xd4dfcd,transparent:true,opacity:.2,roughness:.35,depthWrite:false}));greenhouseRoof.position.y=2.75;greenhouse.add(greenhouseRoof);
  for(const side of [-1,1]){
    solidBox(1,.64,3.8,C.wood,[side*1.85,.32,0],greenhouse,{id:'pottingBench',walkable:true});
    for(let i=0;i<4;i++){cyl(.14,.11,.22,C.orange,[side*1.85,.76,-1.4+i*.95],greenhouse,8);sphere(.18,C.leaf,[side*1.85,.99,-1.4+i*.95],greenhouse,8);}
  }
  // Potting shed has a real hinged door and collision that follows the hinge.
  const shed=new THREE.Group();shed.position.set(88,0,-57);scene.add(shed);
  solidBox(6,.12,7,C.wood,[0,.06,0],shed,{id:'gardenShedFloor',walkable:true});
  for(const x of [-3,3])solidBox(.15,2.8,7,C.wood,[x,1.4,0],shed,{id:'gardenShedWall'});
  solidBox(6,2.8,.15,C.wood,[0,1.4,-3.5],shed,{id:'gardenShedBack'});
  for(const x of [-2,2])solidBox(2,2.8,.15,C.wood,[x,1.4,3.5],shed,{id:'gardenShedFront'});
  solidBox(2,.7,.15,C.wood,[0,2.45,3.5],shed,{id:'gardenShedLintel'});
  solidBox(6.4,.18,7.4,C.darkwood,[0,2.9,0],shed,{id:'gardenShedRoof'});
  const door=new THREE.Group();door.position.set(-1,0,3.5);shed.add(door);box(1.95,2.1,.12,C.blue,[.975,1.05,0],door);
  addLocalSolid(door,.975,0,1.95,.13,0,2.1,{id:'gardenShedDoor',dynamic:true});door.rotation.y=progress.shedOpen?-1.6:0;
  const latch=box(.22,.08,.13,C.metal,[.72,.7,.12],door);
  register(latch,{id:'expansion:shedLatch',range:1.5,physical:'Nose the loose shed latch',active:()=>!progress.shedOpen,action:()=>{progress.shedOpen=true;discover('Garden Shed: A Nose-Operated Lock');speak('The latch lifts. The door gives a long, offended creak.');saveGame()}});
  const crate=solidBox(1.5,.35,1.1,C.darkwood,[-1.7,.175,-1.3],shed,{id:'seedCrate',walkable:true});
  const packet=new THREE.Group();packet.position.set(86.35,.45,-58.25);scene.add(packet);box(.3,.035,.4,C.yellow,[0,0,0],packet);box(.15,.012,.22,C.leaf,[0,.026,0],packet);packet.rotation.y=.35;packet.visible=!progress.seedReturned;
  genericCarry(packet,'expansion:seedPacket','the crinkly seed packet',()=>!progress.seedReturned);
  const wateringCan=new THREE.Group();wateringCan.position.set(89,.3,-58.8);scene.add(wateringCan);cyl(.22,.24,.42,C.blue,[0,0,0],wateringCan,10);const spout=cyl(.045,.08,.5,C.blue,[.3,.1,0],wateringCan,8);spout.rotation.z=-1.05;const handle=new THREE.Mesh(new THREE.TorusGeometry(.2,.035,6,14,Math.PI*1.5),new THREE.MeshStandardMaterial({color:C.metal,roughness:.4}));handle.position.set(-.2,.1,0);wateringCan.add(handle);
  genericCarry(wateringCan,'expansion:wateringCan','the little watering can',()=>!progress.canReturned);wateringCan.visible=!progress.canReturned;
  const gardener=makeHuman(62,-47,C.leaf2,.92);gardener.userData.role='gardener';worldActors.push(gardener);gardener.rotation.y=-.65;
  register(gardener,{id:'expansion:gardener',range:2.2,prompt:'Talk to the garden human',action:()=>{
    const carried=getCarried();
    if(carried?.id==='expansion:seedPacket'){
      dropCarried();packet.visible=false;progress.seedReturned=true;progress.metGardener=true;discover('The Case of the Missing Seed Packet, Solved');achievement('Assistant to the Head Gardener');speak('Gardener: “My seeds! You absolute STAR.” The packet was not a snack. Apparently.');saveGame();
    }else if(carried?.id==='expansion:wateringCan'){
      dropCarried();wateringCan.visible=false;progress.canReturned=true;discover('A Human Tool, Delivered With Drool');speak('Gardener: “And the watering can! Look at you.”');saveGame();
    }else if(!progress.metGardener){progress.metGardener=true;discover('Garden Human Has Lost the Crinkly Thing');speak('Gardener: “Seeds… little yellow packet… somewhere.” Dry dirt, paper, and squirrel paws. A workable description.');saveGame();}
    else if(!progress.seedReturned)speak(progress.bedClue?'Gardener: “Try the potting shed. The latch sticks.”':'Gardener: “I was planting over there.” The raised beds hold the freshest paper smell.');
    else speak(progress.watered?'Gardener: “Best garden assistant we have.” A strong endorsement from someone with thumbs.':'Gardener: “The sprinkler tap is by the path.” A small rainstorm might be worth investigating.');
  }});
  const clue=box(.22,.025,.2,C.yellow,[67,.41,-52.7]);register(clue,{id:'expansion:bedClue',range:1.6,prompt:'Sniff the torn paper corner',action:()=>{progress.bedClue=true;discover('Seeds, Paper, and Suspiciously Squirrel-Shaped Footprints');speak('Same dry-paper smell. A little trail heads toward the shed.');saveGame()}});
  makeBench(62,-52,.15);
  const postcard=box(.28,.018,.2,C.white,[62.4,.69,-52]);postcard.rotation.y=.3;
  if(progress.cardBlown)postcard.position.set(57.4,.12,-56.8);postcard.visible=!progress.cardReturned;
  genericCarry(postcard,'expansion:postcard','the windblown postcard',()=>!progress.cardReturned);
  const postbox=new THREE.Group();postbox.position.set(20.2,0,-53);scene.add(postbox);solidCylinder(.075,1.1,C.darkwood,[0,.55,0],postbox,{id:'northMailPost'});solidBox(.7,.45,.5,C.blue,[0,1.2,0],postbox,{id:'northMailBody'});box(.48,.035,.035,C.black,[0,1.12,.26],postbox);
  register(postbox,{id:'expansion:postbox',range:1.6,targetOffset:new THREE.Vector3(0,1,.25),prompt:'Inspect the north-lane mailbox',action:()=>{
    if(getCarried()?.id==='expansion:postcard'){dropCarried();postcard.visible=false;progress.cardReturned=true;discover('North Lane Mail: Delivered Slightly Damp');achievement('Unlicensed Postal Dog');speak('The paper smells match. You have performed mail.');saveGame();}
    else{discover('North Lane Mailbox Smells Like the Escaped Paper');speak('Paper, cinnamon, and this exact fence. The runaway postcard belongs here.');}
  }});
  const tap=solidCylinder(.07,.48,C.metal,[78,.24,-48],scene,{id:'gardenTap'});box(.28,.06,.09,C.blue,[78,.49,-48]);
  register(tap,{id:'expansion:sprinkler',range:1.5,physical:'Turn the sprinkler tap',action:()=>{waterOn=!waterOn;speak(waterOn?'An extremely local rainstorm begins.':'You have cancelled the weather.');}});
  const sprayPositions=new Float32Array(48*3),sprayGeometry=new THREE.BufferGeometry();sprayGeometry.setAttribute('position',new THREE.BufferAttribute(sprayPositions,3));
  const spray=new THREE.Points(sprayGeometry,new THREE.PointsMaterial({color:0xc3dfdb,size:.065,transparent:true,opacity:.7,depthWrite:false}));spray.position.set(78,.12,-48);scene.add(spray);spray.visible=false;
  const windchime=new THREE.Group();windchime.position.set(83,0,-49);scene.add(windchime);solidCylinder(.06,2.2,C.darkwood,[0,1.1,0],windchime,{id:'chimePost'});box(.9,.07,.08,C.darkwood,[.37,2.1,0],windchime);
  for(let i=0;i<4;i++)cyl(.025,.025,.3+i*.09,C.metal,[.15+i*.18,1.77-i*.045,0],windchime,6);
  register(windchime,{id:'expansion:chime',range:2,targetOffset:new THREE.Vector3(.4,1.3,0),prompt:'Listen to the little silver rain',action:()=>{progress.chimeHeard=true;discover('Wind Chimes: A Tree With Doorbells');api.chime();saveGame()}});
  const birdbath=solidCylinder(.09,.72,C.stone,[56.5,.36,-59],scene,{id:'birdbathStem'});solidCylinder(.55,.18,C.stone,[56.5,.8,-59],scene,{id:'birdbathBowl',segments:12});cyl(.43,.43,.02,C.water,[56.5,.9,-59],scene,12);
  register(birdbath,{id:'expansion:birdbath',range:1.65,prompt:'Investigate the tiny bird pool',action:()=>{birdTime=3.2;discover('Birdbath: Water With Opinions');speak('The birds object to your excellent pool inspection.');}});
  for(let i=0;i<4;i++){
    const bird=new THREE.Group();bird.position.set(56.1+i*.26,.98,-59+(i%2)*.24);scene.add(bird);sphere(.075,C.darkwood,[0,0,0],bird,6);sphere(.05,C.darkwood,[.08,.05,0],bird,6);const wings=[];for(const side of [-1,1]){const wing=box(.12,.025,.08,C.blue,[0,0,side*.065],bird);wings.push(wing);}movingBirds.push({bird,wings,home:bird.position.clone()});
  }
  const gardenBall=sphere(.19,C.blue,[60,.2,-57],scene,12);const stripe=new THREE.Mesh(new THREE.TorusGeometry(.184,.017,5,16),new THREE.MeshStandardMaterial({color:C.yellow,roughness:.75}));gardenBall.add(stripe);markMovable(gardenBall,.19);genericCarry(gardenBall,'expansion:gardenBall','the striped garden ball');register(gardenBall,{id:'expansion:pawBall',range:1.4,physical:'Roll the striped ball',action:()=>api.pawMovable(gardenBall,3.5)});
  if(makeScentTrail){
    makeScentTrail('garden-paper','mystery',[[66,.2,-52.7],[72,.2,-49],[81,.2,-49],[86.4,.2,-53.8],[86.4,.35,-58.2]],()=>progress.metGardener&&!progress.seedReturned);
    makeScentTrail('north-mail','familiar',[[57.4,.16,-56.8],[59,.18,-49],[59,.18,-38],[39,.18,-38],[20.2,.18,-38],[20.2,.3,-53]],()=>progress.cardBlown&&!progress.cardReturned);
  }
  setShadow(shed);setShadow(greenhouse);setShadow(gardener);
  const map = installPocketMap(api);
  function objective(){
    if(progress.metGardener&&!progress.seedReturned)return progress.bedClue?'Garden side trail: follow the paper scent to the potting shed. Paw the loose latch.':'Garden side trail: find the gardener’s missing yellow seed packet. Sniff the raised beds.';
    if(progress.cardBlown&&!progress.cardReturned)return 'North Lane side trail: find the windblown postcard and match its smell to a mailbox.';
    return null;
  }
  return {
    objective, openMap:map.open,
    nearbyHint(){return player.pos.z<-43?(objective()??'Explore Willow Garden. The tap, bird pool, and shed reward a curious nose.'):null;},
    update(time,dt){
      lastClock=time;door.rotation.y += ((progress.shedOpen?-1.6:0)-door.rotation.y)*(1-Math.exp(-dt*5));
      const distance=Math.hypot(player.pos.x-62.4,player.pos.z+52);
      if(!progress.cardBlown&&distance<5){progress.cardBlown=true;windActive=true;windTime=0;discover('North Lane Mystery: The Mail Has Escaped');speak('A gust steals a postcard. That seems outside the rules of mail.');saveGame();}
      // Once the postcard is in the dog's mouth, its carry transform owns it.
      if(windActive&&postcard.userData.carried)windActive=false;
      if(windActive){windTime=Math.min(1,windTime+dt/2.2);const t=windTime;postcard.position.set(62.4+(57.4-62.4)*t,.69*(1-t)+.12*t+Math.sin(t*Math.PI)*.95,-52+(-56.8+52)*t);postcard.rotation.set(Math.sin(t*10)*.3,t*9,Math.cos(t*8)*.3);if(t>=1)windActive=false;}
      if(player.pos.z<-43){discover('Willow Garden and the North Lane');if(sniffing()&&Math.hypot(player.pos.x-67,player.pos.z+52.7)<1.6&&!progress.bedClue){progress.bedClue=true;discover('Seeds, Paper, and Suspiciously Squirrel-Shaped Footprints');saveGame();}}
      spray.visible=waterOn;
      if(waterOn){
        waterTime+=dt;for(let i=0;i<48;i++){const t=((time*.0008+i/48)%1),a=time*.0003+(i%4)*Math.PI/2,r=t*3.3;sprayPositions.set([Math.cos(a)*r,Math.sin(t*Math.PI)*1.7,Math.sin(a)*r],i*3);}sprayGeometry.attributes.position.needsUpdate=true;
        if(Math.hypot(player.pos.x-78,player.pos.z+48)<3.1){player.wet=true;if(!progress.watered){progress.watered=true;discover('Sprinkler: A Raincloud With Plumbing');saveGame();}}
        const growth=Math.min(1,.55+waterTime*.035);flowers.forEach(f=>f.scale.setScalar(Math.max(f.scale.x,growth)));
      }
      birdTime=Math.max(0,birdTime-dt);
      movingBirds.forEach(({bird,wings,home},i)=>{
        const flying=birdTime>0,target=flying?1.3+Math.sin(time*.002+i)*.15:0;bird.position.y+=(home.y+target-bird.position.y)*(1-Math.exp(-dt*4));bird.position.x=home.x+(flying?Math.sin(time*.001+i)*.65:0);wings.forEach((w,j)=>w.rotation.x=flying?Math.sin(time*.035+i)*(j?-1:1)*.9:0);
      });
      const facing=Math.atan2(player.pos.x-gardener.position.x,player.pos.z-gardener.position.z)-gardener.rotation.y;
      gardener.rotation.y += Math.atan2(Math.sin(facing),Math.cos(facing))*(1-Math.exp(-dt*.7));
    }
  };
}

function installPocketMap(api){
  const {player,state,openPause,closePause}=api;
  const overlay=document.createElement('section');overlay.className='pocket-map hidden';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','pocketMapTitle');
  const sx=x=>(x+20)*6,sz=z=>(z+72)*4;
  const landmarks=[['Home',0,1],['Old shed',-12,0],['Dog park',62,16],['Food truck',58,-12],['Culvert',92,5],['Willow Garden',72,-55],['Potting shed',88,-57],['North Lane',26,-55],['Playground',26,7]];
  overlay.innerHTML=`<div class="pocket-map-card"><header><div><span>A DOG’S POCKET ATLAS</span><h2 id="pocketMapTitle">The neighborhood, by nose.</h2></div><button class="pocket-map-close" type="button" aria-label="Close trail map">×</button></header><div class="pocket-map-controls"><button type="button" aria-label="Zoom out trail map">−</button><button type="button" class="map-fit">Fit map</button><button type="button" aria-label="Zoom in trail map">+</button></div><div class="pocket-map-view"><svg viewBox="0 0 750 470" role="img" aria-label="Neighborhood trail map with your position and the new northern garden"><rect x="0" y="0" width="750" height="470" rx="14" fill="#e0e2c5"/><path d="M207 20V457" stroke="#a7aa98" stroke-width="33"/><path d="M207 20V457" stroke="#eee8cc" stroke-width="2" stroke-dasharray="10 12"/><path d="M333 12Q342 130 334 220T341 460" stroke="#8db8bc" stroke-width="21" fill="none"/><path d="M232 136H474V55H660M474 136V252H664M230 290H567V364" fill="none" stroke="#c0b58e" stroke-width="12" stroke-linejoin="round"/>${landmarks.map(([name,x,z])=>`<g><circle cx="${sx(x)}" cy="${sz(z)}" r="8" fill="${z<-43?'#6e895c':'#bd9868'}" stroke="#f4eed7" stroke-width="3"/><text x="${sx(x)+12}" y="${sz(z)-10}" fill="#405346" font-size="13" font-family="system-ui">${name}</text></g>`).join('')}<g id="mapDogPosition"><circle r="13" fill="#f0c568" stroke="#4b6554" stroke-width="3"/><path d="M0 -7L5 5L0 2L-5 5Z" fill="#405346"/></g></svg></div><footer><span>Gold marker: you · Green marks: the new north trails</span><button class="pocket-map-resume" type="button">Back to exploring</button></footer></div>`;
  const style=document.createElement('style');style.textContent=`.pocket-map{position:fixed;inset:0;z-index:80;background:#233b35b8;backdrop-filter:blur(7px);display:grid;place-items:center;padding:20px}.pocket-map.hidden{display:none}.pocket-map-card{width:min(900px,100%);max-height:94dvh;overflow:auto;background:#f1ecd5;color:#324d42;border:1px solid #a8b6a1;border-radius:24px;padding:24px;box-shadow:0 30px 90px #182e3355}.pocket-map header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}.pocket-map header span{font-size:10px;letter-spacing:.16em;color:#768268}.pocket-map h2{font-family:Georgia,serif;font-size:30px;margin:5px 0 0;font-weight:400}.pocket-map-view{overflow:auto;max-height:60dvh;border-radius:14px;overscroll-behavior:contain;background:#e0e2c5}.pocket-map svg{width:100%;height:auto;max-width:none;display:block}.pocket-map-controls{display:flex;gap:7px;justify-content:flex-end;margin-bottom:8px}.pocket-map .pocket-map-controls button{padding:6px 12px;font-size:12px;min-width:34px}.pocket-map button{border-radius:11px;padding:11px 17px;border:1px solid #a5b49b;background:#e0e7ca;color:#3c5847;cursor:pointer;font:inherit}.pocket-map-close{font-size:24px!important}.pocket-map footer{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:20px}.pocket-map footer span{font-size:11px;color:#6a7c65}.pocket-map button:focus-visible{outline:3px solid #718e60;outline-offset:3px}@media(max-width:600px){.pocket-map{padding:10px}.pocket-map-card{padding:17px;border-radius:18px}.pocket-map h2{font-size:23px}.pocket-map footer{align-items:stretch;flex-direction:column}}`;
  document.head.append(style);document.body.append(overlay);
  const button=document.createElement('button');button.className='btn';button.type='button';button.textContent='Trail map · Tab';document.getElementById('openJournalBtn').before(button);
  let mapZoom=1;
  const mapView=overlay.querySelector('.pocket-map-view'),mapSvg=overlay.querySelector('svg');
  const zoomMap=amount=>{const ratio=amount/mapZoom,cx=(mapView.scrollLeft+mapView.clientWidth/2)*ratio,cy=(mapView.scrollTop+mapView.clientHeight/2)*ratio;mapZoom=amount;mapSvg.style.width=`${amount*100}%`;mapView.scrollLeft=cx-mapView.clientWidth/2;mapView.scrollTop=cy-mapView.clientHeight/2;};
  overlay.querySelector('[aria-label="Zoom in trail map"]').onclick=()=>zoomMap(Math.min(3,mapZoom+.5));
  overlay.querySelector('[aria-label="Zoom out trail map"]').onclick=()=>zoomMap(Math.max(1,mapZoom-.5));
  overlay.querySelector('.map-fit').onclick=()=>zoomMap(1);
  const close=()=>{overlay.classList.add('hidden');document.getElementById('pauseOverlay').classList.remove('hidden');button.focus()};
  const open=()=>{openPause();document.getElementById('pauseOverlay').classList.add('hidden');overlay.classList.remove('hidden');const marker=overlay.querySelector('#mapDogPosition');marker.setAttribute('transform',`translate(${sx(player.pos.x)} ${sz(player.pos.z)}) rotate(${-player.yaw*180/Math.PI})`);overlay.querySelector('.pocket-map-close').focus()};
  button.onclick=open;overlay.querySelector('.pocket-map-close').onclick=close;overlay.querySelector('.pocket-map-resume').onclick=()=>{close();closePause()};
  document.addEventListener('keydown',event=>{
    if(overlay.classList.contains('hidden'))return;
    if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
    if(event.code==='Tab'){event.preventDefault();const buttons=[...overlay.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}
  },true);
  return {open};
}
