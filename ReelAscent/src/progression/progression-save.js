import { canonicalSpeciesId } from '../fishing/fish-data.js';
import { DEFAULT_APPEARANCE, normalizeAppearance } from '../player/appearance.js';
import { MAP_ITEMS } from '../world/world-locations.js';

export const PROGRESSION_SCHEMA_VERSION = 10;
export const HAND_EQUIPMENT_IDS = Object.freeze(['ice-axe']);
export const STARTER_EQUIPMENT_IDS = Object.freeze([
  'trail-rod',
  'creek-reel',
  'standard-line',
  'plain-spoon',
  'trail-boots',
  'trail-gloves',
  'trail-kit',
  'empty-chalk-loop',
  'trail-harness'
]);

export const DEFAULT_EQUIPPED = Object.freeze({
  rod: 'trail-rod',
  reel: 'creek-reel',
  line: 'standard-line',
  lure: 'plain-spoon',
  boots: 'trail-boots',
  gloves: 'trail-gloves',
  climbingTool: 'trail-kit',
  chalk: 'empty-chalk-loop',
  harness: 'trail-harness'
});

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function createDurableId(prefix = 'id') {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function defaultProgressionState(playerId = createDurableId('player')) {
  return {
    schemaVersion: PROGRESSION_SCHEMA_VERSION,
    player: { id: playerId, createdAt: Date.now() },
    money: 0,
    inventory: [],
    aquarium: [],
    aquariumCapacityTier: 0,
    aquariumIncome: { bankedActiveSeconds: 0, lastObservedActiveSeconds: null, lifetimePaid: 0 },
    heldSpecimenId: null,
    ownedItems: [],
    heldItemId: null,
    appearance: { ...DEFAULT_APPEARANCE },
    ownedEquipment: [...STARTER_EQUIPMENT_IDS],
    equipped: { ...DEFAULT_EQUIPPED }
  };
}

export function normalizeSpecimen(value = {}, fallbackOwnerId = '') {
  const specimenId = typeof value.specimenId === 'string' ? value.specimenId.slice(0, 160) : '';
  const speciesId = canonicalSpeciesId(typeof value.speciesId === 'string' ? value.speciesId : '').slice(0, 160);
  if (!specimenId || !speciesId) return null;
  const suppliedOwnerId = typeof value.ownerId === 'string' ? value.ownerId : '';
  return {
    specimenId,
    ownerId: !suppliedOwnerId || suppliedOwnerId === 'local-player' ? fallbackOwnerId : suppliedOwnerId.slice(0, 160),
    speciesId,
    name: typeof value.name === 'string' ? value.name.slice(0, 120) : speciesId,
    rarity: typeof value.rarity === 'string' ? value.rarity : 'Common',
    length: Math.max(0, finite(value.length)),
    weight: Math.max(0, finite(value.weight)),
    expectedWeight: Math.max(0, finite(value.expectedWeight)),
    lengthCategory: typeof value.lengthCategory === 'string' ? value.lengthCategory : '',
    sizeCategory: typeof value.sizeCategory === 'string' ? value.sizeCategory : '',
    shiny: Boolean(value.shiny),
    quality: typeof value.quality === 'string' ? value.quality : 'GOOD',
    value: Math.max(0, Math.floor(finite(value.value))),
    recordVersion: Math.max(1, Math.floor(finite(value.recordVersion, 1))),
    sourceCatchId: typeof value.sourceCatchId === 'string' ? value.sourceCatchId.slice(0, 160) : specimenId,
    lengthCategoryIndex: Math.max(0, Math.min(4, Math.floor(finite(value.lengthCategoryIndex, 2)))),
    sizeCategoryIndex: Math.max(0, Math.min(4, Math.floor(finite(value.sizeCategoryIndex, 2)))),
    sizeFraction: Math.max(0, finite(value.sizeFraction, .5)),
    weightFraction: Math.max(0, finite(value.weightFraction, .5)),
    condition: Math.max(0, finite(value.condition, 1)),
    provenance: {
      origin: 'caught',
      // Old saves predate provenance legitimacy and are treated as normal catches.
      legitimate: value.provenance?.legitimate !== false,
      caughtAt: Math.max(0, finite(value.provenance?.caughtAt ?? value.caughtAt)),
      locationId: typeof (value.provenance?.locationId ?? value.location) === 'string'
        ? (value.provenance?.locationId ?? value.location).slice(0, 160)
        : '',
      locationLabel: typeof (value.provenance?.locationLabel ?? value.locationLabel) === 'string'
        ? (value.provenance?.locationLabel ?? value.locationLabel).slice(0, 160)
        : '',
      elevation: finite(value.provenance?.elevation ?? value.elevation)
    }
  };
}

function normalizeSpecimenList(values, playerId) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values.slice(0, 2000) : []) {
    const specimen = normalizeSpecimen(value, playerId);
    if (!specimen || seen.has(specimen.specimenId)) continue;
    seen.add(specimen.specimenId);
    result.push(specimen);
  }
  return result;
}

export function normalizeProgressionState(value = {}) {
  const persistedPlayerId = typeof value.player?.id === 'string' && value.player.id
    ? value.player.id.slice(0, 160)
    : createDurableId('player');
  const defaults = defaultProgressionState(persistedPlayerId);
  const owned = new Set(Array.isArray(value.ownedEquipment) ? value.ownedEquipment.filter((id) => typeof id === 'string') : []);
  STARTER_EQUIPMENT_IDS.forEach((id) => owned.add(id));
  const inventory = normalizeSpecimenList(value.inventory, persistedPlayerId);
  const legacyAquarium = Array.isArray(value.aquarium) ? value.aquarium : value.specimens;
  const inventoryIds = new Set(inventory.map((specimen) => specimen.specimenId));
  const aquarium = normalizeSpecimenList(legacyAquarium, persistedPlayerId)
    .filter((specimen) => !inventoryIds.has(specimen.specimenId));
  const equipped = { ...DEFAULT_EQUIPPED };
  for (const category of Object.keys(equipped)) {
    const selected = value.equipped?.[category];
    if (typeof selected === 'string' && owned.has(selected)) equipped[category] = selected;
  }
  // v6–v8 stored traversal items in one traversal/climbing slot. Preserve each durable id
  // in the correct v9 category without discarding purchases.
  const legacyTraversal = value.equipped?.climbing ?? value.equipped?.traversal;
  if (typeof legacyTraversal === 'string' && owned.has(legacyTraversal)) {
    if (['trail-runners', 'endurance-belt', 'springstep-boots', 'summit-vault-boots'].includes(legacyTraversal)) equipped.boots = legacyTraversal;
    else if (legacyTraversal === 'chalk-gloves') equipped.gloves = legacyTraversal;
    else if (['alpine-harness', 'ultralight-kit', 'trail-harness'].includes(legacyTraversal)) equipped.harness = legacyTraversal;
    else if (legacyTraversal === 'climber-chalk') equipped.chalk = legacyTraversal;
    else equipped.climbingTool = legacyTraversal;
  }
  if (value.equipped?.climbingTool === 'climber-chalk' && owned.has('climber-chalk')) {
    equipped.climbingTool = DEFAULT_EQUIPPED.climbingTool;
    equipped.chalk = 'climber-chalk';
  }
  if (typeof value.equipped?.guide === 'string' && owned.has(value.equipped.guide)) equipped.guide = value.equipped.guide;
  const validWorldItems = new Set(MAP_ITEMS.map((item) => item.id));
  const ownedItems = [...new Set(
    (Array.isArray(value.ownedItems) ? value.ownedItems : [])
      .filter((id) => typeof id === 'string' && validWorldItems.has(id))
  )];
  const heldSpecimenId = typeof value.heldSpecimenId === 'string' && inventoryIds.has(value.heldSpecimenId)
    ? value.heldSpecimenId
    : null;
  const heldItemId = !heldSpecimenId && typeof value.heldItemId === 'string'
    && (ownedItems.includes(value.heldItemId)
      || (HAND_EQUIPMENT_IDS.includes(value.heldItemId) && owned.has(value.heldItemId)))
    ? value.heldItemId
    : null;
  return {
    ...defaults,
    schemaVersion: PROGRESSION_SCHEMA_VERSION,
    player: {
      id: persistedPlayerId,
      createdAt: Math.max(0, finite(value.player?.createdAt, defaults.player.createdAt))
    },
    money: Math.max(0, Math.floor(finite(value.money))),
    inventory,
    aquarium,
    aquariumCapacityTier: Math.max(0, Math.min(6, Math.floor(finite(value.aquariumCapacityTier)))),
    aquariumIncome: {
      bankedActiveSeconds: Math.max(0, finite(value.aquariumIncome?.bankedActiveSeconds)),
      lastObservedActiveSeconds: Number.isFinite(value.aquariumIncome?.lastObservedActiveSeconds)
        ? Math.max(0, value.aquariumIncome.lastObservedActiveSeconds)
        : null,
      lifetimePaid: Math.max(0, Math.floor(finite(value.aquariumIncome?.lifetimePaid)))
    },
    heldSpecimenId,
    ownedItems,
    heldItemId,
    // Only genuinely absent appearance data receives the legacy v1-v7 default. Existing
    // selections are normalized/migrated but never guessed to be an "old default" and reset.
    appearance: !value.appearance
      ? { ...DEFAULT_APPEARANCE }
      : normalizeAppearance(value.appearance),
    ownedEquipment: [...owned],
    equipped
  };
}
