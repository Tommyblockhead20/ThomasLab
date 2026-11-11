import type { ChartMark } from './types';
import { METRES_PER_NM } from './units';

// Only crew estimates belong in this model. No iceberg geometry is consulted.
export function readChartMark(
  value: unknown,
  ship: { west: number; north: number },
): Omit<ChartMark, 'id' | 'by' | 'at'> {
  const v = value as Partial<ChartMark> | null;
  if (
    !v ||
    !['ice', 'area', 'bearing', 'route'].includes(v.kind ?? '') ||
    !['low', 'medium', 'high'].includes(v.confidence ?? '') ||
    !Array.isArray(v.points) ||
    v.points.length < 1 ||
    v.points.length > 64 ||
    typeof v.label !== 'string' ||
    typeof v.source !== 'string' ||
    typeof v.radius !== 'number' ||
    !Number.isFinite(v.radius) ||
    v.radius < 0 ||
    v.radius > METRES_PER_NM
  )
    throw new Error('Choose a chart tool and a valid estimate.');
  if ((v.kind === 'bearing' || v.kind === 'route') && v.points.length < 2)
    throw new Error('Draw a line with two or more points.');
  for (const p of v.points)
    if (
      !p ||
      !Number.isFinite(p.west) ||
      !Number.isFinite(p.north) ||
      Math.hypot(p.west - ship.west, p.north - ship.north) > 10 * METRES_PER_NM
    )
      throw new Error('That position is outside the working chart.');
  return {
    kind: v.kind!,
    confidence: v.confidence!,
    points: v.points.map((p) => ({ west: p.west, north: p.north })),
    radius: v.kind === 'area' ? Math.max(25, v.radius) : 0,
    label: v.label.trim().slice(0, 60),
    source: v.source.trim().slice(0, 40),
  };
}
