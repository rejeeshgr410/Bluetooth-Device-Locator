import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/**
 * Hold the screen awake while a hunt is running.
 *
 * You use this app walking around a room watching a number move; a screen
 * that sleeps every thirty seconds is the difference between a tool and a
 * nuisance. Not supported everywhere (notably not iOS before 16.4), so this
 * fails quietly rather than reporting anything.
 */
export function useWakeLock(active: boolean) {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  // Android's WebView has no Screen Wake Lock API; use the window flag natively.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (active) void KeepAwake.keepAwake().catch(() => {});
    else void KeepAwake.allowSleep().catch(() => {});
    return () => {
      void KeepAwake.allowSleep().catch(() => {});
    };
  }, [active]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const nav = navigator as WakeLockCapableNavigator;
    if (!active || !nav.wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinel.current && !sentinel.current.released) return;
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel.current = lock;
      } catch {
        // Denied, or the tab lost focus mid-request. Nothing to do.
      }
    };

    // The lock is dropped whenever the tab is hidden, so take it again on return.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const held = sentinel.current;
      sentinel.current = null;
      if (held && !held.released) void held.release().catch(() => {});
    };
  }, [active]);
}
