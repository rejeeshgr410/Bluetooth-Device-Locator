import { Platform } from 'react-native';
import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type ClassicDevice = {
  /** MAC address. Unlike BLE, Classic addresses are stable, not randomised. */
  id: string;
  name: string | null;
  rssi: number;
};

/** A device this phone is paired with, advertising or not. */
export type BondedDevice = {
  id: string;
  name: string | null;
  /** 'classic' cannot report RSSI over GATT; 'le' and 'dual' can. */
  type: 'classic' | 'le' | 'dual' | 'unknown';
};

type ClassicBluetoothEvents = {
  onDeviceFound: (device: ClassicDevice) => void;
  onDiscoveryFinished: () => void;
};

declare class ClassicBluetoothNativeModule extends NativeModule<ClassicBluetoothEvents> {
  isSupported(): boolean;
  getBondedDevices(): BondedDevice[];
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
}

/**
 * Android only. On any other platform this resolves to null and callers should
 * simply skip Classic discovery rather than branch everywhere.
 */
let mod: ClassicBluetoothNativeModule | null = null;
if (Platform.OS === 'android') {
  try {
    mod = requireNativeModule<ClassicBluetoothNativeModule>('ClassicBluetooth');
  } catch {
    // Module not present in this binary (e.g. running an older dev client).
    mod = null;
  }
}

export const ClassicBluetooth = mod;
export default mod;
