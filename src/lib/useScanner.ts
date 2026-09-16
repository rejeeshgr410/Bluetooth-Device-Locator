import { useState, useEffect, useRef, useCallback } from 'react';
import { bluetoothService, BluetoothDeviceRaw } from './bluetoothService';
import { SignalEngine, SignalStats, SearchMode, STALE_AFTER_MS, LOST_AFTER_MS } from './signal';

export type Contact = {
  id: string;
  name: string;
  kind: string;
  isGuessed: boolean;
  stats: SignalStats;
};

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

  const setSearchMode = useCallback((newMode: SearchMode) => {
    setSearchModeState(newMode);
    Object.values(engines.current).forEach((engine) => engine.setMode(newMode));
  }, []);

  // Housekeeping loop for stale / lost markers
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      let hasChanges = false;

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
    }, 250);

    return () => clearInterval(id);
  }, []);

  const ingest = useCallback(
    (device: BluetoothDeviceRaw) => {
      if (!engines.current[device.id]) {
        const engine = new SignalEngine();
        engine.setMode(searchMode);
        engines.current[device.id] = engine;
      }

      const engine = engines.current[device.id];
      const stats = engine.ingest(device.rssi);

      // Preserve previously better name if current one is guessed
      const existing = store.current[device.id];
      const bestName = existing && !existing.isGuessed ? existing.name : device.name;
      const bestKind = existing && existing.kind !== 'Bluetooth Device' ? existing.kind : device.kind;

      store.current[device.id] = {
        id: device.id,
        name: bestName,
        kind: bestKind,
        isGuessed: existing ? existing.isGuessed && device.isGuessed : device.isGuessed,
        stats,
      };

      dirty.current = true;
    },
    [searchMode]
  );

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
        setNotice('Notice: Android Location Services are turned off. Enabling Location in phone Settings allows detecting more BLE beacons.');
      }

      stopScanFn.current = await bluetoothService.startScan((device) => {
        ingest(device);
      });
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
  };
}
