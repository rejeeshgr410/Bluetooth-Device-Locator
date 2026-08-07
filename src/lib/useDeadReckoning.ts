import { useEffect, useRef, useState, useCallback } from 'react';

export type Fix = { x: number; y: number; heading: number; steps: number };

/**
 * 'prompt'      iOS 13+: sensors exist but need an explicit, gesture-driven grant
 * 'granted'     listeners will fire
 * 'denied'      user said no; dead reckoning cannot work
 * 'unsupported' no motion sensors at all (most desktops)
 */
export type MotionPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';

const STEP_THRESHOLD = 1.14;   // g, peak of a walking bounce
const STEP_MIN_GAP_MS = 260;   // faster than this is noise
const STEP_MAX_GAP_MS = 2200;  // slower than this and you stopped walking

/** iOS exposes requestPermission() as a static on the event constructors. */
type PermissionGated = { requestPermission?: () => Promise<'granted' | 'denied'> };

function gatedMotion(): PermissionGated | undefined {
  return typeof DeviceMotionEvent !== 'undefined'
    ? (DeviceMotionEvent as unknown as PermissionGated)
    : undefined;
}

function gatedOrientation(): PermissionGated | undefined {
  return typeof DeviceOrientationEvent !== 'undefined'
    ? (DeviceOrientationEvent as unknown as PermissionGated)
    : undefined;
}

/**
 * Relative position by dead reckoning: count steps, point them in the
 * direction the phone is facing, accumulate.
 */
export function useDeadReckoning(opts: { active: boolean; stride?: number }) {
  const { active, stride = 0.72 } = opts;
  const [fix, setFix] = useState<Fix>({ x: 0, y: 0, heading: 0, steps: 0 });
  const [permission, setPermission] = useState<MotionPermission>('unsupported');
  /**
   * Granted is not the same as working. Desktop Chrome defines
   * DeviceMotionEvent and needs no grant, then never fires a single event —
   * which looked identical to "still gathering marks" in the previous build.
   */
  const [receiving, setReceiving] = useState(false);

  const lastMotionRef = useRef(0);
  const headingRef = useRef(0);
  const posRef = useRef({ x: 0, y: 0, steps: 0 });
  const smoothedRef = useRef(1);
  const armedRef = useRef(true);
  const lastStepRef = useRef(0);

  /**
   * Note the distinction the previous build missed: `'DeviceMotionEvent' in
   * window` is true on iOS whether or not the user has granted access, so it
   * reported the sensors as available while every listener stayed silent.
   */
  useEffect(() => {
    const motion = gatedMotion();
    if (!motion) {
      setPermission('unsupported');
      return;
    }
    setPermission(typeof motion.requestPermission === 'function' ? 'prompt' : 'granted');
  }, []);

  /** Must be called from a user gesture — iOS rejects it otherwise. */
  const requestAccess = useCallback(async () => {
    const motion = gatedMotion();
    const orientation = gatedOrientation();

    if (!motion) {
      setPermission('unsupported');
      return;
    }
    if (typeof motion.requestPermission !== 'function') {
      setPermission('granted'); // no gate on this platform
      return;
    }

    try {
      const motionGrant = await motion.requestPermission();
      // Orientation is a separate grant on iOS. Without it there is no
      // heading, and steps with no heading are not a position.
      let orientationGrant: 'granted' | 'denied' = 'granted';
      if (typeof orientation?.requestPermission === 'function') {
        orientationGrant = await orientation.requestPermission();
      }
      setPermission(motionGrant === 'granted' && orientationGrant === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermission('denied');
    }
  }, []);

  useEffect(() => {
    if (!active || permission !== 'granted') return;

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
      lastMotionRef.current = Date.now();
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      // Convert m/s^2 to g
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

    // Give the sensors a grace period before declaring them silent.
    lastMotionRef.current = Date.now() + 2000;

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);

    const uiInterval = setInterval(() => {
      setFix({ ...posRef.current, heading: headingRef.current });
      setReceiving(Date.now() - lastMotionRef.current < 2000);
    }, 200);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
      clearInterval(uiInterval);
      setReceiving(false);
    };
  }, [active, stride, permission]);

  /** Manual step trigger for the desktop / simulator walker. */
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

  return { fix, permission, receiving, requestAccess, reset, simulateStep, setHeading };
}
