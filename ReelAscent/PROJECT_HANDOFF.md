# Reel Ascent v8.8 focused continuation handoff

Status: implemented in the current project tree. No commit, push, deployment, protocol change, progression reset, or production-server mutation was performed.

1. **Scope honored**

   This pass is limited to the v8.8 map cleanup, seated-fishing input ordering, appearance reset/default verification, Fallglass waterfall clipping, and cave-mouth block cleanup. The future mountain rebalance, islands, GPS/player tracking, and other large world changes remain deferred.

2. **500/550/600-ft map pins removed**

   The three individual ledge markers and labels are no longer rendered. Their real traversal geometry and map-data descriptors remain intact, as do the five data-derived elevation regions and their legend.

3. **Cave map labels removed**

   All four cave mouths retain the gray `C` symbol at their data-derived entrance position. The visible cave-name text beside each symbol is removed; the numbered water list remains unchanged.

4. **Split Boulder finding**

   Split Boulder is genuine, deliberately authored world geometry at angle 35°/radius 119: two differently colored, intersecting natural rock teeth approximately 7.2 m and 8.1 m tall, both grounded and climbable. Its map marker is retained.

5. **Giant Tilted Slab finding**

   A construction branch exists for an 11.5 × 5.8 × 9.2 m tilted slab, but no live route descriptor invokes that branch. It is therefore not a reliable world landmark in the current generated mountain, and its map marker is removed. No replacement geometry was added in this cleanup pass.

6. **Map accuracy sanity check**

   The map still derives 24 waters, four cave mouths, five sampled elevation contours, three shared biome sectors, six shoreline starts, cabin, aquarium, summit crown/tarn, and the Fallglass cascade from live world descriptors. Water centers/radii, cave-depth mouths, biome angles, cabin/aquarium coordinates, summit, cascade, and ocean annulus all share their gameplay sources. No additional obvious mapping bug was found.

7. **Seated-fishing root cause**

   WASD/arrows serve as rhythm lanes but were also read as normal movement before fishing owned the frame. The generic bench-exit condition treated those song inputs as a request to stand, cancelled fishing, and moved the player off the bench.

8. **Seated input policy now**

   WASD/arrows, sprint, and slide no longer stand a seated player. During fishing they flow into the cast/hook/rhythm system; while merely resting they are harmless. The deliberate stand paths are X/on-screen Interact/Grip interaction, Jump, or Escape while seated but not actively fishing.

9. **Escape while seated and fishing**

   The frame records whether fishing was active before centralized cleanup. Escape during ready/cast/song/catch cancels fishing, releases fishing input/pointer state through `exitFishing()`, and returns to the same anchored seated posture. It cannot fall through and stand in that same frame. A later Escape while only seated can stand.

10. **RESET TO DEFAULT**

   A `RESET TO DEFAULT` button now sits next to `RANDOMIZE LOOK`. It applies every field in `DEFAULT_APPEARANCE`, updates the local player and live preview immediately, saves through the normal appearance-only progression path, and does not touch catches, unlocks, inventory, aquarium residents, records, or other progression.

11. **Exact legacy v4.5 color verification**

   Re-read from the supplied `Mountain Fishing v4.5/src/config.js` and `src/player/player.js`: `COLORS.player` `[0.95, 0.5, 0.22]`; `COLORS.playerAccent` `[0.99, 0.82, 0.33]`; skin `[0.93, 0.72, 0.52]`; boots `[0.18, 0.22, 0.18]`; pack `[0.18, 0.39, 0.34]`; trousers `[0.23, 0.31, 0.29]`; dark `[0.08, 0.11, 0.10]`. Current shared legacy constants match exactly.

12. **Current default selections**

   New/default/reset appearance is Human; Warm skin (tone 3); Classic Orange shirt; Classic Trail pants; Tousled Espresso hair; yellow Beanie; no eyewear; no face/neck accessory; Trail Backpack; and no custom shirt/pants/hair/accessory/blob tint. Resolved shirt, accent, skin, trousers, boots, backpack, and dark-detail colors match the exact values above.

13. **Existing customized saves**

   Startup migration behavior is unchanged: only absent appearance data receives `DEFAULT_APPEARANCE`; existing selections are normalized and retained. The new reset occurs only when the player explicitly clicks the button.

14. **Waterfall clipping cause**

   Fallglass previously sampled terrain only beneath the ribbon centerline, then gave both wide edge vertices the center height. On irregular cross-slope terrain, either edge could sink into the mountain; the 4 m longitudinal spacing also made individual triangles more likely to cut through local curvature.

15. **Waterfall fix**

   Sampling cadence is now 2 m (33 shared path rows from radius 96–160). Each left/right vertex computes its real polar position and samples the terrain directly beneath itself with a small surface clearance. The upper width is modestly reduced, the lower runout tapers more tightly, and source/pool/runout foam indices are descriptor-relative. One indexed continuous mesh remains, so the old overlapping-sheet regression is not reintroduced.

16. **Cave-mouth block cause**

   The first floor/wall/roof shell row used 1.16–1.2 segment depths while centered only half a segment behind the mouth. Its opaque boxes therefore extended slightly beyond the triangle cut and could read as protruding rectangular dark rocks.

17. **Cave-mouth fix and limitation**

   The first shell row is recessed 18% of one tunnel segment behind the real mountain opening while preserving overlap with row two. No decorative frame, portal, trench, or added rock was introduced. The cave remains a true exterior-triangle opening into a box-built collision shell; close inspection can still reveal planar interior walls because a fully sculpted/carved cave mesh is outside this small pass.

18. **Files and network impact**

   Source changes are in `index.html`, `src/styles.css`, `src/player/player.js`, `src/ui/appearance-menu.js`, `src/ui/mountain-map.js`, `src/world/mountain-v2.js`, and new `test/v88-focused.test.js`; `dist` was refreshed. No multiplayer client/server/protocol file changed, so no server startup or Render redeployment is required specifically for v8.8. A frontend redeploy/build is required to publish these client/world changes.

19. **Focused validation completed**

   `node --test test/v87-focused.test.js test/v88-focused.test.js` passed 8/8. `git diff --check` found no whitespace errors (only the existing Windows LF→CRLF notice). `npm run build` succeeded with 1,268 modules transformed and refreshed `dist/assets/index-D9v2U0LJ.js` plus `index-CDhvQFee.css`; only the existing large-chunk warning remains. The temporary Vite server was stopped. Automated visual control was attempted twice but the desktop browser runtime could not create its local assets (`os error 3`).

20. **Short manual check still required**

   Open the map and confirm no 500/550/600 pins, cave names, or Tilted Slab pin; retain five bands, gray `C`s, and Split Boulder. From a summit bench, complete a full rhythm song and confirm the player stays seated, then test active-fishing Escape, Jump, and X/Interact. Click Randomize then Reset and confirm the exact classic look without progression loss. Finally inspect Fallglass from source through runout and all four cave mouths at close/oblique angles for any remaining terrain intersection or visible interior block edge.
