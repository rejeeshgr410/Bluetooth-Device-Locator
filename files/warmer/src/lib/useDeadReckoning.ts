import { useEffect, useRef, useState } from 'react';
import { Accelerometer, Magnetometer } from 'expo-sensors';

export type Fix = { x: number; y: number; heading: number; steps: number };

const STEP_THRESHOLD = 1.14;   // g, peak of a walking bounce
const STEP_MIN_GAP_MS = 260;   // faster than this is noise, not a step
const STEP_MAX_GAP_MS = 2200;  // slower than this and you stopped walking

/**
 * Relative position by dead reckoning: count steps, point them in the
 * direction the phone is facing, accumulate.
 *
 * Absolute north does not matter here — the map is drawn relative to where
 * the hunt started, so a magnetometer that reads 20 degrees off is still
 * perfectly usable as long as it is consistently 20 degrees off. Hold the
 * phone flat, screen up, and walk normally.
 */
export function useDeadReckoning(opts: { active: boolean; stride?: number }) {
  const { active, stride = 0.72 } = opts;
  const [fix, setFix] = useState<Fix>({ x: 0, y: 0, heading: 0, steps: 0 });
  const [available, setAvailable] = useState<boolean | null>(null);

  const heading = useRef(0);
  const pos = useRef({ x: 0, y: 0, steps: 0 });
  const smoothed = useRef(1);
  const armed = useRef(true);
  const lastStep = useRef(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([Accelerometer.isAvailableAsync(), Magnetometer.isAvailableAsync()]).then(
      ([a, m]) => mounted && setAvailable(a && m),
    );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    Magnetometer.setUpdateInterval(120);
    const magSub = Magnetometer.addListener(({ x, y }) => {
      const deg = (Math.atan2(y, x) * 180) / Math.PI;
      const next = (deg + 360) % 360;
      // Shortest-arc low pass, so the value does not spin at the 0/360 seam.
      let delta = next - heading.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      heading.current = (heading.current + delta * 0.25 + 360) % 360;
    });

    Accelerometer.setUpdateInterval(20);
    const accSub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      smoothed.current = smoothed.current * 0.8 + magnitude * 0.2;
      const now = Date.now();
      const gap = now - lastStep.current;

      if (armed.current && smoothed.current > STEP_THRESHOLD && gap > STEP_MIN_GAP_MS) {
        armed.current = false;
        lastStep.current = now;
        const rad = (heading.current * Math.PI) / 180;
        pos.current = {
          x: pos.current.x + stride * Math.sin(rad),
          y: pos.current.y + stride * Math.cos(rad),
          steps: pos.current.steps + 1,
        };
      }
      if (smoothed.current < 1.02) armed.current = true;
      if (gap > STEP_MAX_GAP_MS) armed.current = true;
    });

    const ui = setInterval(() => {
      setFix({ ...pos.current, heading: heading.current });
    }, 200);

    return () => {
      magSub.remove();
      accSub.remove();
      clearInterval(ui);
    };
  }, [active, stride]);

  function reset() {
    pos.current = { x: 0, y: 0, steps: 0 };
    setFix({ x: 0, y: 0, heading: heading.current, steps: 0 });
  }

  return { fix, available, reset };
}
