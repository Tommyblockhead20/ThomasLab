# Reel Ascent v11 cosmetics/held-fish/aquarium continuation handoff

Updated: 2026-08-29

This work was performed in the current Reel Ascent tree without discarding the existing v8/v9 continuation. The fishing-exit fix, partial-foot stamina rest support, progression areas, caves, map, summit bench, emotes, denser Crown, rhythm riffs/chords, 280-creature roster, human remote avatars, and catch-presentation relay remain present. The production `dist/` has been rebuilt from the combined tree.

## 1. Character customization options

- Inventory now has an **Appearance** control, and the shoreline cabin wardrobe opens the same editor.
- Avatar type: Human or Blue Blob.
- Human choices: 5 skin tones, 9 shirt colors, 7 pants colors, 8 hair styles, 9 hair colors, and 9 accessory states.
- Hair styles: Short, Tousled, Ponytail, Mohawk, Long, Trail Bun, Twin Braids, and Bald.
- Accessories: None, Beanie, Trail Glasses, Trail Hat, Fishing Cap, Headlamp, Trail Scarf, Flower Crown, and Summit Goggles.
- Shirt, pants, hair, accessory, and Blue Blob colors now also have safe custom hex-color controls with one-click preset restoration.
- Changes preview on the live player immediately. Save commits normalized IDs only; invalid or missing values fall back safely.
- Appearance is a normal modal: Escape closes it, modal blockers prevent duplicate overlays, and listeners are removed on teardown.

## 2. Blue Blob option

- Blue Blob remains available as an intentional alternate avatar, but it is no longer the default.
- New and migrated players default to the Human avatar (`warm` skin, Alpine Blue shirt, Pine pants, Tousled Espresso hair, no accessory).
- The blob once again matches the first multiplayer proxy: blue capsule body, round head, and forward-facing marker. A light squash response remains, and its blue is customizable.
- Blob selection is saved and replicated exactly like human cosmetics.

## 3. Human avatar improvements

- The local and remote human rigs now have distinct upper/lower torso volumes, neck, shoulder caps, more natural head proportions, segmented arms and legs, hands, boots, and backpack.
- Hair and accessory entities are actual low-poly geometry attached to the rig and are toggled without rebuilding gameplay physics.
- Cosmetic materials are shared/reused where practical; the visual rig remains offset from the unchanged player collider and movement dimensions.
- Existing multiplayer color identity is retained while the selected skin/clothing/hair fields are visible.

## 4. Animation improvements

- Existing procedural states remain active for idle, walk, run, airborne, climb, mantle, fishing, catch presentation, and all five emotes.
- The improved segmented human rig makes arm/leg swing, climbing reach, mantle posture, fishing pose, and emotes read more clearly.
- Blue Blob receives action-aware bounce/lean rather than remaining a static capsule.
- Animations remain client-side. Movement, physics, collision, and timing are not driven by cosmetic animation frames.

## 5. Multiplayer appearance replication

- Player snapshots now include one compact normalized `appearance` object containing seven allowlisted IDs plus five validated optional color values.
- The server sanitizes every field independently and falls back to the safe Human defaults for invalid values.
- Room roster state includes the most recent appearance so a late joiner sees the correct avatar immediately rather than briefly getting a permanent default/blob representation.
- Subsequent snapshots update the existing remote avatar live; no remote entity recreation is required.
- Remote emotes, movement animation, fishing pose, and catch presentation continue to work on either avatar type.

## 6. Save, migration, export, and import

- Progression save schema is now version 3 and the outer save schema remains version 6.
- Appearance is stored in progression, included in progress export, restored on import, and normalized during migration.
- Old and partial saves receive the Human default without losing collection, Aquarium, money, gear, summits, run history, or player identity.
- A bug-audit fix also canonicalizes species IDs before catch-record lookup/write, preventing legacy hyphen/underscore aliases from splitting collection progress.

## 7. Cabin location and structure

- A small enterable cabin sits on the lower shoreline between Sandy Beach and Sheltered Cove, centered near angle 326° and radius 187 m.
- It has a solid floor, back and side walls, a split front wall with a real open doorway, jamb/header, pitched solid roof and ridge, porch, two steps, and porch posts.
- Windows, floorboards, shelves, and trail gear provide visual detail while the main structure and large furniture use ordinary collision.
- Placement avoids the tidepool, does not float, and is outside the main climb web so it does not change mountain routing.

## 8. Cabin interactions

- Wardrobe: opens Appearance.
- Bed and chair: rest only when the player is grounded, refill stamina, and start the existing Sit / Relax emote without teleporting or disabling movement.
- Trophy display: reports species, Aquarium, and summit progress; four display objects update from saved milestones.
- A shared nearby-interaction prompt supports click/tap and `X`, respects other modals/fishing, and cleans up its event listeners.

## 9. Environmental and rock aesthetic changes

- Mountain rock materials now vary by region: wet/coastal, warm lower sectors, forest-tinted, cool alpine, pale Crown, and neutral stone, each with restrained tone variants.
- Fractured rock silhouettes now use a 23-entry deterministic pool, including the v10 Anvil, Tooth, Fin, Bulb, Terrace, Prow, Twist, and Crouch forms.
- Authored route sequences use more shard/hook/knuckle silhouettes, while the shared deterministic pool distributes all forms more broadly.
- The visible fractured mesh and exact convex-hull collider still use the same transform, so added variety does not introduce decorative-only grips or collider drift.
- Cave interiors use a darker dedicated cave-wall treatment; cabin wood, shrubs, dry grass, flowers, and regional stone have separate materials.

## 10. Vegetation changes

- Deterministic lowland trees, coastal grass, flowers, bushes, and sparse alpine scrub were added with a clear elevation taper.
- Vegetation avoids water, cabin circulation space, and crowded nearby rock placements.
- Substantial reachable trunks and branches use rough climb surfaces (maximum 28 from 72 lowland candidates); small plants remain decorative and do not cast shadows.
- Vegetation becomes sparse toward the upper mountain/Crown so route silhouettes and climbing readability stay clear.
- Small natural accents were added around the 500 and 600 ft rest areas without obstructing their mantle/top-out space.

## 11. Atmosphere and readability

- Ambient light, sun intensity, fog distance/color, exposure, and clear color received a restrained warmer/coastal pass.
- Fog remains distant enough to keep route planning readable; the mountain is not hidden behind a heavy effect.
- Regional stone colors and vegetation bands provide lower/middle/upper visual landmarks without adding navigation markers or changing established terrain routes.

## 12. Performance and bug-audit results

- Geometry remains low-poly and deterministic. Small vegetation does not collide or cast shadows; the denser forest caps climbable trees at 28; cosmetic animations are procedural and transmit no frames.
- The audit found and fixed a real ecology weighting bug: in a small cave pool, a lone creature in one rarity tier could inherit a 60% final catch chance despite the 25% per-species ceiling. A final feasible cross-pool cap now redistributes overflow and recomputes truthful rarity diagnostics.
- Ecology metadata was updated to the active post-promotion roster: 100 exclusive and 180 shared creatures across 24 waters, with 2–8 exclusives per water. All 280 creatures remain reachable.
- Ten obsolete pre-v8 assertions were updated to test the active rendered shoreline, correlated-but-independent fish dimensions, +20 BPM pass, rarity adaptation, holds, riffs, chords, and current ecology rather than reverting gameplay.
- No additional crash, listener-leak, modal duplication, or fishing cleanup defect was found in the static/focused audit.

## 13. Files changed

Core v9 additions/changes:

- `index.html`
- `src/player/appearance.js` (new)
- `src/player/player.js`
- `src/fishing/specimen-model.js` (new)
- `src/ui/appearance-menu.js` (new)
- `src/ui/home-interaction.js` (new)
- `src/ui/inventory.js`
- `src/ui/fish-journal.js`
- `src/ui/multiplayer-menu.js`
- `src/styles.css`
- `src/game.js`
- `src/world/mountain-v2.js`
- `src/camera/orbit-camera.js`
- `src/progression/progression-save.js`
- `src/progression/progression.js`
- `src/persistence/save-system.js`
- `src/multiplayer/protocol.js`
- `src/multiplayer/remote-avatar.js`
- `src/multiplayer/remote-player.js`
- `src/multiplayer/room-state.js`
- `server/src/snapshot-validation.js`
- `server/src/room.js`
- `src/fishing/fish-ecology.js`
- `src/fishing/rarity-selection.js`
- `test/fishing.test.js`
- `test/mountain.test.js`
- `test/save-system.test.js`
- `test/v9-visual-customization.test.js` (new)
- `test/v10-world-expansion.test.js` (new)
- `test/v11-cosmetics-aquarium.test.js` (new)
- `PROJECT_HANDOFF.md`
- rebuilt `dist/index.html` and `dist/assets/*`

The working tree also contains the preserved v8 continuation files (`src/fishing/fishing.js`, `src/fishing/rhythm-session.js`, emote/map UI, world/run fixes, and v8 tests). They are intentionally part of the combined update.

## 14. Multiplayer protocol status

- Protocol version remains **v1**.
- Appearance is an additive snapshot field; emote and catch-presentation fields remain additive.
- No rhythm inputs, save data, money, inventory, or per-frame animation are networked.
- Older clients that omit appearance resolve to the safe default. The server rejects/sanitizes unknown cosmetic values rather than trusting client geometry or arbitrary strings.

## 15. Multiplayer server deployment requirement

**Redeploy/restart required.** The hosted multiplayer server must load the updated snapshot sanitizer and room roster code before production clients can reliably receive selected cosmetics on join.

Local verification: all server validation/room tests passed. Port 8787 was already occupied by a Reel Ascent server during final verification; its `/health` endpoint returned HTTP 200 with `{ "ok": true, "rooms": 0 }`. A second bind correctly failed with `EADDRINUSE`, so the existing process was left untouched.

## 16. Frontend build/deployment requirement

**Frontend publish required.** `npm run build` passed and refreshed `dist/` to:

- `dist/assets/index-BPv_EbOy.js`
- `dist/assets/index-DryDfzxZ.css`

The build emitted only the existing PlayCanvas worker-externalization and large-chunk advisories. Publishing this `dist/` is necessary to replace the stale production bundle that previously kept showing blue blobs.

## 17. Verification and manual tests

Completed locally:

- `node --test`: **123/123 passed**.
- Focused fishing/ecology/rhythm verification: **40/40 passed**.
- `npm run build`: passed.
- Vite dev runtime: served HTTP 200 on `127.0.0.1:5174` (5173 was already occupied), then the verification process was stopped.
- Multiplayer health endpoint on port 8787: HTTP 200.
- `git diff --check`: no whitespace errors; only Windows LF→CRLF notices.

Manual visual/gameplay checks still recommended after publishing:

1. Hard-refresh two browsers, host/join, and verify Human is the default and all appearance changes update remotely, including a late join and Blue Blob selection.
2. Reload and export/import progress; confirm the chosen appearance returns and old saves load as Human.
3. Enter the cabin from the beach, test door/steps/roof/furniture collision, wardrobe, grounded bed/chair rest, and trophy changes.
4. Exercise idle/walk/run/jump/climb/mantle/fishing/catch/emotes on both Human and Blob, locally and remotely.
5. Circle the 300–700 ft interval to check the five new dense rock belts, the eight added silhouettes, no floating rocks, and unchanged route collision.
6. Climb several lower-layer pine trunks/branches and confirm visual-only understory never blocks movement.
7. Sit on the summit bench with X, confirm the player faces the tarn, then press F and complete a fishing session from the seat.
8. Check the cabin's real framed window openings, open door, awning, hearth/chimney, rafters, lantern, rug, and sign for clipping.
9. Recheck Escape during ready/cast/bite/rhythm/catch after moving, and rest on partial-foot 500/600/700 ft ledges while confirming no airborne/wall-hang regeneration.
10. Catch a fish, open Inventory, choose Hold in Hand, close/reopen/reload, then put it away, sell it, and send it to Aquarium to verify each transition.
11. Walk to the separate shoreline aquarium pavilion, inspect its glass/frame/deck collision, open it with X, and confirm retained specimens swim in the tank with their saved species, size, and shiny appearance.

The in-app browser automation runtime could not initialize because it failed while writing its kernel assets, so no automated screenshot/interactive WebGL pass is claimed.

## 18. Remaining v9 scope and explicit next phase

- No known automated-test regression remains.
- Final acceptance still needs the manual two-client, cabin, animation, and mountain visual checks above on the published build.
- Small art-direction tuning may be appropriate after seeing the complete mountain on the target display, but routes, physics, and feature scope should remain stable.
- Explicitly deferred to the next phase: **fishing boat, offshore islands, ocean exploration, and additional fishing environments**.
- No commit, push, frontend publication, or Render deployment was performed in this pass.

## 19. v10 world expansion delivered

- A dedicated 300/400/500/600/700 ft density pass requests two irregular, exactly grounded formations at each of 230 open anchors (up to 460 new placements before protected-water/support rejection).
- Eight new convex rock silhouettes were added: Anvil, Tooth, Fin, Bulb, Terrace, Prow, Twist, and Crouch.
- The terrain-owned 500-ft shelf is now 10.6 m wide and 7.2 m deep with a flat core and blended shoulders for reliable mantle/top-out and stamina rest.
- The lowland canopy increased from 34 to 72 candidates, with up to 28 substantial trees receiving solid rough-grip trunks and branch stubs.
- The summit bench now has an X interaction that safely seats and turns the player toward Crooked Peak Tarn; the normal F fishing path works from that position.
- The cabin now has actual window openings and frames plus an open door, porch awning/rails, hearth, fireplace, chimney, rafters, lantern, rug, and exterior sign.

## 20. v11 cosmetics, held specimens, and public aquarium delivered

- Cosmetic catalogs expanded with three shirt colors, two pants colors, three hair colors, Long/Bun/Braids hair geometry, and Fishing Cap/Headlamp/Scarf/Flower Crown/Goggles accessory geometry.
- All new cosmetic IDs use the existing safe customization save format and matching server allowlists; the same geometry groups exist on local and remote human avatars.
- Inventory specimen cards now provide **Hold in Hand / Put Away** beside Sell and Send to Aquarium. The selected exact specimen ID is saved, restored on reload, and cleared safely if that specimen leaves Inventory.
- A shared low-poly specimen display builder uses the saved species palette, measured length, and shiny state for both the held specimen and aquarium residents. Held models bob/tail-wag and hide during fishing, climbing, mantling, sliding, and emotes to avoid pose conflicts.
- A separate shoreline aquarium pavilion now stands near angle 282° / radius 191 m, well away from the cabin. It has a broad solid deck/foundation, steps, framed glass, canopy, water, habitat stones, plants, and an X interaction that opens the Aquarium collection tab.
- Up to 48 exact saved Aquarium specimens are visible in deterministic swimming lanes. Residents refresh on progression save changes, dispose replaced models/materials, face their travel direction, and animate their tails.
- No commit, push, frontend publication, or multiplayer deployment was performed for v11.
