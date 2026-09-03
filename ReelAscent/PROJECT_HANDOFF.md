# Reel Ascent v11 update handoff

Status: the requested v11 continuation is implemented in the current project tree. No commit, push, deployment, or production mutation was performed. Testing stayed intentionally light: 57 focused gameplay/data checks and one production frontend build. The older v10 and v9 notes remain below for historical context; this section supersedes them wherever behavior differs.

Post-pass room-capacity update: multiplayer rooms now default to **10 players** in both server configuration and direct `RoomManager` construction. `server/.env.example` also advertises `ROOM_CAPACITY=10`; a deployed `ROOM_CAPACITY` environment variable still takes precedence and must be set to `10` if the host currently overrides the default.

## v11 continuation

1. **Cabin aesthetic changes** — The existing compact cabin keeps its aligned pitched roof, porch, windows/openings, chimney, rafters, rug, lanterns, shelving, fishing/climbing gear, and furniture. This continuation fills the remaining dead space with a physical Trail Badge board and medallions, framed field map/art, a storage chest with lid, and wall-mounted coat hooks. All additions use the current low-poly materials and stay inside the cabin's existing collision layout.

2. **Outfitter's Reach aesthetic changes** — The existing two-service outpost remains intact, but the counters now read more clearly as separate staffed stations. Physical signs, merchandise, market equipment, lighting/cargo details, and role-specific countertop arrangements make the shop feel inhabited without adding a third NPC or merging the services.

3. **NPC face/sign/counter-prop changes** — Both existing NPCs now have attached low-poly eyes and noses. The buy counter has physical `OUTFITTER / BUY GEAR` signage plus boots, chalk, map, and ice-axe props. The sell counter has `FISH MARKET / SELL CATCHES`, baskets/cargo, a balance scale, and actual Sardine/Blue Crab specimen models. Buy and Sell remain distinct tabs/interaction areas, and Sell All still confirms.

4. **Frosthook z-fighting root cause/fix** — A second transparent cold-water overlay competed with the global ocean, while the lake/island cap also left nearly coplanar surfaces. The duplicate cold-water surface was removed and replaced by a pale submerged ice shelf beneath the one global ocean; Frosthook's lake basin is now carved below its water instead of laying a competing cap on top. This fixes the underlying overlap rather than scattering tiny render offsets.

5. **Frosthook Lake vs Cold Ocean split** — `blue-ice-melt` remains the freshwater **Frosthook Lake**. `frosthook-cold-ocean` is a separate prioritized marine annulus with its own `cold-ocean` ecology family. Polar Bear, Penguin, Qallupilluk, Blue-Ice Codling, and Frostglass Shrimp are exclusive to the Cold Ocean; the lake retains freshwater species such as Brook Trout, Mountain Whitefish, Cutthroat Trout, and Alpine Char. Generic coast/ocean matching no longer leaks into the cold table.

6. **Aquarium UI redesign** — The modal now uses a fixed-height desktop layout: one horizontal summary bar for retained/capacity, collection value, visitor income, next payout, next expansion, and Upgrade; a horizontally efficient retained/carried collection area on the left; and one selected-creature detail/action panel on the right. Only the collection region scrolls on desktop, with a responsive stacked fallback on small screens.

7. **Controls-box sizing** — The normal Controls panel max width increased from 25 rem to 33 rem so the standard bindings fit into roughly two clean lines on desktop. The visible sprint binding remains `Shift — Sprint`.

8. **Ocean-floor extension** — The continuous walkable seabed now reaches radius **1,748 m** (`WORLD_MAP_RADIUS + 48`) using sparse performance-conscious rings after the denser near-shore area. It runs beneath the mountain, islands, docks, ordinary ocean, and Bluewater Reach; island underwater skirts descend to the shared seabed so they do not look like floating platforms. The seabed remains above the fatal-fall plane.

9. **Cave concavity implementation** — Main mountain-core vertices are now deformed through a broad staged recess beginning 8 m outside each throat, reaching up to 3.4 m inward and 4.2 m vertically. The visible core and its trimesh collision use the same deformed vertices; only the final inner throat triangles are removed. With tunnel/interior meshes hidden, the gray core still shows a substantial slope→indentation→deep recess rather than only a doorway hole.

10. **Basalt Hollow spike root cause/fix** — The island fan used a tiny 0.035-radius pseudo-center ring, producing near-degenerate center triangles that could stretch into the long spikes. It now uses one real center vertex with consistently wound fan triangles, yielding a compact coherent island instead of masking the defect with props.

11. **Signal Crayfish retirement** — `signal-crayfish` is removed from the active roster and added to `RETIRED_SPECIES_IDS`. Its canonical ID is preserved, so old saved Signal Crayfish specimens still resolve as Signal Crayfish and are never converted into Panda records.

12. **Giant Panda implementation + Mangrove exclusivity** — New canonical ID `giant_panda` is Rare, exclusive to `amber-reed-pond` on Mangrove Cay, and uses realistic adult-scale length/weight data. Its specimen factory branch is a terrestrial black-and-white low-poly mammal with body, head, ears, eye patches, nose, and limbs—not a fish silhouette.

13. **Active rarity totals before rebalance** — The current pre-v11 active roster was **77 Common / 78 Uncommon / 70 Rare / 75 Legendary = 300**. Retiring the Uncommon Signal Crayfish and adding the Rare Giant Panda changed the working subtotal to 77 / 77 / 71 / 75 before the four sensible promotions.

14. **All rarity changes made** — Signal Crayfish (Uncommon) was retired and Giant Panda was added as Rare. Star-Nosed Mole and Remora moved Common→Rare; Nokken and Green Sea Turtle moved Uncommon→Rare. Canonical IDs of existing creatures did not change, and no filler creature was added or legitimate active creature deleted.

15. **Final exact rarity totals** — The active roster is exactly **75 Common / 75 Uncommon / 75 Rare / 75 Legendary**, for **300 active creatures**. Retired records are excluded. All 300 also retain distinct deterministic rhythm signatures after a same-difficulty lane-remapping pass fixed inherited duplicate signatures.

16. **Creature/Catch terminology changes** — General collection/progression UI now uses Creature/Creatures and Catch/Catches, including Creature Journal, Lifetime/Total Catches, aquarium wording, sell wording, run results, and rhythm/catch prompts. Fishing, Fishing Area, Fishing Rod, Fish Market, and actual fish names remain where mechanically or contextually correct.

17. **Full Trail Badge list** — 30 badges were added: Field Naturalist I–IV (50/100/200/all active unique creatures); Seasoned Angler, Thousand Catches, Ten-Thousand Catches (100/1,000/10,000); Market Naturalist and Complete Market Ledger (100/all unique species sold); Curator I–VI and Grand Curator (25/50/100/150/200/250/300 retained); Biome Naturalist; Water Explorer I–III (5/15/all waters); First Ascent, Summit Regular, Peak Veteran (1/5/20); Island Hopper; First Shiny; Shiny Hunter (25); Legendary Encounter; Full Kit; Master Outfitter; and World Mapper.

18. **Badge persistence/progress implementation** — Per-save badge state stores unlocked IDs plus stable species caught/sold, water IDs, ecological-biome IDs, and destination IDs. Existing legitimate lifetime catch/shiny/rarity/summit totals and durable inventory/aquarium ownership feed the remaining badges. Progress is numeric, completed badges never revoke when future content expands a target, Portable Progress exports/imports all fields, and only the specific debug catch or summit-teleport event is excluded—enabling cheats does not globally disable badges. The cabin badge board opens the locked/unlocked/progress viewer.

19. **Graybox-label removal** — The visible `MOUNTAIN TRAVERSAL GRAYBOX` eyebrow is removed from the normal HUD. `REEL ASCENT`, location, elevation, and useful gameplay information remain. Internal entity names are not player-facing and were left alone.

20. **Waters Fished In rename** — Player-facing `Waters Discovered` wording is now `WATERS FISHED IN` in Stats/progression displays, matching the fact that a successful legitimate catch in a stable water ID is required.

21. **Bluewater Reach implementation** — Bluewater Reach is the seventh satellite travel destination and is explicitly **not an island**. It sits at a stable global position (bearing 196°, radius 1,640 m) as a collidable fishing boat with hull, safe deck, wheelhouse, roof, railings, mast, chart interaction, arrival point, surrounding ocean zone, and Paper/GPS/travel-chart boat symbol. It uses the generic destination registry and does not disturb multiplayer room membership.

22. **Exact Bluewater bonuses** — `specimenSizeBias: 0.08` modestly shifts the within-species size-category distribution toward Large/Massive. Separately, `largeSpeciesWeightBias: 0.12` adjusts within-rarity species weights using normalized log length/weight scores, so naturally large eligible species are slightly more likely. Neither guarantees a trophy or changes the chosen rarity.

23. **Prism Lure change** — Prism now supplies only `tempoMultiplier: 1.20`; fishing-song clock, chart, audio, notes, judgments, and holds share that tempo. Its old unrelated shiny modifier is gone.

24. **Silverfish Spoon exact rarity math** — Silverfish Spoon supplies `rareProbabilityBonus: 0.20`, an additive **+20 percentage points** applied during rarity selection. The addition is taken proportionally from available lower-rarity probability mass, with fallback donors only if needed, then stays normalized. For the 62/20/11/7 Ocean profile it produces approximately **46.878/15.122/31/7**, totaling 100%.

25. **Mythlight Lure exact rarity math** — Mythlight supplies `legendaryProbabilityBonus: 0.10`, an additive **+10 percentage points** during rarity selection. Ocean Legendary therefore changes exactly **7%→17%**; Common/Uncommon/Rare donate proportionally, yielding approximately **55.333/17.849/9.817/17**, totaling 100%. Both lures use rarity-first selection before a species is chosen within that rarity.

26. **Master Atlas $12,000 change** — `master-naturalist-atlas` now costs **$12,000** in the single equipment catalog used by shop cards and displayed prices. Existing owners keep ownership.

27. **Gear width/layout change** — Inventory/Gear desktop width increased from 66 rem to 78 rem and Gear uses four columns instead of three where space permits. Responsive breakpoints reduce it to two/one columns on smaller screens, where scrolling remains allowed.

28. **Click-vs-grab implementation** — Mouse input now recognizes a deliberate click as a fresh unpointerlocked press/release lasting at most 350 ms with at most 6 px movement. A stationary hold becomes Grip after 140 ms; movement beyond the threshold becomes camera drag and cancels click/Grip promotion. Deliberate clicks are one-shot queued/consumed interactions instead of sharing raw `mousedown` state.

29. **Pointer-lock fix** — Pointerlocked presses can feed active gameplay but never queue a generic world click. Camera drag discards click ownership, and requesting pointer lock clears any pending interaction. Nearby interactables only show prompts; opening them requires a fresh deliberate click or explicit Interact, preventing Firefox camera/pointer-lock movement from activating a seat, shop, travel, or other UI.

30. **Seated-fishing input fix** — Fishing now publishes explicit input ownership, and bench/Sit-emote cancellation ignores arrows, rhythm keys, click, mouse/camera movement, cast/hook input, and catch completion while fishing. One shared fishing-exit path cancels rhythm/cast/presentation state, releases primary/contact input, closes UI, restores control/pointer-lock ownership, and deliberately preserves the seat on ESC. X/Interact, Jump, or selecting Sit again still exits the seat.

31. **Sit rename/emote cleanup** — Every player-facing `Sit / Relax` label is now simply `SIT`/`Sit`, and the explanatory subtitle beneath the emote buttons was removed. Selecting the active Sit emote again is the explicit Sit cancel.

32. **Minimap cave/dock/biome changes** — Compact in-hand/current-location maps now include small cave, dock/arrival, relevant water, player, and useful landmark symbols without importing the full map's large labels/legend. Biome polygons are clipped from the actual authored angular boundaries and use subtle related terrain tints. Bluewater is drawn as a boat, not an island. Badge biome targets now use the same exact ecological-theme IDs stored on legitimate catch records.

33. **Files changed** — v11 work spans `index.html`; `src/styles.css`; camera/input/player files; fishing data, ecology, rarity, model, and controller files; persistence/progression/equipment/portable-progress files; game, emote, aquarium, inventory, journal, map, pause, home-interaction, multiplayer, appearance, and boat UI files; mountain/world-location/run-manager files; focused tests; and this handoff. New files are `src/progression/trail-badges.js` and `src/ui/trail-badges.js`. `dist/index.html` and its hashed JS/CSS were refreshed by the final build. The current worktree also retains the preceding approved 10-player server configuration edits.

34. **Save-schema changes** — Durable save schema is now **10** (slot-container schema remains 1). Migration adds normalized `trailBadges` data without dropping old collections; old caught species and lifetime water participation seed compatible fields. Portable Progress includes the full Trail Badge record. Roster retirements preserve old Signal Crayfish records under their original ID.

35. **Multiplayer protocol changes** — v11 adds **no** message, envelope, snapshot, or validation change. Bluewater travel keeps the current room and uses the existing location/global-position snapshot fields. The separate already-present v10 capacity configuration defaults rooms to 10 players but is not a v11 protocol change.

36. **Whether Render needs redeployment** — **No for v11 itself**, because v11 changed no server code or protocol. If the preceding 10-player server-capacity change has not been deployed—or Render has an overriding `ROOM_CAPACITY` value below 10—redeploy/update that server configuration separately.

37. **Whether frontend needs rebuild** — **Yes, and it has been rebuilt.** `npm run build` completed with 1,280 modules; output is `dist/assets/index-C5F2hQ1s.css` plus `dist/assets/index-aMAS6uNf.js`. Only the existing PlayCanvas worker-externalization notices and large-chunk warning remain. The focused suite passed **57/57**.

38. **Short manual test list** — Sit on each bench and use the Sit emote, fish through arrows/click/drag/catch/fail/ESC, then exit only with X/Jump/Sit; drag the camera beside every interactable in Firefox; inspect minimap cave/dock/biome marks; sail to Bluewater and fish from its deck; compare Frosthook Lake/Cold Ocean tables and surfaces; walk into every cave recess and inspect Basalt Hollow; open Cabin badges and Aquarium at desktop/small widths; verify the two shop counters; catch Panda only at Mangrove Cay; and spot-check Prism/Silverfish/Mythlight plus an export/import.

## v10 current-tree pass

This section supersedes older descriptions below wherever they differ.

1. **Shared local/remote avatar model** — `src/player/character-model.js` is now the single complete character builder used by the local player and remote player; the Appearance preview uses the remote-avatar path and therefore the same builder too. Human/blob body, head, eyes, nose, hair, clothing, all accessory groups, backpack, nested limbs, and left/right hand anchors now come from one model hierarchy and compact appearance state.

2. **Shared creature-model work** — Catch, Inventory Hand, remote Hand, remote catch presentation, and Aquarium residents all resolve canonical species data through `createSpecimenModel`. They retain species ID, actual archetype, saved dimensions, and shiny state instead of constructing separate generic multiplayer/aquarium fish.

3. **Remote missing-detail fix** — Remote specimens now attach the complete factory result rather than copying only a base primitive. The shared factory was also extended with more shark fins, eyes across archetype families, secondary markings, and appendage/detail children.

4. **Hand model consistency fix** — Re-equipping a caught specimen from Inventory uses the exact same canonical species/archetype and positioning system as catch presentation. There is no Hand-only generic fallback, and saved length/shiny data follow the specimen.

5. **Durable remote held-item state** — Held presentation is part of each validated player snapshot and the server's reconstructed `room_state`. Room entries now carry `heldItem`, so a late/reconnected client reconstructs the current Hand object rather than waiting for a transient visual event.

6. **Tab-out held-item fix** — A remote Hand model no longer expires or clears when browser snapshots pause. The server retains the owner's last accepted held state, and clients clear it only when a later authoritative snapshot actually reports an unequip/replacement/removal.

7. **Remote fishing rod fix** — `src/fishing/rod-model.js` builds one detailed handle/shaft/reel/spool/crank/guide/leader hierarchy for local and remote players. Both rods attach to the shared avatar's right-hand anchor, so yaw, interpolation, character proportions, sitting, and fishing pose all move the rod with the body.

8. **Remote catch presentation** — Catch events reconstruct the canonical complete specimen at actual size/shiny state, hold it for the presentation window, suppress conflicting rod/Hand visuals, and destroy it cleanly when the event ends. Rhythm inputs and catch ownership still never cross clients.

9. **Display-name root cause/fix** — The client already sent the entered name, but the server `PlayerSession` had no display-name field and `room_state` did not include it, so the remote fallback remained `Player`. The server now sanitizes and stores the name during hello/host/join, preserves it through reconnect, emits it in the roster, and rebroadcasts restored sessions.

10. **Nameplate anchoring** — Remote nameplates now sample the highest visible render bounds in the actual avatar hierarchy and place the DOM plate just above that point. Hats/accessories, sit/fish poses, and avatar height changes no longer rely on a fixed arbitrary Y offset.

11. **Remote location/despawn fix** — Snapshots and room state now carry `locationId`, `coordinateSpace`, and `globalPosition`. A remote 3D avatar is enabled only when its location matches the local player's active location; it remains in the roster/GPS and reappears with retained state on return.

12. **Cave seam follow-up** — The repaired aperture architecture stays intact. Main-mountain cave throats now overlap another 5.5 m radially, 3.4 m sideways, and 2.6 m below the transition, with broad hidden ceiling/floor ribbons behind the mountain cut; island cave floor/walls also extend farther under the shore. No exterior slab, dark shell, or facade was reintroduced.

13. **Boat double-click** — A valid destination double-click selects and immediately sails. Empty ocean and disabled/current destinations do nothing, `travelInProgress` prevents a double initiation, and the existing single-click plus Set Sail flow remains available.

14. **Map crop/compression** — Simulation coordinates remain untouched. The full map uses the existing `.58` far-distance transform, then calculates a tight bounding box over compressed mountain contours, real island outlines, docks, caves, and the cascade with modest padding; the 520 px map therefore retains its large display while filling it with useful geography. GPS dots use the identical projection, and all registered islands pass the focused containment check.

15. **Mangrove Cay changes** — The cay now has 20 climbable mangroves plus substantially denser broadleaf vegetation, ferns, roots, reeds, groundcover, tropical shoreline mounds, and fallen logs. The greener shallow lagoon and warm terrain make it read as a distinct tropical/wetland biome.

16. **Mangrove z-fighting fix** — The cause was verified geometry: the top of the lagoon mud cylinder was exactly coplanar with the transparent lagoon water at Y `.88`. The mud shelf is now deliberately submerged at roughly `.68–.74`, removing the competing surface instead of scattering arbitrary render offsets.

17. **Outfitter's Reach polish** — The outpost gained separate outfitter and fish-buyer NPCs/counters, counter-specific signs and window headings, hanging destination signage, gear racks and rods, ropes/supports, lanterns/hooks, barrels, crates, and dock cargo. Buy and Sell remain separate physical interaction volumes; Sell All still confirms and excludes aquarium residents.

18. **Frosthook Cold Ocean** — A dedicated 24–44 m cold-ocean fishing annulus now surrounds Frosthook, takes priority over generic Outer Ocean, and keeps the existing marine species set rather than beginning the postponed species pass. It has a pale separated surface, shoreline ice, and lightweight floes while the original Frosthook pond remains.

19. **Stamina-regen root cause** — The capsule receives continual tiny downward/vertical physics corrections while standing, and the old stationary test treated that jitter as movement; gripping happened to stabilize it and appeared to enable recovery. Stationary recovery now measures planar motion, clears stale climbing/mantling state on real support, and uses upward-facing partial-foot support without reading Grip. Airborne, wall-side, sliding, and non-walkable contacts remain ineligible.

20. **Sound settings** — The combined Settings/Accessibility screen now contains persisted global Master, Music/Rhythm, SFX, and Ambient sliders. Fishing rhythm/tone playback reads the appropriate master/category gain; ambient gain is persisted and ready for ambient sources without creating a separate Accessibility modal.

21. **UI-opening delay root cause** — The main offender was `MountainMapMenu.open()` synchronously rebuilding the complete static SVG and long legend before un-hiding the dialog. Static geography is now built once, the shell is revealed immediately, and live GPS/legend work is deferred to the next animation frame; other audited dialogs already reveal their shells before dynamic content work.

22. **One Hand slot** — Progression normalization enforces mutual exclusion between `heldSpecimenId` and `heldItemId`, with a specimen winning only when repairing an inconsistent legacy save. Maps and specimens replace each other. Ice Axe now genuinely occupies Hand, uses a shared local/remote visible model, and its terrain modifiers are active only while held; boots, gloves, Chalk Bag, and harness stay worn independently.

23. **Map minimap behavior** — Opening Paper/GPS from Inventory always opens the full world map and no longer auto-equips it. Equipping either map in Hand shows a compact corner minimap of only the current loaded location: Paper is static, GPS adds local and same-location remote dots, and neither includes the world legend, distant islands, or long text.

24. **Appearance Accessories UI fix** — The JavaScript already queried `[data-appearance-tab]`, but the HTML had no matching Body/Accessories controls, making every accessory group unreachable. Stable `BODY & COLORS` and `ACCESSORIES` tabs are now present and preserve all saved choices.

25. **Appearance layout fixes** — Desktop Appearance uses a fixed-height, overflow-hidden two-column layout with compact per-tab grids. Randomize, Reset, and Close live in a stable header independent of avatar/tab content; the preview subtitle is removed and a small Pause/Resume Rotation overlay controls automatic spin. Small screens retain an intentional responsive scroll fallback.

26. **Eyewear** — Added round glasses, aviators, sport shades, clear spectacles, and snow glasses to appearance data, server validation, and the shared character hierarchy, with separate fitted frames/lenses.

27. **Cabin dock/door** — Hearthward Isle's registry dock now uses the outward/cabin-front side of the island. Arrival faces the intended short approach to the porch/front door rather than landing behind the cabin.

28. **New Mountain name** — Player-facing `Crooked Peak` references are now **Stoneveil Peak**; its tarn is Stoneveil Tarn and summit landmark is Stoneveil Crown. Durable IDs such as `main-mountain` and `crooked-peak-tarn` remain unchanged for save/species/protocol compatibility.

29. **Beach/foothill decoration** — The beach-to-first-incline belt gained 144 deterministic, visual-only pieces across multiple routes: driftwood/logs, low rocks, grass, shrubs, and flowers. Protected starts, waters, and route clearances prevent the detail pass from closing traversal lanes.

30. **Gear layout/equipment balance** — Inventory Gear now uses compact logical slot selects for Boots, Gloves, Climbing Tool, Chalk Bag, Harness/Pack, plus exactly one Hand summary; responsive 3/2/1-column layouts avoid normal desktop scrolling. Separate compatible slots equip simultaneously. Springstep is `1.25`, Summit Vault `1.50`, Endurance sprint drain `0`, Ultralight Harness `.60`, Climbing Gloves `.80`, Chalk Bag `.70`, and Ice Axe remains slippery-terrain-only at `.75` climb cost plus slip/stability benefits, all multiplicatively clamped nonnegative.

31. **Water aesthetic/size changes** — Existing waters now have a clearer small/medium/large hierarchy (for example compact Sheltered Mirror/Hidden Ridge versus much larger Pineglass/Mossbell/Cloudstep). Main waters receive climate-specific reeds/grass/flowers/ferns/rocks/logs or snow/ice rather than one repeated decoration set, while keeping fishable banks accessible.

32. **Cabin polish** — The existing cozy cabin layout was retained and augmented with shutters, roof fascia, porch planters/foliage, a welcome mat, kitchen shelf/mugs, and alignment cleanup around the already detailed hearth, chimney, rug, rafters, furniture, and lanterns.

33. **Aquarium species-model fix** — Saved aquarium residents now use the same canonical specimen factory as catches and Hand presentation, including saved dimensions/shiny state and all child/detail meshes. There is no aquarium-specific generic fish path.

34. **Aquarium enlargement** — The public display increased from 18 × 11 × 6.2 m to 21 × 13.5 × 7 m. Habitat placement and resident swim ranges derive from the enlarged tank while the local-client resident root remains active only at Glasswater Isle.

35. **Aquarium economy/expansion UI fix** — Management now clearly exposes Display Value, Visitor Income per interval, a live `mm:ss` Next Payout plus expected amount, used/max Capacity and tier, and an explicit current→next expansion card with price and Upgrade button/max state. The existing add/remove/capacity/income backend is preserved; the missing `aquarium-status` DOM ID that could break management feedback was repaired.

36. **Aquarium water clarity** — Aquarium-water opacity was reduced modestly from `.40` to `.30`, keeping a visible water volume while making residents easier to inspect.

37. **Higher-elevation caves** — Verified and retained the proper inset `High Cirque Tarn` cave in Upper Alpine and `Crown Vault` cave at the summit/Crown. Both use the repaired mountain-core aperture/throat/floor/water system and no exterior facade geometry.

38. **Files changed** — `PROJECT_HANDOFF.md`, `index.html`, `src/styles.css`, `src/game.js`, `src/audio/settings.js`; player/appearance files including new `src/player/character-model.js` and `src/player/held-item-model.js`; fishing files including new `src/fishing/rod-model.js`; multiplayer client/protocol/remote-avatar files; progression/equipment/save files; Appearance, Aquarium, Boat, Home, Inventory, Map, Pause, and Shop UI files; `src/world/mountain-v2.js` and `src/world/world-locations.js`; server connection/session/room/snapshot validation; and rebuilt `dist/index.html` plus hashed JS/CSS assets.

39. **Save-schema changes** — Progression schema advanced `9 → 10` for the separate Chalk Bag slot and strict one-Hand normalization. The existing `heldItemId` now also accepts the owned Ice Axe, preserving older map values; legacy chalk-in-climbing saves migrate into `chalk`. Outer save schema remains `9`, export format remains compatible, and old saves/imports still normalize forward.

40. **Multiplayer protocol changes** — The protocol envelope/version remains `1`. Existing snapshots add validated `locationId`, `coordinateSpace`, `globalPosition`, and durable held-item presentation data (canonical specimen or Ice Axe), while room state adds display name and reconstructs those last accepted fields. Server appearance validation also accepts the five new eyewear IDs. Deploy client/server together.

41. **Render redeployment** — **Yes.** Server session, room-state, and snapshot validation changed, so the Render multiplayer service must be redeployed with the frontend.

42. **Frontend rebuild** — **Yes, and it has been rebuilt locally.** `npm run build` passed with Vite 8.2.2 and 1,278 transformed modules; only the existing large PlayCanvas bundle warning remains. Changed JavaScript syntax checks passed, focused save/Hand/protocol/location/map checks passed, and the finalized server started successfully on alternate port `18789` because local port `8787` was already occupied.

43. **Short manual test list** — Use two browsers: verify entered names, matching cosmetics, hand fish details/tab-out persistence, catch/rod/axe presentation, same-location despawn/reappearance after boat travel, and GPS. Then check Escape-less fast-opening Map/Appearance, Body/Accessories and preview pause, full-map versus Hand minimap, stamina recovery on a ledge without Grip, cave mouth seams, Mangrove lagoon flicker, both Outfitter counters, Frosthook cold ocean, Cabin dock/front door, Aquarium model/economy countdown/upgrade, and one representative small/medium/large water.

## Previous v9.4 handoff

Status: v9.4 is implemented in the current project tree. No commit, push, deployment, or production mutation was performed. Validation was deliberately light. Because the multiplayer emote allowlist changed, deploy the frontend and multiplayer server together.

## v9.4 current-tree pass

This section supersedes older descriptions below where they differ.

### Input, menus, map, and emotes

- Multiplayer room entry fix: hosted rooms now use four-digit numeric codes universally across the client and server, the join field presents a numeric keyboard and strips non-digits, Join activates only for a complete code, and gameplay key handling yields while typing in editable controls.
- Pause-menu latency fix: Pause stats reuse the mountain map data already generated at startup and clone only the lifetime summary, instead of rebuilding all map contours and copying the complete save synchronously every time Escape opens the menu.
- Startup wardrobe regression fixed: `.appearance-menu[hidden]` explicitly uses `display: none`, preventing the authored grid display from showing a blank, non-interactive Appearance dialog while its controller is closed.
- Fixed the Firefox/pointer-lock auto-interaction root cause in two places. The click that acquires pointer lock is suppressed until release, and a Grip/click edge made with no nearby target is consumed that frame instead of remaining queued until the player walks into a shop, bench, wardrobe, aquarium, or boat trigger. Proximity still controls prompts; entering a trigger requires a fresh press.
- Appearance is a fixed-height, non-scrolling desktop dialog with the live preview on the left and tabbed `BODY & COLORS` / `ACCESSORIES` controls on the right. Close, Randomize, and Reset remain in one stable header across human/blob switches and rerenders. Small screens retain a scrolling fallback.
- Added Clap to the local emote menu, local humanoid animation, remote-avatar animation, shared emote definitions, and server snapshot allowlist. This is an additive protocol-v1 value; no envelope or protocol version changed.
- The world map uses a cartographic-only `.58` compression for far-island vectors and a `.68` display radius. The simulation, saves, travel, load groups, multiplayer snapshots, and global coordinates are unchanged. Paper-map, boat-map, local GPS, remote GPS, island footprints, and docks use the same transform, preserving bearings and ordering.
- The map dialog is larger and more zoomed. Duplicate Cabin/Trail Cabin, Shop/Shop Outpost, and Aquarium/Public Aquarium pins were removed; each place now has one location label.
- Player-facing place names are Crooked Peak, Hearthward Isle, Outfitter's Reach, Glasswater Isle, Basalt Hollow, Mangrove Cay, and Frosthook. Durable location IDs remain unchanged.
- Pause now has one top-level Settings screen containing both interface/gameplay and Accessibility controls. Save/Data shows Portable Progress export/import permanently instead of hiding it in a collapsed details row.
- Visible Shift labels are normalized to `Shift`, including the HUD control card; duplicate `Shift L / Shift R` wording is gone.

### World, caves, water, shop, aquarium, and spawning

- Mangrove Cay replaces the generic normal fishing island presentation. Its central Mangrove Lagoon has greener clear shallows, a warm mud/sand shelf, wetland reeds, low roots, and ten broadleaf mangroves with climbable registered trunks.
- Pond/lake footprints now have meaningful small/medium/large variation. Sheltered Mirror, Redbank, and Hidden Ridge are compact; Pineglass, Mossbell, Cloudstep, and Boulder Coast are notably larger. Basin carving and water-zone radii still use the same descriptors.
- High Cirque Tarn remains the fixed-aperture Upper Alpine cave. New Crown Vault is a second fixed-aperture cave at the Crown base. The Crown shell is now locally subdivided so the established triangle/aperture filter removes only the mouth instead of a full base-to-summit wedge.
- Existing repaired cave topology is preserved: literal core apertures, recessed descending floors/walls, rear cave water, no exterior facade/shell blocks, and no reopening of unrelated caves. Crown Vault uses the same system rather than introducing a cave facade.
- Fishing topology is now 25 waters: ocean 1, lower 10, middle 7, upper 4, summit 2, waterfall 1. The 300-creature ecology remains intact. Alpine Mudpuppy and Rimefin Wisp are Crown Vault exclusives; the summit tarn retains its remaining exclusives.
- Glasswater's separate pavilion and tank were enlarged to an 18 × 11 × 6.2 m display with a clearer dedicated water material. Foundation, posts, roof, glass, frames, habitat props, and sign derive from tank dimensions, removing the old undersized/janky hard-coded shell.
- Aquarium rendering accepts up to the saved 300-fish maximum and now places each resident's actual species archetype at saved specimen length. Four widely separated front/rear/left/right management triggers make the large tank usable around its perimeter.
- Aquarium `REMOVE → INVENTORY` is explicit and still moves ownership back to carried Inventory; it never destroys or sells the specimen. Capacity tiers remain 25/50/100/150/200/250/300.
- Outfitter's Reach now has physically separate gear/map and fishmonger counters. The first opens Buy & Equip; the second opens Sell Fish. Accessible tabs allow switching inside the same dialog. Sell All still requires confirmation and sums only carried Inventory specimens, excluding aquarium residents.
- Fresh local sessions start at the safe cabin/porch anchor on Hearthward Isle. Multiplayer authoritative run seeds can still override that start after joining.
- Home now changes the active location/load group to Hearthward Isle, cancels fishing through the unified exit, clears seating, resets movement/camera state, and teleports to the cabin anchor instead of a random mountain shoreline.
- Player teleports/spawn points now validate a shrunken Rapier capsule plus walkable support, try a deterministic set of nearby forward/back/side/diagonal/raised fallbacks, and retain a diagnostic resolution record. Boat arrivals and authored anchors remain the source positions.

### Specimens and gear

- Inventory thumbnails are cached lightweight SVGs selected from each species' actual archetype and authored colors. Sharks, rays, cephalopods, crustaceans, shells/snails, amphibians/turtles, echinoderms, mammals, serpents, and normal fish have distinct silhouettes.
- The shared PlayCanvas specimen builder now has distinct 3D forms for those archetype families. Inventory-held and aquarium models use that same builder.
- Specimen scale is calculated from saved length in inches → meters divided by the archetype model's native length. The former generic square-root scale and `.72/.74` display caps were removed. Held large specimens offset outward so they extend beside the player instead of being shrunk into a generic hand prop.
- Traversal equipment slots are Boots, Gloves, Climbing Tool, and Harness/Pack. Old `climbing`/`traversal` saves migrate durable IDs into their correct v9 slot. Progression and outer save schemas are version 9; older saves and portable progress still normalize forward.
- Trail Kit has no bonus. Endurance Boots make normal sprint drain zero. Springstep Boots are +25% jump; Summit Vault Boots are +50% at the higher tier/price. Climbing Gloves use `.80` grip/climb cost. Climber's Chalk is a stronger/pricier `.70` tool.
- Ice Axe is terrain-specific: on registered ice/smooth surfaces it applies `.75` climb/grip stamina, `.55` slip, and `1.08` slide-entry/exit thresholds. It is not a universal Chalk replacement.
- Ultralight Kit keeps its durable ID but is displayed as Ultralight Harness. Its single centralized `.60` normal-stamina multiplier applies multiplicatively to sprint, climbing/grip, jump, slide braking, and slide push-off. Specific gear multipliers then stack multiplicatively and are clamped nonnegative.
- Owned gear remains equippable from Inventory → Gear as well as the outfitter.

### Deployment and validation

- Server redeploy is required with the frontend because `server/src/snapshot-validation.js` now accepts `clap`. There is no breaking network schema change.
- Syntax/import checks passed for every changed JavaScript module. `git diff --check` reports only the repository's existing Windows line-ending notices.
- Focused `node --test test/mountain.test.js` passed 7/7, covering traversal density, 25-water topology, cave water surfaces/descents, the complete 300-species ecology audit, and ocean ecology.
- `npm run build` passed: Vite 8.2.2, 1,274 modules. The existing large PlayCanvas bundle warning remains; output was refreshed in `dist/`.
- Multiplayer server startup passed on alternate smoke-test port `18788`; default `8787` was already occupied by another local process. The smoke process was stopped afterward.
- Highest-value manual checks still recommended: Firefox click-to-lock then walk into/out of each interaction; Appearance at ordinary desktop heights; two-client Clap/GPS/appearance; Home from fishing and each island; all four aquarium sides with tiny/huge specimens; Outfitter/Fishmonger separation; Crown Vault and High Cirque mouth/floor/water joins; Mangrove Cay shore; and Ice Axe versus Chalk on ice/smooth/rough surfaces.

## v9.2 remaining-pass addendum

This section supersedes older statements below where the two differ.

- `src/game.js` and `src/world/mountain-v2.js` were owned by a separate coordinated pass. This pass deliberately did not edit or replace either file.
- Pause now has Stats, Save/Data, Settings, Accessibility, and Key Rebinding screens. Accessibility preferences are global browser settings, separate from save slots: compact/normal/large UI, reduced UI motion, high-contrast rhythm notes, large contextual prompts, and control-card visibility.
- Key binding schema now includes movement, jump, sprint, slide, grip, fish, interact, Inventory, Journal, Multiplayer, Emotes, and Map/Use. Duplicate bindings are rejected, hidden cheat/debug inputs stay reserved, reset is available, and the HUD plus modal keycaps show the active bindings.
- Save Slot cards show last played, money, Journal count, active playtime, fish, and summits. Four-slot storage and legacy Slot 1 migration remain unchanged.
- Inventory is exactly `CATCHES` and `GEAR`. Save/Data lives in Pause; buying/selling lives at Shop Island; aquarium management lives at Aquarium Island; appearance lives at Cabin Island.
- Shop Island now has confirmed `SELL ALL`. It sells only specimens currently carried in Inventory and explicitly excludes aquarium residents.
- Traversal equipment keeps one Boots, Gloves, and Climbing Equipment slot. Springstep Boots are +25% jump; Summit Vault Boots cost $12,000 for +50%; Endurance Boots make ordinary sprint stamina cost zero; Trail Runners increased 12%→15%; Ultralight Kit increased 14%→18%.
- Aquarium progression schema now stores capacity tier and active-play income state. Capacity tiers are 25/50/100/150/200/250/300 with centralized prices. Every five minutes of persisted active, unpaused play awards floor(1% of displayed sale value); no wall-clock/offline catch-up is used. The existing world renderer remains capped to a lightweight visible subset/shared update path rather than simulating all 300 residents at full cost.
- Appearance uses expanded curated palettes and no longer renders arbitrary color inputs. Backpack model and a 14-choice backpack color are independent; blobs have a 12-choice palette. Legacy tint fields remain readable only for save/network compatibility.
- Randomize Look is 96% human, 2% classic-blue blob, and 2% random non-blue blob. Reset still restores the verified orange-shirt/yellow-beanie legacy look and does not overwrite existing customized saves automatically.
- Local, preview, and remote avatars share the same appearance data. Ponytail, long-hair, and braid joins were tightened; glasses, headlamp, and flower crown were pulled onto the head; Bandana, Neck Gaiter, and Summit Necklace were added. Hat-compatible lower hair remains visible.
- Multiplayer snapshot appearance validation now accepts backpack/blob palette IDs and the three new face/neck accessories. The snapshot envelope and location protocol did not change, but the server allowlist did, so frontend and multiplayer server should be deployed together.
- Fish ecology now has 300 active species and 20 resolvable retired species. The v9.2 source list is labeled “30” but contains 31 distinct names; all 31 were added, while the exact ten newly requested legacy creatures were retired.
- All requested rarity promotions/demotions are applied at species construction, preserving stable specimen IDs. Penguin, Polar Bear, Qallupilluk, Blue-Ice Codling, Glacier Snail, and Frostglass Shrimp are concentrated/exclusive at Frosthook as authored.
- Cloudstep, Fallglass Waterfall, and Outer Ocean use three explicitly named rarity profiles. Uniform-zone anchors remain owned by the coordinated mountain pass; no upper/middle/lower waterfall subtable exists.
- Save compatibility is retained through canonical and legacy alias resolution. Progression schema is now version 8 for aquarium capacity/income and curated appearance fields; outer save schema remains version 8, export format 2, and slot-container schema 1.

1. **Fishing waters moved** — Amber Reed Pond moved offshore and became Reedwater Pond on Normal Fishing Island; Basalt Grotto moved to Cave Fishing Island; Blue-Ice Melt moved to Cold Island and is presented as Frosthook Melt. The total remains 24 fishing zones.

2. **Radial alignments broken up** — Main-mountain angles changed deliberately: Redbank 24°→18°, Red River 26°→47°, Echo Cave 125°→137°, Mossbell 86°→92°, Split Rock 42°→315°, Obsidian 202°→217°, Twilight 332°→344°, Hidden Ridge 29°→335°, and High Cirque 112°→74°. Only the watershed remains a continuous radial feature.

3. **Cloudstep Lake probabilities** — Cloudstep is its own freshwater upper-tier ecology/probability group, anchored once for the whole lake.

4. **Waterfall probabilities** — Fallglass Cascade is one path-shaped waterfall ecology/probability group spanning the whole cascade; it does not split into top/middle/bottom tables.

5. **Ocean probabilities** — Outer Ocean is one saltwater ecology/probability group using all three coastal ecology themes as a single fixed table instead of changing by ocean wedge/cast position.

6. **Uniformity confirmation** — `uniformProbabilities` and a stable probability anchor are applied independently to Cloudstep, Fallglass, and Outer Ocean. Cast position changes surface targeting, not the table inside any one of those zones.

7. **Waterfall geometry** — The terrain-following ribbon now starts at Cloudstep's outer edge (radius 96), samples each left/right terrain edge every 2 m, and continues through radius 222 into the ocean. Width now tapers over the complete lower run, and modest source/plunge/runout foam remains.

8. **Six island locations** — Home `(462.1, -182.0)`, Shop `(460.8, 200.8)`, Aquarium `(197.5, 270.9)`, Cave Fishing `(-28.4, 82.7)`, Normal Fishing `(548.4, -82.7)`, and Cold `(76.2, -219.1)` in world X/Z coordinates. Ellipse radii range only 15–23 m, versus the main island's 208 m core radius.

9. **Cabin Island** — A wooded/cozy low-poly island now carries the repaired cabin, wardrobe/appearance interaction, rest furniture, trophies, progress display, and climbable trees. The HUD Home action returns to a safe arrival directly outside this cabin.

10. **Shop Island** — A developed outpost with cargo, an open-front outfitter, a counter-local interaction volume (with live click revalidation), gear purchase/equip, specimen selling, and map sales.

11. **Aquarium Island** — A landscaped island with garden accents and the repaired public aquarium pavilion; its physical interaction opens add/remove/display management and its saved residents keep swimming in the tank.

12. **Cave Fishing Island** — A rocky silhouette with an opening omitted from the island-core triangles, a recessed rounded tunnel, descending floor, chamber, and Basalt Grotto water at the rear. It has no mine frame or exterior dark doorway blocks.

13. **Normal Fishing Island** — Reedwater is an outdoor natural pond island with a reed ring, open banks, and a distinct soft/green silhouette rather than a second cave.

14. **Cold Island** — Frosthook uses pale snow terrain, cold rock/ice materials, sparse large ice formations, and Frosthook Melt as its dedicated cold water.

15. **Cold species concentration** — Polar Bear and Penguin are now exclusive to `blue-ice-melt` (Frosthook), joined by the new Qallupilluk; Arctic Char, Arctic Grayling, Dolly Varden, and existing Fairy Shrimp favor that water. Logical nonexclusive cold fish can still occur elsewhere.

16. **Normal water moved offshore** — Amber Reed Pond was chosen because removing it reduces lower-main clustering; its canonical ID remains `amber-reed-pond` for saves/species references.

17. **Cave water moved offshore** — Basalt Grotto moved off the main mountain with canonical ID `basalt-grotto` retained.

18. **Opposite fishing islands** — Cave Fishing is at 164°/radius 300 and Normal Fishing at 344°/radius 300: exactly opposite bearings and about 600 m apart.

19. **Boat travel implementation** — Every destination comes from the generic world-location registry. Dock interaction opens travel; selection runs a short transition; the player is safely teleported to the destination arrival, camera yaw is restored, fishing/seating is cancelled cleanly, and multiplayer room membership is untouched.

20. **Travel-map UI** — The selector is a stylized clickable ocean chart using each destination's real world position, distinct island glyphs/colors, current/selected highlights, confirm step, and a small animated sailboat transition.

21. **Docks added** — Six main-shore docks and one dock on each of the six small islands use low-poly decks/piles, touch their shore slopes, expose boat interactions, and have separate safe arrival points.

22. **Main-island spawn relocation** — All six red/orange start arrivals moved from radius 183–184 to radius 204, with safe beach shelves and docks centered around radius 220.

23. **Random main arrival** — Returning to Main Mountain selects one of the six valid `START_LOCATIONS` with `Math.random`; focused checks verify both first and last dock selection paths.

24. **Island loading** — All six simple island meshes and their props stay loaded. This avoids a streaming system, preserves remote 3D players, and is acceptable for the current scale; registry `loadGroup`/`alwaysLoaded` metadata leaves room for later activation.

25. **Island map integration** — The world map consumes the same `WORLD_LOCATIONS`, ellipse radii, structure landmarks, fishing descriptors, and dock positions used by gameplay. All six islands are projected at their true positions.

26. **S marker legend** — Every real dock is an `S`; the legend says `S — Boat Arrival / Spawn Point`. Individual S markers have no giant labels.

27. **Larger fishing numbers** — Fishing marker numbers increased from 6.8 px to 9 px with stronger outline; their compact water footprints remain small enough to avoid excessive overlap.

28. **Split Boulder label** — Its real symbol remains, but the visible `Split Boulder` text is suppressed. Cave names and individual 500/550/600-ft ledge pins remain suppressed too.

29. **GPS Map** — GPS uses the normal world→map projection and refreshes local plus remote markers from the existing interpolated multiplayer snapshots. Local/remote styling and short nonprivate player-ID suffixes are distinct; no tracking protocol was added.

30. **Paper Map** — Paper Map is a durable inventory item that opens the complete descriptor-driven world overview with six islands, 24 waters, caves, biomes, five elevation regions, docks, structures, waterfall, summit, and useful landmarks, but never player positions.

31. **Map prices/ownership** — Paper Map costs `$75`; GPS Map costs `$900`. Both are bought only at Shop Island, persist in `ownedItems`, appear as actual Inventory cards, can be held/used there, and GPS is intentionally much more expensive.

32. **Inventory structure** — Inventory now has exactly `CATCHES` and `GEAR` tabs. Save/Data, Appearance, Aquarium management, Shop, selling, and purchasing are not Inventory tabs.

33. **Hold in Hand** — Carried specimen hold/put-away remains. Map inventory actions select the durable map item and immediately read/use the corresponding Paper or GPS display.

34. **Specimen previews** — Each specimen card renders a lightweight SVG silhouette using that species' actual model archetype proportions/category and authored primary/accent colors, plus rarity, quality, shiny mark, length, weight, value, and provenance.

35. **Appearance relocation** — Appearance is opened only from the Cabin Island wardrobe. The live preview, expanded curated palettes, hair/hat rules, 96/2/2 Randomize, classic Reset Default, save compatibility, and multiplayer appearance snapshots remain intact; arbitrary color pickers were removed.

36. **Aquarium management relocation** — Adding to and removing from the aquarium now happens only in the physical Aquarium Island menu. Inventory still records carried ownership but has no aquarium-management buttons.

37. **Shop relocation** — Gear buying/equipping, map purchasing, and fish selling now happen only at Shop Island. Durable equipment ownership/equipped state is unchanged.

38. **Save slots** — Four local save slots are available.

39. **Old-save migration** — When no slot container exists, the existing `reel-ascent-save-v1` payload is migrated into Save Slot 1 automatically; focused tests preserve its money and progression.

40. **Save-slot architecture** — One structured `reel-ascent-save-slots-v1` document owns active-slot metadata and four independently migrated save payloads. A separate browser multiplayer ID prevents imported/selected save identities from impersonating another active room identity.

41. **Export/import changes** — Export format version is 2 and exports the current save only. Version-1 exports remain accepted; import validates/migrates canonical data, lets the player choose a destination slot, warns before overwrite, and downloads a current-slot backup first.

42. **Reset Save** — Save/Data requires typing the exact slot-specific reset phrase, resets only that slot, and reloads only when the active slot changed. It does not clear other slots or the browser multiplayer identity.

43. **F1 activation** — Cheats are off on every page load. A tap or early release cancels; holding F1 continuously for 3 seconds shows percentage progress and then a temporary `CHEATS ENABLED` confirmation. It is session-only and never saved.

44. **Cheat keys after activation** — F3 HUD, F4/P creature gallery and gallery edit keys, F6 ecology panel, F7 stamina, F8 summit, F9 money, F10 hard debug fish, B/N fishing cheats, Home debug return, and F3-dependent numeric/letter teleports work after activation. They remain absent from normal Controls.

45. **Cave-core geometry** — Main cave mouths still remove triangles from the gray core. Their protruding side/roof box rows were replaced by one collidable semicircular arch mesh recessed behind the cut; Cave Island uses the same principle in its own omitted core wedge. Floors/chambers remain internal only.

46. **Cave staggering** — The remaining main cave waters are Echo at angle 137°/radius 110, Obsidian at 217°/105, and High Cirque at 74°/56, so both bearing and elevation differ; Basalt moved offshore.

47. **Dominant vegetation archetypes** — Sunwash now uses short broad umbrella-like `scrub-tree` crowns; Blackstone uses tall narrow conifers; Fernwood uses rounded multi-lobe broadleaf canopies. These are deliberately not evenly mixed.

48. **Vegetation density** — Deterministic candidates rose from 210 to 360 and climbable-tree capacity from 64 to 100. Authored density is Sunwash `.72`, Blackstone `.94`, Fernwood `1.0`; Blackstone/Fernwood read as forests, while Sunwash remains more open. Secondary dry scrub, pine saplings, fern fans, bushes, grass, and flowers follow biome identity and thin above low elevations.

49. **Performance considerations** — Islands use six low-segment terrain meshes, shared materials/primitives, and no simulation/streaming. Vegetation reuses existing forms and keeps only up to 100 trunks/branches collidable. Always-loaded simplicity was chosen; manual frame-rate inspection is still recommended.

50. **Island multiplayer handling** — Boat teleport does not leave/rejoin rooms or change protocol state. With all locations loaded, remote avatars continue rendering/resynchronizing through existing snapshots and the roster is unchanged.

51. **GPS multiplayer tracking** — GPS reads `RemotePlayer.lastSample` plus the local player position and updates only while the GPS map is open. It exposes only `YOU` and a short player-ID suffix.

52. **Future second main island** — `WorldLocation` records now own ID, display/type, world position, radii, theme/functions, load group, map representation, destination order, and dock/arrival metadata. Boat and map iterate this registry; a future location can be added without duplicating UI switch statements.

53. **Multiplayer protocol changes** — No new message/envelope was added. Existing snapshots remain sufficient, but their appearance allowlist gained `backpackColor`, `blobColor`, Bandana, Neck Gaiter, and Summit Necklace.

54. **Render redeployment** — Yes for v9.2: `server/src/snapshot-validation.js` changed, so the multiplayer server/Render service and frontend should be deployed together.

55. **Files changed** — `PROJECT_HANDOFF.md`, `index.html`, `src/styles.css`, fishing data/ecology/zone/controller files, `src/game.js`, persistence/progression files, `src/player/movement.js`, Home/HUD/Inventory/Map/Shop/Aquarium/Fishing Performance UI files, `src/world/mountain-v2.js`, `src/world/world.js`, `src/world/run-manager.js`; new `src/world/world-locations.js`, `src/ui/boat-travel.js`, `src/debug/cheat-gate.js`, and `test/v9-major.test.js`; refreshed `dist/index.html` and hashed JS/CSS assets.

56. **Save schema changes** — Current durable save schema is `8`; progression schema is now `8`; progress export format is `2`; slot-container schema is `1` with four slots. Aquarium capacity/income and curated appearance fields normalize forward while old schemas and version-1 exports remain importable.

57. **Frontend build** — Yes. The v9.2 `npm run build` completed successfully (1,274 modules; only the existing large-chunk warning). Focused roster/ecology, binding, aquarium/Sell All, appearance, and server-allowlist checks pass; changed JavaScript passes syntax checks; the multiplayer server started successfully on the alternate smoke-test port 18787 because the normal local port 8787 was already occupied; `git diff --check` reports only Windows line-ending notices.

58. **Highest-value manual tests** — Sail once to any small island and return to verify a random main dock; inspect the six island shore/dock joins and Cave Island entrance; walk Cloudstep→Fallglass→ocean looking for clipping; buy/use both maps and check GPS with a second player; exercise Shop/Aquarium/Cabin interactions; migrate/switch/import/reset a nonprimary save; tap then hold F1 and try F3/F7/F9.
