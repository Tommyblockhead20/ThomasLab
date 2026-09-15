#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] || process.cwd());
const mountainPath = path.join(root, 'src', 'world', 'mountain-v2.js');
const backupPath = path.join(root, 'src', 'world', 'mountain-v2.pre-map-editor.js');
if (!fs.existsSync(backupPath)) {
  console.error('No src/world/mountain-v2.pre-map-editor.js backup was found; nothing restored.');
  process.exit(1);
}
if (fs.existsSync(mountainPath)) {
  const current = fs.readFileSync(mountainPath, 'utf8');
  if (!current.includes('REEL_ASCENT_MAP_EDITOR_V1')) {
    console.error('Current mountain-v2.js does not contain the map-editor marker. Refusing to overwrite newer unrelated work.');
    process.exit(1);
  }
}
fs.copyFileSync(backupPath, mountainPath);
console.log('Restored mountain-v2.js from the pre-map-editor backup. Patch/runtime/editor files were left in place.');
