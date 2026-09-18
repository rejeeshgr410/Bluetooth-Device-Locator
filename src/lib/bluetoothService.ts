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
      await BleClient.requestLEScan(
        { allowDuplicates: true, scanMode: ScanMode.SCAN_MODE_LOW_LATENCY },
        (result: ScanResult) => {
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
        },
      );

      return () => {
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
