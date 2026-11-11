import * as pc from 'playcanvas';

export function shorelineSegments(vertices,triangles,height) {
  const segments=[];
  for(const tri of triangles??[]) {
    const points=[];
    for(let i=0;i<3;i++) {
      const a=vertices[tri[i]],b=vertices[tri[(i+1)%3]];
      if((a[1]<height)===(b[1]<height)||Math.abs(a[1]-b[1])<1e-8)continue;
      const t=(height-a[1])/(b[1]-a[1]);points.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);
    }
    if(points.length===2&&Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1])>.02)segments.push(points);
  }
  return segments;
}
export class ShoreWaves {
  constructor(world,height) {
    this.world=world;this.time=0;this.elapsed=0;this.bands=[];
    const surface=world.oceanFloorSurface;
    const segments=shorelineSegments(surface?.vertices??[],surface?.triangles??[],height-.06).slice(0,180);
    for(let band=0;band<2;band++) {
      const entity=new pc.Entity('Beach foam wash',world.app),material=new pc.StandardMaterial();
      material.diffuse.set(.76,.9,.85);material.emissive.set(.05,.07,.065);material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.opacity=0;material.update();
      const mesh=new pc.Mesh(world.app.graphicsDevice),indices=[],positions=[];
      for(let i=0;i<segments.length;i++){const a=i*4;indices.push(a,a+1,a+2,a+2,a+1,a+3);positions.push(...Array(12).fill(0));}
      mesh.setPositions(positions);mesh.setIndices(indices);mesh.update();
      entity.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,material,entity)],castShadows:false,receiveShadows:false});
      entity.setPosition(world.ocean.getPosition().x,height-.045,world.ocean.getPosition().z);entity._transientWorldEffect=true;world.root.addChild(entity);
      entity.once('destroy',()=>{mesh.destroy();material.destroy();});this.bands.push({entity,mesh,material,positions,segments,phase:band*.5});
    }
  }
  update(dt) {
    const visible=this.world.activeLocationId==='main-mountain';for(const b of this.bands)b.entity.enabled=visible;
    if(!visible)return;this.time+=dt;this.elapsed+=dt;if(this.elapsed<1/24)return;this.elapsed=0;
    for(const b of this.bands) {
      const t=(this.time/7+b.phase)%1,advance=1.1-t*1.45,width=.12+Math.sin(t*Math.PI)*.3;
      b.material.opacity=Math.sin(t*Math.PI)**2*.2;b.material.update();let at=0;
      for(const segment of b.segments)for(const offset of [advance,advance+width])for(const [x,z]of segment) {
        const r=Math.hypot(x,z)||1;b.positions[at++]=x+x/r*offset;b.positions[at++]=0;b.positions[at++]=z+z/r*offset;
      }
      b.mesh.setPositions(b.positions);b.mesh.update();
    }
  }
}
