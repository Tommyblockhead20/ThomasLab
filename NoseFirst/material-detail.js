// Shared, tiny textures keep the illustrated world tactile without asset downloads.
const tiles = new Map();
export function addNoseMaterialDetail(material, THREE, kind, repeat = 1) {
  const key = `${kind}:${repeat}`;
  let texture = tiles.get(key);
  if (!texture) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(128,128);
    for (let y=0;y<128;y++) for(let x=0;x<128;x++) {
      const u=x/128,v=y/128,hash=Math.sin(x*127.1+y*311.7)*43758.5453,n=hash-Math.floor(hash)-.5;
      const broad=Math.sin(u*Math.PI*6+Math.sin(v*Math.PI*2))*Math.cos(v*Math.PI*4);
      let value=.97;
      if(kind==='wood') value=.975+Math.sin((u*23+Math.sin(v*Math.PI*2)*.1)*Math.PI*2)*.018+n*.025;
      else if(kind==='fabric')value=.96+(Math.cos(x*Math.PI/2)+Math.cos(y*Math.PI/2))*.015+n*.02;
      else if(kind==='grass')value=.94+broad*.045+n*.07;
      else if(kind==='stone')value=.95+broad*.035+n*.055;
      else if(kind==='road')value=.96+n*.07;
      else value=.98+n*.025;
      const i=(y*128+x)*4,c=Math.round(Math.min(1,Math.max(.78,value))*255);image.data.set([c,c,c,255],i);
    }
    ctx.putImageData(image,0,0);texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeat,repeat);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;tiles.set(key,texture);
  }
  material.map=texture;
  // Color tiles are deliberately subtle. Relief is restrained to avoid noisy, wet-looking surfaces.
  material.bumpMap=texture; material.bumpScale=kind==='grass'?.025:kind==='wood'?.012:.006;material.needsUpdate=true;
  return material;
}

let contactTexture;
export function createContactShadow(THREE, parent, size = 1) {
  if (!contactTexture) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,3,32,32,31);
    gradient.addColorStop(0,'rgba(25,35,23,.25)');gradient.addColorStop(.4,'rgba(25,35,23,.15)');gradient.addColorStop(1,'rgba(25,35,23,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);contactTexture=new THREE.CanvasTexture(canvas);
  }
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(size,size*.7),new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false}));
  plane.rotation.x=-Math.PI/2;plane.userData.contactShadow=true;parent.add(plane);return plane;
}
