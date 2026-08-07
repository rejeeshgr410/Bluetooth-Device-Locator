import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ema, STALE_AFTER_MS } from './signal';

export type Contact = {
  id: string;
  name: string | null;
  rssi: number;        // smoothed
  raw: number;         // last packet
  packets: number;
  lastSeen: number;
  history: number[];   // smoothed tape, newest last
  /** True when this reading was fabricated by the simulator, not measured. */
  simulated: boolean;
  virtualPosition?: { x: number; y: number }; // simulator only
};

/**
 * Where readings are coming from.
 *  - 'scan'        real radio, every advertiser in range (requestLEScan)
 *  - 'single'      real radio, one device the user picked (watchAdvertisements)
 *  - 'unsupported' radio present, but no way to read RSSI over time
 *  - 'simulator'   fabricated, no radio involved
 */
export type ScanMode = 'scan' | 'single' | 'unsupported' | 'simulator';

export type Capability = {
  /** navigator.bluetooth exists at all. */
  bluetooth: boolean;
  /** requestLEScan exists, so we can hear every device rather than one. */
  leScan: boolean;
  /**
   * watchAdvertisements exists, so a chosen device's RSSI can be followed.
   * Without this there is no continuous signal strength on the web at all —
   * requestDevice alone gives you a device handle, not a changing number.
   */
  advertisements: boolean;
};

/**
 * Detectable before any chooser is shown, which matters: the previous build
 * only discovered this after the user had already picked a device.
 */
function supportsAdvertisements(): boolean {
  if (typeof window === 'undefined') return false;
  const ctor = (window as unknown as { BluetoothDevice?: { prototype: object } }).BluetoothDevice;
  return !!ctor && 'watchAdvertisements' in ctor.prototype;
}

const TAPE_LENGTH = 90;

export function isStale(contact: Contact | undefined, now = Date.now()): boolean {
  return !contact || now - contact.lastSeen > STALE_AFTER_MS;
}

// Fictional devices for simulator mode. Every reading these produce is invented.
const MOCK_DEVICES: Array<{ id: string; name: string; baseRssi: number; pos: { x: number; y: number } }> = [
  { id: '4F:8A:1C:9B:42:01', name: 'AirPods Pro (2nd gen)', baseRssi: -52, pos: { x: 1.8, y: 2.4 } },
  { id: '1D:E4:70:C2:AA:02', name: 'Galaxy Watch 6', baseRssi: -68, pos: { x: -3.5, y: 1.2 } },
  // Kept inside the -95 floor so it varies instead of sitting pegged at the clamp.
  { id: '3B:90:55:FF:11:03', name: 'Tile Pro Key Tracker', baseRssi: -70, pos: { x: 3.2, y: -3.4 } },
  { id: '99:A1:00:EE:54:04', name: 'Sony WH-1000XM5', baseRssi: -61, pos: { x: -0.8, y: -2.1 } },
  { id: 'A0:B2:C3:D4:E5:05', name: 'iPhone 15 Pro', baseRssi: -44, pos: { x: 0.4, y: 0.6 } },
];

export function useScanner() {
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [scanning, setScanning] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);
  const [capability, setCapability] = useState<Capability>({
    bluetooth: false,
    leScan: false,
    advertisements: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const store = useRef<Record<string, Contact>>({});
  const dirty = useRef(true);
  const simInterval = useRef<number | null>(null);
  const userSimPos = useRef({ x: 0, y: 0 });

  // Teardown handles for the real radio.
  const leScan = useRef<BluetoothLEScan | null>(null);
  const advAbort = useRef<AbortController | null>(null);
  const advListener = useRef<((ev: BluetoothAdvertisingEvent) => void) | null>(null);
  const watchedDevice = useRef<BluetoothDevice | null>(null);

  useEffect(() => {
    const bt = typeof navigator !== 'undefined' ? navigator.bluetooth : undefined;
    const cap: Capability = {
      bluetooth: !!bt,
      leScan: !!bt && typeof bt.requestLEScan === 'function',
      advertisements: !!bt && supportsAdvertisements(),
    };
    setCapability(cap);
    if (!cap.bluetooth) setIsSimulator(true); // nothing else this browser can do
  }, []);

  /**
   * Derived, never stored: the mode is a function of what the browser can do
   * and what the user asked for, so it cannot drift out of sync with either.
   */
  const mode: ScanMode = useMemo(() => {
    if (isSimulator || !capability.bluetooth) return 'simulator';
    if (capability.leScan) return 'scan';
    return capability.advertisements ? 'single' : 'unsupported';
  }, [isSimulator, capability]);

  // Push the store into React state, but only when something actually changed.
  useEffect(() => {
    const id = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setContacts({ ...store.current });
    }, 200);
    return () => clearInterval(id);
  }, []);

  const ingest = useCallback(
    (
      id: string,
      name: string | null,
      rawRssi: number,
      simulated: boolean,
      virtualPosition?: { x: number; y: number },
    ) => {
      const prev = store.current[id];
      const smoothed = ema(prev?.rssi ?? null, rawRssi);
      const history = [...(prev?.history ?? []), smoothed].slice(-TAPE_LENGTH);
      store.current[id] = {
        id,
        name,
        rssi: smoothed,
        raw: rawRssi,
        packets: (prev?.packets ?? 0) + 1,
        lastSeen: Date.now(),
        history,
        simulated,
        virtualPosition,
      };
      dirty.current = true;
    },
    [],
  );

  const clearStore = useCallback(() => {
    store.current = {};
    dirty.current = true;
  }, []);

  /** Actually stop the radio. Without this, STOP only changed a boolean. */
  const teardownRadio = useCallback(() => {
    if (leScan.current) {
      try {
        leScan.current.stop();
      } catch {
        // already stopped
      }
      leScan.current = null;
    }
    if (advAbort.current) {
      advAbort.current.abort();
      advAbort.current = null;
    }
    if (advListener.current) {
      navigator.bluetooth?.removeEventListener('advertisementreceived', advListener.current);
      watchedDevice.current?.removeEventListener('advertisementreceived', advListener.current);
      advListener.current = null;
    }
    watchedDevice.current = null;
  }, []);

  // Simulator loop. Only ever runs when the user has explicitly chosen it.
  useEffect(() => {
    if (!scanning || !isSimulator) {
      if (simInterval.current !== null) {
        clearInterval(simInterval.current);
        simInterval.current = null;
      }
      return;
    }

    simInterval.current = window.setInterval(() => {
      MOCK_DEVICES.forEach((mock) => {
        const dx = mock.pos.x - userSimPos.current.x;
        const dy = mock.pos.y - userSimPos.current.y;
        const dist = Math.max(0.2, Math.hypot(dx, dy));

        // Log-distance path loss plus RF jitter.
        const noise = (Math.random() - 0.5) * 4.0;
        const calcRssi = Math.round(mock.baseRssi - 10 * 2.4 * Math.log10(dist) + noise);
        const rawRssi = Math.max(-95, Math.min(-35, calcRssi));

        ingest(mock.id, mock.name, rawRssi, true, mock.pos);
      });
    }, 350);

    return () => {
      if (simInterval.current !== null) {
        clearInterval(simInterval.current);
        simInterval.current = null;
      }
    };
  }, [scanning, isSimulator, ingest]);

  useEffect(() => teardownRadio, [teardownRadio]);

  /** Must be called from a user gesture: both Bluetooth entry points require one. */
  const start = useCallback(async () => {
    setError(null);
    setNotice(null);

    if (mode === 'simulator') {
      setScanning(true);
      return;
    }

    const bt = navigator.bluetooth;
    if (!bt) {
      setError('This browser has no Web Bluetooth. Switch on the simulator to see how the app behaves.');
      return;
    }

    // Known up front, so we never send anyone through a device chooser that
    // cannot lead anywhere.
    if (mode === 'unsupported') {
      setError('This browser cannot follow a device’s signal strength, so there is nothing to listen to.');
      return;
    }

    // Preferred path: hear every advertiser in range.
    if (mode === 'scan') {
      try {
        const listener = (ev: BluetoothAdvertisingEvent) => {
          // No reading, no row. Never invent a number.
          if (typeof ev.rssi !== 'number') return;
          ingest(ev.device.id, ev.name ?? ev.device.name ?? null, ev.rssi, false);
        };
        bt.addEventListener('advertisementreceived', listener);
        advListener.current = listener;
        leScan.current = await bt.requestLEScan!({
          acceptAllAdvertisements: true,
          keepRepeatedDevices: true,
        });
        setScanning(true);
      } catch (err) {
        teardownRadio();
        setScanning(false);
        const e = err as { name?: string; message?: string };
        // Match on DOMException name, not on English error text.
        if (e.name === 'NotAllowedError' || e.name === 'NotFoundError') {
          setNotice('Scan permission was declined, so nothing is being heard.');
        } else {
          setError(e.message ?? 'Could not start a Bluetooth scan.');
        }
      }
      return;
    }

    // Fallback: one device, chosen by the user in the browser's own picker.
    try {
      const device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information'],
      });
      watchedDevice.current = device;

      if (typeof device.watchAdvertisements !== 'function') {
        teardownRadio();
        setScanning(false);
        setError(
          'This browser can pick a device but cannot read its signal strength as it changes, so there is nothing to track. Chrome on Android can.',
        );
        return;
      }

      const fallbackName = device.name ?? null;
      const listener = (ev: BluetoothAdvertisingEvent) => {
        if (typeof ev.rssi !== 'number') return;
        ingest(device.id, ev.name ?? fallbackName, ev.rssi, false);
      };
      device.addEventListener('advertisementreceived', listener);
      advListener.current = listener;

      const ac = new AbortController();
      advAbort.current = ac;
      await device.watchAdvertisements({ signal: ac.signal });
      setScanning(true);
    } catch (err) {
      teardownRadio();
      setScanning(false);
      const e = err as { name?: string; message?: string };
      if (e.name === 'NotFoundError') {
        setNotice('No device chosen, so nothing is being tracked.');
      } else {
        setError(e.message ?? 'The Bluetooth request failed.');
      }
    }
  }, [mode, ingest, teardownRadio]);

  const stop = useCallback(() => {
    teardownRadio();
    clearStore();
    setScanning(false);
    setNotice(null);
  }, [teardownRadio, clearStore]);

  /**
   * Readings cannot survive a mode change: a simulated device is not evidence
   * of anything once the simulator is off. Toggling always ends the session.
   */
  const toggleSimulator = useCallback(() => {
    teardownRadio();
    clearStore();
    setScanning(false);
    setError(null);
    setNotice(null);
    setIsSimulator((v) => !v);
  }, [teardownRadio, clearStore]);

  const moveUserSimPosition = useCallback((dx: number, dy: number) => {
    userSimPos.current = {
      x: userSimPos.current.x + dx,
      y: userSimPos.current.y + dy,
    };
  }, []);

  return {
    contacts,
    scanning,
    isSimulator,
    capability,
    mode,
    error,
    notice,
    start,
    stop,
    toggleSimulator,
    moveUserSimPosition,
  };
}
