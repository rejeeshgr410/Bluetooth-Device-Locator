import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export type Fix = { x: number; y: number; heading: number; steps: number };

export type SensorQuality = 'GOOD' | 'LIMITED' | 'UNAVAILABLE';
export type MotionPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';

const STEP_THRESHOLD = 1.14;   // g, peak of a walking bounce
const STEP_MIN_GAP_MS = 260;   // faster than this is noise
const STEP_MAX_GAP_MS = 2200;  // slower than this and you stopped walking

/**
 * Heading (clockwise degrees) of the direction the user is facing, from W3C device
 * orientation. Alpha alone is only right when the phone lies flat, and it runs
 * counter-clockwise; held tilted in front of you, the horizontal projection of the
 * back of the phone is the direction you are walking.
 */
export function forwardHeading(
  alpha: number | null | undefined,
  beta: number | null | undefined,
  gamma: number | null | undefined,
): number | null {
  if (alpha === null || alpha === undefined) return null;
  const rad = Math.PI / 180;
  const x = (beta ?? 0) * rad;
  const y = (gamma ?? 0) * rad;
  const z = alpha * rad;
  const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
  const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
  if (Math.hypot(vx, vy) < 0.35) {
    // Close to flat: the top edge of the phone points forward.
    return (360 - alpha) % 360;
  }
  const deg = (Math.atan2(vx, vy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function useDeadReckoning(opts: { active: boolean; initialStride?: number }) {
  const { active, initialStride = 0.72 } = opts;
  const [fix, setFix] = useState<Fix>({ x: 0, y: 0, heading: 0, steps: 0 });
  const [permission, setPermission] = useState<MotionPermission>('unsupported');
  const [quality, setQuality] = useState<SensorQuality>('UNAVAILABLE');
  
  const [stride, setStrideState] = useState(initialStride);

  const lastMotionRef = useRef(0);
  const lastOrientationRef = useRef(0);
  const headingRef = useRef(0);
  const posRef = useRef({ x: 0, y: 0, steps: 0 });
  const smoothedRef = useRef(1);
  const armedRef = useRef(true);
  const lastStepRef = useRef(0);

  const listenersRef = useRef<any[]>([]);

  useEffect(() => {
    // Check if motion is supported
    if (Capacitor.isNativePlatform()) {
      setPermission('granted'); // Capacitor plugins handle permissions internally or don't need them for basic motion on Android
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      const g = DeviceMotionEvent as any;
      if (typeof g.requestPermission === 'function') {
        setPermission('prompt');
      } else {
        setPermission('granted');
      }
    } else {
      setPermission('unsupported');
    }
  }, []);

  const requestAccess = useCallback(async () => {
    if (permission === 'unsupported' || Capacitor.isNativePlatform()) return;
    
    try {
      const m = DeviceMotionEvent as any;
      const o = DeviceOrientationEvent as any;
      let p1 = 'granted', p2 = 'granted';
      
      if (typeof m.requestPermission === 'function') p1 = await m.requestPermission();
      if (typeof o.requestPermission === 'function') p2 = await o.requestPermission();
      
      setPermission(p1 === 'granted' && p2 === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermission('denied');
    }
  }, [permission]);

  useEffect(() => {
    if (!active || permission !== 'granted') return;

    const attach = async () => {
      // Clear previous
      for (const handle of listenersRef.current) {
        if (handle?.remove) handle.remove();
      }
      listenersRef.current = [];

      try {
        // Plain DOM listeners on every platform (@capacitor/motion is only a wrapper
        // over these). Step detection needs gravity included: `acceleration` has it
        // removed, so its magnitude never crosses the 1.14 g threshold.
        const onMotion = (e: DeviceMotionEvent) => {
          const acc = e.accelerationIncludingGravity;
          if (acc) handleAccel(acc.x ?? null, acc.y ?? null, acc.z ?? null);
        };
        // Android's WebView never fires 'deviceorientation', only the compass-referenced
        // 'deviceorientationabsolute'. Prefer absolute once seen, so the two reference
        // frames are never mixed.
        let sawAbsolute = false;
        const onAbsolute = (e: DeviceOrientationEvent) => {
          sawAbsolute = true;
          handleOrientation(forwardHeading(e.alpha, e.beta, e.gamma));
        };
        const onRelative = (e: DeviceOrientationEvent) => {
          if (sawAbsolute) return;
          const ios = (e as any).webkitCompassHeading;
          handleOrientation(typeof ios === 'number' ? ios : forwardHeading(e.alpha, e.beta, e.gamma));
        };
        window.addEventListener('devicemotion', onMotion);
        window.addEventListener('deviceorientationabsolute' as any, onAbsolute);
        window.addEventListener('deviceorientation', onRelative);
        listenersRef.current.push({
          remove: () => {
            window.removeEventListener('devicemotion', onMotion);
            window.removeEventListener('deviceorientationabsolute' as any, onAbsolute);
            window.removeEventListener('deviceorientation', onRelative);
          },
        });
      } catch (err) {
        console.warn('Motion sensor attach failed', err);
      }
    };

    function handleOrientation(alpha: number | null | undefined) {
      if (alpha === null || alpha === undefined) return;
      lastOrientationRef.current = Date.now();
      
      let delta = alpha - headingRef.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      headingRef.current = (headingRef.current + delta * 0.25 + 360) % 360;
    }

    function handleAccel(x: number | null, y: number | null, z: number | null) {
      if (x === null || y === null || z === null) return;
      lastMotionRef.current = Date.now();

      // Convert m/s^2 to g
      const gx = x / 9.81;
      const gy = y / 9.81;
      const gz = z / 9.81;
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

    attach();

    const uiInterval = setInterval(() => {
      setFix({ ...posRef.current, heading: headingRef.current });
      
      const now = Date.now();
      const hasAccel = now - lastMotionRef.current < 2000;
      // Orientation events only fire when the reading changes; a phone lying still can go
      // silent indefinitely, so any reading since attaching means the compass works.
      const hasOrient = lastOrientationRef.current > 0;

      if (hasAccel && hasOrient) {
        setQuality('GOOD');
      } else if (hasAccel && !hasOrient) {
        setQuality('LIMITED');
      } else {
        setQuality('UNAVAILABLE');
      }
    }, 200);

    return () => {
      for (const handle of listenersRef.current) {
        if (handle?.remove) handle.remove();
      }
      listenersRef.current = [];
      clearInterval(uiInterval);
      setQuality('UNAVAILABLE');
    };
  }, [active, stride, permission]);

  const calibrateStride = useCallback((metersWalked: number, stepsTaken: number) => {
    if (stepsTaken > 0 && metersWalked > 0) {
      const newStride = metersWalked / stepsTaken;
      setStrideState(newStride);
      return newStride;
    }
    return stride;
  }, [stride]);

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

  return { fix, permission, quality, stride, requestAccess, reset, simulateStep, setHeading, calibrateStride };
}
