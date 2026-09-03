#!/usr/bin/env python3
"""
Bike Trip Generator - network preprocessing scaffold

This file is intentionally the one "heavy offline" source file.

Current capabilities:
  1) `demo` writes a copy of the bundled fake demo data.
  2) `pbf` can extract and normalize candidate bicycle/road segments from an
     OpenStreetMap .osm.pbf file when pyosmium is installed.
  3) Common scoring/classification helpers are already separated into functions
     so later passes (connect -> gap-fill -> prune -> corridor grouping) can stay
     in this single file without turning the browser code into preprocessing code.

Examples:
    python build_network.py demo --output fake_data_copy.json

    pip install osmium
    python build_network.py pbf ohio-latest.osm.pbf ohio_candidates.json \
        --region north_america

The PBF command is a STARTING EXTRACTOR, not yet the final continental backbone
builder. It intentionally keeps a broader candidate graph so later passes can
build the Touring Core without redownloading OSM.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

MILES_PER_KM = 0.621371


# ============================================================
# NORMALIZED DATA MODEL
# ============================================================

@dataclass
class Segment:
    id: str
    a: str
    b: str
    region: str
    distanceMiles: float
    infrastructure: str
    surface: str
    surfaceConfidence: float
    access: str
    roadClass: str
    speedLimitMph: Optional[float]
    seedTier: int
    scenery: float
    ascentFt: float
    urbanFriction: float
    remoteness: int
    geometry: List[List[float]]


# ============================================================
# OSM TAG NORMALIZATION
# ============================================================

GOOD_SURFACES = {
    "asphalt": ("paved", 1.0),
    "concrete": ("paved", 1.0),
    "concrete:plates": ("paved", 0.95),
    "paving_stones": ("paved", 0.85),
    "fine_gravel": ("fine_gravel", 1.0),
    "compacted": ("compacted", 1.0),
    "gravel": ("gravel", 1.0),
    "unpaved": ("gravel", 0.65),
    "ground": ("dirt", 0.85),
    "dirt": ("dirt", 1.0),
    "earth": ("dirt", 1.0),
}

def normalize_surface(tags: Dict[str, str]) -> Tuple[str, float]:
    raw = tags.get("surface")
    if raw in GOOD_SURFACES:
        return GOOD_SURFACES[raw]

    highway = tags.get("highway", "")
    if highway in {"cycleway", "living_street", "residential", "tertiary"}:
        return "paved", 0.50
    if highway in {"path", "track"}:
        return "compacted", 0.35
    return "paved", 0.30


def bicycle_access(tags: Dict[str, str]) -> str:
    bicycle = tags.get("bicycle")
    access = tags.get("access")

    if bicycle in {"no", "private"}:
        return "no"
    if access in {"private", "no"} and bicycle not in {"yes", "designated", "permissive"}:
        return "no"
    if bicycle in {"designated", "yes", "permissive"}:
        return "yes"
    return "unknown"


def normalize_infrastructure(tags: Dict[str, str]) -> str:
    highway = tags.get("highway", "")
    cycleway = tags.get("cycleway", "")
    left = tags.get("cycleway:left", "")
    right = tags.get("cycleway:right", "")

    if highway == "cycleway":
        return "path"
    if highway == "path" and tags.get("bicycle") in {"yes", "designated"}:
        return "path"

    all_cycle = {cycleway, left, right}
    if any(v in {"track", "separate"} for v in all_cycle):
        return "protected"
    if any(v in {"lane", "shared_lane", "share_busway"} for v in all_cycle):
        return "lane"

    if highway in {"living_street", "residential", "service"}:
        return "quiet_road"

    return "road"


def seed_tier(tags: Dict[str, str], infrastructure: str, surface: str) -> int:
    """
    1 = excellent seed network
    2 = strong connector
    3 = usable connector
    4 = fallback road graph
    9 = reject

    Crucially: compacted/fine-gravel high-quality paths are Tier 1 too.
    That prevents GAP/C&O-style corridors from being missed simply because
    they are not asphalt.
    """
    if bicycle_access(tags) == "no":
        return 9

    if infrastructure == "path":
        if surface in {"paved", "compacted", "fine_gravel"}:
            return 1
        if surface == "gravel":
            return 2
        return 3

    if infrastructure == "protected":
        return 1 if surface == "paved" else 2
    if infrastructure == "lane":
        return 2
    if infrastructure == "quiet_road":
        return 3
    return 4


def road_class(tags: Dict[str, str]) -> str:
    return tags.get("highway", "unknown")


def speed_limit_mph(tags: Dict[str, str]) -> Optional[float]:
    raw = tags.get("maxspeed")
    if not raw:
        return None
    try:
        text = raw.lower().strip()
        if "mph" in text:
            return float(text.replace("mph", "").strip())
        return float(text) * MILES_PER_KM
    except ValueError:
        return None


# ============================================================
# GEOMETRY
# ============================================================

def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlon/2)**2
    return 2 * r * math.asin(math.sqrt(a))


# ============================================================
# PBF EXTRACTION
# ============================================================

def extract_pbf(input_path: Path, output_path: Path, region: str) -> None:
    try:
        import osmium
    except ImportError as exc:
        raise SystemExit(
            "The `pbf` command requires pyosmium/osmium.\n"
            "Install it with:  pip install osmium"
        ) from exc

    segments: List[Segment] = []

    class Handler(osmium.SimpleHandler):
        def way(self, w):
            tags = {k: v for k, v in w.tags}
            highway = tags.get("highway")
            if not highway:
                return

            infra = normalize_infrastructure(tags)
            access = bicycle_access(tags)
            surface, confidence = normalize_surface(tags)
            tier = seed_tier(tags, infra, surface)

            if tier == 9:
                return

            # Keep a broad fallback graph, but drop motorways/trunks by default.
            if highway in {"motorway", "motorway_link", "trunk", "trunk_link"}:
                return

            try:
                points = [(n.ref, n.location.lat, n.location.lon) for n in w.nodes if n.location.valid()]
            except Exception:
                return

            for i in range(len(points)-1):
                a_id, lat1, lon1 = points[i]
                b_id, lat2, lon2 = points[i+1]
                d = haversine_miles(lat1, lon1, lat2, lon2)
                if d <= 0:
                    continue

                seg_id = f"{w.id}:{i}"
                segments.append(Segment(
                    id=seg_id,
                    a=str(a_id),
                    b=str(b_id),
                    region=region,
                    distanceMiles=round(d, 5),
                    infrastructure=infra,
                    surface=surface,
                    surfaceConfidence=confidence,
                    access=access,
                    roadClass=road_class(tags),
                    speedLimitMph=speed_limit_mph(tags),
                    seedTier=tier,
                    scenery=50.0,       # filled by later land/water/topography pass
                    ascentFt=0.0,       # filled by elevation pass
                    urbanFriction=0.0,  # filled by urban/intersection pass
                    remoteness=3,       # filled by services/population pass
                    geometry=[[lat1, lon1], [lat2, lon2]],
                ))

    handler = Handler()
    handler.apply_file(str(input_path), locations=True)

    payload = {
        "metadata": {
            "format": "bike-trip-planner-candidate-network-v1",
            "region": region,
            "source": str(input_path),
            "note": "Broad candidate graph. Run future connect/gap-fill/prune/corridor passes before production use."
        },
        "segments": [asdict(s) for s in segments]
    }
    output_path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {len(segments):,} candidate segments to {output_path}")


# ============================================================
# FUTURE PIPELINE PASSES
# ============================================================

def build_seed_network(segments: Iterable[Segment]) -> List[Segment]:
    return [s for s in segments if s.seedTier == 1]


def connector_candidates(segments: Iterable[Segment], max_tier: int) -> List[Segment]:
    return [s for s in segments if s.seedTier <= max_tier]


def gap_burden_minutes(distance_miles: float, stress: float, mph: float = 12.0) -> float:
    """
    Generic future helper:
    bad connectors are evaluated as time * stress rather than distance alone.
    """
    physical = distance_miles / max(mph, 1) * 60
    return physical * (1 + stress)


def future_pipeline_notes() -> str:
    return """
NEXT PASSES TO IMPLEMENT IN THIS FILE
-------------------------------------
A. scenery:
   spatially join route segments against water, forest, coast, protected land,
   agriculture, industry, topography, etc.

B. elevation:
   sample a DEM and populate ascent/grade.

C. connect:
   begin with seedTier 1 components, then progressively allow tiers 2 and 3
   near useful component endpoints.

D. gap-fill:
   allow tier 4 ordinary roads only for low generalized connector burden.

E. prune:
   remove short isolated branches unless they improve long-distance
   connectivity or reach an important destination/service/ferry.

F. corridor grouping:
   compress the Touring Core into human-scale continental corridors while
   preserving exact underlying geometry.

G. destinations:
   attach cities, towns, historical/natural features and importance scores.
""".strip()


# ============================================================
# DEMO DATA
# ============================================================

def write_demo(output_path: Path) -> None:
    bundled = Path(__file__).with_name("fake_data.json")
    if not bundled.exists():
        raise SystemExit("fake_data.json must be beside build_network.py for the demo command.")
    output_path.write_bytes(bundled.read_bytes())
    print(f"Wrote demo network to {output_path}")


# ============================================================
# CLI
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Bike Trip Generator preprocessing pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    demo = sub.add_parser("demo", help="Copy bundled fake demo data")
    demo.add_argument("--output", type=Path, default=Path("fake_data_copy.json"))

    pbf = sub.add_parser("pbf", help="Extract broad candidate graph from an .osm.pbf")
    pbf.add_argument("input", type=Path)
    pbf.add_argument("output", type=Path)
    pbf.add_argument("--region", required=True, choices=["europe","north_america","other"])

    sub.add_parser("plan", help="Print the remaining preprocessing stages")

    args = parser.parse_args()

    if args.command == "demo":
        write_demo(args.output)
    elif args.command == "pbf":
        extract_pbf(args.input, args.output, args.region)
    elif args.command == "plan":
        print(future_pipeline_notes())


if __name__ == "__main__":
    main()
