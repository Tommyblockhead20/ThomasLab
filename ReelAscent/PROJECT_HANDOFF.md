# Reel Ascent v9.4 update handoff

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
