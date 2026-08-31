import * as pc from 'playcanvas';
import { CLIMBING_CONFIG, PLAYER_CONFIG } from '../config.js';
import { getClimbMaterial, MAX_GRIP_QUALITY } from './climbing-materials.js';

const UP = new pc.Vec3(0, 1, 0);
const IDENTITY_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export class ClimbingController {
  constructor(physicsWorld, RAPIER, surfaceRegistry, playerCollider) {
    this.physicsWorld = physicsWorld;
    this.RAPIER = RAPIER;
    this.surfaceRegistry = surfaceRegistry;
    this.playerCollider = playerCollider;
    this.active = false;
    this.gripLocked = false;
    this.reattachTimer = 0;
    this.lostSurfaceTimer = 0;
    this.sameSurfaceBlockTimer = 0;
    this.blockedSurfaceHandle = null;
    this.pushStartPosition = new pc.Vec3();
    this.pushStartNormal = new pc.Vec3();
    this.surface = null;
    this.surfaceNormal = new pc.Vec3(0, 0, 1);
    this.surfacePoint = new pc.Vec3();
    this.surfaceRight = new pc.Vec3(1, 0, 0);
    this.surfaceUp = new pc.Vec3(0, 1, 0);
    this.lastClimbVelocity = new pc.Vec3();
    this.transitionMomentum = new pc.Vec3();
    this.lastPushDirection = new pc.Vec3();
    this.mantling = false;
    this.mantleElapsed = 0;
    this.mantleStart = new pc.Vec3();
    this.mantleControl = new pc.Vec3();
    this.mantleTarget = new pc.Vec3();
    this.mantleDirection = new pc.Vec3(0, 0, -1);
    this.mantleDebug = {
      source: 'none', status: 'idle', lip: null, target: null, chestProbe: null,
      headProbe: null, candidate: null, landingSlope: null, reach: null, probes: 0
    };
    this.capsuleShape = new RAPIER.Capsule(
      PLAYER_CONFIG.capsuleHalfHeight,
      PLAYER_CONFIG.radius
    );
    this.probeHeights = [0.5, 0.16, -0.28];
    this.debugProbeHits = [];
    this.debugCandidates = [];
    this.lastGripRejection = 'no probe hit';
    this.lastSurfaceSwitch = 'none';
    this.output = {
      type: 'climbing',
      movement: new pc.Vec3(),
      pushNormal: new pc.Vec3(),
      pushVelocity: new pc.Vec3(),
      sourceSurfaceHandle: null
    };
  }

  tickCooldown(dt, stamina, position = null) {
    this.reattachTimer = Math.max(0, this.reattachTimer - dt);
    this.sameSurfaceBlockTimer = Math.max(0, this.sameSurfaceBlockTimer - dt);
    if (this.blockedSurfaceHandle !== null && position) {
      const delta = new pc.Vec3(
        position.x - this.pushStartPosition.x,
        position.y - this.pushStartPosition.y,
        position.z - this.pushStartPosition.z
      );
      const outwardSeparation = delta.dot(this.pushStartNormal);
      if (outwardSeparation >= CLIMBING_CONFIG.sameSurfaceClearSeparation
        || (this.sameSurfaceBlockTimer <= 0
          && outwardSeparation >= CLIMBING_CONFIG.sameSurfaceMinimumSeparation)) {
        this.blockedSurfaceHandle = null;
      }
    }
    if (this.gripLocked && stamina.value >= CLIMBING_CONFIG.gripResumeStamina) {
      this.gripLocked = false;
    }
  }

  canAttemptGrip(stamina) {
    return this.reattachTimer <= 0
      && !this.gripLocked
      && stamina.value >= CLIMBING_CONFIG.gripResumeStamina;
  }

  findGrip(position, facingDirection, maximumDistance = CLIMBING_CONFIG.gripDistance) {
    this.debugProbeHits.length = 0;
    this.debugCandidates.length = 0;
    if (facingDirection.lengthSq() < 0.01) {
      this.lastGripRejection = 'no facing direction';
      return null;
    }
    const direction = facingDirection.clone();
    direction.y = clamp(direction.y, -0.2, 0.2);
    direction.normalize();
    const side = new pc.Vec3(-direction.z, 0, direction.x).normalize();
    const probes = [
      { height: this.probeHeights[0], side: -CLIMBING_CONFIG.gripProbeSideOffset, priority: 0 },
      { height: this.probeHeights[0], side: 0, priority: 0.01 },
      { height: this.probeHeights[0], side: CLIMBING_CONFIG.gripProbeSideOffset, priority: 0 },
      { height: this.probeHeights[1], side: 0, priority: 0.05 },
      { height: this.probeHeights[2], side: 0, priority: 0.12 }
    ];
    const candidates = new Map();

    for (const probe of probes) {
      const origin = {
        x: position.x + side.x * probe.side,
        y: position.y + probe.height,
        z: position.z + side.z * probe.side
      };
      const ray = new this.RAPIER.Ray(origin, direction);
      const hit = this.physicsWorld.castRayAndGetNormal(
        ray,
        maximumDistance * MAX_GRIP_QUALITY,
        true,
        undefined,
        undefined,
        this.playerCollider,
        undefined,
        (collider) => this.surfaceRegistry.getClimbSurface(collider) !== null
      );
      if (!hit) continue;

      const surface = this.surfaceRegistry.getClimbSurface(hit.collider);
      if (!surface) continue;
      const hitDebug = {
        label: surface.label ?? surface.type ?? 'surface',
        handle: hit.collider.handle,
        distance: hit.timeOfImpact,
        height: probe.height,
        side: probe.side,
        accepted: false,
        reason: ''
      };
      this.debugProbeHits.push(hitDebug);
      if (hit.collider.handle === this.blockedSurfaceHandle) {
        hitDebug.reason = 'push-off source blocked';
        continue;
      }
      const material = surface.material ?? getClimbMaterial(surface.type);
      if (hit.timeOfImpact > maximumDistance * material.gripQuality) {
        hitDebug.reason = 'outside material reach';
        continue;
      }
      const normal = new pc.Vec3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
      if (normal.y > CLIMBING_CONFIG.maxSurfaceNormalY) {
        hitDebug.reason = 'too horizontal';
        continue;
      }
      if (!this.supportsSurfaceNormal(normal, surface)) {
        hitDebug.reason = material.grippable ? 'unsupported overhang' : 'ungrippable material';
        continue;
      }
      const facingDot = direction.dot(normal);
      if (facingDot > CLIMBING_CONFIG.gripFacingDotMaximum) {
        hitDebug.reason = 'not facing surface';
        continue;
      }

      const candidate = {
        collider: hit.collider,
        distance: hit.timeOfImpact,
        normal,
        point: new pc.Vec3(
          origin.x + direction.x * hit.timeOfImpact,
          origin.y + direction.y * hit.timeOfImpact,
          origin.z + direction.z * hit.timeOfImpact
        ),
        surface,
        facingDot,
        score: hit.timeOfImpact + probe.priority + (facingDot + 1) * 0.08
      };
      hitDebug.accepted = true;
      hitDebug.reason = 'candidate';
      const previous = candidates.get(hit.collider.handle);
      if (!previous || candidate.score < previous.score) {
        candidates.set(hit.collider.handle, candidate);
      }
    }

    this.debugCandidates = [...candidates.values()]
      .sort((a, b) => a.score - b.score)
      .map((candidate) => ({
        label: candidate.surface.label ?? candidate.surface.type ?? 'surface',
        handle: candidate.collider.handle,
        distance: candidate.distance,
        score: candidate.score,
        normal: candidate.normal.clone()
      }));
    const best = [...candidates.values()].sort((a, b) => a.score - b.score)[0] ?? null;
    this.lastGripRejection = best
      ? 'accepted'
      : this.debugProbeHits.at(-1)?.reason ?? 'no climbable probe hit';
    return best;
  }

  begin(candidate, incomingVelocity = null) {
    this.active = true;
    this.surface = candidate.surface;
    this.surfaceNormal.copy(candidate.normal);
    this.surfacePoint.copy(candidate.point);
    this.lostSurfaceTimer = 0;
    this.updateSurfaceAxes();
    this.transitionMomentum.set(0, 0, 0);
    if (incomingVelocity) {
      this.transitionMomentum.set(incomingVelocity.x, incomingVelocity.y, incomingVelocity.z);
      const normalVelocity = this.transitionMomentum.dot(this.surfaceNormal);
      this.transitionMomentum.sub(this.surfaceNormal.clone().mulScalar(normalVelocity));
      this.transitionMomentum.mulScalar(CLIMBING_CONFIG.catchMomentumRetention);
      const speed = this.transitionMomentum.length();
      if (speed > CLIMBING_CONFIG.catchMomentumMaximum) {
        this.transitionMomentum.mulScalar(CLIMBING_CONFIG.catchMomentumMaximum / speed);
      }
    }
    if (candidate.collider.handle !== this.blockedSurfaceHandle) this.reattachTimer = 0;
  }

  update(dt, position, axes, cameraAxes, gripHeld, jumpPressed, stamina, gripDrainMultiplier = 1, slipMultiplier = 1) {
    this.output.type = 'climbing';
    this.output.movement.set(0, 0, 0);
    this.output.pushNormal.copy(this.surfaceNormal);
    this.output.pushVelocity.set(0, 0, 0);
    this.output.sourceSurfaceHandle = null;

    if (!gripHeld) {
      this.detach(CLIMBING_CONFIG.releaseReattachDelay);
      this.output.type = 'released';
      return this.output;
    }

    this.updateSurfaceAxes(cameraAxes);
    const pushOffCost = CLIMBING_CONFIG.pushOffStaminaCost * gripDrainMultiplier;
    if (jumpPressed && stamina.value > pushOffCost) {
      stamina.spend(pushOffCost);
      this.output.pushNormal.copy(this.surfaceNormal);
      this.output.pushVelocity.copy(this.computePushOffVelocity(axes));
      this.output.sourceSurfaceHandle = this.surface.collider.handle;
      this.blockedSurfaceHandle = this.surface.collider.handle;
      this.sameSurfaceBlockTimer = CLIMBING_CONFIG.sameSurfaceBlockDuration;
      this.pushStartPosition.set(position.x, position.y, position.z);
      this.pushStartNormal.copy(this.surfaceNormal);
      this.lastPushDirection.copy(this.output.pushVelocity).normalize();
      this.detach(CLIMBING_CONFIG.transferCatchDelay);
      this.output.type = 'pushOff';
      return this.output;
    }

    const trackedSurface = this.trackSurface(position, dt, axes);
    if (!trackedSurface) this.lostSurfaceTimer += dt;
    else this.lostSurfaceTimer = 0;

    // Reaching a ledge naturally makes the vertical face disappear from the ordinary wall
    // tracker. Give upward input a short grace window to search for a top surface before
    // interpreting that disappearance as a fall. This is the actual "hands catch the lip"
    // behavior rather than requiring the capsule center to already be above the plateau.
    if (axes.z > 0.05 && (trackedSurface || this.lostSurfaceTimer <= CLIMBING_CONFIG.mantleLedgeGrace)) {
      const mantleTarget = this.findMantleTarget(position);
      if (mantleTarget) {
        this.startMantle(position, mantleTarget);
        this.output.type = 'mantleStart';
        return this.output;
      }
    }

    if (!trackedSurface && this.lostSurfaceTimer >= CLIMBING_CONFIG.lostSurfaceGrace) {
      this.detach(CLIMBING_CONFIG.releaseReattachDelay);
      this.output.type = 'lostSurface';
      return this.output;
    }

    if (axes.z < -0.15 && this.hasWalkableGroundBelow(position)) {
      this.detach(CLIMBING_CONFIG.releaseReattachDelay);
      this.output.type = 'landed';
      return this.output;
    }

    const inputLength = Math.min(1, Math.hypot(axes.x, axes.z));
    const material = this.getSurfaceMaterial();
    const rightSpeed = axes.x * CLIMBING_CONFIG.sidewaysSpeed * material.speedMultiplier;
    // Smooth Rock and Ice are deliberately worse when the player hangs still. Active
    // movement still slips, but committing to a move partially counters the idle slide.
    const slipSpeed = (inputLength < 0.08
      ? (material.idleSlipRate ?? material.slipRate)
      : material.slipRate) * Math.max(0, slipMultiplier);
    const verticalSpeed = axes.z * CLIMBING_CONFIG.climbSpeed * material.speedMultiplier
      - slipSpeed;
    this.lastClimbVelocity
      .copy(this.surfaceRight).mulScalar(rightSpeed)
      .add(this.surfaceUp.clone().mulScalar(verticalSpeed));

    const movingDrain = CLIMBING_CONFIG.movingDrainPerSecond * inputLength;
    const drain = (CLIMBING_CONFIG.holdingDrainPerSecond + movingDrain)
      * this.getSurfaceStaminaMultiplier()
      * this.getOverhangMultiplier()
      * Math.max(.1, gripDrainMultiplier);
    if (!stamina.spend(drain * dt)) {
      stamina.sprintLocked = true;
      this.gripLocked = true;
      this.detach(CLIMBING_CONFIG.exhaustionReattachDelay);
      this.output.type = 'exhausted';
      return this.output;
    }

    this.output.movement.copy(this.lastClimbVelocity).mulScalar(dt);
    if (this.transitionMomentum.lengthSq() > 0.0001) {
      this.output.movement.add(this.transitionMomentum.clone().mulScalar(dt));
      this.transitionMomentum.mulScalar(
        Math.exp(-CLIMBING_CONFIG.catchMomentumSharpness * dt)
      );
    }
    if (trackedSurface) {
      const distanceError = CLIMBING_CONFIG.wallDistance - trackedSurface.distance;
      const correction = clamp(
        distanceError,
        -CLIMBING_CONFIG.wallCorrectionSpeed * dt,
        CLIMBING_CONFIG.wallCorrectionSpeed * dt
      );
      this.output.movement.add(this.surfaceNormal.clone().mulScalar(correction));
    }
    return this.output;
  }

  resetMantleDebug(source = 'none') {
    this.mantleDebug = {
      source, status: 'searching', lip: null, target: null, chestProbe: null,
      headProbe: null, candidate: null, landingSlope: null, reach: null, probes: 0
    };
  }

  findMantleTarget(position) {
    const inward = this.surfaceNormal.clone().mulScalar(-1);
    inward.y = 0;
    return this.findChestLedgeTarget(position, inward, 'climb', true);
  }

  findAirMantleTarget(position, approachDirection) {
    return this.findChestLedgeTarget(position, approachDirection, 'jump', false);
  }

  findChestLedgeTarget(position, approachDirection, source = 'climb', knownWall = false) {
    this.resetMantleDebug(source);
    if (!approachDirection || approachDirection.lengthSq() < 0.01) {
      this.mantleDebug.status = 'TOO FAR';
      return null;
    }

    const approach = approachDirection.clone();
    approach.y = 0;
    if (approach.lengthSq() < 0.001) {
      this.mantleDebug.status = 'TOO FAR';
      return null;
    }
    approach.normalize();
    const side = new pc.Vec3(-approach.z, 0, approach.x).normalize();
    const walkableNormalY = Math.cos(PLAYER_CONFIG.maxSlopeDegrees * Math.PI / 180);
    const feetOffset = PLAYER_CONFIG.capsuleHalfHeight + PLAYER_CONFIG.radius;

    // First locate a nearby front face at torso height. Jump mantles require this explicit
    // lip; climbing mantles may use the already-tracked wall even after its top ray disappears.
    let face = null;
    for (const height of CLIMBING_CONFIG.mantleFaceProbeHeights) {
      const origin = { x: position.x, y: position.y + height, z: position.z };
      const ray = new this.RAPIER.Ray(origin, approach);
      const hit = this.physicsWorld.castRayAndGetNormal(
        ray,
        CLIMBING_CONFIG.mantleFaceReach,
        true,
        undefined,
        undefined,
        this.playerCollider
      );
      this.mantleDebug.probes += 1;
      this.mantleDebug.chestProbe = {
        x: origin.x + approach.x * CLIMBING_CONFIG.mantleFaceReach,
        y: origin.y,
        z: origin.z + approach.z * CLIMBING_CONFIG.mantleFaceReach
      };
      if (!hit) continue;
      const normal = new pc.Vec3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
      // Rounded shoulders and beveled tier edges are valid lips too. Only a nearly flat
      // floor hit is ignored here; landing walkability is evaluated independently below.
      if (normal.y > .92 || approach.dot(normal) > 0.28) continue;
      if (!face || hit.timeOfImpact < face.distance) {
        face = {
          distance: hit.timeOfImpact,
          normal,
          point: new pc.Vec3(
            origin.x + approach.x * hit.timeOfImpact,
            origin.y,
            origin.z + approach.z * hit.timeOfImpact
          )
        };
      }
    }

    // Airborne top-out intentionally does not require a classical vertical front face.
    // A nearby higher walkable landing can define the lip on broad/sloped mountain levels.
    if (face) this.mantleDebug.lip = { x: face.point.x, y: face.point.y, z: face.point.z };

    // If a vertical face still occupies head height directly in front of the player, the
    // torso has not actually reached the top yet. Sloped/near-horizontal hits are allowed.
    const headOrigin = { x: position.x, y: position.y + CLIMBING_CONFIG.mantleHeadProbeHeight, z: position.z };
    const headHit = this.physicsWorld.castRayAndGetNormal(
      new this.RAPIER.Ray(headOrigin, approach),
      Math.min(CLIMBING_CONFIG.mantleFaceReach, (face?.distance ?? .78) + .3),
      true,
      undefined,
      undefined,
      this.playerCollider
    );
    this.mantleDebug.probes += 1;
    this.mantleDebug.headProbe = {
      x: headOrigin.x + approach.x * Math.min(CLIMBING_CONFIG.mantleFaceReach, (face?.distance ?? .78) + .3),
      y: headOrigin.y,
      z: headOrigin.z + approach.z * Math.min(CLIMBING_CONFIG.mantleFaceReach, (face?.distance ?? .78) + .3)
    };
    if (headHit) {
      const headNormal = new pc.Vec3(headHit.normal.x, headHit.normal.y, headHit.normal.z).normalize();
      if (headNormal.y < .34 && approach.dot(headNormal) < .2) {
        this.mantleDebug.status = 'TOO LOW';
      }
    }

    let best = null;
    let lastReason = 'NO TOP';
    for (const forwardDistance of CLIMBING_CONFIG.mantleProbeInsets) {
      if (face && forwardDistance < face.distance + .1) continue;
      for (const sideOffset of CLIMBING_CONFIG.mantleProbeSideOffsets) {
        const topOrigin = {
          x: position.x + approach.x * forwardDistance + side.x * sideOffset,
          y: position.y + CLIMBING_CONFIG.mantleTopProbeUp,
          z: position.z + approach.z * forwardDistance + side.z * sideOffset
        };
        const floorHit = this.physicsWorld.castRayAndGetNormal(
          new this.RAPIER.Ray(topOrigin, { x: 0, y: -1, z: 0 }),
          CLIMBING_CONFIG.mantleProbeDown,
          true,
          undefined,
          undefined,
          this.playerCollider
        );
        this.mantleDebug.probes += 1;
        if (!floorHit) {
          lastReason = 'NO TOP';
          continue;
        }
        if (floorHit.normal.y < walkableNormalY) {
          lastReason = 'TOO STEEP';
          continue;
        }

        const floorY = topOrigin.y - floorHit.timeOfImpact;
        const floorRelative = floorY - position.y;
        if (floorRelative < CLIMBING_CONFIG.mantleFloorMinimumRelativeToCenter) {
          lastReason = 'NO LANDING';
          continue;
        }
        if (floorRelative > CLIMBING_CONFIG.mantleFloorMaximumRelativeToCenter) {
          lastReason = 'TOO FAR';
          continue;
        }

        const candidate = new pc.Vec3(
          topOrigin.x,
          floorY + feetOffset + .055,
          topOrigin.z
        );
        const rise = candidate.y - position.y;
        if (rise < CLIMBING_CONFIG.mantleMinimumRise || rise > CLIMBING_CONFIG.mantleMaximumRise) {
          lastReason = 'TOO FAR';
          continue;
        }
        const headroomOrigin = { x: candidate.x, y: floorY + .08, z: candidate.z };
        const headroom = this.physicsWorld.castRay(
          new this.RAPIER.Ray(headroomOrigin, { x: 0, y: 1, z: 0 }),
          feetOffset * 2 + .08,
          true,
          undefined,
          undefined,
          this.playerCollider
        );
        this.mantleDebug.probes += 1;
        if (headroom) {
          lastReason = 'NO HEADROOM';
          continue;
        }
        if (this.isCapsuleBlocked(candidate)) {
          lastReason = 'BLOCKED';
          continue;
        }

        const score = Math.abs(floorRelative - .34) * .38
          + forwardDistance * .075
          + Math.abs(sideOffset) * .28;
        if (!best || score < best.score) best = {
          target: candidate,
          score,
          slope: Math.acos(clamp(floorHit.normal.y, -1, 1)) * 180 / Math.PI,
          reach: forwardDistance,
          floor: { x: topOrigin.x, y: floorY, z: topOrigin.z }
        };
      }
    }

    if (!best) {
      this.mantleDebug.status = lastReason;
      return null;
    }
    this.mantleDebug.status = 'READY';
    this.mantleDebug.target = { x: best.target.x, y: best.target.y, z: best.target.z };
    this.mantleDebug.candidate = { ...best.floor };
    this.mantleDebug.landingSlope = best.slope;
    this.mantleDebug.reach = best.reach;
    if (!this.mantleDebug.lip) this.mantleDebug.lip = { ...best.floor };
    return best.target;
  }

  startMantle(position, target, approachDirection = null) {
    this.active = false;
    this.mantling = true;
    this.mantleElapsed = 0;
    this.mantleStart.set(position.x, position.y, position.z);
    this.mantleTarget.copy(target);
    const inward = approachDirection?.clone?.() ?? this.surfaceNormal.clone().mulScalar(-1);
    inward.y = 0;
    if (inward.lengthSq() > .001) inward.normalize();
    this.mantleDirection.copy(inward);
    this.mantleDebug.status = 'MANTLING';
    this.mantleDebug.target = { x: target.x, y: target.y, z: target.z };
    // Pull both upward and toward the actual landing point. A fixed 34 cm inward control
    // point made thick plateau lips fail even after a valid top surface had been found.
    this.mantleControl.set(
      position.x + (target.x - position.x) * .48,
      Math.max(target.y + .38, position.y + .86),
      position.z + (target.z - position.z) * .48
    );
    this.lostSurfaceTimer = 0;
  }

  updateMantle(dt, position) {
    this.mantleElapsed += dt;
    const t = clamp(this.mantleElapsed / CLIMBING_CONFIG.mantleDuration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const inverse = 1 - eased;
    const desired = new pc.Vec3(
      inverse * inverse * this.mantleStart.x
        + 2 * inverse * eased * this.mantleControl.x
        + eased * eased * this.mantleTarget.x,
      inverse * inverse * this.mantleStart.y
        + 2 * inverse * eased * this.mantleControl.y
        + eased * eased * this.mantleTarget.y,
      inverse * inverse * this.mantleStart.z
        + 2 * inverse * eased * this.mantleControl.z
        + eased * eased * this.mantleTarget.z
    );
    this.output.movement.set(
      desired.x - position.x,
      desired.y - position.y,
      desired.z - position.z
    );
    this.output.type = t >= 1 ? 'mantleComplete' : 'mantling';
    if (t >= 1) {
      this.mantling = false;
      this.reattachTimer = Math.max(this.reattachTimer, 0.16);
    }
    return this.output;
  }

  hasWalkableGroundBelow(position) {
    const feetOffset = PLAYER_CONFIG.capsuleHalfHeight + PLAYER_CONFIG.radius;
    const ray = new this.RAPIER.Ray(position, { x: 0, y: -1, z: 0 });
    const hit = this.physicsWorld.castRayAndGetNormal(
      ray,
      feetOffset + 0.11,
      true,
      undefined,
      undefined,
      this.playerCollider
    );
    return Boolean(hit && hit.normal.y >= Math.cos(PLAYER_CONFIG.maxSlopeDegrees * Math.PI / 180));
  }

  isCapsuleBlocked(position) {
    let blocked = false;
    this.physicsWorld.intersectionsWithShape(
      { x: position.x, y: position.y, z: position.z },
      IDENTITY_ROTATION,
      this.capsuleShape,
      () => {
        blocked = true;
        return false;
      },
      undefined,
      undefined,
      this.playerCollider
    );
    return blocked;
  }

  trackSurface(position, dt, axes = { x: 0, z: 0 }) {
    this.debugProbeHits.length = 0;
    const inward = this.surfaceNormal.clone().mulScalar(-1);
    this.surfaceRight.cross(UP, this.surfaceNormal).normalize();
    const directions = [
      inward,
      inward.clone().add(this.surfaceRight.clone().mulScalar(0.32)).normalize(),
      inward.clone().add(this.surfaceRight.clone().mulScalar(-0.32)).normalize()
    ];
    const candidates = new Map();
    const minimumNormalDot = Math.cos(CLIMBING_CONFIG.maxSurfaceTurnDegrees * Math.PI / 180);

    for (const height of this.probeHeights) {
      for (const direction of directions) {
        const origin = { x: position.x, y: position.y + height, z: position.z };
        const ray = new this.RAPIER.Ray(origin, direction);
        const hit = this.physicsWorld.castRayAndGetNormal(
          ray,
          CLIMBING_CONFIG.trackingDistance,
          true,
          undefined,
          undefined,
          this.playerCollider,
          undefined,
          (collider) => this.surfaceRegistry.getClimbSurface(collider) !== null
        );
        if (!hit) continue;
        const surface = this.surfaceRegistry.getClimbSurface(hit.collider);
        if (!surface) continue;
        const normal = new pc.Vec3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
        const probeDebug = {
          label: surface.label ?? surface.type ?? 'surface',
          handle: hit.collider.handle,
          distance: hit.timeOfImpact,
          height,
          accepted: false,
          reason: ''
        };
        this.debugProbeHits.push(probeDebug);
        if (normal.y > CLIMBING_CONFIG.maxSurfaceNormalY) {
          probeDebug.reason = 'too horizontal';
          continue;
        }
        if (!this.supportsSurfaceNormal(normal, surface)) {
          probeDebug.reason = 'material / overhang rejected';
          continue;
        }
        if (normal.dot(this.surfaceNormal) < minimumNormalDot) {
          probeDebug.reason = 'surface turn too sharp';
          continue;
        }
        probeDebug.accepted = true;
        probeDebug.reason = 'tracking candidate';

        const currentSurface = hit.collider.handle === this.surface?.collider?.handle;
        const sameMaterial = (surface.material?.id ?? surface.type)
          === (this.surface?.material?.id ?? this.surface?.type);
        const upperBodyBias = height === this.probeHeights[0] ? -0.04 : 0;
        const intendedSide = Math.sign(axes.x);
        const directionSide = direction.dot(this.surfaceRight);
        const intentionBias = intendedSide !== 0 && Math.sign(directionSide) === intendedSide ? -0.04 : 0;
        const continuityBias = currentSurface
          ? -CLIMBING_CONFIG.currentSurfaceBias
          : sameMaterial ? -CLIMBING_CONFIG.compatibleSurfaceBias : 0;
        const score = Math.abs(hit.timeOfImpact - CLIMBING_CONFIG.wallDistance)
          + (1 - normal.dot(this.surfaceNormal)) * 0.42
          + upperBodyBias
          + intentionBias
          + continuityBias;
        const candidate = {
            collider: hit.collider,
            distance: hit.timeOfImpact,
            normal,
            surface,
            score,
            currentSurface,
            point: new pc.Vec3(
              origin.x + direction.x * hit.timeOfImpact,
              origin.y + direction.y * hit.timeOfImpact,
              origin.z + direction.z * hit.timeOfImpact
            )
          };
        const previous = candidates.get(hit.collider.handle);
        if (!previous || candidate.score < previous.score) {
          candidates.set(hit.collider.handle, candidate);
        }
      }
    }

    let best = [...candidates.values()].sort((a, b) => a.score - b.score)[0] ?? null;
    if (!best) return null;
    const current = candidates.get(this.surface?.collider?.handle);
    if (current && best !== current
      && best.score + CLIMBING_CONFIG.surfaceSwitchAdvantage >= current.score) {
      best = current;
    }
    const switched = best.surface !== this.surface;
    if (switched) {
      this.lastSurfaceSwitch = `${this.surface?.label ?? 'none'} -> ${best.surface.label ?? best.surface.type}`;
    }
    const sharpness = switched
      ? CLIMBING_CONFIG.surfaceTransitionSharpness
      : CLIMBING_CONFIG.surfaceNormalSharpness;
    const smoothing = 1 - Math.exp(-sharpness * dt);
    this.surfaceNormal.lerp(this.surfaceNormal, best.normal, smoothing).normalize();
    const pointSmoothing = 1 - Math.exp(-CLIMBING_CONFIG.surfacePointSharpness * dt);
    this.surfacePoint.lerp(this.surfacePoint, best.point, pointSmoothing);
    this.surface = best.surface;
    this.debugCandidates = [...candidates.values()]
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
      .map((candidate) => ({
        label: candidate.surface.label ?? candidate.surface.type ?? 'surface',
        handle: candidate.collider.handle,
        distance: candidate.distance,
        score: candidate.score,
        normal: candidate.normal.clone(),
        current: candidate.currentSurface
      }));
    this.lastGripRejection = 'tracking';
    this.updateSurfaceAxes();
    return best;
  }

  updateSurfaceAxes(cameraAxes = null) {
    this.surfaceRight.cross(UP, this.surfaceNormal);
    if (this.surfaceRight.lengthSq() < 0.001) this.surfaceRight.set(1, 0, 0);
    this.surfaceRight.normalize();
    if (cameraAxes && this.surfaceRight.dot(cameraAxes.right) < 0) {
      this.surfaceRight.mulScalar(-1);
    }
    this.surfaceUp.cross(this.surfaceNormal, this.surfaceRight).normalize();
    if (this.surfaceUp.y < 0) this.surfaceUp.mulScalar(-1);
  }

  detach(delay) {
    this.active = false;
    this.mantling = false;
    this.reattachTimer = Math.max(this.reattachTimer, delay);
  }

  computePushOffVelocity(axes) {
    const upwardIntent = Math.max(0, axes.z);
    const downwardIntent = Math.max(0, -axes.z);
    const directionalIntent = Math.min(1, Math.hypot(axes.x, axes.z));
    // Neutral Space still creates enough separation to leave the wall. Any directional
    // input deliberately converts most of that outward kick into the requested travel:
    // A/D get more lateral velocity, W gets substantially more vertical lift, and S
    // becomes a controlled drop-away. This prevents directional push-offs from feeling
    // like the mountain is always throwing the player backwards.
    let awayMultiplier = 1 - directionalIntent
      * (1 - CLIMBING_CONFIG.pushOffDirectionalAwayMultiplier);
    if (upwardIntent > 0) {
      awayMultiplier = Math.min(awayMultiplier, CLIMBING_CONFIG.pushOffUpAwayMultiplier);
    }
    const velocity = this.surfaceNormal.clone().mulScalar(
      CLIMBING_CONFIG.pushOffAwayStrength * awayMultiplier
    );
    velocity.add(
      this.surfaceRight.clone().mulScalar(axes.x * CLIMBING_CONFIG.pushOffLateralStrength)
    );
    velocity.y += CLIMBING_CONFIG.pushOffBaseUpStrength
      + upwardIntent * CLIMBING_CONFIG.pushOffUpInputStrength;
    if (downwardIntent > 0) {
      // Down + jump is an intentional drop-away, even on a face whose normal points slightly up.
      velocity.y += (-CLIMBING_CONFIG.pushOffDownInputStrength - velocity.y) * downwardIntent;
    }
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (horizontalSpeed > CLIMBING_CONFIG.maximumPushOffHorizontalSpeed) {
      const scale = CLIMBING_CONFIG.maximumPushOffHorizontalSpeed / horizontalSpeed;
      velocity.x *= scale;
      velocity.z *= scale;
    }
    return velocity;
  }

  clearTransferProtection() {
    this.reattachTimer = 0;
    this.sameSurfaceBlockTimer = 0;
    this.blockedSurfaceHandle = null;
    this.pushStartNormal.set(0, 0, 0);
    this.transitionMomentum.set(0, 0, 0);
    this.lastPushDirection.set(0, 0, 0);
  }

  getSurfaceStaminaMultiplier() {
    return this.getSurfaceMaterial().staminaMultiplier;
  }

  getSurfaceMaterial() {
    if (this.surface?.material) return this.surface.material;
    const fallback = getClimbMaterial(this.surface?.type === 'difficult' ? 'smooth' : this.surface?.type);
    if (this.surface?.staminaMultiplier === undefined) return fallback;
    return {
      ...fallback,
      staminaMultiplier: this.surface.staminaMultiplier
    };
  }

  getSurfaceSlipRate() {
    return this.getSurfaceMaterial().slipRate;
  }

  supportsSurfaceNormal(normal, surface = this.surface) {
    const material = surface?.material ?? getClimbMaterial(surface?.type);
    return material.grippable
      && normal.y >= Math.max(CLIMBING_CONFIG.minSurfaceNormalY, material.minimumSurfaceNormalY);
  }

  getOverhangMultiplier() {
    return 1 + Math.max(0, -this.surfaceNormal.y) * CLIMBING_CONFIG.overhangDrainScale;
  }

  getSurfaceAngleDegrees() {
    return Math.acos(clamp(this.surfaceNormal.y, -1, 1)) * 180 / Math.PI;
  }

  getDebugState() {
    return {
      selected: this.surface?.label ?? this.surface?.type ?? 'none',
      selectedHandle: this.surface?.collider?.handle ?? null,
      candidates: this.debugCandidates.map((candidate) => ({
        label: candidate.label,
        handle: candidate.handle,
        distance: candidate.distance,
        score: candidate.score,
        current: Boolean(candidate.current)
      })),
      probeHits: this.debugProbeHits.length,
      acceptedProbeHits: this.debugProbeHits.filter((hit) => hit.accepted).length,
      rejection: this.lastGripRejection,
      switch: this.lastSurfaceSwitch,
      mantle: {
        source: this.mantleDebug.source,
        status: this.mantleDebug.status,
        lip: this.mantleDebug.lip ? { ...this.mantleDebug.lip } : null,
        target: this.mantleDebug.target ? { ...this.mantleDebug.target } : null,
        chestProbe: this.mantleDebug.chestProbe ? { ...this.mantleDebug.chestProbe } : null,
        headProbe: this.mantleDebug.headProbe ? { ...this.mantleDebug.headProbe } : null,
        candidate: this.mantleDebug.candidate ? { ...this.mantleDebug.candidate } : null,
        landingSlope: this.mantleDebug.landingSlope,
        reach: this.mantleDebug.reach,
        probes: this.mantleDebug.probes
      }
    };
  }
}

export { IDENTITY_ROTATION };
