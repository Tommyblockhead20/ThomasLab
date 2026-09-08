import { resolveSpecies } from './fish-data.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// PlayCanvas sphere scales describe full ellipsoid diameters. At the eye's authored
// X/Y point, find the head's local Z surface and sink part of the eye into it.
export function calculateEyeAttachment({
  headCenterX = 0,
  headCenterY = 0,
  headLength,
  headHeight,
  headWidth,
  eyeX,
  eyeY,
  eyeDepth,
  overlapFraction = .22
}) {
  const halfLength = Math.max(.0001, Math.abs(headLength) * .5);
  const halfHeight = Math.max(.0001, Math.abs(headHeight) * .5);
  const halfWidth = Math.max(.0001, Math.abs(headWidth) * .5);
  const eyeHalfDepth = Math.max(.0001, Math.abs(eyeDepth) * .5);
  const normalizedX = (eyeX - headCenterX) / halfLength;
  const normalizedY = (eyeY - headCenterY) / halfHeight;
  const surfaceFactor = Math.sqrt(clamp(1 - normalizedX ** 2 - normalizedY ** 2, .16, 1));
  const headSurfaceOffset = halfWidth * surfaceFactor;
  const overlapDepth = eyeHalfDepth * 2 * clamp(overlapFraction, .08, .38);
  const centerOffset = headSurfaceOffset + eyeHalfDepth - overlapDepth;
  return Object.freeze({
    centerOffset,
    headSurfaceOffset,
    eyeHalfDepth,
    overlapDepth,
    visibleFraction: 1 - overlapDepth / (eyeHalfDepth * 2)
  });
}

export const GENERIC_CREATURE_VISUAL = Object.freeze({
  archetype: 'panfish',
  colors: Object.freeze([[.3, .66, .48], [.84, .56, .22]]),
  lengthScale: 1,
  depth: 1,
  width: 1
});

export const SUPPORTED_CREATURE_ARCHETYPES = Object.freeze(new Set([
  'panfish', 'slender', 'bass', 'carp', 'catfish', 'trout', 'flatfish', 'sculpin',
  'shark', 'dogfish', 'ray', 'skate',
  'octopus', 'squid', 'cuttlefish', 'jellyfish', 'anemone', 'lusca', 'softbody',
  'crab', 'lobster', 'crayfish', 'shrimp', 'insect', 'arachnid', 'horseshoe',
  'clam', 'oyster', 'mussel', 'scallop', 'bivalve', 'nautilus', 'snail',
  'turtle', 'frog', 'salamander', 'starfish', 'urchin',
  'serpent', 'dragon', 'plesiosaur', 'waterhorse', 'eel',
  'cetacean', 'pinniped', 'sirenian', 'otter', 'beaver', 'rodent', 'platypus', 'mammal',
  'wisp'
]));

const warnedPresentationFailures = new Set();

function warnOnce(key, message, warn) {
  if (!warn || warnedPresentationFailures.has(key)) return;
  warnedPresentationFailures.add(key);
  console.warn(`[Reel Ascent creature presentation] ${message}`);
}

/**
 * Canonical presentation resolver used by every 2D/3D creature display. Unknown saved IDs
 * receive the documented generic panfish fallback. Known species with invalid archetypes keep
 * their authored colors and dimensions, but use panfish geometry and report the data error once.
 */
export function resolveCreaturePresentation(specimenOrId, { context = 'display', warn = true } = {}) {
  const requestedId = typeof specimenOrId === 'string'
    ? specimenOrId
    : specimenOrId?.speciesId;
  const species = resolveSpecies(requestedId, true);
  if (!species) {
    const normalizedId = String(requestedId ?? '').trim() || '(missing id)';
    warnOnce(`missing:${normalizedId}`,
      `${context}: species "${normalizedId}" was not found; using generic panfish geometry.`, warn);
    return {
      requestedId: normalizedId,
      canonicalId: normalizedId,
      species: null,
      archetype: GENERIC_CREATURE_VISUAL.archetype,
      visual: GENERIC_CREATURE_VISUAL,
      fallback: 'missing-species'
    };
  }

  const authoredArchetype = String(species.visual?.archetype ?? '').trim();
  const validArchetype = SUPPORTED_CREATURE_ARCHETYPES.has(authoredArchetype);
  if (!validArchetype) {
    warnOnce(`archetype:${species.canonicalId}:${authoredArchetype}`,
      `${context}: ${species.name} (${species.canonicalId}) has ${authoredArchetype || 'no'} archetype; using panfish geometry with its authored colors.`, warn);
  }
  const archetype = validArchetype ? authoredArchetype : GENERIC_CREATURE_VISUAL.archetype;
  return {
    requestedId: String(requestedId ?? ''),
    canonicalId: species.canonicalId,
    species,
    archetype,
    visual: Object.freeze({ ...GENERIC_CREATURE_VISUAL, ...(species.visual ?? {}), archetype }),
    fallback: validArchetype ? null : 'invalid-archetype'
  };
}

export function resetCreaturePresentationWarningsForTests() {
  warnedPresentationFailures.clear();
}
