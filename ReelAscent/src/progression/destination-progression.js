export const DESTINATION_UNLOCK_RULES = Object.freeze({
  'cave-fishing-island': Object.freeze({ badges: 2, species: 10, playable: false, label: 'Basalt Hollow' }),
  'normal-fishing-island': Object.freeze({ badges: 5, species: 25, playable: true, label: 'Mangrove Island' }),
  'cold-island': Object.freeze({ badges: 10, species: 50, playable: true, label: 'Frosthook' }),
  'veiled-athenaeum': Object.freeze({ badges: 20, species: 100, playable: true, label: 'The Veiled Athenaeum' })
});

export const ALWAYS_AVAILABLE_DESTINATIONS = Object.freeze(new Set([
  'main-mountain', 'home-island', 'shop-island', 'aquarium-island', 'bluewater-reach'
]));

const cleanIds = (items) => [...new Set((Array.isArray(items) ? items : [])
  .filter((id) => typeof id === 'string' && id).map((id) => id.slice(0, 160)))];

export function destinationProgressCounts(save = {}) {
  return Object.freeze({
    badges: cleanIds(save.trailBadges?.unlocked).length,
    species: cleanIds(save.trailBadges?.uniqueSpeciesCaught).length
  });
}

export function derivedDestinationUnlocks(save = {}) {
  const counts = destinationProgressCounts(save);
  return Object.keys(DESTINATION_UNLOCK_RULES).filter((id) => {
    const rule = DESTINATION_UNLOCK_RULES[id];
    return counts.badges >= rule.badges || counts.species >= rule.species;
  });
}

export function normalizeDestinationProgression(value = {}, save = {}) {
  return {
    unlocked: cleanIds([
      ...cleanIds(value.unlocked),
      ...derivedDestinationUnlocks(save)
    ]).filter((id) => Object.hasOwn(DESTINATION_UNLOCK_RULES, id))
  };
}

export function refreshDestinationProgression(save = {}) {
  const next = normalizeDestinationProgression(save.destinationProgression, save);
  const previous = cleanIds(save.destinationProgression?.unlocked);
  save.destinationProgression = next;
  return next.unlocked.some((id) => !previous.includes(id));
}

export function getDestinationAccess(save = {}, locationId) {
  const counts = destinationProgressCounts(save);
  const boatOwned = save.boat?.owned === true;
  if (locationId === 'skyreach-foundation') {
    return Object.freeze({ state: 'known-unavailable', revealed: true, playable: false, boatOwned,
      reason: 'Skyreach is charted, but unavailable in this version.' });
  }
  if (ALWAYS_AVAILABLE_DESTINATIONS.has(locationId)) {
    return Object.freeze({ state: 'available', revealed: true, playable: true, boatOwned, reason: '' });
  }
  const rule = DESTINATION_UNLOCK_RULES[locationId];
  if (!rule) return Object.freeze({ state: 'available', revealed: true, playable: true, boatOwned, reason: '' });
  const unlocked = cleanIds(save.destinationProgression?.unlocked).includes(locationId)
    || counts.badges >= rule.badges || counts.species >= rule.species;
  if (!unlocked) {
    return Object.freeze({ state: 'locked-cloud', revealed: false, playable: false, boatOwned,
      reason: `Discover ${rule.badges} Trail Badges or catch ${rule.species} unique species.` });
  }
  if (!rule.playable) {
    return Object.freeze({ state: 'known-unavailable', revealed: true, playable: false, boatOwned,
      reason: `${rule.label} has been revealed, but is unavailable in this version.` });
  }
  return Object.freeze({ state: 'available', revealed: true, playable: true, boatOwned, reason: '' });
}

