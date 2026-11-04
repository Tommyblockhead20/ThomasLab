import crypto from 'node:crypto';
import { DERBY_MODES, COMPETITION_PRIZES, derbyScore } from '../../src/multiplayer/competition-rules.js';
import { resolveSpecies } from '../../src/fishing/fish-data.js';

// Room events are ephemeral, like the room itself. Only the winner's ordinary local
// currency receipt is saved. No event claims ownership of or removes a specimen.
export class RoomCompetition {
  constructor(room, { clock = Date.now, schedule = true } = {}) {
    this.room = room; this.clock = clock; this.event = null;
    if (schedule) { this.timer = setInterval(() => this.tick(), 500); this.timer.unref?.(); }
  }
  dispose() { clearInterval(this.timer); }
  state() {
    if (!this.event) return null;
    const { seenCatches, ...event } = this.event;
    return structuredClone(event);
  }
  publish() { this.room.broadcastState(); }
  participant(id) { return this.event?.participants.find(p => p.playerId === id); }
  action(session, payload = {}) {
    const { action } = payload, now = this.clock();
    if (action === 'create') {
      if (this.room.hostId !== session.playerId) return 'Only the room host can create an event.';
      if (this.event && !['finished', 'cancelled'].includes(this.event.phase)) return 'An event is already open.';
      if (!['derby', 'race'].includes(payload.kind)) return 'Choose a fishing derby or summit race.';
      if (payload.kind === 'derby' && !Object.hasOwn(DERBY_MODES, payload.mode)) return 'Choose a derby scoring mode.';
      this.event = { id: crypto.randomUUID(), kind: payload.kind, mode: payload.mode ?? 'count', phase: 'lobby',
        allowEquipment: payload.allowEquipment === true, durationMs: payload.kind === 'race' ? 20 * 60_000
          : ([3, 5, 10].includes(Number(payload.minutes)) ? Number(payload.minutes) : 5) * 60_000,
        prize: COMPETITION_PRIZES[payload.kind], participants: [], createdAt: now, deadline: null, startedAt: null,
        winnerIds: [], awards: [], message: 'Join the event, then the host can start.', seenCatches: new Set() };
      const joined = this.join(session, payload); if (joined) { this.event = null; return joined; }
    } else {
      if (!this.event || (payload.eventId && payload.eventId !== this.event.id)) return 'That event is no longer available.';
      const e = this.event, participant = this.participant(session.playerId);
      if (action === 'join') { const error = this.join(session, payload); if (error) return error; }
      else if (action === 'leave') {
        if (e.phase === 'lobby') e.participants = e.participants.filter(p => p.playerId !== session.playerId);
        else if (participant && !['finished', 'cancelled'].includes(e.phase)) participant.disqualified = 'Withdrew';
      } else if (action === 'start') {
        if (this.room.hostId !== session.playerId || e.phase !== 'lobby') return 'Only the host can start the lobby.';
        e.participants = e.participants.filter(p => this.room.players.get(p.playerId)?.connected);
        if (e.participants.length < 2) return 'At least two players must join.';
        e.phase = 'preparing'; e.deadline = now + 15_000; e.message = 'Preparing competitors…';
      } else if (action === 'ready') {
        if (e.phase !== 'preparing' || !participant || participant.saveId !== payload.saveId) return 'Not preparing this save.';
        participant.ready = true;
      } else if (action === 'withdraw') {
        if (participant && !['finished', 'cancelled'].includes(e.phase)) participant.disqualified = 'Left the event or used a shortcut';
      } else if (action === 'cancel') {
        if (this.room.hostId !== session.playerId || ['finished', 'cancelled'].includes(e.phase)) return 'Only the host can cancel.';
        this.cancel('Cancelled by the host.'); return null;
      } else return 'Unknown event action.';
    }
    this.tick(); this.publish(); return null;
  }
  join(session, payload) {
    const e = this.event;
    if (e.phase !== 'lobby') return 'This event has already started.';
    if (typeof payload.saveId !== 'string' || !payload.saveId.length || payload.saveId.length > 140) return 'An active save is required.';
    if (!this.participant(session.playerId)) e.participants.push({ playerId: session.playerId, name: session.displayName,
      saveId: payload.saveId, ready: false, disqualified: null, count: 0, biggest: 0, bestValue: 0, haul: 0,
      lastCatchAt: 0, finishAt: null, checkpoints: [], teleportRevision: null });
    return null;
  }
  cancel(message) { if (!this.event) return; this.event.phase = 'cancelled'; this.event.message = message; this.event.deadline = null; this.publish(); }
  tick() {
    const e = this.event, now = this.clock(); if (!e || ['lobby', 'finished', 'cancelled'].includes(e.phase)) return;
    const available = e.participants.filter(p => !p.disqualified && this.room.players.has(p.playerId));
    if (available.length < 2) { this.cancel('Not enough competitors remain. No prize awarded.'); return; }
    if (e.phase === 'preparing') {
      if (available.every(p => p.ready && this.room.players.get(p.playerId)?.connected)) {
        e.phase = 'countdown'; e.deadline = now + 5000; e.message = 'Get ready!'; this.publish();
      } else if (now >= e.deadline) this.cancel('A competitor could not get ready. Try starting again.');
    } else if (e.phase === 'countdown' && now >= e.deadline) {
      if (available.some(p => !this.room.players.get(p.playerId)?.connected)) { this.cancel('A competitor disconnected before the start.'); return; }
      e.phase = 'active'; e.startedAt = now; e.deadline = now + e.durationMs; e.message = 'Go!';
      for (const p of available) {
        const snapshot = this.room.players.get(p.playerId)?.lastSnapshot;
        p.teleportRevision = snapshot?.teleportRevision ?? null;
        if (e.kind === 'race' && (!snapshot || snapshot.locationId !== 'main-mountain' || snapshot.position.y > 8)) {
          this.cancel('All racers must be at the shared shore start.'); return;
        }
      }
      this.publish();
    } else if (e.phase === 'active' && now >= e.deadline) this.finish();
  }
  snapshot(session, snapshot) {
    const e = this.event, p = this.participant(session.playerId);
    if (!p || p.disqualified || !e || !['countdown', 'active'].includes(e.phase) || e.kind !== 'race') return;
    if (e.phase === 'countdown') { p.teleportRevision = snapshot.teleportRevision; return; }
    if (snapshot.teleportRevision !== p.teleportRevision || snapshot.locationId !== 'main-mountain') {
      p.disqualified = 'Teleported or left the mountain'; this.tick(); this.publish(); return;
    }
    // Ordered elevation gates reject a direct finish claim and require a real ascent.
    const heights = [60, 120, 180, 240, 295];
    if (snapshot.position.y >= heights[p.checkpoints.length] && snapshot.position.y < heights[p.checkpoints.length] + 20) { p.checkpoints.push(this.clock()); this.publish(); }
    if (p.checkpoints.length === heights.length && snapshot.position.y >= 304.1 && snapshot.position.y <= 310
      && Math.hypot(snapshot.position.x - 260, snapshot.position.z) <= 10) {
      p.finishAt = this.clock(); this.finish([p]);
    }
  }
  catch(session, payload) {
    const e = this.event, p = this.participant(session.playerId), now = this.clock();
    if (!e || e.phase !== 'active' || e.kind !== 'derby' || !p || p.disqualified || now >= e.deadline) return;
    if (payload.eventId !== e.id || payload.saveId !== p.saveId || payload.legitimate !== true || payload.active === false) return;
    const species = resolveSpecies(payload.speciesId), id = String(payload.specimenId ?? '');
    if (!species || species.futureReserved || !id || id.length > 140 || e.seenCatches.has(id) || now - p.lastCatchAt < 1800) return;
    const length = Number(payload.length), value = Number(payload.value);
    if (!Number.isFinite(length) || length <= 0 || length > 10000 || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) return;
    e.seenCatches.add(id); p.lastCatchAt = now; p.count++; p.biggest = Math.max(p.biggest, length);
    p.bestValue = Math.max(p.bestValue, value); p.haul += value; this.publish();
  }
  finish(winners = null) {
    const e = this.event; if (!e || e.phase !== 'active') return;
    const eligible = e.participants.filter(p => !p.disqualified && this.room.players.get(p.playerId)?.connected);
    if (!winners && e.kind === 'derby') {
      const best = Math.max(0, ...eligible.map(p => derbyScore(p, e.mode)));
      winners = best > 0 ? eligible.filter(p => derbyScore(p, e.mode) === best) : [];
    }
    winners ??= [];
    e.phase = 'finished'; e.finishedAt = this.clock(); e.deadline = null; e.winnerIds = winners.map(p => p.playerId);
    const amount = winners.length ? Math.floor(e.prize / winners.length) : 0;
    e.awards = winners.map(p => ({ eventId: e.id, playerId: p.playerId, saveId: p.saveId, amount, kind: e.kind }));
    e.message = winners.length ? `${winners.map(p => p.name).join(' & ')} won! ${winners.length > 1 ? 'Prize shared.' : ''}`
      : 'No winner this time. No prize awarded.';
    this.publish();
  }
}
