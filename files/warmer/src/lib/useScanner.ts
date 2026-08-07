import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { ema, STALE_AFTER_MS } from './signal';

export type Contact = {
  id: string;
  name: string | null;
  rssi: number;        // smoothed
  raw: number;         // last packet
  packets: number;
  lastSeen: number;
  history: number[];   // smoothed tape, newest last
};

const TAPE_LENGTH = 90;

/** Android needs runtime permission before any scan will return results. */
export async function requestScanPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Platform.Version as number;
  const wanted =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export function useScanner() {
  const manager = useMemo(() => new BleManager(), []);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [scanning, setScanning] = useState(false);
  const [radio, setRadio] = useState<State>(State.Unknown);
  const [error, setError] = useState<string | null>(null);
  const store = useRef<Record<string, Contact>>({});

  useEffect(() => {
    const sub = manager.onStateChange((s) => setRadio(s), true);
    return () => {
      sub.remove();
      manager.stopDeviceScan();
      manager.destroy();
    };
  }, [manager]);

  // Flush the mutable store into React state on a fixed tick, so a busy
  // room does not cause a render per advertising packet.
  useEffect(() => {
    const id = setInterval(() => setContacts({ ...store.current }), 200);
    return () => clearInterval(id);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const ok = await requestScanPermission();
    if (!ok) {
      setError('Bluetooth permission was denied. Grant it in Settings to scan.');
      return;
    }
    store.current = {};
    setScanning(true);
    manager.startDeviceScan(null, { allowDuplicates: true }, (err, device: Device | null) => {
      if (err) {
        setError(err.message);
        setScanning(false);
        return;
      }
      if (!device || device.rssi == null) return;
      const prev = store.current[device.id];
      const smoothed = ema(prev?.rssi ?? null, device.rssi);
      const history = [...(prev?.history ?? []), smoothed].slice(-TAPE_LENGTH);
      store.current[device.id] = {
        id: device.id,
        name: device.name ?? device.localName ?? prev?.name ?? null,
        rssi: smoothed,
        raw: device.rssi,
        packets: (prev?.packets ?? 0) + 1,
        lastSeen: Date.now(),
        history,
      };
    });
  }, [manager]);

  const stop = useCallback(() => {
    manager.stopDeviceScan();
    // Clear the store too. Rows are filtered on lastSeen, so without this a
    // stopped scan still showed devices for another twenty seconds — readings
    // that are no longer being taken.
    store.current = {};
    setContacts({});
    setScanning(false);
  }, [manager]);

  return { contacts, scanning, radio, error, start, stop };
}

export function isStale(contact: Contact | undefined, now = Date.now()): boolean {
  return !contact || now - contact.lastSeen > STALE_AFTER_MS;
}
