"""Match public CARES emergency-department drive-time map tiles to Census counties.

Requires pyshp, Shapely, and mapbox-vector-tile. Supply the downloaded Census
2024 county cartographic boundary zip and an output JSON path.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import gzip
import json
import math
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.request import urlopen

import mapbox_vector_tile
import shapefile
from shapely import GeometryCollection, MultiPolygon, Polygon, STRtree, make_valid
from shapely.geometry import shape
from shapely.ops import transform


ZOOM = 6
N = 2 ** ZOOM
TILES = (
    "https://tiles.arcgis.com/tiles/XZWEusZqpZcXQwOs/arcgis/rest/services/"
    "CMS_Hospital_Drive_Time/VectorTileServer/tile"
)
LAYER = "ED_LandScan_DriveTime_County"


def longitude_tile(lon, lat, z=None):
    x = (lon + 180) * N / 360
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) * N / 2
    return x, y


def partitions(geometry):
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, (GeometryCollection, MultiPolygon)):
        return [part for child in geometry.geoms for part in partitions(child)]
    return []


def read_counties(path):
    counties = []
    tiles = set()
    with shapefile.Reader(str(path)) as records:
        for row in records.iterShapeRecords(fields=["GEOID"]):
            parts = []
            for part in partitions(shape(row.shape.__geo_interface__)):
                if part.bounds[2] - part.bounds[0] > 180:
                    continue
                part = make_valid(transform(longitude_tile, part))
                left, top, right, bottom = part.bounds
                for x in range(max(0, math.floor(left)), min(N, math.floor(right) + 1)):
                    for y in range(max(0, math.floor(top)), min(N, math.floor(bottom) + 1)):
                        tiles.add((x, y))
                parts.append(part)
            if parts:
                counties.append((row.record["GEOID"], GeometryCollection(parts)))
    return counties, tiles


def fetch_tile(tile, cache=None):
    x, y = tile
    cached = cache / f"{ZOOM}-{y}-{x}.pbf" if cache else None
    if cached and cached.is_file():
        data = cached.read_bytes()
    else:
        for attempt in range(3):
            try:
                with urlopen(f"{TILES}/{ZOOM}/{y}/{x}.pbf", timeout=18) as response:
                    data = response.read()
                break
            except HTTPError as error:
                if error.code == 404:
                    data = b""
                    break
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        if cached:
            cached.write_bytes(data)
    if not data:
        return tile, None
    if data.startswith(b"\x1f\x8b"):
        data = gzip.decompress(data)
    return tile, mapbox_vector_tile.decode(data, default_options={"y_coord_down": True}).get(LAYER)


def match_counties(counties, tiles, cache):
    boundaries = [geometry for _, geometry in counties]
    tree = STRtree(boundaries)
    matches = {}
    with ThreadPoolExecutor(max_workers=7) as pool:
        for (x, y), layer in pool.map(lambda tile: fetch_tile(tile, cache), sorted(tiles)):
            if not layer:
                continue
            extent = layer["extent"]
            for feature in layer["features"]:
                p = feature["properties"]
                minutes, coverage = p.get("AvgDriveMin"), p.get("PctPopCovered")
                if minutes is None or not 0 <= minutes <= 720 or coverage is None or not 60 <= coverage <= 100:
                    continue
                if not feature["geometry"]:
                    continue
                geometry = make_valid(transform(lambda u, v: (x + u / extent, y + v / extent),
                                                shape(feature["geometry"])))
                if geometry.area < 1e-7:
                    continue
                candidates = sorted(((geometry.intersection(boundaries[i]).area, i)
                                     for i in tree.query(geometry)), reverse=True)
                if not candidates:
                    continue
                area, index = candidates[0]
                next_area = candidates[1][0] if len(candidates) > 1 else 0
                if area < .88 * min(geometry.area, boundaries[index].area) or next_area > .12 * area:
                    continue
                code = counties[index][0]
                current = matches.get(code)
                if not current or area > current[0]:
                    matches[code] = (area, round(minutes, 3), round(coverage / 100, 4))
    return {key: row[1:] for key, row in sorted(matches.items())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("boundaries", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cache", type=Path)
    args = parser.parse_args()
    counties, tiles = read_counties(args.boundaries)
    if args.cache:
        args.cache.mkdir(parents=True, exist_ok=True)
    rows = match_counties(counties, tiles, args.cache)
    print(f"Matched {len(rows)} county travel-time records from {len(tiles)} map tiles.")
    if len(rows) < 3000 or any(code not in rows for code in ("06037", "17031", "25025", "36061")):
        raise ValueError("Insufficient or implausible CARES boundary matches")
    args.output.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
