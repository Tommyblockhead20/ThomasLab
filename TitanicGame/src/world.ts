import { buildInquiryRoom } from './graphics/inquiry';
import { BOAT_DECK_FRONT } from '../shared/layout';
import { BRIDGE } from '../shared/layout';
import { buildBridgeDetails } from './graphics/bridge';
import { firebed } from '../shared/firing';
import {
  boilerAction,
  boilerHint,
  heldFiringTool,
  visibleClinker,
  type BoilerControl,
} from '../shared/boiler-controls';
import { buildFiringTool } from './graphics/firing-tool';
import { buildTelegraph, buildTelephone } from './graphics/bridge';
import { metric } from './graphics/building';
import { buildOfficerDetails, buildBoilerRoom, buildMachineryWalls } from './graphics/interiors';
import { steamPsi } from '../shared/plant';
import { reconcileCrew } from '../shared/crew-camera';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createShipMaterials, softParticleTexture, gaugeFace } from './graphics/materials';
import { buildCabinWall, buildRailing, hullBand } from './graphics/architecture';
import { createNightSky, createOcean } from './graphics/ocean';
import { buildEngineRoom, buildFunnel } from './graphics/machinery';
import {
  buildTallShell,
  buildPassengerDeck,
  buildForemast,
  buildCompanionways,
  buildBoatStations,
  buildMachineryCeiling,
  buildDeckhouseRoofs,
  buildSternGear,
} from './graphics/liner';
import { CrashEffects, createIceberg, setCrewCamera, createHullScar } from './graphics/encounter';
import {
  HULL_OUTLINE,
  SEA_SCALE,
  SHIP_SCALE,
  SHIP_WIDTH_SCALE,
  SHIP_LENGTH_SCALE,
  SHIP_HEIGHT_SCALE,
  SEA_LEVEL,
  shipPose,
  iceRelative,
} from '../shared/navigation';
import type { Position, Snapshot, Station } from '../shared/types';
import { BALANCE } from '../shared/config';
import {
  canOccupy,
  distance,
  FUNNEL_POSITIONS,
  LEVEL_Y,
  moveWithCollision,
  STATIONS,
  WALLS,
  travelPoint,
  wallsBetween,
} from '../shared/world';
import { network } from './network';
import { shipAudio } from './audio';
import { SinkingSections } from './graphics/sinking';
import { chooseLaunchView } from './graphics/launch-view';
import { sinkingPose } from '../shared/sinking';
import { fogDensity, HORIZON_LIGHT } from '../shared/visibility';

const C = {
  wood: 0x6c4a30,
  woodDark: 0x32281f,
  brass: 0xb59353,
  ivory: 0xe1d7ba,
  steel: 0x26353a,
  black: 0x0c161c,
};
const mat = (color: number, metalness = 0, roughness = 0.7) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const materials = createShipMaterials();
const v = new THREE.Vector3();
function box(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  m: THREE.Material,
  r2 = r,
  segments = 16,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, segments), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function label(text: string, width = 512, height = 128, color = '#dfc79d', bg = '#162027') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = bg;
  c.fillRect(0, 0, width, height);
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.strokeRect(9, 9, width - 18, height - 18);
  c.fillStyle = color;
  c.font = `600 ${Math.min(48, width / (text.length * 0.62))}px Georgia`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture });
}
function sign(parent: THREE.Object3D, text: string, x: number, y: number, z: number, w = 3) {
  return box(parent, x, y, z, w, 0.64, 0.035, label(text));
}
function lamp(parent: THREE.Object3D, x: number, y: number, z: number, power = 9) {
  cylinder(parent, x, y + 0.2, z, 0.035, 0.18, materials.brass);
  cylinder(parent, x, y + 0.12, z, 0.16, 0.055, materials.brass, 0.12);
  cylinder(parent, x, y - 0.15, z, 0.14, 0.045, materials.brass);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 8), materials.glow);
  bulb.position.set(x, y - 0.015, z);
  bulb.scale.y = 1.3;
  parent.add(bulb);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    cylinder(
      parent,
      x + Math.cos(angle) * 0.115,
      y,
      z + Math.sin(angle) * 0.115,
      0.012,
      0.28,
      materials.brass,
      undefined,
      5,
    );
  }
  const light = new THREE.PointLight(0xffddb0, power * 0.7, 11, 2);
  light.position.set(x, y, z);
  parent.add(light);
  return bulb;
}
function rail(parent: THREE.Object3D, x1: number, z1: number, x2: number, z2: number, y = 0) {
  buildRailing(parent, x1, z1, x2, z2, y, materials.ivory);
}
function wheel(parent: THREE.Object3D, x: number, y: number, z: number) {
  const group = new THREE.Group();
  const anchor = metric(parent, x, y, z);
  anchor.add(group);
  cylinder(group, 0, 0.6, 0.13, 0.12, 1.2, materials.brass);
  box(group, 0, 0.08, 0, 0.7, 0.15, 0.5, materials.darkWood);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.052, 8, 40), materials.wood);
  rim.position.y = 1.42;
  group.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      spoke = box(
        group,
        Math.sin(a) * 0.37,
        1.42 + Math.cos(a) * 0.37,
        0,
        0.042,
        0.88,
        0.045,
        materials.brass,
      );
    spoke.rotation.z = -a;
  }
  const hub = cylinder(group, 0, 1.42, 0, 0.12, 0.15, materials.brass);
  hub.rotation.x = Math.PI / 2;
  return rim;
}

export class OceanWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.12, 2500);
  composer: EffectComposer;
  environment: THREE.WebGLRenderTarget;
  smoke: THREE.Points;
  ship = new THREE.Group();
  boat = new THREE.Group();
  launchView = { x: 210, z: 170 };
  launchChosen = false;
  clock = new THREE.Clock();
  frame = 0;
  raf = 0;
  lastInput = 0;
  seq = 0;
  state: Snapshot | null = null;
  yaw = 0;
  pitch = 0;
  zoom = false;
  locked = false;
  fallbackLook = false;
  overlay = false;
  keys = new Set<string>();
  local: Position = { x: 0, z: -18, level: 0 };
  avatars = new Map<string, THREE.Group>();
  bergs = new Map<string, THREE.Mesh>();
  crash: CrashEffects;
  sections: SinkingSections;
  onPause: () => void = () => {};
  pauseTimer: ReturnType<typeof setTimeout> | null = null;
  pauseSuppressedUntil = 0;
  receivedAt = 0;
  lastImpact = 0;
  impactAt = -100;
  floodWater: THREE.Mesh[] = [];
  inquiryRoom = new THREE.Group();
  emergency = new THREE.PointLight(0xff3b19, 0, 32);
  damage = new THREE.Group();
  pistons: THREE.Object3D[] = [];
  flywheels: THREE.Object3D[] = [];
  needles: THREE.Object3D[] = [];
  exhausts: THREE.Vector3[] = [];
  fires: THREE.Mesh[] = [];
  furnaceLights: THREE.PointLight[] = [];
  furnaceDoors: THREE.Object3D[] = [];
  dampers: THREE.Object3D[] = [];
  boilerGauges: THREE.Object3D[] = [];
  boilerParts: ReturnType<typeof buildBoilerRoom> | null = null;
  boilerTarget: BoilerControl | null = null;
  boilerRay = new THREE.Raycaster();
  boilerPrompt = '';
  onBoilerPrompt: (hint: string) => void = () => {};
  onBoilerGuide: () => void = () => {};
  toolModels = new THREE.Group();
  toolStrokeAt = -10;
  engineCycle = 0;
  mainValveWheel: THREE.Object3D | null = null;
  mainGaugeNeedle: THREE.Object3D | null = null;
  water: THREE.Mesh;
  wheelRim: THREE.Mesh;
  nearest: Station | null = null;
  onNearest: (s: Station | null) => void = () => {};
  onLock: (v: boolean) => void = () => {};
  onInteract: (s: Station) => void = () => {};
  onNotebook: () => void = () => {};
  error: string | null = null;
  quality = 'high';
  lastPhase = '';
  lastRelocation = -1;
  oceanUniforms: ReturnType<typeof createOcean>['uniforms'];
  telegraphPointer: THREE.Object3D | null = null;
  updateBridgeOrder: (heading: number, ack: string | null) => void = () => {};
  onPractice: () => void = () => {};
  onDemoRetry: () => void = () => {};
  onCancel: () => void = () => {};
  travelStart = { x: 0, y: 0, z: 0 };
  travelKey = '';
  travelCameraYaw = 0;
  travelCameraPitch = 0;
  travelLookYaw = 0;
  travelLookPitch = 0;
  cleanup: (() => void)[] = [];
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      reversedDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(this.renderer.domElement);
    this.scene.background = new THREE.Color(...HORIZON_LIGHT);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...HORIZON_LIGHT), fogDensity());
    this.scene.add(createNightSky());
    this.scene.add(new THREE.HemisphereLight(0x9db9d2, 0x162026, 0.78));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const studio = new RoomEnvironment();
    this.environment = pmrem.fromScene(studio, 0.025);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.28;
    studio.dispose();
    pmrem.dispose();
    for (const material of Object.values(materials)) {
      if (material.map)
        material.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    }
    const moon = new THREE.DirectionalLight(0xa6cbe8, 2.15);
    moon.position.set(-100, 100, -130);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, {
      left: -45,
      right: 45,
      top: 45,
      bottom: -45,
      near: 10,
      far: 300,
    });
    moon.shadow.bias = -0.00008;
    moon.shadow.normalBias = 0.045;
    moon.shadow.radius = 2;
    this.scene.add(moon);
    const moonSphere = new THREE.Mesh(
      new THREE.SphereGeometry(7, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xcadce8 }),
    );
    moonSphere.position.set(-190, 170, -550);
    this.scene.add(moonSphere);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softParticleTexture('#afcce1'),
        color: 0xb4ccdd,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.copy(moonSphere.position);
    halo.scale.set(55, 55, 1);
    this.scene.add(halo);
    const stars = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i++) {
      const a = i * 2.39996,
        r = 600 + Math.sin(i * 53.7) * 120;
      stars[i * 3] = Math.cos(a) * r;
      stars[i * 3 + 1] = 90 + ((i * 73) % 400);
      stars[i * 3 + 2] = Math.sin(a) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0xc1d5e0,
          size: 0.9,
          transparent: true,
          opacity: 0.7,
          sizeAttenuation: true,
        }),
      ),
    );
    const ocean = createOcean();
    this.water = ocean.mesh;
    this.oceanUniforms = ocean.uniforms;
    this.scene.add(this.water);
    this.scene.add(this.ship);
    this.scene.add(this.camera);
    this.camera.add(this.toolModels);
    for (const tool of ['coal', 'slice', 'rake'] as const) {
      const model = buildFiringTool(tool, materials);
      model.name = tool;
      this.toolModels.add(model);
    }
    this.ship.scale.set(SHIP_WIDTH_SCALE, SHIP_HEIGHT_SCALE, SHIP_LENGTH_SCALE);
    this.buildShip();
    this.ship.traverse((o) => {
      if (o instanceof THREE.PointLight || o instanceof THREE.SpotLight) {
        o.distance *= SHIP_SCALE;
        o.intensity *= SHIP_SCALE * SHIP_SCALE;
      }
    });
    this.emergency.name = 'emergency';
    this.emergency.position.set(0, LEVEL_Y[-1] + 3, 16);
    this.ship.add(this.emergency);
    this.crash = new CrashEffects(this.scene);
    this.ship.add(this.damage);
    this.wheelRim = wheel(this.ship, BRIDGE.wheel.x, 0, BRIDGE.wheel.z);
    this.buildLifeboat();
    this.inquiryRoom = buildInquiryRoom(materials);
    this.inquiryRoom.visible = false;
    this.scene.add(this.inquiryRoom);
    this.boat.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === materials.glow)
        o.material = materials.glow.clone();
    });
    this.scene.add(this.boat);
    this.boat.visible = false;
    this.smoke = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array((3 * 28 + 7) * 3), 3),
      ),
      new THREE.PointsMaterial({
        map: softParticleTexture('#a7b6bd'),
        color: 0x77919f,
        opacity: 0.16,
        transparent: true,
        depthWrite: false,
        size: 2.8,
        sizeAttenuation: true,
      }),
    );
    this.smoke.frustumCulled = false;
    this.ship.add(this.smoke);
    this.sections = new SinkingSections(this.ship, this.scene, materials);
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 1.05),
    );
    this.composer.addPass(new OutputPass());
    this.bind();
    this.resize();
    this.loop();
  }
  buildShip() {
    const s = this.ship;
    // A procedural hull with a tapered bow and stern, built from original shapes.
    const outline = new THREE.Shape();
    outline.moveTo(HULL_OUTLINE[0].x, HULL_OUTLINE[0].z);
    for (const point of HULL_OUTLINE.slice(1)) outline.lineTo(point.x, point.z);
    // Separate, adjoining hull bands eliminate the old overlapping shell trim.
    for (const [top, bottom, material] of [
      [-5.4, -5.46, materials.brass],
      [-5.46, -16, materials.black],
      [-16, -19, materials.red],
      [-19, -23.4, materials.red],
    ] as const) {
      const hull = new THREE.Mesh(
        hullBand(outline, top, bottom, bottom === -23.4 ? { x: 0.65, z: 0.86 } : { x: 1, z: 1 }),
        material,
      );
      hull.name = 'hull-band';
      hull.castShadow = true;
      hull.receiveShadow = true;
      s.add(hull);
    }
    buildTallShell(s, materials);
    buildPassengerDeck(s, materials);
    buildForemast(s, materials);
    buildCompanionways(s, materials);
    buildBoatStations(s, materials);
    buildSternGear(s, materials);
    const lower = new THREE.Group();
    lower.position.y = LEVEL_Y[-1] + 6;
    lower.scale.z = -1;
    s.add(lower);
    box(lower, 0, -6.12, -7.6, 18.2, 0.2, 43.8, materials.floor);
    buildMachineryCeiling(s, materials);
    for (let i = 0; i < 6; i++) {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(17.7, 9.65),
        new THREE.MeshStandardMaterial({
          color: 0x17343b,
          metalness: 0.6,
          roughness: 0.16,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
        }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, LEVEL_Y[-1], -24 + i * 10);
      water.visible = false;
      s.add(water);
      this.floodWater.push(water);
    }
    // Plank joints are mipmapped texture detail, not dozens of thin coplanar strips.
    for (const x of [-10, 10]) {
      rail(s, x, -20.7, x, 24.3);
    }
    rail(s, -9.8, BOAT_DECK_FRONT, -6.75, BOAT_DECK_FRONT);
    rail(s, 6.75, BOAT_DECK_FRONT, 7.7 - 0.65 / SHIP_WIDTH_SCALE, BOAT_DECK_FRONT);
    rail(s, 7.7 + 0.65 / SHIP_WIDTH_SCALE, BOAT_DECK_FRONT, 9.8, BOAT_DECK_FRONT);
    rail(s, -9.8, 24.3, 3.6, 24.3);
    rail(s, 5.5, 24.3, 9.8, 24.3);
    for (let i = 1; i < HULL_OUTLINE.length; i++) {
      const a = HULL_OUTLINE[i - 1],
        b = HULL_OUTLINE[i];
      for (const [boundary, fore] of [
        [-21.05, true],
        [24.5, false],
      ] as const) {
        const inside = (p: { z: number }) => (fore ? p.z <= boundary : p.z >= boundary);
        if (!inside(a) && !inside(b)) continue;
        let start = { ...a },
          end = { ...b };
        if (inside(a) !== inside(b)) {
          const t = (boundary - a.z) / (b.z - a.z),
            cut = { x: a.x + (b.x - a.x) * t, z: boundary };
          if (inside(a)) end = cut;
          else start = cut;
        }
        rail(s, start.x, start.z, end.x, end.z, LEVEL_Y[2]);
      }
    }
    for (const w of WALLS) {
      if (w.prop || w.level !== 0) continue;
      s.add(buildCabinWall(w, LEVEL_Y[w.level], materials));
    }
    buildDeckhouseRoofs(s, materials);
    buildOfficerDetails(s, materials);
    buildMachineryWalls(s, materials);
    const chartRoom = new THREE.Group();
    chartRoom.position.set(BRIDGE.chart.x + 5, 0, BRIDGE.chart.z + 22);
    s.add(chartRoom);
    // Navigation table with a real chart-like texture.
    box(chartRoom, -5, 0.45, -22, 2.6, 0.9, 0.65, materials.darkWood);
    box(chartRoom, -5, 0.94, -22, 2.7, 0.08, 0.7, materials.brass);
    const chart = document.createElement('canvas');
    chart.width = 768;
    chart.height = 512;
    const c = chart.getContext('2d')!;
    c.fillStyle = '#c3b48c';
    c.fillRect(0, 0, 768, 512);
    c.strokeStyle = '#817a59';
    c.lineWidth = 1;
    for (let i = 0; i < 768; i += 64) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 512);
      c.stroke();
    }
    for (let i = 0; i < 512; i += 64) {
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(768, i);
      c.stroke();
    }
    c.setLineDash([12, 8]);
    c.strokeStyle = '#8d4d36';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(40, 300);
    c.lineTo(700, 230);
    c.stroke();
    c.fillStyle = '#514e3b';
    c.font = '28px Georgia';
    c.fillText('NORTH ATLANTIC OCEAN', 175, 90);
    c.font = '18px Georgia';
    c.fillText('WESTBOUND · APRIL 1912', 225, 125);
    const tex = new THREE.CanvasTexture(chart);
    tex.colorSpace = THREE.SRGBColorSpace;
    const chartMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.63),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }),
    );
    chartMesh.rotation.set(-Math.PI / 2, 0, 0.05);
    chartMesh.position.set(-5, 0.99, -22);
    chartRoom.add(chartMesh);
    for (const x of [-6, -4]) cylinder(chartRoom, x, 0.55, -22, 0.065, 1.1, materials.brass);
    this.updateBridgeOrder = buildBridgeDetails(s, materials);
    this.telegraphPointer = buildTelegraph(s, materials).pointer;
    for (const z of FUNNEL_POSITIONS) {
      const funnel = buildFunnel(z, materials);
      s.add(funnel.group);
      this.exhausts.push(funnel.exhaust);
    }
    // Below decks: engines, moving pistons, pipes, and fire-lit boilers.
    const engines = buildEngineRoom(materials, [
      gaugeFace('ORDER', BALANCE.maxKnots),
      gaugeFace('KNOTS', BALANCE.maxKnots),
      gaugeFace('STEAM', 300),
    ]);
    lower.add(engines.group);
    this.pistons = engines.pistons;
    this.flywheels = engines.flywheels;
    this.needles = engines.needles;
    const consoleLabel = sign(
      lower,
      'ENGINE ORDERS',
      0,
      -4.95,
      -16 + 0.37 / SHIP_LENGTH_SCALE,
      0.85,
    );
    consoleLabel.scale.y = 0.28;
    const boilers = buildBoilerRoom(s, materials);
    this.boilerParts = boilers;
    this.fires = boilers.fires;
    this.furnaceLights = boilers.lights;
    this.furnaceDoors = boilers.doors;
    this.dampers = boilers.dampers;
    this.boilerGauges = boilers.gauges;
    for (const station of STATIONS.filter((s) => s.kind === 'phone' && s.level !== 1))
      buildTelephone(s, station, materials);
    for (const station of STATIONS.filter((s) => s.kind === 'machine')) {
      const y = LEVEL_Y[station.level];
      box(s, station.x, y + 1, station.z, 0.8, 1.8, 0.55, materials.steel);
      if (station.machine === 'gauge') {
        const p = metric(s, station.x, y, station.z);
        const housing = cylinder(p, 0, 1.65, 0.38, 0.32, 0.08, materials.brass);
        housing.rotation.x = Math.PI / 2;
        const face = new THREE.Mesh(
          new THREE.CircleGeometry(0.3, 40),
          gaugeFace('HEADER PSI', 300),
        );
        face.position.set(0, 1.65, 0.425);
        p.add(face);
        const needle = new THREE.Group();
        needle.position.set(0, 1.65, 0.44);
        box(needle, 0, 0.11, 0, 0.018, 0.24, 0.02, materials.black);
        p.add(needle);
        this.mainGaugeNeedle = needle;
      } else {
        const p = metric(s, station.x, y, station.z);
        const valve = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 24), materials.brass);
        valve.position.set(0, 1.65, 0.4);
        p.add(valve);
        for (const a of [0, Math.PI / 2]) {
          const spoke = box(valve, 0, 0, 0, 0.58, 0.028, 0.028, materials.brass);
          spoke.rotation.z = a;
        }
        if (station.machine === 'valve') this.mainValveWheel = valve;
      }
      sign(s, station.machine!.toUpperCase(), station.x, y + 0.8, station.z + 0.34, 0.7);
    }
    for (const [x, z] of [
      [-7, -19],
      [7, -19],
      [-6.2, -7],
      [6.2, -7],
      [-6.2, 15],
      [6.2, 15],
    ])
      lamp(s, x, 2.7, z, 10);
    for (const x of [-5, 5]) {
      lamp(lower, x, -2.95, -17, 20);
      const taskLight = new THREE.SpotLight(0xffd29a, 80, 16, 0.8, 0.7, 2);
      taskLight.position.set(x, -1.2, -16.5);
      taskLight.target.position.set(x, -5.6, -17);
      lower.add(taskLight, taskLight.target);
    }
    const bridgeLight = new THREE.SpotLight(0xffdfb6, 23, 15, 0.9, 0.8, 2);
    bridgeLight.position.set(0, 3, -18);
    bridgeLight.target.position.set(0, 0, -19.2);
    bridgeLight.castShadow = true;
    bridgeLight.shadow.mapSize.set(1024, 1024);
    bridgeLight.shadow.bias = -0.0001;
    bridgeLight.shadow.normalBias = 0.025;
    s.add(bridgeLight, bridgeLight.target);
  }

  buildLifeboat() {
    box(this.boat, 0, 0, 0, 5, 0.25, 9, materials.wood);
    for (const x of [-2.6, 2.6]) box(this.boat, x, 0.6, 0, 0.2, 1.4, 9, materials.ivory);
    for (const z of [-4.5, 4.5]) box(this.boat, 0, 0.6, z, 5.4, 1.4, 0.2, materials.ivory);
    for (const z of [-3, -1, 1, 3]) box(this.boat, 0, 0.5, z, 5, 0.2, 0.55, materials.darkWood);
    lamp(this.boat, 0, 1.5, 0, 12);
    this.boat.position.set(0, -1.5, 0);
  }
  avatar(color: string) {
    const g = new THREE.Group(),
      coat = mat(new THREE.Color(color).getHex()),
      skin = mat(0xc49c7c);
    box(g, 0, 0.92, 0, 0.48, 0.72, 0.28, coat);
    cylinder(g, 0, 1.6, 0, 0.19, 0.38, skin, undefined, 10);
    cylinder(g, 0, 1.82, 0, 0.25, 0.1, materials.black);
    for (const x of [-0.15, 0.15]) {
      box(g, x, 0.35, 0, 0.18, 0.65, 0.2, materials.black);
      box(g, x, 0.07, -0.08, 0.21, 0.13, 0.4, materials.black);
    }
    for (const x of [-0.33, 0.33]) box(g, x, 0.91, 0, 0.17, 0.67, 0.22, coat);
    box(g, 0, 1.2, -0.15, 0.08, 0.25, 0.03, materials.ivory);
    return g;
  }
  update(state: Snapshot) {
    this.state = state;
    this.updateBridgeOrder(state.command.heading, state.command.acknowledgedBy);
    if (this.telegraphPointer)
      this.telegraphPointer.rotation.z = Math.PI / 2 - (state.ship.order / 25) * Math.PI;
    this.receivedAt = this.clock.elapsedTime;
    const me = state.players.find((p) => p.id === state.self.id);
    if (!me) return;
    if (!me.evacuated) this.launchChosen = false;
    else if (!this.launchChosen) {
      this.launchView = chooseLaunchView(
        state.icebergs.map((ice) => ({
          ...iceRelative(ice, state.ship),
          radius: ice.radius,
        })),
      );
      this.launchChosen = true;
    }
    if (this.lastRelocation !== state.self.relocation) {
      this.lastRelocation = state.self.relocation;
      this.local = { x: me.x, z: me.z, level: me.level };
      this.yaw = me.yaw;
      this.pitch = 0;
    }
    if (this.lastPhase !== state.phase) {
      this.keys.clear();
      if (state.phase === 'voyage') {
        this.lastImpact = 0;
        this.impactAt = -100;
        this.crash.reset();
        this.damage.clear();
        this.local = { x: me.x, z: me.z, level: me.level };
        this.yaw = me.yaw;
        this.pitch = 0;
      }
      this.lastPhase = state.phase;
    }
    this.local = reconcileCrew(this.local, me);
    const ids = new Set(state.players.map((p) => p.id));
    for (const [id, g] of this.avatars)
      if (!ids.has(id)) {
        g.removeFromParent();
        this.avatars.delete(id);
      }
    for (const p of state.players) {
      if (p.id === state.self.id) continue;
      let g = this.avatars.get(p.id);
      if (!g) {
        g = this.avatar(p.color);
        g.scale.set(1 / SHIP_WIDTH_SCALE, 1 / SHIP_HEIGHT_SCALE, 1 / SHIP_LENGTH_SCALE);
        this.avatars.set(p.id, g);
        this.ship.add(g);
      }
      g.visible = p.connected;
      g.userData.target = new THREE.Vector3(p.x, LEVEL_Y[p.level], p.z);
      g.rotation.y = -p.yaw;
    }
    const iceIds = new Set(state.icebergs.map((i) => i.id));
    for (const [id, g] of this.bergs)
      if (!iceIds.has(id)) {
        this.scene.remove(g);
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        this.bergs.delete(id);
      }
    for (const ice of state.icebergs) {
      let g = this.bergs.get(ice.id);
      if (!g) {
        g = createIceberg(ice, materials.ice);
        this.scene.add(g);
        this.bergs.set(ice.id, g);
      }
      const dw = ice.west - state.ship.west,
        dn = ice.north - state.ship.north,
        a = ((state.ship.heading - 270) * Math.PI) / 180;
      g.position.x = (-dw * Math.sin(a) + dn * Math.cos(a)) * SEA_SCALE;
      g.position.z = -(dw * Math.cos(a) + dn * Math.sin(a)) * SEA_SCALE;
    }
    this.wheelRim.rotation.z = -state.ship.rudderTarget * 2;
    for (const fire of this.fires) {
      const b = firebed(state.ship, fire.userData.bank, fire.userData.zone),
        heat = state.ship.fireHeat[fire.userData.bank];
      (fire.material as THREE.MeshStandardMaterial).emissiveIntensity =
        heat * (b.coal < 0.25 ? 0.6 : 1) * (1 - b.clinker * 0.5) * 2.5;
    }
    for (const door of this.furnaceDoors)
      door.rotation.y =
        door.userData.sign *
        (state.ship.fireDoors[door.userData.bank][door.userData.zone] ? 1.9 : 0);
    for (const light of this.furnaceLights)
      light.intensity =
        (state.ship.fireHeat[light.userData.bank] ?? 0) *
        62 *
        (state.sinkingElapsed === null ? 1 : Math.max(0, 1 - state.sinkingElapsed / 75));
    for (const damper of this.dampers)
      damper.rotation.z = (state.ship.fires[damper.userData.bank] ?? 0) * 1.1 - 0.55;
    for (const gauge of this.boilerGauges)
      gauge.rotation.z =
        -((steamPsi(state.ship.boilerPressure[gauge.userData.bank]) / 300) * 1.5 - 0.75) * Math.PI;
    if (this.mainGaugeNeedle)
      this.mainGaugeNeedle.rotation.z =
        -((steamPsi(state.ship.indicatedSteam) / 300) * 1.5 - 0.75) * Math.PI;
    if (this.mainValveWheel)
      this.mainValveWheel.rotation.z = state.ship.mainSteamValve * Math.PI * 3;
    for (const lump of this.boilerParts?.clinkers ?? [])
      lump.visible =
        lump.userData.lump <
        visibleClinker(state.ship.clinker[lump.userData.bank][lump.userData.zone]);
    for (const piece of this.boilerParts?.fuelBeds ?? []) {
      const b = firebed(state.ship, piece.userData.bank, piece.userData.zone);
      piece.visible = piece.userData.piece < Math.floor(b.coal * 12);
    }
    for (const ash of this.boilerParts?.ashMounds ?? []) {
      const amount = firebed(state.ship, ash.userData.bank, ash.userData.zone).ash;
      ash.visible = amount > 0.06;
      ash.scale.y = Math.max(0.1, amount * 2);
    }
    for (const stop of this.boilerParts?.stopWheels ?? [])
      stop.rotation.z = state.ship.boilerConnected[stop.userData.bank] ? Math.PI : 0;
    for (const jet of this.boilerParts?.steamJets ?? [])
      jet.visible =
        state.ship.safetyLifted[jet.userData.bank] || state.ship.reliefUntil[jet.userData.bank] > 0;
    if (this.scene.fog instanceof THREE.FogExp2)
      this.scene.fog.density = fogDensity(
        state.ship.visibility,
        this.camera.position.y - SEA_LEVEL,
      );
    const life = state.phase === 'lifeboat';
    const hearing =
      ['inquiry', 'ended'].includes(state.phase) &&
      ['schedule', 'route'].includes(state.inquiryCause ?? '');
    this.boat.visible = life;
    this.ship.visible = true;
    for (const [id, g] of this.avatars) {
      const crew = state.players.find((p) => p.id === id)!;
      if (hearing) {
        this.inquiryRoom.add(g);
        g.scale.setScalar(1);
        g.userData.target = new THREE.Vector3(crew.x, 0, crew.z);
      } else if (life || crew.evacuated) {
        this.boat.add(g);
        g.scale.setScalar(1);
        const p = state.players.find((p) => p.id === id)!;
        g.userData.target = new THREE.Vector3(p.x, 0.15, p.z);
      } else if (g.parent !== this.ship) {
        this.ship.add(g);
        g.scale.set(1 / SHIP_WIDTH_SCALE, 1 / SHIP_HEIGHT_SCALE, 1 / SHIP_LENGTH_SCALE);
      }
    }
  }
  setQuality(quality: string) {
    this.quality = quality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.7));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.resize();
  }
  bind() {
    const listen = (target: EventTarget, event: string, handler: EventListener) => {
      target.addEventListener(event, handler);
      this.cleanup.push(() => target.removeEventListener(event, handler));
    };
    listen(window, 'resize', () => this.resize());
    listen(document, 'pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === this.renderer.domElement;
      if (!this.locked) this.keys.clear();
      this.onLock(this.locked);
      if (
        wasLocked &&
        !this.locked &&
        !this.overlay &&
        performance.now() > this.pauseSuppressedUntil
      ) {
        this.cancelPendingPause();
        this.pauseTimer = setTimeout(() => {
          this.pauseTimer = null;
          if (!this.locked && !this.overlay) this.onPause();
        }, 120);
      }
    });
    listen(document, 'mousemove', ((e: MouseEvent) => {
      if (!this.locked || this.overlay || (this.fallbackLook && e.buttons !== 1)) return;
      const sensitivity = Number(localStorage.getItem('titanic-sensitivity') ?? '1');
      if (this.travelKey) {
        this.travelLookYaw += e.movementX * 0.002 * sensitivity;
        this.travelLookPitch = THREE.MathUtils.clamp(
          this.travelLookPitch - e.movementY * 0.002 * sensitivity,
          -1,
          1,
        );
        return;
      }
      this.yaw += e.movementX * 0.002 * sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * 0.002 * sensitivity,
        -1.35,
        1.35,
      );
    }) as EventListener);
    listen(window, 'keydown', ((e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest('input,textarea,select') ||
        !this.state ||
        this.overlay
      )
        return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      if (['voyage', 'sinking'].includes(this.state.phase) && this.locked) {
        if (e.code === 'Escape' && this.fallbackLook) {
          this.locked = false;
          this.keys.clear();
          this.onLock(false);
          return;
        }
        this.keys.add(e.code);
        if (e.code === 'KeyE' && !e.repeat) {
          if (this.boilerTarget) this.useBoiler();
          else if (this.nearest?.kind === 'boiler') this.onBoilerGuide();
          else if (this.nearest) this.onInteract(this.nearest);
        }
        if (e.code === 'KeyB' && !e.repeat && this.local.level === -1 && this.local.z < -6)
          this.onBoilerGuide();
        if (e.code === 'Tab') {
          e.preventDefault();
          this.onNotebook();
        }
        if (e.code === 'KeyP' && this.state.practice && !e.repeat) this.onPractice();
        if (e.code === 'KeyR' && this.state.demo && !e.repeat) this.onDemoRetry();
        if (e.code === 'KeyX' && !e.repeat) this.onCancel();
      }
    }) as EventListener);
    listen(window, 'keyup', ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (
        ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) &&
        !['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((k) => this.keys.has(k))
      ) {
        network.socket?.emit('input', {
          forward: 0,
          right: 0,
          yaw: this.yaw,
          pitch: this.pitch,
          sprint: false,
          zoom: this.zoom ? 1 : 0,
          seq: this.seq++,
        });
      }
    }) as EventListener);
    listen(window, 'blur', () => {
      this.keys.clear();
      this.zoom = false;
    });
    listen(this.renderer.domElement, 'contextmenu', (e) => e.preventDefault());
    listen(window, 'mousedown', ((e: MouseEvent) => {
      if (e.button === 2 && this.locked) this.zoom = true;
      if (e.button === 0 && this.locked && !this.overlay && !this.fallbackLook && this.boilerTarget)
        this.useBoiler();
    }) as EventListener);
    listen(window, 'mouseup', ((e: MouseEvent) => {
      if (e.button === 2) this.zoom = false;
    }) as EventListener);
  }
  useBoiler() {
    if (!this.state || !this.boilerTarget || this.overlay) return;
    const action = boilerAction(
      this.boilerTarget,
      this.state.ship,
      this.state.self.inventory,
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    );
    if (!action) return;
    this.toolStrokeAt = this.clock.elapsedTime;
    void network.action(action).catch((e) => network.onError((e as Error).message));
  }
  updateBoilerTarget() {
    let target: BoilerControl | null = null;
    if (
      this.boilerParts &&
      this.state &&
      this.locked &&
      !this.overlay &&
      this.local.level === -1 &&
      this.local.z < -6
    ) {
      this.camera.updateMatrixWorld();
      this.ship.updateMatrixWorld(true);
      this.boilerRay.setFromCamera(new THREE.Vector2(), this.camera);
      this.boilerRay.far = 4.5;
      const hit = this.boilerRay.intersectObjects(
        [...this.boilerParts.controls, ...this.boilerParts.occluders],
        true,
      )[0];
      if (hit) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.boilerControl) object = object.parent;
        target = object?.userData.boilerControl ?? null;
      }
    }
    this.boilerTarget = target;
    const hint =
      target && this.state ? boilerHint(target, this.state.ship, this.state.self.inventory) : '';
    if (hint !== this.boilerPrompt) {
      this.boilerPrompt = hint;
      this.onBoilerPrompt(hint);
    }
  }
  cancelPendingPause() {
    if (this.pauseTimer !== null) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }
  enter() {
    this.cancelPendingPause();
    this.pauseSuppressedUntil = performance.now() + 350;
    this.overlay = false;
    this.keys.clear();
    this.fallbackLook = false;
    const fallback = () => {
      this.fallbackLook = true;
      this.locked = true;
      this.onLock(true);
    };
    try {
      void this.renderer.domElement.requestPointerLock()?.catch(fallback);
    } catch {
      fallback();
    }
    void shipAudio.start();
  }
  setOverlay(open: boolean) {
    this.overlay = open;
    this.keys.clear();
    this.zoom = false;
    if (open) {
      this.cancelPendingPause();
      this.locked = false;
      this.onLock(false);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  resize() {
    const w = this.container.clientWidth || innerWidth,
      h = this.container.clientHeight || innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
  }
  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta()),
      time = this.clock.elapsedTime;
    this.oceanUniforms.time.value = time;
    this.oceanUniforms.speed.value =
      this.state?.phase === 'lifeboat' ? 0 : (this.state?.ship.speed ?? 21) / 21;
    this.frame++;
    const state = this.state,
      playing = state && ['voyage', 'sinking', 'lifeboat', 'inquiry'].includes(state.phase);
    if (playing) {
      const me = state.players.find((p) => p.id === state.self.id)!;
      let visual: Position & { y?: number } = this.local;
      let cameraYaw = this.yaw,
        cameraPitch = this.pitch;
      if (me.job?.kind === 'travel') {
        const passage = STATIONS.find((s) => s.id === me.job!.station);
        if (passage) {
          if (this.travelKey !== passage.id) {
            this.travelKey = passage.id;
            this.travelStart = { x: this.local.x, y: LEVEL_Y[this.local.level], z: this.local.z };
            this.travelCameraYaw = this.yaw;
            this.travelCameraPitch = this.pitch;
            this.travelLookYaw = this.travelLookPitch = 0;
          }
          const t = Math.min(
              1,
              (me.job.elapsed + Math.max(0, time - this.receivedAt)) / me.job.duration,
            ),
            p = travelPoint(passage, Math.max(0, (t - 0.12) / 0.88));
          const enter = Math.min(1, t / 0.12);
          visual = {
            ...this.local,
            x: this.travelStart.x + (p.x - this.travelStart.x) * enter,
            y: this.travelStart.y + (p.y - this.travelStart.y) * enter,
            z: this.travelStart.z + (p.z - this.travelStart.z) * enter,
          };
          const routeT = Math.max(0, (t - 0.12) / 0.88);
          const before = travelPoint(passage, Math.min(routeT, 0.995)),
            after = travelPoint(passage, Math.min(1, routeT + 0.045));
          const dx = (after.x - before.x) * SHIP_WIDTH_SCALE,
            dz = (after.z - before.z) * SHIP_LENGTH_SCALE,
            dy = (after.y - before.y) * SHIP_HEIGHT_SCALE;
          const onMast =
            ['deck-nest', 'nest-deck'].includes(passage.id) &&
            Math.abs(dy) > Math.hypot(dx, dz) * 3;
          const heading = onMast ? Math.PI : Math.atan2(dx, -dz);
          const tilt = onMast
            ? Math.sign(dy) * 0.35
            : THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.35);
          this.travelCameraYaw +=
            Math.atan2(
              Math.sin(heading - this.travelCameraYaw),
              Math.cos(heading - this.travelCameraYaw),
            ) * Math.min(1, dt * 10);
          this.travelCameraPitch = THREE.MathUtils.lerp(
            this.travelCameraPitch,
            tilt,
            Math.min(1, dt * 8),
          );
          cameraYaw = this.travelCameraYaw + this.travelLookYaw;
          cameraPitch = THREE.MathUtils.clamp(
            this.travelCameraPitch + this.travelLookPitch,
            -1.35,
            1.35,
          );
        }
      } else if (this.travelKey) {
        this.yaw = cameraYaw = this.travelCameraYaw + this.travelLookYaw;
        this.pitch = cameraPitch = THREE.MathUtils.clamp(
          this.travelCameraPitch + this.travelLookPitch,
          -1.35,
          1.35,
        );
        this.travelKey = '';
      }
      let f = 0,
        r = 0;
      if (
        this.locked &&
        !this.overlay &&
        ['voyage', 'sinking'].includes(state.phase) &&
        !me.job &&
        !me.evacuated
      ) {
        if (this.fallbackLook)
          this.yaw +=
            ((this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0)) *
            dt *
            1.5;
        f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
        r = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
        const n = Math.hypot(f, r);
        if (n > 1) {
          f /= n;
          r /= n;
        }
        const speed = (this.keys.has('ShiftLeft') ? BALANCE.sprintSpeed : BALANCE.walkSpeed) * dt;
        this.local = moveWithCollision(
          this.local,
          ((Math.sin(this.yaw) * f + Math.cos(this.yaw) * r) * speed) / SHIP_WIDTH_SCALE,
          ((-Math.cos(this.yaw) * f + Math.sin(this.yaw) * r) * speed) / SHIP_LENGTH_SCALE,
        );
      }
      const sinking = state.sinkingElapsed !== null;
      const sinkAge = sinking ? state.sinkingElapsed! + Math.max(0, time - this.receivedAt) : 0;
      const pose = sinkingPose(sinkAge, (state.ship.impact?.normal.x ?? 1) < 0 ? -1 : 1).bow;
      this.ship.position.set(0, pose.heave, pose.z);
      this.ship.rotation.set(pose.pitch, 0, pose.roll);
      this.ship.updateMatrixWorld(true);
      const evacuated = me.evacuated || state.phase === 'lifeboat';
      this.boat.visible = evacuated;
      this.boat.position.set(this.launchView.x, SEA_LEVEL + 0.35, this.launchView.z);
      if (evacuated) {
        this.camera.position.copy(this.boat.position).add(new THREE.Vector3(0, 1.6, 3.7));
        this.camera.lookAt(0, SEA_LEVEL + 8, 40);
      } else
        setCrewCamera(
          this.camera,
          this.ship,
          visual,
          cameraYaw,
          cameraPitch,
          f || r ? Math.sin(time * 10) * 0.025 : 0,
        );
      if (this.scene.fog instanceof THREE.FogExp2)
        this.scene.fog.density = fogDensity(
          state.ship.visibility,
          this.camera.position.y - SEA_LEVEL,
        );
      const fov = evacuated ? 76 : this.zoom ? (me.binoculars ? 19 : 37) : 76;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, dt * 12);
      this.camera.updateProjectionMatrix();
      if (state.ship.impact && state.ship.impact.id !== this.lastImpact) {
        const impact = state.ship.impact;
        this.lastImpact = impact.id;
        if (state.elapsed - impact.at < 5) {
          this.impactAt = time;
          this.crash.trigger(impact, this.ship, time);
        }
        this.damage.add(createHullScar(impact, materials.steel));
      }
      if (!state.ship.impact && this.lastImpact) {
        this.lastImpact = 0;
        this.impactAt = -100;
        this.damage.clear();
        this.crash.reset();
      }
      const shock =
        Math.exp(-Math.max(0, time - this.impactAt) * 2.4) * (state.ship.impact?.strength ?? 0);
      if (!evacuated) {
        this.camera.rotateZ(Math.sin(time * 43) * shock * 0.024);
        this.camera.rotateX(Math.sin(time * 31) * shock * 0.012);
      }
      for (let i = 0; i < this.floodWater.length; i++) {
        const flood = state.ship.compartments[i];
        this.floodWater[i].visible = flood > 0.04;
        this.floodWater[i].position.y =
          LEVEL_Y[-1] + flood * 3.1 + Math.sin(time * 1.6 + i) * 0.035;
      }
      this.emergency.intensity = state.ship.compartments.some((f) => f > 0.28)
        ? 12 + Math.sin(time * 5) * 9
        : 0;
      if (performance.now() - this.lastInput > 50) {
        network.socket?.emit('input', {
          forward: f,
          right: r,
          yaw: cameraYaw,
          pitch: cameraPitch,
          sprint: this.keys.has('ShiftLeft'),
          zoom: this.zoom ? (me.binoculars ? 2 : 1) : 0,
          seq: this.seq++,
        });
        this.lastInput = performance.now();
        this.updateBoilerTarget();
        const tool = heldFiringTool(state.self.inventory);
        if (
          this.keys.has('KeyE') &&
          this.boilerTarget &&
          (this.boilerTarget.kind === 'ash' || this.boilerTarget.kind === 'fire') &&
          tool !== 'coal' &&
          time - this.toolStrokeAt > (state.self.role?.includes('Boiler') ? 0.52 : 1)
        )
          this.useBoiler();
        const all = state.self.keyPosition
          ? [
              ...STATIONS,
              { ...state.self.keyPosition, id: 'key', kind: 'key' as const, name: 'Cabinet key' },
            ]
          : STATIONS;
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        const nearest =
          me.job || me.evacuated
            ? null
            : (all
                .filter(
                  (s) =>
                    s.kind !== 'scenery' &&
                    (s.kind !== 'lifeboat' ||
                      (state.sinkingElapsed !== null &&
                        state.sinkingElapsed >= BALANCE.abandonDelay)) &&
                    distance(this.local, s) < BALANCE.interactDistance &&
                    wallsBetween(this.local, s) === 0,
                )
                .sort((a, b) => distance(this.local, a) - distance(this.local, b))
                .find((s) => {
                  if (s.id === 'nest-deck' && this.pitch > -0.45) return false;
                  v.set(
                    (s.x - this.local.x) * SHIP_WIDTH_SCALE,
                    0,
                    (s.z - this.local.z) * SHIP_LENGTH_SCALE,
                  ).normalize();
                  return forward.dot(v) > -0.12;
                }) ?? null);
        if (nearest?.id !== this.nearest?.id) {
          this.nearest = nearest;
          this.onNearest(nearest);
        }
        shipAudio.update(state, !!(f || r));
      }
    } else {
      const angle = Math.sin(time * 0.025) * 0.12;
      const lost = state?.phase === 'ended' && state.inquiryCause !== null;
      if (lost) {
        const age =
            state.sinkingElapsed === null
              ? 0
              : state.sinkingElapsed + Math.max(0, time - this.receivedAt),
          pose = sinkingPose(age).bow;
        this.ship.position.set(0, pose.heave, pose.z);
        this.ship.rotation.set(pose.pitch, 0, pose.roll);
        this.boat.visible = true;
        this.boat.position.set(this.launchView.x, SEA_LEVEL + 0.35, this.launchView.z);
        this.camera.position.copy(this.boat.position).add(new THREE.Vector3(0, 1.6, 3.7));
        this.camera.lookAt(0, SEA_LEVEL + 8, 40);
      } else {
        this.camera.position.set(160 + Math.sin(angle) * 10, 45, -155);
        this.camera.lookAt(0, 1.8, -1);
        this.ship.rotation.set(0, 0, Math.sin(time * 0.3) * 0.003);
        this.ship.position.set(0, Math.sin(time * 0.4) * 0.04, 0);
      }
      this.camera.fov = lost ? 76 : 48;
      this.camera.updateProjectionMatrix();
    }
    for (const g of this.avatars.values()) {
      const p = state?.players.find((p) => this.avatars.get(p.id) === g);
      if (p?.job?.kind === 'travel') {
        const station = STATIONS.find((s) => s.id === p.job!.station);
        if (station) {
          const foot = travelPoint(station, p.job.elapsed / p.job.duration);
          g.userData.target = new THREE.Vector3(foot.x, foot.y, foot.z);
        }
      }
      if (g.userData.target) g.position.lerp(g.userData.target, Math.min(1, dt * 14));
    }
    const hearing =
      state &&
      ['inquiry', 'ended'].includes(state.phase) &&
      ['schedule', 'route'].includes(state.inquiryCause ?? '');
    this.inquiryRoom.visible = !!hearing;
    this.ship.visible = !hearing;
    if (hearing) {
      this.boat.visible = false;
      this.camera.position.set(0, 13.75, 6.9);
      this.camera.lookAt(0, 13.25, -2.5);
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
      if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = 0;
    }
    this.crash.update(time);
    this.engineCycle += dt * (this.state ? (this.state.ship.engineRevs / 60) * Math.PI * 2 : 4);
    const cycle = this.engineCycle;
    const heldTool = state ? heldFiringTool(state.self.inventory) : null;
    this.toolModels.visible =
      !!heldTool &&
      !!state &&
      ['voyage', 'sinking'].includes(state.phase) &&
      this.local.level === -1 &&
      !this.overlay;
    for (const model of this.toolModels.children) {
      model.visible = model.name === heldTool;
      const load = model.getObjectByName('shovel-load');
      if (load) load.visible = !!state?.self.inventory.includes('Coal load');
    }
    const stroke = Math.max(0, 1 - (time - this.toolStrokeAt) / 0.4);
    this.toolModels.position.set(
      0.34,
      -0.55 + Math.sin(stroke * Math.PI) * 0.09,
      -1.15 - Math.sin(stroke * Math.PI) * 0.35,
    );
    this.toolModels.rotation.set(1.1, -0.08, -0.15);
    for (let i = 0; i < this.pistons.length; i++)
      this.pistons[i].position.y = -4.65 + Math.sin(cycle + i * 2.09) * 0.15;
    for (let i = 0; i < this.flywheels.length; i++) this.flywheels[i].rotation.z = cycle + i * 2.09;
    for (const needle of this.needles) {
      const key = needle.userData.gauge;
      const value =
        key === 'steam'
          ? steamPsi(this.state?.ship.indicatedSteam ?? 76) / 300
          : key === 'order'
            ? (this.state?.ship.order ?? BALANCE.cruiseKnots) / BALANCE.maxKnots
            : (this.state?.ship.speed ?? BALANCE.cruiseKnots) / BALANCE.maxKnots;
      needle.rotation.z = -(value * 1.5 - 0.75) * Math.PI;
    }
    this.boat.rotation.z = Math.sin(time * 0.6) * 0.025;
    this.boat.position.y = SEA_LEVEL + 0.35 + Math.sin(time * 0.7) * 0.1;
    const smoke = this.smoke.geometry.getAttribute('position');
    for (let i = 0; i < smoke.count; i++) {
      const chimney = Math.floor(i / 28),
        age = (time * 0.6 + i * 0.41) % 9;
      smoke.setXYZ(
        i,
        this.exhausts[chimney].x + Math.sin(age * 0.5 + i) * age * 0.13,
        this.exhausts[chimney].y + age * 0.48,
        this.exhausts[chimney].z + age * 1.4,
      );
    }
    smoke.needsUpdate = true;
    this.smoke.visible = state?.sinkingElapsed === null || !state || state.sinkingElapsed < 75;
    const sinkTime =
      state?.sinkingElapsed === null || state?.sinkingElapsed === undefined
        ? null
        : state.sinkingElapsed + Math.max(0, time - this.receivedAt);
    this.sections.update(sinkTime, (state?.ship.impact?.normal.x ?? 1) < 0 ? -1 : 1, !!hearing);
    this.ship.updateMatrixWorld(true);
    this.oceanUniforms.shipInverse.value.copy(this.ship.matrixWorld).invert();
    if (this.quality === 'high') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };
  resetState() {
    this.state = null;
    this.setOverlay(true);
    this.lastPhase = '';
    this.lastRelocation = -1;
    this.boat.visible = false;
    this.damage.clear();
    this.crash.reset();
    for (const avatar of this.avatars.values()) avatar.removeFromParent();
    this.avatars.clear();
    for (const berg of this.bergs.values()) {
      berg.geometry.dispose();
      berg.removeFromParent();
    }
    this.bergs.clear();
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.cancelPendingPause();
    for (const fn of this.cleanup) fn();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.renderer.dispose();
    this.composer.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.environment.dispose();
    this.renderer.domElement.remove();
  }
}
