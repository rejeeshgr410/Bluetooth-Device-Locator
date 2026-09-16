import React, { useState, useEffect } from 'react';
import { Contact } from '../lib/useScanner';
import { useClicker } from '../lib/useClicker';
import { useTrail } from '../lib/useTrail';
import { Trend, Proximity, Confidence, SignalStats, SearchMode } from '../lib/signal';
import { Tape } from '../components/Tape';

type Props = {
  contact: Contact;
  onBack: () => void;
  searchMode: SearchMode;
  onSearchModeChange: (m: SearchMode) => void;
};

export const HuntScreen: React.FC<Props> = ({ contact, onBack, searchMode, onSearchModeChange }) => {
  const { stats, name, kind } = contact;
  const [expertMode, setExpertMode] = useState(false);

  // Audio/Haptic clicker
  useClicker({
    rssi: stats.filtered,
    active: !stats.isStale,
    sound: true, // TODO: toggle in UI
    haptics: true,
    trend: stats.trend,
    confidence: stats.confidence,
  });

  const { quality, fix, requestAccess, permission, calibrateStride, stride } = useTrail({
    rssi: stats.isStale ? null : stats.filtered,
    active: true,
    stride: 0.75, // Default initial stride
  });

  // Prompt for permissions automatically if needed on mount
  useEffect(() => {
    if (permission === 'prompt') requestAccess();
  }, [permission, requestAccess]);

  const getAssistantMessage = (stats: SignalStats) => {
    if (stats.isStale) return 'Signal lost. Return toward the last strong signal.';
    
    if (stats.proximity === 'VERY CLOSE') {
      if (stats.confidence === 'LOW') return "You're probably very close. Move slowly.";
      return 'Move slowly. Try rotating the phone. Check underneath nearby objects.';
    }

    if (stats.trend === 'GETTING WARMER') return "You're moving closer. Keep going.";
    if (stats.trend === 'GETTING COLDER') return "Try turning around.";
    if (stats.trend === 'STABLE') return "Move a little and compare the signal.";
    
    return 'Walk around to establish a trend.';
  };

  const getTrendArrow = (trend: Trend) => {
    if (trend === 'GETTING WARMER') return '↑ WARMER';
    if (trend === 'GETTING COLDER') return '↓ COLDER';
    if (trend === 'STABLE') return '→ STABLE';
    return '? UNCERTAIN';
  };

  const getConfidenceColor = (conf: Confidence) => {
    if (conf === 'HIGH') return 'var(--c-warm)';
    if (conf === 'MEDIUM') return 'var(--c-amber)';
    return 'var(--c-alarm)';
  };

  const MODES: { value: SearchMode; label: string }[] = [
    { value: 'QUICK_SEARCH', label: 'QUICK' },
    { value: 'ROOM_SWEEP', label: 'SWEEP' },
    { value: 'FINAL_1_METER', label: 'FINAL' }
  ];

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh', backgroundColor: 'var(--c-ink)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--c-dim)',
            padding: '8px 0',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '2px',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", marginRight: '4px' }}>[X]</span> STOP
        </button>

        {/* Mode Selector */}
        <div style={{ display: 'flex', background: 'var(--c-ink-raised)', borderRadius: '4px', padding: '2px' }}>
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => onSearchModeChange(m.value)}
              style={{
                background: searchMode === m.value ? 'var(--c-muted)' : 'none',
                color: searchMode === m.value ? 'var(--c-ink)' : 'var(--c-dim)',
                border: 'none',
                padding: '6px 10px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '1px',
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target Info */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: 'var(--c-dim)', marginBottom: '8px' }}>
          TARGET DEVICE
        </div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--c-text)', wordBreak: 'break-word' }}>
          {name ?? 'Unknown Device'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--c-muted)', marginTop: '4px' }}>
          {kind}
        </div>
      </div>

      {/* Primary Display */}
      <div style={{ 
        backgroundColor: 'var(--c-ink-raised)', 
        padding: '24px', 
        borderRadius: '8px',
        border: `1px solid ${stats.isStale ? 'var(--c-alarm)' : 'var(--c-hairline)'}`,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '24px'
      }}>
        {stats.isStale ? (
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--c-alarm)', letterSpacing: '2px' }}>
            SIGNAL LOST
          </div>
        ) : (
          <>
            <div style={{ fontSize: '32px', fontWeight: 700, color: stats.proximity === 'VERY CLOSE' ? 'var(--c-warm)' : 'var(--c-text)', letterSpacing: '2px' }}>
              {stats.proximity}
            </div>

            {/* Tape Graph */}
            <div style={{ width: '100%', marginBottom: '12px' }}>
              <Tape history={stats.history} height={120} />
            </div>

            <div style={{ fontSize: '18px', fontWeight: 700, color: getConfidenceColor(stats.confidence) }}>
              {getTrendArrow(stats.trend)}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--c-muted)' }}>
              Confidence: <span style={{ color: getConfidenceColor(stats.confidence), fontWeight: 700 }}>{stats.confidence}</span>
            </div>
            
            <div style={{ 
              marginTop: '16px', 
              padding: '16px', 
              backgroundColor: 'rgba(255, 255, 255, 0.05)', 
              borderRadius: '8px',
              textAlign: 'center',
              lineHeight: 1.5,
              fontSize: '14px',
              color: 'var(--c-text)'
            }}>
              {getAssistantMessage(stats)}
            </div>
          </>
        )}
      </div>

      {/* Expert Mode Toggle */}
      <button 
        onClick={() => setExpertMode(!expertMode)}
        style={{
          marginTop: '24px',
          padding: '12px',
          background: 'none',
          border: '1px solid var(--c-hairline)',
          borderRadius: '4px',
          color: 'var(--c-dim)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '2px',
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }}>[DEBUG]</span> EXPERT VIEW
      </button>

      {/* Expert Panel */}
      {expertMode && (
        <div style={{ 
          marginTop: '12px', 
          padding: '16px', 
          backgroundColor: 'var(--c-ink-raised)', 
          borderRadius: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--c-dim)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>ID: {contact.id.substring(0,8)}...</div>
            <div>Raw: {stats.raw} dBm</div>
            <div>Filtered: {Math.round(stats.filtered)} dBm</div>
            <div>Median: {stats.median} dBm</div>
            <div>Pkts/Sec: {stats.packetsPerSec.toFixed(1)}</div>
            <div>Variance: {stats.variance.toFixed(1)}</div>
            <div>Peak RSSI: {Math.round(stats.peakRssi)}</div>
            <div>Age: {((Date.now() - stats.lastSeen) / 1000).toFixed(1)}s</div>
            
            <div style={{ gridColumn: '1 / -1', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--c-hairline)' }}>
              DEAD RECKONING SENSORS
            </div>
            <div>Quality: <span style={{ color: quality === 'GOOD' ? 'var(--c-warm)' : quality === 'LIMITED' ? 'var(--c-amber)' : 'var(--c-alarm)' }}>{quality}</span></div>
            <div>Steps: {fix.steps}</div>
            <div>Heading: {Math.round(fix.heading)}°</div>
            <div>Stride: {stride.toFixed(2)}m</div>
            
            {quality !== 'UNAVAILABLE' && (
              <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                <button 
                  onClick={() => {
                    const walked = parseFloat(window.prompt('Enter exact meters walked in a straight line:') || '0');
                    if (walked > 0) calibrateStride(walked, fix.steps);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'var(--c-ink)',
                    border: '1px solid var(--c-amber)',
                    color: 'var(--c-amber)',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px'
                  }}
                >
                  CALIBRATE STRIDE
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
