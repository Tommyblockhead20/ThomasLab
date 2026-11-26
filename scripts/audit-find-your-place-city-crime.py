"""Screen FBI City Agency Table 8 for potential Census place matches."""

import argparse
from collections import Counter, defaultdict
import csv
import json
from pathlib import Path
import re
import unicodedata
from xml.etree import ElementTree
from zipfile import ZipFile


DIRECTORY = Path(__file__).resolve().parents[1] / "FindYourPlace" / "city-data.js"
XML = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def normalized(name):
    text = unicodedata.normalize("NFKD", name.casefold())
    return "".join(character for character in text if character.isascii() and character.isalnum())


def workbook_rows(path):
    with ZipFile(path) as archive:
        strings = ["".join(node.itertext()) for node in ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))]
        sheet = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    for row in sheet.iter(f"{XML}row"):
        cells = {}
        for cell in row.findall(f"{XML}c"):
            value = cell.findtext(f"{XML}v")
            if value is not None:
                column = re.match(r"[A-Z]+", cell.get("r")).group()
                cells[column] = strings[int(value)] if cell.get("t") == "s" else value
        yield cells


def audit(path, directory):
    state_codes = {normalized(name): code for code, (_, name) in directory["states"].items()}
    municipalities = defaultdict(list)
    for identifier, name, kind, _, population, *_ in directory["places"]:
        if kind != "Census community" and population:
            municipalities[(identifier[9:11], normalized(name))].append((identifier, population))
    reports = defaultdict(list)
    outcomes = Counter()
    for row in workbook_rows(path):
        if not all(row.get(column, "").isdigit() for column in ("C", "D", "I")):
            continue
        state = state_codes.get(normalized(re.sub(r"\d+$", "", row.get("A", ""))))
        if not state or not row.get("B"):
            outcomes["unrecognized state or missing city"] += 1
            continue
        reports[(state, normalized(row["B"]))].append(int(row["C"]))
    matched = defaultdict(list)
    for key, populations in reports.items():
        places = municipalities.get(key, [])
        if len(populations) > 1 or len(places) > 1:
            outcomes["ambiguous agency or Census name"] += len(populations)
            continue
        if not places:
            outcomes["no exact municipality name"] += 1
            continue
        identifier, census_population = places[0]
        agency_population = populations[0]
        if min(census_population, agency_population) < 1000:
            outcomes["under 1,000 residents"] += 1
        elif abs(agency_population - census_population) > .1 * census_population:
            outcomes["agency population differs by more than 10%"] += 1
        else:
            matched[key[0]].append(identifier)
    return matched, outcomes


def audit_california_months(workbook, monthly_path, directory, candidates):
    """Cross-check complete California agency months and reported totals against FBI Table 8."""
    years = (2023, 2024, 2025)
    city_rows = {
        identifier: (name, (normalized(county), normalized(name)))
        for identifier, name, kind, county, *_ in directory["places"]
        if identifier in candidates and kind == "City" and county
    }
    key_counts = Counter(key for _, key in city_rows.values())
    months = defaultdict(lambda: defaultdict(dict))
    duplicates = set()
    with monthly_path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            if int(row["Year"]) not in years:
                continue
            key = normalized(row["County"]), normalized(row["NCICCode"])
            if key_counts[key] != 1:
                continue
            year, month = int(row["Year"]), int(row["Month"])
            fields = row["Violent_sum"], row["Property_sum"]
            if not all(value.isdecimal() for value in fields):
                continue
            if month in months[key][year]:
                duplicates.add(key)
            months[key][year][month] = tuple(map(int, fields))
    federal = {
        normalized(row["B"]): (int(row["D"]), int(row["I"]))
        for row in workbook_rows(workbook) if row.get("A") == "California"
        and all(row.get(column, "").isdecimal() for column in ("C", "D", "I"))
    }
    results = Counter()
    examples = {}
    expected_months = set(range(1, 13))
    for name, key in city_rows.values():
        if key_counts[key] != 1 or key in duplicates:
            results["ambiguous or duplicate state rows"] += 1
            continue
        if key not in months:
            results["no exact county and agency match in state file"] += 1
            continue
        counts = tuple(len(months[key][year]) for year in years)
        totals = tuple(map(sum, zip(*months[key][2025].values())))
        fbi_totals = federal[key[1]]
        if any(set(months[key][year]) != expected_months for year in years):
            results["incomplete state months"] += 1
        elif any(abs(value - fbi) > max(5, .10 * fbi) for value, fbi in zip(totals, fbi_totals, strict=True)):
            results["three complete years, but 2025 totals differ"] += 1
        else:
            results["three complete years and comparable 2025 totals"] += 1
        if name in {"Anaheim", "Berkeley", "Davis", "Huron", "Los Angeles", "Sacramento", "San Francisco", "San Jose"}:
            examples[name] = (counts, totals, fbi_totals)
    return results, examples


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("city_agency_table", type=Path)
    parser.add_argument("--california-monthly", type=Path, help="validate California matches against DOJ monthly counts")
    args = parser.parse_args()
    directory = json.loads(DIRECTORY.read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\r\n"))
    matched, outcomes = audit(args.city_agency_table, directory)
    print(f"{sum(map(len, matched.values())):,} candidate matches across {len(matched)} states or territories")
    for reason, count in sorted(outcomes.items()):
        print(f"{count:,} excluded: {reason}")
    print("Candidate matches need reporting-month and police-jurisdiction verification before scoring.")
    if args.california_monthly:
        results, examples = audit_california_months(args.city_agency_table, args.california_monthly,
                                                    directory, set(matched.get("06", ())))
        print("California comparison:", dict(sorted(results.items())))
        for city, (counts, state, fbi) in sorted(examples.items()):
            print(f"{city}: {counts} state months. State 2025 {state}, FBI 2025 {fbi} (violent, property).")


if __name__ == "__main__":
    main()
