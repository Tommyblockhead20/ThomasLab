# Third-party assets

## Empire State Building low-poly model

- Author: SonnySee
- License: [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)
- Original source: [Blend Swap model 72556](https://blendswap.com/blend/72556)
- Supplied source: `third_party/empire-state-building/empire-state-building.blend`
- Runtime conversion: `public/assets/models/empire-state-building.glb`
- Supplied license copy: `third_party/empire-state-building/LICENSE.html`

The runtime GLB was exported from the supplied `.blend` with Blender 2.83 in
headless mode, selecting only the complete `ESB` object. Its original object
transform is baked before export, then its full mesh bounds are normalized to a
centered footprint and base at zero without simplifying the source geometry.
Reel Ascent uses the model as the visual shell; a hidden stepped Rapier hull
provides solid non-climbable collision.
