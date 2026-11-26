"""Spatial lookups used in the Find Your Place data builders."""

import csv
import gzip
import io
import json
import math
from collections import defaultdict
from zipfile import ZipFile


# The Census 2025 place boundaries of these municipalities match the 2024 township land areas.
ACS_CITY_GEOGRAPHY_ALIASES = {"1600000US4251794": "0600000US4200351696", "1600000US4259040": "0600000US4200359032"}


class NearbyPoints:
    def __init__(self, rows, radius_miles):
        self.radius = 2 * math.sin(radius_miles / (2 * 3958.76))
        self.radius_squared = self.radius ** 2
        self.cells = defaultdict(list)
        for lat, lon, value in rows:
            point = self.point(lat, lon)
            self.cells[self.cell(point)].append((point, value))

    @staticmethod
    def point(lat, lon):
        lat, lon = math.radians(lat), math.radians(lon)
        return (math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat))

    def cell(self, point):
        return tuple(math.floor(v / self.radius) for v in point)

    def within(self, lat, lon):
        x, y, z = self.point(lat, lon)
        a, b, c = self.cell((x, y, z))
        for i in range(a - 1, a + 2):
            for j in range(b - 1, b + 2):
                for k in range(c - 1, c + 2):
                    for (px, py, pz), value in self.cells.get((i, j, k), ()):
                        distance = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2
                        if distance <= self.radius_squared:
                            yield distance, value


def cms_hospital_locations(source):
    """Join CMS facilities to HRSA coordinates, falling back to Census ZIP centers."""
    hrsa = defaultdict(set)
    for provider, state, zip_code, lat, lon in json.loads((source / "hrsa-hospital-points.json").read_text(encoding="utf-8")):
        if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat or lon):
            hrsa[provider.zfill(6), state, zip_code.zfill(5)].add((lat, lon))
    zcta = {}
    with ZipFile(source / "zcta-2025.zip") as archive:
        with archive.open(archive.namelist()[0]) as file:
            body = io.TextIOWrapper(file, encoding="utf-8-sig")
            header = body.readline()
            delimiter = "|" if "|" in header else "\t"
            for row in csv.DictReader(body, fieldnames=header.strip().split(delimiter), delimiter=delimiter):
                zcta[row["GEOID"].strip()] = (float(row["INTPTLAT"]), float(row["INTPTLONG"]))

    with (source / "cms-hospitals.csv").open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            zip_code = row["ZIP Code"][:5].zfill(5)
            locations = hrsa[row["Facility ID"].zfill(6), row["State"], zip_code]
            exact = len(locations) == 1
            yield row, next(iter(locations)) if exact else zcta.get(zip_code), exact


def boarding_stop_index(path):
    stops = set()
    stream = path.open(encoding="utf-8-sig", newline="") if path.exists() else gzip.open(f"{path}.gz", "rt", encoding="utf-8-sig", newline="")
    with stream:
        for row in csv.DictReader(stream):
            if row["location_type"] not in {"0", "", "Null"} or not row["stop_type"]:
                continue
            try:
                lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
            except (TypeError, ValueError):
                continue
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                stops.add((round(lat, 5), round(lon, 5)))
    if len(stops) < 350000:
        raise ValueError("National Transit Map stop export is incomplete")
    return NearbyPoints(((lat, lon, True) for lat, lon in stops), .5)
