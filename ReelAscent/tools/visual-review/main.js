import * as pc from 'playcanvas';
import { FISH_SPECIES, createFishSpecimenForCategories } from '../../src/fishing/fish-data.js';
import { createSpecimenModel, destroySpecimenModel } from '../../src/fishing/specimen-model.js';
import { createCharacterModel } from '../../src/player/character-model.js';
import { DEFAULT_APPEARANCE } from '../../src/player/appearance.js';
import { COSMETIC_BY_ID } from '../../src/progression/cosmetics.js';
const canvas = document.querySelector('canvas'), status = document.querySelector('#status');
window.addEventListener('error', e => { status.textContent = e.message; });
const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: true } });
app.scene.ambientLight = new pc.Color(.6, .68, .64); app.setCanvasResolution(pc.RESOLUTION_AUTO);
const camera = new pc.Entity('Model review camera', app); camera.addComponent('camera', { projection: pc.PROJECTION_ORTHOGRAPHIC, orthoHeight: 4.6, clearColor: new pc.Color(.045, .12, .135), farClip: 100 }); camera.setPosition(0, 0, 20); camera.lookAt(0, 0, 0); app.root.addChild(camera);
const light = new pc.Entity('Studio light', app); light.addComponent('light', { type: 'directional', intensity: 1.6, color: new pc.Color(1, .91, .76) }); light.setEulerAngles(35, -35, 0); app.root.addChild(light);
const fill = new pc.Entity('Studio fill', app); fill.addComponent('light', { type: 'directional', intensity: .65, color: new pc.Color(.58, .78, 1) }); fill.setEulerAngles(-25, 150, 0); app.root.addChild(fill);
const sets = {
  mythic: ['summit-water-dragon', 'lernaean_hydra', 'jormungandr', 'frost-wyrm', 'lusca', 'sea-serpent', 'hippocampus', 'umibozu', 'undine', 'seahorse', 'lake-monster', 'taniwha'],
  wildlife: ['vampire_squid', 'chambered_nautilus', 'sea-star', 'sea-urchin', 'diving_bell_spider', 'blue_dragon_sea_slug', 'giant_pacific_octopus', 'horseshoe-crab', 'leafy_seadragon', 'giant_caribbean_anemone', 'moon-jelly', 'pond-snail'],
  cosmetics: ['cowboy-hat', 'bucket-hat', 'wizard-hat', 'catch-giant_pacific_octopus', 'catch-axolotl', 'catch-mermaid', 'casino-coin-halo', 'scarf', 'catch-jormungandr', 'catch-manta_ray', 'catch-japanese_spider_crab', 'catch-green_sea_turtle'],
  basics: ['trail-hat', 'beanie', 'fishing-cap', 'catch-coelacanth', 'glasses', 'round-glasses', 'aviators', 'goggles', 'scarf', 'necklace', 'daypack', 'rain-cape']
  ,rewards: ['catch-frost_wyrm','catch-glass_cave_lobster','catch-blue_whale','catch-giant_squid','catch-blue_ringed_octopus','catch-summit_water_dragon','catch-orca','catch-hippopotamus','catch-horseshoe_crab','catch-leatherback_sea_turtle','catch-mantis_shrimp','catch-bunyip']
};
let entries = [], mode = 'mythic', angle = 0;
function walk(root, callback) { if (root.enabled === false) return; callback(root); for (const child of root.children) walk(child, callback); }
function bounds(root) { let box; walk(root, e => { for (const mi of e.render?.meshInstances ?? []) { if (!box) box = mi.aabb.clone(); else box.add(mi.aabb); } }); return box; }
function layout() {
  app.resizeCanvas();
  const aspect = canvas.clientWidth / canvas.clientHeight, cellWidth = 9.2 * aspect / 4;
  entries.forEach((entry, i) => {
    const root = entry.root; root.setPosition(0, 0, 0); root.setLocalScale(1, 1, 1); root.setLocalEulerAngles(0, entry.yaw + angle, 0);
    const box = bounds(root), extent = box.halfExtents, scale = Math.min((cellWidth - .7) / (extent.x * 2), 1.95 / (extent.y * 2), 1.4);
    root.setLocalScale(scale, scale, scale);
    root.setPosition((i % 4 - 1.5) * cellWidth - box.center.x * scale, 2.1 - Math.floor(i / 4) * 2.8 - box.center.y * scale, -box.center.z * scale);
  });
}
function render(next) {
  mode = next; entries.forEach(e => e.dispose()); entries = []; const labels = document.querySelector('#labels'); labels.replaceChildren();
  for (const id of sets[mode]) {
    let root, label, dispose, yaw = -25;
    if (['cosmetics','basics','rewards'].includes(mode)) {
      root = new pc.Entity(id, app); app.root.addChild(root); const character = createCharacterModel(root);
      const slot = COSMETIC_BY_ID.get(id)?.slot ?? 'headwear';
      character.setAppearance({ ...DEFAULT_APPEARANCE, headwear: 'none', backAccessory: 'none', [slot]: id });
      label = COSMETIC_BY_ID.get(id)?.label ?? id; yaw = slot === 'backAccessory' ? -20 : 155; dispose = () => root.destroy();
    } else {
      const species = FISH_SPECIES.find(s => s.id === id || s.canonicalId === id) ?? FISH_SPECIES.find(s => s.name.toLowerCase().replaceAll(' ', '-') === id);
      if (!species) { const el = document.createElement('div'); el.textContent = `Missing review ID: ${id}`; labels.append(el); continue; }
      const specimen = createFishSpecimenForCategories(species, 2, 2, false, () => .5, 'length');
      const model = createSpecimenModel(specimen, { app, name: species.name }); root = model.root; app.root.addChild(root); label = species.name; dispose = () => destroySpecimenModel(model);
    }
    entries.push({ root, dispose, yaw }); const el = document.createElement('div'); el.textContent = label; labels.append(el);
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode))); layout(); status.textContent = `${entries.length} models · canonical game factories`;
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => render(b.dataset.mode)));
document.querySelector('#rotate').addEventListener('click', () => { angle += 65; layout(); }); window.addEventListener('resize', layout);
app.start(); render(mode);
