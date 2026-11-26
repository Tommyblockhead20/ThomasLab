"""Build local city estimates from national tract tables and public facilities."""

import csv
import io
import json
import math
import shutil
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zipfile import ZipFile

import numpy as np

from find_your_place_spatial import NearbyPoints, cms_hospital_locations


FEMA = ("https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/"
        "National_Risk_Index_Census_Tracts/FeatureServer/0")
IPEDS = "https://nces.ed.gov/ipeds/datacenter/data/"
COLLEGE_CACHE = "city-ipeds-campus-2024.json"
TERRAIN_FILE = "usda-2020-terrain.csv"
TERRAIN_URL = "https://www.ers.usda.gov/media/5414/2020-area-and-road-ruggedness-scales.csv?v=57241"
EARTH_RADIUS = 3958.76
ER_RADIUS = 60


def arcgis_rows(url, where, fields):
    def query(**kwargs):
        with urlopen(f"{url}/query?{urlencode({'f': 'json', 'where': where, **kwargs})}", timeout=45) as response:
            data = json.load(response)
        if "error" in data:
            raise ValueError(data["error"])
        return data

    ids = query(returnIdsOnly="true")
    object_ids = sorted(ids["objectIds"])
    id_field = ids["objectIdFieldName"]
    chunk_size = 1000

    def page(start):
        chunk = object_ids[start:start + chunk_size]
        page_filter = f"({where}) AND {id_field} >= {chunk[0]} AND {id_field} <= {chunk[-1]}"
        data = query(where=page_filter, outFields=fields, returnGeometry="false")
        if len(data.get("features", [])) != len(chunk):
            raise ValueError(f"Incomplete ArcGIS export at {url} starting at {chunk[0]}")
        return data["features"]

    with ThreadPoolExecutor(max_workers=5) as pool:
        for batch in pool.map(page, range(0, len(object_ids), chunk_size)):
            yield from batch


def fetch_city_metrics(source):
    risk_path = source / "city-fema-tracts.json"
    college_path = source / COLLEGE_CACHE
    if not risk_path.exists():
        features = arcgis_rows(FEMA, "ALR_NPCTL IS NOT NULL", "TRACTFIPS,ALR_NPCTL")
        risk = {row["TRACTFIPS"]: round(row["ALR_NPCTL"], 3) for feature in features
                if (row := feature["attributes"]) and 0 <= row["ALR_NPCTL"] <= 100}
        if len(risk) < 80000:
            raise ValueError(f"Unexpected FEMA tract count: {len(risk):,}")
        risk_path.write_text(json.dumps(risk, separators=(",", ":")), encoding="utf-8")
        print(f"Cached {len(risk):,} FEMA tract risk estimates", flush=True)
    if not college_path.exists():
        files = {}
        for table in ("HD2024", "IC2024"):
            archive_path = source / f"city-ipeds-{table.lower()}.zip"
            if not archive_path.exists():
                with urlopen(Request(f"{IPEDS}{table}.zip", headers={"User-Agent": "Mozilla/5.0"}), timeout=45) as response:
                    archive_path.write_bytes(response.read())
            files[table] = archive_path
        with ZipFile(files["IC2024"]) as archive, archive.open("IC2024.csv") as raw:
            rows = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
            online_only = {row["UNITID"] for row in rows if row["DISTNCED"] == "1"}
        colleges = college_locations(files["HD2024"], online_only)
        if len(colleges) < 2600 or len({row[2] for row in colleges}) != len(colleges):
            raise ValueError(f"Unexpected IPEDS campus count: {len(colleges):,}")
        college_path.write_text(json.dumps(colleges, separators=(",", ":")), encoding="utf-8")
        print(f"Cached {len(colleges):,} IPEDS campus records", flush=True)
    terrain = source / TERRAIN_FILE
    if not terrain.exists():
        part = terrain.with_suffix(".part")
        with urlopen(Request(TERRAIN_URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as response, part.open("wb") as file:
            shutil.copyfileobj(response, file)
        part.replace(terrain)


def college_locations(path, online_only):
    colleges = []
    size_weights = {"1": .5, "2": 1, "3": 1.5, "4": 2, "5": 2.5}
    with ZipFile(path) as archive, archive.open("HD2024.csv") as raw:
        for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")):
            if row["CYACTIVE"] != "1" or row["OPENPUBL"] != "1" or row["DEGGRANT"] != "1" or row["UNITID"] in online_only:
                continue
            if not row["LATITUDE"] or not row["LONGITUD"]:
                continue
            lat, lon = float(row["LATITUDE"]), float(row["LONGITUD"])
            if not (-90 <= lat <= 90 and -180 <= lon <= 180 and (lat or lon)):
                continue
            points = size_weights.get(row["INSTSIZE"], .35)
            points += (row["ICLEVEL"] == "1") + .5 * (row["GROFFER"] == "1") + .5 * (row["MEDICAL"] == "1")
            colleges.append([lat, lon, row["UNITID"], points])
    return colleges


def retail_and_connecticut_tracts(source):
    with ZipFile(source / "city-gaz-counties.zip") as archive, archive.open(archive.namelist()[0]) as raw:
        rows = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""), delimiter="\t")
        planning_regions = {row["NAME"]: row["GEOID"] for row in rows if row["USPS"] == "CT"}
    with ZipFile(source / "usda-sram.zip") as archive:
        def rows(name):
            with archive.open(name) as raw:
                yield from csv.DictReader(io.TextIOWrapper(raw, encoding="cp1252", newline=""))

        counts, connecticut = {}, {}
        for row in rows("SRAM General Tract Characteristics Data.csv"):
            tract = row["CensusTract20"].zfill(11)
            if row["POP2020"].isdecimal():
                counts[tract] = int(row["POP2020"])
            if row["County24"] in planning_regions and tract.startswith("09"):
                # Populated 2020 tracts retained their tract codes when the county FIPS changed.
                connecticut[tract] = planning_regions[row["County24"]] + tract[5:]
        grocery = {}
        for row in rows("SRAM Driving Distance Data.csv"):
            tract = row["CensusTract20"].zfill(11)
            population, low = counts.get(tract), row["DD_SRAM_LAPOP1_10"].strip()
            if population and low and 0 <= float(low) <= population + 1:
                grocery[tract] = 1 - min(float(low), population) / population
    return grocery, connecticut


def noise_by_tract(path):
    result = {}
    for row in json.loads(path.read_text(encoding="utf-8")):
        total = row.get("estimat")
        bands = [row.get(key) for key in ("ns6070n", "ns7080n", "ns8090n", "nois90n")]
        if not total or total < 0 or any(v is None or v < 0 for v in bands) or sum(bands) > total + 1:
            continue
        result[row["GEOID"]] = min(sum(bands) / total, 1)
    return result


def terrain_by_tract(path):
    with path.open(encoding="cp1252", newline="") as file:
        result = {}
        for row in csv.DictReader(file):
            if not row["AreaTRI_Mean"].strip() or float(row["AreaTRI_Count"] or 0) <= 0:
                continue
            value = float(row["AreaTRI_Mean"])
            if 0 <= value <= 250:
                result[row["TractFIPS20"].zfill(11)] = value
    return result


def hospital_lookup(source):
    emergency, rated = {}, {}
    general_hospitals = {"Acute Care Hospitals", "Critical Access Hospitals"}
    for row, point, _ in cms_hospital_locations(source):
        id_, state = row["Facility ID"], row["State"]
        if not id_ or point is None:
            continue
        kind = row["Hospital Type"]
        if row["Emergency Services"] == "Yes" and (kind in general_hospitals or kind == "Rural Emergency Hospital"):
            emergency[id_] = (*point, state)
        stars = row["Hospital overall rating"]
        if kind in general_hospitals and stars in {"1", "2", "3", "4", "5"}:
            rated[id_] = (*point, (int(stars), state))
    if len(emergency) < 3900 or len(rated) < 2850:
        raise ValueError(f"Incomplete location coverage: {len(emergency)} emergency, {len(rated)} rated hospitals")
    return NearbyPoints(emergency.values(), ER_RADIUS), NearbyPoints(rated.values(), 45)


def miles(chord_squared):
    return 2 * EARTH_RADIUS * math.asin(math.sqrt(chord_squared) / 2)


def hospital_estimates(lat, lon, state, emergency, quality):
    separated = state in {"AK", "HI", "PR"}
    nearest = min((miles(d) for d, st in emergency.within(lat, lon) if not separated or st == state), default=None)
    # A missing regional match in an isolated state or territory cannot support a distance estimate.
    distance = nearest if nearest is not None else (None if separated else ER_RADIUS)
    rated = sorted((d, stars) for d, (stars, st) in quality.within(lat, lon) if not separated or st == state)[:6]
    if not rated:
        return distance, None
    limit = max(20, miles(rated[0][0]) + 12)
    scores = [(1 / (1 + (miles(d) / 12) ** 2), stars) for d, stars in rated if miles(d) <= limit]
    return distance, sum(weight * stars for weight, stars in scores) / sum(weight for weight, _ in scores)


def college_access(point, colleges):
    nearby = sorted((miles(d), points) for d, points in colleges.within(*point))
    if not nearby:
        return [0, None, 0]
    distance = [row[0] for row in nearby]
    weights = np.interp(distance, [0, 5, 15, 30, 50, 75, 90], [1, .9, .7, .45, .2, .05, 0])
    points = float(sum(weight * row[1] for weight, row in zip(weights, nearby, strict=True)))
    return [round(points, 3), round(distance[0], 1), sum(d <= 30 for d in distance)]


def local_metrics(source, cities, states, city_ids, indexes, memberships, lat, lng, population, tracts, reference_pop):
    grocery, connecticut = retail_and_connecticut_tracts(source)
    risks = json.loads((source / "city-fema-tracts.json").read_text(encoding="utf-8"))
    risks.update({old: risks[new] for old, new in connecticut.items() if new in risks})
    by_tract = (grocery, noise_by_tract(source / "noise-tracts.json"), risks, terrain_by_tract(source / TERRAIN_FILE))
    for rows in by_tract:
        if len(set(tracts) & rows.keys()) < 65000:
            raise ValueError("Tract data has incomplete coverage of 2020 Census population centers")
    emergency, quality = hospital_lookup(source)
    colleges = NearbyPoints(((la, lo, points) for la, lo, _, points in
                             json.loads((source / COLLEGE_CACHE).read_text(encoding="utf-8"))), 90)

    geographies = len(city_ids)
    totals = np.bincount(memberships, weights=population[indexes], minlength=geographies)
    samples = np.bincount(memberships, minlength=geographies)
    expected = np.array([reference_pop[city] for city in city_ids])
    represented = (samples >= 3) & (totals >= .65 * expected) & (totals <= 1.35 * expected)
    city_mask = represented[memberships]
    indexes, memberships = indexes[city_mask], memberships[city_mask]
    block_weights = population[indexes]
    point_values = np.full((len(tracts), 2 + len(by_tract)), np.nan)
    for i in np.unique(indexes):
        state = states[tracts[i][:2]][0]
        point_values[i, :2] = hospital_estimates(lat[i], lng[i], state, emergency, quality)
        point_values[i, 2:] = [rows.get(tracts[i]) for rows in by_tract]

    results = np.full((geographies, point_values.shape[1]), np.nan)
    for column in range(point_values.shape[1]):
        values = point_values[indexes, column]
        valid = np.isfinite(values)
        weights = block_weights[valid]
        covered = np.bincount(memberships[valid], weights=weights, minlength=geographies)
        summed = np.bincount(memberships[valid], weights=weights * values[valid], minlength=geographies)
        sufficiently_covered = represented & (covered >= .65 * totals)
        if column == 3:  # Transportation noise
            sufficiently_covered &= (totals >= .85 * expected) & (totals <= 1.15 * expected) & (covered >= .90 * totals)
        results[sufficiently_covered, column] = summed[sufficiently_covered] / covered[sufficiently_covered]
    output = {}
    # The Census internal point can land far offshore in cities with extensive water boundaries.
    lat_sum = np.bincount(memberships, weights=lat[indexes] * block_weights, minlength=geographies)
    lon_radians = np.radians(lng[indexes])
    lon_sin = np.bincount(memberships, weights=np.sin(lon_radians) * block_weights, minlength=geographies)
    lon_cos = np.bincount(memberships, weights=np.cos(lon_radians) * block_weights, minlength=geographies)
    centers = {city_ids[i]: [round(float(lat_sum[i] / totals[i]), 5),
                            round(math.degrees(math.atan2(lon_sin[i], lon_cos[i])), 5)]
               for i in np.flatnonzero(represented)}
    for index, key in enumerate(city_ids):
        values = [round(float(value), precision) if math.isfinite(value) else None
                  for value, precision in zip(results[index], (1, 3, 4, 4, 1, 2), strict=True)]
        if any(value is not None for value in values):
            output[key] = values
    for city in cities:
        center = centers.get(city[0])
        point = center or city[11]
        if point is not None:
            row = output.setdefault(city[0], [None] * 6)
            terrain = row.pop()
            row.extend([college_access(point, colleges), center, terrain])
    counts = [sum(len(row) > index and row[index] is not None for row in output.values()) for index in (0, 1, 2, 3, 4, 5, 7)]
    if min(counts[:5] + counts[6:]) < 7500 or counts[5] < 45000:
        raise ValueError(f"Unexpected city coverage: {counts}")
    print(f"Emergency access, hospital quality, grocery, noise, disaster risk, college and terrain coverage: {counts}", flush=True)
    return output
