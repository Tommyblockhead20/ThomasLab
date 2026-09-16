# REEL ASCENT WORLD EDITOR V2.1

## Safety / Stoneveil source of truth

World Editor V2.1 keeps `src/world/map-editor-patch.json` as the production-safe Stoneveil source. It does **not** regenerate Stoneveil, simplify the mesh, or convert it back to the old height-profile architecture.

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

`Test Room` creates a small floor/walls/prop fixture that proves the workflow quickly.

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

## Manual test order

1. Verify Stoneveil terrain/caves are unchanged.
2. Resize/collapse the sidebars and reload.
3. Search/select/focus/rename/hide authored objects in the outliner.
4. Create/edit a room source, return to Skyscraper, move/rotate/duplicate the room root.
5. Try Test Room.
6. Place and duplicate ESB parkour pieces with Surface Snap; toggle grid/rotation snapping.
7. Assign route groups and inspect the outliner.
8. Edit/test a moving platform in Walkthrough and return to editing.
9. Inspect all collision modes around the ESB.
10. Import/compare an exact Basalt freeze if available; confirm it remains candidate-only.
11. Recheck Stoneveil slope diagnostic.
