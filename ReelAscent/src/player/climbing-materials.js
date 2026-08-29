const definitions = {
  rough: {
    id: 'rough',
    label: 'Rough Rock',
    grippable: true,
    staminaMultiplier: 0.72,
    speedMultiplier: 1.08,
    slipRate: 0,
    idleSlipRate: 0,
    minimumSurfaceNormalY: -0.54,
    gripQuality: 1.12
  },
  normal: {
    id: 'normal',
    label: 'Normal Rock',
    grippable: true,
    staminaMultiplier: 1,
    speedMultiplier: 1,
    slipRate: 0,
    idleSlipRate: 0,
    minimumSurfaceNormalY: -0.46,
    gripQuality: 1
  },
  smooth: {
    id: 'smooth',
    label: 'Smooth Rock',
    grippable: true,
    staminaMultiplier: 1.48,
    speedMultiplier: 0.78,
    slipRate: 0.18,
    idleSlipRate: 0.46,
    minimumSurfaceNormalY: -0.34,
    gripQuality: 0.76
  },
  ice: {
    id: 'ice',
    label: 'Ice',
    grippable: true,
    staminaMultiplier: 2.05,
    speedMultiplier: 0.58,
    slipRate: 0.34,
    idleSlipRate: 0.92,
    minimumSurfaceNormalY: -0.22,
    gripQuality: 0.52
  },
  ungrippable: {
    id: 'ungrippable',
    label: 'Ungrippable',
    grippable: false,
    staminaMultiplier: Infinity,
    speedMultiplier: 0,
    slipRate: 0,
    idleSlipRate: 0,
    minimumSurfaceNormalY: 1,
    gripQuality: 0
  }
};

export const CLIMB_MATERIALS = Object.freeze(
  Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, Object.freeze(definition)])
  )
);

export const MAX_GRIP_QUALITY = Math.max(
  ...Object.values(CLIMB_MATERIALS).map((material) => material.gripQuality)
);

export function getClimbMaterial(id = 'normal') {
  return CLIMB_MATERIALS[id] ?? CLIMB_MATERIALS.normal;
}
