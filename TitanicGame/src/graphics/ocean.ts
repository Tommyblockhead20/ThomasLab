import * as THREE from 'three';
import { SEA_LEVEL, SHIP_WIDTH_SCALE, SHIP_LENGTH_SCALE } from '../../shared/navigation';
import { HORIZON_LIGHT } from '../../shared/visibility';

// Dense vertices beside the hull; broad cells at the horizon.
export function oceanGeometry() {
  const geometry = new THREE.PlaneGeometry(2, 2, 192, 192);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i);
    position.setXYZ(i, Math.sign(x) * x * x * 1200, Math.sign(y) * y * y * 1200, 0);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

export function createOcean() {
  const uniforms = {
    time: { value: 0 },
    speed: { value: 1 },
    shipInverse: { value: new THREE.Matrix4() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float time;
      varying vec3 world;
      varying vec3 swellNormal;
      void swell(vec2 p, vec2 d, float k, float amplitude, float rate, inout float height, inout vec2 slope) {
        float phase = dot(p, d) * k - time * rate;
        height += sin(phase) * amplitude;
        slope += cos(phase) * amplitude * k * d;
      }
      void main() {
        vec3 p = position;
        vec2 sea = vec2(p.x, -p.y), slope = vec2(0.);
        float height = 0.;
        swell(sea, vec2(.94,.342), .235, .18, .62, height, slope);
        swell(sea, vec2(-.46,.888), .43, .11, .83, height, slope);
        swell(sea, vec2(.78,-.626), .79, .055, 1.12, height, slope);
        swell(sea, vec2(.18,.984), 1.61, .018, 1.55, height, slope);
        p.z = height;
        swellNormal = vec3(-slope.x, 1., -slope.y);
        vec4 point = modelMatrix * vec4(p, 1.);
        world = point.xyz;
        gl_Position = projectionMatrix * viewMatrix * point;
      }`,
    fragmentShader: `
      uniform float time;
      uniform float speed;
      uniform mat4 shipInverse;
      varying vec3 world;
      varying vec3 swellNormal;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      float foamNoise(vec2 p) { return noise(p)*.6 + noise(p*2.13+13.)*.27 + noise(p*4.71)*.13; }
      void main() {
        // The exterior sea cannot pass through the enclosed lower hull. Local
        // compartment surfaces provide flooding inside; upper decks can submerge.
        vec3 aboard = (shipInverse * vec4(world, 1.)).xyz;
        float taper=clamp((-aboard.y-19.)/4.4,0.,1.);
        float scaleX=mix(1.,.65,taper),scaleZ=mix(1.,.86,taper);
        float sampleZ=aboard.z/scaleZ;
        float width = 10.;
        if (sampleZ < -25.) {
          float t = 7. - sqrt(max(0., 74. + sampleZ));
          width = 10. - 4.*t - 6.*t*t;
        } else if (sampleZ > 31.) width = 8.*sqrt(max(0., (34.-sampleZ)/3.));
        else if (sampleZ > 24.) width = 10. - (sampleZ-24.)*2./7.;
        if (sampleZ > -38. && sampleZ < 34. && abs(aboard.x) < width*scaleX-.035 && aboard.y > -23.4 && aboard.y < -5.4) discard;
        vec2 p = world.xz;
        float distanceToEye = length(world-cameraPosition);
        float flow = time * (1. + speed * 2.1);
        vec2 drift = vec2(time*.07,-flow*.28);
        float detail = 1.-smoothstep(40.,320.,distanceToEye);
        vec2 ripple = vec2(noise(p*.75+drift)-noise(p*.75+drift+vec2(.15,0.)),noise(p*.75+drift)-noise(p*.75+drift+vec2(0.,.15)));
        vec3 normal = normalize(swellNormal + vec3(ripple.x,0.,ripple.y)*1.1*detail);
        vec3 view = normalize(cameraPosition-world);
        vec3 reflection = reflect(-view,normal);
        float fresnel = .025 + .975*pow(1.-max(0.,dot(view,normal)),5.);
        vec3 sky = mix(vec3(.082,.126,.155),vec3(.012,.027,.052),smoothstep(0.,.6,reflection.y));
        vec3 color = mix(vec3(.009,.029,.038),sky,fresnel);
        vec3 moon = normalize(vec3(-190.,170.,-550.));
        float moonDot = max(0.,dot(reflection,moon));
        color += (pow(moonDot,140.)*.32 + pow(moonDot,900.)*.65)*vec3(.62,.79,.91);
        vec2 hull = vec2(p.x/${SHIP_WIDTH_SCALE.toFixed(1)},p.y/${SHIP_LENGTH_SCALE.toFixed(1)});
        float beside = exp(-max(0.,abs(hull.x)-10.)*.19)*(1.-smoothstep(24.,35.,abs(hull.y)));
        float lamps = pow(.5+.5*sin(hull.y*2.03+normal.z*25.),9.);
        color += vec3(.21,.102,.029)*beside*lamps*(.2+fresnel*.8);
        float stern = smoothstep(27.,35.,hull.y)*(1.-smoothstep(100.,210.,hull.y));
        float wakeDistance = abs(hull.x)-(3.5+max(0.,hull.y-30.)*.17);
        float wake = exp(-wakeDistance*wakeDistance*.45)*stern;
        float sideDistance = abs(hull.x)-10.15;
        float sides = exp(-sideDistance*sideDistance*2.5)*smoothstep(-31.,-24.,hull.y)*(1.-smoothstep(25.,34.,hull.y));
        float churn = foamNoise(vec2(p.x*1.8,p.y*.9-flow*1.8));
        float foam = smoothstep(.36,.74,churn)*(wake*.65+sides*.7)*speed;
        color = mix(color,vec3(.26,.35,.37),clamp(foam,0.,.72));
        float fog = 1.-exp(-distanceToEye*.0018);
        gl_FragColor=vec4(mix(color,vec3(${HORIZON_LIGHT.join(',')}),fog),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(oceanGeometry(), material);
  mesh.name = 'north-atlantic';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = SEA_LEVEL;
  return { mesh, uniforms };
}

export function createNightSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1250, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 direction; void main(){float height=normalize(direction).y;vec3 color=mix(vec3(${HORIZON_LIGHT.join(',')}),vec3(.004,.012,.027),smoothstep(0.,.65,height));gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    }),
  );
}
