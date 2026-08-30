export const AVATAR_TYPES = Object.freeze([
  Object.freeze({ id: 'human', label: 'Human' }),
  Object.freeze({ id: 'blob', label: 'Blue Blob' })
]);

export const LEGACY_CHARACTER_PALETTE = Object.freeze({
  player: Object.freeze([0.95, 0.5, 0.22]),
  playerAccent: Object.freeze([0.99, 0.82, 0.33]),
  skin: Object.freeze([0.93, 0.72, 0.52]),
  boots: Object.freeze([0.18, 0.22, 0.18]),
  backpack: Object.freeze([0.18, 0.39, 0.34]),
  trousers: Object.freeze([0.23, 0.31, 0.29]),
  dark: Object.freeze([0.08, 0.11, 0.10])
});

export const SKIN_TONES = Object.freeze([
  Object.freeze({ id: 'porcelain', label: 'Tone 1', color: [0.97, 0.86, 0.76] }),
  Object.freeze({ id: 'light', label: 'Tone 2', color: [0.96, 0.8, 0.67] }),
  // `warm` is the exact legacy v1-v7 skin and remains the default slider stop.
  Object.freeze({ id: 'warm', label: 'Tone 3', color: [0.93, 0.72, 0.52] }),
  Object.freeze({ id: 'honey', label: 'Tone 4', color: [0.82, 0.59, 0.4] }),
  Object.freeze({ id: 'golden', label: 'Tone 5', color: [0.72, 0.47, 0.29] }),
  Object.freeze({ id: 'bronze', label: 'Tone 6', color: [0.57, 0.34, 0.21] }),
  Object.freeze({ id: 'umber', label: 'Tone 7', color: [0.43, 0.25, 0.16] }),
  Object.freeze({ id: 'deep', label: 'Tone 8', color: [0.24, 0.13, 0.09] })
]);

export const SHIRT_COLORS = Object.freeze([
  Object.freeze({ id: 'classic-orange', label: 'Classic Orange', color: [0.95, 0.5, 0.22] }),
  Object.freeze({ id: 'alpine', label: 'Alpine Blue', color: [0.17, 0.48, 0.62] }),
  Object.freeze({ id: 'ember', label: 'Ember', color: [0.72, 0.25, 0.16] }),
  Object.freeze({ id: 'moss', label: 'Moss', color: [0.25, 0.49, 0.3] }),
  Object.freeze({ id: 'sunset', label: 'Sunset', color: [0.83, 0.52, 0.18] }),
  Object.freeze({ id: 'plum', label: 'Plum', color: [0.47, 0.28, 0.56] }),
  Object.freeze({ id: 'cream', label: 'Trail Cream', color: [0.78, 0.72, 0.55] }),
  Object.freeze({ id: 'frost', label: 'Glacier Frost', color: [0.48, 0.72, 0.78] }),
  Object.freeze({ id: 'midnight', label: 'Midnight', color: [0.12, 0.16, 0.31] }),
  Object.freeze({ id: 'rose', label: 'Alpine Rose', color: [0.68, 0.27, 0.38] })
]);

export const PANTS_COLORS = Object.freeze([
  Object.freeze({ id: 'classic-trail', label: 'Classic Trail', color: [0.23, 0.31, 0.29] }),
  Object.freeze({ id: 'pine', label: 'Pine', color: [0.16, 0.27, 0.23] }),
  Object.freeze({ id: 'charcoal', label: 'Charcoal', color: [0.16, 0.18, 0.19] }),
  Object.freeze({ id: 'denim', label: 'Denim', color: [0.18, 0.3, 0.43] }),
  Object.freeze({ id: 'clay', label: 'Clay', color: [0.39, 0.25, 0.18] }),
  Object.freeze({ id: 'sage', label: 'Sage', color: [0.34, 0.4, 0.29] }),
  Object.freeze({ id: 'rust', label: 'Rust', color: [0.45, 0.2, 0.12] }),
  Object.freeze({ id: 'sand', label: 'Trail Sand', color: [0.58, 0.49, 0.34] })
]);

export const HAIR_STYLES = Object.freeze([
  Object.freeze({ id: 'short', label: 'Short' }),
  Object.freeze({ id: 'tousled', label: 'Tousled' }),
  Object.freeze({ id: 'ponytail', label: 'Ponytail' }),
  Object.freeze({ id: 'mohawk', label: 'Mohawk' }),
  Object.freeze({ id: 'long', label: 'Long' }),
  Object.freeze({ id: 'bun', label: 'Trail Bun' }),
  Object.freeze({ id: 'braids', label: 'Twin Braids' }),
  Object.freeze({ id: 'bald', label: 'Bald' })
]);

export const HAIR_COLORS = Object.freeze([
  Object.freeze({ id: 'espresso', label: 'Espresso', color: [0.1, 0.065, 0.045] }),
  Object.freeze({ id: 'chestnut', label: 'Chestnut', color: [0.29, 0.13, 0.065] }),
  Object.freeze({ id: 'gold', label: 'Gold', color: [0.72, 0.52, 0.22] }),
  Object.freeze({ id: 'copper', label: 'Copper', color: [0.58, 0.19, 0.08] }),
  Object.freeze({ id: 'silver', label: 'Silver', color: [0.62, 0.64, 0.61] }),
  Object.freeze({ id: 'teal', label: 'Lake Teal', color: [0.05, 0.38, 0.4] }),
  Object.freeze({ id: 'black', label: 'Raven', color: [0.025, 0.03, 0.035] }),
  Object.freeze({ id: 'violet', label: 'Violet', color: [0.38, 0.18, 0.52] }),
  Object.freeze({ id: 'pink', label: 'Wildflower', color: [0.72, 0.3, 0.48] })
]);

export const ACCESSORIES = Object.freeze([
  Object.freeze({ id: 'none', label: 'None' }),
  Object.freeze({ id: 'beanie', label: 'Beanie', color: [0.99, 0.82, 0.33] }),
  Object.freeze({ id: 'glasses', label: 'Trail Glasses' }),
  Object.freeze({ id: 'trail-hat', label: 'Trail Hat' }),
  Object.freeze({ id: 'fishing-cap', label: 'Fishing Cap' }),
  Object.freeze({ id: 'headlamp', label: 'Headlamp' }),
  Object.freeze({ id: 'scarf', label: 'Trail Scarf' }),
  Object.freeze({ id: 'flower-crown', label: 'Flower Crown' }),
  Object.freeze({ id: 'goggles', label: 'Summit Goggles' })
]);

export const HEADWEAR = Object.freeze(ACCESSORIES.filter((entry) => (
  ['none', 'beanie', 'trail-hat', 'fishing-cap', 'headlamp', 'flower-crown'].includes(entry.id)
)));
export const EYEWEAR = Object.freeze(ACCESSORIES.filter((entry) => ['none', 'glasses', 'goggles'].includes(entry.id)));
export const FACE_ACCESSORIES = Object.freeze(ACCESSORIES.filter((entry) => ['none', 'scarf'].includes(entry.id)));
export const BACK_ACCESSORIES = Object.freeze([
  Object.freeze({ id: 'backpack', label: 'Trail Backpack' }),
  Object.freeze({ id: 'none', label: 'None' })
]);

// Full-crown hats replace the hair cap instead of occupying the same volume. Face and
// neck accessories intentionally leave the selected hair visible.
export const HAIR_CONCEALING_ACCESSORIES = Object.freeze(['beanie', 'trail-hat', 'fishing-cap']);

export function accessoryConcealsHair(accessory) {
  return HAIR_CONCEALING_ACCESSORIES.includes(accessory);
}

export function hairVisibilityForHeadwear(hairStyle, headwear) {
  if (!accessoryConcealsHair(headwear)) return Object.freeze({ root: true, top: true });
  const lowerHairFits = ['ponytail', 'long', 'braids'].includes(hairStyle);
  return Object.freeze({ root: lowerHairFits, top: false });
}

export const CUSTOM_COLOR_FIELDS = Object.freeze([
  Object.freeze({ key: 'shirtTint', label: 'Custom shirt', optionKey: 'shirtColor', human: true }),
  Object.freeze({ key: 'pantsTint', label: 'Custom pants', optionKey: 'pantsColor', human: true }),
  Object.freeze({ key: 'hairTint', label: 'Custom hair', optionKey: 'hairColor', human: true }),
  Object.freeze({ key: 'accessoryTint', label: 'Custom accessory', resolvedKey: 'accessoryColor', human: true }),
  Object.freeze({ key: 'blobTint', label: 'Custom blob', resolvedKey: 'blobColor', blob: true })
]);

export const DEFAULT_APPEARANCE = Object.freeze({
  avatarType: 'human',
  skinTone: 'warm',
  shirtColor: 'classic-orange',
  pantsColor: 'classic-trail',
  hairStyle: 'tousled',
  hairColor: 'espresso',
  accessory: 'beanie',
  headwear: 'beanie',
  eyewear: 'none',
  faceAccessory: 'none',
  backAccessory: 'backpack',
  shirtTint: null,
  pantsTint: null,
  hairTint: null,
  accessoryTint: null,
  blobTint: null
});

const OPTION_SETS = Object.freeze({
  avatarType: new Set(AVATAR_TYPES.map((entry) => entry.id)),
  skinTone: new Set(SKIN_TONES.map((entry) => entry.id)),
  shirtColor: new Set(SHIRT_COLORS.map((entry) => entry.id)),
  pantsColor: new Set(PANTS_COLORS.map((entry) => entry.id)),
  hairStyle: new Set(HAIR_STYLES.map((entry) => entry.id)),
  hairColor: new Set(HAIR_COLORS.map((entry) => entry.id)),
  accessory: new Set(ACCESSORIES.map((entry) => entry.id)),
  headwear: new Set(HEADWEAR.map((entry) => entry.id)),
  eyewear: new Set(EYEWEAR.map((entry) => entry.id)),
  faceAccessory: new Set(FACE_ACCESSORIES.map((entry) => entry.id)),
  backAccessory: new Set(BACK_ACCESSORIES.map((entry) => entry.id))
});

const CATALOGS = Object.freeze({
  skinTone: SKIN_TONES,
  shirtColor: SHIRT_COLORS,
  pantsColor: PANTS_COLORS,
  hairColor: HAIR_COLORS
});

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const normalizeTint = (value) => typeof value === 'string' && COLOR_PATTERN.test(value)
  ? value.toLowerCase()
  : null;

export function colorToHex(color = [0, 0, 0]) {
  return `#${color.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16).padStart(2, '0')).join('')}`;
}

export function hexToColor(value, fallback = [1, 1, 1]) {
  if (!COLOR_PATTERN.test(value ?? '')) return [...fallback];
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

export function normalizeAppearance(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const appearance = {};
  for (const [key, options] of Object.entries(OPTION_SETS)) {
    appearance[key] = options.has(source[key]) ? source[key] : DEFAULT_APPEARANCE[key];
  }
  // Old saves and older multiplayer peers sent one accessory slot. Promote it into the
  // appropriate category without erasing any newer category fields.
  const legacy = OPTION_SETS.accessory.has(source.accessory) ? source.accessory : null;
  const hasCategorizedAccessory = ['headwear', 'eyewear', 'faceAccessory', 'backAccessory']
    .some((key) => OPTION_SETS[key].has(source[key]));
  if (legacy && !hasCategorizedAccessory) {
    appearance.headwear = OPTION_SETS.headwear.has(legacy) ? legacy : 'none';
    appearance.eyewear = OPTION_SETS.eyewear.has(legacy) ? legacy : 'none';
    appearance.faceAccessory = OPTION_SETS.faceAccessory.has(legacy) ? legacy : 'none';
  }
  for (const field of CUSTOM_COLOR_FIELDS) appearance[field.key] = normalizeTint(source[field.key]);
  return appearance;
}

export function resolveAppearance(value = {}) {
  const appearance = normalizeAppearance(value);
  const resolved = { ...appearance };
  for (const [key, catalog] of Object.entries(CATALOGS)) {
    resolved[`${key}Value`] = catalog.find((entry) => entry.id === appearance[key]) ?? catalog[0];
  }
  const tintTargets = {
    shirtTint: 'shirtColorValue',
    pantsTint: 'pantsColorValue',
    hairTint: 'hairColorValue'
  };
  for (const [tintKey, targetKey] of Object.entries(tintTargets)) {
    if (!appearance[tintKey]) continue;
    resolved[targetKey] = { ...resolved[targetKey], color: hexToColor(appearance[tintKey]) };
  }
  const accessoryOption = ACCESSORIES.find((entry) => entry.id === appearance.headwear)
    ?? ACCESSORIES.find((entry) => entry.id === appearance.eyewear)
    ?? ACCESSORIES.find((entry) => entry.id === appearance.faceAccessory);
  const accessoryPreset = accessoryOption?.color
    ?? resolved.shirtColorValue.color.map((component) => Math.min(1, component * .72 + .08));
  resolved.accessoryColor = hexToColor(appearance.accessoryTint, accessoryPreset);
  const classicTrailLook = appearance.shirtColor === 'classic-orange'
    && appearance.pantsColor === 'classic-trail'
    && appearance.headwear === 'beanie'
    && appearance.accessoryTint === null;
  resolved.shirtAccentColor = classicTrailLook
    ? [...resolved.accessoryColor]
    : resolved.shirtColorValue.color.map((component) => Math.min(1, component * .72 + .08));
  resolved.blobColor = hexToColor(appearance.blobTint, [0.28, 0.72, 0.95]);
  return resolved;
}

const randomEntry = (catalog, random) => {
  const unit = Math.max(0, Math.min(.999999, Number(random()) || 0));
  return catalog[Math.floor(unit * catalog.length)];
};

export function randomizeAppearance(random = Math.random) {
  return normalizeAppearance({
    avatarType: randomEntry(AVATAR_TYPES, random).id,
    skinTone: randomEntry(SKIN_TONES, random).id,
    shirtColor: randomEntry(SHIRT_COLORS, random).id,
    pantsColor: randomEntry(PANTS_COLORS, random).id,
    hairStyle: randomEntry(HAIR_STYLES, random).id,
    hairColor: randomEntry(HAIR_COLORS, random).id,
    accessory: 'none',
    headwear: randomEntry(HEADWEAR, random).id,
    eyewear: randomEntry(EYEWEAR, random).id,
    faceAccessory: randomEntry(FACE_ACCESSORIES, random).id,
    backAccessory: randomEntry(BACK_ACCESSORIES, random).id,
    shirtTint: null,
    pantsTint: null,
    hairTint: null,
    accessoryTint: null,
    blobTint: null
  });
}

export function compactAppearance(value = {}) {
  const compact = normalizeAppearance(value);
  compact.accessory = compact.headwear !== 'none'
    ? compact.headwear
    : compact.eyewear !== 'none' ? compact.eyewear : compact.faceAccessory;
  return compact;
}

export function appearanceSignature(value = {}) {
  const appearance = normalizeAppearance(value);
  return Object.values(appearance).join('|');
}
