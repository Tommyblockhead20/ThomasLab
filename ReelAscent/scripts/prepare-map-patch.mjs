import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const source = new URL('../src/world/map-editor-patch.json', import.meta.url);
const output = new URL('../src/world/map-editor-patch.compact.json', import.meta.url);
const compressed = new URL('../src/world/map-editor-patch.compact.json.gz', import.meta.url);

let current = false;
try {
  const sourceTime = statSync(source).mtimeMs;
  current = statSync(output).mtimeMs >= sourceTime && statSync(compressed).mtimeMs >= sourceTime;
} catch {
  // The compact build asset has not been generated yet.
}

if (!current) {
  const patch = JSON.parse(readFileSync(source, 'utf8'));
  const compact = Buffer.from(JSON.stringify(patch));
  writeFileSync(output, compact);
  writeFileSync(compressed, gzipSync(compact, { level: 9 }));
  console.log('Prepared compact mountain map assets.');
}
