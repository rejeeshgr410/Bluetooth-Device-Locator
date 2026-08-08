import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Permission } from 'react-native';
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

/**
 * What is actually stopping us, if anything. The previous version collapsed
 * all of this into a single `radioOn` boolean, so a missing runtime permission
 * was reported as "Bluetooth is off" — sending you to toggle a radio that was
 * already on, with no mention of the permission that was really missing.
 */
export type RadioStatus =
  | 'checking'
  | 'ready'
  | 'needsPermission'
  | 'off'
  | 'unsupported';

const TAPE_LENGTH = 90;

/** Android 12+ replaced the location-based Bluetooth permissions. */
function wantedPermissions(): Permission[] {
  if (Platform.OS !== 'android') return [];
  const api = Platform.Version as number;
  return api >= 31
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

/** Check without prompting, so launching the app does not throw up a dialog. */
export async function hasScanPermission(): Promise<boolean> {
  const wanted = wantedPermissions();
  if (wanted.length === 0) return true;
  const results = await Promise.all(wanted.map((p) => PermissionsAndroid.check(p)));
  return results.every(Boolean);
}

export async function requestScanPermission(): Promise<boolean> {
  const wanted = wantedPermissions();
  if (wanted.length === 0) return true;
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export function useScanner() {
  const manager = useMemo(() => new BleManager(), []);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [scanning, setScanning] = useState(false);
  const [bleState, setBleState] = useState<State>(State.Unknown);
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const store = useRef<Record<string, Contact>>({});

  useEffect(() => {
    let alive = true;
    hasScanPermission().then((ok) => alive && setPermitted(ok));
    const sub = manager.onStateChange((s) => alive && setBleState(s), true);
    return () => {
      alive = false;
      sub.remove();
      manager.stopDeviceScan();
      manager.destroy();
    };
  }, [manager]);

  /**
   * Permission first, then re-read the adapter. Without the explicit re-read
   * the state stays whatever it was when we had no right to look — granting
   * permission does not itself change the adapter, so onStateChange may never
   * fire again and the UI would stay stuck on the wrong answer.
   */
  const requestPermission = useCallback(async () => {
    setError(null);
    const ok = await requestScanPermission();
    setPermitted(ok);
    if (ok) {
      try {
        setBleState(await manager.state());
      } catch {
        // leave the subscription to correct it
      }
    }
    return ok;
  }, [manager]);

  const status: RadioStatus =
    permitted === null || bleState === State.Unknown
      ? 'checking'
      : bleState === State.Unsupported
        ? 'unsupported'
        : !permitted || bleState === State.Unauthorized
          ? 'needsPermission'
          : bleState === State.PoweredOn
            ? 'ready'
            : 'off';

  // Flush the mutable store into React state on a fixed tick, so a busy
  // room does not cause a render per advertising packet.
  useEffect(() => {
    const id = setInterval(() => setContacts({ ...store.current }), 200);
    return () => clearInterval(id);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!(await requestPermission())) {
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
  }, [manager, requestPermission]);

  const stop = useCallback(() => {
    manager.stopDeviceScan();
    // Clear the store too. Rows are filtered on lastSeen, so without this a
    // stopped scan still showed devices for another twenty seconds — readings
    // that are no longer being taken.
    store.current = {};
    setContacts({});
    setScanning(false);
  }, [manager]);

  return { contacts, scanning, status, error, start, stop, requestPermission };
}

export function isStale(contact: Contact | undefined, now = Date.now()): boolean {
  return !contact || now - contact.lastSeen > STALE_AFTER_MS;
}
