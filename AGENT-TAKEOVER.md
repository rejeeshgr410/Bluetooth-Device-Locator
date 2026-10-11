# Agent Takeover & Engineering Handbook: Bluetooth Locator

This document contains everything an AI coding agent or new engineer needs to immediately take over, understand, verify, build, and deploy the **Bluetooth Locator** application.

---

## 1. Executive Summary

* **Application Name:** Bluetooth Device Locator (Package: `com.bluetooth.locator`)
* **Core Purpose:** Locate lost Bluetooth Low Energy (BLE) peripherals (AirTags, earbuds, smart watches, smartphones, beacons) using signal strength (RSSI) dynamics, time-based Kalman filtering, least-squares trend detection, dead reckoning, and trail multilateration.
* **Core Tech Stack:**
  * **Frontend:** React 18, TypeScript 5.6, Vite 6.
  * **Native Container:** Capacitor 8.5.2 (Android).
  * **Styling:** Vanilla CSS using custom CSS variable tokens in `src/index.css` (Strictly NO external UI libraries like Tailwind, MUI, or Bootstrap).
  * **Native Plugins:**
    * `@capacitor-community/bluetooth-le` (BLE scanning & bonded device queries)
    * `@capacitor-community/keep-awake` (Screen lock prevention during scans)
    * `plugins/proximity-haptics/` (Custom local plugin for high-priority vibration with `AudioAttributes.USAGE_ALARM`)

---

## 2. Fast Takeover Runbook (Build & Verification)

### Prerequisites
* **Node.js:** Node.js v18+ (tested on Node v20/v26).
* **JDK:** Java 17 or Java 21 (Gradle 8.14.3 is bundled).
* **Android SDK:** Compile SDK 34/35, Command-line tools & Build tools.
* **ADB:** Configured in `PATH` for on-device testing.

### Standard Build Sequence

```bash
# 1. Install dependencies
npm install

# 2. Type-check (must pass with 0 errors)
npx tsc --noEmit -p .

# 3. Offline Signal Simulation (Kalman filter, trend t-statistic, distance accuracy)
npm run sim

# 4. Offline Trail Simulation (Walked loops, multilateration vs centroid, steering)
npm run sim:trail

# 5. Build Web Bundle (Vite output to dist/)
npm run build

# 6. Synchronize Web Bundle to Capacitor Android
npx cap sync android

# 7. Compile Android Debug APK
cd android
./gradlew assembleDebug
# (Windows PowerShell / CMD: .\gradlew.bat assembleDebug)
```

The resulting debug APK will be located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 3. Codebase Architecture & File Map

| Path | Primary Responsibility | Critical Invariants |
|---|---|---|
| `src/lib/signal.ts` | **Core Signal Pipeline (`SignalEngine`):** Upper-quartile pre-filter, 1D time-based Kalman filter, least-squares regression slope, t-statistic gating, hysteresis, log-distance range calculations, 1m calibration. | Never remove upper quartile or time-based process noise; do not exceed 2% wrong direction in `npm run sim`. |
| `src/lib/bluetoothService.ts` | Manages native BLE scanning via `@capacitor-community/bluetooth-le` (`SCAN_MODE_LOW_LATENCY`, `allowDuplicates: true`). Periodic 20s scan restart + early restart on 4s silence. | Long scans stall on Android if not restarted periodically. Location service must be active. |
| `src/lib/nameResolver.ts` | Decodes device names, manufacturer payloads (Apple, Samsung, Google, Tile, etc.), bonded device mappings, and extracts calibrated Tx Power (iBeacon / Eddystone / TX Power). | Prevents devices showing up as "Unnamed". |
| `src/lib/useScanner.ts` | State hub: manages `SignalEngine` instances per device, 1 m user calibrations (localStorage `bt-locator.calibration.v1`), search modes, pinning targets. | Stale devices dimmed after 6s, dropped after 25s. |
| `src/lib/useDeadReckoning.ts` | Pedestrian Dead Reckoning (PDR): Accelerometer step detection + absolute compass heading (`forwardHeading`). | Must listen to `deviceorientationabsolute` (Android WebView does not fire `deviceorientation`). |
| `src/lib/breadcrumbs.ts` & `src/lib/useTrail.ts` | Drops peak signal breadcrumbs along user's walked path. Computes multilateration ring intersection when marks spread ≥ 0.2m, weighted centroid otherwise; formats steering guidance sentence. | Max 250 marks cap to avoid $O(n^2)$ freeze. |
| `src/lib/useClicker.ts` & `src/lib/clickInterval.ts` | Geiger-counter style audio clicks and vibrations. Exponential rate mapped against distance normalised by 1m reference power. | Silent when signal is stale or lost. |
| `src/lib/proximityHaptics.ts` | Bridge to local native Android plugin. Uses `VibrationEffect` with `USAGE_ALARM`. | Standard Android haptics are suppressed if touch feedback is disabled in system settings. |
| `src/lib/useWakeLock.ts` | Keeps phone display awake during active scan using KeepAwake (Android) or Screen Wake Lock API (Web). | Released on component unmount. |
| `src/screens/SurveyScreen.tsx` | Main radar/device list screen with category filters, stable 4 dB bucketing sort, search input, theme toggle. | Bucketed sorting prevents rows jumping while user taps. |
| `src/screens/HuntScreen.tsx` | Active tracking screen: mode selector (`QUICK`, `SWEEP`, `FINAL`), signal tape graph, trail map, 1m calibration button, diagnostic drawer. | Shows "SIGNAL LOST" explicitly when device goes quiet. |
| `src/components/Tape.tsx` | 60-bucket sliding window SVG/canvas-like signal history trace (last 10s). Plain DOM, no chart libraries. | Lightweight DOM elements only. |
| `src/components/TrackMap.tsx` | Real-time SVG 2D bird's-eye map showing user trail, peak marks, target estimate confidence circle, and heading arrow. | Center-anchored coordinate system. |
| `scripts/simulate-signal.ts` | Offline test harness simulating multipath fading, shadow fading, channel hopping, stationary & walking movements. | Evaluates truth-in-range and wrong-direction rates. |
| `scripts/simulate-trail.ts` | Offline test harness simulating walked loops, dead-reckoning drift, stride error, and multilateration accuracy. | Measures median position & direction error. |

---

## 4. Key Engineering Invariants & Platform Quirks

### 1. Bluetooth Low Energy Realities
* **No Bluetooth in Emulators or Desktop Chrome:** BLE hardware scanning only works on physical Android hardware. Web Bluetooth in desktop browsers only connects to paired/explicit devices with GATT services.
* **Android Location Service Requirement:** On Android, Location MUST be turned ON in device quick settings. Even with `BLUETOOTH_SCAN` permissions granted, Android will return 0 BLE advertisements if Location is OFF.
* **BLE Scan Deafen Phenomenon:** Continuous low-latency BLE scans on Android go "deaf" after 1–3 minutes. The scanner in `src/lib/bluetoothService.ts` restarts every 20 seconds, and early after 4 seconds of total silence (limited to < 5 restarts per 30s to satisfy Android OS scan throttling).
* **MAC Address Rotation:** BLE devices (iPhones, Apple Watches, PC Bluetooth) randomize their MAC addresses every ~15 minutes. `App.tsx` contains address-rotation tracking to follow a target device across address rotations if its advertised name matches.

### 2. Signal Processing Math
* **Upper Quartile Pre-filter:** BLE channels 37, 38, and 39 experience differing attenuation, and multipath interference almost exclusively *subtracts* power. Therefore, taking `percentile(window, 0.75)` tracks path loss far more accurately than mean or median.
* **Time-based Kalman Filter:** Process noise is multiplied by $\Delta t$ (seconds), making signal smoothing independent of whether a device advertises at 1 Hz or 20 Hz.
* **Hysteresis & Trend Debounce (`TREND_HOLD_MS = 800ms`):** A transition to `GETTING WARMER` or `GETTING COLDER` requires statistically significant slope (t-statistic), and must hold for 800ms before rendering. Transitioning back to `STABLE` is immediate.

### 3. Motion & Dead Reckoning
* **Heading Event Bug in Android WebView:** Android Chrome / WebView does **not** emit `deviceorientation` events with compass headings; it only emits `deviceorientationabsolute`. Both listeners are wired in `src/lib/useDeadReckoning.ts`.
* **Alarm-usage Haptics:** Standard `navigator.vibrate` or `Haptics.impact` are classified as system touch feedback and muted when touch vibration is disabled in Android settings. The custom native plugin in `plugins/proximity-haptics/` forces `AudioAttributes.USAGE_ALARM` to guarantee audible/physical haptic clicks.

---

## 5. Testing on Physical Device (Pixel 8 Pro / ADB)

When connected via USB with Developer Options & USB Debugging enabled:

```bash
# Verify device connection
adb devices

# Build and install debug APK
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Launch app directly
adb shell am start -n com.bluetooth.locator/.MainActivity

# Inspect remote WebView inside Chrome
# 1. Forward WebView DevTools socket:
adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.bluetooth.locator)
# 2. Open Chrome on PC and navigate to:
# chrome://inspect or http://localhost:9333/json
```

---

## 6. Release Builds & Google Play Signing

* **Production Keystore:** Located in `signing/warmer-release.jks`.
* **Keystore Alias:** `warmer`
* **Keystore Password:** Stored in `signing/credentials.txt` (Store password and key password are identical).
* **Building Signed App Bundle (AAB):**
  ```bash
  cd android
  ./gradlew bundleRelease
  ```
  *(Sign with jarsigner / apksigner using `signing/warmer-release.jks`)*

---

## 7. Rules for Any Modifying Agent

1. **Accuracy is the product:** Never modify `src/lib/signal.ts`, `src/lib/breadcrumbs.ts`, or `src/lib/useDeadReckoning.ts` without running `npm run sim` and `npm run sim:trail` before and after. Ensure wrong-direction rates remain $\le 2\%$.
2. **Preserve UI Honesty:** Always report distance as an approximate range (`formatDistance`). Show "SIGNAL LOST" clearly when packets stop arriving.
3. **No External UI Frameworks:** Keep styles vanilla inline with CSS variables from `src/index.css`.
4. **Git Discipline:** Work on topical feature branches; do not commit directly to `main` without verification passing.
