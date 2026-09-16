import { FISH_SPECIES } from './fish-data.js';

const EXPECTED_BY_NAME = Object.freeze([
  [/(alligator|crocodile)/i, new Set(['serpent'])],
  [/(whale|dolphin|porpoise|orca|narwhal)/i, new Set(['cetacean', 'shark'])],
  [/(seal|sea lion|walrus|penguin)/i, new Set(['pinniped'])],
  [/(turtle|kappa|aspidochelone)/i, new Set(['turtle'])],
  [/(frog)/i, new Set(['frog'])],
  [/(salamander|newt|mudpuppy|axolotl)/i, new Set(['salamander'])],
  [/(octopus|kraken)/i, new Set(['octopus', 'lusca'])],
  [/(squid|cuttlefish)/i, new Set(['squid', 'lusca'])],
  [/(crab)/i, new Set(['crab', 'horseshoe'])],
  [/(lobster|crayfish|crawfish)/i, new Set(['lobster'])],
  [/(mermaid)/i, new Set(['sirenian'])],
  [/(beaver)/i, new Set(['beaver'])],
  [/(platypus)/i, new Set(['platypus'])]
]);

export function auditCreatureModelAssignments(species = FISH_SPECIES) {
  const grouped = new Map();
  const mismatches = [];
  for (const creature of species) {
    const archetype = creature.visual?.archetype ?? 'missing';
    const entries = grouped.get(archetype) ?? [];
    entries.push(creature.id);
    grouped.set(archetype, entries);
    const rule = EXPECTED_BY_NAME.find(([pattern]) => pattern.test(creature.name));
    if (rule && !rule[1].has(archetype)) mismatches.push({
      id: creature.id, name: creature.name, archetype, expected: [...rule[1]]
    });
  }
  return Object.freeze({
    total: species.length,
    archetypeCounts: Object.freeze(Object.fromEntries([...grouped]
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, ids]) => [key, ids.length]))),
    mismatches: Object.freeze(mismatches.map((entry) => Object.freeze(entry)))
  });
}

export const CREATURE_MODEL_AUDIT = auditCreatureModelAssignments();
