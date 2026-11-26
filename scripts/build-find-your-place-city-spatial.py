"""Build city school, transportation, access and hazard estimates.

Requires Shapely, pyshp, NumPy and, for the optional EPA layer, pyogrio and pyproj.
Pass the source directory used by build-find-your-place-cities.py.
"""

import argparse
import csv
import gzip
import json
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

import numpy as np
import shapefile
from shapely import STRtree, from_wkb, make_valid, points
from shapely.geometry import shape

from find_your_place_city_metrics import fetch_city_metrics, local_metrics
from find_your_place_city_air import air_quality
from find_your_place_city_road_safety import road_fatalities
from find_your_place_spatial import ACS_CITY_GEOGRAPHY_ALIASES, boarding_stop_index
from find_your_place_transit_schedule import frequency_for_cities


PROJECT = Path(__file__).resolve().parents[1] / "FindYourPlace"
MUNICIPALITY_IDS = {former: current for current, former in ACS_CITY_GEOGRAPHY_ALIASES.items()}


def load_places(source, ids):
    codes, shapes = [], []
    for kind in ("place", "cousub", "county"):
        with shapefile.Reader(str(source / f"city-boundaries-{kind}.zip")) as data:
            for row in data.iterShapeRecords(fields=["GEOIDFQ"]):
                identifier = row.record["GEOIDFQ"]
                identifier = MUNICIPALITY_IDS.get(identifier, identifier)
                if identifier in ids:
                    geometry = shape(row.shape.__geo_interface__)
                    shapes.append(geometry if geometry.is_valid else make_valid(geometry))
                    codes.append(identifier)
    return codes, shapes


def load_population(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        rows, tracts = [], []
        for row in csv.DictReader(file):
            population = int(row["POPULATION"])
            if population > 0:
                rows.append((float(row["LONGITUDE"]), float(row["LATITUDE"]), population))
                tracts.append(row["STATEFP"] + row["COUNTYFP"] + row["TRACTCE"])
    if len(rows) < 200000:
        raise ValueError("Census block-group population centers lack national coverage")
    lng, lat, population = np.asarray(rows).T
    return points(lng, lat), lng, lat, population.astype(np.int64), tracts


def district_scores(source):
    groups = defaultdict(set)
    with (source / "seda-crosswalk.csv").open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            if row["geo"] == "sedaadmin" and row["year"] == "2025":
                groups[row["seda_id"]].add(row["id"].zfill(7))
    districts = {}
    with gzip.open(source / "seda-county-source.csv.gz", "rt", encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            if row["subcat"] != "all" or row["year"] not in {"2024", "2025"}:
                continue
            try:
                tests, estimate = float(row["tot_asmts"]), float(row["cs_mn_avg_eb"])
            except ValueError:
                continue
            if not tests >= 20 or not np.isfinite(estimate):
                continue
            candidate = (int(row["year"]), tests, estimate)
            key = row["sedaadmin"]
            for district in groups.get(key, {key.zfill(7)}):
                if district not in districts or candidate[:2] > districts[district][:2]:
                    districts[district] = candidate
    return districts


def grades(low, high):
    if not high.isdecimal():
        return range(0)
    start = int(low) if low.isdecimal() else 0
    return range(max(3, start), min(8, int(high)) + 1)


def district_index(source):
    scores = district_scores(source)
    shapes, districts = [], []
    for kind in ("unsd", "elsd", "scsd"):
        with shapefile.Reader(str(source / f"city-boundaries-{kind}.zip")) as data:
            for row in data.iterShapeRecords(fields=["GEOID", "LOGRADE", "HIGRADE"]):
                rec = row.record
                served = grades(rec["LOGRADE"], rec["HIGRADE"])
                if not served:
                    continue
                geometry = shape(row.shape.__geo_interface__)
                shapes.append(geometry if geometry.is_valid else make_valid(geometry))
                districts.append((kind == "unsd", rec["GEOID"], served, scores.get(rec["GEOID"])))
    return STRtree(shapes), districts


def assigned_school_result(districts):
    results = []
    for grade in range(3, 9):
        eligible = [item for item in districts if grade in item[2]]
        unified = [item for item in eligible if item[0]]
        choices = unified or eligible
        if len(choices) == 1 and choices[0][3] is not None:
            year, _, value = choices[0][3]
            results.append((value, year == 2025))
    if len(results) == 6:
        return tuple(sum(row[i] for row in results) / 6 for i in range(2))
    return None


def walkability_at_points(source, longitude, latitude):
    import pyogrio.raw
    from pyproj import Transformer

    archive_path = source / "city-epa-walkability.zip"
    with TemporaryDirectory(prefix="walkability-") as folder, ZipFile(archive_path) as archive:
        database = Path(folder) / "Natl_WI.gdb"
        database.mkdir()
        for filename in archive.namelist():
            member = Path(filename)
            if len(member.parts) == 2 and member.parts[0] == database.name and member.name not in (".", ".."):
                with archive.open(filename) as incoming, (database / member.name).open("wb") as outgoing:
                    shutil.copyfileobj(incoming, outgoing)
        info, _, geometry, fields = pyogrio.raw.read(database, columns=["NatWalkInd"])
    if not info.get("crs") or not len(fields) or len(geometry) < 200000:
        raise ValueError("EPA walkability export is incomplete")
    transform = Transformer.from_crs("EPSG:4326", info["crs"], always_xy=True)
    x, y = transform.transform(longitude, latitude)
    values = np.full(len(longitude), np.nan)
    tree = STRtree(from_wkb(geometry))
    point_ids, polygon_ids = tree.query(points(x, y), predicate="within")
    measured = np.asarray(fields[0][polygon_ids], dtype=float)
    accepted = (measured >= 1) & (measured <= 20)
    values[point_ids[accepted]] = measured[accepted]
    return values


def emergency_drive_times(cache, city_ids, indexes, memberships, lat, lon, pop, reference_pop):
    import mapbox_vector_tile

    x = (lon + 180) * (64 / 360)
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) * 32
    tile_points = defaultdict(list)
    for index in np.unique(indexes):
        tile_points[(int(x[index]), int(y[index]))].append(index)
    minutes = np.full(len(pop), np.nan)
    route_fraction = np.zeros(len(pop))
    for (column, row), ids in tile_points.items():
        path = cache / f"6-{row}-{column}.pbf"
        if not path.is_file() or not path.stat().st_size:
            continue
        data = path.read_bytes()
        if data.startswith(b"\x1f\x8b"):
            data = gzip.decompress(data)
        layer = mapbox_vector_tile.decode(data, default_options={"y_coord_down": True}).get("ED_LandScan_DriveTime_Tract")
        if not layer:
            continue
        geometries, values = [], []
        for feature in layer["features"]:
            props = feature["properties"]
            time, coverage = props.get("AvgDriveMin"), props.get("PctPopCovered")
            if time is not None and 0 <= time <= 720 and coverage is not None and 60 <= coverage <= 100 and feature["geometry"]:
                geometries.append(make_valid(shape(feature["geometry"])))
                values.append((time, coverage / 100))
        if not geometries:
            continue
        extent = layer["extent"]
        point_ids, polygon_ids = STRtree(geometries).query(
            points((x[ids] - column) * extent, (y[ids] - row) * extent), predicate="within")
        matches = Counter(point_ids)
        for point_id, polygon_id in zip(point_ids, polygon_ids, strict=True):
            if matches[point_id] == 1:
                minutes[ids[point_id]], route_fraction[ids[point_id]] = values[polygon_id]

    totals = np.bincount(memberships, weights=pop[indexes], minlength=len(city_ids))
    sample_counts = np.bincount(memberships[route_fraction[indexes] > 0], minlength=len(city_ids))
    covered_weights = pop[indexes] * route_fraction[indexes]
    covered = np.bincount(memberships, weights=covered_weights, minlength=len(city_ids))
    weighted = np.bincount(memberships, weights=covered_weights * np.nan_to_num(minutes[indexes]), minlength=len(city_ids))
    result = {}
    for i, city in enumerate(city_ids):
        if (sample_counts[i] >= 3 and .65 * reference_pop[city] <= totals[i] <= 1.35 * reference_pop[city]
                and covered[i] >= .65 * totals[i]):
            result[city] = [round(weighted[i] / covered[i], 2), round(covered[i] / totals[i], 4)]
    if len(result) < 9000 or any(city not in result for city in ("1600000US4260000", "1600000US1714000")):
        raise ValueError(f"Incomplete emergency drive-time coverage: {len(result)} places")
    print(f"Matched routed emergency drive times for {len(result):,} places", flush=True)
    return result


def aggregate(source, with_walkability, with_transit_frequency, with_local_metrics=False, with_road_safety=False, with_air_quality=False,
              schedule_only=False, with_emergency_drive=False, with_hospital_details=False):
    snapshot = json.loads((PROJECT / "city-data.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\n"))
    reference_pop = {row[0]: row[4] for row in snapshot["places"] if row[4] and row[4] > 0}
    city_ids, city_shapes = load_places(source, reference_pop)
    if with_road_safety:
        return road_fatalities(source, snapshot["places"], city_ids, city_shapes, reference_pop)
    centers, lng, lat, pop, tracts = load_population(source / "city-pop-centers.csv")
    indexes, memberships = STRtree(city_shapes).query(centers, predicate="within")
    print(f"Matched {len(set(indexes)):,} populated block-group centers to Census places", flush=True)
    if with_hospital_details:
        from find_your_place_hospital_details import area_details, quality_lookup, summarize_quality

        counts = np.bincount(memberships, minlength=len(city_ids))
        totals = np.bincount(memberships, weights=pop[indexes], minlength=len(city_ids))
        usable = [counts[i] >= 3 and .65 * reference_pop[city] <= totals[i] <= 1.35 * reference_pop[city]
                  for i, city in enumerate(city_ids)]
        states = snapshot["states"]
        samples = ((city_ids[i], int(pop[j]), lat[j], lng[j], states[city_ids[i][9:11]][0])
                   for j, i in zip(indexes, memberships, strict=True) if usable[i])
        aggregates = area_details(samples, quality_lookup(source))
        return {city: row for city, values in aggregates.items() if (row := summarize_quality([values]))}
    if with_emergency_drive:
        return emergency_drive_times(source / "health-tiles", city_ids, indexes, memberships, lat, lng, pop, reference_pop)
    if schedule_only:
        totals = np.bincount(memberships, weights=pop[indexes], minlength=len(city_ids))
        represented = {i: .65 * reference_pop[city] <= totals[i] <= 1.35 * reference_pop[city]
                       for i, city in enumerate(city_ids)}
        return frequency_for_cities(source, city_ids, zip(indexes, memberships, strict=True), lat, lng, pop, represented)
    if with_air_quality:
        return air_quality(source, snapshot["places"], city_ids, indexes, memberships, lat, lng, pop, reference_pop)
    if with_local_metrics:
        return local_metrics(source, snapshot["places"], snapshot["states"], city_ids, indexes, memberships,
                             lat, lng, pop, tracts, reference_pop)
    stops = boarding_stop_index(source / "ntm-stops-2026.csv")
    near_transit = np.zeros(len(centers), dtype=bool)
    for index in set(indexes):
        near_transit[index] = next(stops.within(lat[index], lng[index]), None) is not None
    walk = walkability_at_points(source, lng, lat) if with_walkability else np.full(len(centers), np.nan)

    tree, districts = district_index(source)
    school_points = defaultdict(list)
    locations, matches = tree.query(centers, predicate="within")
    for index, match in zip(locations, matches, strict=True):
        school_points[index].append(match)
    school_cache = {}
    school_values = {}
    for i, district_ids in school_points.items():
        key = tuple(sorted(district_ids))
        if key not in school_cache:
            school_cache[key] = assigned_school_result([districts[index] for index in key])
        if school_cache[key]:
            school_values[i] = school_cache[key]
    city_school = defaultdict(list)
    covered_cities, covered_districts = tree.query(city_shapes, predicate="covered_by")
    for index, district_id in zip(covered_cities, covered_districts, strict=True):
        city_school[index].append(districts[district_id])

    total, points_count, transit, walk_pop, walk_total, walk_high = (Counter() for _ in range(6))
    school_pop, school_total, school_current = Counter(), Counter(), Counter()
    for point_id, city_index in zip(indexes, memberships, strict=True):
        population = int(pop[point_id])
        total[city_index] += population
        points_count[city_index] += 1
        if near_transit[point_id]:
            transit[city_index] += population
        value = walk[point_id]
        if np.isfinite(value):
            walk_pop[city_index] += population
            walk_total[city_index] += float(value) * population
            if value >= 15.26:
                walk_high[city_index] += population
        if point_id in school_values:
            achievement, current = school_values[point_id]
            school_pop[city_index] += population
            school_total[city_index] += achievement * population
            school_current[city_index] += current * population

    output = {}
    represented_cities = {}
    for index, city in enumerate(city_ids):
        assigned = total[index]
        represented = .65 * reference_pop[city] <= assigned <= 1.35 * reference_pop[city]
        represented_cities[index] = represented
        transit_row = [round(transit[index] / assigned, 4), points_count[index]] if represented and points_count[index] >= 3 and transit[index] else None
        walk_row = None
        expected = reference_pop[city]
        if .85 * expected <= assigned <= 1.15 * expected and points_count[index] >= 3 and walk_pop[index] >= .90 * assigned:
            walk_row = [round(walk_total[index] / walk_pop[index], 3),
                        round(walk_high[index] / walk_pop[index], 4), round(walk_pop[index] / assigned, 4)]
        direct = assigned_school_result(city_school.get(index, []))
        school = None
        if direct:
            school = [round(direct[0], 3), 1, round(direct[1], 3)]
        elif represented and school_pop[index] >= .65 * assigned:
            school = [round(school_total[index] / school_pop[index], 3), round(school_pop[index] / assigned, 3),
                      round(school_current[index] / school_pop[index], 3)]
        if transit_row or walk_row or school:
            output[city] = [transit_row, walk_row, school]
    counts = [sum(row[i] is not None for row in output.values()) for i in range(3)]
    if counts[0] < 500 or (with_walkability and counts[1] < 1500) or counts[2] < 12000:
        raise ValueError(f"Unexpected transit, walkability and school coverage: {counts}")
    print(f"Transit, walkability and school coverage: {counts}", flush=True)
    if with_transit_frequency:
        schedule = frequency_for_cities(source, city_ids, zip(indexes, memberships, strict=True), lat, lng, pop, represented_cities)
        for city, row in schedule.items():
            output.setdefault(city, [None, None, None]).append(row)
        print(f"Added midday service coverage in {len(schedule)} example cities", flush=True)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--walkability", action="store_true", help="include the EPA national walkability archive")
    parser.add_argument("--transit-frequency", action="store_true", help="include the local operator GTFS schedule pilot")
    parser.add_argument("--local-metrics", action="store_true", help="build the separate city services and hazards input")
    parser.add_argument("--fetch-local-metrics", action="store_true", help="cache FEMA, IPEDS and USDA terrain data, then build local metrics")
    outcomes = parser.add_mutually_exclusive_group()
    outcomes.add_argument("--road-safety", action="store_true", help="build city fatality counts from local NHTSA FARS archives")
    outcomes.add_argument("--air-quality", action="store_true", help="build city PM2.5 from local SatPM grids using h5py")
    outcomes.add_argument("--transit-schedule-only", action="store_true", help="refresh frequent transit details in an existing city-access.json")
    outcomes.add_argument("--emergency-drive", action="store_true", help="build city ER drive times from cached CARES tiles")
    outcomes.add_argument("--hospital-details", action="store_true", help="build city hospital outcomes and patient experience")
    args = parser.parse_args()
    if args.fetch_local_metrics:
        fetch_city_metrics(args.source_dir)
    with_local_metrics = args.local_metrics or args.fetch_local_metrics
    output = aggregate(args.source_dir, args.walkability, args.transit_frequency, with_local_metrics, args.road_safety, args.air_quality,
                       schedule_only=args.transit_schedule_only, with_emergency_drive=args.emergency_drive,
                       with_hospital_details=args.hospital_details)
    if args.transit_schedule_only:
        path = args.source_dir / "city-access.json"
        access = json.loads(path.read_text(encoding="utf-8"))
        for city, row in output.items():
            access[city] = access.get(city, [None, None, None])[:3] + [row]
        path.write_text(json.dumps(access, separators=(",", ":")), encoding="utf-8")
        print(f"Refreshed frequent transit details for {len(output)} places")
        return
    filename = ("city-road-safety.json" if args.road_safety else "city-air-quality.json" if args.air_quality
                else "city-emergency-drive.json" if args.emergency_drive
                else "city-hospital-details.json" if args.hospital_details
                else "city-local-metrics.json" if with_local_metrics else "city-access.json")
    (args.source_dir / filename).write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
