import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { bluetoothService, BluetoothDeviceRaw } from './bluetoothService';
import { SignalEngine, SignalStats, kindOf, STALE_AFTER_MS, LOST_AFTER_MS } from './signal';

export type ScanMode = 'scan' | 'simulator' | 'unsupported';

export type Contact = {
  id: string;
  name: string | null;
  kind: string;
  simulated: boolean;
  virtualPosition?: { x: number; y: number };
  stats: SignalStats;
};

// Mock devices for Simulator
const MOCK_DEVICES = [
  { id: 'sim-1', name: 'AirPods Pro', baseRssi: -65, pos: { x: 3, y: 5 } },
  { id: 'sim-2', name: 'Galaxy Watch', baseRssi: -72, pos: { x: -2, y: 8 } },
];

export function useScanner() {
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [scanning, setScanning] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const engines = useRef<Record<string, SignalEngine>>({});
  const store = useRef<Record<string, Contact>>({});
  const dirty = useRef(false);

  const stopScanFn = useRef<(() => void) | null>(null);
  const simInterval = useRef<number | null>(null);
  const userSimPos = useRef({ x: 0, y: 0 });

  const mode: ScanMode = useMemo(() => {
    return isSimulator ? 'simulator' : 'scan';
  }, [isSimulator]);
  
  const [searchMode, setSearchModeState] = useState<import('./signal').SearchMode>('ROOM_SWEEP');

  const setSearchMode = useCallback((newMode: import('./signal').SearchMode) => {
    setSearchModeState(newMode);
    Object.values(engines.current).forEach(engine => engine.setMode(newMode));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      let hasChanges = false;
      
      // Mark stale/lost devices
      for (const key of Object.keys(store.current)) {
        const contact = store.current[key];
        const age = now - contact.stats.lastSeen;
        
        if (age > LOST_AFTER_MS) {
          delete store.current[key];
          delete engines.current[key];
          hasChanges = true;
        } else if (age > STALE_AFTER_MS && !contact.stats.isStale) {
          store.current[key].stats.isStale = true;
          hasChanges = true;
        }
      }

      if (dirty.current || hasChanges) {
        dirty.current = false;
        setContacts({ ...store.current });
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  const ingest = useCallback((device: BluetoothDeviceRaw, simulated: boolean, virtualPos?: {x: number, y: number}) => {
    if (!engines.current[device.id]) {
      const engine = new SignalEngine();
      engine.setMode(searchMode);
      engines.current[device.id] = engine;
    }
    
    const engine = engines.current[device.id];
    const stats = engine.ingest(device.rssi);
    
    store.current[device.id] = {
      id: device.id,
      name: device.name,
      kind: kindOf(device.name),
      simulated,
      virtualPosition: virtualPos,
      stats,
    };
    
    dirty.current = true;
  }, [searchMode]);

  const clearStore = useCallback(() => {
    store.current = {};
    engines.current = {};
    dirty.current = true;
  }, []);

  const teardownRadio = useCallback(() => {
    if (stopScanFn.current) {
      stopScanFn.current();
      stopScanFn.current = null;
    }
  }, []);

  // Simulator loop
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

        // Simulated noise and path loss
        const noise = (Math.random() - 0.5) * 4.0;
        const calcRssi = Math.round(mock.baseRssi - 10 * 2.4 * Math.log10(dist) + noise);
        const rawRssi = Math.max(-95, Math.min(-35, calcRssi));

        ingest({ id: mock.id, name: mock.name, rssi: rawRssi }, true, mock.pos);
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

  const start = useCallback(async () => {
    setError(null);
    setNotice(null);

    if (mode === 'simulator') {
      setScanning(true);
      return;
    }

    try {
      stopScanFn.current = await bluetoothService.startScan((device) => {
        ingest(device, false);
      });
      setScanning(true);
    } catch (err: any) {
      teardownRadio();
      setScanning(false);
      setError(err.message ?? 'Could not start Bluetooth scan.');
    }
  }, [mode, ingest, teardownRadio]);

  const stop = useCallback(() => {
    teardownRadio();
    clearStore();
    setScanning(false);
    setNotice(null);
  }, [teardownRadio, clearStore]);

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
    mode,
    searchMode,
    error,
    notice,
    start,
    stop,
    toggleSimulator,
    moveUserSimPosition,
    setSearchMode,
  };
}
