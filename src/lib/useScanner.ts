import { useCallback, useEffect, useRef, useState } from 'react';
import { ema, STALE_AFTER_MS } from './signal';

export type Contact = {
  id: string;
  name: string | null;
  rssi: number;        // smoothed
  raw: number;         // last packet
  packets: number;
  lastSeen: number;
  history: number[];   // smoothed tape, newest last
  virtualPosition?: { x: number; y: number }; // For simulator mode
};

const TAPE_LENGTH = 90;

export function isStale(contact: Contact | undefined, now = Date.now()): boolean {
  return !contact || now - contact.lastSeen > STALE_AFTER_MS;
}

// Initial set of simulated Bluetooth devices
const MOCK_DEVICES: Array<{ id: string; name: string; baseRssi: number; pos: { x: number; y: number } }> = [
  { id: '4F:8A:1C:9B:42:01', name: 'AirPods Pro (2nd gen)', baseRssi: -52, pos: { x: 1.8, y: 2.4 } },
  { id: '1D:E4:70:C2:AA:02', name: 'Galaxy Watch 6', baseRssi: -68, pos: { x: -3.5, y: 1.2 } },
  { id: '3B:90:55:FF:11:03', name: 'Tile Pro Key Tracker', baseRssi: -78, pos: { x: 4.2, y: -5.0 } },
  { id: '99:A1:00:EE:54:04', name: 'Sony WH-1000XM5', baseRssi: -61, pos: { x: -0.8, y: -2.1 } },
  { id: 'A0:B2:C3:D4:E5:05', name: 'iPhone 15 Pro', baseRssi: -44, pos: { x: 0.4, y: 0.6 } },
];

export function useScanner() {
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [scanning, setScanning] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);
  const [webBtSupported, setWebBtSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const store = useRef<Record<string, Contact>>({});
  const simInterval = useRef<number | null>(null);
  const userSimPos = useRef({ x: 0, y: 0 }); // User position in simulator

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      setWebBtSupported(true);
    } else {
      setWebBtSupported(false);
      setIsSimulator(true); // Default to simulator if Web Bluetooth is unavailable
    }
  }, []);

  // Flush store into React state every 200ms
  useEffect(() => {
    const id = setInterval(() => {
      setContacts({ ...store.current });
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Simulator loop when active and scanning
  useEffect(() => {
    if (!scanning || !isSimulator) {
      if (simInterval.current !== null) {
        clearInterval(simInterval.current);
        simInterval.current = null;
      }
      return;
    }

    simInterval.current = window.setInterval(() => {
      const now = Date.now();
      MOCK_DEVICES.forEach((mock) => {
        // Calculate RSSI based on distance + random RF noise
        const dx = mock.pos.x - userSimPos.current.x;
        const dy = mock.pos.y - userSimPos.current.y;
        const dist = Math.max(0.2, Math.hypot(dx, dy));
        
        // Log-distance formula + random jitter
        const noise = (Math.random() - 0.5) * 4.0;
        const calcRssi = Math.round(mock.baseRssi - 10 * 2.4 * Math.log10(dist) + noise);
        const rawRssi = Math.max(-95, Math.min(-35, calcRssi));

        const prev = store.current[mock.id];
        const smoothed = ema(prev?.rssi ?? null, rawRssi);
        const history = [...(prev?.history ?? []), smoothed].slice(-TAPE_LENGTH);

        store.current[mock.id] = {
          id: mock.id,
          name: mock.name,
          rssi: smoothed,
          raw: rawRssi,
          packets: (prev?.packets ?? 0) + 1,
          lastSeen: now,
          history,
          virtualPosition: mock.pos,
        };
      });
    }, 350);

    return () => {
      if (simInterval.current !== null) {
        clearInterval(simInterval.current);
        simInterval.current = null;
      }
    };
  }, [scanning, isSimulator]);

  const start = useCallback(async () => {
    setError(null);

    if (isSimulator || !webBtSupported) {
      setScanning(true);
      return;
    }

    // Try Web Bluetooth with watchAdvertisements for continuous RSSI
    try {
      setScanning(true);

      const navBt = (navigator as unknown as { bluetooth: { requestDevice: (opts: object) => Promise<{ id: string; name?: string; watchAdvertisements?: (opts?: object) => Promise<void>; addEventListener: (type: string, listener: EventListener) => void }> } }).bluetooth;
      const device = await navBt.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information']
      });

      if (device) {
        const id = device.id || 'WEB-BLE-DEVICE';
        const name = device.name || 'Discovered BLE Device';

        // Try watchAdvertisements for continuous RSSI (experimental API)
        if (typeof device.watchAdvertisements === 'function') {
          device.addEventListener('advertisementreceived', ((e: Event) => {
            const evt = e as Event & { rssi?: number };
            const rawRssi = evt.rssi ?? -62;
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
            };
          }) as EventListener);
          await device.watchAdvertisements();
        } else {
          // Fallback: single reading then switch to simulator
          const rawRssi = -62;
          const prev = store.current[id];
          const smoothed = ema(prev?.rssi ?? null, rawRssi);
          const history = [...(prev?.history ?? []), smoothed].slice(-TAPE_LENGTH);
          store.current[id] = {
            id, name, rssi: smoothed, raw: rawRssi,
            packets: (prev?.packets ?? 0) + 1,
            lastSeen: Date.now(), history,
          };
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Web Bluetooth request cancelled or failed.';
      if (msg.includes('cancelled') || msg.includes('User cancelled')) {
        // User closed prompt, fall back seamlessly to simulator
        setIsSimulator(true);
      } else {
        setError(msg);
      }
    }
  }, [isSimulator, webBtSupported]);

  const stop = useCallback(() => {
    setScanning(false);
  }, []);

  const toggleSimulator = useCallback(() => {
    setIsSimulator((v) => !v);
  }, []);

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
    webBtSupported,
    error,
    start,
    stop,
    toggleSimulator,
    moveUserSimPosition,
  };
}
