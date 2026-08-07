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
export function estimate(crumbs: Crumb[]): Estimate {
  if (crumbs.length === 0) {
    return { x: 0, y: 0, spread: 0, confidence: 'none', note: 'Walk a loop. Marks drop on their own at every signal peak.' };
  }

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
  const x = wx / sum;
  const y = wy / sum;

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
