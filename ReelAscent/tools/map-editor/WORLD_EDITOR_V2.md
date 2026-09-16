# REEL ASCENT WORLD EDITOR V2 — milestone 1

## Safety / Stoneveil source of truth

World Editor V2 deliberately keeps `src/world/map-editor-patch.json` as the production-safe Stoneveil source. The V2 work does **not** regenerate Stoneveil and does not convert the baked mesh back to a heightfield.

A byte-for-byte backup is included at:

- `src/world/map-editor-patch.v1-backup.json`

At implementation time both files had SHA-256:

`ddf597dc9bdf432f5972ecbecc80b7d2639eba8a14a6c9adc6820b0bf7610623`

The frozen mesh remained 88,959 vertices / 173,535 triangles with the same 15 fishing overrides.

The old editor entry files are also retained as easy compatibility references:

- `tools/map-editor/main.v1-backup.js`
- `tools/map-editor/index.v1-backup.html`
- `tools/map-editor/editor.v1-backup.css`

## Architecture

The editor now has two compatibility layers behind one shell:

- **Stoneveil adapter:** reuses the existing mature map-editor patch, true triangle-mesh sculpting, water tools, object tools, IndexedDB recovery, and Rapier walkthrough.
- **World Editor V2 generic adapter:** schema-2 world levels for Basalt Hollow, Skyscraper, and Pirate Island.

Shared modules:

- `tools/map-editor/world-registry.js` — world IDs, data paths, and per-world capabilities.
- `tools/map-editor/world-level-format.js` — schema helpers, stable IDs, V2 export, Stoneveil compatibility wrapping.
- `tools/map-editor/generic-scene.js` — generic scene/reference renderer, selection, collision view, parkour/platform preview, prefab/room roots.
- `tools/map-editor/slope-overlay.js` — Stoneveil triangle slope diagnostic using `PLAYER_CONFIG` thresholds.
- `tools/map-editor/validation.js` — nonfatal structural validation.
- `src/world/world-editor-v2-runtime.js` — production-side V2 normalization, static authored object loading, moving-platform behavior, and prefab/room root instancing.

World data:

- `src/world/world-editor-levels/cave-fishing-island.json`
- `src/world/world-editor-levels/skyscraper.json`
- `src/world/world-editor-levels/pirate-island.json`

`src/world/mountain-v2.js` now loads V2 authored object/platform data for Skyreach and Basalt Hollow. The current ESB visual model and its existing collision proxy remain the architecture reference; V2 adds authored traversal around it rather than replacing it.

## Schema 2 concepts

A V2 level contains stable world identity plus authored categories:

- `worldId`, `runtimeLocationId`, `schema`, `kind`
- `sourcePolicy` for authored/procedural/hybrid ownership
- `terrain`
- `waters`
- `objects`
- `movingPlatforms`
- `prefabs.definitions`
- `prefabs.instances`
- `rooms`
- `metadata`

Prefab definitions store child objects in local coordinates. Instances and rooms have a root transform. Production instancing uses the root transform, so moving/rotating a room root moves its contents together. The first milestone supports static/moving geometry children in the production bridge; prefab-contained water/interactable runtime spawning is intentionally left for a later pass, while the schema already preserves those categories.

## Launch

From the normal REEL ASCENT project root:

```bash
npm run dev
```

Then open:

`http://localhost:5173/tools/map-editor/`

The same editor URL is now the World Editor V2 shell. Use the WORLD / SCENE selector in the top bar.

## Save / export behavior

### Stoneveil

- Browser autosave keeps the existing localStorage + large IndexedDB recovery path.
- A fresh browser with no local autosave loads the checked-in `src/world/map-editor-patch.json` instead of an empty map.
- **Save Stoneveil Patch** downloads/saves the legacy production-compatible patch.
- **Export World V2** creates a schema-2 compatibility envelope containing the exact legacy Stoneveil patch. It does not switch production away from the legacy patch.

### Generic V2 worlds

- Each world has its own localStorage autosave and independent in-memory undo/redo history.
- **Save World Level** writes/downloads that world's schema-2 JSON.
- To make Skyreach/Basalt authored object changes part of a project build, save the file back to its matching path under `src/world/world-editor-levels/`.

## What is intentionally conservative in milestone 1

- Basalt Hollow terrain is displayed as a **procedural reference**, not falsely converted into an approximate authored production mesh. Authored objects/platforms have a production bridge now; exact terrain/cave baking can be added later.
- Basalt water has stable editor identity and editable dimensions/position, but the legacy fishing-water descriptor is not yet driven from the V2 water record. Do not treat a moved Basalt editor water as production-final until that bridge is added.
- Pirate Island is a minimal editable placeholder scene and does not yet have a production destination/location entry.
- Transform editing is numeric in this pass; visual translate/rotate/scale gizmos are next-pass work.
- Prefab/room root architecture is active, but a dedicated isolated prefab-authoring workspace and child-parenting UI are not implemented yet.
- Cave capsule-clearance analysis is not implemented yet.

## Immediate manual test order

1. Open Stoneveil in a fresh browser profile and verify the authored mountain appears without clicking Reload Project Data.
2. Compare a few distinctive hand-sculpted cave/overhang areas against the current production build.
3. Toggle Slope diagnostic and confirm the 46° / 50° / 55° classification looks sensible; slide-exit hysteresis is 45°.
4. Toggle Collision on Stoneveil and verify the same frozen terrain surface is shown as collision geometry.
5. Sculpt one tiny Stoneveil test change, undo it, reload, and confirm recovery/save behavior.
6. Switch to Basalt Hollow, move the water or place a test object, switch away/back, and confirm Stoneveil is unchanged.
7. Switch to Skyscraper, click/select the ESB, place a static platform against a collision setback, and edit its transform.
8. Place a moving platform, change its second waypoint/speed/pause/mode, then enter Walkthrough and test it.
9. Toggle Skyscraper collision debug and compare the 13-volume proxy to the visual ESB.
10. Create an Empty Room Module, move/rotate its root, duplicate it, and confirm the instances remain separate roots referencing prefab definitions.
11. Open Pirate Island and verify it has an independent empty scene/autosave.
