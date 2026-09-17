import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { WORLD_EDITOR_V3_ASSETS, assetsForWorld } from '../tools/map-editor/asset-library-v3.js';
import { PIRATE_ASSET_LIBRARY, makePirateAssetDefinition } from '../tools/map-editor/pirate-library.js';
import { createPirateIslandTerrain, ensurePirateIslandTerrain } from '../tools/map-editor/pirate-terrain.js';
import {
  bridgeEdgeChains, createFace, deleteFaces, fillBoundary, flattenSelection,
  inflateSelection, makeMeshSelection, meshDiagnostics, subdivideFaces
} from '../tools/map-editor/mesh-authoring.js';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v4 ESB opens with its real GLB visible, status reporting, and automatic framing', async () => {
  const [html, scene, main, registry] = await Promise.all([
    source('tools/map-editor/index.html'), source('tools/map-editor/generic-scene.js'),
    source('tools/map-editor/main.js'), source('tools/map-editor/world-registry.js')
  ]);
  assert.match(scene, /loadFromUrl\('\/assets\/models\/empire-state-building\.glb'/);
  assert.match(scene, /Empire State Building reference loaded/);
  assert.match(scene, /failed to load/);
  assert.match(scene, /findByName\?\.\('ESB'\) \|\| imported/);
  assert.doesNotMatch(html, /id="skyscraper-interior-mode"[^>]*checked/);
  assert.match(main, /detail\.worldId === 'skyscraper'/);
  assert.match(main, /cameraState\.distance = Math\.max/);
  assert.match(registry, /id: 'skyscraper'/);
  assert.ok((await stat(new URL('../public/assets/models/empire-state-building.glb', import.meta.url))).size > 1000);
});

test('v4 shared picking registers stable metadata and ray-tests visible render bounds', async () => {
  const scene = await source('tools/map-editor/generic-scene.js');
  for (const field of ['editorSelectable', 'editorId', 'editorKind', 'editorWorldId', 'editorMeshPartId']) assert.match(scene, new RegExp(field));
  assert.match(scene, /entity\.findComponents\?\.\('render'\)/);
  assert.match(scene, /meshInstance\.aabb/);
  assert.match(scene, /registerSelectable\(root, \{ id: instance\.id/);
  assert.match(scene, /setPickingTargetsVisible/);
});

test('v4 Basalt automatically consumes the actual multi-part production capture and exposes hover', async () => {
  const [world, main, scene] = await Promise.all([
    source('src/world/mountain-v2.js'), source('tools/map-editor/main.js'), source('tools/map-editor/generic-scene.js')
  ]);
  assert.match(world, /appendBasaltProductionFreezePart\('island-core'/);
  assert.match(world, /if \(location\.offshore === 'cave-fishing-island'\)[\s\S]*appendBasaltProductionFreezePart\(name/);
  assert.match(world, /includes: freeze\.parts\.map/);
  assert.match(main, /hydrateCachedBasaltProductionTerrain/);
  assert.match(main, /actual-production-capture/);
  assert.match(scene, /terrainMeshHit\(ray\)/);
  assert.match(scene, /setMeshHover/);
  assert.match(scene, /Hovered face/);
});

test('v4 mesh repair operations serialize real topology changes', () => {
  const base = { positions: [0,0,0, 1,0,0, 1,0,1, 0,0,1, 0,1,0, 1,1,0], indices: [0,1,2, 0,2,3] };
  const selection = makeMeshSelection({ faces: [0], vertices: [0,1,2] });
  const flat = flattenSelection(base, selection, 'y');
  assert.deepEqual([flat.positions[1], flat.positions[4], flat.positions[7]], [0,0,0]);
  const inflated = inflateSelection(base, selection, .1);
  assert.notDeepEqual(inflated.positions, base.positions);
  const subdivided = subdivideFaces(base, new Set([0]));
  assert.equal(subdivided.indices.length / 3, 5);
  const created = createFace(base, [3,4,5]);
  assert.equal(created.indices.length, base.indices.length + 3);
  const deleted = deleteFaces(created, new Set([2]));
  assert.equal(deleted.indices.length, base.indices.length);
  const open = { positions: [0,0,0, 1,0,0, 1,0,1, 0,0,1], indices: [0,1,2, 0,2,3] };
  const loop = meshDiagnostics(open).boundaryLoops.find((item) => item.closed);
  assert.ok(loop);
  assert.ok(fillBoundary(open, loop.vertices).indices.length > open.indices.length);
  const bridged = bridgeEdgeChains({ positions: [0,0,0,1,0,0,0,1,0,1,1,0], indices: [] }, [0,1], [2,3]);
  assert.equal(bridged.indices.length, 6);
});

test('v4 Library catalog is categorized, searchable, and contains completed shelves/fireplaces', async () => {
  const libraryAssets = assetsForWorld('library-island');
  assert.ok(libraryAssets.length >= 35, `expected >=35 Library assets, got ${libraryAssets.length}`);
  const names = libraryAssets.map((asset) => asset.name.toLowerCase()).join(' | ');
  for (const expected of ['corner shelf','fireplace','reading table','armchair','book cart','manuscript','map table','archive cabinet','wall sconce','statue','balcony','secret bookshelf','stair landing']) assert.match(names, new RegExp(expected));
  const shelf = libraryAssets.find((asset) => asset.id === 'athenaeum-shelf-standard-v3').definition;
  for (const token of ['left','right','top','back','shelf','book']) assert.ok(shelf.objects.some((item) => item.id.includes(token)), token);
  const fireplace = libraryAssets.find((asset) => asset.id === 'athenaeum-monumental-fireplace-v3').definition;
  for (const token of ['hearth','left','right','lintel','mantle','back','logs','flame']) assert.ok(fireplace.objects.some((item) => item.id.includes(token)), token);
  const html = await source('tools/map-editor/index.html');
  assert.match(html, /id="v3-asset-search"/);
  assert.ok(WORLD_EDITOR_V3_ASSETS.every((asset) => asset.definition.objects.length > 0));
});

test('v4 Pirate Island uses irregular editable terrain and a substantial selectable kit', () => {
  const terrain = createPirateIslandTerrain();
  assert.equal(terrain.mode, 'authored-triangle-mesh');
  assert.ok(terrain.positions.length / 3 > 50);
  assert.ok(terrain.indices.length / 3 > 80);
  assert.ok(terrain.parts.length >= 3);
  const outer = [];
  for (let offset = 0; offset < 24 * 3; offset += 3) outer.push(Math.hypot(terrain.positions[offset], terrain.positions[offset + 2]));
  assert.ok(new Set(outer.map((value) => value.toFixed(2))).size > 8, 'coastline should not be a rectangle/circle slab');
  assert.ok(new Set(Array.from({length:terrain.positions.length/3},(_,i)=>terrain.positions[i*3+1])).size >= 4);
  const level = ensurePirateIslandTerrain({ worldId:'pirate-island', sourcePolicy:{}, metadata:{}, terrain:null });
  assert.equal(level.sourcePolicy.terrain, 'authored');
  assert.ok(PIRATE_ASSET_LIBRARY.length >= 25);
  for (const asset of PIRATE_ASSET_LIBRARY) {
    const definition = makePirateAssetDefinition(asset.id);
    assert.ok(definition.objects.length > 0, asset.id);
    assert.ok(definition.objects.every((item) => item.id && item.metadata.pirateLibrary), asset.id);
  }
});

test('v4 exposes visible z-fighting results and preserves Stoneveil exactly', async () => {
  const [html, main, patch] = await Promise.all([
    source('tools/map-editor/index.html'), source('tools/map-editor/main.js'),
    readFile(new URL('../src/world/map-editor-patch.json', import.meta.url))
  ]);
  for (const token of ['Scan Z-Fighting','Focus pair','Select A','Select B','Offset A','Offset B','Merge Coplanar','Delete Exact Duplicate','Ignore pair']) assert.ok(html.includes(token) || main.includes(token), token);
  assert.match(main, /setDiagnosticPair/);
  assert.equal(createHash('sha256').update(patch).digest('hex').toUpperCase(), '815674C382C711CF9DEF2D4FF07AC7DCC205B0E472DAA67A284B23516474E5DD');
});
