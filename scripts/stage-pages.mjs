import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '_site');
const marker = '.thomaslab-pages-output';
const markerText = 'Generated ThomasLab Pages artifact.\n';
const excluded = new Set(['.git', '.github', 'node_modules', '_site']);

function within(parent, name) {
  const path = resolve(parent, name);
  const fromParent = relative(parent, path);
  if (!fromParent || fromParent.startsWith(`..${sep}`) || fromParent === '..' || isAbsolute(fromParent)) {
    throw new Error(`Site path escapes its destination: ${name}`);
  }
  return path;
}

async function regularFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular site file: ${path}`);
  return info;
}

// Replace only this script's own output. Refuse arbitrary or linked directories.
if (output !== resolve(root, '_site') || relative(root, output) !== '_site') throw new Error('Invalid site output directory.');
let previous;
try { previous = await lstat(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous) {
  if (!previous.isDirectory() || previous.isSymbolicLink() || await readFile(join(output, marker), 'utf8').catch(() => '') !== markerText) {
    throw new Error('_site already exists and is not owned by this build. Move it before staging the website.');
  }
  await rm(output, { recursive: true });
}
await mkdir(output);
await writeFile(join(output, marker), markerText);

let count = 0, bytes = 0;
async function copy(relativePath) {
  const source = within(root, relativePath), target = within(output, relativePath);
  const info = await regularFile(source);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  count++; bytes += info.size;
}

// A clean checkout is the publication manifest. Ignore installed dependencies,
// local files and old committed Bass Camp output; copy the fresh build below.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  .split('\0').filter(Boolean);
const siteFiles = tracked.filter(path => !path.split('/').some(part => excluded.has(part)) && !path.startsWith('BassCamp/'));
for (const path of siteFiles) await copy(path);

async function copyBuiltTree(folder) {
  for (const entry of await readdir(within(root, folder), { withFileTypes: true })) {
    const path = `${folder}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Linked files cannot be published: ${path}`);
    if (entry.isDirectory()) await copyBuiltTree(path);
    else await copy(path);
  }
}
await copyBuiltTree('BassCamp');

// Verify all the existing project entrances, the custom domain, and the new
// hashed game assets before handing anything to the publishing job.
const entrances = new Set(['index.html', 'BassCamp/index.html', ...siteFiles.filter(path => /^[^/]+\/index\.html$/.test(path))]);
for (const path of [...entrances, 'CNAME', 'achievements.js', 'webgl-support.js']) await regularFile(within(output, path));
const gameHtml = await readFile(join(output, 'BassCamp/index.html'), 'utf8');
const assets = [...gameHtml.matchAll(/(?:src|href)\s*=\s*["']([^"']*assets\/[^"']+\.(?:js|css))(?:[?#][^"']*)?["']/g)];
if (!assets.some(([, path]) => path.endsWith('.js'))) throw new Error('Bass Camp has no built JavaScript entry. Run its build first.');
for (const [, path] of assets) await regularFile(within(join(output, 'BassCamp'), path));
await writeFile(join(output, '.nojekyll'), '');
console.log(`Prepared ${count} files (${(bytes / 1024 / 1024).toFixed(1)} MiB), including ${entrances.size} site entrances and the fresh Bass Camp build.`);
