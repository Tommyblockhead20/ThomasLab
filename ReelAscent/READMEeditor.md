# Reel Ascent Map Editor v1

A separate browser-based level editor for **Reel Ascent**. It is designed to be copied directly into the existing Vite/PlayCanvas project rather than run as a second unrelated codebase.

The editor reads the game's current `terrainHeightAt()`, `MOUNTAIN_FISHING_LOCATIONS`, mountain center, summit height, and current fractured-rock form list, then writes a small `map-editor-patch.json`. The game remains the source of truth; the patch is an authored override layer.

## What v1 can edit

- reshape the mountain vertically with an elevation-remap profile
- one-click preset for roughly **+150 ft to the middle plateau while retaining the 1,000 ft summit**
- locally raise/lower terrain with a brush
- cut holes/chunks out of the mountain core (render **and** collision after installing hooks)
- place new climbable rocks using the game's existing rock-form families
- choose rock dimensions, orientation, and climb material
- place/paint simple low-poly vegetation (drag while the Plant tool is active)
- place simple decor: benches, crates, logs, signs, lantern posts
- move and resize existing non-offshore fishing waters
- import a runtime snapshot of the generated world, then hide or move generated rocks by stable ID
- undo/redo
- save/load the patch as JSON
- perspective, top, north-side, and west-side editor views

## The important design choice

**Do not bake edits back into thousands of lines of `mountain-v2.js`.**

The game becomes:

`current Mountain V2 generator + map-editor-patch.json = final authored world`

That makes future code passes much less likely to erase manual level-design work.

---

## Install

### 1. Copy this package into the Reel Ascent project root

After copying/unzipping, you should have:

```text
ReelAscent/
  src/
    world/
      map-editor-runtime.js
      map-editor-patch.json
      mountain-v2.js
      ...
  tools/
    map-editor/
      index.html
      editor.css
      main.js
      patch-format.js
      install-hooks.mjs
  package.json
```

The package intentionally does **not** replace your existing `mountain-v2.js`.

### 2. Install the integration hooks

From the Reel Ascent project root:

```bash
node tools/map-editor/install-hooks.mjs
tools/map-editor/uninstall-hooks.mjs
```

The installer is conservative. It looks for known structural anchors in the current mountain file and stops rather than guessing if the file has changed too much.

Before changing the mountain file it creates:

```text
src/world/mountain-v2.pre-map-editor.js
```

Running the installer a second time is safe; it detects its marker and makes no duplicate edits.

To restore the exact pre-editor mountain file later:

```bash
node tools/map-editor/uninstall-hooks.mjs
```

The uninstaller refuses to overwrite `mountain-v2.js` if the editor marker is no longer present.

### 3. Start Reel Ascent normally

```bash
npm run dev
```

Open the editor at:

```text
http://localhost:5173/tools/map-editor/
```

The editor imports the **live project copy** of `src/world/mountain-v2.js`, so its base terrain/fishing data follows the project rather than a hard-coded old duplicate.

---

# Suggested first workflow for your mountain sketch

1. Open the editor.
2. Click **Raise middle plateau +150 ft**.
3. Switch between **North** and **West** side views and inspect the silhouette.
4. Adjust the profile rows until the red middle section has the height you want.
5. Keep the final `1000 -> 1000` endpoint fixed. Editor v1 locks that row because the summit crown is still authored to exactly 1,000 ft.
6. Use Raise/Lower for local corrections.
7. The ponds/fishing basins follow the remapped terrain instead of needing to be rebuilt individually.
8. Use **Move Water** only where you actually want to move a pond horizontally.
9. The waterfall samples the reshaped terrain, so increasing the vertical span naturally makes it longer. Fine-tune its surroundings with local terrain and rocks.
10. Use **Place Rock** heavily on the newly stretched section below the raised plateau.
11. Drag the **Plant** tool over sparse areas to paint vegetation.
12. Save the patch over `src/world/map-editor-patch.json` (Chrome/Edge can save directly through the file picker; otherwise download it and replace the file manually).
13. Reload the game/editor to see the runtime result.

An example of the +150 ft profile is included as:

```text
example-middle-plateau-plus-150.json
```

The editor also has the same preset built in.

---

# Editing/removing existing generated rocks

Because most Mountain rocks are procedurally generated at runtime, the editor needs a snapshot containing their stable IDs and final transforms.

After the hooks are installed, open the normal Reel Ascent game once. In the browser developer console run:

```js
__REEL_ASCENT_MAP_EDITOR__.downloadSnapshot()
```

This downloads:

```text
reel-ascent-runtime-map-snapshot.json
```

In the editor click **Import Runtime Snapshot** and select that file.

You can then click generated-rock proxies and:

- hide/delete them from the final game patch
- move them
- rotate them

### Existing-rock resizing in v1

The editor shows scale fields for inspection, but the runtime intentionally does **not** rescale an existing generated solid rock's Rapier hull in place. That can produce visual/collision mismatches.

If you want a generated rock to be a different shape/size:

1. hide the old rock
2. place a new editor rock
3. choose its form and dimensions

New editor rocks get a fresh correct collider when the world loads.

---

# Terrain sculpting limits

The mountain core is still fundamentally a polar/height-field-style surface.

**Works well in v1:**

- taller/shorter mountain sections
- broad plateau movement
- local bumps/depressions
- cliffs made steeper or shallower
- holes/openings cut from the core
- covering difficult transitions with authored rocks

**Not a Blender replacement:**

- arbitrary folded geometry
- freeform tunnels with several surfaces occupying the same X/Z location
- complex overhang sculpting from the core mesh

For those, use separate authored geometry/rocks/cave pieces. This matches the game's existing approach.

---

# Patch format

The patch file contains only edits:

```json
{
  "terrain": {
    "profile": [],
    "strokes": [],
    "cuts": []
  },
  "hiddenObjectIds": [],
  "objectOverrides": {},
  "placedObjects": [],
  "fishingOverrides": {}
}
```

### Terrain profile

Maps original elevation to edited elevation in feet. This is what makes a whole plateau move without hand-editing every vertex.

### Strokes

Soft circular raise/lower edits stored in world X/Z coordinates.

### Cuts

Circular X/Z cut regions. The installer adds them to the same `visibleTriangles` path used by the mountain render mesh and Rapier trimesh, so a removed core face is removed physically too.

### Placed objects

Editor-created rocks, plants, and decor. Terrain-anchored objects recompute Y from the final edited terrain at load time.

### Fishing overrides

Angle/radius/radii overrides keyed by the existing stable water ID. The installer makes the patched layout feed basin carving, cave placement, and final fishing descriptors rather than only moving the visible water plane.

---

# Files added by the package

```text
src/world/map-editor-runtime.js
src/world/map-editor-patch.json
tools/map-editor/index.html
tools/map-editor/editor.css
tools/map-editor/main.js
tools/map-editor/patch-format.js
tools/map-editor/install-hooks.mjs
tools/map-editor/uninstall-hooks.mjs
```

The installer modifies only:

```text
src/world/mountain-v2.js
```

and creates the backup noted above.

---

# Validation performed on this package

- `node --check` passes for the editor JavaScript, runtime integration helper, and installer.
- The installer was run against the supplied Sept. 9 `mountain-v2.js` and completed successfully.
- The resulting patched `mountain-v2.js` passes `node --check`.
- The installer is idempotent and refuses unknown/ambiguous source anchors rather than silently editing the wrong code.

I could not run the full Reel Ascent browser build in this isolated package because the complete current repository/node_modules are not part of the artifact. After copying it into the real repository, run:

```bash
npm run build
```

and do the normal visual/climbing smoke test before committing the patch.
