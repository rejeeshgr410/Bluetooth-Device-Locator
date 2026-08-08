import { useEffect, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { clickIntervalMs } from './signal';

/**
 * Clicks speed up as the signal rises. Silence means no contact,
 * not no device — the cadence stops the moment the reading goes stale.
 *
 * Uses expo-audio rather than expo-av: expo-av is unmaintained, and it also
 * declared RECORD_AUDIO in its manifest, which put a microphone permission on
 * an app that only ever plays a 45ms click.
 */
export function useClicker(opts: {
  rssi: number | null;
  active: boolean;
  sound: boolean;
  haptics: boolean;
}) {
  const { rssi, active, sound, haptics } = opts;
  const player = useRef<AudioPlayer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ rssi, active, sound, haptics });
  latest.current = { rssi, active, sound, haptics };

  useEffect(() => {
    // createAudioPlayer is synchronous, unlike Audio.Sound.createAsync, so
    // there is no window where the first clicks are silently dropped.
    const p = createAudioPlayer(require('../../assets/click.wav'));
    player.current = p;

    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    }).catch(() => {
      // Non-fatal: the click just plays under the default mode.
    });

    return () => {
      player.current = null;
      p.remove();
    };
  }, []);

  useEffect(() => {
    function tick() {
      const now = latest.current;
      if (now.active && now.rssi != null) {
        const p = player.current;
        if (now.sound && p) {
          // Rewind before each click: without the seek, a still-playing sound
          // swallows the next one and the cadence stalls at close range.
          p.seekTo(0)
            .then(() => {
              if (player.current === p) p.play();
            })
            .catch(() => {});
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
