# REEL ASCENT WORLD EDITOR V4

## V4 repair / integration pass

V4 fixes the shared editor integration before extending authoring breadth: ESB now opens with the real GLB visible and framed; generic picking resolves visible descendant render bounds to stable source IDs; Basalt automatically uses the cached complete production capture and supports face/edge/vertex hover; Pirate Island starts from an irregular authored mesh; and Geometry Diagnostics exposes explicit z-fighting actions. The Library asset browser is categorized/searchable and includes completed shelf/fireplace assemblies plus a broad furniture/architecture kit.

## V3 mesh, architecture, and water authoring

V3 keeps every V2.3.1 recovery and source-of-truth guarantee while adding context-specific Object, Mesh, Sculpt, Water, and Path modes.

- Basalt's captured `authored-mesh-candidate` is directly selectable by vertex, edge, or face. Topology operations include connected/grow/shrink selection, numeric movement, create/delete/flip faces, boundary fill, weld, merge-nearby, and normal recalculation. Boundary and non-manifold edges have editor-only overlays and validation diagnostics. The candidate stays comparison-only until an explicit future promotion.
- Library Cut Opening replaces one axis-aligned wall/floor/ceiling record with four real authored/collidable fragments. It does not place a masking rectangle. Both production balcony stair heads now use this physical opening pattern.
- The stair generator creates individually editable collision-matched treads from rise/run/width/count, and can extend a generated flight downward by five steps.
- Likely z-fighting validation detects duplicate or near-coplanar thin parallel authored surfaces while excluding ordinary perpendicular floor/wall joins.
- The v3 asset browser adds detailed shelf/fireplace variants, Basalt ledges/arches/columns, and Pirate bridge/scaffold/wreck assemblies as linked prefab definitions.
- Path Mode exposes authored path nodes, add/delete/close/reverse operations, width, flow speed, and loop/corner/intersection validation. The authoritative Athenaeum scene includes one stable ride-only lazy river descriptor; production and editor consume the same path.
- The production lazy river uses stable spline following rather than precision physics. Three circulating tubes can be clicked/interacted with, hold the seated player to the live path anchor, complete the closed loop, and use the ordinary seated dismount path.
- Isolate Selected and Show All provide non-destructive editor-only visibility control.

### V3 manual validation

1. Load Basalt, import the captured production freeze, enter Mesh Mode, select a face/edge/vertex, and move it numerically.
2. Delete a Basalt face, enable boundary edges, fill the resulting closed boundary, recalculate normals, export/reload, and verify the repair remains.
3. Confirm Basalt still says authored candidate and production has not silently switched authority.
4. Load Library Island and walk both balcony stair flights through the new physical slab openings.
5. Select an axis-aligned test slab, use Cut Rectangular Opening, and verify visual and collision geometry share the opening.
6. Generate a stair flight and extend it downward by five treads.
7. Refresh Validation and inspect any z-fighting/topology/water-path result by clicking it.
8. Place each shelf/fireplace variant, enter Edit Source Prefab, and confirm linked instances retain local children.
9. Enter Path Mode, edit the lazy-river loop, reverse flow, export/reload, and confirm width/depth/direction persist.
10. In the game, board each lazy-river tube, ride a complete loop, and dismount with the normal seat interaction.
11. Place the Pirate rope bridge/watch scaffold/wreck bow and Basalt ledge/arch/column assets.
12. Repeat mesh edits and world switching, then load Stoneveil and verify the current authored mountain and recovery fingerprint are unchanged.

Known limitations: v3 is a focused lightweight level editor, not a general CSG package. Cut Opening currently requires an axis-aligned primitive; Basalt has no box-select, extrusion, arbitrary booleans, or transform gizmo yet; object multi-select is not implemented; path nodes are selected in 3D but repositioned through the current target/add-node workflow rather than drag gizmos; waterfall-specific snapping and player-capsule clearance overlays remain future work. Browser visual/walkthrough validation is still required.

## V2.3.1 Stoneveil stability / recovery

Stoneveil startup now treats the checked-in project patch as the baseline and only auto-recovers IndexedDB edits that were created from that exact terrain revision. Large frozen-mesh autosaves no longer use localStorage, mesh-mode Undo is memory-bounded/typed, the main terrain GPU mesh is updated in place, slope overlays are coalesced, and WebGL context restoration preserves in-memory terrain/camera/selection instead of re-running startup source selection. `Recover Browser Autosave` is the explicit escape hatch for older/different recovery branches.


## Safety / Stoneveil source of truth

V2.3 does not modify or package the live `src/world/map-editor-patch.json`. The supplied V1 safety backup remains SHA-256 `ddf597dc9bdf432f5972ecbecc80b7d2639eba8a14a6c9adc6820b0bf7610623` and contains the same 88,959-vertex / 173,535-triangle frozen Stoneveil terrain. Merge this overlay into the existing project; do not replace your live Stoneveil patch with a generated copy.

## Launch

From the REEL ASCENT repository root:

```bash
npm run dev
```

Editor: `http://localhost:5173/tools/map-editor/`

## V2.3 changes

### Skyscraper complete rooms now behave like their source prefabs

A complete Room Library room is still a linked prefab source, but V2.3 closes two fidelity gaps seen after V2.2:

- prefab-definition waters now render with placed linked instances, not only inside **Edit Source Prefab**
- placing a complete room automatically enables **Interior cutaway**, hiding the opaque ESB editor reference so the interior is visible instead of appearing as a handful of facade-obscured rectangles

The room's child objects still come from the exact same definition in both views; cutaway does not rewrite or duplicate room data.

### Every starter room has fishable water data

- **Bathroom:** canonical `skyreach-toilet` water inside the toilet-bank module
- **Restaurant:** aquarium module
- **Penthouse:** jacuzzi/pool module
- **Maintenance / Utility:** shallow electrical-room spill with `electric-eel`
- **Casino:** decorative fountain module

The runtime V2 prefab bridge can now forward these waters to `MountainWorld.addWorldEditorPrefabWater()`, which creates visible water and a bounded `FishingZone` when that authored Skyscraper level JSON is installed in production. Runtime zone IDs are instance-specific while `identity` remains the stable canonical water identity.

### Hollow Skyscraper proxy + improved colors

The previous 13 collision setback volumes filled each floor plate. V2.3 derives thin perimeter-wall boxes from the same setback dimensions, leaving usable interior volume and a real ground-level entrance opening. This remains simplified proxy collision rather than triangle collision.

The direct SonnySee ESB GLB is still the visual source. Editor and runtime remap its material groups to a darker slate/stone facade treatment and warm metallic accents, avoiding the washed-out source emission. The GLB polygons are **not** boolean-cut in this pass; Interior cutaway is an editor aid, and the collision shell is what becomes physically hollow.

### Basalt: actual production mesh capture + candidate sculpting

The normal game now captures the exact Basalt pieces generated by `buildOceanIsland()` and `buildCaveInteriorShell()` into one island-local `triangle-mesh-v1` object. It is cached at:

`reel-ascent:world-editor-v2:basalt-production-freeze`

Workflow:

1. run/open the normal game once after applying V2.3
2. open Cave Fishing Island in the editor
3. click **Load Captured Production Mesh**
4. compare Procedural / Frozen / Both
5. use Raise / Lower / Smooth / Indent / Pull Core on the frozen candidate

This is an arbitrary triangle mesh and keeps disconnected production mesh parts disconnected during brush propagation. It is still **candidate-only**; production stays procedural until a later explicit promotion. Local subdivision/refinement and canonical Basalt water/fishing synchronization are still pending.

### Pirate starter asset library

Pirate Island now has eight reusable linked assemblies:

- Dock Section
- Ship Bow
- Ship Midsection
- Ship Stern
- Mast / Rig
- Treasure Camp
- Palm Cluster
- Reef Rocks

These are starter authored modules, not a finished Pirate Island. Use shared prefab editing, duplication and transforms to compose them.

### Library Island

Library Island stays as the existing V2 reference scene for now. `LIBRARY_ISLAND_BUILD_PROMPT.md` contains a dedicated prompt for a separate focused build centered on a polished Athenaeum with waterfalls, lazy-river/canal water, modular interiors, lighting and fishable waters.

## Production/save notes

- Generic-world browser autosave does not automatically publish level data into the normal game. Export the relevant world JSON and install it under `src/world/world-editor-levels/` before expecting production runtime content.
- Skyscraper prefab water runtime support is wired, but full fishing-roster/ecology behavior should be manually tested in the complete repo after exporting a test Skyscraper level.
- Basalt captured mesh is safe comparison/edit data only. No automatic production switch exists.
- Stoneveil retains its original save/recovery/export path and is not migrated to the generic level format.

## Still pending

- visible ESB facade portals/boolean-cut entrance geometry if required by final routes
- finer ESB proxy collision where actual routes need it
- Basalt local topology refinement/subdivision
- Basalt authored water → canonical production fishing synchronization
- Basalt candidate → validated production promotion
- visual translate/rotate/scale gizmos
- drag/reorder moving-platform waypoints
- Stoneveil player-capsule clearance and grounded-object spatial validation
- finished Pirate terrain/waters/ecology/shipwreck composition
- dedicated Library Island content pass

## V2.3 manual test order

1. Confirm Stoneveil is visually unchanged.
2. Place complete Bathroom and Casino rooms; verify cutaway makes their full geometry match Edit Source Prefab.
3. Toggle Interior cutaway and inspect that it only changes ESB reference visibility.
4. Check all five room water features in both placed-world and source-prefab views.
5. In a disposable Skyscraper export/runtime test, verify fishing-zone creation and Maintenance Electric Eel eligibility.
6. Walk into the Skyreach shell and confirm the old filled-solid collision volume is gone while exterior walls remain blocking.
7. Compare ESB material appearance in editor/runtime.
8. Open normal game once, load captured Basalt mesh, compare Procedural/Frozen/Both, then make and undo a tiny sculpt edit.
9. Place several Pirate modules and verify transform/duplicate/source-prefab behavior.
10. Use `LIBRARY_ISLAND_BUILD_PROMPT.md` for the separate Library build rather than mixing it into this pass.

---

# REEL ASCENT WORLD EDITOR V2.2

## Safety / Stoneveil source of truth

World Editor V2.2 keeps `src/world/map-editor-patch.json` as the production-safe Stoneveil source. It does **not** regenerate Stoneveil, simplify the mesh, or convert it back to the old height-profile architecture.

The safety copy remains:

- `src/world/map-editor-patch.v1-backup.json`

The focused safety test confirms the two files are byte-for-byte identical and the frozen Stoneveil mesh remains **88,959 vertices / 173,535 triangles**.

## Launch

From the REEL ASCENT repository root:

```bash
npm run dev
```

Open:

`http://localhost:5173/tools/map-editor/`


## V2.2 interior-library / fifth-world additions

### Skyscraper Interior Library

The Skyscraper now has a real authored **Interior Library** rather than another procedural platform-pattern button. Five starter interiors are available:

- Bathroom
- Restaurant
- Penthouse
- Maintenance / Utility
- Casino

Each interior can be placed as a **Complete Room** (a linked room prefab with all authored child geometry) or as one of roughly eight to nine **Major Components**. Components are independent linked prefab roots, so they can be positioned/rotated separately and reused. Complete-room source workspaces group their child objects by those same component names in the outliner.

The current starter interiors are deliberately low-poly authored level geometry, not final decorative art. They include the functional spatial composition and representative fixtures/furniture needed to lay out the level. Actual lights, doors/NPC/interactions, high-detail asset meshes and final materials remain later content work.

Room/component material intent is stored as metadata and previewed with differentiated editor materials. The runtime bridge maps those material roles onto existing world materials when an exported Skyscraper level JSON is installed.

### Library Island / Veiled Athenaeum

`Library Island / Veiled Athenaeum` is now a fifth World Editor scene. It has independent V2 state, autosave, generic objects/water/prefabs/rooms, walkthrough and collision inspection. The editor shows the current production island footprint and Athenaeum obscured foundation/silhouette/roofline as a **reference only**. Production is not switched to V2-authored terrain or architecture by this addition.

This foundation exists so future Athenaeum terrain, modular reading/archive rooms, lighting and interaction authoring can use shared editor systems instead of becoming another hard-coded special case.

## V2.1 workflow changes

### UI

- Right inspector/sidebar is wider and drag-resizable; width persists locally.
- Editor sections collapse/expand and remember their state.
- Long help copy is moved into compact `?` tooltips where it is safe to hide.
- The current editor no longer exposes the legacy `Raise middle plateau +150 ft` button.

### Outliner / inspector

The outliner now supports search by name, stable ID and type; remembered group expansion; select/focus; editor-only visibility; rename; and delete where safe. Skyscraper route groups are represented directly in the outliner.

The selected-object inspector exposes only relevant metadata and transforms. Prefab/room roots show their source prefab and provide **Edit Source Prefab**.

### Snapping / placement

Generic worlds support optional:

- grid position snap
- rotation snap
- surface snap

Skyscraper surface placement uses the actual editor representation of the ESB collision proxy, so parkour pieces begin near the clicked facade/setback rather than at a global origin.

### Rooms / prefabs

`New Room` and `New Prefab` create a source definition plus linked root instance. Select the instance and choose **Edit Source Prefab** to enter an isolated local-origin workspace. Objects, platforms and waters placed there are stored as children in local coordinates. **Return to World** restores the editor camera/selection.

Existing linked instances read the same prefab definition, so source edits are reflected by all linked instances on rebuild. This is intentionally not a Blender-style per-instance override system yet.

### Skyscraper

Parkour pieces can be assigned to Route A/B/C/D, Shared / Crossover or Unassigned. This is organizational metadata only. Ctrl+D duplicates authored pieces with a new stable ID.

Moving platforms retain the shared editor/runtime path evaluator. Waypoint handles are visible; numeric waypoint editing/add/delete works. Full free-drag/reorder waypoint UX is still pending.

### Collision inspector

The viewport collision selector supports:

- Normal
- Visual + Collision
- Collision Only
- Selected Collision

Generic scenes show the colliders the walkthrough/runtime representation uses, including the existing **13-volume ESB proxy**. Stoneveil terrain continues using the exact frozen triangle mesh for both authored visual/collision geometry where the current runtime does so.

### Validation / authored-vs-procedural

Validation now has severity filtering, refresh and click-to-focus for addressable issues. Scene Summary shows source-policy chips so authored/procedural/hybrid categories are visible while authoring.

### Basalt migration foundation

Cave Fishing Island can compare **Procedural Reference / Frozen Candidate / Both**. **Import Production Freeze** accepts an exact triangle-mesh JSON as a comparison-only `authored-mesh-candidate`. A world-space freeze must include an origin/worldOrigin so the editor can convert it to the existing island-local authored frame safely.

Importing a candidate does **not** promote it to production. The remaining missing piece is an in-game exact production-geometry capture/export command and the later validated promotion path.

## Save / export

### Stoneveil

- Browser recovery keeps the existing localStorage + IndexedDB path.
- `Save Stoneveil Patch` exports the existing production-compatible patch.
- `Export World V2` wraps the exact legacy patch in the schema-2 compatibility envelope without switching production formats.

### Generic worlds

- Each world autosaves independently.
- Undo/redo state is independent per world in the active editor session.
- `Save World Level` exports the world schema-2 JSON.
- To ship authored generic-world edits, replace the matching project JSON under `src/world/world-editor-levels/` and rebuild normally.

## Still pending

- visual translate/rotate/scale gizmos
- drag/reorder moving-platform waypoints
- Basalt exact production capture/export + promotion
- Basalt authored water → canonical production fishing-zone synchronization
- Stoneveil capsule-clearance diagnostic
- Stoneveil grounded-object spatial validation
- substantial Pirate Island content
- authored Library Island terrain/interior content beyond the current reference scene
- final-art meshes, real light entities and gameplay interactions for the starter interior library

## Manual test order

1. Verify Stoneveil terrain/caves are unchanged.
2. Resize/collapse the sidebars and reload.
3. Search/select/focus/rename/hide authored objects in the outliner.
4. Create/edit a room source, return to Skyscraper, move/rotate/duplicate the room root.
5. Place a complete Bathroom/Casino and one individual component; open Edit Source Prefab and inspect component groups.
6. Place and duplicate ESB parkour pieces with Surface Snap; toggle grid/rotation snapping.
7. Assign route groups and inspect the outliner.
8. Edit/test a moving platform in Walkthrough and return to editing.
9. Inspect all collision modes around the ESB.
10. Import/compare an exact Basalt freeze if available; confirm it remains candidate-only.
11. Recheck Stoneveil slope diagnostic.
