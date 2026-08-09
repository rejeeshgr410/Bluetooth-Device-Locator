import { useCallback, useEffect, useRef, useState } from 'react';
import { Magnetometer } from 'expo-sensors';

/**
 * Bearing to a transmitter, found by turning around.
 *
 * A phone has one antenna, so it cannot do angle-of-arrival — that needs an
 * array and phase comparison, which Bluetooth 5.1 defines but no phone exposes.
 * What a phone does have is a body attached to it. Tissue absorbs 2.4 GHz
 * strongly: 10-20 dB when you stand between the phone and the source. Turn
 * slowly through a full circle and the smoothed RSSI peaks when the phone is
 * pointed at the transmitter and troughs when you are eclipsing it.
 *
 * That is real direction finding, and it is also crude. Multipath in a room
 * puts energy where the transmitter is not, so treat the result as a sector to
 * walk into, never a line to follow. The UI draws a wedge for exactly this
 * reason.
 */

const SECTORS = 24; // 15 degrees each
const SECTOR_DEG = 360 / SECTORS;
const MIN_COVERAGE = 0.6;

export type DirectionConfidence = 'none' | 'low' | 'fair' | 'good';

export type DirectionFix = {
  /** Degrees clockwise from north, or null until there is enough to say. */
  bearing: number | null;
  confidence: DirectionConfidence;
  /** Half-width of the wedge to draw, in degrees. Wider means less certain. */
  spread: number;
  /** 0..1 — how much of the circle has been sampled. */
  coverage: number;
  sampling: boolean;
  /** Live compass heading, so the dial can counter-rotate. */
  heading: number;
  /** Peak minus mean, in dB. The whole basis for confidence. */
  prominence: number;
};

/** Shortest signed difference between two bearings. */
function angleDelta(a: number, b: number): number {
  let d = ((a - b + 540) % 360) - 180;
  return d;
}

export function useDirectionScan(rssi: number | null) {
  const [fix, setFix] = useState<DirectionFix>({
    bearing: null,
    confidence: 'none',
    spread: 60,
    coverage: 0,
    sampling: false,
    heading: 0,
    prominence: 0,
  });

  const heading = useRef(0);
  const best = useRef<Array<number | null>>(new Array(SECTORS).fill(null));
  const sampling = useRef(false);
  const latestRssi = useRef(rssi);
  latestRssi.current = rssi;

  // Compass runs whenever the screen is up, so the dial can orient itself even
  // before a direction scan is started.
  useEffect(() => {
    Magnetometer.setUpdateInterval(120);
    const sub = Magnetometer.addListener(({ x, y }) => {
      const deg = (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
      // Shortest-arc low pass, so it does not spin at the 0/360 seam.
      const d = angleDelta(deg, heading.current);
      heading.current = (heading.current + d * 0.2 + 360) % 360;
    });
    return () => sub.remove();
  }, []);

  const compute = useCallback(() => {
    const bins = best.current;
    const seen = bins.filter((v): v is number => v !== null);
    const coverage = seen.length / SECTORS;

    if (seen.length < 4) {
      return { bearing: null as number | null, confidence: 'none' as DirectionConfidence, spread: 60, coverage, prominence: 0 };
    }

    // Circular 3-sector smoothing: a single lucky packet should not decide the
    // answer, and neighbouring sectors genuinely share the same lobe.
    const smoothed = bins.map((_, i) => {
      const vals: number[] = [];
      for (let k = -1; k <= 1; k++) {
        const v = bins[(i + k + SECTORS) % SECTORS];
        if (v !== null) vals.push(v);
      }
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });

    let peakIdx = -1;
    let peakVal = -Infinity;
    smoothed.forEach((v, i) => {
      if (v !== null && v > peakVal) {
        peakVal = v;
        peakIdx = i;
      }
    });
    if (peakIdx < 0) {
      return { bearing: null as number | null, confidence: 'none' as DirectionConfidence, spread: 60, coverage, prominence: 0 };
    }

    const present = smoothed.filter((v): v is number => v !== null);
    const mean = present.reduce((a, b) => a + b, 0) / present.length;
    const prominence = peakVal - mean;

    let confidence: DirectionConfidence = 'low';
    if (coverage < MIN_COVERAGE) confidence = 'none';
    else if (prominence >= 6) confidence = 'good';
    else if (prominence >= 3) confidence = 'fair';

    // A flat sweep means the room is full of reflections, or you are very
    // close. Either way the honest answer is a wide wedge.
    const spread = Math.max(18, Math.min(70, 70 - prominence * 7));

    return {
      bearing: (peakIdx * SECTOR_DEG + SECTOR_DEG / 2) % 360,
      confidence,
      spread,
      coverage,
      prominence,
    };
  }, []);

  // Sample loop: one reading per tick into whichever sector we are facing.
  useEffect(() => {
    const id = setInterval(() => {
      const h = heading.current;
      if (sampling.current) {
        const r = latestRssi.current;
        if (r !== null) {
          const idx = Math.floor((((h % 360) + 360) % 360) / SECTOR_DEG) % SECTORS;
          const prev = best.current[idx];
          // Keep the best reading per sector. RSSI only ever drops from
          // obstruction, so the maximum is the closest thing to a clean sample.
          best.current[idx] = prev === null ? r : Math.max(prev, r);
        }
      }
      const result = sampling.current
        ? compute()
        : null;
      setFix((f) => ({
        ...f,
        heading: h,
        sampling: sampling.current,
        ...(result ?? {}),
      }));
    }, 200);
    return () => clearInterval(id);
  }, [compute]);

  const start = useCallback(() => {
    best.current = new Array(SECTORS).fill(null);
    sampling.current = true;
    setFix((f) => ({ ...f, sampling: true, bearing: null, confidence: 'none', coverage: 0, prominence: 0 }));
  }, []);

  const cancel = useCallback(() => {
    sampling.current = false;
    setFix((f) => ({ ...f, sampling: false }));
  }, []);

  return { ...fix, start, cancel };
}
