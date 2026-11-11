import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildCabinWall, buildRailing, hullBand } from '../src/graphics/architecture';
import { WALLS } from '../shared/world';
import { buildEngineRoom, buildFunnel } from '../src/graphics/machinery';
import { oceanGeometry } from '../src/graphics/ocean';
import type { ShipMaterials } from '../src/graphics/materials';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../shared/navigation';
import { FUNNEL_POSITIONS } from '../shared/world';
import {
  buildTallShell,
  buildMachineryCeiling,
  buildForemast,
  buildSternGear,
} from '../src/graphics/liner';
import { HULL_OUTLINE, SEA_LEVEL } from '../shared/navigation';
import { LEVEL_Y } from '../shared/world';
import { chooseLaunchView } from '../src/graphics/launch-view';
import { SHAFT } from '../shared/layout';

test('lifeboat views choose clear water around obstructing ice without changing any iceberg', () => {
  assert.deepEqual(chooseLaunchView([]), { x: 210, z: 170 });
  const ice = [
    { x: 105, z: 85, radius: 70 },
    { x: 160, z: 120, radius: 50 },
  ];
  const before = structuredClone(ice);
  const eye = chooseLaunchView(ice);
  assert.equal(eye.x, -210);
  assert.deepEqual(ice, before);
  assert.ok(ice.every((berg) => Math.hypot(eye.x - berg.x, eye.z - berg.z) > berg.radius + 20));
});

const palette = {
  ivory: new THREE.MeshStandardMaterial(),
  brass: new THREE.MeshStandardMaterial(),
  darkWood: new THREE.MeshStandardMaterial(),
  steel: new THREE.MeshStandardMaterial(),
  glass: new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.12, depthWrite: false }),
};
const machineryPalette = {
  ...palette,
  black: palette.steel,
  red: palette.ivory,
  rope: palette.steel,
  deck: palette.ivory,
  wood: palette.darkWood,
  roof: palette.steel,
  glow: palette.ivory,
} as ShipMaterials;

test('passenger and machinery ceilings close the rooms while preserving the real stair openings', () => {
  const g = new THREE.Group();
  buildTallShell(g, machineryPalette);
  buildMachineryCeiling(g, machineryPalette);
  g.updateMatrixWorld(true);
  for (const [name, level, x, z, holeX, holeZ] of [
    ['passenger-ceiling', -2, 0, -17, 0, -3.3],
    ['machinery-ceiling', -1, 0, 5, SHAFT.x, SHAFT.z],
  ] as const) {
    const mesh = g.getObjectByName(name)!;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, LEVEL_Y[level] + 0.2, z),
      new THREE.Vector3(0, 1, 0),
    );
    assert.equal(ray.intersectObject(mesh).length, 1, name);
    ray.ray.origin.set(holeX, LEVEL_Y[level] + 0.2, holeZ);
    assert.equal(ray.intersectObject(mesh).length, 0, name + ' stair opening');
  }
});
test('the lookout cage is human-sized on a foremast ahead of the bridge', () => {
  const ship = new THREE.Group();
  ship.scale.set(W, H, L);
  buildForemast(ship, machineryPalette);
  ship.updateMatrixWorld(true);
  const cage = ship.getObjectByName('lookout-cage')!;
  const bounds = new THREE.Box3().setFromObject(cage),
    size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 2.6 && size.x < 2.9);
  const floor = new THREE.Box3().setFromObject(cage.getObjectByName('nest-floor')!);
  const bell = new THREE.Box3().setFromObject(cage.getObjectByName('hanging-lookout-bell')!);
  assert.ok(bell.min.y - floor.max.y > 2, 'hanging bell clears the lookouts’ heads');
  assert.ok(bounds.max.z < -28.5 * L, 'nest is forward of the bridge face');
});

test('funnel foot meets the deck and exhaust stays at the top of the tilted stack', () => {
  for (const z of FUNNEL_POSITIONS) {
    const { group, exhaust } = buildFunnel(z, machineryPalette);
    const ship = new THREE.Group();
    ship.scale.set(W, H, L);
    ship.add(group);
    ship.updateMatrixWorld(true);
    const foot = new THREE.Box3().setFromObject(group.getObjectByName('funnel-foot')!);
    assert.ok(Math.abs(foot.min.y) < 1e-7);
    const smoke = ship.localToWorld(exhaust.clone());
    assert.ok(smoke.y > 22 && smoke.y < 23);
    assert.ok(Math.abs(smoke.z - z * L) < 1.5);
    const rim = group.getObjectByName('funnel-rim')!,
      center = rim.getWorldPosition(new THREE.Vector3());
    const axis = new THREE.Vector3(0, 1, 0).transformDirection(rim.matrixWorld),
      delta = smoke.clone().sub(center);
    assert.ok(delta.dot(axis) > 0.1 && delta.dot(axis) < 0.2);
    assert.ok(delta.clone().addScaledVector(axis, -delta.dot(axis)).length() < 0.01);
  }
});
test('the underwater shell tapers continuously below the machinery floor and stern gear remains submerged', () => {
  const shape = new THREE.Shape();
  shape.moveTo(HULL_OUTLINE[0].x, HULL_OUTLINE[0].z);
  for (const p of HULL_OUTLINE.slice(1)) shape.lineTo(p.x, p.z);
  const upper = hullBand(shape, -16, -19).getAttribute('position'),
    lower = hullBand(shape, -19, -23.4, { x: 0.65, z: 0.86 }).getAttribute('position');
  for (let i = 0; i < upper.count; i += 2) {
    assert.equal(upper.getX(i + 1), lower.getX(i));
    assert.equal(upper.getZ(i + 1), lower.getZ(i));
    assert.ok(Math.abs(lower.getX(i + 1) - lower.getX(i) * 0.65) < 1e-5);
    assert.ok(Math.abs(lower.getZ(i + 1) - lower.getZ(i) * 0.86) < 1e-5);
  }
  const ship = new THREE.Group();
  ship.scale.set(W, H, L);
  buildSternGear(ship, machineryPalette);
  ship.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(ship);
  assert.ok(bounds.max.y < SEA_LEVEL);
  assert.ok(bounds.min.y > SEA_LEVEL - 9);
  assert.equal(ship.children.filter((o) => o.name.startsWith('propeller-')).length, 3);
});
test('engine structures fit the actual room and props are not rendered as full-height walls', () => {
  const { group, pistons, flywheels, needles } = buildEngineRoom(machineryPalette);
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.y >= -6.03 && bounds.max.y <= -2.51, JSON.stringify(bounds));
  assert.equal(pistons.length, 6);
  assert.equal(flywheels.length, 6);
  assert.equal(needles.length, 3);
  for (const p of pistons) {
    const b = new THREE.Box3().setFromObject(p);
    assert.ok(b.max.y + 0.15 < -2.51 && b.min.y - 0.15 > -6.02);
  }
  assert.ok(WALLS.filter((w) => w.level === -1 && Math.abs(w.x) === 5).every((w) => w.prop));
});
test('ocean concentrates geometric detail near the ship and still reaches the horizon', () => {
  const geometry = oceanGeometry(),
    p = geometry.getAttribute('position');
  const coordinates = [...new Set(Array.from({ length: p.count }, (_, i) => p.getX(i)))].sort(
    (a, b) => a - b,
  );
  const center = coordinates.indexOf(0);
  assert.ok(coordinates[center + 1] - coordinates[center] < 0.15);
  assert.equal(coordinates.at(-1), 1200);
  assert.equal(coordinates[0], -1200);
  assert.ok(coordinates.at(-1)! - coordinates.at(-2)! > 20);
  geometry.dispose();
});
test('cabin paint and wainscoting use disjoint solids instead of coplanar overlay faces', () => {
  for (const wall of WALLS.filter((w) => w.level === 0 && !w.prop)) {
    const group = buildCabinWall(wall, 0, palette);
    const bands = group.children.filter((child) =>
      ['wainscot', 'waist-rail', 'window-lintel', 'header', 'plaster', 'cornice'].includes(
        child.name,
      ),
    );
    for (let i = 0; i < bands.length; i++)
      for (let j = i + 1; j < bands.length; j++) {
        const a = new THREE.Box3().setFromObject(bands[i]),
          b = new THREE.Box3().setFromObject(bands[j]);
        assert.ok(
          Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) < 1e-6,
          `${bands[i].name} and ${bands[j].name} must not overlap vertically`,
        );
      }
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
});
test('windows are single transparent sheets with no depth-writing glass boxes', () => {
  const group = buildCabinWall(WALLS[0], 0, palette);
  const glass = group.getObjectByName('window-sheet') as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshPhysicalMaterial
  >;
  assert.ok(glass);
  assert.equal(glass.geometry.type, 'PlaneGeometry');
  assert.equal(glass.material.depthWrite, false);
  assert.equal(glass.geometry.getAttribute('position').count, 4);
});
test('closed crow’s-nest rails deduplicate shared endpoint posts, including negative zero', () => {
  const parent = new THREE.Group();
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10,
      b = ((i + 1) * Math.PI) / 10;
    buildRailing(
      parent,
      Math.cos(a) * 3.7,
      Math.sin(a) * 3.7,
      Math.cos(b) * 3.7,
      Math.sin(b) * 3.7,
      10,
      palette.ivory,
    );
  }
  const posts = parent.children.filter((child) => child.name === 'railing-post');
  assert.equal(posts.length, 20);
  assert.equal(
    new Set(posts.map((p) => `${p.position.x.toFixed(3)},${p.position.z.toFixed(3)}`)).size,
    20,
  );
});
test('painted hull bands meet at edges without a second full hull behind the paint', () => {
  const outline = new THREE.Shape();
  outline.moveTo(-10, 30);
  outline.lineTo(-10, -30);
  outline.lineTo(10, -30);
  outline.lineTo(10, 30);
  outline.lineTo(-10, 30);
  const a = hullBand(outline, -0.04, -0.58),
    b = hullBand(outline, -0.58, -0.69);
  a.computeBoundingBox();
  b.computeBoundingBox();
  assert.equal(a.boundingBox!.min.y, b.boundingBox!.max.y);
  assert.ok(a.getAttribute('normal').count > 0);
  a.dispose();
  b.dispose();
});
