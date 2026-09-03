import { defaultProgressionState, normalizeProgressionState } from '../progression/progression-save.js';
import { canonicalSpeciesId } from '../fishing/fish-data.js';

export const SAVE_SCHEMA_VERSION = 10;
export const SAVE_STORAGE_KEY = 'reel-ascent-save-v1';
export const SAVE_SLOTS_STORAGE_KEY = 'reel-ascent-save-slots-v1';
export const MULTIPLAYER_ID_STORAGE_KEY = 'reel-ascent-multiplayer-browser-id-v1';
export const SAVE_SLOT_SCHEMA_VERSION = 1;
export const SAVE_SLOT_COUNT = 4;

const QUALITY_RANK = Object.freeze({ GOOD: 1, GREAT: 2, PERFECT: 3 });
const CANONICAL_RARITIES = new Set(['Common', 'Uncommon', 'Rare', 'Legendary']);

export function normalizeRarity(value) {
  const renamed = value === 'Epic' ? 'Legendary' : value;
  return CANONICAL_RARITIES.has(renamed) ? renamed : 'Common';
}

export function defaultSave() {
  return {
    version: SAVE_SCHEMA_VERSION,
    collection: {},
    lifetime: {
      fishCaught: 0,
      summitCount: 0,
      runsCompleted: 0,
      highestElevation: 0,
      catchesByRarity: { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0 },
      shinyCaught: 0,
      bestCatch: null,
      fishingWatersCaught: [],
      boatTrips: 0,
      fastestAscentSeconds: null,
      activePlaytimeSeconds: 0,
      legitimateEarnings: 0
    },
    trailBadges: {
      unlocked: [],
      uniqueSpeciesCaught: [],
      uniqueSpeciesSold: [],
      watersFished: [],
      biomesFished: [],
      destinationsVisited: []
    },
    runHistory: [],
    progression: defaultProgressionState()
  };
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeEntry(value = {}) {
  return {
    discovered: Boolean(value.discovered),
    name: typeof value.name === 'string' ? value.name : '',
    rarity: normalizeRarity(value.rarity),
    catches: Math.max(0, Math.floor(finiteNumber(value.catches))),
    bestLength: Math.max(0, finiteNumber(value.bestLength)),
    bestWeight: Math.max(0, finiteNumber(value.bestWeight)),
    bestLengthCategory: typeof value.bestLengthCategory === 'string' ? value.bestLengthCategory : '',
    bestLengthCategoryIndex: Math.max(0, Math.floor(finiteNumber(value.bestLengthCategoryIndex))),
    bestSizeCategory: typeof value.bestSizeCategory === 'string' ? value.bestSizeCategory : '',
    bestSizeCategoryIndex: Math.max(0, Math.floor(finiteNumber(value.bestSizeCategoryIndex))),
    bestQuality: QUALITY_RANK[value.bestQuality] ? value.bestQuality : '',
    shinyCount: Math.max(0, Math.floor(finiteNumber(value.shinyCount))),
    firstLocation: typeof value.firstLocation === 'string' ? value.firstLocation : '',
    bestLocation: typeof value.bestLocation === 'string' ? value.bestLocation : '',
    highestCatchElevation: Math.max(0, finiteNumber(value.highestCatchElevation)),
    firstCaughtAt: Math.max(0, finiteNumber(value.firstCaughtAt)),
    lastCaughtAt: Math.max(0, finiteNumber(value.lastCaughtAt))
  };
}

function mergeEntries(left, right) {
  if (!left) return right;
  return {
    discovered: left.discovered || right.discovered,
    name: right.name || left.name,
    rarity: right.rarity || left.rarity,
    catches: Math.max(left.catches, right.catches),
    bestLength: Math.max(left.bestLength, right.bestLength),
    bestWeight: Math.max(left.bestWeight, right.bestWeight),
    bestLengthCategory: right.bestLengthCategoryIndex >= left.bestLengthCategoryIndex ? right.bestLengthCategory : left.bestLengthCategory,
    bestLengthCategoryIndex: Math.max(left.bestLengthCategoryIndex, right.bestLengthCategoryIndex),
    bestSizeCategory: right.bestSizeCategoryIndex >= left.bestSizeCategoryIndex ? right.bestSizeCategory : left.bestSizeCategory,
    bestSizeCategoryIndex: Math.max(left.bestSizeCategoryIndex, right.bestSizeCategoryIndex),
    bestQuality: (QUALITY_RANK[right.bestQuality] ?? 0) >= (QUALITY_RANK[left.bestQuality] ?? 0) ? right.bestQuality : left.bestQuality,
    shinyCount: Math.max(left.shinyCount, right.shinyCount),
    firstLocation: left.firstLocation || right.firstLocation,
    bestLocation: right.bestWeight >= left.bestWeight ? right.bestLocation || left.bestLocation : left.bestLocation,
    highestCatchElevation: Math.max(left.highestCatchElevation, right.highestCatchElevation),
    firstCaughtAt: [left.firstCaughtAt, right.firstCaughtAt].filter(Boolean).length
      ? Math.min(...[left.firstCaughtAt, right.firstCaughtAt].filter(Boolean))
      : 0,
    lastCaughtAt: Math.max(left.lastCaughtAt, right.lastCaughtAt)
  };
}

export function normalizeSave(value = {}) {
  const normalized = defaultSave();
  const collection = value.collection && typeof value.collection === 'object' ? value.collection : {};
  for (const [speciesId, entry] of Object.entries(collection)) {
    const canonicalId = canonicalSpeciesId(speciesId);
    if (canonicalId) normalized.collection[canonicalId] = mergeEntries(
      normalized.collection[canonicalId],
      normalizeEntry(entry)
    );
  }
  const lifetime = value.lifetime && typeof value.lifetime === 'object' ? value.lifetime : {};
  normalized.lifetime.fishCaught = Math.max(0, Math.floor(finiteNumber(lifetime.fishCaught)));
  normalized.lifetime.summitCount = Math.max(0, Math.floor(finiteNumber(lifetime.summitCount)));
  normalized.lifetime.runsCompleted = Math.max(0, Math.floor(finiteNumber(lifetime.runsCompleted)));
  normalized.lifetime.highestElevation = Math.max(0, finiteNumber(lifetime.highestElevation));
  const rarityCounts = lifetime.catchesByRarity && typeof lifetime.catchesByRarity === 'object' ? lifetime.catchesByRarity : {};
  for (const rarity of CANONICAL_RARITIES) normalized.lifetime.catchesByRarity[rarity] = Math.max(0, Math.floor(finiteNumber(rarityCounts[rarity])));
  normalized.lifetime.shinyCaught = Math.max(0, Math.floor(finiteNumber(lifetime.shinyCaught)));
  const bestCatch = lifetime.bestCatch && typeof lifetime.bestCatch === 'object' ? lifetime.bestCatch : null;
  normalized.lifetime.bestCatch = bestCatch ? {
    speciesId: canonicalSpeciesId(bestCatch.speciesId ?? ''),
    name: typeof bestCatch.name === 'string' ? bestCatch.name.slice(0, 120) : '',
    rarity: normalizeRarity(bestCatch.rarity),
    shiny: Boolean(bestCatch.shiny),
    weight: Math.max(0, finiteNumber(bestCatch.weight)),
    length: Math.max(0, finiteNumber(bestCatch.length))
  } : null;
  normalized.lifetime.fishingWatersCaught = [...new Set((Array.isArray(lifetime.fishingWatersCaught) ? lifetime.fishingWatersCaught : [])
    .filter((id) => typeof id === 'string' && id).map((id) => id.slice(0, 160)))];
  normalized.lifetime.boatTrips = Math.max(0, Math.floor(finiteNumber(lifetime.boatTrips)));
  normalized.lifetime.fastestAscentSeconds = Number.isFinite(lifetime.fastestAscentSeconds) && lifetime.fastestAscentSeconds > 0
    ? lifetime.fastestAscentSeconds : null;
  normalized.lifetime.activePlaytimeSeconds = Math.max(0, finiteNumber(lifetime.activePlaytimeSeconds));
  normalized.lifetime.legitimateEarnings = Math.max(0, Math.floor(finiteNumber(lifetime.legitimateEarnings)));
  const badgeSource = value.trailBadges && typeof value.trailBadges === 'object' ? value.trailBadges : {};
  const cleanIds = (items, maximum = 500) => [...new Set((Array.isArray(items) ? items : [])
    .filter((id) => typeof id === 'string' && id).map((id) => id.slice(0, 160)))].slice(0, maximum);
  normalized.trailBadges = {
    unlocked: cleanIds(badgeSource.unlocked, 200),
    uniqueSpeciesCaught: cleanIds([
      ...cleanIds(badgeSource.uniqueSpeciesCaught),
      ...Object.entries(normalized.collection).filter(([, entry]) => entry.catches > 0).map(([id]) => id)
    ]),
    uniqueSpeciesSold: cleanIds(badgeSource.uniqueSpeciesSold),
    watersFished: cleanIds([...cleanIds(badgeSource.watersFished), ...normalized.lifetime.fishingWatersCaught]),
    biomesFished: cleanIds(badgeSource.biomesFished, 100),
    destinationsVisited: cleanIds(badgeSource.destinationsVisited, 100)
  };
  normalized.runHistory = Array.isArray(value.runHistory)
    ? value.runHistory.slice(0, 12).filter((entry) => entry && typeof entry === 'object').map((entry) => ({
      ...entry,
      rarest: typeof entry.rarest === 'string' ? entry.rarest.replace(/^Epic\b/, 'Legendary') : 'None'
    }))
    : [];
  normalized.progression = normalizeProgressionState(value.progression);
  return normalized;
}

const MIGRATIONS = Object.freeze({
  0: (value) => ({
    ...value,
    version: 1,
    collection: value.collection ?? {},
    lifetime: value.lifetime ?? {},
    runHistory: value.runHistory ?? []
  }),
  1: (value) => ({
    ...value,
    version: 2,
    progression: normalizeProgressionState(value.progression)
  }),
  2: (value) => ({
    ...value,
    version: 3,
    progression: normalizeProgressionState(value.progression)
  }),
  3: (value) => ({
    ...value,
    version: 4,
    progression: normalizeProgressionState({ ...value.progression, inventory: value.progression?.inventory ?? [] })
  }),
  4: (value) => ({
    ...value,
    version: 5,
    progression: normalizeProgressionState(value.progression)
  }),
  5: (value) => ({
    ...value,
    version: 6,
    progression: normalizeProgressionState(value.progression)
  }),
  6: (value) => ({
    ...value,
    version: 7,
    progression: normalizeProgressionState(value.progression)
  }),
  7: (value) => ({
    ...value,
    version: 8,
    progression: normalizeProgressionState(value.progression),
    lifetime: value.lifetime ?? {}
  }),
  8: (value) => ({
    ...value,
    version: 9,
    progression: normalizeProgressionState(value.progression),
    lifetime: value.lifetime ?? {}
  }),
  9: (value) => ({
    ...value,
    version: 10,
    trailBadges: value.trailBadges ?? {},
    progression: normalizeProgressionState(value.progression),
    lifetime: value.lifetime ?? {}
  })
});

export function migrate(value) {
  let current = value && typeof value === 'object' ? value : {};
  let version = Math.max(0, Math.floor(finiteNumber(current.version)));
  while (version < SAVE_SCHEMA_VERSION) {
    current = MIGRATIONS[version]?.(current) ?? defaultSave();
    version = Math.max(version + 1, Math.floor(finiteNumber(current.version, version + 1)));
  }
  return normalizeSave(current);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function slotId(index) {
  return `slot-${index + 1}`;
}

function emptySlot(index) {
  return {
    id: slotId(index),
    label: `Save Slot ${index + 1}`,
    createdAt: 0,
    updatedAt: 0,
    data: null
  };
}

function normalizeSlot(value, index) {
  const base = emptySlot(index);
  const data = value?.data && typeof value.data === 'object' ? migrate(value.data) : null;
  return {
    ...base,
    createdAt: data ? Math.max(0, finiteNumber(value?.createdAt, Date.now())) : 0,
    updatedAt: data ? Math.max(0, finiteNumber(value?.updatedAt, Date.now())) : 0,
    data
  };
}

export function normalizeSaveSlotStore(value = {}, legacySave = null) {
  const supplied = Array.isArray(value.slots) ? value.slots : [];
  const slots = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => normalizeSlot(supplied[index], index));
  if (!slots.some((slot) => slot.data)) {
    const migrated = legacySave ? migrate(legacySave) : defaultSave();
    slots[0] = {
      ...emptySlot(0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: migrated
    };
  }
  const requestedActive = typeof value.activeSlotId === 'string' ? value.activeSlotId : '';
  const activeSlotId = slots.some((slot) => slot.id === requestedActive && slot.data)
    ? requestedActive
    : slots.find((slot) => slot.data)?.id ?? slots[0].id;
  return {
    schemaVersion: SAVE_SLOT_SCHEMA_VERSION,
    activeSlotId,
    slots
  };
}

function summarizeSlot(slot, activeSlotId) {
  const save = slot.data ? migrate(slot.data) : null;
  return {
    id: slot.id,
    label: slot.label,
    empty: !save,
    active: slot.id === activeSlotId,
    createdAt: slot.createdAt,
    updatedAt: slot.updatedAt,
    money: save?.progression?.money ?? 0,
    discovered: save ? Object.values(save.collection).filter((entry) => entry.discovered).length : 0,
    fishCaught: save?.lifetime?.fishCaught ?? 0,
    summits: save?.lifetime?.summitCount ?? 0,
    activePlaytimeSeconds: save?.lifetime?.activePlaytimeSeconds ?? 0,
    appearance: save?.progression?.appearance ?? null
  };
}

export class SaveSystem {
  constructor(storage) {
    this.storage = arguments.length ? storage : getBrowserStorage();
    this.lastLoadError = null;
    this.revision = 0;
    this.slotStore = this.loadSlotStore();
    this.activeSlotId = this.slotStore.activeSlotId;
    this.data = migrate(this.slotStore.slots.find((slot) => slot.id === this.activeSlotId)?.data ?? defaultSave());
    this.multiplayerPlayerId = this.loadMultiplayerPlayerId();
  }

  loadMultiplayerPlayerId() {
    try {
      const existing = this.storage?.getItem(MULTIPLAYER_ID_STORAGE_KEY);
      if (existing) return existing.slice(0, 160);
      const id = this.data.progression?.player?.id
        || `browser-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      this.storage?.setItem(MULTIPLAYER_ID_STORAGE_KEY, id);
      return id;
    } catch {
      return this.data.progression?.player?.id ?? `browser-${Date.now()}`;
    }
  }

  loadSlotStore() {
    try {
      const rawSlots = this.storage?.getItem(SAVE_SLOTS_STORAGE_KEY);
      const legacyRaw = rawSlots ? null : this.storage?.getItem(SAVE_STORAGE_KEY);
      const store = normalizeSaveSlotStore(
        rawSlots ? JSON.parse(rawSlots) : {},
        legacyRaw ? JSON.parse(legacyRaw) : null
      );
      this.storage?.setItem(SAVE_SLOTS_STORAGE_KEY, JSON.stringify(store));
      return store;
    } catch {
      this.lastLoadError = 'corrupt-or-unavailable';
      return normalizeSaveSlotStore();
    }
  }

  load() {
    return migrate(this.slotStore?.slots.find((slot) => slot.id === this.activeSlotId)?.data ?? defaultSave());
  }

  writeSlotStore() {
    if (!this.storage) throw new Error('Storage unavailable');
    this.storage.setItem(SAVE_SLOTS_STORAGE_KEY, JSON.stringify(this.slotStore));
  }

  save() {
    try {
      const slot = this.slotStore.slots.find((entry) => entry.id === this.activeSlotId);
      if (!slot) throw new Error('Active slot unavailable');
      const now = Date.now();
      slot.data = migrate(this.data);
      slot.createdAt ||= now;
      slot.updatedAt = now;
      this.slotStore.activeSlotId = this.activeSlotId;
      this.writeSlotStore();
      this.lastLoadError = null;
      this.revision += 1;
      return true;
    } catch {
      this.lastLoadError = 'write-unavailable';
      return false;
    }
  }

  recordCatch(catchData, { legitimate = true } = {}) {
    if (!catchData?.speciesId) return false;
    const speciesId = canonicalSpeciesId(catchData.speciesId);
    const previous = normalizeEntry(this.data.collection[speciesId]);
    const rarity = normalizeRarity(catchData.rarityLabel ?? catchData.rarity ?? previous.rarity);
    const now = finiteNumber(catchData.caughtAt, Date.now());

    // Cheat/debug catches may still reveal the creature in the journal, but they cannot
    // inflate catch counts, records, quality records, shinies, best catch, or water coverage.
    if (!legitimate) {
      this.data.collection[speciesId] = {
        ...previous,
        discovered: true,
        name: catchData.name ?? previous.name,
        rarity,
        firstLocation: previous.firstLocation || catchData.locationLabel || '',
        firstCaughtAt: previous.firstCaughtAt || now,
        lastCaughtAt: Math.max(previous.lastCaughtAt, now)
      };
      return this.save();
    }

    const lengthCategoryIndex = Math.max(0, finiteNumber(catchData.lengthCategoryIndex));
    const sizeCategoryIndex = Math.max(0, finiteNumber(catchData.sizeCategoryIndex));
    const quality = QUALITY_RANK[catchData.quality] ? catchData.quality : 'GOOD';
    const record = {
      ...previous,
      discovered: true,
      name: catchData.name ?? previous.name,
      rarity,
      catches: previous.catches + 1,
      bestLength: Math.max(previous.bestLength, finiteNumber(catchData.length)),
      bestWeight: Math.max(previous.bestWeight, finiteNumber(catchData.weight)),
      bestLengthCategory: lengthCategoryIndex >= previous.bestLengthCategoryIndex
        ? catchData.lengthCategory ?? previous.bestLengthCategory : previous.bestLengthCategory,
      bestLengthCategoryIndex: Math.max(previous.bestLengthCategoryIndex, lengthCategoryIndex),
      bestSizeCategory: sizeCategoryIndex >= previous.bestSizeCategoryIndex
        ? catchData.sizeCategory ?? catchData.sizeLabel ?? previous.bestSizeCategory : previous.bestSizeCategory,
      bestSizeCategoryIndex: Math.max(previous.bestSizeCategoryIndex, sizeCategoryIndex),
      bestQuality: (QUALITY_RANK[quality] ?? 0) >= (QUALITY_RANK[previous.bestQuality] ?? 0) ? quality : previous.bestQuality,
      shinyCount: previous.shinyCount + Number(Boolean(catchData.shiny)),
      firstLocation: previous.firstLocation || catchData.locationLabel || '',
      bestLocation: finiteNumber(catchData.weight) >= previous.bestWeight ? catchData.locationLabel || previous.bestLocation : previous.bestLocation,
      highestCatchElevation: Math.max(previous.highestCatchElevation, finiteNumber(catchData.elevation)),
      firstCaughtAt: previous.firstCaughtAt || now,
      lastCaughtAt: now
    };
    this.data.collection[speciesId] = record;
    const lifetime = this.data.lifetime;
    lifetime.fishCaught += 1;
    lifetime.catchesByRarity[rarity] = (lifetime.catchesByRarity[rarity] ?? 0) + 1;
    if (catchData.shiny) lifetime.shinyCaught += 1;
    const zoneId = catchData.fishingZoneId ?? catchData.zoneId;
    if (typeof zoneId === 'string' && zoneId && !lifetime.fishingWatersCaught.includes(zoneId)) lifetime.fishingWatersCaught.push(zoneId.slice(0, 160));
    if (!this.data.trailBadges.uniqueSpeciesCaught.includes(speciesId)) this.data.trailBadges.uniqueSpeciesCaught.push(speciesId);
    if (typeof zoneId === 'string' && zoneId && !this.data.trailBadges.watersFished.includes(zoneId)) this.data.trailBadges.watersFished.push(zoneId.slice(0, 160));
    const biomeId = catchData.biomeId ?? catchData.ecologyTheme ?? catchData.theme;
    if (typeof biomeId === 'string' && biomeId && !this.data.trailBadges.biomesFished.includes(biomeId)) this.data.trailBadges.biomesFished.push(biomeId.slice(0, 160));
    const candidate = {
      speciesId, name: catchData.name ?? speciesId, rarity, shiny: Boolean(catchData.shiny),
      weight: Math.max(0, finiteNumber(catchData.weight)), length: Math.max(0, finiteNumber(catchData.length))
    };
    if (!lifetime.bestCatch || candidate.weight > lifetime.bestCatch.weight
      || (candidate.weight === lifetime.bestCatch.weight && candidate.length > lifetime.bestCatch.length)) lifetime.bestCatch = candidate;
    return this.save();
  }

  recordSummit({ legitimate = true } = {}) {
    if (!legitimate) return false;
    this.data.lifetime.summitCount += 1;
    return this.save();
  }

  recordBoatTrip({ legitimate = true } = {}) {
    if (!legitimate) return false;
    this.data.lifetime.boatTrips += 1;
    return this.save();
  }

  recordSpeciesSold(specimens = [], { legitimate = true } = {}) {
    if (!legitimate) return false;
    let changed = false;
    for (const specimen of specimens) {
      if (specimen?.provenance?.legitimate === false) continue;
      const speciesId = canonicalSpeciesId(specimen?.canonicalSpeciesId ?? specimen?.speciesId);
      if (!speciesId || this.data.trailBadges.uniqueSpeciesSold.includes(speciesId)) continue;
      this.data.trailBadges.uniqueSpeciesSold.push(speciesId);
      changed = true;
    }
    return changed ? this.save() : false;
  }

  recordDestinationVisit(destinationId, { legitimate = true } = {}) {
    if (!legitimate || typeof destinationId !== 'string' || !destinationId) return false;
    if (this.data.trailBadges.destinationsVisited.includes(destinationId)) return false;
    this.data.trailBadges.destinationsVisited.push(destinationId.slice(0, 160));
    return this.save();
  }

  unlockTrailBadges(ids = []) {
    let changed = false;
    for (const id of ids) {
      if (typeof id !== 'string' || !id || this.data.trailBadges.unlocked.includes(id)) continue;
      this.data.trailBadges.unlocked.push(id.slice(0, 160));
      changed = true;
    }
    return changed ? this.save() : false;
  }

  recordFastestAscent(seconds, { legitimate = true } = {}) {
    const value = finiteNumber(seconds);
    if (!legitimate || value <= 0) return false;
    const current = this.data.lifetime.fastestAscentSeconds;
    if (current === null || value < current) {
      this.data.lifetime.fastestAscentSeconds = value;
      return this.save();
    }
    return false;
  }

  recordActivePlaytime(seconds) {
    const value = Math.max(0, finiteNumber(seconds));
    if (!value) return false;
    this.data.lifetime.activePlaytimeSeconds += value;
    return this.save();
  }

  recordLegitimateEarnings(amount) {
    const value = Math.max(0, Math.floor(finiteNumber(amount)));
    if (!value) return false;
    this.data.lifetime.legitimateEarnings += value;
    return this.save();
  }

  recordRun(summary = {}) {
    this.data.lifetime.runsCompleted += 1;
    this.data.lifetime.highestElevation = Math.max(
      this.data.lifetime.highestElevation,
      finiteNumber(summary.highestElevation)
    );
    this.data.runHistory.unshift({
      endedAt: Date.now(),
      highestElevation: finiteNumber(summary.highestElevation),
      fishCaught: Math.max(0, Math.floor(finiteNumber(summary.fishCaught))),
      rarest: typeof summary.rarest === 'string' ? summary.rarest.replace(/^Epic\b/, 'Legendary') : 'None',
      summitReached: Boolean(summary.summitReached),
      start: typeof summary.start === 'string' ? summary.start : ''
    });
    this.data.runHistory.length = Math.min(12, this.data.runHistory.length);
    return this.save();
  }

  getSnapshot() {
    return copy(this.data);
  }

  getLifetimeSnapshot() {
    return copy(this.data.lifetime ?? {});
  }

  getSlotSummaries() {
    return this.slotStore.slots.map((slot) => summarizeSlot(slot, this.activeSlotId));
  }

  createSlot(id) {
    const slot = this.slotStore.slots.find((entry) => entry.id === id);
    if (!slot || slot.data) return false;
    const now = Date.now();
    slot.data = defaultSave();
    slot.createdAt = now;
    slot.updatedAt = now;
    try {
      this.writeSlotStore();
      this.revision += 1;
      return true;
    } catch {
      this.lastLoadError = 'write-unavailable';
      slot.data = null;
      slot.createdAt = 0;
      slot.updatedAt = 0;
      return false;
    }
  }

  selectSlot(id) {
    const slot = this.slotStore.slots.find((entry) => entry.id === id && entry.data);
    if (!slot) return false;
    const previous = this.activeSlotId;
    this.activeSlotId = slot.id;
    this.slotStore.activeSlotId = slot.id;
    this.data = migrate(slot.data);
    try {
      this.writeSlotStore();
      this.revision += 1;
      return true;
    } catch {
      this.activeSlotId = previous;
      this.slotStore.activeSlotId = previous;
      this.data = migrate(this.slotStore.slots.find((entry) => entry.id === previous)?.data ?? defaultSave());
      this.lastLoadError = 'write-unavailable';
      return false;
    }
  }

  replaceSlotData(id, value) {
    const slot = this.slotStore.slots.find((entry) => entry.id === id);
    if (!slot) return false;
    const previous = { data: slot.data, createdAt: slot.createdAt, updatedAt: slot.updatedAt };
    const now = Date.now();
    slot.data = migrate(value);
    slot.createdAt ||= now;
    slot.updatedAt = now;
    try {
      this.writeSlotStore();
      if (id === this.activeSlotId) this.data = migrate(slot.data);
      this.revision += 1;
      return true;
    } catch {
      Object.assign(slot, previous);
      this.lastLoadError = 'write-unavailable';
      return false;
    }
  }

  resetSlot(id) {
    return this.replaceSlotData(id, defaultSave());
  }

  deleteSlot(id) {
    const slot = this.slotStore.slots.find((entry) => entry.id === id);
    if (!slot) return false;
    if (id === this.activeSlotId) return this.resetSlot(id);
    const previous = { ...slot };
    Object.assign(slot, emptySlot(this.slotStore.slots.indexOf(slot)));
    try {
      this.writeSlotStore();
      this.revision += 1;
      return true;
    } catch {
      Object.assign(slot, previous);
      this.lastLoadError = 'write-unavailable';
      return false;
    }
  }

  replaceData(value) {
    const previous = this.data;
    this.data = migrate(value);
    if (this.save()) return true;
    this.data = previous;
    return false;
  }
}
