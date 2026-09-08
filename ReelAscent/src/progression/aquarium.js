import { createSpecimenRecord, findSpecimenIndex } from './inventory.js';

export const AQUARIUM_PAYOUT_INTERVAL_SECONDS = 5 * 60;
export const AQUARIUM_PAYOUT_RATE = .01;
export const AQUARIUM_TANK_CAPACITY = 30;
export const AQUARIUM_MAX_TANKS = 10;
export const AQUARIUM_TANK_UPGRADES = Object.freeze([
  Object.freeze({ tankCount: 1, capacity: 30, price: 0 }),
  Object.freeze({ tankCount: 2, capacity: 60, price: 2500 }),
  Object.freeze({ tankCount: 3, capacity: 90, price: 5000 }),
  Object.freeze({ tankCount: 4, capacity: 120, price: 9000 }),
  Object.freeze({ tankCount: 5, capacity: 150, price: 15000 }),
  Object.freeze({ tankCount: 6, capacity: 180, price: 24000 }),
  Object.freeze({ tankCount: 7, capacity: 210, price: 36000 }),
  Object.freeze({ tankCount: 8, capacity: 240, price: 50000 }),
  Object.freeze({ tankCount: 9, capacity: 270, price: 68000 }),
  Object.freeze({ tankCount: 10, capacity: 300, price: 90000 })
]);
// Kept only as a migration lookup for v14-and-earlier saves.
export const LEGACY_AQUARIUM_CAPACITIES = Object.freeze([25, 50, 100, 150, 200, 250, 300]);
export const AQUARIUM_CAPACITY_TIERS = AQUARIUM_TANK_UPGRADES;

export function aquariumTankCountFromLegacy(tier = 0, residentCount = 0) {
  const oldCapacity = LEGACY_AQUARIUM_CAPACITIES[Math.max(0, Math.min(6, Math.floor(Number(tier) || 0)))] ?? 25;
  return Math.max(1, Math.min(AQUARIUM_MAX_TANKS,
    Math.ceil(Math.max(oldCapacity, Math.max(0, Number(residentCount) || 0)) / AQUARIUM_TANK_CAPACITY)));
}

export function aquariumCapacityForTankCount(tankCount = 1) {
  return Math.max(1, Math.min(AQUARIUM_MAX_TANKS, Math.floor(Number(tankCount) || 1))) * AQUARIUM_TANK_CAPACITY;
}

export function aquariumCapacityForTier(tier = 0) {
  return aquariumCapacityForTankCount(Math.floor(Number(tier) || 0) + 1);
}

export function highestValueSpecimenIds(specimens = [], limit = AQUARIUM_TANK_CAPACITY, excluded = new Set()) {
  return [...specimens]
    .filter((specimen) => specimen?.specimenId && !excluded.has(specimen.specimenId))
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)
      || String(a.specimenId).localeCompare(String(b.specimenId)))
    .slice(0, Math.max(0, limit))
    .map((specimen) => specimen.specimenId);
}

export function normalizeAquariumTankDisplays(aquarium = [], tankCount = 1, assignments = [], manualFlags = []) {
  const count = Math.max(1, Math.min(AQUARIUM_MAX_TANKS, Math.floor(Number(tankCount) || 1)));
  const validIds = new Set(aquarium.map((specimen) => specimen.specimenId));
  const used = new Set();
  const manual = Array.from({ length: count }, (_, index) => Boolean(manualFlags[index]));
  const displays = Array.from({ length: count }, (_, index) => {
    const ids = [];
    for (const id of Array.isArray(assignments[index]) ? assignments[index] : []) {
      if (typeof id !== 'string' || !validIds.has(id) || used.has(id) || ids.length >= AQUARIUM_TANK_CAPACITY) continue;
      ids.push(id);
      used.add(id);
    }
    return ids;
  });
  for (let index = 0; index < count; index += 1) {
    if (manual[index]) continue;
    for (const id of highestValueSpecimenIds(aquarium, AQUARIUM_TANK_CAPACITY, used)) {
      displays[index].push(id);
      used.add(id);
    }
  }
  return { displays, manual };
}

export function aquariumExhibitedValue(aquarium = []) {
  return aquarium.reduce((total, specimen) => total + Math.max(0, Math.floor(Number(specimen?.value) || 0)), 0);
}

export function aquariumPayoutForValue(value = 0) {
  return Math.max(0, Math.floor(Math.max(0, Number(value) || 0) * AQUARIUM_PAYOUT_RATE));
}

export function prepareCatchDisposition(catchData, value) {
  if (!catchData?.speciesId) return null;
  return Object.freeze({
    catchData,
    value,
    specimen: createSpecimenRecord(catchData, value)
  });
}

export function storeAquariumSpecimen(aquarium, prepared) {
  if (!prepared?.specimen || aquarium.some((entry) => entry.specimenId === prepared.specimen.specimenId)) return false;
  aquarium.push(prepared.specimen);
  return true;
}

export function removeAquariumSpecimen(aquarium, specimenId) {
  const index = findSpecimenIndex(aquarium, specimenId);
  if (index < 0) return null;
  return aquarium.splice(index, 1)[0] ?? null;
}
