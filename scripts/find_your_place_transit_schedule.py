"""Measure frequent GTFS boarding access for documented local operator pilots."""

import csv
import io
from collections import defaultdict
from zipfile import ZipFile

from find_your_place_spatial import NearbyPoints


SCHEDULE_DATES = (("20261202", "wednesday"), ("20261205", "saturday"))
FIRST_HOUR, LAST_HOUR = 10, 16
PILOTS = {
    "king-county": ("King County Metro", ("5363000", "5305210", "5357745", "5335940", "5357535")),
    "trimet": ("TriMet", ("4159000", "4131250", "4134100", "4105350")),
    "cta": ("CTA", ("1714000", "1724582", "1754885", "1714351")),
    "mbta": ("MBTA", ("2507000", "2511000", "2555745", "2562535")),
    "la-bus": ("LA Metro bus and rail", ("0644000", "0643000", "0656000", "0636546", "0670000", "0617568")),
    "twin-cities": ("Metro Transit regional feed", ("2743000", "2758000", "2706616", "2757220", "2754214", "2755852", "2707948")),
    "septa-bus": ("SEPTA bus, subway, trolley and regional rail",
                  ("4260000", "4213208", "4254656", "4286968", "4218152", "4204579000", "4209144976")),
}
EXTRA_FEEDS = {"la-bus": "la-rail", "septa-bus": "septa-rail"}


def city_geoid(code):
    return ("1600000US" if len(code) == 7 else "0600000US") + code


def gtfs_rows(archive, name):
    member = f"{name}.txt"
    if member in archive.namelist():
        with archive.open(member) as raw:
            yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))


def scheduled_services(archive):
    calendar = list(gtfs_rows(archive, "calendar"))
    extras = list(gtfs_rows(archive, "calendar_dates"))
    active = defaultdict(int)
    for index, (day, weekday) in enumerate(SCHEDULE_DATES):
        in_service = {row["service_id"] for row in calendar if row[weekday] == "1" and row["start_date"] <= day <= row["end_date"]}
        for row in extras:
            if row["date"] == day:
                if row["exception_type"] == "1":
                    in_service.add(row["service_id"])
                elif row["exception_type"] == "2":
                    in_service.discard(row["service_id"])
        if not in_service:
            raise ValueError(f"No scheduled service on {day} in {archive.filename}")
        for service in in_service:
            active[service] |= 1 << index
    return active


def seconds(value):
    if not value:
        return None
    hour, minutes, secs = map(int, value.split(":"))
    return 3600 * hour + 60 * minutes + secs


def template_starts(archive, templates):
    first = {}
    if templates:
        for row in gtfs_rows(archive, "stop_times"):
            trip = row["trip_id"]
            if trip in templates:
                time = seconds(row["departure_time"] or row["arrival_time"])
                if time is not None:
                    sequence = int(row["stop_sequence"])
                    if trip not in first or sequence < first[trip][0]:
                        first[trip] = (sequence, time)
    return {trip: row[1] for trip, row in first.items()}


def frequent_stops(path, minimum=250):
    hours = LAST_HOUR - FIRST_HOUR
    with ZipFile(path) as archive:
        active = scheduled_services(archive)
        trips = {row["trip_id"]: active[row["service_id"]] for row in gtfs_rows(archive, "trips") if active[row["service_id"]]}
        if not trips:
            raise ValueError(f"No qualifying trips in {path.name}")
        templates = defaultdict(list)
        for row in gtfs_rows(archive, "frequencies"):
            headway = int(row["headway_secs"])
            trip = row["trip_id"]
            if trip in trips and headway > 0:
                templates[trip].extend(range(seconds(row["start_time"]), seconds(row["end_time"]), headway))
        first = template_starts(archive, templates)
        stop_hours = {}
        for row in gtfs_rows(archive, "stop_times"):
            trip = row["trip_id"]
            days = trips.get(trip, 0)
            if not days or row.get("pickup_type", "") not in ("", "0"):
                continue
            departure = seconds(row["departure_time"] or row["arrival_time"])
            if departure is None:
                continue
            if trip in templates:
                if trip not in first:
                    continue
                offset = departure - first[trip]
                departures = (start + offset for start in templates[trip])
            else:
                departures = (departure,)
            stop = row["stop_id"]
            for time in departures:
                hour = time // 3600 - FIRST_HOUR
                if 0 <= hour < hours:
                    counts = stop_hours.get(stop)
                    if counts is None:
                        counts = stop_hours[stop] = [0] * (hours * len(SCHEDULE_DATES))
                    if days & 1:
                        counts[hour] += 1
                    if days & 2:
                        counts[hours + hour] += 1
        frequent = {stop for stop, counts in stop_hours.items() if min(counts) >= 2}
        coords = {(float(row["stop_lat"]), float(row["stop_lon"])) for row in gtfs_rows(archive, "stops")
                  if row["stop_id"] in frequent and row["stop_lat"] and row["stop_lon"]}
    if len(coords) < minimum:
        raise ValueError(f"Unexpectedly few frequent boarding locations in {path.name}: {len(coords)}")
    return coords


def frequency_for_cities(source, ids, memberships, latitude, longitude, population, represented):
    positions = {key: i for i, key in enumerate(ids)}
    point_lists = defaultdict(list)
    subjects = {positions[city_geoid(city)] for _, cities in PILOTS.values() for city in cities}
    for point, index in memberships:
        if index in subjects:
            point_lists[index].append(point)

    output = {}
    days = [f"{day[:4]}-{day[4:6]}-{day[6:]}" for day, _ in SCHEDULE_DATES]
    for slug, (agency, cities) in PILOTS.items():
        stops = frequent_stops(source / f"city-gtfs-{slug}.zip")
        if slug in EXTRA_FEEDS:
            stops.update(frequent_stops(source / f"city-gtfs-{EXTRA_FEEDS[slug]}.zip", minimum=5))
        lookup = NearbyPoints(((lat, lon, True) for lat, lon in stops), .5)
        for city in cities:
            identifier = city_geoid(city)
            index = positions[identifier]
            samples = point_lists[index]
            if not represented[index] or len(samples) < 3:
                continue
            total = sum(int(population[i]) for i in samples)
            reached = sum(int(population[i]) for i in samples if next(lookup.within(latitude[i], longitude[i]), None) is not None)
            output[identifier] = [agency, round(reached / total, 4), days]
        print(f"{agency}: {len(stops):,} qualifying stops", flush=True)
    if len(output) < 20:
        raise ValueError(f"Only {len(output)} cities received schedule estimates")
    return output
