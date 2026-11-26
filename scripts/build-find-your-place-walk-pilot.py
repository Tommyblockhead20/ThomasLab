"""Estimate 15-minute city walking access using cached OpenStreetMap extracts."""

import argparse
import csv
from collections import defaultdict
from heapq import heapify, heappop, heappush
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from shapely import Point, STRtree
import shapefile
from shapely.geometry import shape


PLACES = {
    "0618100": ("davis", (38.510, -121.815, 38.596, -121.671)),
    "0686328": ("woodland", (38.634, -121.841, 38.725, -121.708)),
    "0684816": ("west-sacramento", (38.503, -121.618, 38.622, -121.475)),
    "0686034": ("winters-buffered", (38.496, -122.023, 38.572, -121.933)),
}
LIMIT_METERS = 1200
SNAP_LIMIT = 150
RESTRICTED = {"no", "private", "customers", "destination"}
WALKABLE = ("footway|path|pedestrian|living_street|steps|residential|unclassified|service|primary|secondary|"
            "tertiary|track|cycleway|primary_link|secondary_link|tertiary_link")


def fetch_extract(path, bounds):
    box = ",".join(str(value) for value in bounds)
    query = (f'[out:json][timeout:30];way["highway"~"^({WALKABLE})$"]({box});out body geom;'
             f'(nwr["amenity"~"^(pharmacy|cafe|restaurant|library)$"]({box});'
             f'nwr["shop"~"^(supermarket|greengrocer)$"]({box});node["barrier"]({box}););out body center;')
    providers = ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter")
    for endpoint in providers:
        try:
            url = endpoint + "?" + urlencode({"data": query})
            with urlopen(Request(url, headers={"User-Agent": "ThomasLab data research (thomaslab.me)"}), timeout=35) as response:
                data = json.load(response)
            if data.get("remark") or len(data.get("elements", [])) < 150:
                raise ValueError("Incomplete walking-network response")
        except (OSError, ValueError) as error:
            print(f"{path.name}: {error}", flush=True)
            continue
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        return


def category(tags):
    if tags.get("shop") in {"supermarket", "greengrocer"}:
        return 0
    return {"pharmacy": 1, "library": 2, "cafe": 3, "restaurant": 3}.get(tags.get("amenity"))


def network(elements, project):
    closed = {row["id"] for row in elements if row["type"] == "node"
              and row.get("tags", {}).get("barrier") in {"gate", "fence", "wall", "block"}
              and row["tags"].get("foot", row["tags"].get("access")) in RESTRICTED}
    graph = defaultdict(dict)
    nodes = {}
    for way in elements:
        tags = way.get("tags", {})
        if "highway" not in tags or "geometry" not in way:
            continue
        if tags.get("foot", tags.get("access")) in RESTRICTED:
            continue
        for identifier, coords in zip(way["nodes"], way["geometry"], strict=True):
            nodes[identifier] = project(coords["lat"], coords["lon"])
        direction = tags.get("oneway:foot")
        for left, right in zip(way["nodes"], way["nodes"][1:]):
            if left in closed or right in closed:
                continue
            length = math.dist(nodes[left], nodes[right])
            # Travel outward from destinations on reversed walking links.
            if direction != "-1":
                graph[right][left] = length
            if direction not in {"yes", "1"}:
                graph[left][right] = length
    attached = set(graph).union(*(neighbors.keys() for neighbors in graph.values()))
    return graph, {key: nodes[key] for key in attached}


def shortest_walks(graph, starts):
    queue = [(distance, node) for node, distance in starts.items()]
    heapify(queue)
    best = dict(starts)
    while queue:
        distance, node = heappop(queue)
        if distance != best[node]:
            continue
        for other, length in graph.get(node, {}).items():
            candidate = distance + length
            if candidate <= LIMIT_METERS and candidate < best.get(other, math.inf):
                best[other] = candidate
                heappush(queue, (candidate, other))
    return best


def pilot(path, origins, bounds):
    south, west, north, east = bounds
    longitude_scale = 111320 * math.cos(math.radians((south + north) / 2))

    def project(lat, lon):
        return (lon - west) * longitude_scale, (lat - south) * 111320

    elements = json.loads(path.read_text(encoding="utf-8"))["elements"]
    graph, nodes = network(elements, project)
    identifier = sorted(nodes)
    tree = STRtree([Point(nodes[node]) for node in identifier])

    def snap(point):
        indexes, distances = tree.query_nearest(Point(point), max_distance=SNAP_LIMIT,
                                                return_distance=True, all_matches=False)
        return (identifier[int(indexes[0])], float(distances[0])) if len(indexes) else None

    starts = [dict() for _ in range(4)]
    for feature in elements:
        kind = category(feature.get("tags", {}))
        location = feature.get("center", feature)
        if kind is None or "lat" not in location:
            continue
        match = snap(project(location["lat"], location["lon"]))
        if match:
            node, distance = match
            starts[kind][node] = min(starts[kind].get(node, math.inf), distance)
    if sum(bool(values) for values in starts) < 2:
        return None
    distances = [shortest_walks(graph, source) for source in starts]
    covered = 0
    reached = [0] * 5
    width, height = project(north, east)
    for lat, lon, residents in origins:
        x, y = project(lat, lon)
        if min(x, y, width - x, height - y) < LIMIT_METERS:
            continue
        match = snap((x, y))
        if match:
            node, distance = match
            accessible = [distance + route.get(node, math.inf) <= LIMIT_METERS for route in distances]
            for i, available in enumerate([sum(accessible) >= 2, *accessible]):
                if available:
                    reached[i] += residents
            covered += residents
    total = sum(row[2] for row in origins)
    if total and covered >= .85 * total:
        return [*(round(count / covered, 4) for count in reached), round(covered / total, 4)]
    return None


def build(source):
    with shapefile.Reader(str(source / "city-boundaries-place.zip")) as file:
        boundaries = {row.record["GEOID"]: shape(row.shape.__geo_interface__)
                      for row in file.iterShapeRecords(fields=["GEOID"]) if row.record["GEOID"] in PLACES}
    directory = Path(__file__).resolve().parents[1] / "FindYourPlace" / "city-data.js"
    places = json.loads(directory.read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\r\n"))["places"]
    population = {row[0][9:]: row[4] for row in places if row[0].startswith("1600000US")}
    origins = defaultdict(list)
    with (source / "city-pop-centers.csv").open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            if row["STATEFP"] != "06" or row["COUNTYFP"] not in {"067", "113", "095"}:
                continue
            lat, lon = float(row["LATITUDE"]), float(row["LONGITUDE"])
            residents = int(row["POPULATION"])
            if not residents:
                continue
            for code, geometry in boundaries.items():
                if geometry.covers(Point(lon, lat)):
                    origins[code].append((lat, lon, residents))
    rows = {}
    for code, (name, bounds) in PLACES.items():
        path = source / f"walk-osm-{name}.json"
        total = sum(row[2] for row in origins[code])
        if path.is_file() and len(origins[code]) >= 3 and .65 * population[code] <= total <= 1.35 * population[code]:
            if result := pilot(path, origins[code], bounds):
                rows["1600000US" + code] = result
                print(name, result)
    if not rows:
        raise ValueError("No pilot cities met walking network and population coverage requirements")
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--fetch", action="store_true", help="download missing OpenStreetMap samples")
    args = parser.parse_args()
    if args.fetch:
        for name, bounds in PLACES.values():
            path = args.source / f"walk-osm-{name}.json"
            if not path.is_file():
                fetch_extract(path, bounds)
    rows = build(args.source)
    (args.source / "city-walk-pilot.json").write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
