# Graphics and exploration pass — October 20, 2026

All changes are local and uncommitted. This pass has not been published.

## Bass Camp

- Added shared 128 × 128 procedural wood, stone, fabric, roof, grass, sand, and scale textures with restrained relief. No external texture downloads are required. Procedural and authored runtime meshes receive UVs without changing their positions, indices, or collision shapes. Fixed the world material helper ignoring metalness.
- Replaced segmented fish bodies for the main fish families with closed, continuous surfaces. Added seated eyes and catchlights, embedded gill creases, attached fins, a real tail hinge, a broad Betta tail, upper-surface flatfish eyes, and mouth-anchored whiskers. Species-inspired palettes replace arbitrary neon blocks; shiny variants retain a warm alternate treatment.
- Rebuilt frogs, shellfish, octopuses, jellyfish, turtles, salamanders, and rays with connected anatomical parts. Rays have continuous swept wings; octopus arms are curved and tapered. Remaining model recipes receive contact repairs based on their rendered convex hulls. Repairs preserve mesh origin offsets, and rotated primitive metadata uses the actual bounds center.
- The canonical model factory supplies Hand, catch, remote-player, and Aquarium displays. Inventory and journal icons use the same palettes. Fish identities, sizes, rarity, ecology, save IDs, and catch rules are unchanged by this art pass.
- Added jacket zipper/pocket details, fabric weave, knit beanies, backpack pockets/webbing/buckles, hat bands/clasps, independent metal and cloth tints, and folded capes with trail patches and shoulder fastenings. Existing compatibility and unlock gates remain in force. Pending cosmetic redesign records are still pending; this pass does not claim that all 139 catalog entries have unique authored models.
- Rebuilt the production output in `BassCamp/` from `ReelAscent/`. Production loaded without console warnings or errors in the local browser. One final pre-cape timing run reached its first interactive frame in about 4.51 seconds from module evaluation; another earlier graphics run took 5.09 seconds. These internal timings exclude network downloads, vary with machine load, and are not a guarantee for Firefox or phones. The earlier optimized runs were 4.43–4.73 seconds; no additional loading-speed improvement is claimed for the graphics work.

### Model review tool

With the ReelAscent development server running, open `/tools/visual-lab.html`. It uses the real runtime factories, shows normal/shiny creatures and human/blob outfits, and supports side, quarter, top, and back views. It does not read or write game saves. Pending cosmetic models are excluded.

The final browser audit built all **300 creatures / 3,660 rendered parts**, checked finite vertices, compared actual rendered transforms against their recorded positions, and checked a contact path through the parts. It reported **0 problems**. The contact test uses convex hulls; it is not a certification of every triangle intersection or every animated pose. Representative fish, frog, crab, rays, octopuses, packs, capes, and blob outfits were also inspected visually.

## Nose First

- Expanded the connected northern map with Willow Garden, North Lane, a greenhouse, potting shed, raised beds, paths, vegetation, signs, and a mailbox. The creek and northern boundaries extend with the new area.
- Added the gardener's missing seed packet, a returning-watering-can interaction, a windblown-postcard delivery, a hinged shed latch/door, sprinkler watering and growth, reactive birds, wind chimes, a rolling garden ball, discoveries, scent trails, and journal/objective hints. The original main mystery remains intact.
- Added a pocket trail map with the current position, keyboard focus handling, Escape/back controls, zoom, Fit, and contained scrolling for small screens. Open it with Tab while exploring or from the pause menu.
- Rolling props now fall, bounce, settle, and roll off ledges. Movement includes jump buffering and a short ledge grace period. Arrow keys provide an alternative to mouse look. Touch holds track the owning finger, so an extra finger cannot retrigger an action or release a held sniff.
- Added small shared material textures, corrected sky color processing, player-following shadow coverage, and actor contact shadows. Fixed solid interactables obscuring their own prompts. The pause menu explicitly says “Save & return to ThomasLab home.”
- Existing saves keep the same storage key. Version 10 adds normalized garden progress and preserves the previous story migrations, discoveries, and completions. New module URLs carry a release version so a cached development revision is not reused after this update.

### Playtesting

Used a temporary copy with a separate save key and visible test controls. The temporary page is removed from the deliverable. Completed seed retrieval/return, watering-can return, postcard pickup/delivery, sprinkler watering, birdbath, and chime interactions. Reloading retained progress. Walked through the garden entrance and into the greenhouse using the actual keyboard movement handlers; both finished in valid positions with **0 recoveries**. Existing collision sanity and new doorway/bed/shed/mailbox checks passed. Checked the map at desktop and 390 px widths, including zoom containment and keyboard navigation. No new runtime errors were observed.

This is a substantial connected expansion, not an exhaustive playthrough of every original puzzle or every new movement combination. Touch gesture behavior has automated coverage; physical touchscreen play remains useful follow-up testing.

## House Rater

Added architectural drafting lines, warm paper panels, a dark teal title plate, an original SVG house study, quieter score cards, and short focus/press transitions. Checked desktop and 390 px phone layouts. Form/data/scoring logic and the existing missing/assumed/source status colors remain intact. The original data block and inline scripts were not edited in this pass.

## Checks and limits

- **10 new checks passed:** four Bass Camp graphics checks and six Nose First physics/progress/touch checks. The geometry check verifies finite, closed, consistently wound fish bodies, ray discs, and curved arm surfaces after UV seam welding; the other graphics checks cover contact detection, all species palettes, deterministic textures, and unchanged mesh/collision coordinates.
- The current top-level Bass Camp suite has **400 tests: 324 passed / 76 failed**. The preceding local suite had 396 tests: 320 passed / 76 failed. Comparing failing titles found **no new failures**. The pre-existing failures have not been rewritten to manufacture a green result.
- The package-wide test command also discovers a duplicate suite under `src/test/`: 405 tests / 328 passed / 77 failed. Its additional failure is an existing incorrect `src/src/world/...` file path. It is separate from the top-level suite comparison.
- The four Train Clicker save checks also passed again.
- All 19 inline scripts across 20 entry pages passed syntax checks; linked local script/style/image/model assets were present. House Rater's inline scripts match its pre-pass checkpoint exactly.
- The production build succeeds with the existing bundler notices about large chunks and browser-externalized worker modules. No blanket claim is made about every device, graphics driver, external service, or gameplay edge case.

## Rollback

Pre-pass copies of the edited original files are in `%TEMP%/ThomasLab-graphics-before-20261020/`, preserving their repository-relative paths. Restore only the affected files to undo a particular part of this pass. New modules and `HouseRater/graphics.css` / `house-study.svg` are separate files. Restore source and rebuild Bass Camp together; do not mix old generated JavaScript with new source. Preserve the earlier authorized changes and unrelated working edits instead of resetting the whole repository.

The earlier five-project interface work and its own rollback checkpoint are documented in `SITE_VISUAL_REVIEW.md`.
