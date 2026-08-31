import * as pc from 'playcanvas';
import { resolveSpecies } from './fish-data.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function surface(color, { shiny = false, dark = false } = {}) {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(...color);
  material.emissive = new pc.Color(...(shiny ? color.map((value) => value * .22) : [0, 0, 0]));
  material.emissiveIntensity = shiny ? 1.35 : 1;
  material.gloss = dark ? .72 : shiny ? .9 : .36;
  material.update();
  return material;
}

function primitive(parent, name, type, position, scale, material, rotation = {}) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type, material, castShadows: true, receiveShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

const NATIVE_MODEL_LENGTH = Object.freeze({
  shark: 1.7, dogfish: 1.7, ray: 1.5, skate: 1.5, flatfish: 1.45,
  octopus: 1.35, squid: 1.55, cuttlefish: 1.35, jellyfish: 1.1, anemone: 1, lusca: 1.45, softbody: 1.2,
  crab: 1.2, lobster: 1.55, crayfish: 1.55, shrimp: 1.45, insect: 1.2, arachnid: 1.2, horseshoe: 1.25,
  clam: 1.1, oyster: 1.1, mussel: 1.1, scallop: 1.1, bivalve: 1.1, nautilus: 1.25, snail: 1.25,
  turtle: 1.35, frog: 1.2, salamander: 1.55, starfish: 1.25, urchin: 1,
  serpent: 1.65, dragon: 1.65, plesiosaur: 1.8, waterhorse: 1.7,
  cetacean: 1.75, pinniped: 1.6, sirenian: 1.65, otter: 1.65, beaver: 1.65,
  rodent: 1.55, platypus: 1.6, mammal: 1.65, wisp: 1, eel: 1.65
});

export function specimenDisplayScale(specimen, maximum = Number.POSITIVE_INFINITY) {
  const species = resolveSpecies(specimen?.speciesId, true);
  const archetype = species?.visual?.archetype ?? 'panfish';
  const lengthMeters = clamp((Number(specimen?.length) || 8) * .0254, .04, 30);
  const exactScale = lengthMeters / (NATIVE_MODEL_LENGTH[archetype] ?? 1.45);
  return Math.min(Math.max(.025, exactScale), Number.isFinite(maximum) ? maximum : exactScale);
}

export function createSpecimenModel(specimen, { name = 'Specimen display', maximumScale = Number.POSITIVE_INFINITY } = {}) {
  const species = resolveSpecies(specimen?.speciesId, true);
  const visual = species?.visual ?? {};
  const colors = visual.colors ?? [[.3, .66, .48], [.84, .56, .22]];
  const materials = [
    surface(colors[0] ?? [.3, .66, .48], { shiny: Boolean(specimen?.shiny) }),
    surface(colors[1] ?? [.84, .56, .22], { shiny: Boolean(specimen?.shiny) }),
    surface([.025, .035, .03], { dark: true })
  ];
  const [base, accent, dark] = materials;
  const root = new pc.Entity(name);
  const archetype = visual.archetype ?? 'panfish';
  let tail = null;

  if (['shark', 'dogfish'].includes(archetype)) {
    primitive(root, `${name} shark body`, 'sphere', { x: -.03, y: 0, z: 0 },
      { x: .68, y: .24, z: .22 }, base);
    primitive(root, `${name} shark snout`, 'cone', { x: .65, y: 0, z: 0 },
      { x: .28, y: .23, z: .22 }, base, { z: -90 });
    tail = primitive(root, `${name} shark tail`, 'cone', { x: -.72, y: 0, z: 0 },
      { x: .28, y: .5, z: .08 }, accent, { z: 90 });
    primitive(root, `${name} shark dorsal`, 'cone', { x: -.08, y: .27, z: 0 },
      { x: .2, y: .38, z: .07 }, accent);
  } else if (['ray', 'skate', 'flatfish'].includes(archetype)) {
    primitive(root, `${name} ray disc`, 'sphere', { x: .1, y: 0, z: 0 },
      { x: .58, y: .09, z: .68 }, base);
    primitive(root, `${name} ray head`, 'sphere', { x: .54, y: .02, z: 0 },
      { x: .24, y: .11, z: .28 }, accent);
    tail = primitive(root, `${name} ray tail`, 'cylinder', { x: -.57, y: 0, z: 0 },
      { x: .035, y: .82, z: .035 }, accent, { z: 90 });
  } else if (['cetacean', 'pinniped', 'sirenian', 'otter', 'beaver', 'rodent', 'platypus', 'mammal'].includes(archetype)) {
    primitive(root, `${name} mammal body`, 'sphere', { x: -.05, y: 0, z: 0 },
      { x: .66, y: .27, z: .28 }, base);
    primitive(root, `${name} mammal head`, 'sphere', { x: .57, y: .07, z: 0 },
      { x: .28, y: .24, z: .23 }, accent);
    tail = primitive(root, `${name} mammal tail`, archetype === 'beaver' ? 'box' : 'cone',
      { x: -.7, y: 0, z: 0 }, { x: .3, y: archetype === 'beaver' ? .12 : .3, z: .08 }, accent,
      { z: 90 });
    for (const side of [-1, 1]) primitive(root, `${name} flipper ${side}`, 'sphere',
      { x: .05, y: -.18, z: side * .27 }, { x: .26, y: .06, z: .12 }, accent, { y: side * 26 });
  } else if (archetype === 'wisp') {
    primitive(root, `${name} wisp core`, 'sphere', { x: .08, y: 0, z: 0 },
      { x: .38, y: .38, z: .38 }, base);
    for (let index = 0; index < 4; index += 1) tail = primitive(root, `${name} wisp trail ${index + 1}`,
      'sphere', { x: -.2 - index * .16, y: Math.sin(index * 1.7) * .11, z: 0 },
      { x: .2 - index * .025, y: .14, z: .14 }, index % 2 ? accent : base);
  } else if (['octopus', 'squid', 'cuttlefish', 'jellyfish', 'anemone', 'lusca', 'softbody'].includes(archetype)) {
    primitive(root, `${name} mantle`, 'sphere', { x: .18, y: .08, z: 0 },
      { x: archetype === 'squid' ? .58 : .42, y: archetype === 'jellyfish' ? .28 : .48, z: .38 }, base);
    if (archetype === 'jellyfish') primitive(root, `${name} jelly rim`, 'cylinder',
      { x: .18, y: -.02, z: 0 }, { x: .72, y: .08, z: .72 }, accent);
    for (let index = 0; index < (archetype === 'squid' ? 8 : 6); index += 1) {
      tail = primitive(root, `${name} tentacle ${index + 1}`, 'cylinder',
        { x: -.2 - index * .035, y: -.22 + (index % 2) * .08, z: (index - 2.5) * .1 },
        { x: .045, y: .42 + (index % 3) * .07, z: .045 }, index % 2 ? accent : base,
        { z: 68 + index * 5 });
    }
  } else if (['shrimp', 'insect', 'arachnid', 'horseshoe'].includes(archetype)) {
    for (let index = 0; index < 5; index += 1) primitive(root, `${name} segmented body ${index + 1}`,
      'sphere', { x: .42 - index * .2, y: index % 2 * .035, z: 0 },
      { x: .22, y: .15, z: .16 }, index % 2 ? accent : base);
    primitive(root, `${name} carapace`, 'sphere', { x: .48, y: .04, z: 0 },
      { x: .3, y: .18, z: .25 }, base);
    tail = primitive(root, `${name} fan tail`, 'cone', { x: -.5, y: 0, z: 0 },
      { x: .24, y: .34, z: .08 }, accent, { z: 90 });
  } else if (['crab', 'lobster', 'crayfish'].includes(archetype)) {
    primitive(root, `${name} shell`, 'sphere', { x: 0, y: 0, z: 0 },
      { x: .5, y: .23, z: .42 }, base);
    primitive(root, `${name} left claw`, 'sphere', { x: .48, y: .04, z: .35 },
      { x: .25, y: .15, z: .2 }, accent);
    primitive(root, `${name} right claw`, 'sphere', { x: .48, y: .04, z: -.35 },
      { x: .25, y: .15, z: .2 }, accent);
    for (const side of [-1, 1]) for (let index = 0; index < 3; index += 1) {
      tail = primitive(root, `${name} leg ${side}-${index}`, 'box',
        { x: -.18 + index * .17, y: -.13, z: side * (.34 + index * .045) },
        { x: .3, y: .035, z: .035 }, accent,
        { y: side * (28 + index * 8), z: side * 12 });
    }
  } else if (archetype === 'snail') {
    primitive(root, `${name} snail foot`, 'sphere', { x: .12, y: -.13, z: 0 },
      { x: .58, y: .12, z: .22 }, accent);
    primitive(root, `${name} spiral shell`, 'sphere', { x: -.08, y: .14, z: 0 },
      { x: .4, y: .4, z: .18 }, base);
    primitive(root, `${name} snail head`, 'sphere', { x: .57, y: -.02, z: 0 },
      { x: .19, y: .18, z: .18 }, accent);
  } else if (['clam', 'oyster', 'mussel', 'scallop', 'bivalve', 'nautilus'].includes(archetype)) {
    primitive(root, `${name} lower shell`, 'sphere', { x: 0, y: -.04, z: 0 },
      { x: .56, y: .18, z: .44 }, base, { z: -8 });
    tail = primitive(root, `${name} upper shell`, 'sphere', { x: .05, y: .09, z: 0 },
      { x: .49, y: .14, z: .39 }, accent, { z: 7 });
  } else if (['starfish', 'urchin'].includes(archetype)) {
    primitive(root, `${name} echinoderm center`, 'sphere', { x: 0, y: 0, z: 0 },
      { x: .28, y: archetype === 'urchin' ? .28 : .12, z: .28 }, base);
    for (let index = 0; index < (archetype === 'urchin' ? 10 : 5); index += 1) {
      const angle = index * 360 / (archetype === 'urchin' ? 10 : 5);
      const radians = angle * Math.PI / 180;
      tail = primitive(root, `${name} radial arm ${index + 1}`, archetype === 'urchin' ? 'cone' : 'sphere',
        { x: Math.cos(radians) * .38, y: 0, z: Math.sin(radians) * .38 },
        { x: .35, y: archetype === 'urchin' ? .42 : .09, z: .11 }, accent, { y: -angle, z: archetype === 'urchin' ? 0 : angle });
    }
  } else if (['turtle', 'frog', 'salamander'].includes(archetype)) {
    primitive(root, `${name} body`, 'sphere', { x: 0, y: 0, z: 0 },
      { x: .54, y: archetype === 'turtle' ? .18 : .3, z: .42 }, base);
    primitive(root, `${name} head`, 'sphere', { x: .48, y: .03, z: 0 },
      { x: .22, y: .2, z: .2 }, accent);
    for (const side of [-1, 1]) for (const x of [-.25, .25]) {
      tail = primitive(root, `${name} limb ${side}-${x}`, 'sphere',
        { x, y: -.08, z: side * .38 }, { x: .24, y: .08, z: .16 }, accent,
        { y: side * 24 });
    }
  } else if (['serpent', 'dragon', 'plesiosaur', 'waterhorse', 'eel'].includes(archetype)) {
    for (let index = 0; index < 4; index += 1) {
      tail = primitive(root, `${name} long body ${index + 1}`, 'sphere',
        { x: .22 - index * .3, y: Math.sin(index * 1.4) * .08, z: 0 },
        { x: .36 - index * .035, y: .18, z: .16 }, index % 2 ? accent : base,
        { z: index * 4 });
    }
    primitive(root, `${name} long head`, 'sphere', { x: .55, y: .07, z: 0 },
      { x: .28, y: .23, z: .22 }, base);
  } else {
    const lengthScale = clamp(visual.lengthScale ?? 1, .58, 1.55);
    const depth = clamp(visual.depth ?? 1, .55, 1.55);
    const width = clamp(visual.width ?? 1, .5, 1.5);
    primitive(root, `${name} body`, 'sphere', { x: -.04, y: 0, z: 0 },
      { x: .58 * lengthScale, y: .25 * depth, z: .22 * width }, base);
    primitive(root, `${name} head`, 'sphere', { x: .42 * lengthScale, y: .02, z: 0 },
      { x: .29, y: .25 * depth, z: .22 * width }, base);
    tail = primitive(root, `${name} tail`, 'cone', { x: -.58 * lengthScale, y: 0, z: 0 },
      { x: .28, y: .38 * depth, z: .09 }, accent, { z: 90 });
    primitive(root, `${name} dorsal fin`, 'cone', { x: -.05, y: .22 * depth, z: 0 },
      { x: .16, y: .25, z: .06 }, accent);
    primitive(root, `${name} eye`, 'sphere', { x: .53 * lengthScale, y: .08, z: .2 * width },
      { x: .045, y: .045, z: .035 }, dark);
  }

  const scale = specimenDisplayScale(specimen, maximumScale);
  const physicalLengthMeters = clamp((Number(specimen?.length) || 8) * .0254, .04, 30);
  root.setLocalScale(scale, scale, scale);
  return { root, tail, materials, species, scale, archetype, physicalLengthMeters };
}

export function destroySpecimenModel(model) {
  if (!model) return;
  model.root?.destroy();
  for (const material of model.materials ?? []) material.destroy?.();
}
