# Third-party assets

## Empire State Building low-poly model

- Author: SonnySee
- License: [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)
- Original source: [Blend Swap model 72556](https://blendswap.com/blend/72556)
- Supplied source: `third_party/empire-state-building/empire-state-building.blend`
- Supplied direct GLB archive: `third_party/empire-state-building/empire-state-building-direct.glb`
- Runtime direct GLB: `public/assets/models/empire-state-building.glb`
- Supplied license copy: `third_party/empire-state-building/LICENSE.html`

The v17.5 runtime file is the user's direct export from the original supplied
`.blend`, preserved byte-for-byte. It retains the authored `ESB` node transform,
7,546 building vertices, repeated facade/window geometry, and distinct `windows`
and `light` materials. The direct file also contains an unrelated 60×60 Blender
preview plane; the loader disables only that node and renders the `ESB` hierarchy
unchanged. Runtime AABB alignment keeps it centered and grounded, while a hidden
stepped Rapier hull provides solid non-climbable collision. The export script now
writes a separate normalized fallback and cannot overwrite the authoritative
direct runtime asset.
