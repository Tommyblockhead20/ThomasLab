import * as pc from 'playcanvas';
import { CAMERA_CONFIG } from '../config.js';
import { calculatePresentationDistance } from './presentation-framing.js';

const DEG_TO_RAD = Math.PI / 180;

export class OrbitCamera {
  constructor(app, canvas, physicsWorld, RAPIER, player, hud) {
    this.app = app;
    this.canvas = canvas;
    this.physicsWorld = physicsWorld;
    this.RAPIER = RAPIER;
    this.player = player;
    this.hud = hud;
    this.yaw = CAMERA_CONFIG.startYaw;
    this.pitch = CAMERA_CONFIG.startPitch;
    this.renderYaw = this.yaw;
    this.renderPitch = this.pitch;
    this.distance = CAMERA_CONFIG.distance;
    this.collisionDistance = this.distance;
    this.obstructionDistance = this.distance;
    this.obstructionHandle = null;
    this.presentationAmount = 0;
    this.smoothedTarget = new pc.Vec3();
    this.desiredTarget = new pc.Vec3();
    this.desiredPosition = new pc.Vec3();
    this.smoothedPosition = new pc.Vec3();
    this.rayDirection = new pc.Vec3();
    this.forward = new pc.Vec3(0, 0, -1);
    this.right = new pc.Vec3(1, 0, 0);
    this.dragging = false;
    this.dragDistance = 0;
    this.touchPointerId = null;
    this.touchLastX = 0;
    this.touchLastY = 0;
    this.lastPointerWasTouch = false;

    this.entity = new pc.Entity('Third-person camera');
    this.entity.addComponent('camera', {
      clearColor: new pc.Color(0.42, 0.68, 0.77),
      farClip: 480,
      nearClip: 0.08,
      fov: 54
    });
    this.app.root.addChild(this.entity);

    const start = this.player.getPosition();
    this.smoothedTarget.set(start.x, start.y + CAMERA_CONFIG.targetHeight, start.z);
    this.smoothedPosition.copy(this.smoothedTarget).add(new pc.Vec3(5, 3, 5));
    this.entity.setPosition(this.smoothedPosition);
    this.entity.lookAt(this.smoothedTarget);

    this.onCanvasMouseDown = (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.dragDistance = 0;
    };

    this.onCanvasClick = () => {
      if (this.lastPointerWasTouch
        || this.player.input.mobileMode
        || this.dragDistance > 4
        || document.pointerLockElement === this.canvas) return;
      const nearWorldInteraction = Boolean(this.player.benchSeat)
        || (!this.player.fishing?.active && Boolean(
          this.player.surfaceRegistry?.getNearestHomeInteraction?.(this.player.getPosition())
        ));
      if (this.player.input.hasDeliberateClick?.() && nearWorldInteraction) return;
      this.player.input.discardDeliberateClick?.();
      try {
        this.canvas.focus();
        this.canvas.requestPointerLock()?.catch(() => {});
      } catch {
        // Drag orbit remains available in embedded browsers that disallow pointer lock.
      }
    };

    this.onMouseUp = () => {
      this.dragging = false;
    };

    this.onMouseMove = (event) => {
      if (document.pointerLockElement !== this.canvas && !this.dragging) return;
      // A primary hold is Grip/fishing ownership, not a second camera gesture. Ordinary
      // pointer-lock look and un-pointerlocked drag both work while no primary action owns it.
      if (this.player.input.primaryHeld) return;
      if (this.dragging) {
        this.dragDistance += Math.abs(event.movementX) + Math.abs(event.movementY);
      }
      this.yaw -= event.movementX * CAMERA_CONFIG.sensitivity;
      this.pitch = pc.math.clamp(
        this.pitch - event.movementY * CAMERA_CONFIG.sensitivity,
        CAMERA_CONFIG.minPitch,
        CAMERA_CONFIG.maxPitch
      );
    };

    this.onCanvasPointerDown = (event) => {
      this.lastPointerWasTouch = event.pointerType === 'touch';
      if (event.pointerType !== 'touch' || this.touchPointerId !== null) return;
      event.preventDefault();
      this.player.input.setMobileMode(true);
      this.touchPointerId = event.pointerId;
      this.touchLastX = event.clientX;
      this.touchLastY = event.clientY;
      this.canvas.setPointerCapture?.(event.pointerId);
    };

    this.onCanvasPointerMove = (event) => {
      if (event.pointerId !== this.touchPointerId) return;
      event.preventDefault();
      const deltaX = event.clientX - this.touchLastX;
      const deltaY = event.clientY - this.touchLastY;
      this.touchLastX = event.clientX;
      this.touchLastY = event.clientY;
      this.yaw -= deltaX * CAMERA_CONFIG.touchSensitivity;
      this.pitch = pc.math.clamp(
        this.pitch - deltaY * CAMERA_CONFIG.touchSensitivity,
        CAMERA_CONFIG.minPitch,
        CAMERA_CONFIG.maxPitch
      );
    };

    this.onCanvasPointerUp = (event) => {
      if (event.pointerId !== this.touchPointerId) return;
      event.preventDefault();
      this.touchPointerId = null;
    };

    this.onPointerLockChange = () => {
      this.hud.setPointerLocked(document.pointerLockElement === this.canvas);
    };

    this.onContextMenu = (event) => event.preventDefault();

    this.canvas.addEventListener('mousedown', this.onCanvasMouseDown);
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown, { passive: false });
    this.canvas.addEventListener('pointermove', this.onCanvasPointerMove, { passive: false });
    this.canvas.addEventListener('pointerup', this.onCanvasPointerUp, { passive: false });
    this.canvas.addEventListener('pointercancel', this.onCanvasPointerUp, { passive: false });
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  getPlanarAxes() {
    return { forward: this.forward, right: this.right };
  }

  setYaw(yaw) {
    this.yaw = yaw;
    this.renderYaw = yaw;
  }

  getPresentationBounds() {
    if (!this.player.fishing?.presentationActive) return null;
    this.player.visualRoot.syncHierarchy();
    const renders = this.player.visualRoot.findComponents('render');
    let bounds = null;
    for (const render of renders) {
      let hierarchyEnabled = true;
      for (let entity = render.entity; entity; entity = entity.parent) {
        if (!entity.enabled) {
          hierarchyEnabled = false;
          break;
        }
      }
      if (!render.enabled || !hierarchyEnabled) continue;
      for (const meshInstance of render.meshInstances ?? []) {
        if (meshInstance.visible === false) continue;
        if (!bounds) bounds = meshInstance.aabb.clone();
        else bounds.add(meshInstance.aabb);
      }
    }
    if (!bounds) return null;
    return {
      center: bounds.center.clone(),
      radius: Math.max(.15, bounds.halfExtents.length())
    };
  }

  update(dt, snap = false) {
    const playerPosition = this.player.getPosition();
    const presentingCatch = this.player.fishing?.presentationActive;
    const presentationBounds = this.getPresentationBounds();
    const presentationTarget = presentingCatch ? 1 : 0;
    this.presentationAmount += (presentationTarget - this.presentationAmount)
      * (snap ? 1 : 1 - Math.exp(-4.8 * dt));
    const climbing = this.player.movementState === 'climbing'
      || this.player.movementState === 'mantling';
    const baseTargetHeight = climbing
      ? CAMERA_CONFIG.climbingTargetHeight
      : CAMERA_CONFIG.targetHeight;
    const targetHeight = pc.math.lerp(
      baseTargetHeight,
      0.44,
      this.presentationAmount
    );
    const climbOutset = climbing
      ? this.player.climbing.surfaceNormal.clone().mulScalar(CAMERA_CONFIG.climbingTargetOutset)
      : pc.Vec3.ZERO;
    this.desiredTarget.set(
      playerPosition.x + climbOutset.x,
      playerPosition.y + targetHeight,
      playerPosition.z + climbOutset.z
    );
    if (presentationBounds) {
      this.desiredTarget.lerp(
        this.desiredTarget,
        presentationBounds.center,
        this.presentationAmount
      );
    }

    const targetSharpness = climbing
      ? CAMERA_CONFIG.climbingTargetSharpness
      : CAMERA_CONFIG.targetSharpness;
    const followAmount = snap ? 1 : 1 - Math.exp(-targetSharpness * dt);
    this.smoothedTarget.lerp(this.smoothedTarget, this.desiredTarget, followAmount);

    const rotationAmount = snap ? 1 : 1 - Math.exp(-CAMERA_CONFIG.rotationSharpness * dt);
    const yawDelta = ((this.yaw - this.renderYaw + 540) % 360) - 180;
    this.renderYaw += yawDelta * rotationAmount;
    this.renderPitch += (this.pitch - this.renderPitch) * rotationAmount;

    const yawRadians = (this.renderYaw + this.presentationAmount * 168) * DEG_TO_RAD;
    const pitchRadians = this.renderPitch * DEG_TO_RAD;
    const aspect = this.app.graphicsDevice.width / Math.max(1, this.app.graphicsDevice.height);
    const presentationDistance = presentationBounds
      ? calculatePresentationDistance(presentationBounds.radius, 47, aspect)
      : 3.35;
    const framedDistance = pc.math.lerp(this.distance, presentationDistance, this.presentationAmount);
    const horizontalDistance = Math.cos(pitchRadians) * framedDistance;
    this.rayDirection.set(
      Math.sin(yawRadians) * horizontalDistance,
      -Math.sin(pitchRadians) * framedDistance,
      Math.cos(yawRadians) * horizontalDistance
    );
    this.desiredPosition.copy(this.smoothedTarget).add(this.rayDirection);

    this.rayDirection.sub2(this.desiredPosition, this.smoothedTarget);
    const requestedDistance = this.rayDirection.length();
    this.rayDirection.mulScalar(1 / Math.max(requestedDistance, 0.0001));

    const probeSide = new pc.Vec3(-this.rayDirection.z, 0, this.rayDirection.x);
    if (probeSide.lengthSq() > 0.001) probeSide.normalize();
    let safeDistance = requestedDistance;
    let obstructionHandle = null;
    for (const offset of [0, -CAMERA_CONFIG.obstructionProbeOffset, CAMERA_CONFIG.obstructionProbeOffset]) {
      const rayOrigin = {
        x: this.smoothedTarget.x + probeSide.x * offset,
        y: this.smoothedTarget.y,
        z: this.smoothedTarget.z + probeSide.z * offset
      };
      const ray = new this.RAPIER.Ray(rayOrigin, {
        x: this.rayDirection.x,
        y: this.rayDirection.y,
        z: this.rayDirection.z
      });
      const hit = this.physicsWorld.castRay(
        ray,
        requestedDistance,
        true,
        undefined,
        undefined,
        this.player.collider
      );
      if (!hit) continue;
      const candidateDistance = Math.max(
        CAMERA_CONFIG.minDistance,
        hit.timeOfImpact - CAMERA_CONFIG.obstructionPadding
      );
      if (candidateDistance < safeDistance) {
        safeDistance = candidateDistance;
        obstructionHandle = hit.collider?.handle ?? null;
      }
    }
    // Catch presentation is a deliberate inspection shot. Large bounds can place the
    // camera far beyond nearby scenery; letting an incidental rock collapse that distance
    // makes the creature disappear behind the near plane. Ease out obstruction only for
    // this shot, then restore the ordinary collision camera as presentation closes.
    safeDistance = pc.math.lerp(safeDistance, requestedDistance, this.presentationAmount);
    if (this.presentationAmount > .98) obstructionHandle = null;
    this.obstructionDistance = safeDistance;
    this.obstructionHandle = obstructionHandle;
    const obstructionSharpness = safeDistance < this.collisionDistance
      ? CAMERA_CONFIG.obstructionInSharpness
      : CAMERA_CONFIG.obstructionOutSharpness;
    const obstructionAmount = snap ? 1 : 1 - Math.exp(-obstructionSharpness * dt);
    this.collisionDistance += (safeDistance - this.collisionDistance) * obstructionAmount;
    // Never leave the camera beyond a newly detected wall while the inward easing catches up.
    this.collisionDistance = Math.min(this.collisionDistance, safeDistance + 0.08);
    this.desiredPosition.copy(this.smoothedTarget).add(
      this.rayDirection.clone().mulScalar(this.collisionDistance)
    );

    this.smoothedPosition.copy(this.desiredPosition);
    this.entity.setPosition(this.smoothedPosition);
    this.entity.lookAt(this.smoothedTarget);
    this.entity.camera.fov = pc.math.lerp(54, 47, this.presentationAmount);

    this.forward.copy(this.entity.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.copy(this.entity.right);
    this.right.y = 0;
    this.right.normalize();
  }

  getDebugState() {
    return {
      yaw: this.renderYaw,
      pitch: this.renderPitch,
      distance: this.collisionDistance,
      requestedDistance: this.distance,
      obstructionDistance: this.obstructionDistance,
      obstructionHandle: this.obstructionHandle,
      pointerLocked: document.pointerLockElement === this.canvas,
      inputMode: this.player.input.mobileMode ? 'touch' : 'desktop'
    };
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this.onCanvasMouseDown);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.removeEventListener('pointerup', this.onCanvasPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onCanvasPointerUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
