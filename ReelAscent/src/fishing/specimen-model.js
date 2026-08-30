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

export function specimenDisplayScale(specimen, maximum = 1) {
  const lengthMeters = clamp((Number(specimen?.length) || 8) * .0254, .08, 8);
  return clamp(.3 + Math.sqrt(lengthMeters) * .29, .34, maximum);
}

export function createSpecimenModel(specimen, { name = 'Specimen display', maximumScale = 1 } = {}) {
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

  if (['octopus', 'squid', 'jellyfish', 'anemone'].includes(archetype)) {
    primitive(root, `${name} mantle`, 'sphere', { x: .18, y: .08, z: 0 },
      { x: .42, y: .48, z: .38 }, base);
    for (let index = 0; index < 6; index += 1) {
      tail = primitive(root, `${name} tentacle ${index + 1}`, 'cylinder',
        { x: -.2 - index * .035, y: -.22 + (index % 2) * .08, z: (index - 2.5) * .1 },
        { x: .045, y: .42 + (index % 3) * .07, z: .045 }, index % 2 ? accent : base,
        { z: 68 + index * 5 });
    }
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
  } else if (['clam', 'oyster', 'mussel', 'scallop', 'nautilus'].includes(archetype)) {
    primitive(root, `${name} lower shell`, 'sphere', { x: 0, y: -.04, z: 0 },
      { x: .56, y: .18, z: .44 }, base, { z: -8 });
    tail = primitive(root, `${name} upper shell`, 'sphere', { x: .05, y: .09, z: 0 },
      { x: .49, y: .14, z: .39 }, accent, { z: 7 });
  } else if (['turtle', 'frog', 'starfish', 'urchin'].includes(archetype)) {
    primitive(root, `${name} body`, 'sphere', { x: 0, y: 0, z: 0 },
      { x: .54, y: archetype === 'turtle' ? .18 : .3, z: .42 }, base);
    primitive(root, `${name} head`, 'sphere', { x: .48, y: .03, z: 0 },
      { x: .22, y: .2, z: .2 }, accent);
    for (const side of [-1, 1]) for (const x of [-.25, .25]) {
      tail = primitive(root, `${name} limb ${side}-${x}`, 'sphere',
        { x, y: -.08, z: side * .38 }, { x: .24, y: .08, z: .16 }, accent,
        { y: side * 24 });
    }
  } else if (['serpent', 'dragon', 'plesiosaur', 'waterhorse'].includes(archetype)) {
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
  root.setLocalScale(scale, scale, scale);
  return { root, tail, materials, species, scale, archetype };
}

export function destroySpecimenModel(model) {
  if (!model) return;
  model.root?.destroy();
  for (const material of model.materials ?? []) material.destroy?.();
}
