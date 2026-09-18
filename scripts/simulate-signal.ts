/**
 * Offline accuracy check for the RSSI pipeline in src/lib/signal.ts.
 * Synthetic indoor BLE: log-distance path loss, per-channel offsets, slow shadowing
 * and Rayleigh fast fading. Not a substitute for a real device, but it catches
 * regressions in trend and distance behaviour.
 *
 *   npm run sim
 */
import { SignalEngine } from '../src/lib/signal';

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

const REF = -59;
const N = 2.5;
const trueRssi = (d: number) => REF - 10 * N * Math.log10(Math.max(d, 0.1));

function sample(d: number, ch: number, shadow: number) {
  const chOff = [0, -3, -1.5][ch];
  const ray = Math.sqrt((gauss() ** 2 + gauss() ** 2) / 2);
  const fade = 20 * Math.log10(Math.max(ray, 0.05));
  return Math.round(trueRssi(d) + chOff + shadow + fade);
}

type Scenario = { name: string; dur: number; dist: (t: number) => number; pps: number; expect: 'STABLE' | 'WARMER' | 'COLDER' };
const scenarios: Scenario[] = [
  { name: 'stationary 3 m', dur: 60, dist: () => 3, pps: 10, expect: 'STABLE' },
  { name: 'stationary 3 m (2 pps)', dur: 60, dist: () => 3, pps: 2, expect: 'STABLE' },
  { name: 'approach 8→1 m', dur: 9, dist: (t) => 8 - (7 * t) / 9, pps: 10, expect: 'WARMER' },
  { name: 'retreat 1→8 m', dur: 9, dist: (t) => 1 + (7 * t) / 9, pps: 10, expect: 'COLDER' },
  { name: 'stationary 1 m', dur: 60, dist: () => 1, pps: 10, expect: 'STABLE' },
  { name: 'stationary 8 m', dur: 60, dist: () => 8, pps: 10, expect: 'STABLE' },
];

for (const scn of scenarios) {
  let n = 0, warm = 0, cold = 0, stable = 0, absErr = 0, logDistErr = 0, inRange = 0;
  for (let k = 0; k < 40; k++) {
    const e = new SignalEngine('ROOM_SWEEP');
    let t = 0, shadow = 0, ch = 0;
    while (t < scn.dur) {
      t += (1 / scn.pps) * (0.6 + 0.8 * rnd());
      shadow = shadow * 0.98 + gauss() * 0.4;
      ch = (ch + 1) % 3;
      const d = scn.dist(t);
      const st = e.ingest(sample(d, ch, shadow), 1_000_000 + t * 1000);
      if (t < 3) continue; // warm-up
      n++;
      if (st.trend === 'GETTING WARMER') warm++;
      else if (st.trend === 'GETTING COLDER') cold++;
      else stable++;
      absErr += Math.abs(st.filtered - trueRssi(d));
      logDistErr += Math.abs(Math.log(st.distanceM / d));
      if (d >= st.distanceLowM && d <= st.distanceHighM) inRange++;
    }
  }
  const pct = (x: number) => `${Math.round((100 * x) / n)}%`.padStart(4);
  console.log(
    `${scn.name.padEnd(24)} expect ${scn.expect.padEnd(6)} | warmer ${pct(warm)} colder ${pct(cold)} steady ${pct(stable)}` +
      ` | rssi err ${(absErr / n).toFixed(1)} dB | dist err ×${Math.exp(logDistErr / n).toFixed(2)} | truth in range ${pct(inRange)}`,
  );
}
