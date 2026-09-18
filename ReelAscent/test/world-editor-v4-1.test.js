import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import SCENE from '../src/world/library-island-v2.scene.json' with { type: 'json' };
import { stockLibraryScene } from '../src/world/library-shelf-stocking.js';
import { SATELLITE_WORLD_LOCATIONS } from '../src/world/world-locations.js';
import { cutRectangularOpeningInBox, makeBookshelfPrefab } from '../tools/map-editor/architectural-tools.js';
import { adaptLibrarySceneToEditor, libraryProductionTerrain } from '../tools/map-editor/library-scene-adapter.js';
import { makeProductionIslandEditorLevel, productionIslandEditorIds } from '../tools/map-editor/production-island-adapter.js';
import {
  duplicateObjectRecords, rangeObjectSelection, selectionPivot,
  transformObjectRecords, updateObjectSelection
} from '../tools/map-editor/selection-tools.js';
import { WORLD_EDITOR_WORLDS } from '../tools/map-editor/world-registry.js';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const item = (id, x = 0) => ({ kind: 'world-object', id, transform: { position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, size: { x: 1, y: 1, z: 1 } });

test('v4.1 multi-selection supports toggle/range, pivots, group transforms, and unique duplicate IDs', () => {
  let selection = updateObjectSelection([], item('a'), 'replace');
  selection = updateObjectSelection(selection, item('b'), 'add');
  selection = updateObjectSelection(selection, item('a'), 'toggle');
  assert.deepEqual(selection.map((entry) => entry.id), ['b']);
  const ordered = [item('a'), item('b'), item('c'), item('d')];
  selection = rangeObjectSelection(ordered, 'b', 'd');
  assert.deepEqual(selection.map((entry) => entry.id), ['b', 'c', 'd']);
  const records = [item('a', 0), item('b', 4)];
  assert.deepEqual(selectionPivot(records, records[1], 'center'), { x: 2, y: 0, z: 0 });
  assert.deepEqual(selectionPivot(records, records[1], 'active'), { x: 4, y: 0, z: 0 });
  const moved = transformObjectRecords(records, { translation: { x: 1, y: 2, z: 3 } }).records;
  assert.deepEqual(moved.map((entry) => entry.transform.position), [{ x: 1, y: 2, z: 3 }, { x: 5, y: 2, z: 3 }]);
  const copies = duplicateObjectRecords(records, (_record, index) => `copy-${index}`);
  assert.deepEqual(copies.map((entry) => entry.id), ['copy-0', 'copy-1']);
  assert.equal(new Set(copies.map((entry) => entry.id)).size, copies.length);
});

test('v4.1 exposes every physical production island while excluding the virtual Bluewater boat', () => {
  const physical = SATELLITE_WORLD_LOCATIONS.filter((location) => location.dock?.virtual !== true).map((location) => location.id);
  const represented = new Set(WORLD_EDITOR_WORLDS.map((world) => world.runtimeLocationId));
  for (const id of physical) assert.ok(represented.has(id), `${id} should have an editor world`);
  assert.equal(represented.has('bluewater-reach'), false);
  for (const id of productionIslandEditorIds()) {
    const level = makeProductionIslandEditorLevel(id);
    assert.equal(level.terrain.mode, 'production-island-terrain');
    assert.ok(level.terrain.positions.length > 100);
    assert.ok(level.terrain.indices.length > 100);
  }
});

test('v4.1 Library uses the actual generated island terrain and dense, structurally complete shelves', () => {
  const terrain = libraryProductionTerrain();
  const level = adaptLibrarySceneToEditor(SCENE);
  assert.equal(level.terrain.mode, 'production-island-terrain');
  assert.deepEqual(level.terrain.positions, terrain.positions);
  assert.deepEqual(level.terrain.indices, terrain.indices);
  const stocked = stockLibraryScene(SCENE, { density: .92 }).prefabs['shelf-bay'];
  const books = stocked.parts.filter((part) => part.metadata?.generatedStocking);
  assert.ok(books.length >= 40);
  assert.ok(stocked.parts.filter((part) => /shelf/i.test(`${part.id} ${part.name}`)).length >= 5);
  assert.ok(stocked.parts.some((part) => /frame-left/.test(part.id)));
  assert.ok(stocked.parts.some((part) => /frame-right/.test(part.id)));
  const generated = makeBookshelfPrefab({ id: 'acceptance-shelf', shelfCount: 5, bookDensity: 'packed' });
  assert.ok(generated.objects.filter((part) => part.category === 'books').length >= 30);
  assert.ok(generated.objects.filter((part) => /shelf/.test(part.id)).length >= 6);
});

test('v4.1 rectangular cutouts honor different offsets and preserve collision around each hole', () => {
  const slab = { id: 'slab', name: 'slab', transform: { position: { x: 0, y: 3, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, size: { x: 12, y: .25, z: 9 }, collision: true };
  const left = cutRectangularOpeningInBox(slab, { id: 'left', thicknessAxis: 'y', center: { x: -3, y: 3, z: 1 }, size: { x: 2, z: 2 } });
  const right = cutRectangularOpeningInBox(slab, { id: 'right', thicknessAxis: 'y', center: { x: 3, y: 3, z: -1 }, size: { x: 2, z: 2 } });
  assert.notDeepEqual(left.map((piece) => piece.transform.position), right.map((piece) => piece.transform.position));
  assert.equal(new Set([...left, ...right].map((piece) => piece.id)).size, 8);
  for (const [pieces, center] of [[left, { x: -3, z: 1 }], [right, { x: 3, z: -1 }]]) {
    assert.ok(pieces.every((piece) => piece.collision === true));
    assert.equal(pieces.some((piece) => Math.abs(center.x - piece.transform.position.x) < piece.size.x / 2 && Math.abs(center.z - piece.transform.position.z) < piece.size.z / 2), false);
  }
});

test('v4.1 UI exposes orbit, frame, multi-select, pivot, book, and placed-cutout controls without touching Stoneveil', async () => {
  const [html, main, scene, patch] = await Promise.all([
    source('tools/map-editor/index.html'), source('tools/map-editor/main.js'), source('tools/map-editor/generic-scene.js'),
    readFile(new URL('../src/world/map-editor-patch.json', import.meta.url))
  ]);
  for (const id of ['orbit-view-surface', 'frame-selected', 'frame-world', 'selection-pivot-mode', 'select-same-type', 'select-same-source', 'hide-library-books', 'opening-offset-u', 'opening-offset-v', 'opening-snap']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(main, /entitiesInScreenRect/);
  assert.match(main, /objectPickCycle/);
  assert.match(main, /cancelRectangularOpening/);
  assert.match(scene, /setTransformGizmo/);
  assert.match(scene, /setCutoutPreview/);
  assert.equal(createHash('sha256').update(patch).digest('hex').toUpperCase(), '815674C382C711CF9DEF2D4FF07AC7DCC205B0E472DAA67A284B23516474E5DD');
});
