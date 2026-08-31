import { createSpecimenRecord, findSpecimenIndex } from './inventory.js';

export const AQUARIUM_PAYOUT_INTERVAL_SECONDS = 5 * 60;
export const AQUARIUM_PAYOUT_RATE = .01;
export const AQUARIUM_CAPACITY_TIERS = Object.freeze([
  Object.freeze({ capacity: 25, price: 0 }),
  Object.freeze({ capacity: 50, price: 2500 }),
  Object.freeze({ capacity: 100, price: 7500 }),
  Object.freeze({ capacity: 150, price: 15000 }),
  Object.freeze({ capacity: 200, price: 28000 }),
  Object.freeze({ capacity: 250, price: 45000 }),
  Object.freeze({ capacity: 300, price: 70000 })
]);

export function aquariumCapacityForTier(tier = 0) {
  return AQUARIUM_CAPACITY_TIERS[Math.max(0, Math.min(AQUARIUM_CAPACITY_TIERS.length - 1, Math.floor(Number(tier) || 0)))].capacity;
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
