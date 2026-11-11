// Authoring coordinates are shared by the visible hull and contact solver.
export const SHIP_WIDTH_SCALE = 1.4;
export const SHIP_LENGTH_SCALE = 3.4;
export const SHIP_SCALE = SHIP_WIDTH_SCALE;
export const SHIP_HEIGHT_SCALE = 1.15;
export const CHART_SCALE = 1;
export const SEA_SCALE = 1;
export const SEA_LEVEL = -18.4;
export const NAVIGATION_RATE = 1.5;
export const HULL_BOW = 38 * SHIP_LENGTH_SCALE;
export const HULL_STERN = 34 * SHIP_LENGTH_SCALE;
export const HULL_HALF_WIDTH = 10 * SHIP_WIDTH_SCALE;
export interface Point {
  x: number;
  z: number;
}

export const HULL_OUTLINE: Point[] = [
  { x: -8, z: 31 },
  { x: -10, z: 24 },
  { x: -10, z: -25 },
];
function curve(control: Point, end: Point) {
  const start = HULL_OUTLINE.at(-1)!;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24,
      u = 1 - t;
    HULL_OUTLINE.push({
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      z: u * u * start.z + 2 * u * t * control.z + t * t * end.z,
    });
  }
}
curve({ x: -8, z: -32 }, { x: 0, z: -38 });
curve({ x: 8, z: -32 }, { x: 10, z: -25 });
HULL_OUTLINE.push({ x: 10, z: 24 }, { x: 8, z: 31 });
curve({ x: 0, z: 37 }, { x: -8, z: 31 });

export const NAV_HULL_OUTLINE = HULL_OUTLINE.map((p) => ({
  x: p.x * SHIP_WIDTH_SCALE,
  z: p.z * SHIP_LENGTH_SCALE,
}));
export function hullContact(center: Point, radius: number, outline = NAV_HULL_OUTLINE) {
  let distance2 = Infinity,
    point = { x: 0, z: 0 },
    inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j],
      b = outline[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    if (
      a.z > center.z !== b.z > center.z &&
      center.x < ((b.x - a.x) * (center.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
    const t = Math.max(
      0,
      Math.min(1, ((center.x - a.x) * dx + (center.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    const q = { x: a.x + dx * t, z: a.z + dz * t },
      d = (center.x - q.x) ** 2 + (center.z - q.z) ** 2;
    if (d < distance2) {
      distance2 = d;
      point = q;
    }
  }
  const distance = Math.sqrt(distance2),
    signedDistance = inside ? -distance : distance;
  const direction = inside ? -1 : 1;
  const normal =
    distance > 1e-8
      ? {
          x: ((center.x - point.x) / distance) * direction,
          z: ((center.z - point.z) / distance) * direction,
        }
      : { x: 0, z: -1 };
  return {
    point,
    normal,
    gap: signedDistance - radius,
    penetration: Math.max(0, radius - signedDistance),
  };
}

export function iceRelative(
  ice: { west: number; north: number },
  ship: { west: number; north: number; heading: number },
) {
  const angle = ((ship.heading - 270) * Math.PI) / 180,
    dw = ice.west - ship.west,
    dn = ice.north - ship.north;
  return {
    x: (-dw * Math.sin(angle) + dn * Math.cos(angle)) * CHART_SCALE,
    z: -(dw * Math.cos(angle) + dn * Math.sin(angle)) * CHART_SCALE,
  };
}
export function shipPose(progress: number, side = 1) {
  const t = Math.max(0, Math.min(1, progress)),
    smooth = (v: number) => {
      const x = Math.max(0, Math.min(1, v));
      return x * x * (3 - 2 * x);
    };
  const plunge = smooth((t - 0.24) / 0.76);
  return {
    pitch: -0.055 * smooth(t / 0.28) - 0.62 * plunge,
    roll: side * (0.035 * smooth(t / 0.2) + 0.12 * plunge),
    heave: -0.6 * smooth(t / 0.25) - 105 * plunge * plunge * plunge,
  };
}
