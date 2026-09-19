import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeadReckoning } from './useDeadReckoning';
import { Crumb, detectPeak, estimate as estimateFrom } from './breadcrumbs';

const SAMPLE_MS = 400;
const TRACK_LIMIT = 400;

export function useTrail(opts: { rssi: number | null; refPower?: number; active: boolean; stride?: number }) {
  const { rssi, refPower, active, stride: initialStride } = opts;
  const { fix, permission, quality, stride, requestAccess, reset: resetFix, simulateStep, setHeading, calibrateStride } =
    useDeadReckoning({ active, initialStride });

  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [track, setTrack] = useState<{ x: number; y: number }[]>([]);
  const peak = useRef<{ x: number; y: number; rssi: number } | null>(null);
  const nextId = useRef(1);
  const latest = useRef({ rssi, refPower, fix, active });
  latest.current = { rssi, refPower, fix, active };

  useEffect(() => {
    const id = setInterval(() => {
      const { rssi: r, fix: f, active: on } = latest.current;
      if (!on || r === null) return;

      setTrack((prev) => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(f.x - last.x, f.y - last.y) < 0.25) return prev;
        return [...prev, { x: f.x, y: f.y }].slice(-TRACK_LIMIT);
      });

      const { candidate, commit } = detectPeak(peak.current, { x: f.x, y: f.y, rssi: r });
      peak.current = candidate;
      if (commit) {
        setCrumbs((prev) => [
          ...prev,
          { id: nextId.current++, x: commit.x, y: commit.y, rssi: commit.rssi, ref: latest.current.refPower, at: Date.now(), manual: false },
        ]);
      }
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const dropManual = useCallback(() => {
    const { rssi: r, fix: f, refPower: ref } = latest.current;
    if (r === null) return;
    setCrumbs((prev) => [
      ...prev,
      { id: nextId.current++, x: f.x, y: f.y, rssi: r, ref, at: Date.now(), manual: true },
    ]);
  }, []);

  const clear = useCallback(() => {
    setCrumbs([]);
    setTrack([]);
    peak.current = null;
    resetFix();
  }, [resetFix]);

  const estimate = useMemo(() => estimateFrom(crumbs), [crumbs]);

  return {
    fix,
    permission,
    quality,
    stride,
    calibrateStride,
    requestAccess,
    crumbs,
    track,
    estimate,
    dropManual,
    clear,
    simulateStep,
    setHeading,
  };
}
