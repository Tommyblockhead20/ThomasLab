export const SPECIMEN_SORT_OPTIONS = Object.freeze([
  ['value', 'Value — High to Low'],
  ['value-asc', 'Value — Low to High'],
  ['recent', 'Recent — Newest First'],
  ['recent-asc', 'Recent — Oldest First'],
  ['rarity', 'Rarity — Legendary to Common'],
  ['rarity-asc', 'Rarity — Common to Legendary'],
  ['weight', 'Weight — Heaviest First'],
  ['weight-asc', 'Weight — Lightest First'],
  ['length', 'Length — Longest First'],
  ['length-asc', 'Length — Shortest First'],
  ['species', 'Filter by Species'],
  ['location', 'Filter by Location']
]);

const RARITY_ORDER = Object.freeze({ common: 0, uncommon: 1, rare: 2, legendary: 3 });
const compareText = (left, right) => String(left ?? '').localeCompare(String(right ?? ''), undefined, { sensitivity: 'base' });
const recentTime = (entry) => Number(entry?.provenance?.caughtAt ?? entry?.caughtAt) || 0;
const locationLabel = (entry) => entry?.provenance?.locationLabel || entry?.locationLabel || 'Unknown water';

export function specimenFilterOptions(specimens = [], mode = '') {
  const choices = new Map();
  for (const specimen of specimens) {
    if (mode === 'species' && specimen?.speciesId) choices.set(specimen.speciesId, specimen.name || specimen.speciesId);
    if (mode === 'location') choices.set(locationLabel(specimen), locationLabel(specimen));
  }
  return [...choices].sort((a, b) => compareText(a[1], b[1]));
}

export function filterSpecimens(specimens = [], mode = '', filter = '') {
  if (!filter) return [...specimens];
  if (mode === 'species') return specimens.filter((entry) => entry?.speciesId === filter);
  if (mode === 'location') return specimens.filter((entry) => locationLabel(entry) === filter);
  return [...specimens];
}

export function sortInventorySpecimens(specimens = [], mode = 'recent') {
  const indexed = specimens.map((specimen, index) => ({ specimen, index }));
  const recent = (a, b) => recentTime(b.specimen) - recentTime(a.specimen) || b.index - a.index;
  indexed.sort((a, b) => {
    let difference = 0;
    if (mode.startsWith('value')) difference = (Number(b.specimen.value) || 0) - (Number(a.specimen.value) || 0);
    else if (mode.startsWith('rarity')) difference = (RARITY_ORDER[String(b.specimen.rarity).toLowerCase()] ?? -1)
      - (RARITY_ORDER[String(a.specimen.rarity).toLowerCase()] ?? -1);
    else if (mode.startsWith('weight')) difference = (Number(b.specimen.weight) || 0) - (Number(a.specimen.weight) || 0);
    else if (mode.startsWith('length')) difference = (Number(b.specimen.length) || 0) - (Number(a.specimen.length) || 0);
    else if (mode === 'species') difference = compareText(a.specimen.name, b.specimen.name);
    else if (mode === 'location') difference = compareText(locationLabel(a.specimen), locationLabel(b.specimen));
    else if (mode === 'size') difference = (Number(b.specimen.length) || 0) - (Number(a.specimen.length) || 0);
    else difference = recent(a, b);
    if (mode.endsWith('-asc')) difference = -difference;
    return difference || recent(a, b) || compareText(a.specimen.name, b.specimen.name);
  });
  return indexed.map(({ specimen }) => specimen);
}

export function orderAndFilterSpecimens(specimens = [], mode = 'value', filter = '') {
  return sortInventorySpecimens(filterSpecimens(specimens, mode, filter), mode);
}
