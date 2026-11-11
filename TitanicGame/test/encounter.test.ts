import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Room } from '../server/game';
import { BALANCE } from '../shared/config';
import {
  CHART_SCALE,
  HULL_BOW,
  HULL_HALF_WIDTH,
  HULL_OUTLINE,
  SHIP_SCALE,
  SHIP_LENGTH_SCALE,
  SHIP_HEIGHT_SCALE,
  SEA_SCALE,
  hullContact,
  iceRelative,
  shipPose,
} from '../shared/navigation';
import {
  icebergGeometry,
  createIceberg,
  setCrewCamera,
  createHullScar,
} from '../src/graphics/encounter';
import { LEVEL_Y } from '../shared/world';

function voyage(seed = 104) {
  const r = new Room('ICETST', seed);
  for (let i = 0; i < 4; i++) r.addPlayer(`Crew ${i}`, `${i}`).ready = true;
  r.start(r.host);
  r.nextEvent = Infinity;
  r.nextTelegram = Infinity;
  return r;
}
test('a complete seeded ice field includes scenery and genuine near misses before the approach', () => {
  const a = voyage(),
    b = voyage();
  assert.ok(a.icebergs.length >= 18);
  assert.ok(
    a.icebergs.filter((i) => i.main).length >= 2 && a.icebergs.filter((i) => i.main).length <= 4,
  );
  assert.deepEqual(
    a.icebergs.map(({ id, ...ice }) => ice),
    b.icebergs.map(({ id, ...ice }) => ice),
  );
  assert.ok(a.icebergs.some((i) => Math.abs(i.north) > 800));
  assert.ok(
    a.icebergs.filter(
      (i) =>
        !i.main &&
        Math.abs(i.north) - HULL_HALF_WIDTH - i.radius > 70 &&
        Math.abs(i.north) - HULL_HALF_WIDTH - i.radius < 160,
    ).length >= 2,
  );
  const positions = a.icebergs.map((i) => [i.id, i.west, i.north]);
  a.resolveEncounter = () => {
    throw Error('Ice must not be spawned around the approaching player');
  };
  for (let i = 0; i < 200; i++) a.tick(0.05);
  assert.deepEqual(
    a.icebergs.map((i) => [i.id, i.west, i.north]),
    positions,
  );
});
test('zoom and binoculars leave the same distant ice in snapshots, without target markers', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  r.icebergs = [];
  r.addIce(1800, 80, 46, true);
  const ids = [];
  for (const zoom of [0, 1, 2, 0]) {
    p.input.zoom = zoom;
    p.binoculars = zoom === 2;
    const s = r.snapshot(p.id);
    ids.push(s.icebergs.map((i) => i.id));
    assert.equal(s.icebergs.length, 1);
    assert.ok(!('main' in s.icebergs[0]));
    assert.ok(!('hit' in s.icebergs[0]));
  }
  assert.deepEqual(ids, [ids[0], ids[0], ids[0], ids[0]]);
});
test('head-on contact stops the ship at the visible surface and engines cannot push it through', () => {
  const r = voyage();
  r.icebergs = [];
  r.ship.speed = 22;
  r.addIce(HULL_BOW + 39, 0, 40, true);
  const ice = r.icebergs[0];
  r.checkIcebergs();
  assert.ok(ice.hit);
  assert.ok(r.ship.speed < 1);
  assert.equal(r.ship.impact?.id, 1);
  for (let i = 0; i < 160; i++) {
    r.tick(0.05);
    const contact = hullContact(iceRelative(ice, r.ship), ice.radius * CHART_SCALE);
    assert.ok(contact.gap >= -1e-5, `gap=${contact.gap}`);
  }
  assert.equal(r.ship.impact?.id, 1);
  assert.equal(r.ship.compartments.filter((f) => f > 0).length, 5);
});
test('a glancing strike deflects the hull without repeated damage or passing through solid ice', () => {
  const r = voyage();
  r.icebergs = [];
  r.ship.speed = 21;
  r.addIce(20, HULL_HALF_WIDTH + 39, 40, true);
  r.checkIcebergs();
  assert.ok(r.icebergs[0].hit);
  assert.ok(r.ship.north < 0);
  assert.ok(r.ship.speed > 15);
  const condition = r.ship.hull;
  for (let i = 0; i < 60; i++) r.tick(0.05);
  assert.equal(r.ship.hull, condition);
  assert.equal(r.ship.impact?.id, 1);
  assert.ok(hullContact(iceRelative(r.icebergs[0], r.ship), 40 * CHART_SCALE).gap >= -1e-5);
});
test('the rendered ice waterline has the same radius as contact geometry and is opaque', () => {
  const ice = { id: 'ice', west: 0, north: 0, radius: 46, height: 24, shape: 123 };
  const material = new THREE.MeshStandardMaterial();
  const mesh = createIceberg(ice, material);
  assert.equal(mesh.material.transparent, false);
  assert.equal(mesh.material.opacity, 1);
  const position = mesh.geometry.getAttribute('position');
  let count = 0;
  for (let i = 0; i < position.count; i++)
    if (Math.abs(position.getY(i)) < 1e-6) {
      assert.ok(
        Math.abs(Math.hypot(position.getX(i), position.getZ(i)) - ice.radius * SEA_SCALE) < 1e-5,
      );
      count++;
    }
  assert.equal(count, 48);
  assert.ok(HULL_OUTLINE.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)));
  mesh.geometry.dispose();
});
test('the larger ship carries the eye and ceiling together throughout the sinking sequence', () => {
  const ship = new THREE.Group(),
    camera = new THREE.PerspectiveCamera();
  ship.scale.set(SHIP_SCALE, SHIP_HEIGHT_SCALE, SHIP_LENGTH_SCALE);
  for (const level of [-2, -1, 0, 1, 2] as const)
    for (const t of [0, 0.15, 0.35, 0.6, 0.85, 1]) {
      const pose = shipPose(t);
      ship.position.y = pose.heave;
      ship.rotation.set(pose.pitch, 0, pose.roll);
      ship.updateMatrixWorld(true);
      const position = { x: 2, z: -20, level },
        floor = ship.localToWorld(new THREE.Vector3(2, LEVEL_Y[level], -20));
      setCrewCamera(camera, ship, position, 0, 0);
      assert.ok(Math.abs(camera.position.distanceTo(floor) - 1.68) < 1e-6);
      const roof = ship.localToWorld(new THREE.Vector3(2, LEVEL_Y[level] + 3.25, -20));
      assert.ok(camera.position.distanceTo(roof) > 1.9);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
        deckUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quaternion);
      assert.ok(up.distanceTo(deckUp) < 1e-6);
    }
  assert.ok(Math.abs(shipPose(1).pitch) > 0.6);
  assert.ok(shipPose(1).heave < -40);
  assert.ok(BALANCE.evacuationSeconds >= 24);
});

test('all iceberg silhouettes remain inside their solid contact envelope', () => {
  for (let shape = 0; shape < 60; shape++) {
    const geometry = icebergGeometry({ radius: 46, height: 25, shape }),
      p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= 46 * SEA_SCALE + 1e-5);
    geometry.dispose();
  }
});
test('damage follows the curved bow surface instead of leaving a floating flat patch', () => {
  const impact = {
    id: 1,
    at: 1,
    point: { x: 0, z: -38 },
    normal: { x: 0, z: -1 },
    strength: 1,
    speed: 22,
  };
  const scar = createHullScar(impact, new THREE.MeshStandardMaterial());
  const mesh = scar.children.find(
    (o) => o instanceof THREE.Mesh && o.geometry.type === 'BufferGeometry',
  ) as THREE.Mesh;
  const p = mesh.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const contact = hullContact({ x: p.getX(i), z: p.getZ(i) }, 0, HULL_OUTLINE);
    assert.ok(contact.gap >= 0 && contact.gap < 0.05);
  }
});
