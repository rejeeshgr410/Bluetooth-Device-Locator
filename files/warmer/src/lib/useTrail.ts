import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeadReckoning } from './useDeadReckoning';
import { Crumb, detectPeak, estimate as estimateFrom } from './breadcrumbs';
import { gridLocate, calibrateTxPower, DEFAULT_TX_POWER, type Sample } from './locate';

const SAMPLE_MS = 400;
const TRACK_LIMIT = 400;
const SAMPLE_LIMIT = 600;

export function useTrail(opts: {
  rssi: number | null;
  active: boolean;
  stride?: number;
  /** Reference power at 1 m for THIS device, from calibration. */
  txPower?: number;
}) {
  const { rssi, active, stride, txPower } = opts;
  const { fix, available, reset: resetFix } = useDeadReckoning({ active, stride });

  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [track, setTrack] = useState<{ x: number; y: number }[]>([]);
  /*
   * Every reading, not just the peaks.
   *
   * Peak-picking discarded the averaging that beats 6 dB of shadowing:
   * five hand-chosen marks carry far less information than two hundred
   * ordinary ones. Simulation put the peak-and-least-squares approach at
   * 36 m of error where the full-sample likelihood grid managed 7 m, and
   * 1.3 m of distance error once the reference power was calibrated.
   */
  const [samples, setSamples] = useState<Sample[]>([]);
  const peak = useRef<{ x: number; y: number; rssi: number } | null>(null);
  const nextId = useRef(1);
  const latest = useRef({ rssi, fix, active });
  latest.current = { rssi, fix, active };

  useEffect(() => {
    const id = setInterval(() => {
      const { rssi: r, fix: f, active: on } = latest.current;
      if (!on || r == null) return;

      setSamples((prev) => [...prev, { x: f.x, y: f.y, rssi: r }].slice(-SAMPLE_LIMIT));

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
          { id: nextId.current++, x: commit.x, y: commit.y, rssi: commit.rssi, at: Date.now(), manual: false },
        ]);
      }
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const dropManual = useCallback(() => {
    const { rssi: r, fix: f } = latest.current;
    if (r == null) return;
    setCrumbs((prev) => [
      ...prev,
      { id: nextId.current++, x: f.x, y: f.y, rssi: r, at: Date.now(), manual: true },
    ]);
  }, []);

  const clear = useCallback(() => {
    setCrumbs([]);
    setTrack([]);
    setSamples([]);
    peak.current = null;
    resetFix();
  }, [resetFix]);

  /**
   * Likelihood-grid fix over every sample, falling back to the crumb estimate
   * until there is enough spread to work with.
   */
  const located = useMemo(
    () => gridLocate(samples, { txPower: txPower ?? DEFAULT_TX_POWER }),
    [samples, txPower],
  );

  const estimate = useMemo(() => {
    const fromCrumbs = estimateFrom(crumbs);
    if (!located) return fromCrumbs;
    return {
      ...fromCrumbs,
      x: located.x,
      y: located.y,
      method: 'trilateration' as const,
    };
  }, [crumbs, located]);

  return {
    fix,
    available,
    crumbs,
    track,
    samples,
    located,
    estimate,
    dropManual,
    clear,
    calibrated: txPower !== undefined,
  };
}

/** Reading taken at a known distance -> reference power for this device. */
export { calibrateTxPower };
