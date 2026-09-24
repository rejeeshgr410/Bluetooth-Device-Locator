export const STALE_AFTER_MS = 6000;
export const LOST_AFTER_MS = 25000;

/** Typical RSSI at 1 m for a phone / earbud / tag when nothing better is known. */
export const DEFAULT_REF_POWER = -59;

export type Proximity = 'VERY CLOSE' | 'NEARBY' | 'MID RANGE' | 'FAR' | 'UNKNOWN';
export type Trend = 'GETTING WARMER' | 'GETTING COLDER' | 'STABLE' | 'UNCERTAIN';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type SearchMode = 'QUICK_SEARCH' | 'ROOM_SWEEP' | 'FINAL_1_METER';
export type RefSource = 'calibrated' | 'advertised' | 'default';

export type SignalStats = {
  raw: number;
  filtered: number;
  velocity: number; // dBm per second, least-squares slope over the trend window
  delta: number; // dB gained (+) or lost (-) across the trend window
  percentage: number; // 0 to 100% closeness (RSSI normalised by the 1 m reference)
  approxDistance: string; // Human readable distance estimation
  distanceM: number;
  distanceLowM: number;
  distanceHighM: number;
  refPower: number; // expected RSSI at 1 m
  refSource: RefSource;
  variance: number; // noise variance of raw RSSI (dB²)
  packetsPerSec: number;
  trend: Trend;
  proximity: Proximity;
  confidence: Confidence;
  peakRssi: number;
  peakAt: number;
  lastSeen: number;
  isStale: boolean;
  history: (number | null)[];
};

type ModeTuning = {
  windowMs: number; // robust pre-filter window
  processNoise: number; // Kalman process noise, dB² per second
  trendMs: number; // regression window for warmer / colder
  minSlope: number; // dB/s below which the trend is called STABLE
  enterT: number; // t-statistic needed to call a new direction
};

const TUNING: Record<SearchMode, ModeTuning> = {
  QUICK_SEARCH: { windowMs: 700, processNoise: 30, trendMs: 2000, minSlope: 1.0, enterT: 1.8 },
  ROOM_SWEEP: { windowMs: 1200, processNoise: 10, trendMs: 3500, minSlope: 0.6, enterT: 2.0 },
  FINAL_1_METER: { windowMs: 500, processNoise: 45, trendMs: 1500, minSlope: 1.5, enterT: 1.8 },
};

// Indoor path-loss exponent range: ~2 in open line of sight, ~3 through furniture and bodies.
const PATH_LOSS_N_LOW = 2.0;
const PATH_LOSS_N_MID = 2.5;
const PATH_LOSS_N_HIGH = 3.0;

const TREND_HOLD_MS = 800;
const RAW_KEEP_MS = 12000;
const MAX_BORROW_MS = 4000;
const NOISE_WINDOW_MS = 3000;
const HISTORY_BINS = 60;
const HISTORY_SPAN_MS = 10000;

type Sample = { rssi: number; ts: number };

/**
 * Per-device RSSI pipeline.
 *
 * 1. Upper-quartile over a short time window. Multipath fading and the per-channel
 *    gain differences of BLE advertising (channels 37/38/39) only ever *subtract*
 *    power, so the top of the recent distribution tracks path loss far better than
 *    the mean or a 3-sample median.
 * 2. Time-based 1D Kalman filter (random walk). Process noise scales with elapsed
 *    time, not packet count, so smoothing feels the same at 2 or 20 packets/s.
 * 3. Warmer / colder from a least-squares slope over the raw samples in a window,
 *    gated on its t-statistic (with hysteresis) so noise alone rarely produces a
 *    direction. Raw samples, not the filtered series: fading makes them close to
 *    independent, which keeps the t-statistic honest.
 */
export class SignalEngine {
  private raw: Sample[] = [];
  private filtered: Sample[] = [];
  private mode: SearchMode;
  private x = 0; // Kalman estimate
  private p = 0; // Kalman variance
  private lastTs = 0;
  private initialized = false;
  private outlierRun = 0;
  private lastTrend: Trend = 'UNCERTAIN';
  private shownTrend: Trend = 'UNCERTAIN';
  private candidateSince = 0;
  private peakRssi = -127;
  private peakAt = 0;
  private refPower = DEFAULT_REF_POWER;
  private refSource: RefSource = 'default';
  private last: SignalStats | null = null;

  constructor(mode: SearchMode = 'ROOM_SWEEP') {
    this.mode = mode;
  }

  public setMode(mode: SearchMode) {
    this.mode = mode;
  }

  /** Advertised power never overrides a user calibration. */
  public setReferencePower(dbm: number, source: Exclude<RefSource, 'default'>) {
    if (!Number.isFinite(dbm) || dbm > -20 || dbm < -110) return;
    if (source === 'advertised' && this.refSource === 'calibrated') return;
    this.refPower = dbm;
    this.refSource = source;
  }

  /** Treat the current estimate as "1 metre away". Returns the stored reference. */
  public calibrateAtOneMetre(): number | null {
    if (!this.initialized) return null;
    this.setReferencePower(Math.round(this.x), 'calibrated');
    return this.refPower;
  }

  public getStats(): SignalStats | null {
    return this.last;
  }

  public ingest(rawRssi: number, now: number = Date.now()): SignalStats {
    // Android reports 127 / 0 for "unknown"; never feed those into the filter.
    if (rawRssi >= 0 || rawRssi < -127) {
      return this.last ?? this.buildStats(now, rawRssi);
    }

    const tune = TUNING[this.mode];
    this.raw.push({ rssi: rawRssi, ts: now });
    const keepFrom = now - RAW_KEEP_MS;
    while (this.raw.length && this.raw[0].ts < keepFrom) this.raw.shift();
    while (this.filtered.length && this.filtered[0].ts < keepFrom) this.filtered.shift();

    // 1. Robust pre-filter
    const windowVals = this.valuesSince(now - tune.windowMs, 3);
    const z = percentile(windowVals, 0.75);

    // Measurement noise from the median absolute deviation of recent raw readings
    const sigma = this.noiseSigma(now);
    const r = clamp(sigma * sigma, 4, 64);

    // 2. Kalman update
    if (!this.initialized) {
      this.x = z;
      this.p = r;
      this.initialized = true;
    } else {
      const dt = clamp((now - this.lastTs) / 1000, 0, 5);
      this.p += tune.processNoise * dt;

      // Soft outlier gate: a lone wild reading gets 10x the noise, but a
      // persistent change (3+ in a row) is accepted as real movement.
      const innovation = z - this.x;
      const gate = 4 * Math.sqrt(this.p + r);
      let rEff = r;
      if (Math.abs(innovation) > gate && this.outlierRun < 3) {
        this.outlierRun++;
        rEff = r * 10;
      } else {
        this.outlierRun = 0;
      }

      const k = this.p / (this.p + rEff);
      this.x += k * innovation;
      this.p *= 1 - k;
    }
    this.lastTs = now;
    this.filtered.push({ rssi: this.x, ts: now });

    if (this.x > this.peakRssi) {
      this.peakRssi = this.x;
      this.peakAt = now;
    }

    this.last = this.buildStats(now, rawRssi, sigma);
    return this.last;
  }

  /**
   * Readings since `from`. For slow advertisers the window may hold fewer than
   * `minCount`, so it borrows older readings, but never from more than MAX_BORROW_MS
   * before the window, so a device returning after a quiet spell isn't blended with
   * where it was before.
   */
  private valuesSince(from: number, minCount: number): number[] {
    const out: number[] = [];
    for (let i = this.raw.length - 1; i >= 0; i--) {
      const s = this.raw[i];
      if (s.ts < from && (out.length >= minCount || s.ts < from - MAX_BORROW_MS)) break;
      out.push(s.rssi);
    }
    return out;
  }

  private noiseSigma(now: number): number {
    const vals = this.valuesSince(now - NOISE_WINDOW_MS, 5);
    if (vals.length < 3) return 6;
    const med = percentile(vals, 0.5);
    const mad = percentile(vals.map((v) => Math.abs(v - med)), 0.5);
    return Math.max(1, 1.4826 * mad);
  }

  private trend(now: number, tune: ModeTuning): { trend: Trend; slope: number; delta: number } {
    const from = now - tune.trendMs;
    const pts = this.raw.filter((s) => s.ts >= from);
    if (pts.length < 6) return { trend: 'UNCERTAIN', slope: 0, delta: 0 };

    const span = pts[pts.length - 1].ts - pts[0].ts;
    if (span < tune.trendMs * 0.5) return { trend: 'UNCERTAIN', slope: 0, delta: 0 };

    // Least squares y = a + b t, with t in seconds
    const t0 = pts[0].ts;
    let st = 0;
    let sy = 0;
    for (const p of pts) {
      st += (p.ts - t0) / 1000;
      sy += p.rssi;
    }
    const n = pts.length;
    const mt = st / n;
    const my = sy / n;
    let sxx = 0;
    let sxy = 0;
    for (const p of pts) {
      const dt = (p.ts - t0) / 1000 - mt;
      sxx += dt * dt;
      sxy += dt * (p.rssi - my);
    }
    if (sxx <= 0) return { trend: 'UNCERTAIN', slope: 0, delta: 0 };
    const slope = sxy / sxx;

    let sse = 0;
    for (const p of pts) {
      const fit = my + slope * ((p.ts - t0) / 1000 - mt);
      sse += (p.rssi - fit) ** 2;
    }
    const se = Math.sqrt(sse / Math.max(1, n - 2) / sxx);
    const tStat = se > 0 ? Math.abs(slope) / se : Infinity;
    const delta = slope * (tune.trendMs / 1000);

    const direction: Trend = slope > 0 ? 'GETTING WARMER' : 'GETTING COLDER';
    // Hysteresis: a direction needs strong evidence to start and half as much to hold,
    // so the banner doesn't flicker between WARMER and STEADY mid-walk.
    const holding = direction === this.lastTrend;
    const needT = holding ? tune.enterT / 2 : tune.enterT;
    const needSlope = holding ? tune.minSlope / 2 : tune.minSlope;
    const needDelta = holding ? 1 : 2;
    const trend: Trend =
      Math.abs(slope) >= needSlope && Math.abs(delta) >= needDelta && tStat >= needT ? direction : 'STABLE';
    this.lastTrend = trend;
    return { trend: this.debounce(trend, now), slope, delta };
  }

  /**
   * A new direction must hold for TREND_HOLD_MS before it is shown. On a real phone a
   * stationary target still produced 1-2 s false WARMER/COLDER blips (its RSSI alternates
   * ~4 dB between advertising channels); this hides them. Falling back to STEADY is
   * immediate, so a real change is never held on screen longer than it lasts.
   */
  private debounce(trend: Trend, now: number): Trend {
    if (trend === this.shownTrend || trend === 'STABLE' || trend === 'UNCERTAIN') {
      this.shownTrend = trend;
      this.candidateSince = 0;
      return trend;
    }
    if (this.candidateSince === 0) this.candidateSince = now;
    if (now - this.candidateSince >= TREND_HOLD_MS) {
      this.shownTrend = trend;
      this.candidateSince = 0;
      return trend;
    }
    return this.shownTrend === 'GETTING WARMER' || this.shownTrend === 'GETTING COLDER' ? 'STABLE' : this.shownTrend;
  }

  private buildStats(now: number, raw: number, sigma = 6): SignalStats {
    const tune = TUNING[this.mode];
    const filtered = this.initialized ? this.x : raw;

    // Distance: log-distance path loss, bracketed by exponent range and filter uncertainty
    const refUnc = this.refSource === 'calibrated' ? 1.5 : this.refSource === 'advertised' ? 3 : 5;
    const err = Math.sqrt(4 * Math.max(this.p, 0.5) + refUnc * refUnc);
    const dist = (rssi: number, n: number) => Math.pow(10, (this.refPower - rssi) / (10 * n));
    const distanceM = dist(filtered, PATH_LOSS_N_MID);
    const corners = [
      dist(filtered + err, PATH_LOSS_N_LOW),
      dist(filtered + err, PATH_LOSS_N_HIGH),
      dist(filtered - err, PATH_LOSS_N_LOW),
      dist(filtered - err, PATH_LOSS_N_HIGH),
    ];
    const distanceLowM = Math.min(...corners);
    const distanceHighM = Math.max(...corners);

    let proximity: Proximity = 'UNKNOWN';
    if (this.initialized) {
      if (distanceM < 0.6) proximity = 'VERY CLOSE';
      else if (distanceM < 2) proximity = 'NEARBY';
      else if (distanceM < 6) proximity = 'MID RANGE';
      else proximity = 'FAR';
    }

    // Closeness, not raw dBm: shift by this device's 1 m reference so a quiet tag at
    // arm's length fills the meter like a loud phone at arm's length would.
    const normalized = filtered - (this.refPower - DEFAULT_REF_POWER);
    const percentage = Math.max(0, Math.min(100, Math.round(((normalized + 95) / 60) * 100)));

    const { trend, slope, delta } = this.trend(now, tune);

    // Packet rate over the last 3 s
    const recent = this.raw.filter((s) => s.ts >= now - 3000);
    const rateSpan = recent.length > 1 ? Math.max(1, (now - recent[0].ts) / 1000) : 1;
    const packetsPerSec = recent.length > 1 ? recent.length / Math.max(rateSpan, 1) : recent.length;

    let confidence: Confidence = 'MEDIUM';
    if (this.raw.length < 5 || packetsPerSec < 1 || sigma > 8) confidence = 'LOW';
    else if (packetsPerSec >= 4 && sigma <= 4) confidence = 'HIGH';

    return {
      raw,
      filtered,
      velocity: slope,
      delta,
      percentage,
      approxDistance: formatDistance(distanceM, distanceLowM, distanceHighM),
      distanceM,
      distanceLowM,
      distanceHighM,
      refPower: this.refPower,
      refSource: this.refSource,
      variance: sigma * sigma,
      packetsPerSec,
      trend,
      proximity,
      confidence,
      peakRssi: this.peakRssi,
      peakAt: this.peakAt,
      lastSeen: now,
      isStale: false,
      history: this.history(now),
    };
  }

  /** 60 slots across the last 10 s; each takes the nearest filtered sample within 1.5 s. */
  private history(now: number): (number | null)[] {
    const out: (number | null)[] = new Array(HISTORY_BINS).fill(null);
    const step = HISTORY_SPAN_MS / HISTORY_BINS;
    const samples = this.filtered;
    let j = 0;
    for (let i = 0; i < HISTORY_BINS; i++) {
      const target = now - (HISTORY_BINS - 1 - i) * step;
      while (j + 1 < samples.length && Math.abs(samples[j + 1].ts - target) <= Math.abs(samples[j].ts - target)) j++;
      const s = samples[j];
      if (s && Math.abs(s.ts - target) < 1500) out[i] = s.rssi;
    }
    return out;
  }
}

export function formatDistance(d: number, lo: number, hi: number): string {
  const fmt = (m: number) => (m < 10 ? m.toFixed(1) : Math.round(m).toString());
  if (hi < 0.5) return '< 0.5 m';
  if (d > 25) return '> 25 m';
  return `≈ ${fmt(d)} m (${fmt(Math.max(0.1, lo))}–${fmt(Math.min(hi, 50))} m)`;
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return -100;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
