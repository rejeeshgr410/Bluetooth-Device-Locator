/**
 * Signal maths. This is the port of findphone's core idea:
 * one smoothed RSSI number, read as a trend rather than a distance.
 */

export const STALE_AFTER_MS = 5000;

/**
 * Classic Bluetooth inquiry is not a stream: it runs ~12-second bursts and
 * reports each device roughly once per burst. Judging it by the LE window
 * would mark every Classic device stale almost all of the time.
 */
export const CLASSIC_STALE_AFTER_MS = 26000;

export function staleWindow(classic: boolean): number {
  return classic ? CLASSIC_STALE_AFTER_MS : STALE_AFTER_MS;
}

/** Exponential moving average. Alpha is per-packet, not per-second. */
export function ema(previous: number | null, sample: number, alpha = 0.28): number {
  if (previous === null || Number.isNaN(previous)) return sample;
  return previous + alpha * (sample - previous);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type Band = {
  key: 'reach' | 'table' | 'room' | 'far' | 'veryFar';
  label: string;
  hint: string;
};

/** The dBm table from the original README. */
export function band(rssi: number): Band {
  if (rssi >= -45) return { key: 'reach', label: "ARM'S REACH", hint: 'Look down. Under, behind, inside something.' };
  if (rssi >= -60) return { key: 'table', label: 'SAME TABLE', hint: 'A few steps. Sweep the surfaces near you.' };
  if (rssi >= -72) return { key: 'room', label: 'SAME ROOM', hint: 'Walk the perimeter and watch the tape.' };
  if (rssi >= -85) return { key: 'far', label: 'FAR, OR BEHIND COVER', hint: 'Try the next room, or open the drawer.' };
  return { key: 'veryFar', label: 'VERY FAR, OR SHIELDED', hint: 'Metal and bodies eat signal. Keep moving.' };
}

/** 0..1 fill for the meter. -95 dBm floor, -40 dBm ceiling. */
export function fill(rssi: number): number {
  return clamp((rssi + 95) / 55, 0, 1);
}

/**
 * Parking-sensor cadence. About one click a second across a room,
 * tightening to a buzz near -50 dBm, exactly as the CLI describes.
 */
export function clickIntervalMs(rssi: number): number {
  const t = clamp((rssi + 90) / 40, 0, 1); // -90 -> 0, -50 -> 1
  return Math.round(1000 * Math.pow(70 / 1000, t)); // 1000ms -> 70ms, geometric
}

/**
 * Log-distance path loss. Deliberately reported as a coarse range,
 * never a single number, because it is not one.
 */
export function roughRange(rssi: number, txPower = -59, n = 2.4): string {
  const d = Math.pow(10, (txPower - rssi) / (10 * n));
  if (d < 0.5) return 'under 0.5 m';
  if (d < 1.5) return '0.5 – 1.5 m';
  if (d < 4) return '1.5 – 4 m';
  if (d < 10) return '4 – 10 m';
  return 'over 10 m';
}

export type Trend = 'warmer' | 'colder' | 'steady';

/** Compare the recent half of the tape against the older half. */
export function trend(history: number[], threshold = 1.5): Trend {
  if (history.length < 8) return 'steady';
  const window = history.slice(-12);
  const half = Math.floor(window.length / 2);
  const older = window.slice(0, half);
  const recent = window.slice(half);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = mean(recent) - mean(older);
  if (delta > threshold) return 'warmer';
  if (delta < -threshold) return 'colder';
  return 'steady';
}

/** Guess what a device is from its advertised name. Cosmetic only. */
export function kindOf(name: string | null): string {
  const n = (name ?? '').toLowerCase();
  if (!n) return 'Unnamed';
  if (/airpod|buds|headphone|wh-|wf-|beats/.test(n)) return 'Earbuds';
  if (/watch|band|fit|garmin/.test(n)) return 'Watch';
  if (/iphone|galaxy|pixel|redmi|oneplus|phone/.test(n)) return 'Phone';
  if (/ipad|tab\b/.test(n)) return 'Tablet';
  if (/macbook|laptop|thinkpad/.test(n)) return 'Laptop';
  if (/tile|airtag|tracker|smarttag/.test(n)) return 'Tracker';
  if (/tv|speaker|soundbar|jbl|bose/.test(n)) return 'Audio';
  return 'Device';
}
