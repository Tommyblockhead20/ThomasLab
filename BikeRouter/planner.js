/* Bike Trip Generator prototype
   Runtime responsibilities:
   - load compact processed touring data
   - calculate physical + generalized travel cost
   - generate candidate trips
   - score/randomize candidates
   - split winning route into daily stages
   - render map + explanation
*/

(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================

  const DATA_URL = "fake_data.json";
  const PACE = {
    sightseeing: { milesPerDay: 35, flatMph: 11.0 },
    relaxed:     { milesPerDay: 48, flatMph: 12.5 },
    balanced:    { milesPerDay: 62, flatMph: 14.0 },
    fast:        { milesPerDay: 78, flatMph: 15.5 },
    big:         { milesPerDay: 95, flatMph: 17.0 }
  };
  const EBIKE = { mileageFactor: 1.17, speedFactor: 1.12, climbRelief: 0.52 };
  const SURFACE_SPEED = { paved:1.0, compacted:0.91, fine_gravel:0.85, gravel:0.76, dirt:0.68 };
  const INFRA_STRESS = { path:0.0, protected:0.08, lane:0.28, quiet_road:0.38, road:0.78 };
  const TOLERANCE_LABELS = {
    traffic:["","Avoid strongly","Avoid","Okay","Tolerant","Don't care"],
    surface:["","Smooth only","Mostly smooth","Some rough okay","Rough okay","Adventure"],
    hills:["","Prefer flat","Low hills","Moderate","Hills okay","Climbs welcome"],
    infrastructure:["","Roads okay","Prefer comfort","Prefer bike routes","Strongly prefer paths","Paths first"],
    scenicDetour:["","Direct","Mostly direct","Balanced","Scenic","Very scenic"]
  };
  const INTEREST_KEYS = ["cities","towns","history","nature","mountains","water","iconic"];

  let DATA = null;
  let graph = null;
  let map = null;
  let networkLayer = null;
  let routeLayer = null;
  let markerLayer = null;

  // ============================================================
  // BASIC HELPERS
  // ============================================================

  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sum = (arr) => arr.reduce((a,b) => a+b, 0);

  function haversineMiles(a, b) {
    const R = 3958.8;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function seededChoiceWeighted(items, weightFn) {
    const weighted = items.map(item => ({ item, w: Math.max(0.001, weightFn(item)) }));
    const total = sum(weighted.map(x => x.w));
    let r = Math.random() * total;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) return x.item;
    }
    return weighted[weighted.length - 1].item;
  }

  function selectedRadio(name) {
    return document.querySelector(`input[name="${name}"]:checked`).value;
  }

  function getPrefs() {
    const bike = selectedRadio("bike");
    return {
      region: $("region").value,
      days: clamp(Number($("days").value) || 1, 1, 60),
      pace: $("pace").value,
      bike,
      shape: selectedRadio("shape"),
      remoteness: Number($("remoteness").value),
      traffic: Number($("traffic").value),
      surface: Number($("surface").value),
      hills: Number($("hills").value),
      infrastructure: Number($("infrastructure").value),
      scenicDetour: Number($("scenicDetour").value),
      interests: Object.fromEntries(INTEREST_KEYS.map(k => [k, Number($(k).value)]))
    };
  }

  // ============================================================
  // DATA + GRAPH
  // ============================================================

  async function loadData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Could not load ${DATA_URL} (${response.status})`);
    DATA = await response.json();

    const nodes = new Map(DATA.nodes.map(n => [n.id, n]));
    const edges = new Map(DATA.edges.map(e => [e.id, e]));
    const adjacency = new Map(DATA.nodes.map(n => [n.id, []]));

    for (const e of DATA.edges) {
      adjacency.get(e.a).push({ edgeId:e.id, to:e.b });
      adjacency.get(e.b).push({ edgeId:e.id, to:e.a });
    }
    graph = { nodes, edges, adjacency };
  }

  // ============================================================
  // PHYSICAL TIME + GENERALIZED COST
  // ============================================================

  function physicalMinutes(edge, prefs) {
    const profile = PACE[prefs.pace];
    const ebike = prefs.bike === "ebike";

    let mph = profile.flatMph * (ebike ? EBIKE.speedFactor : 1);
    mph *= SURFACE_SPEED[edge.surface] ?? 0.9;

    // Elevation model: intentionally simple for prototype.
    // Uphill adds real time; e-bike reduces the climbing hit.
    const climbFeetPerMile = edge.ascentFt / Math.max(edge.distanceMiles, 0.1);
    const climbPenalty = (climbFeetPerMile / 1000) * (ebike ? EBIKE.climbRelief : 1);
    mph /= (1 + climbPenalty * 0.55);

    // Urban friction represents signals, crossings, pedestrians, turns, etc.
    mph /= (1 + (edge.urbanFriction || 0) * 0.22);

    return edge.distanceMiles / Math.max(mph, 3) * 60;
  }

  function generalizedMinutes(edge, prefs) {
    const physical = physicalMinutes(edge, prefs);
    let multiplier = 1;

    const stress = INFRA_STRESS[edge.infrastructure] ?? 0.5;
    const trafficSensitivity = (6 - prefs.traffic) / 5;
    multiplier += stress * trafficSensitivity * 0.70;

    const infraPreference = (prefs.infrastructure - 1) / 4;
    multiplier += stress * infraPreference * 0.48;

    const surfaceRoughness = { paved:0, compacted:0.16, fine_gravel:0.28, gravel:0.55, dirt:0.8 }[edge.surface] ?? 0.3;
    const surfaceSensitivity = (6 - prefs.surface) / 5;
    multiplier += surfaceRoughness * surfaceSensitivity * 0.65;

    const climbIntensity = clamp(edge.ascentFt / Math.max(edge.distanceMiles,1) / 130, 0, 1.5);
    const hillSensitivity = (6 - prefs.hills) / 5;
    multiplier += climbIntensity * hillSensitivity * (prefs.bike === "ebike" ? 0.16 : 0.38);

    const remoteOver = Math.max(0, (edge.remoteness || 1) - prefs.remoteness);
    multiplier += remoteOver * 0.08;

    // Scenery can justify modest detours, but never dominate time.
    const scenery = clamp(edge.scenery / 100, 0, 1);
    const scenicStrength = (prefs.scenicDetour - 1) / 4;
    multiplier *= 1 - scenery * scenicStrength * 0.10;

    return physical * Math.max(multiplier, 0.72);
  }

  // ============================================================
  // ROUTING
  // ============================================================

  function dijkstra(startId, endId, prefs, allowedRegions) {
    const dist = new Map([[startId, 0]]);
    const prev = new Map();
    const queue = [{ id:startId, cost:0 }];

    while (queue.length) {
      queue.sort((a,b) => a.cost - b.cost);
      const current = queue.shift();
      if (current.cost !== dist.get(current.id)) continue;
      if (current.id === endId) break;

      for (const step of graph.adjacency.get(current.id) || []) {
        const edge = graph.edges.get(step.edgeId);
        if (allowedRegions && !allowedRegions.has(edge.region)) continue;
        const nextCost = current.cost + generalizedMinutes(edge, prefs);
        if (nextCost < (dist.get(step.to) ?? Infinity)) {
          dist.set(step.to, nextCost);
          prev.set(step.to, { from:current.id, edgeId:step.edgeId });
          queue.push({ id:step.to, cost:nextCost });
        }
      }
    }

    if (!dist.has(endId)) return null;

    const edgeIds = [];
    let at = endId;
    while (at !== startId) {
      const p = prev.get(at);
      if (!p) return null;
      edgeIds.push(p.edgeId);
      at = p.from;
    }
    edgeIds.reverse();
    return edgeIds;
  }

  function combineLegs(legs) {
    const out = [];
    for (const leg of legs) {
      if (!leg) return null;
      for (const e of leg) out.push(e);
    }
    return out;
  }

  function orderedNodesForEdges(edgeIds, startId) {
    const out = [startId];
    let current = startId;
    for (const edgeId of edgeIds) {
      const e = graph.edges.get(edgeId);
      current = e.a === current ? e.b : e.a;
      out.push(current);
    }
    return out;
  }

  // ============================================================
  // DESTINATION + TRIP SCORING
  // ============================================================

  function destinationValue(dest, prefs) {
    let weighted = 0, weight = 0;
    for (const key of INTEREST_KEYS) {
      const user = prefs.interests[key] / 100;
      weighted += user * (dest.scores[key] || 0);
      weight += user;
    }
    if (!weight) return 20;
    return weighted / weight;
  }

  function routeMetrics(edgeIds, startId, prefs) {
    const edges = edgeIds.map(id => graph.edges.get(id));
    const distance = sum(edges.map(e => e.distanceMiles));
    const actualMinutes = sum(edges.map(e => physicalMinutes(e, prefs)));
    const generalized = sum(edges.map(e => generalizedMinutes(e, prefs)));
    const ascent = sum(edges.map(e => e.ascentFt));
    const scenery = distance ? sum(edges.map(e => e.scenery * e.distanceMiles)) / distance : 0;

    const comfortable = sum(edges.filter(e => ["path","protected","quiet_road"].includes(e.infrastructure)).map(e => e.distanceMiles));
    const separated = sum(edges.filter(e => ["path","protected"].includes(e.infrastructure)).map(e => e.distanceMiles));
    const paved = sum(edges.filter(e => e.surface === "paved").map(e => e.distanceMiles));
    const rough = sum(edges.filter(e => ["gravel","dirt"].includes(e.surface)).map(e => e.distanceMiles));

    const ordered = orderedNodesForEdges(edgeIds, startId);
    const destinationIds = [...new Set(ordered.map(id => graph.nodes.get(id).destinationId).filter(Boolean))];
    const destinations = destinationIds.map(id => DATA.destinations.find(d => d.id === id)).filter(Boolean);
    const interest = destinations.length ? sum(destinations.map(d => destinationValue(d,prefs))) / destinations.length : 0;

    const repeatedCount = edgeIds.length - new Set(edgeIds).size;
    const repeatPenalty = edgeIds.length ? repeatedCount / edgeIds.length : 0;

    const start = graph.nodes.get(ordered[0]);
    const end = graph.nodes.get(ordered[ordered.length - 1]);
    const direct = haversineMiles(start, end);
    const progression = distance ? clamp(direct / distance, 0, 1) : 0;

    return {
      edges, ordered, destinations, distance, actualMinutes, generalized, ascent, scenery,
      interest, comfortablePct:distance ? comfortable/distance*100 : 0,
      separatedPct:distance ? separated/distance*100 : 0,
      pavedPct:distance ? paved/distance*100 : 0,
      roughPct:distance ? rough/distance*100 : 0,
      repeatPenalty, progression
    };
  }

  function candidateScore(metrics, prefs, shape) {
    const profile = PACE[prefs.pace];
    const targetDistance = profile.milesPerDay * prefs.days * (prefs.bike === "ebike" ? EBIKE.mileageFactor : 1);
    const ratio = metrics.distance / Math.max(targetDistance,1);
    const timeFit = Math.exp(-Math.abs(Math.log(Math.max(ratio,0.05))) * 2.1) * 100;

    const comfort = metrics.comfortablePct;
    const scenic = metrics.scenery;
    const interest = metrics.interest;

    let progressionScore;
    if (shape === "loop") {
      progressionScore = 100 * (1 - clamp(metrics.repeatPenalty * 2.4, 0, 1));
    } else {
      progressionScore = clamp(metrics.progression / 0.72, 0, 1) * 100;
    }

    return (
      timeFit * 0.31 +
      comfort * 0.22 +
      scenic * 0.18 +
      interest * 0.19 +
      progressionScore * 0.10
    );
  }

  // ============================================================
  // CANDIDATE GENERATION
  // ============================================================

  function regionSet(region) {
    if (region === "anywhere") return new Set(["europe","north_america"]);
    return new Set([region]);
  }

  function eligibleDestinationNodes(prefs) {
    const regions = regionSet(prefs.region);
    return DATA.destinations
      .filter(d => regions.has(d.region))
      .filter(d => d.serviceLevel >= Math.max(1, 5 - prefs.remoteness))
      .map(d => graph.nodes.get(d.nodeId))
      .filter(Boolean);
  }

  function generateOneCandidate(prefs, forcedShape=null) {
    const regions = regionSet(prefs.region);
    const nodes = eligibleDestinationNodes(prefs);
    if (nodes.length < 3) return null;

    const shape = forcedShape || (prefs.shape === "either" ? (Math.random() < 0.72 ? "oneway" : "loop") : prefs.shape);
    const start = nodes[Math.floor(Math.random()*nodes.length)];

    if (shape === "oneway") {
      let end = nodes[Math.floor(Math.random()*nodes.length)];
      let guard = 0;
      while (end.id === start.id && guard++ < 10) end = nodes[Math.floor(Math.random()*nodes.length)];

      // Occasionally force a worthwhile intermediate destination.
      if (Math.random() < 0.50 && nodes.length > 3) {
        const mids = nodes.filter(n => n.id !== start.id && n.id !== end.id);
        const mid = seededChoiceWeighted(mids, n => {
          const d = DATA.destinations.find(x => x.nodeId === n.id);
          return d ? Math.max(5, destinationValue(d,prefs)) : 5;
        });
        const legs = [
          dijkstra(start.id, mid.id, prefs, regions),
          dijkstra(mid.id, end.id, prefs, regions)
        ];
        const edgeIds = combineLegs(legs);
        if (!edgeIds) return null;
        const metrics = routeMetrics(edgeIds, start.id, prefs);
        return { shape, startId:start.id, edgeIds, metrics, score:candidateScore(metrics,prefs,shape) };
      }

      const edgeIds = dijkstra(start.id, end.id, prefs, regions);
      if (!edgeIds) return null;
      const metrics = routeMetrics(edgeIds, start.id, prefs);
      return { shape, startId:start.id, edgeIds, metrics, score:candidateScore(metrics,prefs,shape) };
    }

    // Loop: start -> waypoint A -> waypoint B -> start
    const others = nodes.filter(n => n.id !== start.id);
    const a = seededChoiceWeighted(others, n => {
      const d = DATA.destinations.find(x => x.nodeId === n.id);
      return d ? destinationValue(d,prefs)+10 : 10;
    });
    const remaining = others.filter(n => n.id !== a.id);
    const b = seededChoiceWeighted(remaining, n => {
      const d = DATA.destinations.find(x => x.nodeId === n.id);
      return d ? destinationValue(d,prefs)+10 : 10;
    });
    const edgeIds = combineLegs([
      dijkstra(start.id, a.id, prefs, regions),
      dijkstra(a.id, b.id, prefs, regions),
      dijkstra(b.id, start.id, prefs, regions)
    ]);
    if (!edgeIds) return null;
    const metrics = routeMetrics(edgeIds, start.id, prefs);
    return { shape, startId:start.id, edgeIds, metrics, score:candidateScore(metrics,prefs,shape) };
  }

  function generateTrip(prefs) {
    const candidates = [];
    const attempts = 260;

    for (let i=0; i<attempts; i++) {
      const c = generateOneCandidate(prefs);
      if (!c || !c.edgeIds.length) continue;

      // Avoid grotesquely repeated loops.
      if (c.metrics.repeatPenalty > 0.48) continue;
      candidates.push(c);
    }

    if (!candidates.length) throw new Error("No valid trip found in the demo network.");

    // Deduplicate by route edge signature.
    const unique = new Map();
    for (const c of candidates) {
      const key = c.edgeIds.join("|");
      if (!unique.has(key) || unique.get(key).score < c.score) unique.set(key,c);
    }

    const ranked = [...unique.values()].sort((a,b) => b.score-a.score);
    const shortlist = ranked.slice(0, Math.min(12, ranked.length));

    // Randomized selection among genuinely good candidates.
    const best = shortlist[0].score;
    return seededChoiceWeighted(shortlist, c => Math.exp((c.score-best)/7));
  }

  // ============================================================
  // DAILY STAGES
  // ============================================================

  function splitIntoDays(candidate, prefs) {
    const dayCount = prefs.days;
    const target = candidate.metrics.distance / dayCount;
    const nodes = candidate.metrics.ordered;
    const edgeIds = candidate.edgeIds;

    const days = [];
    let dayStartIndex = 0;
    let dist = 0;

    for (let i=0; i<edgeIds.length; i++) {
      const edge = graph.edges.get(edgeIds[i]);
      dist += edge.distanceMiles;
      const daysRemainingAfter = dayCount - days.length - 1;
      const edgesRemaining = edgeIds.length - i - 1;

      if (days.length < dayCount-1 && dist >= target && edgesRemaining >= daysRemainingAfter) {
        days.push(makeDay(dayStartIndex, i, nodes, edgeIds, prefs));
        dayStartIndex = i+1;
        dist = 0;
      }
    }
    if (dayStartIndex < edgeIds.length) days.push(makeDay(dayStartIndex, edgeIds.length-1, nodes, edgeIds, prefs));

    // If the fake network can't naturally create as many distinct stages as requested,
    // don't fabricate them.
    return days;
  }

  function makeDay(startEdgeIndex, endEdgeIndex, nodes, edgeIds, prefs) {
    const ids = edgeIds.slice(startEdgeIndex, endEdgeIndex+1);
    const startNode = graph.nodes.get(nodes[startEdgeIndex]);
    const endNode = graph.nodes.get(nodes[endEdgeIndex+1]);
    const m = routeMetrics(ids, startNode.id, prefs);
    return {
      from:startNode.name,
      to:endNode.name,
      distance:m.distance,
      minutes:m.actualMinutes,
      ascent:m.ascent,
      scenery:m.scenery
    };
  }

  // ============================================================
  // MAP
  // ============================================================

  function initMap() {
    map = L.map("map", { zoomControl:true }).setView([47.2, 1.5], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom:18,
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
    networkLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  function edgeCoordinates(edge, startNodeId=null) {
    let coords = edge.geometry.map(([lat,lon]) => [lat,lon]);
    if (startNodeId && edge.b !== startNodeId && edge.a === startNodeId) return coords;
    if (startNodeId && edge.a !== startNodeId && edge.b === startNodeId) return [...coords].reverse();
    return coords;
  }

  function renderBaseNetwork(region) {
    networkLayer.clearLayers();
    const regions = regionSet(region);
    for (const edge of DATA.edges) {
      if (!regions.has(edge.region)) continue;
      L.polyline(edge.geometry.map(([lat,lon]) => [lat,lon]), {
        color:"#8e9a90", weight:2.4, opacity:0.34, dashArray:"5 5"
      }).addTo(networkLayer);
    }
  }

  function renderTrip(candidate) {
    routeLayer.clearLayers();
    markerLayer.clearLayers();

    const ordered = candidate.metrics.ordered;
    const coords = [];
    let currentNodeId = candidate.startId;

    candidate.edgeIds.forEach(edgeId => {
      const edge = graph.edges.get(edgeId);
      const c = edgeCoordinates(edge, currentNodeId);
      if (coords.length) c.shift();
      coords.push(...c);
      currentNodeId = edge.a === currentNodeId ? edge.b : edge.a;
    });

    const poly = L.polyline(coords, { color:"#23724a", weight:6, opacity:0.92 }).addTo(routeLayer);

    for (const dest of candidate.metrics.destinations) {
      const node = graph.nodes.get(dest.nodeId);
      const marker = L.circleMarker([node.lat,node.lon], {
        radius:7, color:"#173d2a", weight:2, fillColor:"#fff", fillOpacity:1
      }).addTo(markerLayer);
      marker.bindTooltip(dest.name);
    }

    if (coords.length) map.fitBounds(poly.getBounds(), { padding:[28,28] });
  }

  // ============================================================
  // RESULTS
  // ============================================================

  function fmtTime(minutes) {
    const h = Math.floor(minutes/60);
    const m = Math.round(minutes%60);
    return `${h}h ${String(m).padStart(2,"0")}m`;
  }

  function pct(v) { return `${Math.round(v)}%`; }

  function routeName(candidate) {
    const ds = candidate.metrics.destinations;
    if (ds.length >= 2) return `${ds[0].name} → ${ds[ds.length-1].name}`;
    const nodes = candidate.metrics.ordered;
    return `${graph.nodes.get(nodes[0]).name} → ${graph.nodes.get(nodes[nodes.length-1]).name}`;
  }

  function renderResults(candidate, prefs) {
    const m = candidate.metrics;
    $("tripTitle").textContent = routeName(candidate);
    $("tripSub").textContent =
      `${candidate.shape === "loop" ? "Loop" : "One-way"} · ${prefs.days} requested day${prefs.days===1?"":"s"} · ${prefs.bike === "ebike" ? "E-bike" : "Regular bike"} · ${prefs.pace}`;

    $("tripScore").textContent = Math.round(candidate.score);

    const stats = [
      [m.distance.toFixed(0)+" mi","Distance"],
      [fmtTime(m.actualMinutes),"Estimated riding"],
      [Math.round(m.ascent).toLocaleString()+" ft","Climbing"],
      [pct(m.separatedPct),"Separated"],
      [Math.round(m.scenery)+"/100","Scenery"]
    ];
    $("stats").innerHTML = stats.map(([a,b]) => `<div class="stat"><strong>${a}</strong><span>${b}</span></div>`).join("");

    const quality = [
      ["Comfortable",m.comfortablePct],
      ["Separated",m.separatedPct],
      ["Paved",m.pavedPct],
      ["Scenery",m.scenery],
      ["Interests",m.interest]
    ];
    $("qualityBars").innerHTML = quality.map(([label,value]) =>
      `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${clamp(value,0,100)}%"></div></div><strong>${Math.round(value)}</strong></div>`
    ).join("");

    const highlights = [...m.destinations]
      .sort((a,b) => destinationValue(b,prefs)-destinationValue(a,prefs))
      .slice(0,5);

    $("highlights").innerHTML = highlights.length
      ? highlights.map(d => `<div class="day"><div class="day-title"><span>${d.name}</span><span>${Math.round(destinationValue(d,prefs))}</span></div><p>${d.blurb}</p></div>`).join("")
      : `<p class="hint">No major destination highlights on this demo route.</p>`;

    const days = splitIntoDays(candidate,prefs);
    $("daysList").innerHTML = days.map((d,i) =>
      `<div class="day">
        <div class="day-title"><span>Day ${i+1}: ${d.from} → ${d.to}</span><span>${d.distance.toFixed(0)} mi</span></div>
        <p>${fmtTime(d.minutes)} riding · ${Math.round(d.ascent).toLocaleString()} ft climbing · scenery ${Math.round(d.scenery)}/100</p>
      </div>`
    ).join("");

    const warnings = [];
    const profile = PACE[prefs.pace];
    const targetDistance = profile.milesPerDay * prefs.days * (prefs.bike==="ebike" ? EBIKE.mileageFactor : 1);
    if (m.distance < targetDistance*0.67) warnings.push("The fake demo network is too small to fully use the requested trip length. Real processed data would provide many more options.");
    if (prefs.bike === "ebike" && prefs.remoteness >= 5) warnings.push("Expedition-level remoteness on an e-bike should trigger charging-range checks in the real planner.");
    if (m.roughPct > 20 && prefs.surface <= 2) warnings.push(`This demo route still contains ${Math.round(m.roughPct)}% rough gravel/dirt because the fake network has limited alternatives.`);

    $("warning").classList.toggle("show", warnings.length>0);
    $("warning").innerHTML = warnings.join("<br>");

    $("results").classList.add("show");
  }

  // ============================================================
  // UI
  // ============================================================

  function syncSliders() {
    document.querySelectorAll('.slider-row input[type="range"]').forEach(input => {
      const value = input.parentElement.querySelector(".value");
      if (TOLERANCE_LABELS[input.id]) value.textContent = input.value;
      else value.textContent = input.value;
    });
  }

  function updateRemoteWarningInline() {
    const bike = selectedRadio("bike");
    if (bike === "ebike" && Number($("remoteness").value) === 5) {
      $("remoteness").title = "Expedition mode can require careful charging planning on an e-bike.";
    } else {
      $("remoteness").title = "";
    }
  }

  async function start() {
    syncSliders();
    initMap();

    try {
      await loadData();
      renderBaseNetwork($("region").value);
      $("generateBtn").disabled = false;
    } catch (err) {
      console.error(err);
      $("generateBtn").disabled = true;
      $("results").classList.add("show");
      $("tripTitle").textContent = "Could not load demo data";
      $("tripSub").textContent = "Run this through a local web server or GitHub Pages; browsers usually block fetch() from file:// URLs.";
    }

    document.querySelectorAll('input[type="range"]').forEach(el => el.addEventListener("input", syncSliders));
    document.querySelectorAll('input[name="bike"]').forEach(el => el.addEventListener("change", updateRemoteWarningInline));
    $("remoteness").addEventListener("change", updateRemoteWarningInline);
    $("region").addEventListener("change", () => renderBaseNetwork($("region").value));

    $("plannerForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const prefs = getPrefs();
      renderBaseNetwork(prefs.region);
      try {
        const trip = generateTrip(prefs);
        renderTrip(trip);
        renderResults(trip,prefs);
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  }

  start();
})();
