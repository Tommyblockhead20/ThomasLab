const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function basinTerrainHeight(baseHeight, centerHeight, basinDepth, normalizedDistance) {
  if (normalizedDistance >= 1.46) return baseHeight;
  const surfaceY = centerHeight - basinDepth + .45;
  // Make the water visibly occupy a depression rather than a nearly-flat dish. The
  // original basinDepth still controls how far the whole feature is carved below the
  // surrounding mountain, while this adds readable underwater depth and a dry rim.
  const visibleWaterDepth = clamp(.58 + basinDepth * .12, .68, .95);
  const floorY = surfaceY - visibleWaterDepth;

  if (normalizedDistance <= 1) {
    const bottomToShore = smoothstep(0, .74, normalizedDistance);
    let target = lerp(floorY, surfaceY - .16, bottomToShore);
    if (normalizedDistance > .74) {
      target = lerp(surfaceY - .16, surfaceY + .14, smoothstep(.74, 1, normalizedDistance));
    }
    const carved = Math.min(baseHeight, target);
    // Near the waterline, allow the carve to raise a narrow lip where the natural slope
    // falls away. This is what makes the shoreline visibly contain the flat water plane.
    const rimBlend = smoothstep(.78, 1, normalizedDistance);
    return lerp(carved, Math.max(baseHeight, target), rimBlend);
  }

  // A small raised bank outside the water footprint hides the water-cylinder edge and
  // guarantees that the shoreline is above the flat surface even on a downhill face.
  const bank = surfaceY + lerp(.24, .055, smoothstep(1, 1.46, normalizedDistance));
  return Math.max(baseHeight, lerp(bank, baseHeight, smoothstep(1.18, 1.46, normalizedDistance)));
}

export function summitBasinHeight(normalizedDistance, plateauY, surfaceY, basinDepth = .68) {
  if (normalizedDistance <= .7) {
    return lerp(surfaceY - basinDepth, surfaceY - .15, smoothstep(0, .7, normalizedDistance));
  }
  if (normalizedDistance <= 1) {
    return lerp(surfaceY - .15, surfaceY + .14, smoothstep(.7, 1, normalizedDistance));
  }
  return lerp(surfaceY + .14, plateauY, smoothstep(1, 1.5, normalizedDistance));
}

export function oceanFloorProfile(radius, {
  joinRadius,
  waterRadius,
  shallowEndRadius,
  outerRadius,
  shorelineY,
  surfaceY
}) {
  if (radius <= waterRadius) {
    return lerp(shorelineY, surfaceY - .18, smoothstep(joinRadius, waterRadius, radius));
  }
  if (radius <= shallowEndRadius) {
    return lerp(surfaceY - .18, surfaceY - .68, smoothstep(waterRadius, shallowEndRadius, radius));
  }
  const deep = smoothstep(shallowEndRadius, outerRadius, radius);
  return lerp(surfaceY - .68, -12.25, Math.pow(deep, 1.18));
}

export function supportAdjustment(clearances, desiredOverlap, minimumContacts = 3) {
  const sorted = clearances.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { supported: false, adjustment: 0, contactCount: 0 };
  const overlapThreshold = -desiredOverlap * .45;
  const contactCount = sorted.filter((clearance) => clearance <= overlapThreshold).length;
  if (contactCount >= Math.min(minimumContacts, sorted.length)) {
    return { supported: true, adjustment: 0, contactCount };
  }
  const contactIndex = Math.min(sorted.length - 1, Math.max(0, minimumContacts - 1));
  return {
    supported: false,
    adjustment: Math.max(0, sorted[contactIndex] + desiredOverlap * .62),
    contactCount
  };
}

export function auditRockDensity(rocks, bands, sectorCount = 18) {
  const sectors = [];
  for (const band of bands) {
    const counts = Array.from({ length: sectorCount }, () => 0);
    for (const rock of rocks) {
      if (rock.radius < band.minimumRadius || rock.radius >= band.maximumRadius) continue;
      const sector = Math.min(sectorCount - 1, Math.floor(((rock.angle % 360) + 360) % 360 / 360 * sectorCount));
      counts[sector] += 1;
    }
    const occupied = [...counts].sort((a, b) => a - b);
    const median = occupied[Math.floor(occupied.length / 2)] ?? 0;
    // Treat moderately sparse sectors as actionable too. The old 50%-of-median rule
    // generally filled only total voids, leaving visibly thin regions untouched.
    const targetCount = median >= 4
      ? Math.max(2, Math.ceil(median * .72))
      : median >= 2
        ? Math.max(1, median - 1)
        : median;
    counts.forEach((count, sector) => {
      if (count < targetCount) sectors.push({ ...band, sector, count, median, targetCount, sectorCount });
    });
  }
  return sectors;
}
