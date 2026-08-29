const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + ((((b - a) + 540) % 360) - 180) * t;

export class SnapshotBuffer {
  constructor({ interpolationDelayMs = 100, maximumSnapshots = 32 } = {}) {
    this.interpolationDelayMs = interpolationDelayMs;
    this.maximumSnapshots = maximumSnapshots;
    this.snapshots = [];
  }

  push(snapshot) {
    const serverTime = Number(snapshot?.serverTime ?? snapshot?.sentAt);
    const position = snapshot?.position;
    if (!Number.isFinite(serverTime) || !position || !['x', 'y', 'z'].every((axis) => Number.isFinite(position[axis]))) return false;
    this.snapshots.push({ ...snapshot, serverTime });
    this.snapshots.sort((a, b) => a.serverTime - b.serverTime);
    this.snapshots = this.snapshots.slice(-this.maximumSnapshots);
    return true;
  }

  sample(now = Date.now()) {
    if (!this.snapshots.length) return null;
    const renderTime = now - this.interpolationDelayMs;
    let before = this.snapshots[0];
    let after = this.snapshots.at(-1);
    for (let index = 1; index < this.snapshots.length; index += 1) {
      if (this.snapshots[index].serverTime >= renderTime) {
        before = this.snapshots[index - 1];
        after = this.snapshots[index];
        break;
      }
    }
    const span = Math.max(1, after.serverTime - before.serverTime);
    const t = Math.max(0, Math.min(1, (renderTime - before.serverTime) / span));
    return {
      ...after,
      position: {
        x: lerp(before.position.x, after.position.x, t),
        y: lerp(before.position.y, after.position.y, t),
        z: lerp(before.position.z, after.position.z, t)
      },
      yaw: lerpAngle(Number(before.yaw) || 0, Number(after.yaw) || 0, t)
    };
  }

  clear() { this.snapshots.length = 0; }
}
