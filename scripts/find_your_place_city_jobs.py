"""Estimate city job access from Census LODES primary jobs near residents."""

import csv
import gzip
import io
from zipfile import ZipFile

from find_your_place_spatial import NearbyPoints


STATES = "al az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split()
FIELDS = tuple(f"CNS{i:02}" for i in range(1, 21))
RADIUS = 25


def tract_jobs(source):
    tracts = {}
    for state in STATES:
        with gzip.open(source / f"{state}-wac-2024.csv.gz", "rt", encoding="utf-8-sig", newline="") as raw:
            for row in csv.DictReader(raw):
                total = int(row["C000"])
                if not total:
                    continue
                tract = row["w_geocode"][:11]
                values = (total, *(int(row[column]) for column in FIELDS))
                if tract not in tracts:
                    tracts[tract] = list(values)
                else:
                    for i, value in enumerate(values):
                        tracts[tract][i] += value
    return tracts


def job_access(source, places):
    jobs = tract_jobs(source)
    with ZipFile(source / "jobs-gaz-tracts.zip") as archive, archive.open(archive.namelist()[0]) as file:
        rows = csv.DictReader(io.TextIOWrapper(file, encoding="utf-8-sig"), delimiter="\t")
        rows.fieldnames = [field.strip() for field in rows.fieldnames]
        points = []
        matched = 0
        for row in rows:
            values = jobs.get(row["GEOID"])
            missing = row["USPS"].lower() not in STATES
            if values or missing:
                points.append((float(row["INTPTLAT"]), float(row["INTPTLONG"]), values))
            if values:
                matched += values[0]
    if matched < .985 * sum(row[0] for row in jobs.values()):
        raise ValueError("Census tract centers do not cover enough LODES jobs")
    lookup = NearbyPoints(points, RADIUS)
    output = {}
    for place in places:
        identifier, location = place[0], place[11]
        if location is None:
            continue
        candidates = [row for _, row in lookup.within(*location)]
        if not candidates or None in candidates:
            continue
        totals = tuple(map(sum, zip(*candidates, strict=True)))
        top = sorted(enumerate(totals[1:]), key=lambda row: (-row[1], row[0]))[:3]
        output[identifier] = [totals[0], [index for index, count in top if count > 0]]
    if len(output) < 42000:
        raise ValueError(f"Incomplete workplace access coverage: {len(output)} places")
    print(f"City job access: {len(output):,} places covering {matched:,} geolocated primary jobs")
    return output
