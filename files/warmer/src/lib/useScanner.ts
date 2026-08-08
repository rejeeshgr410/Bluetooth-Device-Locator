import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Permission } from 'react-native';
import {
  BleManager,
  Device,
  State,
  ScanMode,
  ScanCallbackType,
} from 'react-native-ble-plx';
import { ema, staleWindow } from './signal';
import { describe } from './vendors';
import { ClassicBluetooth, type ClassicDevice } from '../../modules/classic-bluetooth';
import type { EventSubscription } from 'expo-modules-core';

export type Contact = {
  id: string;
  /** The advertised Local Name, if the device ever sends one. Often null. */
  name: string | null;
  /** Best available display label: real name, else vendor/service, else Unnamed. */
  label: string;
  /** Found via Classic (BR/EDR) inquiry rather than an LE scan. */
  classic: boolean;
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
  const [classicError, setClassicError] = useState<string | null>(null);
  const store = useRef<Record<string, Contact>>({});
  const classicSubs = useRef<EventSubscription[]>([]);
  const classicWanted = useRef(false);

  useEffect(() => {
    let alive = true;
    hasScanPermission().then((ok) => alive && setPermitted(ok));
    const sub = manager.onStateChange((s) => alive && setBleState(s), true);
    return () => {
      alive = false;
      sub.remove();
      classicWanted.current = false;
      classicSubs.current.forEach((s) => s.remove());
      classicSubs.current = [];
      ClassicBluetooth?.stopDiscovery().catch(() => {});
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

  const ingest = useCallback((device: Device) => {
    if (device.rssi == null) return;
    const prev = store.current[device.id];
    const smoothed = ema(prev?.rssi ?? null, device.rssi);
    const history = [...(prev?.history ?? []), smoothed].slice(-TAPE_LENGTH);

    // Names are sticky. A device that advertised its name once but omits it
    // from later packets should not flicker back to "Unnamed" — the 31-byte
    // advertising budget means many devices only include the name sometimes.
    const name = device.name ?? device.localName ?? prev?.name ?? null;
    const label =
      describe({
        name,
        localName: device.localName,
        manufacturerData: device.manufacturerData,
        serviceUUIDs: device.serviceUUIDs,
      }) ??
      prev?.label ??
      'Unnamed';

    store.current[device.id] = {
      id: device.id,
      name,
      label,
      classic: false,
      rssi: smoothed,
      raw: device.rssi,
      packets: (prev?.packets ?? 0) + 1,
      lastSeen: Date.now(),
      history,
    };
  }, []);

  /**
   * Classic inquiry gives one sample per device per ~12s burst, so there is no
   * meaningful packet cadence to smooth. Take the reading as-is rather than
   * running it through the EMA, which would lag badly at one sample per burst.
   */
  const ingestClassic = useCallback((d: ClassicDevice) => {
    const prev = store.current[d.id];
    const name = d.name ?? prev?.name ?? null;
    const history = [...(prev?.history ?? []), d.rssi].slice(-TAPE_LENGTH);
    store.current[d.id] = {
      id: d.id,
      name,
      label: name ?? prev?.label ?? 'Unnamed (Classic)',
      classic: true,
      rssi: d.rssi,
      raw: d.rssi,
      packets: (prev?.packets ?? 0) + 1,
      lastSeen: Date.now(),
      history,
    };
  }, []);

  /**
   * Classic discovery runs in bursts and then stops itself, so keeping it going
   * means restarting on every onDiscoveryFinished. `classicWanted` guards that
   * loop: without it, a stop() that lands mid-burst would be undone by the
   * finish event that arrives a moment later.
   */
  const startClassic = useCallback(() => {
    const mod = ClassicBluetooth;
    if (!mod || !mod.isSupported()) return;

    classicWanted.current = true;

    if (classicSubs.current.length === 0) {
      classicSubs.current.push(
        mod.addListener('onDeviceFound', ingestClassic),
        mod.addListener('onDiscoveryFinished', () => {
          if (classicWanted.current) {
            mod.startDiscovery().catch(() => {});
          }
        }),
      );
    }

    mod.startDiscovery().catch((e: unknown) => {
      // Classic is a bonus channel: if it will not start, the LE scan carries
      // on rather than the whole hunt failing.
      setClassicError(e instanceof Error ? e.message : 'Classic Bluetooth discovery unavailable');
      classicWanted.current = false;
    });
  }, [ingestClassic]);

  const stopClassic = useCallback(() => {
    classicWanted.current = false;
    classicSubs.current.forEach((s) => s.remove());
    classicSubs.current = [];
    ClassicBluetooth?.stopDiscovery().catch(() => {});
  }, []);

  /**
   * `legacy` false asks Android for extended advertisements too — Bluetooth 5
   * devices are invisible to a legacy-only scan. Not all radios support it, and
   * an unsupported request fails the whole scan, so we fall back once.
   */
  const beginScan = useCallback(
    (legacy: boolean) => {
      manager.startDeviceScan(
        null,
        {
          // The old code passed only allowDuplicates, which is iOS-only, so on
          // Android this silently ran in the default LowPower mode: results
          // batched and delayed by seconds. LowLatency is the right mode for a
          // foreground hunt.
          scanMode: ScanMode.LowLatency,
          callbackType: ScanCallbackType.AllMatches,
          allowDuplicates: true, // iOS
          legacyScan: legacy,
        },
        (err, device: Device | null) => {
          if (err) {
            if (!legacy) {
              // This radio cannot do extended advertising. Retry legacy-only.
              manager.stopDeviceScan();
              beginScan(true);
              return;
            }
            setError(err.message);
            setScanning(false);
            return;
          }
          if (device) ingest(device);
        },
      );
    },
    [manager, ingest],
  );

  const start = useCallback(async () => {
    setError(null);
    if (!(await requestPermission())) {
      setError('Bluetooth permission was denied. Grant it in Settings to scan.');
      return;
    }
    store.current = {};
    setScanning(true);
    beginScan(false);
    startClassic();
  }, [manager, requestPermission, beginScan, startClassic]);

  const stop = useCallback(() => {
    manager.stopDeviceScan();
    stopClassic();
    // Clear the store too. Rows are filtered on lastSeen, so without this a
    // stopped scan still showed devices for another twenty seconds — readings
    // that are no longer being taken.
    store.current = {};
    setContacts({});
    setScanning(false);
  }, [manager]);

  return {
    contacts,
    scanning,
    status,
    error,
    classicError,
    classicSupported: !!ClassicBluetooth,
    start,
    stop,
    requestPermission,
  };
}

export function isStale(contact: Contact | undefined, now = Date.now()): boolean {
  return !contact || now - contact.lastSeen > staleWindow(contact.classic);
}
