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
        lastResultAt = Date.now();
        // 127 means "not available" on Android; a missing RSSI is not -100 dBm.
        if (typeof result.rssi !== 'number' || result.rssi >= 0) return;
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
