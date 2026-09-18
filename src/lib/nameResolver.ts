import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Bluetooth SIG Company Identifier Codes
const COMPANY_NAMES: Record<number, string> = {
  0x004c: 'Apple',
  0x0075: 'Samsung',
  0x00e0: 'Google',
  0x0006: 'Microsoft',
  0x002d: 'Sony',
  0x009e: 'Bose',
  0x0157: 'Anker Soundcore',
  0x0087: 'Garmin',
  0x038f: 'Xiaomi',
  0x01d6: 'Huawei',
  0x027d: 'Huawei',
  0x0382: 'Tile',
  0x0822: 'OnePlus',
  0x08f0: 'Nothing',
  0x000a: 'Qualcomm',
  0x0059: 'Nordic Semi',
  0x000d: 'Texas Instruments',
  0x0171: 'Amazon',
  0x02a1: 'Espressif (ESP32)',
  0x02e5: 'Sennheiser',
  0x0312: 'JBL / Harman',
  0x01ab: 'Fitbit',
  0x006b: 'Polar',
  0x0499: 'Ruuvi',
  0x0008: 'Motorola',
  0x0001: 'Nokia',
  0x0002: 'Intel',
  0x0030: 'STMicroelectronics',
  0x0046: 'MediaTek',
  0x005d: 'Realtek',
  0x00b5: 'Swirl Networks',
  0x0131: 'Cypress Semi',
};

// Well-known 16-bit BLE service UUIDs (SIG-assigned), with the device kind they imply
const SERVICE_NAMES: Record<string, { label: string; kind: string }> = {
  'fe2c': { label: 'Google Fast Pair Device', kind: 'Earbuds' },
  'fef3': { label: 'Google Device', kind: 'Bluetooth Device' },
  'fe9f': { label: 'Google Home / Nest', kind: 'Audio' },
  'fd5a': { label: 'Samsung SmartTag', kind: 'Tracker' },
  'fd69': { label: 'Samsung Find Device', kind: 'Tracker' },
  'feed': { label: 'Tile Tracker', kind: 'Tracker' },
  'feec': { label: 'Tile Tracker', kind: 'Tracker' },
  'fe03': { label: 'Amazon Echo / Alexa Device', kind: 'Audio' },
  'fe07': { label: 'Sonos Speaker', kind: 'Audio' },
  'fe95': { label: 'Xiaomi Device', kind: 'Bluetooth Device' },
  'fe59': { label: 'Nordic DFU Device', kind: 'Bluetooth Device' },
  '184e': { label: 'LE Audio Device', kind: 'Earbuds' },
  '1850': { label: 'LE Audio Device', kind: 'Earbuds' },
  '180d': { label: 'Heart Rate Monitor', kind: 'Watch' },
  '1812': { label: 'Wireless Mouse / Keyboard', kind: 'Bluetooth Device' },
  'fee0': { label: 'Mi Smart Band', kind: 'Watch' },
  'fee7': { label: 'Tencent / WeChat BLE', kind: 'Bluetooth Device' },
  'feaa': { label: 'Eddystone Beacon', kind: 'Tracker' },
  '1802': { label: 'Proximity Alert Tag', kind: 'Tracker' },
  '1803': { label: 'Link Loss Tag', kind: 'Tracker' },
  'fd6f': { label: 'Exposure Notification Phone', kind: 'Phone' },
  '180f': { label: 'Battery Service Device', kind: 'Bluetooth Device' },
  '180a': { label: 'Device Information Sensor', kind: 'Bluetooth Device' },
};

// Runtime cache of resolved device names by device ID (MAC)
const nameCache = new Map<string, string>();
const kindCache = new Map<string, string>();
const bondedDevicesCache = new Map<string, string>();

let bondedFetched = false;

/**
 * Fetch and cache Android system paired/bonded devices.
 */
export async function refreshBondedDevices(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const bonded = await BleClient.getBondedDevices();
    if (bonded && Array.isArray(bonded)) {
      for (const d of bonded) {
        if (d.name && d.name.trim().length > 0) {
          bondedDevicesCache.set(d.deviceId.toUpperCase(), d.name.trim());
          nameCache.set(d.deviceId.toUpperCase(), d.name.trim());
        }
      }
    }
    bondedFetched = true;
  } catch (err) {
    console.warn('Could not fetch bonded devices:', err);
  }
}

/**
 * Format a MAC address into a compact identifier like "[A4:8F]"
 */
export function formatMacShort(id: string): string {
  const clean = id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length >= 4) {
    const end = clean.slice(-4);
    return `[${end.slice(0, 2)}:${end.slice(2)}]`;
  }
  return `[${id.slice(-4)}]`;
}

/**
 * Parse company ID from manufacturerData object
 */
function extractCompanyId(manufacturerData?: Record<string, DataView>): number | null {
  if (!manufacturerData) return null;
  const keys = Object.keys(manufacturerData);
  if (keys.length === 0) return null;

  for (const key of keys) {
    // Key could be decimal string "76" or hex "0x004c"
    const parsed = key.startsWith('0x') ? parseInt(key, 16) : parseInt(key, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * Apple Continuity: the payload is a sequence of (type, length, value) records.
 * Walk all of them and keep the most specific. Order = priority.
 */
const APPLE_TYPES: [number, string, string][] = [
  [0x12, 'Apple Find My (AirTag or lost Apple device)', 'Tracker'],
  [0x07, 'Apple AirPods / Beats', 'Earbuds'],
  [0x02, 'Apple iBeacon', 'Tracker'],
  [0x0b, 'Apple Watch', 'Watch'],
  [0x09, 'Apple TV / HomePod (AirPlay)', 'Audio'],
  [0x06, 'Apple HomeKit Accessory', 'Bluetooth Device'],
  [0x0c, 'Apple iPhone / iPad / Mac', 'Phone'],
  [0x10, 'Apple iPhone / iPad / Mac', 'Phone'],
  [0x0f, 'Apple iPhone / iPad', 'Phone'],
  [0x05, 'Apple iPhone / iPad / Mac', 'Phone'],
];

function decodeApplePayload(data?: DataView): { name: string; kind: string } | null {
  if (!data || data.byteLength < 2) return null;
  const seen = new Set<number>();
  try {
    let i = 0;
    while (i + 1 < data.byteLength) {
      const type = data.getUint8(i);
      const len = data.getUint8(i + 1);
      seen.add(type);
      i += 2 + len;
    }
  } catch {
    // truncated record; use what we parsed
  }
  for (const [type, name, kind] of APPLE_TYPES) {
    if (seen.has(type)) return { name, kind };
  }
  return { name: 'Apple Device', kind: 'Bluetooth Device' };
}

/** Samsung's own sub-types aren't documented; don't guess the product. */
function decodeSamsungPayload(data?: DataView): { name: string; kind: string } | null {
  if (!data || data.byteLength < 1) return null;
  return { name: 'Samsung Galaxy Device', kind: 'Bluetooth Device' };
}

const MICROSOFT_CDP_TYPES: Record<number, [string, string]> = {
  1: ['Xbox', 'Bluetooth Device'],
  6: ['iPhone (Microsoft Phone Link)', 'Phone'],
  7: ['iPad (Microsoft Phone Link)', 'Tablet'],
  8: ['Android Phone (Phone Link)', 'Phone'],
  9: ['Windows Desktop PC', 'Laptop'],
  11: ['Windows Phone', 'Phone'],
  12: ['Linux PC', 'Laptop'],
  13: ['Windows IoT Device', 'Bluetooth Device'],
  14: ['Surface Hub', 'Laptop'],
  15: ['Windows Laptop', 'Laptop'],
  16: ['Windows Tablet', 'Tablet'],
};

/**
 * Microsoft: 0x01 = Connected Devices Platform beacon (device type in the low bits of
 * byte 1); 0x03 = Swift Pair, which carries the accessory's display name.
 */
function decodeMicrosoftPayload(data?: DataView): { name: string; kind: string; real?: boolean } | null {
  if (!data || data.byteLength < 2) return null;
  try {
    const scenario = data.getUint8(0);
    if (scenario === 0x01) {
      const t = MICROSOFT_CDP_TYPES[data.getUint8(1) & 0x1f];
      if (t) return { name: t[0], kind: t[1] };
    }
    if (scenario === 0x03 && data.byteLength > 3) {
      const sub = data.getUint8(1);
      const start = sub === 0x01 ? 6 : 3; // 0x01 carries a 3-byte class-of-device first
      const bytes = new Uint8Array(data.buffer, data.byteOffset + start, Math.max(0, data.byteLength - start));
      const name = new TextDecoder().decode(bytes).replace(/\0+$/, '').trim();
      if (name.length >= 2 && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(name)) {
        return { name, kind: classifyDeviceKind(name), real: true };
      }
    }
  } catch {
    // malformed
  }
  return null;
}

/**
 * Determine high-level category of device
 */
export function classifyDeviceKind(name: string | null): string {
  const n = (name ?? '').toLowerCase();
  if (/airpod|buds|headphone|earphone|wh-|wf-|beats|soundcore|tune|freebuds|shokz|headset/.test(n)) {
    return 'Earbuds';
  }
  if (/watch|band|fit|garmin|polar|tracker|mi smart|galaxy watch|apple watch/.test(n)) {
    return 'Watch';
  }
  if (/phone|iphone|galaxy|pixel|redmi|oneplus|xperia|xiaomi/.test(n)) {
    return 'Phone';
  }
  if (/ipad|tablet|tab\b|surface/.test(n)) {
    return 'Tablet';
  }
  if (/macbook|laptop|thinkpad|dell|pc|desktop/.test(n)) {
    return 'Laptop';
  }
  if (/airtag|smarttag|tile|beacon|tag|finder|tracker|ibeacon|eddystone/.test(n)) {
    return 'Tracker';
  }
  if (/speaker|soundbar|jbl|bose|echo|nest|homepod|alexa|audio|tv|stereo/.test(n)) {
    return 'Audio';
  }
  return 'Bluetooth Device';
}

/**
 * Comprehensive resolver that guarantees a clean, human-friendly, identifiable name for every device.
 */
export function resolveDeviceIdentity(result: ScanResult): { name: string; kind: string; isGuessed: boolean } {
  const idUpper = result.device.deviceId.toUpperCase();
  const shortMac = formatMacShort(idUpper);

  // 1. Direct advertised name
  const rawName = (result.localName ?? result.device.name ?? '').trim();
  if (rawName.length > 0 && rawName !== 'null' && rawName !== 'undefined') {
    nameCache.set(idUpper, rawName);
    const kind = classifyDeviceKind(rawName);
    kindCache.set(idUpper, kind);
    return { name: rawName, kind, isGuessed: false };
  }

  // 2. Previously cached name
  if (nameCache.has(idUpper)) {
    const cachedName = nameCache.get(idUpper)!;
    return {
      name: cachedName,
      kind: kindCache.get(idUpper) ?? classifyDeviceKind(cachedName),
      isGuessed: false,
    };
  }

  // 3. Android Bonded / Paired Device match
  if (bondedDevicesCache.has(idUpper)) {
    const bondedName = bondedDevicesCache.get(idUpper)!;
    nameCache.set(idUpper, bondedName);
    const kind = classifyDeviceKind(bondedName);
    kindCache.set(idUpper, kind);
    return { name: bondedName, kind, isGuessed: false };
  }

  // 4. Decode Manufacturer Data
  const companyId = extractCompanyId(result.manufacturerData);
  if (companyId !== null) {
    // Special decoders
    if (companyId === 0x004c) { // Apple
      const appleData = result.manufacturerData ? Object.values(result.manufacturerData)[0] : undefined;
      const decoded = decodeApplePayload(appleData);
      if (decoded) {
        const full = `${decoded.name} ${shortMac}`;
        kindCache.set(idUpper, decoded.kind);
        return { name: full, kind: decoded.kind, isGuessed: true };
      }
    } else if (companyId === 0x0006) { // Microsoft
      const decoded = decodeMicrosoftPayload(result.manufacturerData?.['6']);
      if (decoded?.real) {
        nameCache.set(idUpper, decoded.name);
        kindCache.set(idUpper, decoded.kind);
        return { name: decoded.name, kind: decoded.kind, isGuessed: false };
      }
      if (decoded) {
        kindCache.set(idUpper, decoded.kind);
        return { name: `${decoded.name} ${shortMac}`, kind: decoded.kind, isGuessed: true };
      }
    } else if (companyId === 0x0075) { // Samsung
      const samsungData = result.manufacturerData ? Object.values(result.manufacturerData)[0] : undefined;
      const decoded = decodeSamsungPayload(samsungData);
      if (decoded) {
        const full = `${decoded.name} ${shortMac}`;
        kindCache.set(idUpper, decoded.kind);
        return { name: full, kind: decoded.kind, isGuessed: true };
      }
    }

    const companyName = COMPANY_NAMES[companyId];
    if (companyName) {
      const full = `${companyName} Device ${shortMac}`;
      const kind = companyName.includes('Audio') ? 'Audio' : 'Bluetooth Device';
      kindCache.set(idUpper, kind);
      return { name: full, kind, isGuessed: true };
    }
  }

  // 5. Decode Advertised Service UUIDs
  if (result.uuids && result.uuids.length > 0) {
    for (const uuid of result.uuids) {
      const short = shortUuid(uuid);
      const known = short ? SERVICE_NAMES[short] : undefined;
      if (known) {
        kindCache.set(idUpper, known.kind);
        return { name: `${known.label} ${shortMac}`, kind: known.kind, isGuessed: true };
      }
    }
  }

  // 5b. Service data keys identify many devices that advertise no UUID list
  for (const uuid of Object.keys(result.serviceData ?? {})) {
    const short = shortUuid(uuid);
    const known = short ? SERVICE_NAMES[short] : undefined;
    if (known) {
      kindCache.set(idUpper, known.kind);
      return { name: `${known.label} ${shortMac}`, kind: known.kind, isGuessed: true };
    }
  }

  // 6. Final Clean Fallback: Clean Tag with formatted MAC address
  const fallback = `Bluetooth Device ${shortMac}`;
  return { name: fallback, kind: 'Bluetooth Device', isGuessed: true };
}

/** "0000180f-0000-1000-8000-00805f9b34fb" -> "180f"; custom 128-bit UUIDs -> null. */
function shortUuid(uuid: string): string | null {
  const u = uuid.toLowerCase();
  if (/^[0-9a-f]{4}$/.test(u)) return u;
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/.exec(u);
  return m ? m[1] : null;
}

/**
 * Expected RSSI at 1 m, when the advertisement tells us.
 * - iBeacon carries a calibrated "measured power" byte.
 * - Eddystone UID/URL carry TX power at 0 m; free-space loss to 1 m at 2.4 GHz is ~41 dB.
 * - The generic TX Power Level field is power at the antenna, same 41 dB correction.
 */
export function extractReferencePower(result: ScanResult): number | undefined {
  try {
    const apple = result.manufacturerData?.['76'];
    if (apple && apple.byteLength >= 23 && apple.getUint8(0) === 0x02 && apple.getUint8(1) === 0x15) {
      const measured = apple.getInt8(22);
      if (measured < -20 && measured > -110) return measured;
    }

    if (result.serviceData) {
      for (const [uuid, data] of Object.entries(result.serviceData)) {
        if (shortUuid(uuid) !== 'feaa' || data.byteLength < 2) continue;
        const frame = data.getUint8(0);
        if (frame === 0x00 || frame === 0x10) {
          const tx0 = data.getInt8(1);
          if (tx0 > -100 && tx0 < 20) return tx0 - 41;
        }
      }
    }

    const tx = result.txPower;
    if (typeof tx === 'number' && tx !== 127 && tx > -30 && tx < 21) return tx - 41;
  } catch {
    // malformed payload
  }
  return undefined;
}
