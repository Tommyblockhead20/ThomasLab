import { SHIP_LENGTH_SCALE as L } from './navigation';
export const BREAK_Z = 17;
export const SINK_DURATION = 145;
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
function curve(t: number, points: [number, number][]) {
  for (let i = 1; i < points.length; i++)
    if (t <= points[i][0]) {
      const [a, x] = points[i - 1],
        [b, y] = points[i];
      return x + (y - x) * smooth((t - a) / (b - a));
    }
  return points.at(-1)![1];
}
export interface HullPose {
  heave: number;
  pitch: number;
  roll: number;
  z: number;
}
export function sinkingPose(seconds: number, side = 1) {
  const t = Math.max(0, seconds),
    broken = t >= 85;
  const pitch = curve(t, [
    [0, 0],
    [10, -0.02],
    [40, -0.19],
    [68, -0.34],
    [85, -0.44],
    [115, -0.95],
    [145, -1.12],
  ]);
  const heave = curve(t, [
    [0, 0],
    [10, -0.5],
    [40, -12],
    [68, -28],
    [85, -43],
    [115, -105],
    [145, -175],
  ]);
  const roll =
    side *
    curve(t, [
      [0, 0],
      [10, 0.007],
      [40, 0.025],
      [85, 0.045],
      [145, 0.08],
    ]);
  const bow: HullPose = { heave, pitch, roll, z: broken ? -(t - 85) * 0.25 : 0 };
  let stern = { ...bow };
  if (broken) {
    const p = curve(t, [
      [85, -0.44],
      [98, -0.18],
      [119, -0.93],
      [132, -1.35],
      [145, -1.37],
    ]);
    const cutY = curve(t, [
      [85, -43 - Math.sin(-0.44) * BREAK_Z * L],
      [98, -18],
      [119, -21],
      [132, -58],
      [145, -165],
    ]);
    const cutZ = Math.cos(-0.44) * BREAK_Z * L + (t - 85) * 0.16;
    stern = {
      pitch: p,
      roll: roll * 0.6,
      heave: cutY + Math.sin(p) * BREAK_Z * L,
      z: cutZ - Math.cos(p) * BREAK_Z * L,
    };
  }
  return {
    bow,
    stern,
    broken,
    lights: 1 - smooth((t - 76) / 12),
    foam: smooth((t - 100) / 25) * (1 - smooth((t - 145) / 25)),
    progress: Math.min(1, t / SINK_DURATION),
  };
}
