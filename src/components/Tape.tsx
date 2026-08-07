import React from 'react';
import { fill } from '../lib/signal';

interface TapeProps {
  history: number[];
  height?: number;
}

/**
 * The last ~90 readings as a scrolling trace.
 * Amber phosphor trace on ink background.
 */
export const Tape: React.FC<TapeProps> = ({ history, height = 150 }) => {
  const slots = 60;
  const recent = history.slice(-slots);
  const pad = new Array(Math.max(0, slots - recent.length)).fill(null);
  const cells: (number | null)[] = [...pad, ...recent];

  const gridLevels = [-45, -60, -72, -85];

  return (
    <div
      style={{
        width: '100%',
        height: `${height}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: 'var(--c-ink-raised)',
        borderRadius: '4px',
        padding: '0 4px',
        overflow: 'hidden',
        border: '1px solid var(--c-hairline)',
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
              backgroundColor: 'var(--c-hairline)',
              opacity: 0.8,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <span
              style={{
                position: 'absolute',
                right: '6px',
                top: '-12px',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--c-dim)',
              }}
            >
              {line}
            </span>
          </div>
        );
      })}

      {/* Phosphor Trace Bars */}
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
          const age = i / slots; // 0 to 1
          const fillVal = v !== null ? fill(v) : 0;
          const barHeight = Math.max(v !== null ? 2 : 0, fillVal * height);
          const opacity = 0.18 + age * 0.82;

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
                    backgroundColor: 'var(--c-amber)',
                    opacity,
                    borderRadius: '1px 1px 0 0',
                    transition: 'height 150ms ease-out',
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
