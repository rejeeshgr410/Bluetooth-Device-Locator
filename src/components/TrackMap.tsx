import React, { useMemo } from 'react';
import { Crumb, Estimate } from '../lib/breadcrumbs';
import { Fix } from '../lib/useDeadReckoning';

interface TrackMapProps {
  track: { x: number; y: number }[];
  crumbs: Crumb[];
  estimate: Estimate;
  fix: Fix;
  size?: number;
}

/**
 * Plan view map of the walked trail and signal peaks.
 */
export const TrackMap: React.FC<TrackMapProps> = ({
  track,
  crumbs,
  estimate,
  fix,
  size = 320,
}) => {
  const view = useMemo(() => {
    const points = [
      ...track,
      ...crumbs,
      { x: fix.x, y: fix.y },
      ...(crumbs.length ? [{ x: estimate.x, y: estimate.y }] : []),
    ];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs, -2);
    const maxX = Math.max(...xs, 2);
    const minY = Math.min(...ys, -2);
    const maxY = Math.max(...ys, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY, 6) * 1.2;
    const scale = size / span;
    return {
      span,
      toScreen: (p: { x: number; y: number }) => ({
        left: size / 2 + (p.x - cx) * scale,
        top: size / 2 - (p.y - cy) * scale, // screen y grows downward
      }),
    };
  }, [track, crumbs, estimate, fix, size]);

  const strongest = crumbs.length ? Math.max(...crumbs.map((k) => k.rssi)) : 0;
  const weakest = crumbs.length ? Math.min(...crumbs.map((k) => k.rssi)) : 0;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: `${size}px`,
        aspectRatio: '1 / 1',
        position: 'relative',
        backgroundColor: 'var(--c-ink-raised)',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '1px solid var(--c-hairline)',
        margin: '0 auto',
      }}
    >
      {/* 4x4 Gridlines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <React.Fragment key={f}>
          <div
            style={{
              position: 'absolute',
              left: `${f * 100}%`,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: 'var(--c-hairline)',
              opacity: 0.6,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${f * 100}%`,
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: 'var(--c-hairline)',
              opacity: 0.6,
            }}
          />
        </React.Fragment>
      ))}

      {/* Faint Track History Dots */}
      {track.map((p, i) => {
        const s = view.toScreen(p);
        return (
          <div
            key={`t${i}`}
            style={{
              position: 'absolute',
              left: `${s.left - 1.5}px`,
              top: `${s.top - 1.5}px`,
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              backgroundColor: 'var(--c-text)',
              opacity: 0.12 + (i / Math.max(1, track.length)) * 0.4,
            }}
          />
        );
      })}

      {/* Amber Signal Peak Crumbs */}
      {crumbs.map((k) => {
        const s = view.toScreen(k);
        const range = Math.max(1, strongest - weakest);
        const strength = (k.rssi - weakest) / range;
        const d = 8 + strength * 14;

        return (
          <div
            key={k.id}
            title={`Peak #${k.id}: ${k.rssi.toFixed(0)} dBm`}
            style={{
              position: 'absolute',
              left: `${s.left - d / 2}px`,
              top: `${s.top - d / 2}px`,
              width: `${d}px`,
              height: `${d}px`,
              borderRadius: '50%',
              backgroundColor: 'var(--c-amber)',
              opacity: 0.25 + strength * 0.6,
              border: k.manual ? '1.5px solid var(--c-text)' : 'none',
              boxShadow: '0 0 6px rgba(255, 176, 0, 0.4)',
              transition: 'all 200ms ease-out',
            }}
          />
        );
      })}

      {/* Centroid Estimate Target Ring */}
      {crumbs.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            left: `${view.toScreen(estimate).left - 20}px`,
            top: `${view.toScreen(estimate).top - 20}px`,
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: `1px solid ${estimate.confidence === 'good' ? 'var(--c-warm)' : 'var(--c-muted)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 12px ${estimate.confidence === 'good' ? 'rgba(99, 230, 226, 0.3)' : 'transparent'}`,
            animation: 'pulse 2s infinite',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: estimate.confidence === 'good' ? 'var(--c-warm)' : 'var(--c-muted)',
            }}
          />
        </div>
      )}

      {/* User Indicator Triangle Rotated to Heading */}
      <div
        style={{
          position: 'absolute',
          left: `${view.toScreen(fix).left - 9}px`,
          top: `${view.toScreen(fix).top - 9}px`,
          width: '18px',
          height: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `rotate(${fix.heading}deg)`,
          transition: 'transform 100ms ease-out',
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '14px solid var(--c-text)',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
          }}
        />
      </div>

      {/* Scale Label */}
      <div
        style={{
          position: 'absolute',
          left: '8px',
          bottom: '6px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--c-dim)',
          letterSpacing: '1px',
        }}
      >
        {view.span.toFixed(0)} m across
      </div>
    </div>
  );
};
