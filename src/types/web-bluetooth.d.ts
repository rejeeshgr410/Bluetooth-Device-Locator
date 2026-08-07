/**
 * Minimal Web Bluetooth typings.
 *
 * The standard TS DOM lib ships none of this, and @types/web-bluetooth omits
 * requestLEScan — which is the only API that returns more than one device.
 * Only the surface this app actually touches is declared here.
 */

interface BluetoothAdvertisingEvent extends Event {
  readonly device: BluetoothDevice;
  /** Absent on some platforms. Never substitute a value for a missing rssi. */
  readonly rssi?: number;
  readonly txPower?: number;
  readonly name?: string;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  watchAdvertisements?(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

/** Handle returned by requestLEScan. Calling stop() ends the radio scan. */
interface BluetoothLEScan {
  readonly active: boolean;
  stop(): void;
}

interface BluetoothLEScanOptions {
  acceptAllAdvertisements?: boolean;
  keepRepeatedDevices?: boolean;
  filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>;
}

interface BluetoothRequestDeviceOptions {
  acceptAllDevices?: boolean;
  optionalServices?: string[];
  filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>;
}

interface Bluetooth extends EventTarget {
  getAvailability(): Promise<boolean>;
  requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
  /**
   * Chrome only, and only behind
   * chrome://flags/#enable-experimental-web-platform-features.
   * Absent entirely when unavailable, so `typeof` is a real feature test.
   */
  requestLEScan?(options: BluetoothLEScanOptions): Promise<BluetoothLEScan>;
  addEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: 'advertisementreceived',
    listener: (ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
