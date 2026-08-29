import { createSpecimenRecord, findSpecimenIndex } from './inventory.js';

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
