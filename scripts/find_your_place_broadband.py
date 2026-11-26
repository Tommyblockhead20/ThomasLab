"""Read matched FCC Broadband Data Collection geography summaries."""

import csv


def broadband_rows(path, geoid_width):
    rows = {}
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            identifier = row["geoid"].zfill(geoid_width)
            if not row["t100.pct"] or not row["bsl"]:
                continue
            shares = [round(float(row[key]) / 100, 4) if row[key] else None
                      for key in ("t100.pct", "fiber.pct", "w100_2plus.pct")]
            locations = int(row["bsl"])
            if (locations <= 0 or identifier in rows or
                    any(value is not None and not 0 <= value <= 1 for value in shares)):
                raise ValueError(f"Invalid broadband record {identifier}")
            rows[identifier] = [shares[0], locations, *shares[1:]]
    return rows


def county_broadband(path, live, members, population):
    summary = broadband_rows(path, 5)
    county = {code: row for code, row in summary.items() if code in live["county"]}
    metro = {}
    for cbsa, counties in members.items():
        covered = [code for code in counties if code in summary]
        total = sum(population.get(code, 0) for code in counties)
        if not total or sum(population.get(code, 0) for code in covered) < .9 * total:
            continue
        included = [summary[code] for code in covered]
        locations = sum(row[1] for row in included)

        def average(column):
            reported = sum(row[1] for row in included if row[column] is not None)
            if reported and reported >= .9 * locations:
                return round(sum(row[column] * row[1] for row in included if row[column] is not None) / reported, 4)
            return None

        metro[cbsa] = [average(0), locations, average(2), average(3)]
    if len(county) < 3100 or len(metro) < 370:
        raise ValueError(f"Incomplete FCC geography coverage: {len(county)} counties, {len(metro)} metros")
    return {"county": county, "metro": metro}
