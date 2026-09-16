import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const bytes = (path) => readFile(new URL(`../${path}`, import.meta.url));

test('Stoneveil backup is byte-for-byte identical to authoritative patch', async () => {
  const current = await bytes('src/world/map-editor-patch.json');
  const backup = await bytes('src/world/map-editor-patch.v1-backup.json');
  assert.deepEqual(current, backup);
  const patch = JSON.parse(current.toString('utf8'));
  assert.equal(patch.terrain.bakedMesh.format, 'triangle-mesh-v1');
  assert.equal(patch.terrain.bakedMesh.positions.length / 3, 88959);
  assert.equal(patch.terrain.bakedMesh.indices.length / 3, 173535);
});

test('all first-milestone V2 levels use stable schema/world IDs', async () => {
  for (const [file, worldId] of [
    ['cave-fishing-island.json', 'cave-fishing-island'],
    ['skyscraper.json', 'skyscraper'],
    ['pirate-island.json', 'pirate-island']
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

test('World Editor V2 shell exposes all four worlds and moving-platform tools', async () => {
  const registry = await text('tools/map-editor/world-registry.js');
  const html = await text('tools/map-editor/index.html');
  for (const id of ['stoneveil-peak', 'cave-fishing-island', 'skyscraper', 'pirate-island']) {
    assert.match(registry, new RegExp(id));
  }
  assert.match(html, /id="world-selector"/);
  assert.match(html, /data-tool="moving-platform"/);
  assert.match(html, /id="show-slope"/);
  assert.match(html, /id="collision-mode"/);
  assert.match(html, /id="right-resize-handle"/);
  assert.match(html, /id="outliner-search"/);
  assert.doesNotMatch(html, /Raise middle plateau \+150 ft/);
});


test('V2.1 authoring workflow wires compact UI, room workspace, search and snapping', async () => {
  const main = await text('tools/map-editor/main.js');
  const html = await text('tools/map-editor/index.html');
  const css = await text('tools/map-editor/editor.css');
  assert.match(main, /setupResizableRightPanel/);
  assert.match(main, /setupCollapsibleSections/);
  assert.match(main, /enterPrefabWorkspace/);
  assert.match(main, /createTestRoom/);
  assert.match(main, /outlinerFilter/);
  assert.match(main, /gridSnapEnabled/);
  assert.match(main, /routeGroup/);
  assert.match(html, /id="edit-source-prefab"/);
  assert.match(html, /id="create-test-room"/);
  assert.match(css, /--right-panel-width/);
  assert.match(css, /\.outliner-row/);
});
