const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// PlayCanvas sphere scales describe full ellipsoid diameters. At the eye's authored
// X/Y point, find the head's local Z surface and sink a small, radius-derived portion
// of the eye into it. This keeps most of the eye visible without leaving an air gap.
export function calculateEyeAttachment({
  headCenterX = 0,
  headCenterY = 0,
  headLength,
  headHeight,
  headWidth,
  eyeX,
  eyeY,
  eyeDepth,
  overlapFraction = .22
}) {
  const halfLength = Math.max(.0001, Math.abs(headLength) * .5);
  const halfHeight = Math.max(.0001, Math.abs(headHeight) * .5);
  const halfWidth = Math.max(.0001, Math.abs(headWidth) * .5);
  const eyeHalfDepth = Math.max(.0001, Math.abs(eyeDepth) * .5);
  const normalizedX = (eyeX - headCenterX) / halfLength;
  const normalizedY = (eyeY - headCenterY) / halfHeight;
  const surfaceFactor = Math.sqrt(clamp(1 - normalizedX ** 2 - normalizedY ** 2, .16, 1));
  const headSurfaceOffset = halfWidth * surfaceFactor;
  const overlapDepth = eyeHalfDepth * 2 * clamp(overlapFraction, .08, .38);
  const centerOffset = headSurfaceOffset + eyeHalfDepth - overlapDepth;
  return Object.freeze({
    centerOffset,
    headSurfaceOffset,
    eyeHalfDepth,
    overlapDepth,
    visibleFraction: 1 - overlapDepth / (eyeHalfDepth * 2)
  });
}
