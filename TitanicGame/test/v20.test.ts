import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GRAND_STAIR as stair, LEVEL_Y, passengerRoute } from '../shared/layout';
import { canOccupy } from '../shared/world';
import {
  SHIP_HEIGHT_SCALE as H,
  SHIP_LENGTH_SCALE as L,
  SHIP_WIDTH_SCALE as W,
} from '../shared/navigation';
import { buildGrandStaircase } from '../src/graphics/grand-staircase';
import type { ShipMaterials } from '../src/graphics/materials';

test('the upper stair opening is guarded across the returns and alongside both galleries', () => {
  const wood = new T.MeshStandardMaterial();
  const materials = Object.fromEntries(
    ['wood', 'darkWood', 'ivory', 'brass', 'black', 'glow'].map((name) => [name, wood]),
  ) as ShipMaterials;
  const ship = new T.Group();
  ship.scale.set(W, H, L);
  buildGrandStaircase(ship, materials);
  ship.updateMatrixWorld(true);
  const guards: T.Object3D[] = [];
  const supports: T.Object3D[] = [];
  ship.traverse((object) => {
    if (object.name === 'grand-solid-guard') guards.push(object);
    if (object.name === 'grand-gallery-support') supports.push(object);
  });
  const z = stair.top * L;
  const check = (x: number, y: number, from: number, d: T.Vector3, meshes = guards) =>
    new T.Raycaster(new T.Vector3(x, y, from), d, 0, 0.5).intersectObjects(meshes).length;
  for (const side of [-1, 1]) {
    for (const y of [0.04, 0.39, 0.6]) {
      assert.ok(check(side * stair.wingX * W, y, z - 0.35, new T.Vector3(0, 0, 1)));
      const x = side * ((stair.wellWidth * W) / 2 + 0.32);
      assert.ok(check(x, y, z + 1, new T.Vector3(-side, 0, 0)));
      assert.ok(check(x, LEVEL_Y[-2] * H + y, z + 1, new T.Vector3(-side, 0, 0), supports));
    }
    assert.ok(!canOccupy({ x: side * stair.wingX, z: stair.top + 0.02, level: 0 }));
    assert.ok(canOccupy({ x: side * stair.wingX, z: stair.approach, level: -2 }));
  }
  assert.equal(check(0, 0.39, z - 0.35, new T.Vector3(0, 0, 1)), 0);
  assert.ok(canOccupy({ ...passengerRoute[0], level: 0 }));
});
