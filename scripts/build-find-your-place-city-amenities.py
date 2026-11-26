"""Build city amenity and reported-crime previews from public location and agency data."""

import argparse
import csv
import json
import math
import re
from collections import Counter, defaultdict
from html.parser import HTMLParser
from importlib import import_module
from pathlib import Path

import duckdb
import numpy as np
from shapely import STRtree, points

from find_your_place_spatial import NearbyPoints


PROJECT = Path(__file__).resolve().parents[1] / "FindYourPlace"
spatial = import_module("build-find-your-place-city-spatial")
city_builder = import_module("build-find-your-place-cities")
crime_audit = import_module("audit-find-your-place-city-crime")
YEAR_RANGE = (2023, 2024, 2025)
RELEASE = "2026-11-18.0"
VENUE_GROUPS = ("dining", "nightlife", "performance", "galleries", "museums", "animals", "amusement", "arcades")
BAR_TYPES = {"bar", "beer_bar", "brewpub", "cocktail_bar", "pub", "sports_bar", "tavern", "wine_bar"}
NON_DRINKING_BAR_TYPES = {"cigar_bar", "hookah_bar", "juice_bar", "mocktail_bar", "oxygen_bar"}
PERFORMANCE_TYPES = {"amphitheater", "ballet_theater", "cabaret", "comedy_club", "concert_hall", "live_music_venue",
                     "dinner_theater", "jazz_and_blues_venue", "music_venue", "opera_house", "performing_arts_center",
                     "performing_arts_venue", "theater"}
CONFLICTING_CRIME_TOTALS = {"1600000US0653000"}  # Oakland’s own year-end totals differ materially.
EXACT_COUNTY_CITIES = {
    "1600000US0809280": "08014", "1600000US0820000": "08031", "1600000US1150000": "11001",
    "0500000US15003": "15003", "1600000US2404000": "24510", "1600000US2965000": "29510",
    "1600000US3209700": "32510", "1600000US4260000": "42101",
}


def snapshot(name):
    body = (PROJECT / name).read_text(encoding="utf-8")
    return json.loads(body.split("=", 1)[1].rstrip(";\r\n"))


def extract_venues(db, source):
    db.execute("LOAD httpfs")
    db.execute("SET s3_region = 'us-west-2'")
    path = str((source / "city-amenity-open-places.parquet").resolve()).replace("\\", "/").replace("'", "''")
    db.execute(f"""
        COPY (
          SELECT id, names.primary AS name, confidence, basic_category,
                 taxonomy.primary AS category, bbox.xmin AS lon, bbox.ymin AS lat
          FROM read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*')
          WHERE confidence >= .75 AND names.primary IS NOT NULL
            AND (operating_status IS NULL OR operating_status = 'open')
            AND ((bbox.xmin BETWEEN -125 AND -66 AND bbox.ymin BETWEEN 24 AND 50)
              OR (bbox.xmin BETWEEN -179.99 AND -129 AND bbox.ymin BETWEEN 50 AND 72)
              OR (bbox.xmin BETWEEN -161 AND -154 AND bbox.ymin BETWEEN 18 AND 23)
              OR (bbox.xmin BETWEEN -68 AND -65 AND bbox.ymin BETWEEN 17 AND 19))
            AND (basic_category IN ('restaurant','bar','museum','art_gallery','performing_arts_venue','theater',
                   'amusement_park','zoo','aquarium','botanical_garden','music_venue','opera_house','arcade',
                   'sports_bar','nightclub','brewery','wine_bar','cabaret','comedy_club','concert_hall')
              OR taxonomy.primary LIKE '%theater%' OR taxonomy.primary LIKE '%gallery%'
              OR taxonomy.primary LIKE '%botanical%' OR taxonomy.primary LIKE '%performing_arts%'
              OR taxonomy.primary IN ('live_music_venue','brewpub','cocktail_bar','pub','tavern','comedy_club'))
        ) TO '{path}' (FORMAT PARQUET)
    """)


def venue_group(basic, category):
    if basic == "restaurant":
        return "dining"
    if (basic == "bar" or category in BAR_TYPES) and category not in NON_DRINKING_BAR_TYPES:
        return "nightlife"
    if category in PERFORMANCE_TYPES or (basic == "performing_arts_venue" and "movie" not in category):
        return "performance"
    if basic == "art_gallery" or category == "art_gallery":
        return "galleries"
    if basic == "museum":
        return "museums"
    if basic in {"zoo", "aquarium", "botanical_garden"} or category in {"zoo", "aquarium", "botanical_garden"}:
        return "animals"
    if basic == "amusement_park" or category == "amusement_park":
        return "amusement"
    if basic == "arcade" or category in {"arcade", "video_game_arcade"}:
        return "arcades"
    return None


def venue_batches(db, source):
    locations = NearbyPoints([], .025)  # Approximately 40 meters.
    result = db.execute("""
        SELECT name, coalesce(basic_category, ''), coalesce(category, ''), lon, lat
        FROM read_parquet(?)
        WHERE name IS NOT NULL AND lon IS NOT NULL AND lat IS NOT NULL
        ORDER BY confidence DESC, id
    """, [str(source / "city-amenity-open-places.parquet")])
    while batch := result.fetchmany(50_000):
        rows = [[] for _ in VENUE_GROUPS]
        for name, basic, category, lon, lat in batch:
            group = venue_group(basic, category)
            label = crime_audit.normalized(name)
            if not group or not label:
                continue
            value = (group, label)
            if any(other == value for _, other in locations.within(lat, lon)):
                continue
            point = locations.point(lat, lon)
            locations.cells[locations.cell(point)].append((point, value))
            rows[VENUE_GROUPS.index(group)].append((lon, lat))
        yield rows


def venue_counts(db, source, populations, county_codes):
    identifiers = set(populations) | {"0500000US" + code for code in county_codes}
    codes, boundaries = spatial.load_places(source, identifiers)
    tree = STRtree(boundaries)
    counts = np.zeros((len(codes), len(VENUE_GROUPS)), dtype=np.int64)
    for groups in venue_batches(db, source):
        for i, group in enumerate(groups):
            if group:
                _, area = tree.query(points(np.asarray(group)), predicate="within")
                counts[:, i] += np.bincount(area, minlength=len(codes))
    return {code: rows.tolist() for code, rows in zip(codes, counts, strict=True)}


def amenity_previews(db, source, city_rows):
    census, _, _, place_counties, _ = city_builder.directory(source)
    populations = {row[0]: row[4] for row in city_rows if row[4] and row[4] >= 5_000}
    qcew = json.loads((source / "qcew-round-three.json").read_text(encoding="utf-8"))["amenities"]
    reference = {code: total for code, total in qcew["restaurants"].items() if total >= 25}
    counts = venue_counts(db, source, populations, reference)
    accepted = set()
    for code, total in reference.items():
        mapped = counts.get("0500000US" + code)
        if mapped is not None and .65 <= mapped[0] / total <= 1.65:
            accepted.add(code)
    rows = {}
    for code, population in populations.items():
        if code not in counts:
            continue
        geography = census[code]
        if geography[2] == "place":
            parents = set(place_counties[geography[3]])
            if code == "1600000US1150000":
                parents = {"11001"}
        elif geography[2] in {"cousubs", "counties"}:
            parents = {geography[4] or geography[3]}
        else:
            continue
        venues = counts[code]
        if parents and parents.issubset(accepted) and venues[0] >= max(5, math.ceil(population / 2500)):
            rows[code] = venues
    print(f"Venue coverage check: {len(accepted):,} counties. City venue scores: {len(rows):,}", flush=True)
    for code in ("11001", "06075", "42101", "36061", "25025", "53033"):
        print(code, "mapped:", counts.get("0500000US" + code), "BLS restaurants:", reference.get(code), flush=True)
    return rows


class PoliceDirectory(HTMLParser):
    """Read linked names in the public POST directory."""

    def __init__(self):
        super().__init__()
        self.label = None
        self.city_agencies = set()

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.label = []

    def handle_data(self, data):
        if self.label is not None:
            self.label.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.label is not None:
            name = re.sub(r"\s+", " ", "".join(self.label)).strip()
            if name.endswith(" Police Department"):
                self.city_agencies.add(crime_audit.normalized(name.removesuffix(" Police Department")))
            self.label = None


def crime_previews(source, directory):
    workbook = source / "fbi-city-table-8.xlsx"
    accepted, _ = crime_audit.audit(workbook, directory)
    police = PoliceDirectory()
    police.feed((source / "ca-post-agencies.html").read_text(encoding="utf-8"))
    california = set(accepted["06"])
    _, _, _, place_counties, _ = city_builder.directory(source)
    cities = {}
    for code, name, kind, county, *_ in directory["places"]:
        if code in california and code not in CONFLICTING_CRIME_TOTALS and kind == "City" and county and len(place_counties[code[9:]]) == 1:
            local_name = crime_audit.normalized(name)
            if local_name in police.city_agencies:
                cities[crime_audit.normalized(county), local_name] = code
    federal = {}
    for row in crime_audit.workbook_rows(workbook):
        if row.get("A") == "California" and all(row.get(column, "").isdecimal() for column in ("C", "D", "I")):
            federal[crime_audit.normalized(row["B"])] = tuple(int(row[column]) for column in ("C", "D", "I"))

    exposure = defaultdict(dict)
    city_ids = set(cities.values())
    with (source / "census-place-parts-2025.csv").open(encoding="cp1252", newline="") as file:
        for row in csv.DictReader(file):
            code = "1600000US" + row["STATE"] + row["PLACE"]
            if row["SUMLEV"] == "162" and row["STATE"] == "06" and code in city_ids:
                exposure[code] = {year: city_builder.census_number(row[f"POPESTIMATE{year}"]) for year in YEAR_RANGE}
    months = defaultdict(dict)
    duplicate = set()
    with (source / "ca-crime-monthly.csv").open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            year = int(row["Year"])
            if year not in YEAR_RANGE:
                continue
            key = crime_audit.normalized(row["County"]), crime_audit.normalized(row["NCICCode"])
            values = row["Violent_sum"], row["Property_sum"]
            if key not in cities or not all(value.isdecimal() for value in values):
                continue
            month = (year, int(row["Month"]))
            if month in months[key]:
                duplicate.add(key)
            months[key][month] = tuple(map(int, values))

    target = {(year, month) for year in YEAR_RANGE for month in range(1, 13)}
    result = {}
    for key, code in cities.items():
        if key in duplicate or months[key].keys() != target:
            continue
        residents = exposure[code]
        if any(not residents.get(year) for year in YEAR_RANGE):
            continue
        agency_population, *fbi_counts = federal[key[1]]
        if abs(agency_population - residents[2025]) > .05 * residents[2025]:
            continue
        state_2025 = map(sum, zip(*(months[key][2025, month] for month in range(1, 13))))
        if any(abs(state - fbi) > max(5, .10 * fbi) for state, fbi in zip(state_2025, fbi_counts, strict=True)):
            continue
        person_years = sum(residents.values())
        violent, property_count = map(sum, zip(*months[key].values()))
        result[code] = [round(100_000 * violent / person_years, 2), round(100_000 * property_count / person_years, 2),
                        None, list(YEAR_RANGE), person_years, "municipal"]

    county_crime = snapshot("metric-data.js")["crime"]["county"]
    for code, name, kind, county, *_ in directory["places"]:
        county_code = EXACT_COUNTY_CITIES.get(code)
        if code.startswith("1600000US51") and county and county.casefold() == name.casefold() + " city":
            parts = place_counties[code[9:]]
            if len(parts) == 1:
                county_code, = parts
                if not 510 <= int(county_code[2:]) <= 840:
                    county_code = None
        if county_code in county_crime:
            result[code] = [*county_crime[county_code], "county-equivalent"]
    print("City crime scores:", dict(Counter(row[5] for row in result.values())), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--fetch", action="store_true", help="refresh the Overture extract (requires DuckDB httpfs)")
    parser.add_argument("--extension-directory", type=Path)
    args = parser.parse_args()
    settings = {"threads": 8}
    if args.extension_directory:
        settings["extension_directory"] = str(args.extension_directory)
    with duckdb.connect(config=settings) as db:
        if args.fetch:
            extract_venues(db, args.source)
        directory = snapshot("city-data.js")
        venues = amenity_previews(db, args.source, directory["places"])
    crime = crime_previews(args.source, directory)
    if len(venues) < 1000 or len(crime) < 100:
        raise ValueError("City preview coverage is lower than expected")
    data = json.dumps({"venues": venues, "crime": crime}, separators=(",", ":"), allow_nan=False, sort_keys=True)
    (PROJECT / "city-amenities.js").write_text(
        "// Generated by scripts/build-find-your-place-city-amenities.py.\n"
        f"window.findYourPlaceCityAmenities={data};\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
