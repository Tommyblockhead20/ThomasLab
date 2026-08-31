const MOVEMENT_STATES = new Set(['grounded', 'airborne', 'sliding', 'climbing', 'mantling', 'fishing']);
const POSTURES = new Set(['standing', 'seated']);
const EMOTE_IDS = new Set(['wave', 'point', 'cheer', 'clap', 'sit', 'dance']);
const APPEARANCE_OPTIONS = Object.freeze({
  avatarType: new Set(['human', 'blob']),
  skinTone: new Set(['porcelain', 'light', 'warm', 'honey', 'golden', 'bronze', 'umber', 'deep']),
  shirtColor: new Set(['classic-orange', 'alpine', 'ember', 'moss', 'sunset', 'plum', 'cream', 'frost', 'midnight', 'rose', 'sky', 'lavender', 'coral', 'spruce', 'snow', 'sunbeam']),
  pantsColor: new Set(['classic-trail', 'pine', 'charcoal', 'denim', 'clay', 'sage', 'rust', 'sand', 'navy', 'slate', 'mulberry', 'olive', 'cloud', 'black']),
  hairStyle: new Set(['short', 'tousled', 'ponytail', 'mohawk', 'long', 'bun', 'braids', 'bald']),
  hairColor: new Set(['espresso', 'chestnut', 'gold', 'copper', 'silver', 'teal', 'black', 'violet', 'pink', 'ash', 'white', 'blue', 'green', 'rose-gold', 'auburn']),
  accessory: new Set(['none', 'beanie', 'glasses', 'trail-hat', 'fishing-cap', 'headlamp', 'scarf', 'bandana', 'neck-gaiter', 'necklace', 'flower-crown', 'goggles']),
  headwear: new Set(['none', 'beanie', 'trail-hat', 'fishing-cap', 'headlamp', 'flower-crown']),
  eyewear: new Set(['none', 'glasses', 'goggles', 'round-glasses', 'aviators', 'sport-shades', 'clear-spectacles', 'snow-glasses']),
  faceAccessory: new Set(['none', 'scarf', 'bandana', 'neck-gaiter', 'necklace']),
  backAccessory: new Set(['none', 'backpack']),
  backpackColor: new Set(['classic-teal', 'pine', 'orange', 'yellow', 'red', 'blue', 'navy', 'violet', 'rose', 'sand', 'white', 'charcoal', 'mint', 'coral']),
  blobColor: new Set(['classic-blue', 'aqua', 'lime', 'sunny', 'orange', 'coral', 'pink', 'violet', 'indigo', 'silver', 'charcoal', 'cream'])
});
const DEFAULT_APPEARANCE = Object.freeze({
  avatarType: 'human', skinTone: 'warm', shirtColor: 'classic-orange', pantsColor: 'classic-trail',
  hairStyle: 'tousled', hairColor: 'espresso', accessory: 'beanie', headwear: 'beanie',
  eyewear: 'none', faceAccessory: 'none', backAccessory: 'backpack', backpackColor: 'classic-teal',
  blobColor: 'classic-blue', shirtTint: null,
  pantsTint: null, hairTint: null, accessoryTint: null, blobTint: null
});
const APPEARANCE_TINTS = new Set(['shirtTint', 'pantsTint', 'hairTint', 'accessoryTint', 'blobTint']);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const finite = (value) => Number.isFinite(Number(value));
const cleanString = (value, maximum) => typeof value === 'string' ? value.slice(0, maximum) : '';

function sanitizeHeldItem(value) {
  if (value?.type === 'equipment' && value.itemId === 'ice-axe') {
    return { type: 'equipment', itemId: 'ice-axe', name: 'Ice Axe' };
  }
  if (value?.type !== 'specimen') return null;
  const speciesId = cleanString(value.speciesId, 100);
  if (!speciesId) return null;
  return {
    type: 'specimen',
    specimenId: cleanString(value.specimenId, 140),
    speciesId,
    name: cleanString(value.name, 100),
    rarity: cleanString(value.rarity, 24) || 'Common',
    length: Math.max(.01, Math.min(20_000, Number(value.length) || 0)),
    weight: Math.max(0, Math.min(10_000_000, Number(value.weight) || 0)),
    shiny: Boolean(value.shiny)
  };
}

export function sanitizeAppearance(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const appearance = Object.fromEntries(Object.entries(DEFAULT_APPEARANCE).map(([key, fallback]) => [
    key,
    APPEARANCE_TINTS.has(key)
      ? (typeof source[key] === 'string' && COLOR_PATTERN.test(source[key]) ? source[key].toLowerCase() : null)
      : (APPEARANCE_OPTIONS[key].has(source[key]) ? source[key] : fallback)
  ]));
  const legacy = APPEARANCE_OPTIONS.accessory.has(source.accessory) ? source.accessory : null;
  const categorized = ['headwear', 'eyewear', 'faceAccessory', 'backAccessory']
    .some((key) => APPEARANCE_OPTIONS[key].has(source[key]));
  if (legacy && !categorized) {
    appearance.headwear = APPEARANCE_OPTIONS.headwear.has(legacy) ? legacy : 'none';
    appearance.eyewear = APPEARANCE_OPTIONS.eyewear.has(legacy) ? legacy : 'none';
    appearance.faceAccessory = APPEARANCE_OPTIONS.faceAccessory.has(legacy) ? legacy : 'none';
  }
  return appearance;
}

export function validateSnapshot(payload, session, now = Date.now()) {
  if (!payload || payload.playerId !== session.playerId) return { ok: false, reason: 'player_id_mismatch' };
  const position = payload.position;
  if (!position || !['x', 'y', 'z'].every((axis) => finite(position[axis]))) return { ok: false, reason: 'invalid_position' };
  const normalizedPosition = { x: Number(position.x), y: Number(position.y), z: Number(position.z) };
  if (Math.abs(normalizedPosition.x) > 5000 || Math.abs(normalizedPosition.z) > 5000 || normalizedPosition.y < -500 || normalizedPosition.y > 5000) {
    return { ok: false, reason: 'out_of_bounds' };
  }

  const sequence = Number(payload.sequence);
  if (!Number.isSafeInteger(sequence) || sequence <= session.lastSequence) return { ok: false, reason: 'stale_sequence' };
  const yaw = Number(payload.yaw);
  if (!finite(yaw)) return { ok: false, reason: 'invalid_yaw' };
  const movement = MOVEMENT_STATES.has(payload.movement) ? payload.movement : 'airborne';

  const locationId = cleanString(payload.locationId, 100) || 'main-mountain';
  const coordinateSpace = cleanString(payload.coordinateSpace, 40) || 'global-world';
  const rawGlobalPosition = payload.globalPosition;
  const globalPosition = rawGlobalPosition && ['x', 'y', 'z'].every((axis) => finite(rawGlobalPosition[axis]))
    ? { x: Number(rawGlobalPosition.x), y: Number(rawGlobalPosition.y), z: Number(rawGlobalPosition.z) }
    : { ...normalizedPosition };

  if (session.lastSnapshot && session.lastSnapshot.locationId === locationId) {
    const dt = Math.max(0.05, Math.min(5, (now - session.lastSnapshot.serverTime) / 1000));
    const previous = session.lastSnapshot.position;
    const distance = Math.hypot(
      normalizedPosition.x - previous.x,
      normalizedPosition.y - previous.y,
      normalizedPosition.z - previous.z
    );
    // Deliberately generous. This catches only obviously impossible packet jumps while still
    // allowing falls, debug teleports, lag bursts, and climbing recovery movement.
    const allowedDistance = 35 + 90 * dt;
    if (distance > allowedDistance) return { ok: false, reason: 'implausible_jump' };
  }

  return {
    ok: true,
    snapshot: {
      playerId: session.playerId,
      sequence,
      position: normalizedPosition,
      yaw: ((yaw % 360) + 360) % 360,
      movement,
      posture: POSTURES.has(payload.posture) ? payload.posture : 'standing',
      locationId,
      coordinateSpace,
      globalPosition,
      appearance: sanitizeAppearance(payload.appearance),
      emote: EMOTE_IDS.has(payload.emote?.id) ? {
        id: payload.emote.id,
        startedAt: Number.isFinite(Number(payload.emote.startedAt))
          ? Math.max(now - 10_000, Math.min(now + 1_000, Number(payload.emote.startedAt)))
          : now
      } : null,
      fishingState: payload.fishingState ?? null,
      heldItem: sanitizeHeldItem(payload.heldItem),
      serverTime: now
    }
  };
}
