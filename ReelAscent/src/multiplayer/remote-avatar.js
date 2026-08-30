import * as pc from 'playcanvas';
import { resolveSpecies } from '../fishing/fish-data.js';
import { REMOTE_PLAYER_COLORS } from './player-colors.js';
import { emoteDurationMs, normalizeEmote } from './emotes.js';
import { LEGACY_CHARACTER_PALETTE, hairVisibilityForHeadwear, normalizeAppearance, resolveAppearance } from '../player/appearance.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function material(color, { emissive = [0, 0, 0], gloss = .24 } = {}) {
  const result = new pc.StandardMaterial();
  result.diffuse = new pc.Color(...color);
  result.emissive = new pc.Color(...emissive);
  result.gloss = gloss;
  result.update();
  return result;
}

function setMaterialColor(surface, color, emissiveScale = 0) {
  surface.diffuse.set(color[0], color[1], color[2]);
  surface.emissive.set(color[0] * emissiveScale, color[1] * emissiveScale, color[2] * emissiveScale);
  surface.update();
}

function shirtAccent(color) {
  return color.map((value) => clamp(value * .72 + .08, 0, 1));
}

function primitive(parent, name, type, position, scale, surface, rotation = {}) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type, material: surface, castShadows: true, receiveShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

function limb(parent, name, pivotPosition, scale, surface) {
  const pivot = new pc.Entity(`${name} pivot`);
  pivot.setLocalPosition(pivotPosition.x, pivotPosition.y, pivotPosition.z);
  parent.addChild(pivot);
  primitive(pivot, name, 'box', { x: 0, y: -scale.y * .48, z: 0 }, scale, surface);
  return pivot;
}

function clearChildren(entity) {
  for (const child of [...entity.children]) child.destroy();
}

function createCatchModel(root, catchData) {
  clearChildren(root);
  const species = resolveSpecies(catchData.speciesId, true);
  const visual = species?.visual ?? {};
  const base = material(visual.colors?.[0] ?? [.4, .68, .42], {
    emissive: catchData.shiny ? [.08, .08, .025] : [0, 0, 0], gloss: .46
  });
  const accent = material(visual.colors?.[1] ?? [.82, .58, .22], {
    emissive: catchData.shiny ? [.11, .08, .02] : [0, 0, 0], gloss: .38
  });
  const eye = material([.025, .035, .03], { gloss: .8 });
  const lengthMeters = clamp((Number(catchData.length) || 8) * .0254, .18, 4.4);
  const displayLength = lengthMeters <= 1.5 ? lengthMeters : 1.5 + Math.sqrt(lengthMeters - 1.5) * .72;
  const lengthScale = clamp(visual.lengthScale ?? 1, .58, 1.55);
  const depth = clamp(visual.depth ?? 1, .55, 1.55);
  const width = clamp(visual.width ?? 1, .5, 1.5);
  const archetype = visual.archetype ?? 'panfish';

  if (['octopus', 'squid', 'jellyfish', 'anemone'].includes(archetype)) {
    primitive(root, 'Remote catch mantle', 'sphere', { x: .16, y: .03, z: 0 }, { x: .42, y: .46, z: .36 }, base);
    for (let index = 0; index < 6; index += 1) {
      primitive(root, `Remote catch tentacle ${index + 1}`, 'cylinder',
        { x: -.18 - index * .04, y: -.2 + (index % 2) * .1, z: (index - 2.5) * .1 },
        { x: .045, y: .42 + (index % 3) * .08, z: .045 }, accent, { z: 70 + index * 5 });
    }
  } else if (['crab', 'lobster', 'crayfish'].includes(archetype)) {
    primitive(root, 'Remote catch shell', 'sphere', { x: 0, y: 0, z: 0 }, { x: .48, y: .22, z: .4 }, base);
    primitive(root, 'Remote catch left claw', 'sphere', { x: .46, y: .03, z: .35 }, { x: .25, y: .15, z: .2 }, accent);
    primitive(root, 'Remote catch right claw', 'sphere', { x: .46, y: .03, z: -.35 }, { x: .25, y: .15, z: .2 }, accent);
    for (const side of [-1, 1]) for (let index = 0; index < 3; index += 1) {
      primitive(root, `Remote catch leg ${side} ${index}`, 'box',
        { x: -.2 + index * .18, y: -.12, z: side * (.34 + index * .05) },
        { x: .28, y: .035, z: .035 }, accent, { y: side * (28 + index * 9), z: side * 12 });
    }
  } else if (['clam', 'oyster', 'mussel', 'scallop'].includes(archetype)) {
    primitive(root, 'Remote catch shell', 'sphere', { x: 0, y: 0, z: 0 }, { x: .55, y: .18, z: .43 }, base, { z: -8 });
    primitive(root, 'Remote catch shell lip', 'sphere', { x: .05, y: .08, z: 0 }, { x: .48, y: .13, z: .38 }, accent, { z: 6 });
  } else {
    primitive(root, 'Remote catch body', 'sphere', { x: -.05, y: 0, z: 0 },
      { x: .58 * lengthScale, y: .25 * depth, z: .22 * width }, base);
    primitive(root, 'Remote catch head', 'sphere', { x: .42 * lengthScale, y: .02, z: 0 },
      { x: .29, y: .25 * depth, z: .22 * width }, base);
    primitive(root, 'Remote catch tail', 'cone', { x: -.58 * lengthScale, y: 0, z: 0 },
      { x: .28, y: .38 * depth, z: .09 }, accent, { z: 90 });
    primitive(root, 'Remote catch fin', 'cone', { x: -.05, y: .22 * depth, z: 0 },
      { x: .16, y: .25, z: .06 }, accent);
    primitive(root, 'Remote catch eye', 'sphere', { x: .53 * lengthScale, y: .08, z: .2 * width },
      { x: .045, y: .045, z: .035 }, eye);
  }
  root.setLocalScale(displayLength, displayLength, displayLength);
}

export function createRemoteAvatar(app, playerId, colorIndex = 0, initialAppearance = null) {
  const palette = REMOTE_PLAYER_COLORS[colorIndex % REMOTE_PLAYER_COLORS.length];
  const cloth = material(palette.rgb, { emissive: palette.rgb.map((value) => value * .035) });
  const skin = material(LEGACY_CHARACTER_PALETTE.skin, { gloss: .2 });
  const trousers = material(LEGACY_CHARACTER_PALETTE.trousers, { gloss: .16 });
  const boots = material(LEGACY_CHARACTER_PALETTE.boots, { gloss: .18 });
  const pack = material(LEGACY_CHARACTER_PALETTE.backpack, { gloss: .16 });
  const hair = material([.08, .055, .04], { gloss: .14 });
  const dark = material(LEGACY_CHARACTER_PALETTE.dark, { gloss: .18 });
  const accent = material(palette.rgb.map((value) => clamp(value * .62, 0, 1)));
  const accessory = material([.84, .42, .13], { gloss: .3 });
  const blobBlue = material([.28, .72, .95], { emissive: [.01, .03, .05], gloss: .38 });
  const root = new pc.Entity(`Remote ${palette.name} player ${playerId}`);
  const rig = new pc.Entity('Remote character visual');
  const humanRig = new pc.Entity('Remote human avatar');
  const blobRig = new pc.Entity('Remote Blue Blob avatar');
  rig.setLocalPosition(0, -.06, 0);
  rig.setLocalScale(1, .89, 1);
  root.addChild(rig);
  rig.addChild(humanRig);
  rig.addChild(blobRig);

  primitive(humanRig, 'Remote upper torso', 'box', { x: 0, y: .1, z: 0 }, { x: .7, y: .62, z: .4 }, cloth);
  primitive(humanRig, 'Remote lower torso', 'box', { x: 0, y: -.27, z: 0 }, { x: .55, y: .18, z: .36 }, accent);
  const backpack = primitive(humanRig, 'Remote pack', 'box', { x: 0, y: .08, z: .27 }, { x: .5, y: .58, z: .2 }, pack);
  primitive(humanRig, 'Remote neck', 'cylinder', { x: 0, y: .52, z: 0 }, { x: .14, y: .2, z: .14 }, skin);
  primitive(humanRig, 'Remote head', 'sphere', { x: 0, y: .77, z: 0 }, { x: .45, y: .5, z: .43 }, skin);
  primitive(humanRig, 'Remote nose', 'cone', { x: 0, y: .74, z: -.42 }, { x: .07, y: .14, z: .07 }, skin, { x: 90 });
  primitive(humanRig, 'Remote left shoulder', 'sphere', { x: -.38, y: .35, z: 0 }, { x: .24, y: .24, z: .25 }, cloth);
  primitive(humanRig, 'Remote right shoulder', 'sphere', { x: .38, y: .35, z: 0 }, { x: .24, y: .24, z: .25 }, cloth);

  const makeGroup = (name) => {
    const group = new pc.Entity(name);
    humanRig.addChild(group);
    return group;
  };
  const hairStyles = new Map([
    ['short', makeGroup('Remote short hair')],
    ['tousled', makeGroup('Remote tousled hair')],
    ['ponytail', makeGroup('Remote ponytail hair')],
    ['mohawk', makeGroup('Remote mohawk hair')],
    ['long', makeGroup('Remote long hair')],
    ['bun', makeGroup('Remote trail bun hair')],
    ['braids', makeGroup('Remote twin braids hair')],
    ['bald', makeGroup('Remote bald hair')]
  ]);
  primitive(hairStyles.get('short'), 'Remote short hair cap', 'sphere', { x: 0, y: .95, z: .015 }, { x: .46, y: .19, z: .44 }, hair);
  primitive(hairStyles.get('tousled'), 'Remote tousled hair cap', 'sphere', { x: 0, y: .95, z: .015 }, { x: .46, y: .18, z: .44 }, hair);
  [-.2, 0, .2].forEach((x, index) => primitive(hairStyles.get('tousled'), `Remote hair lock ${index + 1}`,
    'cone', { x, y: 1.04 + (index % 2) * .035, z: -.01 }, { x: .12, y: .22, z: .12 }, hair, { z: (index - 1) * -12 }));
  const ponytailTop = primitive(hairStyles.get('ponytail'), 'Remote ponytail cap', 'sphere', { x: 0, y: .95, z: .02 }, { x: .46, y: .19, z: .44 }, hair);
  primitive(hairStyles.get('ponytail'), 'Remote ponytail', 'sphere', { x: 0, y: .66, z: .39 }, { x: .2, y: .36, z: .19 }, hair);
  [-.18, 0, .18].forEach((z, index) => primitive(hairStyles.get('mohawk'), `Remote mohawk ${index + 1}`,
    'cone', { x: 0, y: 1.05, z }, { x: .15, y: .34 + (index === 1 ? .06 : 0), z: .15 }, hair));
  const longHairTop = primitive(hairStyles.get('long'), 'Remote long hair cap', 'sphere', { x: 0, y: .95, z: .02 }, { x: .46, y: .19, z: .44 }, hair);
  primitive(hairStyles.get('long'), 'Remote long hair back', 'sphere', { x: 0, y: .64, z: .3 }, { x: .42, y: .56, z: .19 }, hair);
  primitive(hairStyles.get('bun'), 'Remote bun hair cap', 'sphere', { x: 0, y: .95, z: .02 }, { x: .46, y: .19, z: .44 }, hair);
  primitive(hairStyles.get('bun'), 'Remote trail bun', 'sphere', { x: 0, y: 1, z: .36 }, { x: .26, y: .26, z: .26 }, hair);
  const braidsTop = primitive(hairStyles.get('braids'), 'Remote braids hair cap', 'sphere', { x: 0, y: .95, z: .02 }, { x: .46, y: .19, z: .44 }, hair);
  for (const side of [-1, 1]) {
    primitive(hairStyles.get('braids'), `Remote braid ${side}`, 'cylinder',
      { x: side * .32, y: .62, z: .18 }, { x: .1, y: .48, z: .1 }, hair, { z: side * 5 });
  }
  const hairTopParts = new Map([
    ['ponytail', [ponytailTop]], ['long', [longHairTop]], ['braids', [braidsTop]]
  ]);

  const accessories = new Map([
    ['beanie', makeGroup('Remote beanie')],
    ['glasses', makeGroup('Remote glasses')],
    ['trail-hat', makeGroup('Remote trail hat')],
    ['fishing-cap', makeGroup('Remote fishing cap')],
    ['headlamp', makeGroup('Remote headlamp')],
    ['scarf', makeGroup('Remote scarf')],
    ['flower-crown', makeGroup('Remote flower crown')],
    ['goggles', makeGroup('Remote summit goggles')]
  ]);
  primitive(accessories.get('beanie'), 'Remote beanie crown', 'cone', { x: 0, y: 1.03, z: 0 }, { x: .49, y: .32, z: .49 }, accessory);
  primitive(accessories.get('beanie'), 'Remote beanie band', 'cylinder', { x: 0, y: .94, z: 0 }, { x: .5, y: .11, z: .5 }, accessory);
  primitive(accessories.get('glasses'), 'Remote left glasses', 'box', { x: -.13, y: .78, z: -.42 }, { x: .19, y: .13, z: .03 }, accessory);
  primitive(accessories.get('glasses'), 'Remote right glasses', 'box', { x: .13, y: .78, z: -.42 }, { x: .19, y: .13, z: .03 }, accessory);
  primitive(accessories.get('glasses'), 'Remote glasses bridge', 'box', { x: 0, y: .78, z: -.43 }, { x: .08, y: .025, z: .02 }, accessory);
  primitive(accessories.get('trail-hat'), 'Remote trail hat brim', 'box', { x: 0, y: .99, z: -.05 }, { x: .7, y: .05, z: .6 }, accessory);
  primitive(accessories.get('trail-hat'), 'Remote trail hat crown', 'cylinder', { x: 0, y: 1.1, z: 0 }, { x: .44, y: .22, z: .44 }, accessory);
  primitive(accessories.get('fishing-cap'), 'Remote fishing cap crown', 'sphere', { x: 0, y: 1.01, z: .02 }, { x: .47, y: .2, z: .44 }, accessory);
  primitive(accessories.get('fishing-cap'), 'Remote fishing cap bill', 'box', { x: 0, y: .96, z: -.37 }, { x: .47, y: .05, z: .34 }, accessory, { x: -5 });
  primitive(accessories.get('headlamp'), 'Remote headlamp band', 'cylinder', { x: 0, y: .94, z: 0 }, { x: .48, y: .08, z: .48 }, accessory);
  primitive(accessories.get('headlamp'), 'Remote headlamp light', 'sphere', { x: 0, y: .95, z: -.43 }, { x: .13, y: .12, z: .1 }, accessory);
  primitive(accessories.get('scarf'), 'Remote scarf collar', 'cylinder', { x: 0, y: .52, z: 0 }, { x: .31, y: .16, z: .31 }, accessory);
  primitive(accessories.get('scarf'), 'Remote scarf tail', 'box', { x: .17, y: .25, z: .25 }, { x: .18, y: .52, z: .1 }, accessory, { x: -12, z: -8 });
  primitive(accessories.get('flower-crown'), 'Remote flower crown band', 'cylinder', { x: 0, y: .97, z: 0 }, { x: .48, y: .055, z: .48 }, accessory);
  [-.28, -.14, 0, .14, .28].forEach((x, index) => primitive(accessories.get('flower-crown'), `Remote flower ${index + 1}`,
    'sphere', { x, y: 1.04 + (index % 2) * .03, z: -.33 + Math.abs(x) * .2 }, { x: .095, y: .095, z: .075 }, accessory));
  primitive(accessories.get('goggles'), 'Remote goggles left lens', 'sphere', { x: -.14, y: .8, z: -.42 }, { x: .17, y: .13, z: .04 }, dark);
  primitive(accessories.get('goggles'), 'Remote goggles right lens', 'sphere', { x: .14, y: .8, z: -.42 }, { x: .17, y: .13, z: .04 }, dark);
  primitive(accessories.get('goggles'), 'Remote goggles strap', 'cylinder', { x: 0, y: .81, z: 0 }, { x: .46, y: .05, z: .46 }, accessory);

  const limbs = {
    leftArm: limb(humanRig, 'Remote left arm', { x: -.43, y: .4, z: 0 }, { x: .18, y: .72, z: .18 }, cloth),
    rightArm: limb(humanRig, 'Remote right arm', { x: .43, y: .4, z: 0 }, { x: .18, y: .72, z: .18 }, cloth),
    leftLeg: limb(humanRig, 'Remote left leg', { x: -.2, y: -.35, z: 0 }, { x: .23, y: .62, z: .25 }, trousers),
    rightLeg: limb(humanRig, 'Remote right leg', { x: .2, y: -.35, z: 0 }, { x: .23, y: .62, z: .25 }, trousers)
  };
  primitive(limbs.leftArm, 'Remote left hand', 'sphere', { x: 0, y: -.72, z: 0 }, { x: .2, y: .2, z: .2 }, skin);
  primitive(limbs.rightArm, 'Remote right hand', 'sphere', { x: 0, y: -.72, z: 0 }, { x: .2, y: .2, z: .2 }, skin);
  primitive(limbs.leftLeg, 'Remote left boot', 'box', { x: 0, y: -.55, z: -.1 }, { x: .28, y: .17, z: .43 }, boots);
  primitive(limbs.rightLeg, 'Remote right boot', 'box', { x: 0, y: -.55, z: -.1 }, { x: .28, y: .17, z: .43 }, boots);

  // Match the original multiplayer proxy: capsule, round head, and facing marker.
  primitive(blobRig, 'Remote classic Blue Blob body', 'capsule', { x: 0, y: -.05, z: 0 }, { x: .72, y: 1.12, z: .72 }, blobBlue);
  primitive(blobRig, 'Remote classic Blue Blob head', 'sphere', { x: 0, y: .82, z: 0 }, { x: .48, y: .48, z: .48 }, blobBlue);
  primitive(blobRig, 'Remote classic Blue Blob facing marker', 'box', { x: 0, y: .35, z: -.43 }, { x: .16, y: .16, z: .48 }, blobBlue);

  const fishingRod = primitive(rig, 'Remote fishing rod', 'cylinder',
    { x: .62, y: .42, z: -.3 }, { x: .035, y: 1.25, z: .035 }, dark, { x: 28, z: -18 });
  fishingRod.enabled = false;
  const catchRoot = new pc.Entity('Remote held catch');
  catchRoot.setLocalPosition(0, .22, -1.05);
  rig.addChild(catchRoot);
  catchRoot.enabled = false;

  root.remoteColor = palette;
  root.catchPresentationId = null;
  root.catchPresentationExpiresAt = 0;
  root.currentEmote = null;
  root.posture = 'standing';
  root.appearance = normalizeAppearance(initialAppearance);
  root.setAppearance = (value) => {
    root.appearance = normalizeAppearance(value);
    const resolved = resolveAppearance(root.appearance);
    setMaterialColor(cloth, resolved.shirtColorValue.color, .035);
    setMaterialColor(accent, resolved.shirtAccentColor ?? shirtAccent(resolved.shirtColorValue.color));
    setMaterialColor(skin, resolved.skinToneValue.color);
    setMaterialColor(trousers, resolved.pantsColorValue.color);
    setMaterialColor(hair, resolved.hairColorValue.color);
    setMaterialColor(accessory, resolved.accessoryColor);
    setMaterialColor(blobBlue, resolved.blobColor, .03);
    humanRig.enabled = root.appearance.avatarType === 'human';
    blobRig.enabled = root.appearance.avatarType === 'blob';
    const hairVisibility = hairVisibilityForHeadwear(root.appearance.hairStyle, root.appearance.headwear);
    for (const [id, group] of hairStyles) group.enabled = hairVisibility.root && id === root.appearance.hairStyle;
    for (const part of hairTopParts.get(root.appearance.hairStyle) ?? []) part.enabled = hairVisibility.top;
    const wornAccessories = new Set([
      root.appearance.headwear, root.appearance.eyewear, root.appearance.faceAccessory
    ]);
    for (const [id, group] of accessories) group.enabled = wornAccessories.has(id);
    backpack.enabled = root.appearance.backAccessory === 'backpack';
  };
  root.setAppearance(root.appearance);
  root.setPosture = (value) => { root.posture = value === 'seated' ? 'seated' : 'standing'; };
  root.setFishingState = (value) => {
    fishingRod.enabled = typeof value === 'object' ? Boolean(value?.active) : value === 'active';
  };
  root.setEmote = (value) => { root.currentEmote = normalizeEmote(value); };
  root.setMovementState = (state, now, speed = 0) => {
    const phase = now * .008;
    const moving = speed > .25 && state === 'grounded';
    let leftArm = moving ? Math.sin(phase) * 34 : -5;
    let rightArm = moving ? -Math.sin(phase) * 34 : 5;
    let leftLeg = moving ? -Math.sin(phase) * 30 : 0;
    let rightLeg = moving ? Math.sin(phase) * 30 : 0;
    if (root.currentEmote
      && now - root.currentEmote.startedAt >= emoteDurationMs(root.currentEmote.id)) root.currentEmote = null;
    const seated = root.posture === 'seated';
    const emote = state === 'grounded' && speed <= .25 && !fishingRod.enabled && !catchRoot.enabled
      ? root.currentEmote : null;
    rig.setLocalPosition(0, seated || emote?.id === 'sit' ? -.48 : -.06, 0);
    if (state === 'airborne') { leftArm = -38; rightArm = -38; leftLeg = 20; rightLeg = -12; }
    if (state === 'sliding') { leftArm = 34; rightArm = -22; leftLeg = -38; rightLeg = -48; }
    if (state === 'climbing' || state === 'mantling') {
      leftArm = 142 + Math.sin(phase) * 18;
      rightArm = 142 - Math.sin(phase) * 18;
      leftLeg = -18 - Math.sin(phase) * 14;
      rightLeg = -18 + Math.sin(phase) * 14;
    }
    if (emote?.id === 'wave') {
      leftArm = -5;
      rightArm = 145 + Math.sin(phase * 4) * 18;
    } else if (emote?.id === 'point') {
      leftArm = -5;
      rightArm = 88;
    } else if (emote?.id === 'cheer') {
      leftArm = 148 + Math.sin(phase * 3) * 9;
      rightArm = 148 - Math.sin(phase * 3) * 9;
    } else if (emote?.id === 'sit') {
      leftArm = -10;
      rightArm = -10;
      leftLeg = 76;
      rightLeg = 76;
    } else if (emote?.id === 'dance') {
      const swing = Math.sin(phase * 3.5);
      leftArm = 72 + swing * 46;
      rightArm = 72 - swing * 46;
      leftLeg = -swing * 25;
      rightLeg = swing * 25;
    }
    if (seated) { leftLeg = 76; rightLeg = 76; }
    if (fishingRod.enabled || catchRoot.enabled) {
      leftArm = 72;
      rightArm = 58;
      if (!seated) { leftLeg = 0; rightLeg = 0; }
    }
    limbs.leftArm.setLocalEulerAngles(leftArm, 0, 8);
    limbs.rightArm.setLocalEulerAngles(rightArm, 0, -8);
    limbs.leftLeg.setLocalEulerAngles(leftLeg, 0, 0);
    limbs.rightLeg.setLocalEulerAngles(rightLeg, 0, 0);
    const bounce = moving ? Math.abs(Math.sin(phase)) * .055 : Math.sin(phase * .2) * .012;
    blobRig.setLocalScale(1 + bounce * .4, 1 - bounce * .25, 1 + bounce * .25);
    if (catchRoot.enabled && now >= root.catchPresentationExpiresAt) root.clearCatch();
  };
  root.showCatch = (catchData) => {
    root.catchPresentationId = catchData.presentationId ?? null;
    root.catchPresentationExpiresAt = Date.now() + 22_000;
    createCatchModel(catchRoot, catchData);
    catchRoot.enabled = true;
  };
  root.clearCatch = (presentationId = null) => {
    if (presentationId && root.catchPresentationId && presentationId !== root.catchPresentationId) return;
    catchRoot.enabled = false;
    root.catchPresentationId = null;
  };

  root.setPosition(0, -1000, 0);
  app.root.addChild(root);
  return root;
}
