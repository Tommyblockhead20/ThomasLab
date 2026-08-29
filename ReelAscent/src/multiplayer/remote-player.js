import { SnapshotBuffer } from './interpolation.js';

export class RemotePlayer {
  constructor(playerId, representation = null) {
    this.playerId = playerId;
    this.representation = representation;
    this.snapshots = new SnapshotBuffer();
    this.fishingState = null;
    this.movement = 'airborne';
    this.lastSample = null;
    this.lastSampleAt = null;
  }

  consumeSnapshot(snapshot) {
    if (snapshot?.playerId !== this.playerId) return false;
    if (snapshot.appearance !== undefined) this.representation?.setAppearance?.(snapshot.appearance);
    if (snapshot.fishingState !== undefined) {
      this.fishingState = snapshot.fishingState;
      this.representation?.setFishingState?.(snapshot.fishingState);
    }
    if (typeof snapshot.movement === 'string') this.movement = snapshot.movement;
    if (snapshot.emote !== undefined) this.representation?.setEmote?.(snapshot.emote);
    return this.snapshots.push(snapshot);
  }

  update(now = Date.now()) {
    const sample = this.snapshots.sample(now);
    if (!sample) return null;
    this.representation?.setPosition?.(sample.position.x, sample.position.y, sample.position.z);
    this.representation?.setEulerAngles?.(0, sample.yaw, 0);
    const elapsed = this.lastSampleAt === null ? 0 : Math.max(.001, (now - this.lastSampleAt) / 1000);
    const speed = this.lastSample && elapsed > 0
      ? Math.hypot(
          sample.position.x - this.lastSample.x,
          sample.position.y - this.lastSample.y,
          sample.position.z - this.lastSample.z
        ) / elapsed
      : 0;
    this.representation?.setMovementState?.(sample.movement ?? this.movement, now, speed);
    this.lastSample = { ...sample.position };
    this.lastSampleAt = now;
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
