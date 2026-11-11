const ns='http://www.w3.org/2000/svg';
const svgNode=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
export function islandChartArt(location) {
  const svg=svgNode('svg',{viewBox:'0 0 100 74','aria-hidden':'true'});
  const add=(tag,attrs)=>{const n=svgNode(tag,attrs);svg.append(n);return n;};
  if(location.type==='open-water-boat') {
    add('ellipse',{cx:50,cy:61,rx:37,ry:7,fill:'#b7e4db',opacity:.65});
    add('path',{d:'M20 49 L83 49 L69 64 L33 64 Z',fill:'#8d5134',stroke:'#523c2e','stroke-width':2});
    add('path',{d:'M51 10 L51 49 M47 15 L23 43 L47 43 Z',fill:'#f6e9bf',stroke:'#5d624f','stroke-width':2});
    add('path',{d:'M55 18 L77 43 L55 43 Z',fill:'#e6ac59'});return svg;
  }
  const points=location.outline?.length?location.outline.map(p=>`${50+p.x*34},${39+p.z*20}`).join(' '):'13,48 30,19 62,15 88,40 72,59 34,63';
  add('polygon',{points,transform:'translate(0 4) scale(1.04 1.04)',fill:'#b5ddd0',opacity:.7});
  add('polygon',{points,fill:'#d8c595',stroke:'#5d8170','stroke-width':1});
  add('polygon',{points,transform:'translate(7 5) scale(.86 .83)',fill:location.id==='cold-island'?'#d7e7dc':location.id==='cave-fishing-island'?'#8d9b87':'#84a574'});
  const tree=(x,y)=>{add('path',{d:`M${x} ${y+12}v-11`,stroke:'#776343','stroke-width':2});add('path',{d:`M${x} ${y-9}l-8 15h16z`,fill:'#476e56'});};
  const house=(x,y,color='#c98f56')=>{add('rect',{x:x-9,y,width:18,height:12,fill:'#eee0af'});add('path',{d:`M${x-13} ${y}l13 -12l13 12z`,fill:color});add('rect',{x:x-2,y:y+4,width:4,height:8,fill:'#516859'});};
  if(location.type==='main-island'){add('path',{d:'M23 54L44 14L56 35L66 23L83 55Z',fill:'#526d63'});add('path',{d:'M35 31L44 14L53 31L44 27Z',fill:'#f3f0d2'});tree(25,43);}
  else if(location.id==='home-island'){house(52,35);tree(28,35);tree(73,37);}
  else if(location.id==='shop-island'){house(45,35,'#9c6947');add('path',{d:'M32 40h26v4H32Z',fill:'#d3ad55'});tree(73,30);}
  else if(location.id==='aquarium-island'){house(50,34,'#668e84');add('rect',{x:37,y:36,width:27,height:9,rx:3,fill:'#6fb3b8',stroke:'#d5e1bc','stroke-width':2});}
  else if(location.id==='jester-island'){house(50,37,'#c59453');add('path',{d:'M53 16v14l14-7z',fill:'#e8bf5c',stroke:'#725e41'});tree(28,36);}
  else if(location.id==='cold-island'){add('path',{d:'M23 49L43 18L54 36L64 22L82 51Z',fill:'#9dbdb9'});add('path',{d:'M35 31L43 18L51 31Z',fill:'#f2f1dc'});}
  else if(location.id==='cave-fishing-island'){add('path',{d:'M23 49L35 25L67 24L80 50Z',fill:'#6b7e73'});add('path',{d:'M43 51V40Q50 27 57 40V51Z',fill:'#284b4b'});}
  else if(location.id==='veiled-athenaeum'){house(50,37,'#65736b');add('path',{d:'M30 51h42M34 36v15M43 36v15M57 36v15M66 36v15',stroke:'#e2d4a8','stroke-width':3});}
  else if(location.id==='skyreach-foundation'){add('path',{d:'M41 53V27H46V17H49V6H52V17H56V27H62V53Z',fill:'#7b8b80',stroke:'#4b6b64'});}
  else{tree(34,32);tree(53,26);tree(69,37);}
  return svg;
}
