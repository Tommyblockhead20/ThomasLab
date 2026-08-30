# Reel Ascent v8.7 focused continuation handoff

Status: implemented in the current project tree. No commit, push, deployment, or production server mutation was performed.

1. **Unified X + Grip interactions**

   `HomeInteractionController` now owns one nearest-valid-target path for X, the on-screen button, mouse/touch Grip, and keyboard Grip. `PlayerInput` exposes a one-shot Grip interaction edge and suppresses that Grip only when a nearby interaction actually succeeds. With no in-range target, held Grip is untouched and climbing behaves normally. The prompt now advertises `X / GRIP`.

2. **Summit bench status**

   Both opposite-side summit benches retain explicit seat, exit, facing, range, and `summit-tarn` metadata. Clicking, X, or Grip seats/stands the player. The body is held at the authored anchor, the camera yaw aligns with the bench facing, and the exit uses a clear authored offset.

3. **Cabin chair/bed positioning**

   The bed and chair now have explicit world-space seat/rest positions derived from the cabin's composed local transform, explicit facing yaw, clear exit positions, and appropriate interaction ranges. Their capsule centers are calculated from the actual furniture top plus `PLAYER_FOOT_OFFSET`, so they no longer reuse the player's current floor position.

4. **Root cause of rapid seated-fishing cancellation**

   A seated player was teleported onto a bench but then continued receiving the normal gravity/ground-contact path. Thin seat contact could report `grounded = false` for a frame; `afterPhysics()` treated every ungrounded fishing frame as a fall and immediately called `exitFishing()`. The seat state itself survived, but the fishing UI/state was cancelled almost immediately.

5. **How SEATED + FISHING coexist now**

   The persistent `benchSeat` posture remains independent of `movementState === 'fishing'`. While either normally seated or seated-and-fishing, `holdSeatAnchor()` submits the exact authored kinematic position, zeroes movement/gravity, preserves facing, and marks the posture as supported. The ungrounded fishing cancellation explicitly excludes an active seat anchor.

6. **Fishing finish/cancel behavior while seated**

   Fishing and rhythm/catch states run normally while the seat remains active. Finishing or pressing F/ESC closes only fishing and returns to grounded seated posture. ESC still runs the centralized fishing cleanup. A deliberate move, jump, sprint, slide, X, Grip, or prompt click cancels fishing first, then moves the capsule to the authored stand-up point. Remote snapshots carry `posture: seated`, so fishing arms and seated legs coexist remotely too.

7. **500–600 ft rock additions**

   The 300–700 ft system now has six belts: 300, 400, 500, 550, 600, and 700 ft. Counts are 54/60/76/74/72/54 respectively (390 requested anchors, normally two exposed formations per open anchor). The dedicated 550-ft belt and larger 500/600 belts use the existing 23-form fractured-rock library, deterministic lateral/radial offsets, local terrain support, protected-water exclusions, and varied grip materials rather than a staircase.

8. **Lower-biome trees and density**

   Lowland candidates increased from 72 to 210, with up to 64 large climbable trees. Fernwood Forest uses density `1.0` and mixes conifers with broadleaf multi-lobe crowns; Blackstone Pinewood uses `0.82` and mixes conifers with wind-bent pines; Sunwash Scrub uses `0.42` with sparse broadleaf/wind-pine forms. Large trunks and low branches are rough climb surfaces. Placement still rejects rocks, fishing approaches/cave tunnels, cabin, and aquarium space. Bushes/grass transition upward and trees remain confined to the low radii.

9. **How the map derives from actual world data**

   `MountainWorld.getMapData()` calls `createMountainMapData()`. The data samples `terrainHeightAt()` around 120 angles for each elevation boundary, projects the real fishing descriptors, uses the real cave-depth calculation for entrances, and reads the actual start, ledge, cabin, aquarium, landmark, summit, biome, and waterfall configurations. `MountainMapMenu` builds the SVG at runtime; the old guessed static ellipse/routes diagram was removed from HTML.

10. **Every fishing area on the map**

   The map consumes `MOUNTAIN_FISHING_LOCATIONS` plus `OCEAN_FISHING_DESCRIPTOR`. All 24 unique IDs are drawn at their real X/Z positions and numbered into a matching 24-entry list. Inland ellipses use their gameplay radii; the ocean uses its real annulus radii. Cave-pool numbers and separate cave-mouth markers share the same descriptor source.

11. **Five elevation regions**

   The five regions come from `MOUNTAIN_BANDS`: Coast/foothills, Lower, Middle, Alpine, and Crown/summit. Each boundary is an isoheight search against the actual terrain function; the crown uses its real taper and angular facet formula. These are simplified data-derived contours, not a rendering of every final 1 m mesh chip.

12. **Three biome sectors**

   The map and vegetation share `MOUNTAIN_BIOME_SECTORS` and `climateThemeAt()`: Sunwash approximately 330°→90°, Blackstone 90°→210°, Fernwood 210°→330°. Runtime map wedges are clipped to the sampled mountain outline, so their orientation matches fishing ecology and vegetation generation.

13. **Cave entrance/topology changes**

   Entrances remain actual triangles removed from the continuous mountain surface. There is no exterior mine frame, canyon, trench, or portal box. Side/roof shell pieces begin behind and overlap the cut edge from inside. A single shared `caveDepthAt()` now drives terrain cutting, rock/vegetation protection, map mouths, and tunnel construction.

14. **New cave locations/elevations**

   Cave pool radii moved inward while preserving the same four fishing IDs and their tunnel/chamber gameplay: Basalt Grotto mouth radius 152 at about 46 ft (rear pool radius 132/about 105 ft); Echo Cave mouth radius 133 at about 140 ft (pool 110/about 158 ft); Obsidian Cup mouth radius 125 at about 157 ft (pool 105/about 206 ft); High Cirque mouth radius 78 at about 304 ft (pool radius 56/about 515 ft). These mouths are on climbing slopes rather than coastal/rest plateaus.

15. **Exact old `COLORS.player`**

   `[0.95, 0.5, 0.22]`.

16. **Exact old `COLORS.playerAccent`**

   `[0.99, 0.82, 0.33]`.

17. **Resulting default Character Creator selections**

   Human, legacy `warm` skin `[0.93, 0.72, 0.52]`, Classic Orange shirt `[0.95, 0.5, 0.22]`, Classic Trail pants `[0.23, 0.31, 0.29]`, Tousled/Espresso hair, yellow Beanie `[0.99, 0.82, 0.33]`, no eyewear/face accessory, and Trail Backpack. Boots `[0.18, 0.22, 0.18]`, backpack `[0.18, 0.39, 0.34]`, and dark detail `[0.08, 0.11, 0.10]` now use shared legacy constants locally and remotely.

18. **Previous multiplayer override status**

   The current remote builder still accepted a room color index for a fallback name/initial material, but `setAppearance()` replaced visible shirt/blob materials when valid appearance arrived. The practical failures were missing/older appearance fields and the single mixed accessory slot; this pass removes room-color reliance from the final visible configured character and makes the fallback the legacy default.

19. **Actual customized remote appearance**

   Snapshots carry normalized IDs/tints only. Server allowlists now preserve the new headwear, eyewear, face, and back fields plus eight skin tones. Join state includes the latest appearance and posture, and subsequent 15 Hz snapshots update the same remote representation live. Remote skin, shirt/accent, pants, hair, accessory groups, backpack visibility, Blue Blob tint/type, and legacy fallback all come from the sender's config.

20. **Appearance preview**

   The wardrobe has a large full-body preview canvas beside the controls. `AppearancePreview` instantiates the actual `createRemoteAvatar()` builder used for multiplayer, applies the same normalized config/material logic, lights it with a simple key/fill setup, uses a useful three-quarter camera, and rotates slowly. Every option/color/randomize change updates it immediately.

21. **Skin-tone slider**

   Eight ordered stops replace the separate named buttons. The UI shows a stepped range control, an eight-color visual strip, and numeric `n / 8` readout; it does not present descriptive race/color names. Legacy `warm` is stop 3 and remains the new-player default.

22. **Accessory organization**

   Appearance config/UI now separates Headwear/Hats, Eyewear, Face/Neck, and Back. The deprecated single `accessory` field remains as a compatibility bridge and is promoted into the correct category for old saves/peers. The back category currently offers Trail Backpack or None.

23. **Hair/hat compatibility**

   Full-crown hats hide top hair geometry. Ponytail, Long, and Braids roots remain active while only their cap/top mesh is hidden, leaving tails/back/lower hair visible. Short/Tousled/Mohawk may be fully hidden under a full crown. Face/neck/eyewear and non-full-crown head accessories leave hair visible. Local, remote, and preview paths use the same compatibility function.

24. **Underwater water rendering**

   Shallow water, deep water/ocean, and waterfall materials now disable back-face culling and enable two-sided lighting. The same surface remains visible from below without duplicate water geometry.

25. **Water overlap/terrain clipping fixes**

   Inland visible discs remain slightly inside their real fishing radii and the terrain carve already extends beyond that boundary. The per-frame X/Z water pulse was removed because it repeatedly expanded transparent edges across the fixed basin and caused clipping/z-fighting. Ocean remains a dry-center annulus; fishing coordinates were not changed by these rendering fixes. Cave water remains at the rear of enclosed cave shells.

26. **Waterfall improvements**

   Fallglass is now one terrain-following mesh ribbon from Cloudstep's source edge through the fishable plunge pool and down the runout. Width varies along the flow, the path meanders slightly, neighboring segments share vertices, and source/pool/runout receive cheap irregular translucent foam puffs. The old chain of rectangular box sheets was removed.

27. **Files changed**

   - `index.html`, `src/styles.css`, built `dist/index.html` and hashed assets
   - `src/game.js`
   - `src/player/appearance.js`, `src/player/movement.js`, `src/player/player.js`
   - `src/ui/appearance-menu.js`, new `src/ui/appearance-preview.js`, `src/ui/home-interaction.js`, `src/ui/mountain-map.js`
   - `src/world/mountain-v2.js`
   - `src/progression/progression-save.js`
   - `src/multiplayer/protocol.js`, `src/multiplayer/remote-avatar.js`, `src/multiplayer/remote-player.js`, `src/multiplayer/room-state.js`
   - `server/src/snapshot-validation.js`, `server/src/room.js`
   - targeted tests `test/v9-visual-customization.test.js`, `test/v10-world-expansion.test.js`, `test/v11-cosmetics-aquarium.test.js`, `test/v12-polish.test.js`, and new `test/v87-focused.test.js`
   - `PROJECT_HANDOFF.md`

28. **Multiplayer protocol change**

   Protocol version remains v1 and room/host/join/reconnect semantics are unchanged. Payloads have additive, backward-safe appearance category fields and additive `posture: standing|seated`. Missing fields sanitize to the legacy default/standing. No meshes, textures, inventory, economy, authentication, or fishing rhythm input are transmitted.

29. **Render server redeployment**

   Yes, if the public Render server is to accept/preserve the new category fields and send join-time posture. Redeploy the existing server service from this tree. No data migration or new environment variable is required.

30. **Frontend build requirement**

   Yes. `npm run build` is required for deployment. It was run successfully in this worktree and refreshed `dist`; run it again after any further edits before publishing.

31. **Manual checks after handoff**

   - Near a bench/chair/bed/wardrobe, verify X, keyboard Grip, and primary/touch Grip trigger only the nearby prompt; away from prompts, verify Grip climbing and mantling normally.
   - Sit/stand on both summit benches, cabin chair, and bed; inspect height, facing, camera yaw, exit clearance, and no trapping.
   - From each summit bench: press F, charge/cast/hook, complete one success and one failure/rhythm miss, dismiss presentation, confirm still seated; press ESC during ready/cast/song/catch and confirm fishing closes but seat remains; move/jump during fishing and confirm cancel-then-stand.
   - Open the map and count 24 listed/numbered waters; inspect the irregular five elevation contours, three correctly oriented biome wedges, starts, four cave mouths, 500/550/600 ledges, cabin, aquarium, cascade, Crown, and summit.
   - Visit all four cave mouths and verify they are holes in slopes, their first shell segment stays behind the cut, tunnels/chambers are navigable, and rear pools are reachable.
   - Compare lower biomes for visibly different density/silhouette; climb several substantial trunks/branches; inspect for remaining tree/rock/water/building collisions.
   - Inspect the 500/550/600 ft circumference for exposed, supported, non-staircase route choices and mantle onto the real 550-ft core ledge.
   - Create a genuinely new save and verify the exact legacy palette; load a customized older save/export and verify no choice is reset.
   - In two public-multiplayer clients, test several human category combinations and Blue Blob, change them while connected, reconnect, and verify appearance plus standing/seated/fishing posture remotely.
   - Open Appearance: check full-body preview, rotation, live controls, eight-stop slider, randomize, simultaneous hat+eyewear+scarf, backpack None, ponytail/long/braids under each full hat.
   - Put the camera below ocean, pond, cave, summit, and aquarium water surfaces; verify the surface remains visible. Inspect every shoreline and Fallglass source/pool/runout for transparent overlap, terrain cutting, or hard seams.

## Focused validation completed

- `node --test test/v9-visual-customization.test.js test/v10-world-expansion.test.js test/v11-cosmetics-aquarium.test.js test/v12-polish.test.js test/v87-focused.test.js` — 30 passed, 0 failed.
- `npm run build` — final production build successful after all client/protocol edits; `dist` refreshed.
- Multiplayer server — final startup and `GET /health` succeeded on port 8799; default port 8787 was already occupied and its existing process was left untouched. Temporary validation servers were stopped afterward.
- In-app visual automation — attempted, but the desktop browser runtime could not create its kernel assets (`os error 3`), so the visual/manual checklist above remains necessary.
