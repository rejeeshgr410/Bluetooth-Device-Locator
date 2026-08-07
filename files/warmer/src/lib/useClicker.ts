import { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { clickIntervalMs } from './signal';

/**
 * Clicks speed up as the signal rises. Silence means no contact,
 * not no device — the cadence stops the moment the reading goes stale.
 */
export function useClicker(opts: {
  rssi: number | null;
  active: boolean;
  sound: boolean;
  haptics: boolean;
}) {
  const { rssi, active, sound, haptics } = opts;
  const player = useRef<Audio.Sound | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ rssi, active, sound, haptics });
  latest.current = { rssi, active, sound, haptics };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      const { sound: s } = await Audio.Sound.createAsync(require('../../assets/click.wav'));
      if (cancelled) { await s.unloadAsync(); return; }
      player.current = s;
    })();
    return () => {
      cancelled = true;
      player.current?.unloadAsync();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    function tick() {
      const now = latest.current;
      if (now.active && now.rssi != null) {
        if (now.sound && player.current) {
          player.current.replayAsync().catch(() => {});
        }
        if (now.haptics) {
          const strong = now.rssi > -55;
          Haptics.impactAsync(
            strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
          ).catch(() => {});
        }
      }
      const wait = now.rssi == null ? 500 : clickIntervalMs(now.rssi);
      timer.current = setTimeout(tick, wait);
    }
    timer.current = setTimeout(tick, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
