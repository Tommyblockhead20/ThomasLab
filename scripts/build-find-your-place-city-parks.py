"""Aggregate the EPA EnviroAtlas park walking-access population counts by municipality."""

import argparse
import csv
import io
import json
from importlib import import_module
from pathlib import Path
from zipfile import ZipFile

import h3
import numpy as np
from shapely import STRtree, box, points


directory_builder = import_module("build-find-your-place-cities")
spatial_builder = import_module("build-find-your-place-city-spatial")
PROJECT = spatial_builder.PROJECT
EPA_FILE = "PORA_Access_and_Availability_H3_Level_9.csv"
CONUS_EXCLUDED = {"02", "15", "72"}
EMPTY_COUNTS = b"," + b",".join([b"0.000000000000000"] * 7) + b"\r\n"


def hex_populations(path):
    with ZipFile(path) as archive, archive.open(EPA_FILE) as file:
        header = next(file).decode("utf-8-sig")
        columns = next(csv.reader(io.StringIO(header)))
        expected = ["GRID_ID", "POP20_1", "AVGIMP_1", "LT_3sum", "LT_1125sum", "GTE_1125sum",
                    "GTE_3_LTE_1125sum", "E_0sum"]
        if columns != expected:
            raise ValueError("Unexpected EPA walkable recreation table columns")
        for line in file:
            if line[15:] == EMPTY_COUNTS:
                continue
            cell, population, rest = line.split(b",", 2)
            _, _, below_threshold, above_threshold, _, unavailable = rest.split(b",")
            unavailable = unavailable.strip()
            base = float(population or 0)
            near, total = 0.0, 0.0
            if below_threshold and above_threshold and unavailable:
                near = float(below_threshold) + float(above_threshold)
                total = near + float(unavailable)
            if total <= 0 and base <= 0:
                continue
            latitude, longitude = h3.cell_to_latlng(cell.decode("ascii"))
            yield longitude, latitude, total, near, base


def aggregate(source, cities):
    _, _, _, _, baseline = directory_builder.directory(source)
    aliases = spatial_builder.ACS_CITY_GEOGRAPHY_ALIASES
    populations = {row[0]: baseline.get(aliases.get(row[0], row[0])) or row[4]
                   for row in cities if row[0][9:11] not in CONUS_EXCLUDED}
    codes, boundaries = spatial_builder.load_places(source, populations)
    tree = STRtree(boundaries)
    n = len(codes)
    total_pop, near_pop, base_pop, sample_counts = (np.zeros(n) for _ in range(4))

    def add_batch(batch):
        lon, lat, total, near, base = np.asarray(batch).T
        candidates = tree.query(box(lon.min(), lat.min(), lon.max(), lat.max()))
        city_indices, hexes = STRtree(points(lon, lat)).query(tree.geometries[candidates], predicate="covers")
        areas = candidates[city_indices]
        near_pop[:] += np.bincount(areas, weights=near[hexes], minlength=n)
        total_pop[:] += np.bincount(areas, weights=total[hexes], minlength=n)
        base_pop[:] += np.bincount(areas, weights=base[hexes], minlength=n)
        sample_counts[:] += np.bincount(areas, weights=total[hexes] > 0, minlength=n)

    batch, represented, base_national = [], 0.0, 0.0
    for n_rows, sample in enumerate(hex_populations(source / "epa-park-hexes.zip"), 1):
        represented += sample[2]
        base_national += sample[4]
        batch.append(sample)
        if len(batch) == 100_000:
            add_batch(batch)
            batch.clear()
        if n_rows % 2_000_000 == 0:
            print(f"Processed {n_rows:,} populated cells", flush=True)
    if batch:
        add_batch(batch)
    print(f"EPA nationwide population partitions: {represented:,.0f} tabulated, {base_national:,.0f} baseline", flush=True)
    if not all(300_000_000 <= population <= 340_000_000 for population in (represented, base_national)):
        raise ValueError("Unexpected national population in EPA park table")

    results = {}
    for i, code in enumerate(codes):
        reference = populations[code]
        if reference and reference >= 100 and sample_counts[i] >= 5:
            # EPA tabulated reach and non-reach separately from the baseline population raster.
            if all(.90 <= population / reference <= 1.10 for population in (total_pop[i], base_pop[i])):
                results[code] = [round(float(near_pop[i] / total_pop[i]), 5), int(sample_counts[i])]
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=PROJECT / "city-parks.js")
    args = parser.parse_args()
    payload = (PROJECT / "city-data.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\r\n")
    cities = json.loads(payload)["places"]
    parks = aggregate(args.source, cities)
    selected = {code: parks.get(code) for code in ("1600000US1150000", "1600000US4260000", "1600000US3712000",
                                                  "1600000US5363000", "1600000US0667000", "1600000US1751649")}
    print(f"{len(parks):,} places passed the park data checks. Samples: {selected}", flush=True)
    if len(parks) < 10_000 or not all(selected[code] for code in ("1600000US1150000", "1600000US4260000", "1600000US3712000")):
        raise ValueError("EPA park access is missing expected geographic coverage")
    data = json.dumps({code: row[0] for code, row in parks.items()}, separators=(",", ":"), allow_nan=False)
    args.output.write_text("// Generated from EPA EnviroAtlas by scripts/build-find-your-place-city-parks.py.\n"
                           f"window.findYourPlaceCityParks={data};\n", encoding="utf-8")


if __name__ == "__main__":
    main()
