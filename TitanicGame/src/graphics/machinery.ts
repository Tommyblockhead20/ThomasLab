import * as THREE from 'three';
import type { ShipMaterials } from './materials';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../../shared/navigation';
import { DECK_HOUSES } from '../../shared/world';
function box(
  g: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
function cyl(
  g: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  m: THREE.Material,
  top = r,
) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(top, r, h, 24), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  g.add(o);
  return o;
}
function link(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const o = cyl(g, 0, 0, 0, r, a.distanceTo(b), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}
export function buildFunnel(z: number, m: ShipMaterials) {
  const group = new THREE.Group();
  group.name = 'funnel';
  group.position.z = z;
  group.scale.set(1 / W, 1 / H, 1 / L);
  const casing = box(group, 0, 2.1, 0, 4 * W, 4.2, 2.6 * L, m.ivory);
  casing.name = 'funnel-foot';
  box(group, 0, 4.26, 0, 4.05 * W, 0.12, 2.65 * L, m.black);
  const stack = new THREE.Group();
  stack.position.y = 4.32;
  stack.rotation.x = 0.075;
  stack.scale.z = 1.3;
  group.add(stack);
  cyl(stack, 0, 0.25, 0, 2.5, 0.5, m.black, 2.35);
  cyl(
    stack,
    0,
    7.35,
    0,
    2.35,
    13.7,
    new THREE.MeshStandardMaterial({ color: 0xbb884f, roughness: 0.72, metalness: 0.12 }),
  );
  cyl(stack, 0, 16.2, 0, 2.38, 4, m.black);
  const rim = cyl(stack, 0, 18.25, 0, 2.48, 0.1, m.black);
  rim.name = 'funnel-rim';
  const dark = new THREE.Mesh(new THREE.CircleGeometry(2.28, 48), m.black);
  dark.rotation.x = -Math.PI / 2;
  dark.position.y = 18.31;
  stack.add(dark);
  for (const side of [-1, 1])
    for (const dz of [-7, 7]) {
      const anchorZ = z + dz / L,
        y = DECK_HOUSES.some(
          (h) => Math.abs((side * 4.8) / W - h.x) < h.w / 2 && Math.abs(anchorZ - h.z) < h.d / 2,
        )
          ? 3.41 * H + 0.035
          : 0.02;
      box(group, side * 4.8, y - 0.03, dz, 0.22, 0.06, 0.35, m.black);
      link(
        group,
        new THREE.Vector3(side * 1.9, 16, 1),
        new THREE.Vector3(side * 4.8, y, dz),
        0.023,
        m.rope,
      );
    }
  group.updateMatrixWorld(true);
  const exhaust = new THREE.Vector3(0, 18.4, 0).applyMatrix4(stack.matrixWorld);
  return { group, exhaust };
}
export function buildEngineRoom(m: ShipMaterials, dialMaterials?: THREE.Material[]) {
  const group = new THREE.Group();
  group.name = 'engine-machinery';
  const pistons: THREE.Object3D[] = [],
    flywheels: THREE.Object3D[] = [],
    needles: THREE.Object3D[] = [];
  for (const x of [-5, 5]) {
    box(group, x, -5.77, -17, 2.9, 0.5, 7, m.black);
    const shaft = cyl(group, x, -5.03, -17, 0.15, 6.9, m.brass);
    shaft.rotation.x = Math.PI / 2;
    for (const dx of [-1.05, 1.05])
      for (const z of [-20, -14]) {
        box(group, x + dx, -4.35, z, 0.18, 2.35, 0.24, m.steel);
        box(group, x + dx, -5.47, z, 0.38, 0.14, 0.44, m.brass);
      }
    for (const dx of [-1.05, 1.05]) box(group, x + dx, -3.14, -17, 0.25, 0.22, 6.6, m.steel);
    for (let i = 0; i < 3; i++) {
      const z = -19 + i * 2,
        radius = 0.48 + i * 0.06;
      cyl(group, x, -3.79, z, radius, 0.95, m.steel);
      cyl(group, x, -3.28, z, radius + 0.06, 0.12, m.brass);
      cyl(group, x, -4.31, z, radius + 0.035, 0.1, m.black);
      const moving = new THREE.Group();
      moving.position.set(x, -4.65, z);
      group.add(moving);
      cyl(moving, 0, 0, 0, 0.085, 1.02, m.brass);
      box(moving, 0, -0.29, 0, 0.48, 0.16, 0.31, m.steel);
      pistons.push(moving);
      const wheel = new THREE.Group();
      wheel.position.set(x, -5.03, z);
      group.add(wheel);
      flywheels.push(wheel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.075, 8, 32), m.black);
      wheel.add(rim);
      for (let j = 0; j < 6; j++) {
        const a = (j * Math.PI) / 3;
        const spoke = box(
          wheel,
          Math.cos(a) * 0.22,
          Math.sin(a) * 0.22,
          0,
          0.46,
          0.045,
          0.08,
          m.steel,
        );
        spoke.rotation.z = a;
      }
      for (const side of [-1, 1])
        link(
          group,
          new THREE.Vector3(x + side * 0.55, -3.3, z),
          new THREE.Vector3(x + side * 0.55, -2.92, z),
          0.045,
          m.brass,
        );
    }
    const header = cyl(group, x, -2.93, -17, 0.13, 7, m.steel);
    header.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const edge = x + side * 1.45;
      for (const z of [-20, -17, -14]) cyl(group, edge, -5.12, z, 0.03, 1.65, m.brass);
      const bar = cyl(group, edge, -4.36, -17, 0.035, 6, m.brass);
      bar.rotation.x = Math.PI / 2;
    }
  }
  // Structural beams and rivets follow the room's real wall/ceiling faces.
  for (let z = -27; z < -1; z += 4.5) {
    box(group, 0, -2.62, z, 17.5, 0.18, 0.17, m.black);
    for (const x of [-8.77, 8.77]) box(group, x, -4.28, z, 0.12, 3.3, 0.12, m.black);
  }
  for (const x of [-8.82, 8.82])
    for (let z = -27; z < -1; z += 1.3)
      for (const y of [-5.6, -3.0]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), m.brass);
        rivet.position.set(x, y, z);
        group.add(rivet);
      }
  // Floor-mounted console. The dials sit at eye height, below the ceiling.
  box(group, 0, -5.35, -16, 1.35, 1.35, 0.7 / L, m.steel);
  box(group, 0, -4.59, -16, 1.53, 0.18, 0.92 / L, m.darkWood);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.43,
      y = -4.39,
      z = -16 + 0.52 / L;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), dialMaterials?.[i] ?? m.ivory);
    face.position.set(x, y, z);
    group.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 32), m.brass);
    rim.position.set(x, y, z + 0.008);
    group.add(rim);
    for (let tick = 0; tick < 9; tick++) {
      const a = ((tick / 8) * 1.5 - 0.75) * Math.PI;
      const t = box(
        group,
        x + Math.sin(a) * 0.14,
        y + Math.cos(a) * 0.14,
        z + 0.012,
        0.012,
        0.028,
        0.008,
        m.black,
      );
      t.rotation.z = -a;
    }
    const needle = new THREE.Group();
    needle.position.set(x, y, z + 0.028);
    box(needle, 0, 0.065, 0, 0.012, 0.15, 0.008, m.red);
    needle.userData.gauge = ['order', 'speed', 'steam'][i];
    group.add(needle);
    needles.push(needle);
  }
  return { group, pistons, flywheels, needles };
}
