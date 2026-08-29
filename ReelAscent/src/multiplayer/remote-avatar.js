import * as pc from 'playcanvas';
import { resolveSpecies } from '../fishing/fish-data.js';
import { REMOTE_PLAYER_COLORS } from './player-colors.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function material(color, { emissive = [0, 0, 0], gloss = .24 } = {}) {
  const result = new pc.StandardMaterial();
  result.diffuse = new pc.Color(...color);
  result.emissive = new pc.Color(...emissive);
  result.gloss = gloss;
  result.update();
  return result;
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

export function createRemoteAvatar(app, playerId, colorIndex = 0) {
  const palette = REMOTE_PLAYER_COLORS[colorIndex % REMOTE_PLAYER_COLORS.length];
  const cloth = material(palette.rgb, { emissive: palette.rgb.map((value) => value * .035) });
  const skin = material([.78, .58, .42], { gloss: .2 });
  const dark = material([.08, .11, .12], { gloss: .16 });
  const accent = material(palette.rgb.map((value) => clamp(value * .62, 0, 1)));
  const root = new pc.Entity(`Remote ${palette.name} player ${playerId}`);
  const rig = new pc.Entity('Remote character visual');
  rig.setLocalPosition(0, -.06, 0);
  rig.setLocalScale(1, .89, 1);
  root.addChild(rig);

  primitive(rig, 'Remote torso', 'box', { x: 0, y: .08, z: 0 }, { x: .68, y: .82, z: .38 }, cloth);
  primitive(rig, 'Remote belt', 'box', { x: 0, y: -.34, z: 0 }, { x: .72, y: .12, z: .4 }, accent);
  primitive(rig, 'Remote pack', 'box', { x: 0, y: .1, z: .25 }, { x: .5, y: .6, z: .2 }, accent);
  primitive(rig, 'Remote neck', 'cylinder', { x: 0, y: .57, z: 0 }, { x: .13, y: .18, z: .13 }, skin);
  primitive(rig, 'Remote head', 'sphere', { x: 0, y: .83, z: 0 }, { x: .43, y: .48, z: .42 }, skin);
  primitive(rig, 'Remote hair', 'sphere', { x: 0, y: 1.01, z: .015 }, { x: .44, y: .2, z: .43 }, dark);
  primitive(rig, 'Remote nose', 'cone', { x: 0, y: .82, z: -.41 }, { x: .075, y: .16, z: .075 }, skin, { x: 90 });

  const limbs = {
    leftArm: limb(rig, 'Remote left arm', { x: -.43, y: .4, z: 0 }, { x: .18, y: .72, z: .18 }, cloth),
    rightArm: limb(rig, 'Remote right arm', { x: .43, y: .4, z: 0 }, { x: .18, y: .72, z: .18 }, cloth),
    leftLeg: limb(rig, 'Remote left leg', { x: -.2, y: -.35, z: 0 }, { x: .23, y: .62, z: .25 }, dark),
    rightLeg: limb(rig, 'Remote right leg', { x: .2, y: -.35, z: 0 }, { x: .23, y: .62, z: .25 }, dark)
  };
  primitive(limbs.leftArm, 'Remote left hand', 'sphere', { x: 0, y: -.72, z: 0 }, { x: .2, y: .2, z: .2 }, skin);
  primitive(limbs.rightArm, 'Remote right hand', 'sphere', { x: 0, y: -.72, z: 0 }, { x: .2, y: .2, z: .2 }, skin);
  primitive(limbs.leftLeg, 'Remote left boot', 'box', { x: 0, y: -.55, z: -.1 }, { x: .27, y: .17, z: .42 }, dark);
  primitive(limbs.rightLeg, 'Remote right boot', 'box', { x: 0, y: -.55, z: -.1 }, { x: .27, y: .17, z: .42 }, dark);

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
  root.setFishingState = (value) => {
    fishingRod.enabled = typeof value === 'object' ? Boolean(value?.active) : value === 'active';
  };
  root.setMovementState = (state, now, speed = 0) => {
    const phase = now * .008;
    const moving = speed > .25 && state === 'grounded';
    let leftArm = moving ? Math.sin(phase) * 34 : -5;
    let rightArm = moving ? -Math.sin(phase) * 34 : 5;
    let leftLeg = moving ? -Math.sin(phase) * 30 : 0;
    let rightLeg = moving ? Math.sin(phase) * 30 : 0;
    if (state === 'airborne') { leftArm = -38; rightArm = -38; leftLeg = 20; rightLeg = -12; }
    if (state === 'sliding') { leftArm = 34; rightArm = -22; leftLeg = -38; rightLeg = -48; }
    if (state === 'climbing' || state === 'mantling') {
      leftArm = 142 + Math.sin(phase) * 18;
      rightArm = 142 - Math.sin(phase) * 18;
      leftLeg = -18 - Math.sin(phase) * 14;
      rightLeg = -18 + Math.sin(phase) * 14;
    }
    if (fishingRod.enabled || catchRoot.enabled) { leftArm = 72; rightArm = 58; leftLeg = 0; rightLeg = 0; }
    limbs.leftArm.setLocalEulerAngles(leftArm, 0, 8);
    limbs.rightArm.setLocalEulerAngles(rightArm, 0, -8);
    limbs.leftLeg.setLocalEulerAngles(leftLeg, 0, 0);
    limbs.rightLeg.setLocalEulerAngles(rightLeg, 0, 0);
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
