"""Build simplified Alaska, Hawaii and Puerto Rico outlines for the city map."""

import argparse
import json
from pathlib import Path

import shapefile
from shapely import box, make_valid, union_all
from shapely.geometry import shape


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from polygons(part)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("counties", type=Path, help="Census cartographic county boundary ZIP")
    args = parser.parse_args()
    states = {"02": [], "15": [], "72": []}
    with shapefile.Reader(str(args.counties)) as dataset:
        for feature in dataset.iterShapeRecords(fields=["STATEFP"]):
            state = feature.record["STATEFP"]
            if state in states:
                states[state].append(make_valid(shape(feature.shape.__geo_interface__)))
    result = {}
    for state, shapes in states.items():
        outline = union_all(shapes)
        if state == "15":
            outline = outline.intersection(box(-161, 18, -154, 23))
        outline = outline.simplify(.047 if state == "02" else .009, preserve_topology=True)
        result[state] = [[[round(lon, 3), round(lat, 3)] for lon, lat in ring.coords]
                         for polygon in polygons(outline) if polygon.area >= .0002
                         for ring in [polygon.exterior, *polygon.interiors]]
    target = Path(__file__).resolve().parents[1] / "FindYourPlace" / "city-map-insets.js"
    payload = json.dumps(result, separators=(",", ":"))
    target.write_text(f"// Simplified US Census cartographic boundaries.\nwindow.findYourPlaceCityInsets={payload};\n", encoding="utf-8")


if __name__ == "__main__":
    main()
