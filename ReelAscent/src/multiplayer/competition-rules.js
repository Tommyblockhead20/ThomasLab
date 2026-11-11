export const DERBY_MODES = Object.freeze({
  biggest: 'Biggest single catch', count: 'Most fish', bestValue: 'Highest-value fish', haul: 'Highest-value haul'
});
export const COMPETITION_PRIZES = Object.freeze({ derby: 150, race: 200 });
export const EVENT_ISLAND_ID = 'jester-island';
export const EVENT_ISLAND_NAME = "Rascal's Rest";
export const EVENT_DESTINATIONS = Object.freeze(['main-mountain','home-island','shop-island','aquarium-island','normal-fishing-island','cold-island','veiled-athenaeum','bluewater-reach','jester-island']);
// The field size is locked at the start. Withdrawals cannot raise anyone's payout.
export function competitionPrizes(count) {
  return [...({2:[100],3:[150],4:[150,50],5:[200,75],6:[225,100],7:[250,100,50],8:[275,125,60],9:[300,150,75],10:[350,175,100,50]}[Math.max(2,Math.min(10,Math.floor(count)))])];
}
export function eventAllowedIslands(event, participants = event?.participants ?? []) {
  if (event?.kind === 'race') return ['main-mountain'];
  if (event?.islandRule === 'custom') return EVENT_DESTINATIONS.filter(id=>event.selectedIslands?.includes(id));
  if (event?.islandRule === 'shared') return EVENT_DESTINATIONS.filter(id=>participants.every(p=>(p.unlockedIslands??['main-mountain','home-island','shop-island','aquarium-island','jester-island']).includes(id)));
  return [...EVENT_DESTINATIONS];
}
export function raceStartOffset(index, count, spaced = false) { return spaced ? (index-(count-1)/2)*1.2 : 0; }
export const COMPETITION_ACTIVE_PHASES = Object.freeze(['preparing', 'countdown', 'active']);
export const derbyScore = (entry, mode) => ({ biggest: entry.biggest, count: entry.count, bestValue: entry.bestValue, haul: entry.haul })[mode] ?? 0;
export const competitionParticipant = (event, playerId) => event?.participants?.find(p => p.playerId === playerId);
export const isCompetitionPlaying = (event, playerId) => COMPETITION_ACTIVE_PHASES.includes(event?.phase)
  && Boolean(competitionParticipant(event, playerId)) && !competitionParticipant(event, playerId).disqualified;

