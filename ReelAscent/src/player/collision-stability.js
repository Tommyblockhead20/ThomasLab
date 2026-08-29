const horizontalLength = (vector) => Math.hypot(vector?.x ?? 0, vector?.z ?? 0);

function normalizedHorizontal(vector) {
  const length = horizontalLength(vector);
  if (length < 0.0001) return null;
  return { x: vector.x / length, z: vector.z / length };
}

/**
 * Rapier can alternate between two equally-valid depenetration answers when the capsule is
 * trapped in a narrow V / rock seam. Once that happens there is no useful physical motion to
 * preserve: applying the vertical part while deleting only X/Z still lets the controller bounce
 * between "grounded" and "sliding" solutions. A true wedge therefore kills the ENTIRE movement
 * vector for the frame. Player owns the longer-lived contact lock / escape-direction logic.
 */
export function stabilizeWedgeMovement(desiredMovement, correctedMovement, collisionNormals = []) {
  const sideNormals = collisionNormals
    .map(normalizedHorizontal)
    .filter(Boolean);
  let opposingContacts = false;
  for (let first = 0; first < sideNormals.length && !opposingContacts; first += 1) {
    for (let second = first + 1; second < sideNormals.length; second += 1) {
      const dot = sideNormals[first].x * sideNormals[second].x
        + sideNormals[first].z * sideNormals[second].z;
      // Require substantially opposed walls. This still leaves normal one-wall sliding alone.
      if (dot < -.18) {
        opposingContacts = true;
        break;
      }
    }
  }

  const desiredHorizontal = horizontalLength(desiredMovement);
  const correctedHorizontal = horizontalLength(correctedMovement);
  const blockedRatio = desiredHorizontal > 0.0001
    ? correctedHorizontal / desiredHorizontal
    : correctedHorizontal > 0.0001 ? 0 : 1;
  const desiredDirection = normalizedHorizontal(desiredMovement);
  const correctedDirection = normalizedHorizontal(correctedMovement);
  const forwardProgress = desiredDirection && correctedDirection
    ? desiredDirection.x * correctedDirection.x + desiredDirection.z * correctedDirection.z
    : 0;
  const blocked = desiredHorizontal <= 0.0001
    ? correctedHorizontal > 0.0001
    : blockedRatio < .62 || forwardProgress < .28;

  if (!opposingContacts || !blocked) {
    return {
      x: correctedMovement.x,
      y: correctedMovement.y,
      z: correctedMovement.z,
      stabilized: false,
      opposingContacts,
      blocked
    };
  }

  // Do not leave Y alive here. That was the remaining source of visible vertical rock jitter.
  return {
    x: 0,
    y: 0,
    z: 0,
    stabilized: true,
    opposingContacts: true,
    blocked: true
  };
}
