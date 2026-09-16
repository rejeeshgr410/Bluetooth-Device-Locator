export const STALE_AFTER_MS = 6000;
export const LOST_AFTER_MS = 25000;

export type Proximity = 'VERY CLOSE' | 'NEARBY' | 'MID RANGE' | 'FAR' | 'UNKNOWN';
export type Trend = 'GETTING WARMER' | 'GETTING COLDER' | 'STABLE' | 'UNCERTAIN';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type SearchMode = 'QUICK_SEARCH' | 'ROOM_SWEEP' | 'FINAL_1_METER';

export type SignalStats = {
  raw: number;
  filtered: number;
  velocity: number; // dBm per second (rate of approach)
  percentage: number; // 0 to 100%
  approxDistance: string; // Human readable distance estimation
  variance: number;
  packetsPerSec: number;
  trend: Trend;
  proximity: Proximity;
  confidence: Confidence;
  peakRssi: number;
  lastSeen: number;
  isStale: boolean;
  history: (number | null)[];
};

/**
 * 1D Alpha-Beta tracking filter for high-accuracy RSSI smoothing and velocity estimation.
 * Solves the classical BLE multipath lag problem.
 */
class AlphaBetaFilter {
  private x = 0; // Estimated RSSI
  private v = 0; // Estimated velocity (dBm/s)
  private initialized = false;
  private lastTs = 0;

  constructor(
    private alpha = 0.45,
    private beta = 0.15
  ) {}

  public setTuning(alpha: number, beta: number) {
    this.alpha = alpha;
    this.beta = beta;
  }

  public update(measurement: number, ts: number): { x: number; v: number } {
    if (!this.initialized) {
      this.x = measurement;
      this.v = 0;
      this.lastTs = ts;
      this.initialized = true;
      return { x: this.x, v: this.v };
    }

    const dt = Math.max(0.05, Math.min(2.0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;

    // 1. Predict
    const xPred = this.x + this.v * dt;
    const vPred = this.v;

    // 2. Residual
    const residual = measurement - xPred;

    // 3. Update
    this.x = xPred + this.alpha * residual;
    this.v = vPred + (this.beta / dt) * residual;

    // Damp velocity to prevent runaway drift
    this.v *= 0.85;

    return { x: this.x, v: this.v };
  }

  public getEstimate() {
    return { x: this.x, v: this.v };
  }
}

export class SignalEngine {
  private rawSamples: { rssi: number; ts: number }[] = [];
  private filteredSamples: { rssi: number; ts: number }[] = [];
  private filter: AlphaBetaFilter;
  private peakRssi = -100;
  private packetsSinceLastUpdate = 0;
  private lastUpdateTs = 0;
  private mode: SearchMode = 'ROOM_SWEEP';

  constructor() {
    this.filter = new AlphaBetaFilter(0.4, 0.12);
  }

  public setMode(mode: SearchMode) {
    this.mode = mode;
    switch (mode) {
      case 'QUICK_SEARCH':
        this.filter.setTuning(0.65, 0.25); // Fast tracking
        break;
      case 'ROOM_SWEEP':
        this.filter.setTuning(0.38, 0.10); // High stability, low jitter
        break;
      case 'FINAL_1_METER':
        this.filter.setTuning(0.80, 0.35); // Ultra-responsive for close range
        break;
    }
  }

  public ingest(rawRssi: number): SignalStats {
    const now = Date.now();
    this.rawSamples.push({ rssi: rawRssi, ts: now });
    this.packetsSinceLastUpdate++;

    // Prune samples older than 12 seconds
    const cutoff = now - 12000;
    this.rawSamples = this.rawSamples.filter((s) => s.ts > cutoff);
    this.filteredSamples = this.filteredSamples.filter((s) => s.ts > cutoff);

    // Median filter over last 3 samples to reject isolated multipath reflection spikes
    const recentRaw = this.rawSamples.slice(-3);
    const medianRssi = this.calculateMedian(recentRaw.map((s) => s.rssi));

    // Blend: if single outlier differs by > 18 dBm from median, reject spike
    const measurement = Math.abs(rawRssi - medianRssi) > 18 ? medianRssi : rawRssi;

    // Apply tracking filter
    const { x: filteredRssi, v: velocity } = this.filter.update(measurement, now);
    this.filteredSamples.push({ rssi: filteredRssi, ts: now });

    // Track Peak
    if (filteredRssi > this.peakRssi) {
      this.peakRssi = filteredRssi;
    }

    // Packet rate calculation
    let pps = 1;
    if (now - this.lastUpdateTs >= 1000) {
      pps = this.packetsSinceLastUpdate / Math.max(1, (now - this.lastUpdateTs) / 1000);
      this.lastUpdateTs = now;
      this.packetsSinceLastUpdate = 0;
    }

    const variance = this.calculateVariance(this.rawSamples.slice(-8).map((s) => s.rssi));

    return this.calculateStats(now, rawRssi, filteredRssi, velocity, variance, pps);
  }

  private calculateStats(
    now: number,
    raw: number,
    filtered: number,
    velocity: number,
    variance: number,
    pps: number
  ): SignalStats {
    // Proximity Category & Realistic Distance Range
    let proximity: Proximity = 'UNKNOWN';
    let approxDistance = 'Calculating...';

    if (filtered >= -52) {
      proximity = 'VERY CLOSE';
      approxDistance = '< 0.5 m (Arm\'s Reach)';
    } else if (filtered >= -67) {
      proximity = 'NEARBY';
      approxDistance = '0.5 – 2 m';
    } else if (filtered >= -80) {
      proximity = 'MID RANGE';
      approxDistance = '2 – 5 m';
    } else {
      proximity = 'FAR';
      approxDistance = '> 5 m';
    }

    // Calibrated percentage (0% at -95 dBm, 100% at -35 dBm)
    const percentage = Math.max(0, Math.min(100, Math.round(((filtered + 95) / 60) * 100)));

    // Accurate Velocity-based Trend
    let trend: Trend = 'UNCERTAIN';
    if (this.filteredSamples.length >= 3) {
      if (velocity >= 0.45) {
        trend = 'GETTING WARMER';
      } else if (velocity <= -0.45) {
        trend = 'GETTING COLDER';
      } else {
        trend = 'STABLE';
      }
    }

    // Confidence assessment
    let confidence: Confidence = 'MEDIUM';
    if (variance < 15 && this.filteredSamples.length >= 5) {
      confidence = 'HIGH';
    } else if (variance > 45 || this.filteredSamples.length < 3) {
      confidence = 'LOW';
    }

    // Generate 60 discrete slots of recent history for the Tape graph
    const history = Array.from({ length: 60 }).map((_, i) => {
      const targetTs = now - (60 - i) * 166; // 10s divided into 60 bins
      // Find nearest sample within 1.5s
      const nearest = this.filteredSamples.reduce(
        (prev, curr) => (Math.abs(curr.ts - targetTs) < Math.abs(prev.ts - targetTs) ? curr : prev),
        { rssi: -100, ts: 0 }
      );
      return Math.abs(nearest.ts - targetTs) < 1500 ? nearest.rssi : null;
    });

    return {
      raw,
      filtered,
      velocity,
      percentage,
      approxDistance,
      variance,
      packetsPerSec: pps,
      trend,
      proximity,
      confidence,
      peakRssi: this.peakRssi,
      lastSeen: now,
      isStale: false,
      history,
    };
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateVariance(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  }
}
