export const STALE_AFTER_MS = 5000;
export const LOST_AFTER_MS = 15000;

export type Proximity = 'VERY CLOSE' | 'NEARBY' | 'FAR' | 'VERY FAR' | 'UNKNOWN';
export type Trend = 'GETTING WARMER' | 'GETTING COLDER' | 'STABLE' | 'UNCERTAIN';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type SignalStats = {
  raw: number;
  filtered: number;
  median: number;
  variance: number;
  packetsPerSec: number;
  trend: Trend;
  proximity: Proximity;
  confidence: Confidence;
  peakRssi: number;
  lastSeen: number;
  isStale: boolean;
};

// Configurable windows (in milliseconds)
const SHORT_WINDOW_MS = 1000;
const MEDIUM_WINDOW_MS = 5000;

export class SignalEngine {
  private rawSamples: { rssi: number; ts: number }[] = [];
  private filteredSamples: { rssi: number; ts: number }[] = [];
  private currentEma: number | null = null;
  private peakRssi: number = -100;
  private packetsSinceLastUpdate = 0;
  private lastUpdateTs = 0;

  constructor(private outlierThreshold = 15) {}

  public ingest(rawRssi: number): SignalStats {
    const now = Date.now();
    this.rawSamples.push({ rssi: rawRssi, ts: now });
    this.packetsSinceLastUpdate++;

    // Prune old samples (> 10s)
    const cutoff = now - 10000;
    this.rawSamples = this.rawSamples.filter((s) => s.ts > cutoff);
    this.filteredSamples = this.filteredSamples.filter((s) => s.ts > cutoff);

    // 1. Outlier Rejection (Median Filter on short window)
    const recentSamples = this.rawSamples.slice(-5);
    const medianRssi = this.calculateMedian(recentSamples.map((s) => s.rssi));
    
    let acceptedRssi = rawRssi;
    if (this.currentEma !== null && Math.abs(rawRssi - this.currentEma) > this.outlierThreshold) {
      // Reject extreme jumps, use median instead
      acceptedRssi = medianRssi;
    }

    // 2. Adaptive Smoothing (EMA)
    let alpha = 0.3;
    const variance = this.calculateVariance(recentSamples.map(s => s.rssi));
    if (variance > 25) {
      alpha = 0.1; // Highly noisy, smooth aggressively
    } else if (variance < 5) {
      alpha = 0.5; // Stable, respond faster
    }

    if (this.currentEma === null) {
      this.currentEma = acceptedRssi;
    } else {
      this.currentEma = this.currentEma + alpha * (acceptedRssi - this.currentEma);
    }

    this.filteredSamples.push({ rssi: this.currentEma, ts: now });

    // Track Peaks
    if (this.currentEma > this.peakRssi && variance < 15) {
      this.peakRssi = this.currentEma;
    }

    // Rate calculation
    let pps = 0;
    if (now - this.lastUpdateTs >= 1000) {
      pps = this.packetsSinceLastUpdate / ((now - this.lastUpdateTs) / 1000);
      this.lastUpdateTs = now;
      this.packetsSinceLastUpdate = 0;
    }

    return this.calculateStats(now, rawRssi, medianRssi, variance, pps);
  }

  private calculateStats(now: number, raw: number, median: number, variance: number, pps: number): SignalStats {
    const shortWindow = this.filteredSamples.filter(s => s.ts >= now - SHORT_WINDOW_MS);
    const mediumWindow = this.filteredSamples.filter(s => s.ts >= now - MEDIUM_WINDOW_MS);

    // Proximity
    let proximity: Proximity = 'UNKNOWN';
    if (this.currentEma! >= -55) proximity = 'VERY CLOSE';
    else if (this.currentEma! >= -70) proximity = 'NEARBY';
    else if (this.currentEma! >= -85) proximity = 'FAR';
    else proximity = 'VERY FAR';

    // Trend
    let trend: Trend = 'UNCERTAIN';
    if (mediumWindow.length > 5) {
      const olderHalf = mediumWindow.slice(0, Math.floor(mediumWindow.length / 2));
      const recentHalf = mediumWindow.slice(Math.floor(mediumWindow.length / 2));
      
      const oldMean = olderHalf.reduce((acc, s) => acc + s.rssi, 0) / olderHalf.length;
      const recentMean = recentHalf.reduce((acc, s) => acc + s.rssi, 0) / recentHalf.length;
      
      const delta = recentMean - oldMean;
      
      if (delta > 1.5) trend = 'GETTING WARMER';
      else if (delta < -1.5) trend = 'GETTING COLDER';
      else if (Math.abs(delta) <= 1.5) trend = 'STABLE';
    }

    // Confidence
    let confidence: Confidence = 'MEDIUM';
    if (variance < 10 && mediumWindow.length > 10) confidence = 'HIGH';
    else if (variance > 40 || mediumWindow.length < 3) confidence = 'LOW';

    return {
      raw,
      filtered: this.currentEma!,
      median,
      variance,
      packetsPerSec: pps,
      trend,
      proximity,
      confidence,
      peakRssi: this.peakRssi,
      lastSeen: now,
      isStale: false,
    };
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  }
}

export function kindOf(name: string | null): string {
  const n = (name ?? '').toLowerCase();
  if (!n) return 'Unknown';
  if (/airpod|buds|headphone|wh-|wf-|beats/.test(n)) return 'Earbuds';
  if (/watch|band|fit|garmin/.test(n)) return 'Watch';
  if (/iphone|galaxy|pixel|redmi|oneplus|phone/.test(n)) return 'Phone';
  if (/ipad|tab\b/.test(n)) return 'Tablet';
  if (/macbook|laptop|thinkpad/.test(n)) return 'Laptop';
  if (/tile|airtag|tracker|smarttag/.test(n)) return 'Tracker';
  if (/tv|speaker|soundbar|jbl|bose/.test(n)) return 'Audio';
  return 'Device';
}
