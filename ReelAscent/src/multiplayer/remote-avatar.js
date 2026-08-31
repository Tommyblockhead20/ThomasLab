import * as pc from 'playcanvas';
import { createCharacterModel } from '../player/character-model.js';
import { createFishingRodModel, destroyFishingRodModel } from '../fishing/rod-model.js';
import { createSpecimenModel, destroySpecimenModel, positionSpecimenModel } from '../fishing/specimen-model.js';
import { normalizeAppearance } from '../player/appearance.js';
import { createHeldEquipmentModel, destroyHeldEquipmentModel } from '../player/held-item-model.js';
import { emoteDurationMs, normalizeEmote } from './emotes.js';
import { REMOTE_PLAYER_COLORS } from './player-colors.js';

function replaceSpecimen(parent, current, specimen, mode, name) {
  destroySpecimenModel(current);
  if (!specimen?.speciesId) return null;
  const model = createSpecimenModel(specimen, { name });
  parent.addChild(model.root);
  positionSpecimenModel(model, mode);
  return model;
}

function highestVisiblePoint(root, fallbackY) {
  root.syncHierarchy();
  let highest = fallbackY;
  for (const render of root.findComponents('render')) {
    let visible = render.enabled;
    for (let entity = render.entity; visible && entity && entity !== root.parent; entity = entity.parent) visible = entity.enabled;
    if (!visible) continue;
    for (const mesh of render.meshInstances ?? []) {
      if (mesh.visible !== false) highest = Math.max(highest, mesh.aabb.center.y + mesh.aabb.halfExtents.y);
    }
  }
  return highest;
}

export function createRemoteAvatar(app, playerId, colorIndex = 0, initialAppearance = null, initialDisplayName = 'Player') {
  const palette = REMOTE_PLAYER_COLORS[colorIndex % REMOTE_PLAYER_COLORS.length];
  const root = new pc.Entity(`Remote ${palette.name} player ${playerId}`);
  const rig = new pc.Entity('Remote complete character visual');
  rig.setLocalPosition(0, -.06, 0);
  rig.setLocalScale(1, .89, 1);
  root.addChild(rig);
  const character = createCharacterModel(rig, { name: 'Remote player' });
  const limbs = {
    leftArm: character.leftLimb.shoulder,
    rightArm: character.rightLimb.shoulder,
    leftLeg: character.leftLimb.hip,
    rightLeg: character.rightLimb.hip
  };

  const rodModel = createFishingRodModel(character.rightHandAnchor, { name: 'Remote fishing rod' });
  const fishingRod = rodModel.root;
  fishingRod.setLocalPosition(.02, -.02, -.08);
  fishingRod.setLocalEulerAngles(-32, 0, 8);
  fishingRod.enabled = false;
  const heldRoot = new pc.Entity('Remote durable Hand slot');
  character.rightHandAnchor.addChild(heldRoot);
  heldRoot.enabled = false;
  const catchRoot = new pc.Entity('Remote catch presentation');
  catchRoot.setLocalPosition(0, .24, -1.05);
  rig.addChild(catchRoot);
  catchRoot.enabled = false;

  const nameplate = document.createElement('div');
  nameplate.className = 'remote-player-nameplate';
  nameplate.textContent = String(initialDisplayName || 'Player').trim().slice(0, 18) || 'Player';
  nameplate.hidden = true;
  (document.querySelector('#game-shell') ?? document.body)?.appendChild(nameplate);
  const screenPoint = new pc.Vec3();
  const worldPoint = new pc.Vec3();
  const updateNameplate = () => {
    const camera = app.root.findComponents?.('camera')?.[0];
    const canvas = app.graphicsDevice?.canvas;
    if (!camera?.worldToScreen || !canvas || !root.enabled) {
      nameplate.hidden = true;
      return;
    }
    const position = root.getPosition();
    worldPoint.set(position.x, highestVisiblePoint(root, position.y + 1.8) + .16, position.z);
    camera.worldToScreen(worldPoint, screenPoint);
    const width = canvas.clientWidth || canvas.width || 1;
    const height = canvas.clientHeight || canvas.height || 1;
    const sourceWidth = canvas.width || width;
    const sourceHeight = canvas.height || height;
    const visible = screenPoint.z > 0 && screenPoint.x >= 0 && screenPoint.y >= 0
      && screenPoint.x <= sourceWidth && screenPoint.y <= sourceHeight;
    nameplate.hidden = !visible;
    if (visible) nameplate.style.transform = `translate(-50%, -100%) translate(${screenPoint.x * width / sourceWidth}px, ${screenPoint.y * height / sourceHeight}px)`;
  };

  root.remoteColor = palette;
  root.appearance = normalizeAppearance(initialAppearance);
  root.currentEmote = null;
  root.heldItem = null;
  root.heldSpecimenModel = null;
  root.heldEquipmentModel = null;
  root.catchSpecimenModel = null;
  root.catchPresentationId = null;
  root.catchPresentationExpiresAt = 0;
  root.fishingActive = false;
  root.posture = 'standing';

  root.setDisplayName = (value) => {
    nameplate.textContent = String(value || 'Player').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Player';
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
    root.appearance = character.setAppearance(value);
    updateNameplate();
  };
  root.setAppearance(root.appearance);
  root.setPosture = (value) => { root.posture = value === 'seated' ? 'seated' : 'standing'; };

  const syncHeldVisibility = () => {
    heldRoot.enabled = Boolean(root.heldSpecimenModel || root.heldEquipmentModel)
      && !root.fishingActive && !catchRoot.enabled;
    fishingRod.enabled = root.fishingActive && !catchRoot.enabled;
  };
  root.setFishingState = (value) => {
    root.fishingActive = typeof value === 'object' ? Boolean(value?.active) : value === 'active';
    syncHeldVisibility();
  };
  root.setHeldItem = (value) => {
    const next = value?.type === 'specimen' && value.speciesId
      ? { ...value }
      : value?.type === 'equipment' && value.itemId === 'ice-axe'
        ? { type: 'equipment', itemId: 'ice-axe', name: 'Ice Axe' }
        : null;
    const same = root.heldItem?.type === next?.type && (next?.type === 'specimen'
      ? (root.heldItem?.specimenId && next.specimenId
          ? root.heldItem.specimenId === next.specimenId
          : root.heldItem?.speciesId === next.speciesId
            && root.heldItem?.length === next.length && root.heldItem?.shiny === next.shiny)
      : root.heldItem?.itemId === next?.itemId);
    root.heldItem = next;
    if (!same) {
      destroySpecimenModel(root.heldSpecimenModel);
      destroyHeldEquipmentModel(root.heldEquipmentModel);
      root.heldSpecimenModel = null;
      root.heldEquipmentModel = null;
      if (next?.type === 'specimen') root.heldSpecimenModel = replaceSpecimen(
        heldRoot, null, next, 'held',
        `Remote held specimen ${next.specimenId || next.speciesId || ''}`
      );
      if (next?.type === 'equipment') root.heldEquipmentModel = createHeldEquipmentModel(
        heldRoot, next.itemId, { name: 'Remote Hand slot' }
      );
    }
    syncHeldVisibility();
  };
  root.setEmote = (value) => {
    if (!value) { root.currentEmote = null; return; }
    const id = value?.id ?? value;
    const elapsedMs = Math.max(0, Number(value?.elapsedMs) || 0);
    if (root.currentEmote?.id === id) {
      const localElapsed = Math.max(0, Date.now() - root.currentEmote.startedAt);
      if (Math.abs(localElapsed - elapsedMs) > 180) root.currentEmote.startedAt = Date.now() - elapsedMs;
      return;
    }
    root.currentEmote = normalizeEmote({ id, startedAt: Date.now() - elapsedMs });
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
    if (root.currentEmote && !(root.currentEmote.id === 'sit' && state === 'fishing')
      && now - root.currentEmote.startedAt >= emoteDurationMs(root.currentEmote.id)) root.currentEmote = null;
    const seated = root.posture === 'seated';
    const sitFishing = root.currentEmote?.id === 'sit' && state === 'fishing';
    const emote = ((state === 'grounded' && speed <= .25 && !catchRoot.enabled) || sitFishing) ? root.currentEmote : null;
    rig.setLocalPosition(0, seated || emote?.id === 'sit' ? -.48 : -.06, 0);
    if (state === 'airborne') { leftArm = -38; rightArm = -38; leftLeg = 20; rightLeg = -12; }
    if (state === 'sliding') { leftArm = 34; rightArm = -22; leftLeg = -38; rightLeg = -48; }
    if (['climbing', 'mantling'].includes(state)) {
      leftArm = 142 + Math.sin(phase) * 18; rightArm = 142 - Math.sin(phase) * 18;
      leftLeg = -18 - Math.sin(phase) * 14; rightLeg = -18 + Math.sin(phase) * 14;
    }
    if (emote?.id === 'wave') rightArm = 145 + Math.sin(emotePhase * 8) * 18;
    else if (emote?.id === 'point') rightArm = 88;
    else if (emote?.id === 'cheer') { leftArm = 148 + Math.sin(emotePhase * 7) * 9; rightArm = 148 - Math.sin(emotePhase * 7) * 9; }
    else if (emote?.id === 'clap') {
      const contact = (1 - Math.cos(emotePhase * Math.PI * 3.4)) * .5;
      leftArm = rightArm = 70 + contact * 16;
      leftArmRoll = -18 - contact * 44;
      rightArmRoll = 18 + contact * 44;
    } else if (emote?.id === 'sit') { leftArm = rightArm = -10; leftLeg = rightLeg = 76; }
    else if (emote?.id === 'dance') {
      const swing = Math.sin(emotePhase * 6.5);
      leftArm = 72 + swing * 46; rightArm = 72 - swing * 46;
      leftLeg = -swing * 25; rightLeg = swing * 25;
    }
    if (seated) leftLeg = rightLeg = 76;
    if (root.fishingActive || catchRoot.enabled) {
      leftArm = 72; rightArm = 58;
      if (!(seated || emote?.id === 'sit')) leftLeg = rightLeg = 0;
    }
    limbs.leftArm.setLocalEulerAngles(leftArm, 0, leftArmRoll);
    limbs.rightArm.setLocalEulerAngles(rightArm, 0, rightArmRoll);
    limbs.leftLeg.setLocalEulerAngles(leftLeg, 0, 0);
    limbs.rightLeg.setLocalEulerAngles(rightLeg, 0, 0);
    const bounce = moving ? Math.abs(Math.sin(phase)) * .055 : Math.sin(phase * .2) * .012;
    character.blobRig.setLocalScale(1 + bounce * .4, 1 - bounce * .25, 1 + bounce * .25);
    if (catchRoot.enabled && now >= root.catchPresentationExpiresAt) root.clearCatch();
    updateNameplate();
  };

  root.showCatch = (catchData) => {
    root.catchPresentationId = catchData.presentationId ?? null;
    root.catchPresentationExpiresAt = Date.now() + 22_000;
    root.catchSpecimenModel = replaceSpecimen(catchRoot, root.catchSpecimenModel, catchData, 'catch',
      `Remote catch ${catchData.speciesId ?? ''}`);
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
    destroyHeldEquipmentModel(root.heldEquipmentModel);
    destroySpecimenModel(root.catchSpecimenModel);
    destroyFishingRodModel(rodModel);
    destroyEntity();
  };
  root.setPosition(0, -1000, 0);
  app.root.addChild(root);
  return root;
}
