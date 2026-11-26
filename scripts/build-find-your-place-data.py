"""Build the supplemental Find Your Place snapshot from public source files."""

import argparse
import csv
import io
import json
import math
import re
import tarfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zipfile import ZipFile
from zoneinfo import ZoneInfo


AMENITIES = {
    "performingArts": ("7111", "76", {"1", "2", "3", "5"}),
    "museums": ("712110", "78", {"1", "2", "3", "5"}),
    "historicalSites": ("712120", "78", {"1", "2", "3", "5"}),
    "artDealers": ("459920", "78", {"5"}),
    "nightlife": ("722410", "78", {"5"}),
    "restaurants": ("7225", "76", {"5"}),
    "fullService": ("722511", "78", {"5"}),
    "limitedService": ("722513", "78", {"5"}),
    "animalAndBotanical": ("712130", "78", {"1", "2", "3", "5"}),
    "amusementParks": ("713110", "78", {"1", "2", "3", "5"}),
    "arcades": ("713120", "78", {"1", "2", "3", "5"}),
}
ATTRACTION_CATEGORIES = {"museums", "historicalSites", "animalAndBotanical", "amusementParks", "arcades"}
ARTS_CATEGORIES = {"performingArts", "artDealers"}
AIRPORT_QUERY = ("https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/"
                 "NTAD_Aviation_Facilities/FeatureServer/0/query")
EPA_MOBILITY = ("https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/"
                "Smart_Location_Database_/FeatureServer/0/query")
DOT_FLIGHTS = ("https://www.transtats.bts.gov/PREZIP/"
               "On_Time_Marketing_Carrier_On_Time_Performance_Beginning_January_2018_2025_{}.zip")
BTS_INTERNATIONAL_FLIGHTS = ("https://www.bts.gov/sites/bts.dot.gov/files/docs/airline-data/international-segments/"
                             "DB28SEG.FD.WAC.202501.202512.REL01.03MAR2026.zip")


def faa_boardings(workbook):
    with ZipFile(workbook) as archive:
        strings = [
            "".join(item.itertext())
            for item in ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
        ]
        sheet = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    records = []
    for row in sheet.find("{*}sheetData"):
        cells = {}
        for cell in row:
            value = cell.findtext("{*}v")
            if value is not None:
                column = cell.get("r").rstrip("0123456789")
                cells[column] = strings[int(value)] if cell.get("t") == "s" else value
        records.append(cells)
    if records[0].get("D") != "Locid" or records[0].get("I") != "CY 25 Enplanements":
        raise ValueError("Unexpected FAA workbook columns")
    return {
        row["D"]: (row["F"], row["E"], row["C"], int(row["I"]))
        for row in records[1:]
        if re.fullmatch(r"[A-Z0-9]{3,4}", row.get("D", ""))
        and row.get("I", "").isdigit()
        and int(row["I"]) >= 2500
    }


def airport_snapshot(boardings, points):
    airports = {}
    for row in points:
        code = row["attributes"]["ARPT_ID"]
        point = row.get("geometry") or {}
        if code not in boardings or point.get("x") is None or point.get("y") is None:
            continue
        name, city, state, count = boardings[code]
        latitude, longitude = point["y"], point["x"]
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError(f"Invalid coordinates for {code}")
        if code in airports:
            raise ValueError(f"Duplicate coordinates for {code}")
        airports[code] = [code, name, city, state, round(latitude, 5), round(longitude, 5), count]
    missing = sorted(boardings.keys() - airports.keys())
    if len(airports) < 350 or missing:
        raise ValueError(f"Airport join has a coverage gap: {missing}")
    print(f"Airport coordinates matched {len(airports)}/{len(boardings)}. Unmatched: {missing}")
    return [airports[code] for code in sorted(airports)]


def airport_points(cache, boardings):
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    points = []
    ids = sorted(boardings)
    for start in range(0, len(ids), 100):
        batch = ",".join(f"'{code}'" for code in ids[start:start + 100])
        query = urlencode({
            "f": "json", "where": f"ARPT_ID IN ({batch})", "outFields": "ARPT_ID",
            "returnGeometry": "true", "outSR": "4326",
        })
        with urlopen(f"{AIRPORT_QUERY}?{query}", timeout=20) as result:
            points.extend(json.load(result)["features"])
    return points


def bts_monthly_flights(source, month):
    path = source / f"airport-2025-{month}.zip"
    if path.exists():
        zipped = ZipFile(path)
    else:
        with urlopen(DOT_FLIGHTS.format(month), timeout=60) as response:
            zipped = ZipFile(io.BytesIO(response.read()))
    routes = Counter()
    flights = Counter()
    seen = set()
    with zipped:
        name = next(name for name in zipped.namelist() if name.lower().endswith(".csv"))
        with zipped.open(name) as raw:
            rows = csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
            header = next(rows)
            fields = ["Year", "Month", "DayofMonth", "Origin", "Dest", "DestCityMarketID",
                      "CRSDepTime", "DOT_ID_Operating_Airline", "Flight_Number_Operating_Airline",
                      "Cancelled", "Diverted"]
            columns = [header.index(field) for field in fields]
            for row in rows:
                year, report_month, day, origin, dest, market, time, carrier, number, cancel, divert = (
                    row[column] for column in columns
                )
                if year != "2025" or int(report_month) != month:
                    raise ValueError("Wrong reporting month in BTS flight archive")
                if not all((origin, dest, market, time, carrier, number)):
                    continue
                key = (day, origin, dest, time, carrier, number)
                if key in seen:
                    continue
                seen.add(key)
                if cancel == "0.00" and divert == "0.00":
                    routes[origin, market] += 1
                    flights[origin] += 1
    if sum(flights.values()) < 350000:
        raise ValueError(f"BTS monthly flight file is incomplete for month {month}")
    print(f'BTS 2025 month {month}: {sum(flights.values()):,} completed departures', flush=True)
    return routes, flights


def airport_service_snapshot(source, boardings):
    cache = source / "bts-airport-service-2025.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    routes, route_months, departures, active_months = (Counter() for _ in range(4))
    with ThreadPoolExecutor(max_workers=3) as workers:
        for routes_month, flights_month in workers.map(lambda m: bts_monthly_flights(source, m), range(1, 13)):
            routes.update(routes_month)
            route_months.update(routes_month.keys())
            departures.update(flights_month)
            active_months.update(flights_month.keys())
    destinations = Counter(origin for (origin, market), count in routes.items()
                           if count >= 36 and route_months[origin, market] >= 3)
    service = {code: [destinations[code], round(departures[code] / 365, 2)]
               for code in sorted(boardings) if destinations[code] and active_months[code] >= 6}
    if len(service) < 275 or service.get("ATL", [0])[0] < 100 or service.get("JFK", [0])[0] < 30:
        raise ValueError("Limited BTS airport match or unexpected destination breadth")
    cache.write_text(json.dumps(service, separators=(",", ":")), encoding="utf-8")
    return service


def international_airport_service(source, boardings):
    path = source / "bts-intl-2025.zip"
    if not path.exists():
        request = Request(BTS_INTERNATIONAL_FLIGHTS, headers={"Accept": "application/zip", "User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
    routes, departures = Counter(), Counter()
    months_by_route = defaultdict(set)
    months = set()
    with ZipFile(path) as archive:
        name = next(name for name in archive.namelist() if name.endswith(".asc"))
        with archive.open(name) as raw:
            for row in csv.reader(io.TextIOWrapper(raw, encoding="cp1252"), delimiter="|"):
                year, month, origin = row[:3]
                if year != "2025":
                    raise ValueError(f"Unexpected international flight year: {year}")
                months.add(month)
                # DB28 Segment layout: destination WAC, scheduled passenger service, departures performed, seats.
                if origin not in boardings or int(row[8]) < 100 or row[14] != "F" or not int(row[21]):
                    continue
                flights = int(row[18])
                if flights <= 0:
                    continue
                route = (origin, row[8], row[9].strip().casefold())
                routes[route] += flights
                months_by_route[route].add(month)
                departures[origin] += flights
    regular = Counter(route[0] for route, flights in routes.items() if flights >= 36 and len(months_by_route[route]) >= 3)
    service = {code: [regular[code], round(flights / 365, 2)] for code, flights in sorted(departures.items()) if regular[code]}
    if len(months) != 12 or len(service) < 65 or service.get("JFK", [0])[0] < 50 or service.get("LAX", [0])[0] < 35:
        raise ValueError("Unexpected BTS international flight coverage or destination breadth")
    return service


def qcew_rows(source_dir, code):
    with (source_dir / f"bls-{code}.csv").open(newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            if (row["year"], row["qtr"], row["industry_code"]) != ("2025", "4", code):
                raise ValueError(f"Unexpected year, quarter or industry for {code}")
            yield row


def qcew_snapshot(source_dir):
    national = None
    counties = set()
    wages = {}
    for row in qcew_rows(source_dir, "10"):
        if row["own_code"] != "0" or row["size_code"] != "0":
            continue
        code = row["area_fips"]
        wage = int(row["avg_wkly_wage"] or 0)
        if code == "US000" and row["agglvl_code"] == "10":
            national = wage
        if row["agglvl_code"] == "70" and re.fullmatch(r"\d{5}", code):
            counties.add(code)
            if wage > 0 and not row["disclosure_code"]:
                wages[code] = [wage, int(row["month3_emplvl"] or 0)]
    if not national or len(wages) < 3000 or len({row[0] for row in wages.values()}) < 100:
        raise ValueError("Wage snapshot lacks national or county coverage")

    amenities = {}
    bar_state_totals = {}
    reconciled_states = {}
    for key, (code, level, ownerships) in AMENITIES.items():
        counts = Counter()
        county_ownership, state_ownership, national_ownership = Counter(), Counter(), Counter()
        check_totals = key in ATTRACTION_CATEGORIES or key in ARTS_CATEGORIES
        for row in qcew_rows(source_dir, code):
            county = row["area_fips"]
            level_code, ownership = row["agglvl_code"], row["own_code"]
            if ownership not in ownerships or row["size_code"] != "0":
                continue
            count = int(row["qtrly_estabs"])
            if key == "nightlife" and level_code == "58":
                bar_state_totals[county[:2]] = count
            if county in counties and level_code == level:
                counts[county] += count
                county_ownership[county[:2], ownership] += count
            elif check_totals and int(level_code) == int(level) - 20:
                state_ownership[county[:2], ownership] += count
            elif check_totals and int(level_code) == int(level) - 60 and county == "US000":
                national_ownership[ownership] += count
        if len(counts) < 80:
            raise ValueError(f"Unexpected establishment coverage for {code}")
        amenities[key] = dict(sorted(counts.items()))
        if check_totals:
            state_sum = Counter()
            for (state, ownership), count in state_ownership.items():
                if int(state) <= 56:
                    state_sum[ownership] += count
            if not national_ownership or state_sum != national_ownership:
                raise ValueError(f"QCEW state totals do not match national establishment counts for {code}")
            states = {county[:2] for county in counties if int(county[:2]) <= 56}
            states.update(state for state, _ in state_ownership)
            reconciled_states[key] = {state for state in states if all(
                state_ownership[state, owner] == county_ownership[state, owner] for owner in ownerships)}
    restaurants = amenities["restaurants"]
    full_service = amenities["fullService"]
    limited_service = amenities["limitedService"]
    if len(restaurants) < 3000 or any(
        full_service.get(county, 0) + limited_service.get(county, 0) > restaurants.get(county, 0)
        for county in full_service.keys() | limited_service.keys()
    ):
        raise ValueError("Restaurant counts lack coverage or exceed the parent industry")
    # A missing local industry row means zero only if all published establishments
    # in the state are accounted for by county rows.
    bar_county_totals = Counter()
    for county, count in amenities["nightlife"].items():
        bar_county_totals[county[:2]] += count
    zero_bar_states = sorted(state for state, total in bar_state_totals.items() if bar_county_totals[state] == total)
    return {"nationalWage": national, "wages": dict(sorted(wages.items())), "counties": sorted(counties),
            "amenities": amenities, "zeroBarStates": zero_bar_states,
            "attractionStates": sorted(set.intersection(*(reconciled_states[key] for key in ATTRACTION_CATEGORIES))),
            "artsStates": sorted(set.intersection(*(reconciled_states[key] for key in ARTS_CATEGORIES)))}


def epa_mobility_rows(params):
    rows = []
    for offset in range(0, 8000, 2000):
        query = urlencode({"f": "json", "resultRecordCount": 2000,
                           "resultOffset": offset, **params})
        with urlopen(f"{EPA_MOBILITY}?{query}", timeout=30) as response:
            page = json.load(response)
        if "error" in page:
            raise ValueError(page["error"])
        features = page["features"]
        rows.extend(features)
        if not features or (len(features) < 2000 and not page.get("exceededTransferLimit")):
            return rows
    raise ValueError("Unexpected paging in EPA mobility data")


def epa_county_totals(where, fields):
    stats = [{"statisticType": "sum", "onStatisticField": field,
              "outStatisticFieldName": name} for name, field in fields.items()]
    rows = epa_mobility_rows({
        "where": f"STATEFP <> '09' AND ({where})",
        "groupByFieldsForStatistics": "STATEFP,COUNTYFP",
        "orderByFields": "STATEFP,COUNTYFP",
        "outStatistics": json.dumps(stats), "returnGeometry": "false",
    })
    totals = {}
    for row in rows:
        values = row["attributes"]
        code = values["STATEFP"] + values["COUNTYFP"]
        if code in totals:
            raise ValueError(f"Duplicate EPA county: {code}")
        totals[code] = {name: values[name] for name in fields}
    return totals


def connecticut_mobility_totals(boundaries):
    import shapefile
    from shapely.geometry import Polygon, shape

    with shapefile.Reader(str(boundaries)) as counties:
        regions = [(row.record["GEOID"], shape(row.shape.__geo_interface__))
                   for row in counties.iterShapeRecords(fields=["GEOID"])
                   if row.record["GEOID"].startswith("09")]
    if len(regions) != 9:
        raise ValueError("Census boundary file must contain Connecticut’s nine planning regions")

    rows = epa_mobility_rows({
        "where": "STATEFP = '09' AND TotPop > 0",
        "outFields": "OBJECTID,TotPop,NatWalkInd,D4A,D4C",
        "orderByFields": "OBJECTID", "returnGeometry": "true",
        "outSR": 4326, "geometryPrecision": 5, "maxAllowableOffset": 0.0002,
    })
    totals = {}
    unmatched_pop = 0
    for row in rows:
        values = row["attributes"]
        pop = values["TotPop"]
        rings = [Polygon(ring) for ring in row.get("geometry", {}).get("rings", [])
                 if len(ring) >= 4]
        if not rings:
            unmatched_pop += pop
            continue
        ring = max(rings, key=lambda polygon: polygon.area)
        point = ring.representative_point()
        code = next((code for code, region in regions if region.covers(point)), None)
        if not code:
            unmatched_pop += pop
            continue
        out = totals.setdefault(code, Counter())
        out["population"] += pop
        walk, distance, frequency = values["NatWalkInd"], values["D4A"], values["D4C"]
        if walk is not None and 1 <= walk <= 20:
            out["walkPop"] += pop
            out["walkSum"] += walk * pop
            if walk >= 15.26:
                out["highWalkPop"] += pop
        if distance is not None and distance >= 0:
            out["measuredPop"] += pop
            if distance <= 805:
                out["nearStopPop"] += pop
                if frequency is not None and frequency >= 0:
                    out["frequencyPop"] += pop
                    out["frequencySum"] += frequency * pop
    if len(totals) != 9 or unmatched_pop > sum(v["population"] for v in totals.values()) * .01:
        raise ValueError("EPA data did not reconcile to Connecticut planning regions")
    return totals


def mobility_snapshot(source_dir):
    cache = source_dir / "epa-mobility-counties.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    queries = [
        ("TotPop > 0", {"population": "TotPop"}),
        ("TotPop > 0 AND NatWalkInd BETWEEN 1 AND 20",
         {"walkPop": "TotPop", "walkSum": "NatWalkInd * TotPop"}),
        ("TotPop > 0 AND NatWalkInd BETWEEN 15.26 AND 20", {"highWalkPop": "TotPop"}),
        ("TotPop > 0 AND D4A >= 0", {"measuredPop": "TotPop"}),
        ("TotPop > 0 AND D4A BETWEEN 0 AND 805", {"nearStopPop": "TotPop"}),
        ("TotPop > 0 AND D4A BETWEEN 0 AND 805 AND D4C >= 0",
         {"frequencyPop": "TotPop", "frequencySum": "D4C * TotPop"}),
    ]
    totals = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(lambda query: epa_county_totals(*query), queries):
            for code, values in result.items():
                totals.setdefault(code, Counter()).update(values)
    totals.update(connecticut_mobility_totals(source_dir / "county-boundaries.zip"))
    snapshot = {}
    for code, row in sorted(totals.items()):
        pop, walk_pop = row["population"], row["walkPop"]
        if not pop:
            raise ValueError(f"EPA county {code} is missing its population")
        near, measured, freq_pop = row["nearStopPop"], row["measuredPop"], row["frequencyPop"]
        if not (0 <= freq_pop <= near <= measured <= pop and 0 <= row["highWalkPop"] <= walk_pop <= pop):
            raise ValueError(f"EPA county {code} has inconsistent population subtotals")
        snapshot[code] = [
            round(row["walkSum"] / walk_pop, 4) if walk_pop / pop >= .6 else None,
            round(row["highWalkPop"] / pop, 6) if walk_pop / pop >= .6 else None,
            round(near / pop, 6),
            round(measured / pop, 6),
            round(row["frequencySum"] / freq_pop, 4) if freq_pop else None,
            round(freq_pop / pop, 6),
        ]
    if len(snapshot) < 3200 or sum(row[4] is not None for row in snapshot.values()) < 300:
        raise ValueError("EPA mobility coverage is incomplete")
    cache.write_text(json.dumps(snapshot, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return snapshot


def number(row, key):
    value = (row.get(key) or "").strip()
    return float(value) if value else math.nan


def snowfall_snapshot(path):
    stations = {}
    with tarfile.open(path, "r|gz") as archive:
        for member in archive:
            if not member.isfile() or not member.name.endswith(".csv"):
                continue
            with archive.extractfile(member) as file:
                data = io.StringIO(file.read().decode("utf-8-sig"))
            row = next(csv.DictReader(data), {})
            station = row.get("STATION", "").strip()
            if not station.startswith(("US", "RQ", "VQ")):
                continue
            snow, winter = number(row, "ANN-SNOW-NORMAL"), number(row, "DJF-TAVG-NORMAL")
            lat, lon = number(row, "LATITUDE"), number(row, "LONGITUDE")
            if 0 <= snow <= 1000 and -90 <= lat <= 90 and -180 <= lon <= 180:
                stations[station] = [station, row["NAME"].strip(), round(lat, 5),
                                     round(lon, 5), snow,
                                     winter if -100 <= winter <= 125 else None]
    if len(stations) < 1200 or stations["USW00094728"][4] != 29.8:
        raise ValueError("Snowfall coverage or units check failed")
    return [stations[station] for station in sorted(stations)]


def amtrak_snapshot(path):
    with ZipFile(path) as archive:
        def table(name):
            with archive.open(f"{name}.txt") as raw:
                return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig")))

        feed = table("feed_info")[0]
        date = lambda value: datetime.strptime(value, "%Y%m%d").date()
        first = date(feed["feed_start_date"])
        days = [first + timedelta(days=i) for i in range(56)]
        weekdays = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        agency = {r["agency_id"]: r for r in table("agency")}
        service_days = {}
        for row in table("calendar"):
            start, end = date(row["start_date"]), date(row["end_date"])
            service_days[row["service_id"]] = {d for d in days
                                               if start <= d <= end and row[weekdays[d.weekday()]] == "1"}
        if "calendar_dates.txt" in archive.namelist():
            for row in table("calendar_dates"):
                day = date(row["date"])
                if day not in days:
                    continue
                active = service_days.setdefault(row["service_id"], set())
                if row["exception_type"] == "1":
                    active.add(day)
                elif row["exception_type"] == "2":
                    active.discard(day)
        routes = {}
        for row in table("routes"):
            if row["route_type"] != "2":
                continue
            name = row["route_long_name"] or row["route_short_name"] or row["route_id"]
            source = agency[row["agency_id"]]
            if re.search("shore line east|commuter rail", f'{name} {source["agency_name"]}', re.I):
                continue
            if source["agency_timezone"] != "America/New_York":
                raise ValueError("Amtrak trips use an unexpected timetable timezone")
            routes[row["route_id"]] = name
        trips = {}
        for row in table("trips"):
            route, active = row["route_id"], service_days.get(row["service_id"])
            if route in routes and active:
                trips[row["trip_id"]] = (route, active)
        stops = {row["stop_id"]: row for row in table("stops")}
        timing = defaultdict(list)
        for row in table("stop_times"):
            if row["trip_id"] in trips and row["stop_id"] in stops:
                timing[row["trip_id"]].append(row)

    def minutes(value):
        hour, minute, second = map(int, value.split(":"))
        return hour * 60 + minute + second / 60

    agency_clock = ZoneInfo("America/New_York")
    service_start = {d: datetime.combine(d, time(12), agency_clock).astimezone(timezone.utc)
                     - timedelta(hours=12) for d in days}
    departures, departure_quality, direct = defaultdict(Counter), defaultdict(Counter), defaultdict(Counter)
    for trip_id, rows in timing.items():
        route, active_days = trips[trip_id]
        active = len(active_days)
        rows.sort(key=lambda r: int(r["stop_sequence"]))
        for i, row in enumerate(rows):
            if row["pickup_type"] == "1" or not row["departure_time"] or i == len(rows) - 1:
                continue
            origin = row["stop_id"]
            start = minutes(row["departure_time"])
            zone = ZoneInfo(stops[origin]["stop_timezone"] or "America/New_York")
            offset = timedelta(minutes=start)
            hours = [(service_start[day] + offset).astimezone(zone).hour for day in active_days]
            quality = sum(.35 if 1 <= hour < 5 else (.75 if hour < 7 or hour >= 23 else 1)
                          for hour in hours)
            departures[origin][route] += active
            departure_quality[origin][route] += quality
            for dest in rows[i + 1:]:
                if dest["drop_off_type"] == "1" or not dest["arrival_time"] or dest["stop_id"] == origin:
                    continue
                ride = minutes(dest["arrival_time"]) - start
                if ride > 360:
                    break
                if ride >= 0:
                    direct[origin][dest["stop_id"]] += active

    route_keys = sorted({route for rows in departures.values() for route in rows})
    route_index = {rid: i for i, rid in enumerate(route_keys)}
    station_keys = sorted(departures.keys() | {d for counter in direct.values() for d in counter})
    station_index = {sid: i for i, sid in enumerate(station_keys)}
    station_rows = []
    for sid in station_keys:
        row = stops[sid]
        routes_at_stop = departures.get(sid, {})
        boardings = sum(routes_at_stop.values())
        services = [[route_index[rid], round(count / len(days), 4),
                     round(departure_quality[sid][rid] / count, 4)]
                    for rid, count in sorted(routes_at_stop.items())]
        destinations = sorted(station_index[dest] for dest, count in direct.get(sid, {}).items() if count >= 8)
        station_rows.append([sid, row["stop_code"] or sid, row["stop_name"],
                             round(float(row["stop_lat"]), 5), round(float(row["stop_lon"]), 5),
                             services, round(boardings / len(days), 4),
                             round(sum(departure_quality.get(sid, {}).values()) / boardings, 4) if boardings else 0,
                             destinations])
    if (len(station_rows) < 400 or len(route_keys) < 25 or "NYP" not in station_index
            or station_index["PHL"] not in station_rows[station_index["NYP"]][8]
            or station_index["LAX"] in station_rows[station_index["NYP"]][8]):
        raise ValueError("Amtrak schedule coverage or one-seat travel times failed validation")
    return {"version": feed["feed_version"], "routes": [[rid, routes[rid]] for rid in route_keys],
            "stations": station_rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    args = parser.parse_args()
    source = args.source_dir
    boardings = faa_boardings(source / "faa-final.xlsx")
    airports = airport_snapshot(boardings, airport_points(source / "airport-points.json", boardings))
    airport_service = airport_service_snapshot(source, boardings)
    international_service = international_airport_service(source, boardings)
    qcew = qcew_snapshot(source)
    mobility = mobility_snapshot(source)
    snow = snowfall_snapshot(source / "noaa-normals.tar.gz")
    rail = amtrak_snapshot(source / "amtrak-gtfs.zip")
    dest = Path(__file__).resolve().parents[1] / "FindYourPlace" / "supplemental-data.js"
    snapshot = json.dumps({"airports": airports, "airportService": airport_service, "airportInternational": international_service,
                           "qcew": qcew, "snow": snow, "mobility": mobility, "rail": rail},
                          separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    dest.write_text("// Generated by scripts/build-find-your-place-data.py.\n"
                    f"window.findYourPlaceSupplemental={snapshot};\n", encoding="utf-8")
    print(f"Wrote {len(airports)} airports, {len(snow)} snow stations, "
          f"and {len(qcew['wages'])} county wage records to {dest.name}.")


if __name__ == "__main__":
    main()
