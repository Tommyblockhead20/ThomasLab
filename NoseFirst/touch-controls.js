// A second finger must not retrigger a one-shot action or release the finger
// that is still holding Sniff. A new gesture also recovers from lost cancels.
export function wireTouchHold(element, { start, end, audioReady }) {
  let owner = null;
  element.addEventListener('touchstart', event => {
    if (owner !== null && Array.from(event.touches).some(t => t.identifier === owner)) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    owner = touch.identifier;
    audioReady?.();
    start();
    event.preventDefault();
  }, { passive: false });
  const finish = event => {
    if (owner === null || !Array.from(event.changedTouches).some(t => t.identifier === owner)) return;
    owner = null;
    end?.();
    event.preventDefault();
  };
  element.addEventListener('touchend', finish, { passive: false });
  element.addEventListener('touchcancel', finish, { passive: false });
}
