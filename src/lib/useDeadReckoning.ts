import { useEffect, useRef, useState, useCallback } from 'react';

export type Fix = { x: number; y: number; heading: number; steps: number };

const STEP_THRESHOLD = 1.14;   // g, peak of a walking bounce
const STEP_MIN_GAP_MS = 260;   // faster than this is noise
const STEP_MAX_GAP_MS = 2200;  // slower than this and you stopped walking

/**
 * Relative position by dead reckoning: count steps, point them in the
 * direction the phone is facing, accumulate.
 */
export function useDeadReckoning(opts: { active: boolean; stride?: number }) {
  const { active, stride = 0.72 } = opts;
  const [fix, setFix] = useState<Fix>({ x: 0, y: 0, heading: 0, steps: 0 });
  const [available, setAvailable] = useState<boolean | null>(null);

  const headingRef = useRef(0);
  const posRef = useRef({ x: 0, y: 0, steps: 0 });
  const smoothedRef = useRef(1);
  const armedRef = useRef(true);
  const lastStepRef = useRef(0);

  // Check Web Device Motion / Orientation availability
  useEffect(() => {
    const hasMotion = typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
    setAvailable(hasMotion);
  }, []);

  // Web Motion & Orientation Event Listeners
  useEffect(() => {
    if (!active) return;

    function handleOrientation(e: DeviceOrientationEvent) {
      const evt = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let deg = 0;
      if (evt.webkitCompassHeading !== undefined && evt.webkitCompassHeading !== null) {
        deg = evt.webkitCompassHeading;
      } else if (e.alpha !== null) {
        deg = (360 - e.alpha) % 360;
      }

      // Shortest-arc low pass filter
      let delta = deg - headingRef.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      headingRef.current = (headingRef.current + delta * 0.25 + 360) % 360;
    }

    function handleMotion(e: DeviceMotionEvent) {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      // Convert m/s^2 to g (divide by 9.81)
      const gx = acc.x / 9.81;
      const gy = acc.y / 9.81;
      const gz = acc.z / 9.81;
      const magnitude = Math.sqrt(gx * gx + gy * gy + gz * gz);

      smoothedRef.current = smoothedRef.current * 0.8 + magnitude * 0.2;
      const now = Date.now();
      const gap = now - lastStepRef.current;

      if (armedRef.current && smoothedRef.current > STEP_THRESHOLD && gap > STEP_MIN_GAP_MS) {
        armedRef.current = false;
        lastStepRef.current = now;
        const rad = (headingRef.current * Math.PI) / 180;
        posRef.current = {
          x: posRef.current.x + stride * Math.sin(rad),
          y: posRef.current.y + stride * Math.cos(rad),
          steps: posRef.current.steps + 1,
        };
      }
      if (smoothedRef.current < 1.02) armedRef.current = true;
      if (gap > STEP_MAX_GAP_MS) armedRef.current = true;
    }

    if (typeof window !== 'undefined' && 'addEventListener' in window) {
      window.addEventListener('deviceorientation', handleOrientation);
      window.addEventListener('devicemotion', handleMotion);
    }

    const uiInterval = setInterval(() => {
      setFix({ ...posRef.current, heading: headingRef.current });
    }, 200);

    return () => {
      if (typeof window !== 'undefined' && 'removeEventListener' in window) {
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('devicemotion', handleMotion);
      }
      clearInterval(uiInterval);
    };
  }, [active, stride]);

  // Manual step trigger for browser simulation/testing
  const simulateStep = useCallback((headingDegrees?: number) => {
    if (headingDegrees !== undefined) {
      headingRef.current = (headingDegrees + 360) % 360;
    }
    const rad = (headingRef.current * Math.PI) / 180;
    posRef.current = {
      x: posRef.current.x + stride * Math.sin(rad),
      y: posRef.current.y + stride * Math.cos(rad),
      steps: posRef.current.steps + 1,
    };
    setFix({ ...posRef.current, heading: headingRef.current });
  }, [stride]);

  const setHeading = useCallback((deg: number) => {
    headingRef.current = (deg + 360) % 360;
    setFix((prev) => ({ ...prev, heading: headingRef.current }));
  }, []);

  const reset = useCallback(() => {
    posRef.current = { x: 0, y: 0, steps: 0 };
    setFix({ x: 0, y: 0, heading: headingRef.current, steps: 0 });
  }, []);

  return { fix, available, reset, simulateStep, setHeading };
}
