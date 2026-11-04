export const DERBY_MODES = Object.freeze({
  biggest: 'Biggest single catch', count: 'Most fish', bestValue: 'Highest-value fish', haul: 'Highest-value haul'
});
export const COMPETITION_PRIZES = Object.freeze({ derby: 150, race: 200 });
export const COMPETITION_ACTIVE_PHASES = Object.freeze(['preparing', 'countdown', 'active']);
export const derbyScore = (entry, mode) => ({ biggest: entry.biggest, count: entry.count, bestValue: entry.bestValue, haul: entry.haul })[mode] ?? 0;
export const competitionParticipant = (event, playerId) => event?.participants?.find(p => p.playerId === playerId);
export const isCompetitionPlaying = (event, playerId) => COMPETITION_ACTIVE_PHASES.includes(event?.phase)
  && Boolean(competitionParticipant(event, playerId)) && !competitionParticipant(event, playerId).disqualified;

