export const METRES_PER_NM = 1852;
export const KNOT_IN_METRES_PER_SECOND = METRES_PER_NM / 3600;
export const nauticalMiles = (metres: number) => metres / METRES_PER_NM;
export const nm = (metres: number, places = 2) =>
  `${nauticalMiles(Math.abs(metres)).toFixed(places)} NM`;
// A fixed fictional departure datum near Titanic's route, shared by all charts.
const DATUM_LAT = 41.766667,
  DATUM_LON = -50.2;
export function chartCoordinates(west: number, north: number) {
  return {
    lat: DATUM_LAT + north / (METRES_PER_NM * 60),
    lon: DATUM_LON - west / (METRES_PER_NM * 60 * Math.cos((DATUM_LAT * Math.PI) / 180)),
  };
}
export function coordinate(value: number, latitude: boolean) {
  const a = Math.abs(value),
    deg = Math.floor(a),
    minutes = (a - deg) * 60;
  return `${deg}°${minutes.toFixed(1).padStart(4, '0')}′${latitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'}`;
}
export function chartPosition(west: number, north: number) {
  const p = chartCoordinates(west, north);
  return `${coordinate(p.lat, true)} ${coordinate(p.lon, false)}`;
}
