#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MARKER = 'REEL_ASCENT_MAP_EDITOR_V1';
const root = path.resolve(process.argv[2] || process.cwd());
const mountainPath = path.join(root, 'src', 'world', 'mountain-v2.js');
const runtimePath = path.join(root, 'src', 'world', 'map-editor-runtime.js');
const patchPath = path.join(root, 'src', 'world', 'map-editor-patch.json');

function fail(message) {
  console.error(`\nMap editor installer stopped: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(mountainPath)) fail(`Could not find ${path.relative(root, mountainPath)}. Run this from the Reel Ascent project root.`);
if (!fs.existsSync(runtimePath)) fail('src/world/map-editor-runtime.js is missing. Copy/unzip the editor package into the project root first.');
if (!fs.existsSync(patchPath)) fail('src/world/map-editor-patch.json is missing. Copy/unzip the editor package into the project root first.');

let source = fs.readFileSync(mountainPath, 'utf8');
if (source.includes(MARKER)) {
  console.log('Reel Ascent map editor hooks are already installed. No changes made.');
  process.exit(0);
}

const original = source;
function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) fail(`Could not locate ${label}. Your mountain-v2.js has changed; installer refused to guess.`);
  if (source.indexOf(needle, first + needle.length) >= 0) fail(`Found more than one ${label}; installer refused an ambiguous edit.`);
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

// 1) Imports. Keep this block easy to recognize/remove manually.
replaceOnce(
  "import * as pc from 'playcanvas';",
  `import * as pc from 'playcanvas';\n// ${MARKER}: begin\nimport MAP_EDITOR_PATCH from './map-editor-patch.json';\nimport {\n  applyFishingLayoutPatch,\n  applyMapEditorHeight,\n  applyMapEditorProfileHeight,\n  applyWorldObjectPatch,\n  installMapEditorBridge,\n  terrainTriangleIsCut\n} from './map-editor-runtime.js';\n// ${MARKER}: end`,
  'PlayCanvas import'
);

// 2) The crown is a separate shell. Remap its BASE to the edited profile while retaining
// the authored 1000-ft summit. This is what lets a +150-ft middle plateau compress the
// green/upper section rather than punching into the unchanged crown.
const crownDefinition = 'const CROWN_BASE_HEIGHT = 215;';
const crownIndex = source.indexOf(crownDefinition);
if (crownIndex < 0) fail('CROWN_BASE_HEIGHT definition');
const crownTailStart = crownIndex + crownDefinition.length;
let crownHead = source.slice(0, crownTailStart);
let crownTail = source.slice(crownTailStart).replace(/\bCROWN_BASE_HEIGHT\b/g, 'MAP_EDITOR_CROWN_BASE_HEIGHT');
crownHead += `\nconst MAP_EDITOR_CROWN_BASE_HEIGHT = applyMapEditorProfileHeight(CROWN_BASE_HEIGHT, MAP_EDITOR_PATCH); // ${MARKER}`;
source = crownHead + crownTail;

// 3) Build one patched fishing layout and use it everywhere the mountain uses the layout:
// basin carving, cave apertures, descriptors, and water exclusion tests.
const fishingBoundary = `]);\n\n// The visible ocean is one annular fishing zone.`;
replaceOnce(
  fishingBoundary,
  `]);\n\nconst EDITOR_FISHING_LAYOUT = Object.freeze(\n  applyFishingLayoutPatch(FISHING_LAYOUT, MAP_EDITOR_PATCH).map((location) => Object.freeze(location))\n); // ${MARKER}\n\n// The visible ocean is one annular fishing zone.`,
  'end of FISHING_LAYOUT'
);
const fishingReplacements = [
  ['for (const basin of FISHING_LAYOUT)', 'for (const basin of EDITOR_FISHING_LAYOUT)'],
  ['return FISHING_LAYOUT.some((cave)', 'return EDITOR_FISHING_LAYOUT.some((cave)'],
  ['for (const cave of FISHING_LAYOUT)', 'for (const cave of EDITOR_FISHING_LAYOUT)'],
  ['Object.freeze(FISHING_LAYOUT.map((location)', 'Object.freeze(EDITOR_FISHING_LAYOUT.map((location)'],
  ['return FISHING_LAYOUT.some((water)', 'return EDITOR_FISHING_LAYOUT.some((water)']
];
for (const [needle, replacement] of fishingReplacements) {
  if (!source.includes(needle)) fail(`expected fishing-layout use: ${needle}`);
  source = source.split(needle).join(replacement);
}

// 4) Apply vertical profile + local raise/lower strokes at the canonical terrain function.
replaceOnce(
  'return applyCoreRestTerraces(angle, radius, height);',
  'return applyMapEditorHeight(applyCoreRestTerraces(angle, radius, height), angle, radius, MOUNTAIN_CENTER, MAP_EDITOR_PATCH);',
  'terrainHeightAt final return'
);

// 5) Make ordinary water surfaces follow the edited basin floor. Cave water follows the
// edited elevation of its entrance. Summit remains explicitly authored at 1000 ft.
replaceOnce(
  'const entranceY = rawTerrainHeightAt(location.angle, entranceRadius);',
  'const entranceY = applyMapEditorHeight(rawTerrainHeightAt(location.angle, entranceRadius), location.angle, entranceRadius, MOUNTAIN_CENTER, MAP_EDITOR_PATCH);',
  'cave entrance height'
);
replaceOnce(
  'return rawTerrainHeightAt(location.angle, location.radius) - location.basinDepth + .45;',
  'return terrainHeightAt(location.angle, location.radius) + .45;',
  'ordinary water surface height'
);

// 6) Cut-core brush removes the same terrain faces from render and Rapier collision because
// visibleTriangles is already shared by both paths.
replaceOnce(
  'return !triangleIntersectsCaveEntrance(a, b, c);',
  'return !triangleIntersectsCaveEntrance(a, b, c)\n        && !terrainTriangleIsCut(a, b, c, MOUNTAIN_CENTER, MAP_EDITOR_PATCH);',
  'terrain visible-triangle filter'
);

// The crown shell has its own cave-side triangle filter. Apply cuts there too so a cut near
// the upper mountain does not mysteriously stop at the core/crown seam.
const crownFilter = `!triangleIntersectsCaveEntrance(\n        vertices[triangle[0]], vertices[triangle[1]], vertices[triangle[2]]\n      )`;
if (source.includes(crownFilter)) {
  source = source.replace(crownFilter,
    `${crownFilter}\n      && !terrainTriangleIsCut(vertices[triangle[0]], vertices[triangle[1]], vertices[triangle[2]], MOUNTAIN_CENTER, MAP_EDITOR_PATCH)`);
}

// 7) Existing-rock hide/move overrides and new editor objects happen after base world build.
replaceOnce(
  'this.setActiveLocation(this.activeLocationId);',
  `this.setActiveLocation(this.activeLocationId);\n    applyWorldObjectPatch(this, MAP_EDITOR_PATCH, MOUNTAIN_CENTER);\n    installMapEditorBridge(this, MAP_EDITOR_PATCH); // ${MARKER}`,
  'MountainWorld final setActiveLocation call'
);

const backupPath = mountainPath.replace(/\.js$/, '.pre-map-editor.js');
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
fs.writeFileSync(mountainPath, source, 'utf8');

console.log('Installed Reel Ascent Map Editor v1 hooks.');
console.log(`Backup: ${path.relative(root, backupPath)}`);
console.log('Next: npm run dev');
console.log('Editor: http://localhost:5173/tools/map-editor/');
console.log('Game console snapshot: __REEL_ASCENT_MAP_EDITOR__.downloadSnapshot()');
