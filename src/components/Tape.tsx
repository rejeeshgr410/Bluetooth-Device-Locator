import React from 'react';

interface TapeProps {
  history: (number | null)[];
  height?: number;
}

/**
 * Clean sliding-window signal trace graph with adaptive theme colors and gridlines.
 */
export const Tape: React.FC<TapeProps> = ({ history, height = 130 }) => {
  const slots = 60;
  const recent = history.slice(-slots);
  const pad = new Array(Math.max(0, slots - recent.length)).fill(null);
  const cells = [...pad, ...recent];

  const gridLevels = [-45, -60, -75, -88];

  const fill = (rssi: number) => Math.max(0, Math.min(100, ((rssi + 95) / 60) * 100)) / 100;

  return (
    <div
      style={{
        width: '100%',
        height: `${height}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: 'var(--c-surface-elevated)',
        borderRadius: '10px',
        padding: '0 8px',
        overflow: 'hidden',
        border: '1px solid var(--c-border)',
      }}
    >
      {/* Gridlines */}
      {gridLevels.map((line) => {
        const bottomPercent = fill(line) * 100;
        return (
          <div
            key={line}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${bottomPercent}%`,
              height: '1px',
              backgroundColor: 'var(--c-border)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <span
              style={{
                position: 'absolute',
                right: '8px',
                top: '-13px',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--c-text-muted)',
              }}
            >
              {line} dBm
            </span>
          </div>
        );
      })}

      {/* Trace Bars */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          width: '100%',
          height: '100%',
          zIndex: 2,
        }}
      >
        {cells.map((v, i) => {
          const age = i / slots; // 0 (oldest) to 1 (newest)
          const fillVal = v !== null ? fill(v) : 0;
          const barHeight = Math.max(v !== null ? 3 : 0, fillVal * height);
          const opacity = 0.2 + age * 0.8;

          // Color gradient from green (strong) to blue to red (weak)
          let barColor = 'var(--c-primary)';
          if (v !== null) {
            if (v >= -55) barColor = 'var(--c-success)';
            else if (v >= -72) barColor = 'var(--c-primary)';
            else if (v >= -84) barColor = 'var(--c-warning)';
            else barColor = 'var(--c-danger)';
          }

          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-end',
                height: '100%',
                padding: '0 1px',
              }}
            >
              {v !== null && (
                <div
                  style={{
                    width: '100%',
                    height: `${barHeight}px`,
                    backgroundColor: barColor,
                    opacity,
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 180ms ease-out',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
