import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Motion } from '@capacitor/motion';

export type Fix = { x: number; y: number; heading: number; steps: number };

export type SensorQuality = 'GOOD' | 'LIMITED' | 'UNAVAILABLE';
export type MotionPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';

const STEP_THRESHOLD = 1.14;   // g, peak of a walking bounce
const STEP_MIN_GAP_MS = 260;   // faster than this is noise
const STEP_MAX_GAP_MS = 2200;  // slower than this and you stopped walking

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
        if (Capacitor.isNativePlatform()) {
          const accelHandle = await Motion.addListener('accel', (event) => {
            handleAccel(event.acceleration.x, event.acceleration.y, event.acceleration.z);
          });
          const orientHandle = await Motion.addListener('orientation', (event) => {
            handleOrientation(event.alpha);
          });
          listenersRef.current.push(accelHandle, orientHandle);
        } else {
          const webAccel = (e: DeviceMotionEvent) => {
            const acc = e.accelerationIncludingGravity || e.acceleration;
            if (acc) handleAccel(acc.x, acc.y, acc.z);
          };
          const webOrient = (e: DeviceOrientationEvent) => {
            let deg = e.alpha;
            if ((e as any).webkitCompassHeading !== undefined) {
              deg = (e as any).webkitCompassHeading;
            } else if (deg !== null) {
              deg = (360 - deg) % 360;
            }
            handleOrientation(deg);
          };
          window.addEventListener('devicemotion', webAccel);
          window.addEventListener('deviceorientation', webOrient);
          listenersRef.current.push({
            remove: () => {
              window.removeEventListener('devicemotion', webAccel);
              window.removeEventListener('deviceorientation', webOrient);
            }
          });
        }
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
      const hasOrient = now - lastOrientationRef.current < 2000;

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
