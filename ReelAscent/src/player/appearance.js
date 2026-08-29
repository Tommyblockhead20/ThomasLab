export const AVATAR_TYPES = Object.freeze([
  Object.freeze({ id: 'human', label: 'Human' }),
  Object.freeze({ id: 'blob', label: 'Blue Blob' })
]);

export const SKIN_TONES = Object.freeze([
  Object.freeze({ id: 'porcelain', label: 'Porcelain', color: [0.96, 0.82, 0.7] }),
  Object.freeze({ id: 'warm', label: 'Warm', color: [0.9, 0.68, 0.48] }),
  Object.freeze({ id: 'golden', label: 'Golden', color: [0.72, 0.47, 0.29] }),
  Object.freeze({ id: 'umber', label: 'Umber', color: [0.43, 0.25, 0.16] }),
  Object.freeze({ id: 'deep', label: 'Deep', color: [0.24, 0.13, 0.09] })
]);

export const SHIRT_COLORS = Object.freeze([
  Object.freeze({ id: 'alpine', label: 'Alpine Blue', color: [0.17, 0.48, 0.62] }),
  Object.freeze({ id: 'ember', label: 'Ember', color: [0.72, 0.25, 0.16] }),
  Object.freeze({ id: 'moss', label: 'Moss', color: [0.25, 0.49, 0.3] }),
  Object.freeze({ id: 'sunset', label: 'Sunset', color: [0.83, 0.52, 0.18] }),
  Object.freeze({ id: 'plum', label: 'Plum', color: [0.47, 0.28, 0.56] }),
  Object.freeze({ id: 'cream', label: 'Trail Cream', color: [0.78, 0.72, 0.55] })
]);

export const PANTS_COLORS = Object.freeze([
  Object.freeze({ id: 'pine', label: 'Pine', color: [0.16, 0.27, 0.23] }),
  Object.freeze({ id: 'charcoal', label: 'Charcoal', color: [0.16, 0.18, 0.19] }),
  Object.freeze({ id: 'denim', label: 'Denim', color: [0.18, 0.3, 0.43] }),
  Object.freeze({ id: 'clay', label: 'Clay', color: [0.39, 0.25, 0.18] }),
  Object.freeze({ id: 'sage', label: 'Sage', color: [0.34, 0.4, 0.29] })
]);

export const HAIR_STYLES = Object.freeze([
  Object.freeze({ id: 'short', label: 'Short' }),
  Object.freeze({ id: 'tousled', label: 'Tousled' }),
  Object.freeze({ id: 'ponytail', label: 'Ponytail' }),
  Object.freeze({ id: 'mohawk', label: 'Mohawk' }),
  Object.freeze({ id: 'bald', label: 'Bald' })
]);

export const HAIR_COLORS = Object.freeze([
  Object.freeze({ id: 'espresso', label: 'Espresso', color: [0.1, 0.065, 0.045] }),
  Object.freeze({ id: 'chestnut', label: 'Chestnut', color: [0.29, 0.13, 0.065] }),
  Object.freeze({ id: 'gold', label: 'Gold', color: [0.72, 0.52, 0.22] }),
  Object.freeze({ id: 'copper', label: 'Copper', color: [0.58, 0.19, 0.08] }),
  Object.freeze({ id: 'silver', label: 'Silver', color: [0.62, 0.64, 0.61] }),
  Object.freeze({ id: 'teal', label: 'Lake Teal', color: [0.05, 0.38, 0.4] })
]);

export const ACCESSORIES = Object.freeze([
  Object.freeze({ id: 'none', label: 'None' }),
  Object.freeze({ id: 'beanie', label: 'Beanie' }),
  Object.freeze({ id: 'glasses', label: 'Trail Glasses' }),
  Object.freeze({ id: 'trail-hat', label: 'Trail Hat' })
]);

export const DEFAULT_APPEARANCE = Object.freeze({
  avatarType: 'human',
  skinTone: 'warm',
  shirtColor: 'alpine',
  pantsColor: 'pine',
  hairStyle: 'tousled',
  hairColor: 'espresso',
  accessory: 'none'
});

const OPTION_SETS = Object.freeze({
  avatarType: new Set(AVATAR_TYPES.map((entry) => entry.id)),
  skinTone: new Set(SKIN_TONES.map((entry) => entry.id)),
  shirtColor: new Set(SHIRT_COLORS.map((entry) => entry.id)),
  pantsColor: new Set(PANTS_COLORS.map((entry) => entry.id)),
  hairStyle: new Set(HAIR_STYLES.map((entry) => entry.id)),
  hairColor: new Set(HAIR_COLORS.map((entry) => entry.id)),
  accessory: new Set(ACCESSORIES.map((entry) => entry.id))
});

const CATALOGS = Object.freeze({
  skinTone: SKIN_TONES,
  shirtColor: SHIRT_COLORS,
  pantsColor: PANTS_COLORS,
  hairColor: HAIR_COLORS
});

export function normalizeAppearance(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_APPEARANCE).map(([key, fallback]) => [
    key,
    OPTION_SETS[key].has(source[key]) ? source[key] : fallback
  ]));
}

export function resolveAppearance(value = {}) {
  const appearance = normalizeAppearance(value);
  const resolved = { ...appearance };
  for (const [key, catalog] of Object.entries(CATALOGS)) {
    resolved[`${key}Value`] = catalog.find((entry) => entry.id === appearance[key]) ?? catalog[0];
  }
  return resolved;
}

export function compactAppearance(value = {}) {
  return normalizeAppearance(value);
}

export function appearanceSignature(value = {}) {
  const appearance = normalizeAppearance(value);
  return Object.values(appearance).join('|');
}
