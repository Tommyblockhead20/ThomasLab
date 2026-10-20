# ThomasLab visual review — October 20, 2026

Reviewed the opening interfaces of all 17 landing-page projects at desktop and 390 px phone widths, including the live external Bike Friendliness Index. Also inspected Tides' demo campaign. This is a visual and layout review, not a complete gameplay or functionality audit. Rankings reflect the benefit of a redesign, including mobile usability, rather than the value of the underlying project.

The first five redesigns below are now implemented following approval. Changes add interface features, improve layouts and feedback, and preserve the existing content and data. No county facts, ancestor biographies, or other descriptive content was added. Remaining design directions are suggestions.

## Original redesign priority

| Priority | Project | What needs attention | Recommended direction |
| --- | --- | --- | --- |
| 1 | Rank Things | Mixed purple, teal, orange, green, and rainbow controls compete. Filters dominate the first phone screen and have their own horizontal scrollbar. Ranking starts far below them. | A clean ranking workspace: compact list/view tabs, a collapsible filter drawer, better item cards, clear drop targets, and an always-visible staging area. Keep the familiar tier colors. |
| 2 | Places I Have Been | Plain browser-like controls and a technical subtitle make a personal project feel like a geometry demo. On phones, the map occupies the top of a much taller blank panel. | A personal travel atlas with a better fitted map, a collapsible color legend, clearer zoom controls, and gentle zoom feedback. |
| 3 | Custom State Generator | Native blue sliders and many checkboxes look unfinished beside the vivid map. The desktop inspector reserves a lot of space before a county is selected. | A polished map workbench with grouped rules, consistent sliders, overlay chips, a compact inspector, and a prominent generate action. On phones, put adjustable rules in a drawer so the map stays central. |
| 4 | Train Clicker | The canvas and oversized bank counter feel like an early prototype. The phone version scales labels and buttons down to tiny sizes and leaves large dark margins. | A miniature railway tabletop: a responsive map, readable HTML controls outside the canvas, a ticket-style bank counter, route purchase cards, and a satisfying track-drawing/train departure animation. Preserve the simple map charm. |
| 5 | Journey of My Ancestors | The map has little framing, and the playback bar exposes debugging-style active/drawn/screen counts. The phone map and timeline use only the upper part of the screen. | A family-history timeline with a prominent year, a map fitted to available height, and clearer playback, zoom, and camera controls. Keep chronological playback and the existing genealogy data. |
| 6 | House Rater | Large nested form boxes, repeated instructions, and a long setup flow feel administrative. Mobile users spend a long time above the results. | A three-stage flow: paste listing, confirm facts, review scores. Use clearer score cards, more compact fields, and restrained count-up/save feedback. Preserve all scoring rules and saved houses. |
| 7 | Bike Friendliness Index | Large blue containers, many competing control styles, and a crowded phone layout obscure a strong data project. | A coherent dashboard with one accent color, separate filter and display controls, improved map framing, and a phone filter drawer. This is a separate website and has not been modified here. |
| 8 | Intersection Lab | The simulations are immediately understandable, but the control area is dense and the stats could tell a clearer story. Laptop controls overlapped before the small fix below. | Keep the three-view comparison; simplify its toolbar, emphasize the winning metrics, and animate changed settings and result highlights. |
| 9 | Game Picker | The desktop cards are cohesive, but the type is heavy and the phone layout puts joining a room and a large filter stack before recommendations. | Compact filters, clearer title/metadata hierarchy, optional room joining, and smooth recommendation reordering. |
| 10 | Find Your Place | Consistent dark theme, but the amount of setup and the low-contrast initial map make it hard to see the payoff. The phone layout puts the map above the project title. | A clearer starting state, stronger map contrast, concise criterion groups, and a selected-county detail card. Keep the map visually anchored while adjusting weights. |
| 11 | Bass Camp | The low-poly world has a recognizable style. Menus and transitions can be more refined, but startup speed is the immediate problem. | Keep the world style. Improve pause/menu transitions, inventory selection feedback, fishing rewards, and the loading experience after reducing actual work. |
| 12 | Nose First | The warm paper menus and raised buttons already fit the game. The start screen is instruction-heavy, especially on phones. | A shorter start panel with expandable controls, a paw-shaped sniff pulse, journal transitions, and clearer discoveries. Keep keyboard/mouse requirements clear if touch play is not supported. |
| 13 | Challenge Drawer | The pastel category tiles are appealing. The phone settings stack delays getting to the categories. | Make settings collapsible, give drawing a card a short reveal animation, and make completed cards visibly tuck away. |
| 14 | Thomas Intelligence | Already clean and consistent with its chat-app parody. The phone header is cramped. | Improve header spacing and add amusing, varied thinking/send feedback that fits the joke. A full reskin would add little. |
| 15 | Scenic Adventures | One of the strongest interfaces: coherent colors, good typography, and a fitting illustration. | Refine category scrolling, card reveals, and the completion check. Tiny clouds/sun movement could work if very restrained. |
| 16 | Tides: A Pirate Legacy | Strong typography, colors, and campaign framing. On phones, ship statistics come before the current decision and take considerable space. | Keep its nautical identity. Collapse secondary ship/crew details on phones and add subtle chart, selection, and chapter transitions. |
| 17 | My Cookbook | The book, paper, bookmark, and typography form the most complete visual identity. The phone cover is long and the Home control stretches unusually wide. | Refine the phone cover/navigation, ingredient checks, serving changes, and a light page-turn transition. Preserve the book aesthetic. |

## Best interaction additions

1. **Buttons with physical feedback:** a small press and shadow change, with equally clear keyboard focus. Use each project's colors and shapes.
2. **Visible consequences:** a checked recipe ingredient, a card settling into a tier, or a newly drawn rail line. These make interactions feel better without adding constant movement.
3. **A few thematic moments:** a challenge card reveal, a recipe page turn, a train departure, a paw sniff, and a map pin landing. Avoid making all projects share the same animation.
4. **Navigation continuity:** short menu open/close transitions and preserved list/map positions when returning from a detail view.
5. **Quiet success feedback:** brief saved/completed states and small achievement celebrations. Avoid flashing or repeated confetti for routine actions.

Keep most feedback around 120–220 ms, use transforms/opacity where practical, and respect reduced-motion settings. Do not add continuous decoration inside the running simulations or Bass Camp's game loop. Roll out one project at a time and check both phone and desktop layouts before extending the pattern.

## Bass Camp performance changes completed

- Reduced terrain-query buckets from 8 to 2 world units so rock grounding checks fewer irrelevant triangles.
- Reused terrain heights while adjusting each rock vertically, instead of querying the same positions repeatedly.
- Cached each placed rock's bounding radius and skipped distant overlap candidates before calculating their full distance.
- Built inactive offshore scenery in its final disabled state, avoiding registration and removal of thousands of render components. This also removed a 1.8–1.9 second island-deactivation delay seen in some intermediate repeat loads.
- Deferred detailed map contour sampling and map SVG construction until a map is first needed. Navigation metadata remains immediately available; contour results are cached and match the eager calculation.
- Rebuilt the production files in `BassCamp/`. Temporary comparison logging was removed.

The local 1280 px checks reached their first interactive frame in **6.32–6.88 seconds before**. After rock optimizations, two desktop starts were **4.84 and 4.93 seconds**; the 390 px check was **5.36 seconds**. After deferred map construction, the final desktop samples were **4.43 and 4.73 seconds**. These measure initialization from game module evaluation with local asset delivery, excluding cold internet downloads and module parsing. They are not a promise about another computer.

For the rock optimizations, all **5,796 solid rock placements** produced the same comparison fingerprint before and after, including identifiers, positions, support/contact results, exposure, and rejected-rock names. A regression check compared 20,000 authored terrain queries between the old and new bucket sizes. Another check verifies that inactive island children stay inactive during construction and activate when selecting that destination. Eleven relevant tests passed, and the production build succeeded.

Further substantial gains likely require generating the deterministic rock placement data during the build or reducing the initial world and map payload. Those need separate measurement and testing; they have not been implemented. The browser still downloads a roughly 6.4 MB compressed terrain file and the game/engine code on a first visit.

## Five completed interface updates

- **Rank Things:** a calmer ranking workspace with compact list/view controls, scrollable staging, collapsible filters and management controls, clearer drop feedback, and a keyboard-accessible move dialog. Numeric 2D placement and Undo use the existing ranking logic. Wikipedia thumbnail requests are cached, limited to six concurrent requests, and deferred for offscreen items.
- **Places I Have Been:** cream/sage atlas framing, a collapsible map key, a compact information disclosure, a properly fitted phone map, zoom level readout, keyboard navigation, bounded tooltips, and gentle button zoom transitions. All 3,143 county paths and saved markings remain intact.
- **Custom State Generator:** dark teal map workspace, grouped optimization weights, consistent sliders and overlay controls, collapsible desktop panels, and exclusive phone Rules/Results drawers with focus management and Escape support. Existing generation algorithms, embedded data, and county inspector content remain intact.
- **Train Clicker:** readable HTML bank, purchase, upgrade, and pause controls around the original canvas artwork; phone map zoom/pan; a route selector that uses the same purchase logic as canvas selection; brief track drawing feedback; and explicit save/load feedback. Saving reports unavailable/full browser storage. Loading validates the entire save before committing it, so malformed city, route, or upgrade records cannot partially replace the current game. Route pricing and the save key are unchanged. The interface now explicitly points to manual saving in the Pause menu.
- **Journey of My Ancestors:** a responsive map that fills available height, clearer year/timeline/playback controls, visible zoom/follow/restart controls, and reduced redundant painting while paused. The geographic projection, genealogy data, playback rules, and achievement trigger are preserved.

Each project retains its own visual identity. Button feedback uses short transitions and honors reduced-motion preferences.

## Bass Camp fishing fixes

- The approved rule is **Trophy Sentinel: no Common fish; Selective Drift: fewer Common fish**. Equipment descriptions, live guide odds, and actual catch selection agree.
- Retained catch selection excludes zero-weight entries even when the random source returns exactly zero. This prevents a rejected first entry from leaking through a boundary roll.
- Sentinel checks the actual weighted eligible pool before casting, including ecology exclusions. Common-only water declines the cast with existing refusal feedback.
- Empty or unavailable pools reset every bobber safely instead of entering a bite with no creature.
- Existing wait ranges and all other lure/gear effects remain unchanged.

## Verification and limits

- **59 focused Bass Camp tests passed**, covering fishing, saves, the live bobber selection/guide path, all current rarity profiles and chance-changing lures, zero/boundary rolls, empty pools, terrain buckets, inactive island construction, and deferred maps.
- The production build succeeded. The rebuilt game started in the local browser without console errors. Paper and GPS maps were exercised with the actual map UI: five contour bands rendered, GPS showed the player marker, and construction did not read contours before opening.
- The broader current core suite has **396 tests: 320 passed and 76 failed**. An isolated checkout of the committed source had **387 tests: 310 passed and 77 failed**. Comparing failure names found **no newly failing checks**. Many existing failures assert old version numbers, old map fingerprints, or superseded UI/save contracts; they were not blindly rewritten or used to change current gameplay. This is not an all-green suite or a complete gameplay certification.
- Checked all five interfaces at desktop and 390 px phone widths. Ranking checks covered all four lists, tier movement, numeric 2D placement, keyboard movement, Undo, and Analysis. Train checks covered route purchase, upgrade, save/load, pricing, zoom, and Fit map. The state generator completed a 50-state Quick optimization and exposed the results through its phone drawer. Atlas zoom/reset and ancestry playback/pause/zoom/follow/restart were exercised.
- **Four Train Clicker save regression tests passed**, using the actual save/load functions and constructors. They cover ordinary round trips, ten malformed save cases (including failure after a valid first route), blocked/full storage, absent saves, and upgrade bounds.
- All 19 inline scripts across 18 static entry pages passed syntax checks, as did the three new interface scripts. Local linked script/style/image references were checked for missing files. These checks do not exercise every gameplay interaction or external service.
- Large embedded data blocks in the five redesigned projects match their pre-edit copies. No personal content was authored or replaced.

## Reverting a design

The five original HTML files were copied before editing to `%TEMP%/ThomasLab-ui-before-20261019/`, using the project name as the filename. Their new styling and supplementary interface code live in each project's `polish.css` and, where applicable, `polish.js`. Restore only the specific project's HTML backup to revert its complete interface update. Preserve unrelated working changes; do not reset the whole repository. Bass Camp source and generated assets should be reverted together as a separate change.

## Clear display bugs fixed

- **Intersection Lab:** reserve the actual width needed by the left controls, then stack control groups before they collide. Checked at 390, 1280, and 1500 px; no desktop group overlap.
- **House Rater:** dim pending score indicators rather than the entire sticky bar. The bar now retains its background and readable labels instead of showing unrelated text through it.

All changes remain local and uncommitted. Nothing has been published by this review.
