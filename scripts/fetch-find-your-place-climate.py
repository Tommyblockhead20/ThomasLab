"""Export NASA POWER climatology grids for the Find Your Place data builder.

Requires numpy and numcodecs. Write the output to nasa-climate.json in the
source directory used by build-find-your-place-metrics.py.
"""

import argparse
import json
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from numcodecs import get_codec


ARCHIVE = 'https://nasa-power.s3.us-west-2.amazonaws.com/'


def fetch(url):
    with urlopen(url, timeout=35) as response:
        return response.read()


def grid(dataset, variable, periods):
    url = f'{ARCHIVE}{dataset}/spatial/power_{dataset}_climatology_spatial_lst.zarr/'
    metadata = json.loads(fetch(url + '.zmetadata'))['metadata']

    def read_chunk(name, chunk):
        spec = metadata[f'{name}/.zarray']
        contents = fetch(f'{url}{name}/{chunk}')
        decoded = get_codec(spec['compressor']).decode(contents)
        for spec_filter in reversed(spec.get('filters') or []):
            decoded = get_codec(spec_filter).decode(decoded)
        return np.frombuffer(decoded, dtype=spec['dtype']).reshape(spec['chunks'])

    times = read_chunk('time', '0').tolist()
    print(dataset, variable, 'time labels:', times)
    indices = [times.index(period) for period in periods]
    values = np.mean([read_chunk(variable, f'{i}.0.0')[0] for i in indices], axis=0)
    return {
        'latitude': read_chunk('lat', '0').tolist(),
        'longitude': read_chunk('lon', '0').tolist(),
        'values': np.where(np.isfinite(values), np.round(values, 3), None).tolist(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    all_sky = grid('syn1deg', 'ALLSKY_SFC_SW_DWN', [13])
    clear_sky = grid('syn1deg', 'CLRSKY_SFC_SW_DWN', [13])
    observed = np.array(all_sky['values'], dtype=float)
    possible = np.array(clear_sky['values'], dtype=float)
    ratio = np.full_like(observed, np.nan)
    np.divide(observed, possible, out=ratio, where=(observed >= 0) & (possible > 0))
    ratio = np.minimum(ratio, 1)
    snapshot = {
        'humidity': grid('merra2', 'T2MDEW', [6, 7, 8]),
        'sunshine': {
            **all_sky,
            'values': np.where(np.isfinite(ratio), np.round(ratio, 5), None).tolist(),
        },
    }
    args.destination.write_text(json.dumps(snapshot, separators=(',', ':'), allow_nan=False), encoding='utf-8')


if __name__ == '__main__':
    main()
