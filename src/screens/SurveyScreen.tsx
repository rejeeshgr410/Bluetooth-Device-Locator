import React, { useState, useMemo, useRef } from 'react';
import { Contact } from '../lib/useScanner';
import { ThemeMode } from '../lib/theme';

type Props = {
  contacts: Record<string, Contact>;
  scanning: boolean;
  error: string | null;
  notice: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onPick: (contact: Contact) => void;
};

export const SurveyScreen: React.FC<Props> = ({
  contacts,
  scanning,
  error,
  notice,
  theme,
  onToggleTheme,
  onStart,
  onStop,
  onClear,
  onPick,
}) => {
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  // Sort key per device that only moves when the signal really changes (> 6 dB), so
  // rows don't swap places under your finger as readings jitter.
  const sortScore = useRef<Map<string, number>>(new Map());

  const rows = useMemo(() => {
    let arr = Object.values(contacts);

    if (filter.trim()) {
      const q = filter.toLowerCase();
      arr = arr.filter(
        (d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'ALL') {
      arr = arr.filter((d) => {
        if (selectedCategory === 'AUDIO') return d.kind === 'Earbuds' || d.kind === 'Audio';
        if (selectedCategory === 'WEARABLE') return d.kind === 'Watch' || d.kind === 'Phone';
        if (selectedCategory === 'TRACKER') return d.kind === 'Tracker';
        return d.kind === 'Bluetooth Device' || d.kind === 'Laptop' || d.kind === 'Tablet';
      });
    }

    // Strongest first. Stale devices keep their place (they are dimmed, and dropped after
    // 25 s): phones and tags advertise slowly, so sinking them on every quiet spell made
    // rows jump about every second on a real phone.
    const scores = sortScore.current;
    for (const c of arr) {
      const prev = scores.get(c.id);
      if (prev === undefined || Math.abs(c.stats.filtered - prev) > 6) scores.set(c.id, c.stats.filtered);
    }
    return arr.sort(
      (a, b) =>
        (scores.get(b.id) ?? -127) - (scores.get(a.id) ?? -127) ||
        a.firstSeen - b.firstSeen ||
        (a.id < b.id ? -1 : 1),
    );
  }, [contacts, filter, selectedCategory]);

  const categories = [
    { id: 'ALL', label: 'All Devices' },
    { id: 'AUDIO', label: 'Earbuds & Audio' },
    { id: 'WEARABLE', label: 'Watches & Phones' },
    { id: 'TRACKER', label: 'Tags & Trackers' },
    { id: 'OTHER', label: 'Other BLE' },
  ];

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case 'Earbuds':
        return '🎧';
      case 'Audio':
        return '🔊';
      case 'Watch':
        return '⌚';
      case 'Phone':
        return '📱';
      case 'Tablet':
        return '📟';
      case 'Laptop':
        return '💻';
      case 'Tracker':
        return '🏷️';
      default:
        return '📶';
    }
  };

  const getSignalColor = (rssi: number) => {
    if (rssi >= -55) return 'var(--c-success)';
    if (rssi >= -70) return 'var(--c-primary)';
    if (rssi >= -82) return 'var(--c-warning)';
    return 'var(--c-danger)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--c-bg)' }}>
      {/* Top App Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'var(--c-surface)',
          borderBottom: '1px solid var(--c-border)',
          padding: '16px',
          paddingTop: 'calc(16px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'var(--c-primary-light)',
              color: 'var(--c-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            📡
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.2 }}>
              Bluetooth Locator
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginTop: '2px' }}>
              {scanning ? 'Live Radar Scanning Active' : 'Radar Scanner Ready'}
            </p>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          aria-label="Toggle Theme"
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'var(--c-surface-elevated)',
            border: '1px solid var(--c-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            boxShadow: 'var(--shadow-sm)',
            transition: 'background-color 0.2s',
          }}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '16px', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        {/* Error / Notice Banners */}
        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              backgroundColor: 'var(--c-danger-light)',
              borderRadius: '8px',
              border: '1px solid var(--c-danger)',
              fontSize: '13px',
              color: 'var(--c-danger)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {notice && !error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              backgroundColor: 'var(--c-warning-light)',
              borderRadius: '8px',
              border: '1px solid var(--c-warning)',
              fontSize: '13px',
              color: 'var(--c-warning)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>ℹ️</span>
            <span>{notice}</span>
          </div>
        )}

        {/* Primary Scan Action Card */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '18px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Nearby Devices
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--c-text)', marginTop: '2px' }}>
                {Object.keys(contacts).length} Discovered
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {Object.keys(contacts).length > 0 && !scanning && (
                <button
                  onClick={onClear}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--c-surface-elevated)',
                    border: '1px solid var(--c-border)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--c-text-secondary)',
                  }}
                >
                  Clear List
                </button>
              )}

              <button
                onClick={scanning ? onStop : onStart}
                style={{
                  padding: '10px 22px',
                  borderRadius: '10px',
                  backgroundColor: scanning ? 'var(--c-danger)' : 'var(--c-primary)',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-md)',
                  transition: 'transform 0.1s ease',
                }}
              >
                <span className={scanning ? 'pulse-anim' : ''}>{scanning ? '⏹' : '▶'}</span>
                {scanning ? 'Stop Scanning' : 'Start Radar'}
              </button>
            </div>
          </div>
        </div>

        {/* Search and Category Filter */}
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              borderRadius: '10px',
              padding: '10px 14px',
              gap: '10px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ fontSize: '16px', color: 'var(--c-text-muted)' }}>🔍</span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by device name, brand, or MAC address..."
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                fontSize: '14px',
                color: 'var(--c-text)',
              }}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                style={{
                  fontSize: '14px',
                  color: 'var(--c-text-muted)',
                  padding: '2px 6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--c-surface-elevated)',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
            }}
          >
            {categories.map((c) => {
              const active = selectedCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: active ? 700 : 500,
                    whiteSpace: 'nowrap',
                    backgroundColor: active ? 'var(--c-primary)' : 'var(--c-surface)',
                    color: active ? '#FFFFFF' : 'var(--c-text-secondary)',
                    border: `1px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Device List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '30px' }}>
          {rows.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: 'var(--c-surface)',
                borderRadius: '14px',
                border: '1px dashed var(--c-border)',
                marginTop: '12px',
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>{scanning ? '📡' : '🔍'}</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--c-text)', marginBottom: '6px' }}>
                {scanning ? 'Listening for Bluetooth signals...' : 'No Devices in View'}
              </h3>
              <p style={{ color: 'var(--c-text-muted)', fontSize: '13px', maxWidth: '340px', margin: '0 auto', lineHeight: 1.5 }}>
                {scanning
                  ? 'Keep your phone steady or walk slowly. Nearby Bluetooth devices, headphones, and trackers will appear automatically.'
                  : 'Tap "Start Radar" to scan the room for all broadcasting Bluetooth devices.'}
              </p>
            </div>
          ) : (
            rows.map((item) => {
              const stale = item.stats.isStale;
              const signalColor = getSignalColor(item.stats.filtered);

              return (
                <div
                  key={item.id}
                  onClick={() => onPick(item)}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '16px 18px',
                    backgroundColor: 'var(--c-surface)',
                    borderRadius: '12px',
                    border: '1px solid var(--c-border)',
                    gap: '14px',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease, box-shadow 0.15s ease',
                    opacity: stale ? 0.6 : 1,
                  }}
                >
                  {/* Category Icon */}
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--c-surface-elevated)',
                      border: '1px solid var(--c-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      flexShrink: 0,
                    }}
                  >
                    {getKindIcon(item.kind)}
                  </div>

                  {/* Device Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: 'var(--c-text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '220px',
                        }}
                      >
                        {item.name}
                      </span>

                      {item.isGuessed && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: 'var(--c-text-muted)',
                            backgroundColor: 'var(--c-surface-elevated)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--c-border)',
                          }}
                        >
                          Auto-Identified
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {item.id}
                      </span>
                      {item.kind !== 'Bluetooth Device' && (
                        <>
                          <span style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>•</span>
                          <span style={{ fontSize: '11px', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                            {item.kind}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Proximity / Distance estimate */}
                    <div style={{ fontSize: '12px', fontWeight: 600, color: signalColor, marginTop: '4px' }}>
                      {stale
                        ? 'Not heard recently'
                        : item.stats.distanceHighM < 0.5
                        ? `${item.stats.proximity} · < 0.5 m`
                        : `${item.stats.proximity} · ≈ ${item.stats.distanceM < 10 ? item.stats.distanceM.toFixed(1) : Math.round(item.stats.distanceM)} m`}
                    </div>
                  </div>

                  {/* Signal Strength Badge */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: signalColor,
                      }}
                    >
                      {Math.round(item.stats.filtered)}{' '}
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--c-text-muted)' }}>dBm</span>
                    </div>

                    {/* Mini Signal Meter Bar */}
                    <div
                      style={{
                        width: '56px',
                        height: '6px',
                        backgroundColor: 'var(--c-surface-elevated)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${item.stats.percentage}%`,
                          backgroundColor: signalColor,
                          borderRadius: '3px',
                          transition: 'width 250ms ease-out',
                        }}
                      />
                    </div>

                    <span style={{ fontSize: '10px', color: 'var(--c-text-muted)' }}>
                      {item.stats.percentage}%
                    </span>
                  </div>

                  {/* Navigation Arrow */}
                  <div style={{ fontSize: '18px', color: 'var(--c-text-muted)', paddingLeft: '4px' }}>
                    ›
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};
