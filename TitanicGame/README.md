# Titanic: Altered History — v11

Take your watch aboard Titanic. Crew the bridge, tend the machinery and keep a lookout on the North Atlantic. Play with **4–10 friends**, or explore alone in Single player.

## Downloaded ZIP

Extract the whole ZIP, keeping TitanicGame and Titanic next to each other. Install Node.js **24 LTS**, then double-click **Start-Windows.cmd**. Open **http://localhost:3001/Titanic/**. The first launch installs dependencies; keep its terminal open while playing.

The download includes the built browser client and Node server. It does not need a build to play. On macOS/Linux:

```sh
cd TitanicGame
npm ci --omit=dev
npm start
```

## From source

```powershell
cd TitanicGame
npm ci
npm run dev
```

Development preview: **http://localhost:5174/**. The game server runs on **3001**. For a production preview, run `npm run build` then `npm start` and use **http://localhost:3001/Titanic/**.

Choose **Host multiplayer**, share the room invitation, and have everyone mark ready. The host can cast off with four connected crew. Enable microphones in the lobby or ship menu.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift | Walk / sprint |
| Mouse | Look |
| E | Use equipment or take stairs/ladders |
| Right mouse | Magnify; binoculars give a closer view |
| V held | Talk |
| Tab | Notebook and current-deck plan |
| Esc | Ship menu: resume, notebook, controls, settings, microphone, leave |
| X | Cancel the current task |
| P, solo | Job demos and test controls |
| R, demo | Retry the current prepared job |

Mouse look releases whenever a menu opens. If an embedded browser denies pointer lock, drag to look or use Left/Right arrows to turn. Desktop keyboard and mouse are required.

## Exploring the ship

The forward **bridge** has adjoining Captain and Officer work areas, separated by a glazed partition and a wide doorway. The Captain has the engine telegraph, order desk, heading board, main telephone and direct bridge-wing exit toward the foremast stairs. The Officer has the wheel, compass and navigation chart, with an internal crew-passage door toward wireless. Both rooms have forward windows. Outside promenades pass the officers’ cabins and both lifeboat groups. Wireless and apparatus rooms connect to the crew passage behind the first funnel. A solid bulkhead separates them from the first-class vestibule, which has its own side entrances and skylit stair. An aft passenger entrance and grounded ventilator housings give the after deck a purpose. The forecastle companionway stays outside the bridge. Its foremast has an internal ladder, a forward semicircular two-person lookout basket, hanging bell and starboard telephone. Boats rest on chocks under paired davits and rope falls.

Both passenger entrances lead to **A Deck**, with a proper reception landing, a forward corridor of closed cabin doors, reading lounge, compact dining saloon and outer promenade. Cabins are scenery; their doors remain closed. The saloon combines facilities from different decks to keep the explorable ship compact. A continuous enclosed machinery stair tower has six flights in two separate lanes, intermediate landings and openings through every intersected deck. It reaches a service alley between the forward stokehold and aft engines. Signs and the notebook’s deck-specific plan show the routes.

The stokehold represents **four double-ended boilers abreast**, based on No. 6 boiler room. Each boiler has three simulated firebeds, mirrored at its two firing ends. Aim at the physical rack to take a tool, fill the shovel at the basket, open a fire door and place the load on a thin fire. Work the slice bar through clinker and rake the ashpan; the two obstructions need different tools. Close doors to restore draught. Uneven or thick heaps, obstructed grates and open doors reduce combustion, while steam responds gradually to firing and engine demand. Boiler specialists place larger loads and work faster; other crew can cover the job. The physical arrangement uses the [official boiler inventory](https://www.titanicinquiry.org/BOTInq/BOTReport/botRepWC.php) and [1911 machinery illustrations](https://www.ggarchives.com/OT/Titanic/25-ImageLibrary/TheShipbuilder-04-PropellingMachinery.html). The interactive firing principles are informed by [contemporary naval practice](https://www.usni.org/magazines/proceedings/1919/april/winning-engineering-white-e) and compressed for the game.

The modeled hull is about 804 ft long and 92 ft wide, with the Boat Deck 60 ft above water and A Deck 9.5 ft below it. This is a simplified layout, using the inquiry’s [deck descriptions](https://www.titanicinquiry.org/BOTInq/BOTReport/botRepTitanic.php), [accommodation plan](https://www.titanicinquiry.org/BOTInq/BOTReport/botRepAccomo.php), and [lifeboat fittings](https://www.titanicinquiry.org/BOTInq/BOTReport/BOTRepBoats.php) as references.

Cruising speed is **20 knots**, with **25 knots** available to recover lost time. Any crew member can cover another department. Specialists finish work faster: an Engineer repairs a fault in 9 seconds; other assignments take 30. Boiler tending, inspections and assisted wireless decoding also favor their trained assignments.

Navigation distances use **nautical miles (NM)**; speeds use knots and headings degrees. Schedule warnings begin at **22.5 seconds** behind (displayed as 23), become urgent at **60**, and recall the crossing at **95**. Route caution begins around **0.08 NM** off track. Outside **0.12 NM**, the crew has **90 seconds** to return; reaching about **0.24 NM** causes immediate recall. These allowances are half the v7 values. Extra speed can recover schedule delay. Deliberately holding the solo voyage clock freezes navigation penalties.

Speed and steering are coupled: actual forward speed governs rudder authority, heading builds through a delayed yaw rate, and turning progressively reduces speed. Bringing the wheel amidships leaves turning momentum to settle. Slowing also slows the turn per second; it does not grant a tiny turning circle. This is a game model with a 1.5× passage-rate scale, informed by [Wilding's trial evidence](https://www.titanicinquiry.org/BOTInq/BOTInq27Wilding01.php), rather than a reconstruction of the full ship's hydrodynamics.

## Watch assignments and plotting

| Crew | Added watch |
| --- | --- |
| 4 | Captain, Deck Officer, Engineer, Boiler Operator |
| 5 | Wireless Operator |
| 6 | Lookout |
| 7 | Second Boiler Operator |
| 8 | Helmsman |
| 9 | Second Engineer |
| 10 | Second Wireless Operator |

The Captain chooses speed and heading orders, watches schedule and coordinates the departments. At four crew they cover wireless; until six, they cover the bridge lookout. The Officer plots evidence, recommends passages and steers until a Helmsman joins. Orders appear on the Captain's physical heading board and at the wheel, where they can be read back. Every station remains usable by any crewmate.

Below seven crew, coal consumption and ash/clinker accumulation run at 65% of normal; bad firing still reduces steam. With two operators, each primarily tends two banks. Engineers can service equipment below 94% condition (12 seconds, versus 35 for untrained crew), restoring condition without removing a fault. Repair is still required for faults. Two wireless desks support simultaneous work on different slips and record who transcribed them; the same slip cannot be assisted by two operators at once. Four-player wireless traffic is less frequent.

The working chart defaults to **4.17 NM wide**, the distance covered in ten minutes at 25 knots, with equal nautical-mile spacing on both axes. Zoom and pan, find the ship, click an ice estimate, or drag an uncertain area, bearing or course line. Labels, sources, confidence and watch time remain attached to shared marks. Select a mark to move or erase it. Grid coordinates are NM west/north of the fictional departure datum; latitude/longitude are displayed for the cursor. Filing a report makes it available at the chart; **Plot reported area** is a deliberate crew action, not automatic truth. No real ice positions are drawn automatically.

At the crow's nest, **L** opens the sighting log without turning away. Record a bearing, estimate a range (zero means unknown), compare successive observations and read them to the bridge by telephone. Observations stay in the lookout's own notebook until communicated. The chart supports plotting those bearings alongside older wireless areas.

Each normal crossing contains **two to four persistent encounters**, interspersed with fixed nearby and distant ice. They are all seeded at departure, separated by roughly 85–110 seconds of cruising distance. The first threatens the projected course; later ones occupy varied offsets near the route. They never chase a turn or replace a hazard successfully avoided. Both passing sides are physical choices: off-track ice can constrain a detour. Clearing only the first does not win. After every encounter is astern, hold a safe course for 35 seconds to finish, provided serious flooding has not taken over. There is no remaining-ice counter.

## V10 improvements

The forecastle stairs now meet the actual Boat Deck edge against a closed end bulkhead, with a supported halfway landing and mounting plates. The aft flight also meets its deck edge. Invalid edge-touching floor holes and full-height slots have been removed. Collinear bulkhead runs are merged before rendering, and deck-edge trim is below the plank surface rather than coplanar with it.

Press **B** in the stokehold for the short firing guide. Doors, three tools, coal baskets, air levers, local gauges, steam stop wheels and safety easing handles are physical model interactions. The optional accessible firing bench is inside that guide. Each fire has visible fuel, clinker and ash; cleared clinker disappears rather than retaining one lump for a trace of accumulation.

An executed **25-knot** engine setting consumes coal and produces ash/clinker **22% faster at the same heat**, compared with 20 knots. Its nonlinear steam demand is about 1.7 times the 20-knot demand; firing must respond. Propulsion/valve wear is higher under full power and the natural fault check gains six percentage points above 21 knots, in addition to existing condition effects. Merely issuing a bridge order does not change firing demand until engineering executes it. This is compressed game balance, not a thermodynamic reconstruction.

Schedule or route failure now moves everyone to a **company inquiry room**, with suspended crew, shared voice and the accusation vote. Nobody evacuates, and the room remains behind the result. Solo players can preview it immediately with **P → Test inquiry**. Only a sinking leads to lifeboats, with the ship continuing to sink behind that vote.

## V11 machinery and encounter changes

Each of the four boiler shells stores its own pressure. Open steam stop valves couple the shells through the common engine header; shutting one isolates it while its fire continues burning. Its own dial reads local pressure, while the engine-room gauge reads the common supply and can develop a reading fault. The main steam valve controls delivery to the engines. Healthy valves and gauges have ordinary uses as well as maintenance actions; maintenance controls are expanded by default.

Target **190–215 psi**. Draught means combustion airflow. For high pressure, reduce air and stop adding coal; the fire and pressure cool gradually. The safety valve automatically lifts at about 226 psi and reseats below 218. Pulling an easing handle releases steam for two seconds, then closes automatically. Steam escaping has a visible plume and a hiss. Closing a steam stop valve does not reduce firing and can raise the isolated shell's pressure. These thresholds, simplified easing linkage and compressed response times are game abstractions, not a reconstruction of every Titanic boiler fitting. Feedwater, individual furnace ends and compound-engine expansion are not simulated in full.

**E** uses the part under the crosshair (a left click also works with captured mouse look). Take a shovel, slice bar or rake from the physical rack. Shovelling consumes a fresh basket load each time; aim into an open fire. Hold E to work a slice bar on clinker or an ash rake through a pan. Aim at the draught lever: E adds 5% air, Shift E removes 5%. **B** opens the guide. Fuel, ash and clinker respond separately; thick piles and dirty airways still reduce effective firing. Both boiler faces are usable.

The engine stand now has **Execute bridge order**, which reads the current order on the server rather than applying a stale slider value. The separate manual setting is labelled explicitly. Applied setting, engine revolutions and ship speed are distinct: revs respond quickly, while the hull takes time to accelerate or coast down. Pistons and flywheels follow revs and stop when the engines do. Solo crew assistance answers orders automatically; use **Take manual control** at the stand to test it yourself.

**Standard** places the first main encounter roughly 3–6 minutes away at normal passage speeds. A maintained-ship audit over 20 seeds at both 20 and 25 kn measured first contact at **186–350 seconds**. **Experienced** starts the first encounter earlier. Prepared job demos and the explicit Ice ahead test retain their shorter testing leads. All ice remains fixed after placement.

Reducing speed early buys reaction time, but also reduces turning rate. The handling audit gives almost the same lateral displacement at a fixed forward distance for 10–25 kn; accelerating is not a reliable evasion advantage. Stopping still takes time. The inquiry's [Wilding deposition](https://titanicinquiry.org/lol/depositions/wilding05.php) likewise distinguishes slower turning per second from turning-circle size. This game does not simulate Titanic's individual propeller/reversing response, so it cannot establish the historical best last-second manoeuvre.

## Single player

**Job demos** on the opening menu, or in **P**, loads a prepared watch: Captain, Navigation, Lookout, Helmsman, Boiler crew, Engineer, Wireless or Stopped ship. You begin at usable equipment with the needed tools, report or fault already present. Press **R** to reset the same demo, or pick another in P. Bench jobs hold voyage time; lookout, wheel and stopped-ship demos run live. Random faults and unrelated messages are disabled in demos. Stopped ship begins at zero speed and zero delay, so the first warning appears after about 23 real seconds.

Pick any assignment. Ordinary solo starts with a live voyage clock, so schedule and route warnings run. Use P to deliberately hold the voyage clock; the HUD then says CLOCK HELD and schedule checks are suspended. Walking, equipment, timed jobs and machinery still run while the clock is held. Closing all four dampers visibly cools the fires, drops steam and slows the engine indication while the voyage clock is held. Press **P** for clock controls, assignment changes, quick travel, optional fault tools, restoring the ship and restarting. Crew assistance supplies coal and executes bridge orders; disable it for manual firing and engineering. Assistance never overrides your damper settings or clears ash.

**Ice ahead** creates a complete ice field with the main hazard roughly 70 seconds from contact at cruise, anticipating the currently held turn. Ice stays fixed after placement. Distance fog uses radial distance and blends into the same sea and horizon haze in every viewing direction. Clear-weather visibility is tuned for roughly 30 seconds of warning at the wheel and the upper forties from the crow’s nest with binoculars; iceberg size and weather affect this. The same ice is rendered throughout. Binoculars narrow the field of view, while climbing continuously reduces near-surface haze; the nest’s forward position also helps. Turning your head never changes radial extinction.

**Test sinking** runs the evacuation sequence. **Late crossing** and **Off route** test the persistent warnings and recall. Scenario buttons close the test menu automatically. **Restore ship** clears faults and navigation penalties. These controls are restricted to a dedicated one-player room.

After a major collision, the evacuation order comes at 10 seconds, followed by 30 seconds to board a lifeboat. Crew who miss the launch are rescued automatically. The sinking continues in the background for another 105 seconds, including forward flooding, raised stern, lights failing, breakup and final descent. This is a compressed game sequence, informed by the inquiry’s [flooding account](https://www.titanicinquiry.org/BOTInq/BOTReport/botRepFinEff.php) and modern [NOAA/WHOI wreck findings](https://sanctuaries.noaa.gov/maritime/titanic/expedition_results.html); its timing and angles are simplified.

## Voice and hosting

V speaks to nearby crew. Walls and decks affect ordinary voice; answered telephones link departments. The wireless desk has a separate ship handset with lines to the bridge, nest, engines and stokehold. Hold V over an answered line, or send a short text read-back to the person holding the other handset. Those messages and notes are private to the participants. This extra desk extension is a gameplay convenience, informed by the ship's [telephone installation](https://www.gutenberg.org/files/39415/39415-h/39415-h.htm).

External wireless traffic supplies **coordinates, ice-field extent and sighting time** tied to the seeded ice field. An undecoded payload contains Morse only. Once transcribed, compare the report area with the ship's track on the nautical chart, choose its range, and consider the sighting's age. Requesting a fresh position takes eight game seconds and has a cooldown. Reports describe broad areas of ice, so they do not identify a collision target. Carry a slip to the chart, or read it over an answered ship line so its recipient can plot it. The generated messages use a fictional local chart datum and a compressed watch clock; their format is informed by [the inquiry's ice-message account](https://www.gutenberg.org/files/39415/39415-h/39415-h.htm).

The Node server relays real WebRTC audio and runs the authoritative game. Microphones need localhost or HTTPS. Friends on other computers need a reachable server; GitHub Pages hosts only the browser client. See [HOSTING.md](HOSTING.md) for HTTPS, UDP and TURN configuration.

## Development checks

Run `npm run check`, `npm test`, `npm run balance` and `npm run build`. See [TESTING.md](TESTING.md) for automated scope and manual checks. Public internet voice, long sessions and full crews still need human playtesting. Game and host details are in [HOST-NOTES.md](HOST-NOTES.md), which contains spoilers.

All visual assets and ship sounds are generated in the project. Local play needs no accounts, paid APIs or asset subscriptions.
