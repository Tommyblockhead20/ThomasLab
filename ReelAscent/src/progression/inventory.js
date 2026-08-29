import { canonicalSpeciesId, resolveSpecies } from '../fishing/fish-data.js';
import { createDurableId } from './progression-save.js';

export function createSpecimenRecord(catchData, value, ownerId) {
  const caughtAt = Number.isFinite(catchData.caughtAt) ? catchData.caughtAt : Date.now();
  const sourceId = catchData.id ?? `${catchData.speciesId}-${caughtAt}`;
  const speciesId = canonicalSpeciesId(catchData.speciesId);
  const species = resolveSpecies(speciesId, true);
  return Object.freeze({
    recordVersion: 3,
    specimenId: createDurableId('specimen'),
    ownerId,
    sourceCatchId: sourceId,
    speciesId,
    name: catchData.name ?? species?.name ?? speciesId,
    rarity: catchData.rarity,
    length: catchData.length,
    weight: catchData.weight,
    expectedWeight: catchData.expectedWeight,
    lengthCategory: catchData.lengthCategory,
    sizeCategory: catchData.sizeCategory,
    lengthCategoryIndex: catchData.lengthCategoryIndex,
    sizeCategoryIndex: catchData.sizeCategoryIndex,
    sizeFraction: catchData.sizeFraction,
    weightFraction: catchData.weightFraction,
    condition: catchData.condition,
    shiny: Boolean(catchData.shiny),
    quality: catchData.quality ?? 'GOOD',
    value: Math.max(1, Math.floor(value)),
    provenance: Object.freeze({
      origin: 'caught',
      caughtAt,
      locationId: catchData.location ?? '',
      locationLabel: catchData.locationLabel ?? '',
      elevation: Number.isFinite(catchData.elevation) ? catchData.elevation : 0
    })
  });
}

export function findSpecimenIndex(specimens, specimenId) {
  return specimens.findIndex((entry) => entry.specimenId === specimenId);
}
