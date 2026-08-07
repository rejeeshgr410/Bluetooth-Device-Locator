# Warmer — Build Handoff

**A phone app that finds a lost Bluetooth device by signal strength.**

This document is self-contained. It contains the product brief, the exact algorithm with
every tuning constant, the screen and visual spec, a complete working reference
implementation in TypeScript, a porting map to Kotlin/Jetpack Compose, and a device test
plan. You should not need any other source.

---

## 0. How to use this document

Read section 2 first and pick a target. Then:

- **Building native Android (Kotlin + Compose):** read sections 3–6 for behaviour, use
  section 7 as the reference implementation to port from, and follow section 8 for the
  API mapping. The TypeScript in section 7 is not to be shipped — it is the
  specification made executable.
- **Building/continuing the React Native app:** the project in section 7 is complete and
  typechecks. Skip section 8. Go to section 9.

Section 12 has a copy-paste starter prompt.

---

## 1. What this is

You lose your phone in the house. Find My needs the internet, needs the device awake,
and often puts a blue dot on your whole building. But any Bluetooth radio in range
reports **RSSI** — received signal strength — on every advertising packet it hears. RSSI
is a bad absolute distance measure and a very good *relative* one. Walk around holding a
second device and the number tells you if you are getting closer.

This is a port of [ben-z/findphone](https://github.com/ben-z/findphone), a macOS CLI that
does exactly this, to a phone — which is a better host for the idea, because the thing
doing the searching is the thing you carry while searching.

The app has two modes:

- **Meter** — one device, one big number, a scrolling trace of the last 60 readings, and
  parking-sensor clicks that tighten as you close in.
- **Trail** — the app remembers where you walked, drops a mark at every local signal
  peak, and combines the marks into a heading and distance. One radio gives distance and
  no bearing; a walked path is many vantage points, which is enough to triangulate.

**The product principle, which drives most of the design:** a single RSSI reading lies.
The slope does not. Every screen gives the trend more visual weight than the number.

---

## 2. Choose the target

| | Native Android (Kotlin + Compose) | React Native (Expo) |
|---|---|---|
| Android | ✅ best fit — direct `BluetoothLeScanner` and `SensorManager` access | ✅ works |
| iOS | ❌ | ⚠️ works, but CoreBluetooth hides most of what Apple devices advertise |
| Reference code below | port from it | ship it |
| Effort | rewrite (~1–2 days) | already done, needs a build |

**Recommendation: if Android-only, build native.** No bridge between the radio callback
and the UI, and the sensor APIs are richer. The reference implementation exists to define
behaviour, not to constrain the language.

---

## 3. Hard platform constraints

These are facts about the platform, not choices. Do not design around them being false.

1. **No emulator or simulator can test this app.** There is no Bluetooth radio. Google
   documents this explicitly for the AI Studio browser emulator. Every meaningful test is
   on a physical phone, installed over USB.
2. **This cannot run in Expo Go.** `react-native-ble-plx` is native code and needs a
   development build.
3. **Android 12+ requires runtime `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`.** Android 11
   and below require `ACCESS_FINE_LOCATION` instead.
4. **Android requires system Location services switched ON**, or scan results silently
   never arrive — no error, no callback, just nothing. This is a long-standing Android
   BLE stack quirk. The app must detect it and say so, because a blank list otherwise
   looks like a broken app.
5. **The app cannot make the target ring.** No sound, no flash, no vibrate. That needs a
   connection and an agreement with the target device, which does not exist here.
6. **The app cannot give a bearing from a single reading.** RSSI is a scalar. Direction
   only emerges from movement, which is what Trail mode is for.
7. **A device that is off, or has Bluetooth off, is undetectable.** There is no radio to
   hear.
8. **iOS hunting iOS works poorly.** CoreBluetooth returns app-local UUIDs rather than
   MAC addresses and filters most Apple advertising. Android hunting an iPhone works via
   Continuity packets, but the advertising address rotates roughly every 15 minutes, so a
   long hunt may need the target re-picked.

Say these things in the UI where relevant. Do not paper over them.

---

## 4. Behaviour spec — the algorithm

Every constant here is deliberate. Changing one changes how the app feels in the hand.
If you change one, say so.

### 4.1 Smoothing

Exponential moving average, applied **per advertising packet**, not per second:

```
smoothed = previous + alpha * (sample - previous)      alpha = 0.28
```

First packet seeds the value directly. Keep the last 90 smoothed values as a ring buffer
(the "tape"); the UI draws the last 60.

### 4.2 Staleness

If no packet arrives for **5000 ms**, the contact is stale. When stale:

- the big number shows `––`, dimmed
- the clicks and vibration **stop** (silence must mean "no contact", never "no device")
- the trend line reads `SIGNAL LOST`

### 4.3 Proximity bands

| Smoothed RSSI | Label | Hint shown to the user |
|---|---|---|
| ≥ −45 | ARM'S REACH | Look down. Under, behind, inside something. |
| −45 to −60 | SAME TABLE | A few steps. Sweep the surfaces near you. |
| −60 to −72 | SAME ROOM | Walk the perimeter and watch the tape. |
| −72 to −85 | FAR, OR BEHIND COVER | Try the next room, or open the drawer. |
| < −85 | VERY FAR, OR SHIELDED | Metal and bodies eat signal. Keep moving. |

### 4.4 Meter fill

`fill = clamp((rssi + 95) / 55, 0, 1)` — floor −95 dBm, ceiling −40 dBm.

### 4.5 Click cadence

Geometric interpolation, so the change is perceptually even:

```
t        = clamp((rssi + 90) / 40, 0, 1)          // -90 dBm -> 0, -50 dBm -> 1
interval = round(1000 * (70/1000)^t)  ms          // 1000 ms -> 70 ms
```

About one click per second across a room, tightening to a buzz near −50 dBm. Haptic
strength steps up from light to medium above −55 dBm. Audio is a 45 ms click, 2400 Hz
falling to 900 Hz, exponential decay.

### 4.6 Trend

Compare the mean of the newest 6 samples against the previous 6 (a 12-sample window).
Needs at least 8 samples. Threshold **1.5 dB**:

- delta > +1.5 → `WARMER`
- delta < −1.5 → `COLDER`
- otherwise → `HOLDING`

### 4.7 Rough range

Log-distance path loss, reported only as a coarse band, never a number:

```
d = 10^((txPower - rssi) / (10 * n))      txPower = -59, n = 2.4
```

Buckets: under 0.5 m · 0.5–1.5 m · 1.5–4 m · 4–10 m · over 10 m.

### 4.8 Dead reckoning (Trail mode)

Position is relative to wherever the trail started. **Absolute north is irrelevant** —
the map is drawn in the starting frame, so a compass reading 20° off is fine as long as
it is consistently 20° off. This is why there is no calibration UI.

- **Step detection**: low-pass the accelerometer magnitude (`s = s*0.8 + m*0.2`),
  fire a step when it crosses **1.14 g** rising, re-arm below **1.02 g**. Minimum gap
  between steps **260 ms**, force re-arm after **2200 ms**.
- **Stride**: 0.72 m default.
- **Heading**: low-pass the compass with factor 0.25 using **shortest-arc** delta, so the
  value does not spin at the 0/360 seam.
- **Update**: on each step, `x += stride*sin(heading)`, `y += stride*cos(heading)`, where
  x is east-ish and y is north-ish in the starting frame.

### 4.9 Breadcrumbs

Sample position + RSSI every **400 ms**. Append to the track when you have moved ≥ 0.25 m.

A mark drops automatically when the reading climbs and then falls back by **≥ 4 dB**,
*and* you have moved **≥ 0.6 m** since that peak. The mark is placed at the peak, not at
the current position. Manual marks can also be dropped by button.

### 4.10 Hotspot estimate

Weighted centroid, weight = amplitude ratio against the strongest mark:

```
w_i = 10 ^ ((rssi_i - rssi_best) / 20)
x   = Σ(x_i * w_i) / Σ w_i        y likewise
```

`spread` = the largest pairwise distance between marks. Confidence:

| Condition | Confidence | Message |
|---|---|---|
| 0 marks | none | Walk a loop. Marks drop on their own at every signal peak. |
| < 3 marks | low | Two marks or fewer. Keep walking — three from different spots is the minimum. |
| spread < 3 m | low | All marks are close together. Cross the room and come back for a wider baseline. |
| < 5 marks or spread < 6 m | fair | Usable. Another pass at a different angle will tighten it. |
| else | good | Good baseline. Head for the marker and switch back to the meter for the last few metres. |

**Spread, not count, is what makes the estimate mean anything.** Four marks in one corner
tell you nothing. The UI must say this.

### 4.11 Steering

Relative bearing = `atan2(dx, dy)` in degrees minus current heading, normalised to
±180. Rendered as a sentence, because reading degrees while walking is work:

| Condition | Text |
|---|---|
| distance < 1.5 m | You are on it. Look around your feet. |
| \|rel\| < 20° | `{n} m straight ahead` |
| \|rel\| > 160° | `{n} m behind you` |
| 20–110° | `{n} m to your right` / `to your left` |
| 110–160° | `{n} m hard right` / `hard left` |

---

## 5. Screens

Two screens. No navigation library — one boolean of state. This is deliberate.

### 5.1 Survey (list)

- Wordmark `WARMER`, eyebrow `SIGNAL HUNT`.
- Warning banner if Bluetooth is off, or permission denied, or (Android) Location
  services are off.
- Primary button toggles `START LISTENING` / `STOP LISTENING`.
- Chip toggles `NAMED ONLY` / `ALL SIGNALS` — unnamed BLE beacons are numerous and
  usually noise, so named-only is the default.
- Text filter by name or address.
- List sorted by smoothed RSSI descending, hiding anything unheard for 20 s. Each row:
  a small horizontal strength bar, the name, a meta line (`{kind} · {n} packets`, plus
  `· quiet` when stale), and the dBm figure in mono.
- Empty state explains what listening will do, rather than saying "no results".
- Tapping a row starts the hunt. **Scanning must not stop** — the hunt screen reads the
  same stream.

### 5.2 Hunt — Meter mode

Top: back link, `TRACKING` / `NO CONTACT`, device name, address in mono.
Then the reading: 92 pt light mono number + `dBm` unit label.
Then a `METER` / `TRAIL` segmented control.

Meter mode shows:

- **The tape** — 60 vertical bars, height = fill, opacity ramping 0.18 → 1.0 oldest to
  newest, with hairline gridlines labelled −45, −60, −72, −85. This is the signature
  element and gets ~150 pt of height.
- Trend row: coloured dot + `WARMER` / `COLDER` / `HOLDING` / `SIGNAL LOST`.
- A card: band label, the band's hint sentence, then three stats — ROUGH RANGE, BEST
  SEEN, PACKETS.
- Toggles for Clicks and Vibration.
- A closing caveat paragraph about absorption and trusting the trace.

Screen must stay awake throughout.

### 5.3 Hunt — Trail mode

- **The map**, a square plan view: 4×4 hairline grid, faint dots for the track,
  amber dots for marks sized 8–22 pt by relative strength (manual marks get a white
  outline), a ring at the estimate, a triangle for you rotated to heading, and a
  `{n} m across` scale label. Auto-fits to content with 20% padding, minimum 6 m span.
- A card: the steering sentence as the headline, the confidence message as body, then
  MARKS / BASELINE / STEPS / CONFIDENCE stats.
- Buttons: `DROP A MARK HERE` (disabled when stale) and `RESET`.
- Caveat: hold flat, walk a loop not a line, step counting drifts, reset when the plot
  stops agreeing with the room.
- If the device has no accelerometer or magnetometer, show `NO MOTION SENSORS` and say
  the meter still works.

**The intended sequence is trail first to find the right corner, then meter for the last
few metres** — where a raw number and a rising click rate beat any map.

---

## 6. Visual design

The reference is a radio direction-finding set, not a dashboard: one live number, a
phosphor trace behind it, everything else dimmed so it stays legible in a dark room at
arm's length. Amber on ink is a deliberate CRT/radar reference, not a generic dark theme.

```
ink        #070B10   page background
inkRaised  #0E141C   cards, map, inputs
hairline   #1B242F   gridlines, dividers, tertiary text
amber      #FFB000   the live signal — used for nothing else decorative
amberDim   #6A4A08   the signal when stale
warm       #63E6E2   getting closer / good confidence only
cold       #5B6B7C   getting further
text       #E8EDF2
muted      #7C8B9A
alarm      #FF5A47   permission and hardware failures only
```

Type: platform monospace (`Menlo` / `monospace`) for every number — readings, stats,
addresses — and the system sans for prose. The reading is 92 pt weight 200 with −4
tracking. Labels are small, bold, and widely tracked (2–3 px). Corner radius 3–4 px,
never pill-shaped. Cards carry a 2 px amber left border rather than a full outline.

Amber is the signal. If amber appears on something that is not the live signal or a
control, that is a bug.

---

## 7. Reference implementation

Complete, typechecks clean. Ported behaviour lives in `signal.ts` and `breadcrumbs.ts` —
those two files are the specification made executable, and are the highest-value files to
read if you are porting.


### `src/lib/signal.ts`

**The ported core.** Smoothing, bands, click cadence, trend, range. No React, no Bluetooth — every tuning constant from section 4.1–4.7 lives here.

```typescript
/**
 * Signal maths. This is the port of findphone's core idea:
 * one smoothed RSSI number, read as a trend rather than a distance.
 */

export const STALE_AFTER_MS = 5000;

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
```

### `src/lib/breadcrumbs.ts`

**The trail maths.** Peak detection, weighted centroid, confidence, steering. Sections 4.9–4.11. Also pure.

```typescript
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
};

/**
 * Weighted centroid, weighted by amplitude ratio against the best crumb, so a
 * strong mark near the target outvotes several weak ones without erasing them.
 * Spread of the marks is what decides whether the answer means anything: four
 * crumbs in one corner tell you nothing you did not already know.
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
```

### `src/lib/useScanner.ts`

BLE scanning, Android runtime permissions, and the 200 ms state flush that stops a busy room causing a render per advertising packet.

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { ema, STALE_AFTER_MS } from './signal';

export type Contact = {
  id: string;
  name: string | null;
  rssi: number;        // smoothed
  raw: number;         // last packet
  packets: number;
  lastSeen: number;
  history: number[];   // smoothed tape, newest last
};

const TAPE_LENGTH = 90;

/** Android needs runtime permission before any scan will return results. */
export async function requestScanPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Platform.Version as number;
  const wanted =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export function useScanner() {
  const manager = useMemo(() => new BleManager(), []);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [scanning, setScanning] = useState(false);
  const [radio, setRadio] = useState<State>(State.Unknown);
  const [error, setError] = useState<string | null>(null);
  const store = useRef<Record<string, Contact>>({});

  useEffect(() => {
    const sub = manager.onStateChange((s) => setRadio(s), true);
    return () => {
      sub.remove();
      manager.stopDeviceScan();
      manager.destroy();
    };
  }, [manager]);

  // Flush the mutable store into React state on a fixed tick, so a busy
  // room does not cause a render per advertising packet.
  useEffect(() => {
    const id = setInterval(() => setContacts({ ...store.current }), 200);
    return () => clearInterval(id);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const ok = await requestScanPermission();
    if (!ok) {
      setError('Bluetooth permission was denied. Grant it in Settings to scan.');
      return;
    }
    store.current = {};
    setScanning(true);
    manager.startDeviceScan(null, { allowDuplicates: true }, (err, device: Device | null) => {
      if (err) {
        setError(err.message);
        setScanning(false);
        return;
      }
      if (!device || device.rssi == null) return;
      const prev = store.current[device.id];
      const smoothed = ema(prev?.rssi ?? null, device.rssi);
      const history = [...(prev?.history ?? []), smoothed].slice(-TAPE_LENGTH);
      store.current[device.id] = {
        id: device.id,
        name: device.name ?? device.localName ?? prev?.name ?? null,
        rssi: smoothed,
        raw: device.rssi,
        packets: (prev?.packets ?? 0) + 1,
        lastSeen: Date.now(),
        history,
      };
    });
  }, [manager]);

  const stop = useCallback(() => {
    manager.stopDeviceScan();
    setScanning(false);
  }, [manager]);

  return { contacts, scanning, radio, error, start, stop };
}

export function isStale(contact: Contact | undefined, now = Date.now()): boolean {
  return !contact || now - contact.lastSeen > STALE_AFTER_MS;
}
```

### `src/lib/useDeadReckoning.ts`

Step counting and heading. Note the units caveat in section 8.2 when porting.

```typescript
import { useEffect, useRef, useState } from 'react';
import { Accelerometer, Magnetometer } from 'expo-sensors';

export type Fix = { x: number; y: number; heading: number; steps: number };

const STEP_THRESHOLD = 1.14;   // g, peak of a walking bounce
const STEP_MIN_GAP_MS = 260;   // faster than this is noise, not a step
const STEP_MAX_GAP_MS = 2200;  // slower than this and you stopped walking

/**
 * Relative position by dead reckoning: count steps, point them in the
 * direction the phone is facing, accumulate.
 *
 * Absolute north does not matter here — the map is drawn relative to where
 * the hunt started, so a magnetometer that reads 20 degrees off is still
 * perfectly usable as long as it is consistently 20 degrees off. Hold the
 * phone flat, screen up, and walk normally.
 */
export function useDeadReckoning(opts: { active: boolean; stride?: number }) {
  const { active, stride = 0.72 } = opts;
  const [fix, setFix] = useState<Fix>({ x: 0, y: 0, heading: 0, steps: 0 });
  const [available, setAvailable] = useState<boolean | null>(null);

  const heading = useRef(0);
  const pos = useRef({ x: 0, y: 0, steps: 0 });
  const smoothed = useRef(1);
  const armed = useRef(true);
  const lastStep = useRef(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([Accelerometer.isAvailableAsync(), Magnetometer.isAvailableAsync()]).then(
      ([a, m]) => mounted && setAvailable(a && m),
    );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    Magnetometer.setUpdateInterval(120);
    const magSub = Magnetometer.addListener(({ x, y }) => {
      const deg = (Math.atan2(y, x) * 180) / Math.PI;
      const next = (deg + 360) % 360;
      // Shortest-arc low pass, so the value does not spin at the 0/360 seam.
      let delta = next - heading.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      heading.current = (heading.current + delta * 0.25 + 360) % 360;
    });

    Accelerometer.setUpdateInterval(20);
    const accSub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      smoothed.current = smoothed.current * 0.8 + magnitude * 0.2;
      const now = Date.now();
      const gap = now - lastStep.current;

      if (armed.current && smoothed.current > STEP_THRESHOLD && gap > STEP_MIN_GAP_MS) {
        armed.current = false;
        lastStep.current = now;
        const rad = (heading.current * Math.PI) / 180;
        pos.current = {
          x: pos.current.x + stride * Math.sin(rad),
          y: pos.current.y + stride * Math.cos(rad),
          steps: pos.current.steps + 1,
        };
      }
      if (smoothed.current < 1.02) armed.current = true;
      if (gap > STEP_MAX_GAP_MS) armed.current = true;
    });

    const ui = setInterval(() => {
      setFix({ ...pos.current, heading: heading.current });
    }, 200);

    return () => {
      magSub.remove();
      accSub.remove();
      clearInterval(ui);
    };
  }, [active, stride]);

  function reset() {
    pos.current = { x: 0, y: 0, steps: 0 };
    setFix({ x: 0, y: 0, heading: heading.current, steps: 0 });
  }

  return { fix, available, reset };
}
```

### `src/lib/useTrail.ts`

Ties position, peak detection and the estimate together.

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeadReckoning } from './useDeadReckoning';
import { Crumb, detectPeak, estimate as estimateFrom } from './breadcrumbs';

const SAMPLE_MS = 400;
const TRACK_LIMIT = 400;

export function useTrail(opts: { rssi: number | null; active: boolean; stride?: number }) {
  const { rssi, active, stride } = opts;
  const { fix, available, reset: resetFix } = useDeadReckoning({ active, stride });

  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [track, setTrack] = useState<{ x: number; y: number }[]>([]);
  const peak = useRef<{ x: number; y: number; rssi: number } | null>(null);
  const nextId = useRef(1);
  const latest = useRef({ rssi, fix, active });
  latest.current = { rssi, fix, active };

  useEffect(() => {
    const id = setInterval(() => {
      const { rssi: r, fix: f, active: on } = latest.current;
      if (!on || r == null) return;

      setTrack((prev) => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(f.x - last.x, f.y - last.y) < 0.25) return prev;
        return [...prev, { x: f.x, y: f.y }].slice(-TRACK_LIMIT);
      });

      const { candidate, commit } = detectPeak(peak.current, { x: f.x, y: f.y, rssi: r });
      peak.current = candidate;
      if (commit) {
        setCrumbs((prev) => [
          ...prev,
          { id: nextId.current++, x: commit.x, y: commit.y, rssi: commit.rssi, at: Date.now(), manual: false },
        ]);
      }
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const dropManual = useCallback(() => {
    const { rssi: r, fix: f } = latest.current;
    if (r == null) return;
    setCrumbs((prev) => [
      ...prev,
      { id: nextId.current++, x: f.x, y: f.y, rssi: r, at: Date.now(), manual: true },
    ]);
  }, []);

  const clear = useCallback(() => {
    setCrumbs([]);
    setTrack([]);
    peak.current = null;
    resetFix();
  }, [resetFix]);

  const estimate = useMemo(() => estimateFrom(crumbs), [crumbs]);

  return { fix, available, crumbs, track, estimate, dropManual, clear };
}
```

### `src/lib/useClicker.ts`

Variable-rate click engine. The loop re-reads the latest RSSI on every tick rather than being restarted on change.

```typescript
import { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { clickIntervalMs } from './signal';

/**
 * Clicks speed up as the signal rises. Silence means no contact,
 * not no device — the cadence stops the moment the reading goes stale.
 */
export function useClicker(opts: {
  rssi: number | null;
  active: boolean;
  sound: boolean;
  haptics: boolean;
}) {
  const { rssi, active, sound, haptics } = opts;
  const player = useRef<Audio.Sound | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ rssi, active, sound, haptics });
  latest.current = { rssi, active, sound, haptics };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      const { sound: s } = await Audio.Sound.createAsync(require('../../assets/click.wav'));
      if (cancelled) { await s.unloadAsync(); return; }
      player.current = s;
    })();
    return () => {
      cancelled = true;
      player.current?.unloadAsync();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    function tick() {
      const now = latest.current;
      if (now.active && now.rssi != null) {
        if (now.sound && player.current) {
          player.current.replayAsync().catch(() => {});
        }
        if (now.haptics) {
          const strong = now.rssi > -55;
          Haptics.impactAsync(
            strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
          ).catch(() => {});
        }
      }
      const wait = now.rssi == null ? 500 : clickIntervalMs(now.rssi);
      timer.current = setTimeout(tick, wait);
    }
    timer.current = setTimeout(tick, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
```

### `src/lib/theme.ts`

Design tokens from section 6.

```typescript
import { Platform } from 'react-native';

/**
 * Amber on ink. The reference is a radio-direction-finding set, not a
 * dashboard: one live number, a phosphor trace behind it, everything else
 * dimmed so it stays readable in a dark room at arm's length.
 */
export const c = {
  ink: '#070B10',
  inkRaised: '#0E141C',
  hairline: '#1B242F',
  amber: '#FFB000',
  amberDim: '#6A4A08',
  warm: '#63E6E2',
  cold: '#5B6B7C',
  text: '#E8EDF2',
  muted: '#7C8B9A',
  alarm: '#FF5A47',
};

export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const type = {
  reading: { fontFamily: mono, fontSize: 92, fontWeight: '200' as const, letterSpacing: -4 },
  unit: { fontFamily: mono, fontSize: 20, color: c.muted, letterSpacing: 2 },
  band: { fontSize: 15, fontWeight: '700' as const, letterSpacing: 3 },
  eyebrow: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 2.5, color: c.muted },
  body: { fontSize: 14, color: c.muted, lineHeight: 21 },
  item: { fontSize: 17, color: c.text, fontWeight: '500' as const },
};
```

### `src/components/Tape.tsx`

The signal trace — the signature element.

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { c, mono } from '../lib/theme';
import { fill } from '../lib/signal';

/**
 * The last ~90 readings as a scrolling trace. The whole point of the tool is
 * that a single number lies and the slope does not, so the slope gets the
 * space and the number sits on top of it.
 */
export function Tape({ history, height = 150 }: { history: number[]; height?: number }) {
  const slots = 60;
  const recent = history.slice(-slots);
  const pad = new Array(Math.max(0, slots - recent.length)).fill(null);
  const cells: (number | null)[] = [...pad, ...recent];

  return (
    <View style={[styles.wrap, { height }]}>
      {[-45, -60, -72, -85].map((line) => (
        <View key={line} style={[styles.grid, { bottom: fill(line) * height }]}>
          <Text style={styles.gridLabel}>{line}</Text>
        </View>
      ))}
      <View style={styles.bars}>
        {cells.map((v, i) => {
          const age = i / slots;
          return (
            <View key={i} style={styles.slot}>
              {v !== null && (
                <View
                  style={{
                    height: Math.max(2, fill(v) * height),
                    width: '100%',
                    backgroundColor: c.amber,
                    opacity: 0.18 + age * 0.82,
                  }}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: '100%' },
  slot: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 0.6, height: '100%' },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: c.hairline,
    justifyContent: 'center',
  },
  gridLabel: {
    position: 'absolute',
    right: 0,
    top: -13,
    fontFamily: mono,
    fontSize: 9,
    color: c.hairline,
  },
});
```

### `src/components/TrackMap.tsx`

Plan view of the walk. In Compose this becomes a single Canvas.

```tsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { c, mono } from '../lib/theme';
import { Crumb, Estimate } from '../lib/breadcrumbs';
import { Fix } from '../lib/useDeadReckoning';

type Props = {
  track: { x: number; y: number }[];
  crumbs: Crumb[];
  estimate: Estimate;
  fix: Fix;
  size: number;
};

/**
 * A plan view of the walk. Faint dots are where you have been, amber dots are
 * signal peaks sized by strength, the ring is the current best guess. Grid
 * squares are two metres.
 */
export function TrackMap({ track, crumbs, estimate, fix, size }: Props) {
  const view = useMemo(() => {
    const points = [
      ...track,
      ...crumbs,
      { x: fix.x, y: fix.y },
      ...(crumbs.length ? [{ x: estimate.x, y: estimate.y }] : []),
    ];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs, -2);
    const maxX = Math.max(...xs, 2);
    const minY = Math.min(...ys, -2);
    const maxY = Math.max(...ys, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY, 6) * 1.2;
    const scale = size / span;
    return {
      span,
      toScreen: (p: { x: number; y: number }) => ({
        left: size / 2 + (p.x - cx) * scale,
        top: size / 2 - (p.y - cy) * scale, // screen y grows downward
      }),
    };
  }, [track, crumbs, estimate, fix, size]);

  const strongest = crumbs.length ? Math.max(...crumbs.map((k) => k.rssi)) : 0;
  const weakest = crumbs.length ? Math.min(...crumbs.map((k) => k.rssi)) : 0;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {[0.25, 0.5, 0.75].map((f) => (
        <React.Fragment key={f}>
          <View style={[styles.grid, { left: size * f, top: 0, bottom: 0, width: 1 }]} />
          <View style={[styles.grid, { top: size * f, left: 0, right: 0, height: 1 }]} />
        </React.Fragment>
      ))}

      {track.map((p, i) => {
        const s = view.toScreen(p);
        return (
          <View
            key={`t${i}`}
            style={[styles.trackDot, { left: s.left - 1, top: s.top - 1, opacity: 0.12 + (i / track.length) * 0.4 }]}
          />
        );
      })}

      {crumbs.map((k) => {
        const s = view.toScreen(k);
        const range = Math.max(1, strongest - weakest);
        const strength = (k.rssi - weakest) / range;
        const d = 8 + strength * 14;
        return (
          <View
            key={k.id}
            style={{
              position: 'absolute',
              left: s.left - d / 2,
              top: s.top - d / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: c.amber,
              opacity: 0.25 + strength * 0.6,
              borderWidth: k.manual ? 1.5 : 0,
              borderColor: c.text,
            }}
          />
        );
      })}

      {crumbs.length >= 2 && (
        <View
          style={[
            styles.estimate,
            {
              left: view.toScreen(estimate).left - 20,
              top: view.toScreen(estimate).top - 20,
              borderColor: estimate.confidence === 'good' ? c.warm : c.muted,
            },
          ]}
        >
          <View style={[styles.estimateCore, { backgroundColor: estimate.confidence === 'good' ? c.warm : c.muted }]} />
        </View>
      )}

      <View
        style={[
          styles.you,
          {
            left: view.toScreen(fix).left - 9,
            top: view.toScreen(fix).top - 9,
            transform: [{ rotate: `${fix.heading}deg` }],
          },
        ]}
      >
        <View style={styles.youArrow} />
      </View>

      <Text style={styles.scaleLabel}>{view.span.toFixed(0)} m across</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: c.inkRaised,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  grid: { position: 'absolute', backgroundColor: c.hairline, opacity: 0.6 },
  trackDot: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: c.text },
  estimate: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estimateCore: { width: 5, height: 5, borderRadius: 3 },
  you: { position: 'absolute', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  youArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: c.text,
  },
  scaleLabel: {
    position: 'absolute',
    left: 8,
    bottom: 6,
    fontFamily: mono,
    fontSize: 9,
    color: c.hairline,
  },
});
```

### `src/screens/SurveyScreen.tsx`

Device list.

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput } from 'react-native';
import { c, type, mono } from '../lib/theme';
import { fill, kindOf, STALE_AFTER_MS } from '../lib/signal';
import { Contact } from '../lib/useScanner';

export function SurveyScreen({
  contacts,
  scanning,
  error,
  radioOn,
  onStart,
  onStop,
  onPick,
}: {
  contacts: Record<string, Contact>;
  scanning: boolean;
  error: string | null;
  radioOn: boolean;
  onStart: () => void;
  onStop: () => void;
  onPick: (contact: Contact) => void;
}) {
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(Date.now());
  const [namedOnly, setNamedOnly] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.values(contacts)
      .filter((d) => now - d.lastSeen < 20000)
      .filter((d) => (namedOnly ? !!d.name : true))
      .filter((d) => (q ? (d.name ?? '').toLowerCase().includes(q) || d.id.toLowerCase().includes(q) : true))
      .sort((a, b) => b.rssi - a.rssi);
  }, [contacts, filter, now, namedOnly]);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>WARMER</Text>
        <Text style={type.eyebrow}>SIGNAL HUNT</Text>
      </View>

      {!radioOn && (
        <Notice text="Bluetooth is off. Turn it on to hear anything at all." tone="alarm" />
      )}
      {error && <Notice text={error} tone="alarm" />}

      <View style={styles.controls}>
        <Pressable
          onPress={scanning ? onStop : onStart}
          style={[styles.button, scanning && styles.buttonActive]}
        >
          <Text style={[styles.buttonText, scanning && { color: c.ink }]}>
            {scanning ? 'STOP LISTENING' : 'START LISTENING'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setNamedOnly((v) => !v)} style={styles.chip}>
          <Text style={[styles.chipText, !namedOnly && { color: c.amber }]}>
            {namedOnly ? 'NAMED ONLY' : 'ALL SIGNALS'}
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={filter}
        onChangeText={setFilter}
        placeholder="Filter by name"
        placeholderTextColor={c.hairline}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <FlatList
        data={rows}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {scanning
              ? 'Listening. Devices appear as their advertising packets arrive — some go quiet for seconds at a time.'
              : 'Nothing yet. Start listening to see every Bluetooth device within about ten metres, strongest first.'}
          </Text>
        }
        renderItem={({ item }) => {
          const stale = now - item.lastSeen > STALE_AFTER_MS;
          return (
            <Pressable onPress={() => onPick(item)} style={styles.row}>
              <View style={styles.rowMeter}>
                <View style={[styles.rowMeterFill, { width: `${fill(item.rssi) * 100}%`, opacity: stale ? 0.25 : 1 }]} />
              </View>
              <View style={styles.rowBody}>
                <Text style={type.item} numberOfLines={1}>
                  {item.name ?? 'Unnamed'}
                </Text>
                <Text style={styles.rowMeta}>
                  {kindOf(item.name)} · {item.packets} packets{stale ? ' · quiet' : ''}
                </Text>
              </View>
              <Text style={[styles.rowRssi, { color: stale ? c.amberDim : c.amber }]}>
                {item.rssi.toFixed(0)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function Notice({ text, tone }: { text: string; tone: 'alarm' | 'muted' }) {
  return (
    <View style={[styles.notice, tone === 'alarm' && { borderLeftColor: c.alarm }]}>
      <Text style={[type.body, { color: c.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ink, padding: 22 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 },
  wordmark: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: 6 },
  controls: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.amber,
    alignItems: 'center',
  },
  buttonActive: { backgroundColor: c.amber },
  buttonText: { color: c.amber, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  chip: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  chipText: { color: c.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  input: {
    backgroundColor: c.inkRaised,
    color: c.text,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  rowBody: { flex: 1 },
  rowMeta: { fontSize: 11, color: c.hairline, marginTop: 3, letterSpacing: 0.4 },
  rowMeter: { width: 46, height: 3, backgroundColor: c.hairline },
  rowMeterFill: { height: 3, backgroundColor: c.amber },
  rowRssi: { fontFamily: mono, fontSize: 19 },
  sep: { height: 1, backgroundColor: c.inkRaised },
  empty: { ...type.body, marginTop: 30 },
  notice: {
    padding: 14,
    backgroundColor: c.inkRaised,
    borderLeftWidth: 2,
    borderLeftColor: c.amber,
    marginBottom: 14,
    borderRadius: 3,
  },
});
```

### `src/screens/HuntScreen.tsx`

Meter and Trail modes.

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ScrollView, useWindowDimensions } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Tape } from '../components/Tape';
import { TrackMap } from '../components/TrackMap';
import { c, type, mono } from '../lib/theme';
import { band, roughRange, trend, STALE_AFTER_MS } from '../lib/signal';
import { distanceTo, relativeBearing, steer } from '../lib/breadcrumbs';
import { Contact } from '../lib/useScanner';
import { useClicker } from '../lib/useClicker';
import { useTrail } from '../lib/useTrail';

type Mode = 'meter' | 'trail';

export function HuntScreen({
  target,
  contacts,
  onBack,
}: {
  target: { id: string; name: string | null };
  contacts: Record<string, Contact>;
  onBack: () => void;
}) {
  useKeepAwake();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('meter');
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [now, setNow] = useState(Date.now());
  const best = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const contact = contacts[target.id];
  const stale = !contact || now - contact.lastSeen > STALE_AFTER_MS;
  const live = stale ? null : contact!.rssi;

  if (live !== null && (best.current === null || live > best.current)) best.current = live;

  const t = useMemo(() => (contact ? trend(contact.history) : 'steady'), [contact?.history]);
  useClicker({ rssi: live, active: !stale, sound, haptics });

  const trail = useTrail({ rssi: live, active: mode === 'trail' });

  const b = live !== null ? band(live) : null;
  const trendColor = t === 'warmer' ? c.warm : t === 'colder' ? c.cold : c.muted;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ ALL SIGNALS</Text>
        </Pressable>
        <Text style={type.eyebrow}>{stale ? 'NO CONTACT' : 'TRACKING'}</Text>
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {target.name ?? 'Unnamed device'}
      </Text>
      <Text style={styles.id}>{target.id}</Text>

      <View style={styles.readout}>
        <Text style={[type.reading, { color: stale ? c.amberDim : c.amber }]}>
          {live === null ? '––' : live.toFixed(0)}
        </Text>
        <Text style={type.unit}>dBm</Text>
      </View>

      <View style={styles.segment}>
        <Seg label="METER" active={mode === 'meter'} onPress={() => setMode('meter')} />
        <Seg label="TRAIL" active={mode === 'trail'} onPress={() => setMode('trail')} />
      </View>

      {mode === 'meter' ? (
        <>
          <Tape history={contact?.history ?? []} />
          <View style={styles.trendRow}>
            <View style={[styles.dot, { backgroundColor: trendColor }]} />
            <Text style={[styles.trendText, { color: trendColor }]}>
              {stale ? 'SIGNAL LOST' : t === 'warmer' ? 'WARMER' : t === 'colder' ? 'COLDER' : 'HOLDING'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={[type.band, { color: stale ? c.muted : c.amber }]}>
              {b?.label ?? 'WAITING FOR A PACKET'}
            </Text>
            <Text style={type.body}>
              {stale
                ? 'Nothing heard for five seconds. Walk back the way you came, or the device may have gone to sleep.'
                : b?.hint}
            </Text>
            <View style={styles.stats}>
              <Stat label="ROUGH RANGE" value={live === null ? '—' : roughRange(live)} />
              <Stat label="BEST SEEN" value={best.current === null ? '—' : `${best.current.toFixed(0)} dBm`} />
              <Stat label="PACKETS" value={String(contact?.packets ?? 0)} />
            </View>
          </View>
        </>
      ) : (
        <TrailPanel trail={trail} width={width - 44} live={live} />
      )}

      <View style={styles.toggles}>
        <Toggle label="Clicks" value={sound} onChange={setSound} />
        <Toggle label="Vibration" value={haptics} onChange={setHaptics} />
      </View>

      <Text style={styles.caveat}>
        Signal strength is a coarse proxy for distance. Metal, walls and people absorb it, so a
        phone in a drawer two metres away can read the same as one fifteen metres away in the open.
        Walk slowly and trust the trace, not any single number.
      </Text>
    </ScrollView>
  );
}

function TrailPanel({
  trail,
  width,
  live,
}: {
  trail: ReturnType<typeof useTrail>;
  width: number;
  live: number | null;
}) {
  const { fix, crumbs, track, estimate, dropManual, clear, available } = trail;
  const showArrow = crumbs.length >= 2;
  const metres = distanceTo(fix, estimate);
  const rel = relativeBearing(fix, estimate);

  if (available === false) {
    return (
      <View style={styles.card}>
        <Text style={[type.band, { color: c.alarm }]}>NO MOTION SENSORS</Text>
        <Text style={type.body}>
          This device has no usable accelerometer or compass, so the trail cannot be plotted. The
          meter still works.
        </Text>
      </View>
    );
  }

  return (
    <>
      <TrackMap track={track} crumbs={crumbs} estimate={estimate} fix={fix} size={width} />

      <View style={styles.card}>
        <Text style={[type.band, { color: showArrow ? c.amber : c.muted }]}>
          {showArrow ? steer(rel, metres).toUpperCase() : 'GATHERING MARKS'}
        </Text>
        <Text style={type.body}>{estimate.note}</Text>
        <View style={styles.stats}>
          <Stat label="MARKS" value={String(crumbs.length)} />
          <Stat label="BASELINE" value={`${estimate.spread.toFixed(0)} m`} />
          <Stat label="STEPS" value={String(fix.steps)} />
          <Stat label="CONFIDENCE" value={estimate.confidence.toUpperCase()} />
        </View>
      </View>

      <View style={styles.trailButtons}>
        <Pressable
          onPress={dropManual}
          disabled={live === null}
          style={[styles.trailButton, live === null && { opacity: 0.35 }]}
        >
          <Text style={styles.trailButtonText}>DROP A MARK HERE</Text>
        </Pressable>
        <Pressable onPress={clear} style={[styles.trailButton, styles.trailButtonGhost]}>
          <Text style={[styles.trailButtonText, { color: c.muted }]}>RESET</Text>
        </Pressable>
      </View>

      <Text style={styles.caveat}>
        Hold the phone flat, screen up, and walk a loop rather than a line — two points on a
        straight path cannot separate near from far. Position comes from counting your steps, so it
        drifts over a few minutes. Reset when it stops agreeing with the room.
      </Text>
    </>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]}>
      <Text style={[styles.segText, active && { color: c.ink }]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.amberDim, false: c.hairline }}
        thumbColor={value ? c.amber : c.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.ink },
  content: { padding: 22, paddingBottom: 48 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
  back: { ...type.eyebrow, color: c.amber },
  name: { fontSize: 26, color: c.text, fontWeight: '600' },
  id: { fontFamily: mono, fontSize: 11, color: c.hairline, marginTop: 4 },
  readout: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 18, marginBottom: 6 },
  segment: { flexDirection: 'row', gap: 6, marginVertical: 16 },
  seg: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  segActive: { backgroundColor: c.amber, borderColor: c.amber },
  segText: { color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 },
  trendText: { fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  card: {
    marginTop: 22,
    padding: 18,
    backgroundColor: c.inkRaised,
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: c.amber,
    gap: 8,
  },
  stats: { flexDirection: 'row', marginTop: 12, gap: 12 },
  statLabel: { fontSize: 9, letterSpacing: 1.5, color: c.hairline, fontWeight: '700' },
  statValue: { fontFamily: mono, fontSize: 14, color: c.text, marginTop: 3 },
  trailButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  trailButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: c.amber,
    alignItems: 'center',
  },
  trailButtonGhost: { flex: 0.45, borderColor: c.hairline },
  trailButtonText: { color: c.amber, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  toggles: { flexDirection: 'row', gap: 26, marginTop: 22 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { color: c.text, fontSize: 15 },
  caveat: { ...type.body, fontSize: 12, marginTop: 26, color: c.hairline, lineHeight: 18 },
});
```

### `App.tsx`

Root. Screen switch, owns the single scan stream.

```tsx
import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { State } from 'react-native-ble-plx';
import { SurveyScreen } from './src/screens/SurveyScreen';
import { HuntScreen } from './src/screens/HuntScreen';
import { useScanner, Contact } from './src/lib/useScanner';
import { c } from './src/lib/theme';

export default function App() {
  const { contacts, scanning, radio, error, start, stop } = useScanner();
  const [target, setTarget] = useState<{ id: string; name: string | null } | null>(null);

  // Scanning must keep running while hunting — the hunt screen reads from the
  // same stream rather than opening a second one.
  useEffect(() => {
    if (target && !scanning) start();
  }, [target, scanning, start]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={c.ink} />
      {target ? (
        <HuntScreen target={target} contacts={contacts} onBack={() => setTarget(null)} />
      ) : (
        <SurveyScreen
          contacts={contacts}
          scanning={scanning}
          error={error}
          radioOn={radio === State.PoweredOn}
          onStart={start}
          onStop={stop}
          onPick={(d: Contact) => setTarget({ id: d.id, name: d.name })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ink },
});
```

### `app.json`

Expo config — permissions and the BLE plugin. For native Android this maps to `AndroidManifest.xml`.

```json
{
  "expo": {
    "name": "Warmer",
    "slug": "warmer",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "scheme": "warmer",
    "ios": {
      "bundleIdentifier": "com.example.warmer",
      "supportsTablet": false,
      "infoPlist": {
        "NSBluetoothAlwaysUsageDescription": "Warmer reads the signal strength of nearby Bluetooth devices so you can walk toward the one you lost.",
        "UIBackgroundModes": ["audio"]
      }
    },
    "android": {
      "package": "com.example.warmer",
      "permissions": [
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    },
    "plugins": [
      "expo-dev-client",
      [
        "react-native-ble-plx",
        {
          "isBackgroundEnabled": false,
          "modes": ["peripheral", "central"],
          "bluetoothAlwaysPermission": "Warmer reads the signal strength of nearby Bluetooth devices so you can walk toward the one you lost."
        }
      ],
      [
        "expo-build-properties",
        { "android": { "minSdkVersion": 24 } }
      ]
    ]
  }
}
```

### `package.json`

Dependencies.

```json
{
  "name": "warmer",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "expo start --dev-client",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "prebuild": "expo prebuild --clean"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-av": "~15.0.1",
    "expo-build-properties": "~0.13.1",
    "expo-dev-client": "~5.0.4",
    "expo-haptics": "~14.0.0",
    "expo-keep-awake": "~14.0.1",
    "expo-sensors": "~14.0.1",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-ble-plx": "^3.2.1"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@types/react": "~18.3.12",
    "typescript": "^5.3.3"
  },
  "private": true
}
```

### `assets/click.wav`

A 45 ms click: 2400 Hz falling to 900 Hz, exponential decay at rate 90, 44.1 kHz mono 16-bit. Regenerate it in any language, or with this Python:

```python
import math, struct, wave
sr = 44100
n = int(sr * 0.045)
frames = []
for i in range(n):
    t = i / sr
    f = 2400 + (900 - 2400) * (t / 0.045)
    s = math.sin(2 * math.pi * f * t) * math.exp(-t * 90)
    frames.append(struct.pack('<h', int(max(-1, min(1, s)) * 22000)))
w = wave.open('click.wav', 'w')
w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes(b''.join(frames)); w.close()
```


---

## 8. Porting map — React Native → Kotlin / Jetpack Compose

### 8.1 Direct API equivalents

| Reference (RN/Expo) | Android native |
|---|---|
| `new BleManager()` | `BluetoothManager.adapter.bluetoothLeScanner` |
| `startDeviceScan(null, {allowDuplicates:true}, cb)` | `scanner.startScan(null, settings, callback)` with `ScanSettings.Builder().setScanMode(SCAN_MODE_LOW_LATENCY).setCallbackType(CALLBACK_TYPE_ALL_MATCHES).setReportDelay(0)` |
| `device.rssi`, `device.id`, `device.name` | `ScanResult.rssi`, `result.device.address`, `result.scanRecord?.deviceName ?: result.device.name` |
| `PermissionsAndroid.requestMultiple` | `rememberLauncherForActivityResult(RequestMultiplePermissions())` |
| `manager.onStateChange` | `BluetoothAdapter.isEnabled` + `ACTION_STATE_CHANGED` broadcast receiver |
| `expo-haptics` | `VibratorManager` → `Vibrator.vibrate(VibrationEffect.createOneShot(ms, amplitude))` |
| `expo-av` click | `SoundPool` with the 45 ms WAV in `res/raw` |
| `expo-keep-awake` | `window.addFlags(FLAG_KEEP_SCREEN_ON)` or `KeepScreenOn` modifier |
| `Accelerometer.addListener` | `SensorManager` + `TYPE_ACCELEROMETER`, `SENSOR_DELAY_GAME` |
| `Magnetometer.addListener` | `TYPE_ROTATION_VECTOR` → `getRotationMatrixFromVector` → `getOrientation()[0]` |
| 200 ms state flush interval | `MutableStateFlow` updated from the callback, `.sample(200)` before `collectAsStateWithLifecycle` |
| `setTimeout` click loop | `LaunchedEffect` coroutine: `while(true) { click(); delay(intervalFor(rssi)) }` |
| Views-as-bars chart | Compose `Canvas` with `drawRect` / `drawCircle` — much easier than the RN version |

### 8.2 Three traps that will produce wrong behaviour if missed

1. **Accelerometer units differ.** Expo reports in **g**; Android `SensorManager` reports
   **m/s²**. The step thresholds in §4.8 are in g. Either multiply the constants by 9.81
   (`1.14 g → 11.18 m/s²`, `1.02 g → 10.01 m/s²`) or divide the sensor reading. Getting
   this wrong means either no steps ever, or every sample is a step.

2. **Prefer `TYPE_ROTATION_VECTOR` over raw `TYPE_MAGNETIC_FIELD`.** The reference uses
   the raw magnetometer because Expo's API is thin; Android gives you a fused
   accelerometer + magnetometer orientation that is far more stable and does not require
   the phone to be perfectly flat. Keep the shortest-arc low pass either way.

3. **Location services, not just permission.** `BLUETOOTH_SCAN` being granted is not
   enough on many devices — the system Location *toggle* must also be on or
   `onScanResult` is never called. Check `LocationManager.isLocationEnabled` and show the
   warning banner. This is the single most common "the app is broken" report.

### 8.3 Architecture

Single activity, single module, Compose only — which matches AI Studio's Android
generator constraints. Suggested shape:

```
MainActivity.kt              permissions, keep-screen-on, Surface
ScannerViewModel.kt          owns BluetoothLeScanner, exposes StateFlow<Map<String,Contact>>
signal/Signal.kt             pure functions from §4.1–4.7 — no Android imports
signal/Breadcrumbs.kt        pure functions from §4.9–4.11 — no Android imports
sensors/DeadReckoning.kt     SensorManager wrapper, exposes StateFlow<Fix>
audio/Clicker.kt             SoundPool + Vibrator, variable-rate coroutine
ui/SurveyScreen.kt
ui/HuntScreen.kt             meter + trail modes
ui/Tape.kt                   Canvas
ui/TrackMap.kt               Canvas
ui/Theme.kt                  the palette from §6
```

Keep `Signal.kt` and `Breadcrumbs.kt` free of Android imports so they are unit-testable
without a device. Write unit tests for them — they are the only part testable off-device.

---

## 9. Build and run

### Native Android from AI Studio / Antigravity

1. Build. The browser emulator will render the UI but **will never show a Bluetooth
   device** — do not treat an empty list there as a bug.
2. Enable Developer Options and USB Debugging on a phone, connect by USB, use
   **Install on Device**.
3. Grant permissions when prompted, and confirm system Location is on.
4. Put a BLE device (earbuds in pairing mode, a speaker, a smartwatch) in another room.

### React Native reference project

```bash
npm install
npx eas build --profile development --platform android   # cloud, no local toolchain
# or: npx expo prebuild && npx expo run:android          # needs Android Studio + JDK 17
npm start
```

`npx tsc --noEmit` should report exactly one error — `Cannot find name 'require'` in
`useClicker.ts`, which Metro handles. Anything else is a regression.

---

## 10. Acceptance tests — all on a physical device

| # | Test | Pass condition |
|---|---|---|
| 1 | Grant permissions, tap START LISTENING | Named devices appear within ~3 s, sorted strongest first |
| 2 | Turn system Location off, scan again | Warning banner appears; app does not show an empty list with no explanation |
| 3 | Deny Bluetooth permission | Clear message naming the permission, not a crash or blank screen |
| 4 | Hold a BLE speaker, then walk 10 m away | Number falls, tape slopes down, trend reads COLDER within ~3 s |
| 5 | Walk back | Trend reads WARMER; it must not flicker between states while walking steadily |
| 6 | Stand at arm's length | Reading ≥ −45, band reads ARM'S REACH, clicks are a near-buzz |
| 7 | Power off the target | Clicks and vibration stop within 5 s; `SIGNAL LOST` shows |
| 8 | Walk exactly 20 steps in Trail mode | STEPS reads 20 ±2. If not, retune §4.8 for this device and record what you changed |
| 9 | Walk a ~10 m square around a hidden speaker | ≥ 4 marks drop; estimate lands within ~3 m of the speaker; confidence reads fair or good |
| 10 | Walk a straight line only | Confidence stays low and the message says the baseline is too narrow — it must not claim a confident answer |
| 11 | Leave Meter mode running 5 minutes | Screen never sleeps; memory does not grow (the tape is capped at 90, the track at 400) |

Test 9 is the one that proves the whole Trail concept. Test 10 is the one that proves the
app is honest.

---

## 11. Do not

- Do not add a navigation library. Two screens, one boolean.
- Do not claim the app can ring the device or give a bearing from one reading. Neither is
  possible with a single radio.
- Do not present the estimated distance as precise. Bands only.
- Do not let the clicks continue when the signal is stale. Silence carries meaning here.
- Do not change the constants in §4 silently. If a device needs different step
  thresholds, say which and why.
- Do not build a settings screen. Two toggles inline is the whole surface.
- Do not use amber for anything that is not the live signal or an active control.
- Do not gate the app behind an account, an onboarding flow, or a splash screen. It is a
  tool you open when something is already going wrong.

---

## 12. Starter prompt

> Build a native Android app called **Warmer** that finds a lost Bluetooth device by
> signal strength. Kotlin and Jetpack Compose, single activity, Material 3 theming
> overridden with the custom palette below.
>
> Follow the attached handoff document exactly — particularly section 4, which contains
> the complete algorithm with every tuning constant, and section 8.2, which lists three
> porting traps. The TypeScript in section 7 is a working reference implementation to
> port from, not code to ship.
>
> Start by implementing `Signal.kt` and `Breadcrumbs.kt` as pure Kotlin with no Android
> imports, with unit tests, since they are the only part testable without a device. Then
> the scanner and permissions, then the Survey screen, then Meter mode, then Trail mode.
>
> Be aware: the browser emulator has no Bluetooth radio, so an empty device list there is
> expected and not a bug. Everything must be verified over ADB on a physical phone
> against the test table in section 10.
>
> Before you start, tell me your plan and flag anything in the spec you think is wrong.

---

*Origin: [ben-z/findphone](https://github.com/ben-z/findphone) by Ben Zhang — a macOS CLI
that does this from a laptop. Trail mode is the addition a phone makes possible, because
the searching device is the one that moves.*
