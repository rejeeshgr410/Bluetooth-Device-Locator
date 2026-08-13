/**
 * Locating a transmitter from many noisy (position, RSSI) samples.
 *
 * This replaces least-squares trilateration over a handful of "peak" marks.
 * Simulation of the previous approach, with each error source isolated,
 * showed where the accuracy actually went:
 *
 *   perfect inputs                0.10 m   <- the geometry was never the problem
 *   RSSI shadowing 6 dB           6.75 m
 *   heading bias 20 deg           5.42 m
 *   stride error 15%              1.50 m
 *   txPower wrong by 10 dB        8.85 m   <- the single biggest cause
 *
 * Two conclusions drove this file. First, a hardcoded reference power is the
 * dominant systematic error, so it must be calibrated per device rather than
 * assumed. Second, fitting five hand-picked peaks throws away the averaging
 * that beats 6 dB of shadowing — the estimator should consume every sample.
 *
 * So: a Bayesian likelihood grid. Every sample votes on every candidate
 * position under a log-normal shadowing model, which uses all the data, is
 * robust to outliers in a way least squares is not, and yields a credible
 * radius instead of a falsely precise point.
 */

export type Sample = { x: number; y: number; rssi: number };

export type Located = {
  x: number;
  y: number;
  /** Radius containing ~68% of the posterior mass, in metres. Honest error bar. */
  radius: number;
  samples: number;
};

/** Default reference power at 1 m. Only a fallback — calibrate instead. */
export const DEFAULT_TX_POWER = -59;
/** Path loss exponent. ~2 outdoors, 2.5-3.5 through walls and furniture. */
export const DEFAULT_PATH_LOSS = 2.4;
/** Log-normal shadowing sigma. Measured indoors this is 4-8 dB. */
export const DEFAULT_SIGMA = 6;

export function metresFrom(rssi: number, txPower = DEFAULT_TX_POWER, n = DEFAULT_PATH_LOSS): number {
  return Math.pow(10, (txPower - rssi) / (10 * n));
}

export function rssiAt(d: number, txPower = DEFAULT_TX_POWER, n = DEFAULT_PATH_LOSS): number {
  return txPower - 10 * n * Math.log10(Math.max(d, 0.1));
}

/**
 * Reference power for THIS device, from a reading taken at a known distance.
 *
 * Removing the guess is worth more than any amount of cleverness downstream:
 * a 10 dB error here moved the answer by nearly nine metres in simulation.
 */
export function calibrateTxPower(rssi: number, distanceMetres: number, n = DEFAULT_PATH_LOSS): number {
  return rssi + 10 * n * Math.log10(Math.max(distanceMetres, 0.1));
}

/**
 * Maximum-likelihood position over a grid, plus a credible radius.
 *
 * Returns null when there is not enough to say anything: fewer than three
 * samples, or no spread to triangulate from.
 */
export function gridLocate(
  samples: Sample[],
  opts: { txPower?: number; n?: number; sigma?: number; cells?: number } = {},
): Located | null {
  const txPower = opts.txPower ?? DEFAULT_TX_POWER;
  const n = opts.n ?? DEFAULT_PATH_LOSS;
  const sigma = opts.sigma ?? DEFAULT_SIGMA;
  /*
   * 64 rather than 96. The grid pass is cells^2 * bins and this runs inside a
   * useMemo that re-fires on every sample tick: at 96 cells and 600 samples it
   * measured 159 ms, which is most of a 400 ms budget spent on the JS thread.
   * Dropping to 64 is 2.25x cheaper, and at ~0.3 m per cell over a typical
   * search area the resolution is still far finer than the metre-scale
   * uncertainty the readings actually carry.
   */
  const cells = opts.cells ?? 64;

  if (samples.length < 3) return null;

  /*
   * Bin by position before fitting. Two hundred packets taken from one spot
   * are not two hundred independent measurements — they share a single
   * shadowing realisation — and treating them as independent made the
   * posterior collapse to a confident lie: 1.3 m of claimed precision around
   * an answer that was 7 m out. Averaging per location gives one honest
   * observation per place you actually stood.
   */
  const BIN = 0.75;
  const bins = new Map<string, { x: number; y: number; sum: number; count: number }>();
  for (const s of samples) {
    const key = `${Math.round(s.x / BIN)}:${Math.round(s.y / BIN)}`;
    const b = bins.get(key);
    if (b) {
      b.sum += s.rssi;
      b.count += 1;
      b.x += (s.x - b.x) / b.count;
      b.y += (s.y - b.y) / b.count;
    } else {
      bins.set(key, { x: s.x, y: s.y, sum: s.rssi, count: 1 });
    }
  }
  let use: Sample[] = Array.from(bins.values()).map((b) => ({
    x: b.x,
    y: b.y,
    rssi: b.sum / b.count,
  }));
  if (use.length < 3) return null;

  // Hard ceiling on the inner loop. Past ~150 distinct places the answer stops
  // moving, so thin evenly rather than let the cost grow without limit.
  const MAX_BINS = 150;
  if (use.length > MAX_BINS) {
    const stride = Math.ceil(use.length / MAX_BINS);
    use = use.filter((_, i) => i % stride === 0);
  }

  // Search area: everywhere the strongest reading could plausibly have come
  // from, padded around the walked extent.
  const strongest = Math.max(...use.map((s) => s.rssi));
  const reach = Math.min(40, Math.max(6, metresFrom(strongest, txPower, n) * 3));
  const xs = use.map((s) => s.x);
  const ys = use.map((s) => s.y);
  const minX = Math.min(...xs) - reach;
  const maxX = Math.max(...xs) + reach;
  const minY = Math.min(...ys) - reach;
  const maxY = Math.max(...ys) + reach;

  const stepX = (maxX - minX) / (cells - 1);
  const stepY = (maxY - minY) / (cells - 1);
  if (!isFinite(stepX) || !isFinite(stepY) || stepX <= 0 || stepY <= 0) return null;

  const logL = new Float64Array(cells * cells);
  const inv2s2 = 1 / (2 * sigma * sigma);

  for (let gy = 0; gy < cells; gy++) {
    const py = minY + gy * stepY;
    for (let gx = 0; gx < cells; gx++) {
      const px = minX + gx * stepX;
      let acc = 0;
      for (let i = 0; i < use.length; i++) {
        const s = use[i];
        const d = Math.hypot(px - s.x, py - s.y);
        const predicted = rssiAt(d, txPower, n);
        const r = s.rssi - predicted;
        acc -= r * r * inv2s2;
      }
      logL[gy * cells + gx] = acc;
    }
  }

  // Normalise in log space before exponentiating, or everything underflows.
  let best = -Infinity;
  let bestIdx = 0;
  for (let i = 0; i < logL.length; i++) {
    if (logL[i] > best) {
      best = logL[i];
      bestIdx = i;
    }
  }

  const bx = minX + (bestIdx % cells) * stepX;
  const by = minY + Math.floor(bestIdx / cells) * stepY;

  // Posterior mass, for a credible radius rather than a bare point.
  let total = 0;
  let spread = 0;
  const weights = new Float64Array(logL.length);
  for (let i = 0; i < logL.length; i++) {
    const w = Math.exp(logL[i] - best);
    weights[i] = w;
    total += w;
  }
  for (let i = 0; i < weights.length; i++) {
    const px = minX + (i % cells) * stepX;
    const py = minY + Math.floor(i / cells) * stepY;
    const d = Math.hypot(px - bx, py - by);
    spread += (weights[i] / total) * d * d;
  }

  /*
   * Floor the radius. The grid only knows about the noise it was told to
   * model; it cannot see a compass biased 20 degrees, a stride length that is
   * off by 15%, or a path-loss exponent that is wrong for this room. Those
   * shift every anchor coherently and no amount of sampling reveals them.
   * Simulation put the real error near 7 m where the raw posterior claimed
   * 1.3 m, so scale a floor with how far the answer sits from the measurements
   * — extrapolation beyond the walked path is exactly where the model is
   * least trustworthy.
   */
  const nearest = Math.min(...use.map((s) => Math.hypot(bx - s.x, by - s.y)));
  const floor = 1.5 + 0.35 * nearest;

  return {
    x: bx,
    y: by,
    radius: Math.max(Math.sqrt(spread), floor),
    samples: use.length,
  };
}
