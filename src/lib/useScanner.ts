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
      const calibrated = calibrations.current[device.id];
      if (calibrated !== undefined) engine.setReferencePower(calibrated, 'calibrated');
      engines.current[device.id] = engine;
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
    if (ref !== null) {
      calibrations.current = { ...calibrations.current, [id]: ref };
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
