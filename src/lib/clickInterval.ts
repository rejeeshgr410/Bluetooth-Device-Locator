export function clickIntervalMs(rssi: number): number {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const t = clamp((rssi + 90) / 40, 0, 1); // -90 -> 0, -50 -> 1
  return Math.round(1000 * Math.pow(70 / 1000, t)); // 1000ms -> 70ms, geometric
}
