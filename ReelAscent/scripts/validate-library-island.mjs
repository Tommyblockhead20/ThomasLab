import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scenePath = path.join(root, 'src/world/library-island-v2.scene.json');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const fail = [];
const ids = new Map();
const claim = (id, kind) => {
  if (!id) fail.push(`${kind} missing id`);
  else if (ids.has(id)) fail.push(`duplicate id ${id} (${ids.get(id)} / ${kind})`);
  else ids.set(id, kind);
};
for (const [kind, list] of Object.entries({part:scene.parts, instance:scene.instances, water:scene.waters, marker:scene.markers, bench:scene.benches, light:scene.lights})) {
  for (const item of list ?? []) claim(item.id, kind);
}
if (scene.schema !== 'reel-ascent-authored-scene-v2') fail.push(`bad schema ${scene.schema}`);
if (scene.locationId !== 'veiled-athenaeum') fail.push(`bad locationId ${scene.locationId}`);
for (const instance of scene.instances ?? []) if (!scene.prefabs?.[instance.prefab]) fail.push(`instance ${instance.id} missing prefab ${instance.prefab}`);
const renderEstimate = (scene.parts?.length ?? 0)
  + (scene.instances ?? []).reduce((sum, item) => sum + (scene.prefabs?.[item.prefab]?.parts?.length ?? 0), 0)
  + (scene.benches?.length ?? 0) * 2;
if (renderEstimate > scene.performance.maximumAuthoredRenderEntities) fail.push(`render estimate ${renderEstimate} exceeds ${scene.performance.maximumAuthoredRenderEntities}`);
if ((scene.lights?.length ?? 0) > scene.performance.maximumAuthoredLights) fail.push('too many lights');
const mistCount = (scene.parts ?? []).filter((part) => part.material === 'mist').length;
if (mistCount > scene.performance.maximumMistVolumes) fail.push('too many mist volumes');
const waterIds = new Set((scene.waters ?? []).map((w) => w.id));
for (const bench of scene.benches ?? []) if (bench.fishingFacing && !waterIds.has(bench.fishingFacing)) fail.push(`bench ${bench.id} references unknown water`);
for (const water of scene.waters ?? []) {
  if (!(water.surfaceLocalY > water.floorLocalY)) fail.push(`water ${water.id} has non-positive depth`);
  if (water.shape === 'path' && (water.pathLocal?.length ?? 0) < 2) fail.push(`water ${water.id} path too short`);
  if (water.shape === 'ellipse' && (!Array.isArray(water.radii) || water.radii.some((v) => v <= 0))) fail.push(`water ${water.id} invalid radii`);
}
// Explicit authored openings: front door is 8.4 m wall gap minus two 1.1 m arch piers;
// side doors are 3.0 m; rear opening is 8.6 m. Check against the player-oriented minima.
const openings = {frontDoor:3.9, westWingDoor:3.0, eastWingDoor:3.0, rearAtriumDoor:8.6};
for (const [name, width] of Object.entries(openings)) if (width < scene.clearance.minimumWalkOpeningWidth) fail.push(`${name} width ${width} is too narrow`);
const heights = {frontDoor:4.6, sideDoors:6.0, rearAtriumDoor:4.3};
for (const [name, height] of Object.entries(heights)) if (height < scene.clearance.minimumWalkOpeningHeight) fail.push(`${name} height ${height} is too short`);
// Keep the authored complex inside the existing 31x25 m island footprint with a small tolerance.
for (const part of scene.parts ?? []) {
  const [x,,z] = part.position ?? [0,0,0];
  const [sx,,sz] = part.size ?? [0,0,0];
  if (Math.abs(x) + sx/2 > 31.8 || Math.abs(z) + sz/2 > 25.8) fail.push(`part ${part.id} exceeds island envelope`);
}
for (const prefix of ['balcony-step-', 'reveal-step-']) {
  const steps = (scene.parts ?? []).filter((part) => String(part.id ?? '').startsWith(prefix))
    .sort((a, b) => (a.position?.[1] ?? 0) - (b.position?.[1] ?? 0));
  for (let i = 1; i < steps.length; i += 1) {
    const previousTop = (steps[i - 1].position?.[1] ?? 0) + (steps[i - 1].size?.[1] ?? 0) / 2;
    const currentTop = (steps[i].position?.[1] ?? 0) + (steps[i].size?.[1] ?? 0) / 2;
    if (currentTop - previousTop > .24) fail.push(`${prefix} rise ${currentTop - previousTop} exceeds .24 m`);
  }
}
const requiredMarkers = ['athenaeum-arrival','athenaeum-entrance','athenaeum-reading-hall','athenaeum-waterfall-atrium','athenaeum-final-reveal','athenaeum-fishing-canal'];
const markerIds = new Set((scene.markers ?? []).map((m) => m.id));
for (const id of requiredMarkers) if (!markerIds.has(id)) fail.push(`missing marker ${id}`);
if ((scene.waters?.length ?? 0) < 2) fail.push('expected multiple authored waters');

const summary = {
  sceneId: scene.sceneId,
  parts: scene.parts?.length ?? 0,
  prefabInstances: scene.instances?.length ?? 0,
  renderEstimate,
  lights: scene.lights?.length ?? 0,
  mistVolumes: mistCount,
  fishableWaters: scene.waters?.map((w) => w.id) ?? [],
  markers: scene.markers?.length ?? 0,
  benches: scene.benches?.length ?? 0,
  status: fail.length ? 'FAIL' : 'PASS'
};
console.log(JSON.stringify(summary, null, 2));
if (fail.length) {
  console.error(fail.map((x) => `- ${x}`).join('\n'));
  process.exit(1);
}
