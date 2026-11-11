import { light } from './building';
import { buildLookout } from './lookout';
import { SHAFT, MACHINERY_CEILING } from '../../shared/layout';
import { buildStairways, buildPassengerDetails } from './interiors';
import * as T from 'three';
import type { ShipMaterials } from './materials';
import {
  HULL_OUTLINE,
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
  SEA_LEVEL,
} from '../../shared/navigation';
import {
  LEVEL_Y,
  BOAT_POSITIONS,
  PASSENGER_FURNITURE,
  STATIONS,
  WALLS,
  DECK_HOUSES,
  DECK_OPENINGS,
  BOAT_DECK_FRONT,
  BOAT_DECK_BACK,
  FUNNEL_POSITIONS,
} from '../../shared/world';
function box(
  g: T.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  m: T.Material,
) {
  const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
function cylinder(
  g: T.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  m: T.Material,
  top = r,
) {
  const o = new T.Mesh(new T.CylinderGeometry(top, r, h, 24), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  g.add(o);
  return o;
}
function bar(g: T.Object3D, a: T.Vector3, b: T.Vector3, r: number, m: T.Material) {
  const o = cylinder(g, 0, 0, 0, r, a.distanceTo(b), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}
function metric(g: T.Object3D, x: number, y: number, z: number) {
  const group = new T.Group();
  group.position.set(x, y, z);
  group.scale.set(1 / W, 1 / H, 1 / L);
  g.add(group);
  return group;
}
function plaque(g: T.Object3D, text: string, x: number, y: number, z: number, width = 1.4) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1c292a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#b6a474';
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = '#decda1';
  ctx.font = '38px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  const o = box(
    g,
    x,
    y,
    z,
    width,
    0.24,
    0.025,
    new T.MeshStandardMaterial({ map, roughness: 0.7 }),
  );
  return o;
}
function outline() {
  const shape = new T.Shape();
  shape.moveTo(HULL_OUTLINE[0].x, HULL_OUTLINE[0].z);
  for (const p of HULL_OUTLINE.slice(1)) shape.lineTo(p.x, p.z);
  return shape;
}
function floor(g: T.Object3D, shape: T.Shape, y: number, m: T.Material) {
  const geometry = new T.ShapeGeometry(shape);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W, uv.getY(i) * L);
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(Math.PI);
  const mesh = new T.Mesh(geometry, m);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function rectangle(x: number, z: number, w: number, d: number) {
  const p = new T.Shape();
  p.moveTo(x - w / 2, z - d / 2);
  p.lineTo(x + w / 2, z - d / 2);
  p.lineTo(x + w / 2, z + d / 2);
  p.lineTo(x - w / 2, z + d / 2);
  p.closePath();
  return p;
}
export function buildTallShell(g: T.Group, m: ShipMaterials) {
  // Real deck spacing: Boat Deck, A promenade, B/forecastle, then the black hull.
  const center = (BOAT_DECK_FRONT + BOAT_DECK_BACK) / 2,
    length = BOAT_DECK_BACK - BOAT_DECK_FRONT;
  const central = rectangle(0, center, 20, length);
  for (const { x, z, w, d } of DECK_OPENINGS) {
    const hole = rectangle(-x, z, w, d);
    central.holes.push(new T.Path(hole.getPoints()));
  }
  floor(g, central, 0, m.deck).name = 'boat-deck';
  const ceilingPaint = m.ivory.clone();
  ceilingPaint.side = T.BackSide;
  floor(g, central, -0.14, ceilingPaint).name = 'passenger-ceiling';
  const bDeck = outline();
  bDeck.holes.push(new T.Path(rectangle(-SHAFT.x, SHAFT.z, SHAFT.w, SHAFT.d).getPoints()));
  floor(g, bDeck, -5.4, m.deck).name = 'b-deck';
  const bottom = floor(g, outline(), -23.4, m.red);
  bottom.scale.set(0.65, 1, 0.86);
  bottom.material = m.red.clone();
  (bottom.material as T.MeshStandardMaterial).side = T.DoubleSide;
  bottom.name = 'closed-keel';
  for (const z of [-5.45, -8.2, -10.8, -13.3, -15.6])
    for (const side of [-1, 1])
      for (let along = -20; along < 24; along += 1.75) {
        const port = metric(g, side * 10.025, z, along);
        const ring = new T.Mesh(new T.TorusGeometry(0.105, 0.018, 6, 12), m.brass);
        ring.rotation.y = (side * Math.PI) / 2;
        port.add(ring);
        const glass = new T.Mesh(new T.CircleGeometry(0.085, 12), m.glow);
        glass.rotation.y = (side * Math.PI) / 2;
        glass.position.x = side * 0.014;
        port.add(glass);
      }
  // B-deck enclosed window band and the open A-deck promenade above it.
  for (const side of [-1, 1]) {
    box(g, side * 9.78, -4.03, center, 0.18, 2.62, length, m.ivory);
    for (let z = -20.3; z < 24; z += 1.4) {
      const pane = box(g, side * 9.89, -3.94, z, 0.025, 0.78, 0.72, m.black);
      pane.name = 'b-deck-window';
      const glass = new T.Mesh(new T.PlaneGeometry(0.6, 0.65), m.glass);
      glass.rotation.y = (side * Math.PI) / 2;
      glass.position.set(side * 9.915, -3.94, z);
      g.add(glass);
    }
    for (let z = -20.6; z < 24.3; z += 2) {
      box(g, side * 9.78, -1.3, z, 0.12, 2.6, 0.045, m.ivory);
    }
    box(g, side * 9.78, -0.1, center, 0.23, 0.16, length, m.ivory);
    box(g, side * 9.78, -2.05, center, 0.12, 0.09, length, m.darkWood);
    box(g, side * 9.78, -2.4, center, 0.1, 0.08, length, m.ivory);
  }
  // External flights terminate at the deck edge, against a CLOSED end wall.
  // No hole or full-height slot is cut through the forecastle connection.
  for (const [z, direction] of [
    [BOAT_DECK_FRONT, 1],
    [BOAT_DECK_BACK, -1],
  ]) {
    box(g, 0, -2.7, z + direction * 0.04, 20, 5.4, 0.08, m.ivory).name = 'closed-end-bulkhead';
    box(g, 0, LEVEL_Y[-2], z - direction * 0.025, 19.7, 0.09, 0.025, m.darkWood).name =
      'end-deck-band';
    for (const x of [-6, -4, -2, 0, 2, 4, 6]) {
      box(g, x, -1.35, z - direction * 0.028, 0.8, 0.9, 0.035, m.ivory).name = 'end-window-frame';
      box(g, x, -1.35, z - direction * 0.052, 0.68, 0.73, 0.012, m.black).name =
        'end-window-recess';
      const pane = new T.Mesh(new T.PlaneGeometry(0.62, 0.67), m.glass);
      pane.position.set(x, -1.35, z - direction * 0.064);
      if (direction === 1) pane.rotation.y = Math.PI;
      g.add(pane);
    }
    light(metric(g, direction === 1 ? 8.8 : 5.6, -0.7, z - direction * 0.12), 0, 0, 0, 1.2);
  }
}
export function buildDeckhouseRoofs(g: T.Group, m: ShipMaterials) {
  for (const house of DECK_HOUSES) {
    const shape = rectangle(-house.x, house.z, house.w, house.d);
    if (house.z === -4.65) {
      const skylight = new T.Path();
      skylight.absellipse(0, house.z, 1.3 / W, 2.38 / L, 0, Math.PI * 2, true, 0);
      shape.holes.push(skylight);
    }
    for (const z of FUNNEL_POSITIONS)
      if (z > house.z - house.d / 2 + 1.3 && z < house.z + house.d / 2 - 1.3) {
        shape.holes.push(new T.Path(rectangle(0, z, 4, 2.6).getPoints()));
      }
    const geometry = new T.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: false,
      curveSegments: 24,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI);
    const roof = new T.Mesh(geometry, m.roof);
    roof.position.y = 3.25;
    roof.name = 'deckhouse-roof';
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
  }
}
export function buildPassengerDeck(g: T.Group, m: ShipMaterials) {
  const y = LEVEL_Y[-2],
    shape = rectangle(0, 1.7, 19.45, 45.1);
  shape.holes.push(new T.Path(rectangle(-SHAFT.x, SHAFT.z, SHAFT.w, SHAFT.d).getPoints()));
  floor(g, shape, y, m.deck).name = 'passenger-deck';
  box(
    g,
    0,
    y + 0.004,
    4.25,
    10.8,
    0.012,
    8.3,
    new T.MeshStandardMaterial({ color: 0x344b3c, roughness: 1 }),
  );
  buildPassengerDetails(g, m);
  for (const f of PASSENGER_FURNITURE) {
    const p = metric(g, f.x, y, f.z),
      w = f.w * W,
      d = f.d * L;
    if (f.kind === 'table') {
      cylinder(p, 0, 0.43, 0, 0.08, 0.86, m.brass);
      cylinder(p, 0, 0.89, 0, w / 2, 0.09, m.darkWood);
      for (const side of [-1, 1]) {
        box(p, side * (w * 0.5 + 0.35), 0.42, 0, 0.5, 0.12, 0.5, m.darkWood);
        box(p, side * (w * 0.5 + 0.58), 0.73, 0, 0.09, 0.7, 0.55, m.wood);
        for (const a of [-0.19, 0.19])
          for (const b of [-0.19, 0.19])
            box(p, side * (w * 0.5 + 0.35) + a, 0.19, b, 0.055, 0.38, 0.055, m.darkWood);
      }
    } else if (f.kind === 'piano') {
      box(p, 0, 0.64, 0, w, 0.9, d, m.darkWood);
      box(p, 0, 0.88, d / 2 + 0.06, w * 0.9, 0.1, 0.18, m.ivory);
      box(p, 0, 1.14, 0, w, 0.08, d, m.black);
      for (const x of [-w * 0.4, w * 0.4])
        for (const z of [-d * 0.3, d * 0.3]) box(p, x, 0.18, z, 0.1, 0.36, 0.1, m.darkWood);
      for (let i = 0; i < 26; i++)
        box(p, -w * 0.42 + i * ((w * 0.84) / 25), 0.94, d / 2 + 0.07, 0.025, 0.035, 0.14, m.black);
    } else {
      const cloth = new T.MeshStandardMaterial({
        color: f.kind === 'sofa' ? 0x526e5b : 0x79563c,
        roughness: 0.95,
      });
      box(p, 0, 0.43, 0, w, 0.18, d, cloth);
      box(p, 0, 0.78, -d * 0.4, w, 0.65, 0.12, cloth);
      for (const side of [-1, 1]) {
        box(p, side * (w / 2 - 0.08), 0.55, 0, 0.1, 0.55, d, m.darkWood);
        box(p, side * (w / 2 - 0.13), 0.2, 0, 0.07, 0.4, d * 0.7, m.darkWood);
      }
    }
  }
}
export function buildMachineryCeiling(g: T.Group, m: ShipMaterials) {
  const shape = rectangle(0, 7.6, 18, 43.8);
  shape.holes.push(new T.Path(rectangle(-SHAFT.x, SHAFT.z, SHAFT.w, SHAFT.d).getPoints()));
  const paint = m.steel.clone();
  paint.side = T.DoubleSide;
  const ceiling = floor(g, shape, MACHINERY_CEILING, paint);
  ceiling.name = 'machinery-ceiling';
  ceiling.castShadow = true;
}
export function buildCompanionways(g: T.Group, m: ShipMaterials) {
  buildStairways(g, m);
}
export function buildForemast(g: T.Group, m: ShipMaterials) {
  const { mast } = buildLookout(g, m);
  for (const side of [-1, 1]) {
    const roof = (3.48 - LEVEL_Y[2]) * H;
    bar(mast, new T.Vector3(0, 30, 0), new T.Vector3(side * 8.5, roof, 42), 0.022, m.rope);
    box(mast, side * 8.5, roof - 0.03, 42, 0.24, 0.06, 0.35, m.black);
  }
  bar(mast, new T.Vector3(0, 30, 0), new T.Vector3(0, 0.15, -16), 0.025, m.rope);
  box(mast, 0, 0.12, -16, 0.3, 0.24, 0.6, m.black);
  const aft = metric(g, 0, LEVEL_Y[2], 31);
  cylinder(aft, 0, 15.5, 0, 0.27, 31, m.wood, 0.12);
  for (const side of [-1, 1]) {
    const deck = (0.035 - LEVEL_Y[2]) * H;
    bar(aft, new T.Vector3(0, 29, 0), new T.Vector3(side * 7, deck, -24), 0.022, m.rope);
    box(aft, side * 7, deck - 0.03, -24, 0.24, 0.06, 0.35, m.black);
  }
  for (const x of [-2, 2]) {
    const p = metric(g, x, LEVEL_Y[2], -34);
    box(p, 0, 0.35, 0, 2.1, 0.65, 2.2, m.black);
    cylinder(p, 0, 0.82, 0, 0.42, 0.4, m.steel);
    cylinder(p, 0, 1.05, 0, 0.5, 0.09, m.brass);
  }
}
export function buildBoatStations(g: T.Group, m: ShipMaterials) {
  for (const side of [-1, 1])
    for (const [index, z] of BOAT_POSITIONS.entries()) {
      const p = metric(g, side * 8.9, 0, z);
      p.name = `lifeboat-${side === 1 ? 3 + index * 2 : 4 + index * 2}`;
      // Curved, open planked boat with a keel physically resting in two deck chocks.
      const hull = new T.Group();
      hull.position.y = 0.34;
      p.add(hull);
      const positions: number[] = [],
        indices: number[] = [],
        segments = 24;
      for (let ring = 0; ring < 3; ring++)
        for (let i = 0; i < segments; i++) {
          const a = (i / segments) * Math.PI * 2,
            width = [0.3, 1.05, 1.3][ring],
            length = [3.6, 4.3, 4.6][ring];
          positions.push(Math.cos(a) * width, [0, 0.35, 1.25][ring], Math.sin(a) * length);
        }
      for (let ring = 0; ring < 2; ring++)
        for (let i = 0; i < segments; i++) {
          const a = ring * segments + i,
            b = ring * segments + ((i + 1) % segments);
          indices.push(a, a + segments, b, b, a + segments, b + segments);
        }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const paint = m.ivory.clone();
      paint.side = T.DoubleSide;
      hull.add(new T.Mesh(geometry, paint));
      box(hull, 0, 0.08, 0, 0.65, 0.14, 7.3, m.darkWood);
      for (const dz of [-3.4, -1.7, 0, 1.7, 3.4])
        box(hull, 0, 0.86, dz, 2.2, 0.09, 0.28, m.darkWood);
      for (const dz of [-3, 3]) {
        box(p, 0, 0.16, dz, 2.0, 0.32, 0.32, m.darkWood);
        for (const direction of [-1, 1])
          box(p, direction * 0.65, 0.33, dz, 0.28, 0.27, 0.35, m.darkWood);
      }
      for (const dz of [-3.6, 3.6]) {
        const baseX = -side * 2.4;
        box(p, baseX, 0.12, dz, 0.5, 0.24, 0.65, m.black);
        const arm = [
          new T.Vector3(baseX, 0.22, dz),
          new T.Vector3(baseX, 2.8, dz),
          new T.Vector3(baseX + side * 0.5, 3.9, dz),
          new T.Vector3(0, 4.1, dz),
        ];
        for (let i = 0; i < arm.length - 1; i++) bar(p, arm[i], arm[i + 1], 0.075, m.ivory);
        for (const dx of [-0.055, 0.055])
          bar(p, new T.Vector3(dx, 4.1, dz), new T.Vector3(dx, 1.45, dz), 0.016, m.rope);
        const block = cylinder(p, 0, 1.55, dz, 0.09, 0.18, m.black);
        block.rotation.x = Math.PI / 2;
      }
    }
}
export function buildSternGear(g: T.Group, m: ShipMaterials) {
  for (const [x, z, r] of [
    [-5.2, 31.8, 2.8],
    [5.2, 31.8, 2.8],
    [0, 33.2, 2.15],
  ]) {
    const gear = metric(g, x / W, -21.2, z);
    gear.name = 'propeller-' + (x === 0 ? 'centre' : x < 0 ? 'port' : 'starboard');
    const shaft = cylinder(gear, 0, 0, -3.5, 0.18, 7, m.steel);
    shaft.rotation.x = Math.PI / 2;
    const hub = cylinder(gear, 0, 0, 0, 0.36, 0.9, m.brass, 0.22);
    hub.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const shape = new T.Shape();
      shape.moveTo(0.25, -0.15);
      shape.bezierCurveTo(r * 0.45, -0.6, r * 0.9, -0.4, r, -0.05);
      shape.bezierCurveTo(r * 1.04, 0.25, r * 0.76, 0.55, r * 0.56, 0.4);
      shape.lineTo(0.25, 0.13);
      shape.closePath();
      const blade = new T.Mesh(
        new T.ExtrudeGeometry(shape, {
          depth: 0.13,
          bevelEnabled: true,
          bevelSize: 0.025,
          bevelThickness: 0.02,
          bevelSegments: 1,
          steps: 1,
        }),
        m.brass,
      );
      blade.rotation.z = (i * Math.PI * 2) / 3;
      blade.castShadow = true;
      gear.add(blade);
    }
  }
  const rudder = metric(g, 0, -20.9, 33.7);
  rudder.name = 'stern-rudder';
  box(rudder, 0, 0, 0, 0.14, 5.5, 2, m.black);
  cylinder(rudder, 0, 3.1, -0.45, 0.12, 2.5, m.steel);
}
