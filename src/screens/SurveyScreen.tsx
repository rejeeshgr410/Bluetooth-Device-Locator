import React, { useMemo, useState } from 'react';
import { Contact, ScanMode } from '../lib/useScanner';

export type SurveyScreenProps = {
  contacts: Record<string, Contact>;
  scanning: boolean;
  isSimulator: boolean;
  mode: ScanMode;
  error: string | null;
  notice: string | null;
  onStart: () => void;
  onStop: () => void;
  onToggleSimulator: () => void;
  onPick: (contact: Contact) => void;
};

const START_LABEL: Record<ScanMode, string> = {
  scan: 'START SCAN',
  simulator: 'START SIMULATOR',
  unsupported: 'UNSUPPORTED',
};

const IDLE_COPY: Record<ScanMode, string> = {
  scan: 'Ready to scan for nearby devices. The list will update as packets arrive.',
  simulator: 'Simulator is active. Start listening to hear the simulated beacons.',
  unsupported: 'Bluetooth is not supported in this environment.',
};

const LISTENING_COPY: Record<ScanMode, string> = {
  scan: 'Listening for Bluetooth advertisements. Keep the device nearby.',
  simulator: 'Listening for simulated beacons.',
  unsupported: 'Unsupported.',
};

export const SurveyScreen: React.FC<SurveyScreenProps> = ({
  contacts,
  scanning,
  isSimulator,
  mode,
  error,
  notice,
  onStart,
  onStop,
  onToggleSimulator,
  onPick,
}) => {
  const [filter, setFilter] = useState('');
  const [namedOnly, setNamedOnly] = useState(false);

  const rows = useMemo(() => {
    let arr = Object.values(contacts);
    
    if (namedOnly) {
      arr = arr.filter((c) => c.name);
    }
    if (filter.trim()) {
      const q = filter.toLowerCase().trim();
      arr = arr.filter(
        (c) =>
          (c.name ?? '').toLowerCase().includes(q) ||
          (c.id ?? '').toLowerCase().includes(q),
      );
    }
    
    return arr.sort((a, b) => b.stats.filtered - a.stats.filtered);
  }, [contacts, namedOnly, filter]);

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      {(error || notice) && (
        <div style={{ marginBottom: '16px' }}>
          {error && (
            <div style={{ padding: '12px', backgroundColor: 'var(--c-ink-raised)', borderRadius: '4px', borderLeft: '3px solid var(--c-alarm)', fontSize: '13px', color: 'var(--c-alarm)' }}>
              {error}
            </div>
          )}
          {notice && !error && (
            <div style={{ padding: '12px', backgroundColor: 'var(--c-ink-raised)', borderRadius: '4px', borderLeft: '3px solid var(--c-amber)', fontSize: '13px', color: 'var(--c-amber)' }}>
              {notice}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={scanning ? onStop : onStart}
          disabled={mode === 'unsupported'}
          style={{
            flex: 2,
            padding: '14px 20px',
            borderRadius: '4px',
            border: `1px solid ${mode === 'unsupported' ? 'var(--c-hairline)' : 'var(--c-amber)'}`,
            backgroundColor: scanning ? 'var(--c-amber)' : 'transparent',
            color: scanning ? 'var(--c-ink)' : mode === 'unsupported' ? 'var(--c-dim)' : 'var(--c-amber)',
            fontWeight: 700,
            letterSpacing: '2px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            minWidth: '160px',
            opacity: mode === 'unsupported' ? 0.55 : 1,
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>(o)</span>
          {scanning ? 'STOP LISTENING' : START_LABEL[mode]}
        </button>

        <button
          onClick={() => setNamedOnly((v) => !v)}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '4px',
            border: '1px solid var(--c-hairline)',
            backgroundColor: 'var(--c-ink-raised)',
            color: namedOnly ? 'var(--c-dim)' : 'var(--c-amber)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.5px',
          }}
        >
          {namedOnly ? 'NAMED ONLY' : 'ALL SIGNALS'}
        </button>

        <button
          onClick={onToggleSimulator}
          style={{
            padding: '12px 14px',
            borderRadius: '4px',
            border: `1px solid ${isSimulator ? 'var(--c-warm)' : 'var(--c-hairline)'}`,
            backgroundColor: isSimulator ? 'rgba(99, 230, 226, 0.1)' : 'var(--c-ink-raised)',
            color: isSimulator ? 'var(--c-warm)' : 'var(--c-dim)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.5px',
          }}
        >
          {isSimulator ? 'SIM ON' : 'SIM OFF'}
        </button>
      </div>

      {/* Filter Input */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by device name or address..."
          style={{
            width: '100%',
            backgroundColor: 'var(--c-ink-raised)',
            color: 'var(--c-text)',
            borderRadius: '4px',
            padding: '12px 14px',
            border: '1px solid var(--c-hairline)',
            fontSize: '14px',
          }}
        />
      </div>

      {/* Device List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              backgroundColor: 'var(--c-ink-raised)',
              borderRadius: '4px',
              border: '1px dashed var(--c-hairline)',
              marginTop: '12px',
            }}
          >
            <p style={{ color: 'var(--c-dim)', fontSize: '14px', lineHeight: '1.6' }}>
              {scanning ? LISTENING_COPY[mode] : IDLE_COPY[mode]}
            </p>
          </div>
        ) : (
          rows.map((item) => {
            const stale = item.stats.isStale;
            const fillWidth = Math.max(0, Math.min(100, (item.stats.filtered + 95) * 1.8));

            return (
              <button
                key={item.id}
                onClick={() => onPick(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  backgroundColor: 'var(--c-ink-raised)',
                  borderRadius: '4px',
                  border: '1px solid var(--c-hairline)',
                  gap: '16px',
                  textAlign: 'left',
                }}
              >
                {/* RSSI Bar */}
                <div
                  style={{
                    width: '46px',
                    height: '4px',
                    backgroundColor: 'var(--c-hairline)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${fillWidth}%`,
                      backgroundColor: item.simulated ? 'var(--c-warm)' : 'var(--c-amber)',
                      opacity: stale ? 0.25 : 1,
                      transition: 'width 200ms ease-out',
                    }}
                  />
                </div>

                {/* Device Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'var(--c-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name ?? 'Unnamed Device'}
                    </span>
                    {item.simulated && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          letterSpacing: '1.5px',
                          color: 'var(--c-warm)',
                          border: '1px solid var(--c-warm)',
                          borderRadius: '3px',
                          padding: '1px 5px',
                          flexShrink: 0,
                        }}
                      >
                        SIM
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--c-dim)', marginTop: '2px', letterSpacing: '0.4px' }}>
                    {item.kind} · {item.stats.packetsPerSec.toFixed(1)} pkts/s {stale ? ' · quiet' : ''}
                  </div>
                </div>

                {/* RSSI Mono Value */}
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: stale ? 'var(--c-amber-dim)' : item.simulated ? 'var(--c-warm)' : 'var(--c-amber)',
                    flexShrink: 0,
                  }}
                >
                  {item.stats.filtered.toFixed(0)} <span style={{ fontSize: '11px', color: 'var(--c-dim)' }}>dBm</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
