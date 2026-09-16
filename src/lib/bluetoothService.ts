import { Capacitor } from '@capacitor/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

export type BluetoothDeviceRaw = {
  id: string;
  name: string | null;
  rssi: number;
  txPower?: number;
};

export type ScanCallback = (device: BluetoothDeviceRaw) => void;

let isNativeInitialized = false;

export const bluetoothService = {
  async init() {
    if (Capacitor.isNativePlatform() && !isNativeInitialized) {
      try {
        await BleClient.initialize();
        isNativeInitialized = true;
      } catch (err) {
        console.error('Failed to initialize native BleClient:', err);
        throw new Error('Bluetooth is not enabled or permission denied.');
      }
    }
  },

  async startScan(onResult: ScanCallback): Promise<() => void> {
    await this.init();

    if (Capacitor.isNativePlatform()) {
      // Native Capacitor BLE path
      await BleClient.requestLEScan({ allowDuplicates: true }, (result: ScanResult) => {
        onResult({
          id: result.device.deviceId,
          name: result.device.name ?? result.localName ?? null,
          rssi: result.rssi ?? -100,
          txPower: result.txPower ?? undefined,
        });
      });

      return () => {
        BleClient.stopLEScan().catch(console.error);
      };
    } else {
      // Web Bluetooth path
      const bt = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined;
      if (!bt) {
        throw new Error('Web Bluetooth is not supported in this browser.');
      }

      if (typeof bt.requestLEScan === 'function') {
        const listener = (ev: any) => {
          if (typeof ev.rssi !== 'number') return;
          onResult({
            id: ev.device.id,
            name: ev.name ?? ev.device.name ?? null,
            rssi: ev.rssi,
            txPower: ev.txPower,
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
        // Fallback to single device selection if requestLEScan isn't available
        const device = await bt.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['battery_service', 'device_information'],
        });

        if (typeof device.watchAdvertisements !== 'function') {
          throw new Error('This browser does not support watchAdvertisements.');
        }

        const listener = (ev: any) => {
          if (typeof ev.rssi !== 'number') return;
          onResult({
            id: device.id,
            name: ev.name ?? device.name ?? null,
            rssi: ev.rssi,
            txPower: ev.txPower,
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
