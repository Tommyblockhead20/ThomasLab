#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] || process.cwd());
const mountainPath = path.join(root, 'src', 'world', 'mountain-v2.js');
const marker = 'REEL_ASCENT_MAP_EDITOR_V1_6_CORE_DEFORM';

function fail(message) {
  console.error(`\nMap editor v1.6 upgrade stopped: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(mountainPath)) fail('src/world/mountain-v2.js was not found. Run this from the Reel Ascent project root.');
let source = fs.readFileSync(mountainPath, 'utf8');
if (source.includes(marker)) {
  console.log('Map editor v1.6 core-deformation hook is already installed. No changes made.');
  process.exit(0);
}
if (!source.includes('REEL_ASCENT_MAP_EDITOR_V1')) {
  fail('the original map-editor hooks are not installed. Run node tools/map-editor/install-hooks.mjs first, then rerun this upgrade.');
}

const backupPath = mountainPath.replace(/\.js$/, '.pre-map-editor-v1.6.js');
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, source, 'utf8');

// Add the new runtime import inside the installer-owned import block.
if (!source.includes('applyMapEditorCoreDeformation')) {
  const importNeedle = '  applyMapEditorHeight,';
  if (!source.includes(importNeedle)) fail('could not locate the map-editor runtime import block; refusing to guess.');
  source = source.replace(importNeedle, `  applyMapEditorCoreDeformation,\n${importNeedle}`);
}

// The base mountain already has a good cave-mouth deformation path. Chain the arbitrary
// editor-tunnel deformation after it so existing authored caves remain untouched.
const vertexNeedle = '        const deformed = deformCaveCoreVertex(source[0], source[1], source[2]);';
if (!source.includes(vertexNeedle)) {
  fail('could not locate the terrain vertex cave-deformation line. Your mountain-v2.js changed; no automatic edit was made.');
}
source = source.replace(vertexNeedle,
`        const caveDeformed = deformCaveCoreVertex(source[0], source[1], source[2]);\n        const deformed = applyMapEditorCoreDeformation(this, caveDeformed, source, MOUNTAIN_CENTER, MAP_EDITOR_PATCH); // ${marker}`);

fs.writeFileSync(mountainPath, source, 'utf8');
console.log('Installed Reel Ascent Map Editor v1.6 cave-mouth deformation hook.');
console.log(`Backup: ${path.relative(root, backupPath)}`);
console.log('Restart Vite after this upgrade.');
