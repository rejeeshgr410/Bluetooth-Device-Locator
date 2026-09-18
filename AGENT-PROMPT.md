# Agent prompt: Bluetooth Locator

Copy everything below the line into a coding agent (Claude Code or similar) when you want it to work on this project without step-by-step supervision. Replace the **Task** section with what you want done.

---

## Task

<!-- Replace this with the job, e.g. "Add a 'favourites' list so I can pin my own earbuds",
     or "Tune step detection — it over-counts when I walk slowly". Be specific about
     what "done" looks like. -->

**TASK GOES HERE**

## What this app is

A phone app that finds a lost Bluetooth device (earbuds, tag, watch, phone) by signal strength (RSSI). You pick a device from the list, then walk around. The app tells you whether you're getting warmer or colder, estimates the distance, clicks faster as you get closer, and draws your walked trail with marks at signal peaks. Those marks give a rough direction.

- **Stack:** React 18 + TypeScript + Vite, packaged for Android with Capacitor 8.
- **Bluetooth:** `@capacitor-community/bluetooth-le` (native), with Web Bluetooth as a fallback in browsers.
- **Motion:** `@capacitor/motion`. This is the WebView's `devicemotion` / `deviceorientation`, not native sensor code.
- **The active app is the repo root.** `files/warmer/` (an Expo/React Native port) and `android-src/` (Kotlin reference code) are older reference material. Don't edit them unless the task says so.

## Code map

| File | Role |
|---|---|
| `src/lib/signal.ts` | **Core accuracy logic.** Per-device `SignalEngine`: upper-quartile pre-filter → time-based Kalman filter → trend from a least-squares slope with t-statistic gating and hysteresis → log-distance model with a range. |
| `src/lib/bluetoothService.ts` | Starts and stops the scan (Android `SCAN_MODE_LOW_LATENCY`, duplicates allowed); drops invalid RSSI. |
| `src/lib/nameResolver.ts` | Device names and types from advertisements, plus `extractReferencePower` (iBeacon / Eddystone / TX Power → expected RSSI at 1 m). |
| `src/lib/useScanner.ts` | Owns all engines, stale/lost housekeeping, search mode, per-device 1 m calibration (localStorage key `bt-locator.calibration.v1`), pinning of the hunted device. |
| `src/App.tsx` | Screen switch; follows the target when its Bluetooth address rotates (same real name, exactly one candidate). |
| `src/lib/useDeadReckoning.ts` | Step detection + heading (`forwardHeading`). |
| `src/lib/breadcrumbs.ts`, `src/lib/useTrail.ts` | Peak marks, weighted-centroid estimate, steering sentence. |
| `src/lib/useClicker.ts`, `src/lib/clickInterval.ts` | Click / vibration cadence. |
| `src/screens/SurveyScreen.tsx`, `src/screens/HuntScreen.tsx` | The two screens. |
| `src/components/Tape.tsx`, `src/components/TrackMap.tsx` | Signal trace and trail map (plain DOM, no chart library). |
| `scripts/simulate-signal.ts` | Offline accuracy check; run with `npm run sim`. |

## Hard facts: don't design around them being false

1. **There is no Bluetooth in an emulator or desktop browser.** Real behaviour can only be confirmed on a physical Android phone. Say so plainly rather than claiming something "works".
2. **Android needs Location switched on** (and the permissions granted), or scan results silently never arrive.
3. **One RSSI reading gives distance, not direction.** Direction only comes from moving (trend + trail). Never claim the app can point at a device from a single reading.
4. **The app can't make the target ring or light up.** That needs a connection and support on the device's side.
5. **Phones and earbuds rotate their Bluetooth address (~15 min).** Guessed names include the address, so they can't be matched across a rotation; only real advertised names can.
6. **A device that is off or out of battery can't be found.**

## Rules

- **Accuracy is the product.** Any change to `signal.ts`, `breadcrumbs.ts`, `useDeadReckoning.ts` or `clickInterval.ts` must:
  1. run `npm run sim` before **and** after, and
  2. report both tables in your final message.

  Don't accept a change that raises the wrong-direction rate (colder while approaching, warmer while retreating) above ~2%, or drops "steady" while stationary below ~75%, unless you say explicitly why.
- **Don't change tuning constants silently.** The `TUNING` table, path-loss exponents, `STALE_AFTER_MS` / `LOST_AFTER_MS`, the step threshold and the peak thresholds are deliberate. If you change one, name it, give the old → new value and the reason.
- **Keep the UI honest.** Show distance as a range, show when data is stale ("SIGNAL LOST", no clicks), and label uncalibrated distances as rough. Silence must mean "no contact", never "no device".
- **Match the existing style.** Inline styles with the CSS tokens in `src/index.css` (`--c-*`), for both light and dark themes. Don't add a UI framework, router, state library or chart library.
- **Keep it small.** Don't refactor unrelated code. If you notice an unrelated problem, list it at the end instead of fixing it.
- **Don't touch** `signing/`, the release `.apk`/`.aab` files, `files.zip`, or anything credential-like. Don't bump dependencies unless the task needs it.
- **Ask before** anything slow or hard to undo: installing tools, changing Android Gradle/SDK settings, deleting files, or pushing.

## How to verify (every time)

1. `npx tsc --noEmit -p .` (must be clean)
2. `npm run build` (must succeed)
3. `npm run sim` if any signal / trail / motion logic changed
4. For UI changes, run `npx vite` and look at the page at **375 px wide** in both light and dark themes. The Hunt screen needs a device, so for a visual check you may add a temporary harness page that feeds `SignalEngine` fake readings. **Delete it afterwards.**
5. List what still needs a **real phone test** (see below). Don't mark it done.

## Building for the phone (only when asked)

```bash
npm run build
npx cap sync android
```

Then build or run from `android/` (Android Studio, or `./gradlew assembleDebug`). `android/` isn't tracked in git. Check that the JDK / Android SDK are present first, and ask before installing anything.

## Real-device test plan (hand this list to the user)

- Scan finds nearby devices within a few seconds; the list order doesn't jump constantly.
- Standing still next to a device, the trend mostly reads "steady".
- Walking toward it → "getting warmer"; away → "getting colder"; the clicks speed up as you get closer.
- **Calibrate at 1 m**, then check the distance at 1 m, 3 m and 5 m. It should be inside the displayed range.
- Walk a measured 10 m: the step count × stride should be close to 10 m (use **Calibrate Stride Length** if not).
- Turn right while walking: the trail on the map should also turn right.
- Turn the target off: within ~6 s the screen shows "SIGNAL LOST" and the clicks stop.

## Git

- Work on a new branch (`git checkout -b <short-topic>`), not directly on `main`.
- Commit only when the task is verified, with a clear message saying what changed and why. Don't push unless asked.

## Final message format

1. What you changed (files, one line each) and why.
2. Verification output: tsc/build result, and `npm run sim` before/after if relevant.
3. Any tuning constants changed (old → new, reason).
4. What still needs testing on a real phone.
5. Anything you noticed but deliberately left alone.
