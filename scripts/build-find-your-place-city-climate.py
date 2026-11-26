"""Bake city climate from NOAA's 1991–2020 gridded and station normals.

Requires NumPy and SciPy. Use the same source directory as the city directory builder.
"""

import argparse
import csv
import io
import json
import math
import shutil
import tarfile
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from scipy.io import netcdf_file

from find_your_place_spatial import NearbyPoints


PROJECT = Path(__file__).resolve().parents[1] / "FindYourPlace"
GRID_URL = "https://www.nodc.noaa.gov/archive/arc0196/0245564/1.1/data/0-data/"
STATION_URL = "https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/tarball/allstations.tar.gz"
GRID_NAMES = {key: f"{key}-1991_2020-monthly-normals-v1.0.nc" for key in ("tavg", "prcp")}
FIELDS = ("JJA-TAVG-NORMAL", "DJF-TAVG-NORMAL", "ANN-PRCP-NORMAL", "ANN-SNOW-NORMAL",
          "ANN-TMIN-AVGNDS-LSTH000", "ANN-TMIN-AVGNDS-LSTH032", "ANN-TMAX-AVGNDS-GRTH090", "ANN-TMAX-AVGNDS-GRTH100")
BOUNDS = ((30, 115), (-85, 85), (0, 320), (0, 800), *((0, 366),) * 4)
ISLAND_OR_REMOTE = {"AK", "HI", "PR"}


def fetch(source):
    files = {filename: GRID_URL + filename + "?download=1" for filename in GRID_NAMES.values()}
    files["noaa-normals.tar.gz"] = STATION_URL
    for name, url in files.items():
        target = source / name
        if target.exists():
            continue
        part = target.with_suffix(target.suffix + ".part")
        with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=90) as response, part.open("wb") as out:
            shutil.copyfileobj(response, out, length=1024 * 1024)
        part.replace(target)


def gridded_normals(source):
    with netcdf_file(source / GRID_NAMES["tavg"], "r", mmap=True) as temp:
        latitude = temp.variables["lat"][:].copy()
        longitude = temp.variables["lon"][:].copy()
        # NOAA's seasonal dimension is winter, spring, summer, fall. Temperatures are Celsius.
        temperatures = temp.variables["seastavg_norm"][:].copy()
    with netcdf_file(source / GRID_NAMES["prcp"], "r", mmap=True) as rain:
        if not np.array_equal(rain.variables["lat"][:], latitude) or not np.array_equal(rain.variables["lon"][:], longitude):
            raise ValueError("NOAA climate grids use different coordinates")
        variable = rain.variables["annprcp_norm"]
        units = variable.units
        rainfall = variable[:].copy()
        del variable
    if (temperatures.shape != (4, 596, 1385) or rainfall.shape != (596, 1385)
            or units not in {b"mm", b"millimeters", b"millimeter"}):
        raise ValueError(f"Unexpected NOAA grid format or precipitation units: {rainfall.shape}, {units}")
    data = np.stack((temperatures[2] * 1.8 + 32, temperatures[0] * 1.8 + 32, rainfall / 25.4), axis=-1)
    data[(temperatures[2] < -100) | (temperatures[0] < -100) | (rainfall < 0)] = np.nan
    return latitude, longitude, data


def grid_sample(point, grid):
    lat, lon = point
    latitude, longitude, values = grid
    row = round((float(latitude[0]) - lat) * 24)
    col = round((lon - float(longitude[0])) * 24)
    if not (-1 <= row <= len(latitude) and -1 <= col <= len(longitude)):
        return [None] * 3
    if 0 <= row < len(latitude) and 0 <= col < len(longitude) and np.all(np.isfinite(values[row, col])):
        return values[row, col].tolist()
    # At the coast, allow the closest adjacent land cell if its center is within four miles.
    best = (4.0, None)
    for i in range(max(0, row - 1), min(len(latitude), row + 2)):
        for j in range(max(0, col - 1), min(len(longitude), col + 2)):
            distance = math.hypot(float(latitude[i]) - lat, (float(longitude[j]) - lon) * math.cos(math.radians(lat))) * 69.09
            if distance < best[0] and np.all(np.isfinite(values[i, j])):
                best = (distance, values[i, j])
    return [None] * 3 if best[1] is None else best[1].tolist()


def normal(row, field, limits):
    try:
        value = float(row.get(field, ""))
    except (TypeError, ValueError):
        return None
    return value if limits[0] <= value <= limits[1] else None


def station_index(path):
    stations = []
    with tarfile.open(path, "r|gz") as archive:
        for file in archive:
            if not file.isfile() or not file.name.endswith(".csv"):
                continue
            with archive.extractfile(file) as raw:
                row = next(csv.DictReader(io.StringIO(raw.read().decode("utf-8-sig"))), {})
            metadata = row.get("STATION", "")
            if not metadata.startswith(("US", "RQ")):
                continue
            lat = normal(row, "LATITUDE", (-90, 90))
            lon = normal(row, "LONGITUDE", (-180, 180))
            if lat is None or lon is None:
                continue
            state = next((state for state in ("AK", "HI", "PR") if row["NAME"].strip().endswith(f"{state} US")), None)
            if metadata.startswith("RQ"):
                state = "PR"
            normals = [normal(row, field, limits) for field, limits in zip(FIELDS, BOUNDS, strict=True)]
            if any(value is not None for value in normals):
                stations.append((lat, lon, (state, normals)))
    if len(stations) < 14000:
        raise ValueError(f"Only {len(stations):,} NOAA stations have usable normals")
    return NearbyPoints(stations, 45)


def station_sample(nearby, column, baseline, limit):
    season = 0 if column in (0, 6, 7) else 1
    target = baseline[season]
    candidates = []
    for distance, values in nearby:
        value = values[column]
        if distance > limit or value is None:
            continue
        station_temp = values[season]
        climate = 1
        if column >= 3 and target is not None:
            if station_temp is None:
                climate = .6
            else:
                difference = abs(target - station_temp)
                if difference > 14:
                    continue
                climate = math.exp(-difference / (6 if column == 3 else 8))
        weight = climate / (5 + distance)**2
        candidates.append((weight, distance, value))
    chosen = sorted(candidates, reverse=True)[:5]
    if not chosen or (len(chosen) == 1 and chosen[0][1] > 16):
        return None
    return sum(weight * value for weight, _, value in chosen) / sum(weight for weight, _, _ in chosen)


def build(source):
    city_data = json.loads((PROJECT / "city-data.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\n"))
    grid = gridded_normals(source)
    stations = station_index(source / "noaa-normals.tar.gz")
    rows = {}
    for city in city_data["places"]:
        identifier, point = city[0], city[11]
        if point is None:
            continue
        state = city_data["states"][identifier[9:11]][0]
        on_grid = state not in ISLAND_OR_REMOTE
        values = grid_sample(point, grid) if on_grid else [None] * 3
        gridded = all(value is not None for value in values)
        nearby = [(7917.52 * math.asin(math.sqrt(d) / 2), normals)
                  for d, (region, normals) in stations.within(*point) if region == (None if on_grid else state)]
        limit = 45 if on_grid else (22 if state == "AK" else 18)
        for column in range(3):
            if values[column] is None:
                values[column] = station_sample(nearby, column, values, limit)
        reference = values[:2]
        values.extend(station_sample(nearby, column, reference, limit) for column in range(3, 8))
        if any(value is not None for value in values):
            rows[identifier] = [*[round(value, 1) if value is not None else None for value in values], int(gridded)]
    counts = [sum(row[i] is not None for row in rows.values()) for i in range(8)]
    grid_count = sum(row[8] for row in rows.values())
    if grid_count < 46000 or min(counts[:3]) < 46000 or counts[3] < 20000 or min(counts[4:]) < 42000:
        raise ValueError(f"Incomplete city climate coverage: {counts}, {grid_count:,} gridded")
    print(f"City climate coverage: {counts}, {grid_count:,} gridded", flush=True)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--fetch", action="store_true", help="cache the NOAA public normal files")
    args = parser.parse_args()
    if args.fetch:
        args.source_dir.mkdir(parents=True, exist_ok=True)
        fetch(args.source_dir)
    rows = build(args.source_dir)
    payload = json.dumps(rows, separators=(",", ":"), allow_nan=False)
    (PROJECT / "city-climate.js").write_text(f"// Generated by scripts/build-find-your-place-city-climate.py.\nwindow.findYourPlaceCityClimate={payload};\n", encoding="utf-8")


if __name__ == "__main__":
    main()
