const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (value) => value * value * (3 - 2 * value);

export const CONTACT_RECOVERY_MIN_SECONDS = .18;
export const CONTACT_RECOVERY_MAX_SECONDS = .3;

export function createContactRecovery(start, target) {
  const distance = Math.hypot(target.x - start.x, target.y - start.y, target.z - start.z);
  return {
    start: { ...start },
    target: { ...target },
    elapsed: 0,
    duration: clamp(.16 + distance * .06, CONTACT_RECOVERY_MIN_SECONDS, CONTACT_RECOVERY_MAX_SECONDS)
  };
}

export function sampleContactRecovery(recovery, elapsed = recovery.elapsed) {
  const progress = clamp(elapsed / Math.max(.001, recovery.duration), 0, 1);
  const eased = smoothstep(progress);
  const hop = Math.sin(progress * Math.PI) * .035;
  return {
    x: recovery.start.x + (recovery.target.x - recovery.start.x) * eased,
    y: recovery.start.y + (recovery.target.y - recovery.start.y) * eased + hop,
    z: recovery.start.z + (recovery.target.z - recovery.start.z) * eased,
    progress,
    complete: progress >= 1
  };
}
