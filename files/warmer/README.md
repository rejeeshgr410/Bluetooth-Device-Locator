# Warmer

A phone port of [ben-z/findphone](https://github.com/ben-z/findphone): find a nearby
Bluetooth device by signal strength when Find My isn't available. Same premise, same
dBm table, same parking-sensor clicks — but on the device you actually have in your
hand while you're crawling around looking under the sofa.

## What it does

**Survey** — every advertising Bluetooth device within roughly 10–20 m, sorted
strongest first, updating live.

**Hunt** — pick one and the screen becomes a single instrument: the smoothed reading in
dBm, a 60-sample trace behind it, and a WARMER / COLDER call taken from the slope. Clicks
and vibration speed up as you close in, about one a second across a room, tightening to
a buzz near −50 dBm. They stop the moment contact goes stale, so silence means no signal
rather than no device.

## Reading it

| dBm    | Rough meaning        |
| ------ | -------------------- |
| −45 up | arm's reach          |
| −60    | same table           |
| −72    | same room            |
| −85    | far, or behind cover |
| below  | very far, or shielded|

Signal strength is a coarse proxy for distance. Trust the trace as you move, not any
single number.

## Build

`react-native-ble-plx` is native code, so this will not run in Expo Go. You need a
development build.

```bash
npm install

# Cloud build, no Xcode or Android Studio needed:
npx eas build --profile development --platform android
npx eas build --profile development --platform ios

# Or locally:
npx expo prebuild
npx expo run:android
npx expo run:ios          # needs a real device; the simulator has no Bluetooth radio

npm start                 # then open the dev build
```

For a shareable APK: `npx eas build --profile preview --platform android`.

Both platforms need a physical device. Android also needs Location switched on at the
system level for scan results to arrive at all — an old quirk of the Android BLE stack,
not a permission the app skipped.

## What actually gets found

The honest version, because this differs from the macOS original:

- **Works well:** earbuds, watches, fitness bands, speakers, trackers, laptops, and any
  phone currently advertising over BLE. Anything that broadcasts a name is easy.
- **Android hunting an iPhone:** partly. Apple's Continuity packets are visible and give
  a usable RSSI, but the advertising address rotates roughly every fifteen minutes, so a
  long hunt may need re-picking the target.
- **iPhone hunting an iPhone:** poor. CoreBluetooth hands out an app-local UUID rather
  than a MAC, and hides most of what Apple devices advertise. Use an Android phone for
  this if you have one.
- **A phone that is off, or with Bluetooth off:** impossible. There is no radio to hear.

Also carried over from the original, and unavoidable with one radio:

- It cannot make the device ring.
- It cannot give a bearing. Distance only, no direction — you get there by walking and
  watching the trace.

## Structure

```
App.tsx                  screen switch, owns the scan stream
src/lib/signal.ts        smoothing, bands, click cadence, trend  ← the ported core
src/lib/useScanner.ts    BLE scan + Android runtime permissions
src/lib/breadcrumbs.ts   peak detection, weighted centroid, steering
src/lib/useDeadReckoning.ts  step counting + compass heading
src/lib/useTrail.ts      ties position, peaks and estimate together
src/lib/useClicker.ts    click cadence engine (audio + haptics)
src/components/Tape.tsx  the scrolling signal trace
src/components/TrackMap.tsx  plan view of the walk
src/screens/             SurveyScreen, HuntScreen
assets/click.wav         45 ms click
```

`src/lib/signal.ts` has no React or Bluetooth in it, so the tuning — smoothing alpha,
band edges, click curve — is all in one readable file.

## Trail mode

The one thing a phone can do that the laptop cannot: remember where it has been.

One radio gives distance and no bearing, so no single reading points anywhere. But a
walked path is a series of vantage points, and that is enough to triangulate. Switch to
**Trail** and the app starts plotting:

- Position comes from dead reckoning — it counts your steps from the accelerometer and
  points them in the direction the compass says the phone is facing.
- Every time the signal climbs and then falls back by 4 dB, that high point was a local
  maximum, and a **mark** drops there automatically. Tap *Drop a mark here* to add one
  by hand.
- The marks are combined into a weighted centroid — the amber ring — and the app tells
  you how far it is and whether to go left, right, or straight on.

Absolute north is irrelevant: the map is drawn relative to where you started the trail,
so a compass reading 20 degrees off is still perfectly usable as long as it is
consistently 20 degrees off.

**Walk a loop, not a line.** Two marks on a straight path cannot separate near from far —
the estimate needs a wide baseline, which is why *Confidence* stays low until the marks
are several metres apart. Step counting also drifts over a few minutes; hit **Reset**
when the plot stops agreeing with the room.

The intended sequence is trail first to find the right corner, then meter for the last
few metres, where a raw dBm number and a rising click rate beat any map.
