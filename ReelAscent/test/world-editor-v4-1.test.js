import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import SCENE from '../src/world/library-island-v2.scene.json' with { type: 'json' };
import { stockLibraryScene } from '../src/world/library-shelf-stocking.js';
import { SATELLITE_WORLD_LOCATIONS } from '../src/world/world-locations.js';
import { cutRectangularOpeningInBox, makeBookshelfPrefab } from '../tools/map-editor/architectural-tools.js';
import { assetsForWorld } from '../tools/map-editor/asset-library-v3.js';
import { adaptLibrarySceneToEditor, libraryProductionTerrain } from '../tools/map-editor/library-scene-adapter.js';
import { effectiveSmoothStrength } from '../tools/map-editor/generic-scene.js';
import { historyCommandForKey } from '../tools/map-editor/history-shortcuts.js';
import { ensureProductionIslandTerrain, makeProductionIslandEditorLevel, productionIslandEditorIds } from '../tools/map-editor/production-island-adapter.js';
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
    assert.equal(level.terrain.mode, id === 'cave-fishing-island' ? 'authored-triangle-mesh' : 'production-island-terrain');
    assert.ok(level.terrain.positions.length > 100);
    assert.ok(level.terrain.indices.length > 100);
  }
});

test('v4.1 production island editor includes the cabin, shop, aquarium, and shoreline context', async () => {
  const home = makeProductionIslandEditorLevel('home-island');
  const shop = makeProductionIslandEditorLevel('shop-island');
  const aquarium = makeProductionIslandEditorLevel('aquarium-island');
  const homeParts = home.objects.filter((entry) => entry.metadata?.sourceBuilder === 'buildHomeCabin');
  const shopParts = shop.objects.filter((entry) => entry.metadata?.sourceBuilder === 'buildShopOutpost');
  const aquariumParts = aquarium.objects.filter((entry) => entry.metadata?.sourceBuilder === 'buildPublicAquarium');
  assert.equal(home.prefabs.definitions.length, 0);
  assert.equal(home.prefabs.instances.length, 0);
  assert.ok(homeParts.length >= 140);
  assert.equal(home.waters.find((entry) => entry.identity === 'hearthward-pond')?.identity, 'hearthward-pond');
  assert.equal(home.objects.filter((item) => /Hearthward cozy tree/.test(item.name)).length, 18);
  assert.equal(home.objects.filter((item) => /dock pile/.test(item.name)).length, 4);
  assert.equal(homeParts.filter((item) => item.metadata?.benchId === 'hearthward-pond-bench').length, 4);
  assert.equal(homeParts.filter((item) => item.metadata?.editableSign).length, 1);
  assert.equal(shop.prefabs.definitions.length, 0);
  assert.equal(shop.prefabs.instances.length, 0);
  assert.ok(shopParts.length >= 60);
  assert.ok(shopParts.some((item) => item.name === 'Outfitter clerk body'));
  assert.ok(shopParts.some((item) => item.name === 'Old Man fish buyer body'));
  assert.ok(shopParts.some((item) => item.name === 'Fish Market sardine display'));
  assert.equal(shop.objects.filter((item) => item.metadata?.benchId === 'shop-island-shore-bench').length, 4);
  assert.deepEqual(shopParts.filter((item) => item.metadata?.editableSign).map((item) => item.metadata.signText).sort(), ["BUY GEAR", "OUTFITTER'S REACH", "SELL CATCHES"]);
  assert.equal(shopParts.some((item) => /sign letter/i.test(item.name)), false);
  assert.equal(aquarium.prefabs.definitions.length, 0);
  assert.equal(aquarium.prefabs.instances.length, 0);
  assert.ok(aquariumParts.length >= 90);
  assert.equal(aquariumParts.filter((item) => item.metadata.materialKey === 'water').length, 10);
  assert.equal(aquariumParts.filter((item) => item.metadata?.editableSign).length, 1);
  assert.equal(aquarium.objects.filter((item) => item.metadata?.benchId === 'aquarium-island-shore-bench').length, 4);
  assert.equal(aquarium.objects.filter((item) => String(item.metadata?.benchId || '').startsWith('aquarium-visitor-bench-')).length, 18);
  assert.equal(aquarium.objects.filter((item) => /Aquarium garden flower/.test(item.name)).length, 18);
  for (const entry of [...homeParts, ...shopParts, ...aquariumParts]) {
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Number.isFinite(entry.transform.position[axis]), `${entry.id} has a finite ${axis} position`);
      assert.ok(Number.isFinite(entry.transform.rotation[axis]), `${entry.id} has a finite ${axis} rotation`);
    }
  }
  const staleAutosave = structuredClone(home);
  staleAutosave.objects = staleAutosave.objects.filter((entry) => entry.metadata?.sourceBuilder !== 'buildHomeCabin');
  staleAutosave.objects.push({ ...item('USER-AUTHORED-OBJECT'), name: 'User authored object', metadata: {} });
  staleAutosave.prefabs = {
    definitions: [{ id: 'PREFAB-PRODUCTION-HEARTHWARD-CABIN', metadata: { productionReference: true }, objects: [] }],
    instances: [{ id: 'PREFAB-PRODUCTION-HEARTHWARD-CABIN-INSTANCE', prefabId: 'PREFAB-PRODUCTION-HEARTHWARD-CABIN', metadata: { productionReference: true } }]
  };
  ensureProductionIslandTerrain(staleAutosave, 'home-island');
  assert.equal(staleAutosave.prefabs.instances.length, 0);
  assert.equal(staleAutosave.prefabs.definitions.length, 0);
  assert.ok(staleAutosave.objects.filter((entry) => entry.metadata?.sourceBuilder === 'buildHomeCabin').length >= 140);
  assert.ok(staleAutosave.objects.some((entry) => entry.id === 'USER-AUTHORED-OBJECT'));
  const editablePart = staleAutosave.objects.find((entry) => entry.metadata?.sourceBuilder === 'buildHomeCabin');
  editablePart.transform.position.x = 123;
  ensureProductionIslandTerrain(staleAutosave, 'home-island');
  assert.equal(staleAutosave.objects.find((entry) => entry.id === editablePart.id).transform.position.x, 123);
  const oldMan = assetsForWorld('cave-fishing-island').find((asset) => asset.id === 'old-man-fisher-npc-v4');
  assert.ok(oldMan);
  assert.ok(oldMan.definition.objects.length >= 20);
  assert.ok(oldMan.definition.objects.some((item) => item.metadata?.npcRole === 'old-man-fisher'));
  const scene = await source('tools/map-editor/generic-scene.js');
  assert.match(scene, /buildOceanPreview\(\)/);
  assert.match(scene, /OCEAN_SURFACE_Y - rootFloorY/);
  assert.match(scene, /attachEditorSignText/);
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
  assert.match(main, /appendEditableSignTextField/);
  assert.match(main, /commitV3AssetPlacement\(surface\)/);
  assert.match(main, /assetDefinitionFloor/);
  assert.match(main, /items\.length > 20/);
  assert.match(html, /class="action-menu"/);
  assert.match(html, /class="toolbar-menu"/);
  assert.doesNotMatch(main, /canvas\.addEventListener\('dblclick'/);
  assert.match(scene, /setTransformGizmo/);
  assert.match(scene, /setCutoutPreview/);
  assert.equal(createHash('sha256').update(patch).digest('hex').toUpperCase(), '815674C382C711CF9DEF2D4FF07AC7DCC205B0E472DAA67A284B23516474E5DD');
});

test('v4.1 portable assets remain findable and smoothing uses the requested stronger response curve', () => {
  const homeAssets = assetsForWorld('home-island');
  for (const id of ['library-chair-v4', 'old-man-fisher-npc-v4', 'basalt-natural-ledge-v3', 'pirate-watch-scaffold-v3']) {
    assert.ok(homeAssets.some((asset) => asset.id === id), `${id} should be available from every generic-world asset browser`);
  }
  assert.equal(effectiveSmoothStrength(.25), .75);
  assert.equal(effectiveSmoothStrength(6), 24);
});

test('v4.1 terrain history shortcuts preserve both common redo bindings', () => {
  assert.equal(historyCommandForKey({ key: 'z', ctrlKey: true }), 'undo');
  assert.equal(historyCommandForKey({ key: 'Z', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(historyCommandForKey({ key: 'y', ctrlKey: true }), 'redo');
  assert.equal(historyCommandForKey({ key: 'z', shiftKey: true }), null);
});

test('v4.1 production seating mirrors every active island bench and its runtime-facing yaw', () => {
  const expected = {
    'shop-island': { parts: 4, yaw: 235, target: 'ocean' },
    'aquarium-island': { parts: 4, yaw: 175, target: 'ocean' },
    'cave-fishing-island': { parts: 0, yaw: 120, target: 'ocean' },
    'normal-fishing-island': { parts: 4, yaw: -60, target: 'ocean' },
    'cold-island': { parts: 4, yaw: -180, target: 'pond' }
  };
  for (const [worldId, expectation] of Object.entries(expected)) {
    const level = makeProductionIslandEditorLevel(worldId);
    const parts = level.objects.filter((entry) => entry.metadata?.benchId === `${worldId}-shore-bench`);
    assert.equal(parts.length, expectation.parts, `${worldId} should expose all four shore-bench parts`);
    assert.ok(parts.every((entry) => Math.abs(entry.metadata.facingYaw - expectation.yaw) < 1e-8));
    assert.ok(parts.every((entry) => entry.metadata.facesToward === expectation.target));
    assert.ok(parts.every((entry) => Number.isFinite(entry.transform.position.y)));
  }
  const mangrove = makeProductionIslandEditorLevel('normal-fishing-island');
  assert.equal(mangrove.objects.filter((entry) => entry.metadata?.benchId === 'mangrove-lagoon-fishing-log').length, 3);
});
