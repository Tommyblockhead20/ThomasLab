import { SnapshotBuffer } from './interpolation.js';

export class RemotePlayer {
  constructor(playerId, representation = null) {
    this.playerId = playerId;
    this.representation = representation;
    this.snapshots = new SnapshotBuffer();
    this.fishingState = null;
    this.displayName = '';
    this.heldItem = null;
    this.movement = 'airborne';
    this.locationId = 'main-mountain';
    this.coordinateSpace = 'global-world';
    this.globalPosition = null;
    this.localLocationId = 'main-mountain';
    this.lastSample = null;
    this.lastSampleAt = null;
  }

  consumeSnapshot(snapshot) {
    if (snapshot?.playerId !== this.playerId) return false;
    if (typeof snapshot.locationId === 'string' && snapshot.locationId) this.locationId = snapshot.locationId;
    if (typeof snapshot.coordinateSpace === 'string') this.coordinateSpace = snapshot.coordinateSpace;
    if (snapshot.globalPosition && ['x', 'y', 'z'].every((axis) => Number.isFinite(snapshot.globalPosition[axis]))) {
      this.globalPosition = { ...snapshot.globalPosition };
    } else if (snapshot.position && this.coordinateSpace === 'global-world') {
      this.globalPosition = { ...snapshot.position };
    }
    this.syncVisibility();
    if (snapshot.appearance !== undefined) this.representation?.setAppearance?.(snapshot.appearance);
    if (snapshot.posture !== undefined) this.representation?.setPosture?.(snapshot.posture);
    if (snapshot.fishingState !== undefined) {
      this.fishingState = snapshot.fishingState;
      this.representation?.setFishingState?.(snapshot.fishingState);
    }
    if (typeof snapshot.movement === 'string') this.movement = snapshot.movement;
    if (snapshot.emote !== undefined) this.representation?.setEmote?.(snapshot.emote);
    if (snapshot.heldItem !== undefined) {
      this.heldItem = snapshot.heldItem;
      this.representation?.setHeldItem?.(snapshot.heldItem);
    }
    return this.snapshots.push(snapshot);
  }

  setLocalLocationId(locationId) {
    this.localLocationId = locationId || 'main-mountain';
    this.syncVisibility();
  }

  syncVisibility() {
    const visible = this.locationId === this.localLocationId;
    if (this.representation?.setRemoteVisible) this.representation.setRemoteVisible(visible);
    else if (this.representation) this.representation.enabled = visible;
  }

  update(now = Date.now()) {
    const sample = this.snapshots.sample(now);
    if (!sample) return null;
    const previousSample = this.lastSample;
    const elapsed = this.lastSampleAt === null ? 0 : Math.max(.001, (now - this.lastSampleAt) / 1000);
    const speed = previousSample && elapsed > 0
      ? Math.hypot(
          sample.position.x - previousSample.x,
          sample.position.y - previousSample.y,
          sample.position.z - previousSample.z
        ) / elapsed
      : 0;
    this.lastSample = { ...sample.position };
    this.lastSampleAt = now;
    if (sample.globalPosition && ['x', 'y', 'z'].every((axis) => Number.isFinite(sample.globalPosition[axis]))) {
      this.globalPosition = { ...sample.globalPosition };
    } else if (this.coordinateSpace === 'global-world') this.globalPosition = { ...sample.position };
    this.syncVisibility();
    if (this.locationId === this.localLocationId) {
      this.representation?.setPosition?.(sample.position.x, sample.position.y, sample.position.z);
      this.representation?.setEulerAngles?.(0, sample.yaw, 0);
      this.representation?.setMovementState?.(sample.movement ?? this.movement, now, speed);
    }
    return sample;
  }

  showCatch(payload) { this.representation?.showCatch?.(payload); }
  clearCatch(presentationId = null) { this.representation?.clearCatch?.(presentationId); }

  destroy() {
    this.snapshots.clear();
    this.lastSample = null;
    this.representation?.destroy?.();
    this.representation = null;
  }
}
