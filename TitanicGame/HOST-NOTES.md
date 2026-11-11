# Host notes — spoilers

Keep this file out of the player briefing if this is your friends’ first crossing.

The opening menu, lobby, crew briefing and normal assignment card present a cooperative ship simulation. Only the traveler receives private orders at departure: they are from the future, Titanic must sink to preserve history, and they must cause the disaster without being caught. Their equipment panels offer tampering; other players see ordinary maintenance.

The accusation appears after evacuation or a failed crossing. The lifeboat asks whether someone deliberately sank the ship. A route/schedule recall instead convenes a company inquiry in a separate room, suspending the crew and asking who interfered with the crossing. Both offer a vote. Roles and tamper attribution appear in the inquiry after that vote. A safe crossing does not reveal the traveler to other crew.

## The crossing

- Roles and exactly one time traveler are assigned privately at departure. Every player can operate ordinary equipment. Engineers repair in 9 seconds versus 30 for other assignments and inspect in 3 versus 7. Boiler Crew use larger shovel loads and shorter stroke recovery; Wireless assisted transcription takes 14 versus 38. Steering, speed orders, telephones, charts and lifeboats remain open to everyone.
- The Captain sets speed orders on the bridge. Engineering must execute them below decks. Boilers produce the steam; neglected coal, bad settings, faults, and tampering reduce power.
- The Deck Officer reads the chart and delivered ice reports. The wheel actually changes the ship's heading with rudder lag and inertia. Use north/south deviations while staying inside the route corridor.
- Lookouts physically scan actual 3D icebergs. No automatic sighting alert is sent. Right mouse gives basic zoom; binoculars magnify the same distant geometry with a narrower view. Find a key or solve the randomized coupled-dial lock: each turn advances that dial and its neighbor, and all three notches must align. Generated starts require five to nine turns with an optimal solution. Binoculars return to the cabinet if their owner disconnects.
- Wireless receives real Morse-encoded telegrams. Listen, use the reference chart and transcribe, or wait for assisted transcription. The decoded position, extent and sighting time can be carried to the chart or read to another crewmate over an answered telephone. The recipient then has a report slip to plot. Plaintext, report geometry and urgency are absent from undecoded payloads. A fresh-position request returns after eight game seconds and has a 40-second cooldown.
- The time traveler can make plausible bad decisions or perform eight-second physical tampering at six kinds of machinery. Charges and cooldowns limit it. Other crew can inspect and repair; genuine failures also occur. An ongoing tamper looks like maintenance to witnesses, and only the final inquiry attributes it.
- The main encounter time is hidden, sampled between roughly three and ten minutes. Weather, messages, incidental ice and legitimate failures are seeded but irregular. Ice placement projects ship motion with rudder lag and the held turn. Once placed, ice stays fixed: early course choices and later evasive action can leave it behind. Actual hull/ice geometry determines contact.
- Contact severity and speed determine compartment breaches. Slow or glancing contact can survive; progressive flooding can sink the ship. Steam supports the pumps. Major contact begins the sinking sequence immediately, with the abandon order at 10 seconds and boarding ending at 40. Everyone reaches a launch, including crew who missed boarding. Forward flooding, blackout, breakup and the stern’s final descent continue until 145 seconds after contact, including during and after voting.
- Cruise is 20 knots and maximum speed 25. Persistent schedule warnings begin at 22.5 seconds behind, become urgent at 60 and recall the crossing at 95. Route warnings begin near 0.08 NM; remaining beyond 0.12 NM for 90 seconds, or reaching 0.24 NM, also recalls it. Returning inside the corridor clears the timer. Both recalls lead to the accusation vote with the ship still afloat.
- If the ship survives and completes the crossing, the crew wins. Sinking leads to a shared lifeboat; route/schedule recall leads to a company hearing room. Both have a two-minute discussion. A strict majority identifying the traveler produces a draw; a wrong vote, tie or no decision gives the traveler the win. The inquiry reveals all roles and significant actions. The host can return everyone to a fresh lobby without refreshing.


Solo now starts live by default. Job demos are private, preloaded practice fixtures, never multiplayer options. The P clock hold suspends navigation penalties and is labelled explicitly; equipment and machinery remain active.

V8 adds three individually tended firebeds per boiler: coal placement, clinker slicing, ash raking, fire doors and draught all affect steam. Boiler job demos supply the other three boilers so the player can focus on the test bed. The working ship needs its whole plant tended.

The wireless desk's extra ship telephone is an intentional convenience for crew coordination. Its voice routing uses the existing answered-handset rules. Text messages reach only the two people on that line; a report read-back copies the decoded slip to its recipient, who must still plot it at the chart. Morse remains external traffic. Broad report areas and sighting ages reveal useful navigation information without exposing a particular iceberg as the encounter target.


## V9 watch and field changes

The starting four now include Engineer. The addition order is Wireless, Lookout, Second Boiler, Helmsman, Second Engineer, Second Wireless. Captain orders/coordination and Officer plotting/steering have adjoining physical rooms. The chart is a shared, server-validated estimate board with physical station access, move/erase operations and bounded strokes. It has no automatic iceberg overlay. Deliberately inaccurate plots are possible and attribution/source/time remain visible. Lookout observations are private notebook entries, not magical broadcasts.

Normal voyages seed 2–4 threatening contacts and a persistent fixed field at departure. All contacts are solid. Completing one encounter does not end the voyage. The last one passing astern starts the 35-second safe run; no target flags/countdown are sent to the crew. The existing solo Ice ahead fixture still tests one encounter over about 70 seconds. Four-player traffic is lighter and crews below seven have 35% slower fuel/ash/clinker turnover. These are gameplay balance changes, not historical staffing claims.


## V10

The company inquiry is its own phase; crew are repositioned around the hearing table with evacuated=false. Jobs and phones are cleared, the ship is stopped, no flooding/sinking is started, and everyone can speak. Results preserve the hearing room. Actual sinking retains evacuation, launches and the animated ship. Voice forwarding and network snapshots are tested for both settings.

Full power now increases firing turnover and nonlinear steam draw, propulsion/valve wear and natural malfunction risk. The short firing guide can be dismissed or replayed; it does not automate or gate real tending actions.
