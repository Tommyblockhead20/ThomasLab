"""Build CMS hospital ratings and audited BTS transit proximity for Find Your Place."""

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from importlib import import_module
from pathlib import Path

import numpy as np
import shapefile
from shapely import STRtree, make_valid, points
from shapely.geometry import shape

from find_your_place_hospital_details import read_measure
from find_your_place_spatial import NearbyPoints, cms_hospital_locations


county_builder = import_module("build-find-your-place-metrics")
city_builder = import_module("build-find-your-place-city-spatial")
PROJECT = county_builder.PROJECT
HOSPITAL_TYPES = {"Acute Care Hospitals", "Critical Access Hospitals"}
# NTD modes grouped by the corresponding GTFS stop types. NTD bus categories share GTFS type 3.
TRANSIT_MODES = {
    "LR": "0", "SR": "0", "HR": "1", "CR": "2", "AR": "2", "YR": "2",
    "MB": "3", "CB": "3", "RB": "3", "FB": "4", "CC": "5", "TR": "6",
    "IP": "7", "TB": "11", "MG": "12",
}
TRANSIT_STOP_TYPES = set(TRANSIT_MODES.values())
MIN_FEED_MILES = .95
MIN_AUDITED_POPULATION = .90


def normalized_name(name):
    folded = unicodedata.normalize("NFKD", name.casefold()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", folded.replace("saint ", "st ").replace("sainte ", "ste "))


def county_boundaries(source, live_counties):
    codes, geometries, names = [], [], defaultdict(set)
    aliases = {modern: old for old in live_counties for modern in county_builder.equivalent_counties(old)
               if modern not in live_counties}
    with shapefile.Reader(str(source / "city-boundaries-county.zip")) as data:
        for entry in data.iterShapeRecords(fields=["GEOID", "NAME", "NAMELSAD"]):
            modern, name, full_name = entry.record
            code = aliases.get(modern, modern)
            if code not in live_counties:
                continue
            # A bare name may match both a county and an independent city.
            names[code[:2], normalized_name(name)].add(code)
            names[code[:2], normalized_name(full_name)].add(code)
            geometry = shape(entry.shape.__geo_interface__)
            codes.append(code)
            geometries.append(geometry if geometry.is_valid else make_valid(geometry))
    return codes, STRtree(geometries), names, aliases


def official_geocodes(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        geocodes = {
            row[0].zfill(6): (*map(float, row[5].split(",")), row[8] + row[9])
            for row in csv.reader(file) if len(row) >= 12 and row[2:4] == ["Match", "Exact"]
        }
    if len(geocodes) < 2500:
        raise ValueError("Census hospital street-address geocodes are incomplete")
    return geocodes


def hospital_ratings(source, county_geo, states, city_ids, city_tree, places, members):
    county_ids, county_tree, county_names, aliases = county_geo
    geocodes = official_geocodes(source / "cms-hospital-geocoded.csv")
    outcomes = read_measure(source / "cms-outcomes.csv", "Measure ID", "MORT_30_HF", "Score", "Denominator", 25)
    experience = read_measure(source / "cms-experience.csv", "HCAHPS Measure ID", "H_HSP_RATING_9_10",
                              "HCAHPS Answer Percent", "Number of Completed Surveys", 100)
    cities_by_name = defaultdict(set)
    for code, name, *_ in places:
        cities_by_name[code[9:11], normalized_name(name)].add(code)
    counties, cities, uncertain_cities = defaultdict(list), defaultdict(list), defaultdict(list)
    counts, seen = Counter(), set()
    for row, location, exact in cms_hospital_locations(source):
        facility = row["Facility ID"].zfill(6)
        state = states.get(row["State"])
        if not state or row["Hospital Type"] not in HOSPITAL_TYPES or facility in seen:
            continue
        seen.add(facility)
        rating = county_builder.numeric(row["Hospital overall rating"])
        counts["facilities"] += 1
        expected = county_names[state, normalized_name(row["County/Parish"])]
        exact_point, found_county = None, None
        census = geocodes.get(facility)
        if census and census[2].startswith(state):
            county = aliases.get(census[2], census[2])
            if county in county_ids and (not expected or county in expected):
                exact_point, found_county = points(*census[:2]), county
                counts["census"] += 1
        if exact_point is None and exact:
            point = points(location[1], location[0])
            candidates = {county_ids[i] for i in county_tree.query(point, predicate="covered_by")
                          if county_ids[i].startswith(state)}
            if expected:
                candidates &= expected
            if len(candidates) == 1:
                exact_point, found_county = point, candidates.pop()
                counts["hrsa"] += 1
        if found_county is None and len(expected) == 1:
            found_county = next(iter(expected))
        measures = (rating, outcomes.get(facility), experience.get(facility))
        if found_county:
            counties[found_county].append(measures)
        else:
            counts["unassigned county"] += 1
        if exact_point is not None:
            for city in {city_ids[i] for i in city_tree.query(exact_point, predicate="covered_by")
                         if city_ids[i][9:11] == state}:
                cities[city].append(measures)
        else:
            # Postal localities and ZIP centers can flag a possible match but cannot assign a score.
            possible = set(cities_by_name[state, normalized_name(row["City/Town"])])
            if location:
                possible.update(city_ids[i] for i in city_tree.query(points(location[1], location[0]),
                                                                    predicate="covered_by")
                                if city_ids[i][9:11] == state)
            for city in possible:
                uncertain_cities[city].append(rating)

    def summarize(values, unresolved=()):
        rated = [star for star, *_ in values if star is not None and 1 <= star <= 5]
        total = len(values) + len(unresolved)
        if rated and len(rated) >= .60 * total and all(star is None for star in unresolved):
            details = []
            for column in (1, 2):
                samples = [row[column] for row in values if row[column] is not None]
                details.extend((round(sum(samples) / len(samples), 4) if len(samples) >= .60 * total else None,
                                len(samples)))
            return [round(sum(rated) / len(rated), 4), len(rated), total, *details]
        return None

    print("Hospital assignment:", dict(counts), flush=True)
    if counts["facilities"] < 4400 or counts["unassigned county"] > 100:
        raise ValueError("CMS general hospital snapshot or county matching is incomplete")
    return {
        "county": {code: result for code, values in sorted(counties.items()) if (result := summarize(values))},
        "metro": {code: result for code, group in sorted(members.items())
                  if (result := summarize([row for county in set(group) for row in counties.get(county, ())]))},
        "city": {code: result for code, values in sorted(cities.items())
                 if (result := summarize(values, uncertain_cities.get(code, ())))},
    }


def transit_areas(source):
    """Identify Census urban areas at the same scale as the FTA service allocation."""
    with shapefile.Reader(str(source / "census-urban-areas-2020.zip")) as data:
        codes, geometries = [], []
        for entry in data.iterShapeRecords(fields=["GEOID20"]):
            geometry = shape(entry.shape.__geo_interface__)
            codes.append(entry.record["GEOID20"])
            geometries.append(geometry if geometry.is_valid else make_valid(geometry))
    return np.asarray(codes), STRtree(geometries)


def transit_stops(source, area_codes, area_tree, county_geo, reported):
    positions, evidence = set(), defaultdict(set)
    with county_builder.read_csv_source(source / "ntm-stops-2026.csv") as file:
        for row in csv.DictReader(file):
            if row["location_type"] not in {"0", "", "Null"} or row["download_date"] < "2026-09-01":
                continue
            modes = TRANSIT_STOP_TYPES.intersection(row["stop_type"].split(";"))
            if not modes:
                continue
            lat, lon = county_builder.numeric(row["stop_lat"]), county_builder.numeric(row["stop_lon"])
            if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180 and (lat or lon)):
                continue
            point = (round(lat, 5), round(lon, 5))
            positions.add(point)
            evidence[point].update((row["ntd_id"], mode) for mode in modes)
    if len(positions) < 350000:
        raise ValueError("September 2026 BTS stop export lacks national coverage")
    stops = sorted(positions)
    lat, lon = np.asarray(stops).T
    stop_points = points(lon, lat)
    origin_ids, area_ids = area_tree.query(stop_points, predicate="covered_by")
    covered = defaultdict(set)
    urban_stops = np.zeros(len(stops), dtype=bool)
    for position, area in zip(origin_ids, area_ids):
        code = area_codes[area]
        if code in reported:
            urban_stops[position] = True
            covered[code].update(evidence[stops[position]])
    county_ids, county_tree = county_geo[:2]
    rural_stops = np.flatnonzero(~urban_stops)
    stop_indices, county_indices = county_tree.query(stop_points[rural_stops], predicate="covered_by")
    for index, county in zip(stop_indices, county_indices):
        covered["R" + county_ids[county][:2]].update(evidence[stops[rural_stops[index]]])
    return NearbyPoints(((lat, lon, True) for lat, lon in stops), .5), covered


def transit_allocations(source, known_codes):
    reported = defaultdict(Counter)
    with (source / "ntd-allocations-2025.csv").open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            code, mode = row["urbanized_area_code"], TRANSIT_MODES.get(row["mode"])
            if row["urbanized_area_name"].endswith(" Non-UZA"):
                code = "R" + code[-2:]
            elif code not in known_codes:
                continue
            miles = county_builder.numeric(row["total_actual_vrm"])
            if row["year"] != "2025" or mode is None or not miles or miles < 0:
                continue
            reported[code][row["_5_digit_ntd_id"], mode] += miles
    if len(reported) < 350:
        raise ValueError("FTA transit allocations lack national coverage")
    return reported


def transit_access(source, city_ids, city_tree, reference_population, members, live, county_geo):
    area_codes, area_tree = transit_areas(source)
    reported = transit_allocations(source, set(area_codes))
    stops, seen_modes = transit_stops(source, area_codes, area_tree, county_geo, reported)
    audit = {code: sum(miles for mode, miles in agencies.items() if mode in seen_modes.get(code, ()))
             / sum(agencies.values()) for code, agencies in reported.items()}
    trusted_areas = {code for code, score in audit.items() if score >= MIN_FEED_MILES}
    origins, lon, lat, pop, tracts = city_builder.load_population(source / "city-pop-centers.csv")
    origin_ids, area_indices = area_tree.query(origins, predicate="covered_by")
    area_for_origin = {int(i): area_codes[area] for i, area in zip(origin_ids, area_indices)
                       if area_codes[area] in reported}
    ct_tracts = county_builder.retailer_tracts(source / "usda-sram.zip", live)
    county_aliases = county_geo[3]
    county_codes = []
    for tract in tracts:
        code = ct_tracts.get(tract, (tract[:5],))[0] if tract.startswith("09") else tract[:5]
        county_codes.append(county_aliases.get(code, code))
    near_stop = np.zeros(len(origins), dtype=bool)
    audited = np.asarray([area_for_origin.get(i, "R" + code[:2]) in trusted_areas
                          for i, code in enumerate(county_codes)])
    for i in np.flatnonzero(audited):
        near_stop[i] = next(stops.within(lat[i], lon[i]), None) is not None
    # A statewide non-urban allocation can screen reporting completeness but cannot establish
    # service in every county. Require direct local stop evidence before counting these origins.
    rural_with_service = {county_codes[i] for i in np.flatnonzero(near_stop) if i not in area_for_origin}
    for i in np.flatnonzero(audited):
        if i not in area_for_origin and county_codes[i] not in rural_with_service:
            audited[i] = False
    matched, nearby = pop * audited, pop * near_stop
    scores = {"county": {}, "metro": {}, "city": {}}

    def result(total, verified, reached):
        if total and verified >= MIN_AUDITED_POPULATION * total:
            return [round(float(reached / verified), 5), round(float(verified / total), 4)]
        return None

    counts = defaultdict(lambda: np.zeros(3, dtype=np.int64))
    for i, code in enumerate(county_codes):
        if code in live["county"]:
            counts[code] += (pop[i], matched[i], nearby[i])
    for code, totals in sorted(counts.items()):
        if value := result(*totals):
            scores["county"][code] = value
    for code, counties in sorted(members.items()):
        if not all(county in counts for county in counties):
            continue
        if value := result(*sum(counts[county] for county in set(counties))):
            scores["metro"][code] = value

    source_indices, city_indices = city_tree.query(origins, predicate="covered_by")
    n = len(city_ids)
    sample_counts = np.bincount(city_indices, minlength=n)
    totals = np.bincount(city_indices, weights=pop[source_indices], minlength=n)
    verified = np.bincount(city_indices, weights=matched[source_indices], minlength=n)
    reached = np.bincount(city_indices, weights=nearby[source_indices], minlength=n)
    for j, code in enumerate(city_ids):
        expected = reference_population.get(code, 0)
        if expected and sample_counts[j] >= 3 and .85 * expected <= totals[j] <= 1.15 * expected:
            if value := result(totals[j], verified[j], reached[j]):
                scores["city"][code] = value
    print(f"Transit feed check: {len(trusted_areas)} of {len(audit)} FTA service areas passed", flush=True)
    for code in ("80389", "51445", "63217", "69076", "16264"):
        print(f"  Census urban area {code}: {audit.get(code, 0):.1%} of FTA miles have mapped agency/mode stops")
    return scores


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=PROJECT / "local-services.js")
    args = parser.parse_args()
    live, _, members = county_builder.app_geography()
    states, = county_builder.app_data("STATE_ABBR_BY_FIPS")
    city_data = (PROJECT / "city-data.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\r\n")
    places = json.loads(city_data)["places"]
    references = {row[0]: row[4] for row in places if row[4] and row[4] > 0}
    city_ids, city_shapes = city_builder.load_places(args.source, {row[0] for row in places})
    city_tree = STRtree(city_shapes)
    county_geo = county_boundaries(args.source, live["county"])
    hospital = hospital_ratings(args.source, county_geo, {abbr: fips for fips, abbr in states.items()},
                                city_ids, city_tree, places, members)
    transit = transit_access(args.source, city_ids, city_tree, references, members, live, county_geo)
    for name, rows in (("Hospital ratings", hospital), ("Audited transit", transit)):
        print(name, {kind: len(values) for kind, values in rows.items()}, flush=True)
        if not all(rows.values()):
            raise ValueError(f"{name} is missing an entire view")
    data = json.dumps({"hospital": hospital, "transit": transit}, separators=(",", ":"), allow_nan=False)
    args.output.write_text("// Generated by scripts/build-find-your-place-local-services.py.\n"
                           f"window.findYourPlaceLocalServices={data};\n", encoding="utf-8")


if __name__ == "__main__":
    main()
