"""Build the Find Your Place municipality directory and its 2024 ACS measures."""

import argparse
import csv
import io
import json
import math
import re
import shutil
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen
from zipfile import ZipFile

from find_your_place_spatial import ACS_CITY_GEOGRAPHY_ALIASES
from find_your_place_broadband import broadband_rows
from find_your_place_home_sales import fetch_sale_quarters, sale_estimate

CENSUS = "https://www2.census.gov"
GAZETTEER = "/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_{}_national.zip"
ACS = "/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-{}.dat"
POPULATION = "/programs-surveys/popest/datasets/2020-2025/cities/totals/sub-est2025.csv"
TABLES = {"b01003": "city-b01003.dat", "b08301": "city-b08301.dat", "b08303": "city-b08303.dat",
          "b08013": "city-b08013.dat", "b25031": "acs-rent-bedrooms.dat", "b20002": "acs-median-earnings.dat",
          "b25003": "city-b25003.dat", "b25077": "city-b25077.dat", "b25088": "city-b25088.dat",
          "b23025": "city-b23025.dat", "b27001": "city-b27001.dat"}
GEOGRAPHIES = (b"0100000US|", b"0500000US72", b"0500000US15003", b"0600000US", b"1600000US", b"1700000US")
ACTIVE = {"A", "B", "C"}
LOCAL_SUFFIXES = ["city and borough", "township", "municipality", "borough", "village", "town", "city"]
UNINSURED_BINS = [*range(5, 30, 3), *range(33, 58, 3)]
CITY_BROADBAND_URL = "https://usinternetmap.com/data/"
CITY_BROADBAND_FILE = "city-broadband-2026.06.csv"
CITY_BROADBAND_DATES = ("2026-06-30", "2026-11-10")


def fetch_sources(source):
    inputs = {"census-place-parts-2025.csv": (POPULATION, False)}
    inputs.update({f"city-gaz-{kind}.zip": (GAZETTEER.format(kind), False) for kind in ("place", "cousubs", "counties")})
    inputs.update({filename: (ACS.format(table), filename.startswith("city-")) for table, filename in TABLES.items()})

    def download(item):
        filename, (url, select) = item
        path = source / filename
        if path.exists():
            return
        part = path.with_suffix(path.suffix + ".part")
        with urlopen(Request(CENSUS + url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as response:
            with part.open("wb") as file:
                if select:
                    file.write(response.readline())
                    file.writelines(line for line in response if line.startswith(GEOGRAPHIES))
                else:
                    shutil.copyfileobj(response, file)
        part.replace(path)

    with ThreadPoolExecutor(max_workers=4) as workers:
        list(workers.map(download, inputs.items()))
    fetch_sale_quarters(source, "cities")
    fetch_city_broadband(source / CITY_BROADBAND_FILE)


def fetch_city_broadband(path):
    if path.exists():
        return
    headers = {"User-Agent": "Mozilla/5.0"}
    with urlopen(Request(CITY_BROADBAND_URL, headers=headers), timeout=35) as response:
        release = response.read().decode("utf-8")
    if not all(date in release for date in CITY_BROADBAND_DATES):
        raise ValueError("The US Internet Map export no longer identifies the expected FCC release")
    part = path.with_suffix(".part")
    with urlopen(Request(CITY_BROADBAND_URL + "cities.csv", headers=headers), timeout=35) as response, part.open("wb") as out:
        shutil.copyfileobj(response, out)
    part.replace(path)


def gazetteer_rows(path):
    with ZipFile(path) as archive:
        with archive.open(archive.namelist()[0]) as raw:
            for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"), delimiter="\t"):
                yield {key.strip(): value.strip() for key, value in row.items()}


def census_number(value):
    try:
        parsed = int(value)
    except (ValueError, TypeError):
        return None
    return parsed if parsed >= 0 else None


def directory(source):
    gazetteers = {kind: {row["GEOID"]: row for row in gazetteer_rows(source / f"city-gaz-{kind}.zip")}
                  for kind in ("place", "cousubs", "counties")}
    counties = gazetteers["counties"]
    abbreviations = {code[:2]: row["USPS"] for code, row in counties.items()}
    entities, states, place_counties, baseline_population = {}, {}, defaultdict(set), {}
    with (source / "census-place-parts-2025.csv").open(encoding="cp1252", newline="") as file:
        for row in csv.DictReader(file):
            level, status, state = row["SUMLEV"], row["FUNCSTAT"], row["STATE"]
            county, place, township = row["COUNTY"], row["PLACE"], row["COUSUB"]
            population = census_number(row["POPESTIMATE2025"])
            if level == "040":
                states[state] = [abbreviations[state], row["STNAME"]]
            if level == "157" and place not in ("00000", "99990"):
                place_counties[state + place].add(state + county)
            if level == "162" and (status in ACTIVE or status == "I" or state == "11"):
                code = state + place
                identifier = "1600000US" + code
                entities[identifier] = [row["NAME"], population, "place", code, None]
            elif level == "061" and status in ACTIVE:
                code = state + county + township
                identifier = "0600000US" + code
                entities[identifier] = [row["NAME"], population, "cousubs", code, state + county]
            elif level == "170" and status in ACTIVE:
                code = state + row["CONCIT"]
                identifier = "1700000US" + code
                entities[identifier] = [row["NAME"], population, "consolidated", code, None]
            elif level == "050" and state + county == "15003":
                identifier = "0500000US15003"
                entities[identifier] = ["Honolulu City and County", population, "counties", "15003", None]
            else:
                continue
            baseline_population[identifier] = census_number(row["POPESTIMATE2020"])

    for code, row in gazetteers["place"].items():
        if row["LSAD"] in ("55", "57", "62"):
            entities.setdefault("1600000US" + code, [row["NAME"], None, "community", code, None])
    for code, row in counties.items():
        if code.startswith("72"):
            entities["0500000US" + code] = [row["NAME"], None, "counties", code, None]
    states["72"] = ["PR", "Puerto Rico"]
    for name, population, geographic_type, code, _ in entities.values():
        if code[:2] not in states:
            raise ValueError(f"Unknown state for {name} ({code})")
    return entities, states, gazetteers, place_counties, baseline_population


def acs_table(path, ids, fields):
    with path.open(encoding="utf-8-sig", newline="") as file:
        fields = [field for pair in fields for field in pair]
        header = next(file).rstrip().split("|")
        indexes = [header.index(field) for field in fields]
        result = {}
        for line in file:
            if line.split("|", 1)[0] not in ids:
                continue
            row = line.rstrip("\r\n").split("|")
            values = [census_number(row[index]) for index in indexes]
            result[row[0]] = list(zip(values[::2], values[1::2]))
        return result


def acs_metrics(source, ids):
    columns = {"b01003": [1], "b08301": [1, 10], "b08303": [1, 11, 12, 13],
               "b08013": [1], "b25031": [2, 3, 4, 5, 6, 7, 1], "b20002": [1],
               "b25003": [2], "b25077": [1], "b25088": [3], "b23025": [3, 5],
               "b27001": [1, *UNINSURED_BINS]}
    return {table: acs_table(source / TABLES[table], ids,
                             [(f"{table.upper()}_E{i:03d}", f"{table.upper()}_M{i:03d}") for i in numbers])
            for table, numbers in columns.items()}


def precise(values, limit=.45, minimum=1):
    value, margin = values
    return value if value is not None and margin is not None and value >= minimum and margin <= value * limit else None


def percent_of(numerator, denominator, max_margin):
    total = precise(denominator, minimum=30)
    estimate, margin = numerator
    if total is None or estimate is None or margin is None or estimate > total:
        return None
    ratio = estimate / total
    error = math.hypot(margin, ratio * denominator[1]) / total
    return round(ratio, 4) if error <= max_margin else None


def city_household_metrics(metrics, identifier):
    employment = metrics["b23025"].get(identifier)
    insurance = metrics["b27001"].get(identifier)
    unemployment = percent_of(employment[1], employment[0], .05) if employment else None
    uninsured = None
    if insurance and all(value is not None and margin is not None for value, margin in insurance[1:]):
        count = sum(value for value, _ in insurance[1:])
        margin = math.hypot(*(error for _, error in insurance[1:]))
        uninsured = percent_of((count, margin), insurance[0], .06)
    return [unemployment, uninsured] if unemployment is not None or uninsured is not None else None


def commute_metrics(metrics, identifier):
    mode = metrics["b08301"].get(identifier)
    transit = percent_of(mode[1], mode[0], .10) if mode else None
    bins = metrics["b08303"].get(identifier)
    minutes = metrics["b08013"].get(identifier)
    denominator = precise(bins[0], minimum=30) if bins else None
    mean = precise(minutes[0]) if minutes else None
    mean = round(mean / denominator, 1) if mean is not None and denominator else None
    if mean is not None and not 1 <= mean <= 120:
        mean = None
    long_share = None
    if bins and all(value is not None and margin is not None for value, margin in bins[1:]):
        total = sum(value for value, _ in bins[1:])
        error = math.hypot(*(margin for _, margin in bins[1:]))
        long_share = percent_of((total, error), bins[0], .25)
    return mean, long_share, transit


def place_label(name, geographic_type):
    if geographic_type == "community":
        return re.sub(r"\s+(CDP|comunidad|zona urbana)$", "", name, flags=re.I), "Census community"
    if geographic_type == "consolidated" or name == "Honolulu City and County":
        return name, "City and county"
    if geographic_type == "counties":
        return re.sub(r"\s+Municipio$", "", name), "Municipio"
    for suffix in LOCAL_SUFFIXES:
        end = " " + suffix
        if name.lower().endswith(end):
            return name[:-len(end)], suffix.capitalize()
    return name, "Municipality"


def market_key(name, state):
    name = unicodedata.normalize("NFKD", name.lower()).encode("ascii", "ignore").decode()
    name = re.sub(r"\bsaint\b", "st", re.sub(r"\bmount\b", "mt", name))
    return re.sub(r"[^a-z0-9]", "", name), state.upper()


def city_sales(path, matches):
    samples = defaultdict(list)
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            label = row["REGION NAME"]
            name, separator, state = label.rpartition(", ")
            candidates = matches.get(market_key(name, state), []) if separator else []
            if len(candidates) != 1:
                continue
            samples[candidates[0]].append(row)
    result = {identifier: estimate for identifier, rows in samples.items()
              if (estimate := sale_estimate(rows, 30))}
    if len(result) < 1000:
        raise ValueError(f"Unexpected city sales coverage: {len(result)} matched cities")
    return result


def city_broadband(path, city_ids):
    if not path.exists():
        return {}
    rates = {"1600000US" + code: row for code, row in broadband_rows(path, 7).items()
             if "1600000US" + code in city_ids}
    if len(rates) < 3000:
        raise ValueError(f"Unexpected city broadband coverage: {len(rates)} matched places")
    return rates


def build(source):
    directory_rows, states, gazetteers, place_counties, baseline_population = directory(source)
    metrics = acs_metrics(source, set(directory_rows) | set(ACS_CITY_GEOGRAPHY_ALIASES.values()) | {"0100000US"})
    market_matches = defaultdict(list)
    for identifier, (name, _, geographic_type, code, _) in directory_rows.items():
        label, _ = place_label(name, geographic_type)
        if geographic_type in ("place", "community"):
            market_matches[market_key(label, states[code[:2]][0])].append(identifier)
    # The New York postal market can omit boroughs. Use the whole-city ACS geography there.
    market_matches.pop(market_key("New York", "NY"), None)
    sales = city_sales(source / "redfin-home-quarters-cities.csv", market_matches)
    spatial = source / "city-access.json"
    access = json.loads(spatial.read_text(encoding="utf-8")) if spatial.exists() else {}
    local_file = source / "city-local-metrics.json"
    local_metrics = json.loads(local_file.read_text(encoding="utf-8")) if local_file.exists() else {}
    data = []
    for identifier, (name, population, geographic_type, code, county) in directory_rows.items():
        counties = place_counties.get(code, set()) if geographic_type in ("place", "community") else set()
        if len(counties) == 1:
            county = next(iter(counties))
        county_label = (f"Spans {len(counties)} counties" if len(counties) > 1
                        else gazetteers["counties"].get(county, {}).get("NAME"))
        lookup = "place" if geographic_type == "community" else geographic_type
        geography = gazetteers.get(lookup, {}).get(code)
        acs_id = ACS_CITY_GEOGRAPHY_ALIASES.get(identifier, identifier)
        if acs_id != identifier:
            geography = gazetteers["cousubs"].get(acs_id[9:])
        acs_population = metrics["b01003"].get(acs_id, [(None, None)])[0][0]
        land_square_meters = census_number(geography["ALAND"]) if geography else None
        # The 2024 survey and land area share Census boundaries, even when the displayed count is newer.
        density = round(acs_population / (land_square_meters / 2589988.110336), 1) if acs_population is not None and land_square_meters else None
        rents = [precise(pair) for pair in metrics["b25031"].get(acs_id, [])]
        earnings = precise(metrics["b20002"].get(acs_id, [(None, None)])[0])
        mean, long_share, transit = commute_metrics(metrics, acs_id)
        label, kind = place_label(name, geographic_type)
        point = [round(float(geography[key]), 5) for key in ("INTPTLAT", "INTPTLONG")] if geography else None
        local = local_metrics.get(identifier)
        if local and len(local) > 6 and local[6]:
            point = local[6]
        baseline = baseline_population.get(identifier)
        growth = round(100 * (population / baseline - 1), 2) if baseline is not None and baseline >= 100 and population is not None else None
        owners = precise(metrics["b25003"].get(acs_id, [(None, None)])[0], minimum=30)
        owner_value = precise(metrics["b25077"].get(acs_id, [(None, None)])[0]) if owners else None
        monthly_cost = precise(metrics["b25088"].get(acs_id, [(None, None)])[0]) if owners else None
        data.append([identifier, label, kind, county_label,
                     population if population is not None else acs_population, density,
                     rents if any(rents) else None, earnings, mean, long_share, transit, point, growth,
                     sales.get(identifier) or ([owner_value] if owner_value is not None else None), monthly_cost,
                     access.get(identifier), city_household_metrics(metrics, acs_id), local[:6] + local[7:] if local else None])

    national_rents = [pair[0] for pair in metrics["b25031"]["0100000US"]]
    national_earnings = metrics["b20002"]["0100000US"][0][0]
    area = {row[0]: row for row in data}
    assert len(states) == 52 and len(area) == len(data) and len(data) >= 47000
    assert area["1600000US4835000"][1] == "Houston" and area["0600000US4209144976"][1] == "Lower Merion"
    assert area["0600000US2502354310"][1] == "Plymouth" and area["0500000US72001"][1] == "Adjuntas"
    assert national_earnings > 40000 and all(rent > 0 for rent in national_rents)
    data.sort(key=lambda row: (-(row[4] or 0), row[1].casefold(), row[0]))
    snapshot = {"states": states, "places": data, "broadband": city_broadband(source / CITY_BROADBAND_FILE, area)}
    for key, filename in (("roadSafety", "city-road-safety.json"), ("air", "city-air-quality.json"),
                          ("emergencyDrive", "city-emergency-drive.json"), ("hospitalDetails", "city-hospital-details.json"),
                          ("jobs", "city-jobs.json"), ("walkPilot", "city-walk-pilot.json")):
        path = source / filename
        if path.exists():
            rows = json.loads(path.read_text(encoding="utf-8"))
            snapshot[key] = {identifier: row for identifier, row in rows.items() if identifier in area}
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--fetch", action="store_true", help="download any missing public Census source files")
    parser.add_argument("--job-access", action="store_true", help="rebuild access to jobs from the local Census LODES files")
    args = parser.parse_args()
    if args.fetch:
        args.source_dir.mkdir(parents=True, exist_ok=True)
        fetch_sources(args.source_dir)
    snapshot = build(args.source_dir)
    if args.job_access:
        from find_your_place_city_jobs import job_access

        snapshot["jobs"] = job_access(args.source_dir, snapshot["places"])
        (args.source_dir / "city-jobs.json").write_text(json.dumps(snapshot["jobs"], separators=(",", ":")), encoding="utf-8")
    target = Path(__file__).resolve().parents[1] / "FindYourPlace" / "city-data.js"
    payload = json.dumps(snapshot, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    target.write_text("// Generated by scripts/build-find-your-place-cities.py.\n"
                      "// Broadband data adapted from US Internet Map (https://usinternetmap.com/data/), CC BY 4.0.\n"
                      "// City PM2.5 adapted from SatPM V6.GL.03 (https://www.satpm.org/v6-gl-03), CC BY 4.0.\n"
                      "// Walking pilot derived from OpenStreetMap contributors (https://www.openstreetmap.org/copyright).\n"
                      f"window.findYourPlaceCityData={payload};\n", encoding="utf-8")
    print(f"Wrote {len(snapshot['places']):,} municipalities and Census communities to {target.name}")


if __name__ == "__main__":
    main()
