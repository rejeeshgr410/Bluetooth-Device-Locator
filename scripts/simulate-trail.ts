/**
 * Offline accuracy check for the Trail estimate (src/lib/breadcrumbs.ts).
 *
 * A person walks loops around a hidden target. Signal: log-distance path loss with an
 * unknown exponent (2-3), spatially smooth shadowing, per-channel offsets and Rayleigh
 * fading. Position: dead reckoning with stride-length error and a drifting compass bias.
 * The app's real SignalEngine and peak detector produce the marks; each estimator is then
 * scored on where it tells the user to go, from where they end up.
 *
 *   npm run sim:trail
 */
import { SignalEngine } from '../src/lib/signal';
import { Crumb, centroid, detectPeak, estimate, multilaterate } from '../src/lib/breadcrumbs';

let seed = Number(process.env.SEED ?? 7);
const HARSH = process.env.HARSH === '1'; // 3x compass drift, 2x stride error
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

type P = { x: number; y: number };
const REF = -59;

function makeShadowing(): (p: P) => number {
  // A few random plane waves: ~3 dB of spatially smooth shadowing, 2-4 m features
  const waves = Array.from({ length: 6 }, () => ({
    kx: gauss() * 1.2, ky: gauss() * 1.2, ph: rnd() * 2 * Math.PI, a: 1.7 * (0.5 + rnd()),
  }));
  return (p) => waves.reduce((s, w) => s + w.a * Math.sin(w.kx * p.x + w.ky * p.y + w.ph), 0) / Math.sqrt(waves.length / 2);
}

/** Out and back along a straight 8 m line (all marks colinear: mirror ambiguity). */
function linePath(): P[] {
  const pts: P[] = [];
  for (let k = 0; k <= 80; k++) pts.push({ x: -4 + k * 0.1, y: -2 });
  for (let k = 80; k >= 0; k--) pts.push({ x: -4 + k * 0.1, y: -2 });
  return pts;
}

/** Closed loops around the rectangle (cx,cy,w,h), walked twice at ~1 m/s. */
function loopPath(cx: number, cy: number, w: number, h: number): P[] {
  const corners = [
    { x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 },
  ];
  const pts: P[] = [];
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.ceil(len / 0.1);
      for (let k = 0; k < steps; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
    }
  }
  return pts; // 0.1 m spacing
}

type Scenario = { name: string; target: () => P; path?: () => P[] };
const scenarios: Scenario[] = [
  { name: 'target inside the loop', target: () => ({ x: (rnd() - 0.5) * 3, y: (rnd() - 0.5) * 2 }) },
  { name: 'target near the path', target: () => ({ x: 3 + (rnd() - 0.5) * 1, y: (rnd() - 0.5) * 3 }) },
  { name: 'target outside the loop', target: () => ({ x: 5.5 + rnd() * 2, y: (rnd() - 0.5) * 4 }) },
  { name: 'straight line out and back', target: () => ({ x: (rnd() - 0.5) * 6, y: -2 + 1 + rnd() * 3 }), path: linePath },
];

type Est = (crumbs: Crumb[]) => P | null;
// "app" is what the Trail card shows: multilateration when the marks spread in 2D,
// otherwise the centroid. The other two are kept as references.
const estimators: Record<string, Est> = {
  'centroid only': (c) => (c.length ? centroid(c) : null),
  'multilateration only': (c) => (c.length >= 3 ? multilaterate(c) : c.length ? centroid(c) : null),
  'app (combined)': (c) => (c.length ? estimate(c) : null),
};

const rot = (v: P, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(r) + v.y * Math.sin(r), y: -v.x * Math.sin(r) + v.y * Math.cos(r) };
};

const TRIALS = 300;
for (const scn of scenarios) {
  const errs: Record<string, number[]> = {};
  const angs: Record<string, number[]> = {};
  for (const k of Object.keys(estimators)) { errs[k] = []; angs[k] = []; }
  let crumbCount = 0, usable = 0;

  for (let trial = 0; trial < TRIALS; trial++) {
    const target = scn.target();
    const n = 2 + rnd(); // true exponent, unknown to the app
    const shadow = makeShadowing();
    const path = scn.path ? scn.path() : loopPath(0, 0, 6, 4);
    const strideScale = 1 + gauss() * (HARSH ? 0.16 : 0.08);
    let bias = gauss() * (HARSH ? 15 : 5); // degrees
    const engine = new SignalEngine('ROOM_SWEEP');
    let peak: ReturnType<typeof detectPeak>['candidate'] = null;
    const crumbs: Crumb[] = [];
    let dr: P = { x: path[0].x, y: path[0].y };
    let t = 0, nextSample = 0.4, ch = 0;

    for (let i = 1; i < path.length; i++) {
      const step = { x: path[i].x - path[i - 1].x, y: path[i].y - path[i - 1].y };
      bias += gauss() * (HARSH ? 0.45 : 0.15); // slow compass drift
      const d = rot(step, bias);
      dr = { x: dr.x + d.x * strideScale, y: dr.y + d.y * strideScale };
      t += 0.1; // 1 m/s
      // ~8 packets per 0.1 s-step on average: 0.8 packets
      if (rnd() < 0.8) {
        const dist = Math.max(0.2, Math.hypot(path[i].x - target.x, path[i].y - target.y));
        const ray = Math.sqrt((gauss() ** 2 + gauss() ** 2) / 2);
        ch = (ch + 1) % 3;
        const rssi = REF - 10 * n * Math.log10(dist) + shadow(path[i]) + [0, -3, -1.5][ch] + 20 * Math.log10(Math.max(ray, 0.05));
        engine.ingest(Math.round(rssi), 1_000_000 + t * 1000);
      }
      if (t >= nextSample) {
        nextSample += 0.4;
        const st = engine.getStats();
        if (!st) continue;
        const r = detectPeak(peak, { x: dr.x, y: dr.y, rssi: st.filtered });
        peak = r.candidate;
        if (r.commit) crumbs.push({ id: crumbs.length + 1, ...r.commit, ref: st.refPower, at: t, manual: false });
      }
    }
    crumbCount += crumbs.length;
    if (crumbs.length < 3) continue;
    usable++;

    // Where is the target in the user's dead-reckoned frame, as seen from where they stand?
    const trueEnd = path[path.length - 1];
    const tv = rot({ x: target.x - trueEnd.x, y: target.y - trueEnd.y }, bias);
    const targetDR = { x: dr.x + tv.x * strideScale, y: dr.y + tv.y * strideScale };
    for (const [k, est] of Object.entries(estimators)) {
      const p = est(crumbs);
      if (!p) continue;
      errs[k].push(Math.hypot(p.x - targetDR.x, p.y - targetDR.y));
      const a1 = Math.atan2(p.x - dr.x, p.y - dr.y), a2 = Math.atan2(targetDR.x - dr.x, targetDR.y - dr.y);
      let da = Math.abs(((a1 - a2) * 180) / Math.PI) % 360;
      if (da > 180) da = 360 - da;
      if (Math.hypot(targetDR.x - dr.x, targetDR.y - dr.y) > 1) angs[k].push(da);
    }
  }

  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  console.log(`\n== ${scn.name}  (${usable}/${TRIALS} walks with 3+ marks, avg ${(crumbCount / TRIALS).toFixed(1)} marks)`);
  for (const k of Object.keys(estimators)) {
    const e = errs[k], a = angs[k];
    console.log(
      `  ${k.padEnd(22)} position error median ${q(e, 0.5).toFixed(2)} m, p90 ${q(e, 0.9).toFixed(2)} m` +
        ` | direction error median ${q(a, 0.5).toFixed(0)}°, p90 ${q(a, 0.9).toFixed(0)}°`,
    );
  }
}
