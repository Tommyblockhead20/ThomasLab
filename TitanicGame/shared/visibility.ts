import { NAVIGATION_RATE, HULL_BOW } from './navigation';
export const CLEAR_FOG_DENSITY = 0.00195;
export const HORIZON_LIGHT = [0.023, 0.045, 0.061] as const;
export function fogDensity(visibility = 1, eyeAboveWater = 20.08) {
  const elevation = Math.max(0, Math.min(1, (eyeAboveWater - 20.08) / 8.05));
  return (CLEAR_FOG_DENSITY + Math.max(0, 1 - visibility) * 0.0025) * (1 - 0.05 * elevation);
}
export function iceSightSignal(
  distance: number,
  height: number,
  binoculars: boolean,
  visibility = 1,
  eyeAboveWater = 20.08,
) {
  const contrast = Math.exp(-((fogDensity(visibility, eyeAboveWater) * distance) ** 2));
  const pixels = (Math.atan2(height, distance) * 720) / (((binoculars ? 19 : 76) * Math.PI) / 180);
  return { contrast, pixels, signal: contrast * Math.pow(pixels, 0.9) };
}
export function distanceAtWarning(seconds: number, observerAhead: number, speed = 20, radius = 46) {
  return HULL_BOW + radius + speed * 0.514444 * NAVIGATION_RATE * seconds - observerAhead;
}
