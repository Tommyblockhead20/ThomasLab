import * as pc from 'playcanvas';
import {
  LEGACY_CHARACTER_PALETTE,
  hairVisibilityForHeadwear,
  normalizeAppearance,
  resolveAppearance
} from './appearance.js';
import { COSMETIC_BY_ID } from '../progression/cosmetics.js';

// This manifest is intentionally shared with the focused catalog audit. Adding an active
// visual token without a corresponding low-poly recipe makes the audit fail instead of
// quietly falling through to an unrelated placeholder.
export const COSMETIC_MODEL_VISUALS = Object.freeze({
  headwear: Object.freeze(['beanie', 'cowboy', 'cap', 'headlamp', 'flower', 'bucket', 'wizard', 'propeller', 'crown', 'halo', 'hood', 'horn', 'gills', 'tentacle', 'sun', 'crest', 'top-hat']),
  eyewear: Object.freeze(['glasses', 'round', 'aviator', 'visor', 'goggles', 'electric', 'hammer', 'sun']),
  faceAccessory: Object.freeze(['scarf', 'bandana', 'gaiter', 'necklace', 'collar', 'serpent', 'whirlpool', 'puff']),
  backAccessory: Object.freeze(['pack', 'cape', 'flag', 'emblem', 'tank', 'atlas', 'wings', 'claws', 'fin', 'hydra', 'tentacle', 'shell'])
});

export function auditCosmeticModelCoverage(catalog = []) {
  const missingModelIds = catalog.filter((cosmetic) => !COSMETIC_MODEL_VISUALS[cosmetic.slot]?.includes(cosmetic.visual)).map(({ id }) => id);
  const invalidCompatibilityIds = catalog.filter((cosmetic) => !cosmetic.supports?.length
    || cosmetic.supports.some((avatar) => !['human', 'blob'].includes(avatar))).map(({ id }) => id);
  return Object.freeze({
    activeCount: catalog.length,
    renderableCount: catalog.length - new Set([...missingModelIds, ...invalidCompatibilityIds]).size,
    missingModelIds: Object.freeze(missingModelIds),
    invalidCompatibilityIds: Object.freeze(invalidCompatibilityIds)
  });
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// Full primitive scales and joint-local anchors. Each child reaches slightly through its
// attachment anchor so ordinary pose animation cannot reveal daylight between body pieces.
export const AVATAR_ATTACHMENT_OVERLAP_EPSILON = .02;
export const AVATAR_ATTACHMENT_SPEC = Object.freeze({
  upperTorso: Object.freeze({ position: Object.freeze({ x: 0, y: .06, z: 0 }), scale: Object.freeze({ x: .7, y: .62, z: .42 }) }),
  lowerTorso: Object.freeze({ position: Object.freeze({ x: 0, y: -.28, z: 0 }), scale: Object.freeze({ x: .55, y: .24, z: .38 }) }),
  neck: Object.freeze({ position: Object.freeze({ x: 0, y: .45, z: 0 }), scale: Object.freeze({ x: .17, y: .22, z: .17 }) }),
  head: Object.freeze({ position: Object.freeze({ x: 0, y: .7, z: -.015 }), scale: Object.freeze({ x: .47, y: .54, z: .46 }) }),
  shoulder: Object.freeze({ y: .27, upperCenterY: -.17, upperLength: .38, elbowY: -.36, lowerCenterY: -.15, lowerLength: .34, handY: -.34, handLength: .2 }),
  hip: Object.freeze({ y: -.37, upperCenterY: -.15, upperLength: .34, kneeY: -.3, lowerCenterY: -.135, lowerLength: .31, bootY: -.27, bootLength: .18 })
});

const interval = (center, size) => [center - size * .5, center + size * .5];
const intervalOverlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

export function validateAvatarAttachmentSpec(spec = AVATAR_ATTACHMENT_SPEC) {
  const upperTorso = interval(spec.upperTorso.position.y, spec.upperTorso.scale.y);
  const lowerTorso = interval(spec.lowerTorso.position.y, spec.lowerTorso.scale.y);
  const neck = interval(spec.neck.position.y, spec.neck.scale.y);
  const head = interval(spec.head.position.y, spec.head.scale.y);
  const upperArm = interval(spec.shoulder.y + spec.shoulder.upperCenterY, spec.shoulder.upperLength);
  const lowerArm = interval(spec.shoulder.y + spec.shoulder.elbowY + spec.shoulder.lowerCenterY, spec.shoulder.lowerLength);
  const hand = interval(spec.shoulder.y + spec.shoulder.elbowY + spec.shoulder.handY, spec.shoulder.handLength);
  const upperLeg = interval(spec.hip.y + spec.hip.upperCenterY, spec.hip.upperLength);
  const lowerLeg = interval(spec.hip.y + spec.hip.kneeY + spec.hip.lowerCenterY, spec.hip.lowerLength);
  const boot = interval(spec.hip.y + spec.hip.kneeY + spec.hip.bootY, spec.hip.bootLength);
  const links = Object.freeze({
    'upper/lower torso': intervalOverlap(upperTorso, lowerTorso),
    'torso/neck': intervalOverlap(upperTorso, neck),
    'neck/head': intervalOverlap(neck, head),
    'upper/lower arm': intervalOverlap(upperArm, lowerArm),
    'lower arm/hand': intervalOverlap(lowerArm, hand),
    'lower torso/upper leg': intervalOverlap(lowerTorso, upperLeg),
    'upper/lower leg': intervalOverlap(upperLeg, lowerLeg),
    'lower leg/boot': intervalOverlap(lowerLeg, boot)
  });
  return {
    valid: Object.values(links).every((value) => value >= AVATAR_ATTACHMENT_OVERLAP_EPSILON - 1e-9),
    links
  };
}

function surface(color, gloss = .24) {
  const result = new pc.StandardMaterial();
  result.diffuse = new pc.Color(...color);
  result.gloss = gloss;
  result.update();
  return result;
}

function recolor(material, color, emissiveScale = 0) {
  material.diffuse.set(...color);
  material.emissive.set(color[0] * emissiveScale, color[1] * emissiveScale, color[2] * emissiveScale);
  material.update();
}

function primitive(parent, name, type, position, scale, material, rotation = {}) {
  const entity = new pc.Entity(name, parent._app);
  entity.addComponent('render', { type, material, castShadows: true, receiveShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

function joint(parent, name, position) {
  const entity = new pc.Entity(name, parent._app);
  entity.setLocalPosition(position.x, position.y, position.z);
  parent.addChild(entity);
  return entity;
}

function group(parent, name) {
  const entity = new pc.Entity(name, parent._app);
  parent.addChild(entity);
  return entity;
}

function buildLimb(parent, side, materials) {
  const arm = AVATAR_ATTACHMENT_SPEC.shoulder;
  const leg = AVATAR_ATTACHMENT_SPEC.hip;
  const direction = side === 'Left' ? -1 : 1;
  const shoulder = joint(parent, `${side} shoulder`, { x: direction * .41, y: arm.y, z: 0 });
  primitive(shoulder, `${side} upper arm`, 'box', { x: 0, y: arm.upperCenterY, z: 0 },
    { x: .18, y: arm.upperLength, z: .2 }, materials.jacket);
  const elbow = joint(shoulder, `${side} elbow`, { x: 0, y: arm.elbowY, z: 0 });
  primitive(elbow, `${side} lower arm`, 'box', { x: 0, y: arm.lowerCenterY, z: 0 },
    { x: .155, y: arm.lowerLength, z: .175 }, materials.jacket);
  primitive(elbow, `${side} hand`, 'sphere', { x: 0, y: arm.handY, z: 0 },
    { x: .16, y: arm.handLength, z: .16 }, materials.skin);
  const handAnchor = joint(elbow, `${side} hand attachment`, { x: 0, y: arm.handY, z: 0 });

  const hip = joint(parent, `${side} hip`, { x: direction * .19, y: leg.y, z: 0 });
  primitive(hip, `${side} upper leg`, 'box', { x: 0, y: leg.upperCenterY, z: 0 },
    { x: .23, y: leg.upperLength, z: .27 }, materials.trousers);
  const knee = joint(hip, `${side} knee`, { x: 0, y: leg.kneeY, z: 0 });
  primitive(knee, `${side} lower leg`, 'box', { x: 0, y: leg.lowerCenterY, z: 0 },
    { x: .2, y: leg.lowerLength, z: .23 }, materials.trousers);
  primitive(knee, `${side} boot`, 'box', { x: 0, y: leg.bootY, z: -.075 },
    { x: .25, y: leg.bootLength, z: .41 }, materials.boots);
  return { shoulder, elbow, handAnchor, hip, knee };
}

function buildEyewear(humanRig, materials) {
  const result = new Map();
  const frame = materials.accessory;
  const dark = materials.dark;
  const glass = materials.glass;
  const make = (id, label) => {
    const root = group(humanRig, label);
    result.set(id, root);
    return root;
  };
  const glasses = make('glasses', 'Trail glasses');
  for (const x of [-.13, .13]) primitive(glasses, `Trail glasses ${x < 0 ? 'left' : 'right'} lens`,
    'box', { x, y: .73, z: -.252 }, { x: .19, y: .14, z: .035 }, frame);
  primitive(glasses, 'Trail glasses bridge', 'box', { x: 0, y: .73, z: -.262 }, { x: .08, y: .025, z: .025 }, frame);

  const rounds = make('round-glasses', 'Round glasses');
  for (const x of [-.13, .13]) primitive(rounds, `Round glasses ${x < 0 ? 'left' : 'right'} lens`,
    'sphere', { x, y: .73, z: -.24 }, { x: .145, y: .145, z: .028 }, glass);
  primitive(rounds, 'Round glasses bridge', 'box', { x: 0, y: .73, z: -.248 }, { x: .08, y: .022, z: .02 }, frame);

  const aviators = make('aviators', 'Aviator sunglasses');
  for (const x of [-.13, .13]) primitive(aviators, `Aviator ${x < 0 ? 'left' : 'right'} lens`,
    'sphere', { x, y: .71, z: -.242 }, { x: .17, y: .145, z: .032 }, dark, { z: x < 0 ? -6 : 6 });
  primitive(aviators, 'Aviator bridge', 'box', { x: 0, y: .755, z: -.25 }, { x: .09, y: .025, z: .02 }, frame);

  const sports = make('sport-shades', 'Sport shades');
  primitive(sports, 'Sport shades visor', 'box', { x: 0, y: .73, z: -.245 }, { x: .39, y: .13, z: .035 }, dark, { x: -4 });
  primitive(sports, 'Sport shades upper rim', 'box', { x: 0, y: .81, z: -.24 }, { x: .42, y: .035, z: .035 }, frame);

  const clear = make('clear-spectacles', 'Clear spectacles');
  for (const x of [-.13, .13]) primitive(clear, `Clear spectacles ${x < 0 ? 'left' : 'right'} lens`,
    'box', { x, y: .73, z: -.24 }, { x: .18, y: .14, z: .024 }, glass);
  primitive(clear, 'Clear spectacles bridge', 'box', { x: 0, y: .73, z: -.247 }, { x: .08, y: .02, z: .018 }, materials.silver);

  const snow = make('snow-glasses', 'Snow glasses');
  primitive(snow, 'Snow glasses lens', 'box', { x: 0, y: .74, z: -.25 }, { x: .39, y: .16, z: .045 }, glass, { x: -3 });
  primitive(snow, 'Snow glasses rim', 'box', { x: 0, y: .74, z: -.24 }, { x: .44, y: .205, z: .025 }, frame);

  const goggles = make('goggles', 'Summit goggles');
  for (const x of [-.14, .14]) primitive(goggles, `Summit goggles ${x < 0 ? 'left' : 'right'} lens`,
    'sphere', { x, y: .75, z: -.25 }, { x: .17, y: .13, z: .045 }, dark);
  primitive(goggles, 'Summit goggles strap', 'cylinder', { x: 0, y: .76, z: 0 }, { x: .47, y: .055, z: .47 }, frame);
  return result;
}

function buildGeneratedCosmetic(parent, cosmetic, sourceMaterials, blob = false) {
  // Hats and non-hat accessories have independent player colors. Rebind only the recipe's
  // primary tint material; authored glass, silver, dark, and pack details stay fixed.
  const materials = cosmetic.slot === 'headwear'
    ? { ...sourceMaterials, accessory: sourceMaterials.hat }
    : sourceMaterials;
  const root = group(parent, `${blob ? 'Blob ' : ''}${cosmetic.label}`);
  const size = blob ? 1.16 : 1;
  const headY = blob ? 1.17 : .94;
  const frontZ = blob ? -.48 : -.25;
  const add = (name, type, position, scale, material = materials.accessory, rotation = {}) => primitive(
    root, `${cosmetic.label} ${name}`, type,
    { x: position.x * size, y: position.y, z: position.z * size },
    { x: scale.x * size, y: scale.y * size, z: scale.z * size }, material, rotation
  );
  const visual = cosmetic.visual;
  if (cosmetic.slot === 'headwear') {
    if (visual === 'crown') {
      add('band', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .5, y: .1, z: .5 });
      for (const x of [-.3, 0, .3]) add(`point ${x}`, 'cone', { x, y: headY + .22 + (x ? 0 : .06), z: -.05 }, { x: .13, y: .36, z: .13 });
    } else if (visual === 'crest') {
      add('band', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .49, y: .07, z: .49 });
      [-.26, -.13, 0, .13, .26].forEach((z, index) => add(`ridge ${index + 1}`, 'cone',
        { x: 0, y: headY + .2 + (.26 - Math.abs(z)) * .35, z }, { x: .12, y: .42, z: .12 }, materials.accessory, { x: z * 24 }));
    } else if (visual === 'top-hat') {
      add('brim', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .62, y: .06, z: .62 });
      add('crown', 'cylinder', { x: 0, y: headY + .3, z: 0 }, { x: .42, y: .58, z: .42 });
    } else if (visual === 'wizard') {
      add('brim', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .62, y: .06, z: .62 });
      add('crooked cone', 'cone', { x: .08, y: headY + .35, z: .02 }, { x: .43, y: .75, z: .43 }, materials.accessory, { z: -11 });
    } else if (['cowboy', 'bucket'].includes(visual)) {
      add('brim', visual === 'cowboy' ? 'box' : 'cylinder', { x: 0, y: headY, z: -.03 }, { x: .7, y: .06, z: .62 });
      add('crown', 'cylinder', { x: 0, y: headY + .18, z: .02 }, { x: .43, y: .32, z: .43 });
    } else if (visual === 'propeller') {
      add('cap', 'sphere', { x: 0, y: headY + .08, z: 0 }, { x: .49, y: .22, z: .47 });
      add('stem', 'cylinder', { x: 0, y: headY + .28, z: 0 }, { x: .05, y: .18, z: .05 });
      add('propeller', 'box', { x: 0, y: headY + .39, z: 0 }, { x: .72, y: .04, z: .12 }, materials.accessory, { y: 18 });
    } else if (visual === 'halo') {
      for (let index = 0; index < 10; index += 1) {
        const angle = index / 10 * Math.PI * 2;
        add(`halo ${index}`, 'sphere', { x: Math.cos(angle) * .42, y: headY + .38, z: Math.sin(angle) * .42 }, { x: .1, y: .055, z: .1 });
      }
    } else if (visual === 'horn') {
      add('band', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .48, y: .07, z: .48 });
      add('horn', 'cone', { x: 0, y: headY + .34, z: -.12 }, { x: .16, y: .62, z: .16 }, materials.accessory, { x: -10 });
    } else if (visual === 'gills') {
      add('band', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .49, y: .055, z: .49 });
      for (const side of [-1, 1]) for (let index = 0; index < 3; index += 1) add(`gill ${side} ${index}`, 'capsule',
        { x: side * (.48 + index * .035), y: headY + .03 - index * .08, z: .02 }, { x: .055, y: .28, z: .055 }, materials.accessory, { z: side * (28 + index * 7) });
    } else if (visual === 'tentacle') {
      add('octopus head', 'sphere', { x: 0, y: headY + .2, z: -.01 }, { x: .47, y: .38, z: .44 });
      for (const x of [-.34, -.2, -.07, .07, .2, .34]) add(`tentacle ${x}`, 'capsule',
        { x, y: headY + .01 + Math.abs(x) * .1, z: -.01 }, { x: .075, y: .42, z: .075 }, materials.accessory, { z: x * -58 });
      for (const x of [-.13, .13]) add(`eye ${x}`, 'sphere', { x, y: headY + .27, z: -.4 }, { x: .055, y: .065, z: .045 }, materials.dark);
    } else if (visual === 'flower') {
      add('vine band', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .5, y: .055, z: .5 }, materials.pack);
      for (let index = 0; index < 5; index += 1) {
        const theta = (index / 5 * Math.PI * 1.35) + Math.PI * .82;
        const x = Math.cos(theta) * .4;
        const z = Math.sin(theta) * .4;
        add(`flower ${index + 1} center`, 'sphere', { x, y: headY + .13, z }, { x: .075, y: .07, z: .075 }, materials.silver);
        for (let petal = 0; petal < 4; petal += 1) {
          const phase = petal * Math.PI / 2;
          add(`flower ${index + 1} petal ${petal + 1}`, 'sphere',
            { x: x + Math.cos(phase) * .08, y: headY + .13 + Math.sin(phase) * .08, z }, { x: .07, y: .07, z: .035 });
        }
      }
    } else if (visual === 'sun') {
      add('sun band', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .48, y: .055, z: .48 });
      add('sun disc', 'sphere', { x: 0, y: headY + .39, z: -.03 }, { x: .22, y: .22, z: .09 }, materials.silver);
      for (let index = 0; index < 8; index += 1) {
        const theta = index * Math.PI / 4;
        add(`sun ray ${index + 1}`, 'cone',
          { x: Math.cos(theta) * .29, y: headY + .39 + Math.sin(theta) * .29, z: -.02 },
          { x: .07, y: .2, z: .07 }, materials.accessory, { x: 90, z: 90 - theta * 180 / Math.PI });
      }
    } else if (['hood', 'beanie', 'cap', 'headlamp'].includes(visual)) {
      add('crown', visual === 'beanie' ? 'cone' : 'sphere', { x: 0, y: headY + .08, z: .03 }, { x: .5, y: .28, z: .48 });
      if (visual === 'cap') add('bill', 'box', { x: 0, y: headY, z: -.35 }, { x: .48, y: .055, z: .34 });
      if (visual === 'headlamp') add('lamp', 'sphere', { x: 0, y: headY + .04, z: -.4 }, { x: .13, y: .12, z: .1 }, materials.silver);
    } else {
      add('headband', 'cylinder', { x: 0, y: headY, z: 0 }, { x: .49, y: .08, z: .49 });
    }
  } else if (cosmetic.slot === 'eyewear') {
    const eyeY = blob ? .85 : .73;
    const wide = ['visor', 'hammer', 'electric'].includes(visual);
    if (wide) add('visor', 'box', { x: 0, y: eyeY, z: frontZ }, { x: visual === 'hammer' ? .56 : .42, y: .14, z: .04 }, materials.dark);
    else for (const x of [-.14, .14]) add(`lens ${x}`, ['round', 'sun', 'aviator', 'goggles'].includes(visual) ? 'sphere' : 'box',
      { x, y: eyeY, z: frontZ }, { x: visual === 'goggles' ? .18 : .16, y: visual === 'aviator' ? .16 : .14, z: visual === 'goggles' ? .055 : .035 }, visual === 'goggles' ? materials.dark : materials.glass,
      { z: visual === 'aviator' ? x * 45 : 0 });
    add('bridge', 'box', { x: 0, y: blob ? .85 : .73, z: frontZ - .01 }, { x: .1, y: .025, z: .025 });
    if (visual === 'goggles') add('strap', 'cylinder', { x: 0, y: eyeY, z: 0 }, { x: .5, y: .04, z: .5 }, materials.accessory);
    if (visual === 'hammer') for (const side of [-1, 1]) {
      add(`hammer neck ${side}`, 'box', { x: side * .37, y: eyeY, z: frontZ }, { x: .16, y: .07, z: .07 }, materials.silver);
      add(`hammer head ${side}`, 'box', { x: side * .48, y: eyeY, z: frontZ }, { x: .11, y: .28, z: .14 }, materials.accessory);
    }
    if (visual === 'electric') for (const side of [-1, 1]) for (const offset of [-1, 1]) add(`spark ${side} ${offset}`, 'box',
      { x: side * (.4 + offset * .035), y: eyeY + offset * .07, z: frontZ }, { x: .15, y: .035, z: .035 }, materials.silver, { z: side * offset * 48 });
    if (visual === 'sun') for (const side of [-1, 1]) for (let index = 0; index < 6; index += 1) {
      const theta = index * Math.PI / 3;
      add(`sun lens ${side} ray ${index + 1}`, 'box',
        { x: side * .14 + Math.cos(theta) * .19, y: eyeY + Math.sin(theta) * .17, z: frontZ + .005 },
        { x: .075, y: .025, z: .025 }, materials.accessory, { z: theta * 180 / Math.PI });
    }
  } else if (cosmetic.slot === 'faceAccessory') {
    const neckY = blob ? .44 : .45;
    if (visual === 'scarf') {
      add('collar', 'cylinder', { x: 0, y: neckY, z: 0 }, { x: blob ? .5 : .33, y: .17, z: blob ? .5 : .33 });
      add('tail', 'box', { x: .18, y: neckY - .31, z: .25 }, { x: .18, y: .55, z: .1 }, materials.accessory, { x: -12, z: -8 });
    } else if (visual === 'serpent') {
      add('coiled body', 'cylinder', { x: 0, y: neckY, z: 0 }, { x: blob ? .5 : .35, y: .12, z: blob ? .5 : .35 });
      add('raised neck', 'capsule', { x: .28, y: neckY + .17, z: -.12 }, { x: .065, y: .34, z: .065 }, materials.accessory, { z: -24 });
      add('serpent head', 'sphere', { x: .35, y: neckY + .3, z: -.15 }, { x: .12, y: .08, z: .08 }, materials.dark);
    } else if (visual === 'bandana') {
      add('face cloth', 'box', { x: 0, y: blob ? .62 : .57, z: frontZ - .015 }, { x: .4, y: .25, z: .035 }, materials.accessory, { x: -5 });
      for (const side of [-1, 1]) add(`knot tail ${side}`, 'box', { x: side * .24, y: neckY - .12, z: .22 }, { x: .12, y: .32, z: .06 }, materials.accessory, { z: side * 18 });
    } else if (visual === 'puff') {
      for (let index = 0; index < 10; index += 1) {
        const theta = index / 10 * Math.PI * 2;
        add(`puff ${index + 1}`, 'sphere', { x: Math.cos(theta) * (blob ? .45 : .31), y: neckY, z: Math.sin(theta) * (blob ? .45 : .31) }, { x: .16, y: .16, z: .16 });
      }
    } else if (visual === 'whirlpool') {
      for (let index = 0; index < 12; index += 1) {
        const theta = index * .9;
        const radius = .1 + index * .018;
        add(`spiral ${index + 1}`, 'sphere', { x: Math.cos(theta) * radius, y: neckY - .04, z: frontZ - .03 + Math.sin(theta) * radius * .25 }, { x: .055, y: .055, z: .035 });
      }
    } else if (['collar', 'gaiter'].includes(visual)) {
      add('collar', 'cylinder', { x: 0, y: neckY, z: 0 }, { x: visual === 'puff' ? .52 : .36, y: visual === 'gaiter' ? .24 : .14, z: visual === 'puff' ? .52 : .36 });
    } else {
      add('cord', 'cylinder', { x: 0, y: neckY, z: -.12 }, { x: .24, y: .035, z: .24 });
      add('charm', 'sphere', { x: 0, y: neckY - .12, z: -.25 }, { x: .09, y: .12, z: .04 });
    }
  } else {
    const backY = blob ? .05 : -.03;
    if (['cape', 'wings'].includes(visual)) {
      for (const side of (visual === 'wings' ? [-1, 1] : [0])) add(`panel ${side}`, 'box',
        { x: side * .34, y: backY, z: blob ? .49 : .36 }, { x: visual === 'wings' ? .42 : .68, y: .9, z: .07 }, materials.accessory, { z: side * -17, x: -7 });
    } else if (['fin', 'flag'].includes(visual)) {
      add('spine', 'box', { x: 0, y: backY + .2, z: blob ? .52 : .38 }, { x: .08, y: .9, z: .08 });
      add('fin', visual === 'flag' ? 'box' : 'cone', { x: .22, y: backY + .38, z: blob ? .52 : .4 }, { x: .45, y: .58, z: .08 }, materials.accessory, { z: -20 });
    } else if (visual === 'claws') {
      const handY = blob ? .28 : -.43;
      for (const side of [-1, 1]) {
        add(`hand cuff ${side}`, 'cylinder', { x: side * (blob ? .56 : .41), y: handY, z: -.02 }, { x: .14, y: .13, z: .14 }, materials.dark);
        for (const digit of [-1, 0, 1]) add(`hand ${side} claw ${digit}`, 'cone',
          { x: side * (blob ? .6 : .45) + digit * .04, y: handY - .04 + digit * .025, z: -.19 },
          { x: .045, y: .28, z: .045 }, materials.silver, { x: 90 + digit * 8, z: side * 5 });
      }
    } else if (visual === 'hydra') {
      for (const [index, x] of [-.32, 0, .32].entries()) {
        add(`neck ${index + 1}`, 'capsule', { x, y: backY + .2 + (index === 1 ? .13 : 0), z: blob ? .55 : .4 }, { x: .085, y: .75, z: .085 }, materials.accessory, { z: x * -45 });
        add(`head ${index + 1}`, 'sphere', { x: x * 1.5, y: backY + .58 + (index === 1 ? .15 : 0), z: blob ? .54 : .39 }, { x: .14, y: .11, z: .12 }, materials.dark);
      }
    } else if (visual === 'tentacle') {
      for (const [index, x] of [-.38, -.19, 0, .19, .38].entries()) add(`tentacle ${index + 1}`, 'capsule',
        { x, y: backY - .08 + Math.abs(x) * .18, z: blob ? .55 : .4 }, { x: .085, y: .82, z: .085 }, materials.accessory, { x: index % 2 ? 8 : -8, z: x * -55 });
    } else if (visual === 'shell') {
      add('spiral shell', 'sphere', { x: 0, y: backY, z: blob ? .56 : .43 }, { x: .58, y: .58, z: .2 });
      for (let index = 0; index < 13; index += 1) {
        const theta = index * .76;
        const radius = .04 + index * .027;
        add(`raised spiral ${index + 1}`, 'sphere',
          { x: Math.cos(theta) * radius, y: backY + Math.sin(theta) * radius, z: blob ? .75 : .62 }, { x: .045, y: .045, z: .03 }, materials.dark);
      }
    } else if (visual === 'tank') {
      add('tank frame', 'box', { x: 0, y: backY, z: blob ? .5 : .35 }, { x: .58, y: .72, z: .28 }, materials.silver, { x: -7 });
      add('tank glass', 'sphere', { x: 0, y: backY, z: blob ? .69 : .53 }, { x: .38, y: .49, z: .11 }, materials.glass);
      add('tank fish', 'cone', { x: .04, y: backY, z: blob ? .79 : .63 }, { x: .09, y: .2, z: .045 }, materials.accessory, { x: 90, z: 90 });
    } else if (visual === 'atlas') {
      add('book', 'box', { x: 0, y: backY, z: blob ? .54 : .39 }, { x: .6, y: .72, z: .18 }, materials.pack, { x: -7 });
      add('book spine', 'box', { x: -.27, y: backY, z: blob ? .65 : .5 }, { x: .08, y: .72, z: .08 }, materials.silver, { x: -7 });
      add('compass rose', 'sphere', { x: .05, y: backY + .06, z: blob ? .68 : .54 }, { x: .17, y: .17, z: .035 }, materials.accessory);
    } else if (visual === 'emblem') {
      add('trophy harness', 'box', { x: 0, y: backY, z: blob ? .51 : .36 }, { x: .5, y: .65, z: .22 }, materials.pack, { x: -7 });
      add('trophy cup', 'cylinder', { x: 0, y: backY + .15, z: blob ? .7 : .55 }, { x: .19, y: .25, z: .19 }, materials.silver);
      for (const side of [-1, 1]) add(`trophy handle ${side}`, 'sphere', { x: side * .2, y: backY + .2, z: blob ? .69 : .54 }, { x: .1, y: .13, z: .04 }, materials.accessory);
    } else {
      add('pack', 'box', { x: 0, y: backY, z: blob ? .5 : .35 }, { x: .58, y: .7, z: .3 }, cosmetic.id === 'backpack' ? materials.pack : materials.accessory, { x: -7 });
    }
  }
  // Deliberate, name/theme-authored distinctions for the most obvious shared recipes.
  // These details describe the earned item; they are not index-derived cones or blocks.
  const theme = `${cosmetic.id} ${cosmetic.label} ${cosmetic.source?.speciesName ?? ''}`.toLowerCase();
  if (cosmetic.id === 'catch-mermaid') {
    for (let index = 0; index < 7; index += 1) {
      const theta = index / 7 * Math.PI * 2;
      add(`mermaid pearl ${index + 1}`, 'sphere', { x: Math.cos(theta) * .34, y: headY + .2, z: Math.sin(theta) * .34 }, { x: .065, y: .065, z: .065 }, materials.silver);
    }
    add('mermaid shell fan', 'sphere', { x: 0, y: headY + .43, z: -.02 }, { x: .28, y: .22, z: .055 }, materials.accessory);
  } else if (cosmetic.id === 'catch-goblin_shark') {
    add('goblin shark long snout', 'cone', { x: 0, y: (blob ? .85 : .73) - .08, z: frontZ - .22 }, { x: .1, y: .42, z: .08 }, materials.accessory, { x: 90 });
    for (const side of [-1, 1]) add(`goblin tooth ${side}`, 'cone', { x: side * .09, y: (blob ? .85 : .73) - .2, z: frontZ - .08 }, { x: .035, y: .12, z: .035 }, materials.silver);
  } else if (cosmetic.id === 'catch-american_alligator') {
    for (let index = 0; index < 5; index += 1) add(`alligator back scute ${index + 1}`, 'cone', { x: 0, y: (blob ? .05 : -.03) + .34 - index * .17, z: blob ? .57 : .43 }, { x: .08, y: .18, z: .08 }, materials.silver, { x: 90 });
    add('alligator tail', 'capsule', { x: 0, y: (blob ? .05 : -.03) - .53, z: blob ? .55 : .4 }, { x: .1, y: .55, z: .1 }, materials.accessory, { x: 18 });
  } else if (cosmetic.id === 'catch-giant_panda') {
    for (const side of [-1, 1]) {
      add(`panda ear ${side}`, 'sphere', { x: side * .31, y: headY + .34, z: .02 }, { x: .14, y: .14, z: .1 }, materials.dark);
      add(`panda eye patch ${side}`, 'sphere', { x: side * .13, y: blob ? .84 : .72, z: frontZ - .025 }, { x: .1, y: .13, z: .035 }, materials.dark, { z: side * -16 });
    }
  } else if (cosmetic.id === 'catch-starfall_minnow') {
    for (let index = 0; index < 5; index += 1) {
      const theta = index / 5 * Math.PI * 2 - Math.PI / 2;
      add(`starfall ray ${index + 1}`, 'box', { x: Math.cos(theta) * .1, y: (blob ? .44 : .45) - .16 + Math.sin(theta) * .1, z: frontZ - .01 }, { x: .035, y: .16, z: .025 }, materials.silver, { z: theta * 180 / Math.PI + 90 });
    }
  } else if (cosmetic.id === 'catch-whisper_eel') {
    for (let index = 0; index < 6; index += 1) add(`whisper eel curve ${index + 1}`, 'sphere', { x: -.18 + index * .07, y: (blob ? .44 : .45) - .11 - Math.sin(index / 5 * Math.PI) * .11, z: frontZ - .01 }, { x: .055, y: .04, z: .025 }, index === 5 ? materials.silver : materials.accessory);
  } else if (cosmetic.id === 'catch-peaklight_koi') {
    add('peaklight koi body', 'sphere', { x: 0, y: (blob ? .44 : .45) - .16, z: frontZ - .015 }, { x: .16, y: .075, z: .04 }, materials.silver);
    for (const side of [-1, 1]) add(`peaklight koi fin ${side}`, 'cone', { x: side * .14, y: (blob ? .44 : .45) - .16, z: frontZ - .01 }, { x: .07, y: .12, z: .025 }, materials.accessory, { z: side * 90 });
  } else if (cosmetic.id === 'catch-violet_crayfish') {
    for (const side of [-1, 1]) add(`violet crayfish claw ${side}`, 'sphere', { x: side * .34, y: headY + .14, z: -.03 }, { x: .14, y: .09, z: .07 }, materials.accessory, { z: side * 20 });
  } else if (cosmetic.id === 'catch-plungepool_crab') {
    add('plungepool crab shell', 'sphere', { x: 0, y: blob ? .05 : -.03, z: blob ? .72 : .56 }, { x: .25, y: .19, z: .06 }, materials.silver);
    for (const side of [-1, 1]) add(`plungepool crab pincer ${side}`, 'sphere', { x: side * .26, y: (blob ? .05 : -.03) + .08, z: blob ? .72 : .56 }, { x: .1, y: .075, z: .05 }, materials.accessory);
  } else if (cosmetic.id === 'cowboy-hat') {
    add('creased cowboy crown', 'box', { x: 0, y: headY + .28, z: .02 }, { x: .3, y: .08, z: .32 }, materials.dark);
    add('cowboy hat band', 'cylinder', { x: 0, y: headY + .08, z: .02 }, { x: .45, y: .055, z: .45 }, materials.silver);
  } else if (cosmetic.id === 'badge-master-outfitter') {
    for (const x of [-.18, 0, .18]) add(`outfitter cap crown point ${x}`, 'cone', { x, y: headY + .34, z: .02 }, { x: .075, y: .22, z: .075 }, materials.silver);
  } else if (cosmetic.id === 'casino-card-shark-cap') {
    for (const [index, yaw] of [-24, 0, 24].entries()) add(`card fan ${index + 1}`, 'box', { x: (index - 1) * .1, y: headY + .32, z: .03 }, { x: .15, y: .24, z: .018 }, index === 1 ? materials.silver : materials.accessory, { z: yaw });
  } else if (cosmetic.id === 'badge-curator-3') {
    for (const side of [-1, 1]) add(`curator bubble ${side}`, 'sphere', { x: side * .14, y: blob ? .85 : .73, z: frontZ - .015 }, { x: .2, y: .2, z: .055 }, materials.glass);
  } else if (/ledger/.test(theme)) {
    add('ledger plate', 'box', { x: 0, y: cosmetic.slot === 'eyewear' ? (blob ? .98 : .86) : .15, z: cosmetic.slot === 'eyewear' ? frontZ : (blob ? .72 : .56) }, { x: .22, y: .16, z: .035 }, materials.silver);
  } else if (/shimmer|prismatic/.test(theme) && cosmetic.slot === 'eyewear') {
    add('prismatic center lens', 'sphere', { x: 0, y: blob ? .85 : .73, z: frontZ - .025 }, { x: .11, y: .19, z: .05 }, materials.silver, { z: 45 });
  } else if (cosmetic.label.toLowerCase().endsWith(' charm') && cosmetic.slot === 'faceAccessory') {
    // Catch charms read as small creature medallions instead of scarves chosen by rotation.
    add('creature charm body', 'sphere', { x: 0, y: (blob ? .44 : .45) - .16, z: frontZ - .015 }, { x: .13, y: .08, z: .04 }, materials.silver);
    add('creature charm tail', 'cone', { x: -.14, y: (blob ? .44 : .45) - .16, z: frontZ - .01 }, { x: .07, y: .13, z: .025 }, materials.accessory, { z: 90 });
  } else if (cosmetic.id === 'daypack') {
    add('compact daypack front pocket', 'box', { x: 0, y: -.12, z: blob ? .69 : .54 }, { x: .4, y: .3, z: .11 }, materials.silver, { x: -7 });
    add('compact daypack rolled blanket', 'cylinder', { x: 0, y: .39, z: blob ? .62 : .47 }, { x: .11, y: .48, z: .11 }, materials.accessory, { z: 90 });
  } else if (cosmetic.id === 'badge-field-naturalist-3') {
    for (const side of [-1, 1]) add(`research sample tube ${side}`, 'cylinder', { x: side * .34, y: -.02, z: blob ? .67 : .52 }, { x: .075, y: .38, z: .075 }, materials.silver);
    add('research notebook', 'box', { x: 0, y: .18, z: blob ? .7 : .55 }, { x: .28, y: .34, z: .045 }, materials.pack);
  } else if (cosmetic.id === 'badge-thousand-casts') {
    add('angler landing net hoop', 'cylinder', { x: .22, y: .15, z: blob ? .7 : .55 }, { x: .28, y: .035, z: .28 }, materials.silver, { x: 90 });
    add('angler rod tube', 'cylinder', { x: -.3, y: .13, z: blob ? .65 : .5 }, { x: .06, y: .78, z: .06 }, materials.accessory, { z: 8 });
  } else if (/turtle|nautilus|shell/.test(theme) && cosmetic.slot === 'backAccessory' && visual !== 'shell') {
    add('themed shell boss', 'sphere', { x: 0, y: (blob ? .05 : -.03), z: blob ? .7 : .55 }, { x: .34, y: .34, z: .08 }, materials.silver);
  } else if (/marlin|sailfish|shark|ray/.test(theme) && cosmetic.slot === 'headwear' && !['horn', 'sun'].includes(visual)) {
    add('marine fin crest', 'cone', { x: 0, y: headY + .34, z: .04 }, { x: .11, y: .48, z: .08 }, materials.silver, { x: -12 });
  }
  root.enabled = false;
  return root;
}

export function createCharacterModel(parent, { name = 'Character' } = {}) {
  const materials = {
    jacket: surface(LEGACY_CHARACTER_PALETTE.player),
    accent: surface(LEGACY_CHARACTER_PALETTE.playerAccent),
    skin: surface(LEGACY_CHARACTER_PALETTE.skin, .2),
    boots: surface(LEGACY_CHARACTER_PALETTE.boots, .18),
    pack: surface(LEGACY_CHARACTER_PALETTE.backpack, .16),
    trousers: surface(LEGACY_CHARACTER_PALETTE.trousers, .16),
    hair: surface([.08, .05, .035], .18),
    dark: surface(LEGACY_CHARACTER_PALETTE.dark, .4),
    hat: surface(LEGACY_CHARACTER_PALETTE.playerAccent, .3),
    accessory: surface([.84, .42, .13], .3),
    blobBlue: surface([.28, .72, .95], .38),
    glass: surface([.2, .52, .62], .82),
    silver: surface([.72, .74, .72], .7)
  };
  const humanRig = group(parent, `${name} human avatar`);
  const blobRig = group(parent, `${name} Blue Blob avatar`);

  primitive(humanRig, 'Tapered upper torso', 'box', AVATAR_ATTACHMENT_SPEC.upperTorso.position, AVATAR_ATTACHMENT_SPEC.upperTorso.scale, materials.jacket);
  primitive(humanRig, 'Lower torso', 'box', AVATAR_ATTACHMENT_SPEC.lowerTorso.position, AVATAR_ATTACHMENT_SPEC.lowerTorso.scale, materials.accent);
  primitive(humanRig, 'Jacket collar', 'box', { x: 0, y: .34, z: -.04 }, { x: .38, y: .12, z: .47 }, materials.accent);
  primitive(humanRig, 'Neck', 'cylinder', AVATAR_ATTACHMENT_SPEC.neck.position, AVATAR_ATTACHMENT_SPEC.neck.scale, materials.skin);
  primitive(humanRig, 'Left shoulder cap', 'sphere', { x: -.37, y: .27, z: 0 }, { x: .25, y: .25, z: .27 }, materials.jacket);
  primitive(humanRig, 'Right shoulder cap', 'sphere', { x: .37, y: .27, z: 0 }, { x: .25, y: .25, z: .27 }, materials.jacket);
  primitive(humanRig, 'Head', 'sphere', AVATAR_ATTACHMENT_SPEC.head.position, AVATAR_ATTACHMENT_SPEC.head.scale, materials.skin);
  primitive(humanRig, 'Left eye', 'sphere', { x: -.105, y: .73, z: -.235 }, { x: .05, y: .06, z: .04 }, materials.dark);
  primitive(humanRig, 'Right eye', 'sphere', { x: .105, y: .73, z: -.235 }, { x: .05, y: .06, z: .04 }, materials.dark);
  primitive(humanRig, 'Nose', 'cone', { x: 0, y: .64, z: -.27 }, { x: .065, y: .11, z: .065 }, materials.skin, { x: 90 });

  const hairStyles = new Map();
  for (const [id, label] of [['short', 'Short'], ['tousled', 'Tousled'], ['ponytail', 'Ponytail'], ['mohawk', 'Mohawk'], ['long', 'Long'], ['bun', 'Trail bun'], ['braids', 'Twin braids'], ['bald', 'Bald']]) {
    hairStyles.set(id, group(humanRig, `${label} hair style`));
  }
  primitive(hairStyles.get('short'), 'Short hair cap', 'sphere', { x: 0, y: .9, z: .02 }, { x: .475, y: .2, z: .455 }, materials.hair);
  primitive(hairStyles.get('tousled'), 'Tousled hair cap', 'sphere', { x: 0, y: .9, z: .02 }, { x: .48, y: .19, z: .46 }, materials.hair);
  [-.23, 0, .22].forEach((x, index) => primitive(hairStyles.get('tousled'), `Tousled lock ${index + 1}`, 'cone',
    { x, y: .995 + index % 2 * .045, z: -.02 }, { x: .13, y: .25, z: .13 }, materials.hair, { z: (index - 1) * -12 }));
  const ponytailTop = primitive(hairStyles.get('ponytail'), 'Ponytail cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .47, y: .2, z: .45 }, materials.hair);
  primitive(hairStyles.get('ponytail'), 'Ponytail tie', 'sphere', { x: 0, y: .79, z: .34 }, { x: .17, y: .17, z: .17 }, materials.accent);
  primitive(hairStyles.get('ponytail'), 'Ponytail', 'sphere', { x: 0, y: .62, z: .39 }, { x: .23, y: .4, z: .21 }, materials.hair, { x: -8 });
  [-.2, 0, .2].forEach((z, index) => primitive(hairStyles.get('mohawk'), `Mohawk crest ${index + 1}`, 'cone',
    { x: 0, y: 1.02, z }, { x: .16, y: .35 + (index === 1 ? .08 : 0), z: .16 }, materials.hair));
  const longTop = primitive(hairStyles.get('long'), 'Long hair cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .48, y: .2, z: .46 }, materials.hair);
  primitive(hairStyles.get('long'), 'Long hair back', 'sphere', { x: 0, y: .62, z: .25 }, { x: .44, y: .6, z: .22 }, materials.hair, { x: -5 });
  for (const side of [-1, 1]) primitive(hairStyles.get('long'), `Long hair side ${side}`, 'sphere',
    { x: side * .34, y: .65, z: .04 }, { x: .15, y: .48, z: .16 }, materials.hair, { z: side * 5 });
  primitive(hairStyles.get('bun'), 'Trail bun cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .47, y: .2, z: .45 }, materials.hair);
  primitive(hairStyles.get('bun'), 'Trail bun', 'sphere', { x: 0, y: .96, z: .36 }, { x: .27, y: .27, z: .27 }, materials.hair);
  const braidsTop = primitive(hairStyles.get('braids'), 'Braids cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .47, y: .2, z: .45 }, materials.hair);
  for (const side of [-1, 1]) {
    primitive(hairStyles.get('braids'), `Braid ${side} upper`, 'cylinder', { x: side * .3, y: .62, z: .15 }, { x: .12, y: .52, z: .12 }, materials.hair, { z: side * 5 });
    primitive(hairStyles.get('braids'), `Braid ${side} end`, 'sphere', { x: side * .35, y: .33, z: .17 }, { x: .13, y: .17, z: .13 }, materials.hair);
  }
  const hairTopParts = new Map([['ponytail', [ponytailTop]], ['long', [longTop]], ['braids', [braidsTop]]]);

  const beardStyles = new Map();
  for (const [id, label] of [['none', 'No beard'], ['stubble', 'Stubble'], ['short', 'Short beard'], ['full', 'Full beard'], ['goatee', 'Goatee']]) {
    beardStyles.set(id, group(humanRig, label));
  }
  primitive(beardStyles.get('stubble'), 'Stubble chin', 'sphere', { x: 0, y: .53, z: -.265 }, { x: .3, y: .16, z: .035 }, materials.hair);
  primitive(beardStyles.get('short'), 'Short beard chin', 'sphere', { x: 0, y: .48, z: -.25 }, { x: .31, y: .27, z: .085 }, materials.hair);
  for (const side of [-1, 1]) primitive(beardStyles.get('short'), `Short beard jaw ${side}`, 'sphere',
    { x: side * .22, y: .54, z: -.205 }, { x: .12, y: .25, z: .07 }, materials.hair, { z: side * 16 });
  primitive(beardStyles.get('full'), 'Full beard chin', 'sphere', { x: 0, y: .43, z: -.22 }, { x: .35, y: .39, z: .13 }, materials.hair);
  for (const side of [-1, 1]) primitive(beardStyles.get('full'), `Full beard cheek ${side}`, 'sphere',
    { x: side * .25, y: .57, z: -.19 }, { x: .15, y: .3, z: .09 }, materials.hair, { z: side * 12 });
  primitive(beardStyles.get('goatee'), 'Goatee', 'sphere', { x: 0, y: .45, z: -.27 }, { x: .13, y: .3, z: .065 }, materials.hair);

  const mustacheStyles = new Map();
  for (const [id, label] of [['none', 'No mustache'], ['neat', 'Neat mustache'], ['handlebar', 'Handlebar mustache'], ['full', 'Full mustache']]) {
    mustacheStyles.set(id, group(humanRig, label));
  }
  for (const side of [-1, 1]) {
    primitive(mustacheStyles.get('neat'), `Neat mustache ${side}`, 'sphere', { x: side * .075, y: .585, z: -.305 }, { x: .11, y: .045, z: .035 }, materials.hair, { z: side * 8 });
    primitive(mustacheStyles.get('handlebar'), `Handlebar mustache center ${side}`, 'sphere', { x: side * .09, y: .585, z: -.305 }, { x: .13, y: .05, z: .038 }, materials.hair, { z: side * 8 });
    primitive(mustacheStyles.get('handlebar'), `Handlebar mustache curl ${side}`, 'cone', { x: side * .22, y: .61, z: -.285 }, { x: .055, y: .18, z: .045 }, materials.hair, { z: side * -58 });
    primitive(mustacheStyles.get('full'), `Full mustache ${side}`, 'sphere', { x: side * .1, y: .57, z: -.31 }, { x: .15, y: .085, z: .045 }, materials.hair, { z: side * 10 });
  }

  const accessories = buildEyewear(humanRig, materials);
  const makeAccessory = (id, label) => {
    const root = group(humanRig, label);
    accessories.set(id, root);
    return root;
  };
  const beanie = makeAccessory('beanie', 'Beanie');
  primitive(beanie, 'Beanie crown', 'cone', { x: 0, y: 1, z: 0 }, { x: .5, y: .34, z: .5 }, materials.hat);
  primitive(beanie, 'Beanie band', 'cylinder', { x: 0, y: .89, z: 0 }, { x: .51, y: .12, z: .51 }, materials.hat);
  const trailHat = makeAccessory('trail-hat', 'Trail hat');
  primitive(trailHat, 'Trail hat brim', 'box', { x: 0, y: .94, z: -.05 }, { x: .72, y: .055, z: .62 }, materials.hat);
  primitive(trailHat, 'Trail hat crown', 'cylinder', { x: 0, y: 1.06, z: .02 }, { x: .46, y: .24, z: .46 }, materials.hat);
  const cap = makeAccessory('fishing-cap', 'Fishing cap');
  primitive(cap, 'Fishing cap crown', 'sphere', { x: 0, y: .96, z: .03 }, { x: .48, y: .21, z: .45 }, materials.hat);
  primitive(cap, 'Fishing cap bill', 'box', { x: 0, y: .91, z: -.38 }, { x: .48, y: .055, z: .35 }, materials.hat, { x: -5 });
  const headlamp = makeAccessory('headlamp', 'Headlamp');
  primitive(headlamp, 'Headlamp band', 'cylinder', { x: 0, y: .88, z: 0 }, { x: .49, y: .09, z: .49 }, materials.hat);
  primitive(headlamp, 'Headlamp light', 'sphere', { x: 0, y: .89, z: -.27 }, { x: .14, y: .13, z: .11 }, materials.silver);
  const scarf = makeAccessory('scarf', 'Trail scarf');
  primitive(scarf, 'Scarf collar', 'cylinder', { x: 0, y: .44, z: 0 }, { x: .32, y: .17, z: .32 }, materials.accessory);
  primitive(scarf, 'Scarf tail', 'box', { x: .17, y: .17, z: .25 }, { x: .18, y: .55, z: .1 }, materials.accessory, { x: -12, z: -8 });
  const bandana = makeAccessory('bandana', 'Bandana');
  primitive(bandana, 'Bandana cloth', 'box', { x: 0, y: .57, z: -.245 }, { x: .31, y: .18, z: .035 }, materials.accessory, { x: 7 });
  primitive(bandana, 'Bandana knot', 'sphere', { x: 0, y: .56, z: .23 }, { x: .11, y: .1, z: .09 }, materials.accessory);
  const gaiter = makeAccessory('neck-gaiter', 'Neck gaiter');
  primitive(gaiter, 'Neck gaiter cloth', 'cylinder', { x: 0, y: .48, z: 0 }, { x: .3, y: .23, z: .3 }, materials.accessory);
  const necklace = makeAccessory('necklace', 'Summit necklace');
  primitive(necklace, 'Necklace cord', 'cylinder', { x: 0, y: .47, z: -.12 }, { x: .2, y: .035, z: .2 }, materials.accessory);
  primitive(necklace, 'Necklace pendant', 'sphere', { x: 0, y: .39, z: -.205 }, { x: .075, y: .1, z: .035 }, materials.accessory);
  const flowers = makeAccessory('flower-crown', 'Flower crown');
  primitive(flowers, 'Flower crown band', 'cylinder', { x: 0, y: .91, z: 0 }, { x: .49, y: .06, z: .49 }, materials.hat);
  [-.3, -.15, 0, .15, .3].forEach((x, index) => primitive(flowers, `Flower crown bloom ${index + 1}`, 'sphere',
    { x, y: .96 + index % 2 * .03, z: -.23 + Math.abs(x) * .14 }, { x: .1, y: .1, z: .08 }, materials.hat));

  const backpackBody = primitive(humanRig, 'Backpack', 'box', { x: 0, y: -.03, z: .33 }, { x: .55, y: .66, z: .31 }, materials.pack, { x: -7 });
  const backpackFlap = primitive(humanRig, 'Backpack flap', 'box', { x: 0, y: .15, z: .495 }, { x: .45, y: .18, z: .05 }, materials.pack, { x: -7 });
  const backAccessoryRoots = new Map([['backpack', [backpackBody, backpackFlap]]]);
  const blobAccessories = new Map();
  const blobBackAccessoryRoots = new Map();
  const leftLimb = buildLimb(humanRig, 'Left', materials);
  const rightLimb = buildLimb(humanRig, 'Right', materials);

  primitive(blobRig, 'Classic Blue Blob body', 'capsule', { x: 0, y: -.05, z: 0 }, { x: .72, y: 1.12, z: .72 }, materials.blobBlue);
  primitive(blobRig, 'Classic Blue Blob head', 'sphere', { x: 0, y: .82, z: 0 }, { x: .48, y: .48, z: .48 }, materials.blobBlue);
  primitive(blobRig, 'Classic Blue Blob facing marker', 'box', { x: 0, y: .35, z: -.43 }, { x: .16, y: .16, z: .48 }, materials.blobBlue);

  let appearance = normalizeAppearance();
  let cosmeticDiagnostic = Object.freeze({ avatarType: 'human', equippedIds: [], instantiatedIds: [], rejectedIds: [], missingModelIds: [] });
  const instantiate = (target, id, rig, blob = false, back = false) => {
    if (id === 'none' || target.has(id)) return;
    const cosmetic = COSMETIC_BY_ID.get(id);
    if (!cosmetic) return;
    try {
      const created = buildGeneratedCosmetic(rig, cosmetic, materials, blob);
      target.set(id, back ? [created] : created);
    } catch (error) {
      console.warn(`Cosmetic model could not be instantiated: ${id}`, error);
    }
  };
  const setAppearance = (value) => {
    const requested = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    appearance = normalizeAppearance(value);
    const resolved = resolveAppearance(appearance);
    recolor(materials.jacket, resolved.shirtColorValue.color);
    recolor(materials.accent, resolved.shirtAccentColor ?? resolved.shirtColorValue.color.map((component) => clamp(component * .72 + .08, 0, 1)));
    recolor(materials.skin, resolved.skinToneValue.color);
    recolor(materials.trousers, resolved.pantsColorValue.color);
    recolor(materials.hair, resolved.hairColorValue.color);
    recolor(materials.hat, resolved.hatColor);
    recolor(materials.accessory, resolved.accessoryColor);
    recolor(materials.pack, resolved.backpackColorValue.color);
    recolor(materials.blobBlue, resolved.blobColor, .03);
    humanRig.enabled = appearance.avatarType === 'human';
    blobRig.enabled = appearance.avatarType === 'blob';
    const hairVisibility = hairVisibilityForHeadwear(appearance.hairStyle, appearance.headwear);
    for (const [id, root] of hairStyles) root.enabled = hairVisibility.root && id === appearance.hairStyle;
    for (const part of hairTopParts.get(appearance.hairStyle) ?? []) part.enabled = hairVisibility.top;
    for (const [id, root] of beardStyles) root.enabled = id === appearance.beardStyle;
    for (const [id, root] of mustacheStyles) root.enabled = id === appearance.mustacheStyle;
    const worn = new Set([appearance.headwear, appearance.eyewear, appearance.faceAccessory]);
    if (appearance.avatarType === 'human') {
      for (const id of worn) instantiate(accessories, id, humanRig);
      instantiate(backAccessoryRoots, appearance.backAccessory, humanRig, false, true);
    } else {
      for (const id of worn) instantiate(blobAccessories, id, blobRig, true);
      instantiate(blobBackAccessoryRoots, appearance.backAccessory, blobRig, true, true);
    }
    for (const [id, root] of accessories) root.enabled = worn.has(id);
    for (const [id, roots] of backAccessoryRoots) for (const root of roots) root.enabled = id === appearance.backAccessory;
    for (const [id, root] of blobAccessories) root.enabled = worn.has(id);
    for (const [id, roots] of blobBackAccessoryRoots) for (const root of roots) root.enabled = id === appearance.backAccessory;
    const equippedIds = [...worn, appearance.backAccessory].filter((id) => id !== 'none');
    const activeAccessories = appearance.avatarType === 'human' ? accessories : blobAccessories;
    const activeBack = appearance.avatarType === 'human' ? backAccessoryRoots : blobBackAccessoryRoots;
    const instantiatedIds = equippedIds.filter((id) => activeAccessories.has(id) || activeBack.has(id));
    const rejectedIds = ['headwear', 'eyewear', 'faceAccessory', 'backAccessory']
      .map((slot) => requested[slot])
      .filter((id, index, ids) => typeof id === 'string' && id !== 'none'
        && appearance[['headwear', 'eyewear', 'faceAccessory', 'backAccessory'][index]] !== id
        && ids.indexOf(id) === index);
    const missingModelIds = [...new Set([
      ...rejectedIds,
      ...equippedIds.filter((id) => !instantiatedIds.includes(id))
    ])];
    cosmeticDiagnostic = Object.freeze({
      avatarType: appearance.avatarType,
      equippedIds: Object.freeze([...equippedIds]),
      instantiatedIds: Object.freeze([...instantiatedIds]),
      rejectedIds: Object.freeze([...rejectedIds]),
      missingModelIds: Object.freeze(missingModelIds)
    });
    return normalizeAppearance(appearance);
  };

  return {
    humanRig, blobRig, materials, hairStyles, hairTopParts, beardStyles, mustacheStyles, accessories, backAccessoryRoots,
    leftLimb, rightLimb, leftHandAnchor: leftLimb.handAnchor, rightHandAnchor: rightLimb.handAnchor,
    setAppearance,
    getAppearance: () => normalizeAppearance(appearance),
    getCosmeticDiagnostic: () => cosmeticDiagnostic
  };
}
