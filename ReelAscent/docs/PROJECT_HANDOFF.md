# Version 6.0 handoff

The canonical, current project handoff is [`../PROJECT_HANDOFF.md`](../PROJECT_HANDOFF.md).

Version 6.0 runs on the active `src/world/mountain-v2.js` world and adds exactly 24 fishing waters plus 200 persistent aquatic creature types. Its modular fishing architecture is:

- `src/fishing/species-expansion.js` — 149 new stable species records
- `src/fishing/fish-ecology.js` — habitat weights, zone populations, ocean angle climate, and audit
- `src/fishing/fish-data.js` — preserved first 51 IDs, final roster, specimens, and capped selection
- `src/fishing/fishing-zone.js` — ellipse and annulus water geometry
- `src/fishing/rhythm-session.js` — slowed songs, chord validation, easier holds, and telemetry
- `src/fishing/fishing.js` — live selection/state/audio integration
- `src/ui/hud.js` / `src/styles.css` — receptor pulses and expanded F3 fishing debug

The final deterministic distribution is 96 exclusive species (four per water) and 104 shared species. No species has zero waters, every shared species appears in at least two waters, and no individual selection probability exceeds 25% in a populated water.

Mountain traversal geometry, climbing, sliding, collision, camera, and route layout were not changed. F7 unlimited stamina, F8 summit-rim teleport, and Home/current-start return remain temporary playtest controls outside the debug requirement.

Validation at handoff: 54/54 automated tests passing; in-app browser desktop and forced-mobile fishing input checks passing; no browser console warnings/errors; `npm run build` succeeded with 1,232 modules transformed. See the canonical handoff for the exact build advisories and remaining work.
