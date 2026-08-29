export class FishingZone {
  constructor({
    id, label, center, radii, surfaceY, fishIds, modifiers = {}, exclusions = [],
    depth = 'shallow', shape = 'ellipse', innerRadius = 0, outerRadius = 0,
    renderedInnerRadius = null, containsRenderedWater = null
  }) {
    this.id = id;
    this.label = label;
    this.center = { ...center };
    this.shape = shape;
    this.radii = radii ? { ...radii } : null;
    this.innerRadius = innerRadius;
    // Annulus ecology may intentionally begin farther offshore than the visible mesh. Cast
    // validity uses the rendered footprint. Mountain builders should pass the exact mesh
    // radius; the 3.2 m fallback covers the current shoreline-water overlap without geometry edits.
    this.renderedInnerRadius = shape === 'annulus'
      ? Math.max(0, Number.isFinite(renderedInnerRadius) ? renderedInnerRadius : innerRadius - 3.2)
      : innerRadius;
    this.containsRenderedWater = typeof containsRenderedWater === 'function' ? containsRenderedWater : null;
    this.outerRadius = outerRadius;
    this.surfaceY = surfaceY;
    this.fishIds = [...fishIds];
    this.modifiers = { ...modifiers };
    this.exclusions = exclusions.map((exclusion) => ({ ...exclusion }));
    this.depth = depth;
  }

  normalizedRadius(point) {
    if (this.shape === 'annulus') {
      const radial = this.radialDistance(point);
      return (radial - this.innerRadius) / Math.max(.001, this.outerRadius - this.innerRadius);
    }
    const dx = (point.x - this.center.x) / this.radii.x;
    const dz = (point.z - this.center.z) / this.radii.z;
    return Math.hypot(dx, dz);
  }

  radialDistance(point) {
    return Math.hypot(point.x - this.center.x, point.z - this.center.z);
  }

  isExcluded(point) {
    return this.exclusions.some((area) => (
      Math.abs(point.x - area.x) <= area.width / 2
      && Math.abs(point.z - area.z) <= area.depth / 2
    ));
  }

  contains(point, margin = 0) {
    if (this.shape === 'annulus') {
      const radius = this.radialDistance(point);
      return radius >= this.innerRadius + margin
        && radius <= this.outerRadius - margin
        && !this.isExcluded(point);
    }
    const radiusScale = Math.max(0.05, 1 - margin / Math.min(this.radii.x, this.radii.z));
    return this.normalizedRadius(point) <= radiusScale && !this.isExcluded(point);
  }


  containsWaterFootprint(point, margin = 0) {
    if (this.shape === 'annulus') {
      const radius = this.radialDistance(point);
      if (this.containsRenderedWater) {
        return this.containsRenderedWater(point, margin)
          && radius <= this.outerRadius - margin
          && !this.isExcluded(point);
      }
      return radius >= this.renderedInnerRadius + margin
        && radius <= this.outerRadius - margin
        && !this.isExcluded(point);
    }
    return this.contains(point, margin);
  }

  distanceToWater(point) {
    if (this.containsWaterFootprint(point)) return 0;
    if (this.shape === 'annulus') {
      const radius = this.radialDistance(point);
      if (radius < this.renderedInnerRadius) return this.renderedInnerRadius - radius;
      return Math.max(0, radius - this.outerRadius);
    }
    return Math.max(0, this.normalizedRadius(point) - 1) * Math.min(this.radii.x, this.radii.z);
  }

  clampToWater(point, margin = 0.35) {
    const dx = point.x - this.center.x;
    const dz = point.z - this.center.z;
    if (this.shape === 'annulus') {
      const radial = Math.hypot(dx, dz);
      const minimum = this.renderedInnerRadius + margin;
      const maximum = Math.max(minimum, this.outerRadius - margin);
      const targetRadius = Math.min(maximum, Math.max(minimum, radial));
      const scale = targetRadius / Math.max(.001, radial);
      return {
        x: this.center.x + (radial > .001 ? dx * scale : targetRadius),
        y: this.surfaceY,
        z: this.center.z + (radial > .001 ? dz * scale : 0)
      };
    }
    const normalized = Math.hypot(dx / this.radii.x, dz / this.radii.z);
    const maximum = Math.max(0.1, 1 - margin / Math.min(this.radii.x, this.radii.z));
    const scale = normalized > maximum ? maximum / normalized : 1;
    return {
      x: this.center.x + dx * scale,
      y: this.surfaceY,
      z: this.center.z + dz * scale
    };
  }

  canCastFrom(point, maximumCastDistance, verticalTolerance = 3.5) {
    if (Math.abs(point.y - this.surfaceY) > verticalTolerance) return false;
    return this.distanceToWater(point) <= maximumCastDistance;
  }
}
