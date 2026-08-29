import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import * as pc from 'playcanvas';
import {
  CLIMBING_CONFIG,
  NORMAL_JUMP_APEX_METERS,
  PLAYER_CONFIG,
  PLAYER_STANDING_HEIGHT,
  STAMINA_CONFIG
} from '../src/config.js';
import { ClimbingController } from '../src/player/climbing.js';
import { getClimbMaterial } from '../src/player/climbing-materials.js';
import { StaminaResource } from '../src/player/movement.js';

await RAPIER.init();

test('player dimensions, standing jump, and sprint drain use world-meter scale', () => {
  assert.ok(PLAYER_STANDING_HEIGHT >= 1.7 && PLAYER_STANDING_HEIGHT <= 1.9);
  assert.ok(NORMAL_JUMP_APEX_METERS >= .6 && NORMAL_JUMP_APEX_METERS <= .85);
  assert.equal(STAMINA_CONFIG.sprintDrainPerSecond, 4.2);
});

function makeFixture({ registered = true, difficult = false, material = 'normal', wallHeight = 4 } = {}) {
  const world = new RAPIER.World({ x: 0, y: -PLAYER_CONFIG.gravity, z: 0 });
  const wall = world.createCollider(
    RAPIER.ColliderDesc.cuboid(2, wallHeight / 2, 0.5)
      .setTranslation(0, wallHeight / 2, 0)
  );
  const playerBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.1, 1.02)
  );
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER_CONFIG.capsuleHalfHeight, PLAYER_CONFIG.radius),
    playerBody
  );
  const surfaces = new Map();
  if (registered) {
    const definition = getClimbMaterial(difficult ? 'smooth' : material);
    surfaces.set(wall.handle, {
      collider: wall,
      label: `Test ${definition.label}`,
      type: definition.id,
      material: definition,
      staminaMultiplier: definition.staminaMultiplier
    });
  }
  const registry = {
    getClimbSurface: (collider) => surfaces.get(collider?.handle) ?? null
  };
  world.step();
  const controller = new ClimbingController(world, RAPIER, registry, playerCollider);
  return { controller, playerBody, playerCollider, surfaces, wall, world };
}

function findFrontGrip(controller, position = { x: 0, y: 1.1, z: 1.02 }) {
  return controller.findGrip(position, new pc.Vec3(0, 0, -1));
}

test('grip probes accept registered walls and reject ordinary colliders', () => {
  const climbable = makeFixture();
  const ordinary = makeFixture({ registered: false });
  assert.equal(findFrontGrip(climbable.controller)?.surface.type, 'normal');
  assert.equal(findFrontGrip(ordinary.controller), null);
  climbable.world.free();
  ordinary.world.free();
});

test('hand-width upper-body probes catch a narrow offset hold without increasing reach', () => {
  const world = new RAPIER.World({ x: 0, y: -PLAYER_CONFIG.gravity, z: 0 });
  const hold = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.1, 0.34, 0.18).setTranslation(0.27, 1.58, 0)
  );
  const playerBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.1, 1.02)
  );
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER_CONFIG.capsuleHalfHeight, PLAYER_CONFIG.radius),
    playerBody
  );
  const surface = {
    collider: hold,
    label: 'Offset hand hold',
    type: 'normal',
    material: getClimbMaterial('normal')
  };
  const controller = new ClimbingController(world, RAPIER, {
    getClimbSurface: (collider) => collider?.handle === hold.handle ? surface : null
  }, playerCollider);
  world.step();
  const grip = findFrontGrip(controller);
  assert.equal(grip?.surface, surface);
  assert.ok(grip.distance <= CLIMBING_CONFIG.gripDistance);
  assert.ok(controller.getDebugState().acceptedProbeHits >= 1);
  world.free();
});

test('climbing follows the wall and drains the shared stamina resource', () => {
  const { controller, world } = makeFixture();
  const grip = findFrontGrip(controller);
  const stamina = new StaminaResource();
  controller.begin(grip);
  const output = controller.update(
    1 / 60,
    { x: 0, y: 1.1, z: 1.02 },
    { x: 0, z: 1 },
    { right: new pc.Vec3(1, 0, 0) },
    true,
    false,
    stamina
  );
  assert.equal(output.type, 'climbing');
  assert.ok(output.movement.y > 0);
  assert.ok(stamina.value < 100);
  world.free();
});

test('difficult surfaces and overhang tilt increase stamina cost', () => {
  const normal = makeFixture();
  const difficult = makeFixture({ difficult: true });
  const normalStamina = new StaminaResource();
  const difficultStamina = new StaminaResource();
  normal.controller.begin(findFrontGrip(normal.controller));
  difficult.controller.begin(findFrontGrip(difficult.controller));
  const args = [
    1,
    { x: 0, y: 1.1, z: 1.02 },
    { x: 0, z: 0 },
    { right: new pc.Vec3(1, 0, 0) },
    true,
    false
  ];
  normal.controller.update(...args, normalStamina);
  difficult.controller.update(...args, difficultStamina);
  assert.ok(difficultStamina.value < normalStamina.value);

  normal.controller.surfaceNormal.set(0, -0.25, Math.sqrt(1 - 0.25 ** 2));
  assert.ok(normal.controller.getOverhangMultiplier() > 1);
  normal.world.free();
  difficult.world.free();
});

test('rough, normal, smooth, and ice materials change range and slip predictably', () => {
  const fixtures = ['rough', 'normal', 'smooth', 'ice'].map((material) => (
    makeFixture({ material })
  ));
  const distantGripResults = fixtures.map((fixture) => Boolean(fixture.controller.findGrip(
    { x: 0, y: 1.1, z: 1.62 },
    new pc.Vec3(0, 0, -1)
  )));
  assert.deepEqual(distantGripResults, [true, false, false, false]);
  const outcomes = fixtures.map((fixture) => {
    const stamina = new StaminaResource();
    fixture.controller.begin(findFrontGrip(fixture.controller));
    const output = fixture.controller.update(
      1,
      { x: 0, y: 1.1, z: 1.02 },
      { x: 0, z: 0 },
      { right: new pc.Vec3(1, 0, 0) },
      true,
      false,
      stamina
    );
    return { stamina: stamina.value, slip: -output.movement.y };
  });

  assert.ok(outcomes[0].stamina > outcomes[1].stamina);
  assert.ok(outcomes[1].stamina > outcomes[2].stamina);
  assert.ok(outcomes[2].stamina > outcomes[3].stamina);
  assert.ok(Math.abs(outcomes[0].slip) < 0.0001);
  assert.ok(outcomes[2].slip > 0);
  assert.ok(outcomes[3].slip > outcomes[2].slip);
  fixtures.forEach((fixture) => fixture.world.free());
});

test('surface tracking crosses a shallow angled seam and updates the normal', () => {
  const fixture = makeFixture();
  const rotation = new pc.Quat().setFromEulerAngles(0, 14, 0);
  const neighboringWall = fixture.world.createCollider(
    RAPIER.ColliderDesc.cuboid(2, 2, 0.5)
      .setTranslation(4, 2, 0)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
  );
  const neighborSurface = {
    collider: neighboringWall,
    label: 'Angled neighbor',
    type: 'normal',
    staminaMultiplier: 1
  };
  fixture.surfaces.set(neighboringWall.handle, neighborSurface);
  fixture.world.step();
  fixture.controller.begin(findFrontGrip(fixture.controller));
  const tracked = fixture.controller.trackSurface({ x: 2.3, y: 1.1, z: 1.02 }, 0.12);
  assert.equal(tracked?.surface, neighborSurface);
  assert.ok(Math.abs(fixture.controller.surfaceNormal.x) > 0.05);
  fixture.world.free();
});

test('surface hysteresis keeps the current wall when a seam candidate is only marginally nearer', () => {
  const fixture = makeFixture();
  const seamWall = fixture.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.22, 2, 0.5).setTranslation(0.34, 2, 0.08)
  );
  const seamSurface = {
    collider: seamWall,
    label: 'Near seam overlay',
    type: 'normal',
    material: getClimbMaterial('normal')
  };
  fixture.surfaces.set(seamWall.handle, seamSurface);
  fixture.world.step();
  const original = findFrontGrip(fixture.controller);
  fixture.controller.begin(original);
  fixture.controller.trackSurface({ x: 0, y: 1.1, z: 1.02 }, 1 / 60, { x: 1, z: 0 });
  assert.equal(fixture.controller.surface, original.surface);
  assert.ok(fixture.controller.getDebugState().candidates.length >= 1);
  fixture.world.free();
});

test('short geometry gaps use grace before releasing the climber', () => {
  const fixture = makeFixture();
  const controller = fixture.controller;
  controller.begin(findFrontGrip(controller));
  const stamina = new StaminaResource();
  const argumentsAfterGap = [
    { x: 3.4, y: 1.1, z: 1.02 },
    { x: 0, z: 0 },
    { right: new pc.Vec3(1, 0, 0) },
    true,
    false,
    stamina
  ];
  assert.equal(controller.update(0.1, ...argumentsAfterGap).type, 'climbing');
  assert.equal(controller.active, true);
  assert.equal(controller.update(0.1, ...argumentsAfterGap).type, 'climbing');
  assert.equal(controller.update(0.1, ...argumentsAfterGap).type, 'lostSurface');
  assert.equal(controller.active, false);
  fixture.world.free();
});

test('release and push-off leave climb mode with intentional reattach delays', () => {
  const releaseFixture = makeFixture();
  const releaseController = releaseFixture.controller;
  releaseController.begin(findFrontGrip(releaseController));
  const released = releaseController.update(
    1 / 60,
    { x: 0, y: 1.1, z: 1.02 },
    { x: 0, z: 0 },
    { right: new pc.Vec3(1, 0, 0) },
    false,
    false,
    new StaminaResource()
  );
  assert.equal(released.type, 'released');
  assert.equal(releaseController.active, false);
  assert.ok(releaseController.reattachTimer > 0);

  const pushFixture = makeFixture();
  const pushController = pushFixture.controller;
  const stamina = new StaminaResource();
  pushController.begin(findFrontGrip(pushController));
  const pushed = pushController.update(
    1 / 60,
    { x: 0, y: 1.1, z: 1.02 },
    { x: 0, z: 0 },
    { right: new pc.Vec3(1, 0, 0) },
    true,
    true,
    stamina
  );
  assert.equal(pushed.type, 'pushOff');
  assert.equal(stamina.value, 100 - CLIMBING_CONFIG.pushOffStaminaCost);
  assert.ok(pushed.pushNormal.z > 0.9);
  releaseFixture.world.free();
  pushFixture.world.free();
});

test('directional push-off uses wall tangent and vertical intention', () => {
  function push(axes) {
    const fixture = makeFixture();
    const controller = fixture.controller;
    controller.begin(findFrontGrip(controller));
    const result = controller.update(
      1 / 60,
      { x: 0, y: 1.1, z: 1.02 },
      axes,
      { right: new pc.Vec3(1, 0, 0) },
      true,
      true,
      new StaminaResource()
    );
    fixture.world.free();
    return result.pushVelocity.clone();
  }

  const neutral = push({ x: 0, z: 0 });
  const left = push({ x: -1, z: 0 });
  const right = push({ x: 1, z: 0 });
  const upward = push({ x: 0, z: 1 });
  const downward = push({ x: 0, z: -1 });
  assert.ok(neutral.z > 5);
  assert.ok(left.x < -3);
  assert.ok(right.x > 3);
  assert.ok(upward.y > neutral.y);
  assert.ok(downward.y < neutral.y);
  assert.ok(downward.y <= 0, 'Down + jump should drop away without upward launch');
  const diagonal = push({ x: 1, z: 1 });
  assert.ok(diagonal.x > 3 && diagonal.y > neutral.y);
});

test('push-off blocks the source wall but permits a nearby transfer catch', () => {
  const fixture = makeFixture();
  const controller = fixture.controller;
  const firstGrip = findFrontGrip(controller);
  controller.begin(firstGrip);
  controller.update(
    1 / 60,
    { x: 0, y: 1.1, z: 1.02 },
    { x: 1, z: 0 },
    { right: new pc.Vec3(1, 0, 0) },
    true,
    true,
    new StaminaResource()
  );

  controller.tickCooldown(0.1, new StaminaResource(), { x: 0.15, y: 1.3, z: 1.25 });
  assert.equal(findFrontGrip(controller), null);
  controller.tickCooldown(1, new StaminaResource(), { x: 1.2, y: 1.1, z: 1.02 });
  assert.notEqual(controller.blockedSurfaceHandle, null);

  const transferWall = fixture.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 2, 2).setTranslation(1.45, 2, 1.02)
  );
  const transferSurface = {
    collider: transferWall,
    label: 'Transfer wall',
    type: 'normal',
    material: getClimbMaterial('normal'),
    staminaMultiplier: 1
  };
  fixture.surfaces.set(transferWall.handle, transferSurface);
  fixture.world.step();
  const transferGrip = controller.findGrip(
    { x: 0, y: 1.1, z: 1.02 },
    new pc.Vec3(1, 0, 0)
  );
  assert.equal(transferGrip?.surface, transferSurface);
  controller.begin(transferGrip, new pc.Vec3(5, 2, 1));
  assert.ok(controller.transitionMomentum.length() > 0);
  fixture.world.free();
});

test('stamina exhaustion forces a fall and locks immediate re-gripping', () => {
  const { controller, world } = makeFixture();
  const stamina = new StaminaResource();
  stamina.value = 0.02;
  controller.begin(findFrontGrip(controller));
  const output = controller.update(
    1 / 60,
    { x: 0, y: 1.1, z: 1.02 },
    { x: 0, z: 0 },
    { right: new pc.Vec3(1, 0, 0) },
    true,
    false,
    stamina
  );
  assert.equal(output.type, 'exhausted');
  assert.equal(controller.active, false);
  assert.equal(controller.gripLocked, true);
  assert.equal(stamina.sprintLocked, true);
  assert.equal(controller.canAttemptGrip(stamina), false);
  world.free();
});

test('mantle probes find and traverse a clear walkable landing', () => {
  const { controller, playerBody, playerCollider, world } = makeFixture({ wallHeight: 3 });
  const position = { x: 0, y: 2.58, z: 1.02 };
  playerBody.setTranslation(position, true);
  world.step();
  controller.begin(findFrontGrip(controller, position));
  const target = controller.findMantleTarget(position);
  assert.ok(target);
  assert.ok(target.y > position.y);
  assert.ok(target.z < position.z - CLIMBING_CONFIG.wallDistance);
  assert.equal(controller.isCapsuleBlocked(target), false);

  const character = world.createCharacterController(0.025);
  character.setSlideEnabled(true);
  controller.startMantle(position, target);
  for (let frame = 0; frame < 32 && controller.mantling; frame += 1) {
    const current = playerBody.translation();
    const output = controller.updateMantle(1 / 60, current);
    character.computeColliderMovement(playerCollider, output.movement);
    const movement = character.computedMovement();
    playerBody.setNextKinematicTranslation({
      x: current.x + movement.x,
      y: current.y + movement.y,
      z: current.z + movement.z
    });
    world.step();
  }
  const landed = playerBody.translation();
  assert.ok(Math.hypot(landed.x - target.x, landed.y - target.y, landed.z - target.z) < 0.08);
  world.free();
});
