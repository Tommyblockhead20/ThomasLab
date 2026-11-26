"""Read comparable Redfin sale-price estimates from non-overlapping quarters."""

from calendar import monthrange
import csv
import io
from pathlib import Path
from urllib.request import Request, urlopen


QUARTERS = ("2026-10-31", "2026-07-31", "2026-04-30", "2026-01-31")
MONTH_YEARS = [(2026, month) for month in range(10, 0, -1)] + [(2025, 12), (2025, 11)]
MONTHS = tuple(f"{year}-{month:02}-{monthrange(year, month)[1]}" for year, month in MONTH_YEARS)
FIELDS = ("PERIOD END", "REGION ID", "REGION NAME", "HOMES SOLD", "MEDIAN SALE PRICE PER SQ.FT. ($)")
REDFIN = "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/housing_market/monthly"


def fetch_sale_quarters(source: Path, geography: str) -> Path:
    path = source / f"redfin-home-quarters-{geography}.csv"
    if path.is_file():
        return path
    part = path.with_suffix(".part")
    frequency = "Rolling 3 Months" if geography == "cities" else "Monthly"
    periods = QUARTERS if geography == "cities" else MONTHS
    date_limit = periods[-1]
    request = Request(f"{REDFIN}/all_{geography}.csv", headers={"User-Agent": "Mozilla/5.0"})
    dates = set()
    with urlopen(request, timeout=50) as response, part.open("w", encoding="utf-8", newline="") as output:
        reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig", newline=""))
        writer = csv.DictWriter(output, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in reader:
            end = row["PERIOD END"]
            if end < date_limit:
                break
            if end in periods and row["FREQUENCY"] == frequency and row["IS SEASONALLY ADJUSTED"] == "false":
                writer.writerow(row)
                dates.add(end)
    if dates != set(periods):
        raise ValueError(f"Incomplete Redfin quarters for {geography}: {sorted(dates)}")
    part.replace(path)
    return path


def sale_estimate(rows, minimum, *, monthly=False):
    if len({row["REGION ID"] for row in rows}) != 1:
        return None
    periods, period_length = (MONTHS, 1) if monthly else (QUARTERS, 3)
    prices = {}
    seen = set()
    for row in rows:
        date = row["PERIOD END"]
        if date not in periods:
            continue
        if date in seen:
            return None
        seen.add(date)
        try:
            price = float(row["MEDIAN SALE PRICE PER SQ.FT. ($)"])
            sales = int(row["HOMES SOLD"])
        except (ValueError, TypeError):
            continue
        if sales >= 5 and 25 <= price <= 3000:
            prices[date] = (price, sales)
    for months in (3, 6, 12):
        length = months // period_length
        chosen = [prices[date] for date in periods[:length] if date in prices]
        count = sum(sales for _, sales in chosen)
        if (count >= minimum and len(chosen) >= (length + 1) // 2
                and any(date in prices for date in periods[:6 // period_length])):
            ppsf = sum(price * sales for price, sales in chosen) / count
            return [round(1800 * ppsf), round(ppsf, 1), count, months]
    return None
