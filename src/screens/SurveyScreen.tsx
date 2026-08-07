import React, { useEffect, useMemo, useState } from 'react';
import { fill, kindOf, STALE_AFTER_MS } from '../lib/signal';
import { Contact } from '../lib/useScanner';
import { Radio, Search, SlidersHorizontal, AlertTriangle, Cpu } from 'lucide-react';

interface SurveyScreenProps {
  contacts: Record<string, Contact>;
  scanning: boolean;
  isSimulator: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onToggleSimulator: () => void;
  onPick: (contact: Contact) => void;
}

export const SurveyScreen: React.FC<SurveyScreenProps> = ({
  contacts,
  scanning,
  isSimulator,
  error,
  onStart,
  onStop,
  onToggleSimulator,
  onPick,
}) => {
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(Date.now());
  const [namedOnly, setNamedOnly] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.values(contacts)
      .filter((d) => now - d.lastSeen < 20000)
      .filter((d) => (namedOnly ? !!d.name : true))
      .filter((d) => (q ? (d.name ?? '').toLowerCase().includes(q) || d.id.toLowerCase().includes(q) : true))
      .sort((a, b) => b.rssi - a.rssi);
  }, [contacts, filter, now, namedOnly]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '6px', color: 'var(--c-text)' }}>
          WARMER
        </h1>
        <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2.5px', color: 'var(--c-muted)' }}>
          SIGNAL HUNT
        </span>
      </div>

      {/* Error / Warning Banners */}
      {error && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: 'var(--c-ink-raised)',
            borderLeft: '3px solid var(--c-alarm)',
            marginBottom: '16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertTriangle size={18} color="var(--c-alarm)" />
          <span style={{ fontSize: '14px', color: 'var(--c-text)' }}>{error}</span>
        </div>
      )}

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          onClick={scanning ? onStop : onStart}
          style={{
            flex: 2,
            padding: '14px 20px',
            borderRadius: '4px',
            border: '1px solid var(--c-amber)',
            backgroundColor: scanning ? 'var(--c-amber)' : 'transparent',
            color: scanning ? 'var(--c-ink)' : 'var(--c-amber)',
            fontWeight: 700,
            letterSpacing: '2px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 150ms ease-out',
            minWidth: '160px',
          }}
        >
          <Radio size={16} />
          {scanning ? 'STOP LISTENING' : 'START LISTENING'}
        </button>

        <button
          onClick={() => setNamedOnly((v) => !v)}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '4px',
            border: '1px solid var(--c-hairline)',
            backgroundColor: 'var(--c-ink-raised)',
            color: namedOnly ? 'var(--c-muted)' : 'var(--c-amber)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <SlidersHorizontal size={14} />
          {namedOnly ? 'NAMED ONLY' : 'ALL SIGNALS'}
        </button>

        <button
          onClick={onToggleSimulator}
          title="Toggle BLE Simulator Mode"
          style={{
            padding: '12px 14px',
            borderRadius: '4px',
            border: `1px solid ${isSimulator ? 'var(--c-warm)' : 'var(--c-hairline)'}`,
            backgroundColor: isSimulator ? 'rgba(99, 230, 226, 0.1)' : 'var(--c-ink-raised)',
            color: isSimulator ? 'var(--c-warm)' : 'var(--c-muted)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Cpu size={14} />
          {isSimulator ? 'SIMULATOR ON' : 'SIMULATOR OFF'}
        </button>
      </div>

      {/* Filter Input */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <Search
          size={16}
          color="var(--c-hairline)"
          style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
        />
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
            padding: '12px 14px 12px 40px',
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
            <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              {scanning
                ? isSimulator
                  ? 'Simulating nearby Bluetooth beacons... (AirPods, SmartWatch, Tile Tracker)'
                  : 'Listening for Bluetooth advertising packets... Ensure Bluetooth and Location are active.'
                : 'Tap START LISTENING to scan every Bluetooth device within 10 metres, sorted by signal strength.'}
            </p>
          </div>
        ) : (
          rows.map((item) => {
            const stale = now - item.lastSeen > STALE_AFTER_MS;
            const fillWidth = fill(item.rssi) * 100;

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
                  transition: 'all 120ms ease-out',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--c-amber)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--c-hairline)')}
              >
                {/* RSSI Bar */}
                <div
                  style={{
                    width: '46px',
                    height: '4px',
                    backgroundColor: 'var(--c-hairline)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${fillWidth}%`,
                      backgroundColor: 'var(--c-amber)',
                      opacity: stale ? 0.25 : 1,
                      transition: 'width 200ms ease-out',
                    }}
                  />
                </div>

                {/* Device Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name ?? 'Unnamed Device'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--c-muted)', marginTop: '2px', letterSpacing: '0.4px' }}>
                    {kindOf(item.name)} · {item.packets} packets{stale ? ' · quiet' : ''}
                  </div>
                </div>

                {/* RSSI Mono Value */}
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: stale ? 'var(--c-amber-dim)' : 'var(--c-amber)',
                  }}
                >
                  {item.rssi.toFixed(0)} <span style={{ fontSize: '11px', color: 'var(--c-muted)' }}>dBm</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
