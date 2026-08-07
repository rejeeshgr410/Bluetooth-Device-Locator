# Warmer — project brief for Claude Code

A React Native / Expo app that finds a lost Bluetooth device by signal strength.
Port of https://github.com/ben-z/findphone. The source is complete and typechecks;
your job is to get it building and running on a real device, then iterate.

## Ground rules

- **This app cannot run in Expo Go.** `react-native-ble-plx` is native code. It needs a
  development build. Do not suggest Expo Go.
- **It cannot run in a simulator or emulator.** There is no Bluetooth radio there. Every
  test is on a physical phone.
- **Do not change the tuning constants in `src/lib/signal.ts` or `src/lib/breadcrumbs.ts`
  without saying so.** They are the ported behaviour: band edges, smoothing alpha, click
  curve, peak dropoff threshold.
- Run `npx tsc --noEmit` after edits. One pre-existing error is expected:
  `Cannot find name 'require'` in `useClicker.ts` — Metro handles that, ignore it.

## Layout

```
App.tsx                      screen switch, owns the single scan stream
src/lib/signal.ts            smoothing, bands, click cadence, trend      ← ported core
src/lib/useScanner.ts        BLE scan + Android runtime permissions
src/lib/useClicker.ts        parking-sensor click cadence (audio + haptics)
src/lib/useDeadReckoning.ts  step counting + compass heading
src/lib/breadcrumbs.ts       peak detection, weighted centroid, steering
src/lib/useTrail.ts          ties position, peaks and estimate together
src/components/Tape.tsx      scrolling signal trace
src/components/TrackMap.tsx  plan view of the walk
src/screens/                 SurveyScreen (list), HuntScreen (meter + trail)
```

## First run

1. `npm install`
2. Ask me which build path I want before running anything that costs time:
   - **EAS cloud** (works on Windows, no Android Studio, no Xcode): `npx eas build --profile development --platform android`
   - **Local Android** (needs Android Studio + JDK 17 + `ANDROID_HOME`): `npx expo prebuild` then `npx expo run:android`
3. `npm start`, then open the dev build on the phone.

If a local Android build is chosen, check for the toolchain first (`java -version`,
`echo $env:ANDROID_HOME`) and tell me what is missing rather than installing anything
without asking.

## Known things to verify on device

- Android 12+ needs `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` granted at runtime, and
  **system Location switched on** or scan results silently never arrive. That is an
  Android BLE stack quirk, not a bug in the app.
- Step detection thresholds in `useDeadReckoning.ts` (`STEP_THRESHOLD = 1.14`) may need
  tuning per device. Test by walking a known 10 m line and comparing the step count.
- The magnetometer needs the phone held flat, screen up. Heading is only used relatively,
  so absolute north accuracy does not matter.

## Do not

- Add a navigation library. Two screens, one boolean, deliberate.
- Add `react-native-svg`. The map and tape are plain Views on purpose.
- Claim the app can make a device ring or give a bearing from one reading. Neither is
  possible with a single radio, and the README says so.
