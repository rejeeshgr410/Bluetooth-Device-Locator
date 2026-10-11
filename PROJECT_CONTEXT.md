# Project Context & Debugging Request

**Issue Description:** 
[Briefly explain the bug, error messages, and what *should* happen vs what *is* happening]

## Project Structure
```text
bluetooth-device-locator/
├── android/
│   └── app/
│       └── src/
│           └── main/
│               └── AndroidManifest.xml
├── plugins/
│   └── proximity-haptics/
│       ├── android/
│       │   ├── build.gradle
│       │   └── src/
│       │       └── main/
│       │           ├── AndroidManifest.xml
│       │           └── java/
│       │               └── com/
│       │                   └── bluetooth/
│       │                       └── locator/
│       │                           └── haptics/
│       │                               └── ProximityHapticsPlugin.java
│       └── package.json
├── public/
│   ├── favicon.ico
│   ├── icon.svg
│   └── manifest.webmanifest
├── scripts/
│   ├── simulate-signal.ts
│   └── simulate-trail.ts
├── src/
│   ├── components/
│   │   ├── Tape.tsx
│   │   └── TrackMap.tsx
│   ├── lib/
│   │   ├── bluetoothService.ts
│   │   ├── breadcrumbs.ts
│   │   ├── clickInterval.ts
│   │   ├── nameResolver.ts
│   │   ├── proximityHaptics.ts
│   │   ├── signal.ts
│   │   ├── theme.ts
│   │   ├── useClicker.ts
│   │   ├── useDeadReckoning.ts
│   │   ├── useScanner.ts
│   │   ├── useTrail.ts
│   │   └── useWakeLock.ts
│   ├── screens/
│   │   ├── HuntScreen.tsx
│   │   └── SurveyScreen.tsx
│   ├── types/
│   │   └── web-bluetooth.d.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── AGENT-PROMPT.md
├── capacitor.config.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Source Code

### File: `package.json`
```json
{
  "name": "bluetooth-device-locator",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "sim": "esbuild scripts/simulate-signal.ts --bundle --platform=node --outfile=node_modules/.cache/simulate-signal.cjs --log-level=warning && node node_modules/.cache/simulate-signal.cjs",
    "sim:trail": "esbuild scripts/simulate-trail.ts --bundle --platform=node --outfile=node_modules/.cache/simulate-trail.cjs --log-level=warning && node node_modules/.cache/simulate-trail.cjs"
  },
  "dependencies": {
    "@capacitor-community/bluetooth-le": "^8.3.0",
    "@capacitor-community/keep-awake": "^8.0.1",
    "@capacitor/android": "^8.5.2",
    "@capacitor/core": "^8.5.2",
    "lucide-react": "^0.469.0",
    "proximity-haptics": "file:plugins/proximity-haptics",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@capacitor/cli": "^8.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.5"
  }
}
```

### File: `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### File: `vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true
  }
});
```

### File: `capacitor.config.ts`
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bluetooth.locator',
  appName: 'Device Locator',
  webDir: 'dist'
};

export default config;
```

### File: `index.html`
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Zoom deliberately left enabled: this is used one-handed while crouched
         under furniture, which is exactly when someone needs to pinch in. -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="WARMER turns Bluetooth signal strength into a warmer/colder trail so you can walk down a lost device." />
    <meta name="theme-color" content="#070B10" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="apple-touch-icon" href="/icon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>Bluetooth Device Locator</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@200;400;500;700;800&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### File: `src/main.tsx`
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### File: `src/App.tsx`
```tsx
import { useEffect, useRef, useState } from 'react';
import { SurveyScreen } from './screens/SurveyScreen';
import { HuntScreen } from './screens/HuntScreen';
import { useScanner, Contact } from './lib/useScanner';
import { useWakeLock } from './lib/useWakeLock';
import { useTheme } from './lib/theme';

export default function App() {
  const {
    contacts,
    scanning,
    searchMode,
    error,
    notice,
    start,
    stop,
    clear,
    setSearchMode,
    calibrate,
    pin,
  } = useScanner();

  const { theme, toggleTheme } = useTheme();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [followNote, setFollowNote] = useState<string | null>(null);
  const lastKnown = useRef<Contact | null>(null);

  useWakeLock(scanning);

  useEffect(() => {
    pin(targetId);
  }, [targetId, pin]);

  const live = targetId ? contacts[targetId] : undefined;
  if (live) lastKnown.current = live;

  // Phones, earbuds and watches rotate their private address (~15 min). When the
  // target goes quiet and exactly one device with the same *advertised* name shows
  // up, follow it. Guessed labels carry the address, so they can never match.
  useEffect(() => {
    const prev = lastKnown.current;
    if (!targetId || !prev || prev.isGuessed) return;
    if (live && !live.stats.isStale) return;

    const candidates = Object.values(contacts).filter(
      (c) =>
        c.id !== targetId &&
        !c.isGuessed &&
        !c.stats.isStale &&
        c.name === prev.name &&
        c.firstSeen >= prev.stats.lastSeen - 3000,
    );
    if (candidates.length === 1) {
      setTargetId(candidates[0].id);
      setFollowNote(`${prev.name} changed its Bluetooth address. Now following the new one.`);
    }
  }, [contacts, live, targetId]);

  const activeContact: Contact | null = targetId
    ? live ?? (lastKnown.current && { ...lastKnown.current, stats: { ...lastKnown.current.stats, isStale: true } })
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
      {activeContact ? (
        <HuntScreen
          contact={activeContact}
          scanning={scanning}
          onBack={() => {
            setTargetId(null);
            setFollowNote(null);
            lastKnown.current = null;
          }}
          onCalibrate={() => calibrate(activeContact.id)}
          followNote={followNote}
          onDismissNote={() => setFollowNote(null)}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <SurveyScreen
          contacts={contacts}
          scanning={scanning}
          error={error}
          notice={notice}
          theme={theme}
          onToggleTheme={toggleTheme}
          onStart={start}
          onStop={stop}
          onClear={clear}
          onPick={(d: Contact) => {
            lastKnown.current = d;
            setTargetId(d.id);
            if (!scanning) start();
          }}
        />
      )}
    </div>
  );
}
```

### File: `src/index.css`
```css
:root {
  /* Light Mode (Default) */
  --c-bg: #F8FAFC;
  --c-surface: #FFFFFF;
  --c-surface-elevated: #F1F5F9;
  --c-surface-hover: #E2E8F0;
  --c-border: #E2E8F0;
  --c-border-subtle: #EDF2F7;
  --c-hairline: #CBD5E1;

  --c-text: #0F172A;
  --c-text-secondary: #475569;
  --c-text-muted: #64748B;
  --c-text-inverse: #FFFFFF;

  --c-primary: #2563EB;
  --c-primary-hover: #1D4ED8;
  --c-primary-light: #EFF6FF;

  --c-success: #059669;
  --c-success-light: #ECFDF5;
  --c-warning: #D97706;
  --c-warning-light: #FFFBEB;
  --c-danger: #DC2626;
  --c-danger-light: #FEF2F2;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);

  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

[data-theme="dark"] {
  /* Dark Mode */
  --c-bg: #0B0F17;
  --c-surface: #141C28;
  --c-surface-elevated: #1D2838;
  --c-surface-hover: #26354A;
  --c-border: #233144;
  --c-border-subtle: #192433;
  --c-hairline: #32435B;

  --c-text: #F8FAFC;
  --c-text-secondary: #CBD5E1;
  --c-text-muted: #94A3B8;
  --c-text-inverse: #0B0F17;

  --c-primary: #3B82F6;
  --c-primary-hover: #60A5FA;
  --c-primary-light: rgba(59, 130, 246, 0.15);

  --c-success: #10B981;
  --c-success-light: rgba(16, 185, 129, 0.15);
  --c-warning: #F59E0B;
  --c-warning-light: rgba(245, 158, 11, 0.15);
  --c-danger: #EF4444;
  --c-danger-light: rgba(239, 68, 68, 0.15);

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -4px rgba(0, 0, 0, 0.4);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  background-color: var(--c-bg);
  color: var(--c-text);
  font-family: var(--font-sans);
  min-height: 100vh;
  width: 100%;
  overflow-x: hidden;
  line-height: 1.5;
  transition: background-color 0.2s ease, color 0.2s ease;
}

#root {
  min-height: 100vh;
  /* Android 15+ draws the app edge-to-edge; keep content clear of the gesture bar */
  padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
}

button {
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

input {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  border: none;
  outline: none;
}

:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 2px;
  border-radius: 6px;
}

:focus:not(:focus-visible) {
  outline: none;
}

/* Animations */
@keyframes pulse-ring {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.4;
  }
  100% {
    transform: scale(0.95);
    opacity: 0.8;
  }
}

@keyframes radar-sweep {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.radar-sweep-anim {
  animation: radar-sweep 3s linear infinite;
}

.pulse-anim {
  animation: pulse-ring 2s ease-in-out infinite;
}

/* Scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--c-border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--c-text-muted);
}

/* Proximity halo: stays centred and faint so it never covers the reading */
@keyframes halo {
  0%, 100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.05; }
  50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.12; }
}
.halo-anim {
  animation: halo 2s ease-in-out infinite;
}
```

### File: `src/types/web-bluetooth.d.ts`
```typescript
/**
 * Minimal Web Bluetooth typings.
 *
 * The standard TS DOM lib ships none of this, and @types/web-bluetooth omits
 * requestLEScan — which is the only API that returns more than one device.
 * Only the surface this app actually touches is declared here.
 */

interface BluetoothAdvertisingEvent extends Event {
  readonly device: BluetoothDevice;
  /** Absent on some platforms. Never substitute a value for a missing rssi. */
  readonly rssi?: number;
  readonly txPower?: number;
  readonly name?: string;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  watchAdvertisements?(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

/** Handle returned by requestLEScan. Calling stop() ends the radio scan. */
interface BluetoothLEScan {
  readonly active: boolean;
  stop(): void;
}

interface BluetoothLEScanOptions {
  acceptAllAdvertisements?: boolean;
  keepRepeatedDevices?: boolean;
  filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>;
}

interface BluetoothRequestDeviceOptions {
  acceptAllDevices?: boolean;
  optionalServices?: string[];
  filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>;
}

interface Bluetooth extends EventTarget {
  getAvailability(): Promise<boolean>;
  requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
  /**
   * Chrome only, and only behind
   * chrome://flags/#enable-experimental-web-platform-features.
   * Absent entirely when unavailable, so `typeof` is a real feature test.
   */
  requestLEScan?(options: BluetoothLEScanOptions): Promise<BluetoothLEScan>;
  addEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
```

### File: `src/components/Tape.tsx`
```tsx
import React from 'react';

interface TapeProps {
  history: (number | null)[];
  height?: number;
}

/**
 * Clean sliding-window signal trace graph with adaptive theme colors and gridlines.
 */
export const Tape: React.FC<TapeProps> = ({ history, height = 130 }) => {
  const slots = 60;
  const recent = history.slice(-slots);
  const pad = new Array(Math.max(0, slots - recent.length)).fill(null);
  const cells = [...pad, ...recent];

  const gridLevels = [-45, -60, -75, -88];

  const fill = (rssi: number) => Math.max(0, Math.min(100, ((rssi + 95) / 60) * 100)) / 100;

  return (
    <div
      style={{
        width: '100%',
        height: `${height}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: 'var(--c-surface-elevated)',
        borderRadius: '10px',
        padding: '0 8px',
        overflow: 'hidden',
        border: '1px solid var(--c-border)',
      }}
    >
      {/* Gridlines */}
      {gridLevels.map((line) => {
        const bottomPercent = fill(line) * 100;
        return (
          <div
            key={line}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${bottomPercent}%`,
              height: '1px',
              backgroundColor: 'var(--c-border)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <span
              style={{
                position: 'absolute',
                right: '8px',
                top: '-13px',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--c-text-muted)',
              }}
            >
              {line} dBm
            </span>
          </div>
        );
      })}

      {/* Trace Bars */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          width: '100%',
          height: '100%',
          zIndex: 2,
        }}
      >
        {cells.map((v, i) => {
          const age = i / slots; // 0 (oldest) to 1 (newest)
          const fillVal = v !== null ? fill(v) : 0;
          const barHeight = Math.max(v !== null ? 3 : 0, fillVal * height);
          const opacity = 0.2 + age * 0.8;

          // Color gradient from green (strong) to blue to red (weak)
          let barColor = 'var(--c-primary)';
          if (v !== null) {
            if (v >= -55) barColor = 'var(--c-success)';
            else if (v >= -72) barColor = 'var(--c-primary)';
            else if (v >= -84) barColor = 'var(--c-warning)';
            else barColor = 'var(--c-danger)';
          }

          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-end',
                height: '100%',
                padding: '0 1px',
              }}
            >
              {v !== null && (
                <div
                  style={{
                    width: '100%',
                    height: `${barHeight}px`,
                    backgroundColor: barColor,
                    opacity,
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 180ms ease-out',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

### File: `src/components/TrackMap.tsx`
```tsx
import React, { useMemo } from 'react';
import { Crumb, Estimate } from '../lib/breadcrumbs';
import { Fix } from '../lib/useDeadReckoning';

interface TrackMapProps {
  track: { x: number; y: number }[];
  crumbs: Crumb[];
  estimate: Estimate;
  fix: Fix;
  size?: number;
}

/**
 * Plan view map of the walked trail and signal peaks.
 */
export const TrackMap: React.FC<TrackMapProps> = ({
  track,
  crumbs,
  estimate,
  fix,
  size = 320,
}) => {
  // Depend on the scalars, not on `fix` / `estimate`. Both are rebuilt as
  // fresh objects five times a second, which defeated this memo entirely and
  // re-derived the transform on every tick whether or not anything moved.
  const { x: fixX, y: fixY } = fix;
  const { x: estX, y: estY } = estimate;

  const view = useMemo(() => {
    const points = [
      ...track,
      ...crumbs,
      { x: fixX, y: fixY },
      ...(crumbs.length ? [{ x: estX, y: estY }] : []),
    ];
    let minX = -2;
    let maxX = 2;
    let minY = -2;
    let maxY = 2;
    // A loop rather than Math.min(...xs): the spread form passes one argument
    // per point, which is a stack-overflow waiting to happen on a long walk.
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
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
  }, [track, crumbs, fixX, fixY, estX, estY, size]);

  const strongest = crumbs.length ? Math.max(...crumbs.map((k) => k.rssi)) : 0;
  const weakest = crumbs.length ? Math.min(...crumbs.map((k) => k.rssi)) : 0;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: `${size}px`,
        aspectRatio: '1 / 1',
        position: 'relative',
        backgroundColor: 'var(--c-surface-elevated)',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '1px solid var(--c-hairline)',
        margin: '0 auto',
      }}
    >
      {/* 4x4 Gridlines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <React.Fragment key={f}>
          <div
            style={{
              position: 'absolute',
              left: `${f * 100}%`,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: 'var(--c-hairline)',
              opacity: 0.6,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${f * 100}%`,
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: 'var(--c-hairline)',
              opacity: 0.6,
            }}
          />
        </React.Fragment>
      ))}

      {/* Faint Track History Dots */}
      {track.map((p, i) => {
        const s = view.toScreen(p);
        return (
          <div
            key={`t${i}`}
            style={{
              position: 'absolute',
              left: `${s.left - 1.5}px`,
              top: `${s.top - 1.5}px`,
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              backgroundColor: 'var(--c-text)',
              opacity: 0.12 + (i / Math.max(1, track.length)) * 0.4,
            }}
          />
        );
      })}

      {/* Amber Signal Peak Crumbs */}
      {crumbs.map((k) => {
        const s = view.toScreen(k);
        const range = Math.max(1, strongest - weakest);
        const strength = (k.rssi - weakest) / range;
        const d = 8 + strength * 14;

        return (
          <div
            key={k.id}
            title={`Peak #${k.id}: ${k.rssi.toFixed(0)} dBm`}
            style={{
              position: 'absolute',
              left: `${s.left - d / 2}px`,
              top: `${s.top - d / 2}px`,
              width: `${d}px`,
              height: `${d}px`,
              borderRadius: '50%',
              backgroundColor: 'var(--c-warning)',
              opacity: 0.25 + strength * 0.6,
              border: k.manual ? '1.5px solid var(--c-text)' : 'none',
              boxShadow: '0 0 6px rgba(255, 176, 0, 0.4)',
              transition: 'all 200ms ease-out',
            }}
          />
        );
      })}

      {/* Centroid Estimate Target Ring */}
      {crumbs.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            left: `${view.toScreen(estimate).left - 20}px`,
            top: `${view.toScreen(estimate).top - 20}px`,
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: `1px solid ${estimate.confidence === 'good' ? 'var(--c-primary)' : 'var(--c-text-muted)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 12px ${estimate.confidence === 'good' ? 'rgba(99, 230, 226, 0.3)' : 'transparent'}`,
            animation: 'pulse 2s infinite',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: estimate.confidence === 'good' ? 'var(--c-primary)' : 'var(--c-text-muted)',
            }}
          />
        </div>
      )}

      {/* User Indicator Triangle Rotated to Heading */}
      <div
        style={{
          position: 'absolute',
          left: `${view.toScreen(fix).left - 9}px`,
          top: `${view.toScreen(fix).top - 9}px`,
          width: '18px',
          height: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `rotate(${fix.heading}deg)`,
          transition: 'transform 100ms ease-out',
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '14px solid var(--c-text)',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
          }}
        />
      </div>

      {/* Scale Label */}
      <div
        style={{
          position: 'absolute',
          left: '8px',
          bottom: '6px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--c-text-muted)',
          letterSpacing: '1px',
        }}
      >
        {view.span.toFixed(0)} m across
      </div>
    </div>
  );
};
```

### File: `src/screens/SurveyScreen.tsx`
```tsx
import React, { useState, useMemo, useRef } from 'react';
import { Contact } from '../lib/useScanner';
import { ThemeMode, proximityColor } from '../lib/theme';

type Props = {
  contacts: Record<string, Contact>;
  scanning: boolean;
  error: string | null;
  notice: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onPick: (contact: Contact) => void;
};

export const SurveyScreen: React.FC<Props> = ({
  contacts,
  scanning,
  error,
  notice,
  theme,
  onToggleTheme,
  onStart,
  onStop,
  onClear,
  onPick,
}) => {
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  // Sort key per device that only moves when the signal really changes (> 6 dB), so
  // rows don't swap places under your finger as readings jitter.
  const sortScore = useRef<Map<string, number>>(new Map());

  const rows = useMemo(() => {
    let arr = Object.values(contacts);

    if (filter.trim()) {
      const q = filter.toLowerCase();
      arr = arr.filter(
        (d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'ALL') {
      arr = arr.filter((d) => {
        if (selectedCategory === 'AUDIO') return d.kind === 'Earbuds' || d.kind === 'Audio';
        if (selectedCategory === 'WEARABLE') return d.kind === 'Watch' || d.kind === 'Phone';
        if (selectedCategory === 'TRACKER') return d.kind === 'Tracker';
        return d.kind === 'Bluetooth Device' || d.kind === 'Laptop' || d.kind === 'Tablet';
      });
    }

    // Strongest first. Stale devices keep their place (they are dimmed, and dropped after
    // 25 s): phones and tags advertise slowly, so sinking them on every quiet spell made
    // rows jump about every second on a real phone.
    const scores = sortScore.current;
    for (const c of arr) {
      const prev = scores.get(c.id);
      if (prev === undefined || Math.abs(c.stats.filtered - prev) > 6) scores.set(c.id, c.stats.filtered);
    }
    return arr.sort(
      (a, b) =>
        (scores.get(b.id) ?? -127) - (scores.get(a.id) ?? -127) ||
        a.firstSeen - b.firstSeen ||
        (a.id < b.id ? -1 : 1),
    );
  }, [contacts, filter, selectedCategory]);

  const categories = [
    { id: 'ALL', label: 'All Devices' },
    { id: 'AUDIO', label: 'Earbuds & Audio' },
    { id: 'WEARABLE', label: 'Watches & Phones' },
    { id: 'TRACKER', label: 'Tags & Trackers' },
    { id: 'OTHER', label: 'Other BLE' },
  ];

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case 'Earbuds':
        return '🎧';
      case 'Audio':
        return '🔊';
      case 'Watch':
        return '⌚';
      case 'Phone':
        return '📱';
      case 'Tablet':
        return '📟';
      case 'Laptop':
        return '💻';
      case 'Tracker':
        return '🏷️';
      default:
        return '📶';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--c-bg)' }}>
      {/* Top App Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'var(--c-surface)',
          borderBottom: '1px solid var(--c-border)',
          padding: '16px',
          paddingTop: 'calc(16px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'var(--c-primary-light)',
              color: 'var(--c-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            📡
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.2 }}>
              Bluetooth Locator
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginTop: '2px' }}>
              {scanning ? 'Live Radar Scanning Active' : 'Radar Scanner Ready'}
            </p>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          aria-label="Toggle Theme"
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'var(--c-surface-elevated)',
            border: '1px solid var(--c-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            boxShadow: 'var(--shadow-sm)',
            transition: 'background-color 0.2s',
          }}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '16px', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        {/* Error / Notice Banners */}
        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              backgroundColor: 'var(--c-danger-light)',
              borderRadius: '8px',
              border: '1px solid var(--c-danger)',
              fontSize: '13px',
              color: 'var(--c-danger)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {notice && !error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              backgroundColor: 'var(--c-warning-light)',
              borderRadius: '8px',
              border: '1px solid var(--c-warning)',
              fontSize: '13px',
              color: 'var(--c-warning)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>ℹ️</span>
            <span>{notice}</span>
          </div>
        )}

        {/* Primary Scan Action Card */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '18px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Nearby Devices
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--c-text)', marginTop: '2px' }}>
                {Object.keys(contacts).length} Discovered
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {Object.keys(contacts).length > 0 && !scanning && (
                <button
                  onClick={onClear}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--c-surface-elevated)',
                    border: '1px solid var(--c-border)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--c-text-secondary)',
                  }}
                >
                  Clear List
                </button>
              )}

              <button
                onClick={scanning ? onStop : onStart}
                style={{
                  padding: '10px 22px',
                  borderRadius: '10px',
                  backgroundColor: scanning ? 'var(--c-danger)' : 'var(--c-primary)',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-md)',
                  transition: 'transform 0.1s ease',
                }}
              >
                <span className={scanning ? 'pulse-anim' : ''}>{scanning ? '⏹' : '▶'}</span>
                {scanning ? 'Stop Scanning' : 'Start Radar'}
              </button>
            </div>
          </div>
        </div>

        {/* Search and Category Filter */}
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              borderRadius: '10px',
              padding: '10px 14px',
              gap: '10px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ fontSize: '16px', color: 'var(--c-text-muted)' }}>🔍</span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by device name, brand, or MAC address..."
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                fontSize: '14px',
                color: 'var(--c-text)',
              }}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                style={{
                  fontSize: '14px',
                  color: 'var(--c-text-muted)',
                  padding: '2px 6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--c-surface-elevated)',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
            }}
          >
            {categories.map((c) => {
              const active = selectedCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: active ? 700 : 500,
                    whiteSpace: 'nowrap',
                    backgroundColor: active ? 'var(--c-primary)' : 'var(--c-surface)',
                    color: active ? '#FFFFFF' : 'var(--c-text-secondary)',
                    border: `1px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Device List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '30px' }}>
          {rows.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: 'var(--c-surface)',
                borderRadius: '14px',
                border: '1px dashed var(--c-border)',
                marginTop: '12px',
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>{scanning ? '📡' : '🔍'}</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--c-text)', marginBottom: '6px' }}>
                {scanning ? 'Listening for Bluetooth signals...' : 'No Devices in View'}
              </h3>
              <p style={{ color: 'var(--c-text-muted)', fontSize: '13px', maxWidth: '340px', margin: '0 auto', lineHeight: 1.5 }}>
                {scanning
                  ? 'Keep your phone steady or walk slowly. Nearby Bluetooth devices, headphones, and trackers will appear automatically.'
                  : 'Tap "Start Radar" to scan the room for all broadcasting Bluetooth devices.'}
              </p>
            </div>
          ) : (
            rows.map((item) => {
              const stale = item.stats.isStale;
              // Same colour rule as the hunt screen: closeness, not raw dBm
              const signalColor = proximityColor(item.stats.proximity);

              return (
                <div
                  key={item.id}
                  onClick={() => onPick(item)}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '16px 18px',
                    backgroundColor: 'var(--c-surface)',
                    borderRadius: '12px',
                    border: '1px solid var(--c-border)',
                    gap: '14px',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease, box-shadow 0.15s ease',
                    opacity: stale ? 0.6 : 1,
                  }}
                >
                  {/* Category Icon */}
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--c-surface-elevated)',
                      border: '1px solid var(--c-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      flexShrink: 0,
                    }}
                  >
                    {getKindIcon(item.kind)}
                  </div>

                  {/* Device Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: 'var(--c-text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '220px',
                        }}
                      >
                        {item.name}
                      </span>

                      {item.isGuessed && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: 'var(--c-text-muted)',
                            backgroundColor: 'var(--c-surface-elevated)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--c-border)',
                          }}
                        >
                          Auto-Identified
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {item.id}
                      </span>
                      {item.kind !== 'Bluetooth Device' && (
                        <>
                          <span style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>•</span>
                          <span style={{ fontSize: '11px', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                            {item.kind}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Proximity / Distance estimate */}
                    <div style={{ fontSize: '12px', fontWeight: 600, color: signalColor, marginTop: '4px' }}>
                      {stale
                        ? 'Not heard recently'
                        : item.stats.distanceHighM < 0.5
                        ? `${item.stats.proximity} · < 0.5 m`
                        : `${item.stats.proximity} · ≈ ${item.stats.distanceM < 10 ? item.stats.distanceM.toFixed(1) : Math.round(item.stats.distanceM)} m`}
                    </div>
                  </div>

                  {/* Signal Strength Badge */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: signalColor,
                      }}
                    >
                      {Math.round(item.stats.filtered)}{' '}
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--c-text-muted)' }}>dBm</span>
                    </div>

                    {/* Mini Signal Meter Bar */}
                    <div
                      style={{
                        width: '56px',
                        height: '6px',
                        backgroundColor: 'var(--c-surface-elevated)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${item.stats.percentage}%`,
                          backgroundColor: signalColor,
                          borderRadius: '3px',
                          transition: 'width 250ms ease-out',
                        }}
                      />
                    </div>

                    <span style={{ fontSize: '10px', color: 'var(--c-text-muted)' }}>
                      {item.stats.percentage}%
                    </span>
                  </div>

                  {/* Navigation Arrow */}
                  <div style={{ fontSize: '18px', color: 'var(--c-text-muted)', paddingLeft: '4px' }}>
                    ›
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};
```

### File: `src/screens/HuntScreen.tsx`
```tsx
import React, { useState, useEffect } from 'react';
import { Contact } from '../lib/useScanner';
import { useClicker } from '../lib/useClicker';
import { useTrail } from '../lib/useTrail';
import { SignalStats, SearchMode, DEFAULT_REF_POWER } from '../lib/signal';
import { Tape } from '../components/Tape';
import { TrackMap } from '../components/TrackMap';
import { relativeBearing, distanceTo, steer } from '../lib/breadcrumbs';
import { ThemeMode, proximityColor } from '../lib/theme';

type Props = {
  contact: Contact;
  scanning: boolean;
  onBack: () => void;
  onCalibrate: () => number | null;
  followNote: string | null;
  onDismissNote: () => void;
  searchMode: SearchMode;
  onSearchModeChange: (m: SearchMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export const HuntScreen: React.FC<Props> = ({
  contact,
  scanning,
  onBack,
  onCalibrate,
  followNote,
  onDismissNote,
  searchMode,
  onSearchModeChange,
  theme,
  onToggleTheme,
}) => {
  const { stats, name, kind, id } = contact;
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [calibrationNote, setCalibrationNote] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Re-render once a second so "x s ago" labels stay honest between packets
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Audio / Haptic feedback engine
  // Cadence follows closeness, not raw dBm: shift by this device's 1 m reference so a
  // quiet tag at arm's length clicks like a loud phone at arm's length.
  useClicker({
    rssi: stats.filtered - (stats.refPower - DEFAULT_REF_POWER),
    active: !stats.isStale && (audioEnabled || hapticsEnabled),
    sound: audioEnabled,
    haptics: hapticsEnabled,
    trend: stats.trend,
    confidence: stats.confidence,
  });

  // Dead reckoning sensors (steps + compass orientation)
  const {
    quality,
    fix,
    requestAccess,
    permission,
    calibrateStride,
    stride,
    crumbs,
    track,
    estimate,
    dropManual,
    clear: clearTrail,
  } = useTrail({
    rssi: stats.isStale ? null : stats.filtered,
    refPower: stats.refPower, // lets each mark's distance ring use calibration
    active: true,
    stride: 0.75,
  });

  useEffect(() => {
    if (permission === 'prompt') requestAccess();
  }, [permission, requestAccess]);

  const belowPeak = stats.peakRssi - stats.filtered;
  const peakAgoS = Math.max(0, Math.round((Date.now() - stats.peakAt) / 1000));

  const getAssistantGuidance = (stats: SignalStats) => {
    if (!scanning) {
      return 'Scanning is stopped. Go back and tap "Start Radar" to resume live readings.';
    }
    if (stats.isStale) {
      return 'No packets for a few seconds. The device may be off, out of range, or shielded (metal, water, a body). Go back to where the signal was last strongest.';
    }
    if (stats.confidence === 'LOW' && stats.trend === 'UNCERTAIN') {
      return 'Collecting readings. Hold the phone still for a moment, then walk slowly in one direction.';
    }
    if (stats.proximity === 'VERY CLOSE') {
      return "🎯 Within arm's reach. Look down, under, behind and inside things: cushions, bags, pockets, drawers. Switch to Precision mode.";
    }
    if (stats.confidence === 'LOW') {
      return 'Signal is noisy. Hold the phone out in front of you, not in a pocket or against your body (a body can block about 10 dB), and move slowly.';
    }
    if (belowPeak >= 8 && stats.peakAt > 0) {
      return `↩ You are ${Math.round(belowPeak)} dB below the strongest reading (${peakAgoS}s ago). Retrace your steps to where it peaked, then try a different direction.`;
    }
    if (stats.trend === 'GETTING WARMER') {
      return '🔥 Getting warmer. Keep going the same way, slowly.';
    }
    if (stats.trend === 'GETTING COLDER') {
      return '❄️ Getting colder. Turn around, or try 90° left or right.';
    }
    if (stats.proximity === 'NEARBY') {
      return 'A few steps away. Sweep the surfaces around you slowly; pause 2 s at each spot.';
    }
    if (stats.proximity === 'MID RANGE') {
      return "Same room or next door. Walk the room's perimeter and watch the tape for a rise.";
    }
    return 'Far or behind cover. Try the next room, and keep the phone away from your body.';
  };

  const distanceSourceLabel =
    stats.refSource === 'calibrated'
      ? 'calibrated for this device'
      : stats.refSource === 'advertised'
      ? "from the device's broadcast power"
      : 'rough estimate: calibrate for accuracy';

  const handleCalibrate = () => {
    if (stats.isStale) {
      setCalibrationNote('Wait until the signal is live before calibrating.');
      return;
    }
    const ok = window.confirm(
      'Calibrate distance\n\nPlace the phone exactly 1 metre from the device, with nothing in between, and hold still for 3 seconds. Then tap OK.',
    );
    if (!ok) return;
    const ref = onCalibrate();
    setCalibrationNote(
      ref === null ? 'Calibration failed: no signal yet.' : `Saved: ${ref} dBm at 1 m. Distances for this device are now calibrated.`,
    );
  };

  const steering =
    crumbs.length >= 2 ? steer(relativeBearing(fix, estimate), distanceTo(fix, estimate)) : null;

  // Colour follows the distance estimate (which knows this device's 1 m power), so the
  // colour and the proximity label never disagree.
  const signalColor = proximityColor(stats.proximity);

  const MODES: { value: SearchMode; label: string; desc: string }[] = [
    { value: 'QUICK_SEARCH', label: 'Quick Scout', desc: 'Fast reaction' },
    { value: 'ROOM_SWEEP', label: 'Room Sweep', desc: 'Balanced & stable' },
    { value: 'FINAL_1_METER', label: 'Precision', desc: 'Under 1 meter' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--c-bg)' }}>
      {/* Top App Bar with Navigation */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'var(--c-surface)',
          borderBottom: '1px solid var(--c-border)',
          padding: '12px 16px',
          paddingTop: 'calc(12px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: 'var(--c-surface-elevated)',
            border: '1px solid var(--c-border)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--c-text)',
          }}
        >
          <span>←</span>
          <span>Back to Devices</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Audio Clicker Toggle */}
          <button
            onClick={() => setAudioEnabled((v) => !v)}
            title={audioEnabled ? 'Audio Clicker On' : 'Audio Clicker Muted'}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: audioEnabled ? 'var(--c-primary-light)' : 'var(--c-surface-elevated)',
              border: `1px solid ${audioEnabled ? 'var(--c-primary)' : 'var(--c-border)'}`,
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {audioEnabled ? '🔊' : '🔇'}
          </button>

          {/* Haptics Toggle */}
          <button
            onClick={() => setHapticsEnabled((v) => !v)}
            title={hapticsEnabled ? 'Haptic Vibrations On' : 'Haptics Off'}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: hapticsEnabled ? 'var(--c-primary-light)' : 'var(--c-surface-elevated)',
              border: `1px solid ${hapticsEnabled ? 'var(--c-primary)' : 'var(--c-border)'}`,
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            📳
          </button>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            title="Toggle Light/Dark Theme"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: 'var(--c-surface-elevated)',
              border: '1px solid var(--c-border)',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '16px', maxWidth: '720px', width: '100%', margin: '0 auto' }}>
        {followNote && (
          <div
            onClick={onDismissNote}
            role="button"
            style={{
              marginBottom: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: 'var(--c-primary-light)',
              border: '1px solid var(--c-primary)',
              color: 'var(--c-text)',
              fontSize: '13px',
            }}
          >
            🔁 {followNote} <span style={{ color: 'var(--c-text-muted)' }}>(tap to dismiss)</span>
          </div>
        )}

        {/* Target Header Card */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--c-text)' }}>
                {name}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--c-text-muted)' }}>
                {id}
              </span>
              {kind !== 'Bluetooth Device' && (
                <>
                  <span style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>•</span>
                  <span style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>{kind}</span>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: stats.isStale ? 'var(--c-danger-light)' : 'var(--c-success-light)',
              color: stats.isStale ? 'var(--c-danger)' : 'var(--c-success)',
              border: `1px solid ${stats.isStale ? 'var(--c-danger)' : 'var(--c-success)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '10px' }}>●</span>
            {stats.isStale ? 'SIGNAL STALE' : 'LIVE TRACKING'}
          </div>
        </div>

        {/* Search Mode Segmented Control */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            backgroundColor: 'var(--c-surface-elevated)',
            border: '1px solid var(--c-border)',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '16px',
            gap: '4px',
          }}
        >
          {MODES.map((m) => {
            const active = searchMode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => onSearchModeChange(m.value)}
                style={{
                  padding: '10px 4px',
                  borderRadius: '8px',
                  backgroundColor: active ? 'var(--c-surface)' : 'transparent',
                  color: active ? 'var(--c-primary)' : 'var(--c-text-secondary)',
                  fontWeight: active ? 700 : 500,
                  fontSize: '12px',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                }}
              >
                <div>{m.label}</div>
              </button>
            );
          })}
        </div>

        {/* Primary Proximity Radar Card */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: `2px solid ${stats.isStale ? 'var(--c-danger)' : signalColor}`,
            borderRadius: '18px',
            padding: '24px 20px',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            marginBottom: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Animated Radar Halo */}
          <div
            className={!stats.isStale ? 'halo-anim' : ''}
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              backgroundColor: signalColor,
              opacity: 0.08,
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1px', color: 'var(--c-text-muted)', textTransform: 'uppercase' }}>
            Current Proximity
          </div>

          <div
            style={{
              fontSize: '34px',
              fontWeight: 900,
              color: stats.isStale ? 'var(--c-danger)' : signalColor,
              letterSpacing: '0.5px',
              margin: '8px 0 4px',
            }}
          >
            {stats.isStale ? 'SIGNAL LOST' : stats.proximity === 'UNKNOWN' ? 'LISTENING…' : stats.proximity}
          </div>

          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--c-text)', position: 'relative' }}>
            {stats.isStale ? 'Distance unknown' : stats.approxDistance}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '4px 0 16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <span style={{ fontSize: '12px', color: stats.refSource === 'default' ? 'var(--c-warning)' : 'var(--c-text-muted)' }}>
              {distanceSourceLabel}
            </span>
            <button
              onClick={handleCalibrate}
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--c-primary)',
                padding: '4px 10px',
                borderRadius: '14px',
                border: '1px solid var(--c-primary)',
                backgroundColor: 'var(--c-primary-light)',
              }}
            >
              📏 Calibrate at 1 m
            </button>
          </div>
          {calibrationNote && (
            <div style={{ fontSize: '12px', color: 'var(--c-text-secondary)', marginTop: '-8px', marginBottom: '12px' }}>
              {calibrationNote}
            </div>
          )}

          {/* Trend Indicator Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '30px',
              backgroundColor:
                stats.trend === 'GETTING WARMER'
                  ? 'var(--c-success-light)'
                  : stats.trend === 'GETTING COLDER'
                  ? 'var(--c-danger-light)'
                  : 'var(--c-surface-elevated)',
              color:
                stats.trend === 'GETTING WARMER'
                  ? 'var(--c-success)'
                  : stats.trend === 'GETTING COLDER'
                  ? 'var(--c-danger)'
                  : 'var(--c-text-secondary)',
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.5px',
              marginBottom: '20px',
              border: '1px solid var(--c-border)',
            }}
          >
            <span>
              {stats.isStale
                ? '⚪ SIGNAL LOST'
                : stats.trend === 'GETTING WARMER'
                ? `🟢 ↑ GETTING WARMER  +${stats.delta.toFixed(0)} dB`
                : stats.trend === 'GETTING COLDER'
                ? `🔴 ↓ GETTING COLDER  ${stats.delta.toFixed(0)} dB`
                : stats.trend === 'STABLE'
                ? '🟡 → SIGNAL STEADY'
                : '⏳ READING SIGNAL…'}
            </span>
          </div>

          {/* High Precision Signal Meter Bar */}
          <div style={{ width: '100%', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              <span>Far</span>
              <span>Arm's reach</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '14px',
                backgroundColor: 'var(--c-surface-elevated)',
                borderRadius: '7px',
                overflow: 'hidden',
                border: '1px solid var(--c-border)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${stats.percentage}%`,
                  backgroundColor: signalColor,
                  borderRadius: '7px',
                  transition: 'width 200ms ease-out',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-text)' }}>
                Closeness: {stats.percentage}%
              </span>
              <span style={{ fontSize: '15px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: signalColor }}>
                {Math.round(stats.filtered)} dBm
              </span>
            </div>
          </div>

          {/* Contextual Smart Guidance Box */}
          <div
            style={{
              width: '100%',
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--c-surface-elevated)',
              border: '1px solid var(--c-border)',
              fontSize: '13px',
              color: 'var(--c-text)',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {getAssistantGuidance(stats)}
          </div>
        </div>

        {/* Live Signal History Tape Graph */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Live Signal Progression (10s)
            </span>
            <span style={{ fontSize: '11px', color: belowPeak >= 8 ? 'var(--c-warning)' : 'var(--c-text-muted)' }}>
              Best: {Math.round(stats.peakRssi)} dBm · {peakAgoS}s ago
            </span>
          </div>

          <Tape history={stats.history} height={120} />
        </div>

        {/* Trail: walked path + automatic peak marks -> triangulated estimate */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Trail · {crumbs.length} mark{crumbs.length === 1 ? '' : 's'} · {fix.steps} steps
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: quality === 'GOOD' ? 'var(--c-success)' : 'var(--c-warning)' }}>
              Sensors {quality.toLowerCase()}
            </span>
          </div>

          {steering && (
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--c-primary)', textAlign: 'center', margin: '6px 0 4px' }}>
              {steering}
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--c-text-secondary)', textAlign: 'center', marginBottom: '10px', lineHeight: 1.4 }}>
            {quality === 'UNAVAILABLE'
              ? 'Motion sensors are not reporting, so the trail cannot be drawn. The meter above still works.'
              : estimate.note}
          </div>

          <TrackMap track={track} crumbs={crumbs} estimate={estimate} fix={fix} size={300} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={dropManual}
              disabled={stats.isStale}
              style={{
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: 'var(--c-primary)',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '13px',
                opacity: stats.isStale ? 0.5 : 1,
              }}
            >
              📍 Mark reading here
            </button>
            <button
              onClick={clearTrail}
              style={{
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: 'var(--c-surface-elevated)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-text)',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              ↺ Reset trail
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--c-text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
            Hold the phone in front of you and walk a wide loop. Marks drop automatically at each signal peak; three or
            more from different spots give a direction.
          </div>
        </div>

        {/* Collapsible Diagnostics & Dead Reckoning */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '30px',
          }}
        >
          <button
            onClick={() => setShowDiagnostics((v) => !v)}
            style={{
              width: '100%',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--c-surface-elevated)',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--c-text)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚙️</span>
              <span>Sensors & Expert Diagnostics</span>
            </div>
            <span>{showDiagnostics ? '▲ Hide' : '▼ View'}</span>
          </button>

          {showDiagnostics && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
              {/* Sensors Status */}
              <div>
                <div style={{ fontWeight: 700, color: 'var(--c-text-muted)', marginBottom: '8px' }}>
                  MOTION & SENSOR STATUS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Quality:{' '}
                    <strong style={{ color: quality === 'GOOD' ? 'var(--c-success)' : 'var(--c-warning)' }}>
                      {quality}
                    </strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Steps Counted: <strong>{fix.steps}</strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Compass Heading: <strong>{Math.round(fix.heading)}°</strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Stride: <strong>{stride.toFixed(2)} m</strong>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const walked = parseFloat(window.prompt('Enter exact meters walked in a straight line:') || '0');
                    if (walked > 0) calibrateStride(walked, fix.steps);
                  }}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--c-surface-elevated)',
                    border: '1px solid var(--c-border)',
                    fontWeight: 600,
                    color: 'var(--c-primary)',
                  }}
                >
                  Calibrate Stride Length
                </button>
              </div>

              {/* Radio Stats */}
              <div>
                <div style={{ fontWeight: 700, color: 'var(--c-text-muted)', marginBottom: '8px' }}>
                  RADIO METRICS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontFamily: 'var(--font-mono)' }}>
                  <div>Raw RSSI: {stats.raw} dBm</div>
                  <div>Filtered: {Math.round(stats.filtered)} dBm</div>
                  <div>Noise σ: {Math.sqrt(stats.variance).toFixed(1)} dB</div>
                  <div>Rate: {stats.packetsPerSec.toFixed(1)} pkts/s</div>
                  <div>Confidence: {stats.confidence}</div>
                  <div>Slope: {stats.velocity.toFixed(2)} dB/s</div>
                  <div>1 m ref: {Math.round(stats.refPower)} dBm ({stats.refSource})</div>
                  <div>Last Packet: {((Date.now() - stats.lastSeen) / 1000).toFixed(1)}s ago</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
```

### File: `src/lib/bluetoothService.ts`
```typescript
import { Capacitor } from '@capacitor/core';
import { BleClient, ScanMode, ScanResult } from '@capacitor-community/bluetooth-le';
import { extractReferencePower, refreshBondedDevices, resolveDeviceIdentity } from './nameResolver';

export type BluetoothDeviceRaw = {
  id: string;
  name: string;
  kind: string;
  rssi: number;
  txPower?: number;
  /** Expected RSSI at 1 m, from iBeacon / Eddystone / TX Power Level if advertised. */
  refPower?: number;
  isGuessed: boolean;
};

export type ScanCallback = (device: BluetoothDeviceRaw) => void;

let isNativeInitialized = false;

const SCAN_REFRESH_MS = 20000; // routine restart
const SCAN_SILENCE_MS = 4000; // nothing from any device this long -> restart early
const SCAN_MIN_GAP_MS = 8000; // keeps starts under Android's 5-per-30-s limit

export const bluetoothService = {
  async init(): Promise<void> {
    if (Capacitor.isNativePlatform() && !isNativeInitialized) {
      try {
        await BleClient.initialize();
        isNativeInitialized = true;
      } catch (err) {
        console.error('Failed to initialize native BleClient:', err);
        throw new Error('Bluetooth permission was denied or Bluetooth is off.');
      }
    }
  },

  async checkPrerequisites(): Promise<{ locationOk: boolean; bluetoothOk: boolean }> {
    if (!Capacitor.isNativePlatform()) {
      return { locationOk: true, bluetoothOk: true };
    }

    await this.init();

    let bluetoothOk = true;
    let locationOk = true;

    try {
      bluetoothOk = await BleClient.isEnabled();
      if (!bluetoothOk) {
        await BleClient.requestEnable();
        bluetoothOk = await BleClient.isEnabled();
      }
    } catch (e) {
      console.warn('Could not check Bluetooth state:', e);
    }

    try {
      locationOk = await BleClient.isLocationEnabled();
    } catch (e) {
      console.warn('Could not check Location state:', e);
    }

    return { locationOk, bluetoothOk };
  },

  async openLocationSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await BleClient.openLocationSettings();
    }
  },

  async startScan(onResult: ScanCallback): Promise<() => void> {
    await this.init();

    if (Capacitor.isNativePlatform()) {
      // 1. Refresh Android system bonded/paired devices to pre-fill names
      await refreshBondedDevices();

      // 2. Verify Android system location is on (essential on Android 12+ for BLE scanning)
      const locEnabled = await BleClient.isLocationEnabled();
      if (!locEnabled) {
        console.warn('Android location service is off. Some BLE devices may not be detected.');
      }

      // 3. Highest duty-cycle scan with every duplicate packet reported. BALANCED (the
      //    default) delivers a fraction of the packets, which starves the filter.
      let lastResultAt = Date.now();
      const onScan = (result: ScanResult) => {
        // 127 means "not available" on Android; a missing RSSI is not -100 dBm.
        if (typeof result.rssi !== 'number' || result.rssi >= 0) return;
        lastResultAt = Date.now(); // only usable packets count as "the scan is alive"
        const { name, kind, isGuessed } = resolveDeviceIdentity(result);
        onResult({
          id: result.device.deviceId,
          name,
          kind,
          rssi: result.rssi,
          txPower: result.txPower ?? undefined,
          refPower: extractReferencePower(result),
          isGuessed,
        });
      };
      const begin = () =>
        BleClient.requestLEScan({ allowDuplicates: true, scanMode: ScanMode.SCAN_MODE_LOW_LATENCY }, onScan);
      await begin();
      let startedAt = Date.now();

      // Measured on a Pixel 8 Pro: one long continuous scan goes quietly deaf within
      // minutes (18 devices -> 1, and the hunted target reads SIGNAL LOST) while Android
      // still reports it as running. Restarting brings everything back at once. Every
      // 20 s stays well under Android's limit of 5 scan starts per 30 s, and also
      // avoids the 30-minute downgrade to opportunistic scanning. If nothing at all has
      // been heard for 4 s the scan is probably deaf, so restart early (at most every 8 s).
      let stopped = false;
      let restarting = false;
      const refresh = window.setInterval(async () => {
        if (stopped || restarting) return;
        const now = Date.now();
        const sinceStart = now - startedAt;
        const deaf = now - lastResultAt >= SCAN_SILENCE_MS && sinceStart >= SCAN_MIN_GAP_MS;
        if (sinceStart < SCAN_REFRESH_MS && !deaf) return;
        restarting = true;
        try {
          await BleClient.stopLEScan();
          if (!stopped) await begin();
          startedAt = Date.now();
          // stop() may have run while begin() was in flight
          if (stopped) await BleClient.stopLEScan();
        } catch (err) {
          console.warn('BLE scan refresh failed', err);
        } finally {
          restarting = false;
        }
      }, 1000);

      return () => {
        stopped = true;
        window.clearInterval(refresh);
        BleClient.stopLEScan().catch(console.error);
      };
    } else {
      // Web Bluetooth fallback
      const bt = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined;
      if (!bt) {
        throw new Error('Web Bluetooth is not supported in this browser.');
      }

      if (typeof bt.requestLEScan === 'function') {
        const listener = (ev: any) => {
          if (typeof ev.rssi !== 'number') return;
          const name = (ev.name ?? ev.device?.name ?? `BLE Device [${ev.device.id.slice(-4)}]`).trim();
          onResult({
            id: ev.device.id,
            name,
            kind: 'Bluetooth Device',
            rssi: ev.rssi,
            txPower: ev.txPower,
            isGuessed: !ev.name && !ev.device?.name,
          });
        };
        bt.addEventListener('advertisementreceived', listener);
        const scanHandle = await bt.requestLEScan({
          acceptAllAdvertisements: true,
          keepRepeatedDevices: true,
        });

        return () => {
          scanHandle.stop();
          bt.removeEventListener('advertisementreceived', listener);
        };
      } else {
        const device = await bt.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['battery_service', 'device_information'],
        });

        if (typeof device.watchAdvertisements !== 'function') {
          throw new Error('This browser does not support watchAdvertisements.');
        }

        const listener = (ev: any) => {
          if (typeof ev.rssi !== 'number') return;
          const name = (ev.name ?? device.name ?? `BLE Device [${device.id.slice(-4)}]`).trim();
          onResult({
            id: device.id,
            name,
            kind: 'Bluetooth Device',
            rssi: ev.rssi,
            txPower: ev.txPower,
            isGuessed: !ev.name && !device.name,
          });
        };
        device.addEventListener('advertisementreceived', listener);

        const ac = new AbortController();
        await device.watchAdvertisements({ signal: ac.signal });

        return () => {
          ac.abort();
          device.removeEventListener('advertisementreceived', listener);
        };
      }
    }
  },
};
```

### File: `src/lib/breadcrumbs.ts`
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
  /** Expected RSSI at 1 m for the hunted device when this mark dropped. */
  ref?: number;
  at: number;
  manual: boolean;
};

const PEAK_DROPOFF_DB = 4;   // how far below the peak before we call it a peak
const PEAK_MIN_MOVE_M = 0.6; // and how far you must have moved since

export type PeakState = { x: number; y: number; rssi: number } | null;

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
 */
export function centroid(crumbs: Crumb[]): { x: number; y: number } {
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
  return { x: wx / sum, y: wy / sum };
}

/**
 * Below this spread across their main line (m) the marks are effectively on one line,
 * where distance rings meet in two mirror-image places. Chosen with npm run sim:trail:
 * the lowest value that never did worse than the centroid in any scenario or seed.
 */
const MULTILATERATION_MIN_SPREAD_M = 0.2;

/** Where the target most likely is: multilateration when the marks' geometry allows it. */
export function locate(crumbs: Crumb[]): { x: number; y: number } {
  if (crumbs.length >= 3 && crossSpread(crumbs) >= MULTILATERATION_MIN_SPREAD_M) return multilaterate(crumbs);
  return centroid(crumbs);
}

export function estimate(crumbs: Crumb[]): Estimate {
  if (crumbs.length === 0) {
    return { x: 0, y: 0, spread: 0, confidence: 'none', note: 'Walk a loop. Marks drop on their own at every signal peak.' };
  }

  const { x, y } = locate(crumbs);

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

/** Turn a relative bearing into a sentence. */
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

/**
 * Least-squares circle intersection: each mark implies a distance ring (log-distance
 * model, exponent 2.5), and the target is the point that best fits all rings. Weighted
 * by 1/d² because the distance error grows with distance. Gauss-Newton from the centroid.
 */
export function multilaterate(crumbs: Crumb[], n = 2.5): { x: number; y: number } {
  const start = centroid(crumbs);
  const rings = crumbs.map((c) => {
    const d = Math.min(15, Math.max(0.3, Math.pow(10, ((c.ref ?? -59) - c.rssi) / (10 * n))));
    return { x: c.x, y: c.y, d, w: 1 / (d * d) };
  });
  let x = start.x;
  let y = start.y;
  for (let iter = 0; iter < 40; iter++) {
    let a11 = 1e-3, a12 = 0, a22 = 1e-3, b1 = 0, b2 = 0;
    for (const r of rings) {
      const dx = x - r.x;
      const dy = y - r.y;
      const dist = Math.max(1e-6, Math.hypot(dx, dy));
      const res = dist - r.d;
      const jx = dx / dist;
      const jy = dy / dist;
      a11 += r.w * jx * jx;
      a12 += r.w * jx * jy;
      a22 += r.w * jy * jy;
      b1 += r.w * jx * res;
      b2 += r.w * jy * res;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-12) break;
    const sx = (a22 * b1 - a12 * b2) / det;
    const sy = (a11 * b2 - a12 * b1) / det;
    x -= sx;
    y -= sy;
    if (Math.hypot(sx, sy) < 1e-4) break;
  }
  return { x, y };
}

/**
 * How far the marks spread across their main line (m): the standard deviation along
 * the minor axis of their positions. Near 0 means they lie on one line, where distance
 * rings intersect in two mirror-image places and multilateration can pick the wrong one.
 */
export function crossSpread(crumbs: Crumb[]): number {
  if (crumbs.length < 2) return 0;
  const mx = crumbs.reduce((s, c) => s + c.x, 0) / crumbs.length;
  const my = crumbs.reduce((s, c) => s + c.y, 0) / crumbs.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const c of crumbs) {
    sxx += (c.x - mx) ** 2;
    syy += (c.y - my) ** 2;
    sxy += (c.x - mx) * (c.y - my);
  }
  sxx /= crumbs.length;
  syy /= crumbs.length;
  sxy /= crumbs.length;
  const minor = (sxx + syy) / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  return Math.sqrt(Math.max(0, minor));
}
```

### File: `src/lib/clickInterval.ts`
```typescript
export function clickIntervalMs(rssi: number): number {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const t = clamp((rssi + 90) / 40, 0, 1); // -90 -> 0, -50 -> 1
  return Math.round(1000 * Math.pow(70 / 1000, t)); // 1000ms -> 70ms, geometric
}
```

### File: `src/lib/nameResolver.ts`
```typescript
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Bluetooth SIG Company Identifier Codes
const COMPANY_NAMES: Record<number, string> = {
  0x004c: 'Apple',
  0x0075: 'Samsung',
  0x00e0: 'Google',
  0x0006: 'Microsoft',
  0x002d: 'Sony',
  0x009e: 'Bose',
  0x0157: 'Anker Soundcore',
  0x0087: 'Garmin',
  0x038f: 'Xiaomi',
  0x01d6: 'Huawei',
  0x027d: 'Huawei',
  0x0382: 'Tile',
  0x0822: 'OnePlus',
  0x08f0: 'Nothing',
  0x000a: 'Qualcomm',
  0x0059: 'Nordic Semi',
  0x000d: 'Texas Instruments',
  0x0171: 'Amazon',
  0x02a1: 'Espressif (ESP32)',
  0x02e5: 'Sennheiser',
  0x0312: 'JBL / Harman',
  0x01ab: 'Fitbit',
  0x006b: 'Polar',
  0x0499: 'Ruuvi',
  0x0008: 'Motorola',
  0x0001: 'Nokia',
  0x0002: 'Intel',
  0x0030: 'STMicroelectronics',
  0x0046: 'MediaTek',
  0x005d: 'Realtek',
  0x00b5: 'Swirl Networks',
  0x0131: 'Cypress Semi',
};

// Well-known 16-bit BLE service UUIDs (SIG-assigned), with the device kind they imply
const SERVICE_NAMES: Record<string, { label: string; kind: string }> = {
  'fe2c': { label: 'Google Fast Pair Device', kind: 'Earbuds' },
  'fef3': { label: 'Google Device', kind: 'Bluetooth Device' },
  'fe9f': { label: 'Google Home / Nest', kind: 'Audio' },
  'fd5a': { label: 'Samsung SmartTag', kind: 'Tracker' },
  'fd69': { label: 'Samsung Find Device', kind: 'Tracker' },
  'feed': { label: 'Tile Tracker', kind: 'Tracker' },
  'feec': { label: 'Tile Tracker', kind: 'Tracker' },
  'fe03': { label: 'Amazon Echo / Alexa Device', kind: 'Audio' },
  'fe07': { label: 'Sonos Speaker', kind: 'Audio' },
  'fe95': { label: 'Xiaomi Device', kind: 'Bluetooth Device' },
  'fe59': { label: 'Nordic DFU Device', kind: 'Bluetooth Device' },
  '184e': { label: 'LE Audio Device', kind: 'Earbuds' },
  '1850': { label: 'LE Audio Device', kind: 'Earbuds' },
  '180d': { label: 'Heart Rate Monitor', kind: 'Watch' },
  '1812': { label: 'Wireless Mouse / Keyboard', kind: 'Bluetooth Device' },
  'fee0': { label: 'Mi Smart Band', kind: 'Watch' },
  'fee7': { label: 'Tencent / WeChat BLE', kind: 'Bluetooth Device' },
  'feaa': { label: 'Eddystone Beacon', kind: 'Tracker' },
  '1802': { label: 'Proximity Alert Tag', kind: 'Tracker' },
  '1803': { label: 'Link Loss Tag', kind: 'Tracker' },
  'fd6f': { label: 'Exposure Notification Phone', kind: 'Phone' },
  '180f': { label: 'Battery Service Device', kind: 'Bluetooth Device' },
  '180a': { label: 'Device Information Sensor', kind: 'Bluetooth Device' },
};

// Runtime cache of resolved device names by device ID (MAC)
const nameCache = new Map<string, string>();
const kindCache = new Map<string, string>();
const bondedDevicesCache = new Map<string, string>();

let bondedFetched = false;

/**
 * Fetch and cache Android system paired/bonded devices.
 */
export async function refreshBondedDevices(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const bonded = await BleClient.getBondedDevices();
    if (bonded && Array.isArray(bonded)) {
      for (const d of bonded) {
        if (d.name && d.name.trim().length > 0) {
          bondedDevicesCache.set(d.deviceId.toUpperCase(), d.name.trim());
          nameCache.set(d.deviceId.toUpperCase(), d.name.trim());
        }
      }
    }
    bondedFetched = true;
  } catch (err) {
    console.warn('Could not fetch bonded devices:', err);
  }
}

/**
 * Format a MAC address into a compact identifier like "[A4:8F]"
 */
export function formatMacShort(id: string): string {
  const clean = id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length >= 4) {
    const end = clean.slice(-4);
    return `[${end.slice(0, 2)}:${end.slice(2)}]`;
  }
  return `[${id.slice(-4)}]`;
}

/**
 * Parse company ID from manufacturerData object
 */
function extractCompanyId(manufacturerData?: Record<string, DataView>): number | null {
  if (!manufacturerData) return null;
  const keys = Object.keys(manufacturerData);
  if (keys.length === 0) return null;

  for (const key of keys) {
    // Key could be decimal string "76" or hex "0x004c"
    const parsed = key.startsWith('0x') ? parseInt(key, 16) : parseInt(key, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * Apple Continuity: the payload is a sequence of (type, length, value) records.
 * Walk all of them and keep the most specific. Order = priority.
 */
const APPLE_TYPES: [number, string, string][] = [
  [0x12, 'Apple Find My (AirTag or lost Apple device)', 'Tracker'],
  [0x07, 'Apple AirPods / Beats', 'Earbuds'],
  [0x02, 'Apple iBeacon', 'Tracker'],
  [0x0b, 'Apple Watch', 'Watch'],
  [0x09, 'Apple TV / HomePod (AirPlay)', 'Audio'],
  [0x06, 'Apple HomeKit Accessory', 'Bluetooth Device'],
  [0x0c, 'Apple iPhone / iPad / Mac', 'Phone'],
  [0x10, 'Apple iPhone / iPad / Mac', 'Phone'],
  [0x0f, 'Apple iPhone / iPad', 'Phone'],
  [0x05, 'Apple iPhone / iPad / Mac', 'Phone'],
];

function decodeApplePayload(data?: DataView): { name: string; kind: string } | null {
  if (!data || data.byteLength < 2) return null;
  const seen = new Set<number>();
  try {
    let i = 0;
    while (i + 1 < data.byteLength) {
      const type = data.getUint8(i);
      const len = data.getUint8(i + 1);
      seen.add(type);
      i += 2 + len;
    }
  } catch {
    // truncated record; use what we parsed
  }
  for (const [type, name, kind] of APPLE_TYPES) {
    if (seen.has(type)) return { name, kind };
  }
  return { name: 'Apple Device', kind: 'Bluetooth Device' };
}

/** Samsung's own sub-types aren't documented; don't guess the product. */
function decodeSamsungPayload(data?: DataView): { name: string; kind: string } | null {
  if (!data || data.byteLength < 1) return null;
  return { name: 'Samsung Galaxy Device', kind: 'Bluetooth Device' };
}

const MICROSOFT_CDP_TYPES: Record<number, [string, string]> = {
  1: ['Xbox', 'Bluetooth Device'],
  6: ['iPhone (Microsoft Phone Link)', 'Phone'],
  7: ['iPad (Microsoft Phone Link)', 'Tablet'],
  8: ['Android Phone (Phone Link)', 'Phone'],
  9: ['Windows Desktop PC', 'Laptop'],
  11: ['Windows Phone', 'Phone'],
  12: ['Linux PC', 'Laptop'],
  13: ['Windows IoT Device', 'Bluetooth Device'],
  14: ['Surface Hub', 'Laptop'],
  15: ['Windows Laptop', 'Laptop'],
  16: ['Windows Tablet', 'Tablet'],
};

/**
 * Microsoft: 0x01 = Connected Devices Platform beacon (device type in the low bits of
 * byte 1); 0x03 = Swift Pair, which carries the accessory's display name.
 */
function decodeMicrosoftPayload(data?: DataView): { name: string; kind: string; real?: boolean } | null {
  if (!data || data.byteLength < 2) return null;
  try {
    const scenario = data.getUint8(0);
    if (scenario === 0x01) {
      const t = MICROSOFT_CDP_TYPES[data.getUint8(1) & 0x1f];
      if (t) return { name: t[0], kind: t[1] };
    }
    if (scenario === 0x03 && data.byteLength > 3) {
      const sub = data.getUint8(1);
      const start = sub === 0x01 ? 6 : 3; // 0x01 carries a 3-byte class-of-device first
      const bytes = new Uint8Array(data.buffer, data.byteOffset + start, Math.max(0, data.byteLength - start));
      const name = new TextDecoder().decode(bytes).replace(/\0+$/, '').trim();
      if (name.length >= 2 && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(name)) {
        return { name, kind: classifyDeviceKind(name), real: true };
      }
    }
  } catch {
    // malformed
  }
  return null;
}

/**
 * Determine high-level category of device
 */
export function classifyDeviceKind(name: string | null): string {
  const n = (name ?? '').toLowerCase();
  if (/airpod|buds|headphone|earphone|wh-|wf-|beats|soundcore|tune|freebuds|shokz|headset/.test(n)) {
    return 'Earbuds';
  }
  if (/watch|band|fit|garmin|polar|tracker|mi smart|galaxy watch|apple watch/.test(n)) {
    return 'Watch';
  }
  if (/phone|iphone|galaxy|pixel|redmi|oneplus|xperia|xiaomi/.test(n)) {
    return 'Phone';
  }
  if (/ipad|tablet|tab\b|surface/.test(n)) {
    return 'Tablet';
  }
  if (/macbook|laptop|thinkpad|dell|pc|desktop/.test(n)) {
    return 'Laptop';
  }
  if (/airtag|smarttag|tile|beacon|tag|finder|tracker|ibeacon|eddystone/.test(n)) {
    return 'Tracker';
  }
  if (/speaker|soundbar|jbl|bose|echo|nest|homepod|alexa|audio|tv|stereo/.test(n)) {
    return 'Audio';
  }
  return 'Bluetooth Device';
}

/**
 * Comprehensive resolver that guarantees a clean, human-friendly, identifiable name for every device.
 */
export function resolveDeviceIdentity(result: ScanResult): { name: string; kind: string; isGuessed: boolean } {
  const idUpper = result.device.deviceId.toUpperCase();
  const shortMac = formatMacShort(idUpper);

  // 1. Direct advertised name
  const rawName = (result.localName ?? result.device.name ?? '').trim();
  if (rawName.length > 0 && rawName !== 'null' && rawName !== 'undefined') {
    nameCache.set(idUpper, rawName);
    const kind = classifyDeviceKind(rawName);
    kindCache.set(idUpper, kind);
    return { name: rawName, kind, isGuessed: false };
  }

  // 2. Previously cached name
  if (nameCache.has(idUpper)) {
    const cachedName = nameCache.get(idUpper)!;
    return {
      name: cachedName,
      kind: kindCache.get(idUpper) ?? classifyDeviceKind(cachedName),
      isGuessed: false,
    };
  }

  // 3. Android Bonded / Paired Device match
  if (bondedDevicesCache.has(idUpper)) {
    const bondedName = bondedDevicesCache.get(idUpper)!;
    nameCache.set(idUpper, bondedName);
    const kind = classifyDeviceKind(bondedName);
    kindCache.set(idUpper, kind);
    return { name: bondedName, kind, isGuessed: false };
  }

  // 4. Decode Manufacturer Data
  const companyId = extractCompanyId(result.manufacturerData);
  if (companyId !== null) {
    // Special decoders
    if (companyId === 0x004c) { // Apple
      const appleData = result.manufacturerData ? Object.values(result.manufacturerData)[0] : undefined;
      const decoded = decodeApplePayload(appleData);
      if (decoded) {
        const full = `${decoded.name} ${shortMac}`;
        kindCache.set(idUpper, decoded.kind);
        return { name: full, kind: decoded.kind, isGuessed: true };
      }
    } else if (companyId === 0x0006) { // Microsoft
      const decoded = decodeMicrosoftPayload(result.manufacturerData?.['6']);
      if (decoded?.real) {
        nameCache.set(idUpper, decoded.name);
        kindCache.set(idUpper, decoded.kind);
        return { name: decoded.name, kind: decoded.kind, isGuessed: false };
      }
      if (decoded) {
        kindCache.set(idUpper, decoded.kind);
        return { name: `${decoded.name} ${shortMac}`, kind: decoded.kind, isGuessed: true };
      }
    } else if (companyId === 0x0075) { // Samsung
      const samsungData = result.manufacturerData ? Object.values(result.manufacturerData)[0] : undefined;
      const decoded = decodeSamsungPayload(samsungData);
      if (decoded) {
        const full = `${decoded.name} ${shortMac}`;
        kindCache.set(idUpper, decoded.kind);
        return { name: full, kind: decoded.kind, isGuessed: true };
      }
    }

    const companyName = COMPANY_NAMES[companyId];
    if (companyName) {
      const full = `${companyName} Device ${shortMac}`;
      const kind = companyName.includes('Audio') ? 'Audio' : 'Bluetooth Device';
      kindCache.set(idUpper, kind);
      return { name: full, kind, isGuessed: true };
    }
  }

  // 5. Decode Advertised Service UUIDs
  if (result.uuids && result.uuids.length > 0) {
    for (const uuid of result.uuids) {
      const short = shortUuid(uuid);
      const known = short ? SERVICE_NAMES[short] : undefined;
      if (known) {
        kindCache.set(idUpper, known.kind);
        return { name: `${known.label} ${shortMac}`, kind: known.kind, isGuessed: true };
      }
    }
  }

  // 5b. Service data keys identify many devices that advertise no UUID list
  for (const uuid of Object.keys(result.serviceData ?? {})) {
    const short = shortUuid(uuid);
    const known = short ? SERVICE_NAMES[short] : undefined;
    if (known) {
      kindCache.set(idUpper, known.kind);
      return { name: `${known.label} ${shortMac}`, kind: known.kind, isGuessed: true };
    }
  }

  // 6. Final Clean Fallback: Clean Tag with formatted MAC address
  const fallback = `Bluetooth Device ${shortMac}`;
  return { name: fallback, kind: 'Bluetooth Device', isGuessed: true };
}

/** "0000180f-0000-1000-8000-00805f9b34fb" -> "180f"; custom 128-bit UUIDs -> null. */
function shortUuid(uuid: string): string | null {
  const u = uuid.toLowerCase();
  if (/^[0-9a-f]{4}$/.test(u)) return u;
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/.exec(u);
  return m ? m[1] : null;
}

/**
 * Expected RSSI at 1 m, when the advertisement tells us.
 * - iBeacon carries a calibrated "measured power" byte.
 * - Eddystone UID/URL carry TX power at 0 m; free-space loss to 1 m at 2.4 GHz is ~41 dB.
 * - The generic TX Power Level field is power at the antenna, same 41 dB correction.
 */
export function extractReferencePower(result: ScanResult): number | undefined {
  try {
    const apple = result.manufacturerData?.['76'];
    if (apple && apple.byteLength >= 23 && apple.getUint8(0) === 0x02 && apple.getUint8(1) === 0x15) {
      const measured = apple.getInt8(22);
      if (measured < -20 && measured > -110) return measured;
    }

    if (result.serviceData) {
      for (const [uuid, data] of Object.entries(result.serviceData)) {
        if (shortUuid(uuid) !== 'feaa' || data.byteLength < 2) continue;
        const frame = data.getUint8(0);
        if (frame === 0x00 || frame === 0x10) {
          const tx0 = data.getInt8(1);
          if (tx0 > -100 && tx0 < 20) return tx0 - 41;
        }
      }
    }

    const tx = result.txPower;
    if (typeof tx === 'number' && tx !== 127 && tx > -30 && tx < 21) return tx - 41;
  } catch {
    // malformed payload
  }
  return undefined;
}
```

### File: `src/lib/proximityHaptics.ts`
```typescript
import { registerPlugin } from '@capacitor/core';

/** Native side: plugins/proximity-haptics (Android only). */
export interface ProximityHapticsPlugin {
  pulse(options: { duration: number }): Promise<void>;
}

export const ProximityHaptics = registerPlugin<ProximityHapticsPlugin>('ProximityHaptics');
```

### File: `src/lib/signal.ts`
```typescript
export const STALE_AFTER_MS = 6000;
export const LOST_AFTER_MS = 25000;

/** Typical RSSI at 1 m for a phone / earbud / tag when nothing better is known. */
export const DEFAULT_REF_POWER = -59;

export type Proximity = 'VERY CLOSE' | 'NEARBY' | 'MID RANGE' | 'FAR' | 'UNKNOWN';
export type Trend = 'GETTING WARMER' | 'GETTING COLDER' | 'STABLE' | 'UNCERTAIN';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type SearchMode = 'QUICK_SEARCH' | 'ROOM_SWEEP' | 'FINAL_1_METER';
export type RefSource = 'calibrated' | 'advertised' | 'default';

export type SignalStats = {
  raw: number;
  filtered: number;
  velocity: number; // dBm per second, least-squares slope over the trend window
  delta: number; // dB gained (+) or lost (-) across the trend window
  percentage: number; // 0 to 100% closeness (RSSI normalised by the 1 m reference)
  approxDistance: string; // Human readable distance estimation
  distanceM: number;
  distanceLowM: number;
  distanceHighM: number;
  refPower: number; // expected RSSI at 1 m
  refSource: RefSource;
  variance: number; // noise variance of raw RSSI (dB²)
  packetsPerSec: number;
  trend: Trend;
  proximity: Proximity;
  confidence: Confidence;
  peakRssi: number;
  peakAt: number;
  lastSeen: number;
  isStale: boolean;
  history: (number | null)[];
};

type ModeTuning = {
  windowMs: number; // robust pre-filter window
  processNoise: number; // Kalman process noise, dB² per second
  trendMs: number; // regression window for warmer / colder
  minSlope: number; // dB/s below which the trend is called STABLE
  enterT: number; // t-statistic needed to call a new direction
};

const TUNING: Record<SearchMode, ModeTuning> = {
  QUICK_SEARCH: { windowMs: 700, processNoise: 30, trendMs: 2000, minSlope: 1.0, enterT: 1.8 },
  ROOM_SWEEP: { windowMs: 1200, processNoise: 10, trendMs: 3500, minSlope: 0.6, enterT: 2.0 },
  FINAL_1_METER: { windowMs: 500, processNoise: 45, trendMs: 1500, minSlope: 1.5, enterT: 1.8 },
};

// Indoor path-loss exponent range: ~2 in open line of sight, ~3 through furniture and bodies.
const PATH_LOSS_N_LOW = 2.0;
const PATH_LOSS_N_MID = 2.5;
const PATH_LOSS_N_HIGH = 3.0;

const TREND_HOLD_MS = 800;
const RAW_KEEP_MS = 12000;
const MAX_BORROW_MS = 4000;
const NOISE_WINDOW_MS = 3000;
const HISTORY_BINS = 60;
const HISTORY_SPAN_MS = 10000;

type Sample = { rssi: number; ts: number };

/**
 * Per-device RSSI pipeline.
 *
 * 1. Upper-quartile over a short time window. Multipath fading and the per-channel
 *    gain differences of BLE advertising (channels 37/38/39) only ever *subtract*
 *    power, so the top of the recent distribution tracks path loss far better than
 *    the mean or a 3-sample median.
 * 2. Time-based 1D Kalman filter (random walk). Process noise scales with elapsed
 *    time, not packet count, so smoothing feels the same at 2 or 20 packets/s.
 * 3. Warmer / colder from a least-squares slope over the raw samples in a window,
 *    gated on its t-statistic (with hysteresis) so noise alone rarely produces a
 *    direction. Raw samples, not the filtered series: fading makes them close to
 *    independent, which keeps the t-statistic honest.
 */
export class SignalEngine {
  private raw: Sample[] = [];
  private filtered: Sample[] = [];
  private mode: SearchMode;
  private x = 0; // Kalman estimate
  private p = 0; // Kalman variance
  private lastTs = 0;
  private initialized = false;
  private outlierRun = 0;
  private lastTrend: Trend = 'UNCERTAIN';
  private shownTrend: Trend = 'UNCERTAIN';
  private candidateSince = 0;
  private peakRssi = -127;
  private peakAt = 0;
  private refPower = DEFAULT_REF_POWER;
  private refSource: RefSource = 'default';
  private last: SignalStats | null = null;

  constructor(mode: SearchMode = 'ROOM_SWEEP') {
    this.mode = mode;
  }

  public setMode(mode: SearchMode) {
    this.mode = mode;
  }

  /** Advertised power never overrides a user calibration. */
  public setReferencePower(dbm: number, source: Exclude<RefSource, 'default'>) {
    if (!Number.isFinite(dbm) || dbm > -20 || dbm < -110) return;
    if (source === 'advertised' && this.refSource === 'calibrated') return;
    this.refPower = dbm;
    this.refSource = source;
  }

  /** Treat the current estimate as "1 metre away". Returns the stored reference. */
  public calibrateAtOneMetre(): number | null {
    if (!this.initialized) return null;
    this.setReferencePower(Math.round(this.x), 'calibrated');
    return this.refPower;
  }

  public getStats(): SignalStats | null {
    return this.last;
  }

  public ingest(rawRssi: number, now: number = Date.now()): SignalStats {
    // Android reports 127 / 0 for "unknown"; never feed those into the filter.
    if (rawRssi >= 0 || rawRssi < -127) {
      return this.last ?? this.buildStats(now, rawRssi);
    }

    const tune = TUNING[this.mode];
    this.raw.push({ rssi: rawRssi, ts: now });
    const keepFrom = now - RAW_KEEP_MS;
    while (this.raw.length && this.raw[0].ts < keepFrom) this.raw.shift();
    while (this.filtered.length && this.filtered[0].ts < keepFrom) this.filtered.shift();

    // 1. Robust pre-filter
    const windowVals = this.valuesSince(now - tune.windowMs, 3);
    const z = percentile(windowVals, 0.75);

    // Measurement noise from the median absolute deviation of recent raw readings
    const sigma = this.noiseSigma(now);
    const r = clamp(sigma * sigma, 4, 64);

    // 2. Kalman update
    if (!this.initialized) {
      this.x = z;
      this.p = r;
      this.initialized = true;
    } else {
      const dt = clamp((now - this.lastTs) / 1000, 0, 5);
      this.p += tune.processNoise * dt;

      // Soft outlier gate: a lone wild reading gets 10x the noise, but a
      // persistent change (3+ in a row) is accepted as real movement.
      const innovation = z - this.x;
      const gate = 4 * Math.sqrt(this.p + r);
      let rEff = r;
      if (Math.abs(innovation) > gate && this.outlierRun < 3) {
        this.outlierRun++;
        rEff = r * 10;
      } else {
        this.outlierRun = 0;
      }

      const k = this.p / (this.p + rEff);
      this.x += k * innovation;
      this.p *= 1 - k;
    }
    this.lastTs = now;
    this.filtered.push({ rssi: this.x, ts: now });

    if (this.x > this.peakRssi) {
      this.peakRssi = this.x;
      this.peakAt = now;
    }

    this.last = this.buildStats(now, rawRssi, sigma);
    return this.last;
  }

  /**
   * Readings since `from`. For slow advertisers the window may hold fewer than
   * `minCount`, so it borrows older readings, but never from more than MAX_BORROW_MS
   * before the window, so a device returning after a quiet spell isn't blended with
   * where it was before.
   */
  private valuesSince(from: number, minCount: number): number[] {
    const out: number[] = [];
    for (let i = this.raw.length - 1; i >= 0; i--) {
      const s = this.raw[i];
      if (s.ts < from && (out.length >= minCount || s.ts < from - MAX_BORROW_MS)) break;
      out.push(s.rssi);
    }
    return out;
  }

  private noiseSigma(now: number): number {
    const vals = this.valuesSince(now - NOISE_WINDOW_MS, 5);
    if (vals.length < 3) return 6;
    const med = percentile(vals, 0.5);
    const mad = percentile(vals.map((v) => Math.abs(v - med)), 0.5);
    return Math.max(1, 1.4826 * mad);
  }

  private trend(now: number, tune: ModeTuning): { trend: Trend; slope: number; delta: number } {
    const from = now - tune.trendMs;
    const pts = this.raw.filter((s) => s.ts >= from);
    if (pts.length < 6) return { trend: 'UNCERTAIN', slope: 0, delta: 0 };

    const span = pts[pts.length - 1].ts - pts[0].ts;
    if (span < tune.trendMs * 0.5) return { trend: 'UNCERTAIN', slope: 0, delta: 0 };

    // Least squares y = a + b t, with t in seconds
    const t0 = pts[0].ts;
    let st = 0;
    let sy = 0;
    for (const p of pts) {
      st += (p.ts - t0) / 1000;
      sy += p.rssi;
    }
    const n = pts.length;
    const mt = st / n;
    const my = sy / n;
    let sxx = 0;
    let sxy = 0;
    for (const p of pts) {
      const dt = (p.ts - t0) / 1000 - mt;
      sxx += dt * dt;
      sxy += dt * (p.rssi - my);
    }
    if (sxx <= 0) return { trend: 'UNCERTAIN', slope: 0, delta: 0 };
    const slope = sxy / sxx;

    let sse = 0;
    for (const p of pts) {
      const fit = my + slope * ((p.ts - t0) / 1000 - mt);
      sse += (p.rssi - fit) ** 2;
    }
    const se = Math.sqrt(sse / Math.max(1, n - 2) / sxx);
    const tStat = se > 0 ? Math.abs(slope) / se : Infinity;
    const delta = slope * (tune.trendMs / 1000);

    const direction: Trend = slope > 0 ? 'GETTING WARMER' : 'GETTING COLDER';
    // Hysteresis: a direction needs strong evidence to start and half as much to hold,
    // so the banner doesn't flicker between WARMER and STEADY mid-walk.
    const holding = direction === this.lastTrend;
    const needT = holding ? tune.enterT / 2 : tune.enterT;
    const needSlope = holding ? tune.minSlope / 2 : tune.minSlope;
    const needDelta = holding ? 1 : 2;
    const trend: Trend =
      Math.abs(slope) >= needSlope && Math.abs(delta) >= needDelta && tStat >= needT ? direction : 'STABLE';
    this.lastTrend = trend;
    return { trend: this.debounce(trend, now), slope, delta };
  }

  /**
   * A new direction must hold for TREND_HOLD_MS before it is shown. On a real phone a
   * stationary target still produced 1-2 s false WARMER/COLDER blips (its RSSI alternates
   * ~4 dB between advertising channels); this hides them. Falling back to STEADY is
   * immediate, so a real change is never held on screen longer than it lasts.
   */
  private debounce(trend: Trend, now: number): Trend {
    if (trend === this.shownTrend || trend === 'STABLE' || trend === 'UNCERTAIN') {
      this.shownTrend = trend;
      this.candidateSince = 0;
      return trend;
    }
    if (this.candidateSince === 0) this.candidateSince = now;
    if (now - this.candidateSince >= TREND_HOLD_MS) {
      this.shownTrend = trend;
      this.candidateSince = 0;
      return trend;
    }
    return this.shownTrend === 'GETTING WARMER' || this.shownTrend === 'GETTING COLDER' ? 'STABLE' : this.shownTrend;
  }

  private buildStats(now: number, raw: number, sigma = 6): SignalStats {
    const tune = TUNING[this.mode];
    const filtered = this.initialized ? this.x : raw;

    // Distance: log-distance path loss, bracketed by exponent range and filter uncertainty
    const refUnc = this.refSource === 'calibrated' ? 1.5 : this.refSource === 'advertised' ? 3 : 5;
    const err = Math.sqrt(4 * Math.max(this.p, 0.5) + refUnc * refUnc);
    const dist = (rssi: number, n: number) => Math.pow(10, (this.refPower - rssi) / (10 * n));
    const distanceM = dist(filtered, PATH_LOSS_N_MID);
    const corners = [
      dist(filtered + err, PATH_LOSS_N_LOW),
      dist(filtered + err, PATH_LOSS_N_HIGH),
      dist(filtered - err, PATH_LOSS_N_LOW),
      dist(filtered - err, PATH_LOSS_N_HIGH),
    ];
    const distanceLowM = Math.min(...corners);
    const distanceHighM = Math.max(...corners);

    let proximity: Proximity = 'UNKNOWN';
    if (this.initialized) {
      if (distanceM < 0.6) proximity = 'VERY CLOSE';
      else if (distanceM < 2) proximity = 'NEARBY';
      else if (distanceM < 6) proximity = 'MID RANGE';
      else proximity = 'FAR';
    }

    // Closeness, not raw dBm: shift by this device's 1 m reference so a quiet tag at
    // arm's length fills the meter like a loud phone at arm's length would.
    const normalized = filtered - (this.refPower - DEFAULT_REF_POWER);
    const percentage = Math.max(0, Math.min(100, Math.round(((normalized + 95) / 60) * 100)));

    const { trend, slope, delta } = this.trend(now, tune);

    // Packet rate over the last 3 s
    const recent = this.raw.filter((s) => s.ts >= now - 3000);
    const rateSpan = recent.length > 1 ? Math.max(1, (now - recent[0].ts) / 1000) : 1;
    const packetsPerSec = recent.length > 1 ? recent.length / Math.max(rateSpan, 1) : recent.length;

    let confidence: Confidence = 'MEDIUM';
    if (this.raw.length < 5 || packetsPerSec < 1 || sigma > 8) confidence = 'LOW';
    else if (packetsPerSec >= 4 && sigma <= 4) confidence = 'HIGH';

    return {
      raw,
      filtered,
      velocity: slope,
      delta,
      percentage,
      approxDistance: formatDistance(distanceM, distanceLowM, distanceHighM),
      distanceM,
      distanceLowM,
      distanceHighM,
      refPower: this.refPower,
      refSource: this.refSource,
      variance: sigma * sigma,
      packetsPerSec,
      trend,
      proximity,
      confidence,
      peakRssi: this.peakRssi,
      peakAt: this.peakAt,
      lastSeen: now,
      isStale: false,
      history: this.history(now),
    };
  }

  /** 60 slots across the last 10 s; each takes the nearest filtered sample within 1.5 s. */
  private history(now: number): (number | null)[] {
    const out: (number | null)[] = new Array(HISTORY_BINS).fill(null);
    const step = HISTORY_SPAN_MS / HISTORY_BINS;
    const samples = this.filtered;
    let j = 0;
    for (let i = 0; i < HISTORY_BINS; i++) {
      const target = now - (HISTORY_BINS - 1 - i) * step;
      while (j + 1 < samples.length && Math.abs(samples[j + 1].ts - target) <= Math.abs(samples[j].ts - target)) j++;
      const s = samples[j];
      if (s && Math.abs(s.ts - target) < 1500) out[i] = s.rssi;
    }
    return out;
  }
}

export function formatDistance(d: number, lo: number, hi: number): string {
  const fmt = (m: number) => (m < 10 ? m.toFixed(1) : Math.round(m).toString());
  if (hi < 0.5) return '< 0.5 m';
  if (d > 25) return '> 25 m';
  return `≈ ${fmt(d)} m (${fmt(Math.max(0.1, lo))}–${fmt(Math.min(hi, 50))} m)`;
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return -100;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
```

### File: `src/lib/theme.ts`
```typescript
import { useState, useEffect, useCallback } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type ThemeMode = 'light' | 'dark';

/** Colour for a proximity band; both screens use it so the list and the hunt agree. */
export function proximityColor(proximity: string): string {
  switch (proximity) {
    case 'VERY CLOSE':
      return 'var(--c-success)';
    case 'NEARBY':
      return 'var(--c-primary)';
    case 'MID RANGE':
      return 'var(--c-warning)';
    case 'FAR':
      return 'var(--c-danger)';
    default:
      return 'var(--c-text-muted)';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('bld_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light'; // Light mode is default
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bld_theme', theme);
    // Edge-to-edge: the status bar sits on the app's own background, so its icons must
    // flip with the theme or they vanish (dark icons on the dark header).
    if (Capacitor.isNativePlatform()) {
      void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
}
```

### File: `src/lib/useClicker.ts`
```typescript
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { ProximityHaptics } from './proximityHaptics';
import { clickIntervalMs } from './clickInterval';
import { Trend, Confidence } from './signal';

export function useClicker(opts: {
  rssi: number | null;
  active: boolean;
  sound: boolean;
  haptics: boolean;
  trend?: Trend;
  confidence?: Confidence;
}) {
  const { rssi, active, sound, haptics, trend, confidence } = opts;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const clickBufferRef = useRef<AudioBuffer | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastPulseRef = useRef(0);
  const latestRef = useRef(opts);
  latestRef.current = opts;

  useEffect(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const sr = 44100;
      const duration = 0.045; // 45ms
      const nFrames = Math.floor(sr * duration);
      const buffer = ctx.createBuffer(1, nFrames, sr);
      const channelData = buffer.getChannelData(0);

      for (let i = 0; i < nFrames; i++) {
        const t = i / sr;
        const freq = 2400 + (900 - 2400) * (t / duration);
        const sample = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 90);
        channelData[i] = Math.max(-1, Math.min(1, sample)) * 0.7;
      }
      clickBufferRef.current = buffer;
    } catch {
      // AudioContext unavailable
    }

    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    function playClick() {
      const now = latestRef.current;
      if (now.active && now.rssi !== null) {
        if (now.sound && audioCtxRef.current && clickBufferRef.current) {
          try {
            if (audioCtxRef.current.state === 'suspended') {
              audioCtxRef.current.resume().catch(() => {});
            }
            const source = audioCtxRef.current.createBufferSource();
            source.buffer = clickBufferRef.current;
            source.connect(audioCtxRef.current.destination);
            source.start();
          } catch {}
        }
        
        // Android stretches a pulse to ~100 ms; faster than this they merge into one buzz
        const pulseDue = now.haptics && Date.now() - lastPulseRef.current >= 220;
        if (pulseDue) lastPulseRef.current = Date.now();

        if (pulseDue && Capacitor.isNativePlatform()) {
          // Native pulse tagged as alarm usage. Haptics.impact()/vibrate() and the WebView's
          // navigator.vibrate are all classified as touch feedback on Android 13+ and are
          // dropped when system touch feedback is off (verified on a Pixel 8 Pro).
          const ms =
            now.confidence === 'LOW' || now.trend === 'GETTING COLDER'
              ? 15
              : now.rssi > -55
              ? 45
              : now.rssi > -70
              ? 30
              : 20;
          void ProximityHaptics.pulse({ duration: ms }).catch(() => {});
        } else if (pulseDue && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          if (now.confidence === 'LOW') {
            // Signal unstable: intermittent pattern
            navigator.vibrate([10, 50, 10]);
          } else if (now.trend === 'GETTING COLDER') {
            // Signal worsening: different pattern (long)
            navigator.vibrate(40);
          } else {
            // As signal strengthens
            if (now.rssi > -55) navigator.vibrate([10, 30, 10]); // Very close: distinct short pulses
            else if (now.rssi > -65) navigator.vibrate(20); // Strong
            else if (now.rssi > -75) navigator.vibrate(30); // Moderate
            else navigator.vibrate(40); // Weak
          }
        }
      }

      const wait = now.rssi === null ? 500 : clickIntervalMs(now.rssi);
      timerRef.current = window.setTimeout(playClick, wait);
    }

    timerRef.current = window.setTimeout(playClick, 200);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}
```

### File: `src/lib/useDeadReckoning.ts`
```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export type Fix = { x: number; y: number; heading: number; steps: number };

export type SensorQuality = 'GOOD' | 'LIMITED' | 'UNAVAILABLE';
export type MotionPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';

const STEP_THRESHOLD = 1.14;   // g, peak of a walking bounce
const STEP_MIN_GAP_MS = 260;   // faster than this is noise
const STEP_MAX_GAP_MS = 2200;  // slower than this and you stopped walking

/**
 * Heading (clockwise degrees) of the direction the user is facing, from W3C device
 * orientation. Alpha alone is only right when the phone lies flat, and it runs
 * counter-clockwise; held tilted in front of you, the horizontal projection of the
 * back of the phone is the direction you are walking.
 */
export function forwardHeading(
  alpha: number | null | undefined,
  beta: number | null | undefined,
  gamma: number | null | undefined,
): number | null {
  if (alpha === null || alpha === undefined) return null;
  const rad = Math.PI / 180;
  const x = (beta ?? 0) * rad;
  const y = (gamma ?? 0) * rad;
  const z = alpha * rad;
  const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
  const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
  if (Math.hypot(vx, vy) < 0.35) {
    // Close to flat: the top edge of the phone points forward.
    return (360 - alpha) % 360;
  }
  const deg = (Math.atan2(vx, vy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function useDeadReckoning(opts: { active: boolean; initialStride?: number }) {
  const { active, initialStride = 0.72 } = opts;
  const [fix, setFix] = useState<Fix>({ x: 0, y: 0, heading: 0, steps: 0 });
  const [permission, setPermission] = useState<MotionPermission>('unsupported');
  const [quality, setQuality] = useState<SensorQuality>('UNAVAILABLE');
  
  const [stride, setStrideState] = useState(initialStride);

  const lastMotionRef = useRef(0);
  const lastOrientationRef = useRef(0);
  const headingRef = useRef(0);
  const posRef = useRef({ x: 0, y: 0, steps: 0 });
  const smoothedRef = useRef(1);
  const armedRef = useRef(true);
  const lastStepRef = useRef(0);

  const listenersRef = useRef<any[]>([]);

  useEffect(() => {
    // Check if motion is supported
    if (Capacitor.isNativePlatform()) {
      setPermission('granted'); // Capacitor plugins handle permissions internally or don't need them for basic motion on Android
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      const g = DeviceMotionEvent as any;
      if (typeof g.requestPermission === 'function') {
        setPermission('prompt');
      } else {
        setPermission('granted');
      }
    } else {
      setPermission('unsupported');
    }
  }, []);

  const requestAccess = useCallback(async () => {
    if (permission === 'unsupported' || Capacitor.isNativePlatform()) return;
    
    try {
      const m = DeviceMotionEvent as any;
      const o = DeviceOrientationEvent as any;
      let p1 = 'granted', p2 = 'granted';
      
      if (typeof m.requestPermission === 'function') p1 = await m.requestPermission();
      if (typeof o.requestPermission === 'function') p2 = await o.requestPermission();
      
      setPermission(p1 === 'granted' && p2 === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermission('denied');
    }
  }, [permission]);

  useEffect(() => {
    if (!active || permission !== 'granted') return;

    const attach = async () => {
      // Clear previous
      for (const handle of listenersRef.current) {
        if (handle?.remove) handle.remove();
      }
      listenersRef.current = [];

      try {
        // Plain DOM listeners on every platform (@capacitor/motion is only a wrapper
        // over these). Step detection needs gravity included: `acceleration` has it
        // removed, so its magnitude never crosses the 1.14 g threshold.
        const onMotion = (e: DeviceMotionEvent) => {
          const acc = e.accelerationIncludingGravity;
          if (acc) handleAccel(acc.x ?? null, acc.y ?? null, acc.z ?? null);
        };
        // Android's WebView never fires 'deviceorientation', only the compass-referenced
        // 'deviceorientationabsolute'. Prefer absolute once seen, so the two reference
        // frames are never mixed.
        let sawAbsolute = false;
        const onAbsolute = (e: DeviceOrientationEvent) => {
          sawAbsolute = true;
          handleOrientation(forwardHeading(e.alpha, e.beta, e.gamma));
        };
        const onRelative = (e: DeviceOrientationEvent) => {
          if (sawAbsolute) return;
          const ios = (e as any).webkitCompassHeading;
          handleOrientation(typeof ios === 'number' ? ios : forwardHeading(e.alpha, e.beta, e.gamma));
        };
        window.addEventListener('devicemotion', onMotion);
        window.addEventListener('deviceorientationabsolute' as any, onAbsolute);
        window.addEventListener('deviceorientation', onRelative);
        listenersRef.current.push({
          remove: () => {
            window.removeEventListener('devicemotion', onMotion);
            window.removeEventListener('deviceorientationabsolute' as any, onAbsolute);
            window.removeEventListener('deviceorientation', onRelative);
          },
        });
      } catch (err) {
        console.warn('Motion sensor attach failed', err);
      }
    };

    function handleOrientation(alpha: number | null | undefined) {
      if (alpha === null || alpha === undefined) return;
      lastOrientationRef.current = Date.now();
      
      let delta = alpha - headingRef.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      headingRef.current = (headingRef.current + delta * 0.25 + 360) % 360;
    }

    function handleAccel(x: number | null, y: number | null, z: number | null) {
      if (x === null || y === null || z === null) return;
      lastMotionRef.current = Date.now();

      // Convert m/s^2 to g
      const gx = x / 9.81;
      const gy = y / 9.81;
      const gz = z / 9.81;
      const magnitude = Math.sqrt(gx * gx + gy * gy + gz * gz);

      smoothedRef.current = smoothedRef.current * 0.8 + magnitude * 0.2;
      const now = Date.now();
      const gap = now - lastStepRef.current;

      if (armedRef.current && smoothedRef.current > STEP_THRESHOLD && gap > STEP_MIN_GAP_MS) {
        armedRef.current = false;
        lastStepRef.current = now;
        const rad = (headingRef.current * Math.PI) / 180;
        posRef.current = {
          x: posRef.current.x + stride * Math.sin(rad),
          y: posRef.current.y + stride * Math.cos(rad),
          steps: posRef.current.steps + 1,
        };
      }
      if (smoothedRef.current < 1.02) armedRef.current = true;
      if (gap > STEP_MAX_GAP_MS) armedRef.current = true;
    }

    attach();

    const uiInterval = setInterval(() => {
      setFix({ ...posRef.current, heading: headingRef.current });
      
      const now = Date.now();
      const hasAccel = now - lastMotionRef.current < 2000;
      // Orientation events only fire when the reading changes; a phone lying still can go
      // silent indefinitely, so any reading since attaching means the compass works.
      const hasOrient = lastOrientationRef.current > 0;

      if (hasAccel && hasOrient) {
        setQuality('GOOD');
      } else if (hasAccel && !hasOrient) {
        setQuality('LIMITED');
      } else {
        setQuality('UNAVAILABLE');
      }
    }, 200);

    return () => {
      for (const handle of listenersRef.current) {
        if (handle?.remove) handle.remove();
      }
      listenersRef.current = [];
      clearInterval(uiInterval);
      setQuality('UNAVAILABLE');
    };
  }, [active, stride, permission]);

  const calibrateStride = useCallback((metersWalked: number, stepsTaken: number) => {
    if (stepsTaken > 0 && metersWalked > 0) {
      const newStride = metersWalked / stepsTaken;
      setStrideState(newStride);
      return newStride;
    }
    return stride;
  }, [stride]);

  const simulateStep = useCallback((headingDegrees?: number) => {
    if (headingDegrees !== undefined) {
      headingRef.current = (headingDegrees + 360) % 360;
    }
    const rad = (headingRef.current * Math.PI) / 180;
    posRef.current = {
      x: posRef.current.x + stride * Math.sin(rad),
      y: posRef.current.y + stride * Math.cos(rad),
      steps: posRef.current.steps + 1,
    };
    setFix({ ...posRef.current, heading: headingRef.current });
  }, [stride]);

  const setHeading = useCallback((deg: number) => {
    headingRef.current = (deg + 360) % 360;
    setFix((prev) => ({ ...prev, heading: headingRef.current }));
  }, []);

  const reset = useCallback(() => {
    posRef.current = { x: 0, y: 0, steps: 0 };
    setFix({ x: 0, y: 0, heading: headingRef.current, steps: 0 });
  }, []);

  return { fix, permission, quality, stride, requestAccess, reset, simulateStep, setHeading, calibrateStride };
}
```

### File: `src/lib/useScanner.ts`
```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { bluetoothService, BluetoothDeviceRaw } from './bluetoothService';
import { SignalEngine, SignalStats, SearchMode, STALE_AFTER_MS, LOST_AFTER_MS } from './signal';

export type Contact = {
  id: string;
  name: string;
  kind: string;
  isGuessed: boolean;
  firstSeen: number;
  stats: SignalStats;
};

// Per-device "RSSI at 1 m", measured by the user. Survives restarts.
const CALIBRATION_KEY = 'bt-locator.calibration.v1';

/**
 * Phones, earbuds and PCs rotate their address every few minutes (seen on a real hunt:
 * four addresses in 30 min for one PC), so a device with a real advertised name is
 * calibrated by name. Guessed labels include the address, so those fall back to it.
 */
function calibrationKey(id: string, name: string, isGuessed: boolean): string {
  return isGuessed ? id : `name:${name}`;
}

function loadCalibrations(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCalibrations(map: Record<string, number>) {
  try {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable; calibration lasts for this session only
  }
}

export function useScanner() {
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchMode, setSearchModeState] = useState<SearchMode>('ROOM_SWEEP');

  const engines = useRef<Record<string, SignalEngine>>({});
  const store = useRef<Record<string, Contact>>({});
  const dirty = useRef(false);
  const stopScanFn = useRef<(() => void) | null>(null);
  // The scan callback outlives renders, so everything it reads goes through refs.
  const modeRef = useRef<SearchMode>('ROOM_SWEEP');
  const calibrations = useRef<Record<string, number>>(loadCalibrations());
  const pinnedId = useRef<string | null>(null);

  const setSearchMode = useCallback((newMode: SearchMode) => {
    modeRef.current = newMode;
    setSearchModeState(newMode);
    Object.values(engines.current).forEach((engine) => engine.setMode(newMode));
  }, []);

  /** The device being hunted is never dropped from the list, only marked stale. */
  const pin = useCallback((id: string | null) => {
    pinnedId.current = id;
  }, []);

  // Housekeeping loop for stale / lost markers
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      let hasChanges = false;

      for (const key of Object.keys(store.current)) {
        const contact = store.current[key];
        const age = now - contact.stats.lastSeen;

        if (age > LOST_AFTER_MS && key !== pinnedId.current) {
          delete store.current[key];
          delete engines.current[key];
          hasChanges = true;
        } else if (age > STALE_AFTER_MS && !contact.stats.isStale) {
          store.current[key] = { ...contact, stats: { ...contact.stats, isStale: true } };
          hasChanges = true;
        }
      }

      if (dirty.current || hasChanges) {
        dirty.current = false;
        setContacts({ ...store.current });
      }
    }, 250);

    return () => clearInterval(id);
  }, []);

  const ingest = useCallback((device: BluetoothDeviceRaw) => {
    let engine = engines.current[device.id];
    if (!engine) {
      engine = new SignalEngine(modeRef.current);
      engines.current[device.id] = engine;
    }
    // Checked on every packet: a real name can arrive after the first packets
    const calibrated = calibrations.current[calibrationKey(device.id, device.name, device.isGuessed)];
    if (calibrated !== undefined && engine.getStats()?.refSource !== 'calibrated') {
      engine.setReferencePower(calibrated, 'calibrated');
    }
    if (device.refPower !== undefined) engine.setReferencePower(device.refPower, 'advertised');

    const stats = engine.ingest(device.rssi);

    // Keep a real name once we have one; don't let a later guessed label overwrite it
    const existing = store.current[device.id];
    const keepExisting = existing && !existing.isGuessed && device.isGuessed;
    const bestKind = existing && existing.kind !== 'Bluetooth Device' ? existing.kind : device.kind;

    store.current[device.id] = {
      id: device.id,
      name: keepExisting ? existing.name : device.name,
      kind: bestKind,
      isGuessed: keepExisting ? false : device.isGuessed,
      firstSeen: existing?.firstSeen ?? stats.lastSeen,
      stats,
    };

    dirty.current = true;
  }, []);

  /** Store the current reading as this device's "1 metre" reference. */
  const calibrate = useCallback((id: string): number | null => {
    const engine = engines.current[id];
    const ref = engine?.calibrateAtOneMetre() ?? null;
    const contact = store.current[id];
    if (ref !== null && contact) {
      const key = calibrationKey(id, contact.name, contact.isGuessed);
      calibrations.current = { ...calibrations.current, [key]: ref };
      saveCalibrations(calibrations.current);
    }
    return ref;
  }, []);

  const teardownRadio = useCallback(() => {
    if (stopScanFn.current) {
      stopScanFn.current();
      stopScanFn.current = null;
    }
  }, []);

  useEffect(() => teardownRadio, [teardownRadio]);

  const start = useCallback(async () => {
    setError(null);
    setNotice(null);

    try {
      const { locationOk, bluetoothOk } = await bluetoothService.checkPrerequisites();
      if (!bluetoothOk) {
        setError('Bluetooth is turned off. Please enable Bluetooth to locate devices.');
        return;
      }
      if (!locationOk) {
        setNotice('Location is switched off. Android delivers no Bluetooth scan results without it — turn Location on in quick settings.');
      }

      stopScanFn.current = await bluetoothService.startScan(ingest);
      setScanning(true);
    } catch (err: any) {
      teardownRadio();
      setScanning(false);
      setError(err.message ?? 'Failed to start Bluetooth scan.');
    }
  }, [ingest, teardownRadio]);

  const stop = useCallback(() => {
    teardownRadio();
    setScanning(false);
    // Note: We DO NOT wipe discovered contacts on stop, allowing user to inspect them!
  }, [teardownRadio]);

  const clear = useCallback(() => {
    store.current = {};
    engines.current = {};
    dirty.current = false;
    setContacts({});
  }, []);

  return {
    contacts,
    scanning,
    searchMode,
    error,
    notice,
    start,
    stop,
    clear,
    setSearchMode,
    calibrate,
    pin,
  };
}
```

### File: `src/lib/useTrail.ts`
```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeadReckoning } from './useDeadReckoning';
import { Crumb, detectPeak, estimate as estimateFrom } from './breadcrumbs';

const SAMPLE_MS = 400;
const TRACK_LIMIT = 400;

export function useTrail(opts: { rssi: number | null; refPower?: number; active: boolean; stride?: number }) {
  const { rssi, refPower, active, stride: initialStride } = opts;
  const { fix, permission, quality, stride, requestAccess, reset: resetFix, simulateStep, setHeading, calibrateStride } =
    useDeadReckoning({ active, initialStride });

  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [track, setTrack] = useState<{ x: number; y: number }[]>([]);
  const peak = useRef<{ x: number; y: number; rssi: number } | null>(null);
  const nextId = useRef(1);
  const latest = useRef({ rssi, refPower, fix, active });
  latest.current = { rssi, refPower, fix, active };

  useEffect(() => {
    const id = setInterval(() => {
      const { rssi: r, fix: f, active: on } = latest.current;
      if (!on || r === null) return;

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
          { id: nextId.current++, x: commit.x, y: commit.y, rssi: commit.rssi, ref: latest.current.refPower, at: Date.now(), manual: false },
        ]);
      }
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const dropManual = useCallback(() => {
    const { rssi: r, fix: f, refPower: ref } = latest.current;
    if (r === null) return;
    setCrumbs((prev) => [
      ...prev,
      { id: nextId.current++, x: f.x, y: f.y, rssi: r, ref, at: Date.now(), manual: true },
    ]);
  }, []);

  const clear = useCallback(() => {
    setCrumbs([]);
    setTrack([]);
    peak.current = null;
    resetFix();
  }, [resetFix]);

  const estimate = useMemo(() => estimateFrom(crumbs), [crumbs]);

  return {
    fix,
    permission,
    quality,
    stride,
    calibrateStride,
    requestAccess,
    crumbs,
    track,
    estimate,
    dropManual,
    clear,
    simulateStep,
    setHeading,
  };
}
```

### File: `src/lib/useWakeLock.ts`
```typescript
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/**
 * Hold the screen awake while a hunt is running.
 *
 * You use this app walking around a room watching a number move; a screen
 * that sleeps every thirty seconds is the difference between a tool and a
 * nuisance. Not supported everywhere (notably not iOS before 16.4), so this
 * fails quietly rather than reporting anything.
 */
export function useWakeLock(active: boolean) {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  // Android's WebView has no Screen Wake Lock API; use the window flag natively.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (active) void KeepAwake.keepAwake().catch(() => {});
    else void KeepAwake.allowSleep().catch(() => {});
    return () => {
      void KeepAwake.allowSleep().catch(() => {});
    };
  }, [active]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const nav = navigator as WakeLockCapableNavigator;
    if (!active || !nav.wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinel.current && !sentinel.current.released) return;
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel.current = lock;
      } catch {
        // Denied, or the tab lost focus mid-request. Nothing to do.
      }
    };

    // The lock is dropped whenever the tab is hidden, so take it again on return.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const held = sentinel.current;
      sentinel.current = null;
      if (held && !held.released) void held.release().catch(() => {});
    };
  }, [active]);
}
```

### File: `scripts/simulate-signal.ts`
```typescript
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
```

### File: `scripts/simulate-trail.ts`
```typescript
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
```

### File: `plugins/proximity-haptics/package.json`
```json
{
  "name": "proximity-haptics",
  "version": "1.0.0",
  "private": true,
  "description": "Proximity vibration that is not dropped when system touch feedback is off (Android native side; the JS side is registered in src/lib/proximityHaptics.ts).",
  "files": ["android/src/main/", "android/build.gradle"],
  "capacitor": {
    "android": {
      "src": "android"
    }
  },
  "peerDependencies": {
    "@capacitor/core": ">=8.0.0"
  }
}
```

### File: `plugins/proximity-haptics/android/build.gradle`
```groovy
ext {
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? rootProject.ext.androidxAppCompatVersion : '1.7.1'
}

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.13.0'
    }
}

apply plugin: 'com.android.library'

android {
    namespace = "com.bluetooth.locator.haptics"
    compileSdk = project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 36
    defaultConfig {
        minSdkVersion project.hasProperty('minSdkVersion') ? rootProject.ext.minSdkVersion : 24
        targetSdkVersion project.hasProperty('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 36
    }
    lintOptions {
        abortOnError = false
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation project(':capacitor-android')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
}
```

### File: `plugins/proximity-haptics/android/src/main/AndroidManifest.xml`
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.VIBRATE" />
</manifest>
```

### File: `plugins/proximity-haptics/android/src/main/java/com/bluetooth/locator/haptics/ProximityHapticsPlugin.java`
```java
package com.bluetooth.locator.haptics;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Short proximity pulses for the hunt screen.
 *
 * Android 13+ classifies any short vibration without attributes as touch feedback
 * (USAGE_TOUCH), and drops it when the user has system touch feedback switched off.
 * The Haptics plugin and the WebView's navigator.vibrate both hit that. These pulses
 * are a feature the user turned on in the app, so they are tagged as alarm usage,
 * which Android delivers regardless of the touch-feedback setting.
 */
@CapacitorPlugin(name = "ProximityHaptics")
public class ProximityHapticsPlugin extends Plugin {

    private Vibrator vibrator;

    @Override
    public void load() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager.getDefaultVibrator();
        } else {
            vibrator = getLegacyVibrator(context);
        }
    }

    @SuppressWarnings("deprecation")
    private Vibrator getLegacyVibrator(Context context) {
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    @PluginMethod
    public void pulse(PluginCall call) {
        int duration = Math.max(5, Math.min(500, call.getInt("duration", 30)));
        if (vibrator == null || !vibrator.hasVibrator()) {
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            VibrationEffect effect = VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE);
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrateWithAudioAttributes(duration);
        } else {
            vibrateLegacy(duration);
        }
        call.resolve();
    }

    @SuppressWarnings("deprecation")
    private void vibrateWithAudioAttributes(int duration) {
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
        vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE), attributes);
    }

    @SuppressWarnings("deprecation")
    private void vibrateLegacy(int duration) {
        vibrator.vibrate(duration);
    }
}
```

### File: `android/app/src/main/AndroidManifest.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
```

### File: `AGENT-PROMPT.md`
```markdown
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
- **Motion:** plain DOM `devicemotion` + `deviceorientationabsolute` / `deviceorientation` listeners (no plugin).
- **Native plugins:** `@capacitor-community/bluetooth-le`, `@capacitor-community/keep-awake`, and the local `plugins/proximity-haptics` (installed as `file:`).
- **The active app is the repo root.** The older Expo/React Native port (`files/warmer/`) and the Kotlin reference (`android-src/`) were removed; they remain in git history if ever needed (e.g. `git show 39b0f05:files/warmer/src/lib/signal.ts`). The unused `classic-bluetooth` Kotlin module is archived in the commit titled "archive: keep the old Expo classic-bluetooth module source in history".

## Code map

| File | Role |
|---|---|
| `src/lib/signal.ts` | **Core accuracy logic.** Per-device `SignalEngine`: upper-quartile pre-filter → time-based Kalman filter → trend from a least-squares slope with t-statistic gating and hysteresis → log-distance model with a range. |
| `src/lib/bluetoothService.ts` | Starts and stops the scan (Android `SCAN_MODE_LOW_LATENCY`, duplicates allowed, **restarted every 20 s**); drops invalid RSSI. |
| `src/lib/nameResolver.ts` | Device names and types from advertisements, plus `extractReferencePower` (iBeacon / Eddystone / TX Power → expected RSSI at 1 m). |
| `src/lib/useScanner.ts` | Owns all engines, stale/lost housekeeping, search mode, per-device 1 m calibration (localStorage key `bt-locator.calibration.v1`), pinning of the hunted device. |
| `src/App.tsx` | Screen switch; follows the target when its Bluetooth address rotates (same real name, exactly one candidate). |
| `src/lib/useDeadReckoning.ts` | Step detection + heading (`forwardHeading`). |
| `src/lib/breadcrumbs.ts`, `src/lib/useTrail.ts` | Peak marks; target estimate = multilateration of each mark's distance ring when the marks spread ≥ 0.2 m across their main line, weighted centroid otherwise; steering sentence. |
| `src/lib/useClicker.ts`, `src/lib/clickInterval.ts` | Click / vibration cadence (cadence uses RSSI normalised by the device's 1 m reference). |
| `src/lib/proximityHaptics.ts`, `plugins/proximity-haptics/` | Native vibration with alarm usage (see below). |
| `src/lib/useWakeLock.ts` | Keeps the screen on while scanning (KeepAwake natively, Wake Lock API on web). |
| `src/screens/SurveyScreen.tsx`, `src/screens/HuntScreen.tsx` | The two screens. |
| `src/components/Tape.tsx`, `src/components/TrackMap.tsx` | Signal trace and trail map (plain DOM, no chart library). |
| `scripts/simulate-signal.ts` | Offline accuracy check of trend and distance; run with `npm run sim`. |
| `scripts/simulate-trail.ts` | Offline accuracy check of the Trail estimate (walked loops, compass drift, stride error); `npm run sim:trail`, `SEED=…` and `HARSH=1` for variants. |

## Hard facts: don't design around them being false

1. **There is no Bluetooth in an emulator or desktop browser.** Real behaviour can only be confirmed on a physical Android phone. Say so plainly rather than claiming something "works".
2. **Android needs Location switched on** (and the permissions granted), or scan results silently never arrive.
3. **One RSSI reading gives distance, not direction.** Direction only comes from moving (trend + trail). Never claim the app can point at a device from a single reading.
4. **The app can't make the target ring or light up.** That needs a connection and support on the device's side.
5. **Phones and earbuds rotate their Bluetooth address (~15 min).** Guessed names include the address, so they can't be matched across a rotation; only real advertised names can.
6. **A device that is off or out of battery can't be found.**

## Verified on a real phone (Pixel 8 Pro, Android 17), don't undo these

- **One long BLE scan goes deaf.** Within minutes the list dropped from 18 devices to 1 and the target read SIGNAL LOST, while Android still reported the scan as running. `bluetoothService.ts` restarts the scan every 20 s, and early (at most every 8 s) when no device at all has been heard for 4 s. Tests: 0 s lost over 5 and 10 minutes; back within 7.5 s after a forced outage. Keep restarts under 5 per 30 s (Android's limit).
- **Android's WebView never fires `deviceorientation`**, only `deviceorientationabsolute`. Without listening to the latter there is no heading and the trail can't work.
- **Short vibrations are classified as touch feedback** on Android 13+ and dropped when system touch feedback is off. That applies to `Haptics.impact`, `Haptics.vibrate` and `navigator.vibrate` alike, hence the local plugin with `USAGE_ALARM`.
- **Edge-to-edge:** Capacitor 8 injects `--safe-area-inset-*` CSS variables; headers and `#root` use them. Without them the header sits under the status bar. `theme.ts` also sets `SystemBars` style, otherwise dark mode shows dark status icons on a dark header.
- **Following an address change works live:** a PC rotated from `73:17…` to `4B:03…` mid-hunt and the app followed without dropping to SIGNAL LOST.
- **Addresses rotate constantly.** One PC used four addresses in 30 minutes. That's why calibration is keyed by the advertised name when there is one, and App.tsx follows the target to its new address.
- **Trend debounce (`TREND_HOLD_MS` = 800 ms in `signal.ts`):** a new warmer/colder direction must hold 0.8 s before it shows. Real radio, phone still, 4 min: false blips 0.4% (3–13% without it). Simulation: stationary 'steady' ~93% (was ~80%), walking detection ~1.2 s later (approach 46% vs 67% of a 9 s walk). Direction is never wrong in either case. Raise it and walking detection gets sluggish (1500 ms halved it).
- **List order:** stale devices must not be re-sorted to the bottom. Slow advertisers (phones, AirTags) then jump every second (measured ~22 reorders in 40 s; 4 in 60 s after the fix). They are dimmed instead and dropped after 25 s.
- **First run:** a clean install shows two system prompts (precise location, then Nearby devices) and scanning starts right after; verified.
- **Measured stationary performance (real radio):** ~5–6 packets/s per device, raw noise σ ≈ 3–4 dB, filtered σ ≈ 1.5 dB, trend "steady" 94% of the time.

## Testing on the connected phone (adb)

- Build and install: `npm run build && npx cap sync android && (cd android && ./gradlew assembleDebug)` then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
- The debug WebView can be driven over USB: `adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.bluetooth.locator)`, then use the Chrome DevTools protocol at `http://localhost:9333/json`. **Click elements through the DOM rather than `adb shell input tap`:** the device list reorders, and a mis-tap can open another app.
- Useful checks: `adb shell dumpsys bluetooth_manager` (scan mode and result counts), `adb shell dumpsys vibrator_manager` (whether vibrations were delivered or `ignored_for_settings`).
- Don't leave test calibrations behind: clear `localStorage['bt-locator.calibration.v1']` afterwards.

## Rules

- **Accuracy is the product.** Any change to `signal.ts`, `breadcrumbs.ts`, `useDeadReckoning.ts` or `clickInterval.ts` must:
  1. run `npm run sim` (and `npm run sim:trail` for trail code) before **and** after, and
  2. report both tables in your final message.

  Don't accept a change that raises the wrong-direction rate (colder while approaching, warmer while retreating) above ~2%, or drops "steady" while stationary below ~75%, unless you say explicitly why.
- **Don't change tuning constants silently.** The `TUNING` table, path-loss exponents, `STALE_AFTER_MS` / `LOST_AFTER_MS`, the step threshold and the peak thresholds are deliberate. If you change one, name it, give the old → new value and the reason.
- **Keep the UI honest.** Show distance as a range, show when data is stale ("SIGNAL LOST", no clicks), and label uncalibrated distances as rough. Silence must mean "no contact", never "no device".
- **Match the existing style.** Inline styles with the CSS tokens in `src/index.css` (`--c-*`), for both light and dark themes. Don't add a UI framework, router, state library or chart library.
- **Keep it small.** Don't refactor unrelated code. If you notice an unrelated problem, list it at the end instead of fixing it.
- **Don't touch** `signing/`, the release `.aab` file, or anything credential-like. Don't bump dependencies unless the task needs it.
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
```

