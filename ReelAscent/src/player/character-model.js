import * as pc from 'playcanvas';
import {
  LEGACY_CHARACTER_PALETTE,
  hairVisibilityForHeadwear,
  normalizeAppearance,
  resolveAppearance
} from './appearance.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

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
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type, material, castShadows: true, receiveShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

function joint(parent, name, position) {
  const entity = new pc.Entity(name);
  entity.setLocalPosition(position.x, position.y, position.z);
  parent.addChild(entity);
  return entity;
}

function group(parent, name) {
  const entity = new pc.Entity(name);
  parent.addChild(entity);
  return entity;
}

function buildLimb(parent, side, materials) {
  const direction = side === 'Left' ? -1 : 1;
  const shoulder = joint(parent, `${side} shoulder`, { x: direction * .41, y: .27, z: 0 });
  primitive(shoulder, `${side} upper arm`, 'box', { x: 0, y: -.18, z: 0 },
    { x: .18, y: .36, z: .2 }, materials.jacket);
  const elbow = joint(shoulder, `${side} elbow`, { x: 0, y: -.36, z: 0 });
  primitive(elbow, `${side} lower arm`, 'box', { x: 0, y: -.16, z: 0 },
    { x: .155, y: .32, z: .175 }, materials.jacket);
  primitive(elbow, `${side} hand`, 'sphere', { x: 0, y: -.35, z: 0 },
    { x: .16, y: .19, z: .16 }, materials.skin);
  const handAnchor = joint(elbow, `${side} hand attachment`, { x: 0, y: -.35, z: 0 });

  const hip = joint(parent, `${side} hip`, { x: direction * .19, y: -.35, z: 0 });
  primitive(hip, `${side} upper leg`, 'box', { x: 0, y: -.15, z: 0 },
    { x: .23, y: .3, z: .27 }, materials.trousers);
  const knee = joint(hip, `${side} knee`, { x: 0, y: -.3, z: 0 });
  primitive(knee, `${side} lower leg`, 'box', { x: 0, y: -.135, z: 0 },
    { x: .2, y: .27, z: .23 }, materials.trousers);
  primitive(knee, `${side} boot`, 'box', { x: 0, y: -.26, z: -.075 },
    { x: .25, y: .16, z: .41 }, materials.boots);
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
    'sphere', { x, y: .73, z: -.26 }, { x: .145, y: .145, z: .028 }, glass);
  primitive(rounds, 'Round glasses bridge', 'box', { x: 0, y: .73, z: -.27 }, { x: .08, y: .022, z: .02 }, frame);

  const aviators = make('aviators', 'Aviator sunglasses');
  for (const x of [-.13, .13]) primitive(aviators, `Aviator ${x < 0 ? 'left' : 'right'} lens`,
    'sphere', { x, y: .71, z: -.267 }, { x: .17, y: .145, z: .032 }, dark, { z: x < 0 ? -6 : 6 });
  primitive(aviators, 'Aviator bridge', 'box', { x: 0, y: .755, z: -.276 }, { x: .09, y: .025, z: .02 }, frame);

  const sports = make('sport-shades', 'Sport shades');
  primitive(sports, 'Sport shades visor', 'box', { x: 0, y: .73, z: -.275 }, { x: .39, y: .13, z: .035 }, dark, { x: -4 });
  primitive(sports, 'Sport shades upper rim', 'box', { x: 0, y: .81, z: -.268 }, { x: .42, y: .035, z: .035 }, frame);

  const clear = make('clear-spectacles', 'Clear spectacles');
  for (const x of [-.13, .13]) primitive(clear, `Clear spectacles ${x < 0 ? 'left' : 'right'} lens`,
    'box', { x, y: .73, z: -.26 }, { x: .18, y: .14, z: .024 }, glass);
  primitive(clear, 'Clear spectacles bridge', 'box', { x: 0, y: .73, z: -.267 }, { x: .08, y: .02, z: .018 }, materials.silver);

  const snow = make('snow-glasses', 'Snow glasses');
  primitive(snow, 'Snow glasses lens', 'box', { x: 0, y: .74, z: -.285 }, { x: .39, y: .16, z: .045 }, glass, { x: -3 });
  primitive(snow, 'Snow glasses rim', 'box', { x: 0, y: .74, z: -.275 }, { x: .44, y: .205, z: .025 }, frame);

  const goggles = make('goggles', 'Summit goggles');
  for (const x of [-.14, .14]) primitive(goggles, `Summit goggles ${x < 0 ? 'left' : 'right'} lens`,
    'sphere', { x, y: .75, z: -.285 }, { x: .17, y: .13, z: .045 }, dark);
  primitive(goggles, 'Summit goggles strap', 'cylinder', { x: 0, y: .76, z: 0 }, { x: .47, y: .055, z: .47 }, frame);
  return result;
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
    accessory: surface([.84, .42, .13], .3),
    blobBlue: surface([.28, .72, .95], .38),
    glass: surface([.2, .52, .62], .82),
    silver: surface([.72, .74, .72], .7)
  };
  const humanRig = group(parent, `${name} human avatar`);
  const blobRig = group(parent, `${name} Blue Blob avatar`);

  primitive(humanRig, 'Tapered upper torso', 'box', { x: 0, y: .06, z: 0 }, { x: .7, y: .58, z: .42 }, materials.jacket);
  primitive(humanRig, 'Lower torso', 'box', { x: 0, y: -.28, z: 0 }, { x: .55, y: .18, z: .38 }, materials.accent);
  primitive(humanRig, 'Jacket collar', 'box', { x: 0, y: .34, z: -.04 }, { x: .38, y: .12, z: .47 }, materials.accent);
  primitive(humanRig, 'Neck', 'cylinder', { x: 0, y: .46, z: 0 }, { x: .17, y: .2, z: .17 }, materials.skin);
  primitive(humanRig, 'Left shoulder cap', 'sphere', { x: -.37, y: .27, z: 0 }, { x: .25, y: .25, z: .27 }, materials.jacket);
  primitive(humanRig, 'Right shoulder cap', 'sphere', { x: .37, y: .27, z: 0 }, { x: .25, y: .25, z: .27 }, materials.jacket);
  primitive(humanRig, 'Head', 'sphere', { x: 0, y: .7, z: -.015 }, { x: .47, y: .52, z: .46 }, materials.skin);
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

  const accessories = buildEyewear(humanRig, materials);
  const makeAccessory = (id, label) => {
    const root = group(humanRig, label);
    accessories.set(id, root);
    return root;
  };
  const beanie = makeAccessory('beanie', 'Beanie');
  primitive(beanie, 'Beanie crown', 'cone', { x: 0, y: 1, z: 0 }, { x: .5, y: .34, z: .5 }, materials.accessory);
  primitive(beanie, 'Beanie band', 'cylinder', { x: 0, y: .89, z: 0 }, { x: .51, y: .12, z: .51 }, materials.accessory);
  const trailHat = makeAccessory('trail-hat', 'Trail hat');
  primitive(trailHat, 'Trail hat brim', 'box', { x: 0, y: .94, z: -.05 }, { x: .72, y: .055, z: .62 }, materials.accessory);
  primitive(trailHat, 'Trail hat crown', 'cylinder', { x: 0, y: 1.06, z: .02 }, { x: .46, y: .24, z: .46 }, materials.accessory);
  const cap = makeAccessory('fishing-cap', 'Fishing cap');
  primitive(cap, 'Fishing cap crown', 'sphere', { x: 0, y: .96, z: .03 }, { x: .48, y: .21, z: .45 }, materials.accessory);
  primitive(cap, 'Fishing cap bill', 'box', { x: 0, y: .91, z: -.38 }, { x: .48, y: .055, z: .35 }, materials.accessory, { x: -5 });
  const headlamp = makeAccessory('headlamp', 'Headlamp');
  primitive(headlamp, 'Headlamp band', 'cylinder', { x: 0, y: .88, z: 0 }, { x: .49, y: .09, z: .49 }, materials.accessory);
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
  primitive(flowers, 'Flower crown band', 'cylinder', { x: 0, y: .91, z: 0 }, { x: .49, y: .06, z: .49 }, materials.accessory);
  [-.3, -.15, 0, .15, .3].forEach((x, index) => primitive(flowers, `Flower crown bloom ${index + 1}`, 'sphere',
    { x, y: .96 + index % 2 * .03, z: -.23 + Math.abs(x) * .14 }, { x: .1, y: .1, z: .08 }, materials.accessory));

  const backpackBody = primitive(humanRig, 'Backpack', 'box', { x: 0, y: -.03, z: .34 }, { x: .55, y: .66, z: .27 }, materials.pack, { x: -7 });
  const backpackFlap = primitive(humanRig, 'Backpack flap', 'box', { x: 0, y: .15, z: .495 }, { x: .45, y: .18, z: .05 }, materials.pack, { x: -7 });
  const backAccessoryRoots = new Map([['backpack', [backpackBody, backpackFlap]]]);
  const leftLimb = buildLimb(humanRig, 'Left', materials);
  const rightLimb = buildLimb(humanRig, 'Right', materials);

  primitive(blobRig, 'Classic Blue Blob body', 'capsule', { x: 0, y: -.05, z: 0 }, { x: .72, y: 1.12, z: .72 }, materials.blobBlue);
  primitive(blobRig, 'Classic Blue Blob head', 'sphere', { x: 0, y: .82, z: 0 }, { x: .48, y: .48, z: .48 }, materials.blobBlue);
  primitive(blobRig, 'Classic Blue Blob facing marker', 'box', { x: 0, y: .35, z: -.43 }, { x: .16, y: .16, z: .48 }, materials.blobBlue);

  let appearance = normalizeAppearance();
  const setAppearance = (value) => {
    appearance = normalizeAppearance(value);
    const resolved = resolveAppearance(appearance);
    recolor(materials.jacket, resolved.shirtColorValue.color);
    recolor(materials.accent, resolved.shirtAccentColor ?? resolved.shirtColorValue.color.map((component) => clamp(component * .72 + .08, 0, 1)));
    recolor(materials.skin, resolved.skinToneValue.color);
    recolor(materials.trousers, resolved.pantsColorValue.color);
    recolor(materials.hair, resolved.hairColorValue.color);
    recolor(materials.accessory, resolved.accessoryColor);
    recolor(materials.pack, resolved.backpackColorValue.color);
    recolor(materials.blobBlue, resolved.blobColor, .03);
    humanRig.enabled = appearance.avatarType === 'human';
    blobRig.enabled = appearance.avatarType === 'blob';
    const hairVisibility = hairVisibilityForHeadwear(appearance.hairStyle, appearance.headwear);
    for (const [id, root] of hairStyles) root.enabled = hairVisibility.root && id === appearance.hairStyle;
    for (const part of hairTopParts.get(appearance.hairStyle) ?? []) part.enabled = hairVisibility.top;
    const worn = new Set([appearance.headwear, appearance.eyewear, appearance.faceAccessory]);
    for (const [id, root] of accessories) root.enabled = worn.has(id);
    for (const [id, roots] of backAccessoryRoots) for (const root of roots) root.enabled = id === appearance.backAccessory;
    return normalizeAppearance(appearance);
  };

  return {
    humanRig, blobRig, materials, hairStyles, hairTopParts, accessories, backAccessoryRoots,
    leftLimb, rightLimb, leftHandAnchor: leftLimb.handAnchor, rightHandAnchor: rightLimb.handAnchor,
    setAppearance, getAppearance: () => normalizeAppearance(appearance)
  };
}
