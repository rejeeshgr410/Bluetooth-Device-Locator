/**
 * Identifying devices that advertise no name.
 *
 * Most BLE advertisers never include a Local Name — it costs precious bytes in
 * a 31-byte packet. But nearly all of them include *manufacturer data*, whose
 * first two bytes are a Bluetooth SIG company identifier. That will not tell
 * you it is "Ravi's AirPods", but "Apple device" beats "Unnamed" by a mile when
 * you are staring at forty identical rows.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 → bytes. RN has no atob and we only need the first few bytes. */
export function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let i = 0;
  for (let k = 0; k < clean.length; k++) {
    const v = B64.indexOf(clean[k]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[i++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, i);
}

/**
 * Bluetooth SIG assigned company identifiers. Deliberately a short list of ones
 * worth recognising rather than the full 3000-entry registry — anything not
 * here still gets its hex id shown, which is more use than nothing.
 */
const COMPANIES: Record<number, string> = {
  0x0001: 'Ericsson',
  0x0006: 'Microsoft',
  0x000d: 'Texas Instruments',
  0x000f: 'Broadcom',
  0x001d: 'Qualcomm',
  0x0059: 'Nordic Semiconductor',
  0x004c: 'Apple',
  0x0075: 'Samsung',
  0x0078: 'Nike',
  0x0087: 'Garmin',
  0x009e: 'Bose',
  0x00e0: 'Google',
  0x0157: 'Huami / Amazfit',
  0x0171: 'Amazon',
  0x02e5: 'Espressif',
  0x038f: 'Xiaomi',
  0x05a7: 'Sonos',
};

/** Company id from the first two bytes of manufacturer data (little endian). */
export function companyIdOf(manufacturerData: string | null | undefined): number | null {
  if (!manufacturerData) return null;
  const bytes = b64ToBytes(manufacturerData);
  if (bytes.length < 2) return null;
  return bytes[0] | (bytes[1] << 8);
}

export function vendorOf(manufacturerData: string | null | undefined): string | null {
  const id = companyIdOf(manufacturerData);
  if (id === null) return null;
  const known = COMPANIES[id];
  if (known) return known;
  return `Vendor 0x${id.toString(16).padStart(4, '0').toUpperCase()}`;
}

/** A couple of service UUIDs common enough to be worth naming. */
export function serviceHintOf(serviceUUIDs: string[] | null | undefined): string | null {
  if (!serviceUUIDs || serviceUUIDs.length === 0) return null;
  const short = serviceUUIDs.map((u) => u.toLowerCase().slice(4, 8));
  if (short.includes('feaa')) return 'Eddystone beacon';
  if (short.includes('fe2c')) return 'Fast Pair';
  return null;
}

/**
 * Best available label for a device, in descending order of trustworthiness.
 * Returns null only when we genuinely know nothing at all.
 */
export function describe(opts: {
  name?: string | null;
  localName?: string | null;
  manufacturerData?: string | null;
  serviceUUIDs?: string[] | null;
}): string | null {
  const real = opts.name ?? opts.localName;
  if (real && real.trim()) return real.trim();
  const hint = serviceHintOf(opts.serviceUUIDs);
  const vendor = vendorOf(opts.manufacturerData);
  if (vendor && hint) return `${vendor} · ${hint}`;
  return vendor ?? hint;
}
