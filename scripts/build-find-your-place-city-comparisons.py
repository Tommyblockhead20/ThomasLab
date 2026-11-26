"""Bake PRISM climate, childcare, 2024 voting, and major-league sports for city comparisons."""

import argparse
import csv
import io
import json
import re
import unicodedata
from collections import Counter, defaultdict
from importlib import import_module
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import rowcol

from find_your_place_spatial import ACS_CITY_GEOGRAPHY_ALIASES, NearbyPoints


city_builder = import_module("build-find-your-place-cities")
PROJECT = Path(__file__).resolve().parents[1] / "FindYourPlace"
CITY_ID_ALIASES = {old: new for new, old in ACS_CITY_GEOGRAPHY_ALIASES.items()}
SPORTS_DISTANCE = ((0, 1), (20, 1), (30, .75), (45, .4), (60, .15), (75, 0))
# Existing venues whose current name is newer than the federal point inventory.
FORMER_VENUE_NAMES = {"Gainbridge Fieldhouse": "Bankers Life Fieldhouse",
                      "Grand Casino Arena": "Xcel Energy Center",
                      "Canada Life Centre": "Bell MTS Place"}


def snapshot(path):
    return json.loads(path.read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\r\n"))


def prism_values(path, xy):
    with ZipFile(path) as archive:
        name, = (name for name in archive.namelist() if name.endswith(".tif"))
        with MemoryFile(archive.read(name)) as raster, raster.open() as grid:
            if grid.crs.to_epsg() not in {4269, 4326}:
                raise ValueError(f"Unexpected PRISM coordinates in {path.name}: {grid.crs}")
            values = grid.read(1, masked=True).filled(np.nan)
            rows, cols = rowcol(grid.transform, xy[:, 0], xy[:, 1])
            result = np.full(len(xy), np.nan)
            for dr, dc in ((0, 0), (-1, 0), (0, -1), (0, 1), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                r, c = rows + dr, cols + dc
                valid = np.isnan(result) & (0 <= r) & (r < values.shape[0]) & (0 <= c) & (c < values.shape[1])
                result[valid] = values[r[valid], c[valid]]
            return result


def climate(source, places):
    cities = [(row[0], row[11][::-1]) for row in places if row[11] and row[0][9:11] not in {"02", "15", "72"}]
    xy = np.asarray([point for _, point in cities])
    dew_months = [prism_values(source / f"prism_tdmean_us_25m_2020{month:02}_avg_30y.zip", xy) for month in (6, 7, 8)]
    dew = np.average(dew_months, axis=0, weights=(30, 31, 31)) * 1.8 + 32
    sunshine = prism_values(source / "prism_soltrans_us_30s_2020_avg_30y.zip", xy)
    humidity = {city: round(float(value), 1) for (city, _), value in zip(cities, dew, strict=True) if 0 <= value <= 85}
    sunlight = {city: round(float(value), 4) for (city, _), value in zip(cities, sunshine, strict=True) if 0 <= value <= 1}
    return humidity, sunlight


def childcare(source, places, prices):
    reference = {row[0] for row in places}
    federal_counties = defaultdict(dict)
    with (source / "census-place-parts-2025.csv").open(encoding="cp1252", newline="") as file:
        for row in csv.DictReader(file):
            state = row["STATE"]
            county_code = state + row["COUNTY"]
            if row["SUMLEV"] == "157":
                city_id = "1600000US" + state + row["PLACE"]
            elif row["SUMLEV"] == "061":
                city_id = "0600000US" + county_code + row["COUSUB"]
            elif row["SUMLEV"] == "050":
                city_id = "0500000US" + county_code
            else:
                continue
            city_id = CITY_ID_ALIASES.get(city_id, city_id)
            if city_id in reference and row["POPESTIMATE2022"].isdigit():
                federal_counties[city_id][county_code] = int(row["POPESTIMATE2022"])

    income = city_builder.acs_table(source / "city-b19113-2022.dat", reference | set(ACS_CITY_GEOGRAPHY_ALIASES.values()),
                                    [("B19113_E001", "B19113_M001")])
    result = {}
    for city, parts in sorted(federal_counties.items()):
        family_income = city_builder.precise(income.get(ACS_CITY_GEOGRAPHY_ALIASES.get(city, city), [(None, None)])[0],
                                             limit=.25, minimum=10_000)
        total = sum(parts.values())
        if not family_income or not total:
            continue
        known = [(prices[code][0], residents) for code, residents in parts.items() if code in prices and residents]
        covered = sum(residents for _, residents in known)
        if covered < .90 * total:
            continue
        annual = round(sum(price * residents for price, residents in known) / covered)
        result[city] = [round(annual / family_income, 5), annual, family_income]
    return result


def read_votes(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return {row["bg_GEOID"]: (float(row["bg_population"]), float(row["votes_dem"]), float(row["votes_rep"]))
                for row in csv.DictReader(file, delimiter="\t")
                if all(row[key].strip() not in {"", "NA"} for key in ("bg_population", "votes_dem", "votes_rep"))}


def group_assignments(path, cities):
    state = path.name[14:16]
    if not state.isdigit():
        raise ValueError(f"Unexpected Census block assignment filename: {path.name}")
    with ZipFile(path) as archive:
        for suffix, city_prefix in (("_INCPLACE_CDP.txt", b"1600000US"), ("_MCD.txt", b"0600000US")):
            for member in (name for name in archive.namelist() if name.endswith(suffix)):
                codes = {}
                with archive.open(member) as file:
                    next(file)
                    for line in file:
                        block, *_, area = line.strip().split(b"|")
                        bg = block[:12]
                        locality = (block[:2] if city_prefix.startswith(b"16") else block[:5]) + area if area else b""
                        if bg in codes and codes[bg] != locality:
                            codes[bg] = None
                        else:
                            codes[bg] = locality
                for bg, locality in codes.items():
                    if locality:
                        geoid = (city_prefix + locality).decode("ascii")
                        geoid = CITY_ID_ALIASES.get(geoid, geoid)
                        if geoid in cities:
                            yield bg.decode("ascii"), geoid


def vote_estimates(source, places, county_votes):
    land = read_votes(source / "city-vote-landcover-2024.tsv")
    areal = read_votes(source / "city-vote-areal-2024.tsv")
    county_totals = defaultdict(lambda: [0., 0., 0., 0.])
    for bg, (_, h, t) in land.items():
        alternate = areal.get(bg)
        if alternate is None:
            continue
        sums = county_totals[bg[:5]]
        for i, value in enumerate((h, t, *alternate[1:])):
            sums[i] += value
    acceptable = {code for code, totals in county_totals.items() if code in county_votes
                  and all(abs(value - official) <= max(25, .025 * official)
                          for value, official in zip(totals, county_votes[code][:2] * 2, strict=True))}
    cities = {row[0]: row[4] for row in places}
    _, _, _, _, baseline = city_builder.directory(source)
    totals = defaultdict(lambda: [0.] * 5)
    paths = sorted((source / "city-2020-baf").glob("BlockAssign_ST*.zip"))
    if len(paths) != 52:
        raise ValueError("Expected Census block assignments for 52 states and territories")
    for path in paths:
        for bg, city in group_assignments(path, cities):
            if bg[:5] not in acceptable or bg not in land or bg not in areal:
                continue
            sums = totals[city]
            for i, value in enumerate((*land[bg], *areal[bg][1:])):
                sums[i] += value
    rows = {}
    for city, (population, h, t, areal_h, areal_t) in sorted(totals.items()):
        expected = baseline.get(ACS_CITY_GEOGRAPHY_ALIASES.get(city, city)) or cities[city]
        if not expected or not .90 <= population / expected <= 1.08 or min(h + t, areal_h + areal_t) < 100:
            continue
        margin = (h - t) / (h + t)
        other = (areal_h - areal_t) / (areal_h + areal_t)
        if abs(margin - other) <= .03:
            harris, trump = round(h), round(t)
            displayed_margin = 100 * (harris - trump) / (harris + trump)
            rows[city] = [round(displayed_margin, 2), harris, trump, round(min(1, population / expected), 3)]
    print(f"Election audit: both allocations reconciled to {len(acceptable):,} counties")
    return rows


def key(text):
    folded = unicodedata.normalize("NFKD", text.casefold()).encode("ascii", "ignore").decode()
    return re.sub("[^a-z0-9]+", "", folded)


def sports(source, directory):
    candidates = defaultdict(set)
    for row in snapshot_data(source / "sports-venues-rows.json")["features"]:
        a = row["attributes"]
        point = (a["LATITUDE"], a["LONGITUDE"])
        if not (-90 <= point[0] <= 90 and -180 <= point[1] <= 180):
            continue
        for column in ("NAME", "NAME2", "NAME3", "FORMERNM"):
            label = a.get(column)
            if label and label != "NOT AVAILABLE":
                candidates[a["STATE"], key(label)].add(point)
    places = {row[0]: row[11] for row in directory["places"]}
    host = defaultdict(set)
    for geoid, name, kind, _, *rest in directory["places"]:
        if geoid.startswith("1600000US") and places[geoid]:
            host[directory["states"][geoid[9:11]][0], key(name)].add(tuple(places[geoid]))
    baseball = {}
    for team in snapshot_data(source / "sports-mlb-probe.json")["teams"]:
        location = team.get("venue", {}).get("location", {}).get("defaultCoordinates")
        if location:
            baseball[key(team["name"])] = (location["latitude"], location["longitude"])
    with (source / "city-sports-venues.csv").open(encoding="utf-8-sig", newline="") as file:
        teams = list(csv.DictReader(file))
    required = {"NFL": 32, "NBA": 30, "NHL": 32, "MLB": 30}
    if Counter(row["league"] for row in teams) != required or len({row["team"] for row in teams}) != 124:
        raise ValueError("Sports catalog must contain one venue per active team in the four leagues")
    venues, quality = [], Counter()
    for team in teams:
        region, venue = team["region"], team["venue"]
        exact = candidates[region, key(venue)] or candidates[region, key(FORMER_VENUE_NAMES.get(venue, venue))]
        fallback = host[region, key(team["city"])]
        point = baseball.get(key(team["team"])) if team["league"] == "MLB" else None
        estimated_host = False
        if point:
            quality["league coordinates"] += 1
        elif len(exact) == 1:
            point = next(iter(exact))
            quality["federal coordinates"] += 1
        elif len(fallback) == 1:
            point = next(iter(fallback))
            estimated_host = True
            quality["host city estimate"] += 1
        if not point:
            raise ValueError(f"Missing sports coordinates: {team['team']} at {venue}, {team['city']}, {region}")
        venues.append((*point, (team["team"], 4 if team["league"] == "NFL" else 3, estimated_host)))
    print("Sports venues:", dict(quality))
    index = NearbyPoints(venues, 75)
    distance_limits, distance_weights = zip(*SPORTS_DISTANCE)
    rows = {}
    for city, point in places.items():
        if not point:
            continue
        nearby = sorted((2 * 3958.76 * np.arcsin(np.sqrt(distance) / 2), team) for distance, team in index.within(*point))
        if nearby:
            score = sum(float(np.interp(distance, distance_limits, distance_weights)) * weight
                        for distance, (_, weight, _) in nearby)
            nearest_distance, (nearest_team, _, estimated_host) = nearby[0]
            rows[city] = [round(score, 2), len(nearby), nearest_team, round(float(nearest_distance), 1), estimated_host]
    return rows


def snapshot_data(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    directory = snapshot(PROJECT / "city-data.js")
    county = snapshot(PROJECT / "metric-data.js")
    places = directory["places"]
    humidity, sunshine = climate(args.source, places)
    data = {"humidity": humidity, "sunshine": sunshine,
            "childcare": childcare(args.source, places, county["childcare"]["county"]),
            "politics": vote_estimates(args.source, places, county["presidentialVote"]["county"]),
            "sports": sports(args.source, directory)}
    coverage = {key: len(rows) for key, rows in data.items()}
    print("City criterion coverage:", coverage)
    if min(len(humidity), len(sunshine)) < 45_000 or min(coverage[key] for key in ("childcare", "politics", "sports")) < 1_000:
        raise ValueError("Missing expected city comparison coverage")
    (PROJECT / "city-comparisons.js").write_text(
        "// Generated by scripts/build-find-your-place-city-comparisons.py.\n"
        f"window.findYourPlaceCityComparisons={json.dumps(data, separators=(',', ':'), allow_nan=False)};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
