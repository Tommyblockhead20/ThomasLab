"""Build Find Your Place's climate, housing, and access metrics from public snapshots."""

import argparse
from bisect import bisect_right
import csv
import gzip
import io
import json
import math
import re
import tarfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.request import urlopen
from xml.etree import ElementTree
from zipfile import ZipFile

from find_your_place_spatial import NearbyPoints, boarding_stop_index, cms_hospital_locations
from find_your_place_broadband import county_broadband
from find_your_place_home_sales import fetch_sale_quarters, sale_estimate


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "FindYourPlace"
THRESHOLDS = [
    "ANN-TMIN-AVGNDS-LSTH000",
    "ANN-TMIN-AVGNDS-LSTH032",
    "ANN-TMAX-AVGNDS-GRTH090",
    "ANN-TMAX-AVGNDS-GRTH100",
]


def app_data(*names):
    page = (PROJECT / "index.html").read_text(encoding="utf-8")
    decoder = json.JSONDecoder()
    return [decoder.raw_decode(page.split(f"const {name}=", 1)[1].lstrip())[0] for name in names]


def app_geography():
    return app_data("LIVE_DATA", "ENTITY_COORDS", "METRO_COUNTY_MEMBERS")


def zipped_csv(archive, name, encoding="utf-8-sig"):
    with archive.open(name) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding=encoding))


def numeric(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def read_csv_source(path):
    if not path.exists():
        return gzip.open(f"{path}.gz", "rt", encoding="utf-8-sig", newline="")
    return path.open(encoding="utf-8-sig", newline="")


def population_centers(path, tracts, live):
    aliases = {modern: old for old in live["county"] for modern in equivalent_counties(old)
               if modern not in live["county"]}
    centers = []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            county = row["STATEFP"] + row["COUNTYFP"]
            tract = county + row["TRACTCE"]
            if county.startswith("09"):
                county = tracts.get(tract, (county,))[0]
            county = aliases.get(county, county)
            pop = int(row["POPULATION"])
            if county in live["county"] and pop > 0:
                centers.append((county, pop, float(row["LATITUDE"]), float(row["LONGITUDE"])))
    if len(centers) < 80000 or len({row[0] for row in centers}) < 3100:
        raise ValueError("Census tract population centers lack national coverage")
    return centers


def transit_stop_coverage(path, centers, members):
    lookup = boarding_stop_index(path)
    total, served = Counter(), Counter()
    for county, population, lat, lon in centers:
        total[county] += population
        if next(lookup.within(lat, lon), None) is not None:
            served[county] += population
    county = {code: [round(served[code] / pop, 6)] for code, pop in sorted(total.items()) if served[code]}
    metro = {}
    for code, areas in members.items():
        pop = sum(total[area] for area in areas)
        near = sum(served[area] for area in areas)
        if pop and near:
            metro[code] = [round(near / pop, 6)]
    if len(county) < 500 or len(metro) < 200 or county.get("36061", [0])[0] < .9:
        raise ValueError("Transit stop population join failed its coverage checks")
    return {"county": county, "metro": metro}


def county_market_name(name):
    plain = unicodedata.normalize("NFKD", name.casefold()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\bsaint\b", "st", plain))


def recent_home_sales(source, live):
    abbreviations, = app_data("STATE_ABBR_BY_FIPS")
    county_by_name = {}
    for code, (name, *_) in live["county"].items():
        state = abbreviations.get(code[:2])
        if state:
            county_by_name[county_market_name(f"{name.split(',')[0]}, {state}")] = code

    result = {}
    for kind, areas, minimum in (("county", "counties", 30), ("metro", "metros", 90)):
        samples = defaultdict(list)
        with (source / f"redfin-home-quarters-{areas}.csv").open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                code = (county_by_name.get(county_market_name(row["REGION NAME"]))
                        if kind == "county" else row["REGION ID"].zfill(5))
                if code in live[kind]:
                    samples[code].append(row)

        result[kind] = {}
        for code, rows in samples.items():
            if estimate := sale_estimate(rows, minimum, monthly=True):
                price, ppsf, count, months = estimate
                result[kind][code] = [price, ppsf, "sales", count, months]
    if len(result["county"]) < 1400 or len(result["metro"]) < 220:
        raise ValueError(f'Unexpected closed-sale coverage: {len(result["county"])} counties, '
                         f'{len(result["metro"])} metros')
    return result


def home_market_prices(source, live, members, population):
    sales = recent_home_sales(source, live)
    for code, counties in members.items():
        if code not in live["metro"] or code in sales["metro"]:
            continue
        total_pop = sum(population.get(county, 0) for county in counties)
        covered = [county for county in counties if county in sales["county"]]
        if not total_pop or not covered or sum(population[county] for county in covered) < .7 * total_pop:
            continue
        rows = [sales["county"][county] for county in covered]
        total_sales = sum(row[3] for row in rows)
        if total_sales < 90:
            continue
        estimate = sum(row[0] * row[3] for row in rows) / total_sales
        sales["metro"][code] = [round(estimate), round(estimate / 1800, 1), "countySales", total_sales, max(row[4] for row in rows)]
    result = {}
    for kind, id_field, minimum in (("county", "county_fips", 25), ("metro", "cbsa_code", 75)):
        rows = {}
        with (source / f"realtor-{kind.title()}-ask.csv").open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                code = row[id_field].zfill(5)
                ppsf = numeric(row["median_listing_price_per_square_foot"])
                size = numeric(row["median_square_feet"])
                median = numeric(row["median_listing_price"])
                listings = numeric(row["active_listing_count"])
                if (code in live[kind] and row["month_date_yyyymm"] == "202610"
                        and row["quality_flag"] == "0" and listings and listings >= minimum
                        and ppsf and 25 <= ppsf <= 3000 and size and 300 <= size <= 10000
                        and median and 25000 <= median <= 10000000):
                    rows[code] = [round(1800 * ppsf), round(ppsf, 1), "listings", round(listings)]
        result[kind] = {**rows, **sales[kind]}
    if len(result["county"]) < 1900 or len(result["metro"]) < 275:
        raise ValueError(f'Housing market data lack expected coverage: {len(result["county"])} counties, '
                         f'{len(result["metro"])} metros')
    return result


def population_table(live):
    i = live["keys"].index("population")
    return {code: record[2][i] or 0 for code, record in live["county"].items()}


def presidential_vote(source, live, members, population):
    with ZipFile(source / 'election-fec-2024.xlsx') as archive:
        strings = [''.join(node.itertext()) for node in ElementTree.fromstring(archive.read('xl/sharedStrings.xml'))]
        sheet = ElementTree.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in sheet.findall('.//{*}row'):
        rows.append({cell.get('r').rstrip('0123456789'): strings[int(value)] if cell.get('t') == 's' else value
                     for cell in row if (value := cell.findtext('{*}v')) is not None})
    if (rows[0]['A'], rows[0]['M'], rows[0]['Y']) != ('STATE', 'HARRIS', 'TRUMP'):
        raise ValueError('Unexpected FEC presidential workbook columns')
    official = {row['A']: (int(row['M']), int(row['Y'])) for row in rows if re.fullmatch('[A-Z]{2}', row.get('A', ''))
                and row.get('M', '').isdigit() and row.get('Y', '').isdigit()}
    if len(official) != 51:
        raise ValueError('Unexpected number of certified state/DC results')
    # Virginia's certified abstract differs from the FEC spreadsheet's Virginia row.
    # https://townhall.virginia.gov/L/GetFile.cfm?File=meeting%5C151%5C40367%5CAgenda_ELECT_40367_v3.pdf
    official['VA'] = (2335395, 2075085)
    with (source / 'election-2024-compiled.csv').open(newline='', encoding='utf-8-sig') as file:
        comparison = {row['county_fips']: (int(row['votes_dem']), int(row['votes_gop'])) for row in csv.DictReader(file)}
    with (source / 'election-heideman-summary.csv').open(newline='', encoding='utf-8-sig') as file:
        compiled = {row['county_fips']: (int(row['dem_votes']), int(row['rep_votes'])) for row in csv.DictReader(file)
                    if row['year'] == '2024' and row['office'] == 'president' and row['status'] == 'covered'}
    votes = {code: counts for code, counts in compiled.items() if code in live['county'] and not code.startswith('02')
             and comparison.get(code) == counts and min(counts) >= 0 and sum(counts)}
    # Two independently certified Oregon counties expose the provisional returns in the comparison file.
    # The complete set of 36 updated counties also reconciles to both FEC candidate totals.
    oregon = {code: counts for code, counts in compiled.items() if code.startswith('41') and code in live['county']}
    if (len(oregon) != 36 or tuple(map(sum, zip(*oregon.values()))) != official['OR']
            or oregon.get('41051') != (325927, 70759) or oregon.get('41005') != (130580, 106387)):
        raise ValueError('Oregon county results did not match the FEC and county canvasses')
    votes.update(oregon)
    votes['11001'] = official['DC']
    abbreviations, = app_data('STATE_ABBR_BY_FIPS')
    subtotals = defaultdict(Counter)
    for code, (harris, trump) in votes.items():
        subtotal = subtotals[abbreviations[code[:2]]]
        subtotal.update(harris=harris, trump=trump)
    if (subtotals['VA']['harris'], subtotals['VA']['trump']) != official['VA']:
        raise ValueError('Virginia county and independent city results do not reconcile to the certified abstract')
    if any(row['harris'] > official[state][0] or row['trump'] > official[state][1] for state, row in subtotals.items()):
        raise ValueError('Matched presidential results exceed a certified statewide total')
    if len(votes) < 3000 or sum(map(sum, votes.values())) < .95 * sum(map(sum, official.values())):
        raise ValueError('Too few county presidential results passed verification')

    metro = {}
    for code, counties in members.items():
        known = [member for member in counties if member in votes]
        total = sum(population.get(member, 0) for member in counties)
        covered = sum(population.get(member, 0) for member in known)
        if total and covered >= .95 * total:
            harris, trump = map(sum, zip(*(votes[member] for member in known)))
            metro[code] = [harris, trump, round(covered / total, 4)]
    return {'county': votes, 'metro': metro}


def equivalent_counties(code):
    return {
        "02261": ["02063", "02066"], "02270": ["02158"], "46113": ["46102"],
    }.get(code, [code])


def bridge_condition(path, live, members, population):
    state_names, = app_data('STATE_NAMES')
    codes = {name.upper(): code for code, name in state_names.items()}
    codes['U.S. VIRGIN ISLANDS'] = '78'
    unpublished = {}
    with ZipFile(path) as bundle, ZipFile(io.BytesIO(bundle.read('county26.xlsx'))) as workbook:
        shared = [''.join(node.itertext()) for node in ElementTree.fromstring(workbook.read('xl/sharedStrings.xml'))]
        sheets = [name for name in workbook.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name)]
        for name in sheets:
            rows = ElementTree.fromstring(workbook.read(name)).findall('.//{*}row')
            state = None
            summed = [0] * 8
            locations = 0
            for row in rows:
                values = {cell.get('r').rstrip('0123456789'): shared[int(value)] if cell.get('t') == 's' else value
                          for cell in row if (value := cell.findtext('{*}v')) is not None}
                label = values.get('A', '').strip()
                if row.get('r') == '4':
                    state = codes[label]
                if label == 'TOTALS':
                    official = [int(values[col]) for col in 'BCDEFGHI']
                    if summed[:4] != official[:4] or any(abs(a - b) > locations for a, b in zip(summed[4:], official[4:])):
                        raise ValueError(f'FHWA county bridge values do not reconcile for {state}')
                    break  # The second table excludes federally owned bridges.
                match = re.search(r'\((\d{3})\)$', label)
                if match and state:
                    data = [int(values[col]) for col in 'BCDEFGHI']
                    count, good_n, fair_n, poor_n, area, good, fair, poor = data
                    if count != good_n + fair_n + poor_n or abs(area - good - fair - poor) > 2 or min(data) < 0:
                        raise ValueError(f'Invalid bridge counts or area for {label}, {state}')
                    summed = [a + b for a, b in zip(summed, data)]
                    locations += 1
                    if area:
                        unpublished[state + match.group(1)] = [count, good, fair, poor]
    county = {}
    for code in live['county']:
        matched = [unpublished[subcode] for subcode in equivalent_counties(code) if subcode in unpublished]
        if matched:
            county[code] = list(map(sum, zip(*matched)))
    metro = {}
    for code, counties in members.items():
        matched = [member for member in counties if member in county]
        covered = sum(population.get(member, 0) for member in matched)
        total = sum(population.get(member, 0) for member in counties)
        if total and covered >= .95 * total:
            pooled = list(map(sum, zip(*(county[member] for member in matched))))
            metro[code] = [*pooled, round(covered / total, 4)]
    if len(county) < 3000 or len(metro) < 350:
        raise ValueError(f'Insufficient FHWA inspection coverage: {len(county)} counties / {len(metro)} metros')
    return {'county': county, 'metro': metro}


def pavement_condition(path, live, members, population):
    sections = json.loads(path.read_text(encoding='utf-8'))
    source = {}
    for row in sections:
        code = f'{int(row["stateid"]):02d}{int(row["county_id"]):03d}'
        total, measured, weighted = [float(row[key]) for key in ('total_miles', 'measured_miles', 'iri_miles')]
        if not (total > 0 and 0 <= measured <= total + .0001 and 0 <= weighted <= 1000 * measured + .0001):
            raise ValueError(f'Invalid NHS mileage or roughness data for {code}')
        if code in source:
            raise ValueError(f'Duplicate NHS mileage row for {code}')
        source[code] = [total, measured, weighted]
    states = {code[:2] for code in source}
    if len(source) < 2550 or len(states) < 50:
        raise ValueError('Insufficient geographic coverage in the FHWA pavement export')
    matched = {}
    for code in live['county']:
        rows = [source[other] for other in equivalent_counties(code) if other in source]
        if rows:
            matched[code] = list(map(sum, zip(*rows)))

    def summarize(totals):
        total, measured, weighted = totals
        if measured >= 5 and measured >= .8 * total:
            return [round(weighted / measured, 2), round(measured, 2), round(total, 2)]
        return None

    county = {code: result for code, totals in matched.items() if (result := summarize(totals))}
    metro = {}
    for code, counties in members.items():
        total_pop = sum(population.get(county, 0) for county in counties)
        state_covered = sum(population.get(county, 0) for county in counties if county[:2] in states)
        rows = [matched[county] for county in counties if county in matched]
        if rows and total_pop and state_covered >= .95 * total_pop:
            if result := summarize(list(map(sum, zip(*rows)))):
                metro[code] = result
    return {'county': county, 'metro': metro}


def aggregate_metros(rows, members, population, width, *, minimum_coverage=.6):
    """Return population-weighted estimates where enough residents are covered."""
    metros = {}
    for code, counties in members.items():
        total = sum(population.get(county, 0) for county in counties)
        covered = sum(population.get(county, 0) for county in counties if county in rows)
        if total and covered and covered / total >= minimum_coverage:
            means = [
                round(sum(rows[county][i] * population.get(county, 0)
                          for county in counties if county in rows) / covered, 3)
                for i in range(width)
            ]
            metros[code] = [*means, round(covered / total, 3)]
    return metros


CRIME_YEARS = ("2025", "2024", "2023", "2022")
NYC_BOROUGHS = {"36005", "36047", "36061", "36081", "36085"}


def crime_geography(path):
    county_pop = {}
    place_parts = defaultdict(dict)
    incorporated = set()
    with path.open(encoding="latin-1", newline="") as stream:
        for row in csv.DictReader(stream):
            code = row["STATE"] + row["COUNTY"]
            place = row["STATE"] + row["PLACE"]
            if row["SUMLEV"] == "050":
                county_pop[code] = {year: int(row[f"POPESTIMATE{year}"]) for year in CRIME_YEARS}
            elif row["SUMLEV"] == "157":
                place_parts[place][code] = int(row["POPESTIMATE2025"])
            elif row["SUMLEV"] == "162":
                incorporated.add(place)

    # The publisher assigns each agency to a single county. Use the Census place parts
    # to flag material possible population spillovers for multi-county municipalities.
    spillover = Counter()
    for place, parts in place_parts.items():
        if place not in incorporated or len(parts) < 2:
            continue
        primary = max(parts, key=parts.get)
        for code, residents in parts.items():
            if code != primary:
                spillover[code] += residents
                spillover[primary] += residents
    if len(county_pop) < 3100 or len(place_parts) < 10000:
        raise ValueError("Census population file lacks county or incorporated place coverage")
    ambiguous = {code for code, residents in spillover.items()
                 if code in county_pop and residents > .05 * county_pop[code]["2025"]}
    return county_pop, ambiguous | NYC_BOROUGHS


def reported_crime(source_dir, live, members):
    county_pop, ambiguous = crime_geography(source_dir / "census-place-parts-2025.csv")
    app_population = population_table(live)
    dataset = json.loads((source_dir / "fbi-county-coverage-audit.json").read_text(encoding="utf-8"))
    annual = {}
    for record in dataset["records"]:
        code = record["id"].rsplit(":", 1)[-1]
        if (record["level"] != "county" or code not in live["county"] or code not in county_pop
                or code in ambiguous or record.get("flags", {}).get("suppressed")
                or record.get("flags", {}).get("preliminary")):
            continue
        fields = record["yearFields"]
        years = {}
        for year in CRIME_YEARS:
            if year not in record["years"]:
                continue
            values = dict(zip(fields, record["years"][year]))
            violent, property_crime = values["violent"], values["property"]
            reported_pop, coverage = values["population"], values["coverageOffensesPct"]
            census_pop = county_pop[code][year]
            if (violent is None or property_crime is None or min(violent, property_crime) < 0
                    or coverage is None or not 90 <= coverage <= 100 or not census_pop
                    or reported_pop is None or not census_pop * .95 <= reported_pop <= census_pop * 1.10):
                continue
            exposure = min(reported_pop, census_pop) * coverage / 100
            years[year] = (violent, property_crime, exposure)
        selected = [year for year in CRIME_YEARS if year in years][:3]
        if len(selected) == 3 and selected[0] == "2025":
            annual[code] = years

    def pooled_row(years, rows, total_pop):
        exposure = sum(r[2] for r in rows)
        return [round(sum(r[0] for r in rows) / exposure * 100000, 2),
                round(sum(r[1] for r in rows) / exposure * 100000, 2),
                round(exposure / total_pop, 4), [int(y) for y in reversed(years)], round(exposure)]

    county = {}
    for code, table in sorted(annual.items()):
        years = [year for year in CRIME_YEARS if year in table][:3]
        county[code] = pooled_row(years, [table[y] for y in years],
                                  sum(county_pop[code][y] for y in years))
    metro = {}
    for code, counties in members.items():
        by_year = {}
        for year in CRIME_YEARS:
            nominal = sum(county_pop.get(c, {}).get(year, 0) or app_population.get(c, 0) for c in counties)
            rows = [annual[c][year] for c in counties if c in annual and year in annual[c]]
            covered = sum(county_pop[c][year] for c in counties if c in annual and year in annual[c])
            if nominal and covered >= .9 * nominal:
                by_year[year] = rows, nominal
        years = list(by_year)[:3]
        if len(years) == 3 and years[0] == "2025":
            metro[code] = pooled_row(years, [row for y in years for row in by_year[y][0]],
                                     sum(by_year[y][1] for y in years))
    if len(county) < 1600 or len(metro) < 200 or county.keys() & ambiguous:
        raise ValueError("Crime snapshot lacks expected coverage or contains ambiguous jurisdictions")
    return {"county": county, "metro": metro}


def homicide_context(path, live, members, population):
    state_fips = dict(zip(
        "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(),
        "01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56".split(),
    ))
    published = {}
    with path.open(encoding="ascii", newline="") as stream:
        for row in csv.DictReader(stream):
            fips = state_fips[row["state"]] + row["county"]
            deaths, exposure, rate = int(row["deaths"]), int(row["population"]), float(row["crude_rate"])
            if deaths < 10 or exposure <= 0 or abs(deaths / exposure * 100000 - rate) > .011:
                raise ValueError(f"Invalid or unpublished CDC homicide rate for {fips}")
            if fips in published:
                raise ValueError(f"Duplicate CDC homicide county: {fips}")
            published[fips] = (deaths, exposure, rate)

    counts = {code: published[code] for code in live["county"] if code in published}
    county = {code: [rate, deaths < 20, 1] for code, (deaths, _, rate) in sorted(counts.items())}
    metro = {}
    for code, areas in members.items():
        total_pop = sum(population.get(area, 0) for area in areas)
        covered_pop = sum(population.get(area, 0) for area in areas if area in counts)
        if total_pop and covered_pop / total_pop >= .9:
            deaths = sum(counts[area][0] for area in areas if area in counts)
            exposure = sum(counts[area][1] for area in areas if area in counts)
            metro[code] = [round(deaths / exposure * 100000, 2), deaths < 20, round(covered_pop / total_pop, 4)]
    if len(county) < 1650 or county["06037"][0] != 6.5:
        raise ValueError("Ten-year CDC homicide coverage or benchmark is unexpected")
    return {"county": county, "metro": metro}


def modeled_air_quality(source_dir, live, members, population):
    def source_rows(pollutant, year):
        path = source_dir / f"cdc-air-{pollutant}-{year}.json"
        return {f'{int(row["statefips"]):02d}{int(row["countyfips"]):03d}': row
                for row in json.loads(path.read_text(encoding="utf-8"))}

    years = []
    for year in (2020, 2021, 2022):
        pm = source_rows("pm25", year)
        ozone = source_rows("ozone", year)
        high = source_rows("high-ozone", year)
        by_county = {}
        for code in pm.keys() & ozone.keys():
            pm_days, ozone_days = int(pm[code]["days"]), int(ozone[code]["days"])
            pm_mean, ozone_mean = float(pm[code]["concentration"]), float(ozone[code]["concentration"])
            high_days = int(high.get(code, {}).get("days", 0))
            if (pm_days >= 340 and ozone_days >= 340 and 0 <= pm_mean <= 60
                    and 0 <= ozone_mean <= 100 and 0 <= high_days <= ozone_days):
                by_county[code] = (pm_mean * pm_days, pm_days,
                                   ozone_mean * ozone_days, ozone_days, high_days)
        years.append(by_county)
    counties = {}
    for code in sorted(set.intersection(*(set(y) for y in years)) & live["county"].keys()):
        pm_sum, pm_days, ozone_sum, ozone_days, high_days = map(sum, zip(*(y[code] for y in years)))
        counties[code] = [round(pm_sum / pm_days, 3), round(ozone_sum / ozone_days, 3),
                          round(high_days / ozone_days * 365.25, 3)]
    if len(counties) < 3000:
        raise ValueError("CDC air quality coverage is incomplete")
    return {'county': counties, 'metro': aggregate_metros(counties, members, population, 3)}


def temperature_extremes(path, live, coordinates, members, population):
    stations = defaultdict(list)
    with tarfile.open(path, "r|gz") as archive:
        for member in archive:
            if not member.isfile() or not member.name.endswith(".csv"):
                continue
            with archive.extractfile(member) as raw:
                row = next(csv.DictReader(io.StringIO(raw.read().decode("utf-8-sig"))), {})
            if not row.get("STATION", "").startswith(("US", "RQ", "VQ")):
                continue
            days = [numeric(row.get(key)) for key in THRESHOLDS]
            lat, lon = numeric(row.get("LATITUDE")), numeric(row.get("LONGITUDE"))
            if lat is None or lon is None or any(v is None or not 0 <= v <= 366 for v in days):
                continue
            latitude, longitude = math.radians(lat), math.radians(lon)
            norms = [numeric(row.get(key)) for key in ("DJF-TAVG-NORMAL", "JJA-TAVG-NORMAL")]
            stations[math.floor(lat)].append((latitude, longitude, math.cos(latitude), days, norms))
    station_count = sum(map(len, stations.values()))
    if station_count < 7000:
        raise ValueError("Unexpected NOAA threshold station coverage")
    county = {}
    seasons = [live["keys"].index(key) for key in ("winterTemp", "summerTemp")]
    for code, (name, _, values) in live["county"].items():
        point = coordinates.get(name)
        if not point:
            continue
        lat, lon = point[:2]
        latitude, longitude = math.radians(lat), math.radians(lon)
        latitude_cosine = math.cos(latitude)
        nearby = []
        for band in range(math.floor(lat) - 2, math.floor(lat) + 3):
            for slat, slon, coslat, days, norms in stations[band]:
                arc = math.sin((slat - latitude) / 2) ** 2
                arc += latitude_cosine * coslat * math.sin((slon - longitude) / 2) ** 2
                miles = 7917.6 * math.asin(min(1, math.sqrt(arc)))
                if miles <= 75:
                    nearby.append((miles, days, norms))
        selected = sorted(nearby, key=lambda row: row[0])[:6]
        if not selected:
            continue
        estimates = []
        for i in range(4):
            season = i // 2
            baseline = values[seasons[season]]
            weighted = []
            for dist, days, norms in selected:
                station_temp = norms[season]
                climate = math.exp(-abs(station_temp - baseline) / 10) if (
                    None not in (baseline, station_temp) and -100 <= station_temp <= 125
                ) else .65
                weighted.append((climate / (6 + dist) ** 2, days[i]))
            estimates.append(round(sum(w * value for w, value in weighted) /
                                   sum(w for w, _ in weighted), 1))
        county[code] = [*estimates, round(selected[0][0], 1), len(selected)]
    metros = aggregate_metros(county, members, population, 4)
    if len(county) < 3150 or len(metros) < 380:
        raise ValueError("Unexpected county or metro threshold coverage")
    return {"county": county, "metro": metros, "stations": station_count}


def bedroom_rents(path, live, members, population):
    county, metro, national = {}, {}, None
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file, delimiter="|"):
            geo = row["GEO_ID"]
            if not re.fullmatch(r"(?:0100000US|0500000US\d{5}|310M700US\d{5})", geo):
                continue
            values = [numeric(row[f"B25031_E00{i}"]) for i in (2, 3, 4, 5, 6, 7, 1)]
            rents = [int(v) if v and v > 0 else None for v in values]
            if geo == "0100000US":
                national = rents
            elif geo.startswith("050") and geo[-5:] in live["county"]:
                county[geo[-5:]] = rents
            elif geo.startswith("310") and geo[-5:] in live["metro"]:
                metro[geo[-5:]] = rents
    if not national or any(v is None for v in national) or len(county) < 3100:
        raise ValueError("Unexpected ACS bedroom rent data")
    for code, counties in members.items():
        published = metro.get(code, [None] * 7)
        total = sum(population.get(county_code, 0) for county_code in counties)
        rents = []
        for i in range(7):
            if published[i] is not None:
                rents.append(published[i])
                continue
            rows = [(county[county_code][i], population.get(county_code, 0))
                    for county_code in counties if county_code in county and county[county_code][i] is not None]
            covered = sum(n for _, n in rows)
            rents.append(round(sum(rent * n for rent, n in rows) / covered)
                         if covered and total and covered / total >= .90 else None)
        metro[code] = rents
    return {"national": national, "county": county, "metro": metro}


def median_earnings(path, live, members, population):
    national, county, metro = None, {}, {}
    with path.open(encoding='utf-8-sig', newline='') as file:
        for row in csv.DictReader(file, delimiter='|'):
            geo = row['GEO_ID']
            amount = numeric(row['B20002_E001'])
            if not amount or amount <= 0:
                continue
            if geo == '0100000US':
                national = int(amount)
            elif geo.startswith('0500000US') and geo[-5:] in live['county']:
                county[geo[-5:]] = [int(amount)]
            elif geo.startswith('310M700US') and geo[-5:] in live['metro']:
                metro[geo[-5:]] = [int(amount)]
    if not national or len(county) < 3100:
        raise ValueError('Unexpected ACS median earnings coverage')
    for code, row in aggregate_metros(county, members, population, 1, minimum_coverage=.90).items():
        metro.setdefault(code, [round(row[0])])
    return {'national': national, 'county': county, 'metro': metro}


def nonhousing_price_levels(path):
    lines = ("2", "5")  # BEA goods and other services, excluding housing and utility rents.
    values = defaultdict(dict)
    with ZipFile(path) as archive:
        name = next(name for name in archive.namelist() if name.startswith("SARPP_STATE_") and name.endswith(".csv"))
        for row in zipped_csv(archive, name):
            code, line = row["GeoFIPS"].strip(' "'), row["LineCode"]
            if re.fullmatch(r"\d{2}000", code) and line in lines:
                values[code[:2]][line] = float(row["2024"])
    return {code: [round(100 * parts[line] / values["00"][line], 3) for line in lines]
            for code, parts in values.items() if code != "00"}


def metro_state_weights(members, population, states):
    result = {}
    for code, counties in members.items():
        counts = Counter()
        total = sum(population.get(county, 0) for county in counties)
        for county in counties:
            if county[:2] in states:
                counts[county[:2]] += population.get(county, 0)
        covered = sum(counts.values())
        if total and covered >= .90 * total:
            result[code] = {state: round(count / covered, 6) for state, count in counts.items() if count}
    return result


def retailer_tracts(path, live):
    # USDA supplies the 2024 planning region for each 2020 Connecticut tract.
    connecticut_names = {rec[0].split(",")[0].casefold(): code
                         for code, rec in live["county"].items() if code.startswith("09")}
    tracts = {}
    with ZipFile(path) as archive:
        for row in zipped_csv(archive, "SRAM General Tract Characteristics Data.csv", "cp1252"):
            tract = row["CensusTract20"].zfill(11)
            code = tract[:5]
            if code.startswith("09"):
                code = connecticut_names.get(row["County24"].casefold(), code)
            tracts[tract] = (code, numeric(row["POP2020"]))
    return tracts


def grocery_access(path, tracts, live, members, population):
    tract_population = Counter()
    for code, pop in tracts.values():
        if pop is not None and pop > 0:
            tract_population[code] += pop
    totals = defaultdict(lambda: [0, 0])
    with ZipFile(path) as archive:
        for row in zipped_csv(archive, "SRAM Driving Distance Data.csv", "cp1252"):
            tract = row["CensusTract20"].zfill(11)
            code, pop = tracts.get(tract, (None, None))
            low = numeric(row["DD_SRAM_LAPOP1_10"])
            if not pop or low is None or low < 0 or low > pop + 1:
                continue
            totals[code][0] += min(low, pop)
            totals[code][1] += pop
    county = {}
    for code in live["county"]:
        county_codes = equivalent_counties(code)
        rows = [totals[sub] for sub in county_codes if sub in totals]
        observed = sum(pop for _, pop in rows)
        eligible = sum(tract_population[sub] for sub in county_codes)
        if eligible and observed / eligible >= .9:
            low_access_population = sum(low for low, _ in rows)
            county[code] = [round(1 - low_access_population / observed, 5), round(observed / eligible, 5)]
    if len(county) < 3100:
        raise ValueError("Unexpected USDA retailer access geography coverage")
    return {"county": county, "metro": aggregate_metros(county, members, population, 1, minimum_coverage=.9)}


def noise_exposure(path, tracts, live, members, population):
    data = json.loads(path.read_text(encoding="utf-8"))
    exposures = {}
    for row in data:
        tract = row["GEOID"]
        people = numeric(row.get("estimat"))
        bands = [numeric(row.get(key)) for key in ("ns6070n", "ns7080n", "ns8090n", "nois90n")]
        if tract in exposures:
            raise ValueError(f"Duplicate transportation noise tract {tract}")
        if people and people > 0 and all(v is not None and v >= 0 for v in bands):
            exposed = sum(bands)
            if exposed <= people + 1:
                exposures[tract] = (min(exposed, people), people)
    national_exposed = sum(row[0] for row in exposures.values())
    if not 11_400_000 <= national_exposed <= 12_400_000:
        raise ValueError("Transportation noise counts do not reproduce the published national estimate")
    aliases = {modern: old for old in live["county"] for modern in equivalent_counties(old)
               if modern not in live["county"]}
    counts = defaultdict(lambda: [0, 0, 0, 0])
    for tract, (county, census_pop) in tracts.items():
        if not census_pop or census_pop < 0:
            continue
        totals = counts[aliases.get(county, county)]
        totals[3] += census_pop
        if tract in exposures:
            exposed, study_pop = exposures[tract]
            totals[0] += exposed
            totals[1] += study_pop
            totals[2] += census_pop
    county = {}
    for code in live["county"].keys() & counts.keys():
        exposed, study_pop, covered, census_pop = counts[code]
        if study_pop and covered >= .9 * census_pop:
            county[code] = [round(exposed / study_pop, 5), round(covered / census_pop, 4)]
    metro = {}
    for code, counties in members.items():
        reported = [member for member in counties if member in county]
        total = sum(population.get(member, 0) for member in counties)
        covered = sum(population.get(member, 0) * county[member][1] for member in reported)
        if total and covered >= .9 * total:
            exposed = sum(counts[member][0] for member in reported)
            study_pop = sum(counts[member][1] for member in reported)
            if study_pop:
                metro[code] = [round(exposed / study_pop, 5), round(covered / total, 4)]
    if len(county) < 3000:
        raise ValueError("Unexpected transportation-noise geography coverage")
    return {"county": county, "metro": metro}


def health_access(path, live, members, population):
    values = json.loads(path.read_text(encoding="utf-8"))
    county = {code: row for code, row in values.items() if code in live["county"]}
    metro = {}
    for code, counties in members.items():
        total = sum(population.get(id, 0) for id in counties)
        weighted = [(county[id][0], population.get(id, 0) * county[id][1])
                    for id in counties if id in county]
        covered = sum(people for _, people in weighted)
        if total and covered / total >= .6:
            metro[code] = [round(sum(minutes * people for minutes, people in weighted) / covered, 3),
                           round(covered / total, 4)]
    if len(county) < 2950 or len(metro) < 370:
        raise ValueError("Unexpected healthcare drive-time coverage")
    return {"county": county, "metro": metro}


def hospital_quality(source, centers, live, members):
    page = (PROJECT / 'index.html').read_text(encoding='utf-8')
    states = json.JSONDecoder().raw_decode(page.split('const V34_STATE_ABBR=', 1)[1])[0]
    states.update({'60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI'})

    def normalized(name):
        name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
        name = name.replace("'", '').replace('.', '')
        return ' '.join(re.findall(r'[a-z0-9]+', name))

    counties = defaultdict(set)
    for code, (name, _, _) in live['county'].items():
        state = states.get(code[:2])
        name = normalized(name.split(',')[0])
        short = re.sub(r' (city and borough|census area|borough|municipality|municipio|parish|county)$', '', name)
        for alias in {short, name}:
            counties[state, alias].add(code)

    found = {}
    points = []
    seen = set()
    exact = 0
    for row, location, has_exact_match in cms_hospital_locations(source):
        stars = numeric(row['Hospital overall rating'])
        hospital = row['Facility ID']
        if stars not in (1, 2, 3, 4, 5) or not hospital or hospital in seen:
            continue
        seen.add(hospital)
        exact += has_exact_match
        if location:
            codes = counties[row['State'], normalized(row['County/Parish'])]
            found[hospital] = stars, next(iter(codes)) if len(codes) == 1 else None
            points.append((*location, hospital))

    lookup = NearbyPoints(points, 45)
    total, covered, rating_sum = Counter(), Counter(), Counter()
    reachable = defaultdict(set)
    for code, pop, lat, lon in centers:
        total[code] += pop
        # Island and isolated Alaska catchments should not assume cross-county road access.
        limit_to_county = code.startswith(("02", "15", "72", "78"))
        candidates = sorted((math.sqrt(d) * 3958.76, hospital)
                            for d, hospital in lookup.within(lat, lon)
                            if not limit_to_county or found[hospital][1] == code)
        if not candidates:
            continue
        limit = max(20, candidates[0][0] + 12)
        hospitals = [(d, hospital) for d, hospital in candidates[:6] if d <= limit]
        weights = [1 / (1 + (d / 12) ** 2) for d, _ in hospitals]
        estimate = sum(weight * found[hospital][0] for weight, (_, hospital) in zip(weights, hospitals)) / sum(weights)
        covered[code] += pop
        rating_sum[code] += pop * estimate
        reachable[code].update(hospital for _, hospital in hospitals)

    def summary(areas):
        residents = sum(total[code] for code in areas)
        included = sum(covered[code] for code in areas)
        if not residents or included / residents < .65:
            return None
        hospitals = set().union(*(reachable[code] for code in areas))
        outside = sum(found[hospital][1] is not None and found[hospital][1] not in areas for hospital in hospitals)
        return [round(sum(rating_sum[code] for code in areas) / included, 3),
                len(hospitals), outside, round(included / residents, 4)]

    county = {code: result for code in sorted(total) if (result := summary({code}))}
    metro = {code: result for code, areas in members.items() if (result := summary(set(areas)))}
    if len(found) < 3000 or exact < 2200 or len(county) < 2200 or len(metro) < 350:
        raise ValueError(f'Unexpected CMS catchment coverage: {exact} HRSA matches, {len(county)} counties, {len(metro)} metros')
    return {'county': county, 'metro': metro, 'matched': len(found), 'exactMatches': exact, 'rated': len(seen)}


def water_compliance(path, live, members):
    aliases = {modern: old for old in live["county"] for modern in equivalent_counties(old)
               if modern not in live["county"]}
    county_ids = live["county"].keys()
    metro_areas = {code: set(counties) for code, counties in members.items()}
    county_metros = defaultdict(set)
    for metro, counties in metro_areas.items():
        for county in counties:
            county_metros[county].add(metro)
    totals = {"county": defaultdict(lambda: [0] * 8), "metro": defaultdict(lambda: [0] * 8)}
    with ZipFile(path) as archive:
        for row in zipped_csv(archive, "SDWA_SYSTEM_SEARCH.csv"):
            if row["PWS_TYPE_CODE"] != "CWS" or row["PWS_ACTIVITY_CODE"] != "A":
                continue
            people = numeric(row["POPULATION_SERVED_COUNT"])
            geography = set(re.findall(r"\b\d{5}\b", row["FIPS_CODES"]))
            if not people or people < 0 or not geography:
                continue
            mapped = {aliases.get(code, code) for code in geography}
            history = row["SDWA_3YR_COMPL_QTRS_HISTORY"][:12]
            complete = len(history) == 12 and set(history) <= set("_VS")
            targets = [("county", county, len(mapped) == 1) for county in mapped & county_ids]
            targets.extend(("metro", metro, mapped <= metro_areas[metro])
                           for metro in set().union(*(county_metros[code] for code in mapped)))
            for level, code, contained in targets:
                bucket = totals[level][code]
                # Count every overlapping system in the coverage denominator. Its assignment
                # can only add evidence if every county it serves is inside the area.
                bucket[0] += people
                if not complete or not contained:
                    continue
                bucket[1] += people
                bucket[2] += people * (history.count("V") + history.count("S")) / 12
                bucket[3] += people * history.count("S") / 12
                for i, key in ((4, "HEALTH_FLAG"), (6, "MR_FLAG")):
                    flag = row[key].strip().casefold()
                    if flag in ("yes", "no"):
                        bucket[i] += people
                        bucket[i+1] += people if flag == "yes" else 0
    result = {}
    for kind, areas in totals.items():
        result[kind] = {}
        for code, (possible, people, violations, priority, health_total, health_flagged, mr_total, mr_flagged) in sorted(areas.items()):
            if people < possible:
                continue
            health = round(health_flagged / health_total, 5) if health_total >= .9 * people else None
            reporting = round(mr_flagged / mr_total, 5) if mr_total >= .9 * people else None
            result[kind][code] = [round(violations / people, 5), round(priority / people, 5),
                                  health, reporting]
    if len(result["county"]) < 2800 or len(result["metro"]) < 350:
        raise ValueError("EPA drinking-water file lacks expected complete-area coverage")
    return result


def local_climate(path, live, coordinates, members, population):
    source = json.loads(path.read_text(encoding="utf-8"))
    result = {}
    for key in ('humidity', 'sunshine'):
        grid = source[key]
        latitudes = grid['latitude']
        longitudes = grid['longitude'] + [grid['longitude'][0] + 360]
        values = grid['values']
        county = {}
        for code, (name, _, _) in live['county'].items():
            point = coordinates.get(name)
            if not point:
                continue
            lat, lon = point[:2]
            lon = (lon - longitudes[0]) % 360 + longitudes[0]
            y = max(0, min(len(latitudes) - 2, bisect_right(latitudes, lat) - 1))
            x = bisect_right(longitudes, lon) - 1
            yf = (lat - latitudes[y]) / (latitudes[y + 1] - latitudes[y])
            xf = (lon - longitudes[x]) / (longitudes[x + 1] - longitudes[x])
            corners = []
            for j, yw in ((y, 1 - yf), (y + 1, yf)):
                for i, xw in ((x, 1 - xf), ((x + 1) % len(values[j]), xf)):
                    candidate = values[j][i]
                    if candidate is not None:
                        corners.append((candidate, xw * yw))
            weight = sum(w for _, w in corners)
            if weight <= 0:
                continue
            value = sum(v * w for v, w in corners) / weight
            if key == 'humidity' and -80 <= value <= 50:
                county[code] = [round(value * 1.8 + 32, 2)]
            elif key == 'sunshine' and 0 <= value <= 1:
                county[code] = [round(value, 5)]
        if len(county) < 3150:
            raise ValueError(f'Unexpected NASA {key} geography coverage')
        result[key] = {'county': county, 'metro': aggregate_metros(county, members, population, 1)}
    return result


def childcare_prices(path, live, members, population):
    price_fields = ['MCINFANT', 'MCTODDLER', 'MCPRESCHOOL', 'MFCCINFANT', 'MFCCTODDLER', 'MFCCPRESCHOOL']
    county = {}
    with ZipFile(path) as archive, archive.open('xl/worksheets/sheet1.xml') as sheet:
        strings = [''.join(node.itertext()) for node in ElementTree.fromstring(archive.read('xl/sharedStrings.xml'))]
        fields = None
        wanted = set()
        for _, row in ElementTree.iterparse(sheet, events=['end']):
            if not row.tag.endswith('}row'):
                continue
            if fields is not None:
                year_cell = row.find(f"{{*}}c[@r='{fields['STUDYYEAR']}{row.get('r')}']")
                if year_cell is None or year_cell.findtext('{*}v') != '2022':
                    row.clear()
                    continue
            cells = {}
            for cell in row:
                column = cell.get('r').rstrip('0123456789')
                if wanted and column not in wanted:
                    continue
                value = cell.findtext('{*}v')
                if value is not None:
                    cells[column] = strings[int(value)] if cell.get('t') == 's' else value
            row.clear()
            if fields is None:
                fields = {value: key for key, value in cells.items()}
                wanted = {fields[key] for key in ['COUNTY_FIPS_CODE', 'MFI_2022', *price_fields]}
                continue
            code = cells.get(fields['COUNTY_FIPS_CODE'], '').zfill(5)
            income = numeric(cells.get(fields['MFI_2022']))
            if code not in live['county'] or not income or income <= 0:
                continue
            weekly = [numeric(cells.get(fields[field])) for field in price_fields]
            prices = [p * 52 if p else None for p in weekly]
            values = [[round(price), round(price / income, 5)] if price and price > 0 else None for price in prices]
            if any(values):
                county[code] = values
    if len(county) < 2400:
        raise ValueError('Unexpected Department of Labor childcare coverage')
    # Measure each age/setting's relative price within the same complete counties.
    # This avoids learning differences due to which counties report each setting.
    complete = [row for row in county.values() if all(row)]
    if len(complete) < 1000:
        raise ValueError('Too few complete county childcare baskets to validate estimates')
    relative_prices = [tuple(pair[0] / sum(item[0] for item in row) * 6 for pair in row) for row in complete]
    references = [sum(prices[i] for prices in relative_prices) / len(complete) for i in range(6)]
    patterns = {tuple(i for i, pair in enumerate(row) if pair) for row in county.values()}
    accepted = {tuple(range(6))}
    errors_by_pattern = []
    for indexes in sorted(patterns - accepted):
        if len(indexes) < 3 or not (min(indexes) < 3 <= max(indexes)):
            continue
        # Five-fold holdout: does the published subset reconstruct the full basket?
        errors = []
        for fold in range(5):
            train = [row for i, row in enumerate(relative_prices) if i % 5 != fold]
            expected = sum(sum(row[i] for i in indexes) for row in train) / len(train)
            errors.extend(abs(sum(row[i] for i in indexes) / expected - 1) for row in relative_prices[fold::5])
        p90 = sorted(errors)[int(.90 * len(errors))]
        if p90 <= .10:
            accepted.add(indexes)
            errors_by_pattern.append(p90)
    print(f'Childcare: {len(complete):,} complete counties; {len(accepted) - 1} validated partial baskets; '
          f'worst accepted p90 error {max(errors_by_pattern, default=0):.1%}')
    estimates = {}
    for code, values in county.items():
        indexes = tuple(i for i, pair in enumerate(values) if pair)
        if indexes in accepted:
            expected = sum(references[i] for i in indexes)
            annual = sum(values[i][0] for i in indexes) / expected
            burden = sum(values[i][1] for i in indexes) / expected
            estimates[code] = [round(annual), round(burden, 5), len(indexes)]
    metro = {}
    for code, counties in members.items():
        known = [member for member in counties if member in estimates]
        total = sum(population.get(member, 0) for member in counties)
        covered = sum(population.get(member, 0) for member in known)
        if total and covered >= .9 * total:
            means = [sum(estimates[member][i] * population.get(member, 0) for member in known) / covered
                     for i in range(3)]
            metro[code] = [round(means[0]), round(means[1], 5), round(means[2], 2), round(covered / total, 4)]
    return {'county': estimates, 'metro': metro}


def school_achievement(scores_path, school_path, crosswalk_path, live, members, population):
    districts = defaultdict(Counter)
    with school_path.open(encoding='utf-8-sig', newline='') as file:
        for row in csv.DictReader(file):
            if row['LEAID'] and row['CNTY']:
                districts[row['LEAID']][row['CNTY']] += 1
    seda_districts = defaultdict(set)
    with crosswalk_path.open(encoding='utf-8-sig', newline='') as file:
        for row in csv.DictReader(file):
            if row['geo'] == 'sedaadmin' and row['year'] == '2025':
                seda_districts[row['seda_id']].add(row['id'].zfill(7))
    latest = {}
    with read_csv_source(scores_path) as file:
        for row in csv.DictReader(file):
            if row['subcat'] != 'all' or row['year'] not in ('2024', '2025'):
                continue
            estimate = numeric(row['cs_mn_avg_eb'])
            assessments = numeric(row['tot_asmts'])
            if estimate is None or not assessments or assessments < 20:
                continue
            id = row['sedaadmin']
            years = latest.setdefault(id, {})
            years[row['year']] = (estimate, assessments)
    mapped = defaultdict(list)
    for id, years in latest.items():
        distribution = Counter()
        for district in seda_districts.get(id, {id.zfill(7)}):
            distribution.update(districts.get(district, {}))
        total = sum(distribution.values())
        if not total:
            continue
        current = max(years)
        estimate, assessments = years[current]
        for code, schools in distribution.items():
            if code in live['county']:
                mapped[code].append((estimate, assessments * schools / total, current == '2025'))
    county = {}
    for code, rows in mapped.items():
        total = sum(weight for _, weight, _ in rows)
        mean = sum(value * weight for value, weight, _ in rows) / total
        share_2025 = sum(weight for _, weight, current in rows if current) / total
        county[code] = [round(mean, 3), round(share_2025, 3), len(rows)]
    metro = aggregate_metros(county, members, population, 2)
    if len(county) < 2600 or len(metro) < 330:
        raise ValueError(f'Unexpected Stanford and NCES school coverage: {len(county)} counties, {len(metro)} metros')
    return {'county': county, 'metro': metro}


def main():
    from find_your_place_city_air import county_pm25, monitored_air_days
    from find_your_place_hospital_details import area_details, quality_lookup, summarize_quality

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--fetch-home-sales", action="store_true", help="refresh the archived Redfin sales subset")
    args = parser.parse_args()
    source = args.source_dir
    if args.fetch_home_sales:
        for geography in ("counties", "metros"):
            fetch_sale_quarters(source, geography)
    live, coordinates, members = app_geography()
    population = population_table(live)
    housing = bedroom_rents(source / "acs-rent-bedrooms.dat", live, members, population)
    housing["otherPrices"] = nonhousing_price_levels(source / "bea-regional.zip")
    state_prices = {code: housing["otherPrices"][code[:2]] for code in population
                    if code[:2] in housing["otherPrices"]}
    housing["metroOtherPrices"] = aggregate_metros(state_prices, members, population, 2, minimum_coverage=.90)
    housing["metroStateWeights"] = metro_state_weights(members, population, housing["otherPrices"])
    retailers = source / "usda-sram.zip"
    tracts = retailer_tracts(retailers, live)
    centers = population_centers(source / "tract-centers-2020.csv", tracts, live)
    states, = app_data("STATE_ABBR_BY_FIPS")
    care = area_details(((code, pop, lat, lon, states.get(code[:2])) for code, pop, lat, lon in centers),
                        quality_lookup(source))
    snapshot = {
        "housing": housing,
        'medianPay': median_earnings(source / 'acs-median-earnings.dat', live, members, population),
        "temperature": temperature_extremes(source / "noaa-normals.tar.gz", live, coordinates, members, population),
        "grocery": grocery_access(retailers, tracts, live, members, population),
        "broadband": county_broadband(source / "county-broadband-2026.06.csv", live, members, population),
        "crime": reported_crime(source, live, members),
        "homicide": homicide_context(source / "cdc-homicide-2015-2024.csv", live, members, population),
        "airQuality": modeled_air_quality(source, live, members, population),
        "pm25Recent": county_pm25(source, centers, members),
        "airDays": {"county": monitored_air_days(source, live["county"]), "metro": {}},
        "noise": noise_exposure(source / "noise-tracts.json", tracts, live, members, population),
        'presidentialVote': presidential_vote(source, live, members, population),
        'bridges': bridge_condition(source / 'fhwa-bridges-2026.zip', live, members, population),
        'pavement': pavement_condition(source / 'fhwa-hpms-2024-miles.json', live, members, population),
        "health": health_access(source / "health-drive-counties.json", live, members, population),
        "homeMarket": home_market_prices(source, live, members, population),
        "transitStops": transit_stop_coverage(source / "ntm-stops-2026.csv", centers, members),
        'hospitalQuality': hospital_quality(source, centers, live, members),
        "hospitalDetails": {
            "county": {code: row for code, values in sorted(care.items()) if (row := summarize_quality([values]))},
            "metro": {code: row for code, counties in members.items() if (row := summarize_quality([care[c] for c in counties]))},
        },
        "water": water_compliance(source / "epa-water-systems.zip", live, members),
        **local_climate(source / "nasa-climate.json", live, coordinates, members, population),
        'childcare': childcare_prices(source / 'dol-childcare-2022.xlsx', live, members, population),
        'education': school_achievement(source / 'seda-county-source.csv', source / 'nces-schools.csv',
                                        source / 'seda-crosswalk.csv', live, members, population),
    }
    data = json.dumps(snapshot, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    (PROJECT / "metric-data.js").write_text(
        "// Generated by scripts/build-find-your-place-metrics.py.\n"
        "// Broadband adapted from US Internet Map (https://usinternetmap.com/data/), CC BY 4.0.\n"
        "// PM2.5 adapted from SatPM V6.GL.03 (https://www.satpm.org/v6-gl-03), CC BY 4.0.\n"
        "// Presidential votes adapted from Paul Heideman (https://doi.org/10.5281/zenodo.22976553), CC BY 4.0.\n"
        f"window.findYourPlaceMetricData={data};\n", encoding="utf-8",
    )
    for key, values in snapshot.items():
        print(key, len(values["county"]), "counties", len(values["metro"]), "metros")


if __name__ == "__main__":
    main()
