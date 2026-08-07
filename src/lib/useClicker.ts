import { useEffect, useRef } from 'react';
import { clickIntervalMs } from './signal';

/**
 * Variable-rate Web Audio synthesizer click engine.
 * Synthesizes the exact 45ms click: 2400Hz falling to 900Hz, exponential decay.
 * Clicks speed up as the signal rises. Silence means no contact.
 */
export function useClicker(opts: {
  rssi: number | null;
  active: boolean;
  sound: boolean;
  haptics: boolean;
}) {
  const { rssi, active, sound, haptics } = opts;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const clickBufferRef = useRef<AudioBuffer | null>(null);
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef({ rssi, active, sound, haptics });
  latestRef.current = { rssi, active, sound, haptics };

  // Generate 45ms click AudioBuffer on mount
  useEffect(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const sr = 44100;
      const duration = 0.045; // 45ms
      const nFrames = Math.floor(sr * duration);
      const buffer = ctx.createBuffer(1, nFrames, sr);
      const channelData = buffer.getChannelData(0);

      for (let i = 0; i < nFrames; i++) {
        const t = i / sr;
        const freq = 2400 + (900 - 2400) * (t / duration);
        const sample = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 90);
        channelData[i] = Math.max(-1, Math.min(1, sample)) * 0.7;
      }
      clickBufferRef.current = buffer;
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }

    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    function playClick() {
      const now = latestRef.current;
      if (now.active && now.rssi !== null) {
        if (now.sound && audioCtxRef.current && clickBufferRef.current) {
          try {
            if (audioCtxRef.current.state === 'suspended') {
              audioCtxRef.current.resume().catch(() => {});
            }
            const source = audioCtxRef.current.createBufferSource();
            source.buffer = clickBufferRef.current;
            source.connect(audioCtxRef.current.destination);
            source.start();
          } catch {
            // Audio error
          }
        } else if (!now.sound && audioCtxRef.current?.state === 'running') {
          audioCtxRef.current.suspend().catch(() => {});
        }
        if (now.haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          const strong = now.rssi > -55;
          navigator.vibrate(strong ? 35 : 15);
        }
      } else {
        // Signal stale or inactive — suspend audio hardware
        if (audioCtxRef.current?.state === 'running') {
          audioCtxRef.current.suspend().catch(() => {});
        }
      }

      const wait = now.rssi === null ? 500 : clickIntervalMs(now.rssi);
      timerRef.current = window.setTimeout(playClick, wait);
    }

    timerRef.current = window.setTimeout(playClick, 200);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}
