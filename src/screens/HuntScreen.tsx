import React, { useState, useEffect } from 'react';
import { Contact } from '../lib/useScanner';
import { useClicker } from '../lib/useClicker';
import { useTrail } from '../lib/useTrail';
import { Trend, Proximity, Confidence, SignalStats, SearchMode } from '../lib/signal';
import { Tape } from '../components/Tape';
import { ThemeMode } from '../lib/theme';

type Props = {
  contact: Contact;
  onBack: () => void;
  searchMode: SearchMode;
  onSearchModeChange: (m: SearchMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export const HuntScreen: React.FC<Props> = ({
  contact,
  onBack,
  searchMode,
  onSearchModeChange,
  theme,
  onToggleTheme,
}) => {
  const { stats, name, kind, id } = contact;
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Audio / Haptic feedback engine
  useClicker({
    rssi: stats.filtered,
    active: !stats.isStale && (audioEnabled || hapticsEnabled),
    sound: audioEnabled,
    haptics: hapticsEnabled,
    trend: stats.trend,
    confidence: stats.confidence,
  });

  // Dead reckoning sensors (steps + compass orientation)
  const { quality, fix, requestAccess, permission, calibrateStride, stride } = useTrail({
    rssi: stats.isStale ? null : stats.filtered,
    active: true,
    stride: 0.75,
  });

  useEffect(() => {
    if (permission === 'prompt') requestAccess();
  }, [permission, requestAccess]);

  const getAssistantGuidance = (stats: SignalStats) => {
    if (stats.isStale) {
      return 'Signal interrupted. Return toward your last known strong location.';
    }

    if (stats.proximity === 'VERY CLOSE') {
      return '🎯 Target is in arm\'s reach! Check under cushions, in pockets, or behind objects.';
    }

    if (stats.trend === 'GETTING WARMER') {
      return '🔥 Getting warmer! You are moving in the right direction. Keep walking.';
    }

    if (stats.trend === 'GETTING COLDER') {
      return '❄️ Getting colder! You are moving away. Turn around and try another direction.';
    }

    if (stats.trend === 'STABLE') {
      return '🧭 Signal is steady. Walk a few steps in different directions to determine the path.';
    }

    return 'Walk slowly around the room to establish signal direction.';
  };

  const getSignalColor = (rssi: number) => {
    if (rssi >= -55) return 'var(--c-success)';
    if (rssi >= -70) return 'var(--c-primary)';
    if (rssi >= -82) return 'var(--c-warning)';
    return 'var(--c-danger)';
  };

  const signalColor = getSignalColor(stats.filtered);

  const MODES: { value: SearchMode; label: string; desc: string }[] = [
    { value: 'QUICK_SEARCH', label: 'Quick Scout', desc: 'Fast reaction' },
    { value: 'ROOM_SWEEP', label: 'Room Sweep', desc: 'Balanced & stable' },
    { value: 'FINAL_1_METER', label: 'Precision', desc: 'Under 1 meter' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--c-bg)' }}>
      {/* Top App Bar with Navigation */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'var(--c-surface)',
          borderBottom: '1px solid var(--c-border)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: 'var(--c-surface-elevated)',
            border: '1px solid var(--c-border)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--c-text)',
          }}
        >
          <span>←</span>
          <span>Back to Devices</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Audio Clicker Toggle */}
          <button
            onClick={() => setAudioEnabled((v) => !v)}
            title={audioEnabled ? 'Audio Clicker On' : 'Audio Clicker Muted'}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: audioEnabled ? 'var(--c-primary-light)' : 'var(--c-surface-elevated)',
              border: `1px solid ${audioEnabled ? 'var(--c-primary)' : 'var(--c-border)'}`,
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {audioEnabled ? '🔊' : '🔇'}
          </button>

          {/* Haptics Toggle */}
          <button
            onClick={() => setHapticsEnabled((v) => !v)}
            title={hapticsEnabled ? 'Haptic Vibrations On' : 'Haptics Off'}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: hapticsEnabled ? 'var(--c-primary-light)' : 'var(--c-surface-elevated)',
              border: `1px solid ${hapticsEnabled ? 'var(--c-primary)' : 'var(--c-border)'}`,
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            📳
          </button>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            title="Toggle Light/Dark Theme"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: 'var(--c-surface-elevated)',
              border: '1px solid var(--c-border)',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '16px 20px', maxWidth: '720px', width: '100%', margin: '0 auto' }}>
        {/* Target Header Card */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--c-text)' }}>
                {name}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--c-text-muted)' }}>
                {id}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>•</span>
              <span style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>{kind}</span>
            </div>
          </div>

          <div
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: stats.isStale ? 'var(--c-danger-light)' : 'var(--c-success-light)',
              color: stats.isStale ? 'var(--c-danger)' : 'var(--c-success)',
              border: `1px solid ${stats.isStale ? 'var(--c-danger)' : 'var(--c-success)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '10px' }}>●</span>
            {stats.isStale ? 'SIGNAL STALE' : 'LIVE TRACKING'}
          </div>
        </div>

        {/* Search Mode Segmented Control */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            backgroundColor: 'var(--c-surface-elevated)',
            border: '1px solid var(--c-border)',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '16px',
            gap: '4px',
          }}
        >
          {MODES.map((m) => {
            const active = searchMode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => onSearchModeChange(m.value)}
                style={{
                  padding: '10px 4px',
                  borderRadius: '8px',
                  backgroundColor: active ? 'var(--c-surface)' : 'transparent',
                  color: active ? 'var(--c-primary)' : 'var(--c-text-secondary)',
                  fontWeight: active ? 700 : 500,
                  fontSize: '12px',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                }}
              >
                <div>{m.label}</div>
              </button>
            );
          })}
        </div>

        {/* Primary Proximity Radar Card */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: `2px solid ${stats.isStale ? 'var(--c-danger)' : signalColor}`,
            borderRadius: '18px',
            padding: '24px 20px',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            marginBottom: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Animated Radar Halo */}
          <div
            className={!stats.isStale ? 'pulse-anim' : ''}
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              backgroundColor: signalColor,
              opacity: 0.08,
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1px', color: 'var(--c-text-muted)', textTransform: 'uppercase' }}>
            Current Proximity
          </div>

          <div
            style={{
              fontSize: '34px',
              fontWeight: 900,
              color: stats.isStale ? 'var(--c-danger)' : signalColor,
              letterSpacing: '0.5px',
              margin: '8px 0 4px',
            }}
          >
            {stats.isStale ? 'SIGNAL INTERRUPTED' : stats.proximity}
          </div>

          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: '16px' }}>
            Estimated Range: {stats.approxDistance}
          </div>

          {/* Trend Indicator Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '30px',
              backgroundColor:
                stats.trend === 'GETTING WARMER'
                  ? 'var(--c-success-light)'
                  : stats.trend === 'GETTING COLDER'
                  ? 'var(--c-danger-light)'
                  : 'var(--c-surface-elevated)',
              color:
                stats.trend === 'GETTING WARMER'
                  ? 'var(--c-success)'
                  : stats.trend === 'GETTING COLDER'
                  ? 'var(--c-danger)'
                  : 'var(--c-text-secondary)',
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.5px',
              marginBottom: '20px',
              border: '1px solid var(--c-border)',
            }}
          >
            <span>
              {stats.trend === 'GETTING WARMER'
                ? '🟢 ↑ GETTING WARMER'
                : stats.trend === 'GETTING COLDER'
                ? '🔴 ↓ GETTING COLDER'
                : '🟡 → SIGNAL STEADY'}
            </span>
          </div>

          {/* High Precision Signal Meter Bar */}
          <div style={{ width: '100%', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              <span>Weak (-95 dBm)</span>
              <span>Strong (-35 dBm)</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '14px',
                backgroundColor: 'var(--c-surface-elevated)',
                borderRadius: '7px',
                overflow: 'hidden',
                border: '1px solid var(--c-border)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${stats.percentage}%`,
                  backgroundColor: signalColor,
                  borderRadius: '7px',
                  transition: 'width 200ms ease-out',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-text)' }}>
                Signal: {stats.percentage}%
              </span>
              <span style={{ fontSize: '15px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: signalColor }}>
                {Math.round(stats.filtered)} dBm
              </span>
            </div>
          </div>

          {/* Contextual Smart Guidance Box */}
          <div
            style={{
              width: '100%',
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--c-surface-elevated)',
              border: '1px solid var(--c-border)',
              fontSize: '13px',
              color: 'var(--c-text)',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {getAssistantGuidance(stats)}
          </div>
        </div>

        {/* Live Signal History Tape Graph */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Live Signal Progression (10s)
            </span>
            <span style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>
              Peak: {Math.round(stats.peakRssi)} dBm
            </span>
          </div>

          <Tape history={stats.history} height={120} />
        </div>

        {/* Collapsible Diagnostics & Dead Reckoning */}
        <div
          style={{
            backgroundColor: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '30px',
          }}
        >
          <button
            onClick={() => setShowDiagnostics((v) => !v)}
            style={{
              width: '100%',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--c-surface-elevated)',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--c-text)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚙️</span>
              <span>Sensors & Expert Diagnostics</span>
            </div>
            <span>{showDiagnostics ? '▲ Hide' : '▼ View'}</span>
          </button>

          {showDiagnostics && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
              {/* Sensors Status */}
              <div>
                <div style={{ fontWeight: 700, color: 'var(--c-text-muted)', marginBottom: '8px' }}>
                  MOTION & SENSOR STATUS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Quality:{' '}
                    <strong style={{ color: quality === 'GOOD' ? 'var(--c-success)' : 'var(--c-warning)' }}>
                      {quality}
                    </strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Steps Counted: <strong>{fix.steps}</strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Compass Heading: <strong>{Math.round(fix.heading)}°</strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'var(--c-surface-elevated)', borderRadius: '6px' }}>
                    Stride: <strong>{stride.toFixed(2)} m</strong>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const walked = parseFloat(window.prompt('Enter exact meters walked in a straight line:') || '0');
                    if (walked > 0) calibrateStride(walked, fix.steps);
                  }}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--c-surface-elevated)',
                    border: '1px solid var(--c-border)',
                    fontWeight: 600,
                    color: 'var(--c-primary)',
                  }}
                >
                  Calibrate Stride Length
                </button>
              </div>

              {/* Radio Stats */}
              <div>
                <div style={{ fontWeight: 700, color: 'var(--c-text-muted)', marginBottom: '8px' }}>
                  RADIO METRICS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontFamily: 'var(--font-mono)' }}>
                  <div>Raw RSSI: {stats.raw} dBm</div>
                  <div>Filtered: {Math.round(stats.filtered)} dBm</div>
                  <div>Variance: {stats.variance.toFixed(1)}</div>
                  <div>Rate: {stats.packetsPerSec.toFixed(1)} pkts/s</div>
                  <div>Confidence: {stats.confidence}</div>
                  <div>Last Packet: {((Date.now() - stats.lastSeen) / 1000).toFixed(1)}s ago</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
