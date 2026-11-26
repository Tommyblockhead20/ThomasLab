"""Summarize CMS hospital outcomes and patient experience around where people live."""

from collections import defaultdict
import csv
import math

from find_your_place_spatial import NearbyPoints, cms_hospital_locations


def read_measure(path, id_column, measure, score_column, count_column, minimum):
    values = {}
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            if row[id_column] != measure:
                continue
            try:
                score, count = float(row[score_column]), int(row[count_column])
            except ValueError:
                continue
            if 0 <= score <= 100 and count >= minimum:
                values[row["Facility ID"]] = score / 100
    return values


def quality_lookup(source):
    mortality = read_measure(source / "cms-outcomes.csv", "Measure ID", "MORT_30_HF", "Score", "Denominator", 25)
    experience = read_measure(source / "cms-experience.csv", "HCAHPS Measure ID", "H_HSP_RATING_9_10",
                              "HCAHPS Answer Percent", "Number of Completed Surveys", 100)
    points = []
    for row, location, _ in cms_hospital_locations(source):
        if (not location or row["Hospital Type"] not in {"Acute Care Hospitals", "Critical Access Hospitals"}
                or row["Hospital overall rating"] not in {"1", "2", "3", "4", "5"}):
            continue
        identifier = row["Facility ID"]
        points.append((*location, (identifier, row["State"], mortality.get(identifier), experience.get(identifier))))
    if len(mortality) < 1500 or len(experience) < 1500 or len(points) < 2800:
        raise ValueError("Incomplete CMS outcomes or patient-experience inputs")
    return NearbyPoints(points, 45)


def neighborhood_quality(lookup, latitude, longitude, state):
    candidates = sorted((2 * 3958.76 * math.asin(math.sqrt(distance) / 2), hospital)
                        for distance, hospital in lookup.within(latitude, longitude)
                        if state not in {"AK", "HI", "PR", "VI"} or hospital[1] == state)[:6]
    if not candidates:
        return None
    limit = max(20, candidates[0][0] + 12)
    nearby = [(1 / (1 + (distance / 12) ** 2), row) for distance, row in candidates if distance <= limit]
    total = sum(weight for weight, _ in nearby)
    return tuple(sum(weight * (row[column] if use_values else 1) for weight, row in nearby if row[column] is not None) / total
                 for column in (2, 3) for use_values in (True, False))


def area_details(points, lookup):
    """Return measures and their effective hospital coverage, grouped by area."""
    totals = defaultdict(lambda: [0.0] * 5)
    cached = {}
    for area, population, lat, lon, state in points:
        values = totals[area]
        values[0] += population
        point = (lat, lon, state)
        if point not in cached:
            cached[point] = neighborhood_quality(lookup, *point)
        if nearby := cached[point]:
            for index, value in enumerate(nearby, 1):
                values[index] += population * value
    return totals


def summarize_quality(rows):
    residents, mortality, mortality_coverage, experience, experience_coverage = map(sum, zip(*rows))
    if not residents:
        return None
    data = []
    for value, covered in ((mortality, mortality_coverage), (experience, experience_coverage)):
        share = covered / residents
        data.extend((round(value / covered, 4) if share >= .6 else None, round(min(1, share), 3)))
    return data if data[0] is not None or data[2] is not None else None
