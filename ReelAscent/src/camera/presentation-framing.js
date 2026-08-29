const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/** Return the camera distance needed to contain a world-space bounding sphere. */
export function calculatePresentationDistance(radius, verticalFovDegrees = 47, aspect = 16 / 9) {
  const verticalHalfFov = clamp(verticalFovDegrees, 20, 100) * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(.35, aspect));
  const limitingHalfFov = Math.max(.12, Math.min(verticalHalfFov, horizontalHalfFov));
  const fitted = Math.max(.15, radius) / Math.sin(limitingHalfFov);
  // Bounds still set the real scale relationship; this is only a tighter safety margin.
  // A small absolute pad protects tiny catches, while the near-unity multiplier prevents
  // huge catches from accumulating an unnecessarily large retreat distance.
  return clamp(fitted * 1.04 + .08, 2.2, 90);
}
