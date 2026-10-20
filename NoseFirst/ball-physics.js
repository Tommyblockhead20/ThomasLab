// Shared by the game's rolling toys and focused physics checks.
export function stepRollingProp(object, dt, { radius, canMove, supportHeight }) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  dt = Math.min(dt, .05);
  const velocity = object.userData.velocity, p = object.position;
  const oldBottom = p.y - radius;
  const steps = Math.max(1, Math.ceil(Math.hypot(velocity.x, velocity.z) * dt / .05));
  for (let i = 0; i < steps; i++) {
    const dx = velocity.x * dt / steps, dz = velocity.z * dt / steps;
    if (canMove(p.x + dx, p.z, p.y - radius, radius * 2)) p.x += dx; else velocity.x *= -.42;
    if (canMove(p.x, p.z + dz, p.y - radius, radius * 2)) p.z += dz; else velocity.z *= -.42;
  }
  const floor = supportHeight(p.x, p.z, oldBottom + .05);
  velocity.y -= 9.65 * dt;
  p.y += velocity.y * dt;
  let grounded = false;
  if (p.y - radius <= floor && velocity.y <= 0) {
    p.y = floor + radius;
    velocity.y = -velocity.y * .33;
    if (velocity.y < .28) { velocity.y = 0; grounded = true; }
  }
  const drag = Math.pow(grounded ? .11 : .92, dt);
  velocity.x *= drag; velocity.z *= drag;
  if (Math.hypot(velocity.x, velocity.z) < .015) velocity.x = velocity.z = 0;
  if (object.rotation) {
    object.rotation.x += velocity.z * dt / radius;
    object.rotation.z -= velocity.x * dt / radius;
  }
  object.userData.propGrounded = grounded;
}
