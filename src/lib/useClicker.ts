import { useEffect, useRef } from 'react';
import { clickIntervalMs } from './clickInterval';
import { Trend, Confidence } from './signal';

export function useClicker(opts: {
  rssi: number | null;
  active: boolean;
  sound: boolean;
  haptics: boolean;
  trend?: Trend;
  confidence?: Confidence;
}) {
  const { rssi, active, sound, haptics, trend, confidence } = opts;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const clickBufferRef = useRef<AudioBuffer | null>(null);
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef(opts);
  latestRef.current = opts;

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
      // AudioContext unavailable
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
          } catch {}
        }
        
        if (now.haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          if (now.confidence === 'LOW') {
            // Signal unstable: intermittent pattern
            navigator.vibrate([10, 50, 10]);
          } else if (now.trend === 'GETTING COLDER') {
            // Signal worsening: different pattern (long)
            navigator.vibrate(40);
          } else {
            // As signal strengthens
            if (now.rssi > -55) navigator.vibrate([10, 30, 10]); // Very close: distinct short pulses
            else if (now.rssi > -65) navigator.vibrate(20); // Strong
            else if (now.rssi > -75) navigator.vibrate(30); // Moderate
            else navigator.vibrate(40); // Weak
          }
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
