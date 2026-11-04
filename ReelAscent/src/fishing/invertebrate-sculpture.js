import { modelMesh } from './fish-sculpture.js';
import { sweptTube, sculptedPanel } from '../graphics/sculpted-geometry.js';

export const INVERTEBRATE_SCULPTURES = new Set(['squid', 'cuttlefish', 'nautilus', 'snail', 'bivalve', 'clam', 'mussel', 'oyster', 'scallop', 'starfish', 'urchin', 'insect', 'arachnid', 'horseshoe', 'softbody']);

export function buildInvertebrateSculpture(root, { archetype, speciesId = '', name, primitive, base, accent, dark, materials }) {
  if (!root._app?.graphicsDevice || !INVERTEBRATE_SCULPTURES.has(archetype)) return false;
  const add = (label, type, p, s, material = base, rotation = {}) => primitive(root, `${name} ${label}`, type, { x: p[0], y: p[1], z: p[2] }, { x: s[0], y: s[1], z: s[2] }, material, rotation);
  const tube = (label, points, material = base, sides = 10) => modelMesh(root, `${name} ${label}`, sweptTube(points, sides), material);
  const panel = (label, points, material = accent) => modelMesh(root, `${name} ${label}`, sculptedPanel(points, .015), material);
  const eye = (p, size = .06) => { add('eye socket', 'sphere', p, [size * 1.4, size * 1.4, size], materials[3]); add('pupil', 'sphere', [p[0] + .02, p[1], p[2] + Math.sign(p[2]) * size * .35], [size * .7, size, size * .55], dark); };
  if (['squid', 'cuttlefish'].includes(archetype)) {
    tube('tapered muscular mantle', [[-.94, .04, 0, .008], [-.7, .06, 0, .13], [-.37, .05, 0, .23], [.02, .02, 0, .22], [.2, 0, 0, .14]], base, 20);
    add('head collar', 'sphere', [.24, -.02, 0], [.31, .25, .33]);
    for (const side of [-1, 1]) {
      eye([.27, .035, side * .15], .08);
      panel(`mantle fin ${side}`, [[-.83, .06, side * .06], [-.58, .04, side * .4], [-.07, .02, side * .24], [.05, .02, side * .15]]);
    }
    for (let arm = 0; arm < 8; arm += 1) {
      const angle = arm / 8 * Math.PI * 2;
      tube(`curved tapered arm ${arm}`, Array.from({ length: 14 }, (_, i) => { const t = i / 13, r = .09 + t * .2; return [.3 + t * .72, -.03 + Math.cos(angle) * r - t * t * .09, Math.sin(angle) * r, .045 * (1 - t) + .003]; }), arm % 2 ? base : accent);
      if (/vampire/.test(speciesId)) panel(`vampire arm web ${arm}`, [[.25, 0, 0], [.69, Math.cos(angle) * .24 - .07, Math.sin(angle) * .24], [.69, Math.cos(angle + Math.PI / 4) * .24 - .07, Math.sin(angle + Math.PI / 4) * .24]], base);
    }
    if (!/vampire/.test(speciesId)) for (const side of [-1, 1]) tube('long feeding tentacle', [[.31, -.09, side * .04, .025], [.91, -.21, side * .17, .017], [1.37, -.1, side * .2, .04], [1.48, -.04, side * .19, .002]], accent);
  } else if (['snail', 'nautilus'].includes(archetype)) {
    const nautilus = archetype === 'nautilus';
    tube('continuous spiral shell', Array.from({ length: 74 }, (_, i) => { const t = i / 73, angle = t * Math.PI * 4.6, radius = .025 + .36 * t; return [-.06 + Math.cos(angle) * radius, .16 + Math.sin(angle) * radius, 0, .025 + t * .115, .024 + t * .15]; }), base, 14);
    for (let rib = 0; rib < 15; rib += 1) {
      const phase = rib / 15 * Math.PI * 2, radius = .37;
      add('shell growth rib', 'sphere', [-.06 + Math.cos(phase) * radius, .16 + Math.sin(phase) * radius, .075], [.045, .1, .16], accent, { z: phase * 180 / Math.PI });
    }
    add('muscular foot', 'sphere', [nautilus ? .3 : .17, -.2, 0], [nautilus ? .44 : .88, nautilus ? .22 : .16, .28], accent);
    add('head', 'sphere', [.52, -.09, 0], [.25, .22, .27], accent);
    for (const side of [-1, 1]) {
      if (nautilus) eye([.5, -.04, side * .14], .048);
      else { tube('eye stalk', [[.55, -.04, side * .08, .025], [.69, .19, side * .14, .015]], accent); eye([.7, .2, side * .145], .038); }
    }
    if (nautilus) for (let i = 0; i < 12; i += 1) tube(`fine nautilus tentacle ${i}`, [[.59, -.1, 0, .018], [.9, -.1 + Math.sin(i) * .15, Math.cos(i) * .19, .012], [1.12, -.05 + Math.sin(i) * .22, Math.cos(i) * .25, .002]], accent, 7);
  } else if (['clam', 'oyster', 'mussel', 'scallop', 'bivalve'].includes(archetype)) {
    add('lower cupped shell', 'sphere', [0, -.07, 0], [.92, .21, .71]);
    add('pearl interior', 'sphere', [.08, .045, 0], [.71, .1, .56], materials[3]);
    add('raised upper shell', 'sphere', [-.09, .17, 0], [.88, .16, .67], accent, { z: 22 });
    for (let rib = 0; rib < 11; rib += 1) { const angle = -.9 + rib / 10 * 1.8; tube('radiating shell ridge', [[-.35, .12, 0, .013], [.03, .25, Math.sin(angle) * .22, .018], [.34, .34, Math.sin(angle) * .31, .009]], base, 7); }
    if (/pearl/.test(speciesId)) add('pearl', 'sphere', [.13, .13, 0], [.19, .19, .19], materials[3]);
  } else if (archetype === 'starfish') {
    add('central star disc', 'sphere', [0, 0, 0], [.46, .46, .16]);
    for (let arm = 0; arm < 5; arm += 1) { const a = arm / 5 * Math.PI * 2; tube(`tapered star arm ${arm}`, Array.from({ length: 10 }, (_, i) => { const t = i / 9, r = .13 + t * .62; return [Math.cos(a) * r, Math.sin(a) * r, 0, .065 * (1 - t) + .006, .14 * (1 - t) + .009]; }), base); for (let i = 0; i < 5; i += 1) add('star dermal bump', 'sphere', [Math.cos(a) * (.22 + i * .1), Math.sin(a) * (.22 + i * .1), .07], [.035, .035, .035], accent); }
  } else if (archetype === 'urchin') {
    add('urchin test', 'sphere', [0, 0, 0], [.57, .46, .57]);
    for (let i = 0; i < 72; i += 1) { const y = 1 - (i + .5) / 72 * 2, a = i * 2.399963, r = Math.sqrt(1 - y * y); const direction = [Math.cos(a) * r, y, Math.sin(a) * r]; tube(`radial spine ${i}`, [direction.map(v => v * .21).concat(.018), direction.map(v => v * (.52 + i % 3 * .035)).concat(.001)], i % 3 ? accent : dark, 6); }
  } else if (archetype === 'insect' || archetype === 'arachnid') {
    const spider = archetype === 'arachnid';
    add('abdomen', 'sphere', [-.21, .04, 0], [.6, .29, .38]); add('thorax', 'sphere', [.18, .06, 0], [.32, .24, .29], accent); add('head', 'sphere', [.4, .08, 0], [.24, .2, .25]);
    for (const side of [-1, 1]) { eye([.46, .14, side * .1], .035); for (let leg = 0; leg < (spider ? 4 : 3); leg += 1) { const x = .27 - leg * .16; tube(`jointed leg ${side}:${leg}`, [[x, .01, side * .12, .025], [x - .1, .2, side * .48, .02], [x - .26, -.18, side * .72, .008]], dark, 8); } if (!spider) panel(`elytron seam ${side}`, [[-.5, .16, side * .015], [-.12, .21, side * .03], [.12, .16, side * .01], [-.07, .13, side * .2]], accent); }
  } else if (archetype === 'horseshoe') {
    add('horseshoe shield', 'sphere', [.18, .07, 0], [.92, .2, .88]); add('segmented rear shell', 'sphere', [-.34, .01, 0], [.5, .14, .58], accent);
    tube('long rigid telson', [[-.5, .01, 0, .045], [-1.34, .01, 0, .002]], dark);
    for (const side of [-1, 1]) { eye([.35, .16, side * .23], .035); for (let i = 0; i < 5; i += 1) tube('underside leg', [[.15 - i * .12, -.03, side * .1, .025], [.23 - i * .14, -.18, side * .29, .01]], accent, 7); }
  } else if (archetype === 'softbody') {
    const slug = /blue_dragon/.test(speciesId), anemone = /anemone/.test(speciesId), manowar = /man_o_war/.test(speciesId);
    add('soft body', 'sphere', [0, 0, 0], [anemone ? .5 : .98, manowar ? .38 : .21, .35]);
    for (let i = 0; i < (anemone ? 28 : 14); i += 1) { const a = i / (anemone ? 28 : 14) * Math.PI * 2, x = slug ? .37 - Math.floor(i / 2) * .12 : Math.cos(a) * .2, z = slug ? (i % 2 ? 1 : -1) * .13 : Math.sin(a) * .18; tube(`soft tapered frond ${i}`, [[x, .02, z, .03], [x + (slug ? -.12 : Math.cos(a) * .13), manowar ? -.45 : .17, z + (slug ? Math.sign(z) * .12 : Math.sin(a) * .15), .022], [x - .12, manowar ? -.9 - i % 3 * .1 : .25 + i % 5 * .045, z + (slug ? Math.sign(z) * .24 : Math.sin(a) * .25), .003]], accent, 8); }
  }
  root._anatomicalEyes = true; root._continuousCreature = true;
  return true;
}
