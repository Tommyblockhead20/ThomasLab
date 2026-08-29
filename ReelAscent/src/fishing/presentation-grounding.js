export const CATCH_GROUND_MARGIN = .08;

export function calculateCatchGroundLift(lowestRenderedY, highestGroundY, margin = CATCH_GROUND_MARGIN) {
  if (!Number.isFinite(lowestRenderedY) || !Number.isFinite(highestGroundY)) return 0;
  return Math.max(0, highestGroundY + margin - lowestRenderedY);
}

export function catchGroundSamplePoints(bounds) {
  if (!bounds) return [];
  const { center, halfExtents } = bounds;
  const insetX = halfExtents.x * .78;
  const insetZ = halfExtents.z * .78;
  return [
    { x: center.x, z: center.z },
    { x: center.x - insetX, z: center.z },
    { x: center.x + insetX, z: center.z },
    { x: center.x, z: center.z - insetZ },
    { x: center.x, z: center.z + insetZ }
  ];
}
