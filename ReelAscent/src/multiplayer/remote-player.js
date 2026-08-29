import { SnapshotBuffer } from './interpolation.js';

export class RemotePlayer {
  constructor(playerId, representation = null) {
    this.playerId = playerId;
    this.representation = representation;
    this.snapshots = new SnapshotBuffer();
    this.fishingState = null;
    this.movement = 'airborne';
  }

  consumeSnapshot(snapshot) {
    if (snapshot?.playerId !== this.playerId) return false;
    if (snapshot.fishingState !== undefined) {
      this.fishingState = snapshot.fishingState;
      this.representation?.setFishingState?.(snapshot.fishingState);
    }
    if (typeof snapshot.movement === 'string') this.movement = snapshot.movement;
    return this.snapshots.push(snapshot);
  }

  update(now = Date.now()) {
    const sample = this.snapshots.sample(now);
    if (!sample) return null;
    this.representation?.setPosition?.(sample.position.x, sample.position.y, sample.position.z);
    this.representation?.setEulerAngles?.(0, sample.yaw, 0);
    return sample;
  }

  destroy() {
    this.snapshots.clear();
    this.representation?.destroy?.();
    this.representation = null;
  }
}

