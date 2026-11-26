"""Population-weight the published SatPM V6.GL.03 annual PM2.5 grids."""

from collections import Counter, defaultdict
import csv
import io
from zipfile import ZipFile

import numpy as np


YEARS = (2022, 2023, 2024)


def sample_grid(path, latitude, longitude):
    import h5py

    with h5py.File(path, "r") as dataset:
        lat, lon = dataset["lat"][:], dataset["lon"][:]
        grid = dataset["PM25"]
        if (grid.shape != (len(lat), len(lon)) or grid.attrs["units"] != b"ug/m3"
                or not np.allclose(np.diff(lat), .01, atol=.00002) or not np.allclose(np.diff(lon), .01, atol=.00002)):
            raise ValueError(f"Unexpected SatPM coordinates or units in {path.name}")
        y = np.rint((latitude - float(lat[0])) * 100).astype(int)
        x = np.rint((longitude - float(lon[0])) * 100).astype(int)
        values = np.full(len(y), np.nan)
        present = np.flatnonzero((y >= 0) & (y < len(lat)) & (x >= 0) & (x < len(lon)))
        # Read row bands rather than materializing the full continental raster in memory.
        band_size = grid.chunks[0] if grid.chunks else 64
        groups = y[present] // band_size
        for group in np.unique(groups):
            select = present[groups == group]
            y0, y1 = group * band_size, min((group + 1) * band_size, len(lat))
            x0, x1 = x[select].min(), x[select].max() + 1
            values[select] = grid[y0:y1, x0:x1][y[select] - y0, x[select] - x0]
    values[(values < 0) | (values > 200)] = np.nan
    return values


def three_year_pm25(source, latitude, longitude):
    years = [sample_grid(source / f"V6GL03.CNNPM25.NA.{year}01-{year}12.nc", latitude, longitude)
             for year in YEARS]
    return np.mean(years, axis=0)  # Require a valid value in all three years.


def county_pm25(source, centers, members):
    counties, population, lat, lon = zip(*centers)
    values = three_year_pm25(source, np.asarray(lat), np.asarray(lon))
    total, included, weighted = Counter(), Counter(), Counter()
    for county, residents, sample in zip(counties, population, values, strict=True):
        total[county] += residents
        if np.isfinite(sample):
            included[county] += residents
            weighted[county] += residents * float(sample)

    def summarize(codes):
        residents = sum(total[code] for code in codes)
        covered = sum(included[code] for code in codes)
        if residents and covered >= .9 * residents:
            return [round(sum(weighted[code] for code in codes) / covered, 2), round(covered / residents, 4)]
        return None

    county = {code: row for code in sorted(total) if (row := summarize([code]))}
    metro = {code: row for code, areas in members.items() if (row := summarize(areas))}
    if len(county) < 3000 or len(metro) < 370:
        raise ValueError(f"Unexpected PM2.5 coverage: {len(county)} counties and {len(metro)} metros")
    return {"county": county, "metro": metro}


def monitored_air_days(source, county_codes):
    annual = defaultdict(list)
    for year in YEARS:
        daily = defaultdict(dict)
        with ZipFile(source / f"epa-air-days-{year}.zip") as archive, archive.open(archive.namelist()[0]) as raw:
            for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig")):
                code = row["State Code"].zfill(2) + row["County Code"].zfill(3)
                if code in county_codes and row["AQI"].isdigit() and row["Date"].startswith(str(year)):
                    observations = daily[code]
                    date = row["Date"]
                    observations[date] = max(int(row["AQI"]), observations.get(date, 0))
        for code, days in daily.items():
            if len(days) >= 300:
                annual[code].append((sum(value > 100 for value in days.values()), len(days)))
    return {code: [round(sum(row[0] for row in years) / 3, 1), round(sum(row[1] for row in years) / 3)]
            for code, years in sorted(annual.items()) if len(years) == len(YEARS)}


def air_quality(source, cities, city_ids, indexes, memberships, latitude, longitude, population, reference_pop):
    centers = [(city[0], city[11]) for city in cities if city[11] is not None and 0 < (city[4] or 0) < 50000]
    city_lat, city_lon = np.asarray([point for _, point in centers]).T
    lat = np.concatenate((latitude, city_lat))
    lon = np.concatenate((longitude, city_lon))
    samples = three_year_pm25(source, lat, lon)
    fallback = {identifier: [round(float(value), 2), 0] for (identifier, _), value in zip(centers, samples[len(latitude):], strict=True)
                if np.isfinite(value)}
    output = dict(fallback)
    size = len(city_ids)
    weights = population[indexes]
    totals = np.bincount(memberships, weights=weights, minlength=size)
    point_counts = np.bincount(memberships, minlength=size)
    values = samples[indexes]
    valid = np.isfinite(values)
    covered = np.bincount(memberships[valid], weights=weights[valid], minlength=size)
    weighted = np.bincount(memberships[valid], weights=weights[valid] * values[valid], minlength=size)
    for index, identifier in enumerate(city_ids):
        expected = reference_pop[identifier]
        if (point_counts[index] >= 3 and expected * .65 <= totals[index] <= expected * 1.35
                and covered[index] >= .65 * totals[index]):
            output[identifier] = [round(float(weighted[index] / covered[index]), 2), 1]
    if len(output) < 45000 or sum(row[1] for row in output.values()) < 10000:
        raise ValueError(f"Unexpected city air quality coverage: {len(output):,}")
    print(f"Air quality: {len(output):,} cities, {sum(row[1] for row in output.values()):,} population-weighted", flush=True)
    return output
