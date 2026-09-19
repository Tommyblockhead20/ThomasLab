import SCENE from '../world/library-island-v2.scene.json' with { type: 'json' };
import { FISH_SPECIES, getWeightedSpeciesTable } from './fish-data.js';
import { getEcologySelection } from './fish-ecology.js';

export const LIBRARY_MYTHICAL_REASONS = Object.freeze({
  abaia: 'Melanesian lake guardian serpent',
  bunyip: 'Australian Aboriginal water monster',
  'frost-wyrm': 'fantasy ice wyrm',
  jormungandr: 'Norse world serpent',
  kappa: 'Japanese river yokai',
  kelpie: 'Scottish water horse',
  lernaean_hydra: 'Greek many-headed water monster',
  leviathan: 'mythic primordial sea monster',
  'moonwake-squid': 'authored supernatural moonlit cephalopod',
  naiad: 'Greek freshwater nymph',
  nokken: 'Scandinavian water spirit',
  qallupilluk: 'Inuit sea-being folklore',
  'rimefin-wisp': 'authored supernatural ice wisp',
  selkie: 'Celtic seal shapeshifter',
  'starfall-minnow': 'authored celestial fantasy creature',
  'summit-water-dragon': 'fantasy water dragon',
  taniwha: 'Maori supernatural water guardian',
  undine: 'European elemental water spirit',
  'water-sprite': 'supernatural water spirit',
  'whisper-eel': 'authored supernatural whispering creature'
});

export function validateLibraryEcology(scene = SCENE) {
  const speciesById = new Map(FISH_SPECIES.map((species) => [species.id, species]));
  const errors = [];
  const waters = (scene.waters ?? []).map((water) => {
    const zone = {
      id: water.id, label: water.label, center: { x: 0, z: 0 }, radii: { x: 5, z: 4 },
      tier: water.tier ?? 'lower', waterType: water.waterType, theme: water.theme,
      ecologyThemes: water.ecologyThemes, cave: water.cave,
      authoredFishIds: [...(water.fishIds ?? [])], allowedFishIds: [...(water.fishIds ?? [])],
      probabilityGroup: water.probabilityGroup ?? water.id,
      modifiers: { maximumSpeciesProbability: .25 }
    };
    const selection = getEcologySelection(zone, zone.center);
    const table = getWeightedSpeciesTable(selection.fishIds, {
      rarityTier: selection.habitat.rarityTier,
      habitatWeights: selection.habitatWeights,
      maximumSpeciesProbability: .25
    });
    const candidates = table.map((entry) => {
      const species = speciesById.get(entry.fish.id);
      const reason = LIBRARY_MYTHICAL_REASONS[entry.fish.id] ?? '';
      if (!reason) errors.push(`${water.id}: ordinary/unclassified species ${entry.fish.id}`);
      if (!species) errors.push(`${water.id}: unknown species ${entry.fish.id}`);
      if (species?.futureReserved) errors.push(`${water.id}: futureReserved species ${entry.fish.id}`);
      return {
        speciesId: entry.fish.id,
        name: entry.fish.name,
        rarity: entry.fish.rarity,
        mythicalReason: reason,
        futureReserved: Boolean(species?.futureReserved),
        baselineProbability: entry.probability
      };
    });
    if (!candidates.length) errors.push(`${water.id}: no eligible candidates`);
    const totalProbability = candidates.reduce((sum, candidate) => sum + candidate.baselineProbability, 0);
    if (candidates.length && Math.abs(totalProbability - 1) > 1e-8) errors.push(`${water.id}: probabilities total ${totalProbability}`);
    return { waterId: water.id, label: water.label, candidates, totalProbability };
  });
  if (new Set(waters.map((water) => water.candidates.map((candidate) => candidate.speciesId).sort().join('|'))).size !== waters.length) {
    errors.push('Library waters do not have distinct candidate pools');
  }
  return { ok: errors.length === 0, errors, waters };
}
