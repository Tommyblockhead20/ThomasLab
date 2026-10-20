/* Shared by project pages. The landing page owns the accomplishment list and display. */
(() => {
  "use strict";
  const KEY = "thomaslabAchievementsV1";
  const names = {
    "game-picker-picked": "Dealer's Choice",
    "find-your-place-10-weights": "Tweaker",
    "rank-things-10-items": "Getting Crowded",
    "custom-state-3-maps": "New Management",
    "house-rater-complete": "Home Inspector",
    "challenges-all-categories": "Variety Pack",
    "challenges-complete": "Actually Did It",
    "pirate-start-campaign": "Set Sail",
    "train-2026": "It's 2026 Somewhere",
    "traffic-all-scenarios": "Try Everything",
    "traffic-queue-250": "Traffic Jam",
    "traffic-longest-wait-500": "Are We There Yet?",
    "traffic-moving-people": "Moving People",
    "traffic-engineer": "Traffic Engineer",
    "dog-25-discoveries": "Good Boy",
    "dog-69-discoveries": "Nice.",
    "recipes-view-all": "Clean Plate Club",
    "ancestors-view-all": "Family Reunion",
    "places-viewed": "Been Around",
    "ti-5-questions": "Curious",
    "ti-all-responses": "Know-It-All"
  };
  const fresh = () => ({ version: 1, unlocked: {}, stats: {}, iconClicks: {}, visits: {} });
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved || typeof saved !== "object") return fresh();
      const state = fresh();
      for (const field of ["unlocked", "stats", "iconClicks", "visits"]) {
        if (saved[field] && typeof saved[field] === "object" && !Array.isArray(saved[field])) state[field] = saved[field];
      }
      return state;
    } catch { return fresh(); }
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
  let toastTimer;
  function announce(id) {
    if (!document.body) return;
    let toast = document.getElementById("thomas-achievement-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "thomas-achievement-toast";
      toast.setAttribute("role", "status");
      Object.assign(toast.style, {
        position: "fixed", left: "18px", bottom: "18px", zIndex: "9999",
        maxWidth: "min(340px, calc(100vw - 36px))", padding: "11px 14px",
        border: "2px solid #fff", borderRadius: "12px", background: "#171717",
        color: "#fff", boxShadow: "3px 3px 0 #171717", font: "700 14px/1.3 system-ui, sans-serif",
        pointerEvents: "none"
      });
      document.body.appendChild(toast);
    }
    toast.textContent = `🏆 ${names[id] || id} unlocked`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 3200);
  }
  function unlock(id) {
    const state = read();
    if (state.unlocked[id]) return false;
    state.unlocked[id] = Date.now();
    write(state);
    announce(id);
    return true;
  }
  function getStat(key) { return read().stats[key]; }
  function setStat(key, value) {
    const state = read();
    state.stats[key] = value;
    write(state);
    return value;
  }
  function increment(key, amount = 1) {
    const next = Number(getStat(key) || 0) + amount;
    return setStat(key, next);
  }
  function markUnique(key, value) {
    const state = read();
    const items = Array.isArray(state.stats[key]) ? state.stats[key] : [];
    if (!items.includes(value)) {
      state.stats[key] = [...items, value];
      write(state);
    }
    return state.stats[key]?.length || items.length;
  }
  window.ThomasAchievements = { unlock, getStat, setStat, increment, markUnique };
})();
