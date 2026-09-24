/**
 * Breadcrumbs: a marker dropped wherever the signal peaked locally, plus the
 * estimate you can build once you have three or four of them in different
 * places. One radio gives distance and no bearing — but a walked path turns
 * one radio into many vantage points, which is enough to point somewhere.
 */

export type Crumb = {
  id: number;
  x: number;
  y: number;
  rssi: number;
  /** Expected RSSI at 1 m for the hunted device when this mark dropped. */
  ref?: number;
  at: number;
  manual: boolean;
};

const PEAK_DROPOFF_DB = 4;   // how far below the peak before we call it a peak
const PEAK_MIN_MOVE_M = 0.6; // and how far you must have moved since

export type PeakState = { x: number; y: number; rssi: number } | null;

/**
 * Watches the smoothed reading. When it climbs and then falls back by a few
 * dB, the high point was a local maximum worth marking.
 */
export function detectPeak(
  candidate: PeakState,
  sample: { x: number; y: number; rssi: number },
): { candidate: PeakState; commit: { x: number; y: number; rssi: number } | null } {
  if (!candidate) return { candidate: sample, commit: null };

  if (sample.rssi >= candidate.rssi) {
    return { candidate: sample, commit: null };
  }

  const moved = Math.hypot(sample.x - candidate.x, sample.y - candidate.y);
  const fallen = candidate.rssi - sample.rssi;

  if (fallen >= PEAK_DROPOFF_DB && moved >= PEAK_MIN_MOVE_M) {
    return { candidate: sample, commit: candidate };
  }
  return { candidate, commit: null };
}

export type Estimate = {
  x: number;
  y: number;
  confidence: 'none' | 'low' | 'fair' | 'good';
  note: string;
  spread: number;
};

/**
 * Weighted centroid, weighted by amplitude ratio against the best crumb, so a
 * strong mark near the target outvotes several weak ones without erasing them.
 */
export function centroid(crumbs: Crumb[]): { x: number; y: number } {
  const best = Math.max(...crumbs.map((c) => c.rssi));
  let wx = 0;
  let wy = 0;
  let sum = 0;
  for (const c of crumbs) {
    const w = Math.pow(10, (c.rssi - best) / 20);
    wx += c.x * w;
    wy += c.y * w;
    sum += w;
  }
  return { x: wx / sum, y: wy / sum };
}

/**
 * Below this spread across their main line (m) the marks are effectively on one line,
 * where distance rings meet in two mirror-image places. Chosen with npm run sim:trail:
 * the lowest value that never did worse than the centroid in any scenario or seed.
 */
const MULTILATERATION_MIN_SPREAD_M = 0.2;

/** Where the target most likely is: multilateration when the marks' geometry allows it. */
export function locate(crumbs: Crumb[]): { x: number; y: number } {
  if (crumbs.length >= 3 && crossSpread(crumbs) >= MULTILATERATION_MIN_SPREAD_M) return multilaterate(crumbs);
  return centroid(crumbs);
}

export function estimate(crumbs: Crumb[]): Estimate {
  if (crumbs.length === 0) {
    return { x: 0, y: 0, spread: 0, confidence: 'none', note: 'Walk a loop. Marks drop on their own at every signal peak.' };
  }

  const { x, y } = locate(crumbs);

  const spread = Math.max(
    ...crumbs.map((a) => Math.max(...crumbs.map((b) => Math.hypot(a.x - b.x, a.y - b.y)))),
    0,
  );

  if (crumbs.length < 3) {
    return { x, y, spread, confidence: 'low', note: 'Two marks or fewer. Keep walking — three from different spots is the minimum.' };
  }
  if (spread < 3) {
    return { x, y, spread, confidence: 'low', note: 'All marks are close together. Cross the room and come back for a wider baseline.' };
  }
  if (crumbs.length < 5 || spread < 6) {
    return { x, y, spread, confidence: 'fair', note: 'Usable. Another pass at a different angle will tighten it.' };
  }
  return { x, y, spread, confidence: 'good', note: 'Good baseline. Head for the marker and switch back to the meter for the last few metres.' };
}

/** Bearing to a point, in degrees clockwise from the direction you are facing. */
export function relativeBearing(
  from: { x: number; y: number; heading: number },
  to: { x: number; y: number },
): number {
  const absolute = (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
  let rel = absolute - from.heading;
  while (rel > 180) rel -= 360;
  while (rel < -180) rel += 360;
  return rel;
}

export function distanceTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** Turn a relative bearing into a sentence. */
export function steer(rel: number, metres: number): string {
  if (metres < 1.5) return 'You are on it. Look around your feet.';
  const dir =
    Math.abs(rel) < 20
      ? 'straight ahead'
      : Math.abs(rel) > 160
        ? 'behind you'
        : rel > 0
          ? Math.abs(rel) > 110 ? 'hard right' : 'to your right'
          : Math.abs(rel) > 110 ? 'hard left' : 'to your left';
  return `${metres.toFixed(0)} m ${dir}`;
}

/**
 * Least-squares circle intersection: each mark implies a distance ring (log-distance
 * model, exponent 2.5), and the target is the point that best fits all rings. Weighted
 * by 1/d² because the distance error grows with distance. Gauss-Newton from the centroid.
 */
export function multilaterate(crumbs: Crumb[], n = 2.5): { x: number; y: number } {
  const start = centroid(crumbs);
  const rings = crumbs.map((c) => {
    const d = Math.min(15, Math.max(0.3, Math.pow(10, ((c.ref ?? -59) - c.rssi) / (10 * n))));
    return { x: c.x, y: c.y, d, w: 1 / (d * d) };
  });
  let x = start.x;
  let y = start.y;
  for (let iter = 0; iter < 40; iter++) {
    let a11 = 1e-3, a12 = 0, a22 = 1e-3, b1 = 0, b2 = 0;
    for (const r of rings) {
      const dx = x - r.x;
      const dy = y - r.y;
      const dist = Math.max(1e-6, Math.hypot(dx, dy));
      const res = dist - r.d;
      const jx = dx / dist;
      const jy = dy / dist;
      a11 += r.w * jx * jx;
      a12 += r.w * jx * jy;
      a22 += r.w * jy * jy;
      b1 += r.w * jx * res;
      b2 += r.w * jy * res;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-12) break;
    const sx = (a22 * b1 - a12 * b2) / det;
    const sy = (a11 * b2 - a12 * b1) / det;
    x -= sx;
    y -= sy;
    if (Math.hypot(sx, sy) < 1e-4) break;
  }
  return { x, y };
}

/**
 * How far the marks spread across their main line (m): the standard deviation along
 * the minor axis of their positions. Near 0 means they lie on one line, where distance
 * rings intersect in two mirror-image places and multilateration can pick the wrong one.
 */
export function crossSpread(crumbs: Crumb[]): number {
  if (crumbs.length < 2) return 0;
  const mx = crumbs.reduce((s, c) => s + c.x, 0) / crumbs.length;
  const my = crumbs.reduce((s, c) => s + c.y, 0) / crumbs.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const c of crumbs) {
    sxx += (c.x - mx) ** 2;
    syy += (c.y - my) ** 2;
    sxy += (c.x - mx) * (c.y - my);
  }
  sxx /= crumbs.length;
  syy /= crumbs.length;
  sxy /= crumbs.length;
  const minor = (sxx + syy) / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  return Math.sqrt(Math.max(0, minor));
}
