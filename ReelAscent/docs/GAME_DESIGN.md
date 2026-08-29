# Game design direction

This document records long-term direction. It is not permission to implement features beyond the current milestone.

## Core concept

The player ascends one large, radial, hand-authored mountain/island. Elevation and dangerous traversal lead to increasingly interesting fishing locations. Fishing and climbing should reinforce each other: an unusual fishing spot may justify a dangerous detour.

The mountain uses broad elevation bands crossed by distinct regional sectors: coast and lowland starts, forest, waterfall and river country, cliffs, caves, alpine terrain, snow and ice, and a summit region. Players begin from varied positions around the outer edge, then choose routes that generally lead inward and upward rather than following one linear trail. Milestone 4 is the first playable prototype of that structure; future milestones can refine its authored routes without replacing the radial concept.

## Exploration

The world should reward looking around instead of following one obvious route upward. Routes should fork into climbing challenges, fishing detours, shortcuts, caves, hidden ledges, deliberate dead ends, and occasional equipment-gated alternatives. A failed route can still teach a landmark, material sequence, or safer approach; player knowledge should make repeated ascents faster and more confident.

Build one deliberately designed mountain rather than procedural terrain. Six outer starts are selected per run, but the mountain itself remains authored and learnable.

## Difficulty and repeated runs

Difficulty should come from readable route decisions, stamina planning, surface material, overhang angle, transfers, and fishing rhythm complexity—not obscured rules or arbitrary stat checks. Direct routes can demand precise execution while longer routes offer rest ledges or safer materials. Clearly impossible direct moves should invite route-finding rather than repeated blind attempts.

Repeated runs should be supported by route mastery, catch records, alternate starting sectors, optional fishing goals, secrets, and sidegrades. Future rewards may come from climbing accomplishments, notable catches, exploration discoveries, and location-specific challenges. Prefer equipment sidegrades and expressive cosmetics over permanent upgrades that erase traversal or fishing skill. Cosmetic slots can cover headwear, face items, backpacks, rods, and small keepsakes; no customization or unlock system is part of Milestone 3.5.

## Climbing

Climbing should be fun and readable rather than an exact hand-and-limb simulation. The intended system is roughly:

- The player reaches a climbable surface and holds a grip/climb control.
- Movement switches into a surface-constrained climbing mode.
- Climbing consumes the same stamina resource used by sprinting.
- Difficult surfaces consume more stamina and overhangs are especially expensive.
- Releasing grip causes a fall, ledges allow rest, and falling feels dangerous.

Hands and arms may react visually to surfaces later, but animation should not decide the actual climbing physics.

### Milestone 3.5 surface rules

- Only colliders registered as climbable may be gripped; ordinary scenery and flat ground are excluded.
- Rough, normal, smooth/wet, icy, and ungrippable faces are visually distinct and use data-defined speed, stamina, slip, and grip rules.
- Surface tilt is continuous: modest overhangs add proportionally more drain instead of switching to a separate mode.
- Releasing grip, running out of stamina, losing a valid surface, and jumping away all return control to normal airborne movement through the player movement state.
- Mantling is probe-driven and only completes when a walkable, capsule-clear landing exists beyond the lip.
- Wall push-offs combine the wall normal with camera-relative `WASD` intent. Midair catches preserve some transfer momentum, while same-surface regrips require genuine separation and nearby different surfaces remain catchable.

## Fishing

Fishing is planned as a deep collection and skill system. Possible features include a rod, physical-looking cast, bobber, bite indication, four-lane rhythm fights, species, size and weight, rarity, location-specific catch tables, worthwhile time/weather modifiers, a fish journal, records, legendary or secret fish, and visibly holding catches.

Harder-to-reach locations should generally provide more interesting catches. A tiny hidden pond on a dangerous ledge can be more exciting than an easy lake.

### Milestone 3.5 pond rules

- Fishing uses one explicit player state. It can start only while grounded near a registered fishing zone, and it owns left-click until the player exits with `F` or `Escape`.
- Cast strength controls distance. The bobber follows a visible arc, and only endpoints inside explicit water geometry can begin a bite wait; dock and bridge exclusions reset cleanly as invalid casts.
- Bites occur after a short variable wait and provide a brief hook window. Missing the window returns to a ready state without leaving a stale bobber or rhythm challenge.
- Hooked fish start an original `A W S D` four-lane rhythm challenge. Perfect and good timing build catch progress; misses and wrong inputs build escape pressure. BPM, duration, input count, density, complexity, bursts, holds, timing windows, and tolerance are data-driven by species.
- Mirror Pond draws from nine data-defined species with weighted rarity, size, weight, body archetype, and rhythm behavior. Catch history, exact stats, catch location, catch time, and best measurements last for the current browser session only.
- A landed catch is shown as a physical fish in the character's hands. Actual length controls model length, while weight condition and species body type control girth. The HUD presentation stays secondary and minimal.
- The pond water surface is registered explicitly rather than inferred from its visual material. Entering deep water outside the bridge and fishing dock safely respawns the player; swimming remains outside this milestone.

### Milestone 4 world rules

- The first mountain prototype established a 126-unit-wide, 43-unit-high radial layout. Milestone 4.2 supersedes those prototype dimensions with the expanded traversal rules below.
- Six safe shoreline starts face inward from sandy beach, rocky coast, forest inlet, waterfall basin, cliffside shore, and sheltered cove sectors.
- Unregistered mountain mass is deliberately ungrippable. Rough, normal, smooth/wet, and ice route pieces provide the readable ways upward, with rest ledges, transfers, stairs, lateral links, recovery shelves, and selected dead ends.
- Falling entirely off the island, entering deep water, or leaving bounds ends the current run. A new run resets temporary movement, stamina, climbing, fishing, timer, and catch state and selects a different outer start.
- Summit arrival reports time, catches, highest elevation, rarest catch, and start without ending play.
- Ten fishing waters span the coast, forest, waterfall, cliff, cave, hidden ledge, alpine, snow, and summit. They draw from 15 species with Common through Epic rarity; Milestone 4 adds no Legendary fish.
- The Milestone 3.5 mechanics course stays visually disabled during normal runs and is enabled only by its debug teleport.

### Milestone 4.2 locked traversal rules

- The mountain is an authored radial playspace with a 300-unit coastal shelf and a 108-unit summit. Its larger footprint is filled with routes and lateral decisions rather than produced by uniformly scaling the old prototype.
- Forty route networks cross five elevation bands. The lower and middle mountain use walkable slopes, diagonal ridges, boulder gaps, short readable faces, traverses, transfers, mantles, and rest shelves; step-chain or staircase progression is not part of the intended language.
- Routes form overlapping choices around each ring. Six random shoreline starts expose different initial lines, while lateral ledges let players change plans rather than commit to isolated vertical columns.
- Rough faces use large chunky protrusions, normal faces use fewer moderate holds, smooth/wet faces use shallow dark glossy marks, and ice uses sharp bright facets. Smooth blank slabs remain visibly ungrippable.
- Overhangs are scarce and authored. Each is a named transfer, traverse, or shortcut with a readable solution and a nearby bypass; arbitrary overhang decoration is not permitted.
- Plateau surfaces come from one solid each. Visual caps, pads, water, markings, or decals must never share an exact plane with a terrain surface; local separation fixes flicker instead of global depth bias.

### Milestone 4.2 locked fishing rhythm rules

- Every species owns exactly two authored motifs expressed as data (`A`, `S`, `W`, `D`, rest, and hold tokens). Code parses that shared format; species-specific branches are not allowed.
- Musical pitch follows direction consistently: left (`A`) is lowest, down (`S`) is low-mid, up (`W`) is high-mid, and right (`D`) is highest. Correct notes use the fish's reusable synthesized instrument.
- Species baseline controls motif, tempo range, timing window, and instrument. Length only nudges note spacing and hold length; weight condition only nudges tempo and sustain within narrow bounds.
- A performance contains exactly one more event than the number of successes required. One missed event is recoverable; as soon as successes plus remaining events cannot reach the target, the fish escapes. A completed hold counts as one success.
- Shiny chance is globally configurable and rare. A shiny fish keeps its species motif rhythm and instrument but mirrors directions (`A`↔`D`, `W`↔`S`) and therefore mirrors pitch. Shiny presentation uses an unmistakable iridescent palette and sparkles, and debug gallery controls can force it.
- The Milestone 4.2 roster contains 30 species distributed across coastal, freshwater, river, alpine, and cave waters. Each catch still stores inches and pounds.
- After landing, the rhythm state ends before presentation begins. The character holds a large species- and specimen-shaped fish while the camera frames it; the only normal catch text is species name plus applicable `NEW SPECIES`, `NEW RECORD`, and `SHINY` flags.

### Milestone 4.3 locked world and control rules

- The mountain is now roughly 396 units across its coastal shelf and 142 units high. Five buried structural cores support an irregular shell of large rounded, fractured masses; the visible route language is rock pile, slab, ridge, terrace, traverse, and mantle rather than stacked circular walls.
- Terrain targets a broad angle distribution: 25–35° walking, 40–55° scrambling, 55–75° climbing, 75–88° steep faces, occasional vertical faces, and only three named purposeful overhangs. Normal route faces recline toward the climber; positive overhang tilt is reserved for authored transfer puzzles with bypasses.
- The first 52 units of elevation contain the densest run/jump/scramble/climb sequence. Forty radial networks and four lateral rings allow route changes and horizontal movement instead of isolated climbing columns.
- Water danger is explicit data, never inferred from a water material. Puddles, streams, tidepools, and shallow pond edges are safe to enter. Only visibly darker, named deep centers and the unrecoverable ocean boundary end a run.
- A failed run freezes movement and shows the run report. It never restarts on a timer; `START NEW RUN` performs the full state reset without reloading the page.
- Desktop camera control requests pointer lock on a click, releases through the browser's `Escape` behavior, and retains drag-look as a fallback. Touch camera look remains drag-based.
- Wall push-off intent is discrete but composable: neutral jumps away with modest lift, up adds clearance, down deliberately drops with no upward launch, and left/right or diagonal input adds surface-tangent travel.
- Touch controls track every pointer independently. Direction, sprint, grip, and jump can overlap; releasing one pointer removes only that pointer's action.
- Fishing mode remains toggled with `F`. Mouse movement aims, holding `↑` charges, and releasing `↑` casts; `W` is an optional desktop alias and the on-screen up arrow is the touch cast control. Click/grip remains the hook and continue action.
- Fishing line geometry begins at a real child anchor on the rod tip. The idle lure, cast, bobber, bite, struggle, and reset all reuse that transform so character or rod animation cannot detach the line.
- A catch is not awarded as soon as the minimum success count is reached. Every authored event in the species song must be judged. A first miss triggers a recoverable near-loss performance; a second miss escapes. A perfect performance still completes the full song and receives a stronger final accent.

### Milestone 4.4 locked fishing and terrain rules

- The full fishing action loop is mouse-free: `F` enters or exits fishing, holding and releasing `↑` charges and casts, `↓` hooks a bite, and `← ↓ ↑ →` play the fight. `W`/`S` and `WASD` remain optional aliases, but fishing UI communicates arrows.
- The first bite on a device shows one clear `↓` hook lesson and stores a lightweight local seen flag. Later bites rely on the bobber's sharp dip and tug, splashes, and bite sound, with only the compact fishing message as a reminder.
- Every landed specimen stores a `GOOD`, `GREAT`, or `PERFECT` quality. The grade uses the existing perfect/good judgments and miss count: `PERFECT` requires a high perfect ratio and zero misses, `GREAT` covers strong clean songs or an exceptionally accurate one-miss recovery, and other successful songs are `GOOD`.
- Shiny fish remain visually distinct and mirror the species song, but allow zero misses. The first missed or wrong note immediately loses the shiny; a successful shiny still receives a timing quality.
- Rarity establishes a minimum song length while species difficulty remains the main authority for tempo, timing tolerance, holds, and composition. Rare and Epic species generally fight longer, and explicit high/hard fishing-zone weights increase rare access and trophy chances without removing useful low-water catches.
- Each species stores typical length and weight ranges plus an archetype-adjusted length/weight exponent, body length, depth, width, head, and fin proportions. Length drives longitudinal display size while weight condition drives girth. Most catches stay ordinary, trophies are uncommon, and extremely rare exaggerated outliers may exceed normal ranges for fun.
- Natural mountain terrain uses shared low-poly fractured forms rather than raw visible boxes. Climbable faces include protruding holds and dark crack geometry; subtle per-form material variation adds roughness and color breakup.
- Rounded and faceted boulders use convex colliders generated from the same form vertices as their render mesh. Physics geometry has no ordinary-play render proxy, so debug/collision shapes cannot replace the intended rock.
- Small and medium boulder fields are partially buried on known terrace heights to break cliff edges and mountain silhouette. Accidental floating natural geometry is unacceptable; intentional bridges, suspended features, water sheets, and other clearly non-natural exceptions must remain explicit.

### Milestone 5.0 locked mountain and collection rules

- These are the current world rules and supersede the older primary-mountain allowance for authored overhangs: the main mountain has no overhangs. The hidden mechanics course may still exercise the climbing system's overhang handling.
- Five offset, faceted terrain masses form one overlapping mountain silhouette. Each mass widens toward its base, uses an exact matching trimesh collider, and has sector-specific gullies that keep starts, ponds, and route destinations open instead of forming visible concentric walls.
- Forty route families remain connected by slope-following lateral traverses. Slabs, rough faces, ledges, buried boulder fields, ravines, a cave mouth, the waterfall, a windy shelf, ice fields, tilted rocks, tarns, and summit formations create route-reading landmarks without a mandatory staircase.
- Fishing basins are cut into the terrace below the next rising mass. Their rarity and trophy modifiers still increase with elevation, and only explicitly deep water or the unrecoverable ocean boundary is fatal.
- The active fishing implementation is v13: 51 species, four player-facing rarity labels ending in Legendary, recorded instrument samples, an eight-note scale with two pitches per arrow, one authored song per species, mirrored shiny songs, three hold lengths, hold forgiveness, anti-burst escape protection, catch quality, broad specimen sizing, and pond anti-repeat/share limits.
- Save data is local and versioned. It stores discovered species, per-species catches and bests, catch quality, shiny count, lifetime fish, summits, highest elevation, and a small bounded run history; corrupt or incomplete saves fall back to normalized defaults.
- `J` opens the persistent fish journal and `Escape` closes it before other menus react. Undiscovered species reveal no identity. The touch layout exposes a small Journal button.

### Future equipment and cabin direction (planning only)

- Future rods, bait, lures, climbing gear, and found or purchased equipment should be sidegrades that change route or fishing decisions instead of replacing player skill.
- Carry weight should make climbing meaningfully harder. Taking specialized gear or hauling valuable catches creates a stamina and route-selection tradeoff rather than a flat power increase.
- A future cabin/shopkeeper may support buying, selling, and storage between runs. Milestone 5.0 adds collection persistence only; there is still no shop, currency, gear economy, bait system, or general inventory.
- Special items should come from exploration, unusual catches, and climbing accomplishments. They should point players toward new decisions or expression, not erase traversal hazards.

### Units

- Player-facing elevation and run summaries use feet. Internal physics and debug diagnostics may remain in world units/meters.
- Fish length remains inches and fish weight remains pounds.

## Tone and visuals

The game should feel charming, slightly goofy, adventurous, colorful, stylized, and satisfying rather than realistic, with room for occasional absurd humor.

Use an original low-poly visual style with simple shapes, readable silhouettes, soft atmospheric depth, distinct environmental regions, restrained detail, and colorful outdoor scenery. Technical limits can be used intentionally as part of the style.

## Multiplayer

Do not implement multiplayer yet. Avoid needless single-player assumptions in fundamental state where practical, but make single-player fun first.
