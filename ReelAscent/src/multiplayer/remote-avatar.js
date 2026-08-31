import * as pc from 'playcanvas';
import { createSpecimenModel, destroySpecimenModel } from '../fishing/specimen-model.js';
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

function replaceSpecimenModel(parent, currentModel, specimen, { name, mode = 'held' } = {}) {
  destroySpecimenModel(currentModel);
  if (!specimen?.speciesId) return null;
  const model = createSpecimenModel(specimen, { name });
  if (!model?.root) return null;
  parent.addChild(model.root);
  if (mode === 'catch') {
    model.root.setLocalPosition(0, 0, 0);
    model.root.setLocalEulerAngles(-6, -8, -4);
  } else {
    const x = .45 + Math.min(4, (model.physicalLengthMeters ?? .5) * .42);
    model.root.setLocalPosition(x, -.29, -.42);
    model.root.setLocalEulerAngles(-8, -18, -5);
  }
  return model;
}

export function createRemoteAvatar(app, playerId, colorIndex = 0, initialAppearance = null, initialDisplayName = 'Player') {
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
  primitive(humanRig, 'Remote nose', 'cone', { x: 0, y: .64, z: -.27 }, { x: .065, y: .11, z: .065 }, skin, { x: 90 });
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
  primitive(hairStyles.get('ponytail'), 'Remote ponytail tie', 'sphere', { x: 0, y: .84, z: .32 }, { x: .15, y: .15, z: .15 }, accent);
  primitive(hairStyles.get('ponytail'), 'Remote ponytail', 'sphere', { x: 0, y: .7, z: .35 }, { x: .22, y: .38, z: .2 }, hair);
  [-.18, 0, .18].forEach((z, index) => primitive(hairStyles.get('mohawk'), `Remote mohawk ${index + 1}`,
    'cone', { x: 0, y: 1.05, z }, { x: .15, y: .34 + (index === 1 ? .06 : 0), z: .15 }, hair));
  const longHairTop = primitive(hairStyles.get('long'), 'Remote long hair cap', 'sphere', { x: 0, y: .95, z: .02 }, { x: .46, y: .19, z: .44 }, hair);
  primitive(hairStyles.get('long'), 'Remote long hair back', 'sphere', { x: 0, y: .68, z: .24 }, { x: .43, y: .58, z: .21 }, hair);
  for (const side of [-1, 1]) primitive(hairStyles.get('long'), `Remote long hair side ${side}`, 'sphere',
    { x: side * .33, y: .7, z: .03 }, { x: .14, y: .46, z: .15 }, hair, { z: side * 5 });
  primitive(hairStyles.get('bun'), 'Remote bun hair cap', 'sphere', { x: 0, y: .95, z: .02 }, { x: .46, y: .19, z: .44 }, hair);
  primitive(hairStyles.get('bun'), 'Remote trail bun', 'sphere', { x: 0, y: 1, z: .36 }, { x: .26, y: .26, z: .26 }, hair);
  const braidsTop = primitive(hairStyles.get('braids'), 'Remote braids hair cap', 'sphere', { x: 0, y: .95, z: .02 }, { x: .46, y: .19, z: .44 }, hair);
  for (const side of [-1, 1]) {
    primitive(hairStyles.get('braids'), `Remote braid ${side}`, 'cylinder',
      { x: side * .29, y: .68, z: .14 }, { x: .11, y: .52, z: .11 }, hair, { z: side * 5 });
    primitive(hairStyles.get('braids'), `Remote braid end ${side}`, 'sphere',
      { x: side * .34, y: .39, z: .16 }, { x: .12, y: .16, z: .12 }, hair);
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
    ['bandana', makeGroup('Remote bandana')],
    ['neck-gaiter', makeGroup('Remote neck gaiter')],
    ['necklace', makeGroup('Remote necklace')],
    ['flower-crown', makeGroup('Remote flower crown')],
    ['goggles', makeGroup('Remote summit goggles')]
  ]);
  primitive(accessories.get('beanie'), 'Remote beanie crown', 'cone', { x: 0, y: 1.03, z: 0 }, { x: .49, y: .32, z: .49 }, accessory);
  primitive(accessories.get('beanie'), 'Remote beanie band', 'cylinder', { x: 0, y: .94, z: 0 }, { x: .5, y: .11, z: .5 }, accessory);
  primitive(accessories.get('glasses'), 'Remote left glasses', 'box', { x: -.13, y: .78, z: -.235 }, { x: .19, y: .13, z: .03 }, accessory);
  primitive(accessories.get('glasses'), 'Remote right glasses', 'box', { x: .13, y: .78, z: -.235 }, { x: .19, y: .13, z: .03 }, accessory);
  primitive(accessories.get('glasses'), 'Remote glasses bridge', 'box', { x: 0, y: .78, z: -.245 }, { x: .08, y: .025, z: .02 }, accessory);
  primitive(accessories.get('trail-hat'), 'Remote trail hat brim', 'box', { x: 0, y: .99, z: -.05 }, { x: .7, y: .05, z: .6 }, accessory);
  primitive(accessories.get('trail-hat'), 'Remote trail hat crown', 'cylinder', { x: 0, y: 1.1, z: 0 }, { x: .44, y: .22, z: .44 }, accessory);
  primitive(accessories.get('fishing-cap'), 'Remote fishing cap crown', 'sphere', { x: 0, y: 1.01, z: .02 }, { x: .47, y: .2, z: .44 }, accessory);
  primitive(accessories.get('fishing-cap'), 'Remote fishing cap bill', 'box', { x: 0, y: .96, z: -.37 }, { x: .47, y: .05, z: .34 }, accessory, { x: -5 });
  primitive(accessories.get('headlamp'), 'Remote headlamp band', 'cylinder', { x: 0, y: .94, z: 0 }, { x: .48, y: .08, z: .48 }, accessory);
  primitive(accessories.get('headlamp'), 'Remote headlamp light', 'sphere', { x: 0, y: .95, z: -.25 }, { x: .13, y: .12, z: .1 }, accessory);
  primitive(accessories.get('scarf'), 'Remote scarf collar', 'cylinder', { x: 0, y: .52, z: 0 }, { x: .31, y: .16, z: .31 }, accessory);
  primitive(accessories.get('scarf'), 'Remote scarf tail', 'box', { x: .17, y: .25, z: .25 }, { x: .18, y: .52, z: .1 }, accessory, { x: -12, z: -8 });
  primitive(accessories.get('bandana'), 'Remote bandana face cloth', 'box', { x: 0, y: .64, z: -.225 }, { x: .3, y: .18, z: .03 }, accessory, { x: 7 });
  primitive(accessories.get('bandana'), 'Remote bandana knot', 'sphere', { x: 0, y: .62, z: .21 }, { x: .1, y: .09, z: .08 }, accessory);
  primitive(accessories.get('neck-gaiter'), 'Remote neck gaiter', 'cylinder', { x: 0, y: .55, z: 0 }, { x: .29, y: .22, z: .29 }, accessory);
  primitive(accessories.get('necklace'), 'Remote necklace cord', 'cylinder', { x: 0, y: .54, z: -.11 }, { x: .19, y: .035, z: .19 }, accessory);
  primitive(accessories.get('necklace'), 'Remote necklace pendant', 'sphere', { x: 0, y: .46, z: -.195 }, { x: .07, y: .095, z: .03 }, accessory);
  primitive(accessories.get('flower-crown'), 'Remote flower crown band', 'cylinder', { x: 0, y: .97, z: 0 }, { x: .48, y: .055, z: .48 }, accessory);
  [-.28, -.14, 0, .14, .28].forEach((x, index) => primitive(accessories.get('flower-crown'), `Remote flower ${index + 1}`,
    'sphere', { x, y: 1.01 + (index % 2) * .028, z: -.21 + Math.abs(x) * .13 }, { x: .095, y: .095, z: .075 }, accessory));
  primitive(accessories.get('goggles'), 'Remote goggles left lens', 'sphere', { x: -.14, y: .8, z: -.24 }, { x: .17, y: .13, z: .04 }, dark);
  primitive(accessories.get('goggles'), 'Remote goggles right lens', 'sphere', { x: .14, y: .8, z: -.24 }, { x: .17, y: .13, z: .04 }, dark);
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

  // Keep the rod in hand-local space so interpolation/yaw/avatar pose move it naturally.
  const fishingRod = primitive(limbs.rightArm, 'Remote fishing rod', 'cylinder',
    { x: .02, y: -.77, z: -.18 }, { x: .035, y: 1.25, z: .035 }, dark, { x: 23, z: -8 });
  fishingRod.enabled = false;
  const heldRoot = new pc.Entity('Remote held inventory specimen');
  rig.addChild(heldRoot);
  heldRoot.enabled = false;
  const catchRoot = new pc.Entity('Remote catch presentation');
  catchRoot.setLocalPosition(0, .22, -1.05);
  rig.addChild(catchRoot);
  catchRoot.enabled = false;

  root.remoteColor = palette;
  root.catchPresentationId = null;
  root.catchPresentationExpiresAt = 0;
  root.currentEmote = null;
  root.heldItem = null;
  root.heldSpecimenModel = null;
  root.catchSpecimenModel = null;
  root.fishingActive = false;
  root.posture = 'standing';
  root.appearance = normalizeAppearance(initialAppearance);
  const nameplate = document.createElement('div');
  nameplate.className = 'remote-player-nameplate';
  nameplate.textContent = String(initialDisplayName || 'Player').slice(0, 18);
  nameplate.hidden = true;
  (document.querySelector('#game-shell') ?? document.body)?.appendChild(nameplate);
  const screenPoint = new pc.Vec3();
  const worldPoint = new pc.Vec3();
  const updateNameplate = () => {
    const camera = app.root.findComponents?.('camera')?.[0];
    const canvas = app.graphicsDevice?.canvas;
    if (!camera?.worldToScreen || !canvas || !root.enabled) { nameplate.hidden = true; return; }
    const position = root.getPosition();
    worldPoint.set(position.x, position.y + 2.15, position.z);
    camera.worldToScreen(worldPoint, screenPoint);
    const width = canvas.clientWidth || canvas.width || 1;
    const height = canvas.clientHeight || canvas.height || 1;
    const sx = width / Math.max(1, canvas.width || width);
    const sy = height / Math.max(1, canvas.height || height);
    const visible = screenPoint.z > 0 && screenPoint.x >= 0 && screenPoint.y >= 0
      && screenPoint.x <= (canvas.width || width) && screenPoint.y <= (canvas.height || height);
    nameplate.hidden = !visible;
    if (!visible) return;
    nameplate.style.transform = `translate(-50%, -100%) translate(${screenPoint.x * sx}px, ${screenPoint.y * sy}px)`;
  };
  root.setDisplayName = (value) => {
    nameplate.textContent = String(value || 'Player').trim().slice(0, 18) || 'Player';
  };
  root.setRemoteVisible = (visible) => {
    root.enabled = Boolean(visible);
    nameplate.hidden = !root.enabled;
    if (root.enabled) updateNameplate();
  };
  const setWorldPosition = root.setPosition.bind(root);
  root.setPosition = (...args) => {
    setWorldPosition(...args);
    updateNameplate();
  };
  root.setAppearance = (value) => {
    root.appearance = normalizeAppearance(value);
    const resolved = resolveAppearance(root.appearance);
    setMaterialColor(cloth, resolved.shirtColorValue.color, .035);
    setMaterialColor(accent, resolved.shirtAccentColor ?? shirtAccent(resolved.shirtColorValue.color));
    setMaterialColor(skin, resolved.skinToneValue.color);
    setMaterialColor(trousers, resolved.pantsColorValue.color);
    setMaterialColor(hair, resolved.hairColorValue.color);
    setMaterialColor(accessory, resolved.accessoryColor);
    setMaterialColor(pack, resolved.backpackColorValue.color);
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
  const syncHeldVisibility = () => {
    heldRoot.enabled = Boolean(root.heldSpecimenModel) && !root.fishingActive && !catchRoot.enabled;
    fishingRod.enabled = root.fishingActive && !catchRoot.enabled;
  };
  root.setFishingState = (value) => {
    root.fishingActive = typeof value === 'object' ? Boolean(value?.active) : value === 'active';
    syncHeldVisibility();
  };
  root.setEmote = (value) => {
    if (!value) { root.currentEmote = null; return; }
    const nextId = value?.id ?? value;
    const elapsedMs = Math.max(0, Number(value?.elapsedMs) || 0);
    if (root.currentEmote?.id === nextId) {
      const localElapsedMs = Math.max(0, Date.now() - root.currentEmote.startedAt);
      if (Math.abs(localElapsedMs - elapsedMs) > 180) root.currentEmote.startedAt = Date.now() - elapsedMs;
      return;
    }
    root.currentEmote = normalizeEmote({ id: nextId, startedAt: Date.now() - elapsedMs });
  };
  root.setHeldItem = (value) => {
    const next = value?.type === 'specimen' && value.speciesId ? { ...value } : null;
    const same = root.heldItem?.specimenId && next?.specimenId
      ? root.heldItem.specimenId === next.specimenId
      : root.heldItem?.speciesId === next?.speciesId && root.heldItem?.length === next?.length && root.heldItem?.shiny === next?.shiny;
    root.heldItem = next;
    if (!same) root.heldSpecimenModel = replaceSpecimenModel(heldRoot, root.heldSpecimenModel, next, {
      name: `Remote held specimen ${next?.specimenId || next?.speciesId || ''}`, mode: 'held'
    });
    syncHeldVisibility();
  };
  root.setMovementState = (state, now, speed = 0) => {
    const phase = now * .008;
    const emotePhase = root.currentEmote ? Math.max(0, now - root.currentEmote.startedAt) / 1000 : 0;
    const moving = speed > .25 && state === 'grounded';
    let leftArm = moving ? Math.sin(phase) * 34 : -5;
    let rightArm = moving ? -Math.sin(phase) * 34 : 5;
    let leftLeg = moving ? -Math.sin(phase) * 30 : 0;
    let rightLeg = moving ? Math.sin(phase) * 30 : 0;
    let leftArmRoll = 8;
    let rightArmRoll = -8;
    if (root.currentEmote
      && !(root.currentEmote.id === 'sit' && state === 'fishing')
      && now - root.currentEmote.startedAt >= emoteDurationMs(root.currentEmote.id)) root.currentEmote = null;
    const seated = root.posture === 'seated';
    const sitWhileFishing = root.currentEmote?.id === 'sit' && state === 'fishing';
    const emote = ((state === 'grounded' && speed <= .25 && !catchRoot.enabled) || sitWhileFishing)
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
      rightArm = 145 + Math.sin(emotePhase * 8) * 18;
    } else if (emote?.id === 'point') {
      leftArm = -5;
      rightArm = 88;
    } else if (emote?.id === 'cheer') {
      leftArm = 148 + Math.sin(emotePhase * 7) * 9;
      rightArm = 148 - Math.sin(emotePhase * 7) * 9;
    } else if (emote?.id === 'clap') {
      const contact = (1 - Math.cos(emotePhase * Math.PI * 2 * 1.7)) * .5;
      leftArm = 70 + contact * 16;
      rightArm = 70 + contact * 16;
      leftArmRoll = -18 - contact * 44;
      rightArmRoll = 18 + contact * 44;
    } else if (emote?.id === 'sit') {
      leftArm = -10;
      rightArm = -10;
      leftLeg = 76;
      rightLeg = 76;
    } else if (emote?.id === 'dance') {
      const swing = Math.sin(emotePhase * 6.5);
      leftArm = 72 + swing * 46;
      rightArm = 72 - swing * 46;
      leftLeg = -swing * 25;
      rightLeg = swing * 25;
    }
    if (seated) { leftLeg = 76; rightLeg = 76; }
    if (root.fishingActive || catchRoot.enabled) {
      leftArm = 72;
      rightArm = 58;
      if (!(seated || emote?.id === 'sit')) { leftLeg = 0; rightLeg = 0; }
    }
    limbs.leftArm.setLocalEulerAngles(leftArm, 0, leftArmRoll);
    limbs.rightArm.setLocalEulerAngles(rightArm, 0, rightArmRoll);
    limbs.leftLeg.setLocalEulerAngles(leftLeg, 0, 0);
    limbs.rightLeg.setLocalEulerAngles(rightLeg, 0, 0);
    const bounce = moving ? Math.abs(Math.sin(phase)) * .055 : Math.sin(phase * .2) * .012;
    blobRig.setLocalScale(1 + bounce * .4, 1 - bounce * .25, 1 + bounce * .25);
    if (catchRoot.enabled && now >= root.catchPresentationExpiresAt) root.clearCatch();
  };
  root.showCatch = (catchData) => {
    root.catchPresentationId = catchData.presentationId ?? null;
    root.catchPresentationExpiresAt = Date.now() + 22_000;
    root.catchSpecimenModel = replaceSpecimenModel(catchRoot, root.catchSpecimenModel, catchData, {
      name: `Remote catch ${catchData.speciesId ?? ''}`, mode: 'catch'
    });
    catchRoot.enabled = Boolean(root.catchSpecimenModel);
    syncHeldVisibility();
  };
  root.clearCatch = (presentationId = null) => {
    if (presentationId && root.catchPresentationId && presentationId !== root.catchPresentationId) return;
    catchRoot.enabled = false;
    root.catchPresentationId = null;
    destroySpecimenModel(root.catchSpecimenModel);
    root.catchSpecimenModel = null;
    syncHeldVisibility();
  };

  const destroyEntity = root.destroy.bind(root);
  root.destroy = () => {
    nameplate.remove();
    destroySpecimenModel(root.heldSpecimenModel);
    destroySpecimenModel(root.catchSpecimenModel);
    destroyEntity();
  };

  root.setPosition(0, -1000, 0);
  app.root.addChild(root);
  return root;
}
