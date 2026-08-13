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
  at: number;
  manual: boolean;
};

const PEAK_DROPOFF_DB = 4;   // how far below the peak before we call it a peak
const PEAK_MIN_MOVE_M = 0.6; // and how far you must have moved since

type PeakState = { x: number; y: number; rssi: number } | null;

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
  /** How the point was found. Centroid can never leave the walked path. */
  method: 'centroid' | 'trilateration';
};

/*
 * Loops, not Math.max(...array). The spread form passes one argument per
 * element and blows the call stack on large inputs — measured as RangeError at
 * 200,000 marks. Marks are capped in the app, but a library function should not
 * depend on its caller remembering that.
 */
function maxOf(xs: number[]): number {
  let m = -Infinity;
  for (let i = 0; i < xs.length; i++) if (xs[i] > m) m = xs[i];
  return m;
}
function minOf(xs: number[]): number {
  let m = Infinity;
  for (let i = 0; i < xs.length; i++) if (xs[i] < m) m = xs[i];
  return m;
}

/**
 * Extent of the marks along and across their own principal axis.
 *
 * `across` is what decides whether triangulating is even possible. Walk in a
 * straight line and every mark is collinear, which makes the problem genuinely
 * unsolvable: a target six metres to the left and six to the right fit the
 * measured distances identically, and the solver has no gradient at all
 * perpendicular to the line. Confirmed by simulation — a straight path leaves
 * the answer pinned on the line no matter how good the readings are.
 */
export function axisSpread(crumbs: Crumb[]): { along: number; across: number } {
  const n = crumbs.length;
  if (n === 0) return { along: 0, across: 0 };
  const mx = crumbs.reduce((s, c) => s + c.x, 0) / n;
  const my = crumbs.reduce((s, c) => s + c.y, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const c of crumbs) {
    const dx = c.x - mx;
    const dy = c.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);

  let aMin = Infinity;
  let aMax = -Infinity;
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of crumbs) {
    const dx = c.x - mx;
    const dy = c.y - my;
    const a = dx * ux + dy * uy;
    const p = -dx * uy + dy * ux;
    aMin = Math.min(aMin, a);
    aMax = Math.max(aMax, a);
    pMin = Math.min(pMin, p);
    pMax = Math.max(pMax, p);
  }
  return { along: aMax - aMin, across: pMax - pMin };
}

/** Log-distance path loss, the same model the meter's rough range uses. */
function metresFrom(rssi: number, txPower = -59, n = 2.4): number {
  return Math.pow(10, (txPower - rssi) / (10 * n));
}

/**
 * Least-squares trilateration by damped Gauss-Newton.
 *
 * The centroid this replaces is a weighted average of places you stood, so it
 * is trapped inside the convex hull of your own path — for a device in a room
 * you never entered it would confidently point at the doorway you walked past.
 * Solving for the point whose distances best match the measured ones can put
 * the answer outside the path, which is the entire purpose of triangulating.
 *
 * Returns null when it fails to converge or lands somewhere absurd; the caller
 * falls back to the centroid rather than showing a wild number.
 */
export function trilaterate(
  crumbs: Crumb[],
  seed: { x: number; y: number },
): { x: number; y: number } | null {
  if (crumbs.length < 3) return null;

  let px = seed.x;
  let py = seed.y;
  const lambda = 0.35; // damping: RSSI distances are noisy, so step cautiously

  for (let iter = 0; iter < 60; iter++) {
    let a = 0;
    let b = 0;
    let d = 0;
    let g1 = 0;
    let g2 = 0;

    for (const cr of crumbs) {
      const dx = px - cr.x;
      const dy = py - cr.y;
      const r = Math.hypot(dx, dy) || 1e-6;
      const j1 = dx / r;
      const j2 = dy / r;
      const residual = r - metresFrom(cr.rssi);
      a += j1 * j1;
      b += j1 * j2;
      d += j2 * j2;
      g1 += j1 * residual;
      g2 += j2 * residual;
    }

    a += lambda;
    d += lambda;
    const det = a * d - b * b;
    if (!isFinite(det) || Math.abs(det) < 1e-9) return null;

    const stepX = -(d * g1 - b * g2) / det;
    const stepY = -(a * g2 - b * g1) / det;
    if (!isFinite(stepX) || !isFinite(stepY)) return null;

    px += stepX;
    py += stepY;

    if (Math.hypot(stepX, stepY) < 0.01) break;
  }

  if (!isFinite(px) || !isFinite(py)) return null;
  // Anything this far from every mark is the solver diverging, not a finding.
  const nearest = minOf(crumbs.map((cr) => Math.hypot(px - cr.x, py - cr.y)));
  if (nearest > 60) return null;

  return { x: px, y: py };
}

/**
 * Weighted centroid, weighted by amplitude ratio against the best crumb, so a
 * strong mark near the target outvotes several weak ones without erasing them.
 * Spread of the marks is what decides whether the answer means anything: four
 * crumbs in one corner tell you nothing you did not already know.
 */
export function estimate(crumbs: Crumb[]): Estimate {
  if (crumbs.length === 0) {
    return {
      x: 0,
      y: 0,
      spread: 0,
      confidence: 'none',
      method: 'centroid',
      note: 'Walk a loop. Marks drop on their own at every signal peak.',
    };
  }

  const best = maxOf(crumbs.map((c) => c.rssi));
  let wx = 0;
  let wy = 0;
  let sum = 0;
  for (const c of crumbs) {
    const w = Math.pow(10, (c.rssi - best) / 20);
    wx += c.x * w;
    wy += c.y * w;
    sum += w;
  }
  const cx = wx / sum;
  const cy = wy / sum;

  // Seed the solver from the centroid; it is a poor answer but a good guess.
  const axes = axisSpread(crumbs);
  const solved = trilaterate(crumbs, { x: cx, y: cy });
  const x = solved?.x ?? cx;
  const y = solved?.y ?? cy;
  const method: Estimate['method'] = solved ? 'trilateration' : 'centroid';

  /*
   * Extent of the cloud, O(n), from the principal axes we already have.
   *
   * This replaced an all-pairs maximum that was O(n^2) AND used spread
   * arguments on Math.max. Measured: 20,000 marks took 16 seconds — a frozen
   * UI — and 200,000 threw RangeError: Maximum call stack size exceeded. The
   * marks are capped now too, but the quadratic scan had to go regardless.
   */
  const spread = Math.hypot(axes.along, axes.across);

  if (crumbs.length < 3) {
    return {
      x, y, spread, method,
      confidence: 'low',
      note: 'Two marks or fewer — not enough to triangulate. Three from different spots is the minimum.',
    };
  }
  if (spread < 3) {
    return {
      x, y, spread, method,
      confidence: 'low',
      note: 'All marks are close together, so the circles barely cross. Walk further before trusting this.',
    };
  }
  // Collinear marks make the answer mirror-ambiguous about the line you
  // walked. The maths cannot pick a side, so neither should the wording.
  if (axes.across < 1.5) {
    return {
      x, y, spread, method,
      confidence: 'low',
      note: 'You walked a straight line, so the marks cannot tell which side of it the device is on. Turn a corner and drop a few more.',
    };
  }
  if (crumbs.length < 5 || spread < 6) {
    return {
      x, y, spread, method,
      confidence: 'fair',
      note:
        method === 'trilateration'
          ? 'Triangulated from where the distances agree. Another pass at a different angle will tighten it.'
          : 'Usable. Another pass at a different angle will tighten it.',
    };
  }
  return {
    x, y, spread, method,
    confidence: 'good',
    note:
      method === 'trilateration'
        ? 'Good baseline, triangulated. Head for the marker, then switch to the meter for the last few metres.'
        : 'Good baseline. Head for the marker and switch back to the meter for the last few metres.',
  };
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

/** Turn a relative bearing into a sentence, because reading degrees while walking is work. */
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
