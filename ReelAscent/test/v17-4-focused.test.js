import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SKYREACH_FISHING_DESCRIPTORS,
  SKYREACH_TOWER_CONFIG
} from '../src/world/mountain-v2.js';
import { GAME_VERSION } from '../src/version.js';

const here = new URL('../', import.meta.url);

function readGlbJson(buffer) {
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

test('v17.4 uses the complete normalized Empire State Building asset', async () => {
  assert.equal(GAME_VERSION, 'v17.4');
  const glb = readGlbJson(await readFile(new URL('public/assets/models/empire-state-building.glb', here)));

  assert.equal(glb.nodes.length, 1);
  assert.equal(glb.nodes[0].name, 'ESB');
  assert.equal(glb.nodes[0].scale, undefined);
  assert.equal(glb.nodes[0].translation, undefined);

  const primitives = glb.meshes.flatMap((mesh) => mesh.primitives);
  const positions = primitives.map((primitive) => glb.accessors[primitive.attributes.POSITION]);
  const indices = primitives.map((primitive) => glb.accessors[primitive.indices]);
  const minimum = positions.reduce((result, accessor) => result.map((value, axis) => Math.min(value, accessor.min[axis])), [Infinity, Infinity, Infinity]);
  const maximum = positions.reduce((result, accessor) => result.map((value, axis) => Math.max(value, accessor.max[axis])), [-Infinity, -Infinity, -Infinity]);

  assert.ok(Math.abs(minimum[0] + maximum[0]) < 1e-6, 'source footprint is centered on X');
  assert.ok(Math.abs(minimum[2] + maximum[2]) < 1e-6, 'source footprint is centered on Z');
  assert.equal(minimum[1], 0, 'source base is normalized to zero');
  assert.ok(Math.abs(maximum[1] - SKYREACH_TOWER_CONFIG.visualSourceSpireHeight) < 1e-6);
  assert.ok(Math.abs(maximum[0] - minimum[0] - SKYREACH_TOWER_CONFIG.visualSourceWidth) < 1e-6);
  assert.ok(Math.abs(maximum[2] - minimum[2] - SKYREACH_TOWER_CONFIG.visualSourceDepth) < 1e-6);
  assert.equal(indices.reduce((total, accessor) => total + accessor.count, 0) / 3, 5736);

  assert.equal(glb.materials.length, 2);
  for (const material of glb.materials) {
    assert.notEqual(material.alphaMode, 'BLEND');
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3], 1);
  }
});

test('Skyreach placement derives center and ground from live render bounds', async () => {
  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  const loader = source.slice(source.indexOf('  loadSkyreachVisualShell(root)'), source.indexOf('  updateKinematics()'));

  assert.match(loader, /meshInstance\.aabb\.clone\(\)/);
  assert.match(loader, /bounds\.add\(meshInstance\.aabb\)/);
  assert.match(loader, /const islandCenter = root\.getPosition\(\)/);
  assert.match(loader, /const minimum = bounds\.getMin\(\)/);
  assert.match(loader, /islandCenter\.x - bounds\.center\.x/);
  assert.match(loader, /islandCenter\.y - SKYREACH_TOWER_CONFIG\.visualGroundEmbed - minimum\.y/);
  assert.match(loader, /islandCenter\.z - bounds\.center\.z/);
  assert.doesNotMatch(loader, /visualSourceCenter|hard.?coded offset/i);

  assert.ok(SKYREACH_TOWER_CONFIG.visualGroundEmbed > 0);
  assert.ok(SKYREACH_TOWER_CONFIG.visualGroundEmbed < .1);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.visualSourceWidth * SKYREACH_TOWER_CONFIG.visualHorizontalScaleX - 32) < 1e-6);
  assert.equal(SKYREACH_TOWER_CONFIG.visualHorizontalScaleZ, SKYREACH_TOWER_CONFIG.visualHorizontalScaleX);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.visualSourceDepth * SKYREACH_TOWER_CONFIG.visualHorizontalScaleZ - SKYREACH_TOWER_CONFIG.depth) < 1e-6);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.visualSourceRoofHeight * SKYREACH_TOWER_CONFIG.visualVerticalScale - 381) < .01);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.visualSourceSpireHeight * SKYREACH_TOWER_CONFIG.visualVerticalScale - SKYREACH_TOWER_CONFIG.spireHeight) < .01);
});

test('the invisible non-climbable collision follows every major setback continuously', async () => {
  const layers = SKYREACH_TOWER_CONFIG.collisionLayers;
  assert.equal(layers.length, 13);
  assert.ok(layers[0].bottom < 0);
  assert.equal(layers[0].width, SKYREACH_TOWER_CONFIG.width);
  assert.ok(Math.abs(layers[0].depth - SKYREACH_TOWER_CONFIG.depth) < .01);
  for (let index = 1; index < layers.length; index += 1) {
    assert.ok(layers[index].bottom <= layers[index - 1].top, `collision layers ${index} and ${index + 1} overlap`);
    assert.ok(layers[index].width <= layers[index - 1].width + .3);
    assert.ok(layers[index].depth <= layers[index - 1].depth + .3);
  }
  assert.ok(layers.at(-1).top >= SKYREACH_TOWER_CONFIG.spireHeight);
  assert.deepEqual(SKYREACH_FISHING_DESCRIPTORS, []);

  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  const builder = source.slice(source.indexOf('  buildSkyreachFoundation(location)'), source.indexOf('  loadSkyreachVisualShell(root)'));
  assert.match(builder, /collisionLayers\.entries\(\)/);
  assert.match(builder, /collision\.render\.enabled = false/);
  assert.match(builder, /collision\.tags\.add\('non-climbable'\)/);
  assert.doesNotMatch(builder, /registerClimbSurface/);
  assert.doesNotMatch(builder, /pool|bathroom|toilet|elevator|moving|route|fountain/i);
});

test('the exporter preserves detail while baking and normalizing the source transform', async () => {
  const exporter = await readFile(new URL('scripts/export-empire-state-building.py', here), 'utf8');
  assert.match(exporter, /transform_apply\(location=True, rotation=True, scale=True\)/);
  assert.match(exporter, /vertex\.co\.x -= center_x/);
  assert.match(exporter, /vertex\.co\.y -= center_y/);
  assert.match(exporter, /vertex\.co\.z -= base_z/);
  assert.match(exporter, /use_selection=True/);
  assert.match(exporter, /export_normals=True/);
  assert.doesNotMatch(exporter, /Decimate|bpy\.data\.(?:objects|meshes)\.remove|delete_edgeloop/);
});
