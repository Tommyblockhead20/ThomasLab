export const MOBILE_CONTEXT_SWITCH_DELAY_MS = 120;
export const MOBILE_CONTEXT_GRACE_MS = 180;

const sameKind = (left, right) => (left?.kind ?? null) === (right?.kind ?? null);

export function stabilizeMobileContext(previous = {}, next = null, now = 0) {
  const state = {
    current: previous.current ?? null,
    candidate: previous.candidate ?? null,
    candidateSince: Number(previous.candidateSince) || now,
    lastSeenAt: Number(previous.lastSeenAt) || now
  };

  if (sameKind(state.current, next)) {
    state.current = next;
    state.candidate = null;
    state.candidateSince = now;
    state.lastSeenAt = now;
    return state;
  }

  if (!state.current && next) {
    return { current: next, candidate: null, candidateSince: now, lastSeenAt: now };
  }

  if (!next) {
    state.candidate = null;
    state.candidateSince = now;
    if (now - state.lastSeenAt > MOBILE_CONTEXT_GRACE_MS) state.current = null;
    return state;
  }

  // Higher-priority actions take ownership immediately. This keeps a nearby shop/bench
  // interaction or an active climb from ever feeling delayed behind a fishing/grip hint.
  if ((next.priority ?? 0) > (state.current?.priority ?? 0)) {
    return { current: next, candidate: null, candidateSince: now, lastSeenAt: now };
  }

  if (!sameKind(state.candidate, next)) {
    state.candidate = next;
    state.candidateSince = now;
    return state;
  }

  if (now - state.candidateSince >= MOBILE_CONTEXT_SWITCH_DELAY_MS) {
    return { current: next, candidate: null, candidateSince: now, lastSeenAt: now };
  }
  state.candidate = next;
  return state;
}
