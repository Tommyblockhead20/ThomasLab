import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const bytes = (path) => readFile(new URL(`../${path}`, import.meta.url));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const STONEVEIL_SHA256 = 'ddf597dc9bdf432f5972ecbecc80b7d2639eba8a14a6c9adc6820b0bf7610623';

test('Stoneveil safety backup is exact and matches authoritative patch when present', async () => {
  const backup = await bytes('src/world/map-editor-patch.v1-backup.json');
  assert.equal(sha256(backup), STONEVEIL_SHA256);
  const patch = JSON.parse(backup.toString('utf8'));
  assert.equal(patch.terrain.bakedMesh.format, 'triangle-mesh-v1');
  assert.equal(patch.terrain.bakedMesh.positions.length / 3, 88959);
  assert.equal(patch.terrain.bakedMesh.indices.length / 3, 173535);
  try {
    const current = await bytes('src/world/map-editor-patch.json');
    assert.deepEqual(current, backup);
  } catch (error) {
    // The downloadable overlay intentionally omits the authoritative patch so merging it
    // cannot overwrite the user's current Stoneveil. In the full repo the comparison above runs.
    if (error?.code !== 'ENOENT') throw error;
  }
});

test('all V2 level records use stable schema/world IDs', async () => {
  for (const [file, worldId] of [
    ['cave-fishing-island.json', 'cave-fishing-island'],
    ['skyscraper.json', 'skyscraper'],
    ['pirate-island.json', 'pirate-island'],
    ['library-island.json', 'library-island']
  ]) {
    const data = JSON.parse(await text(`src/world/world-editor-levels/${file}`));
    assert.equal(data.schema, 2);
    assert.equal(data.kind, 'reel-ascent-world-level');
    assert.equal(data.worldId, worldId);
  }
});

test('editor slope diagnostic reads live PLAYER_CONFIG rather than copied constants', async () => {
  const slope = await text('tools/map-editor/slope-overlay.js');
  const main = await text('tools/map-editor/main.js');
  assert.match(main, /new SlopeOverlay\(app, stoneveilRoot, PLAYER_CONFIG\)/);
  assert.match(slope, /playerConfig\.maxSlopeDegrees/);
  assert.match(slope, /playerConfig\.slideSlopeDegrees/);
  assert.match(slope, /playerConfig\.hardNoStandSlopeDegrees/);
});

test('runtime bridges V2 data into Skyreach and Basalt without replacing their source geometry', async () => {
  const mountain = await text('src/world/mountain-v2.js');
  assert.match(mountain, /SKYREACH_WORLD_EDITOR_LEVEL/);
  assert.match(mountain, /CAVE_FISHING_WORLD_EDITOR_LEVEL/);
  assert.match(mountain, /attachWorldEditorLevelToStructure\(this, root, SKYREACH_WORLD_EDITOR_LEVEL\)/);
  assert.match(mountain, /Basalt Hollow World Editor V2 authored root/);
  assert.match(mountain, /updateWorldEditorKinematics\(this, dt\)/);
});

test('World Editor V2.3.1 shell exposes all five worlds and the new authoring controls', async () => {
  const registry = await text('tools/map-editor/world-registry.js');
  const html = await text('tools/map-editor/index.html');
  for (const id of ['stoneveil-peak', 'cave-fishing-island', 'skyscraper', 'pirate-island', 'library-island']) {
    assert.match(registry, new RegExp(id));
  }
  assert.match(html, /WORLD EDITOR V2\.3\.1/);
  assert.match(html, /id="world-selector"/);
  assert.match(html, /data-tool="moving-platform"/);
  assert.match(html, /id="show-slope"/);
  assert.match(html, /id="collision-mode"/);
  assert.match(html, /id="right-resize-handle"/);
  assert.match(html, /id="outliner-search"/);
  assert.match(html, /id="skyscraper-interior-mode"/);
  assert.match(html, /id="load-basalt-capture"/);
  assert.match(html, /id="pirate-asset-library-section"/);
  assert.doesNotMatch(html, /Raise middle plateau \+150 ft/);
});

test('V2.3.1 keeps compact UI, room workspace, search, snapping and linked-room placement', async () => {
  const main = await text('tools/map-editor/main.js');
  const html = await text('tools/map-editor/index.html');
  const css = await text('tools/map-editor/editor.css');
  assert.match(main, /setupResizableRightPanel/);
  assert.match(main, /setupCollapsibleSections/);
  assert.match(main, /enterPrefabWorkspace/);
  assert.match(main, /placeCompleteLibraryRoom/);
  assert.match(main, /placeLibraryComponent/);
  assert.match(main, /outlinerFilter/);
  assert.match(main, /gridSnapEnabled/);
  assert.match(main, /routeGroup/);
  assert.match(main, /setSkyscraperInteriorMode\(true\)/);
  assert.match(html, /id="edit-source-prefab"/);
  assert.match(html, /id="skyscraper-room-library-section"/);
  assert.match(html, /id="place-complete-room"/);
  assert.match(html, /id="place-room-component"/);
  assert.match(css, /--right-panel-width/);
  assert.match(css, /\.outliner-row/);
});

test('five Skyscraper rooms have authored fishing water and modular components', async () => {
  const { SKYSCRAPER_ROOM_LIBRARY, makeRoomLibraryDefinition } = await import('../tools/map-editor/room-library.js');
  assert.equal(SKYSCRAPER_ROOM_LIBRARY.length, 5);
  for (const room of SKYSCRAPER_ROOM_LIBRARY) {
    assert.ok(room.components.length >= 8, `${room.id} should have at least eight meaningful modules`);
    const definition = makeRoomLibraryDefinition(room.id);
    assert.ok(definition.objects.length >= 20, `${room.id} should be a substantial complete room`);
    assert.ok(definition.waters.length >= 1, `${room.id} needs at least one fishing water`);
    for (const water of definition.waters) {
      assert.ok(water.id && water.identity, `${room.id} water needs stable identity`);
      assert.ok(water.fishIds?.length, `${room.id} water needs a fish pool`);
    }
  }
  const maintenance = makeRoomLibraryDefinition('maintenance');
  assert.deepEqual(maintenance.waters[0].fishIds, ['electric-eel']);
  assert.equal(makeRoomLibraryDefinition('bathroom').waters[0].id, 'skyreach-toilet');
});

test('placed prefab instances render waters and runtime can register prefab fishing zones', async () => {
  const generic = await text('tools/map-editor/generic-scene.js');
  const runtime = await text('src/world/world-editor-v2-runtime.js');
  const mountain = await text('src/world/mountain-v2.js');
  assert.match(generic, /for \(const sourceWater of definition\.waters \?\? \[\]\)/);
  assert.match(generic, /prefab-instance-water/);
  assert.match(runtime, /world\.addWorldEditorPrefabWater/);
  assert.match(mountain, /addWorldEditorPrefabWater\(parentRoot, instance, water\)/);
  assert.match(mountain, /new FishingZone\(/);
});

test('Skyreach is hollow for traversal and editor supports interior cutaway/material roles', async () => {
  const mountain = await text('src/world/mountain-v2.js');
  const generic = await text('tools/map-editor/generic-scene.js');
  assert.match(mountain, /export function skyreachHollowCollisionBoxes/);
  assert.match(mountain, /for \(const box of skyreachHollowCollisionBoxes\(config\)\)/);
  assert.match(mountain, /SKYREACH-HOLLOW-01-NORTH-LEFT/);
  assert.match(mountain, /this\.materials\.skyreachAccent/);
  assert.match(mountain, /this\.materials\.skyreachFacade/);
  assert.match(generic, /skyreachHollowCollisionBoxes/);
  assert.match(generic, /skyscraperInteriorMode/);
  assert.match(generic, /roomGlass/);
  assert.match(generic, /casinoFelt/);
});

test('Basalt exact production capture can be loaded and sculpted as an authored candidate', async () => {
  const mountain = await text('src/world/mountain-v2.js');
  const main = await text('tools/map-editor/main.js');
  const generic = await text('tools/map-editor/generic-scene.js');
  const registry = await text('tools/map-editor/world-registry.js');
  assert.match(mountain, /reel-ascent:world-editor-v2:basalt-production-freeze/);
  assert.match(mountain, /appendBasaltProductionFreezePart\('island-core'/);
  assert.match(mountain, /this\.appendBasaltProductionFreezePart\(name, vertices, triangles\)/);
  assert.match(main, /loadCapturedBasaltFreeze/);
  assert.match(main, /authored-mesh-candidate/);
  assert.match(main, /sculptTriangleMesh/);
  assert.match(generic, /export function sculptTriangleMesh/);
  assert.match(registry, /cave-fishing-island[\s\S]*?'terrain'/);
});

test('Pirate Island exposes a starter modular asset library', async () => {
  const { PIRATE_ASSET_LIBRARY, makePirateAssetDefinition } = await import('../tools/map-editor/pirate-library.js');
  assert.ok(PIRATE_ASSET_LIBRARY.length >= 8);
  for (const id of ['dock-section', 'ship-bow', 'ship-mid', 'ship-stern', 'mast-rig', 'treasure-camp', 'palm-cluster', 'reef-rocks']) {
    const definition = makePirateAssetDefinition(id);
    assert.ok(definition?.objects?.length, `${id} should contain authored pieces`);
  }
});

test('V2.3.1 Stoneveil recovery is project-revision aware and WebGL restore stays in-place', async () => {
  const main = await text('tools/map-editor/main.js');
  assert.match(main, /stoneveilTerrainSignature/);
  assert.match(main, /baseProjectSignature/);
  assert.match(main, /recoveryMatchesCurrentProject/);
  assert.match(main, /stale\/different browser recovery was not auto-applied/);
  assert.match(main, /recoverBrowserAutosaveExplicitly/);
  assert.match(main, /webglcontextlost[\s\S]*?event\.preventDefault\(\)/);
  assert.match(main, /Graphics context restored in-place/);
});

test('V2.3.1 reduces Stoneveil GPU and memory churn during sculpting', async () => {
  const main = await text('tools/map-editor/main.js');
  const slope = await text('tools/map-editor/slope-overlay.js');
  const format = await text('tools/map-editor/patch-format.js');
  assert.match(main, /const terrainRenderState =/);
  assert.match(main, /new pc\.Mesh\(app\.graphicsDevice\)/);
  assert.match(main, /mesh\.setPositions\(data\.positions\)/);
  assert.match(main, /mesh\.update\(pc\.PRIMITIVE_TRIANGLES, true\)/);
  assert.match(main, /Float32Array\.from\(mesh\.positions\)/);
  assert.match(main, /Uint32Array\.from\(mesh\.indices\)/);
  assert.match(main, /localStorage\.removeItem\(STORAGE_KEY\)/);
  assert.match(slope, /scheduleRebuild/);
  assert.match(slope, /180/);
  assert.match(format, /ArrayBuffer\.isView\(value\.positions\)/);
});

