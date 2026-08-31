import * as pc from 'playcanvas';
import {
  CLIMBING_CONFIG,
  COLORS,
  NORMAL_JUMP_APEX_METERS,
  PLAYER_CONFIG,
  PLAYER_FOOT_OFFSET,
  PLAYER_STANDING_HEIGHT,
  SPAWN_POINT
} from '../config.js';
import { ClimbingController } from './climbing.js';
import { stabilizeWedgeMovement } from './collision-stability.js';
import { createContactRecovery, sampleContactRecovery } from './contact-recovery.js';
import { moveToward, PlayerInput, StaminaResource } from './movement.js';
import { emoteDurationMs, EMOTE_IDS, normalizeEmote } from '../multiplayer/emotes.js';
import { LEGACY_CHARACTER_PALETTE, hairVisibilityForHeadwear, normalizeAppearance, resolveAppearance } from './appearance.js';
import { createSpecimenModel, destroySpecimenModel, positionSpecimenModel } from '../fishing/specimen-model.js';
import { createCharacterModel } from './character-model.js';
import { createHeldEquipmentModel, destroyHeldEquipmentModel } from './held-item-model.js';

function makeMaterial(values, gloss = 0.12) {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(values[0], values[1], values[2]);
  material.gloss = gloss;
  material.update();
  return material;
}

function setMaterialColor(material, values) {
  if (!material || !values) return;
  material.diffuse.set(values[0], values[1], values[2]);
  material.update();
}

function shirtAccent(values) {
  return values.map((value) => clamp(value * .72 + .08, 0, 1));
}

function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const lerp = (a, b, t) => a + (b - a) * t;
// The authored boots bottom out ~5.9 cm above the 1.88 m capsule feet after the
// visual-root scale is applied. Offset only the render rig; physics/support probes stay
// anchored to the capsule so stamina and collision behavior do not move with the art.
const PLAYER_VISUAL_GROUND_OFFSET = -0.06;

export function isPartialFootRestEligible(footSupport, state = {}) {
  const restState = state.movementState === 'grounded' || state.movementState === 'airborne';
  return Boolean(footSupport?.partial
    && restState
    && !state.slidingDownSlope
    && !state.slideRecoveryActive
    && !state.hasMoveInput
    && !state.sprintHeld
    && !state.slideHeld
    && state.actualSpeed <= PLAYER_CONFIG.staminaPartialSupportMaximumSpeed);
}

export class Player {
  constructor(app, canvas, physicsWorld, RAPIER, surfaceRegistry, spawnPoint = SPAWN_POINT, progression = null) {
    this.app = app;
    this.physicsWorld = physicsWorld;
    this.RAPIER = RAPIER;
    this.input = new PlayerInput(canvas);
    this.stamina = new StaminaResource();
    this.progression = progression;
    this.horizontalVelocity = new pc.Vec3();
    this.moveDirection = new pc.Vec3();
    this.verticalVelocity = 0;
    this.grounded = false;
    this.wasGrounded = false;
    this.sprinting = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.facingYaw = 0;
    this.motionTime = 0;
    this.lastSpeed = 0;
    this.momentumDeflectCooldown = 0;
    this.slideBraking = false;
    this.slideActive = false;
    this.slideEnterTimer = 0;
    this.slideExitTimer = 0;
    this.slidePoseTimer = 0;
    this.slidePoseActive = false;
    this.slideJamTimer = 0;
    this.slideAvoidanceSide = 0;
    this.slideRecoveryTimer = 0;
    this.stationaryContactTimer = 0;
    this.lastSideCollisionNormal = null;
    this.sideCollisionMemoryFrames = 0;
    this.wedgeContactStabilized = false;
    // Hard contact lock: once the controller starts alternating incompatible rock-contact
    // solutions, freeze the capsule at one exact transform. This makes visible high-frequency
    // reversal physically impossible instead of trying to visually smooth it afterward.
    this.contactMotionLocked = false;
    this.contactLockGrounded = false;
    this.contactStateFlipCount = 0;
    this.lastCollisionCorrectionY = 0;
    // Guaranteed anti-trap fallback. The controller continuously remembers the most recent
    // non-wedged transform. If a hard contact lock cannot be escaped under player input, we
    // roll back a few inches/one frame to this known-good transform instead of leaving the
    // player permanently imprisoned between rocks.
    this.lastUnwedgedPosition = new pc.Vec3(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    // A second anchor is only updated when there is no side contact at all. It gives the
    // anti-trap recovery a genuinely clear rollback point instead of merely the last frame
    // that happened not to meet the formal opposing-normal wedge test.
    this.lastContactFreePosition = new pc.Vec3(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    this.contactLockEscapeTimer = 0;
    this.contactTrapRecoveries = 0;
    this.contactRecovery = null;
    this.stationaryProbePosition = new pc.Vec3(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    this.movementState = 'airborne';
    this.currentEmote = null;
    this.sitFishingPausedAt = null;
    this.benchSeat = null;
    this.canGrip = false;
    this.gripCandidate = null;
    this.surfaceRegistry = surfaceRegistry;
    this.fishing = null;
    this.runManager = null;
    this.spawnPoint = { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z };

    this.body = this.physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.spawnPoint.x,
        this.spawnPoint.y,
        this.spawnPoint.z
      )
    );
    this.collider = this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.capsule(PLAYER_CONFIG.capsuleHalfHeight, PLAYER_CONFIG.radius)
        .setFriction(0)
        .setRestitution(0),
      this.body
    );
    this.safeSpawnCapsuleShape = new RAPIER.Capsule(
      PLAYER_CONFIG.capsuleHalfHeight * .92,
      PLAYER_CONFIG.radius * .9
    );

    this.controller = this.physicsWorld.createCharacterController(0.025);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(PLAYER_CONFIG.stepHeight, 0.2, false);
    this.controller.enableSnapToGround(0.22);
    this.controller.setMaxSlopeClimbAngle(PLAYER_CONFIG.maxSlopeDegrees * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(PLAYER_CONFIG.slideSlopeDegrees * Math.PI / 180);
    this.climbing = new ClimbingController(
      this.physicsWorld,
      RAPIER,
      surfaceRegistry,
      this.collider
    );

    this.entity = new pc.Entity('Player');
    this.visualRoot = new pc.Entity('Player visual');
    this.entity.addChild(this.visualRoot);
    this.app.root.addChild(this.entity);
    this.appearance = normalizeAppearance(this.progression?.getAppearance?.());
    this.heldInventorySpecimen = null;
    this.inventorySpecimenModel = null;
    this.heldEquipmentItem = null;
    this.heldEquipmentModel = null;
    this.buildCharacter();
    this.buildMantleDebugMarkers();
    // The authored mascot mesh was a little over two meters tall. Keep its silhouette,
    // but fit it to the 1.88 m physical capsule so one world unit remains one meter.
    this.visualRoot.setLocalScale(1, .89, 1);
    this.syncVisual(0, true);
  }

  buildMantleDebugMarkers() {
    const root = new pc.Entity('Mantle debug markers');
    const lipMaterial = makeMaterial([1, .7, .1], .8);
    const targetMaterial = makeMaterial([.25, 1, .45], .8);
    const pathMaterial = makeMaterial([.3, .75, 1], .7);
    const marker = (name, scale, material) => {
      const entity = new pc.Entity(name);
      entity.addComponent('render', { type: 'sphere', material, castShadows: false, receiveShadows: false });
      entity.setLocalScale(scale, scale, scale);
      root.addChild(entity);
      return entity;
    };
    const lip = marker('Mantle lip', .18, lipMaterial);
    const target = marker('Mantle landing', .22, targetMaterial);
    const path = Array.from({ length: 6 }, (_, index) => marker(`Mantle path ${index + 1}`, .085, pathMaterial));
    root.enabled = false;
    this.app.root.addChild(root);
    this.mantleDebugMarkers = { root, lip, target, path };
  }

  syncMantleDebugMarkers() {
    const markers = this.mantleDebugMarkers;
    if (!markers) return;
    const debugVisible = document.body.classList.contains('debug-visible');
    const mantle = this.climbing.getDebugState().mantle;
    const lip = mantle?.lip;
    const target = mantle?.target;
    markers.root.enabled = debugVisible && Boolean(lip || target);
    if (!markers.root.enabled) return;
    markers.lip.enabled = Boolean(lip);
    markers.target.enabled = Boolean(target);
    if (lip) markers.lip.setPosition(lip.x, lip.y, lip.z);
    if (target) markers.target.setPosition(target.x, target.y, target.z);
    const start = lip ?? { ...this.body.translation(), y: this.body.translation().y + .35 };
    markers.path.forEach((dot, index) => {
      dot.enabled = Boolean(target);
      if (!target) return;
      const t = (index + 1) / (markers.path.length + 1);
      dot.setPosition(
        start.x + (target.x - start.x) * t,
        start.y + (target.y - start.y) * t + Math.sin(Math.PI * t) * .25,
        start.z + (target.z - start.z) * t
      );
    });
  }

  addVisual(name, type, localPosition, scale, material, rotation = {}, parent = this.visualRoot) {
    const entity = new pc.Entity(name);
    entity.addComponent('render', {
      type,
      material,
      castShadows: true,
      receiveShadows: true
    });
    entity.setLocalPosition(localPosition.x, localPosition.y, localPosition.z);
    entity.setLocalScale(scale.x, scale.y, scale.z);
    entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    parent.addChild(entity);
    return entity;
  }

  addJoint(name, localPosition, parent = this.visualRoot) {
    const joint = new pc.Entity(name);
    joint.setLocalPosition(localPosition.x, localPosition.y, localPosition.z);
    parent.addChild(joint);
    return joint;
  }

  buildLimb(side, jacket, skin, trousers, boots, parent = this.visualRoot) {
    const direction = side === 'Left' ? -1 : 1;
    const shoulder = this.addJoint(`${side} shoulder`, { x: direction * 0.41, y: 0.27, z: 0 }, parent);
    this.addVisual(
      `${side} upper arm`, 'box',
      { x: 0, y: -0.18, z: 0 }, { x: 0.18, y: 0.36, z: 0.2 }, jacket, {}, shoulder
    );
    const elbow = this.addJoint(`${side} elbow`, { x: 0, y: -0.36, z: 0 }, shoulder);
    this.addVisual(
      `${side} lower arm`, 'box',
      { x: 0, y: -0.16, z: 0 }, { x: 0.155, y: 0.32, z: 0.175 }, jacket, {}, elbow
    );
    this.addVisual(
      `${side} hand`, 'sphere',
      { x: 0, y: -0.35, z: 0 }, { x: 0.16, y: 0.19, z: 0.16 }, skin, {}, elbow
    );

    // The visual root is scaled to the 0.94 m capsule foot offset. Keeping the original
    // rig proportions here lets animation remain independent of the physical body size.
    const hip = this.addJoint(`${side} hip`, { x: direction * 0.19, y: -0.35, z: 0 }, parent);
    this.addVisual(
      `${side} upper leg`, 'box',
      { x: 0, y: -0.15, z: 0 }, { x: 0.23, y: 0.3, z: 0.27 }, trousers, {}, hip
    );
    const knee = this.addJoint(`${side} knee`, { x: 0, y: -0.3, z: 0 }, hip);
    this.addVisual(
      `${side} lower leg`, 'box',
      { x: 0, y: -0.135, z: 0 }, { x: 0.2, y: 0.27, z: 0.23 }, trousers, {}, knee
    );
    this.addVisual(
      `${side} boot`, 'box',
      { x: 0, y: -0.26, z: -0.075 }, { x: 0.25, y: 0.16, z: 0.41 }, boots, {}, knee
    );
    return { shoulder, elbow, hip, knee };
  }

  buildCharacter() {
    // Local play, multiplayer, and the wardrobe preview all instantiate this same complete
    // hierarchy. The legacy authored implementation remains below temporarily as a readable
    // migration reference, but is no longer constructed.
    this.characterModel = createCharacterModel(this.visualRoot, { name: 'Local player' });
    this.humanRig = this.characterModel.humanRig;
    this.blobRig = this.characterModel.blobRig;
    this.appearanceMaterials = this.characterModel.materials;
    this.hairStyles = this.characterModel.hairStyles;
    this.hairTopParts = this.characterModel.hairTopParts;
    this.accessories = this.characterModel.accessories;
    this.backAccessoryRoots = this.characterModel.backAccessoryRoots;
    this.leftLimb = this.characterModel.leftLimb;
    this.rightLimb = this.characterModel.rightLimb;
    this.leftHandAnchor = this.characterModel.leftHandAnchor;
    this.rightHandAnchor = this.characterModel.rightHandAnchor;
    this.applyAppearance(this.appearance);
    return;

    const jacket = makeMaterial(COLORS.player);
    const accent = makeMaterial(COLORS.playerAccent);
    const skin = makeMaterial(LEGACY_CHARACTER_PALETTE.skin);
    const boots = makeMaterial(LEGACY_CHARACTER_PALETTE.boots);
    const pack = makeMaterial(LEGACY_CHARACTER_PALETTE.backpack);
    const trousers = makeMaterial(LEGACY_CHARACTER_PALETTE.trousers);
    const hair = makeMaterial([0.08, 0.05, 0.035], 0.18);
    const dark = makeMaterial(LEGACY_CHARACTER_PALETTE.dark, 0.4);
    const accessory = makeMaterial([0.84, 0.42, 0.13], .3);
    const blobBlue = makeMaterial([0.28, 0.72, 0.95], .38);
    this.appearanceMaterials = { jacket, accent, skin, boots, pack, trousers, hair, dark, accessory, blobBlue };

    this.humanRig = new pc.Entity('Human avatar');
    this.visualRoot.addChild(this.humanRig);
    this.blobRig = new pc.Entity('Blue Blob avatar');
    this.visualRoot.addChild(this.blobRig);

    this.addVisual(
      'Tapered upper torso', 'box',
      { x: 0, y: 0.06, z: 0 },
      { x: 0.7, y: 0.58, z: 0.42 },
      jacket, {}, this.humanRig
    );
    this.addVisual(
      'Lower torso', 'box',
      { x: 0, y: -0.28, z: 0 },
      { x: 0.55, y: 0.18, z: 0.38 },
      accent, {}, this.humanRig
    );
    this.addVisual(
      'Jacket collar', 'box',
      { x: 0, y: 0.34, z: -0.04 },
      { x: 0.38, y: 0.12, z: 0.47 },
      accent, {}, this.humanRig
    );
    this.addVisual('Neck', 'cylinder', { x: 0, y: 0.46, z: 0 }, { x: 0.17, y: 0.2, z: 0.17 }, skin, {}, this.humanRig);
    this.addVisual('Left shoulder cap', 'sphere', { x: -0.37, y: 0.27, z: 0 }, { x: .25, y: .25, z: .27 }, jacket, {}, this.humanRig);
    this.addVisual('Right shoulder cap', 'sphere', { x: 0.37, y: 0.27, z: 0 }, { x: .25, y: .25, z: .27 }, jacket, {}, this.humanRig);
    this.addVisual(
      'Head', 'sphere',
      { x: 0, y: 0.7, z: -0.015 },
      { x: 0.47, y: 0.52, z: 0.46 },
      skin, {}, this.humanRig
    );
    this.addVisual('Left eye', 'sphere', { x: -0.105, y: 0.73, z: -0.235 }, { x: 0.05, y: 0.06, z: 0.04 }, dark, {}, this.humanRig);
    this.addVisual('Right eye', 'sphere', { x: 0.105, y: 0.73, z: -0.235 }, { x: 0.05, y: 0.06, z: 0.04 }, dark, {}, this.humanRig);
    this.addVisual('Nose', 'cone', { x: 0, y: 0.64, z: -0.27 }, { x: 0.065, y: 0.11, z: 0.065 }, skin, { x: 90 }, this.humanRig);

    const shortHair = new pc.Entity('Short hair style');
    const tousledHair = new pc.Entity('Tousled hair style');
    const ponytailHair = new pc.Entity('Ponytail hair style');
    const mohawkHair = new pc.Entity('Mohawk hair style');
    const longHair = new pc.Entity('Long hair style');
    const bunHair = new pc.Entity('Trail bun hair style');
    const braidsHair = new pc.Entity('Twin braids hair style');
    const baldHair = new pc.Entity('Bald hair style');
    [shortHair, tousledHair, ponytailHair, mohawkHair, longHair, bunHair, braidsHair, baldHair]
      .forEach((root) => this.humanRig.addChild(root));
    this.addVisual('Short hair cap', 'sphere', { x: 0, y: .9, z: .02 }, { x: .475, y: .2, z: .455 }, hair, {}, shortHair);
    this.addVisual('Tousled hair cap', 'sphere', { x: 0, y: .9, z: .02 }, { x: .48, y: .19, z: .46 }, hair, {}, tousledHair);
    [-.23, 0, .22].forEach((x, index) => this.addVisual(`Tousled lock ${index + 1}`, 'cone',
      { x, y: .995 + (index % 2) * .045, z: -.02 }, { x: .13, y: .25, z: .13 }, hair,
      { z: (index - 1) * -12 }, tousledHair));
    const ponytailTop = this.addVisual('Ponytail hair cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .47, y: .2, z: .45 }, hair, {}, ponytailHair);
    this.addVisual('Ponytail tie', 'sphere', { x: 0, y: .79, z: .34 }, { x: .17, y: .17, z: .17 }, accent, {}, ponytailHair);
    this.addVisual('Ponytail', 'sphere', { x: 0, y: .62, z: .39 }, { x: .23, y: .4, z: .21 }, hair, { x: -8 }, ponytailHair);
    [-.2, 0, .2].forEach((z, index) => this.addVisual(`Mohawk crest ${index + 1}`, 'cone',
      { x: 0, y: 1.02, z }, { x: .16, y: .35 + (index === 1 ? .08 : 0), z: .16 }, hair, {}, mohawkHair));
    const longHairTop = this.addVisual('Long hair cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .48, y: .2, z: .46 }, hair, {}, longHair);
    this.addVisual('Long hair back', 'sphere', { x: 0, y: .62, z: .25 }, { x: .44, y: .6, z: .22 }, hair, { x: -5 }, longHair);
    for (const side of [-1, 1]) this.addVisual(`Long hair side ${side}`, 'sphere',
      { x: side * .34, y: .65, z: .04 }, { x: .15, y: .48, z: .16 }, hair, { z: side * 5 }, longHair);
    this.addVisual('Trail bun hair cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .47, y: .2, z: .45 }, hair, {}, bunHair);
    this.addVisual('Trail bun', 'sphere', { x: 0, y: .96, z: .36 }, { x: .27, y: .27, z: .27 }, hair, {}, bunHair);
    const braidsTop = this.addVisual('Braids hair cap', 'sphere', { x: 0, y: .9, z: .03 }, { x: .47, y: .2, z: .45 }, hair, {}, braidsHair);
    for (const side of [-1, 1]) {
      this.addVisual(`Braid ${side} upper`, 'cylinder', { x: side * .3, y: .62, z: .15 },
        { x: .12, y: .52, z: .12 }, hair, { z: side * 5 }, braidsHair);
      this.addVisual(`Braid ${side} end`, 'sphere', { x: side * .35, y: .33, z: .17 },
        { x: .13, y: .17, z: .13 }, hair, {}, braidsHair);
    }
    this.hairStyles = new Map([
      ['short', shortHair], ['tousled', tousledHair], ['ponytail', ponytailHair],
      ['mohawk', mohawkHair], ['long', longHair], ['bun', bunHair], ['braids', braidsHair], ['bald', baldHair]
    ]);
    this.hairTopParts = new Map([
      ['ponytail', [ponytailTop]], ['long', [longHairTop]], ['braids', [braidsTop]]
    ]);

    const beanie = new pc.Entity('Beanie accessory');
    const glasses = new pc.Entity('Glasses accessory');
    const trailHat = new pc.Entity('Trail hat accessory');
    const fishingCap = new pc.Entity('Fishing cap accessory');
    const headlamp = new pc.Entity('Headlamp accessory');
    const scarf = new pc.Entity('Trail scarf accessory');
    const bandana = new pc.Entity('Bandana accessory');
    const neckGaiter = new pc.Entity('Neck gaiter accessory');
    const necklace = new pc.Entity('Summit necklace accessory');
    const flowerCrown = new pc.Entity('Flower crown accessory');
    const goggles = new pc.Entity('Summit goggles accessory');
    [beanie, glasses, trailHat, fishingCap, headlamp, scarf, bandana, neckGaiter, necklace, flowerCrown, goggles]
      .forEach((root) => this.humanRig.addChild(root));
    this.addVisual('Beanie crown', 'cone', { x: 0, y: 1.0, z: 0 }, { x: .5, y: .34, z: .5 }, accessory, {}, beanie);
    this.addVisual('Beanie band', 'cylinder', { x: 0, y: .89, z: 0 }, { x: .51, y: .12, z: .51 }, accessory, {}, beanie);
    this.addVisual('Left glasses frame', 'box', { x: -.13, y: .73, z: -.252 }, { x: .19, y: .14, z: .035 }, accessory, {}, glasses);
    this.addVisual('Right glasses frame', 'box', { x: .13, y: .73, z: -.252 }, { x: .19, y: .14, z: .035 }, accessory, {}, glasses);
    this.addVisual('Glasses bridge', 'box', { x: 0, y: .73, z: -.262 }, { x: .08, y: .025, z: .025 }, accessory, {}, glasses);
    this.addVisual('Trail hat brim', 'box', { x: 0, y: .94, z: -.05 }, { x: .72, y: .055, z: .62 }, accessory, {}, trailHat);
    this.addVisual('Trail hat crown', 'cylinder', { x: 0, y: 1.06, z: .02 }, { x: .46, y: .24, z: .46 }, accessory, {}, trailHat);
    this.addVisual('Fishing cap crown', 'sphere', { x: 0, y: .96, z: .03 }, { x: .48, y: .21, z: .45 }, accessory, {}, fishingCap);
    this.addVisual('Fishing cap bill', 'box', { x: 0, y: .91, z: -.38 }, { x: .48, y: .055, z: .35 }, accessory, { x: -5 }, fishingCap);
    this.addVisual('Headlamp band', 'cylinder', { x: 0, y: .88, z: 0 }, { x: .49, y: .09, z: .49 }, accessory, {}, headlamp);
    this.addVisual('Headlamp light', 'sphere', { x: 0, y: .89, z: -.27 }, { x: .14, y: .13, z: .11 }, accessory, {}, headlamp);
    this.addVisual('Scarf collar', 'cylinder', { x: 0, y: .44, z: 0 }, { x: .32, y: .17, z: .32 }, accessory, {}, scarf);
    this.addVisual('Scarf tail', 'box', { x: .17, y: .17, z: .25 }, { x: .18, y: .55, z: .1 }, accessory, { x: -12, z: -8 }, scarf);
    this.addVisual('Bandana face cloth', 'box', { x: 0, y: .57, z: -.245 }, { x: .31, y: .18, z: .035 }, accessory, { x: 7 }, bandana);
    this.addVisual('Bandana knot', 'sphere', { x: 0, y: .56, z: .23 }, { x: .11, y: .1, z: .09 }, accessory, {}, bandana);
    this.addVisual('Neck gaiter', 'cylinder', { x: 0, y: .48, z: 0 }, { x: .3, y: .23, z: .3 }, accessory, {}, neckGaiter);
    this.addVisual('Necklace cord', 'cylinder', { x: 0, y: .47, z: -.12 }, { x: .2, y: .035, z: .2 }, accessory, {}, necklace);
    this.addVisual('Necklace pendant', 'sphere', { x: 0, y: .39, z: -.205 }, { x: .075, y: .1, z: .035 }, accessory, {}, necklace);
    this.addVisual('Flower crown band', 'cylinder', { x: 0, y: .91, z: 0 }, { x: .49, y: .06, z: .49 }, accessory, {}, flowerCrown);
    [-.3, -.15, 0, .15, .3].forEach((x, index) => this.addVisual(`Flower crown bloom ${index + 1}`, 'sphere',
      { x, y: .96 + (index % 2) * .03, z: -.23 + Math.abs(x) * .14 }, { x: .1, y: .1, z: .08 }, accessory, {}, flowerCrown));
    this.addVisual('Goggles left lens', 'sphere', { x: -.14, y: .75, z: -.285 }, { x: .17, y: .13, z: .045 }, dark, {}, goggles);
    this.addVisual('Goggles right lens', 'sphere', { x: .14, y: .75, z: -.285 }, { x: .17, y: .13, z: .045 }, dark, {}, goggles);
    this.addVisual('Goggles strap', 'cylinder', { x: 0, y: .76, z: 0 }, { x: .47, y: .055, z: .47 }, accessory, {}, goggles);
    this.accessories = new Map([
      ['beanie', beanie], ['glasses', glasses], ['trail-hat', trailHat], ['fishing-cap', fishingCap],
      ['headlamp', headlamp], ['scarf', scarf], ['bandana', bandana], ['neck-gaiter', neckGaiter],
      ['necklace', necklace], ['flower-crown', flowerCrown], ['goggles', goggles]
    ]);

    const backpackBody = this.addVisual(
      'Backpack', 'box',
      { x: 0, y: -0.03, z: 0.34 },
      { x: 0.55, y: 0.66, z: 0.27 },
      pack,
      { x: -7, y: 0, z: 0 }, this.humanRig
    );
    const backpackFlap = this.addVisual('Backpack flap', 'box', { x: 0, y: 0.15, z: 0.495 }, { x: 0.45, y: 0.18, z: 0.05 }, pack, { x: -7 }, this.humanRig);
    this.backAccessoryRoots = new Map([['backpack', [backpackBody, backpackFlap]]]);

    this.leftLimb = this.buildLimb('Left', jacket, skin, trousers, boots, this.humanRig);
    this.rightLimb = this.buildLimb('Right', jacket, skin, trousers, boots, this.humanRig);

    // Empty attachment points keep future cosmetics independent of the animation rig.
    this.cosmeticSlots = new Map([
      ['head', this.addJoint('Head cosmetic slot', { x: 0, y: 1.13, z: 0 }, this.humanRig)],
      ['face', this.addJoint('Face cosmetic slot', { x: 0, y: 0.65, z: -0.32 }, this.humanRig)],
      ['backpack', this.addJoint('Backpack cosmetic slot', { x: 0, y: 0, z: 0.52 }, this.humanRig)]
    ]);

    // Restore the original multiplayer proxy silhouette: capsule, round head, and
    // the small marker that makes its facing direction easy to read.
    this.blobBody = this.addVisual('Classic Blue Blob body', 'capsule', { x: 0, y: -.05, z: 0 },
      { x: .72, y: 1.12, z: .72 }, blobBlue, {}, this.blobRig);
    this.addVisual('Classic Blue Blob head', 'sphere', { x: 0, y: .82, z: 0 },
      { x: .48, y: .48, z: .48 }, blobBlue, {}, this.blobRig);
    this.addVisual('Classic Blue Blob facing marker', 'box', { x: 0, y: .35, z: -.43 },
      { x: .16, y: .16, z: .48 }, blobBlue, {}, this.blobRig);
    this.applyAppearance(this.appearance);
  }

  applyAppearance(value) {
    if (this.characterModel) {
      this.appearance = this.characterModel.setAppearance(value);
      return this.getAppearance();
    }
    this.appearance = normalizeAppearance(value);
    const resolved = resolveAppearance(this.appearance);
    setMaterialColor(this.appearanceMaterials.jacket, resolved.shirtColorValue.color);
    setMaterialColor(this.appearanceMaterials.accent, resolved.shirtAccentColor ?? shirtAccent(resolved.shirtColorValue.color));
    setMaterialColor(this.appearanceMaterials.skin, resolved.skinToneValue.color);
    setMaterialColor(this.appearanceMaterials.trousers, resolved.pantsColorValue.color);
    setMaterialColor(this.appearanceMaterials.hair, resolved.hairColorValue.color);
    setMaterialColor(this.appearanceMaterials.accessory, resolved.accessoryColor);
    setMaterialColor(this.appearanceMaterials.pack, resolved.backpackColorValue.color);
    setMaterialColor(this.appearanceMaterials.blobBlue, resolved.blobColor);
    this.humanRig.enabled = this.appearance.avatarType === 'human';
    this.blobRig.enabled = this.appearance.avatarType === 'blob';
    const hairVisibility = hairVisibilityForHeadwear(this.appearance.hairStyle, this.appearance.headwear);
    for (const [id, root] of this.hairStyles) root.enabled = hairVisibility.root && id === this.appearance.hairStyle;
    for (const part of this.hairTopParts.get(this.appearance.hairStyle) ?? []) part.enabled = hairVisibility.top;
    const wornAccessories = new Set([
      this.appearance.headwear, this.appearance.eyewear, this.appearance.faceAccessory
    ]);
    for (const [id, root] of this.accessories) root.enabled = wornAccessories.has(id);
    for (const [id, roots] of this.backAccessoryRoots) {
      for (const root of roots) root.enabled = id === this.appearance.backAccessory;
    }
    return this.getAppearance();
  }

  getAppearance() {
    return normalizeAppearance(this.appearance);
  }

  showInventorySpecimen(specimen = null) {
    if (this.heldInventorySpecimen?.specimenId === specimen?.specimenId && this.inventorySpecimenModel) {
      return this.heldInventorySpecimen;
    }
    destroySpecimenModel(this.inventorySpecimenModel);
    this.inventorySpecimenModel = null;
    this.heldInventorySpecimen = specimen ? { ...specimen } : null;
    if (!specimen) return null;
    const model = createSpecimenModel(specimen, {
      name: `Held inventory specimen ${specimen.specimenId}`
    });
    (this.rightHandAnchor ?? this.visualRoot).addChild(model.root);
    model.heldOffset = positionSpecimenModel(model, 'held');
    this.inventorySpecimenModel = model;
    return this.heldInventorySpecimen;
  }

  showHeldEquipment(item = null) {
    if (this.heldEquipmentItem?.id === item?.id && this.heldEquipmentModel) return this.heldEquipmentItem;
    destroyHeldEquipmentModel(this.heldEquipmentModel);
    this.heldEquipmentModel = null;
    this.heldEquipmentItem = item?.usesHand ? { ...item } : null;
    if (!this.heldEquipmentItem) return null;
    this.heldEquipmentModel = createHeldEquipmentModel(
      this.rightHandAnchor ?? this.visualRoot,
      this.heldEquipmentItem.id,
      { name: 'Local Hand slot' }
    );
    return this.heldEquipmentItem;
  }

  updateInventorySpecimenPose() {
    const model = this.inventorySpecimenModel;
    if (!model) return;
    const visible = !this.fishing?.active
      && !['fishing', 'climbing', 'mantling', 'sliding'].includes(this.movementState)
      && !this.currentEmote;
    model.root.enabled = visible;
    if (!visible) return;
    const offset = model.heldOffset ?? { x: .64, y: -.29, z: -.4 };
    model.root.setLocalPosition(offset.x, offset.y + Math.sin(this.motionTime * 1.4) * .012, offset.z);
    if (model.tail) {
      const base = model.tailBaseEuler ?? model.tail.getLocalEulerAngles().clone();
      model.tailBaseEuler = base;
      model.tail.setLocalEulerAngles(base.x, base.y + Math.sin(this.motionTime * 4.8) * 9, base.z);
    }
  }

  updateHeldEquipmentPose() {
    if (!this.heldEquipmentModel) return;
    this.heldEquipmentModel.root.enabled = !this.fishing?.active
      && !['fishing', 'climbing', 'mantling', 'sliding'].includes(this.movementState)
      && !this.currentEmote;
  }

  getGroundSurfaceInfo() {
    const position = this.body.translation();
    const footOffset = PLAYER_FOOT_OFFSET;
    const sampleRadius = PLAYER_CONFIG.radius * .7;
    const offsets = [
      [0, 0],
      [sampleRadius, 0], [-sampleRadius, 0],
      [0, sampleRadius], [0, -sampleRadius]
    ];
    let best = null;

    const describeHit = (hit, distance, kind = 'down') => {
      const normal = new pc.Vec3(hit.normal.x, hit.normal.y, hit.normal.z);
      if (normal.y < 0) normal.mulScalar(-1);
      if (normal.lengthSq() < 0.0001) return null;
      normal.normalize();
      const slopeDegrees = Math.acos(clamp(normal.y, -1, 1)) * 180 / Math.PI;
      const downhill = new pc.Vec3(normal.x, 0, normal.z);
      if (downhill.lengthSq() > 0.0001) downhill.normalize();
      // Gravity projected onto the contact plane gives a true 3D slide direction.
      // Unlike a horizontal-only downhill vector, this keeps sliding working on faces
      // so steep that Rapier no longer considers them walkable ground.
      const slideDirection = new pc.Vec3(
        normal.x * normal.y,
        normal.y * normal.y - 1,
        normal.z * normal.y
      );
      if (slideDirection.lengthSq() > 0.0001) slideDirection.normalize();
      const climbSurface = this.surfaceRegistry.getClimbSurface?.(hit.collider) ?? null;
      const surfaceMaterialId = climbSurface?.material?.id ?? climbSurface?.type ?? null;
      return { normal, slopeDegrees, downhill, slideDirection, distance, nearFeet: true, kind, surfaceMaterialId };
    };

    // Several downward samples stop a single triangle edge from deciding whether a slope
    // exists under the capsule. This matters on the deliberately faceted mountain.
    const downDistance = footOffset + .52;
    for (const [dx, dz] of offsets) {
      const ray = new this.RAPIER.Ray(
        { x: position.x + dx, y: position.y + .08, z: position.z + dz },
        { x: 0, y: -1, z: 0 }
      );
      const hit = this.physicsWorld.castRayAndGetNormal(
        ray, downDistance, true, undefined, undefined, this.collider
      );
      if (!hit) continue;
      const info = describeHit(hit, hit.timeOfImpact);
      if (!info) continue;
      const score = hit.timeOfImpact + Math.hypot(dx, dz) * .08;
      if (!best || score < best.score) best = { ...info, score };
    }

    // Rapier intentionally reports >55° faces as non-ground. When the capsule is on one
    // of those faces, a short lower-body fan still finds the surface so manual/forced
    // sliding remains active instead of silently turning off on the steepest terrain.
    if (!this.grounded || (best && best.slopeDegrees > PLAYER_CONFIG.maxSlopeDegrees)) {
      const sideOriginY = position.y - footOffset * .46;
      const sideDistance = PLAYER_CONFIG.radius + .24;
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI * .25;
        const direction = new pc.Vec3(Math.cos(angle), -.22, Math.sin(angle)).normalize();
        const ray = new this.RAPIER.Ray(
          { x: position.x, y: sideOriginY, z: position.z },
          { x: direction.x, y: direction.y, z: direction.z }
        );
        const hit = this.physicsWorld.castRayAndGetNormal(
          ray, sideDistance, true, undefined, undefined, this.collider
        );
        if (!hit) continue;
        const info = describeHit(hit, hit.timeOfImpact, 'side');
        if (!info || info.slopeDegrees <= PLAYER_CONFIG.maxSlopeDegrees) continue;
        const score = hit.timeOfImpact * .72;
        if (!best || info.slopeDegrees > PLAYER_CONFIG.hardNoStandSlopeDegrees
          || score < best.score) {
          best = { ...info, score };
        }
      }
    }

    if (!best) return null;
    delete best.score;
    return best;
  }

  getFootSupportInfo() {
    const position = this.body.translation();
    const r = PLAYER_CONFIG.staminaSupportProbeRadius;
    const offsets = [
      [0, 0], [r, 0], [-r, 0], [0, r], [0, -r],
      [r * .72, r * .72], [r * .72, -r * .72], [-r * .72, r * .72], [-r * .72, -r * .72]
    ];
    let supported = 0;
    let contactSupported = 0;
    let steepContacts = 0;
    const maxDistance = PLAYER_CONFIG.capsuleHalfHeight + PLAYER_CONFIG.radius
      + PLAYER_CONFIG.staminaSupportProbeExtra;
    const contactDistance = PLAYER_CONFIG.capsuleHalfHeight + PLAYER_CONFIG.radius + .08
      + PLAYER_CONFIG.staminaPartialSupportExtra;
    for (const [dx, dz] of offsets) {
      const ray = new this.RAPIER.Ray(
        { x: position.x + dx, y: position.y + 0.08, z: position.z + dz },
        { x: 0, y: -1, z: 0 }
      );
      const hit = this.physicsWorld.castRayAndGetNormal(
        ray, maxDistance, true, undefined, undefined, this.collider
      );
      if (!hit) continue;
      const normalY = Math.max(-1, Math.min(1, hit.normal.y));
      if (normalY <= 0) continue;
      const slopeDegrees = Math.acos(Math.max(-1, Math.min(1, normalY))) * 180 / Math.PI;
      if (slopeDegrees > PLAYER_CONFIG.staminaMaximumSupportSlopeDegrees) {
        steepContacts += 1;
        continue;
      }
      // Probe distance tolerance deliberately allows broad ordinary slopes; what fails is
      // tiny-point contact, an edge under only one foot, air, or a >55° face.
      if (hit.timeOfImpact <= maxDistance) supported += 1;
      if (hit.timeOfImpact <= contactDistance) contactSupported += 1;
    }
    return {
      fraction: supported / offsets.length,
      supportedSamples: supported,
      contactFraction: contactSupported / offsets.length,
      contactSupportedSamples: contactSupported,
      steepSamples: steepContacts,
      stable: supported / offsets.length >= PLAYER_CONFIG.staminaMinimumSupportFraction,
      partial: contactSupported / offsets.length >= PLAYER_CONFIG.staminaPartialSupportFraction
    };
  }

  getBodyContactInfo() {
    const position = this.body.translation();
    const maximumDistance = PLAYER_CONFIG.radius + PLAYER_CONFIG.stationaryContactProbeExtra;
    const originYs = [
      position.y - PLAYER_FOOT_OFFSET * .38,
      position.y + PLAYER_FOOT_OFFSET * .12
    ];
    let sideSamples = 0;
    for (const originY of originYs) {
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI * .25;
        const direction = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
        const ray = new this.RAPIER.Ray(
          { x: position.x, y: originY, z: position.z },
          direction
        );
        const hit = this.physicsWorld.castRay(
          ray, maximumDistance, true, undefined, undefined, this.collider
        );
        if (hit && hit.timeOfImpact <= maximumDistance) sideSamples += 1;
      }
    }
    return { sideSamples };
  }

  resetSlideState() {
    this.slideActive = false;
    this.slideEnterTimer = 0;
    this.slideExitTimer = 0;
    this.slidePoseTimer = 0;
    this.slidePoseActive = false;
    this.slideJamTimer = 0;
    this.slideAvoidanceSide = 0;
    this.slideRecoveryTimer = 0;
    this.slideBraking = false;
  }

  updateSlideState(dt, groundSurface, manualRequested) {
    const surfaceNearFeet = Boolean(groundSurface?.nearFeet);
    const slopeDegrees = groundSurface?.slopeDegrees ?? 0;
    const slipperySurface = ['ice', 'smooth'].includes(groundSurface?.surfaceMaterialId);
    const iceStability = slipperySurface
      ? Math.max(1, this.progression?.getModifier('iceSlideThresholdMultiplier') ?? 1)
      : 1;

    // A jam-recovery window deliberately releases forced slide control so the player can
    // steer sideways around the obstruction. It does NOT make steep terrain legal ground:
    // coyote/jump/regen rules still use the independently sampled slope below.
    if (this.slideRecoveryTimer > 0) {
      this.slideActive = false;
      this.slideEnterTimer = 0;
      this.slideExitTimer = 0;
      this.slideBraking = false;
      return false;
    }

    const automaticCandidate = surfaceNearFeet
      && slopeDegrees >= PLAYER_CONFIG.slideSlopeDegrees * iceStability;
    const keepCandidate = surfaceNearFeet
      && slopeDegrees >= PLAYER_CONFIG.slideExitSlopeDegrees * iceStability;

    if (manualRequested) {
      this.slideActive = true;
      this.slideEnterTimer = 0;
      this.slideExitTimer = 0;
      return true;
    }

    if (this.slideActive) {
      if (keepCandidate) {
        this.slideExitTimer = 0;
      } else {
        this.slideExitTimer += dt;
        if (this.slideExitTimer >= PLAYER_CONFIG.slideAutoExitDelay) {
          this.slideActive = false;
          this.slideEnterTimer = 0;
          this.slideExitTimer = 0;
        }
      }
      return this.slideActive && surfaceNearFeet;
    }

    this.slideExitTimer = 0;
    if (automaticCandidate) {
      this.slideEnterTimer += dt;
      if (this.slideEnterTimer >= PLAYER_CONFIG.slideAutoEnterDelay) {
        this.slideActive = true;
        this.slideEnterTimer = 0;
      }
    } else {
      this.slideEnterTimer = 0;
    }
    return this.slideActive && surfaceNearFeet;
  }

  updateSlidePoseState(dt, slidingDownSlope) {
    if (!slidingDownSlope || this.slideRecoveryTimer > 0) {
      this.slidePoseTimer = 0;
      this.slidePoseActive = false;
      return;
    }
    this.slidePoseTimer += dt;
    if (this.slidePoseTimer >= PLAYER_CONFIG.slidePoseDelay) {
      this.slidePoseActive = true;
    }
  }

  chooseSlideAvoidanceSide(groundSurface) {
    const downhill = groundSurface?.downhill?.clone?.() ?? new pc.Vec3();
    if (downhill.lengthSq() < 0.0001) return this.slideAvoidanceSide || 1;
    downhill.normalize();
    const tangent = new pc.Vec3(-downhill.z, 0, downhill.x);
    if (tangent.lengthSq() < 0.0001) return this.slideAvoidanceSide || 1;
    tangent.normalize();

    const position = this.body.translation();
    const originY = position.y - PLAYER_FOOT_OFFSET * .34;
    const maximum = PLAYER_CONFIG.slideJamProbeDistance;
    const clearanceFor = (sign) => {
      // Look mostly sideways but a little downhill. The open side gets the larger score.
      const direction = tangent.clone().mulScalar(sign).add(downhill.clone().mulScalar(.24));
      direction.normalize();
      let clearance = maximum;
      for (const height of [0, .52]) {
        const ray = new this.RAPIER.Ray(
          { x: position.x, y: originY + height, z: position.z },
          { x: direction.x, y: 0, z: direction.z }
        );
        const hit = this.physicsWorld.castRay(
          ray, maximum, true, undefined, undefined, this.collider
        );
        if (hit) clearance = Math.min(clearance, hit.timeOfImpact);
      }
      return clearance;
    };

    const positive = clearanceFor(1);
    const negative = clearanceFor(-1);
    if (Math.abs(positive - negative) > .05) return positive > negative ? 1 : -1;
    // Deterministic tie-breaker stops the steering side from flipping every frame.
    return Math.sin(position.x * .37 + position.z * .53) >= 0 ? 1 : -1;
  }

  updateSlideJamState(dt, desiredMovement, movementResult, groundSurface) {
    if (!movementResult || !groundSurface) {
      this.slideJamTimer = Math.max(0, this.slideJamTimer - dt * 3);
      return;
    }

    const desiredDown = Math.max(0, -desiredMovement.y);
    const correctedDown = Math.max(0, -movementResult.correctedMovement.y);
    const desiredDistance = Math.hypot(desiredMovement.x, desiredMovement.y, desiredMovement.z);
    const correctedDistance = Math.hypot(
      movementResult.correctedMovement.x,
      movementResult.correctedMovement.y,
      movementResult.correctedMovement.z
    );
    const totalRatio = desiredDistance > .0001 ? correctedDistance / desiredDistance : 1;
    const downhillRatio = desiredDown > .0001 ? correctedDown / desiredDown : 1;
    const blocked = desiredDistance > .015
      && totalRatio < PLAYER_CONFIG.slideJamBlockedRatio;
    const notDescending = desiredDown > .004
      && downhillRatio < PLAYER_CONFIG.slideJamDownhillProgressRatio;

    if (blocked && notDescending) {
      this.slideJamTimer += dt;
      if (this.slideJamTimer >= PLAYER_CONFIG.slideJamSteerDelay
        && this.slideAvoidanceSide === 0) {
        this.slideAvoidanceSide = this.chooseSlideAvoidanceSide(groundSurface);
      }
    } else {
      this.slideJamTimer = Math.max(0, this.slideJamTimer - dt * 2.5);
      if (this.slideJamTimer < PLAYER_CONFIG.slideJamSteerDelay * .4) {
        this.slideAvoidanceSide = 0;
      }
    }

    if (this.slideJamTimer >= PLAYER_CONFIG.slideJamRecoveryDelay) {
      const escapeSide = this.slideAvoidanceSide || this.chooseSlideAvoidanceSide(groundSurface);
      // Keep current momentum; only release forced slide control. The following frames use
      // contour-biased recovery steering, so this is not a teleport or arbitrary pop-out.
      this.slideActive = false;
      this.slideEnterTimer = 0;
      this.slideExitTimer = 0;
      this.slidePoseTimer = 0;
      this.slidePoseActive = false;
      this.slideJamTimer = 0;
      this.slideAvoidanceSide = escapeSide;
      this.slideRecoveryTimer = PLAYER_CONFIG.slideRecoveryDuration;
    }
  }

  updateStationaryContactRecovery(dt, footSupport, hasMoveInput) {
    const position = this.body.translation();
    const dx = position.x - this.stationaryProbePosition.x;
    const dz = position.z - this.stationaryProbePosition.z;
    // Rest eligibility uses planar drift. The kinematic capsule is continually nudged down
    // into its support surface, so counting that tiny vertical correction made valid ledges
    // look like movement; holding Grip happened to suppress the jitter and appeared to
    // "enable" regeneration. Upward-facing foot probes still prevent airborne recovery.
    const actualSpeed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    this.stationaryProbePosition.set(position.x, position.y, position.z);

    const bodyContacts = this.getBodyContactInfo();
    const totalSamples = footSupport.supportedSamples + bodyContacts.sideSamples;
    const hasMultipleContacts = footSupport.supportedSamples >= 1
      && totalSamples >= PLAYER_CONFIG.stationaryContactMinimumSamples;
    const restingIntent = !hasMoveInput
      && !this.input.sprintHeld
      && !this.input.slideHeld;
    const physicallyStationary = actualSpeed <= PLAYER_CONFIG.stationaryContactMaximumSpeed;
    const eligible = hasMultipleContacts && restingIntent && physicallyStationary
      && this.movementState !== 'climbing'
      && this.movementState !== 'mantling'
      && this.movementState !== 'fishing';

    if (eligible) this.stationaryContactTimer += dt;
    else this.stationaryContactTimer = 0;

    return {
      eligible,
      actualSpeed,
      sideSamples: bodyContacts.sideSamples,
      totalSamples,
      ready: this.stationaryContactTimer >= PLAYER_CONFIG.stationaryContactRecoverySeconds
    };
  }

  clearContactMotionLock() {
    this.contactMotionLocked = false;
    this.contactLockGrounded = false;
    this.contactStateFlipCount = 0;
    this.lastCollisionCorrectionY = 0;
    this.contactLockEscapeTimer = 0;
    this.wedgeContactStabilized = false;
  }

  recoverFromContactTrap() {
    const current = this.body.translation();
    const distanceTo = (point) => Math.hypot(
      current.x - point.x,
      current.y - point.y,
      current.z - point.z
    );

    // Prefer a transform recorded with *zero* side contact. That is stronger than merely
    // "not an opposing wedge" and prevents the rollback from depositing the capsule back in
    // the same narrow crack. If it is stale/far away, the recent non-opposing transform remains
    // a conservative fallback. Both caps are intentionally small: this is an unstuck rewind,
    // never a gameplay teleport.
    const clearDistance = distanceTo(this.lastContactFreePosition);
    const recentDistance = distanceTo(this.lastUnwedgedPosition);
    const safe = Number.isFinite(clearDistance) && clearDistance <= 2.5
      ? this.lastContactFreePosition
      : (Number.isFinite(recentDistance) && recentDistance <= 1.15 ? this.lastUnwedgedPosition : null);

    if (!safe) {
      this.clearContactMotionLock();
      return false;
    }

    const recovered = { x: safe.x, y: safe.y + .035, z: safe.z };
    this.contactRecovery = createContactRecovery(current, recovered);
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.resetSlideState();
    this.grounded = false;
    this.movementState = 'airborne';
    this.contactTrapRecoveries += 1;
    this.clearContactMotionLock();
    this.stationaryProbePosition.set(recovered.x, recovered.y, recovered.z);
    return true;
  }

  updateContactRecovery(dt) {
    if (!this.contactRecovery) return false;
    this.contactRecovery.elapsed += dt;
    const sample = sampleContactRecovery(this.contactRecovery);
    this.body.setNextKinematicTranslation({ x: sample.x, y: sample.y, z: sample.z });
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = false;
    this.movementState = 'airborne';
    if (sample.complete) {
      this.lastUnwedgedPosition.set(sample.x, sample.y, sample.z);
      this.lastContactFreePosition.set(sample.x, sample.y, sample.z);
      this.contactRecovery = null;
    }
    return true;
  }

  engageContactMotionLock(groundedHint = false) {
    this.contactMotionLocked = true;
    this.contactLockGrounded = Boolean(groundedHint || this.grounded);
    this.contactLockEscapeTimer = 0;
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.resetSlideState();
    this.grounded = this.contactLockGrounded;
    this.movementState = this.grounded ? 'grounded' : 'airborne';
  }

  contactLockCanEscape(direction) {
    if (!direction || direction.lengthSq() < 0.0001) return false;
    const flat = direction.clone();
    flat.y = 0;
    if (flat.lengthSq() < 0.0001) return false;
    flat.normalize();
    const position = this.body.translation();
    const maximumDistance = PLAYER_CONFIG.radius + .2;
    const originYs = [
      position.y - PLAYER_FOOT_OFFSET * .38,
      position.y + PLAYER_FOOT_OFFSET * .12
    ];
    for (const originY of originYs) {
      const ray = new this.RAPIER.Ray(
        { x: position.x, y: originY, z: position.z },
        { x: flat.x, y: 0, z: flat.z }
      );
      const hit = this.physicsWorld.castRay(
        ray, maximumDistance, true, undefined, undefined, this.collider
      );
      if (hit && hit.timeOfImpact <= maximumDistance) return false;
    }
    return true;
  }

  freezeContactMotion() {
    const position = this.body.translation();
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.resetSlideState();
    this.grounded = this.contactLockGrounded;
    this.movementState = this.grounded ? 'grounded' : 'airborne';
    this.body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
  }

  performSlidePushOff(groundSurface, hasMoveInput) {
    const outward = new pc.Vec3(groundSurface?.normal.x ?? 0, 0, groundSurface?.normal.z ?? 0);
    if (outward.lengthSq() < 0.0001) outward.copy(this.getFacingDirection()).mulScalar(-1);
    if (outward.lengthSq() > 0.0001) outward.normalize();

    const push = outward.clone().mulScalar(PLAYER_CONFIG.slidePushOffOutwardSpeed);
    if (hasMoveInput && this.moveDirection.lengthSq() > 0.0001) {
      push.add(this.moveDirection.clone().mulScalar(PLAYER_CONFIG.slidePushOffDirectionalSpeed));
    }
    const outwardSpeed = push.dot(outward);
    if (outwardSpeed < PLAYER_CONFIG.slidePushOffMinimumOutwardSpeed) {
      push.add(outward.clone().mulScalar(
        PLAYER_CONFIG.slidePushOffMinimumOutwardSpeed - outwardSpeed
      ));
    }

    const horizontalSpeed = Math.hypot(push.x, push.z);
    if (horizontalSpeed > CLIMBING_CONFIG.maximumPushOffHorizontalSpeed) {
      push.mulScalar(CLIMBING_CONFIG.maximumPushOffHorizontalSpeed / horizontalSpeed);
    }

    if (this.stamina.value > 0) {
      const slideCost = PLAYER_CONFIG.slidePushOffStaminaCost
        * this.normalStaminaCostMultiplier('slideCostMultiplier');
      this.stamina.spend(Math.min(slideCost, this.stamina.value));
    }
    this.horizontalVelocity.set(push.x, 0, push.z);
    this.verticalVelocity = PLAYER_CONFIG.slidePushOffUpSpeed;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.resetSlideState();
    this.movementState = 'airborne';
  }

  setUnlimitedStamina(enabled) {
    return this.stamina.setUnlimited(enabled);
  }

  normalStaminaCostMultiplier(...specificModifiers) {
    let multiplier = Math.max(0, this.progression?.getModifier('staminaCostMultiplier') ?? 1);
    for (const name of specificModifiers) {
      multiplier *= Math.max(0, this.progression?.getModifier(name) ?? 1);
    }
    return Math.max(0, multiplier);
  }

  getClimbingEquipmentModifiers() {
    const materialId = this.climbing.getSurfaceMaterial?.()?.id ?? '';
    const slippery = materialId === 'ice' || materialId === 'smooth';
    return {
      cost: this.normalStaminaCostMultiplier(
        'gripDrain',
        'climbCostMultiplier',
        ...(slippery ? ['iceClimbCostMultiplier'] : [])
      ),
      slip: slippery ? Math.max(0, this.progression?.getModifier('iceSlipMultiplier') ?? 1) : 1
    };
  }

  exitFishing(options = {}) {
    const wasFishing = Boolean(this.fishing?.active || this.movementState === 'fishing');
    if (this.currentEmote?.id === 'sit' && this.sitFishingPausedAt !== null) {
      this.currentEmote.startedAt += Math.max(0, Date.now() - this.sitFishingPausedAt);
      this.sitFishingPausedAt = null;
    }
    this.fishing?.cancel();
    this.input.endRhythmCapture();
    this.input.discardPrimaryEdges();
    this.horizontalVelocity.set(0, 0, 0);
    this.sprinting = false;
    this.canGrip = false;
    this.contactRecovery = null;
    this.clearContactMotionLock();
    this.resetSlideState();
    if (this.benchSeat) this.grounded = true;
    this.movementState = this.grounded ? 'grounded' : 'airborne';
    const position = this.body.translation();
    this.stationaryProbePosition.set(position.x, position.y, position.z);
    if (options.releasePointerLock && globalThis.document?.pointerLockElement) {
      globalThis.document.exitPointerLock?.();
    }
    return wasFishing;
  }

  update(dt, cameraAxes) {
    this.updateEmote();
    this.momentumDeflectCooldown = Math.max(0, this.momentumDeflectCooldown - dt);
    const wasRecoveringFromSlideJam = this.slideRecoveryTimer > 0;
    this.slideRecoveryTimer = Math.max(0, this.slideRecoveryTimer - dt);
    if (wasRecoveringFromSlideJam && this.slideRecoveryTimer <= 0) {
      this.slideAvoidanceSide = 0;
    }
    const cancelPressed = this.input.consumeCancel();
    const fishingWasActive = Boolean(this.fishing?.active || this.movementState === 'fishing');
    if ((cancelPressed && fishingWasActive)
      || (this.fishing?.active && this.movementState !== 'fishing')) {
      // Contact recovery can change movementState before the normal fishing branch runs.
      // Repair that split state immediately; Escape is sampled before any early return.
      this.exitFishing({ releasePointerLock: cancelPressed });
    }
    if (cancelPressed && this.benchSeat && !fishingWasActive) {
      // Escape from an active cast/song only cancels fishing. A second, deliberate Escape
      // while merely seated stands up, matching the click/X interaction path.
      this.clearBenchSeat();
      return;
    }
    if (this.updateContactRecovery(dt)) return;
    this.slideBraking = false;
    this.climbing.tickCooldown(dt, this.stamina, this.body.translation());
    const jumpPressed = this.input.consumeJump();
    const fishingToggle = this.input.consumeFishingToggle();
    const axes = this.input.getMoveAxes();
    // Probe even when Rapier refuses to call a >55° face 'grounded'. That closes the
    // classic bunny-hop loophole where repeatedly touching a steep slope can refresh a
    // jump without ever becoming a legal standing surface.
    const groundSurface = this.getGroundSurfaceInfo();
    const surfaceNearFeet = Boolean(groundSurface?.nearFeet);
    const onTooSteepSurface = Boolean(surfaceNearFeet
      && groundSurface.slopeDegrees > PLAYER_CONFIG.hardNoStandSlopeDegrees);
    const manualSlideRequested = Boolean(!this.benchSeat
      && this.input.slideHeld
      && surfaceNearFeet
      && groundSurface
      && groundSurface.slopeDegrees >= PLAYER_CONFIG.manualSlideMinimumSlopeDegrees);
    const slidingDownSlope = this.updateSlideState(dt, groundSurface, manualSlideRequested);
    const slideRecoveryActive = this.slideRecoveryTimer > 0;
    this.updateSlidePoseState(dt, slidingDownSlope);

    const inputLength = Math.hypot(axes.x, axes.z);
    const hasMoveInput = inputLength > 0.01;
    if (this.benchSeat && jumpPressed) {
      // Jump is the only movement binding that deliberately stands. WASD/arrows are rhythm
      // lanes while fishing and harmless while resting; sprint/slide cannot tear down the seat.
      this.clearBenchSeat();
      return;
    }
    const sitFishingCompatible = this.currentEmote?.id === 'sit'
      && (this.movementState === 'fishing' || fishingToggle);
    if (!this.benchSeat && this.currentEmote && (hasMoveInput || jumpPressed
      || (!sitFishingCompatible && fishingToggle)
      || this.input.sprintHeld || this.input.slideHeld || this.input.gripHeld
      || (!sitFishingCompatible && this.movementState !== 'grounded'))) {
      this.cancelEmote();
    }
    const footSupport = this.getFootSupportInfo();
    const stationaryContact = this.updateStationaryContactRecovery(dt, footSupport, hasMoveInput);
    // Stamina recovery should be a property of the player's physical footing, never of
    // camera motion. If Rapier considers us grounded on a legal non-slide slope, allow
    // recovery even when edge geometry makes the multi-ray support fraction fluctuate.
    const legalGroundSupport = Boolean(this.grounded
      && surfaceNearFeet
      && groundSurface?.slopeDegrees <= PLAYER_CONFIG.staminaMaximumSupportSlopeDegrees);
    if (!this.climbing.active && ['climbing', 'mantling'].includes(this.movementState)
      && (legalGroundSupport || footSupport.stable) && !hasMoveInput) {
      this.movementState = 'grounded';
    }
    const normalFootRecovery = Boolean(this.grounded
      && !slidingDownSlope
      && !slideRecoveryActive
      && (legalGroundSupport || footSupport.stable));
    const partialFootRecovery = isPartialFootRestEligible(footSupport, {
      movementState: this.movementState,
      actualSpeed: stationaryContact.actualSpeed,
      hasMoveInput,
      sprintHeld: this.input.sprintHeld,
      slideHeld: this.input.slideHeld,
      slidingDownSlope,
      slideRecoveryActive
    });
    const canRegenerateStamina = !slideRecoveryActive
      && (normalFootRecovery || partialFootRecovery || stationaryContact.ready);

    if (this.movementState === 'fishing'
      && (!this.fishing?.active || !this.fishing.canRemainActive?.())) {
      this.exitFishing();
    }

    if (this.movementState === 'fishing') {
      if (fishingToggle) {
        this.exitFishing();
      } else {
        this.sprinting = false;
        this.canGrip = false;
        this.horizontalVelocity.set(0, 0, 0);
        this.verticalVelocity = this.benchSeat ? 0 : (this.grounded ? -1.8 : this.verticalVelocity - PLAYER_CONFIG.gravity * dt);
        this.stamina.update(dt, false, false, canRegenerateStamina);
        this.fishing.update(dt, cameraAxes);
        if (this.benchSeat) this.holdSeatAnchor();
        else this.applyKinematicMovement({ x: 0, y: this.verticalVelocity * dt, z: 0 });
        return;
      }
    } else if (fishingToggle && this.fishing && this.grounded) {
      const zone = this.fishing.findNearbyZone();
      if (zone && this.fishing.enter(zone)) {
        if (this.currentEmote?.id === 'sit') this.sitFishingPausedAt = Date.now();
        this.resetSlideState();
        this.movementState = 'fishing';
        this.sprinting = false;
        this.canGrip = false;
        this.horizontalVelocity.set(0, 0, 0);
        this.verticalVelocity = -1.8;
        this.input.discardPrimaryEdges();
        return;
      }
    }
    if (this.benchSeat) {
      // A bench is an explicit click-to-toggle interaction. Keep the capsule planted while
      // seated; fishing remains available above, but stray movement keys cannot silently
      // tear down the seat state or slide the character through the bench.
      this.sprinting = false;
      this.canGrip = false;
      this.horizontalVelocity.set(0, 0, 0);
      this.verticalVelocity = 0;
      this.grounded = true;
      this.movementState = 'grounded';
      this.stamina.update(dt, false, false, canRegenerateStamina);
      this.holdSeatAnchor();
      return;
    }
    this.input.consumeForceBite();
    this.input.consumeDebugFish();
    this.input.discardPrimaryEdges();

    if (this.movementState === 'mantling') {
      const output = this.climbing.updateMantle(dt, this.body.translation());
      this.applyKinematicMovement(output.movement, { topOut: true, ignoreContactLock: true });
      if (output.type === 'mantleComplete') {
        this.clearContactMotionLock();
        this.grounded = true;
        this.movementState = 'grounded';
        this.verticalVelocity = -1.8;
      }
      return;
    }

    if (this.movementState === 'climbing') {
      const climbingGear = this.getClimbingEquipmentModifiers();
      const output = this.climbing.update(
        dt,
        this.body.translation(),
        axes,
        cameraAxes,
        this.input.gripHeld,
        jumpPressed,
        this.stamina,
        climbingGear.cost,
        climbingGear.slip
      );
      this.handleClimbingOutput(output, dt);
      return;
    }

    if (jumpPressed) {
      this.jumpBufferTimer = PLAYER_CONFIG.jumpBufferTime;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (this.grounded && !onTooSteepSurface && !slidingDownSlope) {
      this.coyoteTimer = PLAYER_CONFIG.coyoteTime;
    } else if (onTooSteepSurface || slidingDownSlope) {
      // A >55° face is never a legal bunny-hop launch pad. Manual sliding also
      // intentionally commits the player to the descent until the slide is released.
      this.coyoteTimer = 0;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    this.moveDirection.set(0, 0, 0);
    if (hasMoveInput) {
      const normalizedX = axes.x / Math.max(1, inputLength);
      const normalizedZ = axes.z / Math.max(1, inputLength);
      this.moveDirection
        .add(cameraAxes.right.clone().mulScalar(normalizedX))
        .add(cameraAxes.forward.clone().mulScalar(normalizedZ));
      this.moveDirection.y = 0;
      this.moveDirection.normalize();
    }

    // Ledge acquisition must run before the opposing-contact lock. Touching the lip is
    // exactly what can create the competing side/top contacts; allowing the lock to own that
    // frame made a valid jump visibly reach the shelf and then do nothing.
    if (this.tryAirborneTopOut(dt, hasMoveInput)) return;

    if (this.contactMotionLocked) {
      // The anti-jitter lock is allowed to kill *solver-created* oscillation, never player agency.
      // Jump/grip still break the lock immediately. Directional input gets one horizontal-only
      // kinematic escape attempt with gravity/slide disabled. If Rapier can make meaningful
      // progress in the requested direction we release the lock; if the capsule is still truly
      // pinched, the exact same transform is held and no alternating correction can appear.
      if (jumpPressed || this.input.gripHeld) {
        this.clearContactMotionLock();
      } else if (hasMoveInput) {
        const escapeSpeed = PLAYER_CONFIG.walkSpeed * .82;
        const desiredEscape = {
          x: this.moveDirection.x * escapeSpeed * dt,
          y: 0,
          z: this.moveDirection.z * escapeSpeed * dt
        };
        const escapeResult = this.applyKinematicMovement(desiredEscape, {
          ignoreContactLock: true,
          contactEscape: true,
          allowMomentumDeflect: false
        });
        const escaped = escapeResult.correctedMovement;
        const requestedLength = Math.hypot(desiredEscape.x, desiredEscape.z);
        const escapedLength = Math.hypot(escaped.x, escaped.z);
        const alignment = requestedLength > .0001 && escapedLength > .0001
          ? (desiredEscape.x * escaped.x + desiredEscape.z * escaped.z)
            / (requestedLength * escapedLength)
          : 0;
        if (escapedLength >= Math.max(.002, requestedLength * .08) && alignment > .1) {
          this.clearContactMotionLock();
          this.horizontalVelocity.set(escaped.x / Math.max(dt, .001), 0, escaped.z / Math.max(dt, .001));
          this.verticalVelocity = 0;
          this.movementState = this.grounded ? 'grounded' : 'airborne';
          return;
        }

        // A locked capsule is never allowed to become a permanent prison. If Rapier cannot find
        // any collision-limited escape for a short, deliberate movement input, roll back to the
        // most recent non-opposing-contact transform. This is a deterministic one-time recovery,
        // not a force that can alternate and recreate the old jitter.
        this.contactLockEscapeTimer += dt;
        if (this.contactLockEscapeTimer >= .14) {
          this.recoverFromContactTrap();
          return;
        }
        this.freezeContactMotion();
        return;
      } else {
        this.contactLockEscapeTimer = 0;
        this.freezeContactMotion();
        return;
      }
    }

    // Space is always an escape option during a slide, even at zero stamina. It costs
    // only a little stamina when any remains, and preserves a small outward component so
    // a capsule wedged against a downhill rock can actually separate from the surface.
    if (slidingDownSlope && jumpPressed && groundSurface) {
      this.performSlidePushOff(groundSurface, hasMoveInput);
      this.applyKinematicMovement({
        x: this.horizontalVelocity.x * dt,
        y: this.verticalVelocity * dt,
        z: this.horizontalVelocity.z * dt
      }, { allowMomentumDeflect: true });
      return;
    }

    const facingDirection = hasMoveInput
      ? this.moveDirection
      : this.getFacingDirection();
    this.gripCandidate = this.climbing.canAttemptGrip(this.stamina)
      ? this.climbing.findGrip(this.body.translation(), facingDirection)
      : null;
    this.canGrip = this.gripCandidate !== null;

    if (this.input.gripHeld && this.gripCandidate) {
      const incomingVelocity = new pc.Vec3(
        this.horizontalVelocity.x,
        this.verticalVelocity,
        this.horizontalVelocity.z
      );
      this.climbing.begin(this.gripCandidate, incomingVelocity);
      this.resetSlideState();
      this.movementState = 'climbing';
      this.canGrip = false;
      this.sprinting = false;
      this.horizontalVelocity.set(0, 0, 0);
      this.verticalVelocity = 0;
      const climbingGear = this.getClimbingEquipmentModifiers();
      const output = this.climbing.update(
        dt,
        this.body.translation(),
        axes,
        cameraAxes,
        true,
        false,
        this.stamina,
        climbingGear.cost,
        climbingGear.slip
      );
      this.handleClimbingOutput(output, dt);
      return;
    }

    // Holding Grip on the ungrippable mountain core while already sliding acts as a
    // brake, not a climb. Actual registered rocks still win above and enter climbing.
    // This gives the player emergency slide control without making core climbability
    // visually ambiguous.
    const slideBrake = Boolean(slidingDownSlope && this.input.gripHeld && this.stamina.value > 0);
    this.slideBraking = slideBrake;

    this.sprinting = this.stamina.update(
      dt,
      (slidingDownSlope || slideRecoveryActive) ? false : this.input.sprintHeld,
      slidingDownSlope || slideRecoveryActive || hasMoveInput,
      canRegenerateStamina,
      this.normalStaminaCostMultiplier('sprintDrain')
    );

    let targetSpeed = this.sprinting
      ? PLAYER_CONFIG.sprintSpeed * (this.progression?.getModifier('sprintSpeedMultiplier') ?? 1)
      : PLAYER_CONFIG.walkSpeed;
    let acceleration = this.grounded
      ? (hasMoveInput ? PLAYER_CONFIG.groundAcceleration : PLAYER_CONFIG.groundDeceleration)
      : (hasMoveInput ? PLAYER_CONFIG.airAcceleration : PLAYER_CONFIG.airDeceleration);
    let targetX = this.moveDirection.x * (hasMoveInput ? targetSpeed : 0);
    let targetZ = this.moveDirection.z * (hasMoveInput ? targetSpeed : 0);
    let slideVerticalTarget = null;

    if (slideRecoveryActive && groundSurface?.downhill.lengthSq() > 0.0001) {
      // After a sustained jam, temporarily stop forcing the downhill slide vector and
      // favor contour movement around the blocking rock. Uphill input is intentionally
      // discarded, so this cannot be used to walk/bunny-hop up a >55° face.
      const downhill = groundSurface.downhill.clone().normalize();
      const tangent = new pc.Vec3(-downhill.z, 0, downhill.x).normalize();
      let lateralIntent = hasMoveInput ? clamp(this.moveDirection.dot(tangent), -1, 1) : 0;
      if (Math.abs(lateralIntent) < .12) {
        lateralIntent = (this.slideAvoidanceSide || 1)
          * PLAYER_CONFIG.slideRecoveryAutoSideIntent;
      }
      const downhillIntent = hasMoveInput
        ? Math.max(0, clamp(this.moveDirection.dot(downhill), -1, 1))
        : 0;
      const recoveryDirection = tangent.clone().mulScalar(lateralIntent)
        .add(downhill.clone().mulScalar(downhillIntent * .34));
      if (recoveryDirection.lengthSq() > 0.0001) recoveryDirection.normalize();
      targetSpeed = PLAYER_CONFIG.slideRecoveryControlSpeed;
      acceleration = PLAYER_CONFIG.slideRecoveryAcceleration;
      targetX = recoveryDirection.x * targetSpeed;
      targetZ = recoveryDirection.z * targetSpeed;
    } else if (slidingDownSlope && groundSurface?.slideDirection.lengthSq() > 0.0001) {
      const slopeDegrees = groundSurface.slopeDegrees;
      const manualSteepness = clamp(
        (slopeDegrees - PLAYER_CONFIG.manualSlideMinimumSlopeDegrees)
        / (70 - PLAYER_CONFIG.manualSlideMinimumSlopeDegrees), 0, 1
      );
      targetSpeed = lerp(
        PLAYER_CONFIG.manualSlideMinimumSpeed,
        PLAYER_CONFIG.manualSlideMaximumSpeed,
        manualSteepness
      );
      if (onTooSteepSurface) {
        const forcedSteepness = clamp(
          (slopeDegrees - PLAYER_CONFIG.hardNoStandSlopeDegrees)
          / (82 - PLAYER_CONFIG.hardNoStandSlopeDegrees), 0, 1
        );
        targetSpeed = Math.max(targetSpeed, lerp(
          PLAYER_CONFIG.forcedSteepSlideSpeed,
          PLAYER_CONFIG.forcedSteepSlideMaximumSpeed,
          forcedSteepness
        ));
      }

      const slideDirection = groundSurface.slideDirection.clone();
      if (slideBrake) {
        this.stamina.spend(PLAYER_CONFIG.slideBrakeDrainPerSecond * dt
          * this.normalStaminaCostMultiplier('slideCostMultiplier'));
        targetSpeed *= PLAYER_CONFIG.slideBrakeSpeedMultiplier;
      }
      // Directional input while sliding is steering, never uphill propulsion. Project
      // the requested move onto the contour tangent, so W cannot erase the mandatory
      // downhill component. Grip increases that steering authority while also braking.
      if (hasMoveInput) {
        const tangent = new pc.Vec3(-groundSurface.downhill.z, 0, groundSurface.downhill.x);
        if (tangent.lengthSq() > 0.0001) {
          tangent.normalize();
          const lateralIntent = clamp(this.moveDirection.dot(tangent), -1, 1);
          const steering = slideBrake
            ? PLAYER_CONFIG.slideControlStrength
            : PLAYER_CONFIG.slideControlStrength * .42;
          slideDirection.add(tangent.mulScalar(lateralIntent * steering));
          slideDirection.normalize();
        }
      }
      // Before fully declaring a jam, bias the slide toward the side with more clearance.
      // This solves many glancing collisions without ever leaving normal slide physics.
      if (this.slideJamTimer >= PLAYER_CONFIG.slideJamSteerDelay) {
        if (this.slideAvoidanceSide === 0) {
          this.slideAvoidanceSide = this.chooseSlideAvoidanceSide(groundSurface);
        }
        const tangent = new pc.Vec3(-groundSurface.downhill.z, 0, groundSurface.downhill.x);
        if (tangent.lengthSq() > 0.0001) {
          tangent.normalize().mulScalar(
            this.slideAvoidanceSide * PLAYER_CONFIG.slideJamSteerStrength
          );
          slideDirection.add(tangent).normalize();
        }
      }

      acceleration = PLAYER_CONFIG.slideAcceleration;
      targetX = slideDirection.x * targetSpeed;
      targetZ = slideDirection.z * targetSpeed;
      slideVerticalTarget = slideDirection.y * targetSpeed;
    }
    this.horizontalVelocity.x = moveToward(
      this.horizontalVelocity.x,
      targetX,
      acceleration * dt
    );
    this.horizontalVelocity.z = moveToward(
      this.horizontalVelocity.z,
      targetZ,
      acceleration * dt
    );

    if (slidingDownSlope && slideVerticalTarget !== null) {
      this.verticalVelocity = moveToward(
        this.verticalVelocity,
        Math.max(-PLAYER_CONFIG.terminalVelocity, slideVerticalTarget),
        PLAYER_CONFIG.slideAcceleration * 1.25 * dt
      );
    } else if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = -1.8;
    } else {
      this.verticalVelocity = Math.max(
        -PLAYER_CONFIG.terminalVelocity,
        this.verticalVelocity - PLAYER_CONFIG.gravity * dt
      );
    }

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !onTooSteepSurface && !slidingDownSlope
        && this.stamina.value >= PLAYER_CONFIG.jumpStaminaCost * this.normalStaminaCostMultiplier('jumpCostMultiplier')) {
      this.stamina.spend(PLAYER_CONFIG.jumpStaminaCost * this.normalStaminaCostMultiplier('jumpCostMultiplier'));
      this.verticalVelocity = PLAYER_CONFIG.jumpSpeed * (this.progression?.getModifier('jumpImpulseMultiplier') ?? 1);
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.grounded = false;
    }

    const desiredMovement = {
      x: this.horizontalVelocity.x * dt,
      y: this.verticalVelocity * dt,
      z: this.horizontalVelocity.z * dt
    };
    const movementResult = this.applyKinematicMovement(
      desiredMovement,
      { allowMomentumDeflect: true }
    );
    if (slidingDownSlope) {
      this.updateSlideJamState(dt, desiredMovement, movementResult, groundSurface);
    } else if (!slideRecoveryActive) {
      this.slideJamTimer = Math.max(0, this.slideJamTimer - dt * 3);
    }
    const releasedForJamRecovery = this.slideRecoveryTimer > 0;
    this.movementState = (slidingDownSlope && !releasedForJamRecovery)
      ? 'sliding'
      : (this.grounded ? 'grounded' : 'airborne');
  }

  canMomentumDeflectOverLowObstacle(direction) {
    if (direction.lengthSq() < 0.0001) return false;
    const position = this.body.translation();
    const flat = direction.clone();
    flat.y = 0;
    if (flat.lengthSq() < 0.0001) return false;
    flat.normalize();
    const footY = position.y - PLAYER_FOOT_OFFSET;
    const maxDistance = PLAYER_CONFIG.radius + .72;
    const castAtHeight = (height) => {
      const ray = new this.RAPIER.Ray(
        { x: position.x, y: footY + height, z: position.z },
        { x: flat.x, y: 0, z: flat.z }
      );
      return this.physicsWorld.castRay(
        ray, maxDistance, true, undefined, undefined, this.collider
      );
    };
    // A low hit plus clear space above it is a toe/shin obstacle. A full-height wall
    // fails this test and therefore does not become a wall-bounce exploit.
    return Boolean(castAtHeight(.16)) && !castAtHeight(.82);
  }

  applyKinematicMovement(desiredMovement, options = {}) {
    this.controller.computeColliderMovement(this.collider, desiredMovement);
    const computedMovement = this.controller.computedMovement();
    const computedGrounded = this.controller.computedGrounded();
    const currentCollisionNormals = [];
    for (let index = 0; index < this.controller.numComputedCollisions(); index += 1) {
      const collision = this.controller.computedCollision(index);
      if (collision?.normal1) currentCollisionNormals.push(collision.normal1);
    }
    const collisionNormals = [...currentCollisionNormals];
    if (this.sideCollisionMemoryFrames > 0 && this.lastSideCollisionNormal) {
      collisionNormals.push(this.lastSideCollisionNormal);
    }

    const stabilizedMovement = stabilizeWedgeMovement(
      desiredMovement,
      computedMovement,
      collisionNormals
    );
    // A player-requested escape from an already frozen contact is different from ordinary
    // locomotion: keep Rapier's collision-limited horizontal slide, forcibly delete all Y
    // correction, and let the caller decide whether that is enough progress to unlock. Running
    // the full wedge stabilizer here would zero even a valid 10-50% escape step and recreate the
    // 6.9.2 "perfectly stable but impossible to move" failure.
    const correctedMovement = options.topOut
      ? {
          x: computedMovement.x,
          y: computedMovement.y,
          z: computedMovement.z,
          stabilized: false,
          opposingContacts: false,
          blocked: false
        }
      : options.contactEscape
      ? {
          x: computedMovement.x,
          y: 0,
          z: computedMovement.z,
          stabilized: false,
          opposingContacts: stabilizedMovement.opposingContacts,
          blocked: stabilizedMovement.blocked
        }
      : stabilizedMovement;
    const currentSideNormal = currentCollisionNormals.find((normal) => Math.hypot(normal.x, normal.z) > .35);
    if (currentSideNormal) {
      this.lastSideCollisionNormal = { x: currentSideNormal.x, y: currentSideNormal.y, z: currentSideNormal.z };
      this.sideCollisionMemoryFrames = 3;
    } else {
      this.sideCollisionMemoryFrames = Math.max(0, this.sideCollisionMemoryFrames - 1);
      if (!this.sideCollisionMemoryFrames) this.lastSideCollisionNormal = null;
    }

    const hasSideContact = collisionNormals.some((normal) => Math.hypot(normal.x, normal.z) > .35);
    const groundStateFlipped = computedGrounded !== this.grounded;
    if (hasSideContact && groundStateFlipped) this.contactStateFlipCount += 1;
    else this.contactStateFlipCount = Math.max(0, this.contactStateFlipCount - 1);

    // Look at collision correction, not requested gravity. A meaningful Y correction that flips
    // sign on adjacent frames is the exact impossible "one way / the other way / one way" motion
    // we want to ban. Tiny ordinary ground-snap noise stays below this threshold.
    const correctionY = computedMovement.y - desiredMovement.y;
    const verticalCorrectionReversed = hasSideContact
      && Math.abs(correctionY) > .012
      && Math.abs(this.lastCollisionCorrectionY) > .012
      && correctionY * this.lastCollisionCorrectionY < 0;
    this.lastCollisionCorrectionY = correctionY;

    const shouldHardLock = !options.topOut && (correctedMovement.stabilized
      || (verticalCorrectionReversed && correctedMovement.opposingContacts)
      || (correctedMovement.opposingContacts && hasSideContact && this.contactStateFlipCount >= 2));

    this.wedgeContactStabilized = correctedMovement.stabilized || shouldHardLock;
    if (shouldHardLock && !options.ignoreContactLock) {
      const supportedByCollision = currentCollisionNormals.some((normal) => normal.y > .35);
      this.engageContactMotionLock(this.grounded || computedGrounded || supportedByCollision);
      const currentPosition = this.body.translation();
      this.body.setNextKinematicTranslation({
        x: currentPosition.x,
        y: currentPosition.y,
        z: currentPosition.z
      });
      return {
        correctedMovement: { x: 0, y: 0, z: 0 },
        wedgeContactStabilized: true,
        contactMotionLocked: true
      };
    }

    const currentPosition = this.body.translation();
    const nextPosition = {
      x: currentPosition.x + correctedMovement.x,
      y: currentPosition.y + correctedMovement.y,
      z: currentPosition.z + correctedMovement.z
    };
    this.body.setNextKinematicTranslation(nextPosition);

    // Maintain two recovery anchors. The recent non-opposing point keeps normal one-wall
    // sliding usable; the contact-free point is stronger and is preferred when a true trap
    // needs a deterministic rollback.
    if (!correctedMovement.opposingContacts && !correctedMovement.stabilized && !options.contactEscape) {
      this.lastUnwedgedPosition.set(nextPosition.x, nextPosition.y, nextPosition.z);
      if (!hasSideContact) this.lastContactFreePosition.set(nextPosition.x, nextPosition.y, nextPosition.z);
    }

    this.wasGrounded = this.grounded;
    this.grounded = computedGrounded;
    if (this.grounded && desiredMovement.y < 0 && correctedMovement.y > desiredMovement.y * 0.25) {
      this.verticalVelocity = -1.8;
    }

    if (options.allowMomentumDeflect && this.momentumDeflectCooldown <= 0) {
      const desiredHorizontal = Math.hypot(desiredMovement.x, desiredMovement.z);
      const correctedHorizontal = Math.hypot(correctedMovement.x, correctedMovement.z);
      const speed = Math.hypot(this.horizontalVelocity.x, this.horizontalVelocity.z);
      const blockedRatio = desiredHorizontal > 0.0001 ? correctedHorizontal / desiredHorizontal : 1;
      const direction = new pc.Vec3(this.horizontalVelocity.x, 0, this.horizontalVelocity.z);
      if (speed >= PLAYER_CONFIG.momentumDeflectMinimumSpeed
        && desiredHorizontal > .01
        && blockedRatio < PLAYER_CONFIG.momentumDeflectBlockedRatio
        && this.canMomentumDeflectOverLowObstacle(direction)) {
        this.horizontalVelocity.mulScalar(PLAYER_CONFIG.momentumDeflectRetention);
        this.verticalVelocity = Math.max(this.verticalVelocity, PLAYER_CONFIG.momentumDeflectUpSpeed);
        this.grounded = false;
        this.momentumDeflectCooldown = .18;
      }
    }

    return {
      correctedMovement: {
        x: correctedMovement.x,
        y: correctedMovement.y,
        z: correctedMovement.z
      },
      wedgeContactStabilized: correctedMovement.stabilized,
      contactMotionLocked: this.contactMotionLocked
    };
  }

  tryAirborneTopOut(dt, hasMoveInput) {
    if (this.grounded || !hasMoveInput
      || this.verticalVelocity < CLIMBING_CONFIG.mantleAirMinimumVerticalSpeed
      || this.movementState !== 'airborne') return false;
    const target = this.climbing.findAirMantleTarget(this.body.translation(), this.moveDirection);
    if (!target) return false;
    this.clearContactMotionLock();
    this.climbing.startMantle(this.body.translation(), target, this.moveDirection);
    this.resetSlideState();
    this.movementState = 'mantling';
    this.sprinting = false;
    this.canGrip = false;
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    const output = this.climbing.updateMantle(dt, this.body.translation());
    this.applyKinematicMovement(output.movement, { topOut: true, ignoreContactLock: true });
    return true;
  }

  handleClimbingOutput(output, dt) {
    this.canGrip = false;
    this.sprinting = false;

    if (output.type === 'climbing') {
      this.verticalVelocity = 0;
      this.horizontalVelocity.set(0, 0, 0);
      this.grounded = false;
      this.movementState = 'climbing';
      this.applyKinematicMovement(output.movement);
      return;
    }

    if (output.type === 'mantleStart') {
      this.verticalVelocity = 0;
      this.horizontalVelocity.set(0, 0, 0);
      this.resetSlideState();
      this.movementState = 'mantling';
      return;
    }

    if (output.type === 'landed') {
      this.verticalVelocity = -1.8;
      this.horizontalVelocity.set(0, 0, 0);
      this.movementState = 'grounded';
      this.applyKinematicMovement({ x: 0, y: -0.02, z: 0 });
      return;
    }

    this.movementState = 'airborne';
    if (output.type === 'pushOff') {
      this.horizontalVelocity.set(
        output.pushVelocity.x,
        0,
        output.pushVelocity.z
      );
      this.verticalVelocity = output.pushVelocity.y;
    } else {
      this.horizontalVelocity.set(
        this.climbing.lastClimbVelocity.x * 0.45,
        0,
        this.climbing.lastClimbVelocity.z * 0.45
      );
      this.verticalVelocity = Math.min(2.2, this.climbing.lastClimbVelocity.y * 0.55);
    }
    this.applyKinematicMovement({
      x: this.horizontalVelocity.x * dt,
      y: this.verticalVelocity * dt,
      z: this.horizontalVelocity.z * dt
    });
  }

  getFacingDirection() {
    const yaw = this.facingYaw * Math.PI / 180;
    return new pc.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  faceDirection(direction, dt) {
    const desiredYaw = Math.atan2(-direction.x, -direction.z) * 180 / Math.PI;
    this.facingYaw += shortestAngleDelta(this.facingYaw, desiredYaw) * (1 - Math.exp(-12 * dt));
  }

  afterPhysics(dt) {
    const position = this.body.translation();
    const fatal = this.surfaceRegistry.isFatalPosition
      ? this.surfaceRegistry.isFatalPosition(position)
      : position.y < PLAYER_CONFIG.respawnHeight;
    if (fatal) {
      if (this.runManager) this.runManager.endRun('fall');
      else this.respawn();
      return;
    }
    if (this.movementState === 'fishing' && !this.grounded && !this.benchSeat) {
      this.exitFishing();
    }
    if (this.movementState !== 'climbing'
      && this.movementState !== 'mantling'
      && this.movementState !== 'fishing'
      && this.movementState !== 'sliding') {
      this.movementState = this.grounded ? 'grounded' : 'airborne';
    }
    this.syncVisual(dt);
  }

  syncVisual(dt, snap = false) {
    const position = this.body.translation();
    this.entity.setPosition(position.x, position.y, position.z);
    this.lastSpeed = Math.hypot(this.horizontalVelocity.x, this.horizontalVelocity.z);

    if (this.movementState === 'climbing' || this.movementState === 'mantling') {
      const inward = this.climbing.surfaceNormal.clone().mulScalar(-1);
      const desiredYaw = Math.atan2(-inward.x, -inward.z) * 180 / Math.PI;
      const turnAmount = snap ? 1 : 1 - Math.exp(-18 * dt);
      this.facingYaw += shortestAngleDelta(this.facingYaw, desiredYaw) * turnAmount;
    } else if (this.lastSpeed > 0.2) {
      const desiredYaw = Math.atan2(-this.horizontalVelocity.x, -this.horizontalVelocity.z) * 180 / Math.PI;
      const turnAmount = snap ? 1 : 1 - Math.exp(-14 * dt);
      this.facingYaw += shortestAngleDelta(this.facingYaw, desiredYaw) * turnAmount;
    }
    this.entity.setEulerAngles(0, this.facingYaw, 0);

    const climbMotion = this.movementState === 'climbing'
      ? Math.min(this.climbing.lastClimbVelocity.length() / CLIMBING_CONFIG.climbSpeed, 1)
      : 0;
    this.motionTime += dt * (0.45 + this.lastSpeed + climbMotion * 3);
    const slidingPhysics = this.movementState === 'sliding';
    const slidingPose = slidingPhysics && this.slidePoseActive;
    const groundedMotion = this.grounded && !slidingPose
      ? Math.min(this.lastSpeed / PLAYER_CONFIG.walkSpeed, 1.4) : 0;
    const bob = Math.sin(this.motionTime * 1.7) * 0.035 * groundedMotion;
    const lean = Math.min(this.lastSpeed * 1.25, 8);
    this.visualRoot.setLocalPosition(
      0,
      PLAYER_VISUAL_GROUND_OFFSET + bob - (slidingPose ? .11 : 0)
        - (this.currentEmote?.id === 'sit' || this.benchSeat ? .42 : 0),
      0
    );
    this.visualRoot.setLocalEulerAngles(
      (this.movementState === 'climbing' || this.movementState === 'mantling')
        ? -7
        : slidingPose ? 24 : lean,
      0,
      this.movementState === 'climbing'
        ? Math.sin(this.motionTime * 1.4) * 2
        : slidingPose ? (this.slideBraking ? -7 : -3)
          : Math.sin(this.motionTime * 0.85) * groundedMotion
    );

    this.applyCharacterPose(groundedMotion, slidingPose);
    this.updateInventorySpecimenPose();
    this.updateHeldEquipmentPose();
  }

  applyCharacterPose(groundedMotion, slidingPose = false) {
    const left = this.leftLimb;
    const right = this.rightLimb;
    const stride = Math.sin(this.motionTime * 1.8);
    let leftShoulder = 0;
    let rightShoulder = 0;
    let leftElbow = 0;
    let rightElbow = 0;
    let leftHip = 0;
    let rightHip = 0;
    let leftKnee = 0;
    let rightKnee = 0;
    let leftArmRoll = -8;
    let rightArmRoll = 8;

    if (this.currentEmote && this.movementState === 'grounded') {
      const phase = (Date.now() - this.currentEmote.startedAt) / 1000;
      if (this.currentEmote.id === 'wave') {
        rightShoulder = 145;
        rightElbow = -38;
        rightArmRoll = -34 + Math.sin(phase * 8) * 24;
        leftElbow = -8;
      } else if (this.currentEmote.id === 'point') {
        rightShoulder = 88;
        rightElbow = 2;
        rightArmRoll = -10;
        leftElbow = -8;
      } else if (this.currentEmote.id === 'cheer') {
        leftShoulder = 148 + Math.sin(phase * 7) * 10;
        rightShoulder = 148 - Math.sin(phase * 7) * 10;
        leftElbow = -18;
        rightElbow = -18;
        leftArmRoll = -22;
        rightArmRoll = 22;
      } else if (this.currentEmote.id === 'clap') {
        // Smooth open -> contact -> open cycles. Most of the visible travel comes from the
        // shoulders/roll, while the elbows fold slightly at contact so the hands meet in front.
        const contact = (1 - Math.cos(phase * Math.PI * 2 * 1.7)) * .5;
        leftShoulder = 72 + contact * 14;
        rightShoulder = 72 + contact * 14;
        leftElbow = -54 - contact * 24;
        rightElbow = -54 - contact * 24;
        leftArmRoll = -30 - contact * 38;
        rightArmRoll = 30 + contact * 38;
      } else if (this.currentEmote.id === 'sit') {
        leftShoulder = -8;
        rightShoulder = -8;
        leftElbow = -18;
        rightElbow = -18;
        leftHip = 74;
        rightHip = 74;
        leftKnee = -88;
        rightKnee = -88;
      } else if (this.currentEmote.id === 'dance') {
        const swing = Math.sin(phase * 6.5);
        leftShoulder = 72 + swing * 48;
        rightShoulder = 72 - swing * 48;
        leftElbow = -32;
        rightElbow = -32;
        leftHip = -swing * 28;
        rightHip = swing * 28;
        leftKnee = -12 - Math.max(0, swing) * 30;
        rightKnee = -12 - Math.max(0, -swing) * 30;
      }
    } else if (this.movementState === 'fishing' && this.fishing?.state === 'caught') {
      leftShoulder = 118;
      rightShoulder = 118;
      leftElbow = -25;
      rightElbow = -25;
      leftArmRoll = -20;
      rightArmRoll = 20;
    } else if (this.movementState === 'fishing') {
      leftShoulder = 92;
      rightShoulder = 105;
      leftElbow = -35;
      rightElbow = -42;
      leftArmRoll = -14;
      rightArmRoll = 18;
    } else if (this.movementState === 'climbing') {
      const reach = Math.sin(this.motionTime * 2.15);
      leftShoulder = 132 + reach * 24;
      rightShoulder = 132 - reach * 24;
      leftElbow = -18 + Math.max(0, -reach) * 32;
      rightElbow = -18 + Math.max(0, reach) * 32;
      leftHip = 18 + reach * 20;
      rightHip = 18 - reach * 20;
      leftKnee = -34 + Math.max(0, reach) * 22;
      rightKnee = -34 + Math.max(0, -reach) * 22;
      leftArmRoll = -16;
      rightArmRoll = 16;
    } else if (this.movementState === 'mantling') {
      leftShoulder = 148;
      rightShoulder = 148;
      leftElbow = -28;
      rightElbow = -28;
      leftHip = 42;
      rightHip = 20;
      leftKnee = -64;
      rightKnee = -36;
    } else if (slidingPose) {
      // Low, feet-forward slope posture. Physics may already be sliding, but this full
      // pose is deliberately delayed so transient contacts do not visually snap the rig.
      leftShoulder = this.slideBraking ? 76 : 42;
      rightShoulder = this.slideBraking ? 76 : -18;
      leftElbow = -38;
      rightElbow = -38;
      leftHip = 64;
      rightHip = 58;
      leftKnee = -82;
      rightKnee = -76;
      leftArmRoll = -28;
      rightArmRoll = 28;
    } else if (this.movementState === 'sliding') {
      // First quarter-second of a real slide: stay mostly upright/braced rather than popping
      // immediately into the full feet-forward pose.
      leftShoulder = -10;
      rightShoulder = -10;
      leftElbow = -16;
      rightElbow = -16;
      leftHip = 18;
      rightHip = 14;
      leftKnee = -26;
      rightKnee = -22;
      leftArmRoll = -14;
      rightArmRoll = 14;
    } else if (!this.grounded) {
      leftShoulder = -28;
      rightShoulder = -28;
      leftElbow = -20;
      rightElbow = -20;
      leftHip = 18;
      rightHip = -12;
      leftKnee = -30;
      rightKnee = -12;
      leftArmRoll = -22;
      rightArmRoll = 22;
    } else if (this.heldInventorySpecimen || this.heldEquipmentItem) {
      leftShoulder = stride * 12;
      rightShoulder = 52;
      leftElbow = -8;
      rightElbow = -58;
      rightArmRoll = 19;
      leftHip = -stride * (this.sprinting ? 38 : 24);
      rightHip = stride * (this.sprinting ? 38 : 24);
    } else if (groundedMotion > 0.03) {
      const strideSize = this.sprinting ? 48 : 32;
      leftShoulder = stride * strideSize;
      rightShoulder = -stride * strideSize;
      leftHip = -stride * strideSize;
      rightHip = stride * strideSize;
      leftElbow = -12 - Math.max(0, stride) * 20;
      rightElbow = -12 - Math.max(0, -stride) * 20;
      leftKnee = -8 - Math.max(0, stride) * 34;
      rightKnee = -8 - Math.max(0, -stride) * 34;
    } else {
      const breathe = Math.sin(this.motionTime * 0.8) * 3;
      leftShoulder = breathe;
      rightShoulder = -breathe;
      leftElbow = -7;
      rightElbow = -7;
    }

    if ((this.benchSeat || this.currentEmote?.id === 'sit') && ['grounded', 'fishing'].includes(this.movementState)) {
      // Preserve the seated lower-body pose while fishing arms/catch presentation runs.
      leftHip = 74;
      rightHip = 74;
      leftKnee = -88;
      rightKnee = -88;
    }

    left.shoulder.setLocalEulerAngles(leftShoulder, 0, leftArmRoll);
    right.shoulder.setLocalEulerAngles(rightShoulder, 0, rightArmRoll);
    left.elbow.setLocalEulerAngles(leftElbow, 0, 0);
    right.elbow.setLocalEulerAngles(rightElbow, 0, 0);
    left.hip.setLocalEulerAngles(leftHip, 0, 0);
    right.hip.setLocalEulerAngles(rightHip, 0, 0);
    left.knee.setLocalEulerAngles(leftKnee, 0, 0);
    right.knee.setLocalEulerAngles(rightKnee, 0, 0);
    this.applyBlobPose({ leftShoulder, rightShoulder, leftHip, rightHip, groundedMotion, slidingPose });
  }

  applyBlobPose({ leftShoulder, rightShoulder, leftHip, rightHip, groundedMotion, slidingPose }) {
    if (!this.blobRig) return;
    const bounce = this.grounded
      ? Math.abs(Math.sin(this.motionTime * 1.8)) * .055 * groundedMotion
      : -.035;
    const breathe = Math.sin(this.motionTime * .8) * .018;
    const squash = slidingPose ? .86 : 1 + breathe - bounce * .35;
    this.blobRig.setLocalScale(1 + bounce * .42, squash, 1 + bounce * .28);
  }

  respawn() {
    this.teleport(this.spawnPoint, this.facingYaw);
  }

  teleport(position, facingYaw = this.facingYaw) {
    this.cancelEmote();
    this.benchSeat = null;
    const spawn = this.resolveSafeSpawn(position, facingYaw);
    this.body.setTranslation(spawn, true);
    this.body.setNextKinematicTranslation(spawn);
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.momentumDeflectCooldown = 0;
    this.resetSlideState();
    this.stationaryContactTimer = 0;
    this.lastSideCollisionNormal = null;
    this.sideCollisionMemoryFrames = 0;
    this.wedgeContactStabilized = false;
    // Hard contact lock: once the controller starts alternating incompatible rock-contact
    // solutions, freeze the capsule at one exact transform. This makes visible high-frequency
    // reversal physically impossible instead of trying to visually smooth it afterward.
    this.contactMotionLocked = false;
    this.contactLockGrounded = false;
    this.contactStateFlipCount = 0;
    this.lastCollisionCorrectionY = 0;
    this.contactLockEscapeTimer = 0;
    this.contactRecovery = null;
    this.lastUnwedgedPosition.set(spawn.x, spawn.y, spawn.z);
    this.lastContactFreePosition.set(spawn.x, spawn.y, spawn.z);
    this.stationaryProbePosition.set(spawn.x, spawn.y, spawn.z);
    this.stamina.reset();
    this.climbing.detach(0);
    this.climbing.clearTransferProtection();
    this.exitFishing();
    this.movementState = 'airborne';
    this.canGrip = false;
    this.facingYaw = facingYaw;
    this.input.endRhythmCapture();
    this.input.resetPrimary();
    this.syncVisual(0, true);
  }

  setSpawnPoint(position) {
    this.spawnPoint = this.resolveSafeSpawn(position, this.facingYaw);
  }

  isSpawnCapsuleSafe(position) {
    if (!this.safeSpawnCapsuleShape) return true;
    let blocked = false;
    this.physicsWorld.intersectionsWithShape(
      position,
      { x: 0, y: 0, z: 0, w: 1 },
      this.safeSpawnCapsuleShape,
      () => {
        blocked = true;
        return false;
      },
      undefined,
      undefined,
      this.collider
    );
    if (blocked) return false;
    const ray = new this.RAPIER.Ray(
      { x: position.x, y: position.y + .1, z: position.z },
      { x: 0, y: -1, z: 0 }
    );
    const hit = this.physicsWorld.castRayAndGetNormal(
      ray,
      PLAYER_FOOT_OFFSET + .85,
      true,
      undefined,
      undefined,
      this.collider
    );
    return Boolean(hit && hit.normal.y >= Math.cos(PLAYER_CONFIG.maxSlopeDegrees * Math.PI / 180));
  }

  resolveSafeSpawn(position, facingYaw = 0) {
    const anchor = { x: Number(position?.x) || 0, y: Number(position?.y) || 0, z: Number(position?.z) || 0 };
    if (!this.safeSpawnCapsuleShape) return anchor;
    const yaw = facingYaw * Math.PI / 180;
    const offsets = [
      [0, 0, 0], [0, .85, 0], [0, -.85, 0], [.85, 0, 0], [-.85, 0, 0],
      [.9, .9, .12], [-.9, .9, .12], [.9, -.9, .12], [-.9, -.9, .12],
      [0, 1.65, .25], [0, -1.65, .25], [1.65, 0, .25], [-1.65, 0, .25],
      [0, 0, .4]
    ];
    for (const [right, forward, up] of offsets) {
      const candidate = {
        x: anchor.x + Math.cos(yaw) * right + Math.sin(yaw) * forward,
        y: anchor.y + up,
        z: anchor.z - Math.sin(yaw) * right + Math.cos(yaw) * forward
      };
      if (!this.isSpawnCapsuleSafe(candidate)) continue;
      this.lastSafeSpawnResolution = { anchor, resolved: candidate };
      return candidate;
    }
    this.lastSafeSpawnResolution = { anchor, resolved: anchor, fallbackExhausted: true };
    return anchor;
  }

  getPosition() {
    return this.body.translation();
  }

  setBenchSeat(interaction) {
    if (!interaction?.seatPosition || !interaction?.id) return false;
    this.teleport(interaction.seatPosition, interaction.facingYaw);
    this.benchSeat = {
      id: interaction.id,
      seatPosition: { ...interaction.seatPosition },
      exitPosition: interaction.exitPosition ? { ...interaction.exitPosition } : null,
      facingYaw: interaction.facingYaw,
      seatKind: interaction.seatKind ?? (interaction.action === 'bench' ? 'bench' : 'seat')
    };
    this.grounded = true;
    this.movementState = 'grounded';
    this.verticalVelocity = 0;
    return true;
  }

  holdSeatAnchor() {
    const seat = this.benchSeat;
    if (!seat?.seatPosition) return false;
    this.body.setNextKinematicTranslation(seat.seatPosition);
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.facingYaw = seat.facingYaw;
    return true;
  }

  clearBenchSeat() {
    const seat = this.benchSeat;
    if (!seat) return false;
    this.exitFishing();
    this.benchSeat = null;
    this.cancelEmote();
    if (seat.exitPosition) this.teleport(seat.exitPosition, seat.facingYaw);
    return true;
  }

  canStartEmote() {
    return this.grounded && this.movementState === 'grounded' && !this.fishing?.active
      && !this.slideActive && this.lastSpeed <= .2;
  }

  startEmote(id, startedAt = Date.now()) {
    if (!this.canStartEmote() || !EMOTE_IDS.includes(id)) return false;
    this.currentEmote = normalizeEmote({ id, startedAt });
    return Boolean(this.currentEmote);
  }

  cancelEmote() {
    const active = Boolean(this.currentEmote);
    this.currentEmote = null;
    this.sitFishingPausedAt = null;
    return active;
  }

  updateEmote(now = Date.now()) {
    if (!this.currentEmote) return;
    if (this.currentEmote.id === 'sit' && this.movementState === 'fishing') {
      if (this.sitFishingPausedAt === null) this.sitFishingPausedAt = now;
      return;
    }
    if (now - this.currentEmote.startedAt >= emoteDurationMs(this.currentEmote.id)) this.cancelEmote();
  }

  getState() {
    this.syncMantleDebugMarkers();
    const position = this.body.translation();
    const onClimbSurface = this.movementState === 'climbing'
      || this.movementState === 'mantling';
    const climbMaterial = onClimbSurface
      ? this.climbing.getSurfaceMaterial()
      : this.gripCandidate?.surface?.material ?? null;
    return {
      position: { x: position.x, y: position.y, z: position.z },
      verticalSpeed: this.verticalVelocity,
      standingHeight: PLAYER_STANDING_HEIGHT,
      normalJumpApex: NORMAL_JUMP_APEX_METERS,
      grounded: this.grounded,
      speed: this.lastSpeed,
      sprinting: this.sprinting,
      sprintLocked: this.stamina.sprintLocked,
      stamina: this.stamina.normalized,
      staminaSupport: this.getFootSupportInfo().fraction,
      staminaContactSupport: this.getFootSupportInfo().contactFraction,
      movementState: this.movementState,
      posture: this.benchSeat ? 'seated' : 'standing',
      appearance: this.getAppearance(),
      heldSpecimenId: this.heldInventorySpecimen?.specimenId ?? null,
      heldItem: this.heldInventorySpecimen ? {
        type: 'specimen',
        specimenId: this.heldInventorySpecimen.specimenId ?? '',
        speciesId: this.heldInventorySpecimen.speciesId ?? '',
        name: this.heldInventorySpecimen.name ?? '',
        rarity: this.heldInventorySpecimen.rarity ?? 'Common',
        length: Number(this.heldInventorySpecimen.length) || 0,
        weight: Number(this.heldInventorySpecimen.weight) || 0,
        shiny: Boolean(this.heldInventorySpecimen.shiny)
      } : this.heldEquipmentItem ? {
        type: 'equipment',
        itemId: this.heldEquipmentItem.id,
        name: this.heldEquipmentItem.name
      } : null,
      emote: this.currentEmote ? { ...this.currentEmote } : null,
      slideBraking: this.slideBraking,
      slideActive: this.slideActive,
      slidePoseActive: this.slidePoseActive,
      slidePoseSeconds: this.slidePoseTimer,
      slideJamSeconds: this.slideJamTimer,
      slideRecoverySeconds: this.slideRecoveryTimer,
      stationaryContactSeconds: this.stationaryContactTimer,
      wedgeContactStabilized: this.wedgeContactStabilized,
      contactMotionLocked: this.contactMotionLocked,
      contactLockEscapeSeconds: this.contactLockEscapeTimer,
      contactTrapRecoveries: this.contactTrapRecoveries,
      unlimitedStamina: this.stamina.unlimited,
      canGrip: this.canGrip,
      climbSurface: onClimbSurface ? this.climbing.surface?.type ?? null : null,
      climbSurfaceLabel: onClimbSurface ? this.climbing.surface?.label ?? null : null,
      climbMaterial: climbMaterial?.label ?? null,
      climbStaminaMultiplier: climbMaterial?.staminaMultiplier ?? 1,
      climbSlipRate: onClimbSurface ? this.climbing.getSurfaceSlipRate() : 0,
      surfaceNormal: {
        x: onClimbSurface ? this.climbing.surfaceNormal.x : 0,
        y: onClimbSurface ? this.climbing.surfaceNormal.y : 0,
        z: onClimbSurface ? this.climbing.surfaceNormal.z : 0
      },
      wallJumpDirection: {
        x: this.climbing.lastPushDirection.x,
        y: this.climbing.lastPushDirection.y,
        z: this.climbing.lastPushDirection.z
      },
      sameSurfaceBlocked: this.climbing.blockedSurfaceHandle !== null,
      surfaceAngle: onClimbSurface ? this.climbing.getSurfaceAngleDegrees() : 0,
      overhangMultiplier: onClimbSurface ? this.climbing.getOverhangMultiplier() : 1,
      gripDebug: this.climbing.getDebugState(),
      inputMode: this.input.mobileMode ? 'touch' : 'desktop',
      canFish: !this.fishing?.active && this.grounded && Boolean(this.fishing?.findNearbyZone()),
      fishing: this.fishing?.getState() ?? { state: 'inactive', zone: null, message: '' }
    };
  }

  setFishingController(controller) {
    this.fishing = controller;
  }

  setRunManager(manager) {
    this.runManager = manager;
  }

  destroy() {
    destroySpecimenModel(this.inventorySpecimenModel);
    this.inventorySpecimenModel = null;
    destroyHeldEquipmentModel(this.heldEquipmentModel);
    this.heldEquipmentModel = null;
    this.mantleDebugMarkers?.root?.destroy();
    this.input.destroy();
  }
}
