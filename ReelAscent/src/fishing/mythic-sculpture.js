import { modelMesh } from './fish-sculpture.js';
import { sweptTube, sculptedPanel } from '../graphics/sculpted-geometry.js';

export const MYTHIC_SCULPTURES = new Set(['serpent', 'dragon', 'plesiosaur', 'waterhorse', 'wisp', 'lusca']);

export function buildMythicSculpture(root, { archetype, speciesId = '', name, primitive, base, accent, dark, materials }) {
  if (!root._app?.graphicsDevice || !MYTHIC_SCULPTURES.has(archetype)) return false;
  const add = (label, type, p, s, material = base, rotation = {}) => primitive(root, `${name} ${label}`, type,
    { x: p[0], y: p[1], z: p[2] }, { x: s[0], y: s[1], z: s[2] }, material, rotation);
  const mesh = (label, data, material = base) => modelMesh(root, `${name} ${label}`, data, material);
  const tube = (label, points, material = base, sides = 12) => mesh(label, sweptTube(points, sides), material);
  const panel = (label, points, material = accent) => mesh(label, sculptedPanel(points), material);
  const eye = (x, y, z, size = .047) => {
    add('recessed eye', 'sphere', [x, y, z], [size * 1.6, size * 1.3, size], accent);
    add('slit pupil', 'sphere', [x + .015, y, z + Math.sign(z) * size * .38], [size * .38, size, size * .4], dark);
    add('eye catchlight', 'sphere', [x + .022, y + size * .19, z + Math.sign(z) * size * .5], [.012, .012, .009], materials[3]);
  };
  const head = (label, x, y, z, scale = 1, antlers = false) => {
    add(`${label} cranium`, 'sphere', [x, y, z], [.4 * scale, .28 * scale, .3 * scale]);
    add(`${label} cheek`, 'sphere', [x + .08 * scale, y - .06 * scale, z], [.31 * scale, .23 * scale, .34 * scale], accent);
    add(`${label} upper jaw`, 'sphere', [x + .25 * scale, y - .045 * scale, z], [.39 * scale, .135 * scale, .23 * scale]);
    add(`${label} open mouth`, 'sphere', [x + .28 * scale, y - .13 * scale, z], [.3 * scale, .055 * scale, .19 * scale], dark);
    add(`${label} lower jaw`, 'sphere', [x + .22 * scale, y - .17 * scale, z], [.34 * scale, .075 * scale, .21 * scale], accent);
    for (const side of [-1, 1]) {
      eye(x + .11 * scale, y + .075 * scale, z + side * .137 * scale, .048 * scale);
      tube(`${label} swept horn ${side}`, [[x - .07 * scale, y + .08 * scale, z + side * .11 * scale, .052 * scale], [x - .24 * scale, y + .33 * scale, z + side * .19 * scale, .034 * scale], [x - .4 * scale, y + .43 * scale, z + side * .2 * scale, .003]], accent, 8);
      if (antlers) tube(`${label} horn fork ${side}`, [[x - .22 * scale, y + .3 * scale, z + side * .18 * scale, .025 * scale], [x - .19 * scale, y + .45 * scale, z + side * .31 * scale, .002]], materials[3], 7);
      for (let tooth = 0; tooth < 3; tooth += 1) add(`${label} fang`, 'cone', [x + (.15 + tooth * .075) * scale, y - .13 * scale, z + side * .086 * scale], [.025 * scale, .09 * scale, .025 * scale], materials[3], { z: 180 });
    }
  };

  if (archetype === 'lusca') {
    tube('corrupted dorsal mantle', [[-.62, -.06, 0, .04], [-.36, .08, 0, .29], [-.04, .13, 0, .34], [.28, .02, 0, .22]], base, 18);
    add('forward monstrous skull', 'sphere', [.36, -.015, 0], [.59, .4, .54], accent);
    add('dark beaked mouth', 'sphere', [.61, -.16, 0], [.3, .12, .33], dark);
    add('lower beaked jaw', 'sphere', [.58, -.23, 0], [.34, .075, .34], accent);
    for (const side of [-1, 1]) {
      eye(.51, .09, side * .235, .083);
      tube('swept mantle horn', [[.04, .32, side * .19, .065], [-.03, .55, side * .22, .035], [-.24, .66, side * .24, .002]], accent);
      for (let arm = 0; arm < 4; arm += 1) {
        tube(`corrupted curling arm ${side}:${arm}`, Array.from({ length: 22 }, (_, i) => { const t = i / 21; return [-.25 - t * (1 + arm * .11), -.17 - Math.sin(t * Math.PI) * .2 + t * t * (.18 + arm * .04), side * (.1 + arm * .09 + Math.sin(t * 2) * (.13 + arm * .025)), .073 * Math.pow(1 - t, .8) + .004]; }), arm % 2 ? accent : base);
        for (let sucker = 0; sucker < 3; sucker += 1) add('arm sucker', 'sphere', [-.47 - sucker * .17, -.3 - sucker * .025, side * (.16 + arm * .1)], [.055, .025, .045], materials[3]);
      }
      for (let tooth = 0; tooth < 3; tooth += 1) add('beak tooth', 'cone', [.53 + tooth * .06, -.17, side * .115], [.03, .09, .03], materials[3], { z: 180 });
    }
  } else if (archetype === 'waterhorse' && speciesId === 'seahorse') {
    tube('upright seahorse body and curled tail', [[.12, .45, 0, .075], [0, .26, 0, .13], [-.12, -.02, 0, .16], [-.16, -.32, 0, .09], [.05, -.54, 0, .055], [.33, -.49, 0, .035], [.36, -.28, 0, .023], [.2, -.22, 0, .004]], base);
    add('seahorse head', 'sphere', [.2, .49, 0], [.31, .24, .21]);
    tube('tubular snout', [[.27, .46, 0, .06], [.59, .39, 0, .043]], accent);
    for (const side of [-1, 1]) eye(.25, .55, side * .1, .035);
    panel('seahorse dorsal fan', [[-.19, .18, 0], [-.5, .11, 0], [-.46, -.17, 0], [-.2, -.2, 0]]);
    for (let i = 0; i < 5; i += 1) add('seahorse crown spine', 'cone', [.03 - i * .04, .63 - i * .09, 0], [.06, .16, .06], accent);
  } else if (archetype === 'wisp' && /naiad|undine|water-sprite/.test(speciesId)) {
    add('water spirit face', 'sphere', [.32, .52, 0], [.24, .32, .23], accent);
    tube('flowing spirit torso', [[.28, .38, 0, .075], [.1, .12, 0, .16], [-.16, -.15, .03, .12], [-.7, -.3, .11, .045], [-1.15, -.19, .18, .002]], base);
    for (const side of [-1, 1]) {
      eye(.42, .56, side * .09, .032);
      tube('reaching water spirit arm', [[.14, .23, side * .1, .048], [.42, .1, side * .28, .035], [.63, .31, side * .35, .012]], accent);
      tube('flowing water hair', [[.22, .65, side * .07, .055], [-.12, .57, side * .18, .06], [-.53, .21, side * .26, .004]], base);
    }
  } else if (archetype === 'wisp') {
    add('spirit core', 'sphere', [.15, .1, 0], [.43, .43, .39], accent);
    for (let i = 0; i < 7; i += 1) {
      const phase = i * Math.PI * 2 / 7;
      tube(`flowing spirit ribbon ${i}`, Array.from({ length: 18 }, (_, j) => {
        const t = j / 17;
        return [.08 - t * 1.35, .1 + Math.sin(t * 5 + phase) * .28 * t, Math.cos(t * 4 + phase) * .31 * t, .055 * (1 - t) + .002, .025 * (1 - t) + .001];
      }), i % 2 ? base : accent, 8);
    }
  } else if (archetype === 'waterhorse' && /umibozu/.test(speciesId)) {
    add('sea spirit broad shoulders', 'sphere', [0, .1, 0], [.9, .8, .6]);
    add('sea spirit hooded head', 'sphere', [.08, .64, 0], [.53, .6, .48]);
    for (const side of [-1, 1]) {
      eye(.3, .68, side * .15, .06);
      tube(`spirit arm ${side}`, [[0, .3, side * .25, .14], [.12, -.1, side * .58, .12], [.44, -.4, side * .62, .055]], base);
      for (let i = 0; i < 3; i += 1) tube(`shadow wake ${side}:${i}`, [[-.22, -.14, side * .15, .09], [-.7, -.4, side * (.15 + i * .12), .045], [-1.3, -.2 + i * .17, side * (.22 + i * .13), .003]], accent, 8);
    }
  } else if (archetype === 'waterhorse') {
    add('deep chest', 'sphere', [-.16, .04, 0], [1.1, .54, .47]);
    tube('arching equine neck', [[.17, .08, 0, .2], [.38, .35, 0, .18], [.43, .67, 0, .12]]);
    add('equine head', 'sphere', [.55, .7, 0], [.42, .3, .27]);
    add('long muzzle', 'sphere', [.78, .56, 0], [.32, .18, .24], accent);
    for (const side of [-1, 1]) {
      eye(.64, .76, side * .125);
      add('ear', 'cone', [.38, .91, side * .11], [.09, .25, .09], base, { z: 18 });
      for (const x of (/hippocampus|makara/.test(speciesId) ? [.17] : [-.5, .17])) tube(`bent leg ${side}:${x}`, [[x, -.12, side * .16, .08], [x - .14, -.4, side * .24, .057], [x + .08, -.64, side * .28, .045]], accent, 10);
      for (let i = 0; i < 6; i += 1) panel(`kelp mane ${side}:${i}`, [[.35 - i * .09, .77 - i * .1, side * .055], [-.05 - i * .11, .75 - i * .095, side * .1], [.19 - i * .08, .58 - i * .1, side * .065]]);
    }
    tube('curling kelp tail', [[-.61, .03, 0, .1], [-1.02, .17, .1, .075], [-1.36, .42, .14, .04], [-1.22, .63, .17, .003]], accent);
  } else {
    const crocodile = /alligator|crocodile/.test(speciesId), leafy = /leafy_seadragon/.test(speciesId);
    const plesiosaur = archetype === 'plesiosaur', dragon = archetype === 'dragon' && !leafy, hydra = /hydra/.test(speciesId);
    const longSerpent = archetype === 'serpent' && !crocodile, coiled = speciesId === 'jormungandr';
    const body = Array.from({ length: 42 }, (_, i) => {
      const t = i / 41, envelope = Math.pow(Math.sin(Math.PI * (t * .92 + .04)), .7);
      return [coiled ? .42 - t * 1.2 + Math.sin(t * Math.PI * 2.5) * .55 : .42 - t * (longSerpent ? 2.65 : 1.95), crocodile ? -.04 : Math.sin(t * Math.PI * 2) * (longSerpent ? .23 : .12), coiled ? (1 - Math.cos(t * Math.PI * 2.5)) * .5 : Math.sin(t * Math.PI * 2.3) * (longSerpent ? .22 : .07), (.045 + envelope * (plesiosaur ? .25 : crocodile ? .22 : .18)) * (1 - t * .91), (.05 + envelope * .22) * (1 - t * .9)];
    });
    tube('continuous sinuous body', body, base, 16);
    if (crocodile) {
      add('armored skull', 'sphere', [.48, .01, 0], [.43, .28, .4]);
      add('broad snout', 'box', [.77, -.06, 0], [.5, .14, .3], accent);
      for (const side of [-1, 1]) { eye(.52, .15, side * .17); for (const x of [-.65, .12]) tube('splayed crocodile leg', [[x, -.1, side * .13, .065], [x - .1, -.24, side * .34, .055], [x + .07, -.3, side * .48, .035]], accent); }
    } else if (leafy) {
      add('seadragon snout', 'sphere', [.62, .08, 0], [.4, .12, .14], accent);
      for (const side of [-1, 1]) { eye(.49, .18, side * .09, .035); for (let i = 0; i < 9; i += 1) panel(`leaf branch ${side}:${i}`, [[.35 - i * .18, .04, side * .08], [.11 - i * .18, .42 - i * .015, side * .33], [.39 - i * .18, .24, side * .25]]); }
    } else if (plesiosaur) {
      tube('long graceful neck', [[.21, .05, 0, .16], [.6, .24, 0, .13], [.78, .69, 0, .09], [1.12, .84, 0, .075]]);
      head('lake creature', 1.18, .84, 0, .57);
    } else {
      for (let i = 0; i < (hydra ? 3 : 1); i += 1) {
        const z = hydra ? (i - 1) * .39 : 0, y = hydra ? .32 + (i === 1 ? .25 : 0) : .14;
        tube(`curved neck ${i}`, [[.2, .02, 0, .14], [.46, y * .6, z * .7, .11], [.67, y, z, .1]]);
        head(`mythic head ${i}`, .77, y, z, hydra ? .84 : 1, dragon);
      }
    }
    if (!crocodile && !leafy) for (let i = 1; i < 12; i += 1) {
      const p = body[Math.min(40, i * 3)];
      panel(`swept dorsal sail ${i}`, [[p[0] + .1, p[1] + p[4] * .7, p[2]], [p[0] - .13, p[1] + p[4] + .17, p[2]], [p[0] - .23, p[1] + p[4] * .6, p[2]]]);
    }
    if (dragon) for (const side of [-1, 1]) {
      const wing = [[.15, .06, side * .12], [-.02, .42, side * .52], [-.58, .68, side * 1.02], [-.48, .19, side * .87], [-.82, .11, side * .65], [-.54, -.08, side * .3]];
      if (speciesId === 'taniwha') panel('aquatic shoulder sail', [[.2, .02, side * .12], [-.2, .1, side * .7], [-.62, -.13, side * .52], [-.4, -.1, side * .1]]);
      else { panel(`scalloped wing membrane ${side}`, wing); for (const tip of [wing[2], wing[3], wing[4]]) tube(`wing finger ${side}`, [[.15, .06, side * .12, .035], [-.02, .3, side * .45, .025], [...tip, .007]], base, 8); }
      for (const x of [-.65, .17]) tube(`clawed dragon limb ${side}:${x}`, [[x, -.06, side * .13, .075], [x + .08, -.3, side * .34, .05], [x + .24, -.31, side * .41, .035]], base);
    }
    if (plesiosaur || longSerpent) for (const side of [-1, 1]) for (const x of (plesiosaur ? [-.75, .08] : [.12])) panel('swept swimming paddle', [[x + .17, -.08, side * .1], [x + .05, -.18, side * .64], [x - .33, -.19, side * .77], [x - .21, -.08, side * .15]]);
  }
  root._anatomicalEyes = true;
  root._continuousCreature = true;
  return true;
}
