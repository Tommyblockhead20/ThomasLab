# Development and acceptance testing

Run from `TitanicGame/` with Node 24:

```powershell
npm ci
npm run check
npm test
npm run balance
npm run build
```

The automated suite uses its own ephemeral HTTP ports and temporary in-memory rooms. It does not connect to a public server, request a human microphone, record audio, or modify other projects. The WebRTC test uses local UDP ports 40200–40300; allow the test Node process to bind local UDP if your execution environment restricts it.

## Automated scope

`test/v8.test.ts` checks nautical conversion, halved penalty budgets, speed-dependent turning and yaw momentum, progressive turning drag, continuous elevation/optical visibility gains, targeted firing strokes, distinct ash/clinker tools, uneven coal penalties, specialist loads and rate limits, hidden report metadata before decoding, fresh-position replies on held clocks, and private telephone read-backs. The network suite also carries a private message and report over an actual answered Socket.IO telephone connection, then plots the report for the rest of the crew. `tools/handling-audit.ts` checks that reacting to the route warning can recover before recall at 20 and 25 knots on a maintained ship.

`test/v7.test.ts` exercises live default solo warnings/recall, every prepared job and its real completion actions, clean retry, held-clock behavior, multiplayer isolation, separate passenger/crew circulation, aft entrance, safe twin lookout positions, the internal mast route, external landings without duplicate deck plates or coplanar final treads, and one merged slab per machinery turn. The network test also verifies live default warnings and a prepared engine fault over the actual solo protocol. Rendered checks additionally cover the skylight aperture and its grounded dome, plus human-sized bridge fittings.

`test/v6.test.ts` covers all four independent firing stations, fuel/ash work, pressure collapse and engine coast-down while the voyage clock is paused, fire recovery, neglect penalties, stable stopped-camera reconciliation, sealed passenger cabins, full-size boiler geometry, offset stair flights and head clearance through every intersected deck. The existing path search covers the rebuilt officers/wireless rooms, passenger doors and all new station approaches.

`test/liner.test.ts` verifies all five floor areas and both end decks connect through legal walking space; all assignment spawns and stair/ladder exits are safe; timed travel follows shared vertical routes; furniture, boats, davit feet and stair casings stop even large movement steps; Ice ahead gives 60–80 seconds to real contact at cruise; and results before evacuation do not disclose the hidden role or tamper attribution.

`test/cabinet.test.ts` checks the complete generated lock set for solvability and a minimum five-turn solution, neighbor coupling, wraparound, and independent randomized copies. Server tests reject answer payloads, invalid or remote turns, and concurrent dial changes during latch work; they also verify the alternative key route.

`test/crossing.test.ts` checks both uninterrupted outside promenades, shared equipment access and specialist task times, parked-ship schedule warnings/recovery/recall, route warnings and a physically achievable return, both recall inquiries, held-turn hazard prediction with fixed ice afterward, approximate 30/45-second sight calibration, the 10+30-second evacuation window, manual boarding and automatic rescue, continued sinking after an early vote, continuous breakup poses, triangle/UV preservation and isolated solo warning scenarios.

Graphics regressions cover grounded funnel feet, smoke outlet alignment, machinery bounds below the ceiling, collision-only machinery props, and the ocean mesh's increased detail near the ship. Repeated signals also receive new notice versions so transient alerts can appear again.

`test/simulation.test.ts` verifies role scaling and exactly one traveler, private payload boundaries, seeded schedules, bounded movement and wall collision, interaction range checks, sabotage authorization/timing/cooldown, repair and inspection, proximity/room/deck rules, telephone ringing/answer/hangup, actual Morse encoding and hidden plaintext, walking deliveries, binocular acquisition, task cancellation, geometric collisions, survivable low-speed contact, catastrophic flooding, safe early routes, lifeboat votes/ties/timeouts, distinct schedule dismissal, clean replay, host migration and private-pass reconnect.

`test/network.test.ts` opens **four independent real Socket.IO clients** against an actual HTTP server. It creates and joins a private lobby, readies all clients, starts a voyage, checks each private role snapshot, sends real movement intent, verifies action rejection, advances the authoritative simulation into a real collision/sinking, synchronizes the lifeboat, casts votes, verifies the result, disconnects/reconnects a host and restarts without a refresh. Another test verifies concurrent rooms receive snapshots and rejects cross-room actions and forged reconnects. A separate test exercises the direct single-player protocol, quick travel, sinking/vote/restart and rejection of outside clients. Match fixtures advance physical time directly; test controls cannot force an ending in a multiplayer room.

`test/practice.test.ts` verifies one-player role selection, frozen voyage time with active walking/jobs/repairs, repeated paused interactions, optional sabotage testing, legal quick-travel destinations for every station, all four boiler banks, actual ice/flooding/lifeboat/restart behavior, optional crew assistance, ship restoration and strict isolation from multiplayer commands.

`test/graphics.test.ts` checks that paint/wainscot bands do not overlap, windows are single planes without depth writes, the closed nest railing has exactly one post at each joint, hull paint bands meet at their boundaries, the underwater shell tapers continuously and the three propellers begin below the water. It also verifies that launch placement chooses an unobstructed side around nearby ice, without relocating any iceberg. The view is chosen once at boarding and stays fixed. Visual inspection is still required to judge lighting, motion, shadows and graphics performance.

`test/voice.test.ts` negotiates **actual encrypted WebRTC media connections** using Werift peers and the real server relay. It sends encoded Opus-silence RTP and asserts delivery nearby, no packet delivery across decks, no delivery through an unanswered telephone, delivery once answered, revocation on hangup and restored lifeboat communication. This validates transport and server gating, not human microphone intelligibility or browser audio-device behavior.

`npm run balance` runs a maintained-ship controlled evasion at 60, 50, 42, 34, 26 and 18 seconds of warning: hard over to a 15-degree change, counter-rudder, then amidships on return to the original heading. The sample clears at 60/50/42/34/26 seconds and strikes ice at 18; that glancing contact is survivable in this fixture. This is a handling regression aid, not evidence that all seeds, visibility conditions or crew decisions are perfectly balanced.

## V7 manual checks

1. Open Job demos and select Stopped ship. Without changing any settings, check the visible countdown, persistent warning at about 23 seconds, urgency at 60 and recall at 95. Retry with R.
2. Use P to run each prepared job. Test completion, R retry and another-job selection. Frozen bench jobs must say CLOCK HELD; jobs and plant indicators must continue.
3. Walk both outer Boat Deck routes, bridge wings, wheelhouse and chart-room doors. Passenger vestibule side doors must reach the stairs independently of the wireless passage. Inspect the aft entrance, boat groups and ventilators.
4. Inspect the fore and aft exterior stairs from both ends and in transit: no metal plate laid over wood, final tread flicker, unsupported rail, wall crossing or duplicate landing. Descend the complete machinery route and return.
5. At the crow’s nest, verify the mast is behind the two standing positions, the phone is mounted starboard, the bell is hollow and suspended overhead, and the internal ladder joins the rear opening.

## Multiple local clients

For solo testing, choose **Single player** directly from the menu. Use **P** to open test controls. Hold the clock deliberately and verify that voyage time stays fixed while you can walk, use equipment, complete repairs, change assignments and quick travel. Try **Ice ahead**, **Test sinking**, **Late crossing**, **Off route**, **Restore ship** and **Restart voyage**, then refresh the browser and confirm the same session reconnects. Warning scenarios resume simulation; ordinary solo pause intentionally freezes schedule/route pressure. Solo is an explicit testing mode with one human, not an AI substitute for the social deduction match.

Use four separate browser tabs or profiles with distinct crew names. Reconnection credentials are stored per tab, not in shared local storage. Creating a fresh tab manually is preferable to duplicating an existing gameplay tab, since some browsers clone session storage when duplicating.

For protocol/UI iteration without gathering people:

```powershell
npm run dev
```

Create a lobby in the browser, then in a second terminal:

```powershell
npm run test:crew -- --room=ABC123 --count=3 --server=http://localhost:3001
```

Replace `ABC123` with your room code. These are clearly labeled **TEST CREW** using real network connections. They ready up and remain at their posts; they do not speak, operate machinery, simulate human decisions or qualify as a multiplayer human playtest. Press Ctrl+C to disconnect them.

Set `ALLOW_DEV_TOOLS=1` in `.env` to expose the host's shorter encounter checkbox. Set `MATCH_SEED=1234` to reproduce a fresh room's initial event seed. Keep these disabled in production.

## Manual browser acceptance

Use a production build as well as the dev server. Inspect the browser console on a fresh load; development hot reload history can contain errors from an earlier edit that do not describe the final build.

1. Create a room, copy the invite, join from another tab and another computer, and ready at least four players. Check the host cannot start early and that all ten role slots work.
2. Compare private introduction screens. Exactly one player is the time traveler. Inspect ordinary network payloads: no other role, token, encounter time, sabotage attribution or undecoded plaintext should be present.
3. Walk, sprint, look, zoom, navigate cabins and use both travel passages. Check server correction and that walls/bounds prevent walking through the ship. Test pointer-lock fallback in an embedded browser. Try both graphics settings.
4. Use separate people at the telegraph, engines and boilers. Confirm speed follows engine execution and steam production, not just the Captain's order. Verify wheel lag, heading changes, north/south offset and schedule pressure.
5. Find the randomized key or use the three cabinet dials. Take and return binoculars. Scan actual ice and compare basic versus binocular magnification. Disconnect the binocular owner and recover them from the cabinet.
6. Receive a telegram, play its Morse audio, decode manually using the chart and with assistance, pocket it, walk to the bridge and deliver it. Another player at the bridge must see only delivered reports, not unread remote receiver traffic.
7. As the traveler, tamper at a machine while another player watches. Check time, charges and cooldown. Inspect evidence as an innocent player, repair the fault, and confirm the system recovers. An ordinary failure should not label anyone a traveler.
8. Complete one safe voyage and one deliberately mishandled collision. Try slowing for contact, turning with ample warning and turning too late. A safe early lane change should remain valuable. A catastrophic collision must flood, sink and transfer everyone into the boat.
9. Exercise correct majority, incorrect majority, tied and expired lifeboat votes. Verify draw/traveler outcomes, all roles and the inquiry record. Return to the lobby and start another match without reloading.
10. Refresh a player's tab, briefly disconnect Wi-Fi, disconnect the host and reconnect. Confirm identity/role retention, host migration and synchronized station state. Restart the server separately and verify clients can leave the lost room cleanly.

## Manual voice acceptance — required before public release

Use headphones and at least two actual microphones on **two different computers**. For internet testing, put one computer on a separate network, such as a mobile hotspot. Use HTTPS with valid certificates; do not bypass browser certificate warnings.

1. Enable microphone permission in each browser. Hold V and check the input meter and speaking indicator. Release V and switch tabs to verify transmission stops. Deny permission once and check gameplay still works.
2. Start close together: speech should be clear. Walk away: it should attenuate and stop. Move behind cabin walls and listen for attenuation. Put players on separate decks and verify ordinary speech cannot cross.
3. Call nest → bridge. The bridge must hear ringing locally. Before answering, no call speech should cross decks. Answer and speak both directions; stay by both handsets. Walk away or replace a handset and check immediate loss of the call.
4. Repeat bridge ↔ engines and engines ↔ boilers. Place a third listener close to the receiving handset: they should overhear. Place them on another deck: they should not. Check the HUD's audience matches the physical paths.
5. Confirm loud machinery remains quieter than intelligible conversation and the separate voice/ambience sliders work. Check wireless clicks never turn into crew voice.
6. In the lifeboat, everyone should hear everyone, including players who were on different decks. Reconnect a player and re-enable voice if needed. Check microphone selection and echo cancellation in current Chrome, Edge and Firefox.
7. Repeat on the public server with STUN and then with a restricted network requiring TURN. Check firewall/Docker UDP mappings, `PUBLIC_IP`, TURN credentials and `turns:` certificates. A same-computer RTP test does not establish that public NAT traversal works.

Record the seed, crew size, browser versions, host configuration, whether TURN was used, and the exact reproduction steps for any failure. Do not upload microphone recordings or private crew conversation to bug reports.

## Current verification record

V6: production passenger stairs and foyer, sealed cabin corridor, wireless room and stokehold inspected in the browser. Two corridor screenshots taken after movement stopped were byte-for-byte identical, confirming no lingering camera translation in that view. Boiler 2's damper was closed through the actual UI and its fire indication fell independently. The telegraph exposes Stop / 10 / 15 / 20 / 25. The machinery descent was inspected in transit and at its bottom landing; automated geometry checks cover all six flights and deck crossings.

- TypeScript check and production browser/Node builds run locally.
- Four-client network lifecycle and the simulation suite pass.
- Actual local WebRTC RTP routing/revocation test passes.
- Browser menu, private lobby, practice introduction and 3D bridge rendering inspected. Production keyboard movement, the notebook shortcut, station interaction and authoritative wheel operation verified in the browser.
- Dedicated single-player start, paused quick travel, machinery/test tools, deck changes and browser-refresh reconnection verified. Updated lobby/bridge graphics inspected in motion; both graphics modes remain available.
- Expanded ship menu, keyboard HUD, Settings→menu return and current-floor notebook map checked in the browser. New A Deck, forecastle/nest and cased machinery stairs receive first-person visual walkthroughs before packaging.
- Held Escape opens the ship menu once, then a second held press closes it once. Movement resumes without a delayed pointer-lock event reopening the menu.
- The 10-second evacuation order, 40-second rescue and continued visible bow-down sinking and raised stern during the vote were checked in the browser. Persistent late/route warnings and scenario-menu dismissal are also checked before packaging.
- Human microphone quality, public NAT/TURN, long sessions and 6–10-human balance remain manual validation work.

## Ice and camera regressions

`test/encounter.test.ts` verifies seeded scenery and near-miss placement, unchanged distant-ice snapshots across zoom modes, hidden target flags, persistent hull/ice separation, distinct head-on and grazing responses, opaque waterline geometry matching the collision radius, and constant eye-to-deck/ceiling clearance through the complete sinking pose.

For visual acceptance, start a solo Lookout voyage, select Ice ahead, and watch the actual approach without steering. Distant ice should blend gradually into the horizon haze and remain in the world when zoom is released. Rotate the view: fog must not reveal extra ice near the screen edge. At contact, the bow must stay against the surface; observe the spray and braking before flooding develops. From an interior post, verify that the ceiling moves with the camera. At 10 seconds, board a launch using E or wait for automatic rescue at 40. During voting, observe forward flooding, late blackout, breakup, briefly settling stern and final descent. An early vote must not freeze the ship. Repeat from the bridge and nest.

V7 verification: all 83 automated tests pass; typecheck, balance and production build pass. In the browser, the stopped-ship demo displayed a persistent schedule warning from a live zero-delay start. Boiler stoking, ash clearing, damper setting, completion and R retry were exercised through the real UI; Navigation delivered its prepared report. Held Escape opened the menu once and a subsequent press closed it. Both exterior stair ends, the new independent passenger vestibule and A Deck landing, clear outside promenade and forward lookout basket were inspected.

## V8 manual checks

- Fire doors open through the actual UI. Drag coal from the bunker into an open fire, work the slice bar across clinker, and pull the rake through its ashpan. Verify that the heap, clinker and ash visuals change independently, close the doors, and watch pressure recover. The compact workbench must keep steam and draught controls visible together.
- Decode the prepared wireless report; check coordinates, extent, sighting age and the Report chart. Request an updated position and receive another Morse slip. Use the separate ship telephone for voice/text coordination and report read-back; a second real crew member must answer.
- In a live stopped-ship demo, verify the first persistent warning near 23 seconds and recall near 95. In a maintained-ship turn, compare 10/20/25 knots, try counter-rudder and amidships, and recover when the first route warning appears.

V8 delivery verification: TypeScript check and all 92 automated tests passed, including real Socket.IO private telephone/report relay and WebRTC audio routing. Browser-tested targeted coal, slice and ash-rake drags, decoding and report chart workflow.


## V9 checks

`test/v9.test.ts` checks the exact 4–10 watch progression; reduced tending burden; shared chart creation, movement and erasure; physical chart access; malformed/non-finite/oversized payload rejection; no automatic plot on report delivery; heading orders/read-back; bridge partition and fitting collisions; private manual observations; two-desk report concurrency; persistent 2–4 encounter fields; no early victory; actual successful navigation through every seeded obstacle in three complete test voyages; and fault-preserving preventive service. The real Socket.IO report test also checks shared manual chart marks.

Manual review covers chart pointer drawing/moving and explicit report plotting, both work areas, sighting-log shortcut and bearing capture, wireless second desk and the machinery/passenger routes. Corridor and stair tests continue to check reachability, headroom and collision substeps. Bridge/passenger deck surfaces now meet wall and railing bases; roof funnel openings fit their casing footprint. These checks do not replace a full 4–10-person workload/voice playtest.

V9 delivery: TypeScript check, all 104 tests, controlled-evasion balance checks and production build pass. Browser QA verified explicit report plotting, a drawn bearing, moving a mark, Captain heading entry, and L sighting logging with an estimated range and notebook entry. Complete seeded-course audits cleared 12 fields with no contacts using maintained propulsion and controlled steering; these are feasibility checks, not human workload measurements.


## V10 validation

`test/v10.test.ts` checks nonlinear full-power steam demand, increased fuel/ash/clinker turnover, no effect from an unexecuted order, full-power recovery with proper firing, increased propulsion wear and a deterministic marginal natural-fault comparison. It verifies separate recall vs sinking phases, hearing seats, non-evacuated crew, voting/timeout/restart, shared voice paths, solid stair/end-wall geometry, continuous deck-edge landings, supported intermediate landing, absence of duplicated collinear structural faces, and a separate enclosed inquiry room. Network tests take four actual Socket.IO clients through recall and voting; the WebRTC RTP test also checks live media in the company inquiry.

Manual review: all four Boiler basics cards; repeatable guide; forecastle stair connection from both ends and travel over its halfway landing; company room after Late crossing; hearing result remains indoors. The existing full suite totals 113 tests.

V10 delivery: all 113 tests and the controlled-evasion balance check pass. Browser review verified all four guide cards, travel on the rebuilt forecastle flight, recall entering the company room, and the dedicated inquiry preview. The company view explicitly hides the complete ship and both sinking sections so no late render update can expose a funnel inside the room.

## V11 checks

`test/v11.test.ts` verifies separate shell pressure, header coupling and isolation, automatic safety relief, self-closing manual easing, main-valve effect on supply and revolutions, physical tool/load requirements, actual clinker removal, live bridge-order execution, rear-face reach validation, Standard/Experienced lead ranges, and ray targets on all four boilers. `tools/v11-audit.ts` measures real first contact over 20 seeds at 20 and 25 kn and compares speed changes through an identical forward turning distance. Existing firing, collision, voice, campaign and balance tests still apply.

In Boiler crew demo, use E on a door rather than opening a flat panel. Aim at the three tools to select them; fill the shovel at a basket, fire, then close the door. Slice visible clinker until it disappears, and rake the separate ashpan. Adjust the physical air lever with E/Shift E. Compare local gauges, close one boiler's steam stop wheel, and briefly ease its safety valve. Use B for the guide and optional accessible controls. At the engine demo, repair the fault and use Execute bridge order: applied setting changes to 25, revolutions rise before the hull reaches that speed. Verify Stop eventually halts pistons even while the ship coasts.
