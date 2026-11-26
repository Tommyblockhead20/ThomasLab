(() => {
  const namespace = 'http://www.w3.org/2000/svg';
  const bounds = {x:-62,y:-70,w:824,h:550};
  const insetBoxes = {'02':[4,355,167,113,58,-154,'AK'], '15':[189,410,80,54,20.8,-157,'HI'], '72':[572,432,117,33,18.1,-66.4,'PR']};
  const radians = Math.PI/180;

  function element(tag, attributes={}) {
    const node=document.createElementNS(namespace,tag);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    return node;
  }

  function insetPoint(lat,lon,originLat,originLon) {
    const phi=lat*radians,phi0=originLat*radians,delta=(lon-originLon)*radians;
    const k=Math.sqrt(2/(1+Math.sin(phi0)*Math.sin(phi)+Math.cos(phi0)*Math.cos(phi)*Math.cos(delta)));
    return {x:k*Math.cos(phi)*Math.sin(delta),y:-k*(Math.cos(phi0)*Math.sin(phi)-Math.sin(phi0)*Math.cos(phi)*Math.cos(delta))};
  }

  window.mountFindYourPlaceCityMap=({svg,stateLayer,projectMainland,onViewChange,onSelect})=>{
    const outlines=svg.querySelector('[data-city-outlines]');
    const markers=svg.querySelector('[data-city-markers]');
    const stateBounds=new Map(),projectInsets=new Map();
    for(const state of stateLayer.querySelectorAll('path[data-id]')){
      const code=state.dataset.id;
      const inset=insetBoxes[code];
      const rings=window.findYourPlaceCityInsets?.[code];
      if(inset&&rings){
        const [x,y,w,h,originLat,originLon,label]=inset;
        const raw=rings.map(ring=>ring.map(([lon,lat])=>insetPoint(lat,lon,originLat,originLon)));
        const samples=raw.flat();
        const left=Math.min(...samples.map(p=>p.x)),right=Math.max(...samples.map(p=>p.x));
        const top=Math.min(...samples.map(p=>p.y)),bottom=Math.max(...samples.map(p=>p.y));
        const scale=Math.min((w-6)/(right-left),(h-9)/(bottom-top));
        const offsetX=x+(w-(right-left)*scale)/2,offsetY=y+7+(h-9-(bottom-top)*scale)/2;
        const place=p=>({x:offsetX+(p.x-left)*scale,y:offsetY+(p.y-top)*scale});
        projectInsets.set(code,(lat,lon)=>{
          if(code==='15'&&(lon<-161||lon>-154))return null;
          return place(insetPoint(lat,lon,originLat,originLon));
        });
        outlines.append(element('rect',{class:'city-inset-frame',x,y,width:w,height:h,rx:3}));
        const path=raw.map(ring=>ring.map((p,i)=>{const pt=place(p);return `${i?'L':'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;}).join('')+'Z').join('');
        outlines.append(element('path',{class:'city-map-land',d:path,'fill-rule':'evenodd'}));
        const text=element('text',{class:'city-inset-label',x:x+3,y:y+6});
        text.textContent=label;outlines.append(text);
        stateBounds.set(code,{x,y,width:w,height:h});
      }else{
        const path=element('path',{class:'city-map-land',d:state.getAttribute('d')});
        outlines.append(path);
        stateBounds.set(code,path.getBBox());
      }
    }

    let zoom=1,cx=bounds.x+bounds.w/2,cy=bounds.y+bounds.h/2;
    let width=800,height=460,view={},wheelTimer,moveStart;
    let dotSize='equal', drawn=[],focusedId=null;
    const pointers=new Map();
    function baseSize(){
      const scale=Math.min(width/bounds.w,height/bounds.h);
      return {w:width/scale,h:height/scale};
    }
    function redrawView(){
      const base=baseSize();
      const w=base.w/zoom,h=base.h/zoom;
      const clamp=(value,min,extent,span)=>span>=extent?min+extent/2:Math.max(min+span/2,Math.min(min+extent-span/2,value));
      cx=clamp(cx,bounds.x,bounds.w,w);cy=clamp(cy,bounds.y,bounds.h,h);
      const scaleChanged=view.w!==w;
      view={x:cx-w/2,y:cy-h/2,w,h};
      svg.setAttribute('viewBox',`${view.x} ${view.y} ${w} ${h}`);
      if(scaleChanged)resizeDots();
    }
    function settle(){clearTimeout(wheelTimer);wheelTimer=undefined;onViewChange();}
    function zoomAt(factor,x=.5,y=.5){
      const old=view;
      zoom=Math.max(1,Math.min(140,zoom*factor));
      const base=baseSize();
      cx=old.x+x*old.w+(.5-x)*base.w/zoom;
      cy=old.y+y*old.h+(.5-y)*base.h/zoom;
      redrawView();
    }
    function fit(x,y,w,h){
      const base=baseSize();
      cx=x+w/2;cy=y+h/2;
      zoom=Math.max(1,Math.min(140,base.w/(Math.max(w,.01)+Math.max(w*.22,10)),base.h/(Math.max(h,.01)+Math.max(h*.22,10))));
      redrawView();
    }
    function reset(){zoom=1;cx=bounds.x+bounds.w/2;cy=bounds.y+bounds.h/2;redrawView();}
    function dotRadius(population){
      if(dotSize==='equal')return 4;
      if(population>=1000000)return 10;
      if(population>=250000)return 8;
      if(population>=50000)return 6;
      return 4;
    }
    function resizeDots(){
      for(const {node,hit,row} of drawn){
        const r=dotRadius(row.city.population);
        node.setAttribute('r',r*view.w/width);
        hit.setAttribute('r',Math.max(9,r)*view.w/width);
      }
    }
    function highlight(id){
      for(const {group,row} of drawn){
        const active=row.city.id===id;
        group.classList.toggle('selected',active);
        group.setAttribute('aria-pressed',String(active));
      }
    }
    function plot(rows,selectedId,color,label){
      const hadFocus=markers.contains(document.activeElement);
      if(hadFocus)focusedId=document.activeElement.dataset.cityDot;
      if(!rows.some(row=>row.city.id===focusedId))focusedId=selectedId||rows[0]?.city.id;
      drawn=rows.filter(row=>row.city.mapPoint).map(row=>{
        const {id,mapPoint}=row.city;
        const group=element('g',{class:'city-map-dot','data-city-dot':id,role:'button',tabindex:id===focusedId?0:-1,'aria-label':label(row)});
        const node=element('circle',{class:'city-dot-visible',cx:mapPoint.x,cy:mapPoint.y,fill:row.score==null?'#9daec2':color(row.score)});
        const hit=element('circle',{class:'city-dot-hit',cx:mapPoint.x,cy:mapPoint.y});
        const title=element('title');title.textContent=label(row);
        group.append(title,hit,node);
        return {group,node,hit,row};
      });
      if(drawn.length&&!drawn.some(item=>item.group.getAttribute('tabindex')==='0'))drawn[0].group.setAttribute('tabindex','0');
      const ordered=[...drawn].reverse();
      const selected=ordered.findIndex(item=>item.row.city.id===selectedId);
      if(selected>=0)ordered.push(...ordered.splice(selected,1));
      markers.replaceChildren(...ordered.map(item=>item.group));
      resizeDots();highlight(selectedId);
      if(hadFocus)drawn.find(item=>item.row.city.id===focusedId)?.group.focus({preventScroll:true});
    }
    function localPointer(event){
      const rect=svg.getBoundingClientRect();
      return {x:event.clientX-rect.left,y:event.clientY-rect.top};
    }
    function gesture(){
      const [a,b]=pointers.values();
      return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)}:{...a,d:0};
    }
    svg.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      if(pointers.size===0)clearTimeout(wheelTimer);
      pointers.set(event.pointerId,localPointer(event));
      moveStart={...gesture(),moved:pointers.size>1||Boolean(moveStart?.moved),id:event.target.closest('[data-city-dot]')?.dataset.cityDot};
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove',event=>{
      if(!pointers.has(event.pointerId))return;
      pointers.set(event.pointerId,localPointer(event));
      const next=gesture(),dx=next.x-moveStart.x,dy=next.y-moveStart.y;
      if(!moveStart.moved&&Math.hypot(dx,dy)<4)return;
      if(moveStart.d&&next.d)zoomAt(next.d/moveStart.d,moveStart.x/width,moveStart.y/height);
      cx-=dx*view.w/width;cy-=dy*view.h/height;redrawView();
      moveStart={...next,moved:true};
    });
    function finishGesture(event){
      if(!pointers.delete(event.pointerId))return;
      if(pointers.size){moveStart={...gesture(),moved:true};return;}
      const was=moveStart;moveStart=null;
      if(event.type==='pointerup'&&!was.moved&&was.id)onSelect(was.id);
      if(was.moved||wheelTimer!==undefined)settle();
    }
    svg.addEventListener('pointerup',finishGesture);
    svg.addEventListener('pointercancel',finishGesture);
    svg.addEventListener('lostpointercapture',finishGesture);
    svg.addEventListener('wheel',event=>{
      if(pointers.size)return;
      event.preventDefault();
      const p=localPointer(event);
      zoomAt(event.deltaY<0?1.25:.8,p.x/width,p.y/height);
      clearTimeout(wheelTimer);wheelTimer=setTimeout(settle,140);
    },{passive:false});
    markers.addEventListener('keydown',event=>{
      const id=event.target.dataset.cityDot;
      if(!id)return;
      if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(id);return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      const index=drawn.findIndex(item=>item.row.city.id===id);
      const step=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
      const next=drawn[(index+step+drawn.length)%drawn.length].group;
      event.target.setAttribute('tabindex','-1');next.setAttribute('tabindex','0');next.focus();
    });
    const observer=new ResizeObserver(entries=>{
      const {width:w,height:h}=entries[0].contentRect;
      if(!w||!h)return;
      width=w;height=h;redrawView();resizeDots();settle();
    });
    width=svg.clientWidth||width;height=svg.clientHeight||height;
    redrawView();observer.observe(svg);
    return {
      project(city){
        if(!city.point)return null;
        const point=(projectInsets.get(city.state)||projectMainland)(...city.point);
        return point&&point.x>=bounds.x&&point.x<=bounds.x+bounds.w&&point.y>=bounds.y&&point.y<=bounds.y+bounds.h?point:null;
      },
      contains(point){return point&&point.x>=view.x&&point.x<=view.x+view.w&&point.y>=view.y&&point.y<=view.y+view.h;},
      fitPoints(points){
        if(!points.length)return;
        const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
        const x=Math.min(...xs),y=Math.min(...ys);
        fit(x,y,Math.max(...xs)-x,Math.max(...ys)-y);
      },
      fitState(code){const box=stateBounds.get(code);if(box)fit(box.x,box.y,box.width,box.height);else reset();},
      zoom(factor){zoomAt(factor);settle();},
      reset,plot,highlight,
      setSize(value){dotSize=value;resizeDots();}
    };
  };
})();
