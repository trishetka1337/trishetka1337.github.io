// Положение солнца и время восхода/захода.
// Стандартные астрономические формулы, без внешних запросов.

const rad = Math.PI / 180;
const dayMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // наклон эклиптики
const J0 = 0.0009;

const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
const toDays = (date) => toJulian(date) - J2000;

const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);

function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372; // перигелий Земли
  return M + C + P + Math.PI;
}

const declination = (l) => Math.asin(Math.sin(e) * Math.sin(l));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

const altitude = (H, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

/** Высота солнца над горизонтом в градусах. */
export function sunAltitude(date, lat, lon) {
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(date);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = siderealTime(d, lw) - ra;
  return altitude(H, phi, dec) / rad;
}

const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

function hourAngle(h, phi, d) {
  const x = (Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d));
  // Полярный день или полярная ночь: события нет.
  if (x > 1 || x < -1) return null;
  return Math.acos(x);
}

/**
 * Восход, заход и полдень для даты.
 * Возвращает { rise, set, noon } — Date или null для полярных широт.
 */
export function sunTimes(date, lat, lon) {
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);

  const h0 = -0.833 * rad; // край диска с учётом рефракции
  const w = hourAngle(h0, phi, dec);
  if (w === null) return { rise: null, set: null, noon: fromJulian(Jnoon) };

  const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
  const Jrise = Jnoon - (Jset - Jnoon);

  return { rise: fromJulian(Jrise), set: fromJulian(Jset), noon: fromJulian(Jnoon) };
}

/** Максимальная высота солнца за день, в градусах. */
export function noonAltitude(date, lat, lon) {
  const { noon } = sunTimes(date, lat, lon);
  return noon ? sunAltitude(noon, lat, lon) : 0;
}
