"""Aggregate NHTSA fatal traffic crashes by the city where each crash occurred."""

import csv
import io
import unicodedata
from collections import Counter, defaultdict
from zipfile import ZipFile

from shapely import STRtree, points


YEARS = range(2020, 2025)


def city_name_key(state, name):
    return state, "".join(c for c in unicodedata.normalize("NFKD", name.casefold()) if c.isascii() and c.isalnum())


def road_fatalities(source, cities, city_ids, city_shapes, population):
    coordinates, records = [], []
    totals, located, fatalities = Counter(), Counter(), Counter()
    names = defaultdict(list)
    for identifier, name, kind, *_ in cities:
        if identifier.startswith("1600000US") and kind in {"City", "Town", "Village", "Borough", "Municipality"}:
            names[city_name_key(identifier[9:11], name)].append(identifier)
    recovered = 0
    for year in YEARS:
        cases = set()
        with ZipFile(source / f"FARS{year}NationalCSV.zip") as archive:
            name = next(name for name in archive.namelist() if name.rsplit("/", 1)[-1].lower() == "accident.csv")
            with archive.open(name) as raw:
                for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="")):
                    state, case = row["STATE"].zfill(2), row["ST_CASE"]
                    deaths = int(row["FATALS"])
                    if case in cases or not 1 <= deaths <= 100:
                        raise ValueError(f"Invalid FARS case {case} for {year}")
                    cases.add(case)
                    totals[state, year] += deaths
                    try:
                        lat, lon = float(row["LATITUDE"]), float(row["LONGITUD"])
                    except ValueError:
                        lat, lon = 0, 0
                    if not (17 <= lat <= 72 and (-180 <= lon <= -64 or state == "02" and 170 <= lon <= 180)):
                        city_code = int(row["CITY"])
                        candidates = names[city_name_key(state, row["CITYNAME"])] if 0 < city_code < 9997 else []
                        if len(candidates) == 1:
                            fatalities[candidates[0]] += deaths
                            located[state, year] += deaths
                            recovered += 1
                        continue
                    located[state, year] += deaths
                    coordinates.append((lon, lat))
                    records.append((state, deaths))
        if len(cases) < 33000:
            raise ValueError(f"Incomplete FARS archive for {year}: {len(cases):,} crashes")

    usable = {state for state, _ in totals if all(totals[state, year] and located[state, year] >= .93 * totals[state, year] for year in YEARS)
              and sum(located[state, year] for year in YEARS) >= .95 * sum(totals[state, year] for year in YEARS)}
    # A crash may be inside both a place and a township in the directory. Count it once per record.
    matches = defaultdict(set)
    crash_indexes, city_indexes = STRtree(city_shapes).query(points(coordinates), predicate="within")
    for crash_index, city_index in zip(crash_indexes, city_indexes, strict=True):
        city = city_ids[city_index]
        if city[9:11] == records[crash_index][0]:
            matches[crash_index].add(city)
    for crash_index, cities in matches.items():
        for city in cities:
            fatalities[city] += records[crash_index][1]

    result = {city: [fatalities[city], population[city] * len(YEARS)] for city in set(city_ids)
              if city[9:11] in usable and population[city] >= 1000}
    if len(result) < 10000 or fatalities["1600000US0644000"] < 500:
        raise ValueError(f"Unexpected FARS city match coverage: {len(result):,}")
    print(f"FARS: {len(records):,} geocoded crashes, {recovered:,} matched by reported city name, "
          f"{len(usable)} jurisdictions passed coverage, {len(result):,} city rates", flush=True)
    return result
